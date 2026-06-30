# Mauth Studio

Mauth Studio is a local-first mathematics assessment authoring app for teachers working with external coding agents.

The browser is the review and print surface. Codex, Claude Code, Cursor, or another local agent can use the local HTTP/MCP bridge to inspect the live document, preview edits, apply structured action batches, run validation, and verify the result in the browser.

![Mauth Studio preview](docs/assets/mauth-bridge-smoke.png)

## Development Status

Mauth Studio is alpha software. Expect active changes to app code, schemas, docs, tests, and agent workflows.

If you are new to the project, start with the public page and copy the install prompt into Codex or Claude:

[davidjpramsay.github.io/mauth-studio](https://davidjpramsay.github.io/mauth-studio/)

Fork the repo if you want your own public copy, or clone it locally if you just want an agent-operated project folder. Agents are expected to make code changes in the repo when working in the development stream.

Recommended setup:

- `Mauth Development`: app code, architecture, schemas, tests, docs, CI, and repository maintenance.
- `Mauth Authoring`: creating, inspecting, converting, and polishing assessments through the app, bridge, MCP tools, or browser.

## What It Builds

- Printable maths tests, exams, and worksheets.
- Title pages, questions, parts, subparts, diagrams, tables, choices, working space, and solutions.
- MathJax SVG maths, JSXGraph diagrams, Penrose diagrams, and Plotly charts.
- Visible local document files in `~/Documents/Mauth`, plus autosave drafts, logo assets, and version snapshots.
- Agent-readable snapshots, deterministic actions, validation, comments, suggestions, presence, and events.

## Agent-Native Workflow

Mauth avoids hidden UI state and raw JSON edits. The target loop is:

```text
mauth_snapshot
mauth_actions_preview
mauth_actions_apply
mauth_validation_run
browser verification
```

Agents should preview large edits before applying them. Successful applies go through the app action layer, editor history, autosave, and revision-aware project-file saves.

Example:

```text
1. Call mauth_snapshot.
2. Build a MauthDocumentAction batch.
3. Call mauth_actions_preview.
4. Apply the same batch with mauth_actions_apply.
5. Run mauth_validation_run.
6. Check the browser preview.
```

## Quick Start

Install dependencies from the project root:

```bash
pnpm install
cd apps/api
uv sync
cd ../..
```

For everyday local use, start the API and web app through the launcher:

```bash
pnpm dev:launch
```

On macOS, install a Finder/desktop entry point:

```bash
pnpm macos:install-launcher
```

This creates `~/Applications/Mauth Studio.app`. Double-clicking it opens a labelled Terminal session, runs `pnpm dev:launch`, checks the API/web versions, starts the needed servers, and opens Mauth Studio in the browser.

Check what Mauth servers are currently running:

```bash
pnpm dev:status
```

Stop Mauth-owned local servers:

```bash
pnpm dev:stop
```

If you have old manual terminals running, stop them with `Ctrl+C` or `pnpm dev:stop` first. For a deliberate clean restart, use:

```bash
pnpm dev:launch:replace
```

That stops Mauth-owned dev servers on the configured API/web ports before starting a fresh launcher-owned session. The normal launcher will warn rather than silently starting a second web server when it detects a stale same-port Mauth process.

For lower-level debugging, start the API and web app in two terminals:

```bash
pnpm dev:api
pnpm dev:web
```

Open the web URL printed by the launcher or by `pnpm dev:web` (usually `http://localhost:5173`), then check the local bridge:

```bash
pnpm agent:doctor
pnpm smoke:agent-bridge
```

If Vite prints a different web URL, pass it to the doctor:

```bash
MAUTH_WEB_URL=http://127.0.0.1:5174 pnpm agent:doctor
```

Claude/Codex MCP clients can use:

```bash
pnpm agent:mcp
```

See `docs/agent-local-setup.md`, `docs/agent-bridge.md`, and `docs/index.html`.

## Repo Map

- `apps/api`: FastAPI services for maths, formatting, diagrams, storage, and project files.
- `apps/web`: Vite, React, TypeScript, Tailwind, MathJax SVG math rendering, JSXGraph, Penrose SVG rendering, and Plotly charts.
- `packages/question-engine`: JSON-configured question registry and Python plugins.
- `packages/marking-engine`: configurable marking rules and SymPy answer equivalence.
- `packages/formatting-engine`: configurable HTML and structured render blocks.
- `packages/shared`: TypeScript API contracts used by the web app.
- `packages/diagram-penrose`: Penrose Domain/Style files and JSON-to-Substance/SVG rendering for static geometric construction diagrams.
- `packages/diagram-plotly`: Plotly chart-spec adapter for statistics diagrams.
- `configs`: JSON rules for question types, formatting, marking, and AI-readable authoring brains.
- `workspace`: ignored local scratch space for generated artifacts.
- `chats`: starter prompts for the intended agent work streams.

## Agent Workflow

Use Mauth through the repo, local app APIs, MCP tools, and browser verification. The old provider-backed in-app chat panel is not the product path.

- Use the `Development` work stream for app code, schemas, tests, docs, CI, and repo maintenance.
- Use the `Authoring` work stream for creating, inspecting, converting, or polishing assessments.
- Keep these as separate chats where practical so code changes and assessment authoring do not get mixed together.
- Read `AGENTS.md`, `docs/local-ai-workflow.md`, `docs/agent-bridge.md`, `docs/mauth-actions.md`, and `docs/ai-brains.md`.
- Keep generated PDFs, crops, eval output, browser screenshots, and temporary scripts in `workspace/`.

Comments and suggestions are review state only. They do not mutate the document until an explicit action batch is previewed and applied.

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

Mauthdown is the editable source format for tests, exams, and worksheets. It is Markdown plus explicit containers for title pages, worksheet headings, questions, parts, subparts, text, choice lists, tables, diagrams, columns, spaces, and page breaks. See `docs/mauthdown.md`.

## Storage

Project files, autosave, reusable logos, and versions are written through the FastAPI app under `storage/`. Browser storage is only a fallback cache. Do not commit `storage/`, `workspace/` artifacts, local `.env` files, build output, or dependency folders.

## Print

PDF output uses the browser print dialog and Save as PDF from the same A4 preview pages shown on screen. The app owns page content and page breaks; the browser owns physical paper output.
