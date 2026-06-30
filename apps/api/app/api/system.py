from __future__ import annotations

import os
import subprocess
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from app.api.agent import browser_bridge_status
from app.api.storage import project_storage_service
from app.bootstrap import ROOT

API_VERSION = "0.1.0"
STARTED_AT = datetime.now(timezone.utc).isoformat()

router = APIRouter()


def _git_value(*args: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
            timeout=1,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None
    value = result.stdout.strip()
    return value or None


def _git_status() -> dict[str, Any]:
    dirty_source = _git_value("status", "--short")
    return {
        "branch": _git_value("rev-parse", "--abbrev-ref", "HEAD"),
        "commit": _git_value("rev-parse", "--short", "HEAD"),
        "dirty": bool(dirty_source),
    }


@router.get("/status")
def system_status() -> dict[str, Any]:
    return {
        "status": "ok",
        "apiVersion": API_VERSION,
        "startedAt": STARTED_AT,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "cwd": os.getcwd(),
        "root": str(ROOT),
        "git": _git_status(),
        "workspace": project_storage_service.workspace_status(),
        "bridge": browser_bridge_status(),
        "routes": {
            "health": "/api/health",
            "systemStatus": "/api/system/status",
            "agentDiscovery": "/.well-known/mauth-agent.json",
        },
    }
