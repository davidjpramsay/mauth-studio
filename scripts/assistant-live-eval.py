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
import contextlib
import io
import json
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import httpx

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
from app.services.penrose import render_penrose_diagram  # noqa: E402

BAD_CONTROL_CHARACTER_PATTERN = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
QUESTION_UPSERT_TOOL_NAME = "mauth.question.upsert"


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


def png_bytes_from_html(html: str, *, width: int = 1400, height: int = 900) -> bytes:
    script = """
const fs = require("fs");
const { chromium } = require("@playwright/test");

const [, htmlPath, outputPath, widthRaw, heightRaw] = process.argv;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: Number(widthRaw), height: Number(heightRaw) },
    deviceScaleFactor: 1,
  });
  await page.setContent(fs.readFileSync(htmlPath, "utf8"), { waitUntil: "load" });
  await page.screenshot({ path: outputPath, type: "png", fullPage: true });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
"""
    with tempfile.TemporaryDirectory(prefix="mauth-assistant-eval-") as tmpdir:
        html_path = Path(tmpdir) / "fixture.html"
        output_path = Path(tmpdir) / "fixture.png"
        html_path.write_text(html, encoding="utf-8")
        result = subprocess.run(
            ["node", "-e", script, str(html_path), str(output_path), str(width), str(height)],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode:
            details = (result.stderr or result.stdout or "unknown Playwright screenshot failure").strip()
            raise RuntimeError(f"Could not render screenshot fixture with Playwright: {details}")
        return output_path.read_bytes()


def attachment_png_from_html(name: str, html: str, *, width: int = 1400, height: int = 900) -> AssistantAttachment:
    image_bytes = png_bytes_from_html(html, width=width, height=height)
    payload = base64.b64encode(image_bytes).decode("ascii")
    return AssistantAttachment(
        name=name,
        mimeType="image/png",
        dataUrl=f"data:image/png;base64,{payload}",
        sizeBytes=len(image_bytes),
    )


def sample_scalar_product_screenshot_attachment() -> list[AssistantAttachment]:
    html = """<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        width: 1400px;
        height: 900px;
        background: white;
        color: black;
        font-family: Arial, Helvetica, sans-serif;
      }
      .page {
        box-sizing: border-box;
        width: 1400px;
        height: 900px;
        padding: 36px 48px;
        position: relative;
      }
      .marks {
        font-size: 31px;
        font-weight: 700;
        margin-bottom: 22px;
      }
      .stem {
        margin-left: 80px;
        font-size: 32px;
        margin-bottom: 42px;
      }
      .part {
        margin-left: 80px;
        font-size: 34px;
        font-weight: 700;
        position: absolute;
      }
      .part .label {
        display: inline-block;
        width: 46px;
        font-weight: 500;
      }
      .p-a { top: 185px; }
      .p-b { top: 455px; }
      .p-c { top: 725px; }
      svg {
        position: absolute;
        left: 720px;
        top: 88px;
        width: 610px;
        height: 650px;
      }
      .diagram-label {
        font-size: 28px;
        font-weight: 700;
      }
      .unit-label {
        font-size: 25px;
        font-weight: 700;
      }
      .angle-label {
        font-size: 26px;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="marks">1. &nbsp; (1, 2, 2 = 5 marks)</div>
      <div class="stem">Evaluate the following scalar products exactly.</div>
      <div class="part p-a"><span class="label">a)</span> a . b</div>
      <div class="part p-b"><span class="label">b)</span> a . d</div>
      <div class="part p-c"><span class="label">c)</span> c . d</div>
      <svg viewBox="0 0 610 650" aria-label="four labelled vectors from a common point">
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="black" />
          </marker>
        </defs>
        <g stroke="black" stroke-width="4" fill="none" marker-end="url(#arrow)">
          <line x1="270" y1="390" x2="80" y2="580" />
          <line x1="270" y1="390" x2="115" y2="150" />
          <line x1="270" y1="390" x2="315" y2="50" />
          <line x1="270" y1="390" x2="535" y2="190" />
        </g>
        <text x="45" y="615" class="diagram-label">a</text>
        <text x="80" y="145" class="diagram-label">b</text>
        <text x="313" y="22" class="diagram-label">c</text>
        <text x="552" y="185" class="diagram-label">d</text>
        <text x="125" y="520" class="unit-label">2 units</text>
        <text x="97" y="275" class="unit-label">2 units</text>
        <text x="324" y="210" class="unit-label">3 units</text>
        <text x="438" y="350" class="unit-label">2 units</text>
        <path d="M 246 352 L 282 325 L 306 363" stroke="black" stroke-width="4" fill="none" />
        <path d="M 285 359 Q 303 341 319 316" stroke="black" stroke-width="4" fill="none" />
        <text x="305" y="363" class="angle-label">45°</text>
      </svg>
    </div>
  </body>
</html>"""
    return [attachment_png_from_html("scalar-product-vectors.png", html)]


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


def sample_linear_intersection_document_summary() -> dict[str, Any]:
    summary = sample_document_summary()
    summary["questions"][0]["marks"] = 4
    summary["questions"][0]["modules"] = [
        {
            "id": "q1-question-text",
            "kind": "text",
            "visibility": "always",
            "textPreview": (
                "Question 1 is already present. The next requested question should be appended as Question 2."
            ),
        },
        {"id": "q1-student-space", "kind": "space", "visibility": "student", "lines": 6},
    ]
    summary["counts"]["questions"] = 1
    summary["counts"]["marksTotal"] = 4
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


def sample_scalar_product_diagram_document_summary() -> dict[str, Any]:
    summary = sample_document_summary()
    summary["questions"][0]["marks"] = 5
    summary["questions"][0]["modules"] = [
        {
            "id": "q1-question-text",
            "kind": "text",
            "visibility": "always",
            "textPreview": (
                "Evaluate the scalar products a dot b, a dot d, and c dot d from the diagram. "
                "The source diagram has four common-origin labelled vectors a, b, c, and d; "
                "|a|=2, |b|=2, |c|=3, |d|=2; a and d lie on the same straight line in opposite "
                "directions; b is perpendicular to d; and the angle between c and d is 45 degrees."
            ),
        },
        {"id": "q1-student-space", "kind": "space", "visibility": "student", "lines": 10},
    ]
    summary["questions"][0]["studentSpaceLines"] = 10
    return summary


def sample_whole_test_solution_document_summary() -> dict[str, Any]:
    return {
        "frontMatter": {"assessmentTitle": "Whole solution confidence eval"},
        "counts": {
            "questions": 2,
            "marksTotal": 5,
            "modules": 6,
            "studentSpaceLines": 12,
            "solutionOnlyModules": 0,
        },
        "questions": [
            {
                "id": "q1",
                "index": 0,
                "marks": 2,
                "pageBreakAfter": False,
                "modules": [
                    {
                        "id": "q1-question-text",
                        "kind": "text",
                        "visibility": "always",
                        "textPreview": "Use the probability column graph to state P(X=4) and explain why it is a valid distribution.",
                    },
                    {
                        "id": "q1-chart",
                        "kind": "diagram",
                        "visibility": "always",
                        "graphType": "statsChart",
                        "textPreview": "Probability column graph with bars for x=1,2,3,4.",
                    },
                    {"id": "q1-student-space", "kind": "space", "visibility": "student", "lines": 6},
                ],
                "parts": [],
                "studentSpaceLines": 6,
                "solutionModuleCount": 0,
            },
            {
                "id": "q2",
                "index": 1,
                "marks": 0,
                "pageBreakAfter": False,
                "modules": [
                    {
                        "id": "q2-question-text",
                        "kind": "text",
                        "visibility": "always",
                        "textPreview": "A discrete random variable X has probability function P(X=x)=k/x for x=2,3,4,5.",
                    }
                ],
                "parts": [
                    {
                        "id": "q2-a",
                        "label": "a",
                        "marks": 2,
                        "textPreview": "Find k.",
                        "modules": [{"id": "q2-a-space", "kind": "space", "visibility": "student", "lines": 4}],
                        "studentSpaceLines": 4,
                        "subparts": [],
                    },
                    {
                        "id": "q2-b",
                        "label": "b",
                        "marks": 1,
                        "textPreview": "Find E(X).",
                        "modules": [{"id": "q2-b-space", "kind": "space", "visibility": "student", "lines": 4}],
                        "studentSpaceLines": 4,
                        "subparts": [],
                    },
                ],
                "studentSpaceLines": 8,
                "solutionModuleCount": 0,
            },
        ],
    }


def sample_layout_problem_document_summary() -> dict[str, Any]:
    return {
        "frontMatter": {"assessmentTitle": "Layout confidence eval"},
        "counts": {
            "questions": 2,
            "marksTotal": 5,
            "modules": 5,
            "studentSpaceLines": 8,
            "solutionOnlyModules": 1,
        },
        "questions": [
            {
                "id": "q1",
                "index": 0,
                "marks": 2,
                "pageBreakAfter": False,
                "modules": [
                    {"id": "q1-text", "kind": "text", "visibility": "always", "textPreview": "Find x."},
                    {
                        "id": "q1-solution",
                        "kind": "text",
                        "visibility": "solution",
                        "textPreview": "Solution. x=3. [[marks:2]]",
                    },
                ],
                "parts": [],
                "studentSpaceLines": 0,
                "solutionModuleCount": 1,
            },
            {
                "id": "q2",
                "index": 1,
                "marks": 3,
                "pageBreakAfter": False,
                "modules": [
                    {
                        "id": "q2-text",
                        "kind": "text",
                        "visibility": "always",
                        "textPreview": "Use the oversized graph.",
                    },
                    {
                        "id": "q2-graph",
                        "kind": "diagram",
                        "visibility": "always",
                        "graphType": "graph2d",
                        "textPreview": "Oversized coordinate graph occupying most of the printed page.",
                    },
                    {"id": "q2-space", "kind": "space", "visibility": "student", "lines": 8},
                ],
                "parts": [],
                "studentSpaceLines": 8,
                "solutionModuleCount": 0,
            },
        ],
    }


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
    if call.get("mauthToolName") != QUESTION_UPSERT_TOOL_NAME:
        issues.append(f"expected {QUESTION_UPSERT_TOOL_NAME}, got {call.get('mauthToolName')!r}")

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
        if isinstance(diagram.get("type"), str):
            return diagram
    diagrams = args.get("diagrams")
    if isinstance(diagrams, list):
        for diagram_item in diagrams:
            if not isinstance(diagram_item, dict):
                continue
            graph_config = diagram_item.get("graphConfig", diagram_item.get("config"))
            if isinstance(graph_config, dict):
                return graph_config
            if isinstance(diagram_item.get("type"), str):
                return diagram_item
    graph_config = args.get("graphConfig")
    return graph_config if isinstance(graph_config, dict) else {}


def compact_math_text(text: str) -> str:
    compact = re.sub(r"\s+", "", text.lower())
    replacements = {
        "\\cdot": ".",
        "·": ".",
        "\\mathbf": "",
        "\\boldsymbol": "",
        "\\vec": "",
        "{": "",
        "}": "",
        "$": "",
    }
    for source, replacement in replacements.items():
        compact = compact.replace(source, replacement)
    return compact


def part_math_text(part: dict[str, Any]) -> str:
    text = str(part.get("text") or part.get("questionText") or "")
    return compact_math_text(text)


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


def assert_multipart_probability_call(call: dict[str, Any], *, require_solutions: bool = True) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != QUESTION_UPSERT_TOOL_NAME:
        issues.append(f"expected {QUESTION_UPSERT_TOOL_NAME}, got {call.get('mauthToolName')!r}")
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
            solution_text = str(part.get("solutionText") or "").strip()
            if require_solutions and not solution_text:
                issues.append(f"parts[{index}].solutionText should be non-empty")
            if not require_solutions and (solution_text or part.get("includeSolution") is True):
                issues.append(f"parts[{index}] should not include a solution unless the source/request asks for one")
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
    issues = assert_multipart_probability_call(call, require_solutions=False)
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
    graph_config = diagram_graph_config(args)
    if graph_config.get("type") == "geometricConstruction":
        substance = str(graph_config.get("options", {}).get("substanceSource") or "")
        if "Connect(" in substance or "Collinear(" in substance:
            issues.append(
                "Penrose Substance should use native Segment/VectorSegment/LineThrough patterns, not Connect or Collinear"
            )
        try:
            render_penrose_diagram(
                {
                    **graph_config,
                    "style": graph_config.get("style") or "geometry",
                    "options": {
                        "penrosePreset": "geometry",
                        "scalePercent": 100,
                        **(graph_config.get("options") if isinstance(graph_config.get("options"), dict) else {}),
                    },
                }
            )
        except Exception as exc:
            issues.append(f"docx-derived geometricConstruction should render through Penrose: {exc}")
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
    if call.get("mauthToolName") != QUESTION_UPSERT_TOOL_NAME:
        issues.append(f"expected {QUESTION_UPSERT_TOOL_NAME}, got {call.get('mauthToolName')!r}")
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


def assert_scalar_product_add_diagram_call(call: dict[str, Any]) -> list[str]:
    issues = assert_diagram_type_call(
        call,
        expected_type="geometricConstruction",
        required_terms=("a", "b", "c", "d", "45"),
        forbidden_types=("vectorRelationship", "vector2d", "graph2d"),
    )
    graph_config = diagram_graph_config(
        call.get("mauthArguments") if isinstance(call.get("mauthArguments"), dict) else {}
    )
    substance = str(graph_config.get("options", {}).get("substanceSource") or "")
    if "LabelSegment(" in substance or "\nRay(" in substance:
        issues.append(
            "Penrose Substance should use supported predicates such as VectorSegment/RayFrom and LabelsSegment"
        )
    if re.search(r"^\s*VectorSegment\s+\S+", substance, re.MULTILINE):
        issues.append("Penrose Substance should call VectorSegment(OA, O, A), not `VectorSegment OA O A`")
    if re.search(r"^\s*Segment\s+\S+\s+\S+\s+\S+", substance, re.MULTILINE):
        issues.append("Penrose Substance should call Segment(AB, A, B), not `Segment AB A B`")
    if re.search(r"\bLabelsAngle\s*\([^)]*\$", substance):
        issues.append("Penrose Substance should declare a Label then call LabelsAngle(labelName, A, B, C)")
    if "SegmentLength(" in substance:
        issues.append(
            "Penrose Substance should not invent unsupported SegmentLength predicates; use LabelsSegment for lengths"
        )
    if "Collinear(" in substance or "Connect(" in substance:
        issues.append("Penrose Substance should not invent unsupported Collinear or Connect predicates")
    compact_substance = compact_math_text(substance)
    if "rightangle(" not in compact_substance and "90" not in compact_substance:
        issues.append("scalar-product diagram should preserve the right-angle marker")
    if graph_config.get("type") == "geometricConstruction":
        try:
            render_penrose_diagram(
                {
                    **graph_config,
                    "style": graph_config.get("style") or "geometry",
                    "options": {
                        "penrosePreset": "geometry",
                        "scalePercent": 100,
                        **(graph_config.get("options") if isinstance(graph_config.get("options"), dict) else {}),
                    },
                }
            )
        except Exception as exc:
            issues.append(f"geometricConstruction graphConfig should render through Penrose: {exc}")
    return issues


def assert_screenshot_scalar_products_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != QUESTION_UPSERT_TOOL_NAME:
        issues.append(f"expected {QUESTION_UPSERT_TOOL_NAME}, got {call.get('mauthToolName')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]

    if args.get("questionNumber") != 1:
        issues.append("questionNumber should be 1")
    if args.get("includeSolution") is True:
        issues.append("do not set includeSolution true when the screenshot prompt did not ask for solutions")
    if str(args.get("solutionText") or "").strip():
        issues.append("do not include question-level solutionText when the screenshot prompt did not ask for solutions")
    question_text = str(args.get("questionText") or "")
    if "scalar product" not in question_text.lower():
        issues.append("questionText should preserve the scalar-products stem")
    if "diagram shows" in question_text.lower():
        issues.append("source diagram should be recreated as a native diagram, not moved into prose")

    graph_config = diagram_graph_config(args)
    graph_type = graph_config.get("type")
    if graph_type != "geometricConstruction":
        issues.append(f"screenshot ray/vector source should use geometricConstruction, got {graph_type!r}")
    diagrams = args.get("diagrams")
    if isinstance(diagrams, list) and any(
        isinstance(item, dict) and "type" in item and "graphConfig" not in item for item in diagrams
    ):
        issues.append("diagram items should be wrapped as { graphConfig: ... }, not top-level { type, data }")
    serialized_diagram = json.dumps(graph_config, ensure_ascii=False).lower()
    for term in ("a", "b", "c", "d", "45"):
        if term not in serialized_diagram:
            issues.append(f"native diagram should preserve visible diagram label/value {term!r}")
    if graph_type == "image" or "data:image" in serialized_diagram:
        issues.append("do not paste the screenshot back as an image; recreate an editable native diagram")
    substance = str(graph_config.get("options", {}).get("substanceSource") or "")
    if "LabelSegment(" in substance or "\nRay(" in substance:
        issues.append(
            "Penrose Substance should use supported predicates such as VectorSegment/RayFrom and LabelsSegment"
        )
    if re.search(r"^\s*VectorSegment\s+\S+", substance, re.MULTILINE):
        issues.append("Penrose Substance should call VectorSegment(OA, O, A), not `VectorSegment OA O A`")
    if re.search(r"^\s*Segment\s+\S+\s+\S+\s+\S+", substance, re.MULTILINE):
        issues.append("Penrose Substance should call Segment(AB, A, B), not `Segment AB A B`")
    if re.search(r"\bLabelsAngle\s*\([^)]*\$", substance):
        issues.append("Penrose Substance should declare a Label then call LabelsAngle(labelName, A, B, C)")
    compact_substance = compact_math_text(substance)
    if "linethrough(" not in compact_substance or "on(o," not in compact_substance:
        issues.append("scalar-product diagram should preserve the opposite collinear a and d rays")
    valid_right_angle_terms = ("rightangle(", "90")
    if not any(term in compact_substance for term in valid_right_angle_terms):
        issues.append("native diagram should preserve the visible right-angle marker")
    if "SegmentLength(" in substance:
        issues.append(
            "Penrose Substance should not invent unsupported SegmentLength predicates; use LabelsSegment for lengths"
        )
    if "Collinear(" in substance or "Connect(" in substance:
        issues.append("Penrose Substance should not invent unsupported Collinear or Connect predicates")
    if graph_type == "geometricConstruction":
        try:
            render_penrose_diagram(
                {
                    **graph_config,
                    "style": graph_config.get("style") or "geometry",
                    "options": {
                        "penrosePreset": "geometry",
                        "scalePercent": 100,
                        **(graph_config.get("options") if isinstance(graph_config.get("options"), dict) else {}),
                    },
                }
            )
        except Exception as exc:
            issues.append(f"geometricConstruction graphConfig should render through Penrose: {exc}")

    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) != 3:
        issues.append("screenshot source should become exactly three structured parts")
        return issues

    expected_marks = [1, 2, 2]
    expected_terms = [("a", "b"), ("a", "d"), ("c", "d")]
    for index, part in enumerate(parts):
        if not isinstance(part, dict):
            issues.append(f"parts[{index}] should be an object")
            continue
        if part.get("marks") != expected_marks[index]:
            issues.append(f"parts[{index}].marks should be {expected_marks[index]}")
        if str(part.get("solutionText") or "").strip() or part.get("includeSolution") is True:
            issues.append(f"parts[{index}] should not include a solution unless the prompt asks for one")
        if not isinstance(part.get("studentSpaceLines"), int) or part["studentSpaceLines"] < 3:
            issues.append(f"parts[{index}].studentSpaceLines should be at least 3")
        text = part_math_text(part)
        first, second = expected_terms[index]
        if first not in text or second not in text or "." not in text:
            issues.append(f"parts[{index}].text should preserve {first} · {second}")
        if str(part.get("text") or "").strip().lower() in {"a", "b", "c", "(a)", "(b)", "(c)"}:
            issues.append(f"parts[{index}].text should contain the visible scalar product, not just the label")

    if args.get("marks") not in (0, 5, None):
        issues.append("question-level marks should be omitted/0 or 5 when part marks total 5")
    if sum(part.get("marks", 0) for part in parts if isinstance(part, dict)) != 5:
        issues.append("structured part marks should total 5")
    return issues


def graph2d_function_expressions(graph_config: dict[str, Any]) -> list[str]:
    functions = graph_config.get("functions")
    if isinstance(functions, list):
        expressions = [
            str(item.get("expression") or "").strip()
            for item in functions
            if isinstance(item, dict) and item.get("show") is not False and str(item.get("expression") or "").strip()
        ]
        if expressions:
            return expressions
    expression = str(graph_config.get("expression") or "").strip()
    return [expression] if expression else []


def expression_looks_linear(expression: str) -> bool:
    compact = expression.replace(" ", "").lower()
    nonlinear_patterns = (
        "x^2",
        "x**2",
        "x*x",
        "sin",
        "cos",
        "tan",
        "sqrt",
        "log",
        "ln",
        "exp",
        "1/x",
        "/x",
    )
    return bool(compact) and not any(pattern in compact for pattern in nonlinear_patterns)


def assert_linear_intersection_question_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != QUESTION_UPSERT_TOOL_NAME:
        issues.append(f"expected {QUESTION_UPSERT_TOOL_NAME}, got {call.get('mauthToolName')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]
    if args.get("questionNumber") != 2:
        issues.append("questionNumber should be 2 so the next missing question is appended")
    if not isinstance(args.get("marks"), int) or args["marks"] < 3:
        issues.append("linear intersection question should have a sensible mark allocation")
    question_text = str(args.get("questionText") or "")
    lower_question = question_text.lower()
    issues.extend(control_character_issues(question_text, "questionText"))
    if "linear" not in lower_question and "straight line" not in lower_question:
        issues.append("questionText should clearly be a linear/straight-line question")
    if "intersection" not in lower_question and "simultaneous" not in lower_question:
        issues.append("questionText should ask for the point of intersection or simultaneous solution")
    graph_config = diagram_graph_config(args)
    if graph_config.get("type") != "graph2d":
        issues.append(
            f"linear intersection question should include a graph2d diagram, got {graph_config.get('type')!r}"
        )
        return issues
    expressions = graph2d_function_expressions(graph_config)
    if len(expressions) < 2:
        issues.append("graph2d diagram should include at least two visible line functions")
    nonlinear = [expression for expression in expressions if not expression_looks_linear(expression)]
    if nonlinear:
        issues.append(f"graph2d diagram should use straight-line expressions only, got nonlinear {nonlinear!r}")
    serialized = call_text(call).lower()
    if "x^2" in serialized or "parabola" in serialized or "quadratic" in serialized:
        issues.append("linear intersection request should not produce a quadratic/parabola diagram")
    return issues


def collect_solution_texts(value: Any) -> list[str]:
    texts: list[str] = []
    if isinstance(value, dict):
        for key, inner_value in value.items():
            if key == "solutionText" and isinstance(inner_value, str) and inner_value.strip():
                texts.append(inner_value)
            else:
                texts.extend(collect_solution_texts(inner_value))
    elif isinstance(value, list):
        for item in value:
            texts.extend(collect_solution_texts(item))
    return texts


def assert_write_all_solutions_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != "mauth.solutions.writeAll":
        issues.append(f"expected mauth.solutions.writeAll, got {call.get('mauthToolName')!r}")
    if call.get("name") != "mauth_write_all_solutions":
        issues.append(f"expected provider alias mauth_write_all_solutions, got {call.get('name')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]

    questions = args.get("questions")
    if not isinstance(questions, list) or len(questions) != 2:
        issues.append("writeAll should cover both marked questions in one questions array")
        return issues

    serialized = call_text(call).lower()
    if "diagram" in serialized and ("remove" in serialized or "delete" in serialized):
        issues.append("whole-test solution writing must preserve diagrams, not remove/delete them")
    if "diagrams" in args and args.get("diagrams") in ([], None, {}):
        issues.append("writeAll should not send empty diagrams fields")

    question_numbers = {
        item.get("questionNumber") for item in questions if isinstance(item, dict) and item.get("questionNumber")
    }
    if question_numbers != {1, 2}:
        issues.append(f"writeAll should target question numbers 1 and 2, got {sorted(question_numbers)!r}")

    solution_texts = collect_solution_texts(args)
    if len(solution_texts) < 3:
        issues.append("writeAll should include solution text for q1 and both marked parts of q2")
    hidden_total = sum(hidden_mark_total(text) for text in solution_texts)
    if hidden_total != 5:
        issues.append(f"hidden [[marks:n]] annotations should total 5, got {hidden_total}")
    for index, solution in enumerate(solution_texts):
        issues.extend(control_character_issues(solution, f"solutionText[{index}]"))
        if visible_mark_note_count(solution):
            issues.append(f"solutionText[{index}] should use hidden [[marks:n]] ticks, not visible mark notes")
        if len(solution.strip()) < 20:
            issues.append(f"solutionText[{index}] is too short to be teacher-ready")

    for item in questions:
        if not isinstance(item, dict):
            continue
        if item.get("questionNumber") == 1 and not isinstance(item.get("studentSpaceLines"), int):
            issues.append("free-response q1 should include studentSpaceLines so solution and student copies match")
        if item.get("questionNumber") == 2:
            parts = item.get("parts")
            if not isinstance(parts, list) or len(parts) != 2:
                issues.append("q2 should include both part solutions")
            elif any(not isinstance(part.get("studentSpaceLines"), int) for part in parts if isinstance(part, dict)):
                issues.append("part solution payloads should keep or size matching student spaces")
    return issues


def assert_layout_check_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != "mauth.layout.check":
        issues.append(f"expected mauth.layout.check, got {call.get('mauthToolName')!r}")
    if call.get("name") != "mauth_check_document_layout":
        issues.append(f"expected provider alias mauth_check_document_layout, got {call.get('name')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]
    mode = args.get("mode")
    if mode not in ("student", "solutions", "both"):
        issues.append(f"layout check mode should be student, solutions, or both; got {mode!r}")
    return issues


def assert_layout_repair_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    valid_tools = {
        "mauth.format.apply",
        "mauth.author.adjustResponseSpaces",
        "mauth.author.ensureSolutions",
        "mauth.solutions.writeAll",
        "mauth.author.addDiagram",
    }
    if call.get("mauthToolName") not in valid_tools:
        issues.append(
            f"layout warnings should be repaired with a focused high-level tool, got {call.get('mauthToolName')!r}"
        )
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]
    serialized = call_text(call).lower()
    if "low-level" in serialized or "raw json" in serialized:
        issues.append("layout repair should use native high-level Mauth tools, not raw low-level JSON")
    if call.get("mauthToolName") == "mauth.format.apply":
        operations = args.get("operations")
        if not isinstance(operations, list) or not operations:
            issues.append("format repair should contain at least one operation")
    if call.get("mauthToolName") == "mauth.author.adjustResponseSpaces":
        targets = args.get("targets")
        if not isinstance(targets, list) or not targets:
            issues.append("response-space repair should contain at least one target")
    return issues


def layout_warning_output() -> dict[str, Any]:
    return {
        "ok": True,
        "toolName": "mauth.layout.check",
        "kind": "document",
        "message": "Layout check found repairable issues.",
        "data": {
            "mode": "both",
            "ok": False,
            "issues": [
                {
                    "code": "student-answer-surface-missing",
                    "severity": "warning",
                    "anchor": "q1",
                    "targetId": "q1",
                    "message": "Question 1 has a solution but no matching student answer surface.",
                    "repair": "Add or resize a student-only answer space for Question 1.",
                },
                {
                    "code": "solution-missing",
                    "severity": "warning",
                    "anchor": "q2",
                    "targetId": "q2",
                    "message": "Question 2 is marked but has no solution.",
                    "repair": "Write a concise solution for Question 2 with hidden [[marks:n]] ticks.",
                },
                {
                    "code": "diagram-oversized-print-risk",
                    "severity": "warning",
                    "anchor": "q2-graph",
                    "targetId": "q2-graph",
                    "message": "The Question 2 diagram is oversized for print.",
                    "repair": "Reduce the diagram size or adjust its layout.",
                },
            ],
        },
        "warnings": [
            {"code": "student-answer-surface-missing", "message": "Question 1 needs a student answer surface."},
            {"code": "solution-missing", "message": "Question 2 needs a solution."},
            {"code": "diagram-oversized-print-risk", "message": "Question 2 diagram is oversized."},
        ],
        "changedIds": [],
        "changedPaths": [],
        "committedDocument": False,
    }


def validation_failure_output(
    *,
    tool_name: str | None,
    validation_issues: list[dict[str, Any]],
    message: str = "Mauth action validation failed.",
) -> dict[str, Any]:
    return {
        "ok": False,
        "toolName": tool_name,
        "kind": "document",
        "message": message,
        "error": message,
        "validationIssues": validation_issues,
        "warnings": [{"code": "assistant-tool-not-applied", "message": message}],
        "changedIds": [],
        "changedPaths": [],
        "committedDocument": False,
    }


def wrong_renderer_failure_output(call: dict[str, Any], *, actual: str, expected: str, reason: str) -> dict[str, Any]:
    return validation_failure_output(
        tool_name=call.get("mauthToolName"),
        validation_issues=[
            {
                "path": "arguments.diagram.graphConfig.type",
                "message": f"{reason} Use graphConfig.type {expected!r}, not {actual!r}.",
                "actual": actual,
                "expected": expected,
            }
        ],
    )


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
    "linear-intersection-question": {
        "prompt": "Make me a Year 9 linear equations point-of-intersection question with a diagram for Question 2.",
        "summary": sample_linear_intersection_document_summary,
        "assert": assert_linear_intersection_question_call,
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
    "screenshot-scalar-products": {
        "prompt": (
            "Can you make question 1 from the attached screenshot. Write the question with the diagram entered "
            "underneath and then put the parts under the diagram."
        ),
        "summary": sample_document_summary,
        "attachments": sample_scalar_product_screenshot_attachment,
        "assert": assert_screenshot_scalar_products_call,
    },
    "repair-circle-diagram": {
        "prompt": "Please add the diagram to question 1 that goes along with the question.",
        "summary": sample_parallel_chord_circle_document_summary,
        "assert": assert_parallel_chord_diagram_call,
        "repairFailure": lambda call: wrong_renderer_failure_output(
            call,
            actual="graph2d",
            expected="geometricConstruction",
            reason=(
                "This is a schematic circle theorem diagram with a tangent and chord, not a coordinate function graph."
            ),
        ),
        "repairAssert": assert_parallel_chord_diagram_call,
    },
    "repair-scalar-product-diagram": {
        "prompt": "Add the native diagram for Question 1.",
        "summary": sample_scalar_product_diagram_document_summary,
        "assert": assert_scalar_product_add_diagram_call,
        "repairFailure": lambda call: wrong_renderer_failure_output(
            call,
            actual="vectorRelationship",
            expected="geometricConstruction",
            reason=("This is a scalar-product ray diagram with magnitudes and angle markers, not a network diagram."),
        ),
        "repairAssert": assert_scalar_product_add_diagram_call,
    },
    "write-all-solutions-confidence": {
        "prompt": (
            "Write the full solutions marking key for the whole test. Preserve existing diagrams, use hidden "
            "mark ticks, and make sure the student spaces still match the solution copy."
        ),
        "summary": sample_whole_test_solution_document_summary,
        "assert": assert_write_all_solutions_call,
    },
    "layout-check-confidence": {
        "prompt": (
            "Check the whole document layout before printing. Look for missing answer spaces, missing solutions, "
            "solution-space mismatch, oversized diagrams, weird blank pages, and print risks."
        ),
        "summary": sample_layout_problem_document_summary,
        "assert": assert_layout_check_call,
    },
    "layout-repair-confidence": {
        "prompt": "Check the whole document layout, then repair the obvious issues before telling me it is done.",
        "summary": sample_layout_problem_document_summary,
        "assert": assert_layout_check_call,
        "assertFirstBeforeRepair": True,
        "repairFailure": lambda call: layout_warning_output(),
        "repairAssert": assert_layout_repair_call,
    },
}

EVAL_GROUPS: dict[str, list[str]] = {
    "core": [
        "circle-question",
        "circle-diagram",
        "mark-edit-preserve-diagram",
        "rewrite-preserve-diagram",
        "multipart-probability",
        "linear-intersection-question",
    ],
    "diagram-routing": [
        "graph2d-function-diagram",
        "set-diagram-routing",
        "stats-chart-routing",
        "vector2d-routing",
    ],
    "repair": ["repair-circle-diagram", "repair-scalar-product-diagram"],
    "confidence": [
        "write-all-solutions-confidence",
        "layout-check-confidence",
        "layout-repair-confidence",
    ],
    "all": list(EVAL_CASES),
    "attachments": ["pdf-attachment-question", "docx-attachment-question", "screenshot-scalar-products"],
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


def print_provider_response(
    label: str, response: dict[str, Any], calls: list[dict[str, Any]], *, verbose: bool = False
) -> None:
    print(f"{label}:")
    if verbose:
        print(
            json.dumps(
                {"message": response.get("message"), "usage": response.get("usage"), "toolCalls": calls},
                indent=2,
            )
        )
        return
    print(
        json.dumps(
            {
                "message": response.get("message"),
                "usage": response.get("usage"),
                "toolCalls": [summarize_call(call) for call in calls],
            },
            indent=2,
        )
    )


def provider_error_message(error: httpx.HTTPError) -> str:
    if isinstance(error, httpx.HTTPStatusError):
        status = error.response.status_code
        detail = error.response.text
        with contextlib.suppress(Exception):
            payload = error.response.json()
            if isinstance(payload, dict):
                detail_value = payload.get("error") or payload.get("detail")
                if isinstance(detail_value, dict):
                    detail = str(detail_value.get("message") or detail_value)
                elif detail_value:
                    detail = str(detail_value)
        trimmed = detail.strip()
        return f"BLOCKED: assistant provider returned HTTP {status}: {trimmed}"
    if isinstance(error, httpx.TimeoutException):
        return f"BLOCKED: assistant provider request timed out: {error.__class__.__name__}"
    return f"BLOCKED: assistant provider request failed: {error}"


async def safe_create_assistant_response(request: AssistantChatRequest) -> tuple[dict[str, Any] | None, str | None]:
    try:
        return await create_assistant_response(request), None
    except httpx.HTTPError as error:
        return None, provider_error_message(error)


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
    first, provider_error = await safe_create_assistant_response(
        AssistantChatRequest(
            model=model,
            messages=[AssistantChatMessage(role="user", content=prompt)],
            documentSummary=summary,
            attachments=attachments,
        )
    )
    if provider_error or first is None:
        print(provider_error or "BLOCKED: assistant provider returned no response.", file=sys.stderr)
        return 2, 0.0, 0
    first_calls = [as_dict(call) for call in first.get("toolCalls", [])]
    total_cost = usage_cost(first.get("usage"))
    total_tokens = usage_tokens(first.get("usage"))

    print_provider_response("First response", first, first_calls, verbose=verbose)

    if len(first_calls) != 1:
        print(f"FAIL: expected exactly one tool call, got {len(first_calls)}", file=sys.stderr)
        return 1, total_cost, total_tokens

    repair_failure = case.get("repairFailure")
    if callable(repair_failure):
        if case.get("assertFirstBeforeRepair"):
            first_issues = assert_call(first_calls[0])
            if first_issues:
                print("FAIL:")
                for issue in first_issues:
                    print(f"- {issue}")
                return 1, total_cost, total_tokens
        tool_output = repair_failure(first_calls[0])
        second, provider_error = await safe_create_assistant_response(
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
        if provider_error or second is None:
            print(provider_error or "BLOCKED: assistant provider returned no repair response.", file=sys.stderr)
            return 2, total_cost, total_tokens
        second_calls = [as_dict(call) for call in second.get("toolCalls", [])]
        total_cost += usage_cost(second.get("usage"))
        total_tokens += usage_tokens(second.get("usage"))
        print_provider_response("Repair response", second, second_calls, verbose=verbose)

        if len(second_calls) != 1:
            print(f"FAIL: expected exactly one repair tool call, got {len(second_calls)}", file=sys.stderr)
            return 1, total_cost, total_tokens

        repair_assert = case.get("repairAssert", assert_call)
        repair_issues = repair_assert(second_calls[0])
        if repair_issues:
            print("FAIL:")
            for issue in repair_issues:
                print(f"- {issue}")
            return 1, total_cost, total_tokens

        print(f"PASS: {case_name} repaired successfully. Estimated total: ${total_cost:.4f}, {total_tokens:,} tokens.")
        return 0, total_cost, total_tokens

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
        second, provider_error = await safe_create_assistant_response(
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
        if provider_error or second is None:
            print(provider_error or "BLOCKED: assistant provider returned no final response.", file=sys.stderr)
            return 2, total_cost, total_tokens
        second_calls = [as_dict(call) for call in second.get("toolCalls", [])]
        total_cost += usage_cost(second.get("usage"))
        total_tokens += usage_tokens(second.get("usage"))
        print_provider_response("Final response", second, second_calls, verbose=verbose)
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
    blocked = False
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
        failed = failed or status == 1
        blocked = blocked or status == 2
        if status == 2:
            print("\nSTOP: provider blocked the live eval; remaining cases were skipped.")
            break
        if failed and stop_on_failure:
            break
    print("\nSUMMARY:")
    for selected_case, status, cost, tokens in results:
        label = "PASS" if status == 0 else "BLOCKED" if status == 2 else "FAIL"
        print(f"- {label} {selected_case}: ${cost:.4f}, {tokens:,} tokens")
    print(f"\nTOTAL: ${total_cost:.4f}, {total_tokens:,} tokens.")
    if failed:
        return 1
    return 2 if blocked else 0


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
