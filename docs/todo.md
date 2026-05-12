# Todo

## Current Focus

- Treat the in-app assistant as the primary product direction. The target is Codex-level capability inside Mauth for document work: a teacher should be able to ask the app to create, inspect, edit, validate, repair, file, and print-check assessment documents at least as effectively as the current Codex-assisted workflow in this repo.
- New workflow decisions should ask: can the in-app assistant do this through structured Mauth tools, rule brains, validators, and reversible document actions without needing hidden UI state or raw JSON?
- Use the saved `DIAGRAM AUDIT GALLERY` test as the main visual regression document for diagram and chart polish.
- Keep improving the Files drawer around normal filename workflows. Current baseline: folders, drag/drop moves onto folders/breadcrumbs/empty panes, Shift/Cmd multi-select, keyboard select/open/delete, versions, restore, and ZIP backup/import.
- Keep solution authoring tied to paired student response surfaces so toggling solutions does not change pagination.

## AI Action Layer

Status: Phase 10 chat provider plumbing implemented.

- `apps/web/src/lib/mauthActions.ts` defines the structured document action contract for AI-controlled authoring.
- Current actions cover front-matter edits/replacement, logo/school-name selection, page-format and formatting-config patches, adding/updating/deleting/reordering questions, parts, subparts, and modules; moving modules between questions/parts/subparts; moving parts between questions; moving subparts between parts; adding solution slots; updating marks; updating diagrams; setting page breaks/start-new-page flags; and running solution or whole-document validation.
- `applyMauthActions` supports atomic question-content batches, and `applyMauthDocumentActions` supports atomic batches across front matter, formatting config, and question content.
- `previewMauthDocumentActions` and `applyMauthDocumentActions(..., { dryRun: true })` support AI proposal review. Dry-run results return the proposed document plus a structured preview summary, including moved ids, without requiring the editor to commit it.
- `apps/web/src/lib/mauthAssistantTools.ts` exposes the first chatbox-ready tool surface: describe supported tools/actions, inspect the current document, inspect focused preview/question context, run document/solution validation, preview action batches, apply accepted action batches, and use high-level authoring tools for common teacher requests.
- `mauth.author.replaceQuestion` is implemented as the first high-level authoring tool. It lets the provider replace one existing question from a compact payload containing question number/id, marks, question text, optional structured parts, optional diagram configs, student-space lines, and solution text. It creates student-only answer space and solution-only solution text automatically, validates the generated blocks/parts, applies the update, and commits through the adapter/history path.
- For attachment-derived one-question conversions, `mauth.author.replaceQuestion` is also the expected path when the source has a visible diagram and visible parts. The assistant should put a native diagram block under the stem, then structured parts with non-empty part prompts; it should not substitute a prose diagram description or blank part rows.
- The backend now makes this diagram requirement structural for focused attachment conversions that explicitly ask for a diagram/graph/chart or for the source diagram to go underneath the stem: the exposed direct `mauth_author_replace_question` tool schema requires `diagram`, so the model should repair instead of silently writing a text-only question.
- `mauth.author.replaceQuestion` now renders each structured part prompt as the first text module inside that part before the answer space and solution. The `part.text` field is still stored for summaries, but visible output comes from part content blocks.
- `mauth.author.addDiagram` is implemented for focused diagram follow-ups. It can add or replace one diagram in an existing question from a renderer-specific `graphConfig`. The assistant should choose the diagram renderer intelligently rather than relying on canned `standardDiagram` names.
- High-level assistant diagram payloads now use a strict native block contract: diagrams must be shaped as `{ graphConfig: { type: ... }, diagramAlign?: ... }`. Top-level `type`/`data`/`options` fields and `config` aliases are rejected with repairable validation issues before any document change is applied.
- High-level assistant diagram payloads now also run conservative intent validation before apply. Obvious classroom patterns are routed to the intended native renderer: circle/tangent/chord geometry and scalar-product ray diagrams to `geometricConstruction`, coordinate/component vectors to `vector2d`, statistics charts to `statsChart`, Venn/set diagrams to `setDiagram`, coordinate/function graphs to `graph2d`, and networks to `vectorRelationship`. Wrong choices fail with repairable `arguments.diagram.graphConfig.type` issues and are covered by the no-cost self-smoke suite.
- `mauth.author.ensureSolutions` is implemented for focused solution passes where the compact summary already contains enough question text. It creates or resizes matched student answer spaces and adds solution-only worked-solution text without requiring a low-level module batch.
- Successful `mauth.author.replaceQuestion`, `mauth.author.addDiagram`, and `mauth.author.ensureSolutions` calls now finish locally in the frontend. The chat panel shows the adapter's result message and does not spend a second provider round merely to summarise that the edit was done. Failed calls still go through the provider repair loop.
- The assistant tool description now includes a school-exam front-matter recipe so AI can set `frontMatter.titlePageTemplate: "exam"`, choose `frontMatter.exam.sectionPreset` for Section One or Section Two, populate `frontMatter.exam`, use automatic current-section marks in the structure table, select a school logo, and switch to the `exam-booklet` format preset without faking title pages, headers, footers, cut-off notices, or supplementary pages as question content.
- `apps/web/src/lib/mauthAssistantFileTools.ts` exposes the first chatbox-ready file tool surface: describe file tools, list/open/save/save-as project files, create folders, duplicate/rename/move/delete files and folders, and list/restore versions through an injected project-file driver.
- `apps/web/src/lib/mauthAssistantAdapter.ts` is the host boundary for future chatbox UI/provider work. It dispatches document/file tool calls, commits accepted document edits through a host callback, parses opened files through a host callback, serialises the current document for save/save-as, and returns changed ids/paths for user-visible logs.
- Display-only mode now includes a small left-side Assistant toggle. The Assistant panel provides a chat input backed by the backend assistant route, runs all model tool calls through `runMauthAssistantAdapterTool`, commits accepted edits through editor history/autosave, updates active file state for file tools, and shows human-readable activity summaries rather than raw JSON, tool names, ids, or provider payloads.
- Long assistant runs now show simple status labels and an elapsed timer, such as Thinking, Inspecting document, Previewing changes, Applying changes, Checking document, Opening file, and Saving file.
- The backend assistant route uses OpenAI's Responses API through `apps/api/app/services/openai_assistant.py`, including compact context from `configs/ai-brains/`. Keys stay server-side in `.env` / `apps/api/.env`; the frontend only talks to `/api/assistant/status` and `/api/assistant/chat`.
- Fresh assistant prompts now use the brain-menu methodology: send the teacher prompt plus a compact document summary and menu of available brains, let the model order only the instruction packs it needs, then run the real authoring call with those selected packs. This keeps the assistant tool-first while avoiding whole-app context dumps.
- The backend now offers direct provider tools for focused authoring: `mauth_author_replace_question`, `mauth_author_add_diagram`, and `mauth_author_ensure_solutions`. They map to the frontend's high-level adapter actions and should be preferred over low-level action batches for single-question writing, diagram follow-ups, and compact solution requests.
- The backend now narrows provider tool exposure for focused single-question prompts. A request such as "add the diagram to Question 1" exposes only `mauth_author_add_diagram`, which reduces tool-schema tokens and makes long expensive tool loops less likely.
- The assistant-facing geometry path is native renderer payloads. For `geometricConstruction`, that means supported Penrose Substance in `graphConfig.options.substanceSource`, with compact Diagram Brain guidance loaded only when the model orders the diagram pack. Structured geometry data may remain as a UI/helper path, but do not grow it into a second Penrose.
- Assistant-authored Penrose-family diagram commits now run native Substance validation plus renderer preflight before mutating the document. Known bad predicates such as `LabelsPoint`, `SegmentLength`, `OppositeRays`, `LabelSegment`, raw `Ray(...)`, and bad right-angle/perpendicular arity are rejected with repairable `validationIssues`; changed `geometricConstruction`, `setDiagram`, and `vectorRelationship` blocks are then posted to `/api/diagram/penrose`. If rendering fails, the broken diagram is not committed.
- Assistant document commits now run broader preflight before mutating the document. Changed solution containers must use the standard `**Solution.**` heading, hidden `[[marks:n]]` ticks that total the relevant marks, and no visible mark prose; non-replacement edits must preserve existing shared diagrams. Failed preflight output is returned as repairable `validationIssues`.
- The assistant frontend tool loop now allows one repair attempt after failed tool/preflight output, then stops with a clean teacher-facing message rather than repeatedly spending provider calls on the same bad edit.
- Backend repair continuations keep the same direct authoring tool where possible, so precise failures from `mauth_author_add_diagram`, `mauth_author_replace_question`, and `mauth_author_ensure_solutions` are retried on the compact tool surface instead of falling back to broad `mauth_tool` calls.
- The backend now focuses context by request. It selects relevant brain files instead of always sending every brain, and it filters large document summaries to explicitly referenced question numbers where possible. Keep this bias: accuracy first, then speed, then cost.
- The frontend trims stale assistant chat history before fresh provider requests, so old failed attempts and paused-continuation messages do not keep inflating token usage.
- `pnpm eval:assistant:live` runs a small paid live-provider eval against the configured OpenAI model. `pnpm eval:assistant:live:core` is the standard bounded provider regression suite and currently checks circle-geometry question authoring, Penrose diagram follow-up, diagram-preserving mark edits, diagram-preserving wording rewrites, and multipart probability authoring. `pnpm eval:assistant:live:diagrams` checks renderer selection for coordinate function graphs, Venn/set diagrams, relative-frequency column charts, and coordinate vector diagrams. `pnpm eval:assistant:live:repair` checks the one-retry repair loop by simulating wrong-renderer validation failures and expecting corrected native diagram graphConfigs. `pnpm eval:assistant:live:attachments` checks attachment conversion, including a screenshot scalar-product fixture that requires a renderable native diagram, structured part prompts, correct marks, and no unsolicited solutions. `pnpm eval:assistant:live:all` runs every focused live case, including tangent-parallel-chord routing, focused solution creation, and repair cases. Use live evals deliberately because they call the real configured model.
- Current live-provider baseline: the focused core, diagram-routing, attachment, tangent-parallel-chord diagram, and focused solution cases pass against the configured OpenAI assistant path. Keep these as the paid regression gate after changing assistant prompts, tool schemas, brain retrieval, high-level authoring tools, or validation rules.
- `pnpm smoke:assistant:self` runs the cheap deterministic assistant rehearsal suite. It simulates Codex-style assistant choices with real Mauth tools and checks the resulting document for the current high-risk behaviours: mark edits preserving diagrams, diagram follow-ups using native Penrose Substance, wrong renderer choices being rejected, omitted diagrams being preserved, explicit diagram removal only when requested, hidden mark ticks, multipart solution targeting, malformed diagram rejection, raw visible-solution rejection, and validation after authoring.
- The backend provider boundary now tolerates common `mauth_tool` wrapper mistakes from the model: invalid JSON returns a structured parse error, nested JSON-string arguments are parsed, action arrays are wrapped as action batches, and unwrapped arguments beside `name` are preserved. Provider HTTP errors are reduced to plain readable chat messages instead of raw JSON payloads.
- `apps/web/src/lib/mauthActionValidation.ts` validates actual document action payload fields before `mauth.actions.preview` or `mauth.actions.apply` reaches the action engine. It reports repairable issue paths for malformed scopes, ids, patches, marks, placements, content blocks, and graph configs, and prevents document mutation on validation failure.
- `apps/web/src/lib/mauthDiagramValidation.ts` adds diagram-type-specific action validation for supported diagram configs before they reach the renderer. It checks coordinate graph ranges/functions/features, vector2d metadata vectors, graph3d camera metadata, image source fields, statsChart chart data/options, Penrose geometry/network point relationships, common unsupported Penrose Substance predicates, and setDiagram Venn fields.
- The document action validator also catches common AI solution-authoring mistakes: student answer spaces must be student-only, solution text must be solution-only, and raw `[[marks:...]]` placeholders are rejected.
- The high-level question authoring path rejects marked structured parts whose text is blank or only a label such as `(a)`, forcing the provider to repair screenshot/PDF conversions that accidentally drop the visible part task.
- `apps/web/src/lib/mauthFileToolValidation.ts` validates actual `mauth.files.*` payload fields before the project-file driver runs. It reports repairable issue paths for malformed file paths/names, content, multi-path arrays, folder targets, version ids, metadata, and revision fields, and prevents file operations on validation failure.
- The required AI edit loop is now documented as inspect -> high-level authoring tool where available, otherwise preview -> validate -> apply -> commit through editor history/autosave.
- Mauth actions and solution validation are now background systems for the assistant/editor rather than header controls teachers need to manage directly.
- Formatting/page config is now part of the saved editor document, project files, autosave drafts, undo/redo snapshots, dirty-file fingerprints, screen preview, and print preview. Page settings and mark visibility are renderer-backed now; broader high-school mathematics test styling fields are persisted for the next formatting-control pass.
- The action engine commits front-matter, question-content, `formatting.update`, and `pageFormat.update` actions through assistant/editor workflows.
- The `T` editor now contains a document-level `Test format` panel. It controls the saved high-school mathematics test preset, mark-label visibility, page size, margins, and page-break-label visibility. Treat this as title-page/test-structure formatting, not per-question or per-diagram styling.
- The editor now routes title-page/front-matter changes, logo selection, core question, part, subpart, module, page-break, solution-slot, question-reorder, nested add/delete, nested cross-container drag/drop moves, and solution-validation quick-fix paths through the action layer while preserving existing undo/history/autosave behaviour.
- `pnpm test:web-actions` covers the action contract for document actions, dry-run previews, invalid dry-run batches, question operations, part/subpart operations, module operations, cross-container moves, solution slots, marks, page breaks, diagram updates, clean failures, label normalization, atomic multipart batches, atomic document batches, the document assistant tool dispatcher, the file assistant tool dispatcher, and the combined assistant adapter.
- See `docs/mauth-actions.md` for the current contract and `docs/ai-chatbox-readiness.md` for the chatbox path.

Follow-ups for Codex-level in-app assistant parity:

- Route remaining direct editor mutations through actions where the contract is stable, especially any formatting/front-matter paths still using local patches.
- Expand renderer-specific diagram authoring guidance and validation for common teacher prompts. The assistant should choose `graphConfig.type` intelligently and emit validated renderer payloads, not accumulate one-off canned `standardDiagram` recipes.
- Expand diagram-intent validation only when it is clearly conservative and useful. Add a self-smoke scenario from the real failure first, then add a precise expected-renderer check rather than broad prompt heuristics.
- Add renderer-level diagram inspection and repair after payload validation: label collision checks, graph extent checks, visual screenshot/metadata inspection, pedagogical correctness checks for valid Penrose output, Plotly/JSXGraph output checks, and print/output fit checks.
- Add automatic action-repair loops so bad model output is repaired and retried internally instead of surfacing raw tool errors to the teacher.
- Expand the live assistant eval set beyond the current focused suite to broader teacher workflows: edit a selected question, write all solutions for a real test, repair student spaces, format an exam title page, convert from a source PDF, and handle file operations.
- When a new validation/preflight class is intended to be automatically recoverable, add a live repair eval that feeds the provider the exact failed tool output and confirms the next tool call fixes the targeted payload rather than starting over or surfacing the error.
- Expand `pnpm smoke:assistant:self` whenever the assistant makes a repeatable mistake. Prefer adding a no-cost deterministic scenario and fixing the tool contract before running paid live-provider evals.
- Keep expanding paid screenshot-image live evals for repeated conversion mistakes. The first scalar-product screenshot fixture is implemented and expects a native renderable diagram plus part prompts such as scalar products, not prose-only diagram text, empty parts, or invented solutions.
- Extend the implemented `mauth.preview.inspect` selected-context tool with browser-rendered metrics and state that are not structural yet: file path, solution visibility, print mode, page occupancy, selected-anchor bounding boxes, and actual solution-slot fit.
- Add renderer/layout inspection tools for page count, page occupancy, overflows, solution-slot fit, selected-anchor bounding boxes, and print/PDF assumptions.
- Add diagram-specific inspection and repair tools for JSXGraph, Penrose, Plotly, images, vector graphs, and 3D diagrams so the assistant can fix visual output without hand-editing full graph JSON.
- Add more high-level assistant workflows built on the action layer: write all solutions, repair solution spaces, add/repair more diagram families, run a layout pass, run a print check, combine tests, and generate a marking key. `mauth.author.replaceQuestion`, `mauth.author.addDiagram`, and `mauth.author.ensureSolutions` are the patterns to follow for compact teacher-facing authoring requests.
- Add visible provider settings/status beyond backend `.env`, while keeping API keys out of the frontend.
- Add streaming progress for provider responses and long tool chains without bypassing the visible tool/action log.
- Extend the current Assistant attachment intake with a production upload/extraction pipeline: explicit teacher consent, persistent asset storage, extraction caching for large source files, and metadata for curriculum/source snippets. The current chat path already accepts screenshots/images, PDFs, Word `.docx`, and text-like files for provider calls.

## Solution Visibility Toggle

Status: implemented baseline.

- The header solution toggle controls editor, preview, and print output.
- Ordinary question modules stay shared between student and solution copies.
- Student answer-space blocks and student-only completion tables can be replaced by adjacent solution modules.
- Solution-only text, diagrams, mark ticks, and graph annotations are hidden from the student copy.
- In marked free-response questions, parts, and subparts, the Add menu's response-space action is `Answer + solution`, which inserts a paired student answer space and solution text block.
- The Add menu still exposes `Solution slot` where an explicit paired slot action is useful.
- Printed output respects the current solution visibility state.
- The header shows the active print state as `Print: Student` or `Print: Solutions`, so teachers can see what Command/Ctrl-P will output.
- Solution validation checks marked items for student response surfaces, solution modules, matched replacement slots, and likely solution-fit warnings. This is intended as the assistant/editor finish check for solution passes, not a header control teachers need to manage.
- Solution validation remains the assistant/editor finish check for routine issues: missing solution slots, missing solutions, missing answer spaces, or insufficient paired answer-space line counts.

Follow-ups:

- Later, expose solution validation as a backend/editor action for in-app AI tooling so model-driven solution passes can call it directly rather than only reading the visible status.

## Maybe Later: Multi-Section Tests

Status: paused. This may create more workflow complexity than value.

- Possible future idea: allow two or more sections inside one saved test.
- Each section could have its own title page, subtitle, instructions, and section-specific mark tally.
- Revisit only if repeated real tests need separate title pages inside one file.

## In-App AI Assistant Parity

Status: first provider-backed chat loop implemented; this is now a core product milestone, not a maybe-later item.

Goal:

- Make the in-app assistant at least as good as the Codex workflow in this thread for Mauth document work, while keeping it safer by forcing edits through explicit Mauth tools, validation, undo/history, autosave, and project versions.
- Teachers should be able to stay inside display-only Mauth and ask for real assessment authoring work: create a question, rewrite a question, generate a full test, write solutions, check marking, repair layout, make diagrams, adjust student space, manage files, and troubleshoot print/PDF output.

- Keep evolving the display-only Assistant panel into a ChatGPT-like chat surface that can interact with the current Mauth document.
- Let the user configure an LLM API provider/key from a proper settings surface rather than relying only on backend `.env`.
- The assistant should be able to inspect the open document, answer questions about it, and propose or apply edits through structured Mauth actions rather than brittle DOM manipulation.
- The assistant should use `mauth.preview.inspect`, `mauth.document.inspect`, `mauth.actions.preview`, `mauth.validation.run`, and `mauth.actions.apply` rather than reading or mutating React state directly.
- The assistant should use `mauth.files.*` tools for file operations rather than calling drawer UI handlers or writing raw files.
- Target capabilities should include creating tests, editing question wording, adding/removing/reordering modules, generating solutions, adjusting student space, managing diagrams/charts, changing formatting, and using the same brains/rules documented for Codex-assisted work.
- Support paste/drop uploads in the chat. Current implementation handles images/screenshots, PDFs, Word `.docx` files, and text-like files for provider calls with request-size limits and a cost warning; curriculum snippets with structured metadata, persistent asset storage, and extraction/caching for large files remain follow-ups.
- Add app-native inspection tools for things Codex currently infers manually: rendered page layout, selected preview item, solution-slot fit, diagram output quality, print/PDF state, and file/version state.
- Add high-level assistant commands that bundle the inspect -> preview -> validate -> apply loop for common teacher workflows, but keep the underlying tool calls structured and testable.
- Add an evaluation suite of saved prompt/document pairs that checks whether the assistant can complete representative Codex-level tasks without manual intervention.
- Add a paid live screenshot-image eval with a readable fixture for "make a question from this screenshot"; the PDF/Word-source live eval exists as `pnpm eval:assistant:live:attachments` with a $0.50 default cap.
- Keep all document edits reviewable and undoable through the existing undo/history and project version system.
- Design the API boundary carefully: the model should call explicit editor/document tools with validation, not receive unrestricted file-system or browser control.
- Add privacy and safety controls before any production use: clear provider settings, backend-only API keys, no silent upload of documents, visible model/action logs, and an obvious way to disable AI access.

## Maybe Later: Curriculum And Question Bank System

Status: concept only. This is a larger product/database direction after local file management, solution authoring, diagram polish, and in-app AI tooling are stable.

Goal:

- Build a structured question bank that can organise every assessment question authored in Mauth, then let teachers generate future assessments from a mixture of reused bank questions, adapted bank questions, and newly generated AI questions.
- Build a curriculum library where teachers can choose a curriculum, year/course, topic, strand, and dot points/outcomes, then ask the AI to generate assessment material against that exact blueprint.
- Treat this as an assessment-authoring system, not just a search box. The bank should preserve question content, solutions, diagrams, marks, answer spaces, difficulty, curriculum links, and usage history.

Question bank data model:

- `questionId`, stable version id, title/short label, source test id/path, source question number, created/updated timestamps, author/school metadata, and ownership/copyright status.
- Full Mauth question payload: text modules, parts/subparts, tables, diagrams/charts, student response spaces, solution modules, mark ticks/annotations, page-break/start-new-page hints, and required assets.
- Classification fields: subject, year/course, topic, strand, subtopic, curriculum dot points/outcomes, skill tags, command words, prerequisite skills, calculator/non-calculator suitability, technology assumptions, and allowed reference materials.
- Assessment fields: marks, estimated time, response type, cognitive level, difficulty, grade-band target, discrimination value, scaffold level, marking style, and whether the item is routine, application, reasoning, modelling, proof, or problem-solving.
- Quality fields: teacher rating, reviewed/approved status, known issues, last used date, number of uses, duplicate/similar-question links, and whether the question should be reusable as-is, reusable only after editing, or excluded from AI retrieval.
- Solution fields: concise worked solution, marking key, common errors, acceptable alternative methods, required exactness/rounding, and whether the solution is known to fit inside the student response space.
- Asset fields: image/diagram references should point to managed asset storage rather than embedding large data URLs in every question-bank record.

Question bank workflows:

- Add questions to the bank deliberately from a saved test or from selected questions in the editor; do not silently publish every draft question without teacher review.
- Provide an indexing/review queue that suggests metadata from the question text, solution, diagram type, and selected curriculum, but lets the teacher correct it before approval.
- Support duplicate detection and near-match search so small variants of the same question can be grouped rather than cluttering the bank.
- Allow browsing/filtering by curriculum, topic, dot point, difficulty, mark value, response type, diagram type, calculator status, previous use, and approval status.
- Allow one-click insertion into the current test while preserving the question's student/solution pairing, diagrams, marks, and response-space layout.
- Track provenance when a question is reused, adapted, or AI-generated from bank material.

Curriculum system data model:

- Curriculum records should be versioned and selectable, e.g. state, syllabus, school-custom course, year/course, unit, topic, strand, content description, dot point, elaboration, and assessment notes.
- Curriculum dot points should support aliases and teacher-friendly labels because official wording is often too long for everyday planning.
- Store assessment requirements alongside curriculum content: grade-band expectations, required depth, allowed question styles, mark distributions, calculator restrictions, modelling/problem-solving requirements, and any school-specific conventions.
- Store explicit examples of what an A-grade, B-grade, C-grade, and support-level question looks like for a given topic where useful. These examples should guide generation but not force rote templates.
- Keep curriculum imports editable and versioned so schools can maintain their own local curriculum maps without breaking existing tests.

AI generation workflow:

- Teacher chooses curriculum, dot points/outcomes, mark total, time, calculator mode, section constraints, desired grade-band mix, required question types, and whether the AI may reuse existing bank questions.
- AI builds an assessment blueprint before writing questions: coverage table, mark allocation, difficulty/grade-band distribution, question types, and rationale.
- AI can retrieve from the question bank, adapt an existing question, or create a new one. It should label which path was used and preserve provenance.
- AI should avoid reusing an identical recently used question unless the teacher explicitly requests direct reuse.
- AI should generate full Mauth modules: student question, generous answer space, solution block, mark ticks, diagrams/charts, and metadata tags.
- AI should run validation checks before presenting the test: marks total, curriculum coverage, duplicate content, missing solutions, missing student space, diagram renderability, notation consistency, and solution fit.
- Teacher review stays mandatory. Generated or retrieved questions should be inserted as editable Mauth content, not locked output.

UI direction:

- Add a Question Bank area separate from the Files drawer: searchable list/grid, filters, question preview, metadata editor, version history, and add-to-current-test action.
- Add a Curriculum area: curriculum picker, dot-point browser, topic maps, assessment-requirement notes, grade-band examples, and blueprint builder.
- In the AI assistant, support prompts like: "Make a 25-mark non-calculator test from these dot points with 20% A-grade questions", "Find three prior questions on binomial distributions", or "Replace Question 4 with a harder question on this outcome".
- Keep question-bank actions undoable when they affect the open document and versioned when they affect the shared bank.

Implementation notes:

- Use a real backend data model for question-bank and curriculum records rather than storing this only in individual `.test.json` files.
- Keep tests as documents and the question bank as reusable content. A test may reference bank provenance, but opening a test must not require the bank to render correctly.
- Design import/export early: schools may need to move a curriculum map and question bank between machines or share a curated bank.
- Add privacy controls before LLM use: teacher approval before sending bank/curriculum content to an external provider, clear provider settings, visible generation logs, and local-only mode where possible.
- Defer this until the core document editor is stable enough that bank insertion does not create layout or solution-toggle regressions.

## Question-Focused Editor And Mini TOC

Status: prototype implemented.

- The mini TOC owns title-page selection, question selection, question creation, question reorder, and page-break creation.
- The editor shows the selected question rather than the whole long nested document.
- `T` opens the title-page controls.
- Question buttons and page-break markers are draggable in the mini TOC.
- Keyboard reorder/removal exists for mini TOC questions and page breaks.
- Page breaks stay out of the full Document TOC.
- Preview clicks in split view can select the matching editor module.
- Mini TOC reorder actions preserve the current pane mode; dragging questions in display-only should not open split view.

Follow-ups:

- Add a separate blank-page structure item instead of allowing duplicate page breaks.
- Keep browser-testing drag/drop and accidental-click behaviour, especially on narrow screens and touch-like input.
- Keep selection outlines focused on the innermost selected module and avoid parent highlight noise.

## Exam Companion Sections

Status: concept only.

- Current behaviour: the open section's structure-table row can be automatic with `useCurrentDocument: true`; companion section rows are manual metadata.
- Current implemented selector: the title page has an Exam section selector for `Section One: Calculator-free` and `Section Two: Calculator-assumed`. Selecting it updates the cover subtitle/header, reading/working time, materials, start question number, and which structure-table row is automatic.
- Do not silently infer a companion/sister exam file from filename patterns. That is too invisible and risky when teachers duplicate, rename, or adapt papers.
- Better future workflow: add an explicit "Link companion section" control on a structure-table row. It should open the Files drawer or a compact file picker, let the user choose the Section 2 or Section 1 document, then populate question count and marks from that file while still allowing manual override.
- The in-app assistant can help by suggesting likely companion files, but it should state the candidate and apply the link/fill only when requested.
- Section 1 and Section 2 can share the same school exam template while using different `frontMatter.exam.sectionHeader`, subtitle, timing, materials, and current-section structure row settings.

## Project/File Management System

Status: file-backed prototype implemented.

- Project files live under `storage/projects` through the backend project-file API.
- The Files drawer presents normal document filenames and folders under the user-facing `Documents` area while keeping the internal `tests/` storage root for compatibility.
- Supported user operations: open, save, save as/new test, create folder, rename, duplicate, drag/drop move, multi-select, delete, list previous versions, preview version snapshots, and restore a previous version.
- `pnpm smoke:file-manager` covers the high-risk Files drawer workflow path against the running API/web app: temporary seed files, multi-select drag/drop, folder duplicate/rename/delete, dirty active-file duplicate, keyboard selection, API assertions, and cleanup.
- ZIP backup/import is available from the Files drawer. Backups include current project files, folders, version snapshots, and reusable logo assets. Imports validate archive paths and merge safely without overwriting existing files.
- Legacy `storage/tests` files are migration inputs only and should not be deleted or mutated during migration.
- Autosave remains a recovery draft in `storage/autosave/current-test.json`, not a user-facing saved file.
- The header distinguishes saved project files from recovery drafts: saved files show `Saved to file`, changed files show `Unsaved file changes`, new unsaved documents show `New file not saved`, and the tooltip exposes the active project path plus draft-backup state. Draft backup is recovery-only, not a saved project file.
- Version snapshots are created before overwrite, restore, and delete. Restoring a version creates a new current revision.
- Save conflict protection is implemented for the active editor file: browser/manual/assistant saves use the revision loaded with the file, restored autosave drafts keep that revision, create-only saves use `baseRevision: null`, and stale/missing revisions block Save with a red header warning instead of overwriting disk changes.
- Product direction: make file save/revision handling quiet and automatic. Safe background work should save dirty active files before file operations, refresh file state, and keep autosave drafts aligned after API/Codex edits. User-facing messages should stay short and appear only for real data-loss choices.
- Logo asset storage has a backend-backed prototype under `storage/assets/logos`.

Follow-ups:

- Add version comparison later if teachers need side-by-side diffs before restore.
- Plan binary asset storage for uploaded images, PDFs, and future exports so large data URLs do not live inside normal text rows.
- Add optional backup preview/conflict review if teachers need to inspect imported files before merging.
- Keep backend route handlers thin and storage rules in services with focused tests.
- Defer Google Drive, Dropbox, GitHub sync, real-time collaboration, permissions, public sharing, and object storage until local project/file/version workflows are stable.

## Diagram System Polish

Status: audit gallery exists; ongoing visual polish.

- Maintain the saved `DIAGRAM AUDIT GALLERY` test with written expected-result notes before representative diagrams from each renderer.
- Current gallery coverage: `graph2d`, blank coordinate grid, geometric construction, network diagrams, Venn/set diagrams with labels/shading/counts/totals, statistics charts, uploaded image, 2D vector graph, and 3D graph.
- Use the gallery for human visual inspection after diagram-related changes; see `docs/diagram-audit-gallery.md`.
- Run `pnpm smoke:diagram-gallery` with the API and web app already running to capture repeatable screenshots of key examples.
- Keep testing student view, solution view, display-only preview, split preview, and browser print output.
- First editor polish pass: the diagram type picker is grouped by coordinate/construction/statistics/media families, every diagram panel now has a renderer-specific summary, and `graph3d` has a dedicated size/camera editor instead of falling through to 2D function controls.
- Second editor polish pass: `vector2d` now has structured presets, cleaner vector rows, editable label positions, and opt-in component guides under Annotations; `setDiagram` now separates labels, optional total badges, region labels/counts, quick count presets, and quick shading presets.
- First output polish pass: Venn count-badge side tabs now centre their values inside the arc-only caps, compact Venn count values share a horizontal baseline while staying centred in their own visible regions, and the smoke script now deliberately reopens the saved gallery file instead of trusting an already-open autosave draft.

Follow-ups:

- Polish each diagram type's editor controls, defaults, size, alignment, label rendering, print output, and save/load round trip.
- Keep `vector2d` as the coordinate-accurate vector tool with column-vector labels and cleaned graph axes; keep `vectorRelationship` as the schematic network tool.
- Add more gallery examples for vector2d presets and setDiagram structured presets if future changes affect those controls.
- Ensure left/right aligned diagrams followed by text, answer space, or student/solution replacement slots behave consistently.
- Add preview pagination support for keeping setup text with its immediately following diagram when both fit on a fresh page.
- Check that LaTeX renders in labels, axis labels, table-like labels, chart labels, region labels, and uploaded-image captions where supported.
- Tighten crowded diagram settings rows, especially diagram type, alignment, visibility, and chart/renderer-specific controls.
- Add more focused Diagram Brain examples for unusual cases within each diagram type.

## Production Performance Pass

Status: prototype build is acceptable.

- Vite is configured to split the largest known dependency families into named chunks: Plotly, JSXGraph, and MathJax/math rendering.
- Current production build check: `apps/web/dist` is about 10 MB. The main app chunk is about 716 kB uncompressed / 193 kB gzip, with heavy libraries split out as Plotly about 4.6 MB / 1.38 MB gzip, MathJax about 1.79 MB / 612 kB gzip, and JSXGraph about 976 kB / 246 kB gzip.
- The known JSXGraph `eval` warning is filtered as an accepted third-party warning.
- The large chunk warning limit is raised for the current prototype because Plotly and MathJax are intentionally heavy browser libraries.
- Display zoom uses the normal A4 page layout scale directly. Zoom gestures update the A4 preview CSS scale variables imperatively, keep the document point under the cursor anchored in both axes, coalesce scroll corrections into animation frames, and sync React state after the gesture settles, so wheel/pinch zoom does not rerender the full paginated document on every input tick. Avoid temporary high-resolution or transform-only wrapper layers; the display-only maximum zoom should land at native A4 pixel scale so text, MathJax SVG, diagrams, and selection outlines are not magnified past the source render.
- The hidden print preview should not be mounted during normal editing. Mount it on `beforeprint` or the print button, then unmount it on `afterprint`, so large documents do not pay for a full extra paginated preview while typing, selecting, zooming, or using the assistant.
- Math rendering is intentionally cached at the MathJax SVG boundary and mixed-math parse boundary. Keep those caches bounded, and prefer reusing the same LaTeX source strings when AI writes repeated labels/equations so preview, measure, diagram labels, and print can share render output.
- Preview selection highlighting is intentionally synced as a small DOM attribute update on the visible preview pane. Do not push active-selection state back through every preview segment unless the selection rendering needs real document content changes.
- Keep the paginated preview and heavy preview segments memoized, and pass stable callbacks into them. Header state, autosave state, assistant state, and file-manager state should not force a whole-document preview render.
- Screen preview page frames can use screen-only `content-visibility` hints to avoid work on offscreen pages. Keep those hints out of print CSS so browser print/PDF output stays based on the normal generated A4 pages.

Follow-ups before production/public deployment:

- Profile the current editor with React DevTools/Chrome Performance on a large converted exam before adding heavier preview architecture. The next likely bottlenecks are full-document pagination after every content edit and active-preview selection causing whole-preview rerenders.
- Convert more heavy renderers to route/feature-level dynamic imports if initial load time becomes a real problem.
- Profile the app with a production build before changing architecture for size alone.
- Keep build warnings visible unless they are documented third-party warnings.
