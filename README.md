# Mauth Workspace

This repository is the local workspace wrapper for Mauth Studio. It is designed to work with Codex, Cursor, Claude Code, and other external or local coding agents without requiring a built-in assistant or a published API key.

## Layout

- `math-app/`: the Mauth Studio app repo and main source tree.
- `mauth-workbench/`: local scratch space for one-off conversions, evals, rendered artifacts, and temporary scripts.
- `AGENTS.md`: workspace-level rules for agents that operate across the full tree.
- `tmp/`: disposable workspace scratch.

## Local AI Workflow

1. Open `AGENTS.md`, then `math-app/AGENTS.md`.
2. Read `math-app/docs/local-ai-workflow.md` plus `math-app/docs/mauth-actions.md`, `math-app/docs/ai-brains.md`, and `math-app/docs/ai-chatbox-readiness.md`.
3. Make app changes in `math-app/` only.
4. Keep generated outputs, OCR crops, PDFs, logs, and other scratch artifacts in `mauth-workbench/` or another directory outside the app tree.
5. Keep secrets in local `.env` files only. Do not commit API keys, browser profiles, or workspace data.

The structured Mauth action layer is the contract for both the in-app assistant and external/local coding agents.
