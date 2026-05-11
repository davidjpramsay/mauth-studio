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
- `mauth.validation.run`: run document validation, solution validation, or both without changing the document.
- `mauth.actions.preview`: dry-run one or more document actions and return the proposed document plus preview summary.
- `mauth.actions.apply`: apply one or more document actions and return the next document.
- `mauth.author.replaceQuestion`: replace one existing question from a compact authoring payload with question text, marks, optional diagrams, student-only answer space, and solution-only solution text.
- `mauth.author.addDiagram`: add or replace a diagram in one existing question from a compact payload. Assistant-authored diagrams must provide a renderer-specific `graphConfig`; canned `standardDiagram` recipe payloads are not supported.
- `mauth.author.ensureSolutions`: create or resize matched student answer spaces and add solution-only worked-solution text for one or more existing questions/parts. `solutionText` should use hidden `[[marks:n]]` annotations at the end of mark-worthy lines; the renderer converts these to red check marks. The action layer normalises common visible mark notes, adds fallback hidden ticks when a high-level solution omits them, and raises student-space lines to the mark-based/solution-fit minimum.

The intended AI workflow is:

1. Use focused high-level tools where they fit: `mauth.author.replaceQuestion`, `mauth.author.addDiagram`, or `mauth.author.ensureSolutions`.
2. Inspect the current document before broader edits or when the compact context is insufficient.
3. For broader edits, generate structured Mauth actions.
4. Preview the action batch.
5. Run the relevant validation.
6. Apply the same accepted action batch.
7. Commit the returned document through editor history/autosave.

The assistant tool layer does not own undo, autosave, files, UI selection, or provider settings. The caller must still route accepted edits through the existing editor history path so the change remains undoable, autosaved, and versioned like a human edit.

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
- "Write/add/fix the solution for Question 1" should normally call `mauth.author.ensureSolutions` when the current summary contains the question text. The tool owns creating or resizing the student answer space and adding solution-only text. Put mark allocation in hidden `[[marks:n]]` line annotations, not visible `[1 mark]` prose, and make the hidden mark total match the question/part marks.
- The low-level action boundary also sanitises assistant-authored solution text before preview/apply. Direct `module.add`, `module.update`, `question.update`, `part.update`, or `subpart.update` payloads must still use solution-only blocks and hidden `[[marks:n]]` ticks; visible `[1 mark]`, `(1 mark)`, `Solution (5 marks)`, and `\text{[1 mark]}` notes are treated as bad assistant output and normalised or rejected.
- These successful high-level calls are terminal from the frontend's point of view. The panel should show a local result such as "Added the diagram." or "Updated the solutions." rather than paying for another provider round to summarise the obvious.

Example focused diagram payload shape:

```json
{
  "questionNumber": 1,
  "diagram": {
    "graphConfig": {
      "type": "geometricConstruction",
      "options": {
        "substanceSource": "Point centre, A, B, C\nCircle omega\nLine tangentA\nNamedSegment AB, AC, BC\nLabel centre $\\,$\nLabel A $A$\nLabel B $B$\nLabel C $C$\nLabel tangentA $\\,$\nHidePoint(centre)\nCircleThrough(omega, centre, A)\nOnCircle(B, omega)\nOnCircle(C, omega)\nTangent(tangentA, omega, A)\nSegment(AB, A, B)\nSegment(AC, A, C)\nSegment(BC, B, C)\nParallelToSegment(tangentA, B, C)"
      }
    },
    "width": 360,
    "height": 260
  },
  "placement": "beforeStudentSpace"
}
```

This is a renderer-specific payload, not a canned recipe. Assistant-authored diagrams should stay on the real diagram tool surface: choose the renderer, load the relevant diagram brain, and emit the native `graphConfig` for that renderer.

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
