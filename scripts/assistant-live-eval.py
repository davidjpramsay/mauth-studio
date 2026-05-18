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
WORKBENCH_ROOT = ROOT.parent / "mauth-workbench"
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


def workbench_fixture(*parts: str) -> Path:
    path = WORKBENCH_ROOT.joinpath(*parts)
    if not path.exists():
        raise FileNotFoundError(f"Missing assistant live-eval fixture: {path}")
    return path


def attachment_png_from_path(name: str, path: Path) -> AssistantAttachment:
    image_bytes = path.read_bytes()
    payload = base64.b64encode(image_bytes).decode("ascii")
    return AssistantAttachment(
        name=name,
        mimeType="image/png",
        dataUrl=f"data:image/png;base64,{payload}",
        sizeBytes=len(image_bytes),
    )


def attachment_text_from_path_lines(name: str, path: Path, *, start_line: int, end_line: int) -> AssistantAttachment:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    excerpt = "\n".join(lines[start_line - 1 : end_line])
    payload = base64.b64encode(excerpt.encode("utf-8")).decode("ascii")
    return AssistantAttachment(
        name=name,
        mimeType="text/plain",
        dataUrl=f"data:text/plain;base64,{payload}",
        sizeBytes=len(excerpt.encode("utf-8")),
    )


def sample_specialist_lighthouse_screenshot_with_key() -> list[AssistantAttachment]:
    return [
        attachment_png_from_path(
            "2021-mas-q09-lighthouse.png",
            workbench_fixture(
                "assistant-evals",
                "2021-mas-calculator-assumed",
                "crops",
                "q09_lighthouse_related_rates.png",
            ),
        ),
        attachment_text_from_path_lines(
            "2021-mas-q09-official-key.txt",
            workbench_fixture("assistant-evals", "source-text", "2021-mas-ca-key.txt"),
            start_line=15,
            end_line=72,
        ),
    ]


def sample_specialist_stats_screenshot_with_key() -> list[AssistantAttachment]:
    return [
        attachment_png_from_path(
            "2021-mas-q15-statistics-p1.png",
            workbench_fixture(
                "assistant-evals",
                "2021-mas-calculator-assumed",
                "crops",
                "q15_stats_curve_p1.png",
            ),
        ),
        attachment_png_from_path(
            "2021-mas-q15-statistics-p2.png",
            workbench_fixture(
                "assistant-evals",
                "2021-mas-calculator-assumed",
                "crops",
                "q15_stats_curve_p2.png",
            ),
        ),
        attachment_text_from_path_lines(
            "2021-mas-q15-official-key.txt",
            workbench_fixture("assistant-evals", "source-text", "2021-mas-ca-key.txt"),
            start_line=480,
            end_line=589,
        ),
    ]


def sample_methods_earthquake_screenshot_with_key() -> list[AssistantAttachment]:
    return [
        attachment_png_from_path(
            "2024-mam-q15-earthquake-graph-p1.png",
            workbench_fixture(
                "assistant-evals",
                "2024-mam-calculator-assumed",
                "crops",
                "q15_earthquake_graph_p1.png",
            ),
        ),
        attachment_png_from_path(
            "2024-mam-q15-earthquake-graph-p2.png",
            workbench_fixture(
                "assistant-evals",
                "2024-mam-calculator-assumed",
                "crops",
                "q15_earthquake_graph_p2.png",
            ),
        ),
        attachment_text_from_path_lines(
            "2024-mam-q15-official-key.txt",
            workbench_fixture("assistant-evals", "source-text", "2024-mam-ca-key.txt"),
            start_line=676,
            end_line=783,
        ),
    ]


def sample_methods_ev_histogram_screenshot_with_key() -> list[AssistantAttachment]:
    return [
        attachment_png_from_path(
            "2024-mam-q13-ev-histogram-p1.png",
            workbench_fixture(
                "assistant-evals",
                "2024-mam-calculator-assumed",
                "crops",
                "q13_ev_histogram_p1.png",
            ),
        ),
        attachment_png_from_path(
            "2024-mam-q13-ev-histogram-p2.png",
            workbench_fixture(
                "assistant-evals",
                "2024-mam-calculator-assumed",
                "crops",
                "q13_ev_histogram_p2.png",
            ),
        ),
        attachment_png_from_path(
            "2024-mam-q13-ev-histogram-p3.png",
            workbench_fixture(
                "assistant-evals",
                "2024-mam-calculator-assumed",
                "crops",
                "q13_ev_histogram_p3.png",
            ),
        ),
        attachment_text_from_path_lines(
            "2024-mam-q13-official-key.txt",
            workbench_fixture("assistant-evals", "source-text", "2024-mam-ca-key.txt"),
            start_line=465,
            end_line=568,
        ),
    ]


def sample_methods_dice_game_screenshot_with_key() -> list[AssistantAttachment]:
    return [
        attachment_png_from_path(
            "2024-mam-q14-dice-game-chart-p1.png",
            workbench_fixture(
                "assistant-evals",
                "2024-mam-calculator-assumed",
                "crops",
                "q14_dice_game_chart_p1.png",
            ),
        ),
        attachment_png_from_path(
            "2024-mam-q14-dice-game-chart-p2.png",
            workbench_fixture(
                "assistant-evals",
                "2024-mam-calculator-assumed",
                "crops",
                "q14_dice_game_chart_p2.png",
            ),
        ),
        attachment_png_from_path(
            "2024-mam-q14-dice-game-chart-p3.png",
            workbench_fixture(
                "assistant-evals",
                "2024-mam-calculator-assumed",
                "crops",
                "q14_dice_game_chart_p3.png",
            ),
        ),
        attachment_text_from_path_lines(
            "2024-mam-q14-official-key.txt",
            workbench_fixture("assistant-evals", "source-text", "2024-mam-ca-key.txt"),
            start_line=569,
            end_line=675,
        ),
    ]


def sample_specialist_slope_field_screenshot_with_key() -> list[AssistantAttachment]:
    return [
        attachment_png_from_path(
            "2021-mas-q10-slope-field-p1.png",
            workbench_fixture(
                "assistant-evals",
                "2021-mas-calculator-assumed",
                "crops",
                "q10_slope_field_p1.png",
            ),
        ),
        attachment_png_from_path(
            "2021-mas-q10-slope-field-p2.png",
            workbench_fixture(
                "assistant-evals",
                "2021-mas-calculator-assumed",
                "crops",
                "q10_slope_field_p2.png",
            ),
        ),
        attachment_text_from_path_lines(
            "2021-mas-q10-official-key.txt",
            workbench_fixture("assistant-evals", "source-text", "2021-mas-ca-key.txt"),
            start_line=73,
            end_line=156,
        ),
    ]


def sample_specialist_argand_screenshot_with_key() -> list[AssistantAttachment]:
    return [
        attachment_png_from_path(
            "2021-mas-q11-argand-p1.png",
            workbench_fixture(
                "assistant-evals",
                "2021-mas-calculator-assumed",
                "crops",
                "q11_argand_p1.png",
            ),
        ),
        attachment_png_from_path(
            "2021-mas-q11-argand-locus-p2.png",
            workbench_fixture(
                "assistant-evals",
                "2021-mas-calculator-assumed",
                "crops",
                "q11_argand_locus_p2.png",
            ),
        ),
        attachment_text_from_path_lines(
            "2021-mas-q11-official-key.txt",
            workbench_fixture("assistant-evals", "source-text", "2021-mas-ca-key.txt"),
            start_line=157,
            end_line=228,
        ),
    ]


def sample_specialist_spherical_cap_screenshot_with_key() -> list[AssistantAttachment]:
    return [
        attachment_png_from_path(
            "2021-mas-q13-spherical-cap.png",
            workbench_fixture(
                "assistant-evals",
                "2021-mas-calculator-assumed",
                "crops",
                "q13_spherical_cap.png",
            ),
        ),
        attachment_text_from_path_lines(
            "2021-mas-q13-official-key.txt",
            workbench_fixture("assistant-evals", "source-text", "2021-mas-ca-key.txt"),
            start_line=297,
            end_line=342,
        ),
    ]


def sample_specialist_prism_screenshot_with_key() -> list[AssistantAttachment]:
    return [
        attachment_png_from_path(
            "2021-mas-q16-3d-prism-p1.png",
            workbench_fixture(
                "assistant-evals",
                "2021-mas-calculator-assumed",
                "crops",
                "q16_3d_prism_p1.png",
            ),
        ),
        attachment_png_from_path(
            "2021-mas-q16-3d-prism-p2.png",
            workbench_fixture(
                "assistant-evals",
                "2021-mas-calculator-assumed",
                "crops",
                "q16_3d_prism_p2.png",
            ),
        ),
        attachment_text_from_path_lines(
            "2021-mas-q16-official-key.txt",
            workbench_fixture("assistant-evals", "source-text", "2021-mas-ca-key.txt"),
            start_line=590,
            end_line=685,
        ),
    ]


def sample_specialist_implicit_screenshot_with_key() -> list[AssistantAttachment]:
    return [
        attachment_png_from_path(
            "2021-mas-q18-implicit-curve-p1.png",
            workbench_fixture(
                "assistant-evals",
                "2021-mas-calculator-assumed",
                "crops",
                "q18_implicit_curve_p1.png",
            ),
        ),
        attachment_png_from_path(
            "2021-mas-q18-implicit-curve-p2.png",
            workbench_fixture(
                "assistant-evals",
                "2021-mas-calculator-assumed",
                "crops",
                "q18_implicit_curve_p2.png",
            ),
        ),
        attachment_text_from_path_lines(
            "2021-mas-q18-official-key.txt",
            workbench_fixture("assistant-evals", "source-text", "2021-mas-ca-key.txt"),
            start_line=860,
            end_line=927,
        ),
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


def has_solution_surface(value: dict[str, Any], singular_key: str, plural_key: str) -> bool:
    if isinstance(value.get(singular_key), dict):
        return True
    plural_value = value.get(plural_key)
    return isinstance(plural_value, list) and any(isinstance(item, dict) for item in plural_value)


def artifact_solution_text_mark_issues(value: Any, path: str = "arguments") -> list[str]:
    issues: list[str] = []
    if isinstance(value, dict):
        answer_surface = value.get("answerSurface")
        has_solution_diagram = has_solution_surface(value, "solutionDiagram", "solutionDiagrams")
        has_solution_table = has_solution_surface(value, "solutionTable", "solutionTables")
        solution_text = value.get("solutionText")
        if isinstance(solution_text, str) and hidden_mark_total(solution_text):
            if (answer_surface == "diagram" or answer_surface is None) and has_solution_diagram:
                issues.append(
                    f"{path}.solutionText should be unmarked when solutionDiagram is present; remove [[marks:n]] text ticks"
                )
            if (answer_surface == "table" or answer_surface is None) and has_solution_table:
                issues.append(
                    f"{path}.solutionText should be unmarked when solutionTable is present; remove [[marks:n]] text ticks"
                )
        for key, inner_value in value.items():
            issues.extend(artifact_solution_text_mark_issues(inner_value, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            issues.extend(artifact_solution_text_mark_issues(item, f"{path}[{index}]"))
    return issues


def solution_surface_mark_total(value: Any) -> int:
    if isinstance(value, dict):
        marks = value.get("marks")
        solution_text = value.get("solutionText")
        has_marked_solution_text = isinstance(solution_text, str) and hidden_mark_total(solution_text) > 0
        total = 0
        if (
            isinstance(marks, int)
            and not isinstance(marks, bool)
            and not has_marked_solution_text
            and (
                has_solution_surface(value, "solutionDiagram", "solutionDiagrams")
                or has_solution_surface(value, "solutionTable", "solutionTables")
            )
        ):
            total += marks
        for inner_value in value.values():
            total += solution_surface_mark_total(inner_value)
        return total
    if isinstance(value, list):
        return sum(solution_surface_mark_total(item) for item in value)
    return 0


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


def collect_diagram_graph_configs(value: Any) -> list[dict[str, Any]]:
    configs: list[dict[str, Any]] = []
    if isinstance(value, dict):
        graph_config = value.get("graphConfig", value.get("config"))
        if isinstance(graph_config, dict) and isinstance(graph_config.get("type"), str):
            configs.append(graph_config)
        elif isinstance(value.get("type"), str):
            configs.append(value)
        for key, inner_value in value.items():
            if key in {"graphConfig", "config"}:
                continue
            configs.extend(collect_diagram_graph_configs(inner_value))
    elif isinstance(value, list):
        for item in value:
            configs.extend(collect_diagram_graph_configs(item))
    return configs


def collect_diagram_graph_configs_with_paths(value: Any, path: str = "arguments") -> list[tuple[str, dict[str, Any]]]:
    configs: list[tuple[str, dict[str, Any]]] = []
    if isinstance(value, dict):
        graph_config = value.get("graphConfig", value.get("config"))
        if isinstance(graph_config, dict) and isinstance(graph_config.get("type"), str):
            key = "graphConfig" if isinstance(value.get("graphConfig"), dict) else "config"
            configs.append((f"{path}.{key}", graph_config))
        elif isinstance(value.get("type"), str):
            configs.append((path, value))
        for key, inner_value in value.items():
            if key in {"graphConfig", "config"}:
                continue
            configs.extend(collect_diagram_graph_configs_with_paths(inner_value, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            configs.extend(collect_diagram_graph_configs_with_paths(item, f"{path}[{index}]"))
    return configs


def graph_config_types(args: dict[str, Any]) -> set[str]:
    return {str(config.get("type")) for config in collect_diagram_graph_configs(args) if config.get("type")}


def assert_source_question_common(call: dict[str, Any]) -> tuple[list[str], dict[str, Any] | None]:
    issues: list[str] = []
    if call.get("mauthToolName") != QUESTION_UPSERT_TOOL_NAME:
        issues.append(f"expected {QUESTION_UPSERT_TOOL_NAME}, got {call.get('mauthToolName')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"], None
    if args.get("questionNumber") != 1:
        issues.append("source screenshot should be converted into Question 1")
    question_text = str(args.get("questionText") or "")
    solution_text = str(args.get("solutionText") or "")
    issues.extend(control_character_issues(question_text, "questionText"))
    issues.extend(control_character_issues(solution_text, "solutionText"))
    issues.extend(artifact_solution_text_mark_issues(args))
    if "(a)" in question_text.lower() or "(b)" in question_text.lower():
        issues.append("questionText should not contain typed automatic part labels")
    if "\\[" in question_text or "\\]" in question_text:
        issues.append("questionText should use $$...$$ display maths, not \\[...\\]")
    if "\\[" in solution_text or "\\]" in solution_text:
        issues.append("solutionText should use $$...$$ display maths, not \\[...\\]")
    if "diagram" in args and isinstance(args.get("diagrams"), list):
        issues.append("source conversion should use either diagram or diagrams, not both")
    return issues, args


def diagram_vector_ray_config(args: dict[str, Any]) -> dict[str, Any]:
    diagram = args.get("diagram")
    if isinstance(diagram, dict) and isinstance(diagram.get("vectorRayDiagram"), dict):
        return diagram["vectorRayDiagram"]
    diagrams = args.get("diagrams")
    if isinstance(diagrams, list):
        for diagram_item in diagrams:
            if isinstance(diagram_item, dict) and isinstance(diagram_item.get("vectorRayDiagram"), dict):
                return diagram_item["vectorRayDiagram"]
    return {}


def angle_distance_degrees(first: float, second: float) -> float:
    difference = abs((first - second) % 360)
    return min(difference, 360 - difference)


def finite_number(value: Any) -> float | None:
    if isinstance(value, int | float):
        return float(value)
    return None


def approximately(value: Any, expected: float, tolerance: float = 1e-6) -> bool:
    number = finite_number(value)
    return number is not None and abs(number - expected) <= tolerance


def vector_ray_angle(entry: dict[str, Any]) -> float | None:
    angle = finite_number(entry.get("angleDeg"))
    if angle is not None:
        return angle % 360
    components = entry.get("components")
    if (
        isinstance(components, list)
        and len(components) == 2
        and isinstance(components[0], int | float)
        and isinstance(components[1], int | float)
    ):
        import math

        return math.degrees(math.atan2(float(components[1]), float(components[0]))) % 360
    return None


def marker_pair(marker: dict[str, Any]) -> set[str]:
    return {str(marker.get("from") or ""), str(marker.get("to") or "")}


def assert_vector_ray_diagram_shape(vector_ray: dict[str, Any], *, path: str = "diagram.vectorRayDiagram") -> list[str]:
    issues: list[str] = []
    vectors = vector_ray.get("vectors")
    if not isinstance(vectors, list):
        return [f"{path}.vectors should be an array"]
    vector_entries = {
        str(vector.get("id") or vector.get("name") or ""): vector for vector in vectors if isinstance(vector, dict)
    }
    for vector_id in ("a", "b", "c", "d"):
        entry = vector_entries.get(vector_id)
        if entry is None:
            issues.append(f"{path}.vectors should include vector {vector_id!r}")
            continue
        if not str(entry.get("label") or entry.get("name") or entry.get("id") or "").strip():
            issues.append(f"{path}.vectors[{vector_id}] should include a visible label")
        if finite_number(entry.get("length")) is None and not isinstance(entry.get("components"), list):
            issues.append(f"{path}.vectors[{vector_id}] should include length or components")

    angles = {vector_id: vector_ray_angle(entry) for vector_id, entry in vector_entries.items()}
    if (
        angles.get("a") is not None
        and angles.get("d") is not None
        and abs(angle_distance_degrees(angles["a"], angles["d"]) - 180) > 8
    ):
        issues.append("vectorRayDiagram should make a and d opposite collinear rays")
    if (
        angles.get("b") is not None
        and angles.get("d") is not None
        and abs(angle_distance_degrees(angles["b"], angles["d"]) - 90) > 8
    ):
        issues.append("vectorRayDiagram should make b perpendicular to d")
    if (
        angles.get("c") is not None
        and angles.get("d") is not None
        and abs(angle_distance_degrees(angles["c"], angles["d"]) - 45) > 8
    ):
        issues.append("vectorRayDiagram should make the angle between c and d equal to 45 degrees")

    serialized = json.dumps(vector_ray, ensure_ascii=False).lower()
    for value in ("2", "3", "45"):
        if value not in serialized:
            issues.append(f"vectorRayDiagram should preserve visible value {value!r}")

    markers = vector_ray.get("angleMarkers")
    if not isinstance(markers, list) or not markers:
        issues.append("vectorRayDiagram.angleMarkers should include right-angle and 45 degree markers")
    else:
        if not any(isinstance(marker, dict) and marker.get("rightAngle") is True for marker in markers):
            issues.append("vectorRayDiagram should preserve the visible right-angle marker")
        elif not any(
            isinstance(marker, dict) and marker.get("rightAngle") is True and marker_pair(marker) == {"b", "d"}
            for marker in markers
        ):
            issues.append("vectorRayDiagram right-angle marker should span the perpendicular rays b and d")
        if not any(isinstance(marker, dict) and "45" in str(marker.get("label") or "") for marker in markers):
            issues.append("vectorRayDiagram should preserve the visible 45 degree angle marker")
        elif not any(
            isinstance(marker, dict) and "45" in str(marker.get("label") or "") and marker_pair(marker) == {"c", "d"}
            for marker in markers
        ):
            issues.append("vectorRayDiagram 45 degree marker should span the labelled rays c and d")
    return issues


def assert_vector2d_or_vector_ray_diagram(args: dict[str, Any], *, path: str = "diagram") -> list[str]:
    vector_ray = diagram_vector_ray_config(args)
    if vector_ray:
        return assert_vector_ray_diagram_shape(vector_ray, path=f"{path}.vectorRayDiagram")

    graph_config = diagram_graph_config(args)
    graph_type = graph_config.get("type")
    if graph_type != "vector2d":
        return [f"source scalar-product ray diagram should use vectorRayDiagram or vector2d, got {graph_type!r}"]

    issues: list[str] = []
    serialized_diagram = json.dumps(graph_config, ensure_ascii=False).lower()
    for term in ("a", "b", "c", "d", "45"):
        if term not in serialized_diagram:
            issues.append(f"native vector2d diagram should preserve visible diagram label/value {term!r}")
    if graph_config.get("showAxes") is not False or graph_config.get("showGrid") is not False:
        issues.append("source scalar-product vector2d diagram should hide axes and grid")
    metadata = graph_config.get("metadata")
    vector2d = (
        metadata.get("vector2d") if isinstance(metadata, dict) and isinstance(metadata.get("vector2d"), dict) else {}
    )
    vectors = vector2d.get("vectors")
    if not isinstance(vectors, list) or len(vectors) < 4:
        issues.append("native vector2d diagram should include all four labelled vectors")
    segment_labels = vector2d.get("segmentLabels")
    if not isinstance(segment_labels, list) or len(segment_labels) < 4:
        issues.append("native vector2d diagram should preserve magnitude labels")
    angle_markers = vector2d.get("angleMarkers")
    if not isinstance(angle_markers, list) or not any(
        isinstance(marker, dict) and marker.get("rightAngle") is True for marker in angle_markers
    ):
        issues.append("native vector2d diagram should preserve the visible right-angle marker")
    elif not any(
        isinstance(marker, dict) and marker.get("rightAngle") is True and marker_pair(marker) == {"b", "d"}
        for marker in angle_markers
    ):
        issues.append("native vector2d diagram right-angle marker should span the perpendicular rays b and d")
    if not isinstance(angle_markers, list) or not any(
        isinstance(marker, dict) and "45" in str(marker.get("label") or "") for marker in angle_markers
    ):
        issues.append("native vector2d diagram should preserve the visible 45 degree angle marker")
    elif not any(
        isinstance(marker, dict) and "45" in str(marker.get("label") or "") and marker_pair(marker) == {"c", "d"}
        for marker in angle_markers
    ):
        issues.append("native vector2d diagram 45 degree marker should span the labelled rays c and d")
    return issues


def compact_math_text(text: str) -> str:
    compact = re.sub(r"\s+", "", text.lower())
    compact = re.sub(r"\\d?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}", r"\1/\2", compact)
    compact = re.sub(r"\\d?frac([^\\{}])([^\\{}])", r"\1/\2", compact)
    replacements = {
        "\\cdot": ".",
        "\\approx": "=",
        "\\pi": "pi",
        "\\left": "",
        "\\right": "",
        "\\operatorname": "",
        "operatorname": "",
        "\\mathrm": "",
        "·": ".",
        "\\mathbf": "",
        "\\boldsymbol": "",
        "\\vec": "",
        "_": "",
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
        forbidden_types=("network", "geometricConstruction", "graph2d"),
    )
    serialized = call_text(call).lower()
    if "column" not in serialized and "\\begin{pmatrix}" not in serialized and "pmatrix" not in serialized:
        issues.append("vector2d payload should include or imply column-vector labels")
    return issues


def assert_scalar_product_add_diagram_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != "mauth.author.addDiagram":
        issues.append(f"expected mauth.author.addDiagram, got {call.get('mauthToolName')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]
    if args.get("questionNumber") != 1:
        issues.append("questionNumber should be 1")
    return [*issues, *assert_vector2d_or_vector_ray_diagram(args)]


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

    diagrams = args.get("diagrams")
    if isinstance(diagrams, list) and any(
        isinstance(item, dict) and "type" in item and "graphConfig" not in item for item in diagrams
    ):
        issues.append("diagram items should be wrapped as { graphConfig: ... }, not top-level { type, data }")
    graph_config = diagram_graph_config(args)
    graph_type = graph_config.get("type")
    vector_ray = diagram_vector_ray_config(args)
    serialized_diagram = json.dumps(vector_ray or graph_config, ensure_ascii=False).lower()
    if graph_type == "image" or "data:image" in serialized_diagram:
        issues.append("do not paste the screenshot back as an image; recreate an editable native diagram")
    issues.extend(assert_vector2d_or_vector_ray_diagram(args))

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
        if part.get("answerSurface") != "diagram" and (
            not isinstance(part.get("studentSpaceLines"), int) or part["studentSpaceLines"] < 3
        ):
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


def assert_real_lighthouse_question_call(call: dict[str, Any]) -> list[str]:
    issues, args = assert_source_question_common(call)
    if args is None:
        return issues

    if args.get("marks") != 5:
        issues.append("lighthouse source question should preserve the 5 mark allocation")
    if not isinstance(args.get("studentSpaceLines"), int) or args["studentSpaceLines"] < 8:
        issues.append("lighthouse related-rates question should keep generous written working space")

    serialized = call_text(call).lower()
    for term in ("lighthouse", "beam", "50", "100", "theta"):
        if term not in serialized and (term != "theta" or "θ" not in serialized):
            issues.append(f"lighthouse source conversion should preserve {term!r}")

    graph_types = graph_config_types(args)
    if "geometricConstruction" not in graph_types:
        issues.append(
            f"lighthouse right-triangle diagram should use geometricConstruction, got {sorted(graph_types)!r}"
        )
    if "graph2d" in graph_types or "statsChart" in graph_types or "network" in graph_types:
        issues.append("lighthouse right-triangle diagram should not use graph2d, statsChart, or network")
    graph_config = diagram_graph_config(args)
    substance = str(graph_config.get("options", {}).get("substanceSource") or "")
    if graph_config.get("type") == "geometricConstruction":
        for term in ("L", "C", "P"):
            if term not in substance:
                issues.append(f"geometricConstruction Substance should include point {term}")
        if "RightAngle" not in substance and "Perpendicular" not in substance:
            issues.append("lighthouse diagram should preserve the right angle at the coast")
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
            issues.append(f"lighthouse geometricConstruction should render through Penrose: {exc}")

    solution_texts = collect_solution_texts(args)
    if not solution_texts:
        issues.append("official-key source should produce a worked solution")
    solution_serialized = compact_math_text("\n".join(solution_texts))
    for term in ("pi/10", "tan", "sec", "78.54"):
        if term not in solution_serialized:
            issues.append(f"lighthouse solution should preserve {term!r}")
    if hidden_mark_total("\n".join(solution_texts)) != 5:
        issues.append("lighthouse hidden [[marks:n]] total should be exactly 5")
    if visible_mark_note_count("\n".join(solution_texts)):
        issues.append("lighthouse solution should use hidden [[marks:n]] ticks, not visible mark notes")
    return issues


def assert_real_specialist_stats_call(call: dict[str, Any]) -> list[str]:
    issues, args = assert_source_question_common(call)
    if args is None:
        return issues

    question_text = str(args.get("questionText") or "")
    serialized = call_text(call).lower()
    for term in ("text message", "response", "mean", "standard deviation", "64"):
        if term not in serialized:
            issues.append(f"statistics source conversion should preserve {term!r}")
    if "2.4" not in serialized or "3" not in serialized:
        issues.append("statistics source conversion should preserve population mean 3 and standard deviation 2.4")

    graph_types = graph_config_types(args)
    if "statsChart" not in graph_types:
        issues.append(f"statistics source graphs should use statsChart, got {sorted(graph_types)!r}")
    if "graph2d" in graph_types:
        issues.append(
            "statistics distribution/blank-axis source should not be converted as a generic graph2d function graph"
        )
    stats_chart_types: list[str] = []
    for config in collect_diagram_graph_configs(args):
        if config.get("type") != "statsChart":
            continue
        data = config.get("data")
        if isinstance(data, dict) and isinstance(data.get("chartType"), str):
            stats_chart_types.append(str(data["chartType"]))
    unsupported_stats_types = sorted(
        {
            chart_type
            for chart_type in stats_chart_types
            if chart_type not in {"histogram", "binomial", "normal", "box", "density", "blankAxes"}
        }
    )
    if unsupported_stats_types:
        issues.append(
            f"statistics chartTypes should be supported native statsChart types, got {unsupported_stats_types!r}"
        )
    if "density" not in stats_chart_types:
        issues.append("statistics source probability-density graph should use statsChart chartType='density'")

    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) != 3:
        issues.append("statistics source should become exactly three structured parts")
        return issues
    expected_marks = [3, 2, 4]
    expected_terms = (("150", "210"), ("sample mean", "distribution"), ("anika", "claim"))
    for index, part in enumerate(parts):
        if not isinstance(part, dict):
            issues.append(f"parts[{index}] should be an object")
            continue
        if part.get("marks") != expected_marks[index]:
            issues.append(f"parts[{index}].marks should be {expected_marks[index]}")
        part_text = str(part.get("text") or "").lower()
        for term in expected_terms[index]:
            if term not in part_text:
                issues.append(f"parts[{index}].text should preserve {term!r}")
        if part.get("answerSurface") != "diagram" and (
            not isinstance(part.get("studentSpaceLines"), int) or part["studentSpaceLines"] < 3
        ):
            issues.append(f"parts[{index}].studentSpaceLines should be at least 3")

    if sum(part.get("marks", 0) for part in parts if isinstance(part, dict)) != 9:
        issues.append("statistics structured part marks should total 9")
    if "100" not in serialized or "2.1" not in serialized or "2.7" not in serialized:
        issues.append("statistics source conversion should preserve the sample-size/mean/standard-deviation table")
    if "send me a text message" not in question_text.lower():
        issues.append("questionText should preserve the source request wording")

    solution_texts = collect_solution_texts(args)
    solution_serialized = compact_math_text("\n".join(solution_texts))
    for term in ("0.904", "0.3", "1.5708", "2.6292"):
        if term not in solution_serialized:
            issues.append(f"statistics solution should preserve {term!r}")
    solution_text = "\n".join(solution_texts).lower()
    if all(
        term not in solution_text for term in ("cannot", "not accepted", "not justified", "does not prove", "not prove")
    ):
        issues.append("statistics solution should reject Anika's teenager-source claim")
    hidden_total = hidden_mark_total("\n".join(solution_texts))
    diagram_solution_marks = sum(
        int(part.get("marks") or 0)
        for part in parts
        if isinstance(part, dict)
        and part.get("answerSurface") == "diagram"
        and isinstance(part.get("solutionDiagram"), dict)
    )
    if hidden_total + diagram_solution_marks != 9:
        issues.append("statistics hidden [[marks:n]] ticks plus completed solution diagrams should total 9")
    if visible_mark_note_count("\n".join(solution_texts)):
        issues.append("statistics solution should use hidden [[marks:n]] ticks, not visible mark notes")
    return issues


def assert_real_methods_earthquake_call(call: dict[str, Any]) -> list[str]:
    issues, args = assert_source_question_common(call)
    if args is None:
        return issues

    serialized = call_text(call).lower()
    for term in ("earthquake", "moment magnitude", "seismic moment", "log"):
        if term not in serialized:
            issues.append(f"earthquake source conversion should preserve {term!r}")
    if "3.16" not in serialized or "10" not in serialized:
        issues.append("earthquake source conversion should preserve the seismic moment 3.16 x 10^13")

    graph_config = diagram_graph_config(args)
    graph_types = graph_config_types(args)
    if graph_config.get("type") != "graph2d" and "graph2d" not in graph_types:
        issues.append(f"earthquake source graph should use graph2d, got {sorted(graph_types)!r}")
    if "statsChart" in graph_types or "geometricConstruction" in graph_types:
        issues.append("earthquake linear coordinate graph should not use statsChart or geometricConstruction")

    graph_serialized = json.dumps(graph_config, ensure_ascii=False).lower()
    if "log" not in serialized or "m_0" not in serialized.replace("{", "").replace("}", ""):
        issues.append("earthquake payload should keep log10(M_0) axis/variable notation")
    if not any(term in graph_serialized for term in ("2/3", "0.666", "0.667", "0.666666")):
        issues.append("earthquake graph2d line should encode slope 2/3")
    if "-6" not in graph_serialized:
        issues.append("earthquake graph2d line should encode vertical intercept -6")

    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) != 4:
        issues.append("earthquake source should become exactly four structured parts")
        return issues
    expected_marks = [2, 2, 3, 2]
    expected_terms = (("3.16", "10"), ("a", "b"), ("relationship", "form"), ("magnitude", "4"))
    for index, part in enumerate(parts):
        if not isinstance(part, dict):
            issues.append(f"parts[{index}] should be an object")
            continue
        if part.get("marks") != expected_marks[index]:
            issues.append(f"parts[{index}].marks should be {expected_marks[index]}")
        part_text = str(part.get("text") or "").lower()
        for term in expected_terms[index]:
            if term not in part_text:
                issues.append(f"parts[{index}].text should preserve {term!r}")
        if not isinstance(part.get("studentSpaceLines"), int) or part["studentSpaceLines"] < 3:
            issues.append(f"parts[{index}].studentSpaceLines should be at least 3")
    if sum(part.get("marks", 0) for part in parts if isinstance(part, dict)) != 9:
        issues.append("earthquake structured part marks should total 9")

    solution_texts = collect_solution_texts(args)
    solution_serialized = compact_math_text("\n".join(solution_texts))
    for term in ("13.5", "m_w=3", "2/3", "-6", "10^9", "10^15"):
        if compact_math_text(term) not in solution_serialized:
            issues.append(f"earthquake solution should preserve {term!r}")
    if hidden_mark_total("\n".join(solution_texts)) != 9:
        issues.append("earthquake hidden [[marks:n]] total should be exactly 9")
    if visible_mark_note_count("\n".join(solution_texts)):
        issues.append("earthquake solution should use hidden [[marks:n]] ticks, not visible mark notes")
    return issues


def stats_chart_data_objects(args: dict[str, Any]) -> list[dict[str, Any]]:
    data_objects: list[dict[str, Any]] = []
    for config in collect_diagram_graph_configs(args):
        if config.get("type") != "statsChart":
            continue
        data = config.get("data")
        if isinstance(data, dict):
            data_objects.append(data)
    return data_objects


def numeric_counter(values: Any) -> dict[float, int]:
    counts: dict[float, int] = {}
    if not isinstance(values, list):
        return counts
    for value in values:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        key = round(float(value), 6)
        counts[key] = counts.get(key, 0) + 1
    return counts


def manual_probability_map(data: dict[str, Any]) -> dict[float, float]:
    x_values = data.get("xValues")
    probabilities = data.get("probabilities")
    if not isinstance(x_values, list) or not isinstance(probabilities, list):
        return {}
    result: dict[float, float] = {}
    for x_value, probability in zip(x_values, probabilities, strict=False):
        if (
            isinstance(x_value, bool)
            or isinstance(probability, bool)
            or not isinstance(x_value, (int, float))
            or not isinstance(probability, (int, float))
        ):
            continue
        result[round(float(x_value), 6)] = float(probability)
    return result


def manual_frequency_map(data: dict[str, Any]) -> dict[float, int]:
    x_values = data.get("xValues")
    frequencies = data.get("frequencies")
    if not isinstance(frequencies, list) and isinstance(data.get("values"), list):
        frequencies = data.get("values")
    if not isinstance(x_values, list) or not isinstance(frequencies, list) or len(x_values) != len(frequencies):
        return {}
    result: dict[float, int] = {}
    for x_value, frequency in zip(x_values, frequencies, strict=False):
        if (
            isinstance(x_value, bool)
            or isinstance(frequency, bool)
            or not isinstance(x_value, (int, float))
            or not isinstance(frequency, (int, float))
        ):
            continue
        result[round(float(x_value), 6)] = int(frequency)
    return result


def stats_histogram_count_issues(
    data_objects: list[dict[str, Any]],
    expected_counts: dict[float, int],
    *,
    label: str,
    allow_normalised_probabilities: bool = False,
) -> list[str]:
    issues: list[str] = []
    raw_counts: dict[float, int] = {}
    frequency_values: dict[float, int] = {}
    probability_values: dict[float, float] = {}
    for data in data_objects:
        raw_counts.update(numeric_counter(data.get("values")))
        frequency_values.update(manual_frequency_map(data))
        probability_values.update(manual_probability_map(data))
    total = sum(expected_counts.values())
    for value, expected_count in expected_counts.items():
        key = round(float(value), 6)
        if raw_counts.get(key) == expected_count or frequency_values.get(key) == expected_count:
            continue
        expected_probability = expected_count / total if total else 0
        if allow_normalised_probabilities and abs(probability_values.get(key, -1) - expected_probability) < 0.002:
            continue
        issues.append(f"{label} histogram/count chart should preserve value {value:g} with count {expected_count}")
    return issues


def structured_part_items(parts: Any) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if not isinstance(parts, list):
        return items
    for part in parts:
        if not isinstance(part, dict):
            continue
        items.append(part)
        items.extend(structured_part_items(part.get("parts")))
        items.extend(structured_part_items(part.get("subparts")))
    return items


def structured_part_leaf_items(parts: Any) -> list[dict[str, Any]]:
    leaves: list[dict[str, Any]] = []
    if not isinstance(parts, list):
        return leaves
    for part in parts:
        if not isinstance(part, dict):
            continue
        child_leaves = structured_part_leaf_items(part.get("parts")) + structured_part_leaf_items(part.get("subparts"))
        if child_leaves:
            leaves.extend(child_leaves)
        else:
            leaves.append(part)
    return leaves


def table_rows(table: Any) -> list[list[str]]:
    rows: list[list[str]] = []
    if not isinstance(table, dict):
        return rows
    headers = table.get("headers")
    if isinstance(headers, list):
        rows.append([str(cell) for cell in headers])
    for row in table.get("rows") or []:
        if isinstance(row, list):
            rows.append([str(cell) for cell in row])
    return rows


def collect_solution_tables(value: Any) -> list[dict[str, Any]]:
    tables: list[dict[str, Any]] = []
    if isinstance(value, dict):
        solution_table = value.get("solutionTable")
        if isinstance(solution_table, dict):
            tables.append(solution_table)
        solution_tables = value.get("solutionTables")
        if isinstance(solution_tables, list):
            tables.extend(table for table in solution_tables if isinstance(table, dict))
        for inner_value in value.values():
            tables.extend(collect_solution_tables(inner_value))
    elif isinstance(value, list):
        for item in value:
            tables.extend(collect_solution_tables(item))
    return tables


def solution_table_profit_map_is_correct(value: Any) -> bool:
    for table in collect_solution_tables(value):
        rows = table_rows(table)
        compact_rows = [[compact_math_text(cell) for cell in row] for row in rows]
        for header_index, header_row in enumerate(compact_rows):
            positions = {
                label: next((index for index, cell in enumerate(header_row) if cell == label), None)
                for label in ("-1", "0", "1")
            }
            if any(position is None for position in positions.values()):
                continue
            for probability_row in compact_rows[header_index + 1 :]:
                if not any("p(y" in cell or "prob" in cell for cell in probability_row):
                    continue
                values = {
                    label: probability_row[position] if position < len(probability_row) else ""
                    for label, position in positions.items()
                    if position is not None
                }
                if (
                    "0.443" in values.get("-1", "")
                    and "0.208" in values.get("0", "")
                    and "0.349" in values.get("1", "")
                ):
                    return True
    return False


def graph3d_point_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def graph3d_point_coords(point: dict[str, Any]) -> tuple[float, float, float] | None:
    candidates = (point.get("coords"), point.get("coordinates"), point.get("position"))
    for candidate in candidates:
        if (
            isinstance(candidate, list)
            and len(candidate) >= 3
            and all(not isinstance(value, bool) and isinstance(value, (int, float)) for value in candidate[:3])
        ):
            return (float(candidate[0]), float(candidate[1]), float(candidate[2]))
    if all(
        not isinstance(point.get(key), bool) and isinstance(point.get(key), (int, float)) for key in ("x", "y", "z")
    ):
        return (float(point["x"]), float(point["y"]), float(point["z"]))
    return None


def graph3d_semantics(
    configs: list[dict[str, Any]],
) -> tuple[dict[str, tuple[float, float, float]], set[tuple[str, str]], set[tuple[str, str]]]:
    point_coords: dict[str, tuple[float, float, float]] = {}
    segment_pairs: set[tuple[str, str]] = set()
    dashed_pairs: set[tuple[str, str]] = set()
    for config in configs:
        data = config.get("data")
        if not isinstance(data, dict):
            continue
        points = data.get("points") if isinstance(data.get("points"), list) else data.get("vertices")
        for point in points if isinstance(points, list) else []:
            if not isinstance(point, dict):
                continue
            point_id = graph3d_point_key(point.get("id") or point.get("name") or point.get("label"))
            coords = graph3d_point_coords(point)
            if point_id and coords:
                point_coords[point_id] = coords
        segments = data.get("segments") if isinstance(data.get("segments"), list) else data.get("edges")
        for segment in segments if isinstance(segments, list) else []:
            if not isinstance(segment, dict):
                continue
            segment_points = segment.get("points") if isinstance(segment.get("points"), list) else []
            from_id = graph3d_point_key(segment.get("from") or (segment_points[0] if segment_points else ""))
            to_id = graph3d_point_key(segment.get("to") or (segment_points[1] if len(segment_points) > 1 else ""))
            if not from_id or not to_id:
                continue
            pair = tuple(sorted((from_id, to_id)))
            segment_pairs.add(pair)
            if segment.get("dashed") is True or str(segment.get("strokeStyle") or "").lower() == "dashed":
                dashed_pairs.add(pair)
    return point_coords, segment_pairs, dashed_pairs


def graph3d_close_coords(
    actual: tuple[float, float, float] | None,
    expected: tuple[float, float, float],
    *,
    tolerance: float = 0.02,
) -> bool:
    return actual is not None and all(
        abs(actual_value - expected_value) <= tolerance
        for actual_value, expected_value in zip(actual, expected, strict=False)
    )


def assert_real_methods_ev_histogram_call(call: dict[str, Any]) -> list[str]:
    issues, args = assert_source_question_common(call)
    if args is None:
        return issues

    serialized = call_text(call).lower()
    compact_serialized = compact_math_text(serialized)
    for term in ("zaprer", "spruky", "electric vehicle", "albany", "350", "400", "0.2525", "420"):
        if term not in serialized:
            issues.append(f"ev histogram source conversion should preserve {term!r}")
    if "1.6" not in serialized:
        issues.append("ev histogram source conversion should preserve the kilometres-to-miles conversion")

    graph_types = graph_config_types(args)
    if "statsChart" not in graph_types:
        issues.append(f"ev histogram source should use statsChart, got {sorted(graph_types)!r}")
    if "graph2d" in graph_types:
        issues.append("ev histogram should not be converted as a generic graph2d function graph")

    data_objects = stats_chart_data_objects(args)
    chart_types = {str(data.get("chartType")) for data in data_objects if data.get("chartType")}
    if "histogram" not in chart_types:
        issues.append("ev source histogram should use statsChart chartType='histogram'")
    issues.extend(
        stats_histogram_count_issues(
            data_objects,
            {
                270: 4,
                290: 8,
                310: 10,
                330: 12,
                350: 18,
                370: 40,
                390: 54,
                410: 34,
                430: 20,
            },
            label="ev",
        )
    )

    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) != 6:
        issues.append("ev histogram source should become exactly six structured parts")
        return issues
    expected_marks = [2, 1, 3, 2, 2, 2]
    expected_terms = (
        ("standard deviation",),
        ("albany", "420"),
        ("expected value", "variance", "miles"),
        ("histogram", "normal"),
        ("uniform", "expected"),
        ("zaprer", "spruky", "albany"),
    )
    for index, part in enumerate(parts):
        if not isinstance(part, dict):
            issues.append(f"parts[{index}] should be an object")
            continue
        if part.get("marks") != expected_marks[index]:
            issues.append(f"parts[{index}].marks should be {expected_marks[index]}")
        part_text = str(part.get("text") or "").lower()
        for term in expected_terms[index]:
            if term not in part_text:
                issues.append(f"parts[{index}].text should preserve {term!r}")
        if part.get("answerSurface") != "diagram" and (
            not isinstance(part.get("studentSpaceLines"), int) or part["studentSpaceLines"] < 3
        ):
            issues.append(f"parts[{index}].studentSpaceLines should be at least 3")

    if sum(part.get("marks", 0) for part in parts if isinstance(part, dict)) != 12:
        issues.append("ev histogram structured part marks should total 12")

    solution_texts = collect_solution_texts(args)
    solution_serialized = compact_math_text("\n".join(solution_texts))
    for term in ("75", "0.1753", "218.75", "2197", "375.8", "0.1", "zaprer"):
        if compact_math_text(term) not in solution_serialized and compact_math_text(term) not in compact_serialized:
            issues.append(f"ev histogram solution should preserve {term!r}")
    if "skew" not in "\n".join(solution_texts).lower() and "not symmetrical" not in "\n".join(solution_texts).lower():
        issues.append("ev histogram solution should identify the Spruky histogram as skewed/not symmetrical")
    if hidden_mark_total("\n".join(solution_texts)) != 12:
        issues.append("ev histogram hidden [[marks:n]] total should be exactly 12")
    if visible_mark_note_count("\n".join(solution_texts)):
        issues.append("ev histogram solution should use hidden [[marks:n]] ticks, not visible mark notes")
    return issues


def assert_real_methods_dice_game_call(call: dict[str, Any]) -> list[str]:
    issues, args = assert_source_question_common(call)
    if args is None:
        return issues

    serialized = call_text(call).lower()
    compact_serialized = compact_math_text(serialized)
    for term in ("ulam", "four standard dice", "500", "10 000", "charity", "profit"):
        if term not in serialized:
            issues.append(f"dice-game source conversion should preserve {term!r}")

    graph_types = graph_config_types(args)
    if "statsChart" not in graph_types:
        issues.append(f"dice-game source frequency chart should use statsChart, got {sorted(graph_types)!r}")
    if "graph2d" in graph_types:
        issues.append("dice-game frequency chart should not be converted as a generic graph2d graph")
    data_objects = stats_chart_data_objects(args)
    chart_types = {str(data.get("chartType")) for data in data_objects if data.get("chartType")}
    if "histogram" not in chart_types:
        issues.append("dice-game source frequency chart should use statsChart chartType='histogram'")
    issues.extend(
        stats_histogram_count_issues(
            data_objects,
            {
                1: 66,
                2: 113,
                3: 108,
                4: 57,
                5: 57,
                6: 40,
                7: 26,
                8: 13,
                9: 6,
                10: 3,
                11: 4,
                12: 5,
                13: 2,
            },
            label="dice-game",
            allow_normalised_probabilities=True,
        )
    )

    for term in ("0.134", "0.215", "0.208", "0.153", "0.106", "0.067", "0.047", "0.030"):
        if term not in serialized:
            issues.append(f"dice-game probability table should preserve {term!r}")

    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) < 5:
        issues.append("dice-game source should become at least five structured parts")
        return issues
    leaf_parts = structured_part_leaf_items(parts)
    if sum(part.get("marks", 0) for part in leaf_parts) != 14:
        issues.append("dice-game structured part marks should total 14")
    part_texts = [str(part.get("text") or "").lower() for part in structured_part_items(parts)]
    part_text_joined = "\n".join(part_texts)
    expected_term_options = (
        ("exactly two", ("exactly two",)),
        ("not winning", ("not winning", "does not win", "not win")),
        ("binomial", ("binomial",)),
        ("probability distribution", ("probability distribution",)),
        ("expected value", ("expected value",)),
        ("variance", ("variance",)),
        ("profitable", ("profitable",)),
        ("charity", ("charity",)),
    )
    for description, options in expected_term_options:
        if not any(option in part_text_joined for option in options):
            issues.append(f"dice-game structured parts should preserve {description!r}")
    for index, part in enumerate(leaf_parts):
        answer_surface = part.get("answerSurface")
        if answer_surface in ("diagram", "table"):
            continue
        if part.get("marks", 0) > 0 and (
            not isinstance(part.get("studentSpaceLines"), int) or part["studentSpaceLines"] < 3
        ):
            issues.append(f"dice-game leaf part {index}.studentSpaceLines should be at least 3")

    solution_texts = collect_solution_texts(args)
    solution_joined = "\n".join(solution_texts).lower()
    solution_serialized = compact_math_text(solution_joined)
    for term in ("113/500", "0.642", "0.443", "0.208", "0.349", "-0.094", "0.783"):
        if compact_math_text(term) not in solution_serialized and compact_math_text(term) not in compact_serialized:
            issues.append(f"dice-game solution should preserve {term!r}")
    profit_mapping_in_text = "p(y=-1)=0.443" in solution_serialized and "p(y=1)=0.349" in solution_serialized
    if not profit_mapping_in_text and not solution_table_profit_map_is_correct(args):
        issues.append("dice-game solution should map profit probabilities to Y=-1, 0, 1 correctly")
    if all(
        term not in solution_joined
        for term in ("not fixed", "not independent", "not a fixed number", "not independent")
    ):
        issues.append("dice-game solution should explain why the game is not binomial")
    if "profitable" not in solution_joined or "charity" not in solution_joined:
        issues.append("dice-game solution should state the game is profitable for the charity")
    solution_mark_total = hidden_mark_total("\n".join(solution_texts)) + solution_surface_mark_total(args)
    if solution_mark_total != 14:
        issues.append("dice-game hidden [[marks:n]] total should be exactly 14")
    if visible_mark_note_count("\n".join(solution_texts)):
        issues.append("dice-game solution should use hidden [[marks:n]] ticks, not visible mark notes")
    return issues


def assert_real_specialist_slope_field_call(call: dict[str, Any]) -> list[str]:
    issues, args = assert_source_question_common(call)
    if args is None:
        return issues

    serialized = call_text(call).lower()
    compact_serialized = compact_math_text(serialized)
    for term in ("slope field", "solution curve", "0.5", "-1"):
        if term not in serialized:
            issues.append(f"slope-field source conversion should preserve {term!r}")
    if "dy/dx" not in compact_serialized and "dydx" not in compact_serialized:
        issues.append("slope-field source conversion should preserve dy/dx notation")

    graph_types = graph_config_types(args)
    if "graph2d" not in graph_types:
        issues.append(f"slope-field source diagram should use graph2d, got {sorted(graph_types)!r}")
    if any(graph_type in graph_types for graph_type in ("statsChart", "setDiagram", "network", "graph3d")):
        issues.append("slope-field source should not use statsChart, setDiagram, network, or graph3d")

    slope_fields: list[dict[str, Any]] = []
    source_slope_fields: list[dict[str, Any]] = []
    graph2d_function_entries: list[Any] = []
    graph_configs_with_paths = collect_diagram_graph_configs_with_paths(args)
    for path, config in graph_configs_with_paths:
        if config.get("type") != "graph2d":
            continue
        data = config.get("data")
        if isinstance(data, dict) and isinstance(data.get("slopeField"), dict):
            slope_fields.append(data["slopeField"])
            if "solutionDiagram" not in path and "solutionDiagrams" not in path:
                source_slope_fields.append(data["slopeField"])
        if isinstance(data, dict):
            for key in ("functions", "features"):
                if key in data:
                    issues.append(f"graph2d.{key} must be top-level graphConfig.{key}, not graphConfig.data.{key}")
            if "xRange" in data:
                issues.append("graph2d bounds should use top-level graphConfig.xMin/xMax, not graphConfig.data.xRange")
            if "yRange" in data:
                issues.append("graph2d bounds should use top-level graphConfig.yMin/yMax, not graphConfig.data.yRange")
        options = config.get("options")
        if isinstance(options, dict):
            for key in (
                "showGrid",
                "showAxes",
                "showAxisLabels",
                "showAxisNumbers",
                "width",
                "height",
                "widthPx",
                "heightPx",
            ):
                if key in options:
                    issues.append(f"graph2d {key} must be a top-level graphConfig field, not graphConfig.options.{key}")
        functions = config.get("functions")
        if isinstance(functions, list):
            graph2d_function_entries.extend(functions)
            for index, function in enumerate(functions):
                if not isinstance(function, dict):
                    continue
                if "domain" in function:
                    issues.append(f"graph2d.functions[{index}].domain should be domainMin/domainMax")
                if "style" in function:
                    issues.append(f"graph2d.functions[{index}].style should be color/strokeWidth/strokeStyle")
        features = config.get("features")
        if isinstance(features, list):
            for index, feature in enumerate(features):
                if not isinstance(feature, dict):
                    continue
                if "type" in feature and "kind" not in feature:
                    issues.append(f"graph2d.features[{index}].type should be named kind")
                if "style" in feature:
                    issues.append(f"graph2d.features[{index}].style should be color/size/strokeWidth/strokeStyle")
    if not slope_fields:
        issues.append("slope-field graph2d data should include data.slopeField")
    elif not source_slope_fields:
        issues.append("slope-field source/student graph2d data should include data.slopeField")
    else:
        slope_expression = compact_math_text(str(source_slope_fields[0].get("expression") or ""))
        if "x-1" not in slope_expression or ("2*y" not in slope_expression and "2y" not in slope_expression):
            issues.append("slopeField.expression should encode (x - 1) / (2y)")
        if not (
            isinstance(source_slope_fields[0].get("xValues"), list)
            and isinstance(source_slope_fields[0].get("yValues"), list)
            or isinstance(source_slope_fields[0].get("xRange"), list)
            and isinstance(source_slope_fields[0].get("yRange"), list)
        ):
            issues.append("slopeField should include grid x/y values or x/y ranges")
        if isinstance(source_slope_fields[0].get("xRange"), list) and len(source_slope_fields[0]["xRange"]) != 2:
            issues.append("slopeField.xRange should contain [min,max]; put sampling step in xStep")
        if isinstance(source_slope_fields[0].get("yRange"), list) and len(source_slope_fields[0]["yRange"]) != 2:
            issues.append("slopeField.yRange should contain [min,max]; put sampling step in yStep")
        if (
            isinstance(source_slope_fields[0].get("xRange"), list)
            and isinstance(source_slope_fields[0].get("yRange"), list)
            and not (
                isinstance(source_slope_fields[0].get("xStep"), (int, float))
                and isinstance(source_slope_fields[0].get("yStep"), (int, float))
            )
        ):
            issues.append("slopeField range sampling should include numeric xStep and yStep")
        highlighted_points = source_slope_fields[0].get("highlightedPoints")
        if not (
            isinstance(highlighted_points, list)
            and any(
                isinstance(point, dict) and approximately(point.get("x"), 0.5) and approximately(point.get("y"), -1)
                for point in highlighted_points
            )
        ):
            issues.append("slopeField.highlightedPoints should include the requested point (0.5, -1)")
    top_level_function_serialized = compact_math_text(json.dumps(graph2d_function_entries, ensure_ascii=False))
    if not any(term in top_level_function_serialized for term in ("y^2", "y**2")) or not any(
        term in top_level_function_serialized for term in ("x^2", "x**2")
    ):
        issues.append(
            "slope-field graph2d.functions should include the solution-curve relation or completed solution diagram"
        )

    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) != 3:
        issues.append("slope-field source should become exactly three structured parts")
        return issues
    expected_marks = [3, 3, 2]
    expected_terms = (
        ("calculate", "draw", "0.5", "-1"),
        ("equation", "solution curve", "0,0.5"),
        ("draw", "solution curve"),
    )
    for index, part in enumerate(parts):
        if not isinstance(part, dict):
            issues.append(f"parts[{index}] should be an object")
            continue
        if part.get("marks") != expected_marks[index]:
            issues.append(f"parts[{index}].marks should be {expected_marks[index]}")
        part_text = str(part.get("text") or "").lower()
        for term in expected_terms[index]:
            if term not in part_text.replace(" ", "") and term not in part_text:
                issues.append(f"parts[{index}].text should preserve {term!r}")
        if part.get("answerSurface") != "diagram" and (
            not isinstance(part.get("studentSpaceLines"), int) or part["studentSpaceLines"] < 3
        ):
            issues.append(f"parts[{index}].studentSpaceLines should be at least 3")

    solution_texts = collect_solution_texts(args)
    solution_serialized = compact_math_text("\n".join(solution_texts))
    for term in ("0.25", "y^2", "x^2/2", "-x", "1/4"):
        if term not in solution_serialized and term not in top_level_function_serialized:
            issues.append(f"slope-field solution should preserve {term!r}")
    hidden_total = hidden_mark_total("\n".join(solution_texts))
    diagram_solution_marks = sum(
        int(part.get("marks") or 0)
        for part in parts
        if isinstance(part, dict)
        and part.get("answerSurface") == "diagram"
        and isinstance(part.get("solutionDiagram"), dict)
    )
    if hidden_total + diagram_solution_marks != 8:
        issues.append("slope-field hidden [[marks:n]] ticks plus completed solution diagrams should total 8")
    if visible_mark_note_count("\n".join(solution_texts)):
        issues.append("slope-field solution should use hidden [[marks:n]] ticks, not visible mark notes")
    return issues


def assert_real_specialist_argand_call(call: dict[str, Any]) -> list[str]:
    issues, args = assert_source_question_common(call)
    if args is None:
        return issues

    serialized = call_text(call).lower()
    for term in ("argand", "z1", "z2", "polar", "cartesian", "locus", "circle"):
        if term not in serialized.replace("_", ""):
            issues.append(f"argand source conversion should preserve {term!r}")

    graph_types = graph_config_types(args)
    if "graph2d" not in graph_types:
        issues.append(f"argand plane and locus diagrams should use graph2d, got {sorted(graph_types)!r}")
    if any(graph_type in graph_types for graph_type in ("statsChart", "setDiagram", "network")):
        issues.append("argand/locus source should not use statsChart, setDiagram, or network")
    graph_serialized_raw = json.dumps(collect_diagram_graph_configs(args), ensure_ascii=False).lower()
    graph_serialized = compact_math_text(graph_serialized_raw)
    for term in ("re", "im", "z1", "z2"):
        if term not in graph_serialized and term not in serialized:
            issues.append(f"argand diagram should preserve {term!r} labels")
    if not any(term in graph_serialized for term in ("circle", "x^2", "y-1", "region", "shade", "locus")):
        issues.append("argand locus graph should encode the circular shaded region semantics")
    for config in collect_diagram_graph_configs(args):
        if config.get("type") != "graph2d":
            continue
        features = config.get("features")
        if not isinstance(features, list):
            continue
        for index, feature in enumerate(features):
            if not isinstance(feature, dict):
                continue
            for key in ("expressionTop", "expressionBottom", "opacity", "fillColor"):
                if key in feature:
                    issues.append(f"argand graph2d.features[{index}].{key} is not supported")
            if feature.get("kind") == "region_clipped_by_curve" and not feature.get("clipSide"):
                issues.append(f"argand graph2d.features[{index}].clipSide should be set for clipped regions")

    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) != 4:
        issues.append("argand source should become exactly four structured parts")
        return issues
    expected_marks = [2, 1, 2, 4]
    expected_terms = (("z", "polar"), ("cartesian",), ("plot", "z"), ("locus", "inequalities"))
    has_question_level_diagram_surface = args.get("answerSurface") == "diagram" and isinstance(
        args.get("diagram"), dict
    )
    for index, part in enumerate(parts):
        if not isinstance(part, dict):
            issues.append(f"parts[{index}] should be an object")
            continue
        if part.get("marks") != expected_marks[index]:
            issues.append(f"parts[{index}].marks should be {expected_marks[index]}")
        part_text = str(part.get("text") or "").lower()
        for term in expected_terms[index]:
            if term not in part_text:
                issues.append(f"parts[{index}].text should preserve {term!r}")
        uses_question_level_diagram_surface = index == 2 and has_question_level_diagram_surface and "plot" in part_text
        if (
            not uses_question_level_diagram_surface
            and part.get("answerSurface") != "diagram"
            and (not isinstance(part.get("studentSpaceLines"), int) or part["studentSpaceLines"] < 3)
        ):
            issues.append(f"parts[{index}].studentSpaceLines should be at least 3")
    locus_solution_text = (
        compact_math_text(str(parts[3].get("solutionText") or "")) if isinstance(parts[3], dict) else ""
    )
    if "arg(z)" not in locus_solution_text or "arg(z-i)" in locus_solution_text:
        issues.append("argand locus solution should preserve the official Arg(z) bounds, not shift them to Arg(z-i)")

    solution_texts = collect_solution_texts(args)
    solution_serialized = compact_math_text("\n".join(solution_texts))
    for term in ("2cis", "5pi/6", "sqrt", "z-i", "arg", "pi/6"):
        if term not in solution_serialized:
            issues.append(f"argand solution should preserve {term!r}")
    if "5pi/6" not in solution_serialized:
        issues.append("argand locus solution should preserve upper argument bound 5pi/6")
    if hidden_mark_total("\n".join(solution_texts)) != 9:
        issues.append("argand hidden [[marks:n]] total should be exactly 9")
    if visible_mark_note_count("\n".join(solution_texts)):
        issues.append("argand solution should use hidden [[marks:n]] ticks, not visible mark notes")
    return issues


def graph3d_solid_entries(configs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    solids: list[dict[str, Any]] = []
    for config in configs:
        data = config.get("data")
        if not isinstance(data, dict):
            continue
        for key in ("solids", "surfaces"):
            values = data.get(key)
            if not isinstance(values, list):
                continue
            solids.extend(value for value in values if isinstance(value, dict))
    return solids


def graph3d_solid_kind(value: dict[str, Any]) -> str:
    return re.sub(r"[^a-z]", "", str(value.get("kind") or value.get("type") or "").lower())


def graph3d_face_entries(configs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    faces: list[dict[str, Any]] = []
    for config in configs:
        data = config.get("data")
        if not isinstance(data, dict):
            continue
        values = data.get("faces")
        if not isinstance(values, list):
            continue
        faces.extend(value for value in values if isinstance(value, dict))
    return faces


def graph3d_common_schema_issues(configs: list[dict[str, Any]], label: str) -> list[str]:
    issues: list[str] = []
    for config in configs:
        data = config.get("data")
        point_ids: set[str] = set()
        if isinstance(data, dict):
            points = data.get("points") if isinstance(data.get("points"), list) else data.get("vertices")
            for point in points if isinstance(points, list) else []:
                if not isinstance(point, dict):
                    continue
                point_id = graph3d_point_key(point.get("id") or point.get("name") or point.get("label"))
                if point_id:
                    point_ids.add(point_id)
            for axis_point_id in ("xaxis", "yaxis", "zaxis"):
                if axis_point_id in point_ids:
                    issues.append(f"{label} graph3d data should not include axis helper point {axis_point_id}")
            segments = data.get("segments") if isinstance(data.get("segments"), list) else data.get("edges")
            for segment in segments if isinstance(segments, list) else []:
                if not isinstance(segment, dict):
                    continue
                if "style" in segment:
                    issues.append(f"{label} graph3d segments should use strokeStyle/dashed, not style")
                segment_points = segment.get("points") if isinstance(segment.get("points"), list) else []
                from_id = graph3d_point_key(segment.get("from") or (segment_points[0] if segment_points else ""))
                to_id = graph3d_point_key(segment.get("to") or (segment_points[1] if len(segment_points) > 1 else ""))
                if any(point in {"xaxis", "yaxis", "zaxis"} for point in (from_id, to_id)):
                    issues.append(f"{label} graph3d data should not include axis helper segments")
            for face in data.get("faces") if isinstance(data.get("faces"), list) else []:
                if isinstance(face, dict) and "style" in face:
                    issues.append(f"{label} graph3d faces should use fillColor/strokeColor, not style")
        metadata = config.get("metadata") if isinstance(config.get("metadata"), dict) else {}
        for key in ("axisLabels", "showAxes", "showGrid"):
            if key in metadata:
                issues.append(f"{label} graph3d metadata should not include unsupported {key}")
        view3d = metadata.get("view3d") if isinstance(metadata.get("view3d"), dict) else {}
        if not view3d:
            issues.append(f"{label} graph3d data should preserve metadata.view3d")
            continue
        if "camera" in view3d:
            issues.append(f"{label} graph3d view should use az/el/bank, not camera.eye")
        for key in ("az", "el", "bank"):
            value = view3d.get(key)
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                issues.append(f"{label} graph3d view3d.{key} should be numeric")
            else:
                limit = 3.2 if key == "el" else 6.4
                if abs(float(value)) > limit:
                    issues.append(f"{label} graph3d view3d.{key} should use radians, not degrees")
    return issues


def assert_graph3d_general_solids_call(call: dict[str, Any]) -> list[str]:
    issues, args = assert_source_question_common(call)
    if args is None:
        return issues

    serialized = call_text(call).lower()
    for term in ("square pyramid", "cone", "cylinder", "sphere", "radius", "height"):
        if term not in serialized:
            issues.append(f"graph3d solid-family source conversion should preserve {term!r}")

    graph_types = graph_config_types(args)
    if "graph3d" not in graph_types:
        issues.append(f"graph3d solid-family diagrams should use graph3d, got {sorted(graph_types)!r}")
    if any(graph_type in graph_types for graph_type in ("graph2d", "statsChart", "network", "setDiagram", "vector2d")):
        issues.append("graph3d solid-family source should not use 2D/statistics/network renderers")

    graph3d_configs = [config for config in collect_diagram_graph_configs(args) if config.get("type") == "graph3d"]
    if len(graph3d_configs) < 4:
        issues.append("graph3d solid-family source should include separate graph3d diagrams for pyramid, cone, cylinder, and sphere")
    issues.extend(graph3d_common_schema_issues(graph3d_configs, "graph3d solid-family"))

    point_coords, segment_pairs, _dashed_pairs = graph3d_semantics(graph3d_configs)
    expected_pyramid_coords = {
        "a": (0.0, 0.0, 0.0),
        "b": (4.0, 0.0, 0.0),
        "c": (4.0, 4.0, 0.0),
        "d": (0.0, 4.0, 0.0),
        "v": (2.0, 2.0, 3.0),
    }
    for point_id, coords in expected_pyramid_coords.items():
        if not graph3d_close_coords(point_coords.get(point_id), coords):
            issues.append(f"graph3d pyramid point {point_id.upper()} should have coordinates {coords}")
    for pair in (("a", "b"), ("b", "c"), ("c", "d"), ("a", "d"), ("a", "v"), ("b", "v"), ("c", "v"), ("d", "v")):
        if tuple(sorted(pair)) not in segment_pairs:
            issues.append(f"graph3d pyramid should include segment {''.join(pair).upper()}")
    if len(graph3d_face_entries(graph3d_configs)) < 5:
        issues.append("graph3d pyramid diagram should include polygon faces, not just edge lines")

    solids = graph3d_solid_entries(graph3d_configs)
    solid_kinds = {graph3d_solid_kind(solid) for solid in solids}
    for required_kind in ("cone", "cylinder", "sphere"):
        if required_kind not in solid_kinds:
            issues.append(f"graph3d solid-family graph3d data should include a {required_kind} solid")
    for solid in solids:
        kind = graph3d_solid_kind(solid)
        if kind == "cone":
            if "baseCenter" not in solid or ("apex" not in solid and "height" not in solid):
                issues.append("graph3d cone solid should include baseCenter plus apex or height")
        if kind == "cylinder":
            if "baseCenter" not in solid or ("topCenter" not in solid and "height" not in solid):
                issues.append("graph3d cylinder solid should include baseCenter plus topCenter or height")
        if kind == "sphere":
            if "center" not in solid:
                issues.append("graph3d sphere solid should include center")
        if kind in {"cone", "cylinder", "sphere"}:
            radius = solid.get("radius")
            if isinstance(radius, bool) or not isinstance(radius, (int, float)) or radius <= 0:
                issues.append(f"graph3d {kind} solid should include a positive radius")

    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) != 4:
        issues.append("graph3d solid-family source should become exactly four structured parts")
        return issues
    expected_marks = [2, 2, 2, 2]
    expected_terms = (("pyramid", "vertices", "height"), ("cone", "radius", "height"), ("cylinder", "radius", "height"), ("sphere", "radius"))
    for index, part in enumerate(parts):
        if not isinstance(part, dict):
            issues.append(f"parts[{index}] should be an object")
            continue
        if part.get("marks") != expected_marks[index]:
            issues.append(f"parts[{index}].marks should be {expected_marks[index]}")
        part_text = str(part.get("text") or "").lower()
        for term in expected_terms[index]:
            if term not in part_text:
                issues.append(f"parts[{index}].text should preserve {term!r}")
        if not isinstance(part.get("studentSpaceLines"), int) or part["studentSpaceLines"] < 3:
            issues.append(f"parts[{index}].studentSpaceLines should be at least 3")

    solution_texts = collect_solution_texts(args)
    solution_serialized = "\n".join(solution_texts).lower()
    for term in ("a,b,c,d,v", "20\\pi", "9\\pi", "16\\pi"):
        if term not in solution_serialized.replace(" ", "") and term not in solution_serialized:
            issues.append(f"graph3d solid-family solution should preserve {term!r}")
    if hidden_mark_total("\n".join(solution_texts)) != 8:
        issues.append("graph3d solid-family hidden [[marks:n]] total should be exactly 8")
    if visible_mark_note_count("\n".join(solution_texts)):
        issues.append("graph3d solid-family solution should use hidden [[marks:n]] ticks, not visible mark notes")
    return issues


def assert_real_specialist_spherical_cap_call(call: dict[str, Any]) -> list[str]:
    issues, args = assert_source_question_common(call)
    if args is None:
        return issues

    serialized = call_text(call).lower()
    compact_serialized = compact_math_text(serialized)
    for term in ("spherical cap", "depth", "solid sphere"):
        if term not in serialized:
            issues.append(f"spherical-cap source conversion should preserve {term!r}")
    if "radius" not in serialized or "10" not in serialized:
        issues.append("spherical-cap source conversion should preserve radius 10")
    if "xaxis" not in compact_serialized:
        issues.append("spherical-cap source conversion should preserve the x axis of revolution")
    for term in ("h", "10", "20"):
        if term not in serialized:
            issues.append(f"spherical-cap source conversion should preserve visible label/value {term!r}")
    if "x^2+y^2=20x" not in compact_serialized and "x2+y2=20x" not in compact_serialized:
        issues.append("spherical-cap source conversion should preserve x^2 + y^2 = 20x")

    graph_types = graph_config_types(args)
    if "graph2d" not in graph_types:
        issues.append(f"spherical-cap cross-section should use graph2d, got {sorted(graph_types)!r}")
    if "graph3d" not in graph_types:
        issues.append(f"spherical-cap solid diagram should use graph3d, got {sorted(graph_types)!r}")
    if any(graph_type in graph_types for graph_type in ("statsChart", "setDiagram", "network", "vector2d")):
        issues.append("spherical-cap source should not use statsChart, setDiagram, network, or vector2d")

    graph_configs = collect_diagram_graph_configs(args)
    graph2d_configs = [config for config in graph_configs if config.get("type") == "graph2d"]
    graph2d_serialized_raw = json.dumps(graph2d_configs, ensure_ascii=False).lower()
    graph2d_serialized = compact_math_text(graph2d_serialized_raw)
    if graph2d_configs and not any(
        term in graph2d_serialized
        for term in (
            "x^2+y^2=20*x",
            "x^2+y^2=20x",
            "x2+y2=20x",
            "20*x-x^2",
            "20x-x2",
        )
    ):
        issues.append("spherical-cap graph2d cross-section should encode x^2 + y^2 = 20x or y^2 = 20x - x^2")
    if graph2d_configs and not any(
        term in graph2d_serialized_raw for term in ("region_curve_axis", "region_between_curves", "shade")
    ):
        issues.append("spherical-cap graph2d cross-section should encode the shaded generating region")
    for term in ("h", "10", "20"):
        if graph2d_configs and term not in graph2d_serialized_raw:
            issues.append(f"spherical-cap graph2d cross-section should preserve diagram label/value {term!r}")

    graph3d_configs = [config for config in graph_configs if config.get("type") == "graph3d"]
    graph3d_serialized = json.dumps(graph3d_configs, ensure_ascii=False).lower()
    solids = graph3d_solid_entries(graph3d_configs)
    solid_kinds = {graph3d_solid_kind(solid) for solid in solids}
    if "spherecap" not in solid_kinds and "sphericalcap" not in solid_kinds:
        issues.append("spherical-cap graph3d data should use a sphereCap solid, not a full sphere placeholder")
    if "sphere" in solid_kinds and "spherecap" not in solid_kinds and "sphericalcap" not in solid_kinds:
        issues.append("spherical-cap graph3d data should not represent the cap as only a full sphere")
    cap_solids = [solid for solid in solids if graph3d_solid_kind(solid) in {"spherecap", "sphericalcap"}]
    for index, solid in enumerate(cap_solids):
        radius = solid.get("radius")
        if (
            isinstance(radius, bool)
            or not isinstance(radius, (int, float))
            or not approximately(radius, 10, tolerance=0.25)
        ):
            issues.append(f"spherical-cap graph3d sphereCap[{index}].radius should preserve source radius 10")
        height = solid.get("height", solid.get("depth"))
        if isinstance(height, bool) or not isinstance(height, (int, float)) or height <= 0:
            issues.append(f"spherical-cap graph3d sphereCap[{index}] should include a positive height/depth")
        if "axis" not in solid and "normal" not in solid:
            issues.append(f"spherical-cap graph3d sphereCap[{index}] should include the cap axis/normal")
        if "center" not in solid:
            issues.append(f"spherical-cap graph3d sphereCap[{index}] should include the sphere center")
    for config in graph3d_configs:
        data = config.get("data")
        if isinstance(data, dict):
            for segment in data.get("segments") if isinstance(data.get("segments"), list) else []:
                if isinstance(segment, dict) and "style" in segment:
                    issues.append("spherical-cap graph3d segments should use strokeStyle/dashed, not style")
        metadata = config.get("metadata") if isinstance(config.get("metadata"), dict) else {}
        for key in ("axisLabels", "showAxes", "showGrid"):
            if key in metadata:
                issues.append(f"spherical-cap graph3d metadata should not include unsupported {key}")
        view3d = metadata.get("view3d") if isinstance(metadata.get("view3d"), dict) else {}
        if not view3d:
            issues.append("spherical-cap graph3d data should preserve metadata.view3d")
        else:
            if "camera" in view3d:
                issues.append("spherical-cap graph3d view should use az/el/bank, not camera.eye")
            for key in ("az", "el", "bank"):
                value = view3d.get(key)
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    issues.append(f"spherical-cap graph3d view3d.{key} should be numeric")
    if "h" not in graph3d_serialized:
        issues.append("spherical-cap graph3d diagram should preserve the visible depth label h")

    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) != 2:
        issues.append("spherical-cap source should become exactly two structured parts")
        return issues
    expected_marks = [1, 4]
    expected_terms = (("show", "circle", "20x"), ("volume", "spherical cap", "h"))
    if args.get("marks") not in (0, None) or args.get("questionMarks") not in (0, None):
        issues.append(
            "spherical-cap multipart source should keep top-level marks/questionMarks at 0 and preserve marks on parts"
        )
    for index, part in enumerate(parts):
        if not isinstance(part, dict):
            issues.append(f"parts[{index}] should be an object")
            continue
        if part.get("marks") != expected_marks[index]:
            issues.append(f"parts[{index}].marks should be {expected_marks[index]}")
        part_text = str(part.get("text") or "").lower()
        part_compact = compact_math_text(part_text)
        for term in expected_terms[index]:
            if term not in part_text and term not in part_compact:
                issues.append(f"parts[{index}].text should preserve {term!r}")
        if not isinstance(part.get("studentSpaceLines"), int) or part["studentSpaceLines"] < 3:
            issues.append(f"parts[{index}].studentSpaceLines should be at least 3")

    solution_texts = collect_solution_texts(args)
    solution_serialized = compact_math_text("\n".join(solution_texts))
    expected_solution_terms = (
        ("(x-10)^2",),
        ("10^2", "100"),
        ("x^2+y^2=20x", "x2+y2=20x"),
        ("y^2=20x-x^2", "y2=20x-x2"),
        ("∫_0^h", "int_0^h", "from0toh"),
        ("π(20x-x^2)", "pi(20x-x^2)", "pi(20*x-x^2)"),
        ("10h^2",),
        ("h^3/3",),
        (
            "πh^2(10-h/3)",
            "pih^2(10-h/3)",
            "pih^2/3(30-h)",
            "pih^2(30-h)/3",
            "pi(10h^2-h^3/3)",
        ),
    )
    for term_options in expected_solution_terms:
        if not any(compact_math_text(term) in solution_serialized for term in term_options):
            issues.append(f"spherical-cap solution should preserve one of {term_options!r}")
    if hidden_mark_total("\n".join(solution_texts)) != 5:
        issues.append("spherical-cap hidden [[marks:n]] total should be exactly 5")
    if visible_mark_note_count("\n".join(solution_texts)):
        issues.append("spherical-cap solution should use hidden [[marks:n]] ticks, not visible mark notes")
    return issues


def assert_real_specialist_prism_call(call: dict[str, Any]) -> list[str]:
    issues, args = assert_source_question_common(call)
    if args is None:
        return issues

    serialized = call_text(call).lower()
    for term in ("rectangular prism", "coordinate system", "main diagonal", "vector equation", "sphere"):
        if term not in serialized:
            issues.append(f"3d prism source conversion should preserve {term!r}")
    for vertex in ("o", "a", "b", "c", "t", "m"):
        if not re.search(rf"(?<![a-z]){re.escape(vertex)}(?![a-z])", serialized):
            issues.append(f"3d prism source conversion should preserve named vertex/point {vertex.upper()}")

    graph_types = graph_config_types(args)
    if "graph3d" not in graph_types:
        issues.append(f"3d prism source diagram should use graph3d, got {sorted(graph_types)!r}")
    if any(graph_type in graph_types for graph_type in ("graph2d", "statsChart", "network")):
        issues.append("3d prism source should not use graph2d, statsChart, or network")
    graph3d_configs = [config for config in collect_diagram_graph_configs(args) if config.get("type") == "graph3d"]
    graph3d_serialized = json.dumps(graph3d_configs, ensure_ascii=False).lower()
    point_ids: set[str] = set()
    segment_pairs: set[tuple[str, str]] = set()
    point_coords, semantic_segment_pairs, dashed_pairs = graph3d_semantics(graph3d_configs)
    for config in graph3d_configs:
        data = config.get("data")
        if not isinstance(data, dict):
            continue
        points = data.get("points") if isinstance(data.get("points"), list) else data.get("vertices")
        for point in points if isinstance(points, list) else []:
            if isinstance(point, dict):
                point_id = str(point.get("id") or point.get("name") or point.get("label") or "").lower()
                if point_id:
                    point_ids.add(point_id)
        segments = data.get("segments") if isinstance(data.get("segments"), list) else data.get("edges")
        for segment in segments if isinstance(segments, list) else []:
            if isinstance(segment, dict):
                if "style" in segment:
                    issues.append("3d prism graph3d segments should use strokeStyle/dashed, not style")
                segment_points = segment.get("points") if isinstance(segment.get("points"), list) else []
                from_value = segment.get("from") or (segment_points[0] if segment_points else "")
                to_value = segment.get("to") or (segment_points[1] if len(segment_points) > 1 else "")
                from_id = str(from_value).lower()
                to_id = str(to_value).lower()
                if from_id and to_id:
                    segment_pairs.add(tuple(sorted((from_id, to_id))))
        metadata = config.get("metadata") if isinstance(config.get("metadata"), dict) else {}
        for key in ("axisLabels", "showAxes", "showGrid"):
            if key in metadata:
                issues.append(f"3d prism graph3d metadata should not include unsupported {key}")
        view3d = metadata.get("view3d") if isinstance(metadata.get("view3d"), dict) else {}
        if not view3d:
            issues.append("3d prism graph3d data should preserve metadata.view3d")
        else:
            if "camera" in view3d:
                issues.append("3d prism graph3d view should use az/el/bank, not camera.eye")
            for key in ("az", "el", "bank"):
                value = view3d.get(key)
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    issues.append(f"3d prism graph3d view3d.{key} should be numeric")
                else:
                    limit = 3.2 if key == "el" else 6.4
                    if abs(float(value)) > limit:
                        issues.append(f"3d prism graph3d view3d.{key} should use radians, not degrees")
    for point_id in ("o", "a", "b", "c", "t", "m"):
        if point_id not in point_ids and f'"{point_id}"' not in graph3d_serialized:
            issues.append(f"3d prism graph3d data should include named point {point_id.upper()}")
    for axis_point_id in ("xaxis", "yaxis", "zaxis"):
        if axis_point_id in point_ids:
            issues.append(f"3d prism graph3d data should not include axis helper point {axis_point_id}")
    expected_coords = {
        "o": (0.0, 0.0, 0.0),
        "a": (2.0, 0.0, 0.0),
        "b": (2.0, 4.0, 0.0),
        "c": (0.0, 4.0, 0.0),
        "t": (0.0, 0.0, 3.0),
        "d": (2.0, 0.0, 3.0),
        "e": (2.0, 4.0, 3.0),
        "f": (0.0, 4.0, 3.0),
        "m": (0.0, 2.0, 1.5),
    }
    for point_id, coords in expected_coords.items():
        if not graph3d_close_coords(point_coords.get(point_id), coords):
            issues.append(f"3d prism graph3d point {point_id.upper()} should have coordinates {coords}")
    required_segments = (
        ("o", "a"),
        ("a", "b"),
        ("b", "c"),
        ("o", "c"),
        ("o", "t"),
        ("a", "d"),
        ("b", "e"),
        ("c", "f"),
        ("t", "d"),
        ("d", "e"),
        ("e", "f"),
        ("t", "f"),
        ("b", "t"),
        ("a", "m"),
    )
    for pair in required_segments:
        sorted_pair = tuple(sorted(pair))
        if (
            sorted_pair not in segment_pairs
            and sorted_pair not in semantic_segment_pairs
            and "".join(pair) not in graph3d_serialized
        ):
            issues.append(f"3d prism graph3d data should include segment {''.join(pair).upper()}")
    for pair in (("o", "c"), ("o", "t")):
        if tuple(sorted(pair)) not in dashed_pairs:
            issues.append(f"3d prism graph3d segment {''.join(pair).upper()} should be dashed/dotted like the source")
    for pair in segment_pairs:
        if any(point in {"xaxis", "yaxis", "zaxis"} for point in pair):
            issues.append("3d prism graph3d data should not include axis helper segments")

    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) != 3:
        issues.append("3d prism source should become exactly three structured parts")
        return issues
    expected_marks = [2, 3, 3]
    if args.get("marks") not in (0, None) or args.get("questionMarks") not in (0, None):
        issues.append(
            "3d prism multipart source should keep top-level marks/questionMarks at 0 and preserve marks on parts"
        )
    expected_terms = (("vector equation", "bt"), ("sphere",), ("am", "intersect", "bt"))
    for index, part in enumerate(parts):
        if not isinstance(part, dict):
            issues.append(f"parts[{index}] should be an object")
            continue
        if part.get("marks") != expected_marks[index]:
            issues.append(f"parts[{index}].marks should be {expected_marks[index]}")
        part_text = str(part.get("text") or "").lower()
        for term in expected_terms[index]:
            if term not in part_text:
                issues.append(f"parts[{index}].text should preserve {term!r}")
        if not isinstance(part.get("studentSpaceLines"), int) or part["studentSpaceLines"] < 3:
            issues.append(f"parts[{index}].studentSpaceLines should be at least 3")

    solution_texts = collect_solution_texts(args)
    solution_serialized = compact_math_text("\n".join(solution_texts))
    expected_solution_terms = (
        ("-2",),
        ("-4",),
        ("3",),
        ("1.5", "3/2"),
        ("7.25", "29/4"),
        ("doesnotintersect",),
    )
    for term_options in expected_solution_terms:
        if not any(term in solution_serialized for term in term_options):
            issues.append(f"3d prism solution should preserve one of {term_options!r}")
    if hidden_mark_total("\n".join(solution_texts)) != 8:
        issues.append("3d prism hidden [[marks:n]] total should be exactly 8")
    if visible_mark_note_count("\n".join(solution_texts)):
        issues.append("3d prism solution should use hidden [[marks:n]] ticks, not visible mark notes")
    return issues


def assert_real_specialist_implicit_call(call: dict[str, Any]) -> list[str]:
    issues, args = assert_source_question_common(call)
    if args is None:
        return issues

    serialized = call_text(call).lower()
    for term in ("implicitly defines", "curve", "slope", "origin", "points a and b"):
        if term not in serialized:
            issues.append(f"implicit-curve source conversion should preserve {term!r}")
    if "x" not in serialized or "y" not in serialized:
        issues.append("implicit-curve source conversion should preserve x/y variables")

    graph_types = graph_config_types(args)
    if "graph2d" not in graph_types:
        issues.append(f"implicit curve source diagram should use graph2d, got {sorted(graph_types)!r}")
    if any(graph_type in graph_types for graph_type in ("statsChart", "geometricConstruction", "network")):
        issues.append("implicit curve source should not use statsChart, geometricConstruction, or network")
    graph_serialized = json.dumps(collect_diagram_graph_configs(args), ensure_ascii=False).lower()
    compact_graph_serialized = compact_math_text(graph_serialized)
    if not all(term in compact_graph_serialized for term in ("x^3", "y^3", "3xy")):
        issues.append("implicit curve graph2d should encode the relation x^3 + y^3 = 3xy + y")
    graph_point_labels: set[str] = set()
    for config in collect_diagram_graph_configs(args):
        data = config.get("data") if isinstance(config.get("data"), dict) else {}
        candidate_lists = [config.get("features"), config.get("points"), data.get("features"), data.get("points")]
        for candidates in candidate_lists:
            if not isinstance(candidates, list):
                continue
            for candidate in candidates:
                if not isinstance(candidate, dict):
                    continue
                for key in ("id", "name", "label"):
                    value = candidate.get(key)
                    if isinstance(value, str) and value.strip():
                        graph_point_labels.add(compact_math_text(value))
    for label in ("o", "a", "b"):
        if label not in graph_point_labels:
            issues.append(f"implicit curve graph should preserve point label {label.upper()}")

    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) != 2:
        issues.append("implicit curve source should become exactly two structured parts")
        return issues
    expected_marks = [3, 3]
    expected_terms = (("implicit", "dy"), ("x", "coordinates", "a"))
    for index, part in enumerate(parts):
        if not isinstance(part, dict):
            issues.append(f"parts[{index}] should be an object")
            continue
        if part.get("marks") != expected_marks[index]:
            issues.append(f"parts[{index}].marks should be {expected_marks[index]}")
        part_text = str(part.get("text") or "").lower()
        for term in expected_terms[index]:
            if term not in part_text:
                issues.append(f"parts[{index}].text should preserve {term!r}")
        if not isinstance(part.get("studentSpaceLines"), int) or part["studentSpaceLines"] < 3:
            issues.append(f"parts[{index}].studentSpaceLines should be at least 3")

    solution_texts = collect_solution_texts(args)
    solution_serialized = compact_math_text("\n".join(solution_texts))
    for term in ("dy/dx", "3", "x^4", "-2x", "-1", "-0.475", "0.225"):
        if term not in solution_serialized:
            issues.append(f"implicit-curve solution should preserve {term!r}")
    if hidden_mark_total("\n".join(solution_texts)) != 6:
        issues.append("implicit-curve hidden [[marks:n]] total should be exactly 6")
    if visible_mark_note_count("\n".join(solution_texts)):
        issues.append("implicit-curve solution should use hidden [[marks:n]] ticks, not visible mark notes")
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


def graph2d_validation_issues_from_call(call: dict[str, Any]) -> list[dict[str, Any]]:
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return []
    issues: list[dict[str, Any]] = []
    for config_path, config in collect_diagram_graph_configs_with_paths(args):
        if config.get("type") != "graph2d":
            continue
        data = config.get("data")
        if isinstance(data, dict):
            for key in ("functions", "features"):
                if key in data:
                    issues.append(
                        {
                            "path": f"{config_path}.data.{key}",
                            "message": f"graph2d {key} must be top-level graphConfig.{key}, not graphConfig.data.{key}.",
                            "expected": f"{config_path}.{key}",
                        }
                    )
            if "xRange" in data:
                issues.append(
                    {
                        "path": f"{config_path}.data.xRange",
                        "message": "graph2d bounds must use top-level xMin/xMax.",
                        "expected": f"{config_path}.xMin/xMax or {config_path}.data.slopeField.xRange",
                    }
                )
            if "yRange" in data:
                issues.append(
                    {
                        "path": f"{config_path}.data.yRange",
                        "message": "graph2d bounds must use top-level yMin/yMax.",
                        "expected": f"{config_path}.yMin/yMax or {config_path}.data.slopeField.yRange",
                    }
                )
        options = config.get("options")
        if isinstance(options, dict):
            for key in (
                "showGrid",
                "showAxes",
                "showAxisLabels",
                "showAxisNumbers",
                "width",
                "height",
                "widthPx",
                "heightPx",
            ):
                if key in options:
                    issues.append(
                        {
                            "path": f"{config_path}.options.{key}",
                            "message": "graph2d axes, size, bounds, functions, and features must be top-level graphConfig fields.",
                            "expected": f"{config_path}.{key if key not in {'width', 'height'} else key + 'Px'}",
                        }
                    )
        functions = config.get("functions")
        if isinstance(functions, list):
            for index, function in enumerate(functions):
                if not isinstance(function, dict):
                    continue
                if "domain" in function:
                    issues.append(
                        {
                            "path": f"{config_path}.functions[{index}].domain",
                            "message": "graph2d function domains must use domainMin/domainMax.",
                            "expected": "domainMin/domainMax",
                        }
                    )
                if "style" in function:
                    issues.append(
                        {
                            "path": f"{config_path}.functions[{index}].style",
                            "message": "graph2d function styling must use direct color/strokeWidth/strokeStyle fields.",
                            "expected": "color/strokeWidth/strokeStyle",
                        }
                    )
        features = config.get("features")
        if isinstance(features, list):
            for index, feature in enumerate(features):
                if not isinstance(feature, dict):
                    continue
                if "type" in feature and "kind" not in feature:
                    issues.append(
                        {
                            "path": f"{config_path}.features[{index}].type",
                            "message": "graph2d features must use kind, not type.",
                            "expected": "kind",
                        }
                    )
                if "style" in feature:
                    issues.append(
                        {
                            "path": f"{config_path}.features[{index}].style",
                            "message": "graph2d feature styling must use direct color/size/strokeWidth/strokeStyle fields.",
                            "expected": "color/size/strokeWidth/strokeStyle",
                        }
                    )
                for key in ("expressionTop", "expressionBottom"):
                    if key in feature:
                        issues.append(
                            {
                                "path": f"{config_path}.features[{index}].{key}",
                                "message": "graph2d region features must reference boundary functions by index, not inline expressions.",
                                "expected": "graphConfig.functions plus functionAIndex/functionBIndex or baseFeatureIndex/clipFunctionIndex",
                            }
                        )
                if "opacity" in feature:
                    issues.append(
                        {
                            "path": f"{config_path}.features[{index}].opacity",
                            "message": "graph2d region shading opacity must use fillOpacity.",
                            "expected": "fillOpacity",
                        }
                    )
                if "fillColor" in feature:
                    issues.append(
                        {
                            "path": f"{config_path}.features[{index}].fillColor",
                            "message": "graph2d feature colour must use color.",
                            "expected": "color",
                        }
                    )
    return issues


def real_slope_field_repair_failure_output(call: dict[str, Any], first_issues: list[str]) -> dict[str, Any]:
    validation_issues = graph2d_validation_issues_from_call(call)
    for issue in first_issues:
        if "solution-curve relation" in issue:
            validation_issues.append(
                {
                    "path": "arguments.solutionDiagram.graphConfig.functions",
                    "message": (
                        "The slope-field solution curve should preserve the implicit source relation; use a "
                        "graph2d function with kind:'relation' and expression like y^2 = x^2/2 - x + 1/4."
                    ),
                    "expected": "graphConfig.functions[{ kind:'relation', expression:'y^2 = x^2/2 - x + 1/4' }]",
                }
            )
        if "preserve '1/4'" in issue:
            validation_issues.append(
                {
                    "path": "arguments.parts[1].solutionText",
                    "message": "Preserve the exact constant from the marking key as 1/4 in the solution.",
                    "expected": "1/4",
                }
            )
    if not validation_issues:
        validation_issues = [
            {
                "path": "arguments.diagram.graphConfig",
                "message": issue,
                "expected": "source-faithful native graph2d slope-field payload",
            }
            for issue in first_issues[:8]
        ]
    return validation_failure_output(
        tool_name=call.get("mauthToolName"),
        validation_issues=validation_issues,
        message="Mauth graph2d validation failed.",
    )


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
    "real-specialist-lighthouse": {
        "prompt": (
            "Create Question 1 from the attached Specialist exam screenshot and official marking-key excerpt. "
            "Preserve the diagram, marks, and mathematical wording, and include the worked solution from the key."
        ),
        "summary": sample_document_summary,
        "attachments": sample_specialist_lighthouse_screenshot_with_key,
        "assert": assert_real_lighthouse_question_call,
    },
    "real-specialist-stats": {
        "prompt": (
            "Create Question 1 from the attached Specialist exam screenshots and official marking-key excerpt. "
            "Preserve the statistics graphs/table, structured parts, marks, and include the worked solutions."
        ),
        "summary": sample_document_summary,
        "attachments": sample_specialist_stats_screenshot_with_key,
        "assert": assert_real_specialist_stats_call,
    },
    "real-methods-earthquake": {
        "prompt": (
            "Create Question 1 from the attached Methods exam screenshots and official marking-key excerpt. "
            "Preserve the coordinate graph, structured parts, marks, and include the worked solutions."
        ),
        "summary": sample_document_summary,
        "attachments": sample_methods_earthquake_screenshot_with_key,
        "assert": assert_real_methods_earthquake_call,
    },
    "real-methods-ev-histogram": {
        "prompt": (
            "Create Question 1 from the attached Methods exam screenshots and official marking-key excerpt. "
            "Preserve the normal-distribution wording, histogram, structured parts, marks, and include the worked solutions."
        ),
        "summary": sample_document_summary,
        "attachments": sample_methods_ev_histogram_screenshot_with_key,
        "assert": assert_real_methods_ev_histogram_call,
    },
    "real-methods-dice-game": {
        "prompt": (
            "Create Question 1 from the attached Methods exam screenshots and official marking-key excerpt. "
            "Preserve the frequency chart, probability table, structured parts, marks, and include the worked solutions."
        ),
        "summary": sample_document_summary,
        "attachments": sample_methods_dice_game_screenshot_with_key,
        "assert": assert_real_methods_dice_game_call,
    },
    "real-specialist-slope-field": {
        "prompt": (
            "Create Question 1 from the attached Specialist exam screenshots and official marking-key excerpt. "
            "Preserve the slope-field graph, solution-curve task, structured parts, marks, and include the worked solutions."
        ),
        "summary": sample_document_summary,
        "attachments": sample_specialist_slope_field_screenshot_with_key,
        "assert": assert_real_specialist_slope_field_call,
        "repairOnFailure": real_slope_field_repair_failure_output,
    },
    "real-specialist-argand": {
        "prompt": (
            "Create Question 1 from the attached Specialist exam screenshots and official marking-key excerpt. "
            "Preserve the Argand diagrams, locus shading, structured parts, marks, and include the worked solutions."
        ),
        "summary": sample_document_summary,
        "attachments": sample_specialist_argand_screenshot_with_key,
        "assert": assert_real_specialist_argand_call,
    },
    "real-specialist-spherical-cap": {
        "prompt": (
            "Create Question 1 from the attached Specialist exam screenshot and official marking-key excerpt. "
            "Preserve the spherical-cap cross-section and 3D cap diagrams, structured parts, marks, and include the worked solutions."
        ),
        "summary": sample_document_summary,
        "attachments": sample_specialist_spherical_cap_screenshot_with_key,
        "assert": assert_real_specialist_spherical_cap_call,
    },
    "real-specialist-prism": {
        "prompt": (
            "Create Question 1 from the attached Specialist exam screenshots and official marking-key excerpt. "
            "Preserve the 3D coordinate prism diagram, structured parts, marks, and include the worked solutions."
        ),
        "summary": sample_document_summary,
        "attachments": sample_specialist_prism_screenshot_with_key,
        "assert": assert_real_specialist_prism_call,
    },
    "real-specialist-implicit": {
        "prompt": (
            "Create Question 1 from the attached Specialist exam screenshots and official marking-key excerpt. "
            "Preserve the implicit curve diagram, structured parts, marks, and include the worked solutions."
        ),
        "summary": sample_document_summary,
        "attachments": sample_specialist_implicit_screenshot_with_key,
        "assert": assert_real_specialist_implicit_call,
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
            actual="network",
            expected="vector2d",
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
    "real-exams-core": ["real-methods-earthquake", "real-specialist-lighthouse", "real-specialist-stats"],
    "real-exams-methods-stats": ["real-methods-ev-histogram", "real-methods-dice-game"],
    "real-exams-extended": [
        "real-specialist-slope-field",
        "real-specialist-argand",
        "real-specialist-spherical-cap",
        "real-specialist-prism",
        "real-specialist-implicit",
    ],
    "real-exams-graph3d": ["real-specialist-spherical-cap", "real-specialist-prism"],
    "real-exams": [
        "real-methods-earthquake",
        "real-methods-ev-histogram",
        "real-methods-dice-game",
        "real-specialist-lighthouse",
        "real-specialist-stats",
        "real-specialist-slope-field",
        "real-specialist-argand",
        "real-specialist-spherical-cap",
        "real-specialist-prism",
        "real-specialist-implicit",
    ],
}


def local_tool_call(name: str, mauth_tool_name: str, mauth_arguments: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"local-{name}",
        "callId": f"local-{name}",
        "name": name,
        "arguments": mauth_arguments,
        "mauthToolName": mauth_tool_name,
        "mauthArguments": mauth_arguments,
    }


def local_source_question_call(mauth_arguments: dict[str, Any]) -> dict[str, Any]:
    return local_tool_call("mauth_convert_source_question", QUESTION_UPSERT_TOOL_NAME, mauth_arguments)


def local_real_methods_earthquake_call() -> dict[str, Any]:
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 0,
            "questionMarks": 0,
            "questionText": (
                "An earthquake has seismic moment $M_0=3.16\\times10^{13}$. The graph shows the "
                "relationship between moment magnitude $M_w$ and $\\log_{10}(M_0)$."
            ),
            "diagram": {
                "diagramAlign": "center",
                "graphConfig": {
                    "type": "graph2d",
                    "xMin": 8,
                    "xMax": 16,
                    "yMin": 0,
                    "yMax": 5,
                    "widthPx": 620,
                    "heightPx": 420,
                    "xAxisLabel": "$\\log_{10}(M_0)$",
                    "yAxisLabel": "$M_w$",
                    "functions": [{"expression": "y=(2/3)x-6", "color": "#1d4ed8", "strokeWidth": 2}],
                },
            },
            "parts": [
                {
                    "label": "a",
                    "text": "For $M_0=3.16\\times10^{13}$, determine $\\log_{10}(M_0)$.",
                    "marks": 2,
                    "studentSpaceLines": 4,
                    "includeSolution": True,
                    "solutionText": "$$\\log_{10}(3.16\\times10^{13})=13.5.$$ [[marks:2]]",
                },
                {
                    "label": "b",
                    "text": "Use points A and B on the graph to determine the gradient.",
                    "marks": 2,
                    "studentSpaceLines": 4,
                    "includeSolution": True,
                    "solutionText": "$$m=\\frac{4-2}{15-12}=\\frac23.$$ [[marks:2]]",
                },
                {
                    "label": "c",
                    "text": "Find the relationship in the form $M_w=a\\log_{10}(M_0)+b$.",
                    "marks": 3,
                    "studentSpaceLines": 6,
                    "includeSolution": True,
                    "solutionText": "$$M_w=\\frac23\\log_{10}(M_0)-6,$$ so $M_w=3$ when $M_0=10^{13.5}$. [[marks:3]]",
                },
                {
                    "label": "d",
                    "text": "Find the seismic moment for an earthquake of magnitude 4.",
                    "marks": 2,
                    "studentSpaceLines": 5,
                    "includeSolution": True,
                    "solutionText": (
                        "When $M_w=4$, $4=\\frac23\\log_{10}(M_0)-6$, so $M_0=10^{15}$. "
                        "When $M_w=0$, $M_0=10^9$. [[marks:2]]"
                    ),
                },
            ],
        }
    )


def local_real_methods_earthquake_bad_line_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_methods_earthquake_call()))
    call["mauthArguments"]["diagram"]["graphConfig"]["functions"][0]["expression"] = "y = (3/2)x + 6"
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_methods_ev_histogram_call() -> dict[str, Any]:
    histogram_counts = {
        270: 4,
        290: 8,
        310: 10,
        330: 12,
        350: 18,
        370: 40,
        390: 54,
        410: 34,
        430: 20,
    }
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 0,
            "questionMarks": 0,
            "questionText": (
                "Brianna is considering buying an electric vehicle from Zaprer Motors. The distance $X$ before "
                "recharging is normally distributed with mean 350 km, and $P(X>400)=0.2525$. "
                "A rival company, Spruky Cars, provides a histogram from 200 trials."
            ),
            "diagram": {
                "diagramAlign": "center",
                "graphConfig": {
                    "type": "statsChart",
                    "widthPx": 620,
                    "heightPx": 400,
                    "data": {
                        "chartType": "histogram",
                        "dataMode": "manualFrequencies",
                        "barType": "continuous",
                        "yAxisMode": "frequency",
                        "xValues": list(histogram_counts),
                        "frequencies": list(histogram_counts.values()),
                        "binSize": 20,
                        "range": [260, 440],
                        "xLabel": "$W$",
                        "yLabel": "Frequency",
                    },
                },
            },
            "parts": [
                {
                    "label": "a",
                    "text": "Determine the standard deviation of $X$.",
                    "marks": 2,
                    "studentSpaceLines": 5,
                    "includeSolution": True,
                    "solutionText": (
                        "$$P(X>400)=0.2525$$ gives $z\\approx0.6666$, so "
                        "$$\\sigma=\\frac{400-350}{0.6666}\\approx75.$$ [[marks:2]]"
                    ),
                },
                {
                    "label": "b",
                    "text": "Calculate the probability Brianna can drive to Albany, 420 km away, without recharging.",
                    "marks": 1,
                    "studentSpaceLines": 4,
                    "includeSolution": True,
                    "solutionText": "$$P(X>420)=0.1753.$$ [[marks:1]]",
                },
                {
                    "label": "c",
                    "text": (
                        "Let $Y$ be the distance in miles where $1$ mile = $1.6$ kilometres. "
                        "Determine the expected value and variance of $Y$."
                    ),
                    "marks": 3,
                    "studentSpaceLines": 6,
                    "includeSolution": True,
                    "solutionText": (
                        "$$E(Y)=\\frac{350}{1.6}=218.75.$$ [[marks:1]]\n"
                        "$$\\operatorname{Var}(Y)=\\frac{75^2}{1.6^2}\\approx2197.$$ [[marks:2]]"
                    ),
                },
                {
                    "label": "d",
                    "text": "Using the histogram, decide whether a normal distribution is appropriate for Spruky distances.",
                    "marks": 2,
                    "studentSpaceLines": 4,
                    "includeSolution": True,
                    "solutionText": "No. The histogram is skewed/not symmetrical, so a normal model is not appropriate. [[marks:2]]",
                },
                {
                    "label": "e",
                    "text": (
                        "Assuming values are uniformly distributed within each interval, use the histogram to estimate "
                        "the expected distance for a Spruky vehicle."
                    ),
                    "marks": 2,
                    "studentSpaceLines": 5,
                    "includeSolution": True,
                    "solutionText": (
                        "Using midpoints gives "
                        "$$E(W)=270\\frac4{200}+290\\frac8{200}+\\cdots+430\\frac{20}{200}=375.8\\text{ km}.$$ [[marks:2]]"
                    ),
                },
                {
                    "label": "f",
                    "text": "Which company, Zaprer or Spruky, is more likely to get Brianna to Albany without recharging?",
                    "marks": 2,
                    "studentSpaceLines": 4,
                    "includeSolution": True,
                    "solutionText": (
                        "$$P(X>420)=0.1753$$ for Zaprer, while the histogram gives "
                        "$$P(W>420)=\\frac{20}{200}=0.1.$$ "
                        "Brianna is more likely to reach Albany in the Zaprer vehicle. [[marks:2]]"
                    ),
                },
            ],
        }
    )


def local_real_methods_ev_histogram_bad_renderer_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_methods_ev_histogram_call()))
    call["mauthArguments"]["diagram"]["graphConfig"] = {
        "type": "graph2d",
        "xMin": 260,
        "xMax": 440,
        "yMin": 0,
        "yMax": 60,
        "functions": [{"expression": "54e^{-((x-390)^2)/400}"}],
    }
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_methods_ev_histogram_bad_counts_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_methods_ev_histogram_call()))
    frequencies = call["mauthArguments"]["diagram"]["graphConfig"]["data"]["frequencies"]
    frequencies[-1] = 0
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_methods_dice_game_call() -> dict[str, Any]:
    frequency_counts = {1: 66, 2: 113, 3: 108, 4: 57, 5: 57, 6: 40, 7: 26, 8: 13, 9: 6, 10: 3, 11: 4, 12: 5, 13: 2}
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 0,
            "questionMarks": 0,
            "questionText": (
                "Mr Ulam devises a game using four standard dice. Winning dice showing a 1 are removed, "
                "and the game ends when the player has two or more winning dice. Experimental frequency "
                "results from 500 games and a simulation table from 10 000 games are provided."
            ),
            "diagram": {
                "diagramAlign": "center",
                "graphConfig": {
                    "type": "statsChart",
                    "widthPx": 640,
                    "heightPx": 360,
                    "data": {
                        "chartType": "histogram",
                        "dataMode": "manualFrequencies",
                        "barType": "discrete",
                        "yAxisMode": "frequency",
                        "xValues": list(frequency_counts),
                        "frequencies": list(frequency_counts.values()),
                        "xLabel": "$x$",
                        "yLabel": "$f$",
                    },
                },
            },
            "tables": [
                {
                    "caption": "Simulated probability distribution for $X$",
                    "headers": ["x", "1", "2", "3", "4", "5", "6", "7", "8"],
                    "rows": [["P(X=x)", "0.134", "0.215", "0.208", "0.153", "0.106", "0.067", "0.047", "0.030"]],
                },
                {
                    "headers": ["x", "9", "10", "11", "12", "13", "14", "15", "16"],
                    "rows": [["P(X=x)", "0.016", "0.012", "0.005", "0.003", "0.002", "0.001", "0.001", "0.000"]],
                },
            ],
            "parts": [
                {
                    "label": "a",
                    "text": "Using the experimental data, estimate the probability of winning exactly two rolls and not winning in two or less rolls.",
                    "marks": 3,
                    "studentSpaceLines": 5,
                    "includeSolution": True,
                    "solutionText": (
                        "$$P(X=2)=\\frac{113}{500}=0.226.$$ [[marks:1]]\n"
                        "$$P(X>2)=1-\\frac{66+113}{500}=0.642.$$ [[marks:2]]"
                    ),
                },
                {
                    "label": "b",
                    "text": "State two reasons why the game cannot be modelled using a binomial distribution.",
                    "marks": 2,
                    "studentSpaceLines": 4,
                    "includeSolution": True,
                    "solutionText": (
                        "The number of rolls is not fixed, and the trials are not independent because removed dice "
                        "change later rolls. [[marks:2]]"
                    ),
                },
                {
                    "label": "c",
                    "text": "Using the simulation data, complete the probability distribution table for player profit $Y$.",
                    "marks": 3,
                    "studentSpaceLines": 5,
                    "includeSolution": True,
                    "solutionText": "$$P(Y=-1)=0.443,\\quad P(Y=0)=0.208,\\quad P(Y=1)=0.349.$$ [[marks:3]]",
                },
                {
                    "label": "d",
                    "text": "Calculate the expected value and variance of $Y$.",
                    "marks": 4,
                    "studentSpaceLines": 6,
                    "includeSolution": True,
                    "solutionText": (
                        "$$E(Y)=1(0.349)+0(0.208)-1(0.443)=-0.094.$$ [[marks:2]]\n"
                        "$$\\operatorname{Var}(Y)=(1+0.094)^2(0.349)+(0+0.094)^2(0.208)+(-1+0.094)^2(0.443)=0.783.$$ [[marks:2]]"
                    ),
                },
                {
                    "label": "e",
                    "text": "In the long run, do you expect the game to be profitable for the charity? Justify your answer.",
                    "marks": 2,
                    "studentSpaceLines": 4,
                    "includeSolution": True,
                    "solutionText": (
                        "Yes, the game is expected to be profitable for the charity. The expected profit to the player "
                        "is $-0.094$, so the expected profit to the charity is $0.094$ per game. [[marks:2]]"
                    ),
                },
            ],
        }
    )


def local_real_methods_dice_game_bad_renderer_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_methods_dice_game_call()))
    call["mauthArguments"]["diagram"]["graphConfig"] = {
        "type": "graph2d",
        "xMin": 0,
        "xMax": 14,
        "yMin": 0,
        "yMax": 120,
        "functions": [{"expression": "120e^{-0.25x}"}],
    }
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_methods_dice_game_bad_profit_table_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_methods_dice_game_call()))
    part_c = call["mauthArguments"]["parts"][2]
    part_c["solutionText"] = "$$P(Y=-1)=0.349,\\quad P(Y=0)=0.208,\\quad P(Y=1)=0.443.$$ [[marks:3]]"
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_methods_dice_game_split_solution_table_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_methods_dice_game_call()))
    call["mauthArguments"]["parts"] = [
        {
            "label": "a(i)",
            "text": "Using the experimental data, estimate the probability of winning exactly two rolls.",
            "marks": 1,
            "studentSpaceLines": 3,
            "includeSolution": True,
            "solutionText": "$$P(X=2)=\\frac{113}{500}=0.226.$$ [[marks:1]]",
        },
        {
            "label": "a(ii)",
            "text": "Estimate the probability of not winning in two or less rolls.",
            "marks": 2,
            "studentSpaceLines": 3,
            "includeSolution": True,
            "solutionText": "$$P(X>2)=1-\\frac{66+113}{500}=0.642.$$ [[marks:2]]",
        },
        {
            "label": "b",
            "text": "State two reasons why the game cannot be modelled using a binomial distribution.",
            "marks": 2,
            "studentSpaceLines": 4,
            "includeSolution": True,
            "solutionText": (
                "The number of rolls is not fixed, and the trials are not independent because removed dice "
                "change later rolls. [[marks:2]]"
            ),
        },
        {
            "label": "c",
            "text": "Using the simulation data, complete the probability distribution table for player profit $Y$.",
            "marks": 3,
            "answerSurface": "table",
            "table": {
                "headers": ["$y$", "$-1$", "$0$", "$1$"],
                "rows": [["$P(Y=y)$", "", "", ""]],
                "showHeader": False,
            },
            "solutionTable": {
                "headers": ["$y$", "$-1$", "$0$", "$1$"],
                "rows": [["$P(Y=y)$", "$1-0.349-0.208=0.443$", "$0.208$", "$0.134+0.215=0.349$"]],
                "showHeader": False,
            },
            "includeSolution": True,
            "solutionText": "The completed profit distribution is shown.",
        },
        {
            "label": "d(i)",
            "text": "Calculate the expected value of $Y$.",
            "marks": 2,
            "studentSpaceLines": 3,
            "includeSolution": True,
            "solutionText": "$$E(Y)=1(0.349)+0(0.208)-1(0.443)=-0.094.$$ [[marks:2]]",
        },
        {
            "label": "d(ii)",
            "text": "Calculate the variance of $Y$.",
            "marks": 2,
            "studentSpaceLines": 3,
            "includeSolution": True,
            "solutionText": (
                "$$\\operatorname{Var}(Y)=(1+0.094)^2(0.349)+(0+0.094)^2(0.208)"
                "+(-1+0.094)^2(0.443)=0.783.$$ [[marks:2]]"
            ),
        },
        {
            "label": "e",
            "text": "In the long run, do you expect the game to be profitable for the charity? Justify your answer.",
            "marks": 2,
            "studentSpaceLines": 4,
            "includeSolution": True,
            "solutionText": (
                "Yes, the game is expected to be profitable for the charity. The expected profit to the player "
                "is $-0.094$, so the expected profit to the charity is $0.094$ per game. [[marks:2]]"
            ),
        },
    ]
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_stats_call() -> dict[str, Any]:
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 0,
            "questionMarks": 0,
            "questionText": (
                "Anika claims that teenagers send me a text message with response times that have "
                "mean 3 minutes and standard deviation 2.4 minutes. A sample of 64 responses is recorded."
            ),
            "diagram": {
                "diagramAlign": "center",
                "graphConfig": {
                    "type": "statsChart",
                    "widthPx": 620,
                    "heightPx": 380,
                    "data": {
                        "chartType": "density",
                        "xLabel": "response time",
                        "points": [
                            {"x": 1.0, "y": 0.03},
                            {"x": 2.1, "y": 0.2},
                            {"x": 2.7, "y": 0.18},
                            {"x": 5.0, "y": 0.02},
                        ],
                    },
                },
            },
            "parts": [
                {
                    "label": "a",
                    "text": "Estimate the probability that a response time is between 150 and 210 seconds.",
                    "marks": 3,
                    "studentSpaceLines": 5,
                    "includeSolution": True,
                    "solutionText": "$$P(150<X<210)=0.904.$$ [[marks:3]]",
                },
                {
                    "label": "b",
                    "text": "Describe the sample mean distribution for samples of size 64.",
                    "marks": 2,
                    "studentSpaceLines": 4,
                    "includeSolution": True,
                    "solutionText": "$$\\mu_{\\bar X}=3,\\quad \\sigma_{\\bar X}=\\frac{2.4}{8}=0.3.$$ [[marks:2]]",
                },
                {
                    "label": "c",
                    "text": (
                        "Anika collected a table with sample size 100, mean 2.1 and standard deviation 2.7. "
                        "Comment on Anika's claim."
                    ),
                    "marks": 4,
                    "studentSpaceLines": 6,
                    "includeSolution": True,
                    "solutionText": (
                        "The interval from the normal calculation is $1.5708$ to $2.6292$. [[marks:2]]\n"
                        "The teenager-source claim is not accepted because the sample is biased and cannot prove it. [[marks:2]]"
                    ),
                },
            ],
        }
    )


def local_real_specialist_stats_bad_renderer_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_stats_call()))
    call["mauthArguments"]["diagram"]["graphConfig"] = {
        "type": "graph2d",
        "xMin": 0,
        "xMax": 6,
        "yMin": 0,
        "yMax": 0.25,
        "functions": [{"expression": "0.2e^{-x^2}"}],
    }
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_slope_field_call() -> dict[str, Any]:
    slope_graph = {
        "type": "graph2d",
        "xMin": -1,
        "xMax": 3,
        "yMin": -2,
        "yMax": 2,
        "widthPx": 620,
        "heightPx": 420,
        "showGrid": True,
        "showAxes": True,
        "functions": [
            {
                "kind": "relation",
                "expression": "y^2 = x^2/2 - x + 1/4",
                "color": "#1d4ed8",
                "strokeWidth": 2,
            }
        ],
        "features": [{"kind": "tangent", "functionIndex": 0, "x": 0.5, "label": "gradient 0.25"}],
        "data": {
            "slopeField": {
                "expression": "(x - 1) / (2*y)",
                "xRange": [-1, 3],
                "yRange": [-2, 2],
                "xStep": 0.5,
                "yStep": 0.5,
                "highlightedPoints": [{"x": 0.5, "y": -1, "label": "$(0.5,-1)$"}],
            }
        },
    }
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 0,
            "questionMarks": 0,
            "questionText": (
                "The diagram shows a slope field for $\\frac{dy}{dx}=\\frac{x-1}{2y}$ "
                "and a solution curve through $(0,0.5)$."
            ),
            "diagram": {"diagramAlign": "center", "graphConfig": slope_graph},
            "parts": [
                {
                    "label": "a",
                    "text": "Calculate $\\frac{dy}{dx}$ at $(0.5,-1)$ and draw the tangent direction on the slope field.",
                    "marks": 3,
                    "studentSpaceLines": 5,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": (
                        "$$\\frac{dy}{dx}=\\frac{0.5-1}{2(-1)}=0.25.$$ [[marks:2]]\n"
                        "The tangent segment at $(0.5,-1)$ has gradient $0.25$. [[marks:1]]"
                    ),
                },
                {
                    "label": "b",
                    "text": "Find the equation of the solution curve through $(0,0.5)$.",
                    "marks": 3,
                    "studentSpaceLines": 6,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": (
                        "$$2y\\frac{dy}{dx}=x-1,$$ so "
                        "$$y^2=\\frac{x^2}{2}-x+C.$$ [[marks:1]]\n"
                        "Using $(0,0.5)$ gives $C=1/4$, hence "
                        "$$y^2=\\frac{x^2}{2}-x+\\frac14.$$ [[marks:2]]"
                    ),
                },
                {
                    "label": "c",
                    "text": "Draw the solution curve on the slope-field diagram.",
                    "marks": 2,
                    "answerSurface": "diagram",
                    "diagram": {"graphConfig": slope_graph},
                    "solutionDiagram": {"graphConfig": slope_graph},
                },
            ],
        }
    )


def local_real_specialist_slope_field_bad_schema_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_slope_field_call()))
    graph_config = call["mauthArguments"]["diagram"]["graphConfig"]
    slope_field = graph_config["data"].pop("slopeField")
    graph_config["data"]["xRange"] = slope_field["xRange"]
    graph_config["data"]["yRange"] = slope_field["yRange"]
    graph_config["data"]["functions"] = [{"expression": "y^2 = x^2/2 - x + 1/4"}]
    graph_config["data"]["features"] = [{"type": "point", "x": 0.5, "y": -1, "style": {"color": "red"}}]
    graph_config["options"] = {"showGrid": True, "widthPx": 620}
    graph_config["functions"][0]["domain"] = [-1, 3]
    graph_config["functions"][0]["style"] = {"strokeWidth": 2}
    graph_config["features"] = [{"type": "point", "x": 0.5, "y": -1, "style": {"color": "red"}}]
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_slope_field_bad_artifact_marks_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_slope_field_call()))
    part_c = call["mauthArguments"]["parts"][2]
    part_c["solutionText"] = "Draw the completed solution curve on the slope field. [[marks:2]]"
    part_c["includeSolution"] = True
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_argand_call() -> dict[str, Any]:
    graph_config = {
        "type": "graph2d",
        "xMin": -4,
        "xMax": 4,
        "yMin": -2,
        "yMax": 5,
        "widthPx": 620,
        "heightPx": 420,
        "xAxisLabel": "Re",
        "yAxisLabel": "Im",
        "functions": [{"kind": "relation", "expression": "x^2 + (y - 1)^2 = 4", "color": "#2563eb"}],
        "features": [
            {"kind": "point", "x": -1, "y": 1.732, "label": "$z_1$"},
            {"kind": "point", "x": 2, "y": 0, "label": "$z_2$"},
            {
                "kind": "region_clipped_by_curve",
                "baseFeatureIndex": 0,
                "clipFunctionIndex": 0,
                "clipSide": "inside",
                "fillOpacity": 0.2,
                "label": "locus shaded circle",
            },
        ],
    }
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 0,
            "questionMarks": 0,
            "questionText": (
                "On the Argand diagram, complex numbers $z_1$ and $z_2$ are shown. "
                "Convert $z_1$ to polar form, give $z_2$ in Cartesian form, then describe "
                "the locus satisfying the circle and argument inequalities."
            ),
            "diagram": {"diagramAlign": "center", "graphConfig": graph_config},
            "parts": [
                {
                    "label": "a",
                    "text": "Express $z_1$ in polar form.",
                    "marks": 2,
                    "studentSpaceLines": 4,
                    "includeSolution": True,
                    "solutionText": "$$z_1=2cis\\left(\\frac{5\\pi}{6}\\right).$$ [[marks:2]]",
                },
                {
                    "label": "b",
                    "text": "Write $z_2$ in Cartesian form.",
                    "marks": 1,
                    "studentSpaceLines": 3,
                    "includeSolution": True,
                    "solutionText": "$$z_2=2+0i.$$ [[marks:1]]",
                },
                {
                    "label": "c",
                    "text": "Plot $z_1$ and $z_2$ on an Argand diagram.",
                    "marks": 2,
                    "studentSpaceLines": 3,
                    "includeSolution": True,
                    "solutionText": "Plot $z_1$ and $z_2$ with the shown Re and Im axes. [[marks:2]]",
                },
                {
                    "label": "d",
                    "text": (
                        "Write equations or inequalities for the indicated locus. The upper boundary is part of "
                        "a circle centred at $z=i$."
                    ),
                    "marks": 4,
                    "studentSpaceLines": 6,
                    "includeSolution": True,
                    "solutionText": (
                        "$$|z-i|\\le 2$$ is the filled circle centred at $i$ with radius $2=\\sqrt4$. [[marks:1]]\n"
                        "$$\\frac{\\pi}{6}\\le \\arg(z)\\le \\frac{5\\pi}{6},$$ "
                        "so shade the circular sector above $i$. [[marks:3]]"
                    ),
                },
            ],
        }
    )


def local_real_specialist_argand_bad_region_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_argand_call()))
    features = call["mauthArguments"]["diagram"]["graphConfig"]["features"]
    features[2].pop("clipSide", None)
    features[2]["expressionTop"] = "sqrt(4 - x^2) + 1"
    features[2]["fillColor"] = "#93c5fd"
    features[2]["opacity"] = 0.25
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_argand_bad_shifted_arg_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_argand_call()))
    part_d = call["mauthArguments"]["parts"][3]
    part_d["solutionText"] = (
        "$$|z-i|\\le 2$$ is the filled circle centred at $i$ with radius $2=\\sqrt4$. [[marks:1]]\n"
        "$$\\frac{\\pi}{6}\\le \\arg(z-i)\\le \\frac{5\\pi}{6},$$ "
        "so shade the circular sector above $i$. [[marks:3]]"
    )
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_spherical_cap_call() -> dict[str, Any]:
    cross_section = {
        "type": "graph2d",
        "xMin": -1,
        "xMax": 21,
        "yMin": -11,
        "yMax": 11,
        "widthPx": 560,
        "heightPx": 360,
        "equalScale": True,
        "showGrid": False,
        "showAxes": True,
        "showAxisLabels": True,
        "showAxisNumbers": False,
        "functions": [
            {
                "kind": "relation",
                "expression": "x^2 + y^2 = 20*x",
                "label": "$x^2+y^2=20x$",
                "color": "#111827",
                "strokeWidth": 1.6,
            },
            {
                "kind": "expression",
                "expression": "sqrt(20*x - x^2)",
                "domainMin": 0,
                "domainMax": 20,
                "color": "#111827",
                "show": False,
            },
        ],
        "features": [
            {
                "kind": "region_curve_axis",
                "functionIndex": 1,
                "axis": "x",
                "xMin": 0,
                "xMax": 4,
                "color": "#dbeafe",
                "fillOpacity": 0.4,
            },
            {"kind": "line_segment", "x1": 4, "y1": 0, "x2": 4, "y2": 8, "strokeWidth": 1.4, "color": "#111827"},
            {"kind": "label", "x": 4, "y": -1.25, "label": "$h$"},
            {"kind": "label", "x": 10, "y": -1.25, "label": "$10$"},
            {"kind": "label", "x": 20, "y": -1.25, "label": "$20$"},
        ],
    }
    cap_solid = {
        "type": "graph3d",
        "widthPx": 420,
        "heightPx": 340,
        "metadata": {"view3d": {"az": 1.25, "el": 0.28, "bank": 0}},
        "data": {
            "points": [
                {"id": "P", "label": "", "coords": [0, 0, 0], "show": False},
                {"id": "H", "label": "", "coords": [4, 0, 0], "show": False},
            ],
            "segments": [{"from": "P", "to": "H", "label": "$h$", "strokeStyle": "dashed"}],
            "solids": [
                {
                    "kind": "sphereCap",
                    "center": [10, 0, 0],
                    "radius": 10,
                    "height": 4,
                    "axis": [-1, 0, 0],
                    "fillColor": "#dbeafe",
                    "fillOpacity": 0.22,
                    "strokeColor": "#111827",
                }
            ],
            "xRange": [-1, 11],
            "yRange": [-6, 6],
            "zRange": [-6, 6],
        },
    }
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 0,
            "questionMarks": 0,
            "questionText": (
                "A solid spherical cap with depth $h$ is part of a solid sphere with radius $10$ cm. "
                "This cap can be generated by revolving the shaded region about the $x$ axis."
            ),
            "diagrams": [
                {"diagramAlign": "left", "graphConfig": cross_section},
                {"diagramAlign": "right", "graphConfig": cap_solid},
            ],
            "parts": [
                {
                    "label": "a",
                    "text": "Show that the equation for the circle shown above is $x^2+y^2=20x$.",
                    "marks": 1,
                    "studentSpaceLines": 4,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": (
                        "The centre is $(10,0)$ with radius $10$, so "
                        "$$(x-10)^2+(y-0)^2=10^2.$$ [[marks:1]]\n"
                        "Expanding gives $x^2-20x+10^2+y^2=10^2$, hence $x^2+y^2=20x$."
                    ),
                },
                {
                    "label": "b",
                    "text": "Develop an expression for the volume of the spherical cap in terms of $h$.",
                    "marks": 4,
                    "studentSpaceLines": 10,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": (
                        "From $x^2+y^2=20x$, $y^2=20x-x^2$. [[marks:1]]\n"
                        "$$V=\\int_0^h \\pi y^2\\,dx=\\int_0^h \\pi(20x-x^2)\\,dx.$$ [[marks:1]]\n"
                        "$$V=\\pi\\left[10x^2-\\frac{x^3}{3}\\right]_0^h=\\pi\\left(10h^2-\\frac{h^3}{3}\\right).$$ [[marks:1]]\n"
                        "$$V=\\pi h^2\\left(10-\\frac{h}{3}\\right).$$ [[marks:1]]"
                    ),
                },
            ],
        },
    )


def local_real_specialist_spherical_cap_full_sphere_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_spherical_cap_call()))
    graph3d = call["mauthArguments"]["diagrams"][1]["graphConfig"]
    graph3d["data"]["solids"] = [{"kind": "sphere", "center": [10, 0, 0], "radius": 10}]
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_spherical_cap_equivalent_solution_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_spherical_cap_call()))
    part_b = call["mauthArguments"]["parts"][1]
    part_b["solutionText"] = (
        "From $x^2+y^2=20x$, $y^2=20x-x^2$. [[marks:1]]\n"
        "$$V=\\int_0^h \\pi y^2\\,dx=\\int_0^h \\pi(20x-x^2)\\,dx.$$ [[marks:1]]\n"
        "$$V=\\pi\\left[10x^2-\\frac{x^3}{3}\\right]_0^h=\\pi\\left(10h^2-\\frac{h^3}{3}\\right).$$ [[marks:1]]\n"
        "$$V=\\frac{\\pi h^2}{3}(30-h).$$ [[marks:1]]"
    )
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_spherical_cap_duplicate_diagram_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_spherical_cap_call()))
    call["mauthArguments"]["diagram"] = call["mauthArguments"]["diagrams"][0]
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_spherical_cap_missing_cross_section_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_spherical_cap_call()))
    call["mauthArguments"]["diagrams"] = [call["mauthArguments"]["diagrams"][1]]
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_prism_call() -> dict[str, Any]:
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 0,
            "questionMarks": 0,
            "questionText": (
                "A rectangular prism is defined using the coordinate system shown with $A(2,0,0)$, "
                "$C(0,4,0)$ and $T(0,0,3)$. Point $M$ is the centre of the planar face $OCFT$ "
                "with coordinates $(0,2,1.5)$."
            ),
            "diagram": {
                "diagramAlign": "center",
                "graphConfig": {
                    "type": "graph3d",
                    "widthPx": 620,
                    "heightPx": 430,
                    "metadata": {"view3d": {"az": 1.1, "el": 0.35, "bank": 0}},
                    "data": {
                        "points": [
                            {"id": "O", "label": "$O$", "coords": [0, 0, 0]},
                            {"id": "A", "label": "$A$", "coords": [2, 0, 0]},
                            {"id": "B", "label": "$B$", "coords": [2, 4, 0]},
                            {"id": "C", "label": "$C$", "coords": [0, 4, 0]},
                            {"id": "T", "label": "$T$", "coords": [0, 0, 3]},
                            {"id": "D", "label": "$D$", "coords": [2, 0, 3]},
                            {"id": "E", "label": "$E$", "coords": [2, 4, 3]},
                            {"id": "F", "label": "$F$", "coords": [0, 4, 3]},
                            {"id": "M", "label": "$M$", "coords": [0, 2, 1.5]},
                        ],
                        "segments": [
                            {"from": "O", "to": "A"},
                            {"from": "A", "to": "B"},
                            {"from": "B", "to": "C"},
                            {"from": "O", "to": "C", "strokeStyle": "dashed"},
                            {"from": "O", "to": "T", "strokeStyle": "dashed"},
                            {"from": "A", "to": "D"},
                            {"from": "B", "to": "E"},
                            {"from": "C", "to": "F"},
                            {"from": "T", "to": "D"},
                            {"from": "D", "to": "E"},
                            {"from": "E", "to": "F"},
                            {"from": "T", "to": "F"},
                            {"from": "B", "to": "T", "label": "$BT$"},
                            {"from": "A", "to": "M", "label": "$AM$"},
                        ],
                    },
                },
            },
            "parts": [
                {
                    "label": "a",
                    "text": "Determine the vector equation for the prism's main diagonal $\\overleftrightarrow{BT}$.",
                    "marks": 2,
                    "studentSpaceLines": 6,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": (
                        "$B=(2,4,0)$ and $T=(0,0,3)$, so "
                        "$$\\vec d=T-B=\\begin{pmatrix}-2\\\\-4\\\\3\\end{pmatrix}.$$ [[marks:1]]\n"
                        "$$\\mathbf r=\\begin{pmatrix}2\\\\4\\\\0\\end{pmatrix}+\\lambda"
                        "\\begin{pmatrix}-2\\\\-4\\\\3\\end{pmatrix},\\quad \\lambda\\in\\mathbb R.$$ [[marks:1]]"
                    ),
                },
                {
                    "label": "b",
                    "text": "Determine the Cartesian equation of the sphere that contains all vertices of the rectangular prism.",
                    "marks": 3,
                    "studentSpaceLines": 8,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": (
                        "The centre is $(1,2,1.5)$. [[marks:1]]\n"
                        "$$r^2=(0-1)^2+(4-2)^2+(0-1.5)^2=7.25.$$ [[marks:1]]\n"
                        "$$(x-1)^2+(y-2)^2+(z-1.5)^2=7.25.$$ [[marks:1]]"
                    ),
                },
                {
                    "label": "c",
                    "text": (
                        "Prove, using a vector method, that line $\\overleftrightarrow{AM}$ does not "
                        "intersect $\\overleftrightarrow{BT}$."
                    ),
                    "marks": 3,
                    "studentSpaceLines": 10,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": (
                        "$$AM:\\mathbf r=\\begin{pmatrix}2\\\\0\\\\0\\end{pmatrix}+\\mu"
                        "\\begin{pmatrix}-2\\\\2\\\\1.5\\end{pmatrix}.$$ [[marks:1]]\n"
                        "Equating with $BT$ gives $\\lambda=\\mu$ and $\\lambda=\\mu=2/3$. [[marks:1]]\n"
                        "The $z$ coordinates require $\\mu=2\\lambda$, a contradiction, so $AM$ does not intersect $BT$. [[marks:1]]"
                    ),
                },
            ],
        },
    )


def local_real_specialist_prism_bad_graph3d_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_prism_call()))
    args = call["mauthArguments"]
    args["questionMarks"] = 8
    graph_config = args["diagram"]["graphConfig"]
    graph_config["metadata"] = {
        "view3d": {"camera": {"eye": {"x": 5, "y": -7, "z": 4}}},
        "axisLabels": ["$x$", "$y$", "$z$"],
        "showAxes": True,
        "showGrid": False,
    }
    graph_config["data"]["points"].append({"id": "xAxis", "label": "$x$", "coords": [3, 0, 0]})
    graph_config["data"]["segments"].append({"from": "O", "to": "xAxis", "label": "$x$"})
    graph_config["data"]["segments"][3]["style"] = "dashed"
    graph_config["data"]["segments"][3].pop("strokeStyle", None)
    call["arguments"] = args
    return call


def local_real_specialist_prism_bad_coordinates_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_prism_call()))
    graph_config = call["mauthArguments"]["diagram"]["graphConfig"]
    for point in graph_config["data"]["points"]:
        if point.get("id") == "B":
            point["coords"] = [2, 3, 0]
        if point.get("id") == "M":
            point["coords"] = [0, 2, 1]
    for segment in graph_config["data"]["segments"]:
        if segment.get("from") == "O" and segment.get("to") in {"C", "T"}:
            segment.pop("strokeStyle", None)
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_prism_fraction_sphere_solution_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_prism_call()))
    part_b = call["mauthArguments"]["parts"][1]
    part_b["solutionText"] = (
        "The centre is $\\left(1,2,\\frac32\\right)$. [[marks:1]]\n"
        "$$r^2=(0-1)^2+(4-2)^2+\\left(0-\\frac32\\right)^2=\\frac{29}{4}.$$ [[marks:1]]\n"
        "$$(x-1)^2+(y-2)^2+\\left(z-\\frac32\\right)^2=\\frac{29}{4}.$$ [[marks:1]]"
    )
    call["arguments"] = call["mauthArguments"]
    return call


def local_graph3d_general_solids_call() -> dict[str, Any]:
    pyramid = {
        "type": "graph3d",
        "widthPx": 340,
        "heightPx": 260,
        "metadata": {"view3d": {"az": 1.05, "el": 0.38, "bank": 0}},
        "data": {
            "points": [
                {"id": "A", "label": "$A$", "coords": [0, 0, 0]},
                {"id": "B", "label": "$B$", "coords": [4, 0, 0]},
                {"id": "C", "label": "$C$", "coords": [4, 4, 0]},
                {"id": "D", "label": "$D$", "coords": [0, 4, 0]},
                {"id": "V", "label": "$V$", "coords": [2, 2, 3]},
            ],
            "segments": [
                {"from": "A", "to": "B"},
                {"from": "B", "to": "C"},
                {"from": "C", "to": "D"},
                {"from": "A", "to": "D", "strokeStyle": "dashed"},
                {"from": "A", "to": "V"},
                {"from": "B", "to": "V"},
                {"from": "C", "to": "V"},
                {"from": "D", "to": "V", "strokeStyle": "dashed"},
            ],
            "faces": [
                {"points": ["A", "B", "C", "D"], "fillColor": "#dbeafe", "fillOpacity": 0.12},
                {"points": ["A", "B", "V"], "fillColor": "#fef3c7", "fillOpacity": 0.14},
                {"points": ["B", "C", "V"], "fillColor": "#dcfce7", "fillOpacity": 0.14},
                {"points": ["C", "D", "V"], "fillColor": "#fee2e2", "fillOpacity": 0.14},
                {"points": ["D", "A", "V"], "fillColor": "#e0e7ff", "fillOpacity": 0.14},
            ],
            "xRange": [-0.5, 4.5],
            "yRange": [-0.5, 4.5],
            "zRange": [0, 3.5],
        },
    }
    cone = {
        "type": "graph3d",
        "widthPx": 340,
        "heightPx": 260,
        "metadata": {"view3d": {"az": 1.2, "el": 0.32, "bank": 0}},
        "data": {
            "points": [
                {"id": "ConeO", "label": "$O$", "coords": [0, 0, 0], "show": False},
                {"id": "ConeV", "label": "$V$", "coords": [0, 0, 5]},
                {"id": "ConeR", "label": "$r=2$", "coords": [2, 0, 0], "show": False},
            ],
            "segments": [
                {"from": "ConeO", "to": "ConeV", "label": "$h=5$", "strokeStyle": "dashed"},
                {"from": "ConeO", "to": "ConeR", "label": "$r=2$"},
            ],
            "solids": [
                {
                    "kind": "cone",
                    "baseCenter": "ConeO",
                    "apex": "ConeV",
                    "radius": 2,
                    "fillColor": "#fde68a",
                    "fillOpacity": 0.2,
                    "strokeColor": "#92400e",
                }
            ],
            "xRange": [-2.6, 2.6],
            "yRange": [-2.6, 2.6],
            "zRange": [0, 5.5],
        },
    }
    cylinder = {
        "type": "graph3d",
        "widthPx": 340,
        "heightPx": 260,
        "metadata": {"view3d": {"az": 1.15, "el": 0.3, "bank": 0}},
        "data": {
            "points": [
                {"id": "CylB", "label": "$B$", "coords": [0, 0, 0], "show": False},
                {"id": "CylT", "label": "$T$", "coords": [0, 0, 4], "show": False},
                {"id": "CylR", "label": "$r=1.5$", "coords": [1.5, 0, 0], "show": False},
            ],
            "segments": [
                {"from": "CylB", "to": "CylT", "label": "$h=4$", "strokeStyle": "dashed"},
                {"from": "CylB", "to": "CylR", "label": "$r=1.5$"},
            ],
            "solids": [
                {
                    "kind": "cylinder",
                    "baseCenter": "CylB",
                    "topCenter": "CylT",
                    "radius": 1.5,
                    "fillColor": "#bfdbfe",
                    "fillOpacity": 0.2,
                    "strokeColor": "#1d4ed8",
                }
            ],
            "xRange": [-2.1, 2.1],
            "yRange": [-2.1, 2.1],
            "zRange": [0, 4.5],
        },
    }
    sphere = {
        "type": "graph3d",
        "widthPx": 340,
        "heightPx": 260,
        "metadata": {"view3d": {"az": 1.05, "el": 0.25, "bank": 0}},
        "data": {
            "points": [
                {"id": "SphereC", "label": "$C$", "coords": [0, 0, 0], "show": False},
                {"id": "SphereP", "label": "$P$", "coords": [2, 0, 0], "show": False},
            ],
            "segments": [{"from": "SphereC", "to": "SphereP", "label": "$r=2$"}],
            "solids": [
                {
                    "kind": "sphere",
                    "center": "SphereC",
                    "radius": 2,
                    "fillColor": "#ddd6fe",
                    "fillOpacity": 0.16,
                    "strokeColor": "#5b21b6",
                }
            ],
            "xRange": [-2.5, 2.5],
            "yRange": [-2.5, 2.5],
            "zRange": [-2.5, 2.5],
        },
    }
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 0,
            "questionMarks": 0,
            "questionText": (
                "Four separate 3D diagrams show a square pyramid, a right circular cone, "
                "a right circular cylinder and a sphere. Use the labelled radius and height information."
            ),
            "diagrams": [
                {"diagramAlign": "left", "graphConfig": pyramid},
                {"diagramAlign": "right", "graphConfig": cone},
                {"diagramAlign": "left", "graphConfig": cylinder},
                {"diagramAlign": "right", "graphConfig": sphere},
            ],
            "parts": [
                {
                    "label": "a",
                    "text": "For the square pyramid, list vertices $A,B,C,D,V$ and state its height.",
                    "marks": 2,
                    "studentSpaceLines": 4,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": "The vertices are $A,B,C,D,V$ and the height is $3$. [[marks:2]]",
                },
                {
                    "label": "b",
                    "text": "For the cone, identify the base radius and height.",
                    "marks": 2,
                    "studentSpaceLines": 4,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": "The cone has radius $2$ and height $5$, so $V=\\frac13\\pi r^2h=\\frac{20\\pi}{3}$. [[marks:2]]",
                },
                {
                    "label": "c",
                    "text": "For the cylinder, identify the base radius and height.",
                    "marks": 2,
                    "studentSpaceLines": 4,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": "The cylinder has radius $1.5$ and height $4$, so $V=\\pi r^2h=9\\pi$. [[marks:2]]",
                },
                {
                    "label": "d",
                    "text": "For the sphere, identify the radius and write its surface area.",
                    "marks": 2,
                    "studentSpaceLines": 4,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": "The sphere has radius $2$, so its surface area is $4\\pi r^2=16\\pi$. [[marks:2]]",
                },
            ],
        }
    )


def local_graph3d_general_solids_placeholders_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_graph3d_general_solids_call()))
    for diagram in call["mauthArguments"]["diagrams"]:
        graph_config = diagram["graphConfig"]
        data = graph_config["data"]
        data["segments"] = []
        data["faces"] = []
        data["solids"] = []
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_implicit_call() -> dict[str, Any]:
    graph_config = {
        "type": "graph2d",
        "xMin": -1.5,
        "xMax": 2.5,
        "yMin": -1.5,
        "yMax": 2.5,
        "widthPx": 620,
        "heightPx": 420,
        "functions": [
            {
                "kind": "relation",
                "expression": "x^3 + y^3 = 3xy + y",
                "color": "#1d4ed8",
                "strokeWidth": 2,
            }
        ],
        "features": [
            {"kind": "point", "x": 0, "y": 0, "label": "$O$"},
            {"kind": "point", "x": -0.475, "y": 0, "label": "$A$"},
            {"kind": "point", "x": 0.225, "y": 0, "label": "$B$"},
        ],
    }
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 0,
            "questionMarks": 0,
            "questionText": (
                "The equation $x^3+y^3=3xy+y$ implicitly defines a curve with slope "
                "at the origin and points A and B on the $x$-axis."
            ),
            "diagram": {"diagramAlign": "center", "graphConfig": graph_config},
            "parts": [
                {
                    "label": "a",
                    "text": "Use implicit differentiation to find $\\frac{dy}{dx}$.",
                    "marks": 3,
                    "studentSpaceLines": 6,
                    "includeSolution": True,
                    "solutionText": (
                        "$$3x^2+3y^2\\frac{dy}{dx}=3y+3x\\frac{dy}{dx}+\\frac{dy}{dx}.$$ [[marks:1]]\n"
                        "$$\\frac{dy}{dx}=\\frac{3y-3x^2}{3y^2-3x-1}.$$ [[marks:2]]"
                    ),
                },
                {
                    "label": "b",
                    "text": "Find the $x$ coordinates of A and B.",
                    "marks": 3,
                    "studentSpaceLines": 6,
                    "includeSolution": True,
                    "solutionText": (
                        "At $y=0$, $x^3=0$ gives the origin; using the tangent condition gives "
                        "$$x^4-2x^2-x=0.$$ [[marks:1]]\n"
                        "The relevant roots are approximately $x=-0.475$ and $x=0.225$, so "
                        "$A(-0.475,0)$ and $B(0.225,0)$. [[marks:2]]"
                    ),
                },
            ],
        }
    )


def local_real_specialist_implicit_bad_relation_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_implicit_call()))
    graph_config = call["mauthArguments"]["diagram"]["graphConfig"]
    graph_config["functions"][0]["expression"] = "x^2 + y^2 = 1"
    graph_config["features"] = [feature for feature in graph_config["features"] if feature.get("label") != "$B$"]
    call["arguments"] = call["mauthArguments"]
    return call


LOCAL_EVAL_CASES: dict[str, dict[str, Any]] = {
    "real-methods-earthquake": {
        "assert": assert_real_methods_earthquake_call,
        "call": local_real_methods_earthquake_call,
    },
    "real-methods-earthquake-bad-line": {
        "assert": assert_real_methods_earthquake_call,
        "call": local_real_methods_earthquake_bad_line_call,
        "expectedIssues": [
            "graph2d line should encode slope 2/3",
            "graph2d line should encode vertical intercept -6",
        ],
    },
    "real-methods-ev-histogram": {
        "assert": assert_real_methods_ev_histogram_call,
        "call": local_real_methods_ev_histogram_call,
    },
    "real-methods-ev-histogram-bad-renderer": {
        "assert": assert_real_methods_ev_histogram_call,
        "call": local_real_methods_ev_histogram_bad_renderer_call,
        "expectedIssues": [
            "ev histogram should not be converted as a generic graph2d",
            "ev source histogram should use statsChart chartType='histogram'",
        ],
    },
    "real-methods-ev-histogram-bad-counts": {
        "assert": assert_real_methods_ev_histogram_call,
        "call": local_real_methods_ev_histogram_bad_counts_call,
        "expectedIssues": [
            "histogram/count chart should preserve value 430 with count 20",
        ],
    },
    "real-methods-dice-game": {
        "assert": assert_real_methods_dice_game_call,
        "call": local_real_methods_dice_game_call,
    },
    "real-methods-dice-game-split-solution-table": {
        "assert": assert_real_methods_dice_game_call,
        "call": local_real_methods_dice_game_split_solution_table_call,
    },
    "real-methods-dice-game-bad-renderer": {
        "assert": assert_real_methods_dice_game_call,
        "call": local_real_methods_dice_game_bad_renderer_call,
        "expectedIssues": [
            "dice-game frequency chart should not be converted as a generic graph2d",
            "dice-game source frequency chart should use statsChart chartType='histogram'",
        ],
    },
    "real-methods-dice-game-bad-profit-table": {
        "assert": assert_real_methods_dice_game_call,
        "call": local_real_methods_dice_game_bad_profit_table_call,
        "expectedIssues": [
            "dice-game solution should map profit probabilities",
        ],
    },
    "real-specialist-stats": {
        "assert": assert_real_specialist_stats_call,
        "call": local_real_specialist_stats_call,
    },
    "real-specialist-stats-bad-renderer": {
        "assert": assert_real_specialist_stats_call,
        "call": local_real_specialist_stats_bad_renderer_call,
        "expectedIssues": [
            "statistics source graphs should use statsChart",
            "should not be converted as a generic graph2d",
            "probability-density graph should use statsChart chartType='density'",
        ],
    },
    "real-specialist-slope-field": {
        "assert": assert_real_specialist_slope_field_call,
        "call": local_real_specialist_slope_field_call,
    },
    "real-specialist-slope-field-bad-schema": {
        "assert": assert_real_specialist_slope_field_call,
        "call": local_real_specialist_slope_field_bad_schema_call,
        "expectedIssues": [
            "graph2d.functions must be top-level",
            "graph2d.features must be top-level",
            "bounds should use top-level",
            "widthPx must be a top-level",
            "domain should be domainMin/domainMax",
            "style should be color/strokeWidth/strokeStyle",
            "features[0].type should be named kind",
        ],
    },
    "real-specialist-slope-field-bad-artifact-marks": {
        "assert": assert_real_specialist_slope_field_call,
        "call": local_real_specialist_slope_field_bad_artifact_marks_call,
        "expectedIssues": [
            "solutionText should be unmarked when solutionDiagram is present",
            "ticks plus completed solution diagrams should total 8",
        ],
    },
    "real-specialist-argand": {
        "assert": assert_real_specialist_argand_call,
        "call": local_real_specialist_argand_call,
    },
    "real-specialist-argand-bad-region": {
        "assert": assert_real_specialist_argand_call,
        "call": local_real_specialist_argand_bad_region_call,
        "expectedIssues": [
            "expressionTop is not supported",
            "fillColor is not supported",
            "opacity is not supported",
            "clipSide should be set",
        ],
    },
    "real-specialist-argand-bad-shifted-arg": {
        "assert": assert_real_specialist_argand_call,
        "call": local_real_specialist_argand_bad_shifted_arg_call,
        "expectedIssues": [
            "official Arg(z) bounds",
        ],
    },
    "real-specialist-spherical-cap": {
        "assert": assert_real_specialist_spherical_cap_call,
        "call": local_real_specialist_spherical_cap_call,
    },
    "real-specialist-spherical-cap-equivalent-solution": {
        "assert": assert_real_specialist_spherical_cap_call,
        "call": local_real_specialist_spherical_cap_equivalent_solution_call,
    },
    "real-specialist-spherical-cap-duplicate-diagram": {
        "assert": assert_real_specialist_spherical_cap_call,
        "call": local_real_specialist_spherical_cap_duplicate_diagram_call,
        "expectedIssues": [
            "either diagram or diagrams",
        ],
    },
    "real-specialist-spherical-cap-full-sphere": {
        "assert": assert_real_specialist_spherical_cap_call,
        "call": local_real_specialist_spherical_cap_full_sphere_call,
        "expectedIssues": [
            "sphereCap solid",
            "not represent the cap as only a full sphere",
        ],
    },
    "real-specialist-spherical-cap-missing-cross-section": {
        "assert": assert_real_specialist_spherical_cap_call,
        "call": local_real_specialist_spherical_cap_missing_cross_section_call,
        "expectedIssues": [
            "cross-section should use graph2d",
        ],
    },
    "real-specialist-prism": {
        "assert": assert_real_specialist_prism_call,
        "call": local_real_specialist_prism_call,
    },
    "real-specialist-prism-fraction-sphere-solution": {
        "assert": assert_real_specialist_prism_call,
        "call": local_real_specialist_prism_fraction_sphere_solution_call,
    },
    "real-specialist-prism-bad-graph3d": {
        "assert": assert_real_specialist_prism_call,
        "call": local_real_specialist_prism_bad_graph3d_call,
        "expectedIssues": [
            "top-level marks/questionMarks",
            "metadata should not include unsupported axisLabels",
            "metadata should not include unsupported showAxes",
            "metadata should not include unsupported showGrid",
            "view should use az/el/bank",
            "view3d.az should be numeric",
            "axis helper point xaxis",
            "axis helper segments",
            "segments should use strokeStyle/dashed",
        ],
    },
    "real-specialist-prism-bad-coordinates": {
        "assert": assert_real_specialist_prism_call,
        "call": local_real_specialist_prism_bad_coordinates_call,
        "expectedIssues": [
            "3d prism graph3d point B should have coordinates",
            "3d prism graph3d point M should have coordinates",
            "3d prism graph3d segment OC should be dashed",
            "3d prism graph3d segment OT should be dashed",
        ],
    },
    "graph3d-general-solids": {
        "assert": assert_graph3d_general_solids_call,
        "call": local_graph3d_general_solids_call,
    },
    "graph3d-general-solids-placeholders": {
        "assert": assert_graph3d_general_solids_call,
        "call": local_graph3d_general_solids_placeholders_call,
        "expectedIssues": [
            "pyramid diagram should include polygon faces",
            "graph3d solid-family graph3d data should include a cone solid",
            "graph3d solid-family graph3d data should include a cylinder solid",
            "graph3d solid-family graph3d data should include a sphere solid",
        ],
    },
    "real-specialist-implicit": {
        "assert": assert_real_specialist_implicit_call,
        "call": local_real_specialist_implicit_call,
    },
    "real-specialist-implicit-bad-relation": {
        "assert": assert_real_specialist_implicit_call,
        "call": local_real_specialist_implicit_bad_relation_call,
        "expectedIssues": [
            "graph2d should encode the relation",
            "point label B",
        ],
    },
}

LOCAL_EVAL_GROUPS: dict[str, list[str]] = {
    "local": list(LOCAL_EVAL_CASES),
    "local-real-exams-extended": list(LOCAL_EVAL_CASES),
    "local-real-exams-graph3d": ["real-specialist-spherical-cap", "real-specialist-prism", "graph3d-general-solids"],
    "local-real-exams-preview": [
        "real-methods-ev-histogram",
        "real-specialist-stats",
        "real-specialist-slope-field",
        "real-specialist-argand",
        "real-specialist-spherical-cap",
        "real-specialist-prism",
        "graph3d-general-solids",
        "real-specialist-implicit",
    ],
    "local-graph3d-general": ["real-specialist-spherical-cap", "real-specialist-prism", "graph3d-general-solids"],
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
    repair_on_failure = case.get("repairOnFailure")
    if issues and callable(repair_on_failure):
        tool_output = repair_on_failure(first_calls[0], issues)
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

        repair_issues = assert_call(second_calls[0])
        if repair_issues:
            print("FAIL:")
            for issue in repair_issues:
                print(f"- {issue}")
            return 1, total_cost, total_tokens

        print(f"PASS: {case_name} repaired successfully. Estimated total: ${total_cost:.4f}, {total_tokens:,} tokens.")
        return 0, total_cost, total_tokens

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


def run_local_eval(case_name: str = "local", verbose: bool = False) -> int:
    selected_cases = LOCAL_EVAL_GROUPS.get(case_name, [case_name])
    failed = False
    results: list[tuple[str, bool, list[str]]] = []
    for selected_case in selected_cases:
        fixture = LOCAL_EVAL_CASES.get(selected_case)
        if not fixture:
            print(f"FAIL: no local fixture named {selected_case!r}", file=sys.stderr)
            results.append((selected_case, False, [f"missing local fixture {selected_case!r}"]))
            failed = True
            continue
        call_factory = fixture["call"]
        call = call_factory() if callable(call_factory) else fixture["call"]
        assert_call = fixture["assert"]
        issues = assert_call(call)
        expected_issues = fixture.get("expectedIssues")
        if verbose:
            print(f"\n=== local {selected_case} ===")
            print(json.dumps({"toolCall": summarize_call(call), "issues": issues}, indent=2, ensure_ascii=False))
        if expected_issues is None:
            passed = not issues
            if not passed:
                print(f"FAIL local {selected_case}:")
                for issue in issues:
                    print(f"- {issue}")
        else:
            missing_expected = [
                expected for expected in expected_issues if not any(expected in issue for issue in issues)
            ]
            passed = bool(issues) and not missing_expected
            if not passed:
                print(f"FAIL local {selected_case}:")
                if not issues:
                    print("- expected assertion issues, got none")
                for expected in missing_expected:
                    print(f"- missing expected issue containing {expected!r}")
                for issue in issues:
                    print(f"- actual: {issue}")
        results.append((selected_case, passed, issues))
        failed = failed or not passed

    print("\nLOCAL SUMMARY:")
    for selected_case, passed, issues in results:
        expected_label = (
            "expected failures" if LOCAL_EVAL_CASES.get(selected_case, {}).get("expectedIssues") else "clean"
        )
        print(f"- {'PASS' if passed else 'FAIL'} {selected_case}: {expected_label}, {len(issues)} issue(s)")
    print("\nTOTAL: $0.0000, 0 provider tokens.")
    return 1 if failed else 0


def dump_local_calls(case_name: str = "local") -> int:
    selected_cases = LOCAL_EVAL_GROUPS.get(case_name, [case_name])
    cases: list[dict[str, Any]] = []
    for selected_case in selected_cases:
        fixture = LOCAL_EVAL_CASES.get(selected_case)
        if not fixture:
            print(f"FAIL: no local fixture named {selected_case!r}", file=sys.stderr)
            return 1
        call_factory = fixture["call"]
        call = call_factory() if callable(call_factory) else fixture["call"]
        cases.append({"case": selected_case, "toolCall": call})
    print(json.dumps({"cases": cases}, ensure_ascii=False))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a live Mauth assistant eval against OpenAI.")
    parser.add_argument("--model", default=None, help="Override OPENAI_MODEL for this eval.")
    parser.add_argument(
        "--case",
        choices=[*EVAL_CASES.keys(), *EVAL_GROUPS.keys(), *LOCAL_EVAL_CASES.keys(), *LOCAL_EVAL_GROUPS.keys()],
        default="circle-question",
        help="Eval case or group to run.",
    )
    parser.add_argument("--local", action="store_true", help="Run zero-cost local fixture assertions only.")
    parser.add_argument(
        "--dump-local-calls",
        action="store_true",
        help="Print selected zero-cost local assistant tool-call fixtures as JSON.",
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
    if args.dump_local_calls:
        return dump_local_calls(case_name=args.case)
    if args.local:
        return run_local_eval(case_name=args.case, verbose=args.verbose)
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
