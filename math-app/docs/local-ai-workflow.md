# Local AI Workflow

This guide explains how to use Mauth Studio with an external or local coding agent such as Codex, Cursor, Claude Code, or a shell-based assistant. It is the same workflow as the in-app assistant, just run outside the app.

## Read First

1. `math-app/AGENTS.md`
2. `math-app/docs/mauth-actions.md`
3. `math-app/docs/ai-brains.md`
4. `math-app/docs/ai-chatbox-readiness.md`
5. `math-app/README.md`

These files define the contract for document edits, diagram rules, validation, file operations, and assistant behaviour.

## What Lives Where

- `math-app/`: app source, app tests, app docs, durable fixtures, and intentional configuration.
- `mauth-workbench/`: scratch space for OCR crops, PDF conversions, Canvas/QTI exports, eval output, temporary scripts, and other one-off artifacts.
- Local `.env` files: secrets only. Do not commit them.

Do not upload workspace data, browser profiles, generated PDFs, logs, or temporary conversion outputs. Keep anything disposable in `mauth-workbench/` or outside the repo.

## Working Loop

1. Identify the task class.
2. If your agent can call Mauth tools, use the relevant Mauth contract first:
   - question writing or source conversion: `mauth.question.upsert`
   - diagram follow-up: `mauth.author.addDiagram`
   - solution or marking-key work: `mauth.author.ensureSolutions` or `mauth.solutions.writeAll`
   - layout, spacing, or page-break work: `mauth.layout.check` or `mauth.format.apply`
   - selected settings: `mauth.settings.apply`
   - project-file operations: `mauth.files.*`
3. If your agent is operating directly on the repository, make the same edit through normal filesystem changes and keep the same structured validation, safety, and review rules.
4. Preview, validate, and repair using the structured outputs or the repo's own tests and checks.
5. Run the relevant tests or smoke checks before treating the work as finished.

## Safe Publish Checklist

- Do not commit `.env` files or API keys.
- Do not commit `storage/`, `drafts/`, `tmp/`, `output/`, `node_modules/`, `.venv/`, or build artifacts.
- Keep workbench artifacts out of source control unless they are intentionally promoted into `math-app/`.
- Prefer tracked docs, configs, tests, and code over ad hoc scratch files.

## Assistant Parity

If you are changing assistant behaviour, the important checks are:

- `pnpm smoke:assistant:self`
- `pnpm eval:assistant:local`
- `pnpm test:web-actions`

Use paid live-provider evals only when the local gates are green and the change really needs model confirmation.
