import json
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[4]
PENROSE_CLI = ROOT / "packages" / "diagram-penrose" / "src" / "cli.mjs"


def render_penrose_diagram(spec: dict[str, Any]) -> dict[str, Any]:
    if spec.get("type") not in {"geometricConstruction", "vectorRelationship", "setDiagram"}:
        raise ValueError(
            'Penrose renderer only accepts type "geometricConstruction", "vectorRelationship", or "setDiagram"'
        )
    if not PENROSE_CLI.exists():
        raise RuntimeError(f"Penrose renderer is missing at {PENROSE_CLI}")

    process = subprocess.run(
        ["node", str(PENROSE_CLI)],
        input=json.dumps(spec),
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )
    if process.returncode != 0:
        detail = process.stderr.strip() or process.stdout.strip() or "Unknown Penrose renderer error"
        raise RuntimeError(detail)

    return json.loads(process.stdout)
