import json
import os
import subprocess
from typing import Any

from app.bootstrap import ROOT

PENROSE_ROOT = (
    ROOT / "penrose-runtime" if (ROOT / "penrose-runtime").exists() else ROOT / "packages" / "diagram-penrose"
)
PENROSE_CLI = (
    PENROSE_ROOT / "src" / "cli.cjs"
    if (PENROSE_ROOT / "src" / "cli.cjs").exists()
    else PENROSE_ROOT / "src" / "cli.mjs"
)


def render_penrose_diagram(spec: dict[str, Any]) -> dict[str, Any]:
    if spec.get("type") not in {"geometricConstruction", "network", "setDiagram"}:
        raise ValueError('Penrose renderer only accepts type "geometricConstruction", "network", or "setDiagram"')
    if not PENROSE_CLI.exists():
        raise RuntimeError(f"Penrose renderer is missing at {PENROSE_CLI}")

    node_binary = os.environ.get("MAUTH_NODE_BINARY", "node")
    child_env = os.environ.copy()
    if os.environ.get("MAUTH_NODE_RUN_AS_NODE") == "1":
        child_env["ELECTRON_RUN_AS_NODE"] = "1"
    child_env["MAUTH_PENROSE_ROOT"] = str(PENROSE_ROOT)

    process = subprocess.run(
        [node_binary, str(PENROSE_CLI)],
        input=json.dumps(spec),
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
        env=child_env,
    )
    if process.returncode != 0:
        detail = process.stderr.strip() or process.stdout.strip() or "Unknown Penrose renderer error"
        raise RuntimeError(detail)

    return json.loads(process.stdout)
