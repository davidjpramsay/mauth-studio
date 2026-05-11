import json

from fastapi.testclient import TestClient

from app.main import app
from app.services import openai_assistant

client = TestClient(app)


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
    assert call["mauthArguments"] == arguments


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
    assert call["mauthArguments"] == arguments


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

    assert "mauth_author_ensure_solutions" in instructions
    assert "Do not call mauth.document.inspect first" in instructions
    assert "[[marks:n]]" in instructions
    assert "hidden mark total match" in instructions
    assert "[1 mark]" in instructions


def test_focused_circle_diagram_prompt_gets_penrose_renderer_hint():
    instructions = openai_assistant.assistant_instructions(
        {"questions": [{"id": "q1", "index": 0, "modules": []}]},
        [
            openai_assistant.AssistantChatMessage(
                role="user", content="Add a diagram for the circle tangent in question 1."
            )
        ],
    )

    assert "mauth_author_add_diagram" in instructions
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

    assert [tool["name"] for tool in tools] == ["mauth_author_add_diagram"]


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

    assert "mauth_author_add_diagram" in instructions
    assert 'graphConfig.type="geometricConstruction"' in instructions
    assert "ParallelToSegment" in instructions
    assert "supported Substance is the normal AI geometry path" in instructions
    assert "HidePoint(centre)" in instructions
    assert "circleTangentParallelChord" not in instructions


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
