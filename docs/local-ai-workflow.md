# External Agent Workflow

Mauth is now designed for a Codex/Claude Code style workflow instead of a built-in provider chat panel.

Use this guide when an external or local agent is helping author, inspect, convert, or improve Mauth assessments.

## Read First

1. `AGENTS.md`
2. `docs/current-state.md`
3. `docs/architecture.md`
4. `docs/agent-bridge.md`
5. `docs/mauth-actions.md`
6. `docs/ai-brains.md`
7. `README.md`

These files define the contract for document edits, diagram rules, validation, file operations, and generated-artifact hygiene.

## Work Streams

- `Development`: app code, schemas, editor behaviour, tests, docs, local agent bridge work, and repository maintenance.
- `Authoring`: teacher-facing Mauth use, assessment creation, source conversion, diagram/layout polishing, and validation.

The `Authoring` name replaces the rough “Mauth Use” label. It is shorter and describes the actual job: using Mauth to author maths assessment material.

## What Lives Where

- Root source tree: app source, tests, docs, configs, durable fixtures, and intentional tooling.
- `~/Documents/Mauth/Documents`: normal local Mauth document files that teachers can manage in Finder, backups, or Git.
- `~/Library/Application Support/Mauth Studio/storage`: shared Mauth state, autosave recovery, reusable logos, remembered-folder identity, and default-workspace versions.
- `<selected documents folder>/.mauth`: metadata and version snapshots that belong to an explicitly selected external documents folder.
- `workspace/`: scratch space for OCR crops, PDF conversions, Canvas/QTI exports, eval output, temporary scripts, screenshots, and generated reports.
- Local `.env` files: local overrides and secrets only. Do not commit them.

Do not upload workspace data, browser profiles, generated PDFs, logs, or temporary conversion outputs unless they are deliberately promoted into durable source.

## Working Loop

1. Identify whether the task is `Development` or `Authoring`.
2. Inspect the current document/app state before editing.
3. For app development, edit source files directly and run the relevant tests.
4. For assessment authoring, prefer the local agent bridge when available; otherwise use structured Mauth actions, the project-file API, or the visible Files drawer.
5. Use the browser preview and validator output as evidence, not intuition.
6. Keep scratch artifacts in `workspace/`.
7. Run the relevant tests or smoke checks before treating work as done.

## Authoring Loop

The target authoring loop is:

```text
read current Mauth snapshot
dry-run structured action batch
inspect preview and validation output
apply the same action batch
verify in browser
```

Use the bridge endpoints or MCP tools for normal agent authoring. If the bridge is unavailable, use the closest available mechanism and keep the same discipline: inspect current state, preview or test the edit where possible, apply through the app's normal action/file APIs, then verify the rendered result.

Do not make raw project-file JSON edits the normal authoring path. Direct edits under the selected documents folder, its `.mauth` metadata, `~/Library/Application Support/Mauth Studio/storage`, or legacy repo `storage/` are acceptable only for recovery, migration, or deliberate maintenance, and they must keep project metadata, active revision, autosave, and version safety aligned.

## Canvas Quiz Page Assets

When building a Canvas quiz from one-PDF-page-per-question images, treat Canvas as a display surface, not as the response collection surface.

Before uploading question images:

1. Regenerate every question PDF and PNG after the latest Mauth edit.
2. Run `pnpm audit:canvas-assets` against the export folder. The audit checks that each manifest question has one split PDF page, the expected `Question N` label, no stale worksheet/export heading text, and a fresh PNG for that PDF.
3. Visually inspect the generated PNG contact sheets or individual PNGs when equations, graphs, tables, or split-page boundaries changed. Text extraction cannot prove MathJax SVGs or diagrams are visible.

When updating Canvas questions:

1. Upload the regenerated PNGs.
2. Update each Canvas quiz item as `question_type: "text_only_question"` with `points_possible: 0` and exactly one image in `question_text`.
3. Read the Canvas API records back after the update. Do not rely on the edit screen alone.
4. Treat the upload as incomplete if any item reads back as `essay_question`, has non-zero points, has the wrong file id, has no image, or the question count/order does not match the manifest.

If marks are needed for gradebook reporting, keep them in the exam PDF and local Mauth source, not in these Canvas display-only items.

## Safe Publish Checklist

- Do not commit `.env` files or API keys.
- Do not commit `storage/`, `drafts/`, `tmp/`, `output/`, `node_modules/`, `.venv/`, or generated `workspace/` contents.
- Keep generated artifacts out of source control unless they are intentionally promoted.
- Prefer tracked docs, configs, tests, and code over ad hoc scratch files.

## Agent-Native Product Rule

If a workflow cannot be explained as document state, an explicit action, a preview result, a validation result, or a reversible file operation, redesign the workflow before trying to automate it.
