# Mauth Studio

Mauth Studio is a prototype for a rule-driven high-school mathematics assessment authoring engine.

## Structure

- `apps/api`: FastAPI, SymPy, NumPy/SciPy, Pydantic, pytest.
- `apps/web`: Vite, React, TypeScript, Tailwind, shadcn-style components, MathJax SVG math rendering, JSXGraph, Penrose SVG rendering, and Plotly charts.
- `packages/question-engine`: JSON-configured question registry and Python plugins.
- `packages/marking-engine`: configurable marking rules and SymPy answer equivalence.
- `packages/formatting-engine`: configurable HTML and structured render blocks.
- `packages/shared`: TypeScript API contracts used by the web app.
- `packages/diagram-penrose`: Penrose Domain/Style files and JSON-to-Substance/SVG rendering for static geometric construction diagrams.
- `packages/diagram-plotly`: Plotly chart-spec adapter for statistics diagrams.
- `configs`: JSON rules for question types, formatting, and marking.

## Run

Run these commands from the project root: the folder that contains this `README.md`, the root `package.json`, `apps/`, and `packages/`.

Install dependencies from the project root:

```bash
pnpm install
cd apps/api
uv sync
cd ../..
```

Start the API from the project root:

```bash
pnpm dev:api
```

Start the web app from the project root:

```bash
pnpm dev:web
```

Or, if your terminal is already inside `apps/web`, start the web app with:

```bash
pnpm dev
```

Use two terminals when running the full app: one for the API and one for the web app.

Open `http://localhost:5173`.

## Assistant Provider

The in-app Assistant is intended to become the primary AI workflow for Mauth document authoring, with the goal of matching the current Codex-assisted workflow from inside the app through structured Mauth tools, validation, undo/autosave, and project versions. To enable provider-backed chat, copy `.env.example` to `.env`, add a backend-only OpenAI key, then restart `pnpm dev:api`:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.4-mini
```

`OPENAI_MODEL` is optional. The backend also sends compact rule-brain context from `configs/ai-brains/` with each assistant request; set `ASSISTANT_BRAIN_CONTEXT_CHARS=0` only when debugging provider payload size. Do not put the key in `apps/web` or any `VITE_` environment variable; the frontend only calls `/api/assistant/status` and `/api/assistant/chat`.

## Verify

```bash
pnpm check
```

Useful narrower checks:

```bash
pnpm test:api
pnpm build:web
```

With the API and web app already running, capture the diagram visual-regression gallery with:

```bash
pnpm smoke:diagram-gallery
```

With the API and web app already running, run the Files drawer workflow smoke test with:

```bash
pnpm smoke:file-manager
```

See [AGENTS.md](AGENTS.md) for agent-facing project rules, architecture boundaries, and commit hygiene.

## Mauthdown

Mauthdown is the editable source format for tests and worksheets. It is Markdown plus explicit containers for title pages, questions, parts, subparts, text, choice lists, tables, diagrams, spaces, and page breaks. Authored containers are the import source of truth so AI-generated edits round-trip cleanly. See [docs/mauthdown.md](docs/mauthdown.md).

A printable authoring reference for Penrose construction diagrams lives at [docs/penrose-cheatsheet.md](docs/penrose-cheatsheet.md).

AI authoring rules are split into composable rule brains for questions, formatting, diagrams, and solutions. See [docs/ai-brains.md](docs/ai-brains.md) and `configs/ai-brains/`.

Project follow-up items live in [docs/todo.md](docs/todo.md).

## File Storage

Project files, the current editor autosave, the reusable logo library, and legacy saved-test migration data are written through the FastAPI app under `storage/`. Browser storage is kept only as a fallback cache. The Files drawer saves user-facing tests through `storage/projects`; legacy saved tests in `storage/tests` are migration inputs. Saved test documents include front matter, questions, and formatting config so high-school mathematics test styling and page settings travel with the file. Project files use revision checks and version snapshots under `storage/projects`, and the Files drawer can create/import ZIP backups containing project files, versions, and reusable logo assets. See [docs/storage.md](docs/storage.md).

The `T` editor surface contains the title-page/front-matter controls and a document-level `Test format` panel for whole-test structure settings such as the high-school mathematics test preset, mark-label visibility, page size, margins, and page-break-label visibility.

## Print

Use the browser print dialog and Save as PDF from the A4 preview. This path keeps the browser's native print engine in charge of paper output, with MathJax-rendered SVG maths and the same structured preview pages used on screen.

The screen preview uses pixel-sized A4 pages so pan/zoom and pagination stay predictable. Print CSS uses `@page { size: A4; }` with physical margins, and each generated page renders as its printable content area rather than a full-height paper box. Keep that split: browser owns the physical sheet; the app owns the page content and page breaks.

Display zoom uses a fast temporary transform during pinch/scroll gestures, then settles into the preview page scale itself. This keeps the gesture responsive while leaving text, MathJax SVG, and vector diagrams sharper at rest; bitmap images still depend on the resolution of the uploaded image.

Maths is rendered by MathJax SVG. Inline maths is locally wrapped with `\displaystyle` by default; use `\textstyle` at the start of a specific inline formula when compact inline sizing is wanted. TeX still shrinks nested fraction contents, so AI-authored questions, solutions, table cells, and diagram labels should use explicit nested display style for large expressions in fractions, for example `\frac{\displaystyle\binom{n}{r}p^r(1-p)^{n-r}}{\displaystyle\sum_{x=0}^{n} ...}`.

## Prototype Capabilities

- Author tests as structured questions, parts, subparts, text, choice lists, tables, diagrams, spaces, and page breaks.
- Render live A4 previews with automatic question numbering and total marks.
- Save and reload structured tests through the backend-backed storage layer.
- Print the formatted preview or save it as PDF through the browser print dialog.
- Build 2D graph diagrams with JSXGraph, geometric/set diagrams with Penrose, and statistics charts with Plotly.
- Keep backend SymPy math endpoints available for future automated question generation and answer checking.

## Diagram Architecture Goal

The diagram renderer should be JSXGraph-first. Prefer native JSXGraph objects, dependency functions, gliders, intersections, text objects, and drag events for live geometry instead of recreating geometry through React state or ad hoc DOM updates. React should own the saved diagram configuration and commit durable changes after interaction; JSXGraph should own the interactive board state while the user is dragging or editing geometry.

Custom graph code is still appropriate for worksheet-specific rules that JSXGraph does not provide directly, including page-safe sizing, test-style axes, custom arrow styling, grid clipping, area labels, and export-ready structured diagram config.

Region rendering should use JSXGraph-native path operations first. Explicit function regions should prefer `inequality` plus `curveintersection` / `curvedifference`; closed relation clips should prefer native implicit curves where possible. The sampled polygon renderer remains a fallback for piecewise functions, crossing curves, y-axis regions, open implicit relations, and any case JSXGraph cannot represent cleanly.

The authoring UI should keep graph features teacher-facing and small. Current 2D graph feature authoring includes points, labels, intersections, turning points, tangents, and regions between curves or between a curve and an axis. Geometric perpendicular constructions belong in Penrose-backed geometry diagrams rather than the graph feature list. The old clipped-region feature is no longer exposed for new diagrams because it was too brittle for classroom authoring.

Solution-copy graph annotations should also use structured graph features, such as red points, draggable labels, and dashed `line_segment` guide lines. This keeps answer-key diagrams editable and importable instead of turning them into one-off overlays.

Diagram types use a shared shape: `{ "type": "...", "data": {...}, "style": "...", "options": {...} }`. `graph2d` and `graph3d` remain JSXGraph-rendered. `geometricConstruction`, `vectorRelationship`, and `setDiagram` are Penrose-backed static diagram families. `statsChart` is a separate Plotly-backed chart pipeline in `packages/diagram-plotly`; it converts a small chart DSL into controlled Plotly `data`, `layout`, and `config` objects, and the frontend dynamically loads Plotly only when a statistics chart is rendered.

Penrose diagrams use app-owned presets. Each preset supplies the Domain vocabulary and Style rules for a diagram family, so normal authoring only requires Substance. The current built-in presets are `geometry` and `sets`. `geometry` covers common classroom construction vocabulary: points, segments, lines through points, rays, triangles, right angles, side labels, circles, points on circles, tangents, secants, midpoints, angle bisectors, perpendicular bisectors, equal-length constraints with tick marks, angle labels, circle labels, and line labels. `sets` covers a two-set Venn layout with labels for each region. Future Penrose-backed diagram families should add their own preset rather than exposing Domain and Style as routine teacher inputs.

The `geometry` preset should stay Penrose-native. Style rules should use Penrose constraints, objectives, and computed geometry for layout, labels, right-angle marks, and side labels. Backend helpers may add soft goals, such as side lengths inferred from numeric side labels, but must not pin point or label coordinates with generated absolute overrides. The Resample control works by changing `options.variation`, so useful presets should leave Penrose enough freedom to produce another valid layout.

The Penrose API crops returned SVGs to the visible construction bounds with padding and exposes `metadata.displayWidth`, `metadata.displayHeight`, and `metadata.viewBox`. The frontend should use these display dimensions for left/centre/right positioning, otherwise alignment moves the full hidden Penrose canvas rather than the visible diagram.

Statistics charts should stay separate from algebra, graphing, and geometry code. Use `statsChart` for histograms, binomial distribution histograms, normal curves, and box plots; future statistical displays such as cumulative frequency graphs, regression plots, other discrete distributions, and multi-series comparisons should extend `packages/diagram-plotly` rather than JSXGraph or Penrose. Chart styling should stay controlled by the chart adapter: test-size fonts, black axes and labels, clean grid boundaries, optional fill colour, and fill opacity.

For example, a geometry construction diagram stores `options.penrosePreset = "geometry"` and the author edits only:

```penrose
Point A, B, C
Label A $A$
Label B $B$
Label C $C$

LengthLabel sideLabel1, sideLabel2
Triangle(A, B, C)
RightAngle(A, B, C)

Label sideLabel1 $5$
LabelsSegment(sideLabel1, A, B)

Label sideLabel2 $12$
LabelsSegment(sideLabel2, B, C)
```

Common geometry Substance patterns now supported by the `geometry` preset:

```penrose
Segment(A, B)
Line l
LineThrough(l, A, B)
Ray r
RayFrom(r, A, B)

Circle omega
CircleThrough(omega, O, A)
OnCircle(B, omega)
Tangent(t, omega, A)
Secant(s, omega, A, B)

Midpoint(M, A, B)
AngleBisector(bisector, A, B, C)
PerpendicularBisector(perpAB, A, B)
Segment(AB, A, B)
Segment(CD, C, D)
EqualLength(AB, CD)
EqualLength(A, B, C, D)
EqualLength(V, L, V, R)

LengthLabel angleLabel
Label angleLabel $45^\circ$
LabelsAngle(angleLabel, A, B, C)
```
