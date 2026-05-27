# Mauth Studio Agent Guide

Mauth Studio is a rule-driven high-school mathematics assessment authoring system. Keep the layers separate:

- SymPy/FastAPI maths services live in `apps/api/app/services`.
- Question generation lives in `packages/question-engine` and `configs/question-types`.
- Marking rules live in `packages/marking-engine` and `configs/marking`.
- Formatting rules live in `packages/formatting-engine` and `configs/formatting`.
- Rendering adapters live in `apps/web/src/components`, `packages/diagram-penrose`, and `packages/diagram-plotly`.

Do not put marking or formatting decisions inside question generator logic.

Product direction: build for AI-controlled authoring first. Human UI should remain usable and clear, but new features, schemas, editor actions, validation, and docs should assume an AI agent will often create, inspect, and edit the document through structured operations. Prefer explicit document state, deterministic validators, reversible actions, and small focused controls over UI-only behaviour that an agent cannot reason about or reproduce.

External or local coding agents are supported too. Whether the model runs inside the app or in a tool like Codex, Cursor, or Claude Code, treat this file plus `docs/local-ai-workflow.md`, `docs/mauth-actions.md`, `docs/ai-brains.md`, and `docs/ai-chatbox-readiness.md` as the operating contract. Use the same structured Mauth actions, validators, and scratch-workbench separation in both cases.

## Commands

Run root scripts from the project root: the folder containing this `AGENTS.md`, the root `package.json`, `apps/`, and `packages/`.

Install dependencies from the project root:

```bash
pnpm install
cd apps/api
uv sync
cd ../..
```

Run locally from the project root, using two terminals:

```bash
pnpm dev:api
pnpm dev:web
```

If the terminal is already inside `apps/web`, use `pnpm dev` instead of `pnpm dev:web`.

Quality gate before commits:

```bash
pnpm check
```

This runs Prettier, ESLint, Ruff, pytest, TypeScript, and the Vite build.

## Storage And Git Hygiene

Do not commit local authoring data or generated output:

- `storage/`
- `drafts/`
- `tmp/`
- `node_modules/`
- `apps/web/dist/`
- Python caches and virtual environments

The app stores live tests, autosave, reusable logo assets, and prototype project files under `storage/`, with browser fallback state in localStorage. Treat those as user data, not source code. Logos are not built in: starter logos are editable seed data added once for new or migrated browsers, and the shared logo library is independent of any one saved test. Project/file storage lives under `storage/projects`; use revision-aware saves and version snapshots. The Files drawer ZIP backup/import path is the supported portable backup workflow and includes project files, version snapshots, and reusable logo assets. Treat legacy `storage/tests` as migration input only, while `storage/autosave/current-test.json` is the current recovery draft and should not be confused with a saved file.

## Mauthdown

Mauthdown is the AI-friendly file format for tests. Prefer explicit containers:

- `:::question`
- `:::part`
- `:::subpart`
- `:::text`
- `:::choices`
- `:::table`
- `:::diagram`
- `:::columns`
- `:::space`
- `:::page-break`

Question, part, and subpart labels are automatic. Do not store visible labels like `(a)` or `(i)` in text unless they are part of the actual question content.

Use `$...$` for inline maths and `$$...$$` for display maths. Maths is rendered through MathJax SVG. Inline maths is wrapped with `\displaystyle` by default so it stays in the sentence while fractions and operators use display-style sizing. This is a local wrapper, not MathJax display mode, because MathJax display mode creates block layout. If a specific inline formula needs compact sizing, start it with `\textstyle`. TeX still shrinks content inside fraction numerators and denominators; for printable questions, solutions, table cells, and diagram labels, write nested large expressions explicitly, such as `\frac{\displaystyle\binom{n}{r}p^r(1-p)^{n-r}}{\displaystyle\sum_{x=0}^{n} ...}`. Markdown `**bold**`, `*italic*`, and `***bold italic***` are supported in text blocks. Table cells use the same inline maths and formatting renderer.

## AI Rule Brains

Keep AI authoring behaviour split into focused rule sets. The machine-readable configs live in `configs/ai-brains/`, with overview docs in `docs/ai-brains.md`.

- Question brain: curriculum fit, wording, marks intent, and mathematical correctness.
- Formatting brain: page flow, spacing, typography, page breaks, and print layout.
- Diagram brain: JSXGraph, Penrose, and Plotly diagram specs, labels, scaling, and visual clarity.
- Solutions brain: worked solutions, answer keys, rubric-aligned reasoning, and solution-copy formatting.

All brains operate on the same Mauthdown/test schema. Do not let formatting, diagram, or solutions rules leak into question-writing logic.

AI-authored document edits should prefer the structured Mauth action layer in `apps/web/src/lib/mauthActions.ts` when the action exists. Human UI controls should use the same action path where practical, so future in-app AI can rely on deterministic edit contracts instead of guessing local React state. Use document action batches when edits touch front matter, logo/school-name selection, page format, and question content together; use question action batches for question-only edits. Use `module.move`, `part.move`, and `subpart.move` for relocating existing content so ids, undo/history, mixed `itemOrder`, and validation remain intact. For large model-generated edits, run a document-action dry run first and inspect the preview summary before committing the same batch. Keep `pnpm test:web-actions` passing when changing the action contract.

Formatting brain rule: treat `:::space` blocks as intentional working area, not generic page filler. If a manual page break immediately follows a question, do not add a trailing question-level space block just to fill the remaining page area. Keep spaces inside parts/subparts when they are intended answer space for that part.

For deliberate splits inside a long question, use `pageBreakBefore` on the relevant part or subpart. Keep question-boundary page breaks in the mini TOC/page-break-after-question model; do not reintroduce standalone page-break modules inside question content.

When adding a durable behaviour rule, update both the relevant brain config and the human docs. Do not add one-off preferences to a brain unless they should apply to future AI/API authoring. Prefer small, testable rules that point to the shared schema.

## Diagram Systems

Use the shared diagram shape:

```json
{ "type": "...", "data": {}, "style": "...", "options": {} }
```

Current diagram systems:

- `graph2d` and `graph3d`: JSXGraph.
- `geometricConstruction`, `network`, and `setDiagram`: Penrose-backed static diagrams.
- `statsChart`: Plotly-backed statistical charts.

Keep these rendering systems separate. Do not unify Penrose, Plotly, and JSXGraph internals.

For Penrose diagrams, normal authoring should edit Substance only. The app supplies family presets such as `geometry` and `sets`. Use `EqualLength(AB, CD)` with named segments for readable geometry side constraints; `EqualLength(A, B, C, D)` is supported for compact point-pair constraints. New `setDiagram` blocks should default to the `sets` preset rather than embedding generated Domain or Style.

For statistics charts, extend `packages/diagram-plotly` instead of adding chart logic to JSXGraph or React components.

For solution-copy graph annotations, use editable graph features such as `point`, `label`, and `line_segment`. Do not draw one-off SVG overlays in React.

## Print

PDF output uses the browser print dialog and Save as PDF from the same generated A4 preview pages shown on screen. Screen preview uses pixel-sized page boxes for visual layout and zoom. Print CSS should use physical paged-media rules: `@page { size: A4; }` owns paper size and margins, while each generated app page renders only its printable content area. Do not make print DOM pages full physical-height paper boxes; that can create blank trailing pages in WebKit/Safari. Avoid browser-specific print branches unless a narrow compatibility issue is proven.

## Frontend Notes

`apps/web/src/App.tsx` is currently a large editor file. Keep edits scoped and prefer extracting new reusable logic rather than growing it further when a change touches a separable area.

Drag/drop rules are hierarchical:

- Questions reorder with questions.
- Question-level content and parts reorder within a question.
- Part-level content and subparts reorder within a part.
- Subpart-level content reorders within a subpart.

Use visible drop zones and preserve automatic relabelling after moves.

## Backend Formatting

Marks display uses parentheses, for example `(1 mark)` and `(3 marks)`. Keep backend HTML, web preview, and future export paths aligned.
