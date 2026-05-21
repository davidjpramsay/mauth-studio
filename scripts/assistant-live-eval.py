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
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "apps" / "api"
WORKBENCH_ROOT = ROOT.parent / "mauth-workbench"
BENCHMARK_MANIFEST_PATH = ROOT / "configs" / "assistant-real-exam-benchmarks.json"
DEFAULT_COST_LEDGER_PATH = WORKBENCH_ROOT / "assistant-evals" / "live-cost-ledger.jsonl"
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
    assistant_attachment_payload_stats,
    assistant_configured,
    assistant_image_max_long_edge,
    assistant_instructions,
    assistant_tool_definitions,
    brain_files_for_request,
    brain_files_from_ids,
    create_assistant_response,
    deterministic_brain_ids_for_request,
    input_items,
)
from app.services.penrose import render_penrose_diagram  # noqa: E402

BAD_CONTROL_CHARACTER_PATTERN = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
QUESTION_UPSERT_TOOL_NAME = "mauth.question.upsert"
DEFAULT_LIVE_CASE_COST_CAP = 0.35
DEFAULT_PROVIDER_INPUT_CHAR_CAP = 160_000
DEFAULT_PROVIDER_IMAGE_PIXEL_CAP = 1_600_000
DEFAULT_PROVIDER_INSTRUCTION_CHAR_CAP = 0
DEFAULT_PROVIDER_TOOL_SCHEMA_CHAR_CAP = 0
MAX_LEDGER_FIRST_ISSUES = 12
PAID_CANARY_FAMILY_PRIORITY = {
    "graph2d+graph3d": 0,
    "graph3d": 1,
    "graph2d": 2,
    "statsChart": 3,
    "statsChart+table": 4,
    "geometricConstruction": 5,
    "table": 6,
}
PAID_CANARY_CASE_PRIORITY = {
    "real-specialist-square-pyramid": 0,
    "real-specialist-prism": 1,
    "real-specialist-slope-field": 2,
    "real-specialist-argand": 3,
    "real-specialist-implicit": 4,
    "real-methods-ev-histogram": 5,
    "real-methods-dice-game": 6,
    "real-specialist-stats": 7,
    "real-specialist-spherical-cap": 8,
    "real-methods-earthquake": 9,
    "real-specialist-lighthouse": 10,
    "real-specialist-confidence-intervals": 11,
}
GRAPH2D_FEATURE_KINDS = {
    "point",
    "point_between_points",
    "region_between_curves",
    "region_curve_axis",
    "turning_point",
    "intersection",
    "tangent",
    "line_segment",
    "label",
    "region_clipped_by_curve",
}
GRAPH2D_UNSUPPORTED_FEATURE_FIELDS = {
    "expressionTop": (
        "graph2d region features must reference boundary functions by index, not inline expressions.",
        "graphConfig.functions plus functionAIndex/functionBIndex or baseFeatureIndex/clipFunctionIndex",
    ),
    "expressionBottom": (
        "graph2d region features must reference boundary functions by index, not inline expressions.",
        "graphConfig.functions plus functionAIndex/functionBIndex or baseFeatureIndex/clipFunctionIndex",
    ),
    "text": ("graph2d features use label, not text.", "label"),
    "opacity": ("graph2d region shading opacity must use fillOpacity.", "fillOpacity"),
    "fillColor": ("graph2d feature colour must use color.", "color"),
    "points": (
        "graph2d does not support polygon point-list features.",
        "region_between_curves/region_curve_axis/region_clipped_by_curve or line_segment with x1/y1/x2/y2",
    ),
    "coords": ("graph2d label and point features use x/y coordinates directly.", "x and y"),
    "from": ("graph2d line_segment features use numeric x1/y1 endpoints.", "x1 and y1"),
    "to": ("graph2d line_segment features use numeric x2/y2 endpoints.", "x2 and y2"),
    "strokeColor": ("graph2d feature stroke colour must use color.", "color"),
    "functionIndex1": ("graph2d region_between_curves uses functionAIndex.", "functionAIndex"),
    "functionIndex2": ("graph2d region_between_curves uses functionBIndex.", "functionBIndex"),
    "domainMin": ("graph2d region feature bounds use xMin.", "xMin"),
    "domainMax": ("graph2d region feature bounds use xMax.", "xMax"),
}


def apply_image_max_long_edge_override(value: int | None) -> None:
    if value is None:
        return
    os.environ["ASSISTANT_IMAGE_MAX_LONG_EDGE"] = str(value)


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


def sample_specialist_confidence_intervals_screenshot_with_key() -> list[AssistantAttachment]:
    return [
        attachment_png_from_path(
            "2021-mas-q17-confidence-intervals-p1.png",
            workbench_fixture(
                "assistant-evals",
                "2021-mas-calculator-assumed",
                "crops",
                "q17_confidence_intervals_p1.png",
            ),
        ),
        attachment_png_from_path(
            "2021-mas-q17-confidence-intervals-p2.png",
            workbench_fixture(
                "assistant-evals",
                "2021-mas-calculator-assumed",
                "crops",
                "q17_confidence_intervals_p2.png",
            ),
        ),
        attachment_text_from_path_lines(
            "2021-mas-q17-official-key.txt",
            workbench_fixture("assistant-evals", "source-text", "2021-mas-ca-key.txt"),
            start_line=715,
            end_line=858,
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


def sample_specialist_square_pyramid_screenshot_with_key() -> list[AssistantAttachment]:
    return [
        attachment_png_from_path(
            "2025-mas-q18-square-pyramid-p20.png",
            workbench_fixture(
                "assistant-evals",
                "2025-mas-ca-q18-square-pyramid",
                "crops",
                "2025-mas-ca-q18-square-pyramid_p20.png",
            ),
        ),
        attachment_png_from_path(
            "2025-mas-q18-square-pyramid-p21.png",
            workbench_fixture(
                "assistant-evals",
                "2025-mas-ca-q18-square-pyramid",
                "crops",
                "2025-mas-ca-q18-square-pyramid_p21.png",
            ),
        ),
        attachment_text_from_path_lines(
            "2025-mas-q18-official-key.txt",
            workbench_fixture("assistant-evals", "source-text", "2025-mas-ca-key.txt"),
            start_line=917,
            end_line=1029,
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


def is_escaped_dollar_delimiter(text: str, index: int) -> bool:
    slash_count = 0
    cursor = index - 1
    while cursor >= 0 and text[cursor] == "\\":
        slash_count += 1
        cursor -= 1
    return slash_count % 2 == 1


def find_closing_math_delimiter(text: str, start_index: int, delimiter_length: int) -> int:
    cursor = start_index
    while cursor < len(text):
        if text[cursor] != "$" or is_escaped_dollar_delimiter(text, cursor):
            cursor += 1
            continue
        if delimiter_length == 2 and (cursor + 1 >= len(text) or text[cursor + 1] != "$"):
            cursor += 1
            continue
        return cursor
    return -1


def contains_malformed_escaped_dollar_math(text: str) -> bool:
    cursor = 0
    while cursor < len(text):
        if text[cursor] != "$" or is_escaped_dollar_delimiter(text, cursor):
            cursor += 1
            continue
        delimiter_length = 2 if cursor + 1 < len(text) and text[cursor + 1] == "$" else 1
        body_start = cursor + delimiter_length
        closing_index = find_closing_math_delimiter(text, body_start, delimiter_length)
        if closing_index == -1:
            return False
        if "\\$" in text[body_start:closing_index]:
            return True
        cursor = closing_index + delimiter_length
    return False


def latex_artifact_issues(text: str, field_name: str) -> list[str]:
    issues: list[str] = []
    if contains_malformed_escaped_dollar_math(text):
        issues.append(f"{field_name} contains malformed escaped dollar inside maths")
    return issues


def text_quality_issues(value: Any, path: str = "mauthArguments") -> list[str]:
    issues: list[str] = []
    if isinstance(value, dict):
        for key, inner_value in value.items():
            inner_path = f"{path}.{key}"
            if isinstance(inner_value, str) and key in {"questionText", "solutionText", "text", "label"}:
                issues.extend(control_character_issues(inner_value, inner_path))
                issues.extend(latex_artifact_issues(inner_value, inner_path))
            elif isinstance(inner_value, (dict, list)):
                issues.extend(text_quality_issues(inner_value, inner_path))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            issues.extend(text_quality_issues(item, f"{path}[{index}]"))
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


def selected_live_cases(case_name: str) -> list[str]:
    return EVAL_GROUPS.get(case_name, [case_name])


def benchmark_manifest_index() -> dict[str, dict[str, Any]]:
    if not BENCHMARK_MANIFEST_PATH.exists():
        return {}
    with contextlib.suppress(Exception):
        manifest = json.loads(BENCHMARK_MANIFEST_PATH.read_text(encoding="utf-8"))
        benchmarks = manifest.get("benchmarks")
        if isinstance(benchmarks, list):
            return {
                benchmark["id"]: benchmark
                for benchmark in benchmarks
                if isinstance(benchmark, dict) and isinstance(benchmark.get("id"), str)
            }
    return {}


def benchmark_label(benchmark: dict[str, Any] | None) -> str:
    if not benchmark:
        return "benchmark: none"
    expected = benchmark.get("expected") if isinstance(benchmark.get("expected"), dict) else {}
    renderers = expected.get("renderers") if isinstance(expected.get("renderers"), list) else []
    renderer_label = ", ".join(str(renderer) for renderer in renderers) if renderers else "unknown renderer"
    status = benchmark.get("status") if isinstance(benchmark.get("status"), str) else "unknown"
    return f"benchmark: {status}, renderers: {renderer_label}"


def byte_label(value: int) -> str:
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f} MB"
    if value >= 1_000:
        return f"{value / 1_000:.1f} KB"
    return f"{value} B"


def provider_request_shape_for_case(case_name: str, model: str | None = None) -> dict[str, Any]:
    case = EVAL_CASES[case_name]
    messages = [AssistantChatMessage(role="user", content=str(case["prompt"]))]
    summary = case["summary"]()
    attachments_factory = case.get("attachments")
    attachments = attachments_factory() if callable(attachments_factory) else []
    deterministic_ids = deterministic_brain_ids_for_request(
        messages,
        tool_outputs=None,
        document_summary=summary,
        attachments=attachments,
    )
    brain_files = (
        brain_files_from_ids(deterministic_ids)
        if deterministic_ids
        else brain_files_for_request(
            messages,
            tool_outputs=None,
            attachments=attachments,
        )
    )
    request = AssistantChatRequest(
        model=model,
        messages=messages,
        documentSummary=summary,
        attachments=attachments,
    )
    tools = assistant_tool_definitions(messages, None, attachments, summary)
    instructions = assistant_instructions(summary, messages, None, brain_files, attachments)
    input_payload = input_items(request)
    attachment_stats = assistant_attachment_payload_stats(attachments)
    return {
        "brainSelection": "deterministic" if deterministic_ids else "fallback/planner-eligible",
        "brainFiles": brain_files,
        "toolNames": [tool.get("name") for tool in tools if isinstance(tool.get("name"), str)],
        "instructionChars": len(instructions),
        "toolSchemaChars": len(json.dumps(tools, ensure_ascii=False)),
        "inputChars": len(json.dumps(input_payload, ensure_ascii=False)),
        "attachmentCount": len(attachments),
        "attachmentBytes": sum(
            attachment.sizeBytes for attachment in attachments if isinstance(attachment.sizeBytes, int)
        ),
        "attachmentStats": attachment_stats,
    }


def request_shape_label(shape: dict[str, Any]) -> str:
    tool_names = shape.get("toolNames") if isinstance(shape.get("toolNames"), list) else []
    brain_files = shape.get("brainFiles") if isinstance(shape.get("brainFiles"), list) else []
    attachment_stats = shape.get("attachmentStats") if isinstance(shape.get("attachmentStats"), dict) else {}
    provider_attachment_bytes = attachment_stats.get("providerAttachmentBytes")
    attachment_bytes = provider_attachment_bytes if isinstance(provider_attachment_bytes, int) else 0
    if not attachment_bytes and isinstance(shape.get("attachmentBytes"), int):
        attachment_bytes = shape["attachmentBytes"]
    raw_attachment_bytes = (
        attachment_stats.get("rawAttachmentBytes")
        if isinstance(attachment_stats.get("rawAttachmentBytes"), int)
        else attachment_bytes
    )
    attachment_count = shape.get("attachmentCount") if isinstance(shape.get("attachmentCount"), int) else 0
    optimized_count = (
        attachment_stats.get("optimizedAttachmentCount")
        if isinstance(attachment_stats.get("optimizedAttachmentCount"), int)
        else 0
    )
    image_detail = attachment_stats.get("imageDetail") or "unknown"
    max_long_edge = attachment_stats.get("imageMaxLongEdge") or "unknown"
    raw_image_pixels = (
        attachment_stats.get("rawImagePixels") if isinstance(attachment_stats.get("rawImagePixels"), int) else 0
    )
    provider_image_pixels = (
        attachment_stats.get("providerImagePixels")
        if isinstance(attachment_stats.get("providerImagePixels"), int)
        else 0
    )
    pixel_label = (
        f", pixels={provider_image_pixels:,}/{raw_image_pixels:,}" if raw_image_pixels or provider_image_pixels else ""
    )
    return (
        f"brains={','.join(str(item) for item in brain_files)} "
        f"({shape.get('brainSelection')}); "
        f"tools={len(tool_names)} [{', '.join(str(item) for item in tool_names[:3])}"
        f"{'...' if len(tool_names) > 3 else ''}]; "
        f"instructions={shape.get('instructionChars')} chars; "
        f"schemas={shape.get('toolSchemaChars')} chars; "
        f"input={shape.get('inputChars')} chars; "
        f"attachments={attachment_count}/{byte_label(attachment_bytes)} sent"
        f" (raw {byte_label(raw_attachment_bytes)}, optimized {optimized_count}, detail={image_detail}, maxEdge={max_long_edge}{pixel_label})"
    )


def provider_image_pixels_for_shape(shape: dict[str, Any]) -> int:
    attachment_stats = shape.get("attachmentStats") if isinstance(shape.get("attachmentStats"), dict) else {}
    provider_image_pixels = attachment_stats.get("providerImagePixels")
    return provider_image_pixels if isinstance(provider_image_pixels, int) else 0


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_utc_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    with contextlib.suppress(ValueError):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    return None


def read_cost_ledger(path: Path | None) -> list[dict[str, Any]]:
    if path is None or not path.exists():
        return []
    records: list[dict[str, Any]] = []
    with contextlib.suppress(OSError):
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            with contextlib.suppress(json.JSONDecodeError):
                record = json.loads(line)
                if isinstance(record, dict):
                    records.append(record)
    return records


def append_cost_ledger(path: Path | None, record: dict[str, Any]) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def newest_record(current: dict[str, Any] | None, candidate: dict[str, Any]) -> dict[str, Any]:
    if current is None:
        return candidate
    current_time = parse_utc_datetime(current.get("timestamp"))
    candidate_time = parse_utc_datetime(candidate.get("timestamp"))
    if current_time is None:
        return candidate
    if candidate_time is None:
        return current
    return candidate if candidate_time >= current_time else current


def latest_records_by_case(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for record in records:
        case_name = record.get("case")
        if isinstance(case_name, str):
            latest[case_name] = newest_record(latest.get(case_name), record)
    return latest


def latest_pass_records_by_case(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for record in records:
        case_name = record.get("case")
        if isinstance(case_name, str) and record.get("status") == "PASS":
            latest[case_name] = newest_record(latest.get(case_name), record)
    return latest


def cost_ledger_label(record: dict[str, Any] | None) -> str:
    if not record:
        return "ledger: no prior paid run"
    status = record.get("status") if isinstance(record.get("status"), str) else "UNKNOWN"
    timestamp = record.get("timestamp") if isinstance(record.get("timestamp"), str) else "unknown time"
    cost = record.get("costUsd")
    cost_label = f"${cost:.4f}" if isinstance(cost, int | float) else "$0.0000"
    tokens = record.get("tokens")
    tokens_label = f"{tokens:,}" if isinstance(tokens, int) else "0"
    repair_count = record.get("repairCount")
    repair_label = f", repairs={repair_count}" if isinstance(repair_count, int) else ""
    return f"ledger: latest {status} {timestamp}, {cost_label}, {tokens_label} tokens{repair_label}"


def first_issues_for_record(record: dict[str, Any] | None) -> list[str]:
    if not isinstance(record, dict):
        return []
    first_issues = record.get("firstIssues")
    if not isinstance(first_issues, list):
        return []
    return [str(issue) for issue in first_issues if isinstance(issue, str) and issue.strip()]


def local_regression_counts(case_name: str) -> tuple[int, int]:
    clean = 0
    expected_failures = 0
    prefix = f"{case_name}-"
    for local_name, fixture in LOCAL_EVAL_CASES.items():
        if local_name != case_name and not local_name.startswith(prefix):
            continue
        if fixture.get("expectedIssues") is None:
            clean += 1
        else:
            expected_failures += 1
    return clean, expected_failures


def latest_pass_or_latest_record(
    latest_passes: dict[str, dict[str, Any]],
    latest_records: dict[str, dict[str, Any]],
    case_name: str,
) -> dict[str, Any] | None:
    return latest_passes.get(case_name) or latest_records.get(case_name)


def numeric_record_value(record: dict[str, Any] | None, key: str) -> float:
    if not isinstance(record, dict):
        return 0.0
    value = record.get(key)
    return float(value) if isinstance(value, int | float) else 0.0


def int_record_value(record: dict[str, Any] | None, key: str) -> int:
    if not isinstance(record, dict):
        return 0
    value = record.get(key)
    return value if isinstance(value, int) else 0


def cost_report_action(
    *,
    case_name: str,
    latest_record: dict[str, Any] | None,
    display_record: dict[str, Any] | None,
    clean_fixtures: int,
    bad_fixtures: int,
) -> str:
    status = latest_record.get("status") if isinstance(latest_record, dict) else None
    repair_count = int_record_value(display_record, "repairCount")
    first_issues = first_issues_for_record(display_record)
    if status in {"FAIL", "BLOCKED"}:
        return "fix latest paid failure before spending on adjacent cases"
    if repair_count > 0 and first_issues:
        return "convert firstIssues into/verify a local regression, then reduce first-call miss"
    if repair_count > 0:
        if bad_fixtures:
            return "review repaired pass against existing bad fixtures; rerun paid only for exact firstIssues"
        return "add a local regression for the repaired first-call miss before another paid run"
    if bad_fixtures == 0 and case_name in EVAL_GROUPS.get("real-exams", []):
        return "add at least one known-bad local regression when the next real failure appears"
    if clean_fixtures == 0:
        return "add a clean local fixture before relying on paid canaries"
    return "healthy; rerun only when stale, changed, or renderer risk increases"


def print_cost_report(case_name: str, *, cost_ledger_path: Path | None, max_cases: int | None = None) -> int:
    selected_cases = selected_live_cases(case_name)
    if max_cases is not None:
        selected_cases = selected_cases[:max_cases]
    records = read_cost_ledger(cost_ledger_path)
    latest_records = latest_records_by_case(records)
    latest_passes = latest_pass_records_by_case(records)
    benchmark_index = benchmark_manifest_index()
    records_by_case: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        record_case = record.get("case")
        if isinstance(record_case, str):
            records_by_case.setdefault(record_case, []).append(record)

    rows: list[dict[str, Any]] = []
    for selected_case in selected_cases:
        case_records = records_by_case.get(selected_case, [])
        latest_record = latest_records.get(selected_case)
        display_record = latest_pass_or_latest_record(latest_passes, latest_records, selected_case)
        clean_fixtures, bad_fixtures = local_regression_counts(selected_case)
        total_cost = sum(numeric_record_value(record, "costUsd") for record in case_records)
        total_tokens = sum(int_record_value(record, "tokens") for record in case_records)
        total_repairs = sum(int_record_value(record, "repairCount") for record in case_records)
        failed_runs = sum(1 for record in case_records if record.get("status") == "FAIL")
        blocked_runs = sum(1 for record in case_records if record.get("status") == "BLOCKED")
        passed_runs = sum(1 for record in case_records if record.get("status") == "PASS")
        rows.append(
            {
                "case": selected_case,
                "rendererFamily": paid_canary_family(selected_case, benchmark_index),
                "latestStatus": latest_record.get("status") if isinstance(latest_record, dict) else "NONE",
                "latestTimestamp": latest_record.get("timestamp") if isinstance(latest_record, dict) else "",
                "latestPassRepairCount": int_record_value(display_record, "repairCount"),
                "latestPassCost": numeric_record_value(display_record, "costUsd"),
                "latestPassTokens": int_record_value(display_record, "tokens"),
                "firstIssues": first_issues_for_record(display_record),
                "runs": len(case_records),
                "passes": passed_runs,
                "fails": failed_runs,
                "blocked": blocked_runs,
                "totalCost": total_cost,
                "totalTokens": total_tokens,
                "totalRepairs": total_repairs,
                "cleanLocalFixtures": clean_fixtures,
                "badLocalFixtures": bad_fixtures,
                "action": cost_report_action(
                    case_name=selected_case,
                    latest_record=latest_record,
                    display_record=display_record,
                    clean_fixtures=clean_fixtures,
                    bad_fixtures=bad_fixtures,
                ),
            }
        )

    rows.sort(
        key=lambda row: (
            0 if row["latestStatus"] in {"FAIL", "BLOCKED"} else 1,
            -int(row["latestPassRepairCount"]),
            -float(row["latestPassCost"]),
            -int(row["latestPassTokens"]),
            -int(row["totalRepairs"]),
            str(row["case"]),
        )
    )

    print("ASSISTANT PAID EVAL COST REPORT")
    print(f"- requested case/group: {case_name}")
    print(f"- selected cases: {len(selected_cases)}")
    print(f"- cost ledger: {cost_ledger_path if cost_ledger_path is not None else 'disabled'}")
    if not records:
        print("- ledger records: 0")
    else:
        total_cost = sum(numeric_record_value(record, "costUsd") for record in records)
        total_tokens = sum(int_record_value(record, "tokens") for record in records)
        total_repairs = sum(int_record_value(record, "repairCount") for record in records)
        print(
            f"- ledger records: {len(records)}, total ${total_cost:.4f}, "
            f"{total_tokens:,} tokens, repairs={total_repairs}"
        )
    print("- priority rows:")
    for row in rows:
        latest_label = (
            f"{row['latestStatus']} {row['latestTimestamp']}".strip()
            if row["latestTimestamp"]
            else str(row["latestStatus"])
        )
        first_issue_label = row["firstIssues"][0] if row["firstIssues"] else "not recorded"
        print(
            f"  - {row['case']} ({row['rendererFamily']}): latest={latest_label}; "
            f"latestPass=${row['latestPassCost']:.4f}, {row['latestPassTokens']:,} tokens, "
            f"repairs={row['latestPassRepairCount']}; runs={row['runs']} "
            f"(pass={row['passes']}, fail={row['fails']}, blocked={row['blocked']}), "
            f"total=${row['totalCost']:.4f}, totalRepairs={row['totalRepairs']}; "
            f"local={row['cleanLocalFixtures']} clean/{row['badLocalFixtures']} bad; action={row['action']}"
        )
        if row["latestPassRepairCount"] > 0:
            print(f"    first issue: {first_issue_label}")
    return 0


def benchmark_renderers(case_name: str, benchmark_index: dict[str, dict[str, Any]] | None = None) -> list[str]:
    benchmarks = benchmark_index if benchmark_index is not None else benchmark_manifest_index()
    benchmark = benchmarks.get(case_name)
    expected = benchmark.get("expected") if isinstance(benchmark, dict) and isinstance(benchmark.get("expected"), dict) else {}
    renderers = expected.get("renderers") if isinstance(expected.get("renderers"), list) else []
    return sorted(str(renderer) for renderer in renderers if isinstance(renderer, str))


def paid_canary_family(case_name: str, benchmark_index: dict[str, dict[str, Any]] | None = None) -> str:
    renderers = benchmark_renderers(case_name, benchmark_index)
    if renderers:
        return "+".join(renderers)
    return live_eval_case_class(case_name)


def case_needs_paid_canary(
    case_name: str,
    *,
    latest_records: dict[str, dict[str, Any]],
    latest_pass_records: dict[str, dict[str, Any]],
    stale_days: int,
) -> tuple[bool, str]:
    latest = latest_records.get(case_name)
    latest_pass = latest_pass_records.get(case_name)
    if latest is not None and latest.get("status") in {"FAIL", "BLOCKED"}:
        return True, f"latest live result is {latest.get('status')}"
    if latest_pass is None:
        return True, "no prior passing paid run"
    passed_at = parse_utc_datetime(latest_pass.get("timestamp"))
    if passed_at is None:
        return True, "prior pass has no usable timestamp"
    age = datetime.now(UTC) - passed_at
    if age > timedelta(days=stale_days):
        return True, f"last passing paid run is {age.days} days old"
    return False, f"recent pass within {stale_days} days"


def maybe_select_stale_canaries(
    selected_cases: list[str],
    *,
    enabled: bool,
    cost_ledger_path: Path | None,
    stale_days: int,
    benchmark_index: dict[str, dict[str, Any]],
) -> tuple[list[str], list[dict[str, str]]]:
    if not enabled:
        return selected_cases, []
    records = read_cost_ledger(cost_ledger_path)
    latest = latest_records_by_case(records)
    latest_passes = latest_pass_records_by_case(records)
    chosen_by_family: dict[str, dict[str, Any]] = {}
    case_infos: list[dict[str, Any]] = []
    decisions: list[dict[str, str]] = []
    for order, case_name in enumerate(selected_cases):
        family = paid_canary_family(case_name, benchmark_index)
        needs_run, reason = case_needs_paid_canary(
            case_name,
            latest_records=latest,
            latest_pass_records=latest_passes,
            stale_days=stale_days,
        )
        info = {"case": case_name, "family": family, "needsRun": needs_run, "reason": reason, "order": order}
        case_infos.append(info)
        if needs_run:
            current = chosen_by_family.get(family)
            sort_key = (
                PAID_CANARY_CASE_PRIORITY.get(case_name, 100),
                order,
            )
            current_key = (
                PAID_CANARY_CASE_PRIORITY.get(str(current.get("case")), 100) if current else 100,
                int(current.get("order", 100)) if current else 100,
            )
            if current is None or sort_key < current_key:
                chosen_by_family[family] = info
    chosen_cases = {str(info["case"]) for info in chosen_by_family.values()}
    for info in case_infos:
        case_name = str(info["case"])
        family = str(info["family"])
        chosen_info = chosen_by_family.get(family)
        chosen_case = str(chosen_info["case"]) if chosen_info else None
        if case_name in chosen_cases:
            decisions.append({"case": case_name, "family": family, "decision": "run", "reason": str(info["reason"])})
        elif chosen_case and info["needsRun"]:
            decisions.append(
                {
                    "case": case_name,
                    "family": family,
                    "decision": "skip",
                    "reason": f"higher-priority family canary selected: {chosen_case}",
                }
            )
        elif chosen_case:
            decisions.append({"case": case_name, "family": family, "decision": "skip", "reason": "family already selected"})
        else:
            decisions.append({"case": case_name, "family": family, "decision": "skip", "reason": str(info["reason"])})
    chosen = [str(info["case"]) for info in chosen_by_family.values()]
    chosen.sort(
        key=lambda selected_case: (
            PAID_CANARY_FAMILY_PRIORITY.get(paid_canary_family(selected_case, benchmark_index), 100),
            PAID_CANARY_CASE_PRIORITY.get(selected_case, 100),
            selected_cases.index(selected_case),
        )
    )
    return chosen, decisions


def live_eval_status_label(status: int) -> str:
    return "PASS" if status == 0 else "BLOCKED" if status == 2 else "FAIL"


def cost_ledger_record(
    *,
    requested_case: str,
    case_name: str,
    status: int,
    cost: float,
    tokens: int,
    repair_count: int,
    model: str | None,
    shape: dict[str, Any] | None,
    benchmark_index: dict[str, dict[str, Any]],
    reason: str | None = None,
    first_issues: list[str] | None = None,
) -> dict[str, Any]:
    attachment_stats = shape.get("attachmentStats") if isinstance(shape, dict) and isinstance(shape.get("attachmentStats"), dict) else {}
    record: dict[str, Any] = {
        "version": 1,
        "timestamp": utc_now_iso(),
        "requestedCase": requested_case,
        "case": case_name,
        "status": live_eval_status_label(status),
        "costUsd": round(float(cost), 6),
        "tokens": tokens,
        "repairCount": repair_count,
        "model": model or os.environ.get("OPENAI_MODEL") or "default",
        "caseClass": live_eval_case_class(case_name),
        "rendererFamily": paid_canary_family(case_name, benchmark_index),
        "renderers": benchmark_renderers(case_name, benchmark_index),
        "imageMaxLongEdge": assistant_image_max_long_edge(),
    }
    if reason:
        record["reason"] = reason
    if first_issues:
        record["firstIssues"] = [str(issue) for issue in first_issues[:MAX_LEDGER_FIRST_ISSUES]]
    if isinstance(shape, dict):
        record["requestShape"] = {
            "brainSelection": shape.get("brainSelection"),
            "brainFiles": shape.get("brainFiles"),
            "toolNames": shape.get("toolNames"),
            "instructionChars": shape.get("instructionChars"),
            "toolSchemaChars": shape.get("toolSchemaChars"),
            "inputChars": shape.get("inputChars"),
            "attachmentCount": shape.get("attachmentCount"),
            "providerAttachmentBytes": attachment_stats.get("providerAttachmentBytes"),
            "providerImagePixels": attachment_stats.get("providerImagePixels"),
            "optimizedAttachmentCount": attachment_stats.get("optimizedAttachmentCount"),
            "imageDetail": attachment_stats.get("imageDetail"),
        }
    return record


def print_cost_plan(
    case_name: str,
    *,
    model: str | None,
    max_cost: float,
    max_cases: int | None,
    case_cost_cap: float,
    provider_instruction_char_cap: int,
    provider_tool_schema_char_cap: int,
    provider_input_char_cap: int,
    provider_image_pixel_cap: int,
    paid_enabled: bool,
    cost_ledger_path: Path | None,
    select_stale_canaries: bool,
    stale_days: int,
) -> int:
    selected_cases = selected_live_cases(case_name)
    benchmark_index = benchmark_manifest_index()
    selected_cases, canary_decisions = maybe_select_stale_canaries(
        selected_cases,
        enabled=select_stale_canaries,
        cost_ledger_path=cost_ledger_path,
        stale_days=stale_days,
        benchmark_index=benchmark_index,
    )
    planned_cases = selected_cases[:max_cases] if max_cases is not None else selected_cases
    latest_records = latest_records_by_case(read_cost_ledger(cost_ledger_path))
    model_label = model or os.environ.get("OPENAI_MODEL") or "default assistant model"
    print("ASSISTANT LIVE EVAL COST PLAN")
    print(f"- provider configured: {'yes' if assistant_configured() else 'no'}")
    print(f"- model: {model_label}")
    print(f"- requested case/group: {case_name}")
    print(f"- selected cases: {len(selected_cases)}")
    print(f"- planned paid cases this run: {len(planned_cases)}")
    print(f"- cost ledger: {cost_ledger_path if cost_ledger_path is not None else 'disabled'}")
    if select_stale_canaries:
        print(f"- stale canary selector: enabled, one case per renderer family, stale after {stale_days} days")
        for decision in canary_decisions:
            print(
                f"  - {decision['decision']} {decision['case']} "
                f"({decision['family']}): {decision['reason']}"
            )
    else:
        print("- stale canary selector: disabled")
    print(f"- run max-cost cap: ${max_cost:.2f}")
    print(f"- post-case spike stop: ${case_cost_cap:.2f} per case")
    instruction_cap_label = (
        f"{provider_instruction_char_cap:,} per case" if provider_instruction_char_cap > 0 else "disabled"
    )
    schema_cap_label = (
        f"{provider_tool_schema_char_cap:,} per case" if provider_tool_schema_char_cap > 0 else "disabled"
    )
    print(f"- provider instruction char cap: {instruction_cap_label}")
    print(f"- provider tool-schema char cap: {schema_cap_label}")
    print(f"- provider input char cap: {provider_input_char_cap:,} per case")
    print(f"- provider image pixel cap: {provider_image_pixel_cap:,} per case")
    image_max_long_edge = assistant_image_max_long_edge()
    image_max_long_edge_label = str(image_max_long_edge) if image_max_long_edge > 0 else "disabled"
    print(f"- provider image max long edge: {image_max_long_edge_label}")
    print("- no-cost gates before paid real-exam work:")
    print("  - pnpm eval:assistant:benchmarks")
    print("  - pnpm eval:assistant:local")
    print("  - pnpm smoke:assistant:preview for renderer-heavy cases")
    print("- cases:")
    over_instruction_budget_cases: list[tuple[str, int]] = []
    over_schema_budget_cases: list[tuple[str, int]] = []
    over_char_budget_cases: list[tuple[str, int]] = []
    over_pixel_budget_cases: list[tuple[str, int]] = []
    for selected_case in planned_cases:
        case_class = live_eval_case_class(selected_case)
        benchmark = benchmark_index.get(selected_case)
        print(f"  - {selected_case}: class={case_class}; {benchmark_label(benchmark)}")
        print(f"    {cost_ledger_label(latest_records.get(selected_case))}")
        shape = provider_request_shape_for_case(selected_case, model=model)
        print(f"    request shape: {request_shape_label(shape)}")
        instruction_chars = shape.get("instructionChars")
        if (
            isinstance(instruction_chars, int)
            and provider_instruction_char_cap > 0
            and instruction_chars > provider_instruction_char_cap
        ):
            over_instruction_budget_cases.append((selected_case, instruction_chars))
        tool_schema_chars = shape.get("toolSchemaChars")
        if (
            isinstance(tool_schema_chars, int)
            and provider_tool_schema_char_cap > 0
            and tool_schema_chars > provider_tool_schema_char_cap
        ):
            over_schema_budget_cases.append((selected_case, tool_schema_chars))
        input_chars = shape.get("inputChars")
        if isinstance(input_chars, int) and provider_input_char_cap > 0 and input_chars > provider_input_char_cap:
            over_char_budget_cases.append((selected_case, input_chars))
        provider_image_pixels = provider_image_pixels_for_shape(shape)
        if provider_image_pixel_cap > 0 and provider_image_pixels > provider_image_pixel_cap:
            over_pixel_budget_cases.append((selected_case, provider_image_pixels))
    if len(planned_cases) < len(selected_cases):
        print(f"- skipped by --max-cases: {len(selected_cases) - len(planned_cases)} case(s)")
    if over_instruction_budget_cases:
        print("- provider instruction budget: blocked")
        for selected_case, instruction_chars in over_instruction_budget_cases:
            print(f"  - {selected_case}: {instruction_chars:,} chars > {provider_instruction_char_cap:,} cap")
        return 1
    print(
        "- provider instruction budget: ok"
        if provider_instruction_char_cap > 0
        else "- provider instruction budget: disabled"
    )
    if over_schema_budget_cases:
        print("- provider tool-schema budget: blocked")
        for selected_case, tool_schema_chars in over_schema_budget_cases:
            print(f"  - {selected_case}: {tool_schema_chars:,} chars > {provider_tool_schema_char_cap:,} cap")
        return 1
    print(
        "- provider tool-schema budget: ok"
        if provider_tool_schema_char_cap > 0
        else "- provider tool-schema budget: disabled"
    )
    if over_char_budget_cases:
        print("- provider input budget: blocked")
        for selected_case, input_chars in over_char_budget_cases:
            print(f"  - {selected_case}: {input_chars:,} chars > {provider_input_char_cap:,} cap")
        return 1
    print("- provider input budget: ok")
    if over_pixel_budget_cases:
        print("- provider image pixel budget: blocked")
        for selected_case, provider_image_pixels in over_pixel_budget_cases:
            print(f"  - {selected_case}: {provider_image_pixels:,} pixels > {provider_image_pixel_cap:,} cap")
        return 1
    print("- provider image pixel budget: ok")
    if paid_enabled:
        print("- paid execution: enabled by --allow-paid")
    else:
        print("- paid execution: blocked; append -- --allow-paid to a pnpm script after reviewing this plan")
    return 0


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


def empty_table_payload_issues(value: Any, path: str = "arguments") -> list[str]:
    issues: list[str] = []
    if isinstance(value, dict):
        for key, inner_value in value.items():
            child_path = f"{path}.{key}"
            if key in {"table", "solutionTable"}:
                if not isinstance(inner_value, dict):
                    issues.append(f"{child_path} should be omitted unless it is a table object with at least one row")
                elif not isinstance(inner_value.get("rows"), list) or not inner_value["rows"]:
                    issues.append(f"{child_path} is an empty table placeholder and should be omitted")
                continue
            if key in {"tables", "solutionTables"}:
                if isinstance(inner_value, list) and not inner_value:
                    issues.append(f"{child_path} is an empty table list and should be omitted")
                    continue
                if isinstance(inner_value, list):
                    for index, table in enumerate(inner_value):
                        if not isinstance(table, dict) or not isinstance(table.get("rows"), list) or not table["rows"]:
                            issues.append(f"{child_path}[{index}] is an empty table placeholder and should be omitted")
                    continue
            issues.extend(empty_table_payload_issues(inner_value, child_path))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            issues.extend(empty_table_payload_issues(item, f"{path}[{index}]"))
    return issues


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
    issues.extend(text_quality_issues(args))
    issues.extend(artifact_solution_text_mark_issues(args))
    issues.extend(empty_table_payload_issues(args))
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


def scalar_segment_label_tex_safe(value: Any) -> bool:
    label = str(value or "").strip()
    if not re.search(r"\bunits?\b", label, flags=re.IGNORECASE):
        return True
    stripped = re.sub(r"^\${1,2}|\${1,2}$", "", label)
    return bool(
        re.search(
            r"(?:\\[,;:! ]|~|\s)\\(?:text|mathrm)\s*\{\s*units?\s*\}|\\(?:text|mathrm)\s*\{\s+units?\s*\}",
            stripped,
            flags=re.IGNORECASE,
        )
    )


def scalar_angle_label_tex_safe(value: Any) -> bool:
    label = str(value or "").strip()
    if not label:
        return True
    stripped = re.sub(r"^\${1,2}|\${1,2}$", "", label)
    stripped = re.sub(r"^\\\(|\\\)$", "", stripped)
    compact = re.sub(r"\s+", "", stripped)
    if re.search(r"\\circ\b|\\circ\}", compact, flags=re.IGNORECASE):
        return True
    if re.search(r"°|\\degree\b|degrees?", compact, flags=re.IGNORECASE):
        return False
    return not bool(re.fullmatch(r"[+-]?\d+(?:\.\d+)?", compact))


def has_label_position(entry: dict[str, Any]) -> bool:
    return finite_number(entry.get("labelX")) is not None and finite_number(entry.get("labelY")) is not None


def segment_label_has_position(entry: dict[str, Any]) -> bool:
    return (
        has_label_position(entry)
        or finite_number(entry.get("offsetPx")) is not None
        or finite_number(entry.get("offset")) is not None
    )


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

    length_labels = [
        entry.get("lengthLabel")
        for entry in vector_entries.values()
        if isinstance(entry, dict) and entry.get("lengthLabel") is not False
    ]
    segment_labels = vector_ray.get("segmentLabels")
    if isinstance(segment_labels, list):
        length_labels.extend(label.get("label") for label in segment_labels if isinstance(label, dict))
    if any(not scalar_segment_label_tex_safe(label) for label in length_labels):
        issues.append("vectorRayDiagram magnitude labels should use TeX-safe \\ \\text{units}")

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
        if any(isinstance(marker, dict) and not scalar_angle_label_tex_safe(marker.get("label")) for marker in markers):
            issues.append("vectorRayDiagram angle labels should use TeX-safe ^\\circ notation")
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
    else:
        unpositioned_vectors = [
            str(vector.get("id") or vector.get("name") or "")
            for vector in vectors
            if isinstance(vector, dict)
            and str(vector.get("id") or vector.get("name") or "") in {"a", "b", "c", "d"}
            and not has_label_position(vector)
        ]
        if unpositioned_vectors:
            issues.append("native vector2d vector labels should set labelX/labelY for source ray label placement")
    segment_labels = vector2d.get("segmentLabels")
    if not isinstance(segment_labels, list) or len(segment_labels) < 4:
        issues.append("native vector2d diagram should preserve magnitude labels")
    elif any(
        isinstance(label, dict) and not scalar_segment_label_tex_safe(label.get("label")) for label in segment_labels
    ):
        issues.append("native vector2d magnitude labels should use TeX-safe \\text{units}")
    elif any(
        isinstance(label, dict)
        and re.search(r"\bunits?\b", str(label.get("label") or ""), flags=re.IGNORECASE)
        and not segment_label_has_position(label)
        for label in segment_labels
    ):
        issues.append("native vector2d magnitude labels should set labelX/labelY or offsetPx")
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
    if isinstance(angle_markers, list) and any(
        isinstance(marker, dict) and not scalar_angle_label_tex_safe(marker.get("label")) for marker in angle_markers
    ):
        issues.append("native vector2d angle labels should use TeX-safe ^\\circ notation")
    if isinstance(angle_markers, list) and any(
        isinstance(marker, dict)
        and "45" in str(marker.get("label") or "")
        and marker.get("rightAngle") is not True
        and not has_label_position(marker)
        for marker in angle_markers
    ):
        issues.append("native vector2d angle labels should set labelX/labelY")
    return issues


def compact_math_text(text: str) -> str:
    compact = re.sub(r"\s+", "", text.lower())
    compact = re.sub(r"\\underset\{\\sim\}\{([^{}]+)\}", r"\1", compact)
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


def graph2d_line_segment_angle_from_origin(feature: dict[str, Any]) -> float | None:
    if feature.get("kind") != "line_segment":
        return None
    x1 = finite_number(feature.get("x1"))
    y1 = finite_number(feature.get("y1"))
    x2 = finite_number(feature.get("x2"))
    y2 = finite_number(feature.get("y2"))
    if x1 is None or y1 is None or x2 is None or y2 is None:
        return None
    endpoint_tolerance = 0.15
    if abs(x1) <= endpoint_tolerance and abs(y1) <= endpoint_tolerance:
        dx = x2 - x1
        dy = y2 - y1
    elif abs(x2) <= endpoint_tolerance and abs(y2) <= endpoint_tolerance:
        dx = x1 - x2
        dy = y1 - y2
    else:
        return None
    if abs(dx) < 1e-9 and abs(dy) < 1e-9:
        return None
    import math

    return math.degrees(math.atan2(dy, dx)) % 360


def argand_graph_has_shifted_circle(graph_serialized: str) -> bool:
    if "|z-i|" in graph_serialized or "centredati" in graph_serialized or "centeredi" in graph_serialized:
        return True
    has_implicit_shifted_circle = "x^2" in graph_serialized and "y-1" in graph_serialized and "=4" in graph_serialized
    has_branch_shifted_circle = "sqrt(4-x^2)" in graph_serialized and (
        "+1" in graph_serialized or "1+" in graph_serialized
    )
    return has_implicit_shifted_circle or has_branch_shifted_circle


def argand_graph_has_origin_circle(graph_serialized: str) -> bool:
    return ("x^2+y^2=4" in graph_serialized or "y^2+x^2=4" in graph_serialized) and "y-1" not in graph_serialized


def argand_function_marks_argument_boundary(function_text: str, target_angle: int) -> bool:
    if target_angle == 30:
        return any(
            term in function_text
            for term in (
                "pi/6",
                "tan(pi/6)",
                "1/sqrt(3)",
                "sqrt(3)/3",
                "0.577",
                "0.58",
            )
        )
    if target_angle == 150:
        return any(
            term in function_text
            for term in (
                "5pi/6",
                "tan(5pi/6)",
                "-1/sqrt(3)",
                "-sqrt(3)/3",
                "-0.577",
                "-0.58",
            )
        )
    return False


def argand_function_marks_argument_boundary_ray(function: dict[str, Any], target_angle: int) -> bool:
    function_text = compact_math_text(json.dumps(function, ensure_ascii=False))
    if not argand_function_marks_argument_boundary(function_text, target_angle):
        return False
    domain_min = finite_number(function.get("domainMin"))
    domain_max = finite_number(function.get("domainMax"))
    if target_angle == 30:
        return domain_min is not None and domain_min >= -0.15 and (domain_max is None or domain_max > 0.5)
    if target_angle == 150:
        return domain_max is not None and domain_max <= 0.15 and (domain_min is None or domain_min < -0.5)
    return False


def argand_graph_has_argument_boundary_rays(configs: list[dict[str, Any]]) -> bool:
    angles: list[float] = []
    functions: list[dict[str, Any]] = []
    for config in configs:
        if config.get("type") != "graph2d":
            continue
        graph_functions = config.get("functions")
        if isinstance(graph_functions, list):
            functions.extend(function for function in graph_functions if isinstance(function, dict))
        features = config.get("features")
        if not isinstance(features, list):
            continue
        for feature in features:
            if not isinstance(feature, dict):
                continue
            angle = graph2d_line_segment_angle_from_origin(feature)
            if angle is not None:
                angles.append(angle)
    has_lower_boundary = any(
        angle_distance_degrees(angle, 30) <= 8 for angle in angles
    ) or any(argand_function_marks_argument_boundary_ray(function, 30) for function in functions)
    has_upper_boundary = any(
        angle_distance_degrees(angle, 150) <= 8 for angle in angles
    ) or any(argand_function_marks_argument_boundary_ray(function, 150) for function in functions)
    return has_lower_boundary and has_upper_boundary


def has_compact_vector_label(serialized: str, label: str) -> bool:
    serialized = serialized.replace("\\\\", "\\")
    escaped = re.escape(label)
    return bool(
        re.search(rf"\\vec\s*(?:\{{\s*{escaped}\s*\}}|\s+{escaped}\b)", serialized)
        or re.search(rf"\\underset\s*\{{\s*\\sim\s*\}}\s*\{{\s*{escaped}\s*\}}", serialized)
    )


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
    expected_solution_terms = (
        ("pi/10",),
        ("tan",),
        ("\\sec^2\\theta", "sec^2\\theta", "sec2\\theta"),
        ("78.54",),
    )
    for term_options in expected_solution_terms:
        if not any(term in solution_serialized for term in term_options):
            issues.append(f"lighthouse solution should preserve one of {term_options!r}")
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
    issues.extend(
        source_fidelity_issues(
            args,
            [
                {
                    "type": "statsChart",
                    "label": "statistics source probability-density graph",
                    "chartTypes": ("density",),
                },
                {
                    "type": "statsChart",
                    "label": "statistics density source",
                    "xLabelTerms": ("response", "time"),
                    "points": ((1.0, 0.03), (2.1, 0.2), (2.7, 0.18), (5.0, 0.02)),
                    "pointTolerance": 0.015,
                },
            ],
        )
    )

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


def source_table_rows(args: dict[str, Any]) -> list[list[str]]:
    rows: list[list[str]] = []
    for table in collect_source_tables(args):
        rows.extend(table_rows(table))
    return rows


def collect_source_tables(value: Any) -> list[dict[str, Any]]:
    tables: list[dict[str, Any]] = []
    if isinstance(value, dict):
        table = value.get("table")
        if isinstance(table, dict):
            tables.append(table)
        table_list = value.get("tables")
        if isinstance(table_list, list):
            tables.extend(table_item for table_item in table_list if isinstance(table_item, dict))
        for key, inner_value in value.items():
            if key in {"table", "tables", "solutionTable", "solutionTables"}:
                continue
            tables.extend(collect_source_tables(inner_value))
    elif isinstance(value, list):
        for item in value:
            tables.extend(collect_source_tables(item))
    return tables


def confidence_interval_table_has_row(rows: list[list[str]], row_label: str, required_terms: tuple[str, ...]) -> bool:
    for row in rows:
        if not row:
            continue
        compact_cells = [compact_math_text(cell) for cell in row]
        if compact_cells[0] != row_label.lower():
            continue
        compact_row = "|".join(compact_cells)
        if all(term in compact_row for term in required_terms):
            return True
    return False


def assert_real_specialist_confidence_intervals_call(call: dict[str, Any]) -> list[str]:
    issues, args = assert_source_question_common(call)
    if args is None:
        return issues

    serialized = call_text(call).lower()
    for term in ("online shopping", "december 2020", "400", "95%", "width", "200", "sample standard deviation"):
        if term not in serialized:
            issues.append(f"confidence-interval source conversion should preserve {term!r}")
    for term in ("population mean", "perth residents", "sample mean"):
        if term not in serialized:
            issues.append(f"confidence-interval source conversion should preserve {term!r}")

    graph_types = graph_config_types(args)
    if graph_types:
        issues.append(
            f"confidence-interval table source should not be converted to a diagram, got {sorted(graph_types)!r}"
        )

    rows = source_table_rows(args)
    compact_rows = [[compact_math_text(cell) for cell in row] for row in rows]
    joined_rows = "\n".join("|".join(row) for row in compact_rows)
    for term in ("confidenceinterval", "samplesize", "samplestandarddeviation", "confidencelevel"):
        if term not in joined_rows:
            issues.append(f"confidence-interval table should preserve header {term!r}")
    expected_rows = {
        "a": ("n", "s", "95%"),
        "b": ("n", "s", "99%"),
        "c": ("2n", "s", "95%"),
        "d": ("n", "0.8s", "95%"),
    }
    for label, required_terms in expected_rows.items():
        if not confidence_interval_table_has_row(rows, label, required_terms):
            issues.append(f"confidence-interval table should preserve row {label.upper()} with {required_terms!r}")

    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) != 6:
        issues.append("confidence-interval source should become six structured top-level parts")
        return issues
    leaves = structured_part_leaf_items(parts)
    expected_leaf_marks = [1, 2, 2, 3, 2, 1, 1]
    if len(leaves) != len(expected_leaf_marks):
        issues.append("confidence-interval source should preserve seven leaf marked parts/subparts")
    for index, expected_marks in enumerate(expected_leaf_marks):
        if index >= len(leaves):
            continue
        leaf = leaves[index]
        if leaf.get("marks") != expected_marks:
            issues.append(f"confidence-interval leaf part {index}.marks should be {expected_marks}")
        if not isinstance(leaf.get("studentSpaceLines"), int) or leaf["studentSpaceLines"] < 3:
            issues.append(f"confidence-interval leaf part {index}.studentSpaceLines should be at least 3")
    part_f = next(
        (part for part in parts if isinstance(part, dict) and str(part.get("label") or "").lower() == "f"), None
    )
    subparts = part_f.get("subparts") if isinstance(part_f, dict) else None
    if not isinstance(subparts, list) or len(subparts) != 2:
        issues.append("confidence-interval part f should preserve two structured subparts")
    else:
        labels = [str(subpart.get("label") or "").lower() for subpart in subparts if isinstance(subpart, dict)]
        if labels != ["i", "ii"]:
            issues.append("confidence-interval part f subparts should be labelled i and ii")
    expected_terms = (
        ("95%", "confidence interval"),
        ("standard deviation", "sample mean"),
        ("sample size", "width", "50"),
        ("probability", "2n", "50"),
        ("contains", "population mean"),
        ("smaller width",),
    )
    for index, terms in enumerate(expected_terms):
        if index >= len(parts) or not isinstance(parts[index], dict):
            continue
        part_text = str(parts[index].get("text") or "").lower()
        for term in terms:
            if term not in part_text:
                issues.append(f"parts[{index}].text should preserve {term!r}")
    if sum(int(leaf.get("marks") or 0) for leaf in leaves if isinstance(leaf, dict)) != 12:
        issues.append("confidence-interval leaf marks should total 12")

    solution_texts = collect_solution_texts(args)
    solution_joined = "\n".join(solution_texts)
    solution_serialized = compact_math_text(solution_joined)
    expected_solution_terms = (
        ("300", "500"),
        ("51.02",),
        ("16n",),
        ("36.0768", "36.08"),
        ("1.3859", "1.386"),
        ("0.166",),
        ("cannotdetermine", "cannotbedetermine"),
        ("unknown", "randomsampling"),
        (
            "95%islessthan99%",
            "95%,islessthanthatofb,99%",
            "95<99",
            "95%confidencelevelusesasmallercriticalvalue",
        ),
        ("0.707", "1/sqrt2"),
        ("0.8",),
    )
    for term_options in expected_solution_terms:
        if not any(term in solution_serialized for term in term_options):
            issues.append(f"confidence-interval solution should preserve one of {term_options!r}")
    if hidden_mark_total(solution_joined) != 12:
        issues.append("confidence-interval hidden [[marks:n]] total should be exactly 12")
    if visible_mark_note_count(solution_joined):
        issues.append("confidence-interval solution should use hidden [[marks:n]] ticks, not visible mark notes")
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
    issues.extend(
        source_fidelity_issues(
            args,
            [
                {
                    "type": "graph2d",
                    "label": "earthquake source graph",
                    "xLabelTerms": ("log", "M_0"),
                    "yLabelTerms": ("M_w",),
                    "bounds": {"xMin": 8, "xMax": 16, "yMin": 0, "yMax": 5},
                    "boundsTolerance": 0.05,
                    "serializedTerms": (
                        {
                            "terms": ("2/3", "0.666", "0.667", "0.666666"),
                            "message": "earthquake graph2d line should encode slope 2/3",
                        },
                        {"terms": ("-6",), "message": "earthquake graph2d line should encode vertical intercept -6"},
                    ),
                },
            ],
        )
    )

    if "log" not in serialized or "m_0" not in serialized.replace("{", "").replace("}", ""):
        issues.append("earthquake payload should keep log10(M_0) axis/variable notation")

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


STATS_CHART_DATA_FIELDS = {
    "barType",
    "bins",
    "binSize",
    "chartType",
    "dataMode",
    "frequencies",
    "mean",
    "points",
    "probabilities",
    "range",
    "stdDev",
    "values",
    "xLabel",
    "xValues",
    "yLabel",
    "yLabelOrientation",
    "yAxisMode",
    "yRange",
    "yValues",
}


def stats_chart_top_level_field_issues(graph_configs: list[dict[str, Any]], *, label: str) -> list[str]:
    issues: list[str] = []
    for config in graph_configs:
        if config.get("type") != "statsChart":
            continue
        misplaced_fields = sorted(STATS_CHART_DATA_FIELDS.intersection(config.keys()))
        if misplaced_fields:
            issues.append(
                f"{label} statsChart chart DSL fields must be under graphConfig.data, not top-level graphConfig: "
                f"{', '.join(misplaced_fields)}"
            )
    return issues


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


def stats_chart_count_field_issues(data_objects: list[dict[str, Any]], *, label: str) -> list[str]:
    issues: list[str] = []
    for data in data_objects:
        if data.get("dataMode") != "manualFrequencies":
            continue
        if not isinstance(data.get("xValues"), list):
            continue
        if isinstance(data.get("frequencies"), list):
            continue
        if isinstance(data.get("values"), list):
            issues.append(f"{label} statsChart exact count charts should use frequencies, not values")
    return issues


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


def stats_chart_field_value_issues(
    data_objects: list[dict[str, Any]],
    expected_fields: dict[str, Any],
    *,
    label: str,
) -> list[str]:
    issues: list[str] = []
    for field, expected_value in expected_fields.items():
        if any(data.get(field) == expected_value for data in data_objects):
            continue
        issues.append(f"{label} statsChart should preserve {field} {expected_value!r}")
    return issues


def stats_chart_label_issues(
    data_objects: list[dict[str, Any]],
    *,
    label: str,
    x_terms: tuple[str, ...] = (),
    y_terms: tuple[str, ...] = (),
) -> list[str]:
    issues: list[str] = []
    if x_terms and not any(
        all(compact_math_text(term) in compact_math_text(str(data.get("xLabel") or "")) for term in x_terms)
        for data in data_objects
    ):
        issues.append(f"{label} statsChart xLabel should preserve {'/'.join(x_terms)}")
    if y_terms and not any(
        all(compact_math_text(term) in compact_math_text(str(data.get("yLabel") or "")) for term in y_terms)
        for data in data_objects
    ):
        issues.append(f"{label} statsChart yLabel should preserve {'/'.join(y_terms)}")
    return issues


def stats_chart_range_issues(
    data_objects: list[dict[str, Any]],
    expected_range: tuple[float, float],
    *,
    label: str,
    tolerance: float = 1e-6,
) -> list[str]:
    for data in data_objects:
        range_value = data.get("range")
        if (
            isinstance(range_value, list)
            and len(range_value) >= 2
            and all(not isinstance(value, bool) and isinstance(value, (int, float)) for value in range_value[:2])
            and abs(float(range_value[0]) - expected_range[0]) <= tolerance
            and abs(float(range_value[1]) - expected_range[1]) <= tolerance
        ):
            return []
    return [f"{label} statsChart should preserve range [{expected_range[0]:g}, {expected_range[1]:g}]"]


def stats_chart_point_issues(
    data_objects: list[dict[str, Any]],
    expected_points: tuple[tuple[float, float], ...],
    *,
    label: str,
    tolerance: float,
) -> list[str]:
    observed_points: list[tuple[float, float]] = []
    for data in data_objects:
        points = data.get("points")
        if isinstance(points, list):
            for point in points:
                if not isinstance(point, dict):
                    continue
                x_value = point.get("x")
                y_value = point.get("y")
                if (
                    isinstance(x_value, bool)
                    or isinstance(y_value, bool)
                    or not isinstance(x_value, (int, float))
                    or not isinstance(y_value, (int, float))
                ):
                    continue
                observed_points.append((float(x_value), float(y_value)))
        x_values = data.get("xValues")
        y_values = data.get("yValues")
        if not isinstance(x_values, list) or not isinstance(y_values, list):
            continue
        for x_value, y_value in zip(x_values, y_values, strict=False):
            if (
                isinstance(x_value, bool)
                or isinstance(y_value, bool)
                or not isinstance(x_value, (int, float))
                or not isinstance(y_value, (int, float))
            ):
                continue
            observed_points.append((float(x_value), float(y_value)))
    issues: list[str] = []
    for expected_x, expected_y in expected_points:
        if any(
            abs(actual_x - expected_x) <= tolerance and abs(actual_y - expected_y) <= tolerance
            for actual_x, actual_y in observed_points
        ):
            continue
        issues.append(f"{label} statsChart should preserve source point ({expected_x:g}, {expected_y:g})")
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


def graph3d_label_texts(configs: list[dict[str, Any]]) -> list[str]:
    labels: list[str] = []
    for config in configs:
        data = config.get("data")
        if not isinstance(data, dict):
            continue
        for key in ("points", "vertices", "segments", "edges", "dimensions", "dimensionLines", "faces", "solids"):
            values = data.get(key)
            if not isinstance(values, list):
                continue
            for value in values:
                if isinstance(value, dict) and isinstance(value.get("label"), str):
                    labels.append(value["label"])
    return labels


def label_mentions_symbol(label: str, symbol: str) -> bool:
    normalized = re.sub(r"\\text\{([^}]*)\}", r"\1", label.lower())
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return re.search(rf"(?<![a-z0-9]){re.escape(symbol.lower())}(?![a-z0-9])", normalized) is not None


def uses_directed_segment_notation(text: str, segment: str) -> bool:
    normalized = text.lower().replace(" ", "")
    segment_lower = segment.lower()
    return any(
        pattern in normalized
        for pattern in (
            f"\\overrightarrow{{{segment_lower}}}",
            f"\\vec{{{segment_lower}}}",
            f"\\vec{segment_lower}",
        )
    )


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

    issues.extend(
        source_fidelity_issues(
            args,
            [
                {
                    "type": "statsChart",
                    "label": "ev source histogram",
                    "chartTypes": ("histogram",),
                },
                {
                    "type": "statsChart",
                    "label": "ev histogram source",
                    "fieldValues": {
                        "dataMode": "manualFrequencies",
                        "barType": "continuous",
                        "yAxisMode": "frequency",
                        "binSize": 20,
                    },
                    "xLabelTerms": ("W",),
                    "yLabelTerms": ("Frequency",),
                    "range": (260, 440),
                    "histogramCounts": {
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
                    "countLabel": "ev",
                },
            ],
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
    for term in ("ulam", "four standard dice", "500", "charity", "profit"):
        if term not in serialized:
            issues.append(f"dice-game source conversion should preserve {term!r}")
    if not any(term in serialized for term in ("10 000", "10\\,000", "10\\\\,000", "10,000")):
        issues.append("dice-game source conversion should preserve '10 000'")

    graph_types = graph_config_types(args)
    if "statsChart" not in graph_types:
        issues.append(f"dice-game source frequency chart should use statsChart, got {sorted(graph_types)!r}")
    if "graph2d" in graph_types:
        issues.append("dice-game frequency chart should not be converted as a generic graph2d graph")
    issues.extend(
        source_fidelity_issues(
            args,
            [
                {
                    "type": "statsChart",
                    "label": "dice-game source frequency chart",
                    "chartTypes": ("histogram",),
                    "fieldValues": {
                        "dataMode": "manualFrequencies",
                        "barType": "discrete",
                        "yAxisMode": "frequency",
                    },
                    "xLabelTerms": ("x",),
                    "yLabelTerms": ("f",),
                    "histogramCounts": {
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
                    "countLabel": "dice-game",
                    "allowNormalisedProbabilities": True,
                },
            ],
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
    graph_configs = collect_diagram_graph_configs(args)
    graph_serialized_raw = json.dumps(graph_configs, ensure_ascii=False).lower()
    graph_serialized = compact_math_text(graph_serialized_raw)
    for term in ("re", "im", "z1", "z2"):
        if term not in graph_serialized and term not in serialized:
            issues.append(f"argand diagram should preserve {term!r} labels")
    if not any(term in graph_serialized for term in ("circle", "x^2", "y-1", "region", "shade", "locus")):
        issues.append("argand locus graph should encode the circular shaded region semantics")
    if argand_graph_has_origin_circle(graph_serialized) and not argand_graph_has_shifted_circle(graph_serialized):
        issues.append("argand locus graph should not draw the circle centred at the origin")
    if not argand_graph_has_shifted_circle(graph_serialized):
        issues.append("argand locus graph should preserve shifted circle centre i and radius 2")
    if not argand_graph_has_argument_boundary_rays(graph_configs):
        issues.append("argand locus graph should include Arg(z) boundary rays at pi/6 and 5pi/6")
    for config in graph_configs:
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


def graph3d_dimension_entries(configs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    dimensions: list[dict[str, Any]] = []
    for config in configs:
        data = config.get("data")
        if not isinstance(data, dict):
            continue
        for key in ("dimensions", "dimensionLines"):
            values = data.get(key)
            if not isinstance(values, list):
                continue
            dimensions.extend(value for value in values if isinstance(value, dict))
    return dimensions


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


def graph3d_face_point_sets(configs: list[dict[str, Any]]) -> set[frozenset[str]]:
    face_sets: set[frozenset[str]] = set()
    for face in graph3d_face_entries(configs):
        points = face.get("points") if isinstance(face.get("points"), list) else face.get("vertices")
        if not isinstance(points, list):
            continue
        point_set = frozenset(graph3d_point_key(point) for point in points if graph3d_point_key(point))
        if point_set:
            face_sets.add(point_set)
    return face_sets


def graph3d_common_schema_issues(configs: list[dict[str, Any]], label: str) -> list[str]:
    issues: list[str] = []
    for config in configs:
        data = config.get("data")
        point_ids: set[str] = set()
        if isinstance(data, dict):
            if "vertices" in data:
                issues.append(f"{label} graph3d point list should use data.points, not data.vertices")
            if "edges" in data:
                issues.append(f"{label} graph3d segments should use data.segments, not data.edges")
            if "dimensionLines" in data:
                issues.append(f"{label} graph3d dimension lines should use data.dimensions, not data.dimensionLines")
            if "surfaces" in data:
                issues.append(f"{label} graph3d curved solids should use data.solids, not data.surfaces")
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
                if not isinstance(face, dict):
                    continue
                if "vertices" in face:
                    issues.append(f"{label} graph3d faces should use points, not vertices")
                if "style" in face:
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
        issues.append(
            "graph3d solid-family source should include separate graph3d diagrams for pyramid, cone, cylinder, and sphere"
        )
    issues.extend(graph3d_common_schema_issues(graph3d_configs, "graph3d solid-family"))

    issues.extend(
        source_fidelity_issues(
            args,
            [
                {
                    "type": "graph3d",
                    "label": "graph3d pyramid",
                    "pointCoords": {
                        "a": (0.0, 0.0, 0.0),
                        "b": (4.0, 0.0, 0.0),
                        "c": (4.0, 4.0, 0.0),
                        "d": (0.0, 4.0, 0.0),
                        "v": (2.0, 2.0, 3.0),
                    },
                    "segments": (
                        ("a", "b"),
                        ("b", "c"),
                        ("c", "d"),
                        ("a", "d"),
                        ("a", "v"),
                        ("b", "v"),
                        ("c", "v"),
                        ("d", "v"),
                    ),
                    "faces": (("a", "b", "c", "d"), ("a", "b", "v"), ("b", "c", "v"), ("c", "d", "v"), ("d", "a", "v")),
                    "minFaces": 5,
                    "minFacesMessage": "graph3d pyramid diagram should include polygon faces, not just edge lines",
                },
                {
                    "type": "graph3d",
                    "label": "graph3d solid-family",
                    "solidSpecs": (
                        {
                            "kind": "cone",
                            "requiredFields": ("baseCenter",),
                            "requiredAnyFields": (("apex", "height"),),
                            "positiveNumberFields": ("radius",),
                            "renderStyles": ("surface", "wireframe", "outline"),
                        },
                        {
                            "kind": "cylinder",
                            "requiredFields": ("baseCenter",),
                            "requiredAnyFields": (("topCenter", "height"),),
                            "positiveNumberFields": ("radius",),
                            "renderStyles": ("surface", "wireframe", "outline"),
                        },
                        {
                            "kind": "sphere",
                            "requiredFields": ("center",),
                            "positiveNumberFields": ("radius",),
                            "renderStyles": ("surface", "wireframe", "outline"),
                        },
                    ),
                    "dimensionSymbols": ("h", "r"),
                    "requireDimensionEndpoints": True,
                    "requireDimensionLabelText": True,
                    "requireDimensionLabelTextMessage": (
                        "graph3d solid-family diagrams should preserve height/radius labels in data.dimensions"
                    ),
                },
            ],
        )
    )

    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) != 4:
        issues.append("graph3d solid-family source should become exactly four structured parts")
        return issues
    expected_marks = [2, 2, 2, 2]
    expected_terms = (
        ("pyramid", "vertices", "height"),
        ("cone", "radius", "height"),
        ("cylinder", "radius", "height"),
        ("sphere", "radius"),
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
    for validation_issue in graph2d_validation_issues_from_call(call):
        issues.append(
            "spherical-cap graph2d validation issue at "
            f"{validation_issue.get('path')}: {validation_issue.get('message')}"
        )

    graph3d_configs = [config for config in graph_configs if config.get("type") == "graph3d"]
    solids = graph3d_solid_entries(graph3d_configs)
    solid_kinds = {graph3d_solid_kind(solid) for solid in solids}
    if "sphere" in solid_kinds and "spherecap" not in solid_kinds and "sphericalcap" not in solid_kinds:
        issues.append("spherical-cap graph3d data should not represent the cap as only a full sphere")
    issues.extend(graph3d_common_schema_issues(graph3d_configs, "spherical-cap"))
    issues.extend(
        source_fidelity_issues(
            args,
            [
                {
                    "type": "graph3d",
                    "label": "spherical-cap",
                    "solidSpecs": (
                        {
                            "kind": ("sphereCap", "sphericalCap"),
                            "display": "sphereCap",
                            "missingMessage": (
                                "spherical-cap graph3d data should use a sphereCap solid, not a full sphere placeholder"
                            ),
                            "requiredFields": ("center",),
                            "requiredAnyFields": (("axis", "normal"),),
                            "positiveAnyNumberFields": (("height", "depth"),),
                            "numberFields": {"radius": 10},
                            "numberTolerance": 0.25,
                        },
                    ),
                    "labelSymbols": ("h",),
                    "labelSymbolMessages": {
                        "h": (
                            "spherical-cap graph3d diagram should preserve the visible depth label h "
                            "on a segment or dimension"
                        ),
                    },
                },
            ],
        )
    )
    for validation_issue in graph3d_validation_issues_from_call(call):
        issues.append(
            "spherical-cap graph3d validation issue at "
            f"{validation_issue.get('path')}: {validation_issue.get('message')}"
        )

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
        for key in ("axisLabels", "showAxes", "showGrid", "width", "height", "widthPx", "heightPx", "scalePercent"):
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
    issues.extend(
        source_fidelity_issues(
            args,
            [
                {
                    "type": "graph3d",
                    "label": "3d prism",
                    "pointCoords": {
                        "o": (0.0, 0.0, 0.0),
                        "a": (2.0, 0.0, 0.0),
                        "b": (2.0, 4.0, 0.0),
                        "c": (0.0, 4.0, 0.0),
                        "t": (0.0, 0.0, 3.0),
                        "d": (2.0, 0.0, 3.0),
                        "e": (2.0, 4.0, 3.0),
                        "f": (0.0, 4.0, 3.0),
                        "m": (0.0, 2.0, 1.5),
                    },
                    "segments": (
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
                    ),
                    "dashedSegments": (("o", "c"), ("o", "t")),
                }
            ],
        )
    )
    for pair in segment_pairs:
        if any(point in {"xaxis", "yaxis", "zaxis"} for point in pair):
            issues.append("3d prism graph3d data should not include axis helper segments")
    for label in graph3d_label_texts(graph3d_configs):
        if uses_directed_segment_notation(label, "BT"):
            issues.append("3d prism graph3d label for line BT should not use directed vector/ray notation")
        if uses_directed_segment_notation(label, "AM"):
            issues.append("3d prism graph3d label for line AM should not use directed vector/ray notation")

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
        if index == 0 and uses_directed_segment_notation(part_text, "BT"):
            issues.append("3d prism part (a) should preserve main diagonal line BT notation")
        if index == 2:
            if uses_directed_segment_notation(part_text, "AM"):
                issues.append("3d prism part (c) should preserve line AM notation")
            if uses_directed_segment_notation(part_text, "BT"):
                issues.append("3d prism part (c) should preserve line BT notation")
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


def assert_real_specialist_square_pyramid_call(call: dict[str, Any]) -> list[str]:
    issues, args = assert_source_question_common(call)
    if args is None:
        return issues

    serialized = call_text(call).lower()
    compact_serialized = compact_math_text(serialized)
    for term in ("square pyramid", "coordinate system", "midpoint of db", "midpoint of edge ab", "midpoint of ef"):
        if compact_math_text(term) not in compact_serialized:
            issues.append(f"square-pyramid source conversion should preserve {term!r}")
    for term in ("abcd", "point e", "origin o", "top view", "right angle"):
        if compact_math_text(term) not in compact_serialized and term not in serialized:
            issues.append(f"square-pyramid source conversion should preserve {term!r}")
    for term in ("fe", "dm", "dmf"):
        if term not in compact_serialized:
            issues.append(f"square-pyramid source conversion should preserve vector/angle term {term!r}")

    graph_types = graph_config_types(args)
    if "graph3d" not in graph_types:
        issues.append(f"square-pyramid 3D diagram should use graph3d, got {sorted(graph_types)!r}")
    if "graph2d" not in graph_types:
        issues.append(f"square-pyramid top-view diagram should use graph2d, got {sorted(graph_types)!r}")
    if len(args.get("diagrams") or []) >= 2 and args.get("diagramLayout") not in {
        "columns",
        "sideBySide",
        "side-by-side",
        "side_by_side",
    }:
        issues.append("square-pyramid source should preserve side-by-side diagrams with diagramLayout columns")
    if args.get("diagramLayout") in {"columns", "sideBySide", "side-by-side", "side_by_side"} and args.get(
        "diagramColumns"
    ) not in {
        2,
        "2",
        None,
    }:
        issues.append("square-pyramid side-by-side diagram layout should use two columns")
    if any(graph_type in graph_types for graph_type in ("statsChart", "network", "setDiagram", "vector2d")):
        issues.append("square-pyramid source should not use statsChart, network, setDiagram, or vector2d")

    graph_configs = collect_diagram_graph_configs(args)
    graph3d_configs = [config for config in graph_configs if config.get("type") == "graph3d"]
    graph2d_configs = [config for config in graph_configs if config.get("type") == "graph2d"]
    issues.extend(graph3d_common_schema_issues(graph3d_configs, "square-pyramid"))

    point_coords = graph3d_semantics(graph3d_configs)[0]
    issues.extend(
        source_fidelity_issues(
            args,
            [
                {
                    "type": "graph3d",
                    "label": "square-pyramid",
                    "pointIds": ("a", "b", "c", "d", "e", "f", "m", "o"),
                    "segments": (
                        ("a", "b"),
                        ("b", "c"),
                        ("c", "d"),
                        ("a", "d"),
                        ("e", "a"),
                        ("e", "b"),
                        ("e", "c"),
                        ("e", "d"),
                        ("d", "m"),
                        ("e", "f"),
                        ("f", "m"),
                    ),
                    "requireAnyDashed": True,
                    "requireAnyDashedMessage": (
                        "square-pyramid graph3d should mark at least one hidden edge/diagonal as dashed"
                    ),
                    "faces": (
                        ("a", "b", "c", "d"),
                        ("a", "b", "e"),
                        ("b", "c", "e"),
                        ("c", "d", "e"),
                        ("a", "d", "e"),
                    ),
                    "minFaces": 5,
                    "minFacesMessage": (
                        "square-pyramid graph3d diagram should include all five pyramid faces, not just edge lines"
                    ),
                },
            ],
        )
    )

    def midpoint_issue(target: str, first: str, second: str, label: str) -> str | None:
        target_coords = point_coords.get(target)
        first_coords = point_coords.get(first)
        second_coords = point_coords.get(second)
        if target_coords is None or first_coords is None or second_coords is None:
            return None
        expected = tuple((a + b) / 2 for a, b in zip(first_coords, second_coords, strict=False))
        if not graph3d_close_coords(target_coords, expected, tolerance=0.08):
            return f"square-pyramid graph3d point {target.upper()} should be midpoint of {label}"
        return None

    for issue in (
        midpoint_issue("o", "d", "b", "D and B"),
        midpoint_issue("f", "a", "b", "A and B"),
        midpoint_issue("m", "e", "f", "E and F"),
    ):
        if issue:
            issues.append(issue)

    graph2d_serialized = json.dumps(graph2d_configs, ensure_ascii=False).lower()
    graph2d_compact = compact_math_text(graph2d_serialized)
    for term in ("a", "b", "c", "d", "o", "e", "f", "m"):
        if graph2d_configs and term not in graph2d_compact:
            issues.append(f"square-pyramid top-view graph2d should preserve label {term.upper()}")
    if graph2d_configs and not (
        has_compact_vector_label(graph2d_serialized, "a") and has_compact_vector_label(graph2d_serialized, "b")
    ):
        issues.append("square-pyramid top-view graph2d should preserve vector labels a and b")
    if graph2d_configs:
        top_view_points = graph2d_labelled_point_coords(graph2d_configs, ("a", "b", "c", "d", "o", "e", "f", "m"))
        top_view_point = {label: values[0] if values else None for label, values in top_view_points.items()}
        if (
            top_view_point.get("o") is None
            and top_view_point.get("e") is not None
            and graph2d_has_symbol_label(graph2d_configs, "o")
        ):
            top_view_point["o"] = top_view_point["e"]
        for label, coords in top_view_point.items():
            if coords is None:
                issues.append(f"square-pyramid top-view graph2d should include labelled point {label.upper()}")
        for first, second in (("a", "b"), ("b", "c"), ("c", "d"), ("d", "a"), ("d", "b"), ("c", "a")):
            if not graph2d_has_segment_between(graph2d_configs, top_view_point.get(first), top_view_point.get(second)):
                issues.append(f"square-pyramid top-view graph2d should include segment {first.upper()}{second.upper()}")
        for first, second, vector_label in (("o", "a", "a"), ("o", "b", "b")):
            if not graph2d_has_vector_ray_toward(
                graph2d_configs,
                top_view_point.get(first),
                top_view_point.get(second),
                label=vector_label,
            ):
                issues.append(
                    f"square-pyramid top-view graph2d should include vector {vector_label} ray from {first.upper()} toward {second.upper()}"
                )
        if not graph2d_close_point(top_view_point.get("o"), top_view_point.get("e")):
            issues.append("square-pyramid top-view graph2d should project E onto O")

        def top_view_midpoint_issue(target: str, first: str, second: str, label: str) -> str | None:
            target_coords = top_view_point.get(target)
            first_coords = top_view_point.get(first)
            second_coords = top_view_point.get(second)
            if target_coords is None or first_coords is None or second_coords is None:
                return None
            expected = tuple((a + b) / 2 for a, b in zip(first_coords, second_coords, strict=False))
            if not graph2d_close_point(target_coords, expected):
                return f"square-pyramid top-view graph2d point {target.upper()} should be midpoint of {label}"
            return None

        for issue in (
            top_view_midpoint_issue("o", "d", "b", "D and B"),
            top_view_midpoint_issue("f", "a", "b", "A and B"),
            top_view_midpoint_issue("m", "e", "f", "E and F"),
        ):
            if issue:
                issues.append(issue)

    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) != 3:
        issues.append("square-pyramid source should become exactly three structured top-level parts")
        return issues
    leaves = structured_part_leaf_items(parts)
    expected_leaf_marks = [1, 1, 4, 2]
    if [int(leaf.get("marks") or 0) for leaf in leaves] != expected_leaf_marks:
        issues.append(f"square-pyramid leaf part marks should be {expected_leaf_marks}")
    if sum(int(leaf.get("marks") or 0) for leaf in leaves) != 8:
        issues.append("square-pyramid structured marks should total 8")
    if args.get("marks") not in (0, None) or args.get("questionMarks") not in (0, None):
        issues.append(
            "square-pyramid multipart source should keep top-level marks/questionMarks at 0 and preserve marks on parts/subparts"
        )
    part_a = next(
        (part for part in parts if isinstance(part, dict) and str(part.get("label") or "").lower() == "a"), None
    )
    subparts = part_a.get("subparts") if isinstance(part_a, dict) else None
    if not isinstance(subparts, list) or len(subparts) != 2:
        issues.append("square-pyramid part a should preserve two structured subparts")
    else:
        labels = [str(subpart.get("label") or "").lower() for subpart in subparts if isinstance(subpart, dict)]
        if labels != ["i", "ii"]:
            issues.append("square-pyramid part a subparts should be labelled i and ii")
    leaf_terms = (("fe",), ("dm",), ("dm", "fe", "x", "y"), ("dmf", "right angle"))
    for index, leaf in enumerate(leaves):
        if index >= len(leaf_terms) or not isinstance(leaf, dict):
            continue
        leaf_text = compact_math_text(str(leaf.get("text") or ""))
        for term in leaf_terms[index]:
            if compact_math_text(term) not in leaf_text:
                issues.append(f"square-pyramid leaf part {index}.text should preserve {term!r}")
        if not isinstance(leaf.get("studentSpaceLines"), int) or leaf["studentSpaceLines"] < 3:
            issues.append(f"square-pyramid leaf part {index}.studentSpaceLines should be at least 3")

    solution_texts = collect_solution_texts(args)
    solution_serialized = compact_math_text("\n".join(solution_texts))
    expected_solution_terms = (
        ("-0.5a-0.5b+e", "-1/2a-1/2b+e", "-\\frac12a-\\frac12b+e"),
        ("0.25a+1.25b+0.5e", "1/4a+5/4b+1/2e"),
        ("-0.75", "-3/4"),
        ("0.5e", "1/2e"),
        ("sqrt(3/2)", "\\sqrt{3/2}", "\\sqrt3/2", "sqrt6/2", "\\sqrt6/2", "\\frac{\\sqrt6}{2}"),
    )
    for term_options in expected_solution_terms:
        if not any(compact_math_text(term) in solution_serialized for term in term_options):
            issues.append(f"square-pyramid solution should preserve one of {term_options!r}")
    if hidden_mark_total("\n".join(solution_texts)) != 8:
        issues.append("square-pyramid hidden [[marks:n]] total should be exactly 8")
    if visible_mark_note_count("\n".join(solution_texts)):
        issues.append("square-pyramid solution should use hidden [[marks:n]] ticks, not visible mark notes")
    return issues


def assert_real_specialist_implicit_call(call: dict[str, Any]) -> list[str]:
    issues, args = assert_source_question_common(call)
    if args is None:
        return issues

    serialized = call_text(call).lower()
    compact_serialized = compact_math_text(serialized)
    for term in ("implicitly defines", "curve", "slope", "origin"):
        if term not in serialized:
            issues.append(f"implicit-curve source conversion should preserve {term!r}")
    if compact_math_text("points A and B") not in compact_serialized:
        issues.append("implicit-curve source conversion should preserve 'points A and B'")
    if "x" not in serialized or "y" not in serialized:
        issues.append("implicit-curve source conversion should preserve x/y variables")

    graph_types = graph_config_types(args)
    if "graph2d" not in graph_types:
        issues.append(f"implicit curve source diagram should use graph2d, got {sorted(graph_types)!r}")
    if any(graph_type in graph_types for graph_type in ("statsChart", "geometricConstruction", "network")):
        issues.append("implicit curve source should not use statsChart, geometricConstruction, or network")
    graph_configs = collect_diagram_graph_configs(args)
    implicit_relation_functions: list[dict[str, Any]] = []
    for config_path, config in collect_diagram_graph_configs_with_paths(args):
        if config.get("type") != "graph2d":
            continue
        if "axisLabels" in config:
            issues.append("implicit curve graph2d should use showAxisLabels, not unsupported axisLabels")
        if "gridStep" in config:
            issues.append("implicit curve graph2d should use gridMajorStep/gridMinorStep, not unsupported gridStep")
        functions = config.get("functions")
        if not isinstance(functions, list):
            continue
        for index, function in enumerate(functions):
            if not isinstance(function, dict):
                continue
            if graph2d_function_preserves_implicit_curve(function):
                implicit_relation_functions.append(function)
                if function.get("kind") != "relation":
                    issues.append(
                        f"{config_path}.functions[{index}] should encode implicit curves with kind:'relation', not {function.get('kind')!r}"
                    )
            elif function.get("kind") == "implicit":
                issues.append(
                    f"{config_path}.functions[{index}].kind should be 'relation'; graph2d does not support kind:'implicit'"
                )
    if not implicit_relation_functions:
        issues.append("implicit curve graph2d should encode the relation x^3 + y^3 = 3xy + y")
    graph_point_labels: set[str] = set()
    for config in graph_configs:
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
    expected_points = (
        ("$O$", 0.0, 0.0, "origin O"),
        ("$A$", -0.475, 0.225, "point A near (-0.475, 0.225)"),
        ("$B$", 1.395, 1.947, "point B near (1.395, 1.947)"),
    )
    for label, x, y, description in expected_points:
        if not graph2d_has_point_feature(graph_configs, label, x, y, tolerance=0.035):
            issues.append(f"implicit curve graph should include {description}")

    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) != 2:
        issues.append("implicit curve source should become exactly two structured parts")
        return issues
    expected_marks = [3, 3]
    expected_terms = (("implicit", "dy"), ("x", "coordinates", "a", "b", "x^4"))
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


def assert_real_specialist_ski_modelling_call(call: dict[str, Any]) -> list[str]:
    issues, args = assert_source_question_common(call)
    if args is None:
        return issues

    serialized = call_text(call).lower()
    for term in ("ski", "jumper", "32", "sloped ground", "170", "0.5"):
        if term not in serialized:
            issues.append(f"ski-modelling source conversion should preserve {term!r}")
    for point_label in ("$b$", "$e$"):
        if point_label not in serialized:
            issues.append(f"ski-modelling source conversion should preserve point label {point_label}")
    if "x'(t)" not in serialized and "x ' ( t )" not in serialized and "x prime" not in serialized:
        issues.append("ski-modelling source conversion should preserve x'(t) notation")
    if "e" not in serialized or "-0.05" not in serialized:
        issues.append("ski-modelling source conversion should preserve exponential horizontal velocity")

    graph_types = graph_config_types(args)
    if "graph2d" not in graph_types:
        issues.append(f"ski-modelling source diagram should use graph2d, got {sorted(graph_types)!r}")
    if any(graph_type in graph_types for graph_type in ("statsChart", "geometricConstruction", "network", "graph3d")):
        issues.append("ski-modelling source should not use statsChart, geometricConstruction, network, or graph3d")
    graph_configs = [config for config in collect_diagram_graph_configs(args) if config.get("type") == "graph2d"]
    graph_serialized = json.dumps(graph_configs, ensure_ascii=False).lower()
    graph_functions = graph2d_visible_function_entries(graph_configs)
    if len(graph_functions) < 3:
        issues.append("ski-modelling graph2d should include at least three visible source curves")
    if not graph2d_has_function(
        graph_configs,
        ("120+60", "100-x", "/100", ("^2", "**2")),
        domain_min=0,
        domain_max=100,
        tolerance=0.75,
    ):
        issues.append("ski-modelling graph2d should encode the ramp descent over 0 <= x <= 100")
    if not graph2d_has_function(
        graph_configs,
        ("170", ("-0.5*x", "-0.5x", "-x/2", "-1/2*x", "-1/2x"), "x"),
        domain_min=100,
        domain_max=340,
        tolerance=0.75,
    ):
        issues.append("ski-modelling graph2d should encode the sloped ground y = 170 - 0.5x over 100 <= x <= 340")
    if not graph2d_has_function(
        graph_configs,
        ("120", "-1000", ("log", "ln"), "740-x", "640", ("^2", "**2")),
        domain_min=100,
        domain_max=255.916,
        tolerance=0.75,
    ):
        issues.append("ski-modelling graph2d should encode the Cartesian flight curve over 100 <= x <= 255.916")
    if not any(graph2d_preserves_ski_modelling_axes(config) for config in graph_configs):
        issues.append("ski-modelling graph2d should preserve large source axes/bounds and visible axis labels")
    if not graph2d_has_point_feature(graph_configs, "$B$", 0, 180, tolerance=0.75):
        issues.append("ski-modelling graph2d should include point $B$ near (0, 180)")
    if not graph2d_has_point_feature(graph_configs, "$E$", 100, 120, tolerance=0.75):
        issues.append("ski-modelling graph2d should include point $E$ near (100, 120)")
    if not graph2d_has_point_feature(graph_configs, None, 255.915887, 42.04205652, tolerance=0.75):
        issues.append("ski-modelling graph2d should include landing point near (255.916, 42.042)")
    for label in ("$B$", "$E$"):
        if label.lower() not in graph_serialized:
            issues.append(f"ski-modelling graph2d should include labelled point {label}")

    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) != 5:
        issues.append("ski-modelling source should become exactly five structured parts")
        return issues
    expected_marks = [2, 3, 3, 3, 3]
    expected_terms = (
        ("x(t)", "740", "640"),
        ("3", "height", "sloped ground"),
        ("vertical lift", "s", "9.8"),
        ("time", "land", "sloped ground"),
        ("angle", "impacts", "sloped ground"),
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
        if not isinstance(part.get("studentSpaceLines"), int) or part["studentSpaceLines"] < 3:
            issues.append(f"parts[{index}].studentSpaceLines should be at least 3")
    if sum(part.get("marks", 0) for part in parts if isinstance(part, dict)) != 14:
        issues.append("ski-modelling structured part marks should total 14")

    solution_texts = collect_solution_texts(args)
    solution_serialized = compact_math_text("\n".join(solution_texts))
    expected_solution_terms = (
        ("740-640e^-0.05t", "740-640*e^-0.05t", "740-640exp(-0.05t)"),
        ("22.07",),
        ("s=4.8", "s=4.8ms-2", "s=4.8m/s^2"),
        ("255.915887", "255.916"),
        ("5.58",),
        ("24.2042",),
        ("-27.9209",),
        ("22.5",),
    )
    for term_options in expected_solution_terms:
        if not any(term in solution_serialized for term in term_options):
            issues.append(f"ski-modelling solution should preserve one of {term_options!r}")
    if hidden_mark_total("\n".join(solution_texts)) != 14:
        issues.append("ski-modelling hidden [[marks:n]] total should be exactly 14")
    if visible_mark_note_count("\n".join(solution_texts)):
        issues.append("ski-modelling solution should use hidden [[marks:n]] ticks, not visible mark notes")
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


def graph2d_visible_function_entries(graph_configs: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
    configs = graph_configs if isinstance(graph_configs, list) else [graph_configs]
    entries: list[dict[str, Any]] = []
    for config in configs:
        functions = config.get("functions") if isinstance(config, dict) else None
        if not isinstance(functions, list):
            continue
        entries.extend(
            function
            for function in functions
            if isinstance(function, dict)
            and function.get("show") is not False
            and str(function.get("expression") or "").strip()
        )
    return entries


def graph2d_numeric(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        with contextlib.suppress(ValueError):
            return float(value)
    return None


def graph2d_number_near(value: Any, expected: float, tolerance: float) -> bool:
    number = graph2d_numeric(value)
    return number is not None and abs(number - expected) <= tolerance


def graph2d_axis_label_issues(
    graph_configs: list[dict[str, Any]],
    *,
    label: str,
    x_terms: tuple[str, ...] = (),
    y_terms: tuple[str, ...] = (),
) -> list[str]:
    issues: list[str] = []
    graph2d_configs = [config for config in graph_configs if config.get("type") == "graph2d"]
    if x_terms and not any(
        all(compact_math_text(term) in compact_math_text(str(config.get("xAxisLabel") or "")) for term in x_terms)
        for config in graph2d_configs
    ):
        issues.append(f"{label} graph2d xAxisLabel should preserve {'/'.join(x_terms)}")
    if y_terms and not any(
        all(compact_math_text(term) in compact_math_text(str(config.get("yAxisLabel") or "")) for term in y_terms)
        for config in graph2d_configs
    ):
        issues.append(f"{label} graph2d yAxisLabel should preserve {'/'.join(y_terms)}")
    return issues


def graph2d_bounds_issues(
    graph_configs: list[dict[str, Any]],
    expected_bounds: dict[str, float],
    *,
    label: str,
    tolerance: float = 1e-6,
) -> list[str]:
    graph2d_configs = [config for config in graph_configs if config.get("type") == "graph2d"]
    issues: list[str] = []
    for key, expected_value in expected_bounds.items():
        if any(graph2d_number_near(config.get(key), expected_value, tolerance) for config in graph2d_configs):
            continue
        issues.append(f"{label} graph2d {key} should preserve source value {expected_value:g}")
    return issues


def source_fidelity_serialized_term_issue(graph_configs: list[dict[str, Any]], check: dict[str, Any]) -> str | None:
    graph_serialized = compact_math_text(json.dumps(graph_configs, ensure_ascii=False))
    raw_terms = check.get("terms")
    term_options = raw_terms if isinstance(raw_terms, tuple | list) else (raw_terms,)
    if any(isinstance(term, str) and compact_math_text(term) in graph_serialized for term in term_options):
        return None
    message = check.get("message")
    return message if isinstance(message, str) else "source graph should preserve required graph term"


def source_fidelity_graph3d_pair(pair: Any) -> tuple[tuple[str, str], str] | None:
    if not isinstance(pair, tuple | list) or len(pair) < 2:
        return None
    first = graph3d_point_key(pair[0])
    second = graph3d_point_key(pair[1])
    if not first or not second:
        return None
    return tuple(sorted((first, second))), f"{first.upper()}{second.upper()}"


def source_fidelity_values(value: Any) -> tuple[Any, ...]:
    if value is None:
        return ()
    if isinstance(value, tuple | list | set):
        return tuple(value)
    return (value,)


def source_fidelity_graph3d_solid_key(value: Any) -> str:
    return re.sub(r"[^a-z]", "", str(value or "").lower())


def source_fidelity_graph3d_solid_spec_issues(
    solids: list[dict[str, Any]],
    solid_spec: dict[str, Any],
    *,
    label: str,
) -> list[str]:
    issues: list[str] = []
    kind_choices = tuple(
        key
        for key in (source_fidelity_graph3d_solid_key(kind) for kind in source_fidelity_values(solid_spec.get("kind")))
        if key
    )
    if not kind_choices:
        return issues
    display_kind = str(solid_spec.get("display") or source_fidelity_values(solid_spec.get("kind"))[0])
    matching_solids = [solid for solid in solids if graph3d_solid_kind(solid) in kind_choices]
    if not matching_solids:
        missing_message = solid_spec.get("missingMessage")
        issues.append(
            missing_message
            if isinstance(missing_message, str)
            else f"{label} graph3d data should include a {display_kind} solid"
        )
        return issues
    allowed_render_styles = tuple(str(style) for style in source_fidelity_values(solid_spec.get("renderStyles")))
    number_fields = solid_spec.get("numberFields")
    required_any_fields = tuple(
        tuple(str(field) for field in source_fidelity_values(field_options))
        for field_options in source_fidelity_values(solid_spec.get("requiredAnyFields"))
    )
    positive_any_number_fields = tuple(
        tuple(str(field) for field in source_fidelity_values(field_options))
        for field_options in source_fidelity_values(solid_spec.get("positiveAnyNumberFields"))
    )
    for index, solid in enumerate(matching_solids):
        for field in source_fidelity_values(solid_spec.get("requiredFields")):
            field_name = str(field)
            if field_name not in solid:
                issues.append(f"{label} graph3d {display_kind}[{index}] should include {field_name}")
        for field_options in required_any_fields:
            if field_options and not any(field in solid for field in field_options):
                issues.append(f"{label} graph3d {display_kind}[{index}] should include {' or '.join(field_options)}")
        for field in source_fidelity_values(solid_spec.get("positiveNumberFields")):
            field_name = str(field)
            value = solid.get(field_name)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
                issues.append(f"{label} graph3d {display_kind} solid should include a positive {field_name}")
        for field_options in positive_any_number_fields:
            if not field_options:
                continue
            if not any(
                not isinstance(solid.get(field), bool)
                and isinstance(solid.get(field), (int, float))
                and solid[field] > 0
                for field in field_options
            ):
                issues.append(
                    f"{label} graph3d {display_kind}[{index}] should include a positive {'/'.join(field_options)}"
                )
        if isinstance(number_fields, dict):
            for field_name, expected_value in number_fields.items():
                value = solid.get(str(field_name))
                if (
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or not approximately(
                        value,
                        float(expected_value),
                        tolerance=float(solid_spec.get("numberTolerance", 1e-6)),
                    )
                ):
                    issues.append(
                        f"{label} graph3d {display_kind}[{index}].{field_name} "
                        f"should preserve source {field_name} {float(expected_value):g}"
                    )
        if allowed_render_styles:
            render_style = str(solid.get("renderStyle") or "")
            if render_style not in allowed_render_styles:
                issues.append(
                    f"{label} graph3d {display_kind} solid should include renderStyle "
                    f"{', '.join(allowed_render_styles[:-1]) + ', or ' if len(allowed_render_styles) > 1 else ''}"
                    f"{allowed_render_styles[-1]}"
                )
    return issues


def source_fidelity_issues(args: dict[str, Any], specs: list[dict[str, Any]]) -> list[str]:
    graph_configs = collect_diagram_graph_configs(args)
    issues: list[str] = []
    for spec in specs:
        label = str(spec.get("label") or "source")
        diagram_type = spec.get("type")
        if diagram_type == "graph2d":
            graph2d_configs = [config for config in graph_configs if config.get("type") == "graph2d"]
            if spec.get("xLabelTerms") or spec.get("yLabelTerms"):
                issues.extend(
                    graph2d_axis_label_issues(
                        graph2d_configs,
                        label=label,
                        x_terms=tuple(spec.get("xLabelTerms") or ()),
                        y_terms=tuple(spec.get("yLabelTerms") or ()),
                    )
                )
            bounds = spec.get("bounds")
            if isinstance(bounds, dict):
                issues.extend(
                    graph2d_bounds_issues(
                        graph2d_configs,
                        {str(key): float(value) for key, value in bounds.items() if isinstance(value, int | float)},
                        label=label,
                        tolerance=float(spec.get("boundsTolerance", 1e-6)),
                    )
                )
            for check in spec.get("serializedTerms") or ():
                if isinstance(check, dict):
                    issue = source_fidelity_serialized_term_issue(graph2d_configs, check)
                    if issue:
                        issues.append(issue)
        elif diagram_type == "statsChart":
            top_level_field_issues = stats_chart_top_level_field_issues(graph_configs, label=label)
            issues.extend(top_level_field_issues)
            if top_level_field_issues:
                continue
            data_objects = stats_chart_data_objects(args)
            chart_types = {str(data.get("chartType")) for data in data_objects if data.get("chartType")}
            for chart_type in spec.get("chartTypes") or ():
                if str(chart_type) not in chart_types:
                    issues.append(f"{label} should use statsChart chartType='{chart_type}'")
            field_values = spec.get("fieldValues")
            if isinstance(field_values, dict):
                issues.extend(stats_chart_field_value_issues(data_objects, field_values, label=label))
            if spec.get("xLabelTerms") or spec.get("yLabelTerms"):
                issues.extend(
                    stats_chart_label_issues(
                        data_objects,
                        label=label,
                        x_terms=tuple(spec.get("xLabelTerms") or ()),
                        y_terms=tuple(spec.get("yLabelTerms") or ()),
                    )
                )
            range_value = spec.get("range")
            if isinstance(range_value, tuple | list) and len(range_value) >= 2:
                issues.extend(
                    stats_chart_range_issues(
                        data_objects,
                        (float(range_value[0]), float(range_value[1])),
                        label=label,
                        tolerance=float(spec.get("rangeTolerance", 1e-6)),
                    )
                )
            counts = spec.get("histogramCounts")
            if isinstance(counts, dict):
                issues.extend(stats_chart_count_field_issues(data_objects, label=str(spec.get("countLabel") or label)))
                issues.extend(
                    stats_histogram_count_issues(
                        data_objects,
                        {float(key): int(value) for key, value in counts.items()},
                        label=str(spec.get("countLabel") or label),
                        allow_normalised_probabilities=bool(spec.get("allowNormalisedProbabilities")),
                    )
                )
            points = spec.get("points")
            if isinstance(points, tuple | list):
                issues.extend(
                    stats_chart_point_issues(
                        data_objects,
                        tuple(
                            (float(point[0]), float(point[1]))
                            for point in points
                            if isinstance(point, tuple | list) and len(point) >= 2
                        ),
                        label=label,
                        tolerance=float(spec.get("pointTolerance", 1e-6)),
                    )
                )
        elif diagram_type == "graph3d":
            graph3d_configs = [config for config in graph_configs if config.get("type") == "graph3d"]
            point_coords, segment_pairs, dashed_pairs = graph3d_semantics(graph3d_configs)
            coord_tolerance = float(spec.get("coordTolerance", 0.02))
            for point_id in spec.get("pointIds") or ():
                key = graph3d_point_key(point_id)
                if key and key not in point_coords:
                    issues.append(f"{label} graph3d data should include named point {key.upper()}")
            point_specs = spec.get("pointCoords")
            if isinstance(point_specs, dict):
                for point_id, coords in point_specs.items():
                    if not isinstance(coords, tuple | list) or len(coords) < 3:
                        continue
                    key = graph3d_point_key(point_id)
                    if not key:
                        continue
                    expected = (float(coords[0]), float(coords[1]), float(coords[2]))
                    if not graph3d_close_coords(point_coords.get(key), expected, tolerance=coord_tolerance):
                        issues.append(f"{label} graph3d point {key.upper()} should have coordinates {expected}")
            for pair in spec.get("segments") or ():
                pair_spec = source_fidelity_graph3d_pair(pair)
                if pair_spec is None:
                    continue
                pair_key, display_pair = pair_spec
                if pair_key not in segment_pairs:
                    issues.append(f"{label} graph3d data should include segment {display_pair}")
            for pair in spec.get("dashedSegments") or ():
                pair_spec = source_fidelity_graph3d_pair(pair)
                if pair_spec is None:
                    continue
                pair_key, display_pair = pair_spec
                if pair_key not in dashed_pairs:
                    issues.append(f"{label} graph3d segment {display_pair} should be dashed/dotted like the source")
            if spec.get("requireAnyDashed") and not dashed_pairs:
                message = spec.get("requireAnyDashedMessage")
                issues.append(
                    message
                    if isinstance(message, str)
                    else f"{label} graph3d should mark at least one hidden edge/diagonal as dashed"
                )
            face_sets = graph3d_face_point_sets(graph3d_configs)
            for face in spec.get("faces") or ():
                if not isinstance(face, tuple | list):
                    continue
                face_points = tuple(graph3d_point_key(point) for point in face)
                if not face_points or not all(face_points):
                    continue
                if frozenset(face_points) not in face_sets:
                    display_face = "".join(point.upper() for point in face_points)
                    issues.append(f"{label} graph3d faces should include face {display_face}")
            min_faces = spec.get("minFaces")
            if isinstance(min_faces, int) and len(face_sets) < min_faces:
                message = spec.get("minFacesMessage")
                issues.append(
                    message
                    if isinstance(message, str)
                    else f"{label} graph3d diagram should include at least {min_faces} faces, not just edge lines"
                )
            solids = graph3d_solid_entries(graph3d_configs)
            for solid_spec in spec.get("solidSpecs") or ():
                if isinstance(solid_spec, dict):
                    issues.extend(source_fidelity_graph3d_solid_spec_issues(solids, solid_spec, label=label))
            dimension_entries = graph3d_dimension_entries(graph3d_configs)
            for symbol in spec.get("dimensionSymbols") or ():
                if not any(
                    label_mentions_symbol(str(dimension.get("label") or ""), str(symbol))
                    for dimension in dimension_entries
                ):
                    issues.append(f"{label} graph3d diagrams should include a labelled {symbol} dimension")
            if spec.get("requireDimensionEndpoints"):
                for dimension in dimension_entries:
                    if "from" not in dimension or "to" not in dimension:
                        issues.append(f"{label} graph3d dimension entries should include from and to endpoints")
            if (
                spec.get("requireDimensionLabelText")
                and not " ".join(str(dimension.get("label") or "") for dimension in dimension_entries).strip()
            ):
                message = spec.get("requireDimensionLabelTextMessage")
                issues.append(
                    message
                    if isinstance(message, str)
                    else f"{label} graph3d diagrams should preserve dimension labels in data.dimensions"
                )
            for symbol in spec.get("labelSymbols") or ():
                if not any(
                    label_mentions_symbol(label_text, str(symbol))
                    for label_text in graph3d_label_texts(graph3d_configs)
                ):
                    message = (
                        spec.get("labelSymbolMessages", {}).get(symbol)
                        if isinstance(spec.get("labelSymbolMessages"), dict)
                        else None
                    )
                    issues.append(
                        message
                        if isinstance(message, str)
                        else f"{label} graph3d diagram should preserve visible label {symbol}"
                    )
    return issues


def graph2d_function_has_terms(function: dict[str, Any], required_terms: tuple[str | tuple[str, ...], ...]) -> bool:
    expression = compact_math_text(str(function.get("expression") or ""))
    if not expression:
        return False
    for term_options in required_terms:
        choices = term_options if isinstance(term_options, tuple) else (term_options,)
        if not any(compact_math_text(choice) in expression for choice in choices):
            return False
    return True


def compact_algebra_text(text: str) -> str:
    return compact_math_text(text).replace("*", "").replace("\\times", "").replace(".", "")


def graph2d_function_preserves_implicit_curve(function: dict[str, Any]) -> bool:
    expression = compact_algebra_text(str(function.get("expression") or ""))
    if not all(term in expression for term in ("x^3", "y^3", "3xy")):
        return False
    return bool(re.search(r"(^|[=+\-])y($|[=+\-])", expression))


def graph2d_function_has_domain(
    function: dict[str, Any],
    *,
    domain_min: float,
    domain_max: float,
    tolerance: float,
) -> bool:
    return graph2d_number_near(function.get("domainMin"), domain_min, tolerance) and graph2d_number_near(
        function.get("domainMax"), domain_max, tolerance
    )


def graph2d_has_function(
    graph_configs: list[dict[str, Any]],
    required_terms: tuple[str | tuple[str, ...], ...],
    *,
    domain_min: float,
    domain_max: float,
    tolerance: float = 1e-6,
) -> bool:
    return any(
        graph2d_function_has_terms(function, required_terms)
        and graph2d_function_has_domain(
            function,
            domain_min=domain_min,
            domain_max=domain_max,
            tolerance=tolerance,
        )
        for function in graph2d_visible_function_entries(graph_configs)
    )


def graph2d_preserves_ski_modelling_axes(graph_config: dict[str, Any]) -> bool:
    if graph_config.get("showAxes") is not True or graph_config.get("showAxisLabels") is not True:
        return False
    if graph_config.get("showGrid") is not True or graph_config.get("showAxisNumbers") is not True:
        return False
    bounds = (
        graph2d_numeric(graph_config.get("xMin")),
        graph2d_numeric(graph_config.get("xMax")),
        graph2d_numeric(graph_config.get("yMin")),
        graph2d_numeric(graph_config.get("yMax")),
    )
    if any(bound is None for bound in bounds):
        return False
    x_min, x_max, y_min, y_max = (float(bound) for bound in bounds if bound is not None)
    return x_min <= 5 and x_max >= 340 and y_min <= 5 and y_max >= 180


def graph2d_has_point_feature(
    graph_configs: list[dict[str, Any]],
    label: str | None,
    x: float,
    y: float,
    *,
    tolerance: float,
) -> bool:
    expected_label = compact_math_text(label) if label is not None else None
    for config in graph_configs:
        features = config.get("features") if isinstance(config, dict) else None
        if not isinstance(features, list):
            continue
        for feature in features:
            if not isinstance(feature, dict) or feature.get("kind") != "point":
                continue
            if expected_label is not None and compact_math_text(str(feature.get("label") or "")) != expected_label:
                continue
            if graph2d_number_near(feature.get("x"), x, tolerance) and graph2d_number_near(
                feature.get("y"), y, tolerance
            ):
                return True
    return False


def graph2d_labelled_point_coords(
    graph_configs: list[dict[str, Any]],
    labels: tuple[str, ...],
) -> dict[str, list[tuple[float, float]]]:
    coords: dict[str, list[tuple[float, float]]] = {label: [] for label in labels}
    for config in graph_configs:
        features = config.get("features") if isinstance(config, dict) else None
        if not isinstance(features, list):
            continue
        for feature in features:
            if not isinstance(feature, dict) or feature.get("kind") != "point":
                continue
            x_value = graph2d_numeric(feature.get("x"))
            y_value = graph2d_numeric(feature.get("y"))
            if x_value is None or y_value is None:
                continue
            label_text = str(feature.get("label") or "")
            for label in labels:
                if label_mentions_symbol(label_text, label):
                    coords[label].append((float(x_value), float(y_value)))
    return coords


def graph2d_has_symbol_label(graph_configs: list[dict[str, Any]], label: str) -> bool:
    for config in graph_configs:
        features = config.get("features") if isinstance(config, dict) else None
        if not isinstance(features, list):
            continue
        for feature in features:
            if isinstance(feature, dict) and label_mentions_symbol(str(feature.get("label") or ""), label):
                return True
    return False


def graph2d_close_point(
    actual: tuple[float, float] | None,
    expected: tuple[float, float] | None,
    *,
    tolerance: float = 0.08,
) -> bool:
    return (
        actual is not None
        and expected is not None
        and all(
            abs(actual_value - expected_value) <= tolerance
            for actual_value, expected_value in zip(actual, expected, strict=False)
        )
    )


def graph2d_line_segments(configs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    for config in configs:
        features = config.get("features") if isinstance(config, dict) else None
        if not isinstance(features, list):
            continue
        for feature in features:
            if isinstance(feature, dict) and feature.get("kind") == "line_segment":
                segments.append(feature)
    return segments


def graph2d_segment_endpoint_pair(segment: dict[str, Any]) -> tuple[tuple[float, float], tuple[float, float]] | None:
    x1 = graph2d_numeric(segment.get("x1"))
    y1 = graph2d_numeric(segment.get("y1"))
    x2 = graph2d_numeric(segment.get("x2"))
    y2 = graph2d_numeric(segment.get("y2"))
    if x1 is None or y1 is None or x2 is None or y2 is None:
        return None
    return (float(x1), float(y1)), (float(x2), float(y2))


def graph2d_has_segment_between(
    graph_configs: list[dict[str, Any]],
    first: tuple[float, float] | None,
    second: tuple[float, float] | None,
    *,
    label: str | None = None,
    tolerance: float = 0.08,
) -> bool:
    if first is None or second is None:
        return False
    for segment in graph2d_line_segments(graph_configs):
        endpoints = graph2d_segment_endpoint_pair(segment)
        if endpoints is None:
            continue
        start, end = endpoints
        endpoints_match = (
            graph2d_close_point(start, first, tolerance=tolerance)
            and graph2d_close_point(end, second, tolerance=tolerance)
        ) or (
            graph2d_close_point(start, second, tolerance=tolerance)
            and graph2d_close_point(end, first, tolerance=tolerance)
        )
        if not endpoints_match:
            continue
        if label is None or has_compact_vector_label(str(segment.get("label") or ""), label):
            return True
    return False


def graph2d_point_on_ray(
    start: tuple[float, float] | None,
    point: tuple[float, float] | None,
    target: tuple[float, float] | None,
    *,
    tolerance: float = 0.08,
) -> bool:
    if start is None or point is None or target is None:
        return False
    vx = point[0] - start[0]
    vy = point[1] - start[1]
    tx = target[0] - start[0]
    ty = target[1] - start[1]
    ray_length = (vx * vx + vy * vy) ** 0.5
    target_length = (tx * tx + ty * ty) ** 0.5
    if ray_length <= tolerance or target_length <= tolerance:
        return False
    cross = abs(vx * ty - vy * tx)
    dot = vx * tx + vy * ty
    return cross <= tolerance * max(ray_length, target_length, 1.0) and dot > 0


def graph2d_has_vector_ray_toward(
    graph_configs: list[dict[str, Any]],
    start: tuple[float, float] | None,
    target: tuple[float, float] | None,
    *,
    label: str,
    tolerance: float = 0.08,
) -> bool:
    if start is None or target is None:
        return False
    for segment in graph2d_line_segments(graph_configs):
        if not has_compact_vector_label(str(segment.get("label") or ""), label):
            continue
        endpoints = graph2d_segment_endpoint_pair(segment)
        if endpoints is None:
            continue
        segment_start, segment_end = endpoints
        if graph2d_close_point(segment_start, start, tolerance=tolerance) and graph2d_point_on_ray(
            start,
            segment_end,
            target,
            tolerance=tolerance,
        ):
            return True
    return False


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
        if "axisLabels" in config:
            issues.append(
                {
                    "path": f"{config_path}.axisLabels",
                    "message": "graph2d does not read axisLabels.",
                    "expected": "showAxisLabels for renderer-owned x/y labels",
                }
            )
        if "gridStep" in config:
            issues.append(
                {
                    "path": f"{config_path}.gridStep",
                    "message": "graph2d does not support gridStep.",
                    "expected": "gridMajorStep/gridMinorStep or gridMajorStepX/gridMajorStepY",
                }
            )
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
            if "axisLabels" in options:
                issues.append(
                    {
                        "path": f"{config_path}.options.axisLabels",
                        "message": "graph2d options.axisLabels is not read by the renderer.",
                        "expected": "showAxisLabels for renderer-owned x/y labels",
                    }
                )
        functions = config.get("functions")
        if isinstance(functions, list):
            for index, function in enumerate(functions):
                if not isinstance(function, dict):
                    continue
                if not isinstance(function.get("expression"), str) or not str(function.get("expression") or "").strip():
                    expected = "expression"
                    if "equation" in function:
                        expected = "move equation into expression"
                    issues.append(
                        {
                            "path": f"{config_path}.functions[{index}].expression",
                            "message": "graph2d functions must include a non-empty expression field.",
                            "expected": expected,
                        }
                    )
                if "equation" in function:
                    issues.append(
                        {
                            "path": f"{config_path}.functions[{index}].equation",
                            "message": "graph2d does not support equation as a function field.",
                            "expected": "expression",
                        }
                    )
                kind = function.get("kind")
                if kind is not None and kind not in {"expression", "piecewise", "relation"}:
                    issues.append(
                        {
                            "path": f"{config_path}.functions[{index}].kind",
                            "message": "graph2d function kind must be expression, piecewise, or relation.",
                            "expected": "relation for implicit equations",
                        }
                    )
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
                kind = feature.get("kind")
                if kind is not None and (not isinstance(kind, str) or kind not in GRAPH2D_FEATURE_KINDS):
                    issues.append(
                        {
                            "path": f"{config_path}.features[{index}].kind",
                            "message": f"graph2d feature kind {kind!r} is not supported.",
                            "expected": "one of " + ", ".join(sorted(GRAPH2D_FEATURE_KINDS)),
                        }
                    )
                for key, (message, expected) in GRAPH2D_UNSUPPORTED_FEATURE_FIELDS.items():
                    if key in feature:
                        issues.append(
                            {
                                "path": f"{config_path}.features[{index}].{key}",
                                "message": message,
                                "expected": expected,
                            }
                        )
    return issues


def graph3d_validation_issues_from_call(call: dict[str, Any]) -> list[dict[str, Any]]:
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return []
    issues: list[dict[str, Any]] = []
    for config_path, config in collect_diagram_graph_configs_with_paths(args):
        if config.get("type") != "graph3d":
            continue
        metadata = config.get("metadata")
        if isinstance(metadata, dict):
            for key in ("axisLabels", "showAxes", "showGrid"):
                if key in metadata:
                    issues.append(
                        {
                            "path": f"{config_path}.metadata.{key}",
                            "message": f"graph3d {key} is renderer-owned; do not put it in metadata.",
                            "expected": f"{config_path}.metadata.view3d only",
                        }
                    )
            for key in ("width", "height", "widthPx", "heightPx", "scalePercent"):
                if key in metadata:
                    expected = (
                        f"{config_path}.scalePercent"
                        if key == "scalePercent"
                        else f"{config_path}.{key if key not in {'width', 'height'} else key + 'Px'}"
                    )
                    issues.append(
                        {
                            "path": f"{config_path}.metadata.{key}",
                            "message": f"graph3d {key} must be a top-level graphConfig field, not metadata.{key}.",
                            "expected": expected,
                        }
                    )
            view3d = metadata.get("view3d")
            if isinstance(view3d, dict):
                if "camera" in view3d:
                    issues.append(
                        {
                            "path": f"{config_path}.metadata.view3d.camera",
                            "message": "graph3d uses az/el/bank, not Plotly-style camera metadata.",
                            "expected": "{ az, el, bank }",
                        }
                    )
                for key in ("az", "el", "bank"):
                    value = view3d.get(key)
                    if isinstance(value, bool) or not isinstance(value, (int, float)):
                        issues.append(
                            {
                                "path": f"{config_path}.metadata.view3d.{key}",
                                "message": "graph3d view metadata must include numeric az, el, and bank.",
                                "expected": "numeric radian-style renderer value",
                            }
                        )
                    else:
                        limit = 3.2 if key == "el" else 6.4
                        if abs(float(value)) > limit:
                            issues.append(
                                {
                                    "path": f"{config_path}.metadata.view3d.{key}",
                                    "message": "graph3d view metadata must use radian-style renderer values, not degrees.",
                                    "expected": "numeric radian-style renderer value",
                                }
                            )
            elif view3d is not None:
                issues.append(
                    {
                        "path": f"{config_path}.metadata.view3d",
                        "message": "graph3d metadata.view3d must be an object with az, el, and bank.",
                        "expected": "{ az, el, bank }",
                    }
                )
        data = config.get("data")
        if not isinstance(data, dict):
            continue
        for key, expected in (
            ("vertices", "data.points"),
            ("edges", "data.segments"),
            ("dimensionLines", "data.dimensions"),
            ("surfaces", "data.solids"),
        ):
            if key in data:
                issues.append(
                    {
                        "path": f"{config_path}.data.{key}",
                        "message": f"graph3d provider aliases are normalized at the assistant boundary; emit {expected} directly.",
                        "expected": expected,
                    }
                )
        for key in ("points", "vertices", "segments", "edges", "dimensions", "dimensionLines", "faces", "solids"):
            values = data.get(key)
            if not isinstance(values, list):
                continue
            for index, entry in enumerate(values):
                if isinstance(entry, dict) and "visible" in entry:
                    issues.append(
                        {
                            "path": f"{config_path}.data.{key}[{index}].visible",
                            "message": "graph3d does not read visible; use show instead.",
                            "expected": "show",
                        }
                    )
        points = data.get("points")
        if isinstance(points, list):
            for index, point in enumerate(points):
                if not isinstance(point, dict):
                    continue
                point_id = str(point.get("id") or "").lower()
                if point_id in {"xaxis", "yaxis", "zaxis"}:
                    issues.append(
                        {
                            "path": f"{config_path}.data.points[{index}].id",
                            "message": "graph3d axes are renderer-owned; do not add axis helper points.",
                            "expected": "only source-named vertices and construction points",
                        }
                    )
        segments = data.get("segments")
        if isinstance(segments, list):
            for index, segment in enumerate(segments):
                if not isinstance(segment, dict):
                    continue
                if "style" in segment:
                    issues.append(
                        {
                            "path": f"{config_path}.data.segments[{index}].style",
                            "message": "graph3d segment styling must use strokeStyle:'dashed' or dashed:true, not style.",
                            "expected": "strokeStyle:'dashed' or dashed:true",
                        }
                    )
                endpoint_values = [segment.get("from"), segment.get("to")]
                points_value = segment.get("points")
                if isinstance(points_value, list):
                    endpoint_values.extend(points_value[:2])
                if any(str(value or "").lower() in {"xaxis", "yaxis", "zaxis"} for value in endpoint_values):
                    issues.append(
                        {
                            "path": f"{config_path}.data.segments[{index}]",
                            "message": "graph3d axes are renderer-owned; do not add axis helper segments.",
                            "expected": "only source visible/hidden edges, diagonals, and named lines",
                        }
                    )
    return issues


def real_slope_field_repair_failure_output(call: dict[str, Any], first_issues: list[str]) -> dict[str, Any]:
    validation_issues = graph2d_validation_issues_from_call(call)
    for issue in first_issues:
        if "slopeField.highlightedPoints" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.data.slopeField.highlightedPoints",
                    "message": issue,
                    "expected": "include every source point where the student must calculate or draw a slope segment",
                }
            )
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


def real_implicit_repair_failure_output(call: dict[str, Any], first_issues: list[str]) -> dict[str, Any]:
    validation_issues = graph2d_validation_issues_from_call(call)
    for issue in first_issues:
        if "encode the relation" in issue or "kind:'relation'" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.functions",
                    "message": (
                        "Implicit graph2d curves must be a supported relation function. Use "
                        "kind:'relation' with expression x^3 + y^3 = 3*x*y + y, or the equivalent "
                        "x^3 + y^3 - 3*x*y - y = 0."
                    ),
                    "expected": "graphConfig.functions[{ kind:'relation', expression:'x^3 + y^3 = 3*x*y + y' }]",
                }
            )
        if "point A near" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.features",
                    "message": "The implicit-curve source graph should include point A at approximately (-0.475, 0.225).",
                    "expected": "{ kind:'point', x:-0.475, y:0.225, label:'$A$' }",
                }
            )
        if "point B near" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.features",
                    "message": "The implicit-curve source graph should include point B at approximately (1.395, 1.947).",
                    "expected": "{ kind:'point', x:1.395, y:1.947, label:'$B$' }",
                }
            )
        if "-0.475" in issue:
            validation_issues.append(
                {
                    "path": "arguments.parts[1].solutionText",
                    "message": "Use the official 0.001-rounded coordinate for point A from the marking key.",
                    "expected": "A=(-0.475,0.225)",
                }
            )
        if "unsupported axisLabels" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.axisLabels",
                    "message": "graph2d does not read axisLabels.",
                    "expected": "showAxisLabels for renderer-owned x/y labels",
                }
            )
        if "unsupported gridStep" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.gridStep",
                    "message": "graph2d does not support gridStep.",
                    "expected": "gridMajorStep/gridMinorStep or gridMajorStepX/gridMajorStepY",
                }
            )
    if not validation_issues:
        validation_issues = [
            {
                "path": "arguments.diagram.graphConfig",
                "message": issue,
                "expected": "source-faithful native graph2d implicit relation with labelled curve points",
            }
            for issue in first_issues[:8]
        ]
    return validation_failure_output(
        tool_name=call.get("mauthToolName"),
        validation_issues=validation_issues,
        message="Mauth graph2d validation failed.",
    )


def real_source_graph2d_repair_failure_output(call: dict[str, Any], first_issues: list[str]) -> dict[str, Any]:
    validation_issues = graph2d_validation_issues_from_call(call)
    for issue in first_issues:
        if "should use graph2d" in issue or "should not use" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.type",
                    "message": issue,
                    "expected": "graph2d",
                }
            )
        elif "xAxisLabel" in issue or "yAxisLabel" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig",
                    "message": issue,
                    "expected": "source-faithful graph2d axis labels",
                }
            )
        elif "xMin" in issue or "xMax" in issue or "yMin" in issue or "yMax" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig",
                    "message": issue,
                    "expected": "source-faithful graph2d bounds",
                }
            )
        elif "graph2d" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig",
                    "message": issue,
                    "expected": "source-faithful native graph2d payload",
                }
            )
    if not validation_issues:
        validation_issues = [
            {
                "path": "arguments.diagram.graphConfig",
                "message": issue,
                "expected": "source-faithful native graph2d payload",
            }
            for issue in first_issues[:8]
        ]
    return validation_failure_output(
        tool_name=call.get("mauthToolName"),
        validation_issues=validation_issues,
        message="Mauth graph2d source-fidelity validation failed.",
    )


def real_lighthouse_repair_failure_output(call: dict[str, Any], first_issues: list[str]) -> dict[str, Any]:
    validation_issues: list[dict[str, Any]] = []
    for issue in first_issues:
        if "should use geometricConstruction" in issue or "should not use" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.type",
                    "message": issue,
                    "expected": "geometricConstruction",
                }
            )
        elif "Unexpected ensure token" in issue or "styleSource" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.options.styleSource",
                    "message": issue,
                    "expected": (
                        "omit custom Penrose styleSource/domainSource. Keep graphConfig.type='geometricConstruction' "
                        "and repair only graphConfig.options.substanceSource with supported geometry preset predicates; "
                        "do not switch this lighthouse source diagram to graph2d."
                    ),
                }
            )
        elif "render through Penrose" in issue or "Penrose Substance" in issue or "Variable " in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.options.substanceSource",
                    "message": issue,
                    "expected": (
                        "renderable Penrose Substance. Declare Point L, C, P and NamedSegment LC, CP, LP; "
                        "label existing points directly with Label L $L$, Label C $C$, Label P $P$; "
                        "do not invent undeclared point-label variables such as LLabel/CLabel/PLabel. "
                        "Attach length/angle labels with LabelsSegment/LabelsAngle. Use RightAngle(L, C, P) "
                        "for the visible corner marker; PerpendicularToSegment needs a declared Line first, "
                        "not a NamedSegment such as LC. Keep graphConfig.type='geometricConstruction'; do not "
                        "repair this source diagram by switching to graph2d."
                    ),
                }
            )
        elif "right angle" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.options.substanceSource",
                    "message": issue,
                    "expected": "RightAngle(L, C, P) or an equivalent perpendicular relation at C",
                }
            )
        elif "solution should" in issue or "hidden [[marks:n]]" in issue or "visible mark" in issue:
            validation_issues.append(
                {
                    "path": "arguments.solutionText",
                    "message": issue,
                    "expected": "official-key solution with pi/10, tan, sec^2(theta), 78.54, and hidden [[marks:n]] ticks totalling 5",
                }
            )
    if not validation_issues:
        validation_issues = [
            {
                "path": "arguments.diagram.graphConfig.options.substanceSource",
                "message": issue,
                "expected": "source-faithful renderable geometricConstruction/Penrose lighthouse diagram",
            }
            for issue in first_issues[:8]
        ]
    return validation_failure_output(
        tool_name=call.get("mauthToolName"),
        validation_issues=validation_issues,
        message="Mauth geometricConstruction source-fidelity validation failed.",
    )


def real_source_stats_chart_repair_failure_output(call: dict[str, Any], first_issues: list[str]) -> dict[str, Any]:
    validation_issues: list[dict[str, Any]] = []
    for issue in first_issues:
        if "contains control character" in issue or "contains malformed escaped dollar" in issue:
            validation_issues.append(
                {
                    "path": "arguments.parts[].text/solutionText",
                    "message": issue,
                    "expected": (
                        "valid LaTeX text only; for currency, write \\$400 as text, $400$ as a plain numeric "
                        "amount, or words such as 'negative 9.4 cents'; never put \\$ inside $...$ maths"
                    ),
                }
            )
        elif "should use statsChart" in issue or "should not be converted as a generic graph2d" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.type",
                    "message": issue,
                    "expected": "statsChart",
                }
            )
        elif "chartType" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.data.chartType",
                    "message": issue,
                    "expected": "source-appropriate statsChart chartType",
                }
            )
        elif "histogram/count chart" in issue or "bar heights" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.data.xValues/frequencies",
                    "message": issue,
                    "expected": "source exact bin centres/categories and visible counts",
                }
            )
        elif "statsChart should preserve range" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.data.range",
                    "message": issue,
                    "expected": "source chart range, or for centred histogram bins first centre - binSize/2 to last centre + binSize/2",
                }
            )
        elif "chart DSL fields must be under graphConfig.data" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.data",
                    "message": issue,
                    "expected": "move statsChart chart fields from graphConfig into graphConfig.data",
                }
            )
        elif "statsChart" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram.graphConfig.data",
                    "message": issue,
                    "expected": "source-faithful statsChart fields and data",
                }
            )
    if not validation_issues:
        validation_issues = [
            {
                "path": "arguments.diagram.graphConfig.data",
                "message": issue,
                "expected": "source-faithful statsChart fields and data",
            }
            for issue in first_issues[:8]
        ]
    return validation_failure_output(
        tool_name=call.get("mauthToolName"),
        validation_issues=validation_issues,
        message="Mauth statsChart source-fidelity validation failed.",
    )


def real_confidence_intervals_repair_failure_output(call: dict[str, Any], first_issues: list[str]) -> dict[str, Any]:
    validation_issues: list[dict[str, Any]] = []
    for issue in first_issues:
        if "empty table placeholder" in issue or "empty table list" in issue:
            validation_issues.append(
                {
                    "path": "arguments.table/tables/solutionTable/solutionTables",
                    "message": issue,
                    "expected": (
                        "omit empty table, tables, solutionTable, and solutionTables fields. Include only the real "
                        "confidence-interval source table with rows A-D."
                    ),
                }
            )
        elif "table should preserve" in issue:
            validation_issues.append(
                {
                    "path": "arguments.tables",
                    "message": issue,
                    "expected": "one real table with headers confidence interval, sample size, sample standard deviation, confidence level and rows A-D",
                }
            )
        elif "solution should preserve" in issue:
            validation_issues.append(
                {
                    "path": "arguments.parts[].solutionText",
                    "message": issue,
                    "expected": "official-key solution terms including 300-500, 51.02, 16n, 0.166, cannot determine, A smaller than B, and C smaller than D",
                }
            )
        elif "contains malformed escaped dollar" in issue:
            validation_issues.append(
                {
                    "path": "arguments.questionText/parts[].text",
                    "message": issue,
                    "expected": "currency outside maths such as \\$400, or plain numeric maths such as $400$; never put \\$ inside $...$",
                }
            )
    if not validation_issues:
        validation_issues = [
            {
                "path": "arguments",
                "message": issue,
                "expected": "source-faithful structured confidence-interval question with exactly the real source table",
            }
            for issue in first_issues[:8]
        ]
    return validation_failure_output(
        tool_name=call.get("mauthToolName"),
        validation_issues=validation_issues,
        message="Mauth confidence-interval source-fidelity validation failed.",
    )


def real_prism_repair_failure_output(call: dict[str, Any], first_issues: list[str]) -> dict[str, Any]:
    validation_issues = graph3d_validation_issues_from_call(call)
    for issue in first_issues:
        if "contains control character" in issue or "contains malformed escaped dollar" in issue:
            validation_issues.append(
                {
                    "path": "arguments.parts[].text/solutionText",
                    "message": issue,
                    "expected": (
                        "valid LaTeX text only; write line notation as \\overleftrightarrow{BT} or plain BT, "
                        "and Greek parameters as \\lambda and \\mu"
                    ),
                }
            )
    if not validation_issues:
        validation_issues = [
            {
                "path": "arguments.diagram.graphConfig",
                "message": issue,
                "expected": (
                    "source-faithful native graph3d payload using data.points/data.segments/data.faces and "
                    "metadata.view3d only"
                ),
            }
            for issue in first_issues[:8]
        ]
    return validation_failure_output(
        tool_name=call.get("mauthToolName"),
        validation_issues=validation_issues,
        message="Mauth graph3d validation failed.",
    )


def real_square_pyramid_repair_failure_output(call: dict[str, Any], first_issues: list[str]) -> dict[str, Any]:
    validation_issues = graph3d_validation_issues_from_call(call) + graph2d_validation_issues_from_call(call)
    for issue in first_issues:
        if "either diagram or diagrams" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagram/arguments.diagrams",
                    "message": issue,
                    "expected": "use diagrams only for the source's side-by-side 3D and top-view diagrams; omit diagram",
                }
            )
        elif "graph3d data should include segment EF" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagrams[0].graphConfig.data.segments",
                    "message": issue,
                    "expected": "include the source edge E-F as a graph3d segment; M is the midpoint of EF, so EF and FM are both semantically meaningful",
                }
            )
        elif "graph3d data should include segment FM" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagrams[0].graphConfig.data.segments",
                    "message": issue,
                    "expected": "include segment M-F as the actual angle ray for angle DMF; E-F or construction segments A-F/F-B do not replace M-F",
                }
            )
        elif "vector a ray from O toward A" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagrams[1].graphConfig.features",
                    "message": issue,
                    "expected": "a line_segment feature starting at the projected O/E point and pointing toward A, with the vector-a label on that same feature, not as a separate free label",
                }
            )
        elif "vector b ray from O toward B" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagrams[1].graphConfig.features",
                    "message": issue,
                    "expected": "a line_segment feature starting at the projected O/E point and pointing toward B, with the vector-b label on that same feature, not as a separate free label",
                }
            )
        elif "pyramid faces" in issue or "faces should include" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagrams[0].graphConfig.data.faces",
                    "message": issue,
                    "expected": "include the base face ABCD and every triangular side face ABE, BCE, CDE, and ADE",
                }
            )
        elif "top-view graph2d" in issue:
            validation_issues.append(
                {
                    "path": "arguments.diagrams[1].graphConfig.features",
                    "message": issue,
                    "expected": "source-faithful graph2d top view with labelled points, diagonals, midpoint points, and labelled vector rays",
                }
            )
    if not validation_issues:
        validation_issues = [
            {
                "path": "arguments.diagrams",
                "message": issue,
                "expected": "source-faithful side-by-side graph3d pyramid and graph2d top-view payloads",
            }
            for issue in first_issues[:8]
        ]
    return validation_failure_output(
        tool_name=call.get("mauthToolName"),
        validation_issues=validation_issues,
        message="Mauth square-pyramid source-fidelity validation failed.",
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
        "repairOnFailure": real_lighthouse_repair_failure_output,
    },
    "real-specialist-stats": {
        "prompt": (
            "Create Question 1 from the attached Specialist exam screenshots and official marking-key excerpt. "
            "Preserve the statistics graphs/table, structured parts, marks, and include the worked solutions."
        ),
        "summary": sample_document_summary,
        "attachments": sample_specialist_stats_screenshot_with_key,
        "assert": assert_real_specialist_stats_call,
        "repairOnFailure": real_source_stats_chart_repair_failure_output,
    },
    "real-specialist-confidence-intervals": {
        "prompt": (
            "Create Question 1 from the attached Specialist exam screenshots and official marking-key excerpt. "
            "Preserve the confidence-interval table, structured parts and subparts, marks, and include the worked solutions."
        ),
        "summary": sample_document_summary,
        "attachments": sample_specialist_confidence_intervals_screenshot_with_key,
        "assert": assert_real_specialist_confidence_intervals_call,
        "repairOnFailure": real_confidence_intervals_repair_failure_output,
    },
    "real-methods-earthquake": {
        "prompt": (
            "Create Question 1 from the attached Methods exam screenshots and official marking-key excerpt. "
            "Preserve the coordinate graph, structured parts, marks, and include the worked solutions."
        ),
        "summary": sample_document_summary,
        "attachments": sample_methods_earthquake_screenshot_with_key,
        "assert": assert_real_methods_earthquake_call,
        "repairOnFailure": real_source_graph2d_repair_failure_output,
    },
    "real-methods-ev-histogram": {
        "prompt": (
            "Create Question 1 from the attached Methods exam screenshots and official marking-key excerpt. "
            "Preserve the normal-distribution wording, histogram, structured parts, marks, and include the worked solutions."
        ),
        "summary": sample_document_summary,
        "attachments": sample_methods_ev_histogram_screenshot_with_key,
        "assert": assert_real_methods_ev_histogram_call,
        "repairOnFailure": real_source_stats_chart_repair_failure_output,
    },
    "real-methods-dice-game": {
        "prompt": (
            "Create Question 1 from the attached Methods exam screenshots and official marking-key excerpt. "
            "Preserve the frequency chart, probability table, structured parts, marks, and include the worked solutions."
        ),
        "summary": sample_document_summary,
        "attachments": sample_methods_dice_game_screenshot_with_key,
        "assert": assert_real_methods_dice_game_call,
        "repairOnFailure": real_source_stats_chart_repair_failure_output,
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
        "repairOnFailure": real_prism_repair_failure_output,
    },
    "real-specialist-square-pyramid": {
        "prompt": (
            "Create Question 1 from the attached Specialist exam screenshots and official marking-key excerpt. "
            "Preserve the square-pyramid 3D diagram and top-view diagram, structured parts and subparts, marks, "
            "and include the worked solutions."
        ),
        "summary": sample_document_summary,
        "attachments": sample_specialist_square_pyramid_screenshot_with_key,
        "assert": assert_real_specialist_square_pyramid_call,
        "repairOnFailure": real_square_pyramid_repair_failure_output,
    },
    "real-specialist-implicit": {
        "prompt": (
            "Create Question 1 from the attached Specialist exam screenshots and official marking-key excerpt. "
            "Preserve the implicit curve diagram, structured parts, marks, and include the worked solutions."
        ),
        "summary": sample_document_summary,
        "attachments": sample_specialist_implicit_screenshot_with_key,
        "assert": assert_real_specialist_implicit_call,
        "repairOnFailure": real_implicit_repair_failure_output,
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
    "real-exams-tables": ["real-specialist-confidence-intervals"],
    "real-exams-methods-stats": ["real-methods-ev-histogram", "real-methods-dice-game"],
    "real-exams-extended": [
        "real-specialist-slope-field",
        "real-specialist-argand",
        "real-specialist-spherical-cap",
        "real-specialist-prism",
        "real-specialist-implicit",
    ],
    "real-exams-graph3d": ["real-specialist-spherical-cap", "real-specialist-prism", "real-specialist-square-pyramid"],
    "real-exams": [
        "real-methods-earthquake",
        "real-methods-ev-histogram",
        "real-methods-dice-game",
        "real-specialist-lighthouse",
        "real-specialist-stats",
        "real-specialist-confidence-intervals",
        "real-specialist-slope-field",
        "real-specialist-argand",
        "real-specialist-spherical-cap",
        "real-specialist-prism",
        "real-specialist-square-pyramid",
        "real-specialist-implicit",
    ],
}

TOOL_CLASSIFICATION: list[dict[str, str]] = [
    {
        "class": "source-conversion",
        "primaryTool": "mauth.question.upsert / mauth_convert_source_question",
        "ownerBrains": "question, diagram, solutions, formatting",
        "zeroCostGate": "pnpm eval:assistant:local plus pnpm smoke:assistant:preview for renderer-heavy sources",
    },
    {
        "class": "diagram-follow-up",
        "primaryTool": "mauth.author.addDiagram / mauth_make_diagram_for_question",
        "ownerBrains": "diagram",
        "zeroCostGate": "pnpm smoke:assistant:self and renderer-specific local/preview cases",
    },
    {
        "class": "solution-or-marking",
        "primaryTool": "mauth.author.ensureSolutions / mauth_write_solutions_for_questions",
        "ownerBrains": "solutions, formatting",
        "zeroCostGate": "pnpm smoke:assistant:self and pnpm test:web-actions",
    },
    {
        "class": "whole-test-solutions",
        "primaryTool": "mauth.solutions.writeAll / mauth_write_all_solutions",
        "ownerBrains": "solutions, formatting",
        "zeroCostGate": "pnpm smoke:assistant:self before paid confidence eval",
    },
    {
        "class": "layout-or-formatting",
        "primaryTool": "mauth.layout.check, mauth.author.adjustResponseSpaces, mauth.format.apply",
        "ownerBrains": "formatting",
        "zeroCostGate": "pnpm smoke:assistant:self and pnpm test:web-actions",
    },
    {
        "class": "file-operations",
        "primaryTool": "mauth.files.*",
        "ownerBrains": "none unless content is edited",
        "zeroCostGate": "pnpm smoke:file-manager and pnpm test:web-actions",
    },
]

EVAL_GATE_CLASSIFICATION: list[dict[str, str]] = [
    {
        "gate": "self-smoke",
        "command": "pnpm smoke:assistant:self",
        "purpose": "Free assistant-routing rehearsal with real Mauth tools and no provider call.",
    },
    {
        "gate": "local-semantic",
        "command": "pnpm eval:assistant:local",
        "purpose": "Free semantic assertions for representative source payloads and known-bad tool shapes.",
    },
    {
        "gate": "preview-replay",
        "command": "pnpm smoke:assistant:preview",
        "purpose": "Free browser replay through high-level tools and real JSXGraph/Plotly/Penrose preview surfaces.",
    },
    {
        "gate": "cost-ledger-triage",
        "command": "pnpm eval:assistant:costs",
        "purpose": "Free paid-ledger report that ranks repair-heavy, token-heavy, or missing-regression cases before spending.",
    },
    {
        "gate": "paid-live",
        "command": "pnpm eval:assistant:live:*",
        "purpose": "Bounded real-provider checks only after the free gates pass or when testing a new high-risk prompt class.",
    },
    {
        "gate": "project-check",
        "command": "pnpm check",
        "purpose": "Full format, lint, unit, and build gate before committing source changes.",
    },
]

LIVE_EVAL_CASE_CLASSES: dict[str, str] = {
    "circle-question": "question-authoring",
    "circle-diagram": "diagram-follow-up",
    "circle-parallel-diagram": "diagram-follow-up",
    "multipart-probability": "question-authoring",
    "ensure-solution": "solution-or-marking",
    "mark-edit-preserve-diagram": "solution-or-marking",
    "rewrite-preserve-diagram": "preservation-edit",
    "linear-intersection-question": "question-authoring",
    "graph2d-function-diagram": "diagram-follow-up",
    "set-diagram-routing": "diagram-follow-up",
    "stats-chart-routing": "diagram-follow-up",
    "vector2d-routing": "diagram-follow-up",
    "pdf-attachment-question": "source-conversion",
    "docx-attachment-question": "source-conversion",
    "screenshot-scalar-products": "source-conversion",
    "repair-circle-diagram": "repair-loop",
    "repair-scalar-product-diagram": "repair-loop",
    "write-all-solutions-confidence": "whole-test-solutions",
    "layout-check-confidence": "layout-or-formatting",
    "layout-repair-confidence": "repair-loop",
}


def live_eval_case_class(case_name: str) -> str:
    if case_name in LIVE_EVAL_CASE_CLASSES:
        return LIVE_EVAL_CASE_CLASSES[case_name]
    if case_name.startswith("real-"):
        return "source-conversion"
    return "uncategorised"


def local_eval_case_class(case_name: str) -> str:
    if "bad" in case_name or "placeholder" in case_name or "missing" in case_name or "duplicate" in case_name:
        return "negative-fixture"
    if case_name.startswith("graph3d-"):
        return "renderer-semantic"
    if case_name.startswith("real-"):
        return "source-conversion"
    return "uncategorised"


def group_memberships(case_name: str, groups: dict[str, list[str]]) -> list[str]:
    return [name for name, cases in groups.items() if case_name in cases]


def list_eval_taxonomy() -> int:
    payload = {
        "toolClasses": TOOL_CLASSIFICATION,
        "evalGates": EVAL_GATE_CLASSIFICATION,
        "liveGroups": EVAL_GROUPS,
        "localGroups": LOCAL_EVAL_GROUPS,
        "liveCases": [
            {
                "name": name,
                "class": live_eval_case_class(name),
                "groups": group_memberships(name, EVAL_GROUPS),
                "paid": True,
            }
            for name in sorted(EVAL_CASES)
        ],
        "localCases": [
            {
                "name": name,
                "class": "negative-fixture" if case.get("expectedIssues") else local_eval_case_class(name),
                "groups": group_memberships(name, LOCAL_EVAL_GROUPS),
                "expectedFailureFixture": bool(case.get("expectedIssues")),
                "paid": False,
            }
            for name, case in sorted(LOCAL_EVAL_CASES.items())
        ],
    }
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


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


def local_screenshot_scalar_products_call() -> dict[str, Any]:
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 0,
            "questionText": "Evaluate the following scalar products exactly.",
            "diagram": {
                "diagramAlign": "center",
                "vectorRayDiagram": {
                    "widthPx": 560,
                    "heightPx": 380,
                    "vectors": [
                        {"id": "a", "length": 2, "angleDeg": 215, "lengthLabel": "2\\ \\text{units}"},
                        {"id": "b", "length": 2, "angleDeg": 125, "lengthLabel": "2\\ \\text{units}"},
                        {"id": "c", "length": 3, "angleDeg": 80, "lengthLabel": "3\\ \\text{units}"},
                        {"id": "d", "length": 2, "angleDeg": 35, "lengthLabel": "$2\\ \\text{units}$"},
                    ],
                    "angleMarkers": [
                        {"from": "b", "to": "d", "rightAngle": True, "radius": 0.42},
                        {"from": "c", "to": "d", "label": "45^\\circ", "radius": 0.72},
                    ],
                },
            },
            "parts": [
                {"label": "a", "text": "$\\mathbf{a}\\cdot\\mathbf{b}$", "marks": 1, "studentSpaceLines": 3},
                {"label": "b", "text": "$\\mathbf{a}\\cdot\\mathbf{d}$", "marks": 2, "studentSpaceLines": 3},
                {"label": "c", "text": "$\\mathbf{c}\\cdot\\mathbf{d}$", "marks": 2, "studentSpaceLines": 3},
            ],
        }
    )


def local_screenshot_scalar_products_bad_compact_labels_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_screenshot_scalar_products_call()))
    vector_ray = call["mauthArguments"]["diagram"]["vectorRayDiagram"]
    vector_ray["vectors"][0]["lengthLabel"] = "2units"
    vector_ray["vectors"][1]["lengthLabel"] = "2\\text{units}"
    vector_ray["vectors"][2]["lengthLabel"] = "3 units"
    vector_ray["angleMarkers"][1]["label"] = "45 degrees"
    call["arguments"] = call["mauthArguments"]
    return call


def local_screenshot_scalar_products_bad_marker_pairs_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_screenshot_scalar_products_call()))
    vector_ray = call["mauthArguments"]["diagram"]["vectorRayDiagram"]
    vector_ray["angleMarkers"] = [
        {"from": "a", "to": "b", "rightAngle": True, "radius": 0.42},
        {"from": "a", "to": "d", "label": "45^\\circ", "radius": 0.72},
    ]
    call["arguments"] = call["mauthArguments"]
    return call


def local_screenshot_scalar_products_live_right_angle_bc_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_screenshot_scalar_products_call()))
    vector_ray = call["mauthArguments"]["diagram"]["vectorRayDiagram"]
    for vector in vector_ray["vectors"]:
        if vector.get("id") == "b":
            vector["angleDeg"] = 170
    vector_ray["angleMarkers"] = [
        {"from": "c", "to": "d", "label": "45^\\circ", "radius": 0.72},
        {"from": "b", "to": "c", "rightAngle": True, "radius": 0.42},
    ]
    call["arguments"] = call["mauthArguments"]
    return call


def local_screenshot_scalar_products_bad_raw_labels_call() -> dict[str, Any]:
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 0,
            "questionText": "Evaluate the following scalar products exactly.",
            "diagram": {
                "diagramAlign": "center",
                "graphConfig": {
                    "type": "vector2d",
                    "widthPx": 560,
                    "heightPx": 380,
                    "xMin": -2.6,
                    "xMax": 2.6,
                    "yMin": -2.1,
                    "yMax": 3.4,
                    "showAxes": False,
                    "showGrid": False,
                    "showAxisLabels": False,
                    "showAxisNumbers": False,
                    "metadata": {
                        "vector2d": {
                            "labelStyle": "custom",
                            "vectors": [
                                {
                                    "id": "a",
                                    "name": "a",
                                    "label": "\\mathbf{a}",
                                    "start": [0, 0],
                                    "components": [-1.638, -1.147],
                                },
                                {
                                    "id": "b",
                                    "name": "b",
                                    "label": "\\mathbf{b}",
                                    "start": [0, 0],
                                    "components": [-1.147, 1.638],
                                },
                                {
                                    "id": "c",
                                    "name": "c",
                                    "label": "\\mathbf{c}",
                                    "start": [0, 0],
                                    "components": [0.521, 2.954],
                                },
                                {
                                    "id": "d",
                                    "name": "d",
                                    "label": "\\mathbf{d}",
                                    "start": [0, 0],
                                    "components": [1.638, 1.147],
                                },
                            ],
                            "segmentLabels": [
                                {"vectorId": "a", "label": "2 units"},
                                {"vectorId": "b", "label": "2 units"},
                                {"vectorId": "c", "label": "3 units"},
                                {"vectorId": "d", "label": "2 units"},
                            ],
                            "angleMarkers": [
                                {"from": "b", "to": "d", "rightAngle": True, "radius": 0.42},
                                {"from": "c", "to": "d", "label": "45°", "radius": 0.72},
                            ],
                        },
                    },
                },
            },
            "parts": [
                {"label": "a", "text": "$\\mathbf{a}\\cdot\\mathbf{b}$", "marks": 1, "studentSpaceLines": 3},
                {"label": "b", "text": "$\\mathbf{a}\\cdot\\mathbf{d}$", "marks": 2, "studentSpaceLines": 3},
                {"label": "c", "text": "$\\mathbf{c}\\cdot\\mathbf{d}$", "marks": 2, "studentSpaceLines": 3},
            ],
        }
    )


def local_screenshot_scalar_products_native_vector2d_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_screenshot_scalar_products_bad_raw_labels_call()))
    vector2d = call["mauthArguments"]["diagram"]["graphConfig"]["metadata"]["vector2d"]
    label_positions = {
        "a": (-2.05, -1.42),
        "b": (-1.22, 1.9),
        "c": (0.68, 3.22),
        "d": (1.96, 1.42),
    }
    for vector in vector2d["vectors"]:
        vector_id = str(vector.get("id") or "")
        if vector_id in label_positions:
            vector["labelX"], vector["labelY"] = label_positions[vector_id]
    for label, offset in zip(vector2d["segmentLabels"], (24, 24, 24, -24), strict=False):
        label["label"] = label["label"].replace(" units", "\\ \\text{units}")
        label["offsetPx"] = offset
    vector2d["angleMarkers"][1]["label"] = "45^\\circ"
    vector2d["angleMarkers"][1]["labelX"] = 0.72
    vector2d["angleMarkers"][1]["labelY"] = 1.08
    call["arguments"] = call["mauthArguments"]
    return call


def local_screenshot_scalar_products_bad_native_label_placement_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_screenshot_scalar_products_native_vector2d_call()))
    vector2d = call["mauthArguments"]["diagram"]["graphConfig"]["metadata"]["vector2d"]
    for vector in vector2d["vectors"]:
        vector.pop("labelX", None)
        vector.pop("labelY", None)
    for label in vector2d["segmentLabels"]:
        label.pop("labelX", None)
        label.pop("labelY", None)
        label.pop("offsetPx", None)
        label.pop("offset", None)
    for marker in vector2d["angleMarkers"]:
        marker.pop("labelX", None)
        marker.pop("labelY", None)
    call["arguments"] = call["mauthArguments"]
    return call


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


def local_real_methods_earthquake_bad_axes_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_methods_earthquake_call()))
    graph_config = call["mauthArguments"]["diagram"]["graphConfig"]
    graph_config["xAxisLabel"] = "$x$"
    graph_config["yAxisLabel"] = "$y$"
    graph_config["xMin"] = 0
    graph_config["xMax"] = 20
    graph_config["yMax"] = 10
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


def local_real_methods_ev_histogram_counts_in_values_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_methods_ev_histogram_call()))
    data = call["mauthArguments"]["diagram"]["graphConfig"]["data"]
    data["values"] = data.pop("frequencies")
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_methods_ev_histogram_top_level_stats_fields_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_methods_ev_histogram_call()))
    graph_config = call["mauthArguments"]["diagram"]["graphConfig"]
    data = graph_config.pop("data")
    graph_config.update(data)
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_methods_ev_histogram_padded_range_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_methods_ev_histogram_call()))
    data = call["mauthArguments"]["diagram"]["graphConfig"]["data"]
    data["range"] = [240, 460]
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_methods_ev_histogram_bad_source_fields_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_methods_ev_histogram_call()))
    data = call["mauthArguments"]["diagram"]["graphConfig"]["data"]
    data["dataMode"] = "rawValues"
    data["barType"] = "discrete"
    data["yAxisMode"] = "relativeFrequency"
    data["binSize"] = 10
    data["range"] = [0, 1]
    data["xLabel"] = "$X$"
    data["yLabel"] = "Density"
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


def local_real_methods_dice_game_bad_chart_fields_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_methods_dice_game_call()))
    data = call["mauthArguments"]["diagram"]["graphConfig"]["data"]
    data["dataMode"] = "raw"
    data["barType"] = "continuous"
    data["yAxisMode"] = "relativeFrequency"
    data["xLabel"] = "$t$"
    data["yLabel"] = "Probability"
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_methods_dice_game_counts_in_values_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_methods_dice_game_call()))
    data = call["mauthArguments"]["diagram"]["graphConfig"]["data"]
    data["values"] = data.pop("frequencies")
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_methods_dice_game_thin_space_simulation_count_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_methods_dice_game_call()))
    call["mauthArguments"]["questionText"] = call["mauthArguments"]["questionText"].replace("10 000", "$10\\,000$")
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_methods_dice_game_live_escaped_currency_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_methods_dice_game_call()))
    parts = call["mauthArguments"]["parts"]
    parts[3]["solutionText"] = (
        "$$E(Y)=1\\times0.349+0\\times0.208-1\\times0.443=-0.094.$$ [[marks:2]]\n"
        "$$\\operatorname{Var}(Y)=0.783.$$\n"
        "The expected value is $-\\$0.094$. [[marks:2]]"
    )
    parts[4]["solutionText"] = (
        "Yes. Since the expected profit for a player is $-\\$0.094$ per game, "
        "the expected profit for the charity is $\\$0.094$ per game, so the game is profitable for the charity. [[marks:2]]"
    )
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


def local_real_specialist_lighthouse_call() -> dict[str, Any]:
    lighthouse_diagram = {
        "type": "geometricConstruction",
        "widthPx": 520,
        "heightPx": 320,
        "data": {},
        "style": "geometry",
        "options": {
            "penrosePreset": "geometry",
            "scalePercent": 100,
            "substanceSource": (
                "Point L, C, P\n"
                "NamedSegment LC, CP, LP\n"
                "LengthLabel lcLabel, xLabel, angleTheta\n"
                "Label L $L$\n"
                "Label C $C$\n"
                "Label P $P$\n"
                "Label lcLabel $50\\ \\text{m}$\n"
                "Label xLabel $x$\n"
                "Label angleTheta $\\theta$\n"
                "Segment(LC, L, C)\n"
                "Segment(CP, C, P)\n"
                "VectorSegment(LP, L, P)\n"
                "RightAngle(L, C, P)\n"
                "LabelsSegment(lcLabel, L, C)\n"
                "LabelsSegment(xLabel, C, P)\n"
                "LabelsAngle(angleTheta, C, L, P)\n"
            ),
        },
    }
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 5,
            "questionText": (
                "A beam of light completes three revolutions each minute from a lighthouse $L$ that is "
                "50 metres from a coastline. Determine the speed of the beam of light moving along the coast "
                "when it is at point $P$, 100 metres up the coast, correct to the nearest 0.01 metres per second."
            ),
            "diagram": {"diagramAlign": "left", "graphConfig": lighthouse_diagram},
            "studentSpaceLines": 10,
            "includeSolution": True,
            "solutionText": (
                "$$\\frac{d\\theta}{dt}=\\frac{3\\times2\\pi}{60}=\\frac{\\pi}{10}\\text{ radians per second}.$$ [[marks:1]]\n"
                "In right $\\triangle LCP$, $\\tan\\theta=\\frac{x}{50}$, so $x=50\\tan\\theta$. [[marks:1]]\n"
                "When $x=100$, $\\tan\\theta=2$, hence $\\sec^2\\theta=5$. [[marks:1]]\n"
                "$$\\frac{dx}{dt}=50\\sec^2\\theta\\frac{d\\theta}{dt}.$$ [[marks:1]]\n"
                "$$\\frac{dx}{dt}=50(5)\\left(\\frac{\\pi}{10}\\right)=25\\pi=78.54\\text{ m/sec}.$$ [[marks:1]]"
            ),
        }
    )


def local_real_specialist_lighthouse_bad_renderer_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_lighthouse_call()))
    call["mauthArguments"]["diagram"]["graphConfig"] = {
        "type": "graph2d",
        "xMin": -1,
        "xMax": 110,
        "yMin": -5,
        "yMax": 60,
        "functions": [{"kind": "expression", "expression": "-0.5*x + 50"}],
        "features": [
            {"kind": "point", "x": 0, "y": 50, "label": "$L$"},
            {"kind": "point", "x": 0, "y": 0, "label": "$C$"},
            {"kind": "point", "x": 100, "y": 0, "label": "$P$"},
        ],
    }
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_lighthouse_bad_solution_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_lighthouse_call()))
    call["mauthArguments"]["solutionText"] = (
        "$$\\frac{d\\theta}{dt}=3\\times2\\pi.$$ [[marks:1]]\n"
        "$$x=50\\tan\\theta.$$ [[marks:1]]\n"
        "$$\\frac{dx}{dt}=50\\cos^2\\theta\\frac{d\\theta}{dt}=12.57\\text{ m/sec}.$$ [[marks:3]]"
    )
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_lighthouse_live_undeclared_label_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_lighthouse_call()))
    graph_config = call["mauthArguments"]["diagram"]["graphConfig"]
    graph_config["options"]["substanceSource"] = (
        "Point L, C, P\n"
        "NamedSegment LC, CP, LP\n"
        "Label LLabel $L$\n"
        "Label CLabel $C$\n"
        "Label PLabel $P$\n"
        "Label lenLC $50\\ \\text{m}$\n"
        "Label lenCP $x$\n"
        "Label thetaLabel $\\theta$\n"
        "Segment(LC, L, C)\n"
        "Segment(CP, C, P)\n"
        "VectorSegment(LP, L, P)\n"
        "LabelsSegment(lenLC, L, C)\n"
        "LabelsSegment(lenCP, C, P)\n"
        "LabelsAngle(thetaLabel, C, L, P)\n"
        "Perpendicular(LC, CP)\n"
        "Label L $L$\n"
        "Label C $C$\n"
        "Label P $P$\n"
    )
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_lighthouse_live_segment_perpendicular_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_lighthouse_call()))
    graph_config = call["mauthArguments"]["diagram"]["graphConfig"]
    graph_config["options"]["substanceSource"] = (
        "Point L, C, P\n"
        "NamedSegment LC, CP, LP\n"
        "Line coast\n"
        "Label L $L$\n"
        "Label C $C$\n"
        "Label P $P$\n"
        "Label lab50 $50\\ \\text{m}$\n"
        "Label labx $x$\n"
        "Label labTheta $\\theta$\n"
        "LineThrough(coast, C, P)\n"
        "Segment(LC, L, C)\n"
        "Segment(CP, C, P)\n"
        "VectorSegment(LP, L, P)\n"
        "PerpendicularToSegment(LC, C, P)\n"
        "LabelsSegment(lab50, L, C)\n"
        "LabelsSegment(labx, C, P)\n"
        "LabelsAngle(labTheta, C, L, P)\n"
    )
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_lighthouse_live_custom_style_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_lighthouse_call()))
    graph_config = call["mauthArguments"]["diagram"]["graphConfig"]
    graph_config["options"]["substanceSource"] = (
        "Point L, C, P\n"
        "NamedSegment LC, CP, LP\n"
        "Label L $L$\n"
        "Label C $C$\n"
        "Label P $P$\n"
        "Label lengthLC $50\\ \\text{m}$\n"
        "Label lengthCP $x$\n"
        "Label thetaLabel $\\theta$\n"
        "Segment(LC, L, C)\n"
        "Segment(CP, C, P)\n"
        "Segment(LP, L, P)\n"
        "RightAngle(L, C, P)\n"
        "LabelsSegment(lengthLC, LC)\n"
        "LabelsSegment(lengthCP, CP)\n"
        "LabelsAngle(thetaLabel, C, L, P)\n"
    )
    graph_config["options"]["styleSource"] = (
        "canvas {\n"
        "  width = 430\n"
        "  height = 210\n"
        "}\n"
        "forall Point p {\n"
        "  p.textLayering = 2\n"
        "}\n"
        "ensure L above C\n"
    )
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


def local_real_specialist_stats_bad_density_points_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_stats_call()))
    data = call["mauthArguments"]["diagram"]["graphConfig"]["data"]
    data["xLabel"] = "$x$"
    data["points"] = [
        {"x": 1.0, "y": 0.03},
        {"x": 2.1, "y": 0.02},
        {"x": 5.0, "y": 0.02},
    ]
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_stats_live_smoothed_density_points_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_stats_call()))
    data = call["mauthArguments"]["diagram"]["graphConfig"]["data"]
    data["xLabel"] = "$t$"
    data["points"] = [
        {"x": 0, "y": 0.195},
        {"x": 0.5, "y": 0.202},
        {"x": 1, "y": 0.205},
        {"x": 1.5, "y": 0.202},
        {"x": 2, "y": 0.19},
        {"x": 2.5, "y": 0.173},
        {"x": 3, "y": 0.15},
        {"x": 3.5, "y": 0.125},
        {"x": 4, "y": 0.102},
        {"x": 4.5, "y": 0.081},
        {"x": 5, "y": 0.062},
        {"x": 5.5, "y": 0.047},
        {"x": 6, "y": 0.035},
        {"x": 6.5, "y": 0.026},
        {"x": 7, "y": 0.019},
        {"x": 7.5, "y": 0.014},
        {"x": 8, "y": 0.01},
    ]
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_stats_paired_density_values_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_stats_call()))
    data = call["mauthArguments"]["diagram"]["graphConfig"]["data"]
    points = data.pop("points")
    data["xValues"] = [point["x"] for point in points]
    data["yValues"] = [point["y"] for point in points]
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_confidence_intervals_call() -> dict[str, Any]:
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 0,
            "questionMarks": 0,
            "questionText": (
                "A researcher is interested in estimating the population mean $\\mu$ (dollars) that Perth "
                "residents had spent via online shopping in December 2020. A random sample of size $n$ "
                "gave a sample mean of $400$, a sample standard deviation $s$ and a 95% confidence "
                "interval of width $200$."
            ),
            "tables": [
                {
                    "headers": [
                        "Confidence interval",
                        "Sample size",
                        "Sample standard deviation",
                        "Confidence level",
                    ],
                    "rows": [
                        ["A", "$n$", "$s$", "95%"],
                        ["B", "$n$", "$s$", "99%"],
                        ["C", "$2n$", "$s$", "95%"],
                        ["D", "$n$", "$0.8s$", "95%"],
                    ],
                    "tableAlign": "left",
                    "cellAlignment": "center",
                }
            ],
            "parts": [
                {
                    "label": "a",
                    "text": "State the 95% confidence interval obtained.",
                    "marks": 1,
                    "studentSpaceLines": 3,
                    "includeSolution": True,
                    "solutionText": "$$300\\le \\mu\\le 500.$$ [[marks:1]]",
                },
                {
                    "label": "b",
                    "text": "Calculate the standard deviation of the sample mean, correct to $0.01.",
                    "marks": 2,
                    "studentSpaceLines": 4,
                    "includeSolution": True,
                    "solutionText": (
                        "The margin of error is $100$. [[marks:1]]\n"
                        "$$100=1.96\\sigma_{\\bar X},\\quad \\sigma_{\\bar X}=51.02.$$ [[marks:1]]"
                    ),
                },
                {
                    "label": "c",
                    "text": (
                        "In terms of $n$, what sample size would yield a 95% confidence interval of width $50$? "
                        "Show your reasoning."
                    ),
                    "marks": 2,
                    "studentSpaceLines": 5,
                    "includeSolution": True,
                    "solutionText": (
                        "The interval width is one quarter of the original width. [[marks:1]]\n"
                        "Standard error is inversely proportional to $\\sqrt n$, so the sample size must increase "
                        "by $4^2=16$. The new sample size is $16n$. [[marks:1]]"
                    ),
                },
                {
                    "label": "d",
                    "text": (
                        "What is the probability that another sample of size $2n$ would produce a sample mean "
                        "that differs from $\\mu$ by more than $50$?"
                    ),
                    "marks": 3,
                    "studentSpaceLines": 6,
                    "includeSolution": True,
                    "solutionText": (
                        "For sample size $2n$, $\\sigma_{\\bar X}=51.02/\\sqrt2=36.0768\\ldots$. [[marks:1]]\n"
                        "$$P(|\\bar X-\\mu|>50)=2P\\left(Z>\\frac{50}{36.0768\\ldots}\\right)=2P(Z>1.3859\\ldots).$$ [[marks:1]]\n"
                        "Thus the probability is $0.166$. [[marks:1]]"
                    ),
                },
                {
                    "label": "e",
                    "text": (
                        "Which of the confidence intervals (A, B, C or D) contains $\\mu$, the population mean "
                        "expenditure for online shopping in December 2020? Justify your answer."
                    ),
                    "marks": 2,
                    "studentSpaceLines": 4,
                    "includeSolution": True,
                    "solutionText": (
                        "We cannot determine which interval contains the true population mean $\\mu$. [[marks:1]]\n"
                        "The value of $\\mu$ is unknown and intervals vary because of random sampling. [[marks:1]]"
                    ),
                },
                {
                    "label": "f",
                    "text": "For each of the following, state the confidence interval that has the smaller width. Justify your answers.",
                    "marks": 0,
                    "answerSurface": "none",
                    "subparts": [
                        {
                            "label": "i",
                            "text": "A and B.",
                            "marks": 1,
                            "studentSpaceLines": 3,
                            "includeSolution": True,
                            "solutionText": (
                                "Confidence interval A has the smaller width because 95% is less than 99%. [[marks:1]]"
                            ),
                        },
                        {
                            "label": "ii",
                            "text": "C and D.",
                            "marks": 1,
                            "studentSpaceLines": 3,
                            "includeSolution": True,
                            "solutionText": (
                                "For C, $\\sigma_{\\bar X}=s/\\sqrt{2n}=0.707(s/\\sqrt n)$. "
                                "For D, $\\sigma_{\\bar X}=0.8s/\\sqrt n=0.8(s/\\sqrt n)$, "
                                "so C has the smaller width. [[marks:1]]"
                            ),
                        },
                    ],
                },
            ],
        }
    )


def local_real_specialist_confidence_intervals_bad_table_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_confidence_intervals_call()))
    rows = call["mauthArguments"]["tables"][0]["rows"]
    rows[2] = ["C", "$n$", "$s$", "95%"]
    rows[3] = ["D", "$n$", "$s$", "95%"]
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_confidence_intervals_bad_solution_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_confidence_intervals_call()))
    parts = call["mauthArguments"]["parts"]
    parts[0]["solutionText"] = "$$250\\le \\mu\\le 550.$$ [[marks:1]]"
    parts[1]["solutionText"] = "$$\\sigma_{\\bar X}=42.00.$$ [[marks:2]]"
    parts[2]["solutionText"] = "The new sample size is $4n$. [[marks:2]]"
    parts[3]["solutionText"] = "The probability is $0.083$. [[marks:3]]"
    parts[4]["solutionText"] = "Confidence interval B contains $\\mu$. [[marks:2]]"
    parts[5]["subparts"][0]["solutionText"] = "B has the smaller width. [[marks:1]]"
    parts[5]["subparts"][1]["solutionText"] = "D has the smaller width. [[marks:1]]"
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_confidence_intervals_live_escaped_currency_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_confidence_intervals_call()))
    args = call["mauthArguments"]
    args["questionText"] = args["questionText"].replace("$400$", "$\\$400$")
    table = args.pop("tables")[0]
    part_e = args["parts"][4]
    part_e["text"] = (
        "Four different confidence intervals (A, B, C and D) are obtained for the mean amount spent via "
        "online shopping by Perth residents in December 2020.\n\n"
        f"{part_e['text']}"
    )
    part_e["table"] = table
    args["parts"][1]["text"] = "Calculate the standard deviation of the sample mean, correct to $\\$0.01$."
    args["parts"][2]["text"] = (
        "In terms of $n$, what sample size would yield a 95% confidence interval of width $\\$50$? Show your reasoning."
    )
    args["parts"][3]["text"] = (
        "What is the probability that another sample of size $2n$ would produce a sample mean "
        "that differs from $\\mu$ by more than $\\$50$?"
    )
    args["parts"][5]["subparts"][0]["solutionText"] = (
        "A has the smaller width because a 95% confidence level uses a smaller critical value "
        "than a 99% confidence level, with the same $n$ and $s$. [[marks:1]]"
    )
    call["arguments"] = args
    return call


def local_real_specialist_confidence_intervals_live_relative_confidence_wording_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_confidence_intervals_call()))
    subpart_i = call["mauthArguments"]["parts"][5]["subparts"][0]
    subpart_i["solutionText"] = (
        "Confidence interval A will have the smaller width, since its confidence level, 95%, "
        "is less than that of B, 99%. [[marks:1]]"
    )
    call["arguments"] = call["mauthArguments"]
    return call


def add_empty_table_placeholders(value: Any) -> None:
    if isinstance(value, dict):
        value.setdefault(
            "table",
            {"id": "empty-table", "headers": [], "rows": [], "showHeader": False, "tableAlign": "center"},
        )
        value.setdefault("tables", [])
        value.setdefault(
            "solutionTable",
            {"id": "empty-solution-table", "headers": [], "rows": [], "showHeader": False, "tableAlign": "center"},
        )
        value.setdefault("solutionTables", [])
        for key, inner_value in list(value.items()):
            if key in {"table", "tables", "solutionTable", "solutionTables"}:
                continue
            add_empty_table_placeholders(inner_value)
    elif isinstance(value, list):
        for item in value:
            add_empty_table_placeholders(item)


def local_real_specialist_confidence_intervals_live_empty_table_placeholders_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_confidence_intervals_call()))
    add_empty_table_placeholders(call["mauthArguments"])
    # Preserve the one real source table after adding the empty placeholders.
    call["mauthArguments"]["tables"] = json.loads(json.dumps(local_real_specialist_confidence_intervals_call()["mauthArguments"]["tables"]))
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_slope_field_call() -> dict[str, Any]:
    slope_graph = {
        "type": "graph2d",
        "xMin": -1,
        "xMax": 3,
        "yMin": -2,
        "yMax": 2,
        "widthPx": 560,
        "heightPx": 360,
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


def local_real_specialist_slope_field_missing_highlighted_points_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_slope_field_call()))
    slope_field = call["mauthArguments"]["diagram"]["graphConfig"]["data"]["slopeField"]
    slope_field.pop("highlightedPoints", None)
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_slope_field_bad_artifact_marks_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_slope_field_call()))
    part_c = call["mauthArguments"]["parts"][2]
    part_c["solutionText"] = "Draw the completed solution curve on the slope field. [[marks:2]]"
    part_c["includeSolution"] = True
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_slope_field_live_sqrt_solution_branch_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_slope_field_call()))
    solution_graph = call["mauthArguments"]["parts"][2]["solutionDiagram"]["graphConfig"]
    call["mauthArguments"]["diagram"]["graphConfig"]["functions"] = []
    call["mauthArguments"]["parts"][2]["diagram"]["graphConfig"]["functions"] = []
    solution_graph["functions"] = [
        {
            "kind": "expression",
            "expression": "sqrt(x^2/2 - x + 1/4)",
            "domainMin": -2,
            "domainMax": 0.2928932188,
            "color": "#000000",
            "strokeWidth": 2.5,
        }
    ]
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
            {
                "kind": "line_segment",
                "x1": 0,
                "y1": 0,
                "x2": 2,
                "y2": 1.155,
                "color": "#0f172a",
                "strokeStyle": "dashed",
                "label": "$\\arg(z)=\\frac{\\pi}{6}$",
                "labelX": 2.15,
                "labelY": 1.25,
            },
            {
                "kind": "line_segment",
                "x1": 0,
                "y1": 0,
                "x2": -2,
                "y2": 1.155,
                "color": "#0f172a",
                "strokeStyle": "dashed",
                "label": "$\\arg(z)=\\frac{5\\pi}{6}$",
                "labelX": -2.55,
                "labelY": 1.25,
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


def local_real_specialist_argand_compact_polar_grid_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_argand_call()))
    graph_config = call["mauthArguments"]["diagram"]["graphConfig"]
    graph_config["data"] = {
        "polarGrid": {
            "radii": [1, 2, 3, 4],
            "angleLinesDeg": [15, 30, 45, 60, 75, 105, 120, 135, 150, 165],
            "radius": 4,
            "color": "#d9d9d9",
            "strokeWidth": 1,
        }
    }
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


def local_real_specialist_argand_missing_argument_rays_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_argand_call()))
    features = call["mauthArguments"]["diagram"]["graphConfig"]["features"]
    call["mauthArguments"]["diagram"]["graphConfig"]["features"] = [
        feature for feature in features if feature.get("kind") != "line_segment"
    ]
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_argand_full_line_argument_boundaries_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_argand_call()))
    graph_config = call["mauthArguments"]["diagram"]["graphConfig"]
    graph_config["features"] = [
        feature for feature in graph_config["features"] if feature.get("kind") != "line_segment"
    ]
    graph_config["functions"].extend(
        [
            {
                "kind": "expression",
                "expression": "y = x / sqrt(3)",
                "strokeStyle": "dashed",
                "label": "$\\arg(z)=\\frac{\\pi}{6}$",
            },
            {
                "kind": "expression",
                "expression": "y = -x / sqrt(3)",
                "strokeStyle": "dashed",
                "label": "$\\arg(z)=\\frac{5\\pi}{6}$",
            },
        ]
    )
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_argand_origin_circle_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_argand_call()))
    functions = call["mauthArguments"]["diagram"]["graphConfig"]["functions"]
    functions[0]["expression"] = "x^2 + y^2 = 4"
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


def local_real_specialist_spherical_cap_bad_solid_fields_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_spherical_cap_call()))
    graph3d = call["mauthArguments"]["diagrams"][1]["graphConfig"]
    solid = graph3d["data"]["solids"][0]
    solid["radius"] = 8
    solid.pop("height", None)
    solid.pop("axis", None)
    solid.pop("center", None)
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


def local_real_specialist_spherical_cap_live_polygon_shading_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_spherical_cap_call()))
    graph2d = call["mauthArguments"]["diagrams"][0]["graphConfig"]
    graph2d["functions"] = [
        {
            "kind": "expression",
            "expression": "sqrt(20*x - x^2)",
            "domainMin": 0,
            "domainMax": 20,
            "color": "#111827",
        },
        {
            "kind": "expression",
            "expression": "-sqrt(20*x - x^2)",
            "domainMin": 0,
            "domainMax": 20,
            "color": "#111827",
        },
    ]
    graph2d["features"] = [
        {
            "kind": "polygon",
            "points": [
                [0, 0],
                [4, 0],
                [4, 8],
            ],
            "fillColor": "#dbeafe",
            "strokeColor": "none",
            "fillOpacity": 0.4,
        },
        {"kind": "line_segment", "x1": 4, "y1": 0, "x2": 4, "y2": 8, "strokeWidth": 1.4, "color": "#111827"},
        {"kind": "free_label", "coords": [4, -1.25], "label": "$h$"},
        {"kind": "free_label", "coords": [10, -1.25], "label": "$10$"},
        {"kind": "free_label", "coords": [20, -1.25], "label": "$20$"},
    ]
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_spherical_cap_live_region_alias_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_spherical_cap_call()))
    graph2d = call["mauthArguments"]["diagrams"][0]["graphConfig"]
    graph2d["functions"] = [
        {
            "kind": "expression",
            "expression": "sqrt(20*x-x^2)",
            "domainMin": 0,
            "domainMax": 20,
            "color": "#000000",
            "strokeWidth": 2,
        },
        {
            "kind": "expression",
            "expression": "-sqrt(20*x-x^2)",
            "domainMin": 0,
            "domainMax": 20,
            "color": "#000000",
            "strokeWidth": 2,
        },
        {
            "kind": "expression",
            "expression": "0",
            "domainMin": 0,
            "domainMax": 20,
            "color": "#777777",
            "strokeWidth": 1,
        },
    ]
    graph2d["features"][0] = {
        "kind": "region_between",
        "functionIndex1": 0,
        "functionIndex2": 2,
        "domainMin": 0,
        "domainMax": 4,
        "color": "#d9d9d9",
        "opacity": 0.75,
    }
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_spherical_cap_missing_graph3d_h_label_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_spherical_cap_call()))
    graph3d = call["mauthArguments"]["diagrams"][1]["graphConfig"]
    for segment in graph3d["data"].get("segments", []):
        if isinstance(segment, dict):
            segment.pop("label", None)
    graph3d["data"].pop("dimensions", None)
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_spherical_cap_live_graph3d_visible_alias_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_spherical_cap_call()))
    graph3d = call["mauthArguments"]["diagrams"][1]["graphConfig"]
    graph3d["data"]["points"][0]["visible"] = False
    graph3d["data"]["segments"][0]["visible"] = True
    graph3d["data"]["solids"][0]["visible"] = True
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_square_pyramid_call() -> dict[str, Any]:
    pyramid_3d = {
        "type": "graph3d",
        "widthPx": 620,
        "heightPx": 430,
        "metadata": {"view3d": {"az": 0.95, "el": 0.32, "bank": 0}},
        "data": {
            "points": [
                {"id": "O", "label": "$O$", "coords": [0, 0, 0]},
                {"id": "A", "label": "$A$", "coords": [1, -1, 0]},
                {"id": "B", "label": "$B$", "coords": [1, 1, 0]},
                {"id": "C", "label": "$C$", "coords": [-1, 1, 0]},
                {"id": "D", "label": "$D$", "coords": [-1, -1, 0]},
                {"id": "E", "label": "$E$", "coords": [0, 0, 1.6]},
                {"id": "F", "label": "$F$", "coords": [1, 0, 0]},
                {"id": "M", "label": "$M$", "coords": [0.5, 0, 0.8]},
            ],
            "segments": [
                {"from": "A", "to": "B"},
                {"from": "B", "to": "C"},
                {"from": "C", "to": "D", "strokeStyle": "dashed"},
                {"from": "D", "to": "A"},
                {"from": "E", "to": "A"},
                {"from": "E", "to": "B"},
                {"from": "E", "to": "C", "strokeStyle": "dashed"},
                {"from": "E", "to": "D"},
                {"from": "D", "to": "B", "strokeStyle": "dashed"},
                {"from": "E", "to": "O", "label": "$\\vec e$", "strokeStyle": "dashed"},
                {"from": "D", "to": "M"},
                {"from": "E", "to": "F"},
                {"from": "F", "to": "M"},
            ],
            "faces": [
                {"points": ["A", "B", "C", "D"], "fillColor": "#dbeafe", "fillOpacity": 0.08},
                {"points": ["A", "B", "E"], "fillColor": "#fef3c7", "fillOpacity": 0.12},
                {"points": ["B", "C", "E"], "fillColor": "#dcfce7", "fillOpacity": 0.1},
                {"points": ["C", "D", "E"], "fillColor": "#fee2e2", "fillOpacity": 0.08},
                {"points": ["D", "A", "E"], "fillColor": "#e0e7ff", "fillOpacity": 0.1},
            ],
            "xRange": [-1.3, 1.3],
            "yRange": [-1.3, 1.3],
            "zRange": [0, 1.9],
        },
    }
    top_view = {
        "type": "graph2d",
        "xMin": -1.35,
        "xMax": 1.35,
        "yMin": -1.2,
        "yMax": 1.2,
        "widthPx": 430,
        "heightPx": 360,
        "equalScale": True,
        "showGrid": False,
        "showAxes": False,
        "showAxisNumbers": False,
        "features": [
            {"kind": "line_segment", "x1": 1, "y1": -1, "x2": 1, "y2": 1, "color": "#111827"},
            {"kind": "line_segment", "x1": 1, "y1": 1, "x2": -1, "y2": 1, "color": "#111827"},
            {"kind": "line_segment", "x1": -1, "y1": 1, "x2": -1, "y2": -1, "color": "#111827"},
            {"kind": "line_segment", "x1": -1, "y1": -1, "x2": 1, "y2": -1, "color": "#111827"},
            {"kind": "line_segment", "x1": -1, "y1": -1, "x2": 1, "y2": 1, "color": "#94a3b8"},
            {"kind": "line_segment", "x1": -1, "y1": 1, "x2": 1, "y2": -1, "color": "#94a3b8"},
            {"kind": "line_segment", "x1": 0, "y1": 0, "x2": 1, "y2": -1, "label": "$\\vec a$", "color": "#111827"},
            {"kind": "line_segment", "x1": 0, "y1": 0, "x2": 1, "y2": 1, "label": "$\\vec b$", "color": "#111827"},
            {"kind": "line_segment", "x1": 0, "y1": 0, "x2": 1, "y2": 0, "color": "#111827"},
            {"kind": "point", "x": 1, "y": -1, "label": "$A$"},
            {"kind": "point", "x": 1, "y": 1, "label": "$B$"},
            {"kind": "point", "x": -1, "y": 1, "label": "$C$"},
            {"kind": "point", "x": -1, "y": -1, "label": "$D$"},
            {"kind": "point", "x": 0, "y": 0, "label": "$O/E$"},
            {"kind": "point", "x": 1, "y": 0, "label": "$F$"},
            {"kind": "point", "x": 0.5, "y": 0, "label": "$M$"},
            {"kind": "label", "x": 0.1, "y": 1.1, "label": "Top view"},
        ],
    }
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 0,
            "questionMarks": 0,
            "questionText": (
                "A square pyramid is positioned using a coordinate system so that $ABCD$ is a square, "
                "with point $E$ the vertex of the pyramid. The origin $O$ is the midpoint of $DB$. "
                "The position vectors for $A$, $B$ and $E$ are denoted respectively by $\\vec a$, "
                "$\\vec b$ and $\\vec e$. Point $F$ is the midpoint of edge $AB$ and $M$ is the midpoint of $EF$."
            ),
            "diagrams": [
                {"diagramAlign": "left", "graphConfig": pyramid_3d},
                {"diagramAlign": "right", "graphConfig": top_view},
            ],
            "diagramLayout": "columns",
            "diagramColumns": 2,
            "parts": [
                {
                    "label": "a",
                    "text": "In terms of vectors $\\vec a$, $\\vec b$ and $\\vec e$, determine simplified expressions for:",
                    "marks": 0,
                    "answerSurface": "none",
                    "subparts": [
                        {
                            "label": "i",
                            "text": "$\\overrightarrow{FE}$.",
                            "marks": 1,
                            "studentSpaceLines": 3,
                            "includeSolution": True,
                            "solutionText": (
                                "$$\\overrightarrow{FE}=\\overrightarrow{FB}+\\overrightarrow{BO}+\\overrightarrow{OE}$$\n"
                                "$$=\\frac12(\\vec b-\\vec a)-\\vec b+\\vec e"
                                "=-0.5\\vec a-0.5\\vec b+\\vec e.$$ [[marks:1]]"
                            ),
                        },
                        {
                            "label": "ii",
                            "text": "$\\overrightarrow{DM}$.",
                            "marks": 1,
                            "studentSpaceLines": 3,
                            "includeSolution": True,
                            "solutionText": (
                                "$$\\overrightarrow{DM}=\\overrightarrow{DA}+\\overrightarrow{AF}+\\overrightarrow{FM}$$\n"
                                "$$=(\\vec a+\\vec b)+0.5(\\vec b-\\vec a)"
                                "+0.5(-0.5\\vec a-0.5\\vec b+\\vec e)$$\n"
                                "$$=0.25\\vec a+1.25\\vec b+0.5\\vec e.$$ [[marks:1]]"
                            ),
                        },
                    ],
                },
                {
                    "label": "b",
                    "text": (
                        "Determine the expression for $\\overrightarrow{DM}\\cdot\\overrightarrow{FE}$ "
                        "in the form $x|\\vec a|^2+y|\\vec e|^2$ where $x$ and $y$ are real constants."
                    ),
                    "marks": 4,
                    "studentSpaceLines": 8,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": (
                        "Since $\\vec a$, $\\vec b$ and $\\vec e$ are mutually perpendicular, "
                        "$\\vec a\\cdot\\vec b=\\vec a\\cdot\\vec e=\\vec b\\cdot\\vec e=0$. [[marks:1]]\n"
                        "$$\\overrightarrow{DM}\\cdot\\overrightarrow{FE}"
                        "=(0.25\\vec a+1.25\\vec b+0.5\\vec e)"
                        "\\cdot(-0.5\\vec a-0.5\\vec b+\\vec e).$$ [[marks:1]]\n"
                        "$$=-0.125|\\vec a|^2-0.625|\\vec b|^2+0.5|\\vec e|^2.$$ [[marks:1]]\n"
                        "Since $|\\vec a|=|\\vec b|$, "
                        "$$\\overrightarrow{DM}\\cdot\\overrightarrow{FE}=-0.75|\\vec a|^2+0.5|\\vec e|^2.$$ [[marks:1]]"
                    ),
                },
                {
                    "label": "c",
                    "text": (
                        "If $\\angle DMF$ is to be a right angle, then determine the exact value for "
                        "$\\frac{|\\vec e|}{|\\vec a|}$."
                    ),
                    "marks": 2,
                    "studentSpaceLines": 5,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": (
                        "For $\\angle DMF$ to be a right angle, "
                        "$\\overrightarrow{DM}\\cdot\\overrightarrow{FE}=0$. [[marks:1]]\n"
                        "$$-0.75|\\vec a|^2+0.5|\\vec e|^2=0,$$ so "
                        "$$\\frac{|\\vec e|^2}{|\\vec a|^2}=\\frac{0.75}{0.5}=\\frac32.$$ "
                        "Hence $$\\frac{|\\vec e|}{|\\vec a|}=\\sqrt{\\frac32}=\\frac{\\sqrt6}{2}.$$ [[marks:1]]"
                    ),
                },
            ],
        },
    )


def local_real_specialist_square_pyramid_bad_midpoints_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_square_pyramid_call()))
    graph_config = call["mauthArguments"]["diagrams"][0]["graphConfig"]
    for point in graph_config["data"]["points"]:
        if point.get("id") == "F":
            point["coords"] = [0.8, 0.2, 0]
        if point.get("id") == "M":
            point["coords"] = [0.25, 0.25, 0.8]
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_square_pyramid_missing_angle_segment_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_square_pyramid_call()))
    graph3d = call["mauthArguments"]["diagrams"][0]["graphConfig"]
    graph3d["data"]["segments"] = [
        segment
        for segment in graph3d["data"]["segments"]
        if {str(segment.get("from", "")).lower(), str(segment.get("to", "")).lower()} != {"d", "m"}
    ]
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_square_pyramid_missing_midpoint_angle_ray_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_square_pyramid_call()))
    graph3d = call["mauthArguments"]["diagrams"][0]["graphConfig"]
    graph3d["data"]["segments"] = [
        segment
        for segment in graph3d["data"]["segments"]
        if {str(segment.get("from", "")).lower(), str(segment.get("to", "")).lower()} != {"f", "m"}
    ]
    if not any(
        {str(segment.get("from", "")).lower(), str(segment.get("to", "")).lower()} == {"e", "f"}
        for segment in graph3d["data"]["segments"]
    ):
        graph3d["data"]["segments"].append({"from": "F", "to": "E", "label": "$\\overrightarrow{FE}$"})
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_square_pyramid_live_midpoint_construction_missing_fm_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_square_pyramid_call()))
    graph3d = call["mauthArguments"]["diagrams"][0]["graphConfig"]
    graph3d["data"]["segments"] = [
        segment
        for segment in graph3d["data"]["segments"]
        if {str(segment.get("from", "")).lower(), str(segment.get("to", "")).lower()} != {"f", "m"}
    ]
    required_segments = [
        {"from": "E", "to": "F", "label": "$\\overrightarrow{FE}$"},
        {"from": "A", "to": "F"},
        {"from": "F", "to": "B"},
    ]
    for required in required_segments:
        endpoints = {str(required["from"]).lower(), str(required["to"]).lower()}
        if not any(
            {str(segment.get("from", "")).lower(), str(segment.get("to", "")).lower()} == endpoints
            for segment in graph3d["data"]["segments"]
        ):
            graph3d["data"]["segments"].append(required)
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_square_pyramid_bad_top_view_geometry_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_square_pyramid_call()))
    top_view = call["mauthArguments"]["diagrams"][1]["graphConfig"]
    top_view["features"] = [
        feature
        for feature in top_view["features"]
        if not (
            feature.get("kind") == "line_segment"
            and graph2d_number_near(feature.get("x1"), -1, 0.01)
            and graph2d_number_near(feature.get("y1"), 1, 0.01)
            and graph2d_number_near(feature.get("x2"), 1, 0.01)
            and graph2d_number_near(feature.get("y2"), -1, 0.01)
        )
    ]
    for feature in top_view["features"]:
        if feature.get("kind") == "point" and feature.get("label") == "$F$":
            feature["x"] = 0.7
            feature["y"] = 0.2
        if feature.get("kind") == "point" and feature.get("label") == "$M$":
            feature["x"] = 0.2
            feature["y"] = 0.1
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_square_pyramid_short_top_view_vector_rays_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_square_pyramid_call()))
    top_view = call["mauthArguments"]["diagrams"][1]["graphConfig"]
    for feature in top_view["features"]:
        if feature.get("kind") == "line_segment" and feature.get("label") == "$\\vec a$":
            feature["x2"] = 0.45
            feature["y2"] = -0.45
            feature["endArrow"] = True
        if feature.get("kind") == "line_segment" and feature.get("label") == "$\\vec b$":
            feature["x2"] = 0.45
            feature["y2"] = 0.45
            feature["endArrow"] = True
        if feature.get("kind") == "point" and feature.get("label") == "$O/E$":
            feature["label"] = "$E$"
            feature["labelX"] = 0.02
            feature["labelY"] = 0.16
    top_view["features"].append({"kind": "label", "x": -0.12, "y": -0.18, "label": "$O$"})
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_square_pyramid_live_missing_faces_labels_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_square_pyramid_call()))
    graph3d = call["mauthArguments"]["diagrams"][0]["graphConfig"]
    graph3d["data"]["segments"] = [
        segment
        for segment in graph3d["data"]["segments"]
        if {str(segment.get("from", "")).lower(), str(segment.get("to", "")).lower()} != {"f", "m"}
    ]
    graph3d["data"]["faces"] = graph3d["data"]["faces"][:1]
    top_view = call["mauthArguments"]["diagrams"][1]["graphConfig"]
    for feature in top_view["features"]:
        if feature.get("label") == "$\\vec a$":
            feature["label"] = "$\\mathbf{a}$"
        if feature.get("label") == "$\\vec b$":
            feature["label"] = "$\\mathbf{b}$"
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_square_pyramid_live_duplicate_missing_fm_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_square_pyramid_call()))
    call["mauthArguments"]["diagram"] = json.loads(json.dumps(call["mauthArguments"]["diagrams"][0]))
    graph3d_configs = [
        call["mauthArguments"]["diagram"]["graphConfig"],
        call["mauthArguments"]["diagrams"][0]["graphConfig"],
    ]
    for graph3d in graph3d_configs:
        graph3d["data"]["segments"] = [
            segment
            for segment in graph3d["data"]["segments"]
            if {str(segment.get("from", "")).lower(), str(segment.get("to", "")).lower()} != {"f", "m"}
        ]
        graph3d["data"]["faces"] = [
            {"points": ["A", "B", "E"], "fillColor": "#fef3c7", "fillOpacity": 0.12},
            {"points": ["B", "C", "E"], "fillColor": "#dcfce7", "fillOpacity": 0.1},
            {"points": ["D", "A", "E"], "fillColor": "#e0e7ff", "fillOpacity": 0.1},
        ]
    top_view = call["mauthArguments"]["diagrams"][1]["graphConfig"]
    for feature in top_view["features"]:
        if feature.get("label") == "$\\vec a$":
            feature["label"] = "$\\underset{\\sim}{a}$"
        if feature.get("label") == "$\\vec b$":
            feature["label"] = "$\\underset{\\sim}{b}$"
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_square_pyramid_live_unattached_vector_labels_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_square_pyramid_call()))
    graph3d = call["mauthArguments"]["diagrams"][0]["graphConfig"]
    graph3d["data"]["segments"] = [
        segment
        for segment in graph3d["data"]["segments"]
        if {str(segment.get("from", "")).lower(), str(segment.get("to", "")).lower()} != {"e", "f"}
    ]
    top_view = call["mauthArguments"]["diagrams"][1]["graphConfig"]
    for feature in top_view["features"]:
        if feature.get("kind") == "line_segment" and feature.get("label") == "$\\vec a$":
            feature.pop("label", None)
            feature["arrowEnd"] = True
        if feature.get("kind") == "line_segment" and feature.get("label") == "$\\vec b$":
            feature.pop("label", None)
            feature["arrowEnd"] = True
    top_view["features"].extend(
        [
            {"kind": "label", "x": 0.58, "y": -0.58, "label": "$\\vec a$"},
            {"kind": "label", "x": 0.58, "y": 0.58, "label": "$\\vec b$"},
        ]
    )
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


def local_real_specialist_prism_bad_metadata_size_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_prism_call()))
    graph_config = call["mauthArguments"]["diagram"]["graphConfig"]
    graph_config["metadata"]["widthPx"] = graph_config.pop("widthPx")
    graph_config["metadata"]["heightPx"] = graph_config.pop("heightPx")
    call["arguments"] = call["mauthArguments"]
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


def local_real_specialist_prism_bad_latex_artifact_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_prism_call()))
    parts = call["mauthArguments"]["parts"]
    parts[0]["text"] = "Determine the vector equation for the prism's main diagonal $\\$\\overrightarrow{BT}$."
    parts[2]["text"] = (
        "Prove, using a vector method, that line $\\$\\overrightarrow{AM}$ does not "
        "intersect $\\$\\overrightarrow{BT}$."
    )
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_prism_control_character_notation_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_prism_call()))
    parts = call["mauthArguments"]["parts"]
    parts[0]["text"] = "Determine the vector equation for the prism's main diagonal $\x7fBT$."
    parts[2]["text"] = "Prove, using a vector method, that line $\x7fAM$ does not intersect $\x7fBT$."
    parts[2]["solutionText"] = (
        "For the two lines to intersect, there must be real values of $\x7flambda$ and $\x7fmu$. "
        "This leads to a contradiction, so $AM$ does not intersect $BT$. [[marks:3]]"
    )
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_prism_bad_line_notation_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_prism_call()))
    parts = call["mauthArguments"]["parts"]
    parts[0]["text"] = "Determine the vector equation for the prism's main diagonal $\\overrightarrow{BT}$."
    parts[2]["text"] = (
        "Prove, using a vector method, that line $\\overrightarrow{AM}$ does not intersect $\\overrightarrow{BT}$."
    )
    for segment in call["mauthArguments"]["diagram"]["graphConfig"]["data"]["segments"]:
        if segment.get("from") == "B" and segment.get("to") == "T":
            segment["label"] = "$\\overrightarrow{BT}$"
        if segment.get("from") == "A" and segment.get("to") == "M":
            segment["label"] = "$\\overrightarrow{AM}$"
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
        "widthPx": 300,
        "heightPx": 210,
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
        "widthPx": 300,
        "heightPx": 210,
        "metadata": {"view3d": {"az": 1.2, "el": 0.32, "bank": 0}},
        "data": {
            "points": [
                {"id": "ConeO", "label": "$O$", "coords": [0, 0, 0], "show": False},
                {"id": "ConeV", "label": "$V$", "coords": [0, 0, 5]},
                {"id": "ConeR", "label": "$r=2$", "coords": [2, 0, 0], "show": False},
            ],
            "segments": [
                {"from": "ConeO", "to": "ConeV", "strokeStyle": "dashed"},
                {"from": "ConeO", "to": "ConeR"},
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
                    "renderStyle": "surface",
                }
            ],
            "dimensions": [
                {"from": "ConeO", "to": "ConeV", "label": "$h=5$", "dashed": True},
                {"from": "ConeO", "to": "ConeR", "label": "$r=2$"},
            ],
            "xRange": [-2.6, 2.6],
            "yRange": [-2.6, 2.6],
            "zRange": [0, 5.5],
        },
    }
    cylinder = {
        "type": "graph3d",
        "widthPx": 300,
        "heightPx": 210,
        "metadata": {"view3d": {"az": 1.15, "el": 0.3, "bank": 0}},
        "data": {
            "points": [
                {"id": "CylB", "label": "$B$", "coords": [0, 0, 0], "show": False},
                {"id": "CylT", "label": "$T$", "coords": [0, 0, 4], "show": False},
                {"id": "CylR", "label": "$r=1.5$", "coords": [1.5, 0, 0], "show": False},
            ],
            "segments": [
                {"from": "CylB", "to": "CylT", "strokeStyle": "dashed"},
                {"from": "CylB", "to": "CylR"},
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
                    "renderStyle": "outline",
                }
            ],
            "dimensions": [
                {"from": "CylB", "to": "CylT", "label": "$h=4$", "dashed": True},
                {"from": "CylB", "to": "CylR", "label": "$r=1.5$"},
            ],
            "xRange": [-2.1, 2.1],
            "yRange": [-2.1, 2.1],
            "zRange": [0, 4.5],
        },
    }
    sphere = {
        "type": "graph3d",
        "widthPx": 300,
        "heightPx": 210,
        "metadata": {"view3d": {"az": 1.05, "el": 0.25, "bank": 0}},
        "data": {
            "points": [
                {"id": "SphereC", "label": "$C$", "coords": [0, 0, 0], "show": False},
                {"id": "SphereP", "label": "$P$", "coords": [2, 0, 0], "show": False},
            ],
            "segments": [{"from": "SphereC", "to": "SphereP"}],
            "solids": [
                {
                    "kind": "sphere",
                    "center": "SphereC",
                    "radius": 2,
                    "fillColor": "#ddd6fe",
                    "fillOpacity": 0.16,
                    "strokeColor": "#5b21b6",
                    "renderStyle": "wireframe",
                }
            ],
            "dimensions": [{"from": "SphereC", "to": "SphereP", "label": "$r=2$"}],
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


def local_graph3d_general_solids_missing_dimensions_render_style_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_graph3d_general_solids_call()))
    for diagram in call["mauthArguments"]["diagrams"]:
        graph_config = diagram["graphConfig"]
        data = graph_config["data"]
        data.pop("dimensions", None)
        for solid in data.get("solids", []):
            if isinstance(solid, dict):
                solid.pop("renderStyle", None)
    call["arguments"] = call["mauthArguments"]
    return call


def local_graph3d_general_solids_bad_solid_fields_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_graph3d_general_solids_call()))
    for diagram in call["mauthArguments"]["diagrams"]:
        for solid in diagram["graphConfig"]["data"].get("solids", []):
            if not isinstance(solid, dict):
                continue
            kind = graph3d_solid_kind(solid)
            if kind == "cone":
                solid.pop("baseCenter", None)
                solid.pop("apex", None)
                solid["radius"] = -2
            if kind == "cylinder":
                solid.pop("baseCenter", None)
                solid.pop("topCenter", None)
                solid["radius"] = 0
            if kind == "sphere":
                solid.pop("center", None)
                solid["radius"] = None
    call["arguments"] = call["mauthArguments"]
    return call


def local_graph3d_general_solids_face_vertices_alias_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_graph3d_general_solids_call()))
    for diagram in call["mauthArguments"]["diagrams"]:
        graph_config = diagram["graphConfig"]
        data = graph_config["data"]
        for face in data.get("faces", []):
            if isinstance(face, dict) and isinstance(face.get("points"), list):
                face["vertices"] = face.pop("points")
    call["arguments"] = call["mauthArguments"]
    return call


def local_graph3d_general_solids_raw_aliases_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_graph3d_general_solids_call()))
    for diagram in call["mauthArguments"]["diagrams"]:
        graph_config = diagram["graphConfig"]
        data = graph_config["data"]
        if isinstance(data.get("segments"), list):
            data["edges"] = data.pop("segments")
        if isinstance(data.get("dimensions"), list):
            data["dimensionLines"] = data.pop("dimensions")
        if isinstance(data.get("solids"), list):
            data["surfaces"] = data.pop("solids")
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
            {"kind": "point", "x": -0.475, "y": 0.225, "label": "$A$"},
            {"kind": "point", "x": 1.395, "y": 1.947, "label": "$B$"},
        ],
    }
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 0,
            "questionMarks": 0,
            "questionText": (
                "The equation $x^3+y^3=3xy+y$ implicitly defines the curve shown below. "
                "The slope of the curve at the origin $O$ and points $A$ and $B$ is equal to zero."
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
                    "text": (
                        "Show that the equation that determines the $x$ coordinates for points $A$ and $B$ is "
                        "given by $x^4-2x-1=0$, and hence determine the coordinates for point $A$ correct to 0.001."
                    ),
                    "marks": 3,
                    "studentSpaceLines": 6,
                    "includeSolution": True,
                    "solutionText": (
                        "For a slope of zero, the numerator must be zero, so $y=x^2$. [[marks:1]]\n"
                        "Substituting $y=x^2$ gives $$x^6-2x^3-x^2=0,$$ hence for non-origin points "
                        "$$x^4-2x-1=0.$$ [[marks:1]]\n"
                        "Using CAS, point $A$ is $(-0.475,0.225)$ correct to 0.001. [[marks:1]]"
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


def local_real_specialist_implicit_bad_schema_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_implicit_call()))
    graph_config = call["mauthArguments"]["diagram"]["graphConfig"]
    graph_config["axisLabels"] = {"x": "$x$", "y": "$y$"}
    graph_config["gridStep"] = 1
    graph_config["functions"][0]["kind"] = "implicit"
    graph_config["functions"][0]["expression"] = "x^3 + y^3 - 3*x*y - y = 0"
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_implicit_bad_points_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_implicit_call()))
    graph_config = call["mauthArguments"]["diagram"]["graphConfig"]
    graph_config["features"] = [
        {"kind": "point", "x": 0, "y": 0, "label": "$O$"},
        {"kind": "point", "x": -0.475, "y": 0, "label": "$A$"},
        {"kind": "point", "x": 0.225, "y": 0, "label": "$B$"},
    ]
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_implicit_bad_rounding_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_implicit_call()))
    call["mauthArguments"]["parts"][1]["solutionText"] = (
        "For a slope of zero, $y=x^2$. [[marks:1]]\n"
        "Substituting gives $$x^2(x^4-2x-1)=0.$$ [[marks:1]]\n"
        "Hence $A=(-0.474,0.225)$ correct to 0.001. [[marks:1]]"
    )
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_ski_modelling_call() -> dict[str, Any]:
    graph_config = {
        "type": "graph2d",
        "xMin": 0,
        "xMax": 400,
        "yMin": 0,
        "yMax": 210,
        "widthPx": 640,
        "heightPx": 420,
        "showGrid": True,
        "showAxes": True,
        "showAxisLabels": True,
        "showAxisNumbers": True,
        "xAxisLabel": "$x$",
        "yAxisLabel": "$y$",
        "functions": [
            {
                "kind": "expression",
                "expression": "120 + 60*((100 - x)/100)^2",
                "domainMin": 0,
                "domainMax": 100,
                "color": "#111827",
                "strokeWidth": 2,
                "label": "ramp descent",
            },
            {
                "kind": "expression",
                "expression": "170 - 0.5*x",
                "domainMin": 100,
                "domainMax": 340,
                "color": "#111827",
                "strokeWidth": 2,
                "label": "$y=170-0.5x$",
            },
            {
                "kind": "expression",
                "expression": "120 - 1000*(log((740 - x)/640))^2",
                "domainMin": 100,
                "domainMax": 255.916,
                "color": "#9ca3af",
                "strokeWidth": 2.2,
                "label": "skier flight path",
            },
        ],
        "features": [
            {"kind": "point", "x": 0, "y": 180, "label": "$B$", "color": "#111827"},
            {"kind": "point", "x": 100, "y": 120, "label": "$E$", "color": "#111827"},
            {"kind": "point", "x": 255.915887, "y": 42.04205652, "label": "", "color": "#6b7280"},
            {"kind": "label", "x": 170, "y": 8, "label": "$x$"},
            {"kind": "line_segment", "x1": 100, "y1": 120, "x2": 145, "y2": 120, "label": "horizontal velocity"},
        ],
    }
    return local_source_question_call(
        {
            "questionNumber": 1,
            "marks": 0,
            "questionMarks": 0,
            "questionText": (
                "Using the correct technique, Olympic ski jumpers can slow down their descent by creating lift "
                "to counteract gravity. A skier begins his descent at point $B$ and leaves the ramp travelling "
                "horizontally at point $E(100,120)$ at 32 metres per second. Let $t$ be the number of seconds "
                "in flight after point $E$, $h(t)$ the height above the horizontal ground $y=0$, and $x(t)$ "
                "the horizontal position. The sloped ground for landing is $y=170-0.5x$ for $100\\le x\\le340$. "
                "The horizontal velocity is $x'(t)=32e^{-0.05t}$."
            ),
            "diagram": {"diagramAlign": "center", "graphConfig": graph_config},
            "parts": [
                {
                    "label": "a",
                    "text": "Show that $x(t)=740-640e^{-0.05t}$.",
                    "marks": 2,
                    "studentSpaceLines": 5,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": (
                        "$$x(t)=\\int 32e^{-0.05t}\\,dt=-640e^{-0.05t}+c.$$ [[marks:1]]\n"
                        "Using $x(0)=100$ gives $100=-640+c$, so $c=740$ and "
                        "$$x(t)=740-640e^{-0.05t}.$$ [[marks:1]]"
                    ),
                },
                {
                    "label": "b",
                    "text": "Calculate the height of the skier above the sloped ground after 3 seconds of flight, correct to the nearest 0.01 metre.",
                    "marks": 3,
                    "studentSpaceLines": 7,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": (
                        "$$r(3)=\\begin{pmatrix}189.1468\\ldots\\\\97.5\\end{pmatrix}.$$ [[marks:1]]\n"
                        "At $x=189.1468\\ldots$, the sloped ground has height "
                        "$$y=170-0.5(189.1468\\ldots)=75.42655\\ldots.$$ [[marks:1]]\n"
                        "The height above the sloped ground is $97.5-75.42655\\ldots=22.07$ metres. [[marks:1]]"
                    ),
                },
                {
                    "label": "c",
                    "text": "Determine the vertical lift $s$ (m/s$^2$) provided by the skier's suit and equipment in the descent if $\\frac{d^2h}{dt^2}=s-9.8$, where $s$ is a constant.",
                    "marks": 3,
                    "studentSpaceLines": 8,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": (
                        "Integrating gives $h'(t)=(s-9.8)t+c$, and $h'(0)=0$ so $c=0$. [[marks:1]]\n"
                        "$$h(t)=\\frac{s-9.8}{2}t^2+k,$$ and $h(0)=120$ gives $k=120$. [[marks:1]]\n"
                        "Since $h(t)=120-2.5t^2$, $\\frac{s-9.8}{2}=-2.5$, hence $s=4.8\\text{ m/s}^2$. [[marks:1]]"
                    ),
                },
                {
                    "label": "d",
                    "text": (
                        "The Cartesian equation for the skier's flight is "
                        "$$y=120-1000\\left(\\ln\\left(\\frac{740-x}{640}\\right)\\right)^2.$$ "
                        "Calculate the time taken for the skier to land on the sloped ground, correct to the nearest 0.01 second."
                    ),
                    "marks": 3,
                    "studentSpaceLines": 8,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": (
                        "Solving $y=170-0.5x$ with "
                        "$$y=120-1000\\left(\\ln\\left(\\frac{740-x}{640}\\right)\\right)^2$$ "
                        "gives the landing point $(255.915887,42.04205652)$. [[marks:1]]\n"
                        "Then $42.04205652=120-2.5t^2$, equivalently "
                        "$255.915887=740-640e^{-0.05t}$. [[marks:1]]\n"
                        "Solving gives $t=5.584189949\\ldots$, so the time is $5.58$ seconds. [[marks:1]]"
                    ),
                },
                {
                    "label": "e",
                    "text": "Calculate the angle at which the skier impacts the sloped ground, correct to the nearest 0.1 degree.",
                    "marks": 3,
                    "studentSpaceLines": 8,
                    "answerSurface": "space",
                    "includeSolution": True,
                    "solutionText": (
                        "$$r'(t)=\\begin{pmatrix}32e^{-0.05t}\\\\-5t\\end{pmatrix},$$ so "
                        "$$r'(5.58418\\ldots)=\\begin{pmatrix}24.2042\\ldots\\\\-27.9209\\ldots\\end{pmatrix}.$$ [[marks:1]]\n"
                        "The velocity angle below the horizontal is "
                        "$$\\tan^{-1}\\left(\\frac{27.9209}{24.2042}\\right)=49.0784^\\circ.$$ [[marks:1]]\n"
                        "The ground angle is $\\tan^{-1}(0.5)=26.5650^\\circ$, so the impact angle is "
                        "$49.0784^\\circ-26.5650^\\circ=22.5^\\circ$. [[marks:1]]"
                    ),
                },
            ],
        }
    )


def local_real_specialist_ski_modelling_bad_graph_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_ski_modelling_call()))
    graph_config = call["mauthArguments"]["diagram"]["graphConfig"]
    graph_config["functions"] = [
        {
            "kind": "expression",
            "expression": "170 - x",
            "domainMin": 100,
            "domainMax": 340,
            "color": "#111827",
        }
    ]
    graph_config["features"] = [
        feature
        for feature in graph_config["features"]
        if feature.get("label") != "$E$" and abs(float(feature.get("x", 0)) - 255.915887) > 0.01
    ]
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_ski_modelling_bad_domains_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_ski_modelling_call()))
    graph_config = call["mauthArguments"]["diagram"]["graphConfig"]
    graph_config["xMax"] = 150
    graph_config["showAxisLabels"] = False
    graph_config["functions"][0]["domainMax"] = 340
    graph_config["functions"][1]["domainMin"] = 0
    graph_config["functions"][1]["domainMax"] = 100
    graph_config["functions"][2]["domainMax"] = 340
    for feature in graph_config["features"]:
        if isinstance(feature, dict) and approximately(feature.get("x"), 255.915887, tolerance=0.01):
            feature["x"] = 300
            feature["y"] = 20
    call["arguments"] = call["mauthArguments"]
    return call


def local_real_specialist_ski_modelling_bad_solution_call() -> dict[str, Any]:
    call = json.loads(json.dumps(local_real_specialist_ski_modelling_call()))
    parts = call["mauthArguments"]["parts"]
    parts[1]["solutionText"] = "At $t=3$, the skier is $18.50$ metres above the sloped ground. [[marks:3]]"
    parts[2]["solutionText"] = "Solving gives $s=9.8\\text{ m/s}^2$. [[marks:3]]"
    parts[3]["solutionText"] = "The landing time is $4.20$ seconds. [[marks:3]]"
    parts[4]["solutionText"] = "The impact angle is $12.0^\\circ$. [[marks:3]]"
    call["arguments"] = call["mauthArguments"]
    return call


LOCAL_EVAL_CASES: dict[str, dict[str, Any]] = {
    "screenshot-scalar-products": {
        "assert": assert_screenshot_scalar_products_call,
        "call": local_screenshot_scalar_products_call,
    },
    "screenshot-scalar-products-native-vector2d": {
        "assert": assert_screenshot_scalar_products_call,
        "call": local_screenshot_scalar_products_native_vector2d_call,
    },
    "screenshot-scalar-products-bad-raw-labels": {
        "assert": assert_screenshot_scalar_products_call,
        "call": local_screenshot_scalar_products_bad_raw_labels_call,
        "expectedIssues": [
            "native vector2d magnitude labels should use TeX-safe \\text{units}",
            "native vector2d angle labels should use TeX-safe ^\\circ notation",
        ],
    },
    "screenshot-scalar-products-bad-native-label-placement": {
        "assert": assert_screenshot_scalar_products_call,
        "call": local_screenshot_scalar_products_bad_native_label_placement_call,
        "expectedIssues": [
            "native vector2d vector labels should set labelX/labelY",
            "native vector2d magnitude labels should set labelX/labelY or offsetPx",
            "native vector2d angle labels should set labelX/labelY",
        ],
    },
    "screenshot-scalar-products-bad-compact-labels": {
        "assert": assert_screenshot_scalar_products_call,
        "call": local_screenshot_scalar_products_bad_compact_labels_call,
        "expectedIssues": [
            "vectorRayDiagram magnitude labels should use TeX-safe \\ \\text{units}",
            "vectorRayDiagram angle labels should use TeX-safe ^\\circ notation",
        ],
    },
    "screenshot-scalar-products-bad-marker-pairs": {
        "assert": assert_screenshot_scalar_products_call,
        "call": local_screenshot_scalar_products_bad_marker_pairs_call,
        "expectedIssues": [
            "right-angle marker should span the perpendicular rays b and d",
            "45 degree marker should span the labelled rays c and d",
        ],
    },
    "screenshot-scalar-products-live-right-angle-bc": {
        "assert": assert_screenshot_scalar_products_call,
        "call": local_screenshot_scalar_products_live_right_angle_bc_call,
        "expectedIssues": [
            "vectorRayDiagram should make b perpendicular to d",
            "vectorRayDiagram right-angle marker should span the perpendicular rays b and d",
        ],
    },
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
    "real-methods-earthquake-bad-axes": {
        "assert": assert_real_methods_earthquake_call,
        "call": local_real_methods_earthquake_bad_axes_call,
        "expectedIssues": [
            "graph2d xAxisLabel should preserve log/M_0",
            "graph2d yAxisLabel should preserve M_w",
            "graph2d xMin should preserve source value 8",
            "graph2d yMax should preserve source value 5",
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
    "real-methods-ev-histogram-counts-in-values": {
        "assert": assert_real_methods_ev_histogram_call,
        "call": local_real_methods_ev_histogram_counts_in_values_call,
        "expectedIssues": [
            "exact count charts should use frequencies, not values",
        ],
    },
    "real-methods-ev-histogram-top-level-stats-fields": {
        "assert": assert_real_methods_ev_histogram_call,
        "call": local_real_methods_ev_histogram_top_level_stats_fields_call,
        "expectedIssues": [
            "statsChart chart DSL fields must be under graphConfig.data",
        ],
    },
    "real-methods-ev-histogram-padded-range": {
        "assert": assert_real_methods_ev_histogram_call,
        "call": local_real_methods_ev_histogram_padded_range_call,
        "expectedIssues": [
            "statsChart should preserve range [260, 440]",
        ],
    },
    "real-methods-ev-histogram-bad-source-fields": {
        "assert": assert_real_methods_ev_histogram_call,
        "call": local_real_methods_ev_histogram_bad_source_fields_call,
        "expectedIssues": [
            "statsChart should preserve dataMode 'manualFrequencies'",
            "statsChart should preserve binSize 20",
            "statsChart xLabel should preserve W",
            "statsChart should preserve range [260, 440]",
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
    "real-methods-dice-game-bad-chart-fields": {
        "assert": assert_real_methods_dice_game_call,
        "call": local_real_methods_dice_game_bad_chart_fields_call,
        "expectedIssues": [
            "statsChart should preserve dataMode 'manualFrequencies'",
            "statsChart should preserve barType 'discrete'",
            "statsChart should preserve yAxisMode 'frequency'",
            "statsChart xLabel should preserve x",
            "statsChart yLabel should preserve f",
        ],
    },
    "real-methods-dice-game-counts-in-values": {
        "assert": assert_real_methods_dice_game_call,
        "call": local_real_methods_dice_game_counts_in_values_call,
        "expectedIssues": [
            "exact count charts should use frequencies, not values",
        ],
    },
    "real-methods-dice-game-thin-space-simulation-count": {
        "assert": assert_real_methods_dice_game_call,
        "call": local_real_methods_dice_game_thin_space_simulation_count_call,
    },
    "real-methods-dice-game-live-escaped-currency": {
        "assert": assert_real_methods_dice_game_call,
        "call": local_real_methods_dice_game_live_escaped_currency_call,
        "expectedIssues": ["contains malformed escaped dollar inside maths"],
    },
    "real-specialist-lighthouse": {
        "assert": assert_real_lighthouse_question_call,
        "call": local_real_specialist_lighthouse_call,
    },
    "real-specialist-lighthouse-bad-renderer": {
        "assert": assert_real_lighthouse_question_call,
        "call": local_real_specialist_lighthouse_bad_renderer_call,
        "expectedIssues": [
            "lighthouse right-triangle diagram should use geometricConstruction",
            "lighthouse right-triangle diagram should not use graph2d",
        ],
    },
    "real-specialist-lighthouse-bad-solution": {
        "assert": assert_real_lighthouse_question_call,
        "call": local_real_specialist_lighthouse_bad_solution_call,
        "expectedIssues": [
            "lighthouse solution should preserve one of ('pi/10'",
            "lighthouse solution should preserve one of ('\\\\sec^2\\\\theta'",
            "lighthouse solution should preserve one of ('78.54'",
        ],
    },
    "real-specialist-lighthouse-live-undeclared-label": {
        "assert": assert_real_lighthouse_question_call,
        "call": local_real_specialist_lighthouse_live_undeclared_label_call,
        "expectedIssues": [
            "lighthouse geometricConstruction should render through Penrose",
            "Variable LLabel",
        ],
    },
    "real-specialist-lighthouse-live-segment-perpendicular": {
        "assert": assert_real_lighthouse_question_call,
        "call": local_real_specialist_lighthouse_live_segment_perpendicular_call,
        "expectedIssues": [
            "lighthouse geometricConstruction should render through Penrose",
            "NamedSegment",
            "Line",
        ],
    },
    "real-specialist-lighthouse-live-custom-style": {
        "assert": assert_real_lighthouse_question_call,
        "call": local_real_specialist_lighthouse_live_custom_style_call,
        "expectedIssues": [
            "lighthouse geometricConstruction should render through Penrose",
            "Unexpected ensure token",
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
    "real-specialist-stats-bad-density-points": {
        "assert": assert_real_specialist_stats_call,
        "call": local_real_specialist_stats_bad_density_points_call,
        "expectedIssues": [
            "statsChart xLabel should preserve response/time",
            "statsChart should preserve source point (2.1, 0.2)",
            "statsChart should preserve source point (2.7, 0.18)",
        ],
    },
    "real-specialist-stats-live-smoothed-density-points": {
        "assert": assert_real_specialist_stats_call,
        "call": local_real_specialist_stats_live_smoothed_density_points_call,
        "expectedIssues": [
            "statsChart xLabel should preserve response/time",
            "statsChart should preserve source point (1, 0.03)",
            "statsChart should preserve source point (2.1, 0.2)",
            "statsChart should preserve source point (2.7, 0.18)",
            "statsChart should preserve source point (5, 0.02)",
        ],
    },
    "real-specialist-stats-paired-density-values": {
        "assert": assert_real_specialist_stats_call,
        "call": local_real_specialist_stats_paired_density_values_call,
    },
    "real-specialist-confidence-intervals": {
        "assert": assert_real_specialist_confidence_intervals_call,
        "call": local_real_specialist_confidence_intervals_call,
    },
    "real-specialist-confidence-intervals-bad-table": {
        "assert": assert_real_specialist_confidence_intervals_call,
        "call": local_real_specialist_confidence_intervals_bad_table_call,
        "expectedIssues": [
            "confidence-interval table should preserve row C",
            "confidence-interval table should preserve row D",
        ],
    },
    "real-specialist-confidence-intervals-bad-solution": {
        "assert": assert_real_specialist_confidence_intervals_call,
        "call": local_real_specialist_confidence_intervals_bad_solution_call,
        "expectedIssues": [
            "confidence-interval solution should preserve one of ('300'",
            "confidence-interval solution should preserve one of ('51.02'",
            "confidence-interval solution should preserve one of ('16n'",
            "confidence-interval solution should preserve one of ('0.166'",
            "confidence-interval solution should preserve one of ('cannotdetermine'",
            "confidence-interval solution should preserve one of ('95%islessthan99%'",
            "confidence-interval solution should preserve one of ('0.707'",
        ],
    },
    "real-specialist-confidence-intervals-live-escaped-currency": {
        "assert": assert_real_specialist_confidence_intervals_call,
        "call": local_real_specialist_confidence_intervals_live_escaped_currency_call,
        "expectedIssues": ["contains malformed escaped dollar inside maths"],
    },
    "real-specialist-confidence-intervals-live-relative-wording": {
        "assert": assert_real_specialist_confidence_intervals_call,
        "call": local_real_specialist_confidence_intervals_live_relative_confidence_wording_call,
    },
    "real-specialist-confidence-intervals-live-empty-table-placeholders": {
        "assert": assert_real_specialist_confidence_intervals_call,
        "call": local_real_specialist_confidence_intervals_live_empty_table_placeholders_call,
        "expectedIssues": [
            "empty table placeholder and should be omitted",
            "empty table list and should be omitted",
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
    "real-specialist-slope-field-missing-highlighted-points": {
        "assert": assert_real_specialist_slope_field_call,
        "call": local_real_specialist_slope_field_missing_highlighted_points_call,
        "expectedIssues": [
            "slopeField.highlightedPoints should include the requested point (0.5, -1)",
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
    "real-specialist-slope-field-live-sqrt-solution-branch": {
        "assert": assert_real_specialist_slope_field_call,
        "call": local_real_specialist_slope_field_live_sqrt_solution_branch_call,
        "expectedIssues": [
            "slope-field graph2d.functions should include the solution-curve relation or completed solution diagram",
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
    "real-specialist-argand-compact-polar-grid": {
        "assert": assert_real_specialist_argand_call,
        "call": local_real_specialist_argand_compact_polar_grid_call,
    },
    "real-specialist-argand-bad-shifted-arg": {
        "assert": assert_real_specialist_argand_call,
        "call": local_real_specialist_argand_bad_shifted_arg_call,
        "expectedIssues": [
            "official Arg(z) bounds",
        ],
    },
    "real-specialist-argand-missing-argument-rays": {
        "assert": assert_real_specialist_argand_call,
        "call": local_real_specialist_argand_missing_argument_rays_call,
        "expectedIssues": [
            "Arg(z) boundary rays",
        ],
    },
    "real-specialist-argand-full-line-argument-boundaries": {
        "assert": assert_real_specialist_argand_call,
        "call": local_real_specialist_argand_full_line_argument_boundaries_call,
        "expectedIssues": [
            "Arg(z) boundary rays",
        ],
    },
    "real-specialist-argand-origin-circle": {
        "assert": assert_real_specialist_argand_call,
        "call": local_real_specialist_argand_origin_circle_call,
        "expectedIssues": [
            "shifted circle centre i",
            "circle centred at the origin",
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
    "real-specialist-spherical-cap-bad-solid-fields": {
        "assert": assert_real_specialist_spherical_cap_call,
        "call": local_real_specialist_spherical_cap_bad_solid_fields_call,
        "expectedIssues": [
            "sphereCap[0] should include center",
            "sphereCap[0] should include axis or normal",
            "sphereCap[0] should include a positive height/depth",
            "sphereCap[0].radius should preserve source radius 10",
        ],
    },
    "real-specialist-spherical-cap-missing-cross-section": {
        "assert": assert_real_specialist_spherical_cap_call,
        "call": local_real_specialist_spherical_cap_missing_cross_section_call,
        "expectedIssues": [
            "cross-section should use graph2d",
        ],
    },
    "real-specialist-spherical-cap-live-polygon-shading": {
        "assert": assert_real_specialist_spherical_cap_call,
        "call": local_real_specialist_spherical_cap_live_polygon_shading_call,
        "expectedIssues": [
            "shaded generating region",
            "feature kind 'polygon' is not supported",
            "features[0].points",
            "features[0].fillColor",
            "features[0].strokeColor",
            "feature kind 'free_label' is not supported",
            "features[2].coords",
        ],
    },
    "real-specialist-spherical-cap-live-region-alias": {
        "assert": assert_real_specialist_spherical_cap_call,
        "call": local_real_specialist_spherical_cap_live_region_alias_call,
        "expectedIssues": [
            "shaded generating region",
            "feature kind 'region_between' is not supported",
            "features[0].functionIndex1",
            "features[0].functionIndex2",
            "features[0].domainMin",
            "features[0].domainMax",
            "features[0].opacity",
        ],
    },
    "real-specialist-spherical-cap-missing-graph3d-h-label": {
        "assert": assert_real_specialist_spherical_cap_call,
        "call": local_real_specialist_spherical_cap_missing_graph3d_h_label_call,
        "expectedIssues": [
            "graph3d diagram should preserve the visible depth label h",
        ],
    },
    "real-specialist-spherical-cap-live-graph3d-visible-alias": {
        "assert": assert_real_specialist_spherical_cap_call,
        "call": local_real_specialist_spherical_cap_live_graph3d_visible_alias_call,
        "expectedIssues": [
            "data.points[0].visible",
            "data.segments[0].visible",
            "data.solids[0].visible",
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
    "real-specialist-prism-bad-metadata-size": {
        "assert": assert_real_specialist_prism_call,
        "call": local_real_specialist_prism_bad_metadata_size_call,
        "expectedIssues": [
            "metadata should not include unsupported widthPx",
            "metadata should not include unsupported heightPx",
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
    "real-specialist-prism-bad-latex-artifact": {
        "assert": assert_real_specialist_prism_call,
        "call": local_real_specialist_prism_bad_latex_artifact_call,
        "expectedIssues": [
            "contains malformed escaped dollar inside maths",
        ],
    },
    "real-specialist-prism-control-character-notation": {
        "assert": assert_real_specialist_prism_call,
        "call": local_real_specialist_prism_control_character_notation_call,
        "expectedIssues": [
            "contains control character U+007F",
        ],
    },
    "real-specialist-prism-bad-line-notation": {
        "assert": assert_real_specialist_prism_call,
        "call": local_real_specialist_prism_bad_line_notation_call,
        "expectedIssues": [
            "label for line BT should not use directed vector/ray notation",
            "label for line AM should not use directed vector/ray notation",
            "part (a) should preserve main diagonal line BT notation",
            "part (c) should preserve line AM notation",
            "part (c) should preserve line BT notation",
        ],
    },
    "real-specialist-square-pyramid": {
        "assert": assert_real_specialist_square_pyramid_call,
        "call": local_real_specialist_square_pyramid_call,
    },
    "real-specialist-square-pyramid-bad-midpoints": {
        "assert": assert_real_specialist_square_pyramid_call,
        "call": local_real_specialist_square_pyramid_bad_midpoints_call,
        "expectedIssues": [
            "point F should be midpoint of A and B",
            "point M should be midpoint of E and F",
        ],
    },
    "real-specialist-square-pyramid-missing-angle-segment": {
        "assert": assert_real_specialist_square_pyramid_call,
        "call": local_real_specialist_square_pyramid_missing_angle_segment_call,
        "expectedIssues": [
            "segment DM",
        ],
    },
    "real-specialist-square-pyramid-missing-midpoint-angle-ray": {
        "assert": assert_real_specialist_square_pyramid_call,
        "call": local_real_specialist_square_pyramid_missing_midpoint_angle_ray_call,
        "expectedIssues": [
            "segment FM",
        ],
    },
    "real-specialist-square-pyramid-live-midpoint-construction-missing-fm": {
        "assert": assert_real_specialist_square_pyramid_call,
        "call": local_real_specialist_square_pyramid_live_midpoint_construction_missing_fm_call,
        "expectedIssues": [
            "segment FM",
        ],
    },
    "real-specialist-square-pyramid-bad-top-view-geometry": {
        "assert": assert_real_specialist_square_pyramid_call,
        "call": local_real_specialist_square_pyramid_bad_top_view_geometry_call,
        "expectedIssues": [
            "top-view graph2d should include segment CA",
            "top-view graph2d point F should be midpoint of A and B",
            "top-view graph2d point M should be midpoint of E and F",
        ],
    },
    "real-specialist-square-pyramid-short-top-view-vector-rays": {
        "assert": assert_real_specialist_square_pyramid_call,
        "call": local_real_specialist_square_pyramid_short_top_view_vector_rays_call,
    },
    "real-specialist-square-pyramid-live-missing-faces-labels": {
        "assert": assert_real_specialist_square_pyramid_call,
        "call": local_real_specialist_square_pyramid_live_missing_faces_labels_call,
        "expectedIssues": [
            "segment FM",
            "pyramid faces",
            "vector labels a and b",
        ],
    },
    "real-specialist-square-pyramid-live-duplicate-missing-fm": {
        "assert": assert_real_specialist_square_pyramid_call,
        "call": local_real_specialist_square_pyramid_live_duplicate_missing_fm_call,
        "expectedIssues": [
            "either diagram or diagrams",
            "segment FM",
            "pyramid faces",
        ],
    },
    "real-specialist-square-pyramid-live-unattached-vector-labels": {
        "assert": assert_real_specialist_square_pyramid_call,
        "call": local_real_specialist_square_pyramid_live_unattached_vector_labels_call,
        "expectedIssues": [
            "segment EF",
            "vector a ray from O toward A",
            "vector b ray from O toward B",
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
    "graph3d-general-solids-missing-dimensions-render-style": {
        "assert": assert_graph3d_general_solids_call,
        "call": local_graph3d_general_solids_missing_dimensions_render_style_call,
        "expectedIssues": [
            "renderStyle surface, wireframe, or outline",
            "labelled h dimension",
            "labelled r dimension",
        ],
    },
    "graph3d-general-solids-bad-solid-fields": {
        "assert": assert_graph3d_general_solids_call,
        "call": local_graph3d_general_solids_bad_solid_fields_call,
        "expectedIssues": [
            "cone[0] should include baseCenter",
            "cone[0] should include apex or height",
            "cone solid should include a positive radius",
            "cylinder[0] should include baseCenter",
            "cylinder[0] should include topCenter or height",
            "cylinder solid should include a positive radius",
            "sphere[0] should include center",
            "sphere solid should include a positive radius",
        ],
    },
    "graph3d-general-solids-face-vertices-alias": {
        "assert": assert_graph3d_general_solids_call,
        "call": local_graph3d_general_solids_face_vertices_alias_call,
        "expectedIssues": [
            "faces should use points, not vertices",
        ],
    },
    "graph3d-general-solids-raw-aliases": {
        "assert": assert_graph3d_general_solids_call,
        "call": local_graph3d_general_solids_raw_aliases_call,
        "expectedIssues": [
            "segments should use data.segments, not data.edges",
            "dimension lines should use data.dimensions, not data.dimensionLines",
            "curved solids should use data.solids, not data.surfaces",
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
    "real-specialist-implicit-bad-schema": {
        "assert": assert_real_specialist_implicit_call,
        "call": local_real_specialist_implicit_bad_schema_call,
        "expectedIssues": [
            "kind:'relation'",
            "unsupported axisLabels",
            "unsupported gridStep",
        ],
    },
    "real-specialist-implicit-bad-points": {
        "assert": assert_real_specialist_implicit_call,
        "call": local_real_specialist_implicit_bad_points_call,
        "expectedIssues": [
            "point A near",
            "point B near",
        ],
    },
    "real-specialist-implicit-bad-rounding": {
        "assert": assert_real_specialist_implicit_call,
        "call": local_real_specialist_implicit_bad_rounding_call,
        "expectedIssues": [
            "solution should preserve '-0.475'",
        ],
    },
    "real-specialist-ski-modelling": {
        "assert": assert_real_specialist_ski_modelling_call,
        "call": local_real_specialist_ski_modelling_call,
    },
    "real-specialist-ski-modelling-bad-graph": {
        "assert": assert_real_specialist_ski_modelling_call,
        "call": local_real_specialist_ski_modelling_bad_graph_call,
        "expectedIssues": [
            "ski-modelling graph2d should include at least three visible source curves",
            "ski-modelling graph2d should encode the ramp descent",
            "ski-modelling graph2d should encode the sloped ground",
            "ski-modelling graph2d should encode the Cartesian flight curve",
            "point $E$ near",
            "landing point near",
        ],
    },
    "real-specialist-ski-modelling-bad-domains": {
        "assert": assert_real_specialist_ski_modelling_call,
        "call": local_real_specialist_ski_modelling_bad_domains_call,
        "expectedIssues": [
            "ski-modelling graph2d should encode the ramp descent over",
            "ski-modelling graph2d should encode the sloped ground",
            "ski-modelling graph2d should encode the Cartesian flight curve over",
            "ski-modelling graph2d should preserve large source axes/bounds",
            "ski-modelling graph2d should include landing point near",
        ],
    },
    "real-specialist-ski-modelling-bad-solution": {
        "assert": assert_real_specialist_ski_modelling_call,
        "call": local_real_specialist_ski_modelling_bad_solution_call,
        "expectedIssues": [
            "ski-modelling solution should preserve one of ('22.07'",
            "ski-modelling solution should preserve one of ('s=4.8'",
            "ski-modelling solution should preserve one of ('5.58'",
            "ski-modelling solution should preserve one of ('22.5'",
        ],
    },
}

LOCAL_EVAL_GROUPS: dict[str, list[str]] = {
    "local": list(LOCAL_EVAL_CASES),
    "local-real-exams-extended": list(LOCAL_EVAL_CASES),
    "local-real-exams-graph3d": [
        "real-specialist-spherical-cap",
        "real-specialist-prism",
        "real-specialist-square-pyramid",
        "graph3d-general-solids",
    ],
    "local-real-exams-preview": [
        "screenshot-scalar-products",
        "real-methods-ev-histogram",
        "real-specialist-stats",
        "real-specialist-confidence-intervals",
        "real-specialist-slope-field",
        "real-specialist-argand",
        "real-specialist-argand-compact-polar-grid",
        "real-specialist-spherical-cap",
        "real-specialist-prism",
        "real-specialist-square-pyramid",
        "graph3d-general-solids",
        "real-specialist-implicit",
        "real-specialist-ski-modelling",
    ],
    "local-graph3d-general": [
        "real-specialist-spherical-cap",
        "real-specialist-prism",
        "real-specialist-square-pyramid",
        "graph3d-general-solids",
    ],
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
) -> tuple[int, float, int, int, list[str]]:
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
        return 2, 0.0, 0, 0, []
    first_calls = [as_dict(call) for call in first.get("toolCalls", [])]
    total_cost = usage_cost(first.get("usage"))
    total_tokens = usage_tokens(first.get("usage"))

    print_provider_response("First response", first, first_calls, verbose=verbose)

    if len(first_calls) != 1:
        issue = f"expected exactly one tool call, got {len(first_calls)}"
        print(f"FAIL: {issue}", file=sys.stderr)
        return 1, total_cost, total_tokens, 0, [issue]

    repair_failure = case.get("repairFailure")
    if callable(repair_failure):
        if case.get("assertFirstBeforeRepair"):
            first_issues = assert_call(first_calls[0])
            if first_issues:
                print("FAIL:")
                for issue in first_issues:
                    print(f"- {issue}")
                return 1, total_cost, total_tokens, 0, first_issues
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
            return 2, total_cost, total_tokens, 1, []
        second_calls = [as_dict(call) for call in second.get("toolCalls", [])]
        total_cost += usage_cost(second.get("usage"))
        total_tokens += usage_tokens(second.get("usage"))
        print_provider_response("Repair response", second, second_calls, verbose=verbose)

        if len(second_calls) != 1:
            issue = f"expected exactly one repair tool call, got {len(second_calls)}"
            print(f"FAIL: {issue}", file=sys.stderr)
            return 1, total_cost, total_tokens, 1, [issue]

        repair_assert = case.get("repairAssert", assert_call)
        repair_issues = repair_assert(second_calls[0])
        if repair_issues:
            print("FAIL:")
            for issue in repair_issues:
                print(f"- {issue}")
            return 1, total_cost, total_tokens, 1, repair_issues

        print(f"PASS: {case_name} repaired successfully. Estimated total: ${total_cost:.4f}, {total_tokens:,} tokens.")
        return 0, total_cost, total_tokens, 1, []

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
            return 2, total_cost, total_tokens, 1, issues
        second_calls = [as_dict(call) for call in second.get("toolCalls", [])]
        total_cost += usage_cost(second.get("usage"))
        total_tokens += usage_tokens(second.get("usage"))
        print_provider_response("Repair response", second, second_calls, verbose=verbose)

        if len(second_calls) != 1:
            issue = f"expected exactly one repair tool call, got {len(second_calls)}"
            print(f"FAIL: {issue}", file=sys.stderr)
            return 1, total_cost, total_tokens, 1, [*issues, issue]

        repair_issues = assert_call(second_calls[0])
        if repair_issues:
            print("FAIL:")
            for issue in repair_issues:
                print(f"- {issue}")
            return 1, total_cost, total_tokens, 1, [*issues, *repair_issues]

        print(f"PASS: {case_name} repaired successfully. Estimated total: ${total_cost:.4f}, {total_tokens:,} tokens.")
        return 0, total_cost, total_tokens, 1, issues

    if issues:
        print("FAIL:")
        for issue in issues:
            print(f"- {issue}")
        return 1, total_cost, total_tokens, 0, issues

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
            return 2, total_cost, total_tokens, 0, []
        second_calls = [as_dict(call) for call in second.get("toolCalls", [])]
        total_cost += usage_cost(second.get("usage"))
        total_tokens += usage_tokens(second.get("usage"))
        print_provider_response("Final response", second, second_calls, verbose=verbose)
        if second_calls:
            print("FAIL: final response should not need another tool call.", file=sys.stderr)
            return 1, total_cost, total_tokens, 0, ["final response should not need another tool call"]
        if not str(second.get("message") or "").strip():
            print("FAIL: final response should contain a teacher-facing summary.", file=sys.stderr)
            return 1, total_cost, total_tokens, 0, ["final response should contain a teacher-facing summary"]

    print(f"PASS: {case_name} succeeded. Estimated total: ${total_cost:.4f}, {total_tokens:,} tokens.")
    return 0, total_cost, total_tokens, 0, []


async def run_eval(
    case_name: str = "circle-question",
    model: str | None = None,
    final_message: bool = False,
    max_cost: float = 1.5,
    max_cases: int | None = None,
    case_cost_cap: float = DEFAULT_LIVE_CASE_COST_CAP,
    provider_instruction_char_cap: int = DEFAULT_PROVIDER_INSTRUCTION_CHAR_CAP,
    provider_tool_schema_char_cap: int = DEFAULT_PROVIDER_TOOL_SCHEMA_CHAR_CAP,
    provider_input_char_cap: int = DEFAULT_PROVIDER_INPUT_CHAR_CAP,
    provider_image_pixel_cap: int = DEFAULT_PROVIDER_IMAGE_PIXEL_CAP,
    stop_on_failure: bool = False,
    verbose: bool = False,
    cost_ledger_path: Path | None = DEFAULT_COST_LEDGER_PATH,
    select_stale_canaries: bool = False,
    stale_days: int = 14,
) -> int:
    if not assistant_configured():
        print("OPENAI_API_KEY is not configured; live eval skipped.", file=sys.stderr)
        return 2

    benchmark_index = benchmark_manifest_index()
    selected_cases = selected_live_cases(case_name)
    selected_cases, canary_decisions = maybe_select_stale_canaries(
        selected_cases,
        enabled=select_stale_canaries,
        cost_ledger_path=cost_ledger_path,
        stale_days=stale_days,
        benchmark_index=benchmark_index,
    )
    if select_stale_canaries:
        print("STALE CANARY SELECTION:")
        for decision in canary_decisions:
            print(f"- {decision['decision']} {decision['case']} ({decision['family']}): {decision['reason']}")
        if not selected_cases:
            print("No stale paid canaries selected. All selected renderer families have recent passing live runs.")
            return 0
    total_cost = 0.0
    total_tokens = 0
    failed = False
    blocked = False
    results: list[tuple[str, int, float, int, int, list[str]]] = []
    for index, selected_case in enumerate(selected_cases):
        if max_cases is not None and index >= max_cases:
            print(f"\nSTOP: max case limit reached before {selected_case}. Limit: {max_cases}.")
            break
        if total_cost >= max_cost:
            print(f"\nSTOP: estimated cost cap reached before {selected_case}. Cap: ${max_cost:.2f}.")
            break
        shape = provider_request_shape_for_case(selected_case, model=model)
        instruction_chars = shape.get("instructionChars")
        if (
            isinstance(instruction_chars, int)
            and provider_instruction_char_cap > 0
            and instruction_chars > provider_instruction_char_cap
        ):
            print(
                f"\nBLOCKED: {selected_case} provider instructions are {instruction_chars:,} chars, "
                f"above the {provider_instruction_char_cap:,} char cap. Run the cost plan and narrow brain context first.",
                file=sys.stderr,
            )
            append_cost_ledger(
                cost_ledger_path,
                cost_ledger_record(
                    requested_case=case_name,
                    case_name=selected_case,
                    status=2,
                    cost=0.0,
                    tokens=0,
                    repair_count=0,
                    model=model,
                    shape=shape,
                    benchmark_index=benchmark_index,
                    reason="provider instruction char cap",
                ),
            )
            results.append((selected_case, 2, 0.0, 0, 0, []))
            blocked = True
            break
        tool_schema_chars = shape.get("toolSchemaChars")
        if (
            isinstance(tool_schema_chars, int)
            and provider_tool_schema_char_cap > 0
            and tool_schema_chars > provider_tool_schema_char_cap
        ):
            print(
                f"\nBLOCKED: {selected_case} provider tool schema is {tool_schema_chars:,} chars, "
                f"above the {provider_tool_schema_char_cap:,} char cap. Run the cost plan and narrow the tool surface first.",
                file=sys.stderr,
            )
            append_cost_ledger(
                cost_ledger_path,
                cost_ledger_record(
                    requested_case=case_name,
                    case_name=selected_case,
                    status=2,
                    cost=0.0,
                    tokens=0,
                    repair_count=0,
                    model=model,
                    shape=shape,
                    benchmark_index=benchmark_index,
                    reason="provider tool schema char cap",
                ),
            )
            results.append((selected_case, 2, 0.0, 0, 0, []))
            blocked = True
            break
        input_chars = shape.get("inputChars")
        if isinstance(input_chars, int) and provider_input_char_cap > 0 and input_chars > provider_input_char_cap:
            print(
                f"\nBLOCKED: {selected_case} provider input is {input_chars:,} chars, "
                f"above the {provider_input_char_cap:,} char cap. Run the cost plan and shrink source attachments first.",
                file=sys.stderr,
            )
            append_cost_ledger(
                cost_ledger_path,
                cost_ledger_record(
                    requested_case=case_name,
                    case_name=selected_case,
                    status=2,
                    cost=0.0,
                    tokens=0,
                    repair_count=0,
                    model=model,
                    shape=shape,
                    benchmark_index=benchmark_index,
                    reason="provider input char cap",
                ),
            )
            results.append((selected_case, 2, 0.0, 0, 0, []))
            blocked = True
            break
        provider_image_pixels = provider_image_pixels_for_shape(shape)
        if provider_image_pixel_cap > 0 and provider_image_pixels > provider_image_pixel_cap:
            print(
                f"\nBLOCKED: {selected_case} provider image payload is {provider_image_pixels:,} pixels, "
                f"above the {provider_image_pixel_cap:,} pixel cap. Crop/split/downscale attachments first.",
                file=sys.stderr,
            )
            append_cost_ledger(
                cost_ledger_path,
                cost_ledger_record(
                    requested_case=case_name,
                    case_name=selected_case,
                    status=2,
                    cost=0.0,
                    tokens=0,
                    repair_count=0,
                    model=model,
                    shape=shape,
                    benchmark_index=benchmark_index,
                    reason="provider image pixel cap",
                ),
            )
            results.append((selected_case, 2, 0.0, 0, 0, []))
            blocked = True
            break
        status, cost, tokens, repair_count, first_issues = await run_single_eval(
            selected_case, model=model, final_message=final_message, verbose=verbose
        )
        total_cost += cost
        total_tokens += tokens
        append_cost_ledger(
            cost_ledger_path,
            cost_ledger_record(
                requested_case=case_name,
                case_name=selected_case,
                status=status,
                cost=cost,
                tokens=tokens,
                repair_count=repair_count,
                model=model,
                shape=shape,
                benchmark_index=benchmark_index,
                first_issues=first_issues,
            ),
        )
        results.append((selected_case, status, cost, tokens, repair_count, first_issues))
        failed = failed or status == 1
        blocked = blocked or status == 2
        if status == 2:
            print("\nSTOP: provider blocked the live eval; remaining cases were skipped.")
            break
        if failed and stop_on_failure:
            break
        if cost >= case_cost_cap:
            print(f"\nSTOP: {selected_case} cost ${cost:.4f}, above the per-case spike stop ${case_cost_cap:.2f}.")
            break
    print("\nSUMMARY:")
    for selected_case, status, cost, tokens, repair_count, first_issues in results:
        label = "PASS" if status == 0 else "BLOCKED" if status == 2 else "FAIL"
        repair_label = f", repairs={repair_count}" if repair_count else ""
        issue_label = f", firstIssues={len(first_issues)}" if first_issues else ""
        print(f"- {label} {selected_case}: ${cost:.4f}, {tokens:,} tokens{repair_label}{issue_label}")
    print(f"\nTOTAL: ${total_cost:.4f}, {total_tokens:,} tokens.")
    if cost_ledger_path is not None and results:
        print(f"COST LEDGER: {cost_ledger_path}")
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
        "--list-cases",
        action="store_true",
        help="Print assistant tool/eval taxonomy, live groups, local groups, and case classifications as JSON.",
    )
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
    parser.add_argument(
        "--case-cost-cap",
        type=float,
        default=DEFAULT_LIVE_CASE_COST_CAP,
        help="Stop a paid live eval group after any single case costs at least this much.",
    )
    parser.add_argument(
        "--provider-instruction-char-cap",
        type=int,
        default=DEFAULT_PROVIDER_INSTRUCTION_CHAR_CAP,
        help="Block planned/paid cases whose provider instructions exceed this many characters. Use 0 to disable.",
    )
    parser.add_argument(
        "--provider-tool-schema-char-cap",
        type=int,
        default=DEFAULT_PROVIDER_TOOL_SCHEMA_CHAR_CAP,
        help="Block planned/paid cases whose exposed tool schema exceeds this many characters. Use 0 to disable.",
    )
    parser.add_argument(
        "--provider-input-char-cap",
        type=int,
        default=DEFAULT_PROVIDER_INPUT_CHAR_CAP,
        help="Block planned/paid cases whose provider input JSON exceeds this many characters. Use 0 to disable.",
    )
    parser.add_argument(
        "--provider-image-pixel-cap",
        type=int,
        default=DEFAULT_PROVIDER_IMAGE_PIXEL_CAP,
        help="Block planned/paid cases whose provider image payload exceeds this many pixels. Use 0 to disable.",
    )
    parser.add_argument(
        "--image-max-long-edge",
        type=int,
        default=None,
        help=(
            "Override ASSISTANT_IMAGE_MAX_LONG_EDGE for provider image optimisation in this eval. "
            "Use 0 to disable downscaling."
        ),
    )
    parser.add_argument(
        "--max-cases",
        type=int,
        default=None,
        help="Maximum number of live provider cases to run from the selected group.",
    )
    parser.add_argument(
        "--cost-plan",
        action="store_true",
        help="Print the planned paid cases, caps, benchmark links, and no-cost gates without calling the provider.",
    )
    parser.add_argument(
        "--cost-report",
        action="store_true",
        help="Rank selected cases by paid ledger cost, token use, repair count, and local regression coverage.",
    )
    parser.add_argument(
        "--allow-paid",
        action="store_true",
        help="Actually call the provider for live evals. Without this flag, live evals print a cost plan only.",
    )
    parser.add_argument(
        "--cost-ledger",
        default=str(DEFAULT_COST_LEDGER_PATH),
        help=(
            "JSONL file used to record paid live eval costs and pass/fail status. "
            "Defaults to the sibling mauth-workbench folder."
        ),
    )
    parser.add_argument(
        "--no-cost-ledger",
        action="store_true",
        help="Do not read or write the paid live eval cost ledger.",
    )
    parser.add_argument(
        "--select-stale-canaries",
        action="store_true",
        help="From the selected live group, run at most one stale or failing paid case per renderer family.",
    )
    parser.add_argument(
        "--stale-days",
        type=int,
        default=14,
        help="A passing paid canary older than this many days is considered stale.",
    )
    parser.add_argument("--stop-on-failure", action="store_true", help="Stop after the first failed case.")
    parser.add_argument("--verbose", action="store_true", help="Print full provider tool payloads.")
    raw_args = [arg for arg in sys.argv[1:] if arg != "--"]
    args = parser.parse_args(raw_args)
    if args.image_max_long_edge is not None and args.image_max_long_edge < 0:
        parser.error("--image-max-long-edge must be greater than or equal to 0")
    for cap_name in (
        "provider_instruction_char_cap",
        "provider_tool_schema_char_cap",
        "provider_input_char_cap",
        "provider_image_pixel_cap",
    ):
        if getattr(args, cap_name) < 0:
            parser.error(f"--{cap_name.replace('_', '-')} must be greater than or equal to 0")
    if args.stale_days < 0:
        parser.error("--stale-days must be greater than or equal to 0")
    cost_ledger_path = None
    if not args.no_cost_ledger and str(args.cost_ledger).strip():
        cost_ledger_path = Path(str(args.cost_ledger)).expanduser()
        if not cost_ledger_path.is_absolute():
            cost_ledger_path = (ROOT / cost_ledger_path).resolve()
    apply_image_max_long_edge_override(args.image_max_long_edge)
    if args.list_cases:
        return list_eval_taxonomy()
    if args.dump_local_calls:
        return dump_local_calls(case_name=args.case)
    if args.cost_report:
        return print_cost_report(args.case, cost_ledger_path=cost_ledger_path, max_cases=args.max_cases)
    if args.local:
        return run_local_eval(case_name=args.case, verbose=args.verbose)
    if args.cost_plan or not args.allow_paid:
        return print_cost_plan(
            args.case,
            model=args.model,
            max_cost=args.max_cost,
            max_cases=args.max_cases,
            case_cost_cap=args.case_cost_cap,
            provider_instruction_char_cap=args.provider_instruction_char_cap,
            provider_tool_schema_char_cap=args.provider_tool_schema_char_cap,
            provider_input_char_cap=args.provider_input_char_cap,
            provider_image_pixel_cap=args.provider_image_pixel_cap,
            paid_enabled=args.allow_paid and not args.cost_plan,
            cost_ledger_path=cost_ledger_path,
            select_stale_canaries=args.select_stale_canaries,
            stale_days=args.stale_days,
        )
    return asyncio.run(
        run_eval(
            case_name=args.case,
            model=args.model,
            final_message=args.final,
            max_cost=args.max_cost,
            max_cases=args.max_cases,
            case_cost_cap=args.case_cost_cap,
            provider_instruction_char_cap=args.provider_instruction_char_cap,
            provider_tool_schema_char_cap=args.provider_tool_schema_char_cap,
            provider_input_char_cap=args.provider_input_char_cap,
            provider_image_pixel_cap=args.provider_image_pixel_cap,
            stop_on_failure=args.stop_on_failure,
            verbose=args.verbose,
            cost_ledger_path=cost_ledger_path,
            select_stale_canaries=args.select_stale_canaries,
            stale_days=args.stale_days,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
