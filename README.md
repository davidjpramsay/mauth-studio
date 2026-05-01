# Mauth Studio

Mauth Studio is a prototype for a rule-driven high-school mathematics assessment authoring engine.

## Structure

- `apps/api`: FastAPI, SymPy, NumPy/SciPy, Pydantic, pytest.
- `apps/web`: Vite, React, TypeScript, Tailwind, shadcn-style components, MathLive, KaTeX, JSXGraph.
- `packages/question-engine`: JSON-configured question registry and Python plugins.
- `packages/marking-engine`: configurable marking rules and SymPy answer equivalence.
- `packages/formatting-engine`: configurable HTML and structured render blocks.
- `packages/shared`: TypeScript API contracts used by the web app.
- `packages/diagram-penrose`: Penrose Domain/Style files and JSON-to-Substance/SVG rendering for static geometric construction diagrams.
- `packages/diagram-plotly`: Plotly chart-spec adapter for statistics diagrams.
- `configs`: JSON rules for question types, formatting, and marking.

## Run

Install dependencies:

```bash
pnpm install
cd apps/api && uv sync
```

Start the API:

```bash
pnpm dev:api
```

Start the web app:

```bash
pnpm dev:web
```

Open `http://localhost:5173`.

## Verify

```bash
pnpm check
```

Useful narrower checks:

```bash
pnpm test:api
pnpm build:web
```

See [AGENTS.md](AGENTS.md) for agent-facing project rules, architecture boundaries, and commit hygiene.

## Mauthdown

Mauthdown is the editable source format for tests and worksheets. It is Markdown plus explicit containers for title pages, questions, parts, subparts, text, choice lists, diagrams, spaces, and page breaks. The web app can export and import `.mauth.md` files, and authored containers are the import source of truth so AI-generated edits round-trip cleanly. See [docs/mauthdown.md](docs/mauthdown.md).

## File Storage

Saved tests and the current editor autosave are now written through the FastAPI app to JSON files under `storage/`. Browser storage is kept only as a fallback cache. Saves are atomic, and overwrites/deletes keep backups under `storage/backups/tests/`. See [docs/storage.md](docs/storage.md).

## First Milestone

- Factor `x^2 + 2*x + 1` and render the result with KaTeX.
- Plot the function with JSXGraph.
- Generate a quadratic factorisation question and worked solution.
- Generate a five-question test and calculate total marks.
- Apply the default formatting config to the rendered test preview.

## Diagram Architecture Goal

The diagram renderer should be JSXGraph-first. Prefer native JSXGraph objects, dependency functions, gliders, intersections, text objects, and drag events for live geometry instead of recreating geometry through React state or ad hoc DOM updates. React should own the saved diagram configuration and commit durable changes after interaction; JSXGraph should own the interactive board state while the user is dragging or editing geometry.

Custom graph code is still appropriate for worksheet-specific rules that JSXGraph does not provide directly, including page-safe sizing, test-style axes, custom arrow styling, grid clipping, area labels, and export-ready structured diagram config.

Region rendering should use JSXGraph-native path operations first. Explicit function regions should prefer `inequality` plus `curveintersection` / `curvedifference`; closed relation clips should prefer native implicit curves where possible. The sampled polygon renderer remains a fallback for piecewise functions, crossing curves, y-axis regions, open implicit relations, and any case JSXGraph cannot represent cleanly.

The authoring UI should keep graph features teacher-facing and small. Current 2D graph feature authoring includes points, labels, intersections, turning points, tangents, and regions between curves or between a curve and an axis. Geometric perpendicular constructions belong in Penrose-backed geometry diagrams rather than the graph feature list. The old clipped-region feature is no longer exposed for new diagrams because it was too brittle for classroom authoring.

Diagram types use a shared shape: `{ "type": "...", "data": {...}, "style": "...", "options": {...} }`. `graph2d` and `graph3d` remain JSXGraph-rendered. `geometricConstruction`, `vectorRelationship`, and `setDiagram` are Penrose-backed static diagram families. `statsChart` is a separate Plotly-backed chart pipeline in `packages/diagram-plotly`; it converts a small chart DSL into controlled Plotly `data`, `layout`, and `config` objects, and the frontend dynamically loads Plotly only when a statistics chart is rendered.

Penrose diagrams use app-owned presets. Each preset supplies the Domain vocabulary and Style rules for a diagram family, so normal authoring only requires Substance. The current built-in preset is `geometry`, covering common classroom construction vocabulary: points, segments, lines through points, rays, triangles, right angles, side labels, circles, points on circles, tangents, secants, midpoints, angle bisectors, perpendicular bisectors, equal-length constraints with tick marks, angle labels, circle labels, and line labels. Future Penrose-backed diagram families should add their own preset rather than exposing Domain and Style as routine teacher inputs.

The `geometry` preset should stay Penrose-native. Style rules should use Penrose constraints, objectives, and computed geometry for layout, labels, right-angle marks, and side labels. Backend helpers may add soft goals, such as side lengths inferred from numeric side labels, but must not pin point or label coordinates with generated absolute overrides. The Resample control works by changing `options.variation`, so useful presets should leave Penrose enough freedom to produce another valid layout.

The Penrose API crops returned SVGs to the visible construction bounds with padding and exposes `metadata.displayWidth`, `metadata.displayHeight`, and `metadata.viewBox`. The frontend should use these display dimensions for left/centre/right positioning, otherwise alignment moves the full hidden Penrose canvas rather than the visible diagram.

Statistics charts should stay separate from algebra, graphing, and geometry code. Use `statsChart` for histograms, binomial distribution histograms, normal curves, and box plots; future statistical displays such as cumulative frequency graphs, regression plots, other discrete distributions, and multi-series comparisons should extend `packages/diagram-plotly` rather than JSXGraph or Penrose.

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
EqualLength(A, B, C, D)
EqualLength(V, L, V, R)

LengthLabel angleLabel
Label angleLabel $45^\circ$
LabelsAngle(angleLabel, A, B, C)
```
