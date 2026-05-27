#!/usr/bin/env python3
"""Render selected PDF pages into assistant-ready source crops."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageOps

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "apps" / "api"
WORKBENCH_ROOT = ROOT.parent / "mauth-workbench"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.models.schemas import AssistantAttachment  # noqa: E402
from app.services.openai_assistant import (  # noqa: E402
    assistant_attachment_payload_stats,
    attachment_data_url,
)

DEFAULT_DPI = 180
DEFAULT_MAX_LONG_EDGE = 1400
DEFAULT_TRIM_THRESHOLD = 18
DEFAULT_TRIM_PADDING = 24
DEFAULT_PROVIDER_IMAGE_PIXEL_CAP = 1_600_000


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "source"


def parse_pages(value: str) -> list[int]:
    pages: list[int] = []
    for piece in value.split(","):
        part = piece.strip()
        if not part:
            continue
        if "-" in part:
            start_text, _, end_text = part.partition("-")
            start = int(start_text.strip())
            end = int(end_text.strip())
            if start <= 0 or end <= 0:
                raise ValueError("page numbers must be positive")
            if end < start:
                raise ValueError(f"invalid page range {part!r}")
            pages.extend(range(start, end + 1))
        else:
            page = int(part)
            if page <= 0:
                raise ValueError("page numbers must be positive")
            pages.append(page)
    return sorted(dict.fromkeys(pages))


def parse_box(value: str) -> tuple[float, float, float, float]:
    parts = [float(part.strip()) for part in value.split(",") if part.strip()]
    if len(parts) != 4:
        raise ValueError("crop box must have four comma-separated values")
    left, top, right, bottom = parts
    if right <= left or bottom <= top:
        raise ValueError("crop box right/bottom must be greater than left/top")
    return left, top, right, bottom


def sampled_corner_background(image: Image.Image) -> tuple[int, int, int]:
    width, height = image.size
    corners = [
        image.getpixel((0, 0)),
        image.getpixel((width - 1, 0)),
        image.getpixel((0, height - 1)),
        image.getpixel((width - 1, height - 1)),
    ]
    return tuple(round(sum(int(pixel[channel]) for pixel in corners) / len(corners)) for channel in range(3))


def rgb_image(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image)
    if image.mode in {"RGBA", "LA"} or "transparency" in image.info:
        transparent = image.convert("RGBA")
        background = Image.new("RGBA", transparent.size, (255, 255, 255, 255))
        background.alpha_composite(transparent)
        return background.convert("RGB")
    return image.convert("RGB")


def crop_box_pct(image: Image.Image, box: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    left, top, right, bottom = box
    if min(left, top, right, bottom) < 0 or max(left, top, right, bottom) > 100:
        raise ValueError("percentage crop values must be between 0 and 100")
    return (
        round(image.width * left / 100),
        round(image.height * top / 100),
        round(image.width * right / 100),
        round(image.height * bottom / 100),
    )


def crop_box_px(image: Image.Image, box: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    left, top, right, bottom = (round(value) for value in box)
    if left < 0 or top < 0 or right > image.width or bottom > image.height:
        raise ValueError("pixel crop box must fit inside the rendered page")
    return left, top, right, bottom


def trim_blank_border(
    image: Image.Image,
    *,
    threshold: int,
    padding: int,
) -> tuple[Image.Image, tuple[int, int, int, int] | None]:
    if image.width < 32 or image.height < 32:
        return image, None
    background = Image.new("RGB", image.size, sampled_corner_background(image))
    diff = ImageChops.difference(image, background).convert("L")
    mask = diff.point(lambda value: 255 if value >= threshold else 0)
    bbox = mask.getbbox()
    if not bbox:
        return image, None
    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(image.width, right + padding)
    bottom = min(image.height, bottom + padding)
    if left <= 0 and top <= 0 and right >= image.width and bottom >= image.height:
        return image, None
    if right - left < 32 or bottom - top < 32:
        return image, None
    return image.crop((left, top, right, bottom)), (left, top, right, bottom)


def resize_to_long_edge(image: Image.Image, max_long_edge: int) -> tuple[Image.Image, bool]:
    if max_long_edge <= 0:
        return image, False
    long_edge = max(image.size)
    if long_edge <= max_long_edge:
        return image, False
    scale = max_long_edge / long_edge
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.resize(size, Image.Resampling.LANCZOS), True


def render_pdf_page(pdf_path: Path, page: int, dpi: int, destination: Path) -> None:
    prefix = destination.with_suffix("")
    command = [
        "pdftoppm",
        "-png",
        "-singlefile",
        "-r",
        str(dpi),
        "-f",
        str(page),
        "-l",
        str(page),
        str(pdf_path),
        str(prefix),
    ]
    process = subprocess.run(command, check=False, capture_output=True, text=True, timeout=60)
    if process.returncode != 0:
        detail = (process.stderr or process.stdout or "pdftoppm failed").strip()
        raise RuntimeError(detail)


def image_payload_stats(path: Path, provider_image_pixel_cap: int) -> dict[str, Any]:
    payload = path.read_bytes()
    attachment = AssistantAttachment(
        id=path.stem,
        name=path.name,
        mimeType="image/png",
        dataUrl=attachment_data_url("image/png", payload),
        sizeBytes=len(payload),
    )
    stats = assistant_attachment_payload_stats([attachment])
    provider_pixels = int(stats.get("providerImagePixels") or 0)
    return {
        "rawBytes": int(stats.get("rawAttachmentBytes") or len(payload)),
        "providerBytes": int(stats.get("providerAttachmentBytes") or 0),
        "rawImagePixels": int(stats.get("rawImagePixels") or 0),
        "providerImagePixels": provider_pixels,
        "rawImageMaxLongEdge": int(stats.get("rawImageMaxLongEdge") or 0),
        "providerImageMaxLongEdge": int(stats.get("providerImageMaxLongEdge") or 0),
        "optimized": bool(stats.get("optimizedAttachmentCount")),
        "overProviderImagePixelCap": provider_image_pixel_cap > 0 and provider_pixels > provider_image_pixel_cap,
    }


def process_page(
    *,
    source_pdf: Path,
    page: int,
    output_path: Path,
    dpi: int,
    crop_pct: tuple[float, float, float, float] | None,
    crop_px: tuple[float, float, float, float] | None,
    auto_trim: bool,
    trim_threshold: int,
    trim_padding: int,
    grayscale: bool,
    max_long_edge: int,
    provider_image_pixel_cap: int,
) -> dict[str, Any]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temp_dir:
        rendered_path = Path(temp_dir) / f"page-{page:02d}.png"
        render_pdf_page(source_pdf, page, dpi, rendered_path)
        with Image.open(rendered_path) as source_image:
            image = rgb_image(source_image)

    rendered_size = image.size
    manual_crop_box: tuple[int, int, int, int] | None = None
    if crop_pct is not None:
        manual_crop_box = crop_box_pct(image, crop_pct)
        image = image.crop(manual_crop_box)
    elif crop_px is not None:
        manual_crop_box = crop_box_px(image, crop_px)
        image = image.crop(manual_crop_box)

    trim_box: tuple[int, int, int, int] | None = None
    if auto_trim:
        image, trim_box = trim_blank_border(image, threshold=trim_threshold, padding=trim_padding)

    if grayscale:
        image = ImageOps.grayscale(image)

    image, resized = resize_to_long_edge(image, max_long_edge)
    image.save(output_path, format="PNG", optimize=True)
    stats = image_payload_stats(output_path, provider_image_pixel_cap)
    return {
        "sourcePdf": str(source_pdf),
        "page": page,
        "outputPath": str(output_path),
        "dpi": dpi,
        "renderedWidth": rendered_size[0],
        "renderedHeight": rendered_size[1],
        "outputWidth": image.width,
        "outputHeight": image.height,
        "outputPixels": image.width * image.height,
        "manualCropBox": list(manual_crop_box) if manual_crop_box else None,
        "trimBox": list(trim_box) if trim_box else None,
        "grayscale": grayscale,
        "resized": resized,
        "maxLongEdge": max_long_edge,
        "providerStats": stats,
    }


def byte_label(value: int) -> str:
    units = ["B", "KB", "MB", "GB"]
    size = float(max(0, value))
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024
    return f"{int(value)} B"


def default_output_root(source_pdf: Path, name: str | None) -> Path:
    slug = slugify(name or source_pdf.stem)
    return WORKBENCH_ROOT / "assistant-evals" / slug


def write_manifest(output_root: Path, manifest: dict[str, Any]) -> Path:
    path = output_root / "source-extract-manifest.json"
    output_root.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def print_summary(manifest: dict[str, Any], manifest_path: Path) -> None:
    outputs = manifest["outputs"]
    provider_pixels = sum(int(item["providerStats"].get("providerImagePixels") or 0) for item in outputs)
    raw_pixels = sum(int(item["providerStats"].get("rawImagePixels") or 0) for item in outputs)
    provider_bytes = sum(int(item["providerStats"].get("providerBytes") or 0) for item in outputs)
    raw_bytes = sum(int(item["providerStats"].get("rawBytes") or 0) for item in outputs)
    over_cap = sum(1 for item in outputs if item["providerStats"].get("overProviderImagePixelCap"))

    print("ASSISTANT SOURCE EXTRACT")
    print(f"- source PDF: {manifest['sourcePdf']}")
    print(f"- pages: {', '.join(str(page) for page in manifest['pages'])}")
    print(f"- outputs: {len(outputs)}")
    print(f"- provider/raw pixels: {provider_pixels:,}/{raw_pixels:,}")
    print(f"- provider/raw bytes: {byte_label(provider_bytes)}/{byte_label(raw_bytes)}")
    print(f"- over provider pixel cap: {over_cap}")
    print(f"- manifest: {manifest_path}")
    for item in outputs:
        stats = item["providerStats"]
        marker = " OVER-CAP" if stats.get("overProviderImagePixelCap") else ""
        print(
            f"  - page {item['page']}: {item['outputPath']} "
            f"({item['outputWidth']}x{item['outputHeight']}, "
            f"{int(stats.get('providerImagePixels') or 0):,} provider pixels){marker}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Render selected PDF pages into assistant-ready source crops.")
    parser.add_argument("pdf", help="Source PDF path.")
    parser.add_argument("--pages", required=True, help="Pages to render, e.g. 12 or 12-13,18.")
    parser.add_argument("--name", default=None, help="Output/eval slug. Defaults to the PDF filename.")
    parser.add_argument(
        "--output-root",
        default=None,
        help="Output root. Defaults to mauth-workbench/assistant-evals/<slug>.",
    )
    parser.add_argument("--output-subdir", default="crops", help="Output subdirectory under the output root.")
    parser.add_argument("--dpi", type=int, default=DEFAULT_DPI, help="PDF render DPI.")
    parser.add_argument(
        "--max-long-edge",
        type=int,
        default=DEFAULT_MAX_LONG_EDGE,
        help="Downscale each output image to this maximum long edge. Use 0 to disable.",
    )
    parser.add_argument("--crop-pct", default=None, help="Manual crop as left,top,right,bottom percentages.")
    parser.add_argument("--crop-px", default=None, help="Manual crop as left,top,right,bottom rendered pixels.")
    parser.add_argument("--no-auto-trim", action="store_true", help="Disable blank/background border trimming.")
    parser.add_argument("--trim-threshold", type=int, default=DEFAULT_TRIM_THRESHOLD)
    parser.add_argument("--trim-padding", type=int, default=DEFAULT_TRIM_PADDING)
    parser.add_argument("--grayscale", action="store_true", help="Convert final output to grayscale.")
    parser.add_argument(
        "--provider-image-pixel-cap",
        type=int,
        default=DEFAULT_PROVIDER_IMAGE_PIXEL_CAP,
        help="Flag outputs whose provider-optimised payload exceeds this many pixels. Use 0 to disable.",
    )
    parser.add_argument("--json", action="store_true", help="Print the manifest JSON instead of a human summary.")
    raw_args = [arg for arg in sys.argv[1:] if arg != "--"]
    args = parser.parse_args(raw_args)

    source_pdf = Path(args.pdf).expanduser().resolve()
    if not source_pdf.is_file():
        raise SystemExit(f"PDF not found: {source_pdf}")
    if args.crop_pct and args.crop_px:
        raise SystemExit("Use only one of --crop-pct or --crop-px.")

    try:
        pages = parse_pages(args.pages)
        crop_pct = parse_box(args.crop_pct) if args.crop_pct else None
        crop_px = parse_box(args.crop_px) if args.crop_px else None
    except ValueError as error:
        raise SystemExit(str(error)) from error
    if not pages:
        raise SystemExit("No pages selected.")

    output_root = (
        Path(args.output_root).expanduser().resolve()
        if args.output_root
        else default_output_root(source_pdf, args.name)
    )
    output_subdir = output_root / args.output_subdir
    file_slug = slugify(args.name or source_pdf.stem)
    outputs = [
        process_page(
            source_pdf=source_pdf,
            page=page,
            output_path=output_subdir / f"{file_slug}_p{page:02d}.png",
            dpi=args.dpi,
            crop_pct=crop_pct,
            crop_px=crop_px,
            auto_trim=not args.no_auto_trim,
            trim_threshold=args.trim_threshold,
            trim_padding=args.trim_padding,
            grayscale=args.grayscale,
            max_long_edge=args.max_long_edge,
            provider_image_pixel_cap=args.provider_image_pixel_cap,
        )
        for page in pages
    ]
    manifest = {
        "createdAt": datetime.now(UTC).isoformat(),
        "sourcePdf": str(source_pdf),
        "outputRoot": str(output_root),
        "pages": pages,
        "settings": {
            "dpi": args.dpi,
            "maxLongEdge": args.max_long_edge,
            "cropPct": list(crop_pct) if crop_pct else None,
            "cropPx": list(crop_px) if crop_px else None,
            "autoTrim": not args.no_auto_trim,
            "trimThreshold": args.trim_threshold,
            "trimPadding": args.trim_padding,
            "grayscale": args.grayscale,
            "providerImagePixelCap": args.provider_image_pixel_cap,
        },
        "outputs": outputs,
    }
    manifest_path = write_manifest(output_root, manifest)
    if args.json:
        print(json.dumps(manifest, indent=2, ensure_ascii=False))
    else:
        print_summary(manifest, manifest_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
