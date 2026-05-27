#!/usr/bin/env python3
"""Validate the assistant real-exam benchmark manifest.

The manifest is intentionally metadata-only. Crops, rendered pages, and
extracted official keys stay in the sibling mauth-workbench folder.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "apps" / "api"
DEFAULT_MANIFEST = ROOT / "configs" / "assistant-real-exam-benchmarks.json"

VALID_STATUSES = {"active", "needs-local", "planned", "renderer-stress"}
VALID_REQUEST_CLASSES = {"source-conversion", "renderer-semantic"}
VALID_TOOLS = {"mauth_convert_source_question", "mauth.question.upsert"}
VALID_MAUTH_TOOLS = {"mauth.question.upsert"}


def load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"{path}: invalid JSON: {exc}") from exc


def load_eval_taxonomy() -> dict[str, Any]:
    command = [sys.executable, str(ROOT / "scripts" / "assistant-live-eval.py"), "--list-cases"]
    result = subprocess.run(command, cwd=API_ROOT, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        message = result.stderr.strip() or result.stdout.strip()
        raise SystemExit(f"Could not load assistant eval taxonomy: {message}")
    try:
        start = result.stdout.index("{")
    except ValueError as exc:
        raise SystemExit("assistant-live-eval.py --list-cases did not print JSON") from exc
    return json.loads(result.stdout[start:])


def resolve_workbench_root(manifest: dict[str, Any]) -> Path:
    root_value = manifest.get("workbenchRoot")
    if not isinstance(root_value, str) or not root_value:
        raise SystemExit("Manifest must define non-empty workbenchRoot")
    root_path = Path(root_value)
    if not root_path.is_absolute():
        root_path = ROOT / root_path
    return root_path.resolve()


def asset_path(workbench_root: Path, asset: dict[str, Any]) -> Path:
    raw_path = asset.get("path")
    if not isinstance(raw_path, str) or not raw_path:
        return Path("")
    path = Path(raw_path)
    if not path.is_absolute():
        path = workbench_root / path
    return path


def validate_line_range(path: Path, asset: dict[str, Any], errors: list[str]) -> None:
    if "lineStart" not in asset and "lineEnd" not in asset:
        return
    line_start = asset.get("lineStart")
    line_end = asset.get("lineEnd")
    if not isinstance(line_start, int) or not isinstance(line_end, int):
        errors.append(f"{path}: lineStart and lineEnd must both be integers")
        return
    if line_start < 1 or line_end < line_start:
        errors.append(f"{path}: invalid line range {line_start}-{line_end}")
        return
    if not path.exists():
        return
    line_count = len(path.read_text(encoding="utf-8", errors="replace").splitlines())
    if line_end > line_count:
        errors.append(f"{path}: lineEnd {line_end} exceeds file line count {line_count}")


def local_case_names(taxonomy: dict[str, Any]) -> set[str]:
    return {case["name"] for case in taxonomy.get("localCases", []) if isinstance(case.get("name"), str)}


def live_case_names(taxonomy: dict[str, Any]) -> set[str]:
    return {case["name"] for case in taxonomy.get("liveCases", []) if isinstance(case.get("name"), str)}


def relative_or_absolute(path: Path) -> str:
    resolved = path.resolve()
    try:
        return str(resolved.relative_to(ROOT))
    except ValueError:
        return str(resolved)


def validate_manifest(
    manifest: dict[str, Any], taxonomy: dict[str, Any], manifest_path: Path
) -> tuple[list[str], list[str], dict[str, Any]]:
    errors: list[str] = []
    warnings: list[str] = []
    workbench_root = resolve_workbench_root(manifest)

    benchmarks = manifest.get("benchmarks")
    if not isinstance(benchmarks, list):
        raise SystemExit("Manifest must define benchmarks as a list")

    local_cases = local_case_names(taxonomy)
    live_cases = live_case_names(taxonomy)
    preview_cases = set(taxonomy.get("localGroups", {}).get("local-real-exams-preview", []))
    seen_ids: set[str] = set()
    status_counts: Counter[str] = Counter()
    class_counts: Counter[str] = Counter()
    renderer_counts: Counter[str] = Counter()
    source_asset_count = 0
    local_link_count = 0
    live_link_count = 0

    for index, benchmark in enumerate(benchmarks, start=1):
        if not isinstance(benchmark, dict):
            errors.append(f"benchmarks[{index}] must be an object")
            continue

        benchmark_id = benchmark.get("id")
        if not isinstance(benchmark_id, str) or not benchmark_id:
            errors.append(f"benchmarks[{index}] must have a non-empty id")
            benchmark_id = f"benchmarks[{index}]"
        elif benchmark_id in seen_ids:
            errors.append(f"{benchmark_id}: duplicate benchmark id")
        seen_ids.add(benchmark_id)

        status = benchmark.get("status")
        if status not in VALID_STATUSES:
            errors.append(f"{benchmark_id}: status must be one of {sorted(VALID_STATUSES)}")
            status = "invalid"
        status_counts[str(status)] += 1

        request_class = benchmark.get("requestClass")
        if request_class not in VALID_REQUEST_CLASSES:
            errors.append(f"{benchmark_id}: requestClass must be one of {sorted(VALID_REQUEST_CLASSES)}")
            request_class = "invalid"
        class_counts[str(request_class)] += 1

        source = benchmark.get("source")
        if not isinstance(source, dict):
            errors.append(f"{benchmark_id}: source must be an object")
        elif request_class == "source-conversion":
            for key in ("year", "paper", "question", "originFolder"):
                if source.get(key) in (None, ""):
                    errors.append(f"{benchmark_id}: source.{key} is required for source-conversion benchmarks")

        source_assets = benchmark.get("sourceAssets")
        if not isinstance(source_assets, list):
            errors.append(f"{benchmark_id}: sourceAssets must be a list")
            source_assets = []
        if request_class == "source-conversion" and not source_assets:
            errors.append(f"{benchmark_id}: source-conversion benchmarks must list sourceAssets")
        for asset in source_assets:
            if not isinstance(asset, dict):
                errors.append(f"{benchmark_id}: sourceAssets entries must be objects")
                continue
            path = asset_path(workbench_root, asset)
            if not path:
                errors.append(f"{benchmark_id}: source asset is missing path")
                continue
            source_asset_count += 1
            if not path.exists():
                errors.append(f"{benchmark_id}: source asset does not exist: {path}")
            validate_line_range(path, asset, errors)

        evals = benchmark.get("evals")
        if not isinstance(evals, dict):
            errors.append(f"{benchmark_id}: evals must be an object")
            evals = {}
        local_case = evals.get("localCase")
        live_case = evals.get("liveCase")
        if local_case is not None:
            if not isinstance(local_case, str) or not local_case:
                errors.append(f"{benchmark_id}: evals.localCase must be a string or null")
            elif local_case not in local_cases:
                errors.append(f"{benchmark_id}: unknown local eval case {local_case}")
            else:
                local_link_count += 1
        if live_case is not None:
            if not isinstance(live_case, str) or not live_case:
                errors.append(f"{benchmark_id}: evals.liveCase must be a string or null")
            elif live_case not in live_cases:
                errors.append(f"{benchmark_id}: unknown live eval case {live_case}")
            else:
                live_link_count += 1
        if status == "active" and not local_case:
            errors.append(f"{benchmark_id}: active benchmarks must have a zero-cost local eval case")
        if status == "planned" and (local_case or live_case):
            warnings.append(f"{benchmark_id}: planned benchmark already has an eval link; consider status active")
        if status == "needs-local" and not live_case:
            warnings.append(f"{benchmark_id}: needs-local benchmark has no live case to preserve current paid coverage")
        if evals.get("previewReplay") is True and local_case not in preview_cases:
            errors.append(f"{benchmark_id}: previewReplay is true but local case is not in local-real-exams-preview")

        expected = benchmark.get("expected")
        if not isinstance(expected, dict):
            errors.append(f"{benchmark_id}: expected must be an object")
            expected = {}
        tool = expected.get("tool")
        mauth_tool = expected.get("mauthTool")
        renderers = expected.get("renderers")
        if tool not in VALID_TOOLS:
            errors.append(f"{benchmark_id}: expected.tool must be one of {sorted(VALID_TOOLS)}")
        if mauth_tool not in VALID_MAUTH_TOOLS:
            errors.append(f"{benchmark_id}: expected.mauthTool must be one of {sorted(VALID_MAUTH_TOOLS)}")
        if not isinstance(renderers, list) or not renderers or not all(
            isinstance(renderer, str) and renderer for renderer in renderers
        ):
            errors.append(f"{benchmark_id}: expected.renderers must be a non-empty list of strings")
            renderers = []
        renderer_counts.update(renderers)

        semantic_checks = benchmark.get("semanticChecks")
        if not isinstance(semantic_checks, list) or not semantic_checks:
            errors.append(f"{benchmark_id}: semanticChecks must be a non-empty list")

        free_gates = benchmark.get("freeGates")
        if not isinstance(free_gates, list) or not free_gates:
            errors.append(f"{benchmark_id}: freeGates must be a non-empty list")
        if status == "active" and "pnpm eval:assistant:local" not in free_gates:
            errors.append(f"{benchmark_id}: active benchmarks must include pnpm eval:assistant:local")

    summary = {
        "manifest": relative_or_absolute(manifest_path),
        "workbenchRoot": str(workbench_root),
        "benchmarks": len(benchmarks),
        "sourceAssets": source_asset_count,
        "localLinks": local_link_count,
        "liveLinks": live_link_count,
        "statusCounts": dict(sorted(status_counts.items())),
        "requestClassCounts": dict(sorted(class_counts.items())),
        "rendererCounts": dict(sorted(renderer_counts.items())),
    }
    return errors, warnings, summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate assistant real-exam benchmark metadata.")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST, help="Benchmark manifest JSON path.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable validation output.")
    raw_args = [arg for arg in sys.argv[1:] if arg != "--"]
    args = parser.parse_args(raw_args)

    manifest = load_json(args.manifest)
    taxonomy = load_eval_taxonomy()
    errors, warnings, summary = validate_manifest(manifest, taxonomy, args.manifest)

    if args.json:
        print(json.dumps({"ok": not errors, "summary": summary, "warnings": warnings, "errors": errors}, indent=2))
    else:
        if errors:
            print("Assistant benchmark manifest FAILED")
        else:
            print("Assistant benchmark manifest OK")
        print(f"- benchmarks: {summary['benchmarks']}")
        print(f"- source assets checked: {summary['sourceAssets']}")
        print(f"- eval links: {summary['localLinks']} local, {summary['liveLinks']} live")
        print(f"- statuses: {summary['statusCounts']}")
        print(f"- request classes: {summary['requestClassCounts']}")
        print(f"- renderer coverage: {summary['rendererCounts']}")
        if warnings:
            print("- warnings:")
            for warning in warnings:
                print(f"  - {warning}")
        if errors:
            print("- errors:")
            for error in errors:
                print(f"  - {error}")

    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
