# Mauth Action Layer

Mauth actions are the structured document-editing contract for agent-controlled authoring. The implementation lives in `apps/web/src/lib/mauthActions.ts`.

The action layer is not an in-app chat API. It is the deterministic contract that lets human UI controls, tests, and external agents make the same document edits and receive the same result shape.

## Result Shape

Every action returns:

- `ok`: whether the action was applied.
- `actionType`: the action that ran.
- `document`: included for document actions; contains next front matter, questions, optional section headings/document flow, and optional formatting config.
- `questions`: the next question array.
- `changedIds`: ids affected by the action.
- `warnings`: structured warnings with code, message, and optional target id.
- `validation`: optional validator output for validation actions.
- `appliedActionTypes`: included for batches.
- `results`: included for batches when the caller needs per-action detail.
- `preview`: included for document batches run with `dryRun: true`.

The editor still owns undo/history and autosave. When an action changes the document, the React editor pushes the result through the existing history path once.

## Batches

Use `applyMauthActions` for multi-step question/content edits that should behave like one document operation.

Use `applyMauthDocumentActions` when the batch touches document-level state as well as question content, such as front matter, logo selection, page format, or whole-document formatting.

Batches should be atomic: if any action fails, no partial document change should be committed.

## Dry Runs

Use `previewMauthDocumentActions` or `applyMauthDocumentActions(..., { dryRun: true })` before applying generated whole-document edits.

The dry-run `preview` summary reports:

- whether the batch is valid
- requested and attempted action counts
- action counts by action type
- changed, added, deleted, moved, reordered, and updated ids
- changed front-matter fields
- changed formatting and page-format fields
- warning counts and validation output when configured

Applying the proposal should call the same action batch again without `dryRun`.

## Local Agent Bridge

The action layer is the core mutation engine for the planned local agent bridge described in `docs/agent-bridge.md`.

Bridge writes should:

- read the current document snapshot first
- preview the action batch before committing it
- require a current revision or mutation token
- use an idempotency key for retryable write requests
- apply batches atomically through the existing editor history/autosave path
- return changed ids, warnings, validation output, and the next snapshot

The bridge should not create a second document-save path. Project-file saves, loaded revisions, autosave drafts, and version snapshots must remain aligned with the existing storage API.

## Agent Use

External agents should prefer actions over ad hoc state edits when the action exists.

Use structured actions for:

- adding, replacing, moving, or deleting questions, parts, subparts, and modules
- changing marks
- adding answer spaces and solution-only blocks
- moving modules between text, tables, diagrams, columns, and spaces
- adding, renaming, deleting, or moving top-level section headings between questions
- updating selected module or diagram settings
- changing page breaks and document formatting
- running validation and layout checks

Use direct source edits only when the requested app change is outside the document action contract. For assessment authoring, direct project-file JSON edits are a fallback for recovery or migration, not the primary workflow.

## Section Headings

Use section headings for document-level worksheet/course labels such as `Multiple choice` and `Short answer`.

Available document actions:

- `sectionHeading.add`: add `{ id, title }`, optionally before or after a `{ kind, id }` flow item.
- `sectionHeading.update`: rename a heading with `patch.title`.
- `sectionHeading.delete`: remove a heading from `sectionHeadings` and `documentFlow`.
- `sectionHeading.reorder`: move a heading before or after a question or another heading.

Do not create a zero-mark question just to show a section title. Questions should remain actual question content.

## Human UI Use

Human UI controls should use the same action path where practical. This keeps undo/history, autosave, validation, and future agent operation aligned.

Do not create a second hidden editing path for agent work.

## Space Module Settings

Use `module.settings.update` for focused answer-space changes instead of replacing the whole module. Space settings accept:

- `lines`: the reserved response-space height, in working-line units.
- `showLines`: whether the reserved response space renders ruled lines. Set `false` for blank working space while preserving the same height.

## Diagram Guardrails

AI-authored diagrams should use the real renderer config for the selected diagram type. Do not invent wrapper shapes that bypass `GraphConfig`.

Current diagram systems:

- `graph2d` and `graph3d`: JSXGraph-backed graphs.
- `geometricConstruction`, `network`, and `setDiagram`: Penrose-backed static diagrams.
- `statsChart`: Plotly-backed statistics charts.
- `image`: uploaded/imported bitmap diagrams.

For existing Venn diagrams, prefer `diagram.settings.update` with `renderer: "setDiagram"` for focused edits. It supports `setCount: 2 | 3`, `labels`, and `shading`, so agents can switch between two-set and three-set Venn diagrams without replacing the whole `graphConfig`.

For Penrose geometry, normal authoring should edit Substance with a preset such as `geometry`; do not expose custom Domain or Style as routine teacher input.

## Validation

Validation should catch deterministic structural mistakes before a document commit. It should not try to replace mathematical judgement.

Use tests and preview evidence for:

- missing answer spaces
- missing or mismatched solution marks
- diagram render failures
- obvious renderer mismatches
- page overflow or clipped diagrams
- table shape errors
- invalid ids or stale anchors

Mathematical quality rules belong in the AI brains and evaluation docs, not as brittle validators unless the rule is objectively checkable.

## Removed External Agent

The previous provider-backed `/api/assistant` route, chat panel, provider cost accounting, repair-draft UI, and live paid assistant evals have been removed from the app.

The durable pieces that remain are:

- structured Mauth actions
- deterministic validators
- browser preview and smoke tests
- AI-readable brain configs
- project files and versioned saves
- the integrated `workspace/` folder for agent artifacts

Future AI integration should build from these contracts outward, preferably as an external-agent workflow or explicit MCP/App surface, not as another opaque in-app chat loop.

The preferred next integration is a local agent bridge over snapshots, action preview/apply, validation, comments, suggestions, presence, and events. MCP/App wrappers should call that same bridge rather than inventing another mutation path.
