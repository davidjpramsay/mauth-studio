# Mauth

Mauth is a rule-driven high-school mathematics assessment authoring app designed for a human teacher and an external coding agent to use together.

The product direction is agent-native rather than in-app-chat-first: Mauth should expose clear document state, deterministic actions, validation, preview, and file operations that Codex, Claude Code, or another local agent can operate reliably through a local agent bridge.

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

## Run

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

Open `http://localhost:5173`.

## Agent Workflow

Use Mauth with external agents through the repo, local app APIs, and browser verification, not through a built-in provider chat panel.

1. Start in the `Development` chat/work stream when changing app code, schemas, tests, or docs.
2. Start in the `Authoring` chat/work stream when using Mauth to create, inspect, convert, or polish maths assessments.
3. Read `AGENTS.md`, `docs/local-ai-workflow.md`, `docs/agent-bridge.md`, `docs/mauth-actions.md`, and `docs/ai-brains.md`.
4. Keep generated PDFs, crops, eval output, browser screenshots, and temporary scripts in `workspace/`.
5. Promote only durable app code, docs, tests, fixtures, and configs into source control.

The target authoring loop is `snapshot -> action dry-run -> validation -> action apply -> browser verification`. The old provider-backed chat panel has been removed. The structured Mauth action layer remains the contract for deterministic edits and future external automation.

With the API and web app running, the local agent bridge is available at `/api/agent/current/*`. Check it with:

```bash
pnpm agent:doctor
```

Claude/Codex MCP clients can use:

```bash
pnpm agent:mcp
```

See `docs/agent-local-setup.md` and `docs/agent-bridge.md`.

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
