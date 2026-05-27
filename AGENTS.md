# Workspace Agent Guide

This workspace contains the Mauth Studio app source tree in `math-app/`.

The workspace is meant to be usable with Codex or any other external/local coding agent, as long as generated artifacts stay in `mauth-workbench/` and secrets stay in local `.env` files that are never committed.

For any Codex task about Mauth, first change into `math-app/` and read `math-app/AGENTS.md`. Mauth Studio is a high-school mathematics assessment authoring app, not a generic document-generation project. Do not create `.docx` files or unrelated artifacts unless the user explicitly asks for that output format.

Use the repo's structured Mauth tools, tests, docs, and AI brains:

- Repo root: `math-app/`
- Main guide: `math-app/AGENTS.md`
- AI brains: `math-app/configs/ai-brains/`
- Chatbox readiness: `math-app/docs/ai-chatbox-readiness.md`
- Mauth actions: `math-app/docs/mauth-actions.md`

Run commands from `math-app/` unless the user clearly asks for something outside the app.

Keep non-app Codex artifacts outside `math-app/`. For PDF-based test creation, Canvas/QTI exports, conversion scripts, extracted page images, scratch reports, and other one-off files that are not Mauth Studio source, use the sibling workbench:

- `mauth-workbench/`

If you are using a local agent outside the internal assistant, read `math-app/AGENTS.md` plus `math-app/docs/local-ai-workflow.md`, `math-app/docs/mauth-actions.md`, `math-app/docs/ai-brains.md`, and `math-app/docs/ai-chatbox-readiness.md` before editing files. The same structured Mauth contract applies either way.

The app folder should stay reserved for app source, app tests, app docs, durable fixtures, and intentional configuration.
