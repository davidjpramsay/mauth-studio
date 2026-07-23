# AI Rule Brains

Mauth uses small, composable AI rule brains instead of one large prompt. A brain is a focused rule set that operates on the shared Mauthdown/test schema.

The brains are for external/local agents and future explicit AI surfaces. They are not tied to a built-in provider chat panel.

## Configs

- `configs/ai-brains/question.json`: wording, curriculum fit, marks intent, mathematical correctness, and question structure.
- `configs/ai-brains/formatting.json`: page flow, spaces, page breaks, title pages, and print layout.
- `configs/ai-brains/diagram.json`: JSXGraph, Penrose, Plotly, image, and geometry diagram rules.
- `configs/ai-brains/solutions.json`: worked solutions, answer keys, hidden mark ticks, and solution-copy behaviour.

## Composition

Use only the brains needed for the task.

- New question with a graph: `question` + `diagram` + `formatting`.
- PDF-friendly layout pass: `formatting`.
- Worked-solution version: `solutions` + `formatting`.
- Whole-test marking key: `solutions` + `formatting`.
- Geometry diagram only: `diagram`.

The brains should not mutate each other's responsibilities. The Diagram Brain may define a diagram, but it should not rewrite the question prompt. The Formatting Brain may move a page break, but it should not change the maths.

## Durable Rules

Add a brain rule only when a decision should become future behaviour. Good rules are durable, small, and schema-facing: they describe what block or option to use, why it matters, and which brain owns it.

Avoid brain bloat. Do not add examples that only repeat existing rules, source-specific wording, or temporary layout fixes.

## Shared Conventions

- Use `$...$` for inline maths and `$$...$$` for display maths.
- Write simple prose values as normal text, such as `7%`, `15`, `18 months`, and `5.7% p.a.`; reserve LaTeX for real formulae, equations, coordinates, variables, symbolic notation, and mathematical answer options in choices blocks.
- In a choices block, keep mathematical typography consistent: if some options are algebraic LaTeX, wrap simple numeric options such as `$18$`, `$-3$`, and `$24$` in inline maths too.
- Do not emit `\(...\)`, `\[...\]`, escaped-dollar artefacts, or currency symbols inside maths delimiters.
- Use hidden `[[marks:n]]` annotations for solution-copy mark ticks.
- In worked-solution text, use readable vertical working when student space allows it: usually one step per line, with each hidden tick on the line or completed surface that earns that mark.
- Every marked free-response item needs a student response surface.
- Ordinary question text, tables, choices, and given diagrams are shared between student and solution copies.
- Blank completion tables and sketch, draw, label, shade, or circle surfaces are response surfaces. Complete ordinary tables through their shared in-place solution entries; pair diagrams, custom constructions, or legacy table surfaces only when the completed artifact must differ independently. Do not write an artifact answer only as prose underneath.
- In the manual editor, use **Complete in solutions** on a student diagram to create or reopen its editable paired solution diagram. The same action works for diagrams nested inside columns and must not create duplicates.
- A shared diagram with structured `solutionOnly` answer elements is already both the student response surface and the solution surface. Put the relevant `markTicks` on that shared diagram; only the answer elements render blue and the ticks render beside the surface.
- A paired solution diagram remains incomplete while its mathematical content matches the student diagram. Size, colour, grid, view-bound, chart-range, and camera changes are presentation only; add the actual curve, point, label, value, shading, series, vector, construction, or replacement image.
- For a shared `graph2d` that needs an answer curve, add a function in Solutions mode. Mauth stores it with `solutionOnly`, hides it and features that depend on it from Student mode without shifting function indexes, and renders only that curve in solution blue. Use focused function actions for agent edits and a paired graph only when the entire graph should differ independently.
- For a shared `geometry2d` construction that needs only a few solution additions, add points, segments, arcs, angles, or markers in Solutions mode. Mauth stores them as editable `solutionOnly` primitives, hides them from Student mode, and renders only those additions in solution blue.
- For a shared `vector2d` diagram that needs only a few solution additions, add vectors, segment labels, or angle markers in Solutions mode. Mauth stores them as editable `solutionOnly` elements, hides them and any invalid dependants from Student mode, and renders only those additions in solution blue.
- For a shared `graph3d` diagram that needs only a few solution additions, add points, segments, or dimensions in Solutions mode, or move an existing face/solid to the solution layer. Mauth hides solution elements and their dependants from Student mode while preserving the shared camera framing, and renders only the answer elements in solution blue.
- For a shared `statsChart` that needs only a few solution additions, add an editable line, points, line-and-point trace, or bars in Solutions mode. Mauth stores it in `data.series` with `solutionOnly`, hides it from Student mode, and renders only that answer series in solution blue without recolouring the base chart.
- For a shared uploaded `image` that needs only a few solution additions, add a label, ellipse, or arrow in Solutions mode. Mauth stores it in `data.annotations` with percentage coordinates and `solutionOnly`, hides it from Student mode, and renders only that answer annotation in solution blue without recolouring the bitmap or shared annotations. Use a paired solution image only when the whole bitmap must differ independently.
- For structured Penrose geometry and network diagrams, add answer points/nodes and segments/links in Solutions mode. Mauth stores them as `solutionOnly`, hides them and dependent relationships from Student mode, and renders only those answer elements and labels in solution blue. Structured two-set and three-set Venn diagrams use the same layer on region labels/values and shading while keeping fixed region slots stable in Student mode.
- Do not mix Penrose element-level solution editing with custom Advanced Substance. Return to structured data for focused editable answers, or use one paired solution diagram for custom constraints, complex construction predicates, or a substantially different completed diagram.
- Completion-table solutions keep one shared table with sparse `solutionEntries` in blank body cells and `markTicks` on that same surface. **Complete in solutions** opens the same root or nested table, Student mode hides the entries, and Solutions mode colours only those answer cells blue. Legacy paired solution tables remain readable, but agents should not create new duplicates.
- Multiple-choice solutions keep one shared choices block with `solutionAnswerIndex` set to the selected zero-based option and `markTicks` on that same surface. Student mode hides both answer metadata and ticks; Solutions mode keeps unselected options in normal styling and circles only the chosen label in solution blue. Legacy solutions-only choice copies remain supported, but agents should not create new duplicates.
- Worked-solution modules use `visibility: "solution"` and should sit next to the student space they replace.
- Student answer spaces use `visibility: "student"`.
- Do not delete existing shared diagrams during solution, marking, wording, or layout edits unless the teacher explicitly asks.
- Proof questions must be internally valid before they are committed.
- Geometry proof prompts need a mechanism, not just ingredients.
- For two-circle proof questions, the second circle must be essential through a shared tangent, touching point, common chord, shared secant, parallel chord/tangent, equal central angle, equal radius relationship, or angle relationship that transfers information between circles.
- Source-conversion work should preserve meaningful source line breaks, final answers, and stated rounding.
- Test and exam formatting should generally use one question per page. As an agent authoring judgement, inspect each rendered page independently and distribute its usable spare capacity through existing answer spaces in proportion to the marks represented on that page. Use conservative whole-line additions, leave uncertain remainder at the bottom, and verify both copies; do not expect an automatic renderer to perform this work.
- Graph authoring should infer natural domains, singularities, endpoints, and asymptotes before setting function domains and view windows. For `log`, `ln`, `log10`, `sqrt`, reciprocal/rational forms, and trigonometric asymptotes, choose `domainMin`/`domainMax` and `xMin`/`xMax`/`yMin`/`yMax` together so the curve is valid, readable, and not clipped or flattened. Graph bounds are the visible extent: axes, auto-domain functions, manual-domain functions, and grid-spanning asymptotes render to the grid, not beyond it. For simple `log`/`ln`/`log10`/`sqrt` graphs that should use the whole natural domain, prefer `domainMode: "auto"` so the renderer clamps to the valid side with a tiny mathematical epsilon and can draw the visible tail close to the asymptote. Use manual domains only for intentionally restricted intervals inside the graph bounds; do not leave rounded guard values such as `-0.96` beside an asymptote at `-1`. Draw asymptotes as separate dashed `line_segment` features with `span: "grid"`; do not draw the function on an undefined boundary. For functions with multiple branches, use separate function entries or pieces for each valid interval rather than one plotted interval crossing a singularity. Use `xAxisLabelX`/`xAxisLabelY` and `yAxisLabelX`/`yAxisLabelY` for custom built-in axis-letter placement instead of duplicate free labels.
- Do not place an outward graph-axis arrow at an endpoint that terminates at the origin. The renderer suppresses that endpoint by default. Use `showXAxisMinArrow`, `showXAxisMaxArrow`, `showYAxisMinArrow`, and `showYAxisMaxArrow` for explicit per-end control; use `showArrows: false` only when every axis arrowhead should be hidden.
- Copied coordinate graphs should use major grid lines only by default. Set `showMinorGrid: true` only when the source visibly uses minor grid lines, small squares, or fractional grid spacing. Prefer integer `xMin`/`xMax`/`yMin`/`yMax` bounds for ordinary classroom coordinate graphs; use half-unit or fractional bounds only when the source scale, required point placement, or mathematical feature genuinely needs them. Axis number labels should align to the major grid interval: `gridMajorStepX`/`gridMajorStep` for the x-axis and `gridMajorStepY`/`gridMajorStep` for the y-axis, even when the grid is hidden. Use different manual axis-label steps only when the source intentionally labels a different interval or a teacher asks for custom labels.

- For a standard test with multiple named sections, add a top-level section marker before every section, including the first. The first marker supplies the section title and section-only marks on the opening title page; each later marker creates another full title page. The markers are structural and must not be repeated as inline headings above the questions. Keep logo, school, subject, main assessment title, and question numbering shared in `frontMatter`; use a marker's `titlePage` settings only when that page needs different labels, declaration, or instructions. Marks are calculated from the following questions.
- For an investigation, use `titlePageTemplate: "investigation"` and formatting preset `"investigation"`. Do not create fake questions. Keep the task, shared criterion headings and guidance, and detailed teacher allocation rows in `frontMatter.investigation`. Student mode uses one shared standard-test title page ordered as title identity, Name/Result row, then task and general marking guidance, without a repeated header or administration grid. Teacher mode adds as many compact rubric pages as the detailed criteria need, repeating the rubric context/title/columns and showing the final total only on the last page. Use additive criteria for independent mark allocations and holistic criteria for alternative performance levels; a holistic 4/3/2/1 scale contributes 4 marks, not 10. Derive totals from the structured criteria rather than typing a separate total.

## Agent Loop

When an external agent uses these brains, the expected loop is:

1. Inspect the current document, selected module, and rendered preview.
2. Choose the smallest relevant brain set.
3. Propose structured Mauth actions when the action contract covers the edit.
4. Dry-run or preview the action batch where possible.
5. Validate and render-check the result.
6. Apply the accepted action through normal editor history/autosave.
7. Keep scratch artifacts in `workspace/`.

The implemented local bridge uses `snapshot -> actions preview -> validation -> actions apply -> browser verification`. Brain rules should teach agents to use that bridge, not raw project files, hidden React state, browser localStorage, or a provider-backed chat route.

When the snapshot contains `rendered-page-overflow`, treat it as measured evidence for the named Student or Solutions copy and targeted rendered scope. Repair page flow or the oversized editable block, then wait for the changed preview to render and read a fresh snapshot. Do not treat the warning as solution-completeness evidence or assume it remains valid after a document action.

If a workflow cannot be expressed as document state, an explicit action, a preview result, a validation result, or a reversible file operation, improve the app contract rather than relying on hidden prompt judgement.

## Checks

Use these checks before trusting broad AI-related changes:

```bash
pnpm test:web-actions
pnpm smoke:context-menu-actions
pnpm smoke:file-manager
pnpm smoke:diagram-gallery
```

Provider-backed live evals were removed with the in-app assistant. Future paid evals should be reintroduced only after the external-agent/MCP surface is explicit and cheap to test locally first.
