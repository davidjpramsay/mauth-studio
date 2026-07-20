# Mauth Roadmap

Last reviewed: 19 July 2026. Read `docs/current-state.md` for the exact dirty-worktree checkpoint and `docs/architecture.md` for the system map.

## Current Direction

Mauth is moving from an in-app assistant experiment to an agent-native authoring workbench.

The app should be excellent for:

- a teacher editing directly
- Codex/Claude Code inspecting and operating the app through browser control
- external agents using stable files, actions, validation, and preview evidence

## Implemented Foundation

- Standalone Electron macOS app with a packaged Vite editor, FastAPI sidecar, bundled Penrose runtime, dynamic loopback port, native quit confirmation, ad-hoc signing, and local installer.
- Teacher-confirmed in-app alpha updates plus a guarded `macos:ship` pipeline that publishes only after signed DMG, ZIP, metadata, and blockmap verification.
- Authenticated runtime-manifest discovery for Codex/MCP tools, with a random per-launch bridge token and the fixed-port browser launcher retained only for development diagnostics.
- Shared macOS state, autosave, logos, and remembered-folder identity under Application Support, while visible documents and external-folder project metadata remain where the teacher selected them.
- Cloud-safe launcher status, ownership-scoped shutdown escalation, and active-file outage/reconnect handling that preserves editor drafts.
- Visible local document folders with revision-aware saves, autosave recovery, versions, backup/import, recents, and external-folder selection.
- Structured Mauth action dry runs and applies through editor history.
- Local HTTP agent bridge plus MCP wrapper for snapshots, actions, validation, comments, suggestions, presence, and events.
- Immediate browser-session unregister on normal page exit, with pending bridge requests released instead of timing out.
- Browser-visible system status, validation, and file conflict/recovery controls.
- Browser-measured preview readiness in System Status and current agent snapshots, including copy-specific page totals and `rendered-page-overflow` evidence that resets after document changes.
- Explicit save-recovery/open-without-saving/cancel outcomes before opening another file or switching documents folders.
- Student/Solutions authoring mode with solution-only blocks, paired surfaces, in-place shared table entries and selected-choice answers, graph features, diagram elements, and ticks.
- Solutions-mode `graph2d` authoring that defaults newly added graph annotations to the solution layer while preserving an explicit inspector override.
- Solutions-mode `graph2d` function authoring that keeps answer curves editable on the shared graph, hides them and dependent features from Student mode without shifting indexes, and renders only those curves in solution blue.
- Solutions-mode `geometry2d` authoring that defaults new points, segments, arcs, angles, and markers to editable solution-only primitives, with Student filtering, solution-blue preview styling, and an inspector override.
- Solutions-mode `vector2d` authoring that defaults new vectors, segment labels, and angle markers to editable solution-only elements, with dependency-aware Student filtering, solution-blue preview styling, and a layer override.
- Solutions-mode uploaded-image authoring that defaults new labels, ellipses, and arrows to editable solution-only annotations, with percentage geometry, Student filtering, solution-blue preview styling, and a layer override.
- Solutions-mode `graph3d` authoring that directly edits points, segments, and dimensions, supports solution-layer faces and solids, preserves Student camera framing, and colours only solution elements blue.
- Solutions-mode Plotly statistics authoring that adds editable supplemental lines, points, line-and-point traces, and bars as structured `data.series`, with Student filtering, solution-blue styling, and element-level action support.
- Solutions-mode Penrose authoring for structured geometry/network points and segments plus fixed Venn region answers, with dependency-aware Student filtering, solution-blue rendering, and element-level actions.
- A focused geometry2d selection-inspector component with pure child-anchor/title selection, preserving the shared block-update action path.
- A focused graph2d selection-inspector component with pure child-anchor/title/patch logic, preserving shared block updates and solution-layer behavior.
- A focused Penrose selection-inspector component that reuses structured scale/preset/visibility/count/shading patches and preserves custom-Substance clearing.
- A focused vector2d selection-inspector component with normalized visibility and interval patches, attached major-grid/axis-number steps, clearable grid inputs, and stable graph dimensions.
- A focused graph3d selection-inspector component with normalized dimensions and camera state, metadata-preserving edit/reset patches, and stable graph dimensions.
- A focused statistics-chart selection-inspector component with normalized data/options patches, mirrored dimensions, and the existing fill-opacity clamp.
- A focused image selection-inspector component with normalized metadata, preserved embedded-image fields, and stable dimension fallbacks.
- Focused basic-block and diagram-router inspector components. Columns, choices, tables, answer spaces, diagram type/alignment, and renderer dispatch now leave `SelectionInspector.tsx` as a 107-line shell.
- Focused overlay composition through `AppOverlayWorkspace.tsx`, with existing file, dialog, status, solution-validation, proposal, context-menu, and print callbacks preserved. `App.tsx` is now 1588 lines.
- Focused header composition through `AppHeaderWorkspace.tsx` and `appHeaderBindings.ts`, with existing pane, file, session, status, theme, solution, validation, print, and history callbacks preserved. `App.tsx` is now 1551 lines.
- Focused open-document binding through `DocumentEditorWorkspaceBindings.tsx`, with existing selection, navigation, context-menu, drag, mutation, lifecycle, solution, front-matter, conflict, inspector, and preview contracts preserved. The extraction reduced `App.tsx` to 1386 lines; the scoped solution-validation binding leaves it at 1387.
- Focused workspace-presentation state through `useEditorWorkspacePresentationController` and `editorWorkspacePresentation.ts`, with deferred preview values, mark totals, zoom, pane visibility, grid styles, TOC construction, and preview-anchor mapping kept on their existing paths. `App.tsx` is now 1370 lines.
- A shared typed document-transition guard for file opens, folder switches, and active-file version restores. Version restore now saves current edits first, offers operation-specific recovery/discard/cancel choices on stale revisions, and cannot touch disk after cancellation or failed recovery. The version binding leaves `App.tsx` at 1371 lines.
- One configured stateless editor runtime in `editorApplicationRuntime.ts` for block factories, normalizers, summaries, selection, duplication, persistence, version previews, and solution validation. The extraction preserves existing controllers and reduces `App.tsx` from 1371 to 1264 lines.
- Focused project-persistence composition through `useEditorProjectPersistenceController`, with active-file refs, saved fingerprints, browser/disk draft autosave, dirty/status derivation, and unload protection delegated to the existing hooks while file mutations remain on `useDocumentSessionController`. `App.tsx` is now 1202 lines.
- Focused Files-drawer project-management composition through `useEditorProjectFileManagementController`, delegating folder switching, version restore, folder creation, backup/import, rename, move, duplicate, and delete to their existing controllers while `useDocumentSessionController` remains authoritative for open/save/close transition outcomes. Active-editor duplication now uses one tested serialization plan and preserves the document's `notes`, `worksheet`, or `test` file type. `App.tsx` is now 1119 lines.
- Focused editor-agent bridge composition through `useEditorAgentBridgeController`, keeping file identity, validation, action preview/apply, revision-aware project saves, and shared conflict copy on one adapter over the existing bridge and document action engine. `App.tsx` is now 1105 lines.
- Focused manual-solution composition through `useEditorManualSolutionController`, keeping surface-copy, validation/repair, and solution-slot workflows on their existing structured controllers and Mauth action path. `App.tsx` is now 1075 lines.
- Direct **Complete in solutions** controls for shared root and nested tables without duplication, plus idempotent paired copies for diagrams and legacy student-only tables.
- Compact Solutions-mode status on marked question, part, and subpart headers, with deterministic leaf fixes, parent issue summaries, ready-state feedback, and validation for blank worked text and incomplete shared or legacy paired completion tables.
- Diagram-answer completeness that recognises supported structured `solutionOnly` elements on shared diagrams, preserves and prints their surface ticks, and keeps copied paired diagrams incomplete until mathematical answer content changes rather than presentation alone.
- Focused smoke tests for the bridge, file manager, external folders/autosave conflicts, document-session conflicts, context actions, and diagram gallery.

## Now

- Keep reducing the frontend composition surfaces. `SelectionInspector.tsx` is a focused shell, the stateless editor runtime is configured outside the shell, and workspace presentation, navigator, document-workspace rendering and binding, header, overlay, project persistence, Files-drawer project management, editor-agent bridge, and manual-solution composition are extracted; continue from `App.tsx`, currently 1075 lines, only where another coherent controller or presentation boundary exists.
- Keep active folder, active file, loaded revision, autosave state, bridge state, and external-folder outage/reconnect state consistently legible.
- Keep save, close, discard, reload, recovery-copy, and stale-revision decisions under the existing shared document-session outcome model.
- Continue first-class manual solution editing beyond the completed shared-choice and shared-table answer layers, scoped status, recursive mark-total validation, nested-column repairs, deterministic diagram-answer completeness, `graph2d` functions/features, `geometry2d`, `vector2d`, `graph3d`, `statsChart`, uploaded-image annotations, supported Penrose, and paired-diagram controls. Improve remaining teacher ergonomics and surface-specific checks, and use paired solution diagrams for custom Penrose Substance or unsupported complex construction predicates.
- Preserve structured Mauth actions as the only normal mutation contract for both human controls and agents.

## Active Goal Completion Criteria

The broad launcher/editor/lifecycle/manual-solutions milestone completed on 18 July 2026. Its criteria are retained here as the durable acceptance record:

- Normal macOS use has one supported launcher path with status, stop, stale-runtime replacement, and clear failure guidance; manual two-terminal startup remains a debugging path only.
- File open, close, save, discard, folder switch, version restore, recovery, and stale-revision conflicts use Mauth-owned UI and one explicit document-session outcome model.
- `App.tsx` is a composition shell rather than the owner of separable mutation, navigation, persistence, drag/drop, inspector, or preview-render workflows. Extraction should follow coherent ownership boundaries, not an arbitrary line-count target.
- Manual Solutions mode can author and revise worked text, selected choices, table entries, graph annotations, and diagram answers on the same structured surfaces used by preview and print. AI drafting remains optional and editable.
- External-folder, stale-autosave, document-conflict, bridge-session, solution-surface, and rendered-preview workflows have focused regression coverage.
- `docs/current-state.md`, architecture, storage, bridge, actions, AI brains, and roadmap documents agree with the implemented behavior, and `pnpm check` passes.

Completion does not require a Swift rewrite or a restored in-app chat panel.

## Next

- Add higher-level Mauth actions for common teacher operations and layout checks.
- Build higher-level page-flow checks and conservative repair actions on the completed measured preview-readiness foundation; keep mathematical solution validation separate from rendered print evidence.
- Improve Mauthdown import/export and round-trip fidelity.
- Extract remaining render-heavy frontend boundaries, especially function graphs and preview segmentation. The navigator, workspace binding, overlay, header, and selection-inspector splits are complete.
- Add runtime smoke tests whenever a stale-state or hidden-state regression is fixed.
- Publish and clean-machine-test the first updater-enabled release after `0.1.0` on another Apple Silicon Mac, then verify an in-app update to the following alpha. Version `0.1.0` cannot self-update and therefore needs one final manual replacement.
- Keep the public README, GitHub Pages download page, GitHub release assets, release tag, and app version aligned. Normal teacher installation should use the signed DMG; source builds remain for development and local agent helper tooling.

## Later

- Reintroduce an optional in-app assistant as a client of the same bridge and action contracts, never as a hidden mutation path.
- Evaluate deeper Finder, iCloud Drive, printing, and classroom integrations after the local file model is stable.
- Consider a native Swift implementation only if those integrations justify a rewrite.

## Agent Workflow Goals

- Create explicit development and authoring work streams:
  - `Development`: code, tests, schemas, docs, repository maintenance.
  - `Authoring`: teacher-facing assessment creation, source conversion, layout, and validation.
- Prefer structured actions and browser verification over provider chat loops.
- Make assessment authoring use `snapshot -> dry-run -> validate -> apply -> browser verify` rather than raw project-file JSON edits.
- Keep the existing MCP surface thin over the HTTP bridge; do not create a second document implementation.
- Treat paid provider calls and any future in-app chat as optional clients, not the default product path.

## Local Agent Bridge TODO

The first bridge slice exists and is the intended agent-facing editing path. Keep improving it rather than creating another mutation channel.

- Keep shared TypeScript/API contracts aligned for agent snapshots, preview/apply requests, mutation results, comments, suggestions, presence, and events.
- Keep the active-document snapshot compact and stable with question, part, subpart, module, diagram, file, revision, and validation summaries.
- Keep preview endpoints wired to the existing document action dry-run path and returning preview summary plus validation issues.
- Keep apply endpoints revision/idempotency protected and committed through editor history/autosave.
- Return stale-state conflicts with enough fresh snapshot/file information for an agent to rebuild its batch safely.
- Expand validation output for structural, solution, diagram, and layout checks in a compact agent-readable shape.
- Keep local comments and suggestions as review state separate from committed document edits.
- Expand presence/events so the app can show what an external agent is doing without exposing prompt internals.
- Keep `/.well-known/mauth-agent.json` and `/agent-docs` discovery docs current with the implemented bridge.
- Add bridge-specific tests and smoke checks for every new agent-facing workflow.

## Reliability Gates

Before changing models or handing off the worktree:

```bash
pnpm check:handoff:live
```

This runs the durable documentation contract check and also compares the recorded branch, baseline commit, dirty-worktree counts, and key source sizes with the checkout. It is not a substitute for the code and runtime gates below.

Use these before considering a migration complete:

```bash
pnpm test:api
pnpm test:web-actions
pnpm build:web
pnpm smoke:context-menu-actions
pnpm smoke:file-manager
pnpm smoke:document-session-conflict
pnpm smoke:diagram-solution-authoring
```

Use broader smoke tests when touching diagrams, preview, print, or drag/drop.
