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
- Blank completion tables and sketch, draw, label, shade, or circle surfaces are response surfaces. Pair the student surface with a completed solution table or diagram rather than writing the answer only as prose underneath.
- Completed solution tables keep the grid, row/column labels, and given values in normal styling. Only the student-entry answer cells are solution coloured.
- Worked-solution modules use `visibility: "solution"` and should sit next to the student space they replace.
- Student answer spaces use `visibility: "student"`.
- Do not delete existing shared diagrams during solution, marking, wording, or layout edits unless the teacher explicitly asks.
- Proof questions must be internally valid before they are committed.
- Geometry proof prompts need a mechanism, not just ingredients.
- For two-circle proof questions, the second circle must be essential through a shared tangent, touching point, common chord, shared secant, parallel chord/tangent, equal central angle, equal radius relationship, or angle relationship that transfers information between circles.
- Source-conversion work should preserve meaningful source line breaks, final answers, and stated rounding.
- School exam booklet formatting should generally use one question per page and distribute leftover page space through existing part/subpart answer spaces, weighted toward parts worth more marks.
- Graph authoring should infer natural domains, singularities, endpoints, and asymptotes before setting function domains and view windows. For `log`, `ln`, `log10`, `sqrt`, reciprocal/rational forms, and trigonometric asymptotes, choose `domainMin`/`domainMax` and `xMin`/`xMax`/`yMin`/`yMax` together so the curve is valid, readable, and not clipped or flattened. Graph bounds are the visible extent: axes, auto-domain functions, manual-domain functions, and grid-spanning asymptotes render to the grid, not beyond it. For simple `log`/`ln`/`log10`/`sqrt` graphs that should use the whole natural domain, prefer `domainMode: "auto"` so the renderer clamps to the valid side with a tiny mathematical epsilon and can draw the visible tail close to the asymptote. Use manual domains only for intentionally restricted intervals inside the graph bounds; do not leave rounded guard values such as `-0.96` beside an asymptote at `-1`. Draw asymptotes as separate dashed `line_segment` features with `span: "grid"`; do not draw the function on an undefined boundary. For functions with multiple branches, use separate function entries or pieces for each valid interval rather than one plotted interval crossing a singularity. Use `xAxisLabelX`/`xAxisLabelY` and `yAxisLabelX`/`yAxisLabelY` for custom built-in axis-letter placement instead of duplicate free labels.
- Copied coordinate graphs should use major grid lines only by default. Set `showMinorGrid: true` only when the source visibly uses minor grid lines, small squares, or fractional grid spacing. Axis number labels should align to major grid lines; auto mode may skip major grid lines for readability but should not place labels between major grid lines. Use manual axis-label steps only when the source intentionally labels a different interval or a teacher asks for custom labels.

## Agent Loop

When an external agent uses these brains, the expected loop is:

1. Inspect the current document, selected module, and rendered preview.
2. Choose the smallest relevant brain set.
3. Propose structured Mauth actions when the action contract covers the edit.
4. Dry-run or preview the action batch where possible.
5. Validate and render-check the result.
6. Apply the accepted action through normal editor history/autosave.
7. Keep scratch artifacts in `workspace/`.

As the local agent bridge is built, this loop should become `snapshot -> actions preview -> validation -> actions apply -> browser verification`. Brain rules should teach agents to use that bridge, not raw project files, hidden React state, browser localStorage, or a provider-backed chat route.

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
