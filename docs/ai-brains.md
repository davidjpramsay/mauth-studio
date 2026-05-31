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
- Do not emit `\(...\)`, `\[...\]`, escaped-dollar artefacts, or currency symbols inside maths delimiters.
- Use hidden `[[marks:n]]` annotations for solution-copy mark ticks.
- Every marked free-response item needs a student response surface.
- Ordinary question text, tables, choices, and given diagrams are shared between student and solution copies.
- Worked-solution modules use `visibility: "solution"` and should sit next to the student space they replace.
- Student answer spaces use `visibility: "student"`.
- Do not delete existing shared diagrams during solution, marking, wording, or layout edits unless the teacher explicitly asks.
- Proof questions must be internally valid before they are committed.
- Geometry proof prompts need a mechanism, not just ingredients.
- For two-circle proof questions, the second circle must be essential through a shared tangent, touching point, common chord, shared secant, parallel chord/tangent, equal central angle, equal radius relationship, or angle relationship that transfers information between circles.
- Source-conversion work should preserve meaningful source line breaks, final answers, and stated rounding.

## Agent Loop

When an external agent uses these brains, the expected loop is:

1. Inspect the current document, selected module, and rendered preview.
2. Choose the smallest relevant brain set.
3. Propose structured Mauth actions when the action contract covers the edit.
4. Dry-run or preview the action batch where possible.
5. Validate and render-check the result.
6. Apply the accepted action through normal editor history/autosave.
7. Keep scratch artifacts in `workspace/`.

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
