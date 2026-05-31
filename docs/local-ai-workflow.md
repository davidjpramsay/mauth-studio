# External Agent Workflow

Mauth is now designed for a Codex/Claude Code style workflow instead of a built-in provider chat panel.

Use this guide when an external or local agent is helping author, inspect, convert, or improve Mauth assessments.

## Read First

1. `AGENTS.md`
2. `docs/mauth-actions.md`
3. `docs/ai-brains.md`
4. `README.md`

These files define the contract for document edits, diagram rules, validation, file operations, and generated-artifact hygiene.

## Work Streams

- `Development`: app code, schemas, editor behaviour, tests, docs, and repository maintenance.
- `Authoring`: teacher-facing Mauth use, assessment creation, source conversion, diagram/layout polishing, and validation.

The `Authoring` name replaces the rough “Mauth Use” label. It is shorter and describes the actual job: using Mauth to author maths assessment material.

## What Lives Where

- Root source tree: app source, tests, docs, configs, durable fixtures, and intentional tooling.
- `workspace/`: scratch space for OCR crops, PDF conversions, Canvas/QTI exports, eval output, temporary scripts, screenshots, and generated reports.
- Local `.env` files: local overrides and secrets only. Do not commit them.

Do not upload workspace data, browser profiles, generated PDFs, logs, or temporary conversion outputs unless they are deliberately promoted into durable source.

## Working Loop

1. Identify whether the task is `Development` or `Authoring`.
2. Inspect the current document/app state before editing.
3. Prefer structured Mauth actions for document edits when they fit.
4. Use the browser preview and validator output as evidence, not intuition.
5. Keep scratch artifacts in `workspace/`.
6. Run the relevant tests or smoke checks before treating work as done.

## Safe Publish Checklist

- Do not commit `.env` files or API keys.
- Do not commit `storage/`, `drafts/`, `tmp/`, `output/`, `node_modules/`, `.venv/`, or generated `workspace/` contents.
- Keep generated artifacts out of source control unless they are intentionally promoted.
- Prefer tracked docs, configs, tests, and code over ad hoc scratch files.

## Agent-Native Product Rule

If a workflow cannot be explained as document state, an explicit action, a preview result, a validation result, or a reversible file operation, redesign the workflow before trying to automate it.
