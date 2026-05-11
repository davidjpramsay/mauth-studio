#!/usr/bin/env python3
"""Run a small live OpenAI eval for the Mauth in-app assistant.

This intentionally tests the provider boundary, not the React UI. It checks
whether a focused teacher request turns into the high-level authoring tool
instead of expensive low-level action loops.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import io
import json
import re
import sys
import zipfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "apps" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.models.schemas import (  # noqa: E402
    AssistantAttachment,
    AssistantChatMessage,
    AssistantChatRequest,
    AssistantToolOutput,
)
from app.services.openai_assistant import (  # noqa: E402
    DOCX_MIME_TYPE,
    assistant_configured,
    create_assistant_response,
)

BAD_CONTROL_CHARACTER_PATTERN = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def sample_document_summary() -> dict[str, Any]:
    return {
        "frontMatter": {"assessmentTitle": "Assistant live eval"},
        "counts": {
            "questions": 1,
            "marksTotal": 0,
            "modules": 0,
            "studentSpaceLines": 0,
            "solutionOnlyModules": 0,
        },
        "questions": [
            {
                "id": "q1",
                "index": 0,
                "marks": 0,
                "pageBreakAfter": False,
                "modules": [],
                "parts": [],
                "studentSpaceLines": 0,
                "solutionModuleCount": 0,
            }
        ],
    }


def sample_circle_document_summary() -> dict[str, Any]:
    summary = sample_document_summary()
    summary["questions"][0]["marks"] = 5
    summary["questions"][0]["modules"] = [
        {
            "id": "q1-question-text",
            "kind": "text",
            "visibility": "always",
            "textPreview": (
                "Points A, B and C lie on a circle. The tangent to the circle at A is drawn. "
                "Prove the angle between the tangent and chord AB is equal to angle ACB."
            ),
        },
        {"id": "q1-student-space", "kind": "space", "visibility": "student", "lines": 12},
    ]
    summary["questions"][0]["studentSpaceLines"] = 12
    return summary


def sample_parallel_chord_circle_document_summary() -> dict[str, Any]:
    summary = sample_document_summary()
    summary["questions"][0]["marks"] = 5
    summary["questions"][0]["modules"] = [
        {
            "id": "q1-question-text",
            "kind": "text",
            "visibility": "always",
            "textPreview": (
                "A, B and C are points on a circle. The tangent to the circle at A is parallel to chord BC. "
                "Prove that AB=AC."
            ),
        },
        {"id": "q1-student-space", "kind": "space", "visibility": "student", "lines": 12},
    ]
    summary["questions"][0]["studentSpaceLines"] = 12
    return summary


def sample_circle_with_diagram_solution_document_summary() -> dict[str, Any]:
    summary = sample_parallel_chord_circle_document_summary()
    summary["questions"][0]["modules"].extend(
        [
            {
                "id": "q1-geometry-diagram",
                "kind": "diagram",
                "visibility": "always",
                "graphType": "geometricConstruction",
                "textPreview": "Penrose circle diagram with tangent at A and chord BC parallel to the tangent.",
            },
            {
                "id": "q1-solution",
                "kind": "text",
                "visibility": "solution",
                "textPreview": (
                    "Solution. Let t be the tangent at A. By the tangent-chord theorem, "
                    "\\angle(t, AB)=\\angle ACB. Since t \\parallel BC, \\angle(t, AB)=\\angle CBA. "
                    "Hence \\angle ACB=\\angle CBA and AB=AC. [[marks:1]] [[marks:1]] [[marks:1]] [[marks:1]] [[marks:1]]"
                ),
            },
        ]
    )
    summary["questions"][0]["solutionModuleCount"] = 1
    return summary


def sample_probability_document_summary() -> dict[str, Any]:
    summary = sample_document_summary()
    summary["questions"][0]["marks"] = 4
    summary["questions"][0]["modules"] = [
        {
            "id": "q1-question-text",
            "kind": "text",
            "visibility": "always",
            "textPreview": "A discrete random variable X has probabilities P(X=x)=k/x for x=2,3,4,5.",
        }
    ]
    return summary


def pdf_bytes_from_text(text: str) -> bytes:
    escaped_text = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    lines = escaped_text.splitlines()
    text_commands = ["BT", "/F1 12 Tf", "50 760 Td"]
    for index, line in enumerate(lines):
        if index:
            text_commands.append("0 -18 Td")
        text_commands.append(f"({line}) Tj")
    text_commands.append("ET")
    stream = "\n".join(text_commands).encode("latin-1", errors="replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    chunks = [b"%PDF-1.4\n"]
    offsets: list[int] = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(sum(len(chunk) for chunk in chunks))
        chunks.append(f"{index} 0 obj\n".encode())
        chunks.append(obj)
        chunks.append(b"\nendobj\n")
    xref_offset = sum(len(chunk) for chunk in chunks)
    chunks.append(f"xref\n0 {len(objects) + 1}\n".encode())
    chunks.append(b"0000000000 65535 f \n")
    for offset in offsets:
        chunks.append(f"{offset:010d} 00000 n \n".encode())
    chunks.append(f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode())
    return b"".join(chunks)


def attachment_pdf_from_text(name: str, text: str) -> AssistantAttachment:
    payload = base64.b64encode(pdf_bytes_from_text(text)).decode("ascii")
    return AssistantAttachment(
        name=name,
        mimeType="application/pdf",
        dataUrl=f"data:application/pdf;base64,{payload}",
        sizeBytes=len(payload),
    )


def sample_probability_pdf_attachment() -> list[AssistantAttachment]:
    return [
        attachment_pdf_from_text(
            "probability-source.pdf",
            "\n".join(
                [
                    "Question 1 (4 marks)",
                    "A discrete random variable X has probability mass function P(X=x)=k/x for x=2,3,4,5.",
                    "(a) Determine k. (2 marks)",
                    "(b) Find E(X). (2 marks)",
                ]
            ),
        )
    ]


def docx_bytes_from_text(lines: list[str]) -> bytes:
    paragraphs = "".join(f"<w:p><w:r><w:t>{line}</w:t></w:r></w:p>" for line in lines)
    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>{paragraphs}</w:body>
</w:document>""".encode()
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", document_xml)
    return buffer.getvalue()


def attachment_docx_from_lines(name: str, lines: list[str]) -> AssistantAttachment:
    payload = base64.b64encode(docx_bytes_from_text(lines)).decode("ascii")
    return AssistantAttachment(
        name=name,
        mimeType=DOCX_MIME_TYPE,
        dataUrl=f"data:{DOCX_MIME_TYPE};base64,{payload}",
        sizeBytes=len(payload),
    )


def sample_docx_attachment() -> list[AssistantAttachment]:
    return [
        attachment_docx_from_lines(
            "school-source.docx",
            [
                "Question 1 (5 marks)",
                "A, B and C are points on a circle. The tangent to the circle at A is drawn.",
                "Prove that the angle between the tangent and chord AB is equal to angle ACB.",
                "Include a clear diagram and worked solution.",
            ],
        )
    ]


def sample_function_graph_document_summary() -> dict[str, Any]:
    summary = sample_document_summary()
    summary["questions"][0]["marks"] = 3
    summary["questions"][0]["modules"] = [
        {
            "id": "q1-question-text",
            "kind": "text",
            "visibility": "always",
            "textPreview": ("Sketch the graph of f(x)=x^2-4 for -3<=x<=3. Label the x-intercepts and y-intercept."),
        },
        {"id": "q1-student-space", "kind": "space", "visibility": "student", "lines": 8},
    ]
    return summary


def sample_set_diagram_document_summary() -> dict[str, Any]:
    summary = sample_document_summary()
    summary["questions"][0]["marks"] = 2
    summary["questions"][0]["modules"] = [
        {
            "id": "q1-question-text",
            "kind": "text",
            "visibility": "always",
            "textPreview": (
                "Draw a Venn diagram for two overlapping sets A and B in the universal set U. "
                "Shade A intersect B complement."
            ),
        },
        {"id": "q1-student-space", "kind": "space", "visibility": "student", "lines": 6},
    ]
    return summary


def sample_stats_chart_document_summary() -> dict[str, Any]:
    summary = sample_document_summary()
    summary["questions"][0]["marks"] = 2
    summary["questions"][0]["modules"] = [
        {
            "id": "q1-question-text",
            "kind": "text",
            "visibility": "always",
            "textPreview": (
                "The values 2,2,2,4,4,4,4,3,4,3,5 are observed. "
                "Draw a column graph with relative frequency on the y-axis."
            ),
        },
        {"id": "q1-student-space", "kind": "space", "visibility": "student", "lines": 6},
    ]
    return summary


def sample_vector2d_document_summary() -> dict[str, Any]:
    summary = sample_document_summary()
    summary["questions"][0]["marks"] = 3
    summary["questions"][0]["modules"] = [
        {
            "id": "q1-question-text",
            "kind": "text",
            "visibility": "always",
            "textPreview": (
                "On a coordinate grid, draw vectors a=(2,3) and b=(4,-3), both starting at the origin. "
                "Label each vector using column-vector notation."
            ),
        },
        {"id": "q1-student-space", "kind": "space", "visibility": "student", "lines": 6},
    ]
    return summary


def hidden_mark_total(text: str) -> int:
    total = 0
    for match in re.finditer(r"\[\[\s*marks\s*:\s*(\d+)\s*\]\]", text, flags=re.IGNORECASE):
        total += int(match.group(1))
    return total


def visible_mark_note_count(text: str) -> int:
    patterns = (
        r"\[\s*\d+\s*marks?\s*\]",
        r"\(\s*\d+\s*marks?\s*\)",
        r"\b\d+\s*marks?\s+for\b",
        r"\bsolution\s*\(\s*\d+\s*marks?\s*\)",
    )
    return sum(len(re.findall(pattern, text, flags=re.IGNORECASE)) for pattern in patterns)


def call_text(call: dict[str, Any]) -> str:
    return json.dumps(call.get("mauthArguments", {}), ensure_ascii=False)


def control_character_issues(text: str, field_name: str) -> list[str]:
    issues: list[str] = []
    for match in BAD_CONTROL_CHARACTER_PATTERN.finditer(text):
        issues.append(f"{field_name} contains control character U+{ord(match.group(0)):04X}")
    return issues


def usage_cost(usage: dict[str, Any] | None) -> float:
    if not isinstance(usage, dict):
        return 0
    value = usage.get("estimatedCostUsd")
    return value if isinstance(value, int | float) else 0


def usage_tokens(usage: dict[str, Any] | None) -> int:
    if not isinstance(usage, dict):
        return 0
    value = usage.get("totalTokens")
    return value if isinstance(value, int) else 0


def as_dict(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if isinstance(value, dict):
        return value
    return {}


def assert_authoring_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != "mauth.author.replaceQuestion":
        issues.append(f"expected mauth.author.replaceQuestion, got {call.get('mauthToolName')!r}")

    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]

    question_text = str(args.get("questionText") or "")
    solution_text = str(args.get("solutionText") or args.get("solution") or "")
    lower_question = question_text.lower()
    lower_solution = solution_text.lower()

    issues.extend(control_character_issues(question_text, "questionText"))
    issues.extend(control_character_issues(solution_text, "solutionText"))
    if args.get("questionNumber") != 1:
        issues.append("questionNumber should be 1")
    if not isinstance(args.get("marks"), int) or args["marks"] < 2:
        issues.append("marks should be an integer of at least 2")
    if not isinstance(args.get("studentSpaceLines"), int) or args["studentSpaceLines"] < 6:
        issues.append("studentSpaceLines should be generous, at least 6")
    if len(question_text) < 120:
        issues.append("questionText is too short to be teacher-ready")
    if len(solution_text) < 120:
        issues.append("solutionText is too short to be a worked solution")
    if "tangent" not in lower_question:
        issues.append("questionText should explicitly involve a tangent")
    if "circle" not in lower_question:
        issues.append("questionText should explicitly involve a circle")
    if "prove" not in lower_question and "show" not in lower_question:
        issues.append("questionText should be an explicit proof/show question")
    if "parallel" in lower_question:
        issues.append(
            "live eval rejected a parallel-line conclusion because the prior model output made an invalid parallel proof"
        )
    if "\\circ" in question_text:
        issues.append("circle proof prompt should be symbolic here, not a numerical angle substitution")
    if any(phrase in lower_solution for phrase in ("does not follow", "cannot be proven", "not enough information")):
        issues.append("solution says the requested proof conclusion does not follow")
    if "therefore" in lower_solution and "different conclusion" in lower_solution:
        issues.append("solution appears to prove a different conclusion from the question target")
    if "ac=bc" in lower_question.replace(" ", "") and "ac=ab" in lower_solution.replace(" ", ""):
        issues.append("solution proves AC=AB while the question asks for AC=BC")
    if (
        "given that" in lower_question
        and "\\angle acb" in lower_question
        and ("prove" in lower_question or "show" in lower_question)
    ):
        issues.append("questionText appears to give an angle fact and then prove from it; use a cleaner theorem target")
    if not any(term in lower_solution for term in ("alternate segment", "tangent", "radius")):
        issues.append("solutionText should use a relevant circle theorem")
    if "placeholder" in lower_question or "placeholder" in lower_solution:
        issues.append("output contains placeholder text")
    if "\\[" in question_text or "\\]" in question_text or "\\[" in solution_text or "\\]" in solution_text:
        issues.append("use $$...$$ display maths, not \\[...\\] delimiters")
    return issues


def diagram_graph_config(args: dict[str, Any]) -> dict[str, Any]:
    diagram = args.get("diagram")
    if isinstance(diagram, dict):
        graph_config = diagram.get("graphConfig", diagram.get("config"))
        if isinstance(graph_config, dict):
            return graph_config
    graph_config = args.get("graphConfig")
    return graph_config if isinstance(graph_config, dict) else {}


def assert_diagram_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != "mauth.author.addDiagram":
        issues.append(f"expected mauth.author.addDiagram, got {call.get('mauthToolName')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]
    if args.get("questionNumber") != 1:
        issues.append("questionNumber should be 1")
    graph_config = diagram_graph_config(args)
    if graph_config.get("type") != "geometricConstruction":
        issues.append("circle theorem diagrams should use a geometricConstruction/Penrose graphConfig")
    substance = str(graph_config.get("options", {}).get("substanceSource", ""))
    if "Tangent(" not in substance or "CircleThrough(" not in substance:
        issues.append("Penrose Substance should include circle and tangent predicates")
    return issues


def assert_parallel_chord_diagram_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != "mauth.author.addDiagram":
        issues.append(f"expected mauth.author.addDiagram, got {call.get('mauthToolName')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]
    if args.get("questionNumber") != 1:
        issues.append("questionNumber should be 1")
    graph_config = diagram_graph_config(args)
    if graph_config.get("type") != "geometricConstruction":
        issues.append("tangent-parallel-chord diagrams should use a geometricConstruction/Penrose graphConfig")
    substance = str(graph_config.get("options", {}).get("substanceSource", ""))
    if "ParallelToSegment(" not in substance:
        issues.append("Penrose Substance should use ParallelToSegment for a tangent parallel to a chord")
    if "Label O $O$" in substance or "Label O" in substance:
        issues.append("auxiliary centre points should not be visibly labelled unless the question names them")
    return issues


def assert_multipart_probability_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != "mauth.author.replaceQuestion":
        issues.append(f"expected mauth.author.replaceQuestion, got {call.get('mauthToolName')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]
    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) < 2:
        issues.append("multipart request should use a structured parts array with at least two parts")
    if "(a)" in str(args.get("questionText") or "").lower():
        issues.append("questionText should not contain typed part labels")
    if parts:
        for index, part in enumerate(parts):
            if not isinstance(part, dict):
                issues.append(f"parts[{index}] should be an object")
                continue
            if not str(part.get("text") or "").strip():
                issues.append(f"parts[{index}].text should be non-empty")
            if not str(part.get("solutionText") or "").strip():
                issues.append(f"parts[{index}].solutionText should be non-empty")
            if not isinstance(part.get("studentSpaceLines"), int) or part["studentSpaceLines"] < 3:
                issues.append(f"parts[{index}].studentSpaceLines should be at least 3")
            if "\\[" in str(part.get("text") or "") or "\\]" in str(part.get("text") or ""):
                issues.append(f"parts[{index}].text should use $$...$$ display maths, not \\[...\\]")
            if "\\[" in str(part.get("solutionText") or "") or "\\]" in str(part.get("solutionText") or ""):
                issues.append(f"parts[{index}].solutionText should use $$...$$ display maths, not \\[...\\]")
    if "\\[" in str(args.get("questionText") or "") or "\\]" in str(args.get("questionText") or ""):
        issues.append("questionText should use $$...$$ display maths, not \\[...\\]")
    return issues


def assert_pdf_attachment_probability_call(call: dict[str, Any]) -> list[str]:
    issues = assert_multipart_probability_call(call)
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return issues
    serialized = json.dumps(args, ensure_ascii=False).lower()
    if "k/x" not in serialized and "\\frac{k}{x}" not in serialized:
        issues.append("attachment-derived question should preserve the P(X=x)=k/x source")
    if "e(x)" not in serialized and "expected" not in serialized:
        issues.append("attachment-derived question should preserve the E(X) part")
    if "2,3,4,5" not in serialized.replace(" ", ""):
        issues.append("attachment-derived question should preserve the source x-values")
    return issues


def assert_docx_attachment_circle_call(call: dict[str, Any]) -> list[str]:
    issues = assert_authoring_call(call)
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return issues
    serialized = json.dumps(args, ensure_ascii=False).lower()
    if "tangent" not in serialized or "circle" not in serialized:
        issues.append("docx-derived question should preserve the circle/tangent source")
    if "ab" not in serialized or "acb" not in serialized:
        issues.append("docx-derived question should preserve the AB/ACB angle proof target")
    if args.get("marks") != 5:
        issues.append("docx-derived question should preserve the 5 mark allocation")
    return issues


def assert_solution_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != "mauth.author.ensureSolutions":
        issues.append(f"expected mauth.author.ensureSolutions, got {call.get('mauthToolName')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]
    questions = args.get("questions")
    if not isinstance(questions, list) or len(questions) != 1:
        issues.append("ensureSolutions should include exactly one question payload")
        return issues
    item = questions[0]
    if not isinstance(item, dict):
        return [*issues, "questions[0] should be an object"]
    if item.get("questionNumber") != 1:
        issues.append("questions[0].questionNumber should be 1")
    solution = str(item.get("solutionText") or "")
    issues.extend(control_character_issues(solution, "solutionText"))
    if len(solution) < 80:
        issues.append("solutionText is too short")
    if not isinstance(item.get("studentSpaceLines"), int) or item["studentSpaceLines"] < 6:
        issues.append("studentSpaceLines should be at least 6")
    if "\\[" in solution or "\\]" in solution:
        issues.append("solutionText should use $$...$$ display maths, not \\[...\\]")
    if visible_mark_note_count(solution):
        issues.append("solutionText should use hidden [[marks:n]] ticks, not visible [1 mark] notes")
    return issues


def assert_mark_edit_preserves_diagram_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != "mauth.author.ensureSolutions":
        issues.append(f"expected mauth.author.ensureSolutions, got {call.get('mauthToolName')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]
    questions = args.get("questions")
    if not isinstance(questions, list) or len(questions) != 1:
        issues.append("ensureSolutions should include exactly one question payload")
        return issues
    item = questions[0]
    if not isinstance(item, dict):
        return [*issues, "questions[0] should be an object"]
    if item.get("questionNumber") != 1:
        issues.append("questions[0].questionNumber should be 1")
    if item.get("marks") != 4:
        issues.append("marks should be updated to exactly 4")
    solution = str(item.get("solutionText") or "")
    issues.extend(control_character_issues(solution, "solutionText"))
    if hidden_mark_total(solution) != 4:
        issues.append("hidden [[marks:n]] total should be exactly 4")
    if visible_mark_note_count(solution):
        issues.append("mark allocation should be hidden [[marks:n]] ticks, not visible [1 mark] notes")
    if not isinstance(item.get("studentSpaceLines"), int) or item["studentSpaceLines"] < 8:
        issues.append("studentSpaceLines should preserve generous space, at least 8")
    serialized = call_text(call).lower()
    if "diagram" in serialized or "graphconfig" in serialized:
        issues.append("focused mark edits should not touch or replace diagrams")
    return issues


def assert_rewrite_preserves_diagram_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != "mauth.author.replaceQuestion":
        issues.append(f"expected mauth.author.replaceQuestion, got {call.get('mauthToolName')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]
    question_text = str(args.get("questionText") or "")
    solution_text = str(args.get("solutionText") or "")
    issues.extend(control_character_issues(question_text, "questionText"))
    issues.extend(control_character_issues(solution_text, "solutionText"))
    if args.get("questionNumber") != 1:
        issues.append("questionNumber should be 1")
    if "diagram" in args and args.get("diagram") in (None, {}, []):
        issues.append("do not send an empty diagram field when preserving an existing diagram")
    if "diagrams" in args and args.get("diagrams") in (None, [], {}):
        issues.append("do not send diagrams: [] when preserving an existing diagram")
    if "tangent" not in question_text.lower() or "circle" not in question_text.lower():
        issues.append("rewritten question should preserve the circle/tangent intent")
    if (
        "proof" not in question_text.lower()
        and "prove" not in question_text.lower()
        and "show" not in question_text.lower()
    ):
        issues.append("rewritten question should remain a proof/show question")
    return issues


def assert_diagram_type_call(
    call: dict[str, Any],
    *,
    expected_type: str,
    required_terms: tuple[str, ...] = (),
    forbidden_types: tuple[str, ...] = (),
) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != "mauth.author.addDiagram":
        issues.append(f"expected mauth.author.addDiagram, got {call.get('mauthToolName')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]
    if args.get("questionNumber") != 1:
        issues.append("questionNumber should be 1")
    graph_config = diagram_graph_config(args)
    graph_type = graph_config.get("type")
    if graph_type != expected_type:
        issues.append(f"expected diagram graphConfig.type {expected_type!r}, got {graph_type!r}")
    if graph_type in forbidden_types:
        issues.append(f"diagram should not use {graph_type!r} for this request")
    serialized = call_text(call).lower()
    for term in required_terms:
        if term.lower() not in serialized:
            issues.append(f"diagram payload should include {term!r}")
    return issues


def assert_graph2d_function_call(call: dict[str, Any]) -> list[str]:
    return assert_diagram_type_call(
        call,
        expected_type="graph2d",
        required_terms=("x", "4"),
        forbidden_types=("geometricConstruction", "statsChart", "vector2d"),
    )


def assert_set_diagram_call(call: dict[str, Any]) -> list[str]:
    return assert_diagram_type_call(
        call,
        expected_type="setDiagram",
        required_terms=("a", "b"),
        forbidden_types=("geometricConstruction", "graph2d", "statsChart"),
    )


def assert_stats_chart_call(call: dict[str, Any]) -> list[str]:
    issues = assert_diagram_type_call(
        call,
        expected_type="statsChart",
        required_terms=("relative",),
        forbidden_types=("graph2d", "setDiagram", "vector2d"),
    )
    serialized = call_text(call).lower()
    if "histogram" not in serialized and "column" not in serialized and "bar" not in serialized:
        issues.append("stats chart payload should indicate a histogram/column/bar style chart")
    return issues


def assert_vector2d_call(call: dict[str, Any]) -> list[str]:
    issues = assert_diagram_type_call(
        call,
        expected_type="vector2d",
        required_terms=("2", "3", "4", "-3"),
        forbidden_types=("vectorRelationship", "geometricConstruction", "graph2d"),
    )
    serialized = call_text(call).lower()
    if "column" not in serialized and "\\begin{pmatrix}" not in serialized and "pmatrix" not in serialized:
        issues.append("vector2d payload should include or imply column-vector labels")
    return issues


EVAL_CASES: dict[str, dict[str, Any]] = {
    "circle-question": {
        "prompt": (
            "Can you write question 1 for me? I would like a circle geometry proof question "
            "involving a tangent to a circle and an angle subtended at the circumference. "
            "Also write the solution for me."
        ),
        "summary": sample_document_summary,
        "assert": assert_authoring_call,
    },
    "circle-diagram": {
        "prompt": "Please add a diagram for the circle tangent proof question in question 1.",
        "summary": sample_circle_document_summary,
        "assert": assert_diagram_call,
    },
    "circle-parallel-diagram": {
        "prompt": "Please add the diagram to question 1 that goes along with the question.",
        "summary": sample_parallel_chord_circle_document_summary,
        "assert": assert_parallel_chord_diagram_call,
    },
    "multipart-probability": {
        "prompt": (
            "Replace question 1 with a two-part probability question about a discrete random variable. "
            "Part a should ask students to determine k and part b should ask for E(X). Include solutions."
        ),
        "summary": sample_probability_document_summary,
        "assert": assert_multipart_probability_call,
    },
    "ensure-solution": {
        "prompt": "Write the worked solution for question 1 and keep enough student answer space.",
        "summary": sample_probability_document_summary,
        "assert": assert_solution_call,
    },
    "mark-edit-preserve-diagram": {
        "prompt": (
            "Reduce Question 1 to 4 marks. The final QED sentence should not receive its own mark. "
            "Keep the existing diagram and only update the solution ticks."
        ),
        "summary": sample_circle_with_diagram_solution_document_summary,
        "assert": assert_mark_edit_preserves_diagram_call,
    },
    "rewrite-preserve-diagram": {
        "prompt": (
            "Rewrite Question 1 to make the wording clearer, but keep the existing diagram exactly as it is. "
            "Keep it as a circle theorem proof question."
        ),
        "summary": sample_circle_with_diagram_solution_document_summary,
        "assert": assert_rewrite_preserves_diagram_call,
    },
    "graph2d-function-diagram": {
        "prompt": "Add the coordinate graph for Question 1.",
        "summary": sample_function_graph_document_summary,
        "assert": assert_graph2d_function_call,
    },
    "set-diagram-routing": {
        "prompt": "Add the Venn diagram for Question 1.",
        "summary": sample_set_diagram_document_summary,
        "assert": assert_set_diagram_call,
    },
    "stats-chart-routing": {
        "prompt": "Add the relative-frequency column graph for Question 1.",
        "summary": sample_stats_chart_document_summary,
        "assert": assert_stats_chart_call,
    },
    "vector2d-routing": {
        "prompt": "Add the coordinate vector diagram for Question 1.",
        "summary": sample_vector2d_document_summary,
        "assert": assert_vector2d_call,
    },
    "pdf-attachment-question": {
        "prompt": "Create Question 1 from the attached PDF. Preserve the parts, marks, and mathematical intent.",
        "summary": sample_document_summary,
        "attachments": sample_probability_pdf_attachment,
        "assert": assert_pdf_attachment_probability_call,
    },
    "docx-attachment-question": {
        "prompt": "Create Question 1 from the attached Word document. Include the worked solution.",
        "summary": sample_document_summary,
        "attachments": sample_docx_attachment,
        "assert": assert_docx_attachment_circle_call,
    },
}

EVAL_GROUPS: dict[str, list[str]] = {
    "core": [
        "circle-question",
        "circle-diagram",
        "mark-edit-preserve-diagram",
        "rewrite-preserve-diagram",
        "multipart-probability",
    ],
    "diagram-routing": [
        "graph2d-function-diagram",
        "set-diagram-routing",
        "stats-chart-routing",
        "vector2d-routing",
    ],
    "all": list(EVAL_CASES),
    "attachments": ["pdf-attachment-question", "docx-attachment-question"],
}


def summarize_call(call: dict[str, Any]) -> dict[str, Any]:
    arguments = call.get("mauthArguments")
    compact_arguments = arguments
    if isinstance(arguments, dict):
        compact_arguments = {}
        for key, value in arguments.items():
            if key == "questions" and isinstance(value, list):
                compact_arguments[key] = [
                    {
                        inner_key: (
                            f"{inner_value[:240]}..."
                            if isinstance(inner_value, str) and len(inner_value) > 240
                            else inner_value
                        )
                        for inner_key, inner_value in item.items()
                    }
                    if isinstance(item, dict)
                    else item
                    for item in value
                ]
            elif isinstance(value, str) and len(value) > 240:
                compact_arguments[key] = f"{value[:240]}..."
            else:
                compact_arguments[key] = value
    return {
        "name": call.get("name"),
        "mauthToolName": call.get("mauthToolName"),
        "mauthArguments": compact_arguments,
    }


async def run_single_eval(
    case_name: str, model: str | None = None, final_message: bool = False, verbose: bool = False
) -> tuple[int, float, int]:
    case = EVAL_CASES[case_name]
    prompt = str(case["prompt"])
    summary = case["summary"]()
    attachments_factory = case.get("attachments")
    attachments = attachments_factory() if callable(attachments_factory) else []
    assert_call = case["assert"]

    print(f"\n=== {case_name} ===")
    first = await create_assistant_response(
        AssistantChatRequest(
            model=model,
            messages=[AssistantChatMessage(role="user", content=prompt)],
            documentSummary=summary,
            attachments=attachments,
        )
    )
    first_calls = [as_dict(call) for call in first.get("toolCalls", [])]
    total_cost = usage_cost(first.get("usage"))
    total_tokens = usage_tokens(first.get("usage"))

    print("First response:")
    if verbose:
        print(
            json.dumps(
                {"message": first.get("message"), "usage": first.get("usage"), "toolCalls": first_calls}, indent=2
            )
        )
    else:
        print(
            json.dumps(
                {
                    "message": first.get("message"),
                    "usage": first.get("usage"),
                    "toolCalls": [summarize_call(call) for call in first_calls],
                },
                indent=2,
            )
        )

    if len(first_calls) != 1:
        print(f"FAIL: expected exactly one tool call, got {len(first_calls)}", file=sys.stderr)
        return 1, total_cost, total_tokens

    issues = assert_call(first_calls[0])
    if issues:
        print("FAIL:")
        for issue in issues:
            print(f"- {issue}")
        return 1, total_cost, total_tokens

    if final_message:
        tool_output = {
            "ok": True,
            "toolName": first_calls[0].get("mauthToolName"),
            "kind": "document",
            "message": "Tool completed.",
            "changedIds": ["q1"],
            "changedPaths": [],
            "warnings": [],
            "committedDocument": True,
        }
        second = await create_assistant_response(
            AssistantChatRequest(
                model=model,
                previousResponseId=first.get("responseId"),
                toolOutputs=[
                    AssistantToolOutput(
                        callId=first_calls[0]["callId"],
                        name=first_calls[0]["name"],
                        output=tool_output,
                    )
                ],
                documentSummary=summary,
            )
        )
        second_calls = [as_dict(call) for call in second.get("toolCalls", [])]
        total_cost += usage_cost(second.get("usage"))
        total_tokens += usage_tokens(second.get("usage"))
        print("Final response:")
        if verbose:
            print(
                json.dumps(
                    {"message": second.get("message"), "usage": second.get("usage"), "toolCalls": second_calls},
                    indent=2,
                )
            )
        else:
            print(
                json.dumps(
                    {
                        "message": second.get("message"),
                        "usage": second.get("usage"),
                        "toolCalls": [summarize_call(call) for call in second_calls],
                    },
                    indent=2,
                )
            )
        if second_calls:
            print("FAIL: final response should not need another tool call.", file=sys.stderr)
            return 1, total_cost, total_tokens
        if not str(second.get("message") or "").strip():
            print("FAIL: final response should contain a teacher-facing summary.", file=sys.stderr)
            return 1, total_cost, total_tokens

    print(f"PASS: {case_name} succeeded. Estimated total: ${total_cost:.4f}, {total_tokens:,} tokens.")
    return 0, total_cost, total_tokens


async def run_eval(
    case_name: str = "circle-question",
    model: str | None = None,
    final_message: bool = False,
    max_cost: float = 1.5,
    stop_on_failure: bool = False,
    verbose: bool = False,
) -> int:
    if not assistant_configured():
        print("OPENAI_API_KEY is not configured; live eval skipped.", file=sys.stderr)
        return 2

    selected_cases = EVAL_GROUPS.get(case_name, [case_name])
    total_cost = 0.0
    total_tokens = 0
    failed = False
    results: list[tuple[str, int, float, int]] = []
    for selected_case in selected_cases:
        if total_cost >= max_cost:
            print(f"\nSTOP: estimated cost cap reached before {selected_case}. Cap: ${max_cost:.2f}.")
            break
        status, cost, tokens = await run_single_eval(
            selected_case, model=model, final_message=final_message, verbose=verbose
        )
        total_cost += cost
        total_tokens += tokens
        results.append((selected_case, status, cost, tokens))
        failed = failed or status != 0
        if failed and stop_on_failure:
            break
    print("\nSUMMARY:")
    for selected_case, status, cost, tokens in results:
        label = "PASS" if status == 0 else "FAIL"
        print(f"- {label} {selected_case}: ${cost:.4f}, {tokens:,} tokens")
    print(f"\nTOTAL: ${total_cost:.4f}, {total_tokens:,} tokens.")
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a live Mauth assistant eval against OpenAI.")
    parser.add_argument("--model", default=None, help="Override OPENAI_MODEL for this eval.")
    parser.add_argument(
        "--case",
        choices=[*EVAL_CASES.keys(), *EVAL_GROUPS.keys()],
        default="circle-question",
        help="Eval case or group to run.",
    )
    parser.add_argument(
        "--final", action="store_true", help="Also test the optional final tool-output continuation call."
    )
    parser.add_argument(
        "--max-cost", type=float, default=1.5, help="Stop before starting another case after this cost."
    )
    parser.add_argument("--stop-on-failure", action="store_true", help="Stop after the first failed case.")
    parser.add_argument("--verbose", action="store_true", help="Print full provider tool payloads.")
    raw_args = sys.argv[1:]
    if raw_args and raw_args[0] == "--":
        raw_args = raw_args[1:]
    args = parser.parse_args(raw_args)
    return asyncio.run(
        run_eval(
            case_name=args.case,
            model=args.model,
            final_message=args.final,
            max_cost=args.max_cost,
            stop_on_failure=args.stop_on_failure,
            verbose=args.verbose,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
