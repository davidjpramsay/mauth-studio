#!/usr/bin/env python3
"""Preflight local assistant attachments before spending provider credits."""

from __future__ import annotations

import argparse
import json
import mimetypes
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "apps" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.models.schemas import AssistantAttachment  # noqa: E402
from app.services.openai_assistant import (  # noqa: E402
    assistant_attachment_payload_stats,
    attachment_data_url,
)

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
PDF_SUFFIXES = {".pdf"}
DEFAULT_PROVIDER_IMAGE_PIXEL_CAP = 1_600_000
DEFAULT_PDF_PAGE_CAP = 1


def byte_label(value: int) -> str:
    units = ["B", "KB", "MB", "GB"]
    size = float(max(0, value))
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024
    return f"{int(value)} B"


def supported_file(path: Path) -> bool:
    return path.suffix.lower() in IMAGE_SUFFIXES | PDF_SUFFIXES


def iter_source_files(paths: list[Path], recursive: bool) -> list[Path]:
    files: list[Path] = []
    for path in paths:
        expanded = path.expanduser()
        if expanded.is_file() and supported_file(expanded):
            files.append(expanded)
        elif expanded.is_dir():
            iterator = expanded.rglob("*") if recursive else expanded.iterdir()
            files.extend(item for item in iterator if item.is_file() and supported_file(item))
    return sorted(dict.fromkeys(files))


def mime_type_for_image(path: Path) -> str:
    guessed, _ = mimetypes.guess_type(path.name)
    if guessed in {"image/png", "image/jpeg", "image/webp"}:
        return guessed
    if path.suffix.lower() == ".webp":
        return "image/webp"
    if path.suffix.lower() == ".png":
        return "image/png"
    return "image/jpeg"


def image_report(path: Path, provider_image_pixel_cap: int) -> dict[str, Any]:
    payload = path.read_bytes()
    attachment = AssistantAttachment(
        id=path.stem,
        name=path.name,
        mimeType=mime_type_for_image(path),
        dataUrl=attachment_data_url(mime_type_for_image(path), payload),
        sizeBytes=len(payload),
    )
    stats = assistant_attachment_payload_stats([attachment])
    provider_pixels = int(stats.get("providerImagePixels") or 0)
    raw_pixels = int(stats.get("rawImagePixels") or 0)
    provider_bytes = int(stats.get("providerAttachmentBytes") or 0)
    raw_bytes = int(stats.get("rawAttachmentBytes") or len(payload))
    return {
        "kind": "image",
        "path": str(path),
        "rawBytes": raw_bytes,
        "providerBytes": provider_bytes,
        "rawImagePixels": raw_pixels,
        "providerImagePixels": provider_pixels,
        "rawImageMaxLongEdge": int(stats.get("rawImageMaxLongEdge") or 0),
        "providerImageMaxLongEdge": int(stats.get("providerImageMaxLongEdge") or 0),
        "optimized": bool(stats.get("optimizedAttachmentCount")),
        "imageDetail": stats.get("imageDetail"),
        "imageMaxLongEdge": stats.get("imageMaxLongEdge"),
        "imageTrimBorders": stats.get("imageTrimBorders"),
        "overProviderImagePixelCap": provider_image_pixel_cap > 0 and provider_pixels > provider_image_pixel_cap,
    }


def pdf_page_count(path: Path) -> int | None:
    try:
        process = subprocess.run(
            ["pdfinfo", str(path)],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if process.returncode != 0:
        return None
    for line in process.stdout.splitlines():
        if line.lower().startswith("pages:"):
            _, _, value = line.partition(":")
            try:
                return int(value.strip())
            except ValueError:
                return None
    return None


def pdf_report(path: Path, pdf_page_cap: int) -> dict[str, Any]:
    pages = pdf_page_count(path)
    should_select_pages = pages is None or (pdf_page_cap > 0 and pages > pdf_page_cap)
    return {
        "kind": "pdf",
        "path": str(path),
        "rawBytes": path.stat().st_size,
        "pages": pages,
        "overPdfPageCap": isinstance(pages, int) and pdf_page_cap > 0 and pages > pdf_page_cap,
        "recommendation": (
            "Select or crop the relevant page/question before a paid assistant run."
            if should_select_pages
            else "Single-page PDF is suitable for a focused preflight."
        ),
    }


def build_report(
    paths: list[Path], recursive: bool, max_files: int, provider_image_pixel_cap: int, pdf_page_cap: int
) -> dict[str, Any]:
    files = iter_source_files(paths, recursive=recursive)
    if max_files > 0:
        files = files[:max_files]
    items: list[dict[str, Any]] = []
    for path in files:
        suffix = path.suffix.lower()
        if suffix in IMAGE_SUFFIXES:
            items.append(image_report(path, provider_image_pixel_cap))
        elif suffix in PDF_SUFFIXES:
            items.append(pdf_report(path, pdf_page_cap))

    image_items = [item for item in items if item["kind"] == "image"]
    pdf_items = [item for item in items if item["kind"] == "pdf"]
    return {
        "summary": {
            "filesScanned": len(items),
            "images": len(image_items),
            "pdfs": len(pdf_items),
            "providerImagePixelCap": provider_image_pixel_cap,
            "pdfPageCap": pdf_page_cap,
            "rawImagePixels": sum(int(item.get("rawImagePixels") or 0) for item in image_items),
            "providerImagePixels": sum(int(item.get("providerImagePixels") or 0) for item in image_items),
            "rawImageBytes": sum(int(item.get("rawBytes") or 0) for item in image_items),
            "providerImageBytes": sum(int(item.get("providerBytes") or 0) for item in image_items),
            "overProviderImagePixelCap": sum(1 for item in image_items if item.get("overProviderImagePixelCap")),
            "pdfsOverPageCap": sum(1 for item in pdf_items if item.get("overPdfPageCap")),
            "pdfBytes": sum(int(item.get("rawBytes") or 0) for item in pdf_items),
            "pdfPages": sum(int(item.get("pages") or 0) for item in pdf_items),
        },
        "items": items,
    }


def print_human_report(report: dict[str, Any], limit: int) -> None:
    summary = report["summary"]
    print("ASSISTANT ATTACHMENT PREFLIGHT")
    print(f"- files scanned: {summary['filesScanned']} ({summary['images']} images, {summary['pdfs']} PDFs)")
    print(
        "- image payload: "
        f"{summary['providerImagePixels']:,}/{summary['rawImagePixels']:,} provider/raw pixels; "
        f"{byte_label(summary['providerImageBytes'])}/{byte_label(summary['rawImageBytes'])} provider/raw bytes"
    )
    print(f"- image pixel cap: {summary['providerImagePixelCap']:,} per file")
    print(f"- images over pixel cap: {summary['overProviderImagePixelCap']}")
    print(f"- PDF payload: {summary['pdfPages']:,} known pages; {byte_label(summary['pdfBytes'])}")
    print(f"- PDFs over page cap: {summary['pdfsOverPageCap']} (cap {summary['pdfPageCap']} page per focused run)")

    image_items = sorted(
        [item for item in report["items"] if item["kind"] == "image"],
        key=lambda item: int(item.get("providerImagePixels") or 0),
        reverse=True,
    )
    if image_items:
        print("- largest provider image payloads:")
        for item in image_items[:limit]:
            marker = " OVER-CAP" if item.get("overProviderImagePixelCap") else ""
            print(
                f"  - {Path(item['path']).name}: {int(item['providerImagePixels']):,}/"
                f"{int(item['rawImagePixels']):,} pixels, "
                f"{byte_label(int(item['providerBytes']))}/{byte_label(int(item['rawBytes']))}{marker}"
            )

    pdf_items = sorted(
        [item for item in report["items"] if item["kind"] == "pdf"],
        key=lambda item: int(item.get("pages") or 0),
        reverse=True,
    )
    if pdf_items:
        print("- largest PDF sources:")
        for item in pdf_items[:limit]:
            pages = item.get("pages") if isinstance(item.get("pages"), int) else "unknown"
            marker = " SELECT-PAGES" if item.get("overPdfPageCap") else ""
            print(f"  - {Path(item['path']).name}: {pages} pages, {byte_label(int(item['rawBytes']))}{marker}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Preflight local files before sending them to the Mauth assistant.")
    parser.add_argument("paths", nargs="+", help="Image/PDF files or directories to scan.")
    parser.add_argument("--no-recursive", action="store_true", help="Do not scan directories recursively.")
    parser.add_argument(
        "--max-files", type=int, default=0, help="Limit scanned files after sorting. Use 0 for no limit."
    )
    parser.add_argument(
        "--provider-image-pixel-cap",
        type=int,
        default=DEFAULT_PROVIDER_IMAGE_PIXEL_CAP,
        help="Flag images whose provider-optimised payload exceeds this many pixels. Use 0 to disable.",
    )
    parser.add_argument(
        "--pdf-page-cap",
        type=int,
        default=DEFAULT_PDF_PAGE_CAP,
        help="Flag PDFs with more than this many pages for focused source conversion. Use 0 to disable.",
    )
    parser.add_argument("--limit", type=int, default=10, help="Number of largest image/PDF rows to print.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    raw_args = [arg for arg in sys.argv[1:] if arg != "--"]
    args = parser.parse_args(raw_args)

    report = build_report(
        [Path(path) for path in args.paths],
        recursive=not args.no_recursive,
        max_files=args.max_files,
        provider_image_pixel_cap=args.provider_image_pixel_cap,
        pdf_page_cap=args.pdf_page_cap,
    )
    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print_human_report(report, limit=max(0, args.limit))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
