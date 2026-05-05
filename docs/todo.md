# Todo

## Solution Visibility Toggle

- Add a preview/editor toggle to show or hide solution-only content in a test.
- Treat existing solution text blocks, mark ticks, and solution-only diagram annotations as the first supported content.
- Keep the underlying saved test data unchanged when toggling visibility; the control should only affect editing/preview/export visibility.
- When exporting, make it clear whether the export is the student version or the solutions/marking-key version.
- Longer term: connect this to the Solutions Brain so a test can hold the student copy and marking key in one file without needing a duplicated "solutions" test.

## Multi-Section Tests

- Add support for two or more sections inside one test.
- Allow each section to have its own title page, subtitle, instructions, and section-specific metadata.
- Tally marks on each section title page from only the questions in that section.
- Keep the whole test as one saved test/export, with section boundaries controlling where the later title page appears.
- Make section subtitles editable so Section 1 and Section 2 can use slightly different wording without duplicating the full test.

## Question-Focused Editor And TOC Workflow

Replace the current long nested module editor with a question-focused workflow: the TOC chooses document structure, and the editor shows only the currently selected question.

- Make the mini TOC and document TOC the main navigation surfaces for selecting the active question.
- Show only the active question's modules, parts, subparts, diagrams, spaces, and table/content blocks in the module editor.
- Keep the title page/editor controls separate from question modules so the editor does not read as one endless nested document.
- Add a `+` button to the mini TOC for creating a new question directly from the navigation area.
- Add drag-and-drop reordering to the mini TOC for question order. Reordering a question must move all of its parts, subparts, diagrams, spaces, solutions, page-break metadata, and other attached content with it.
- Add keyboard-accessible reorder controls or a non-drag fallback so question ordering is still usable when drag is awkward.
- Represent page breaks in the mini TOC as small boundary markers between questions rather than as large editor modules.
- Allow page breaks to be toggled from the mini TOC at question boundaries, for example a small page-break icon between Question 3 and Question 4.
- Preserve current page-break data when questions move; if a page break is attached after a question, it should travel with the intended boundary or be clearly reattached by the reorder logic.
- Once the mini TOC can add questions and manage page breaks reliably, remove or de-emphasise the `+ Question` and `+ Page break` controls from the module editor.
- Keep local add controls inside the active question for adding parts, subparts, text, diagrams, tables, spaces, and choices, because those are question-content actions rather than document-structure actions.
- Make selection state obvious: active question highlighted in the mini TOC, active question editor header matching that selection, and preview/document TOC clicks syncing to the same active question.
- After adding a new question from the mini TOC, select it immediately and focus the first useful editor field.
- Check narrow-width behaviour carefully; mini TOC controls should wrap or collapse cleanly without making the selected-question editor cramped.

Suggested implementation phases:

- Phase 1: done in prototype. The editor tracks an active question, TOC/mini TOC jumps select that question, `T` shows the title-page controls, and question selections show only the selected question while keeping existing add/page-break controls as a fallback.
- Phase 2: done in prototype. The mini TOC has a `+` button for adding questions, new questions are selected immediately, and active/parent highlighting is synced across the mini TOC, document TOC, preview jumps, and editor selection.
- Phase 3: done in prototype. Mini TOC question buttons can be dragged to reorder whole question objects, with drop indicators and selected-question sync after the drop. Keep focused regression checks for question content, marks, page breaks, and solutions moving correctly as this gets broader testing.
- Phase 4: done in prototype. Mini TOC page breaks are explicit separator items in the question list, created from the fixed page-break button and stored with the existing page-break-after-question state.
- Phase 5: done in prototype. Removed redundant document-level add-question/page-break controls from the module editor, leaving it focused on editing content inside the selected question. The mini TOC now owns question creation, question order, and page-break creation.
- Phase 6: done in prototype. Replaced on/off page-break boundary toggles with explicit draggable/selectable page-break items owned by the mini TOC, added a fixed page-break add button beside the question add button, added `Alt+ArrowUp` / `Alt+ArrowDown` keyboard reorder and `Delete` / `Backspace` removal for mini TOC questions and page breaks, moved page-break editing out of the selected-question module panel, kept page breaks out of the full Document TOC, and tightened cramped-layout/touch-target behaviour. Keep broader browser QA for accidental drag prevention as follow-up testing.

## Project/File Management System

Use the backend file-system direction from `mauth_studio_backend_file_system_codex_handoff.md`, but implement it in phases so storage does not become a risky rewrite.

- Keep `.mauth.md` as the portable authoring format even if the canonical server-side storage moves to a database.
- Add a storage abstraction first so the current JSON-backed saved-test system can coexist with a future database-backed project/file system.
- Define shared project/file/version contracts in `packages/shared` before wiring the UI deeply to a specific backend implementation.
- Model the user experience as projects with folders and files, for example `tests/`, `diagrams/`, `configs/`, `generated/`, and `assets/`.
- Treat current `storage/tests` and `storage/autosave/current-test.json` as legacy migration inputs; never delete or mutate legacy files during migration.
- Add revision-based conflict detection early: clients save with a known base revision and the API returns `409 Conflict` when the server has changed.
- Add version snapshots before AI edits, imports, or overwrites. Restores should create a new current state, not destroy version history.
- Start with text files in database storage, but plan an asset strategy for uploaded images, logos, PDFs, and future binary exports instead of storing large data URLs inside normal text rows.
- Keep route handlers thin. Put project/file/version/import/export rules into backend services with focused tests.
- Implement ZIP project export/import with a manifest, sanitized paths, no absolute paths, no `../`, file size limits, and round-trip tests for `.mauth.md`, `.diagram.json`, and config files.
- Add a migration command or endpoint that creates a default project such as `Migrated Local Storage` and imports existing saved tests as project files.
- Frontend milestones: project picker, file tree sidebar, open-file state, autosave status, dirty/offline/error/conflict states, version history panel, project ZIP export/import.
- Consider SQLite as a low-friction local development fallback if PostgreSQL setup slows prototype work, but keep the service/API boundaries compatible with PostgreSQL for self-hosted production.
- Defer Google Drive, Dropbox, GitHub sync, real-time collaboration, CRDT merging, permissions, public sharing, and object storage until the local project/file/version model is stable.

## Production Performance Pass

Not urgent for the prototype: the current build warnings are warnings, not failures.

- Large client chunks are expected for now because the app uses heavy browser libraries including Plotly, JSXGraph, KaTeX, jsPDF, and html2canvas.
- Before production or public deployment, split large dependencies with dynamic imports/code splitting. Good candidates are Plotly charts, PDF export code, JSXGraph diagram rendering, and any other feature-specific heavy modules.
- Document the JSXGraph `eval` warning as an accepted third-party warning unless JSXGraph changes upstream or the app isolates that dependency differently.
- Keep the current warnings visible during builds, but do not treat them as prototype blockers.
