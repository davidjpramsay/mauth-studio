#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Mauth Studio"
APP_BUNDLE="$ROOT_DIR/release/mac-arm64/Mauth Studio.app"
APP_BINARY="$APP_BUNDLE/Contents/MacOS/Mauth Studio"
LOG_DIR="$HOME/Library/Logs/Mauth Studio"

pkill -x "$APP_NAME" >/dev/null 2>&1 || true
cd "$ROOT_DIR"
pnpm macos:build

open_app() {
  /usr/bin/open -n "$APP_BUNDLE"
}

case "$MODE" in
  run)
    open_app
    ;;
  --debug|debug)
    lldb -- "$APP_BINARY"
    ;;
  --logs|logs)
    open_app
    mkdir -p "$LOG_DIR"
    touch "$LOG_DIR/api.log"
    tail -F "$LOG_DIR/api.log"
    ;;
  --telemetry|telemetry)
    open_app
    tail -F "$HOME/Library/Application Support/Mauth Studio/desktop.log"
    ;;
  --verify|verify)
    open_app
    for _ in {1..120}; do
      if pgrep -x "$APP_NAME" >/dev/null; then
        sleep 2
        pnpm agent:doctor
        exit 0
      fi
      sleep 0.25
    done
    echo "Mauth Studio did not launch" >&2
    exit 1
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
