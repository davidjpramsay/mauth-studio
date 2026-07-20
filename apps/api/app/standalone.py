from __future__ import annotations

import argparse
import os
import signal
import threading
import time
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.bootstrap import ROOT


def _web_dist_path(value: str | None) -> Path:
    configured = value or os.environ.get("MAUTH_WEB_DIST")
    if configured:
        return Path(configured).expanduser().resolve()
    return (ROOT / "web-dist").resolve()


def configure_static_editor(application: FastAPI, web_dist: Path) -> None:
    index_path = web_dist / "index.html"
    if not index_path.is_file():
        raise RuntimeError(f"Mauth web build is missing: {index_path}")
    application.mount("/", StaticFiles(directory=web_dist, html=True), name="mauth-web")


def _watch_parent(parent_pid: int) -> None:
    while True:
        time.sleep(1)
        try:
            os.kill(parent_pid, 0)
        except ProcessLookupError:
            os.kill(os.getpid(), signal.SIGTERM)
            return
        except PermissionError:
            continue


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the packaged Mauth Studio API and editor.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--web-dist")
    parser.add_argument("--parent-pid", type=int)
    args = parser.parse_args()

    from app.main import app

    configure_static_editor(app, _web_dist_path(args.web_dist))
    if args.parent_pid:
        threading.Thread(target=_watch_parent, args=(args.parent_pid,), daemon=True).start()

    uvicorn.run(app, host=args.host, port=args.port, log_level=os.environ.get("MAUTH_LOG_LEVEL", "warning"))


if __name__ == "__main__":
    main()
