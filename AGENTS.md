# Mauth Studio Agent Guide

Mauth Studio is a rule-driven high-school mathematics assessment authoring system. Keep the layers separate:

- SymPy/FastAPI maths services live in `apps/api/app/services`.
- Question generation lives in `packages/question-engine` and `configs/question-types`.
- Marking rules live in `packages/marking-engine` and `configs/marking`.
- Formatting rules live in `packages/formatting-engine` and `configs/formatting`.
- Rendering adapters live in `apps/web/src/components`, `packages/diagram-penrose`, and `packages/diagram-plotly`.

Do not put marking or formatting decisions inside question generator logic.

## Commands

Install dependencies:

```bash
pnpm install
cd apps/api && uv sync
```

Run locally:

```bash
pnpm dev:api
pnpm dev:web
```

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
- `:::diagram`
- `:::space`
- `:::page-break`

Question, part, and subpart labels are automatic. Do not store visible labels like `(a)` or `(i)` in text unless they are part of the actual question content.

Use `$...$` for inline maths and `$$...$$` for display maths. Markdown `**bold**`, `*italic*`, and `***bold italic***` are supported in text blocks.

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

For Penrose geometry, normal authoring should edit Substance only. The app supplies the `geometry` Domain and Style preset. Use `EqualLength(A, B, C, D)` for equal side constraints; the preset draws matching tick marks.

For statistics charts, extend `packages/diagram-plotly` instead of adding chart logic to JSXGraph or React components.

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
