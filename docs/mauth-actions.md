# Mauth Action Layer

Mauth actions are the structured document-editing contract for AI-controlled authoring. The implementation lives in `apps/web/src/lib/mauthActions.ts`.

The goal is that future in-app AI, backend AI services, and human UI controls can all request the same explicit edits and receive the same deterministic result shape.

## Action Result

Every action returns:

- `ok`: whether the action was applied.
- `actionType`: the action that ran.
- `document`: included for document actions; contains the next front matter, question array, and optional formatting config.
- `questions`: the next question array.
- `changedIds`: ids affected by the action.
- `warnings`: structured warnings with code, message, and optional target id.
- `validation`: optional validator output for validation actions.
- `appliedActionTypes`: included for batches.
- `results`: included for batches when the caller needs per-action detail.
- `preview`: included for document batches run with `dryRun: true`.

The editor still owns undo/history and autosave. When an action or action batch changes the document, the React editor pushes that result through the existing history path once.

## Batches

Use `applyMauthActions` for multi-step AI edits that should behave like one document operation. Batches are atomic: if any action fails, the returned `questions` are the original questions and no partial document change should be committed.

Use `applyMauthDocumentActions` when the batch needs to touch both document-level state and question content. Batches are atomic across front matter, formatting config, and questions.

Use batches for AI operations such as setting the title page and adding a multipart question with text, diagram, answer space, and solution modules in one undoable step.

## Dry Run Preview

Use `previewMauthDocumentActions` or `applyMauthDocumentActions(..., { dryRun: true })` before applying model-generated whole-document edits. A dry run returns the proposed `document`, but the caller should not commit it to editor state until the user or AI workflow accepts it.

The dry-run `preview` summary reports:

- whether the batch is valid
- requested and attempted action counts
- action counts by action type
- changed, added, deleted, moved, reordered, and updated ids
- changed front-matter fields
- changed formatting and page-format fields
- warning counts and validation output when a validator is configured

The editor should treat dry-run output as a review/proposal object. Applying the proposal should call the same action batch again without `dryRun`, so undo/history/autosave receive a normal committed action result.

## Background Action Engine

Mauth actions are background infrastructure for the assistant and editor, not a normal teacher-facing control surface. The app should preview, validate, and apply structured action batches internally through the assistant/tool loop or through dedicated editor controls, then report the human result in plain language.

`previewMauthDocumentActions` still exists for dry runs. It should be called by the assistant/provider workflow before `applyMauthDocumentActions` so generated edits remain undoable, autosaved, and versioned like normal human edits.

The live editor document includes front matter, questions, and `formattingConfig`. That means `formatting.update` and `pageFormat.update` proposals are reviewable, undoable, autosaved, saved to project files, and reflected in screen/print preview where that setting is currently renderer-backed. Page settings and mark visibility are active renderer settings; broader style fields are persisted for the next formatting-control pass.

The visible editor surface for these document settings lives under `T` in the `Test format` panel. Use it for whole-test structure and print settings such as the high-school mathematics test preset, mark-label visibility, A4 sizing, margins, and page-break labels. Do not use document formatting actions for per-question wording, table details, diagram settings, or solution layout that belongs to specific modules.

## Assistant Tool Surface

`apps/web/src/lib/mauthAssistantTools.ts` is the narrow boundary for the in-app assistant. It wraps the action layer in explicit tools that a model can call without knowing React editor internals:

- `mauth.tools.describe`: list assistant tools and supported action types.
- `mauth.document.inspect`: return a compact document outline, module counts, visibility counts, student-space lines, diagram types, marks, front-matter fields, and formatting fields.
- `mauth.question.upsert`: create the requested question when it is exactly the next missing question, or replace it when it already exists. It supports normal free-response slots and artifact answer surfaces. Use `answerSurface: "diagram"` or `"table"` for tasks where students complete the graph/table/diagram itself, paired with `solutionDiagram` or `solutionTable` for the completed solution copy. In these modes the authoring layer does not create a separate answer-space block and places the red solution ticks beside the completed table/diagram surface. There is also a narrow safety inference for common prompts such as "complete the table" or "sketch the graph on the grid", but assistant calls should still set `answerSurface` explicitly.
- `mauth.preview.inspect`: return focused context for the current/selected or requested question, including module anchors, selected block, diagram types/alignment, per-diagram warning arrays, answer-space/solution replacement scopes, hidden `[[marks:n]]` totals, visible mark-note warnings, blank part warnings, left/right diagram beside-content hints, conservative diagram semantic warnings, and browser-rendered page/anchor metrics when the preview pane is mounted.
- `mauth.validation.run`: run document validation, solution validation, or both without changing the document.
- `mauth.actions.preview`: dry-run one or more document actions and return the proposed document plus preview summary.
- `mauth.actions.apply`: apply one or more document actions and return the next document.
- `mauth.author.replaceQuestion`: legacy alias for `mauth.question.upsert`. Keep it for backwards compatibility, but new assistant/provider prompts should use `mauth.question.upsert`.
- `mauth.author.addDiagram`: add or replace a top-level diagram in one existing question from a compact payload. Assistant-authored diagrams must provide a renderer-specific `graphConfig`; canned `standardDiagram` recipe payloads are not supported. For source scalar-product ray diagrams, the compact `vectorRayDiagram` builder is also supported and expands into ordinary `vector2d` metadata. When repairing a diagram after inspection warnings, pass `diagramId`/`blockId`/`moduleId` so the existing diagram is replaced rather than appending another diagram.
- `mauth.author.ensureSolutions`: create or resize matched student answer spaces and add solution-only worked-solution text for one or more existing questions/parts. It can also update question or part marks when repairing a marking key. `solutionText` should use hidden `[[marks:n]]` annotations at the end of mark-worthy lines; the renderer converts these to red check marks. The action layer normalises common visible mark notes, adds fallback hidden ticks when a high-level solution omits them, and raises student-space lines to the mark-based/solution-fit minimum.
- `mauth.author.adjustResponseSpaces`: resize or add student-only answer/working spaces for existing questions, parts, or subparts without rewriting question text, diagrams, or solution modules. Use this for focused layout-space requests such as "give Question 1 more working space".
- `mauth.format.apply`: apply safe high-level formatting changes without rewriting question content. Supported operations are `setPageBreakBefore`, `removePageBreakBefore`, `setDiagramAlignment`, `adjustAnswerSpace`, `moveModule`, `fitSolutionToSpace`, and `tidyQuestionSpacing`. Use it for requests such as "put part (c) on a new page", "move the diagram right", "make the solution fit", "move this module below the table", or "remove unnecessary blank space".
- `mauth.solutions.writeAll`: write or replace a whole-test solution key from a compact payload that covers every marked question, part, and subpart. It preserves existing shared diagrams, creates/resizes matched student answer spaces for free-response items, applies hidden `[[marks:n]]` ticks, blocks incomplete solution coverage, and returns a document-wide layout check result.
- `mauth.layout.check`: inspect the whole document in `student`, `solutions`, or `both` mode for missing answer spaces, missing solutions, solution-space mismatch, rendered overflow/page risks, oversized diagrams, and print-risk items. It reports repairable issues but does not mutate the document.

The OpenAI provider boundary may expose clearer task-specific function names for common teacher prompts. These are routing aliases, not new document mutation paths: `mauth_convert_source_question` maps to `mauth.question.upsert`, `mauth_make_diagram_for_question` maps to `mauth.author.addDiagram`, `mauth_write_solutions_for_questions` maps to `mauth.author.ensureSolutions`, `mauth_write_all_solutions` maps to `mauth.solutions.writeAll`, `mauth_check_document_layout` maps to `mauth.layout.check`, and `mauth_fix_question_formatting` maps to `mauth.format.apply`. Use the alias when it makes the model's next action more obvious, but keep all validation/repair behaviour in the real Mauth tools.

High-level diagram authoring also performs a cheap deterministic intent check before apply. For obvious classroom patterns, the tool rejects the wrong renderer with a repairable `arguments.diagram.graphConfig.type` issue: schematic circle/tangent/chord theorem geometry should be `geometricConstruction`, scalar-product source ray diagrams and coordinate/component vectors should be `vector2d`, histograms/column/probability charts should be `statsChart`, Venn/set diagrams should be `setDiagram`, coordinate/function graphs should be `graph2d`, and network diagrams should be `network`.

The intended AI workflow is:

1. Use focused high-level tools where they fit: `mauth.question.upsert`, `mauth.author.addDiagram`, `mauth.author.ensureSolutions`, `mauth.solutions.writeAll`, `mauth.layout.check`, `mauth.author.adjustResponseSpaces`, or `mauth.format.apply`. At the provider boundary, prefer the task-specific aliases for source conversion, diagram creation, solution writing, whole-test solution keys, layout checking, and formatting when exposed.
2. Use `mauth.preview.inspect` for one-question or selected-module checks, especially before/after diagram, answer-space, or solution-tick edits. Inspect `question.diagrams[].warnings` before claiming a diagram is correct; those warnings cover renderer mismatches, missing image sources, scalar-product vector labels and angle markers, statsChart probability/relative-frequency mistakes, missing vector2d named vectors, missing requested setDiagram shading/counts, graph2d tangent/region/asymptote requests, rendered diagram failures, and Penrose semantic issues. For Penrose circle-theorem diagrams, inspect `semanticWarnings` as well as render status: warnings such as missing `Tangent`, missing `ParallelToSegment`, missing chord segments, visible auxiliary labels, or points not on the intended circle mean the diagram should be repaired before claiming it is correct. When rendered metrics are available, use the reported page occupancy, selected-anchor boxes, diagram render status, solution-slot fit, and L-shaped response-space metrics as evidence before claiming a layout is fixed. Use `mauth.document.inspect` only for broader whole-document context or when the compact context is insufficient.
3. For broader edits, generate structured Mauth actions.
4. Preview the action batch.
5. Run the relevant validation.
6. Apply the same accepted action batch.
7. Commit the returned document through editor history/autosave.

The assistant tool layer does not own undo, autosave, files, UI selection, or provider settings. The caller must still route accepted edits through the existing editor history path so the change remains undoable, autosaved, and versioned like a human edit.

For high-level diagram edits, the frontend adapter performs an automatic post-edit check before reporting success. After `mauth.author.addDiagram` or a `mauth.question.upsert` with diagram payloads commits through history/autosave, the adapter waits for the browser preview to repaint when the preview pane is mounted, then runs `mauth.preview.inspect` for that question with fresh rendered metrics. If `question.diagrams[].warnings` or rendered preview warnings contain repairable warnings/errors, the adapter returns failed tool output with `validationIssues` and the target `diagramId` where available. The provider should retry the same high-level diagram tool once, include that `diagramId`, and provide a corrected native `graphConfig` or corrected adjacent layout. This is the standard repair path, not a teacher-facing failure.

The same post-edit inspection path now applies to focused solution, answer-space, and formatting tools. After `mauth.author.ensureSolutions`, `mauth.author.adjustResponseSpaces`, `mauth.format.apply`, or a question replacement with solution/response-space payloads commits, the adapter waits for the browser preview paint when mounted and inspects the affected question or document. Repairable warnings such as `student-space-missing`, `solution-hidden-mark-total-mismatch`, `solution-visible-mark-note`, `rendered-solution-space-overflow`, `rendered-response-space-outline-missing`, `rendered-page-overflow`, clipped diagrams, and diagram-size warnings are returned as failed tool output with `validationIssues`. Repair these once with the most specific high-level tool, preserving existing shared wording and diagrams.

## Visible Assistant Shell

Display-only mode includes a small left-side Assistant toggle. It opens a panel with:

- a normal chat input backed by `/api/assistant/chat`
- a compact provider status indicator from `/api/assistant/status`
- normal chat messages with per-request estimated token/cost summaries
- hidden tool plumbing; teachers should not see raw tool JSON, internal ids, or provider payloads

The panel calls `runMauthAssistantAdapterTool` for each tool call. That means accepted `mauth.actions.apply` edits still go through editor history/autosave, opened project files are parsed through the normal saved-test document path, and save/save-as serialises the current editor document.

The backend OpenAI provider emits direct high-level authoring tool calls for common focused requests and `mauth_tool` calls for the broader tool surface. Both are converted into this same adapter path. Future providers should do the same rather than mutating React state, project files, or DOM nodes directly.

File and revision plumbing should stay behind this adapter boundary. Safe file maintenance, such as saving a dirty active file before opening another file, refreshing file lists, carrying loaded revisions through autosave, and syncing autosave after API-level programmatic edits, should happen in the background. Teacher-facing chat should report the result briefly and ask only when a conflict cannot be resolved safely without risking data loss.

The tool description includes a recipe for school-exam front matter. AI should implement this through an atomic action batch, normally `frontMatter.update` with `frontMatter.titlePageTemplate: "exam"` and a populated `frontMatter.exam`, followed by `formatting.update` with `{ "id": "exam-booklet" }`. This is the only active exam style. Use `frontMatter.exam.sectionPreset` for the current paper: `section-one-calculator-free` or `section-two-calculator-assumed`. The selected `frontMatter.logoId` should come from the school logo bank. The structure row for the open section should use `useCurrentDocument: true` so question count and marks are automatic. Do not create title-page text, running headers, footers, cut-off notices, or supplementary pages as Question 1 content.

The product target is Codex-level Mauth document capability inside the app: complete test/question authoring, solutions, diagrams, layout repair, file operations, print checks, and validation through app-native tools. When that target is blocked by missing context, add a tool, validator, action, renderer inspection, attachment intake, or brain rule rather than teaching the model to guess hidden UI state.

For common follow-up prompts, high-level tools should avoid extra provider loops:

- "Add/include the diagram in Question 1" should normally call `mauth.author.addDiagram` with `questionNumber: 1` and a real `diagram.graphConfig`. If the existing question is a schematic geometry/circle theorem prompt, use `graphConfig.type: "geometricConstruction"` with supported Penrose Substance in `graphConfig.options.substanceSource`. For a tangent parallel to a chord, use predicates such as `CircleThrough`, `OnCircle`, `Tangent`, `ParallelToSegment`, and `Segment`. Visible labels should match the question statement; hide auxiliary centre points unless the question names them.
- If a previous diagram call returns post-edit inspection `validationIssues` with a `targetId`/`diagramId`, retry `mauth.author.addDiagram` with that `diagramId` and the corrected graphConfig. Do not append a second diagram unless the teacher explicitly asked for another diagram.
- High-level diagram payloads must be wrapped exactly as `{ "diagram": { "graphConfig": { "type": "..." } } }`, `{ "diagrams": [{ "graphConfig": { "type": "..." } }] }`, or for source scalar-product ray diagrams `{ "diagram": { "vectorRayDiagram": { "vectors": [...] } } }`. Do not put `type`, `data`, `options`, or `metadata` directly on the diagram block, and do not use `config` as an alias. The assistant boundary rejects those shapes with repairable `arguments.diagram.graphConfig` validation issues before any document mutation.
- The same high-level boundary rejects obvious diagram-intent mismatches before a renderer is asked to draw anything. Treat `arguments.diagram.graphConfig.type` issues as instructions to switch renderer and emit the native schema for that renderer, not as teacher-facing failures.
- For `graph2d`, keep bounds, size, axes/grid display fields, `functions`, and `features` directly on `graphConfig`. Only renderer data such as `data.slopeField` belongs under `data`; `options` is not where graph2d axes or size fields go. Use `domainMin`/`domainMax` and direct `color`/`strokeWidth`/`strokeStyle` fields on functions, not `domain` or `style` wrappers. Features use `kind`, not `type`, and direct `color`/`size`/`strokeWidth` fields instead of `style` wrappers. For implicit solution curves, prefer a `kind: "relation"` function over separate `sqrt(...)` branches.
- Statistical source diagrams should use `statsChart` for histograms, column graphs, probability density functions, normal curves, sample-mean distribution sketches, and relative-frequency/probability displays. Use `chartType: "density"` with `points` or paired `xValues`/`yValues` for arbitrary source density curves, `chartType: "normal"` for parameterised normal curves, and `chartType: "blankAxes"` for student sketch axes. Do not use `graph2d` for a statistical density curve just because it has coordinate-looking axes.
- "Write/add/fix the solution for Question 1" or "change this to 4 marks/remove the QED mark" should normally call `mauth.author.ensureSolutions` when the current summary contains the question text. The tool owns creating or resizing the student answer space, updating marks when supplied, preserving shared diagrams, and adding solution-only text. Put mark allocation in hidden `[[marks:n]]` line annotations, not visible `[1 mark]` prose, and make the hidden mark total match the question/part marks.
- "Give Question 1 more working space", "make part (b) 8 lines", or similar focused response-space requests should call `mauth.author.adjustResponseSpaces`. Do not use `mauth.question.upsert` for these requests, because the point is to preserve existing wording, diagrams, solutions, ids, and pagination context while changing only the student response surface.
- "Put part (c) on a new page", "remove the page break before subpart (ii)", "move the diagram right", "make the solution fit", "move this module", or "tidy the spacing in Question 4" should call `mauth.format.apply`. Do not replace the whole question for formatting-only requests.
- If a solution or response-space tool returns post-edit inspection `validationIssues`, treat them as a layout repair target rather than a failed teacher request. Use `mauth.author.adjustResponseSpaces` for overflow, missing student-space, or L-shaped response-space warnings; use `mauth.author.ensureSolutions` for hidden mark total, visible mark-note, or missing solution-slot warnings.
- "Make Question 1 from this screenshot" should normally call `mauth.question.upsert` with the visible source structure: stem text, native diagram blocks under the stem, then structured parts with the visible mathematical task in each part. A prompt like "add this question to the test" without an explicit number means append the immediate next missing question, not add a diagram to an existing question. Do not turn the diagram into prose, do not create blank part rows, and do not add worked solutions unless the teacher asks for them or the source visibly contains them. For marked written-response parts, provide at least 3 student-space lines unless the answer is a table/diagram/graph surface.
- If a source-question request with an attachment is misrouted to `mauth.author.addDiagram` and the target question does not exist, repair by switching to `mauth.question.upsert` or `mauth_convert_source_question`. Do not spend another round retrying the diagram-only tool, because the teacher is creating a question and diagram together.
- Ambiguous fresh requests should ask before mutating. If the teacher says "add a diagram" without a target, ask which question. If they say "add this question" without an attachment or pasted question content, ask what the new question should be based on. This clarification should happen before provider tool routing when possible.
- For screenshot scalar-product ray diagrams with common-origin vectors, magnitudes, right-angle markers, and angle labels but no axes, prefer `vectorRayDiagram` over hand-written raw `vector2d`. Provide each vector with a stable `id`/`name`, `length` plus `angleDeg` in standard degrees, optional `labelX`/`labelY`, and optional `lengthLabel`. Add `angleMarkers` with `from`/`to` vector ids for right-angle markers and labels such as `45^\circ`; the ids must be the two rays bounding the actual marked angle, not nearby rays. For the common source with `b` perpendicular to `d` and `c` making `45^\circ` with `d`, use `{ "from": "b", "to": "d", "rightAngle": true }` and `{ "from": "c", "to": "d", "label": "45^\\circ" }`. The app expands this into `graphConfig.type: "vector2d"` with `showAxes:false`, `showGrid:false`, `showAxisLabels:false`, `showAxisNumbers:false`, `equalScale:true`, custom vector labels, magnitude labels, and angle markers. If hand-writing raw `vector2d`, preserve source ray directions with `metadata.vector2d.vectors`; every vector entry must include `id`, `name`, `start:[x,y]`, and `components:[dx,dy]`. Do not use `network`; it is for conceptual networks. Do not use Penrose/geometricConstruction for these source ray diagrams unless the task is actually theorem geometry.
- For Penrose/geometricConstruction diagrams, declare reusable drawn sides with `NamedSegment`, then draw them with predicates such as `Segment(AB, A, B)` or `VectorSegment(beam, L, P)`. `Segment` and `VectorSegment` are not declaration types; standalone lines such as `Segment AB`, `Segment CP`, or `VectorSegment beam` will fail Penrose rendering. Labels use declaration syntax too: write `Label A $A$`, not `Label(A, $A$)`.
- If a new/source-question conversion fails inside `question.contentBlocks[].graphConfig`, especially a `metadata.vector2d.vectors` validation path, keep the repair on `mauth.question.upsert`/`mauth_convert_source_question`. Do not switch to `mauth.author.addDiagram` unless the question already exists and the failure includes a `diagramId`/`targetId` for replacing an existing diagram.
- The diagram validator rejects known-invalid native payload mistakes before apply, then render-preflights changed renderer payloads where needed. After render succeeds, assistant commit preflight also runs shared diagram inspection for hard failures: wrong renderer, missing image source, missing scalar-product vector labels/angle markers, visible axes on no-axis scalar-product vector diagrams, invalid manual probability charts, missing named vector2d metadata, missing requested set shading/counts, and conservative Penrose circle-geometry semantic issues. Treat returned `validationIssues` as the repair target and retry once with corrected native metadata/Substance or corrected renderer config.
- `mauth.preview.inspect` performs the same first-pass diagram inspection after a diagram exists. It does not replace mathematical judgement, but it catches common valid-but-wrong outputs such as a drawn line that is not declared as a tangent, a tangent not parallel to the named chord, a named chord not drawn as a segment, named points not on the same circle, an auxiliary centre label being shown when the prompt does not name it, vector-ray diagrams missing labels/angle markers, probability bars that do not sum to 1, Venn diagrams with requested shading/counts omitted, coordinate-vector diagrams missing a named vector, or graph2d diagrams missing requested tangent/region/asymptote features. When browser preview metrics are mounted, it also reports rendered failures such as failed diagram placeholders, likely label collisions, clipped diagrams, page overflows, solution-space overflow, and missing L-shaped diagram/answer-space outlines.
- The low-level action boundary also sanitises assistant-authored solution text before preview/apply. Direct `module.add`, `module.update`, `question.update`, `part.update`, or `subpart.update` payloads must still use solution-only blocks and hidden `[[marks:n]]` ticks; visible `[1 mark]`, `(1 mark)`, `Solution (5 marks)`, and `\text{[1 mark]}` notes are treated as bad assistant output and normalised or rejected.
- These successful high-level calls are terminal from the frontend's point of view. The panel should show a local result such as "Added the diagram." or "Updated the solutions." rather than paying for another provider round to summarise the obvious.

Example focused geometry diagram payload shape:

```json
{
  "questionNumber": 1,
  "diagram": {
    "graphConfig": {
      "type": "geometricConstruction",
      "options": {
        "substanceSource": "Point centre, A, B, C\nCircle omega\nLine tangentA\nNamedSegment AB, AC, BC\nLabel centre $\\,$\nLabel A $A$\nLabel B $B$\nLabel C $C$\nLabel tangentA $\\,$\nHidePoint(centre)\nCircleThrough(omega, centre, A)\nOnCircle(B, omega)\nOnCircle(C, omega)\nTangent(tangentA, omega, A)\nSegment(AB, A, B)\nSegment(AC, A, C)\nSegment(BC, B, C)\nParallelToSegment(tangentA, B, C)"
      }
    }
  },
  "placement": "beforeStudentSpace"
}
```

This is a renderer-specific payload, not a canned recipe. Assistant-authored diagrams should stay on the real diagram tool surface: choose the renderer, load the relevant diagram brain, and emit the native `graphConfig` for that renderer.

Example source scalar-product ray diagram payload shape:

```json
{
  "questionNumber": 8,
  "marks": 0,
  "questionText": "Evaluate the following scalar products exactly.",
  "diagram": {
    "diagramAlign": "center",
    "vectorRayDiagram": {
      "widthPx": 560,
      "heightPx": 380,
      "vectors": [
        { "id": "a", "length": 2, "angleDeg": 215, "lengthLabel": "2\\ \\text{units}" },
        { "id": "b", "length": 2, "angleDeg": 125, "lengthLabel": "2\\ \\text{units}" },
        { "id": "c", "length": 3, "angleDeg": 80, "lengthLabel": "3\\ \\text{units}" },
        { "id": "d", "length": 2, "angleDeg": 35, "lengthLabel": "2\\ \\text{units}" }
      ],
      "angleMarkers": [
        { "from": "b", "to": "d", "rightAngle": true },
        { "from": "c", "to": "d", "label": "45^\\circ" }
      ]
    }
  },
  "parts": [
    { "text": "$\\mathbf{a}\\cdot\\mathbf{b}$", "marks": 1, "answerSurface": "none" },
    { "text": "$\\mathbf{a}\\cdot\\mathbf{d}$", "marks": 2, "answerSurface": "none" },
    { "text": "$\\mathbf{c}\\cdot\\mathbf{d}$", "marks": 2, "answerSurface": "none" }
  ]
}
```

This is not a new renderer and not a canned diagram recipe. It is a safer high-level authoring shape that deterministically creates normal `vector2d` graph metadata for a narrow source-diagram family where raw JSON was repeatedly fragile.

## Current Actions

- `question.add`
- `question.update`
- `question.delete`
- `question.reorder`
- `frontMatter.update`
- `frontMatter.replace`
- `frontMatter.logo.set`
- `pageFormat.update`
- `formatting.update`
- `part.add`
- `part.update`
- `part.delete`
- `part.reorder`
- `part.move`
- `subpart.add`
- `subpart.update`
- `subpart.delete`
- `subpart.reorder`
- `subpart.move`
- `module.add`
- `module.update`
- `module.delete`
- `module.reorder`
- `module.move`
- `solutionSlot.add`
- `marks.update`
- `diagram.update`
- `pageBreak.set`
- `document.validation.run`
- `validation.solution.run`

Action behaviour is covered by `pnpm test:web-actions`.

## AI Authoring Rules

AI-authored edits should prefer Mauth actions over ad hoc JSON mutation whenever the edit is supported by the action layer.

Use actions for routine structural work: adding questions, adding/reordering/moving/deleting parts and subparts, changing marks, adding answer-and-solution slots, updating diagrams, deleting modules, moving or reordering modules, and setting page breaks or start-new-page flags.

Use `*.move` actions when relocating existing content between containers. These preserve the original ids and content payloads while updating the relevant mixed `itemOrder` arrays:

- `module.move`: move a text/table/diagram/choice/space module between a question, part, or subpart.
- `part.move`: move a part between questions.
- `subpart.move`: move a subpart between parts.

Move placements may target a same-kind object or a generic mixed-order item, so an AI can move a module before a part, a part before a question-level text module, or a subpart before a part-level text module without hand-editing `itemOrder`.

Use document actions for title-page and document-setting work: front-matter edits, full front-matter replacement, logo/school-name selection, page-format changes, formatting-config patches, and whole-document validation. File open/save/duplicate/delete remains a project-file API concern, not a Mauth document action.

Use direct document patches only when the action layer does not yet cover the needed edit. When this happens repeatedly, add a new action rather than teaching future AI to rely on brittle custom patches.

The action layer should stay schema-facing and deterministic. Do not put UI-only state, hidden selection behaviour, prompt wording, or renderer-specific hacks into actions.

Solution passes should end by running `validation.solution.run` or the equivalent app solution validator. Do not describe a solution pass as complete while fixable validation issues remain.
