import asyncio
import base64
import io
import json
import zipfile

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.main import app
from app.services import openai_assistant

client = TestClient(app)


def data_url(mime_type: str, payload: bytes) -> str:
    encoded = base64.b64encode(payload).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def minimal_docx_data_url(lines: list[str]) -> str:
    paragraphs = "".join(f"<w:p><w:r><w:t>{line}</w:t></w:r></w:p>" for line in lines)
    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>{paragraphs}</w:body>
</w:document>""".encode()
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", document_xml)
    return data_url(openai_assistant.DOCX_MIME_TYPE, buffer.getvalue())


def png_data_url(width: int, height: int) -> tuple[str, int]:
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    for y in range(20, height, 80):
        draw.line((20, y, width - 20, y), fill="black", width=2)
        draw.text((30, y + 10), f"Question source line {y}", fill="black")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    payload = buffer.getvalue()
    return data_url("image/png", payload), len(payload)


def png_data_url_with_margins(width: int, height: int) -> tuple[str, int]:
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((360, 260, 640, 430), outline="black", width=3)
    draw.text((380, 290), "Question 4", fill="black")
    draw.text((380, 330), "Evaluate 2x + 3.", fill="black")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    payload = buffer.getvalue()
    return data_url("image/png", payload), len(payload)


def data_url_image_size(value: str) -> tuple[int, int]:
    _, _, payload = value.partition(",")
    image_bytes = base64.b64decode(payload)
    with Image.open(io.BytesIO(image_bytes)) as image:
        return image.size


def test_assistant_status_reports_missing_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    response = client.get("/api/assistant/status")

    assert response.status_code == 200
    data = response.json()
    assert data["configured"] is False
    assert data["missingSetting"] == "OPENAI_API_KEY"


def test_assistant_chat_returns_safe_message_without_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    response = client.post("/api/assistant/chat", json={"messages": [{"role": "user", "content": "Inspect the test."}]})

    assert response.status_code == 200
    data = response.json()
    assert data["configured"] is False
    assert data["toolCalls"] == []
    assert "OPENAI_API_KEY" in data["message"]


def test_layout_check_prompt_uses_native_fast_path(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    response = client.post(
        "/api/assistant/chat",
        json={"messages": [{"role": "user", "content": "Check the whole document layout before printing."}]},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["configured"] is True
    assert data["message"] == "Checking the document layout."
    assert data["responseId"] is None
    assert data["usage"]["totalTokens"] == 0
    assert data["usage"]["estimatedCostUsd"] == 0
    assert data["toolCalls"] == [
        {
            "id": "local-layout-check",
            "callId": "local-layout-check",
            "name": "mauth_check_document_layout",
            "arguments": {"mode": "both"},
            "mauthToolName": "mauth.layout.check",
            "mauthArguments": {"mode": "both"},
        }
    ]


def test_assistant_help_prompt_uses_native_fast_path(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    response = client.post(
        "/api/assistant/chat",
        json={"messages": [{"role": "user", "content": "What can this assistant do?"}]},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["configured"] is True
    assert data["responseId"] is None
    assert data["toolCalls"] == []
    assert data["usage"]["totalTokens"] == 0
    assert data["usage"]["estimatedCostUsd"] == 0
    assert "create or convert questions" in data["message"]


def test_tool_output_without_provider_response_id_is_sent_as_user_context():
    request = openai_assistant.AssistantChatRequest(
        toolOutputs=[
            openai_assistant.AssistantToolOutput(
                callId="local-layout-check",
                name="mauth_check_document_layout",
                output={"ok": False, "warnings": [{"code": "missing-space"}]},
            )
        ]
    )

    items = openai_assistant.input_items(request)

    assert len(items) == 1
    assert items[0]["role"] == "user"
    assert "outside the provider response chain" in items[0]["content"]
    assert "missing-space" in items[0]["content"]


def test_extracts_mauth_tool_calls_from_openai_response():
    response = {
        "id": "resp_123",
        "output": [
            {
                "type": "function_call",
                "id": "fc_123",
                "call_id": "call_123",
                "name": "mauth_tool",
                "arguments": '{"name":"mauth.document.inspect","arguments":{}}',
            }
        ],
    }

    calls = openai_assistant.tool_calls(response)

    assert calls == [
        {
            "id": "fc_123",
            "callId": "call_123",
            "name": "mauth_tool",
            "arguments": {"name": "mauth.document.inspect", "arguments": {}},
            "mauthToolName": "mauth.document.inspect",
            "mauthArguments": {},
        }
    ]


def test_extracts_unwrapped_action_arguments_from_openai_response():
    actions = [{"type": "frontMatter.update", "patch": {"assessmentTitle": "Circle geometry"}}]
    response = {
        "output": [
            {
                "type": "function_call",
                "id": "fc_123",
                "call_id": "call_123",
                "name": "mauth_tool",
                "arguments": json.dumps({"name": "mauth.actions.preview", "actions": actions}),
            }
        ],
    }

    [call] = openai_assistant.tool_calls(response)

    assert call["mauthToolName"] == "mauth.actions.preview"
    assert call["mauthArguments"] == {"actions": actions}


def test_extracts_stringified_nested_tool_arguments_from_openai_response():
    arguments = {"path": "tests/Example.test.json"}
    response = {
        "output": [
            {
                "type": "function_call",
                "id": "fc_123",
                "call_id": "call_123",
                "name": "mauth_tool",
                "arguments": json.dumps({"name": "mauth.files.open", "arguments": json.dumps(arguments)}),
            }
        ],
    }

    [call] = openai_assistant.tool_calls(response)

    assert call["mauthToolName"] == "mauth.files.open"
    assert call["mauthArguments"] == arguments


def test_source_conversion_tool_calls_normalize_part_based_mark_totals():
    response = {
        "output": [
            {
                "type": "function_call",
                "id": "fc_123",
                "call_id": "call_123",
                "name": "mauth_convert_source_question",
                "arguments": json.dumps(
                    {
                        "questionNumber": 1,
                        "marks": 8,
                        "questionMarks": 8,
                        "questionText": "A rectangular prism is shown.",
                        "parts": [
                            {"label": "a", "text": "Find the vector equation of $BT$.", "marks": 2},
                            {"label": "b", "text": "Find the sphere through the vertices.", "marks": 3},
                            {"label": "c", "text": "Show $AM$ and $BT$ do not intersect.", "marks": 3},
                        ],
                    }
                ),
            }
        ],
    }

    [call] = openai_assistant.tool_calls(response)

    assert call["arguments"]["marks"] == 8
    assert call["arguments"]["questionMarks"] == 8
    assert call["mauthArguments"]["marks"] == 0
    assert call["mauthArguments"]["questionMarks"] == 0
    assert [part["marks"] for part in call["mauthArguments"]["parts"]] == [2, 3, 3]


def test_source_conversion_tool_calls_prune_unsupported_graph3d_metadata():
    response = {
        "output": [
            {
                "type": "function_call",
                "id": "fc_123",
                "call_id": "call_123",
                "name": "mauth_convert_source_question",
                "arguments": json.dumps(
                    {
                        "questionNumber": 1,
                        "marks": 0,
                        "questionText": "A rectangular prism is shown.",
                        "diagram": {
                            "graphConfig": {
                                "type": "graph3d",
                                "data": {
                                    "points": [{"id": "A", "coords": [0, 0, 0]}],
                                    "segments": [],
                                },
                                "metadata": {
                                    "view3d": {"az": -2.35, "el": 0.28, "bank": 0},
                                    "showAxes": True,
                                    "axisLabels": ["$x$", "$y$", "$z$"],
                                    "bounds": {"x": [0, 2]},
                                    "pointLabels": True,
                                },
                            }
                        },
                    }
                ),
            }
        ],
    }

    [call] = openai_assistant.tool_calls(response)

    assert call["arguments"]["diagram"]["graphConfig"]["metadata"]["showAxes"] is True
    assert call["mauthArguments"]["diagram"]["graphConfig"]["metadata"] == {
        "view3d": {"az": -2.35, "el": 0.28, "bank": 0}
    }


def test_source_conversion_tool_calls_normalize_graph3d_aliases():
    response = {
        "output": [
            {
                "type": "function_call",
                "id": "fc_123",
                "call_id": "call_123",
                "name": "mauth_convert_source_question",
                "arguments": json.dumps(
                    {
                        "questionNumber": 1,
                        "marks": 0,
                        "questionText": "A triangular face is shown.",
                        "diagram": {
                            "graphConfig": {
                                "type": "graph3d",
                                "data": {
                                    "vertices": [
                                        {"id": "O", "coords": [0, 0, 0]},
                                        {"id": "A", "coords": [2, 0, 0]},
                                        {"id": "B", "coords": [0, 2, 0]},
                                    ],
                                    "edges": [{"from": "O", "to": "A"}, {"from": "O", "to": "B"}],
                                    "faces": [{"vertices": ["O", "A", "B"], "fillOpacity": 0.18}],
                                    "dimensionLines": [{"from": "O", "to": "A", "label": "$r$"}],
                                    "surfaces": [{"kind": "cone", "baseCenter": "O", "apex": "B", "radius": 2}],
                                },
                                "metadata": {"view3d": {"az": 1.2, "el": 0.35, "bank": 0}},
                            }
                        },
                    }
                ),
            }
        ],
    }

    [call] = openai_assistant.tool_calls(response)
    data = call["mauthArguments"]["diagram"]["graphConfig"]["data"]

    assert "vertices" in call["arguments"]["diagram"]["graphConfig"]["data"]
    assert "edges" in call["arguments"]["diagram"]["graphConfig"]["data"]
    assert "dimensionLines" in call["arguments"]["diagram"]["graphConfig"]["data"]
    assert "surfaces" in call["arguments"]["diagram"]["graphConfig"]["data"]
    assert data["points"] == [
        {"id": "O", "coords": [0, 0, 0]},
        {"id": "A", "coords": [2, 0, 0]},
        {"id": "B", "coords": [0, 2, 0]},
    ]
    assert "vertices" not in data
    assert data["segments"] == [{"from": "O", "to": "A"}, {"from": "O", "to": "B"}]
    assert "edges" not in data
    assert data["faces"][0]["points"] == ["O", "A", "B"]
    assert "vertices" not in data["faces"][0]
    assert data["dimensions"] == [{"from": "O", "to": "A", "label": "$r$"}]
    assert "dimensionLines" not in data
    assert data["solids"] == [{"kind": "cone", "baseCenter": "O", "apex": "B", "radius": 2}]
    assert "surfaces" not in data


def test_extracts_action_array_nested_tool_arguments_from_openai_response():
    actions = [{"type": "formatting.update", "patch": {"lineHeight": 1.32}}]
    response = {
        "output": [
            {
                "type": "function_call",
                "id": "fc_123",
                "call_id": "call_123",
                "name": "mauth_tool",
                "arguments": json.dumps({"name": "mauth.actions.apply", "arguments": actions}),
            }
        ],
    }

    [call] = openai_assistant.tool_calls(response)

    assert call["mauthToolName"] == "mauth.actions.apply"
    assert call["mauthArguments"] == {"actions": actions}


def test_extracts_high_level_authoring_tool_arguments_from_openai_response():
    arguments = {
        "questionNumber": 1,
        "marks": 4,
        "questionText": "Write a circle geometry proof.",
        "studentSpaceLines": 10,
        "solutionText": "Use the tangent-radius theorem.",
        "parts": [
            {
                "text": "State the key theorem.",
                "marks": 1,
                "studentSpaceLines": 3,
                "solutionText": "Tangent-chord theorem.",
            }
        ],
    }
    response = {
        "output": [
            {
                "type": "function_call",
                "id": "fc_123",
                "call_id": "call_123",
                "name": "mauth_tool",
                "arguments": json.dumps({"name": "mauth.author.replaceQuestion", "arguments": arguments}),
            }
        ],
    }

    [call] = openai_assistant.tool_calls(response)

    assert call["mauthToolName"] == "mauth.author.replaceQuestion"
    assert call["arguments"]["arguments"]["marks"] == 4
    assert call["mauthArguments"] == {**arguments, "marks": 0}


def test_extracts_direct_high_level_authoring_tool_arguments_from_openai_response():
    arguments = {
        "questionNumber": 1,
        "marks": 4,
        "questionText": "Write a circle geometry proof.",
        "studentSpaceLines": 10,
        "solutionText": "Use the tangent-radius theorem.",
        "parts": [
            {
                "text": "State the key theorem.",
                "marks": 1,
                "studentSpaceLines": 3,
                "solutionText": "Tangent-chord theorem.",
            }
        ],
    }
    response = {
        "output": [
            {
                "type": "function_call",
                "id": "fc_123",
                "call_id": "call_123",
                "name": "mauth_author_replace_question",
                "arguments": json.dumps(arguments),
            }
        ],
    }

    [call] = openai_assistant.tool_calls(response)

    assert call["name"] == "mauth_author_replace_question"
    assert call["mauthToolName"] == "mauth.author.replaceQuestion"
    assert call["arguments"]["marks"] == 4
    assert call["mauthArguments"] == {**arguments, "marks": 0}


def test_extracts_direct_add_diagram_tool_arguments_from_openai_response():
    arguments = {
        "questionNumber": 1,
        "diagram": {
            "graphConfig": {
                "type": "geometricConstruction",
                "data": {"objects": [{"type": "point", "name": "A"}], "relationships": []},
                "options": {"substanceSource": "Point A\nLabel A $A$\n"},
            }
        },
    }
    response = {
        "output": [
            {
                "type": "function_call",
                "id": "fc_123",
                "call_id": "call_123",
                "name": "mauth_author_add_diagram",
                "arguments": json.dumps(arguments),
            }
        ],
    }

    [call] = openai_assistant.tool_calls(response)

    assert call["name"] == "mauth_author_add_diagram"
    assert call["mauthToolName"] == "mauth.author.addDiagram"
    assert call["mauthArguments"] == arguments


def test_extracts_direct_ensure_solutions_tool_arguments_from_openai_response():
    arguments = {"questions": [{"questionNumber": 1, "studentSpaceLines": 8, "solutionText": "Use the theorem."}]}
    response = {
        "output": [
            {
                "type": "function_call",
                "id": "fc_123",
                "call_id": "call_123",
                "name": "mauth_author_ensure_solutions",
                "arguments": json.dumps(arguments),
            }
        ],
    }

    [call] = openai_assistant.tool_calls(response)

    assert call["name"] == "mauth_author_ensure_solutions"
    assert call["mauthToolName"] == "mauth.author.ensureSolutions"
    assert call["mauthArguments"] == arguments


def test_extracts_direct_write_all_solutions_tool_arguments_from_openai_response():
    arguments = {
        "questions": [
            {
                "questionNumber": 1,
                "studentSpaceLines": 8,
                "solutionText": "Use the theorem. [[marks:2]]",
            }
        ]
    }
    response = {
        "output": [
            {
                "type": "function_call",
                "id": "fc_123",
                "call_id": "call_123",
                "name": "mauth_write_all_solutions",
                "arguments": json.dumps(arguments),
            }
        ],
    }

    [call] = openai_assistant.tool_calls(response)

    assert call["name"] == "mauth_write_all_solutions"
    assert call["mauthToolName"] == "mauth.solutions.writeAll"
    assert call["mauthArguments"] == arguments


def test_extracts_direct_layout_check_tool_arguments_from_openai_response():
    arguments = {"mode": "both"}
    response = {
        "output": [
            {
                "type": "function_call",
                "id": "fc_123",
                "call_id": "call_123",
                "name": "mauth_check_document_layout",
                "arguments": json.dumps(arguments),
            }
        ],
    }

    [call] = openai_assistant.tool_calls(response)

    assert call["name"] == "mauth_check_document_layout"
    assert call["mauthToolName"] == "mauth.layout.check"
    assert call["mauthArguments"] == arguments


def test_extracts_direct_adjust_response_spaces_tool_arguments_from_openai_response():
    arguments = {"targets": [{"questionNumber": 1, "partLabel": "a", "lines": 8, "mode": "set"}]}
    response = {
        "output": [
            {
                "type": "function_call",
                "id": "fc_123",
                "call_id": "call_123",
                "name": "mauth_author_adjust_response_spaces",
                "arguments": json.dumps(arguments),
            }
        ],
    }

    [call] = openai_assistant.tool_calls(response)

    assert call["name"] == "mauth_author_adjust_response_spaces"
    assert call["mauthToolName"] == "mauth.author.adjustResponseSpaces"
    assert call["mauthArguments"] == arguments


def test_repairs_common_latex_control_characters_in_tool_arguments():
    response = {
        "output": [
            {
                "type": "function_call",
                "id": "fc_123",
                "call_id": "call_123",
                "name": "mauth_author_ensure_solutions",
                "arguments": json.dumps(
                    {
                        "questions": [
                            {
                                "questionNumber": 1,
                                "solutionText": "\u001bangle ABC = \u000crac{1}{2}\u0008inom{4}{2}\nNext line",
                            }
                        ]
                    }
                ),
            }
        ],
    }

    [call] = openai_assistant.tool_calls(response)

    assert call["mauthArguments"]["questions"][0]["solutionText"] == (
        "\\angle ABC = \\frac{1}{2}\\binom{4}{2}\nNext line"
    )


def test_focused_question_prompt_uses_smaller_instructions_than_full_context(monkeypatch):
    monkeypatch.delenv("ASSISTANT_BRAIN_CONTEXT_CHARS", raising=False)
    summary = {
        "counts": {"questions": 12, "marksTotal": 100},
        "questions": [{"id": f"q{index}", "index": index - 1, "marks": index, "modules": []} for index in range(1, 13)],
    }
    focused = openai_assistant.assistant_instructions(
        summary,
        [openai_assistant.AssistantChatMessage(role="user", content="Write question 1 with a solution.")],
    )
    broad = openai_assistant.assistant_instructions(
        summary,
        [
            openai_assistant.AssistantChatMessage(
                role="user", content="Convert this whole test with all questions, diagrams, and solutions."
            )
        ],
    )

    assert len(focused) < len(broad)
    assert "questionContextOmittedCount" in focused
    assert '"q1"' in focused
    assert '"q12"' not in focused


def test_source_conversion_instruction_profile_stays_under_shape_budget(monkeypatch):
    monkeypatch.setenv("ASSISTANT_BRAIN_CONTEXT_CHARS", "24000")
    summary = {"questions": [{"id": "q1", "index": 0, "modules": [], "parts": []}]}
    message = openai_assistant.AssistantChatMessage(
        role="user",
        content=(
            "Create Question 1 from the attached Specialist exam screenshots and official marking-key excerpt. "
            "Preserve the 3D coordinate prism diagram, structured parts, marks, and include the worked solutions."
        ),
    )
    attachments = [
        openai_assistant.AssistantAttachment(
            id="source-1",
            name="prism-source.png",
            mimeType="image/png",
            dataUrl="data:image/png;base64,abc",
            sizeBytes=3,
        ),
        openai_assistant.AssistantAttachment(
            id="key-1",
            name="official-key.txt",
            mimeType="text/plain",
            dataUrl="data:text/plain;base64,abc",
            sizeBytes=3,
        ),
    ]

    instructions = openai_assistant.assistant_instructions(summary, [message], attachments=attachments)

    assert "Instruction profile: sourceConversion" in instructions
    assert "include it in diagram or diagrams in the same replacement payload" in instructions
    assert "parts[i].text" in instructions
    assert len(instructions) < 30000


def source_conversion_instructions_for_prompt(prompt: str, attachment_name: str) -> str:
    summary = {"questions": [{"id": "q1", "index": 0, "modules": [], "parts": []}]}
    messages = [openai_assistant.AssistantChatMessage(role="user", content=prompt)]
    attachments = [
        openai_assistant.AssistantAttachment(
            id="source-1",
            name=attachment_name,
            mimeType="image/png",
            dataUrl="data:image/png;base64,abc",
            sizeBytes=3,
        )
    ]
    deterministic_ids = openai_assistant.deterministic_brain_ids_for_request(
        messages,
        tool_outputs=None,
        document_summary=summary,
        attachments=attachments,
    )
    brain_files = openai_assistant.brain_files_from_ids(deterministic_ids)
    return openai_assistant.assistant_instructions(summary, messages, None, brain_files, attachments)


def test_source_conversion_brain_context_is_renderer_focused():
    scalar = source_conversion_instructions_for_prompt(
        (
            "Can you make question 1 from the attached screenshot. Write the question with the diagram entered "
            "underneath and then put the parts under the diagram. It is a scalar product vector-ray diagram."
        ),
        "scalar-products.png",
    )
    graph3d = source_conversion_instructions_for_prompt(
        (
            "Create Question 1 from the attached Specialist exam screenshot. Preserve the 3D cylinder diagram "
            "with h and r dimensions and worked solution."
        ),
        "cylinder-graph3d.png",
    )
    stats = source_conversion_instructions_for_prompt(
        (
            "Create Question 1 from the attached Methods exam screenshot. Preserve the statistics column graph, "
            "table, marks, and worked solutions."
        ),
        "stats-column-graph.png",
    )
    argand = source_conversion_instructions_for_prompt(
        (
            "Create Question 1 from the attached Specialist Argand/locus screenshot. Preserve the locus diagram "
            "with Arg(z) boundary rays and the shifted circle."
        ),
        "argand-locus.png",
    )

    assert "For scalar-product source diagrams" in scalar
    assert "For graph3d source solids" not in scalar
    assert "For statsChart source diagrams" not in scalar

    assert "For graph3d source solids" in graph3d
    assert "For scalar-product source diagrams" not in graph3d
    assert "For statsChart source diagrams" not in graph3d
    assert "middle letter is the vertex" in graph3d
    assert "M-F" in graph3d

    assert "For statsChart source diagrams" in stats
    assert "For graph3d source solids" not in stats
    assert "For scalar-product source diagrams" not in stats

    assert "For graph2d source diagrams" in argand
    assert "Arg(z)" in argand
    assert "domainMin/domainMax" in argand
    assert "full infinite line functions" in argand
    assert "For graph3d source solids" not in argand
    assert "For statsChart source diagrams" not in argand


def test_source_conversion_renderer_instruction_budgets_are_focused():
    scalar = source_conversion_instructions_for_prompt(
        (
            "Can you make question 1 from the attached screenshot. Write the question with the diagram entered "
            "underneath and then put the parts under the diagram. It is a scalar product vector-ray diagram."
        ),
        "scalar-products.png",
    )
    graph3d = source_conversion_instructions_for_prompt(
        (
            "Create Question 1 from the attached Specialist exam screenshot. Preserve the 3D cylinder diagram "
            "with h and r dimensions and worked solution."
        ),
        "cylinder-graph3d.png",
    )
    stats = source_conversion_instructions_for_prompt(
        (
            "Create Question 1 from the attached Methods exam screenshot. Preserve the statistics column graph, "
            "table, marks, and worked solutions."
        ),
        "stats-column-graph.png",
    )
    argand = source_conversion_instructions_for_prompt(
        (
            "Create Question 1 from the attached Specialist Argand/locus screenshot. Preserve the locus diagram "
            "with Arg(z) boundary rays and the shifted circle."
        ),
        "argand-locus.png",
    )

    assert len(scalar) < 23500
    assert len(graph3d) < 28500
    assert len(stats) < 26000
    assert len(argand) < 26500


def test_brain_menu_selection_maps_to_instruction_files():
    menu = openai_assistant.assistant_brain_menu()
    assert {entry["id"] for entry in menu} >= {"question", "diagram", "solutions", "formatting"}

    files = openai_assistant.brain_files_from_ids(["question", "diagram", "question"])

    assert files == ["index.json", "question.json", "diagram.json"]


def test_brain_selection_response_parses_selected_ids():
    response = {
        "output": [
            {
                "type": "function_call",
                "name": "mauth_select_brains",
                "arguments": json.dumps({"brainIds": ["diagram", "question", "unknown"], "reason": "Needs geometry."}),
            }
        ]
    }

    assert openai_assistant.selected_brain_ids_from_response(response) == ["diagram", "question"]


def test_assistant_instructions_can_use_model_selected_brains():
    instructions = openai_assistant.assistant_instructions(
        {"questions": [{"id": "q1", "index": 0, "modules": []}]},
        [openai_assistant.AssistantChatMessage(role="user", content="Add a circle diagram to question 1.")],
        selected_brain_files=["index.json", "diagram.json"],
    )

    assert "Diagram Brain" in instructions
    assert "Question Brain" not in instructions


def test_focused_solution_prompt_gets_direct_tool_hint():
    summary = {
        "counts": {"questions": 1, "marksTotal": 4},
        "questions": [
            {
                "id": "q1",
                "index": 0,
                "marks": 4,
                "modules": [{"kind": "text", "textPreview": "A random variable X has P(X=x)=k/x for x=2,3,4,5."}],
            }
        ],
    }

    instructions = openai_assistant.assistant_instructions(
        summary,
        [openai_assistant.AssistantChatMessage(role="user", content="Write the worked solution for question 1.")],
    )
    tools = openai_assistant.assistant_tool_definitions(
        [openai_assistant.AssistantChatMessage(role="user", content="Write the worked solution for question 1.")],
        document_summary=summary,
    )

    assert [tool["name"] for tool in tools] == ["mauth_write_solutions_for_questions", "mauth_tool"]
    assert "mauth_write_solutions_for_questions" in instructions
    assert "Do not call mauth.document.inspect first" in instructions
    assert "[[marks:n]]" in instructions
    assert "hidden mark total match" in instructions
    assert "[1 mark]" in instructions


def test_whole_test_solution_prompt_gets_write_all_and_layout_tools():
    summary = {
        "counts": {"questions": 2, "marksTotal": 7},
        "questions": [
            {"id": "q1", "index": 0, "marks": 3, "modules": [{"kind": "text", "textPreview": "Find k."}]},
            {
                "id": "q2",
                "index": 1,
                "marks": 0,
                "parts": [{"id": "p1", "label": "a", "marks": 4, "textPreview": "Find E(X)."}],
                "modules": [],
            },
        ],
    }
    message = openai_assistant.AssistantChatMessage(role="user", content="Write the solutions for the whole test.")

    tools = openai_assistant.assistant_tool_definitions([message], document_summary=summary)
    instructions = openai_assistant.assistant_instructions(summary, [message])

    assert [tool["name"] for tool in tools] == [
        "mauth_write_all_solutions",
        "mauth_check_document_layout",
    ]
    assert "mauth_write_all_solutions" in instructions
    assert "Do not call mauth.document.inspect first" in instructions
    assert "every marked question, part, and subpart" in instructions
    assert "mauth_check_document_layout" in instructions


def test_layout_check_prompt_gets_layout_tool_first():
    message = openai_assistant.AssistantChatMessage(
        role="user",
        content="Please check the whole document layout for print risks, weird blank pages and solution spacing.",
    )

    tools = openai_assistant.assistant_tool_definitions([message])
    instructions = openai_assistant.assistant_instructions(
        {"questions": [{"id": "q1", "index": 0, "modules": [{"kind": "text", "textPreview": "Find x."}]}]},
        [message],
    )

    assert [tool["name"] for tool in tools] == ["mauth_check_document_layout"]
    assert "mauth_check_document_layout" in instructions
    assert "repair page overflow" in instructions


def test_focused_mark_allocation_prompt_uses_solution_tool_not_replace_question():
    summary = {
        "counts": {"questions": 1, "marksTotal": 5},
        "questions": [
            {
                "id": "q1",
                "index": 0,
                "marks": 5,
                "modules": [
                    {"kind": "text", "textPreview": "A circle proof question."},
                    {"kind": "diagram", "diagramType": "geometricConstruction"},
                    {"kind": "text", "textPreview": "Solution. The final QED statement gets a mark."},
                ],
            }
        ],
    }
    message = openai_assistant.AssistantChatMessage(
        role="user",
        content="In question 1 reduce this to 4 marks. The QED statement at the end does not deserve a mark.",
    )

    tools = openai_assistant.assistant_tool_definitions([message])
    instructions = openai_assistant.assistant_instructions(summary, [message])

    assert [tool["name"] for tool in tools] == ["mauth_write_solutions_for_questions", "mauth_tool"]
    assert "Do not use mauth_question_upsert" in instructions
    assert "Preserve existing diagrams" in instructions
    assert "mauth.preview.inspect" in instructions
    assert 'marks":4' in instructions


def test_focused_response_space_prompt_uses_response_space_tool():
    message = openai_assistant.AssistantChatMessage(
        role="user",
        content="Can you give question 1 more working space? Make the answer space 12 lines.",
    )

    tools = openai_assistant.assistant_tool_definitions([message])
    instructions = openai_assistant.assistant_instructions(
        {"questions": [{"id": "q1", "index": 0, "modules": [{"kind": "text", "textPreview": "Old question."}]}]},
        [message],
    )

    assert [tool["name"] for tool in tools] == ["mauth_author_adjust_response_spaces"]
    assert "mauth_author_adjust_response_spaces" in instructions
    assert "preserve existing question text, solutions, and diagrams" in instructions


def test_solution_overflow_repair_exposes_solution_and_space_tools():
    tool_output = openai_assistant.AssistantToolOutput(
        callId="call_1",
        name="mauth_author_ensure_solutions",
        output={
            "ok": False,
            "toolName": "mauth.author.ensureSolutions",
            "validationIssues": [
                {
                    "path": "postEditInspection.renderedMetrics.warnings[0]",
                    "message": "Solution needs about 5 more lines than the student space.",
                    "expected": "Repair by using mauth.author.adjustResponseSpaces.",
                }
            ],
            "warnings": [{"code": "rendered-solution-space-overflow", "message": "Solution needs about 5 more lines."}],
        },
    )

    tools = openai_assistant.assistant_tool_definitions(tool_outputs=[tool_output])

    assert [tool["name"] for tool in tools] == [
        "mauth_write_solutions_for_questions",
        "mauth_check_document_layout",
        "mauth_author_adjust_response_spaces",
    ]


def test_response_space_outline_repair_from_replace_question_exposes_solution_and_space_tools():
    tool_output = openai_assistant.AssistantToolOutput(
        callId="call_1",
        name="mauth_author_replace_question",
        output={
            "ok": False,
            "toolName": "mauth.author.replaceQuestion",
            "validationIssues": [
                {
                    "path": "postEditInspection.renderedMetrics.warnings[0]",
                    "message": "The diagram answer-space outline did not render as a single L-shaped slot.",
                    "expected": "Repair by using mauth.author.adjustResponseSpaces.",
                }
            ],
            "warnings": [
                {
                    "code": "rendered-response-space-outline-missing",
                    "message": "The diagram answer-space outline did not render as a single L-shaped slot.",
                }
            ],
        },
    )

    tools = openai_assistant.assistant_tool_definitions(tool_outputs=[tool_output])

    assert [tool["name"] for tool in tools] == [
        "mauth_write_solutions_for_questions",
        "mauth_author_adjust_response_spaces",
    ]


def test_focused_write_question_prompt_with_marks_still_uses_replace_question():
    message = openai_assistant.AssistantChatMessage(
        role="user",
        content="Write question 1 as a 5 mark circle geometry proof question.",
    )

    tools = openai_assistant.assistant_tool_definitions([message])
    instructions = openai_assistant.assistant_instructions(
        {"questions": [{"id": "q1", "index": 0, "modules": [{"kind": "text", "textPreview": "Old question."}]}]},
        [message],
    )

    assert [tool["name"] for tool in tools] == ["mauth_question_upsert"]
    assert "mauth_question_upsert" in instructions
    assert "Omit diagram fields to preserve existing diagrams" in instructions


def test_focused_write_next_missing_question_does_not_refuse():
    message = openai_assistant.AssistantChatMessage(
        role="user",
        content="Make me a year 9 linear equations point of intersection question with a diagram for question 2.",
    )
    summary = {"questions": [{"id": "q1", "index": 0, "modules": [{"kind": "text", "textPreview": "Question 1."}]}]}

    tools = openai_assistant.assistant_tool_definitions([message])
    instructions = openai_assistant.assistant_instructions(summary, [message])

    assert [tool["name"] for tool in tools] == ["mauth_question_upsert"]
    assert "this tool can append it; do not refuse" in instructions
    assert "exactly the next missing question" in tools[0]["description"]
    assert (
        "one past the current question count" in tools[0]["parameters"]["properties"]["questionNumber"]["description"]
    )


def test_add_this_question_routes_to_next_missing_source_conversion():
    message = openai_assistant.AssistantChatMessage(
        role="user",
        content="Please add this question to the test.",
    )
    summary = {
        "questions": [
            {"id": "q1", "index": 0, "modules": [{"kind": "text", "textPreview": "Question 1."}]},
            {"id": "q2", "index": 1, "modules": [{"kind": "text", "textPreview": "Question 2."}]},
            {"id": "q3", "index": 2, "modules": [{"kind": "text", "textPreview": "Question 3."}]},
        ]
    }
    attachments = [
        openai_assistant.AssistantAttachment(
            id="screenshot-1",
            name="source-question.png",
            mimeType="image/png",
            dataUrl="data:image/png;base64,abc",
            sizeBytes=3,
        )
    ]

    tools = openai_assistant.assistant_tool_definitions([message], attachments=attachments, document_summary=summary)
    instructions = openai_assistant.assistant_instructions(summary, [message], attachments=attachments)

    assert [tool["name"] for tool in tools] == ["mauth_convert_source_question"]
    assert "for the next missing question, Question 4" in instructions
    assert "this tool can append it; do not refuse" in instructions


def test_add_this_as_next_question_with_diagram_source_routes_to_source_conversion():
    message = openai_assistant.AssistantChatMessage(
        role="user",
        content=(
            "Add this as the next question in the test. Recreate the diagram as a native Mauth diagram, "
            "put the diagram under the stem, and put the scalar-product parts underneath."
        ),
    )
    summary = {
        "questions": [
            {"id": "q1", "index": 0, "modules": [{"kind": "text", "textPreview": "Question 1."}]},
            {"id": "q2", "index": 1, "modules": [{"kind": "text", "textPreview": "Question 2."}]},
            {"id": "q3", "index": 2, "modules": [{"kind": "text", "textPreview": "Question 3."}]},
        ]
    }
    attachments = [
        openai_assistant.AssistantAttachment(
            id="screenshot-1",
            name="vector-source.png",
            mimeType="image/png",
            dataUrl="data:image/png;base64,abc",
            sizeBytes=3,
        )
    ]

    request = openai_assistant.AssistantChatRequest(
        messages=[message],
        attachments=attachments,
        documentSummary=summary,
    )
    tools = openai_assistant.assistant_tool_definitions([message], attachments=attachments, document_summary=summary)
    instructions = openai_assistant.assistant_instructions(summary, [message], attachments=attachments)

    assert openai_assistant.direct_clarification_question(request) is None
    assert [tool["name"] for tool in tools] == ["mauth_convert_source_question"]
    assert "for the next missing question, Question 4" in instructions
    assert "include it in diagram or diagrams in the same replacement payload" in instructions


def test_current_attached_question_request_ignores_stale_diagram_history():
    messages = [
        openai_assistant.AssistantChatMessage(role="user", content="Please add a diagram."),
        openai_assistant.AssistantChatMessage(role="assistant", content="Which question should I add the diagram to?"),
        openai_assistant.AssistantChatMessage(role="user", content="Please add this question to the test."),
    ]
    summary = {
        "questions": [
            {"id": "q1", "index": 0, "modules": [{"kind": "text", "textPreview": "Question 1."}]},
            {"id": "q2", "index": 1, "modules": [{"kind": "text", "textPreview": "Question 2."}]},
            {"id": "q3", "index": 2, "modules": [{"kind": "text", "textPreview": "Question 3."}]},
        ]
    }
    attachments = [
        openai_assistant.AssistantAttachment(
            id="screenshot-1",
            name="source-question.png",
            mimeType="image/png",
            dataUrl="data:image/png;base64,abc",
            sizeBytes=3,
        )
    ]

    request = openai_assistant.AssistantChatRequest(
        messages=messages,
        attachments=attachments,
        documentSummary=summary,
    )
    tools = openai_assistant.assistant_tool_definitions(messages, attachments=attachments, document_summary=summary)
    instructions = openai_assistant.assistant_instructions(summary, messages, attachments=attachments)

    assert openai_assistant.direct_clarification_question(request) is None
    assert [tool["name"] for tool in tools] == ["mauth_convert_source_question"]
    assert "Which question should I add the diagram to?" not in instructions
    assert "for the next missing question, Question 4" in instructions


def test_add_this_question_without_source_asks_for_clarification():
    message = openai_assistant.AssistantChatMessage(
        role="user",
        content="Please add this question to the test.",
    )

    tools = openai_assistant.assistant_tool_definitions([message])
    instructions = openai_assistant.assistant_instructions({"questions": []}, [message])
    request = openai_assistant.AssistantChatRequest(messages=[message], documentSummary={"questions": []})

    assert tools == []
    assert "Ask exactly this clarifying question: What should the new question be based on?" in instructions
    assert openai_assistant.direct_clarification_question(request) == "What should the new question be based on?"


def test_ambiguous_diagram_request_asks_for_target_question():
    message = openai_assistant.AssistantChatMessage(
        role="user",
        content="Please add a diagram.",
    )

    tools = openai_assistant.assistant_tool_definitions([message])
    instructions = openai_assistant.assistant_instructions({"questions": []}, [message])
    request = openai_assistant.AssistantChatRequest(messages=[message], documentSummary={"questions": []})

    assert tools == []
    assert "Ask exactly this clarifying question: Which question should I add the diagram to?" in instructions
    assert openai_assistant.direct_clarification_question(request) == "Which question should I add the diagram to?"


def test_add_new_question_with_topic_still_routes_to_upsert():
    message = openai_assistant.AssistantChatMessage(
        role="user",
        content="Add a new question about solving simultaneous linear equations.",
    )

    tools = openai_assistant.assistant_tool_definitions([message])

    assert [tool["name"] for tool in tools] == ["mauth_question_upsert"]


def test_screenshot_question_conversion_requires_native_diagram_and_part_text():
    message = openai_assistant.AssistantChatMessage(
        role="user",
        content=(
            "Can you make question 1 from the attached screenshot. Write the question with the diagram entered "
            "underneath and then put the parts under the diagram."
        ),
    )
    attachments = [
        openai_assistant.AssistantAttachment(
            id="screenshot-1",
            name="scalar-products.png",
            mimeType="image/png",
            dataUrl="data:image/png;base64,abc",
            sizeBytes=3,
        )
    ]

    tools = openai_assistant.assistant_tool_definitions([message], attachments=attachments)
    instructions = openai_assistant.assistant_instructions(
        {"questions": [{"id": "q1", "index": 0, "modules": [], "parts": []}]},
        [message],
        attachments=attachments,
    )

    assert [tool["name"] for tool in tools] == ["mauth_convert_source_question"]
    assert "diagram" in tools[0]["parameters"]["required"]
    assert "Required for this request" in tools[0]["parameters"]["properties"]["diagram"]["description"]
    assert "include it in diagram or diagrams in the same replacement payload" in instructions
    assert "do not submit a text-only replacement" in instructions
    assert "Do not replace a visible mathematical diagram with prose" in instructions
    assert "parts[i].text" in instructions
    assert "Do not leave marked part text blank" in instructions
    assert "before structured parts" in instructions


def test_screenshot_text_only_conversion_does_not_require_diagram_when_not_requested():
    message = openai_assistant.AssistantChatMessage(
        role="user",
        content="Can you make question 1 from the attached screenshot.",
    )
    attachments = [
        openai_assistant.AssistantAttachment(
            id="screenshot-1",
            name="text-only.png",
            mimeType="image/png",
            dataUrl="data:image/png;base64,abc",
            sizeBytes=3,
        )
    ]

    tools = openai_assistant.assistant_tool_definitions([message], attachments=attachments)

    assert [tool["name"] for tool in tools] == ["mauth_convert_source_question"]
    assert "diagram" not in tools[0]["parameters"]["required"]


def test_replace_question_schema_warns_against_blank_source_parts():
    tool = openai_assistant.mauth_author_replace_question_tool_definition()
    properties = tool["parameters"]["properties"]
    parts = properties["parts"]
    part_text_description = parts["items"]["properties"]["text"]["description"]

    assert "diagram at question level" in parts["description"]
    assert "never leave this blank for a marked part" in part_text_description
    assert "$\\mathbf{a}\\cdot\\mathbf{b}$" in part_text_description
    assert "visible mathematical diagram" in properties["diagrams"]["description"]


def test_focused_circle_diagram_prompt_gets_penrose_renderer_hint():
    instructions = openai_assistant.assistant_instructions(
        {"questions": [{"id": "q1", "index": 0, "modules": []}]},
        [
            openai_assistant.AssistantChatMessage(
                role="user", content="Add a diagram for the circle tangent in question 1."
            )
        ],
    )

    assert "mauth_make_diagram_for_question" in instructions
    assert 'graphConfig.type="geometricConstruction"' in instructions
    assert "graphConfig.options.substanceSource" in instructions
    assert "Do not use standardDiagram recipe names" in instructions


def test_focused_diagram_prompt_exposes_only_add_diagram_tool():
    tools = openai_assistant.assistant_tool_definitions(
        [
            openai_assistant.AssistantChatMessage(
                role="user",
                content="Please add the diagram to question 1 that goes along with the question.",
            )
        ]
    )

    assert [tool["name"] for tool in tools] == ["mauth_make_diagram_for_question"]


def test_repair_continuation_stays_on_direct_authoring_tool():
    outputs = [
        openai_assistant.AssistantToolOutput(
            callId="call_1",
            name="mauth_author_add_diagram",
            output={
                "ok": False,
                "toolName": "mauth.author.addDiagram",
                "validationIssues": [
                    {
                        "path": "arguments.diagram.graphConfig.type",
                        "message": "Use graphConfig.type 'geometricConstruction', not 'graph2d'.",
                    }
                ],
            },
        )
    ]

    tools = openai_assistant.assistant_tool_definitions(tool_outputs=outputs)

    assert [tool["name"] for tool in tools] == ["mauth_make_diagram_for_question"]


def test_add_diagram_new_question_misuse_repairs_with_source_conversion_tool():
    outputs = [
        openai_assistant.AssistantToolOutput(
            callId="call_1",
            name="mauth_make_diagram_for_question",
            output={
                "ok": False,
                "toolName": "mauth.author.addDiagram",
                "validationIssues": [
                    {
                        "path": "arguments.questionNumber",
                        "message": "must reference an existing question",
                        "expected": (
                            "Question 4 does not exist yet. mauth.author.addDiagram only edits diagrams in existing "
                            "questions 1 to 3. If the teacher is adding a new/source question, switch to "
                            "mauth.question.upsert or mauth_convert_source_question and create Question 4 with the "
                            "diagram in the same payload."
                        ),
                    }
                ],
            },
        )
    ]

    tools = openai_assistant.assistant_tool_definitions(tool_outputs=outputs)

    assert [tool["name"] for tool in tools] == ["mauth_convert_source_question"]
    assert "diagram" in tools[0]["parameters"]["required"]


def test_broad_tool_new_question_misuse_repairs_with_source_conversion_tool():
    outputs = [
        openai_assistant.AssistantToolOutput(
            callId="call_1",
            name="mauth_tool",
            output={
                "ok": False,
                "toolName": "mauth.actions.apply",
                "validationIssues": [
                    {
                        "path": "arguments.questionNumber",
                        "message": "must reference an existing question",
                        "expected": (
                            "Question 4 does not exist yet. mauth.author.addDiagram only edits diagrams in existing "
                            "questions 1 to 3. If the teacher is adding a new/source question, switch to "
                            "mauth.question.upsert or mauth_convert_source_question and create Question 4 with the "
                            "diagram in the same payload."
                        ),
                    }
                ],
            },
        )
    ]

    tools = openai_assistant.assistant_tool_definitions(tool_outputs=outputs)

    assert [tool["name"] for tool in tools] == ["mauth_convert_source_question"]
    assert "diagram" in tools[0]["parameters"]["required"]


def test_broad_question_payload_vector2d_validation_repairs_with_source_conversion_tool():
    outputs = [
        openai_assistant.AssistantToolOutput(
            callId="call_1",
            name="mauth_tool",
            output={
                "ok": False,
                "toolName": "mauth.actions.apply",
                "error": (
                    "actions[0].question.contentBlocks[0].graphConfig.metadata.vector2d.vectors[0].id "
                    "must be a non-empty string. Expected: string; "
                    "actions[0].question.contentBlocks[0].graphConfig.metadata.vector2d.vectors[0].start "
                    "must be a pair of finite numbers. Expected: [number, number]."
                ),
            },
        )
    ]

    tools = openai_assistant.assistant_tool_definitions(tool_outputs=outputs)

    assert [tool["name"] for tool in tools] == ["mauth_convert_source_question"]
    assert "diagram" in tools[0]["parameters"]["required"]


def test_source_question_vector2d_validation_repair_stays_on_source_conversion_tool():
    outputs = [
        openai_assistant.AssistantToolOutput(
            callId="call_1",
            name="mauth_convert_source_question",
            output={
                "ok": False,
                "toolName": "mauth.question.upsert",
                "validationIssues": [
                    {
                        "path": "arguments.diagram.graphConfig.metadata.vector2d.vectors[0].id",
                        "message": "must be a non-empty string",
                        "expected": "string",
                    },
                    {
                        "path": "arguments.diagram.graphConfig.metadata.vector2d.vectors[0].start",
                        "message": "must be a pair of finite numbers",
                        "expected": "[number, number]",
                    },
                ],
            },
        )
    ]

    tools = openai_assistant.assistant_tool_definitions(tool_outputs=outputs)

    assert [tool["name"] for tool in tools] == ["mauth_convert_source_question"]
    assert "diagram" in tools[0]["parameters"]["required"]


def test_source_question_tool_schema_describes_required_vector2d_fields():
    tool = openai_assistant.mauth_convert_source_question_tool_definition(require_diagram=True)
    graph_description = tool["parameters"]["properties"]["diagram"]["properties"]["graphConfig"]["description"]

    assert "metadata.vector2d.vectors[]" in graph_description
    assert "id, name, start:[x,y], and components:[dx,dy]" in graph_description
    assert "metadata.vector2d.segmentLabels[]" in graph_description
    assert "metadata.vector2d.angleMarkers[]" in graph_description


def test_source_question_tool_schema_stays_compact():
    tool = openai_assistant.mauth_convert_source_question_tool_definition(require_diagram=True)
    serialized = json.dumps(tool, ensure_ascii=False)
    properties = tool["parameters"]["properties"]
    part_properties = properties["parts"]["items"]["properties"]

    assert len(serialized) < 24000
    assert "metadata.vector2d.vectors[]" in properties["diagram"]["properties"]["graphConfig"]["description"]
    assert "Use exactly one of graphConfig or vectorRayDiagram" in properties["solutionDiagram"]["description"]
    assert "questionMarks" not in properties
    assert "top-level marks must be 0" in properties["parts"]["description"]
    assert "Use exactly one of graphConfig or vectorRayDiagram" in part_properties["diagram"]["description"]


def test_multi_renderer_source_question_schema_uses_diagrams_only():
    tool = openai_assistant.mauth_convert_source_question_tool_definition(
        require_diagram=True,
        diagram_types=["graph3d", "graph2d"],
    )
    properties = tool["parameters"]["properties"]
    part_properties = properties["parts"]["items"]["properties"]
    subpart_properties = part_properties["subparts"]["items"]["properties"]

    assert tool["parameters"]["required"] == ["questionNumber", "marks", "questionText", "diagrams"]
    assert "diagram" not in properties
    assert "solutionDiagram" not in properties
    assert "diagram" not in part_properties
    assert "solutionDiagram" not in part_properties
    assert "diagram" not in subpart_properties
    assert "solutionDiagram" not in subpart_properties
    assert "diagrams" in properties
    assert "diagrams" in part_properties
    assert "diagrams" in subpart_properties


def test_source_question_table_only_schema_omits_diagram_payloads():
    tool = openai_assistant.mauth_convert_source_question_tool_definition(include_diagram_fields=False)
    serialized = json.dumps(tool, ensure_ascii=False)
    properties = tool["parameters"]["properties"]
    part_properties = properties["parts"]["items"]["properties"]
    subpart_properties = part_properties["subparts"]["items"]["properties"]

    assert len(serialized) < 15000
    assert "diagram" not in properties
    assert "diagrams" not in properties
    assert "solutionDiagram" not in properties
    assert "diagram" not in part_properties
    assert "diagram" not in subpart_properties
    assert "table" in properties
    assert "solutionTable" in properties


def test_source_diagram_type_detection_covers_related_rates_geometry():
    text = (
        "Create Question 1 from the attached Specialist exam screenshot. "
        "Preserve the lighthouse related-rates diagram and worked solution."
    )

    assert openai_assistant.source_conversion_diagram_types_for_text(text) == ["geometricConstruction"]


def test_direct_add_diagram_tool_accepts_diagram_id_for_repairs():
    tool = openai_assistant.mauth_author_add_diagram_tool_definition()
    properties = tool["parameters"]["properties"]

    assert "diagramId" in properties
    assert "replace" in properties["diagramId"]["description"]


def test_replace_question_repair_keeps_required_diagram_when_validation_mentions_diagram():
    outputs = [
        openai_assistant.AssistantToolOutput(
            callId="call_1",
            name="mauth_tool",
            output={
                "ok": False,
                "toolName": "mauth.author.replaceQuestion",
                "validationIssues": [
                    {
                        "path": "arguments.diagram",
                        "message": "The source screenshot prompt requires a native diagram graphConfig.",
                    }
                ],
            },
        )
    ]

    tools = openai_assistant.assistant_tool_definitions(tool_outputs=outputs)

    assert [tool["name"] for tool in tools] == ["mauth_question_upsert"]
    assert "diagram" in tools[0]["parameters"]["required"]


def test_replace_question_post_edit_diagram_warning_repairs_with_add_diagram():
    outputs = [
        openai_assistant.AssistantToolOutput(
            callId="call_1",
            name="mauth_author_replace_question",
            output={
                "ok": False,
                "toolName": "mauth.author.replaceQuestion",
                "error": "Assistant diagram post-edit inspection found repairable warnings.",
                "validationIssues": [
                    {
                        "path": "postEditInspection.question.diagrams[0].graphConfig",
                        "message": "Missing label $\\mathbf{c}$.",
                        "expected": 'Repair this diagram by calling mauth.author.addDiagram with diagramId: "q1-diagram-1".',
                        "targetId": "q1-diagram-1",
                    }
                ],
            },
        )
    ]

    tools = openai_assistant.assistant_tool_definitions(tool_outputs=outputs)

    assert [tool["name"] for tool in tools] == ["mauth_make_diagram_for_question"]
    assert "diagramId" in tools[0]["parameters"]["properties"]


def test_successful_diagram_edit_semantic_review_exposes_repair_tools():
    outputs = [
        openai_assistant.AssistantToolOutput(
            callId="call_1",
            name="mauth_author_replace_question",
            output={
                "ok": True,
                "toolName": "mauth.author.replaceQuestion",
                "semanticReview": {"required": True},
                "postEditInspection": {
                    "question": {
                        "modules": [{"kind": "text", "textPreview": "The graph shows y=2x+1 and y=-x+7."}],
                        "diagrams": [
                            {
                                "graphType": "graph2d",
                                "summary": {"functions": [{"expression": "x^2-4*x+4"}]},
                            }
                        ],
                    }
                },
            },
        )
    ]

    tools = openai_assistant.assistant_tool_definitions(tool_outputs=outputs)

    assert [tool["name"] for tool in tools] == ["mauth_make_diagram_for_question", "mauth_question_upsert"]


def test_focused_parallel_chord_diagram_prompt_uses_penrose_predicate_hint():
    instructions = openai_assistant.assistant_instructions(
        {
            "questions": [
                {
                    "id": "q1",
                    "index": 0,
                    "modules": [
                        {
                            "kind": "text",
                            "textPreview": (
                                "A, B and C are points on a circle. The tangent to the circle at A is parallel "
                                "to the chord BC. Prove that AB=AC."
                            ),
                        }
                    ],
                }
            ]
        },
        [
            openai_assistant.AssistantChatMessage(
                role="user",
                content="Please add the diagram to question 1 that goes along with the question.",
            )
        ],
    )

    assert "mauth_make_diagram_for_question" in instructions
    assert 'graphConfig.type="geometricConstruction"' in instructions
    assert "ParallelToSegment" in instructions
    assert "supported Substance is the normal AI geometry path" in instructions
    assert "HidePoint(centre)" in instructions
    assert "circleTangentParallelChord" not in instructions


def test_input_items_attach_images_and_pdfs_to_latest_user_message():
    request = openai_assistant.AssistantChatRequest(
        messages=[
            openai_assistant.AssistantChatMessage(role="assistant", content="What do you need?"),
            openai_assistant.AssistantChatMessage(role="user", content="Make a question from these."),
        ],
        attachments=[
            openai_assistant.AssistantAttachment(
                id="image-1",
                name="question.png",
                mimeType="image/png",
                dataUrl="data:image/png;base64,iVBORw0KGgo=",
                sizeBytes=12,
            ),
            openai_assistant.AssistantAttachment(
                id="pdf-1",
                name="paper.pdf",
                mimeType="application/pdf",
                dataUrl="data:application/pdf;base64,JVBERi0x",
                sizeBytes=8,
            ),
        ],
    )

    items = openai_assistant.input_items(request)

    assert len(items) == 1
    latest_user_content = items[-1]["content"]
    assert latest_user_content[0] == {"type": "input_text", "text": "Make a question from these."}
    assert {
        "type": "input_image",
        "image_url": "data:image/png;base64,iVBORw0KGgo=",
        "detail": "high",
    } in latest_user_content
    assert {
        "type": "input_file",
        "filename": "paper.pdf",
        "file_data": "data:application/pdf;base64,JVBERi0x",
    } in latest_user_content


def test_input_items_optimize_large_images_for_provider(monkeypatch):
    monkeypatch.setenv("ASSISTANT_IMAGE_MAX_LONG_EDGE", "640")
    image_data_url, image_bytes = png_data_url(1600, 1200)
    request = openai_assistant.AssistantChatRequest(
        messages=[openai_assistant.AssistantChatMessage(role="user", content="Convert this source screenshot.")],
        attachments=[
            openai_assistant.AssistantAttachment(
                id="image-1",
                name="question-source.png",
                mimeType="image/png",
                dataUrl=image_data_url,
                sizeBytes=image_bytes,
            )
        ],
    )

    [item] = openai_assistant.input_items(request)
    image_item = next(content for content in item["content"] if content["type"] == "input_image")
    stats = openai_assistant.assistant_attachment_payload_stats(request.attachments)

    assert image_item["detail"] == "high"
    assert image_item["image_url"].startswith("data:image/")
    assert len(image_item["image_url"]) < len(image_data_url)
    assert stats["optimizedAttachmentCount"] == 1
    assert stats["providerAttachmentBytes"] < stats["rawAttachmentBytes"]
    assert stats["imageMaxLongEdge"] == 640
    assert stats["providerImagePixels"] < stats["rawImagePixels"]


def test_input_items_trim_blank_image_borders_for_provider(monkeypatch):
    monkeypatch.setenv("ASSISTANT_IMAGE_MAX_LONG_EDGE", "0")
    monkeypatch.setenv("ASSISTANT_IMAGE_OPTIMIZE_MIN_BYTES", "0")
    monkeypatch.setenv("ASSISTANT_IMAGE_TRIM_PADDING_PX", "20")
    image_data_url, image_bytes = png_data_url_with_margins(1000, 800)
    request = openai_assistant.AssistantChatRequest(
        messages=[openai_assistant.AssistantChatMessage(role="user", content="Convert this source screenshot.")],
        attachments=[
            openai_assistant.AssistantAttachment(
                id="image-1",
                name="question-source.png",
                mimeType="image/png",
                dataUrl=image_data_url,
                sizeBytes=image_bytes,
            )
        ],
    )

    [item] = openai_assistant.input_items(request)
    image_item = next(content for content in item["content"] if content["type"] == "input_image")
    stats = openai_assistant.assistant_attachment_payload_stats(request.attachments)

    assert data_url_image_size(image_item["image_url"])[0] < 400
    assert data_url_image_size(image_item["image_url"])[1] < 260
    assert stats["optimizedAttachmentCount"] == 1
    assert stats["imageTrimBorders"] is True
    assert stats["providerImagePixels"] < stats["rawImagePixels"] / 8


def test_input_items_extract_text_and_docx_attachments_to_latest_user_message():
    text_attachment = openai_assistant.AssistantAttachment(
        id="text-1",
        name="curriculum.md",
        mimeType="text/markdown",
        dataUrl=data_url("text/markdown", b"Create a 4 mark probability question about P(X=x)=k/x."),
        sizeBytes=57,
    )
    docx_attachment = openai_assistant.AssistantAttachment(
        id="docx-1",
        name="school-source.docx",
        mimeType=openai_assistant.DOCX_MIME_TYPE,
        dataUrl=minimal_docx_data_url(["Question 1 (3 marks)", "Find the equation of the tangent at x=2."]),
        sizeBytes=1200,
    )
    request = openai_assistant.AssistantChatRequest(
        messages=[openai_assistant.AssistantChatMessage(role="user", content="Use these source files.")],
        attachments=[text_attachment, docx_attachment],
    )

    [item] = openai_assistant.input_items(request)

    latest_user_content = item["content"]
    extracted_texts = [
        content["text"]
        for content in latest_user_content
        if content["type"] == "input_text" and content["text"].startswith("Extracted text from")
    ]
    assert any("4 mark probability question" in text for text in extracted_texts)
    assert any("Question 1 (3 marks)" in text and "tangent at x=2" in text for text in extracted_texts)
    assert all("Unsupported attachment type omitted" not in text for text in extracted_texts)


def test_attachment_only_request_creates_user_input_item():
    request = openai_assistant.AssistantChatRequest(
        attachments=[
            openai_assistant.AssistantAttachment(
                name="screenshot.png",
                mimeType="image/png",
                dataUrl="data:image/png;base64,abc",
                sizeBytes=3,
            )
        ],
    )

    items = openai_assistant.input_items(request)

    assert items[0]["role"] == "user"
    assert items[0]["content"][0] == {"type": "input_text", "text": "Use the attached file(s)."}
    assert {"type": "input_image", "image_url": "data:image/png;base64,abc", "detail": "high"} in items[0]["content"]


def test_attachment_requests_select_relevant_brain_files():
    image_files = openai_assistant.brain_files_for_request(
        [openai_assistant.AssistantChatMessage(role="user", content="Make a question from this screenshot.")],
        attachments=[
            openai_assistant.AssistantAttachment(
                name="source.png",
                mimeType="image/png",
                dataUrl="data:image/png;base64,abc",
                sizeBytes=3,
            )
        ],
    )
    pdf_files = openai_assistant.brain_files_for_request(
        [openai_assistant.AssistantChatMessage(role="user", content="Convert the attached page.")],
        attachments=[
            openai_assistant.AssistantAttachment(
                name="exam.pdf",
                mimeType="application/pdf",
                dataUrl="data:application/pdf;base64,JVBERi0x",
                sizeBytes=8,
            )
        ],
    )

    assert "diagram.json" in image_files
    assert {"formatting.json", "diagram.json", "solutions.json"}.issubset(pdf_files)

    docx_files = openai_assistant.brain_files_for_request(
        [openai_assistant.AssistantChatMessage(role="user", content="Create a question from this attached Word file.")],
        attachments=[
            openai_assistant.AssistantAttachment(
                name="source.docx",
                mimeType=openai_assistant.DOCX_MIME_TYPE,
                dataUrl=minimal_docx_data_url(["Question 1", "Differentiate y=x^2."]),
                sizeBytes=800,
            )
        ],
    )
    assert {"formatting.json", "diagram.json", "solutions.json"}.issubset(docx_files)


def test_deterministic_brain_selection_skips_planner_for_source_questions():
    messages = [
        openai_assistant.AssistantChatMessage(
            role="user",
            content=(
                "Create Question 1 from the attached Specialist exam screenshot and official marking-key excerpt. "
                "Preserve the diagram, marks, and include the worked solution."
            ),
        )
    ]
    attachments = [
        openai_assistant.AssistantAttachment(
            name="source.png",
            mimeType="image/png",
            dataUrl="data:image/png;base64,abc",
            sizeBytes=3,
        ),
        openai_assistant.AssistantAttachment(
            name="official-key.txt",
            mimeType="text/plain",
            dataUrl="data:text/plain;base64,U29sdXRpb24=",
            sizeBytes=8,
        ),
    ]

    class FailingPlannerClient:
        async def post(self, *args, **kwargs):  # noqa: ANN002, ANN003
            raise AssertionError("brain planner should not be called for deterministic source-question routing")

    files, usage = asyncio.run(
        openai_assistant.select_brain_files_for_request(
            FailingPlannerClient(),
            messages=messages,
            tool_outputs=None,
            document_summary={"questions": []},
            attachments=attachments,
        )
    )

    assert usage is None
    assert files == ["index.json", "question.json", "diagram.json", "solutions.json"]


def test_deterministic_brain_selection_includes_formatting_for_pdf_source_questions():
    messages = [
        openai_assistant.AssistantChatMessage(
            role="user",
            content="Convert the attached PDF page into Question 1.",
        )
    ]
    attachments = [
        openai_assistant.AssistantAttachment(
            name="exam-page.pdf",
            mimeType="application/pdf",
            dataUrl="data:application/pdf;base64,JVBERi0x",
            sizeBytes=8,
        )
    ]

    ids = openai_assistant.deterministic_brain_ids_for_request(
        messages,
        tool_outputs=None,
        document_summary={"questions": []},
        attachments=attachments,
    )

    assert ids == ["question", "diagram", "formatting"]
    assert openai_assistant.brain_files_from_ids(ids) == [
        "index.json",
        "question.json",
        "diagram.json",
        "formatting.json",
    ]


def test_table_only_source_conversion_skips_diagram_brain_and_schema():
    messages = [
        openai_assistant.AssistantChatMessage(
            role="user",
            content=(
                "Create Question 1 from the attached Specialist exam screenshots and official marking-key excerpt. "
                "Preserve the confidence-interval table, structured parts and subparts, marks, and include the worked solutions."
            ),
        )
    ]
    attachments = [
        openai_assistant.AssistantAttachment(
            name="confidence-intervals.png",
            mimeType="image/png",
            dataUrl="data:image/png;base64,abc",
            sizeBytes=3,
        )
    ]

    ids = openai_assistant.deterministic_brain_ids_for_request(
        messages,
        tool_outputs=None,
        document_summary={"questions": []},
        attachments=attachments,
    )
    tools = openai_assistant.assistant_tool_definitions(
        messages,
        tool_outputs=None,
        attachments=attachments,
        document_summary={"questions": []},
    )
    instructions = openai_assistant.assistant_instructions(
        {"questions": []},
        messages,
        attachments=attachments,
    )

    assert ids == ["question", "solutions"]
    assert [tool["name"] for tool in tools] == ["mauth_convert_source_question"]
    assert "diagram" not in tools[0]["parameters"]["properties"]
    assert "table/text-only source conversion" in instructions
    assert "Native diagram rules:" not in instructions


def test_deterministic_brain_selection_defers_general_chat_to_planner():
    ids = openai_assistant.deterministic_brain_ids_for_request(
        [openai_assistant.AssistantChatMessage(role="user", content="What can this assistant do?")],
        tool_outputs=None,
        document_summary={"questions": [{"id": "q1", "index": 0, "marks": 3}]},
        attachments=None,
    )

    assert ids is None


def test_invalid_tool_arguments_do_not_raise():
    response = {
        "output": [
            {
                "type": "function_call",
                "id": "fc_123",
                "call_id": "call_123",
                "name": "mauth_tool",
                "arguments": "{not json",
            }
        ],
    }

    [call] = openai_assistant.tool_calls(response)

    assert call["mauthToolName"] is None
    assert call["arguments"]["_parseError"] == "Tool arguments were not valid JSON."
    assert call["mauthArguments"]["_parseError"] == "Tool arguments were not valid JSON."
