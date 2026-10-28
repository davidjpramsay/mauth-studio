import json
import os
import subprocess
from collections import OrderedDict
from concurrent.futures import Future
from copy import deepcopy
from threading import BoundedSemaphore, Lock
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
RENDER_TIMEOUT_SECONDS = 30
QUEUE_TIMEOUT_SECONDS = 30
MAX_CACHED_RENDERS = 32
MAX_PENDING_RENDERS = 64
_render_slots = BoundedSemaphore(2)
_state_lock = Lock()
_completed: OrderedDict[str, dict[str, Any]] = OrderedDict()
_pending: dict[str, Future] = {}


class PenroseRenderTimeout(RuntimeError):
    pass


class PenroseRendererBusy(RuntimeError):
    pass


def render_penrose_diagram(spec: dict[str, Any]) -> dict[str, Any]:
    if spec.get("type") not in {"geometricConstruction", "network", "setDiagram"}:
        raise ValueError('Penrose renderer only accepts type "geometricConstruction", "network", or "setDiagram"')
    if not PENROSE_CLI.exists():
        raise RuntimeError(f"Penrose renderer is missing at {PENROSE_CLI}")

    # Preview and print can request the same construction simultaneously. Share
    # that work and cache successful output only, without touching document data.
    key = json.dumps(spec, sort_keys=True)
    with _state_lock:
        if key in _completed:
            _completed.move_to_end(key)
            return deepcopy(_completed[key])
        future = _pending.get(key)
        owner = future is None
        if owner:
            if len(_pending) >= MAX_PENDING_RENDERS:
                raise PenroseRendererBusy("The diagram renderer is busy. Retry shortly.")
            future = Future()
            _pending[key] = future

    if not owner:
        try:
            return deepcopy(future.result(timeout=QUEUE_TIMEOUT_SECONDS + RENDER_TIMEOUT_SECONDS + 5))
        except TimeoutError as error:
            raise PenroseRenderTimeout(
                "Geometry rendering timed out. Retry to render the same construction."
            ) from error

    try:
        if not _render_slots.acquire(timeout=QUEUE_TIMEOUT_SECONDS):
            raise PenroseRendererBusy("The diagram renderer is busy. Retry shortly.")
        try:
            result = _render_uncached(spec)
        finally:
            _render_slots.release()
    except Exception as error:
        with _state_lock:
            _pending.pop(key, None)
            future.set_exception(error)
        raise
    with _state_lock:
        _completed[key] = result
        while len(_completed) > MAX_CACHED_RENDERS:
            _completed.popitem(last=False)
        _pending.pop(key, None)
        future.set_result(result)
    return deepcopy(result)


def _render_uncached(spec: dict[str, Any]) -> dict[str, Any]:

    node_binary = os.environ.get("MAUTH_NODE_BINARY", "node")
    child_env = os.environ.copy()
    if os.environ.get("MAUTH_NODE_RUN_AS_NODE") == "1":
        child_env["ELECTRON_RUN_AS_NODE"] = "1"
    child_env["MAUTH_PENROSE_ROOT"] = str(PENROSE_ROOT)

    try:
        process = subprocess.run(
            [node_binary, str(PENROSE_CLI)],
            input=json.dumps(spec),
            text=True,
            capture_output=True,
            timeout=RENDER_TIMEOUT_SECONDS,
            check=False,
            env=child_env,
        )
    except subprocess.TimeoutExpired as error:
        # subprocess.run kills and reaps the child before raising. Preserve a
        # retryable response instead of leaking an unhandled 500/command path.
        raise PenroseRenderTimeout("Geometry rendering timed out. Retry to render the same construction.") from error
    if process.returncode != 0:
        detail = process.stderr.strip() or process.stdout.strip() or "Unknown Penrose renderer error"
        raise RuntimeError(detail)

    result = json.loads(process.stdout)
    if not isinstance(result, dict) or not isinstance(result.get("svg"), str) or not result["svg"].strip():
        raise RuntimeError("The geometry renderer returned an empty diagram.")
    return result
