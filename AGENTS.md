# Mauth Studio Agent Guide

Mauth Studio is a rule-driven high-school mathematics assessment authoring system. Keep the layers separate:

- SymPy/FastAPI maths services live in `apps/api/app/services`.
- Question generation lives in `packages/question-engine` and `configs/question-types`.
- Marking rules live in `packages/marking-engine` and `configs/marking`.
- Formatting rules live in `packages/formatting-engine` and `configs/formatting`.
- Rendering adapters live in `apps/web/src/components`, `packages/diagram-penrose`, and `packages/diagram-plotly`.

Do not put marking or formatting decisions inside question generator logic.

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

The app stores live tests under `storage/` and browser fallback state in localStorage. Treat those as user data, not source code.

## Mauthdown

Mauthdown is the AI-friendly file format for tests. Prefer explicit containers:

- `:::question`
- `:::part`
- `:::subpart`
- `:::text`
- `:::choices`
- `:::table`
- `:::diagram`
- `:::space`
- `:::page-break`

Question, part, and subpart labels are automatic. Do not store visible labels like `(a)` or `(i)` in text unless they are part of the actual question content.

Use `$...$` for inline maths and `$$...$$` for display maths. Inline maths is rendered with `\displaystyle` by default while keeping KaTeX `displayMode: false`, so it stays in the sentence but fractions and operators use display-style sizing. If a specific inline formula needs compact KaTeX sizing, start it with `\textstyle`. Markdown `**bold**`, `*italic*`, and `***bold italic***` are supported in text blocks. Table cells use the same inline maths and formatting renderer.

## AI Rule Brains

Keep AI authoring behaviour split into focused rule sets. The machine-readable configs live in `configs/ai-brains/`, with overview docs in `docs/ai-brains.md`.

- Question brain: curriculum fit, wording, marks intent, and mathematical correctness.
- Formatting brain: page flow, spacing, typography, page breaks, and print layout.
- Diagram brain: JSXGraph, Penrose, and Plotly diagram specs, labels, scaling, and visual clarity.
- Solutions brain: worked solutions, answer keys, rubric-aligned reasoning, and solution-copy formatting.

All brains operate on the same Mauthdown/test schema. Do not let formatting, diagram, or solutions rules leak into question-writing logic.

Formatting brain rule: treat `:::space` blocks as intentional working area, not generic page filler. If a manual page break immediately follows a question, do not add a trailing question-level space block just to fill the remaining page area. Keep spaces inside parts/subparts when they are intended answer space for that part.

When adding a durable behaviour rule, update both the relevant brain config and the human docs. Do not add one-off preferences to a brain unless they should apply to future AI/API authoring. Prefer small, testable rules that point to the shared schema.

## Diagram Systems

Use the shared diagram shape:

```json
{ "type": "...", "data": {}, "style": "...", "options": {} }
```

Current diagram systems:

- `graph2d` and `graph3d`: JSXGraph.
- `geometricConstruction`, `vectorRelationship`, and `setDiagram`: Penrose-backed static diagrams.
- `statsChart`: Plotly-backed statistical charts.

Keep these rendering systems separate. Do not unify Penrose, Plotly, and JSXGraph internals.

For Penrose diagrams, normal authoring should edit Substance only. The app supplies family presets such as `geometry` and `sets`. Use `EqualLength(AB, CD)` with named segments for readable geometry side constraints; `EqualLength(A, B, C, D)` is supported for compact point-pair constraints. New `setDiagram` blocks should default to the `sets` preset rather than embedding generated Domain or Style.

For statistics charts, extend `packages/diagram-plotly` instead of adding chart logic to JSXGraph or React components.

For solution-copy graph annotations, use editable graph features such as `point`, `label`, and `line_segment`. Do not draw one-off SVG overlays in React.

## Export

`Export PDF` is a real in-app export path. It renders the same A4 preview into a hidden export stage, waits for fonts/KaTeX/JSXGraph/Penrose/Plotly output, captures each page, and writes a PDF with `html2canvas` and `jsPDF`. Keep this path aligned with the visible preview; do not replace it with `window.print()`.

The current PDF export is raster-page based. That is acceptable for the prototype because it preserves diagram and maths fidelity, but selectable text and DOCX export are future work.

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
