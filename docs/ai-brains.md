# AI Rule Brains

Mauth Studio uses small, composable AI rule brains instead of one large prompt. A brain is a focused rule set that operates on the shared Mauthdown/test schema.

The brain configs live in `configs/ai-brains/`:

- `question.json`: wording, curriculum fit, marks intent, and question structure.
- `formatting.json`: page flow, spaces, page breaks, title pages, and print layout.
- `diagram.json`: JSXGraph, Penrose, and Plotly diagram specs.
- `solutions.json`: worked solutions, answer keys, and solution-copy rules.

## How To Compose Them

Use only the brains needed for the task.

For example:

- Build a new question with a graph: `question` + `diagram` + `formatting`.
- Make a PDF-friendly layout pass: `formatting` only.
- Add a worked-solution version: `solutions` + `formatting`.
- Generate a geometry diagram: `diagram` only, unless wording also needs to change.

The brains should not mutate each other's responsibilities. For example, the Diagram Brain may add a Penrose diagram block, but it should not rewrite the question prompt. The Formatting Brain may remove filler space before a page break, but it should not change the maths.

For solution copies, the Solutions Brain can request small diagram additions when they make the marking clearer. The Diagram Brain owns the actual diagram patch, for example adding red intersection points, dashed guide lines, and labelled bounds as structured graph features.

## Update Policy

Update a brain when a decision should become future behaviour, not when it is a one-off preference for the current test. Good brain rules are durable, small, and schema-facing: they describe what block or option to use, why it matters, and which brain owns it.

Avoid brain bloat. Do not add examples that only repeat existing rules, source-specific wording, or temporary layout fixes. If a rule affects rendering, import/export, diagrams, or solutions, update the relevant human docs at the same time so future agents and humans read the same contract.

Current durable conventions:

- Use `[[marks:n]]` for solution-copy mark ticks.
- Solution text aligns with the content column for its question, part, or subpart.
- Solution-copy graph annotations use editable graph features such as red points, labels, and `line_segment` guide lines.
- Side-by-side solution text beside left/right diagrams uses `diagramTextSide`, not improvised text wrapping.
- PDF export uses the same A4 preview layout as the visible test preview.

## Runtime Plan

When an AI API is added, the service should load `configs/ai-brains/index.json`, select the requested brain configs, and pass them beside the current Mauthdown/test JSON. The AI output should be a structured patch or replacement test document, not free-form instructions.

The document schema remains the source of truth. Brains are guidance for authoring and editing, not a second storage model.
