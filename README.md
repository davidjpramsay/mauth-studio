# Mauth Studio

Mauth Studio is a local-first high-school mathematics assessment authoring app designed for a human teacher and an external coding agent to use together.

It is not another chat box inside an editor. The teacher uses the web app as the review and print surface, while Codex, Claude Code, Cursor, or another local agent uses a structured bridge to read the live document, dry-run edits, apply deterministic action batches, run validation, and leave review comments.

![Mauth Studio preview](docs/assets/mauth-bridge-smoke.png)

## What It Does

- Builds printable mathematics tests and worksheets with title pages, questions, parts, subparts, diagrams, tables, choices, working space, and solutions.
- Keeps maths services, question generation, marking rules, formatting rules, and rendering adapters separated so assessment behaviour is explainable and testable.
- Stores project files, autosave drafts, logo assets, and version snapshots through the local FastAPI storage layer.
- Exposes an agent-native authoring contract: snapshot, preview, apply, validation, comments, suggestions, presence, and events.
- Lets external agents work through local HTTP/MCP tools instead of editing raw project JSON.

## Why Agent-Native

Most AI-assisted document tools ask the model to infer hidden UI state or rewrite files directly. Mauth takes the opposite route:

```text
human teacher reviews in the browser
        +
local agent reads explicit document state
        +
agent proposes structured Mauth actions
        +
app dry-runs, validates, applies, autosaves, and saves with revision checks
```

That means agent edits are inspectable, retryable, reversible through editor history, and checked against the same validators the app uses.

## Local Authoring Loop

With the API and web app running, an agent should use this loop:

```text
mauth_snapshot
mauth_actions_preview
mauth_actions_apply
mauth_validation_run
browser verification
```

Comments and suggestions are review state only; they do not mutate the document until an explicit action batch is previewed and applied.

Example Codex/Claude workflow:

```text
1. Call mauth_snapshot and identify the question/module ids to edit.
2. Build a MauthDocumentAction batch, for example module.update or frontMatter.update.
3. Call mauth_actions_preview with the action batch.
4. If preview.valid is true, call mauth_actions_apply with the same actions and baseSnapshotId.
5. Call mauth_validation_run.
6. Inspect the browser preview before treating the edit as done.
```

## Quick Start

Install dependencies from the project root:

```bash
pnpm install
cd apps/api
uv sync
cd ../..
```

Start the API and web app in two terminals:

```bash
pnpm dev:api
pnpm dev:web
```

Open `http://localhost:5173`, then check the local bridge:

```bash
pnpm agent:doctor
pnpm smoke:agent-bridge
```

Claude/Codex MCP clients can use:

```bash
pnpm agent:mcp
```

See `docs/agent-local-setup.md`, `docs/agent-bridge.md`, and the simple product page at `docs/index.html`.

## Structure

- `apps/api`: FastAPI services for maths, formatting, diagrams, storage, and project files.
- `apps/web`: Vite, React, TypeScript, Tailwind, MathJax SVG math rendering, JSXGraph, Penrose SVG rendering, and Plotly charts.
- `packages/question-engine`: JSON-configured question registry and Python plugins.
- `packages/marking-engine`: configurable marking rules and SymPy answer equivalence.
- `packages/formatting-engine`: configurable HTML and structured render blocks.
- `packages/shared`: TypeScript API contracts used by the web app.
- `packages/diagram-penrose`: Penrose Domain/Style files and JSON-to-Substance/SVG rendering for static geometric construction diagrams.
- `packages/diagram-plotly`: Plotly chart-spec adapter for statistics diagrams.
- `configs`: JSON rules for question types, formatting, marking, and AI-readable authoring brains.
- `workspace`: local scratch and generated artifacts for Codex/human work. It is intentionally ignored by Git except for its guide files.
- `chats`: project-level starting prompts for the two intended agent work streams.

## Agent Workflow

Use Mauth with external agents through the repo, local app APIs, and browser verification, not through a built-in provider chat panel.

1. Start in the `Development` chat/work stream when changing app code, schemas, tests, or docs.
2. Start in the `Authoring` chat/work stream when using Mauth to create, inspect, convert, or polish maths assessments.
3. Read `AGENTS.md`, `docs/local-ai-workflow.md`, `docs/agent-bridge.md`, `docs/mauth-actions.md`, and `docs/ai-brains.md`.
4. Keep generated PDFs, crops, eval output, browser screenshots, and temporary scripts in `workspace/`.
5. Promote only durable app code, docs, tests, fixtures, and configs into source control.

The target authoring loop is `snapshot -> action dry-run -> validation -> action apply -> browser verification`. The old provider-backed chat panel has been removed. The structured Mauth action layer remains the contract for deterministic edits and future external automation.

## Verify

```bash
pnpm check
```

Useful narrower checks:

```bash
pnpm test:api
pnpm test:web-actions
pnpm build:web
```

With the API and web app running, useful smoke checks include:

```bash
pnpm smoke:file-manager
pnpm smoke:context-menu-actions
pnpm smoke:diagram-gallery
```

## Mauthdown

Mauthdown is the editable source format for tests and worksheets. It is Markdown plus explicit containers for title pages, questions, parts, subparts, text, choice lists, tables, diagrams, spaces, and page breaks. See `docs/mauthdown.md`.

## Storage

Project files, autosave, reusable logos, and versions are written through the FastAPI app under `storage/`. Browser storage is only a fallback cache. Do not commit `storage/`, `workspace/` artifacts, local `.env` files, build output, or dependency folders.

## Print

PDF output uses the browser print dialog and Save as PDF from the same A4 preview pages shown on screen. The app owns page content and page breaks; the browser owns physical paper output.
