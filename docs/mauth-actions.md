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
- `mauth.question.upsert`: create the requested question when it is exactly the next missing question, or replace it when it already exists. It supports normal free-response slots, structured `parts[].subparts`, and artifact answer surfaces. Use `answerSurface: "diagram"` or `"table"` for tasks where students complete the graph/table/diagram itself, paired with `solutionDiagram` or `solutionTable` for the completed solution copy. In these modes the authoring layer does not create a separate answer-space block and places the red solution ticks beside the completed table/diagram surface. Any `solutionText` on the same item should be an unmarked note only, not a second set of hidden `[[marks:n]]` ticks. Include `table`, `tables`, `solutionTable`, or `solutionTables` only when they contain real rows; omit empty table objects, one-cell blank placeholders, unused placeholder ids, and empty table arrays. In source-conversion tools, prefer the canonical `tables` and `solutionTables` arrays when both are exposed and do not duplicate the same table in both singular and plural fields. For given-data/source tables that are not student-completion surfaces, use the question-level `tables` array only; for given-data/source diagrams that are not student-completion surfaces, use `diagram` or `diagrams` only and keep worked answers in `solutionText`. There is also a narrow safety inference for common prompts such as "complete the table" or "sketch the graph on the grid", but assistant calls should still set `answerSurface` explicitly.

  In text and solution fields, keep currency symbols outside dollar-delimited maths: write `$51.02$ dollars`, `\$51.02`, or plain `51.02 dollars`, not `$\$51.02$`, `$1 game`, or `$0.094 per game`.

  For expected-value, fairness, long-run-profit, and advantage questions, finish `solutionText` with a direct conclusion that names the party or claim from the prompt. A computed expected value alone is not enough when the prompt asks whether someone profits, benefits, or should proceed.

  For completion-table answer surfaces, put the blank student table at the part or subpart that asks students to complete it and provide a completed `solutionTable`/`solutionTables` in the same scope. Do not use only a LaTeX array in `solutionText` as the completed table, and do not put `[[marks:n]]` ticks in `solutionText` when a `solutionTable` is present.

  Use native table fields for source and answer tables. Do not put Markdown pipe tables inside `questionText`, `parts[].text`, or `solutionText`.

- `mauth.preview.inspect`: return focused context for the current/selected or requested question, including module anchors, selected block, diagram types/alignment, per-diagram warning arrays, answer-space/solution replacement scopes, hidden `[[marks:n]]` totals, visible mark-note warnings, blank part warnings, left/right diagram beside-content hints, conservative diagram semantic warnings, and browser-rendered page/anchor metrics when the preview pane is mounted.
- `mauth.validation.run`: run document validation, solution validation, or both without changing the document.
- `mauth.actions.preview`: dry-run one or more document actions and return the proposed document plus preview summary.
- `mauth.actions.apply`: apply one or more document actions and return the next document.
- `mauth.author.replaceQuestion`: legacy alias for `mauth.question.upsert`. Keep it for backwards compatibility, but new assistant/provider prompts should use `mauth.question.upsert`.
- `mauth.author.addDiagram`: add or replace a top-level diagram in one existing question from a compact payload. Assistant-authored diagrams must provide a renderer-specific `graphConfig`; canned `standardDiagram` recipe payloads are not supported. For source scalar-product ray diagrams, the compact `vectorRayDiagram` builder is also supported and expands into ordinary `vector2d` metadata. When repairing a diagram after inspection warnings, pass `diagramId`/`blockId`/`moduleId` so the existing diagram is replaced rather than appending another diagram.
- `mauth.author.ensureSolutions`: create or resize matched student answer spaces and add solution-only worked-solution text for one or more existing questions/parts. It can also update question or part marks when repairing a marking key. `solutionText` should use hidden `[[marks:n]]` annotations at the end of mark-worthy lines; the renderer converts these to red check marks. Do not paste marking-key rubric prose such as "Indicates...", "States...", or "Determines..." after those hidden ticks. The action layer normalises common visible mark notes, adds fallback hidden ticks when a high-level solution omits them, and raises student-space lines to the mark-based/solution-fit minimum.
- `mauth.author.adjustResponseSpaces`: resize or add student-only answer/working spaces for existing questions, parts, or subparts without rewriting question text, diagrams, or solution modules. Use this for focused layout-space requests such as "give Question 1 more working space".
- `mauth.format.apply`: apply safe high-level formatting changes without rewriting question content. Supported operations are `setPageBreakBefore`, `removePageBreakBefore`, `setDiagramAlignment`, `adjustAnswerSpace`, `moveModule`, `fitSolutionToSpace`, and `tidyQuestionSpacing`. Use it for requests such as "put part (c) on a new page", "move the diagram right", "make the solution fit", "move this module below the table", or "remove unnecessary blank space".
- `mauth.settings.apply`: apply focused settings changes to the selected or explicitly targeted module without raw action JSON. It infers the module kind or diagram renderer when possible, then maps to `module.settings.update` and/or `diagram.settings.update`. Use it for prompts such as "make the selected graph wider", "turn off the grid", "make this selected angle marker dashed", "show node labels", "scale this Venn diagram", "rename this image", or "make this table three columns".
- `mauth.solutions.writeAll`: write or replace a whole-test solution key from a compact payload that covers every marked question, part, and subpart. It preserves existing shared diagrams, creates/resizes matched student answer spaces for free-response items, applies hidden `[[marks:n]]` ticks, blocks incomplete solution coverage, and returns a document-wide layout check result.
- `mauth.layout.check`: inspect the whole document in `student`, `solutions`, or `both` mode for missing answer spaces, missing solutions, solution-space mismatch, rendered overflow/page risks, oversized diagrams, and print-risk items. With `autoRepair: true`, it repairs safe mechanical issues once, such as missing student-only answer spaces, oversized editable diagram sizes, final page breaks that would create a blank trailing page, rendered page overflow caused by one clearly identified student space block, and a rendered clipped/oversized diagram only when fresh preview metrics identify exactly one editable diagram target. It leaves content generation, missing solutions, semantic diagram issues, ambiguous page-overflow repairs, and multiple rendered diagram-size warnings for the narrow owning tool.

The OpenAI provider boundary may expose clearer task-specific function names for common teacher prompts. These are routing aliases, not new document mutation paths: `mauth_convert_source_question` maps to `mauth.question.upsert`, `mauth_make_diagram_for_question` maps to `mauth.author.addDiagram`, `mauth_write_solutions_for_questions` maps to `mauth.author.ensureSolutions`, `mauth_write_all_solutions` maps to `mauth.solutions.writeAll`, `mauth_check_document_layout` maps to `mauth.layout.check`, `mauth_fix_question_formatting` maps to `mauth.format.apply`, and `mauth_update_selected_settings` maps to `mauth.settings.apply`. Use the alias when it makes the model's next action more obvious, but keep all validation/repair behaviour in the real Mauth tools.

The assistant routing taxonomy should stay small and stable:

| Request class                                       | Primary tool boundary                                                              | Brain owner                                          | Required free gate before paid eval                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Source conversion from screenshot/PDF/Word/text     | `mauth.question.upsert` or `mauth_convert_source_question`                         | Question plus Diagram/Solutions/Formatting as needed | `pnpm eval:assistant:local`; add `pnpm smoke:assistant:preview` when diagrams/renderers are involved |
| Focused diagram follow-up or diagram repair         | `mauth.author.addDiagram` or `mauth_make_diagram_for_question`                     | Diagram                                              | `pnpm smoke:assistant:self` plus the relevant local/preview renderer case                            |
| Focused solution, marks, or marking-key repair      | `mauth.author.ensureSolutions` or `mauth_write_solutions_for_questions`            | Solutions and Formatting                             | `pnpm smoke:assistant:self` and `pnpm test:web-actions`                                              |
| Whole-test solution key                             | `mauth.solutions.writeAll` or `mauth_write_all_solutions`                          | Solutions and Formatting                             | `pnpm smoke:assistant:self`; use paid confidence eval only after this is green                       |
| Layout, spacing, page-break, or response-space work | `mauth.layout.check`, `mauth.author.adjustResponseSpaces`, or `mauth.format.apply` | Formatting                                           | `pnpm smoke:assistant:self` and `pnpm test:web-actions`                                              |
| Selected module/diagram settings                    | `mauth.settings.apply` or `mauth_update_selected_settings`                         | Formatting and Diagram                               | `pnpm smoke:assistant:self` and `pnpm test:web-actions`                                              |
| File/folder/version operations                      | `mauth.files.*`                                                                    | None unless document content is edited               | `pnpm smoke:file-manager` and `pnpm test:web-actions`                                                |

Use `pnpm eval:assistant:list` to print the current machine-readable tool/eval taxonomy, live groups, local groups, and case classifications. Use `pnpm eval:assistant:benchmarks` to validate the real-exam/source-conversion benchmark manifest against the current eval cases and `mauth-workbench` crops. Live provider evals are plan-only unless the command includes `-- --allow-paid`; keep paid runs to one deliberate case unless there is a specific reason to override `--max-cases` and `--max-cost`. Paid runs append case/cost/token/repair/request-shape records to `mauth-workbench/assistant-evals/live-cost-ledger.jsonl`, and `pnpm eval:assistant:canaries` uses that ledger to select at most one stale or failing paid case per renderer family before `pnpm eval:assistant:live:canaries -- --allow-paid` spends credits. If a new failure does not fit one of these request classes, add the smallest new class or high-level tool deliberately; do not hide it as a source-specific prompt rule.

High-level diagram authoring also performs a cheap deterministic intent check before apply. For obvious classroom patterns, the tool rejects the wrong renderer with a repairable `arguments.diagram.graphConfig.type` issue: no-axis textbook geometry diagrams should be `geometry2d`, schematic circle/tangent/chord theorem geometry should be `geometricConstruction`, scalar-product source ray diagrams and coordinate/component vectors should be `vector2d`, histograms/column/probability charts should be `statsChart`, Venn/set diagrams should be `setDiagram`, coordinate/function graphs should be `graph2d`, and network diagrams should be `network`.

Source-conversion aliases keep provider payloads narrow before they reach the app. Multipart source questions should put marks on parts/subparts and keep top-level `marks` at `0`; the provider-facing `mauth_convert_source_question` schema does not expose `questionMarks`. The API and high-level authoring boundary also prune unsupported `graph3d.metadata` fields so only `metadata.view3d.{az,el,bank}` survives before validation, and normalize provider `graph3d` aliases such as `data.vertices`, `data.edges`, `data.surfaces`, `data.dimensionLines`, or face `vertices` arrays to canonical `points`, `segments`, `solids`, and `dimensions`.

The intended AI workflow is:

1. Use focused high-level tools where they fit: `mauth.question.upsert`, `mauth.author.addDiagram`, `mauth.author.ensureSolutions`, `mauth.solutions.writeAll`, `mauth.layout.check`, `mauth.author.adjustResponseSpaces`, `mauth.format.apply`, or `mauth.settings.apply`. At the provider boundary, prefer the task-specific aliases for source conversion, diagram creation, solution writing, whole-test solution keys, selected settings, layout checking, and formatting when exposed.
2. Use `mauth.preview.inspect` for one-question or selected-module checks, especially before/after diagram, answer-space, or solution-tick edits. Inspect `question.diagrams[].warnings` before claiming a diagram is correct; those warnings cover renderer mismatches, missing image sources, scalar-product vector labels, angle markers, TeX-safe label strings, label placement, statsChart probability/relative-frequency mistakes, missing vector2d named vectors, missing requested setDiagram shading/counts, graph2d tangent/region/asymptote requests, rendered diagram failures, likely label collisions, and Penrose semantic issues. For Penrose circle-theorem diagrams, inspect `semanticWarnings` as well as render status: warnings such as missing `Tangent`, missing `ParallelToSegment`, missing chord segments, visible auxiliary labels, or points not on the intended circle mean the diagram should be repaired before claiming it is correct. When rendered metrics are available, use the reported page occupancy, selected-anchor boxes, diagram render status, solution-slot fit, and L-shaped response-space metrics as evidence before claiming a layout is fixed. Use `mauth.document.inspect` only for broader whole-document context or when the compact context is insufficient.
3. For broader edits, generate structured Mauth actions.
4. Preview the action batch.
5. Run the relevant validation.
6. Apply the same accepted action batch.
7. Commit the returned document through editor history/autosave.

The assistant tool layer does not own undo, autosave, files, UI selection, or provider settings. The caller must still route accepted edits through the existing editor history path so the change remains undoable, autosaved, and versioned like a human edit.

When rendered feedback reports likely label collisions, repair label placement without changing the mathematical object. For `graph2d` and `vector2d`, move `labelX`/`labelY` or free-label feature coordinates; for `graph3d`, prefer camera/view or non-structural dimension/helper placement adjustments over moving named vertices, edges, faces, or angle rays.

For high-level diagram edits, the frontend adapter performs an automatic post-edit check before reporting success. After `mauth.author.addDiagram` or a `mauth.question.upsert` with diagram payloads commits through history/autosave, the adapter waits for the browser preview to repaint when the preview pane is mounted, then runs `mauth.preview.inspect` for that question with fresh rendered metrics. If `question.diagrams[].warnings` or rendered preview warnings contain repairable warnings/errors, the adapter returns failed tool output with `validationIssues` and the target `diagramId` where available. The provider should retry the same high-level diagram tool once, include that `diagramId`, and provide a corrected native `graphConfig` or corrected adjacent layout. This is the standard repair path, not a teacher-facing failure.

The same post-edit inspection path now applies to focused solution, answer-space, and formatting tools. After `mauth.author.ensureSolutions`, `mauth.author.adjustResponseSpaces`, `mauth.format.apply`, or a question replacement with solution/response-space payloads commits, the adapter waits for the browser preview paint when mounted and inspects the affected question or document. Repairable warnings such as `student-space-missing`, `solution-hidden-mark-total-mismatch`, `solution-visible-mark-note`, `rendered-solution-space-overflow`, `rendered-response-space-outline-missing`, `rendered-page-overflow`, clipped diagrams, and diagram-size warnings are returned as failed tool output with `validationIssues`. Repair these once with the most specific high-level tool, preserving existing shared wording and diagrams.

Assistant-facing tool output must remain state-aware in the visible panel. A successful local Mauth tool result can show as committed/completed. A failed preflight result should show that no document commit happened. A post-edit inspection failure should show that the edit committed but needs repair. A semantic-review result should show that the edit committed but still needs review. Provider final text should not hide or override those local states.

## Visible Assistant Shell

Display-only mode includes a small left-side Assistant toggle. It opens a panel with:

- a normal chat input backed by `/api/assistant/chat`
- a removable active-target card for context-menu or current-selection targets, keeping the teacher request textarea free of `@mauth[...]` reference plumbing while still letting the teacher jump back to the targeted module
- a compact provider status indicator from `/api/assistant/status`
- local tool-result summaries that show commit state, target, changed item count, repair/review status, and a teacher-approved `Try repair`/`Review result` path for incomplete local outcomes
- normal chat messages with per-request estimated token/cost summaries
- hidden tool plumbing; teachers should not see raw tool JSON, internal ids, or provider payloads

The panel calls `runMauthAssistantAdapterTool` for each tool call. That means accepted `mauth.actions.apply` edits still go through editor history/autosave, opened project files are parsed through the normal saved-test document path, and save/save-as serialises the current editor document.

The backend OpenAI provider emits direct high-level authoring tool calls for common focused requests and `mauth_tool` calls for the broader tool surface. Both are converted into this same adapter path. Future providers should do the same rather than mutating React state, project files, or DOM nodes directly.

Fresh read-only assistant requests such as "inspect the test", "inspect this diagram", "show preview warnings", "run validation", broad layout checks, help prompts, and simple clarification prompts should stay on native zero-token routes before provider routing. The backend may return local tool calls for `mauth.document.inspect`, `mauth.preview.inspect`, `mauth.validation.run`, or `mauth.layout.check` without requiring an OpenAI key. Broad layout/print checks should call `mauth.layout.check` with `autoRepair: true` so safe deterministic repairs happen before the visible result. If that local layout repair commits changes and the preview pane is mounted, the frontend waits for a fresh preview paint and refreshes the layout result before showing the final issue count. The frontend should treat successful local tool outputs as terminal visible results rather than sending them back to the provider just to summarize them; only remaining repair or authoring follow-ups should spend provider tokens.

File and revision plumbing should stay behind this adapter boundary. Safe file maintenance, such as saving a dirty active file before opening another file, refreshing file lists, carrying loaded revisions through autosave, and syncing autosave after API-level programmatic edits, should happen in the background. Teacher-facing chat should report the result briefly and ask only when a conflict cannot be resolved safely without risking data loss.

The tool description includes a recipe for school-exam front matter. AI should implement this through an atomic action batch, normally `frontMatter.update` with `frontMatter.titlePageTemplate: "exam"` and a populated `frontMatter.exam`, followed by `formatting.update` with `{ "id": "exam-booklet" }`. This is the only active exam style. Use `frontMatter.exam.sectionPreset` for the current paper: `section-one-calculator-free` or `section-two-calculator-assumed`. The selected `frontMatter.logoId` should come from the school logo bank. The structure row for the open section should use `useCurrentDocument: true` so question count and marks are automatic. Do not create title-page text, running headers, footers, cut-off notices, or supplementary pages as Question 1 content.

The product target is Codex-level Mauth document capability inside the app: complete test/question authoring, solutions, diagrams, layout repair, file operations, print checks, and validation through app-native tools. When that target is blocked by missing context, add a tool, validator, action, renderer inspection, attachment intake, or brain rule rather than teaching the model to guess hidden UI state.

For common follow-up prompts, high-level tools should avoid extra provider loops:

- "Add/include the diagram in Question 1" should normally call `mauth.author.addDiagram` with `questionNumber: 1` and a real `diagram.graphConfig`. If the existing question is a schematic geometry/circle theorem prompt, use `graphConfig.type: "geometricConstruction"` with supported Penrose Substance in `graphConfig.options.substanceSource`. For a tangent parallel to a chord, use predicates such as `CircleThrough`, `OnCircle`, `Tangent`, `ParallelToSegment`, and `Segment`. Visible labels should match the question statement; hide auxiliary centre points unless the question names them.
- If a previous diagram call returns post-edit inspection `validationIssues` with a `targetId`/`diagramId`, retry `mauth.author.addDiagram` with that `diagramId` and the corrected graphConfig. Do not append a second diagram unless the teacher explicitly asked for another diagram.
- High-level diagram payloads must be wrapped exactly as `{ "diagram": { "graphConfig": { "type": "..." } } }`, `{ "diagrams": [{ "graphConfig": { "type": "..." } }] }`, or for source scalar-product ray diagrams `{ "diagram": { "vectorRayDiagram": { "vectors": [...] } } }`. Use exactly one of `diagram` or `diagrams` in a question payload; for multiple source diagrams, use `diagrams` and omit `diagram`. Some source-conversion schemas expose only `diagrams` when multiple renderers are expected. Do not put `type`, `data`, `options`, or `metadata` directly on the diagram block, and do not use `config` as an alias. The assistant boundary rejects those shapes with repairable `arguments.diagram.graphConfig` validation issues before any document mutation.
- When a source places multiple diagrams side by side, use `diagrams` with `diagramLayout: "columns"` and `diagramColumns` set to 2, 3, or 4. The authoring layer wraps those diagrams in a real columns module so preview/layout checks see the same structure the paper intended; do not stack them or fake columns with blank space.
- The same high-level boundary rejects obvious diagram-intent mismatches before a renderer is asked to draw anything. Treat `arguments.diagram.graphConfig.type` issues as instructions to switch renderer and emit the native schema for that renderer, not as teacher-facing failures.
- For `graph2d`, keep bounds, size, axes/grid display fields, `functions`, and `features` directly on `graphConfig`. Only renderer data such as `data.slopeField` or `data.polarGrid` belongs under `data`; `options` is not where graph2d axes or size fields go. For Argand polar-guide backgrounds, use `data.polarGrid` with `radii`, `angleLinesDeg`, `radius`, `color`, and `strokeWidth` instead of repeating every guide circle and radial guide line as separate functions/features; `angleLinesDeg` stores undirected guide-line orientations, so list each orientation once in `[0,180)`, not both `theta` and `theta+180`. For slope fields, put any source point where the student must calculate or draw a slope segment in `data.slopeField.highlightedPoints`; a separate point feature alone is not enough. Use `expression` for every function or relation equation; do not use `equation`. Use `domainMin`/`domainMax` and direct `color`/`strokeWidth`/`strokeStyle` fields on functions, not `domain` or `style` wrappers. Functions use only `kind: "expression"`, `kind: "piecewise"`, or `kind: "relation"`; implicit equations must use `kind: "relation"`, not `kind: "implicit"`. Use `gridMajorStep`/`gridMinorStep` for grid spacing; do not emit ignored fields such as `axisLabels` or `gridStep`. Features use `kind`, not `type`; line annotations should use `kind: "line_segment"` with `x1`/`y1`/`x2`/`y2`; standalone graph angle markings should use `kind: "angle_marker"` with `x`/`y` for the vertex, `x1`/`y1` and `x2`/`y2` for the two arms, `size` for radius, and optional `rightAngle: true`, not fake function curves. Shaded regions and loci should reference boundary functions with exact supported region feature kinds such as `region_curve_axis`, `region_between_curves`, or `region_clipped_by_curve`; use `xMin`/`xMax` region bounds and `fillOpacity`. For implicit solution curves, prefer a `kind: "relation"` function over separate `sqrt(...)` branches.
- For source-faithful no-axis 2D geometry sketches, use `graphConfig.type: "geometry2d"` instead of many tiny graph2d feature rows. Use `data.points` for named coordinates, `data.segments` with `from`/`to` point ids, `data.arcs` with `center`/`from`/`to` point ids, `data.angles` with three point ids `[from, vertex, to]` plus `radius`/`arcCount`/`label` when the angle itself should be drawn, and `data.decorations` with `kind: "equalLength" | "equalAngle" | "rightAngle"` for same-length ticks, matching angle arcs, and perpendicular boxes. Decorations can target declared segment/angle ids or direct point references: `equalLength` accepts `pointPairs: [["A","B"],["C","D"]]`, `equalAngle` accepts `anglePoints: [["A","B","C"],["D","E","F"]]`, and `rightAngle` accepts `points: ["A","B","C"]`.
- For composite area diagrams made from ordinary 2D shapes such as sectors, triangles, rectangles, and circles, use compact native `geometry2d` primitives with axes and grids hidden. Use black linework and black labels unless the teacher explicitly requests colour. Label named vertices, dimensions, and required angle/right-angle markers only; do not add decorative words such as `sector` or `triangle` inside regions unless those words appear in the source diagram. Draw shared internal boundaries and construction/helper lines as dashed segments, while outside edges remain solid. Keep one-question composite diagrams conservative in size, roughly `widthPx` 320-380 and `heightPx` 260-320 unless the source needs more room.
- For `graph3d`, store source solids as real renderer data: named vertices/points in `data.points`, visible edges/diagonals/named lines and angle/vector rays in `data.segments`, polygon faces in `data.faces` as `{ points: [...] }` entries, curved solids in `data.solids` with `kind: "cone" | "cylinder" | "sphere" | "circle" | "sphereCap"`, top-level `widthPx`/`heightPx`, and the view in `metadata.view3d` with numeric `az`, `el`, and `bank` in renderer/radian-style units, not degrees. Use `points` arrays for faces, not `vertices` arrays. Preserve source line/ray/vector notation in part text and graph3d segment labels: a source line or main diagonal labelled `BT` or `\overleftrightarrow{BT}` should stay as line notation, not become `\overrightarrow{BT}`. Reserve `\overrightarrow` and `\vec` for directed vectors when the source uses directed-vector notation. Do not paste PDF-extraction control characters for line symbols or Greek parameters; write `\overleftrightarrow{BT}`, `\lambda`, and `\mu` explicitly. For pyramids, include the base face plus every triangular side face rather than only edge lines; for a square pyramid ABCD with apex E, that means ABCD plus ABE, BCE, CDE, and DAE. If the source or part text names an angle, the middle letter is the vertex and both actual bounding segments/rays must be explicit. For `\angle DMF`, include `DM` and `MF`; if `M` is a midpoint on `EF`, drawing only the longer `EF` edge does not preserve the ray `MF`, and midpoint-construction segments such as `AF` and `FB` do not preserve it either. For curved solids, use `renderStyle: "surface"` for filled surfaces, `renderStyle: "wireframe"` for mesh-style solids, or `renderStyle: "outline"` for clean outline-only sketches. Use `data.dimensions` for labelled annotation lines such as height `h` and radius `r` with `{ from, to, label, strokeStyle? }`, rather than pretending dimension annotations are structural edges. For spherical caps, use `kind: "sphereCap"` with `center`, `radius`, `height`/`depth`, and `axis`/`normal` rather than a full-sphere placeholder, and preserve a visible segment/dimension label `$h$` when the source names cap depth `h`. Use `show: false` to hide helper graph3d points/segments/solids, not `visible: false`. Use segment or dimension `strokeStyle: "dashed"` or `dashed: true` for hidden/guide lines; do not use segment `style`. Do not use nested `metadata.view3d.camera.eye`, `metadata.widthPx`, `metadata.heightPx`, `metadata.axisLabels`, `metadata.showAxes`, `metadata.showGrid`, or `xAxis`/`yAxis`/`zAxis` helper points/segments; those fields are not read by the graph3d renderer or duplicate renderer-owned axes.
- Statistical source diagrams should use `statsChart` for histograms, column graphs, probability density functions, normal curves, sample-mean distribution sketches, and relative-frequency/probability displays. Put every statsChart DSL field under `graphConfig.data`, including `chartType`, `dataMode`, `xValues`, `frequencies`/`probabilities`, `values`, `points`, `range`/`yRange`, `binSize`, `barType`, `yAxisMode`, `xLabel`, and `yLabel`; do not put those fields directly on `graphConfig`. Use `chartType: "density"` with sparse visible/source anchor `points` or paired `xValues`/`yValues` for arbitrary source density curves, `chartType: "normal"` for parameterised normal curves, and `chartType: "blankAxes"` for student sketch axes. Do not invent extra smooth/normal density points unless the source gives a parameterised normal curve. For visible histogram/column counts, use `dataMode: "manualFrequencies"` with matching `xValues` and `frequencies`; do not put counts into `values` unless they are raw observations. For manual-frequency histograms with centred `xValues` and `binSize`, set `range` to the bin-edge span from first `xValue - binSize/2` to last `xValue + binSize/2` unless the source axes show another exact range; do not pad the range for aesthetics. Preserve source chart labels, range/yRange, bin size, bar type, y-axis mode, data mode, density points, and bar heights when shown. Do not use `graph2d` for a statistical density curve just because it has coordinate-looking axes.
- "Write/add/fix the solution for Question 1" or "change this to 4 marks/remove the QED mark" should normally call `mauth.author.ensureSolutions` when the current summary contains the question text. The tool owns creating or resizing the student answer space, updating marks when supplied, preserving shared diagrams, and adding solution-only text. Put mark allocation in hidden `[[marks:n]]` line annotations, not visible `[1 mark]` prose, and make the hidden mark total match the question/part marks.
- If the solution copy still visibly contains a student answer space, treat that as an unpaired missing-solution slot. Repair with `mauth.author.ensureSolutions` or `mauth.solutions.writeAll`; do not delete the answer space to make the solution copy look shorter.
- "Give Question 1 more working space", "make part (b) 8 lines", or similar focused response-space requests should call `mauth.author.adjustResponseSpaces`. Do not use `mauth.question.upsert` for these requests, because the point is to preserve existing wording, diagrams, solutions, ids, and pagination context while changing only the student response surface.
- "Put part (c) on a new page", "remove the page break before subpart (ii)", "move the diagram right", "make the solution fit", "move this module", or "tidy the spacing in Question 4" should call `mauth.format.apply`. Do not replace the whole question for formatting-only requests.
- If a solution or response-space tool returns post-edit inspection `validationIssues`, treat them as a layout repair target rather than a failed teacher request. Use `mauth.author.adjustResponseSpaces` for overflow, missing student-space, or L-shaped response-space warnings; use `mauth.author.ensureSolutions` for hidden mark total, visible mark-note, or missing solution-slot warnings.
- "Make Question 1 from this screenshot" should normally call `mauth.question.upsert` with the visible source structure: stem text, native diagram blocks under the stem, then structured parts with the visible mathematical task in each part. Preserve nested items such as `(f)(i)` and `(f)(ii)` as `parts[].subparts` with their own marks, answer spaces, and solutions. A prompt like "add this question to the test" without an explicit number means append the immediate next missing question, not add a diagram to an existing question. Do not turn the diagram into prose, do not create blank part rows, and do not add worked solutions unless the teacher asks for them or the source visibly contains them. For marked written-response parts, provide at least 3 student-space lines unless the answer is a table/diagram/graph surface.
- If a source-question request with an attachment is misrouted to `mauth.author.addDiagram` and the target question does not exist, repair by switching to `mauth.question.upsert` or `mauth_convert_source_question`. Do not spend another round retrying the diagram-only tool, because the teacher is creating a question and diagram together.
- Ambiguous fresh requests should ask before mutating. If the teacher says "add a diagram" without a target, ask which question. If they say "add this question" without an attachment or pasted question content, ask what the new question should be based on. This clarification should happen before provider tool routing when possible.
- For screenshot scalar-product ray diagrams with common-origin vectors, magnitudes, right-angle markers, and angle labels but no axes, prefer `vectorRayDiagram` over hand-written raw `vector2d`. Provide each vector with a stable `id`/`name`, `length` plus `angleDeg` in standard degrees, and optional `lengthLabel`; leave manual label positions unset during source conversion so automatic placement owns the first render. Add `angleMarkers` with `from`/`to` vector ids for right-angle markers and labels such as `45^\circ`; the ids must be the two rays bounding the actual marked angle, not nearby or merely adjacent rays. Nested markings are valid, so a right-angle square can span two outer rays while another labelled ray lies inside that 90-degree sector. For the common source with `b` perpendicular to `d` and `c` making `45^\circ` with `d`, use `{ "from": "b", "to": "d", "rightAngle": true }` and `{ "from": "c", "to": "d", "label": "45^\\circ" }`. The compact builder normalises common label variants such as `2 units`, `2\text{units}`, and `45°` into MathJax-safe labels, but raw `vector2d` should use explicit TeX-safe strings such as `2\\ \\text{units}` and `45^\\circ`. Preview inspection rejects unsafe raw vector labels like plain `2 units` or `45°` so the repair target is clear. The app expands this into `graphConfig.type: "vector2d"` with `showAxes:false`, `showGrid:false`, `showAxisLabels:false`, `showAxisNumbers:false`, `equalScale:true`, custom vector labels, magnitude labels, and angle markers. It rejects right-angle or labelled angle markers whose referenced rays do not match the declared geometry, so repair vector angles/components or marker endpoints instead of leaving the marker in the wrong corner. If hand-writing raw `vector2d`, preserve source ray directions with `metadata.vector2d.vectors`; every vector entry must include `id`, `name`, `start:[x,y]`, and `components:[dx,dy]`. Do not use `network`; it is for conceptual networks. Do not use Penrose/geometricConstruction for these source ray diagrams unless the task is actually theorem geometry.
- For Penrose/geometricConstruction diagrams, declare reusable drawn sides with `NamedSegment`, then draw them with predicates such as `Segment(AB, A, B)` or `VectorSegment(beam, L, P)`. `Segment` and `VectorSegment` are not declaration types; standalone lines such as `Segment AB`, `Segment CP`, or `VectorSegment beam` will fail Penrose rendering. Labels use declaration syntax too: write `Label A $A$`, not `Label(A, $A$)`.
- If a new/source-question conversion fails inside `question.contentBlocks[].graphConfig`, especially a `metadata.vector2d.vectors` validation path, keep the repair on `mauth.question.upsert`/`mauth_convert_source_question`. Do not switch to `mauth.author.addDiagram` unless the question already exists and the failure includes a `diagramId`/`targetId` for replacing an existing diagram.
- The diagram validator rejects known-invalid native payload mistakes before apply, then render-preflights changed renderer payloads where needed. After render succeeds, assistant commit preflight also runs shared diagram inspection for hard failures: wrong renderer, missing image source, missing scalar-product vector labels/angle markers, visible axes or unsafe raw labels on no-axis scalar-product vector diagrams, invalid manual probability charts, missing named vector2d metadata, missing requested set shading/counts, and conservative Penrose circle-geometry semantic issues. Treat returned `validationIssues` as the repair target and retry once with corrected native metadata/Substance or corrected renderer config.
- `mauth.preview.inspect` performs the same first-pass diagram inspection after a diagram exists. It does not replace mathematical judgement, but it catches common valid-but-wrong outputs such as a drawn line that is not declared as a tangent, a tangent not parallel to the named chord, a named chord not drawn as a segment, named points not on the same circle, an auxiliary centre label being shown when the prompt does not name it, vector-ray diagrams missing labels/angle markers, probability bars that do not sum to 1, Venn diagrams with requested shading/counts omitted, coordinate-vector diagrams missing a named vector, graph2d diagrams missing requested tangent/region/asymptote features, or source graph2d diagrams whose explicit equations/domains/coordinate points/axes do not match the question text. When browser preview metrics are mounted, it also reports rendered failures such as failed diagram placeholders, likely label collisions, clipped diagrams, page overflows, solution-space overflow, and missing L-shaped diagram/answer-space outlines.
- The low-level action boundary also sanitises assistant-authored solution text before preview/apply. Direct `module.add`, `module.update`, `question.update`, `part.update`, or `subpart.update` payloads must still use solution-only blocks and hidden `[[marks:n]]` ticks; visible `[1 mark]`, `(1 mark)`, `Solution (5 marks)`, and `\text{[1 mark]}` notes are treated as bad assistant output and normalised or rejected.
- These successful high-level calls are terminal from the frontend's point of view. The panel should show a local result such as "Added the diagram." or "Updated the solutions." rather than paying for another provider round to summarise the obvious. Read-only inspect, validation, and layout-check turns should likewise use local tool-result summaries first and spend provider tokens only for requested repairs or interpretation that cannot be done deterministically.

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
- `module.settings.update`
- `module.delete`
- `module.reorder`
- `module.move`
- `solutionSlot.add`
- `marks.update`
- `diagram.update`
- `diagram.settings.update`
- `pageBreak.set`
- `document.validation.run`
- `validation.solution.run`

Action behaviour is covered by `pnpm test:web-actions`.

## AI Authoring Rules

AI-authored edits should prefer Mauth actions over ad hoc JSON mutation whenever the edit is supported by the action layer.

Use actions for routine structural work: adding questions, adding/reordering/moving/deleting parts and subparts, changing marks, adding answer-and-solution slots, updating diagrams, deleting modules, moving or reordering modules, changing module/diagram settings, and setting page breaks or start-new-page flags.

Use `module.settings.update` for targeted module controls instead of raw `module.update` patches when possible. It covers space line counts, table rows/columns/alignment, column counts, choice labels/layout, and diagram module alignment/text-side settings.

Use `diagram.settings.update` for targeted renderer controls instead of replacing a full `graphConfig` when the diagram content should be preserved. It covers graph2d/geometry2d/vector2d bounds, size, display flags, and vector label style; selected `geometry2d` primitive fields through `settings.primitive` for points, segments, arcs, angles, and markers; graph3d size and view; statsChart size/grid/fill; Penrose scale/original/resample; network preset and node dot/label visibility; setDiagram labels/count presets and region shading; and image name/alt/size. The action fails if the target module is not a diagram, if the requested renderer does not match the existing diagram, or if the requested geometry primitive cannot be found.

Use `*.move` actions when relocating existing content between containers. These preserve the original ids and content payloads while updating the relevant mixed `itemOrder` arrays:

- `module.move`: move a text/table/diagram/choice/space module between a question, part, or subpart.
- `part.move`: move a part between questions.
- `subpart.move`: move a subpart between parts.

Move placements may target a same-kind object or a generic mixed-order item, so an AI can move a module before a part, a part before a question-level text module, or a subpart before a part-level text module without hand-editing `itemOrder`.

Use document actions for title-page and document-setting work: front-matter edits, full front-matter replacement, logo/school-name selection, page-format changes, formatting-config patches, and whole-document validation. File open/save/duplicate/delete remains a project-file API concern, not a Mauth document action.

Use direct document patches only when the action layer does not yet cover the needed edit. When this happens repeatedly, add a new action rather than teaching future AI to rely on brittle custom patches.

The action layer should stay schema-facing and deterministic. Do not put UI-only state, hidden selection behaviour, prompt wording, or renderer-specific hacks into actions.

Solution passes should end by running `validation.solution.run` or the equivalent app solution validator. Do not describe a solution pass as complete while fixable validation issues remain.
