# App Scan And Direction

This scan reflects the current Mauth Studio architecture after the standalone desktop, storage, bridge, document-session, solution-layer, and `App.tsx` extraction work to date. For a concise handoff, read `docs/current-state.md` first; for the durable system map, read `docs/architecture.md`.

## Current Health

- The full quality gate passes: formatting, ESLint, Ruff, pytest, web action tests, Plotly tests, TypeScript, and Vite build.
- The running API exposes `/api/system/status`, which reports the API version/start time, repo root, active documents folder, default project, git branch/commit, and browser bridge sessions. The web header now has a System status panel and marks the API as stale when this route is missing.
- `pnpm macos:build` packages the Vite editor, FastAPI maths/storage service, Penrose runtime, and self-contained Mauth Agent Connector into one ad-hoc-signed Electron app. `pnpm macos:install` installs it at `~/Applications/Mauth Studio.app`; opening or quitting that app starts and stops its private sidecar without leaving Terminal windows running.
- The standalone app selects a dynamic loopback port and writes its current URL and process identity to `~/Library/Application Support/Mauth Studio/runtime.json`. The bundled connector and repository diagnostics discover that manifest automatically, so Codex and Claude can use the normal local bridge without a source checkout or persisted token.
- **Help > Set Up Codex or Claude...** opens the System Status agent section with one-time Codex, Claude Code, and Claude Desktop setup plus a connection test. Packaging verification starts the connector through the app-owned Electron runtime, and `pnpm smoke:agent-connector` negotiates the MCP tool list and reads a live snapshot.
- `pnpm dev:launch:desktop` remains the fixed-port browser debugging stack. It validates `/api/system/status`, replaces stale or partial Mauth-owned development runtimes, and is not required for normal app use.
- `pnpm smoke:external-folder-autosave` starts an isolated API/web stack, opens a temporary external documents folder, proves legacy/browser files are not silently imported, and proves a stale browser draft cannot overwrite a newer disk revision.
- The running API exposes the current local agent browser bridge endpoints, including `/api/agent/current/browser/register`. If those requests return `404`, check the System status panel first; the likely cause is a stale API process.
- File, folder, backup/import, close-file, save-as, restore-version, and solution-slot line-count workflows now use Mauth-owned dialogs rather than native `window.prompt`, `window.confirm`, or `window.alert`. Close-file decisions now support explicit Save, Don't Save, and Cancel paths.
- Document persistence, close/open decisions, active-file sync, and file-conflict recovery/reload actions are now composed through a document-session controller rather than wired separately in `App.tsx`. Browser tab/window unload is also guarded while a document has unsaved file changes, unsaved new-draft changes, or an active file operation.
- Browser smoke passes for the main editor load and the Files drawer interaction. The page renders meaningful content, opens the drawer, and produces no console warnings or errors in the checked flow.
- Question reorder and question-boundary page-break drag state and handlers now live in a focused controller with pure movement helpers and tests. A live keyboard reorder plus undo check restored the active exam to its original saved state without console warnings or errors.
- Nested module/part/subpart and editor-page-break drag state, pointer cleanup, handlers, drop-zone rendering, and move rules now live outside `App.tsx`. A live pointer move plus Undo restored the exact part-id order and clean saved revision without console warnings or errors.
- Startup stale-file autosave reconciliation and conflict recovery/reload workflows now have direct async orchestration tests. Clean stale drafts advance to disk, dirty or unverifiable drafts stay recoverable, cancelled reloads preserve local work, and recovery/reload actions are guarded while file operations are busy.
- Question/part/subpart content mutation callbacks now live in `editorContentMutationActions.ts`, preserving the shared Mauth action path, hierarchy-specific scopes, editor anchors, preview graph routing, and solution-mode visibility defaults.
- Question/part/subpart panel callbacks now live in `createEditorPanelRenderers.tsx`, with pure hierarchy, visibility, scope-block, and anchor decisions in `editorPanelRenderPlans.ts`. Live browser verification expanded a nested part editor and restored preview-only mode without console warnings or errors.
- Context selection, duplicate, move, delete, capability checks, nested-column behavior, and global-delete composition now live in `editorContextCommandRuntime.ts` and `useEditorContextCommandController`. Live context-menu and global Delete checks restored the saved exam with Undo, and the isolated context-menu smoke passes.
- Recovery-copy and confirmed reload conflict actions are now composed inside `useDocumentSessionController` with the rest of the document lifecycle. That extraction reduced `App.tsx` to 1889 lines at that stage.
- Question creation/deletion and question-boundary page-break creation/removal are now composed through `createEditorQuestionLifecycleController`, with focused action tests and isolated browser verification. That extraction reduced `App.tsx` to 1835 lines at that stage.
- Active-question selection, anchor activation, reveal sequencing, panel-open signals, graph-child preview mirroring, and editor-pane pinning now live in `useEditorNavigationController`, with pure decisions in `editorAnchorActions.ts`. That extraction reduced `App.tsx` to 1794 lines at that stage.
- Active front-matter/page-break/section/question rendering, conflict-banner placement, inspector placement, preview-pane composition, and rendered-selection synchronization now live in `DocumentEditorWorkspace.tsx`, with surface precedence and labels in `documentWorkspaceRenderPlan.ts`. State and mutation ownership remain in the existing controllers. This reduced `App.tsx` to 1689 lines, and the isolated diagram-solution workflow verifies the editor/inspector/preview composition together.
- The geometry2d inspector is now a focused `Geometry2DSelectionInspector.tsx` component, with pure child-anchor and title selection in `geometry2dInspectorSelection.ts`. It preserves the parent block-update callback and shared Mauth action path, reduces `SelectionInspector.tsx` from 3237 to 2379 lines, and is covered by focused selection tests plus the isolated diagram-solution smoke.
- The graph2d canvas/function/feature inspector is now a focused `Graph2DSelectionInspector.tsx` component, with pure anchor, title, label-mode, and sibling-preserving patch logic in `graph2dInspectorSelection.ts`. It preserves the same block-update callbacks, reduces `SelectionInspector.tsx` from 2379 to 1084 lines, and is covered by focused tests plus rendered function/feature solution-layer smoke steps.
- Penrose geometry/network/Venn inspector controls are now in `PenroseSelectionInspector.tsx`, with typed family title and normalized view-data selection in `penroseInspectorSelection.ts`. Existing structured patches remain authoritative, including clearing stale custom Substance. This reduces `SelectionInspector.tsx` from 1084 to 872 lines and has focused plus rendered network-visibility coverage.
- Vector label-style, axes/grid, range, dimensions, equal-scale, and major/minor interval controls are now in `Vector2DSelectionInspector.tsx`, with normalized view state and pure visibility/interval patches in `vector2dInspectorSelection.ts`. Major intervals continue to set the attached axis-number steps without changing stored graph dimensions. This reduces `SelectionInspector.tsx` from 872 to 713 lines and has focused action tests plus rendered inspector coverage.
- Graph3d dimensions, camera values, and reset controls are now in `Graph3DSelectionInspector.tsx`, with normalized view state in `graph3dInspectorSelection.ts`. Existing metadata-preserving camera patches remain authoritative. This reduces `SelectionInspector.tsx` from 713 to 601 lines and has focused action tests plus rendered edit/reset coverage.
- Statistics chart type, dimensions, grid/fill visibility, fill colour, and opacity controls are now in `StatsChartSelectionInspector.tsx`, with normalized data/options and pure sibling-preserving patches in `statsChartInspectorSelection.ts`. Plotly option dimensions remain mirrored to the shared graph config. This reduces `SelectionInspector.tsx` from 601 to 460 lines and has focused action tests plus rendered settings coverage.
- Image name, alternative text, and display dimensions are now in `ImageSelectionInspector.tsx`, with normalized metadata/dimensions in `imageInspectorSelection.ts`. Existing `imageDataPatch` behavior remains authoritative, including preserving the embedded source and natural metadata. This reduces `SelectionInspector.tsx` from 460 to 391 lines and has focused tests plus rendered inspector coverage.
- Columns, choices, tables, and answer-space settings are now in `BasicBlockSelectionInspector.tsx`, with normalized view state in `basicBlockInspectorSelection.ts`. Diagram type/alignment and renderer dispatch are now in `DiagramSelectionInspector.tsx`, with child-aware base-control routing in `diagramInspectorRouting.ts`. This reduces `SelectionInspector.tsx` from 391 to 104 lines; focused tests plus basic-block and diagram-solution browser smokes cover the split.
- The quick rail and expanded document navigator now compose through `DocumentNavigationWorkspace.tsx`. It receives the existing navigation, lifecycle, and drag controllers by domain, while `documentNavigationPresentationPlan` owns only expanded visibility, notes/assessment labels, and the `miniToc` context origin. This reduces `App.tsx` from 1689 to 1640 lines. The isolated context-menu smoke opens and screenshots the expanded navigator, verifies context actions from both navigation surfaces, deletes through the expanded TOC, closes it again, and reports a clean browser console.
- Files, Mauth dialogs, new-document setup, System status, solution validation, action proposals, context menus, and print-preview mounting now bind through `AppOverlayWorkspace.tsx`. It receives the existing controllers by domain and maps them to the unchanged `AppOverlays.tsx` renderer; `appOverlayPresentation.ts` owns only panel visibility, print gating, and proposal-feedback sequencing. This reduces `App.tsx` from 1640 to 1588 lines. The isolated context-menu smoke now opens and closes Files, System status, and solution validation, verifies the hidden print-preview stage, continues the navigator/context-action workflow, and reports a clean browser console.
- Header binding now runs through `AppHeaderWorkspace.tsx` and the pure `appHeaderBindings.ts` adapter. Existing pane, file, session, status, theme, solution, validation, print, and history controllers remain authoritative. This reduces `App.tsx` from 1588 to 1551 lines; focused tests cover every mapped command, and the isolated context-menu smoke exercises pane/inspector controls, New and Save Mauth dialogs, theme, Student/Solutions mode, Files, status, validation, and print.
- Open-document binding now runs through `DocumentEditorWorkspaceBindings.tsx`. Existing selection, navigation, context-menu, drag, mutation, question/section lifecycle, solution, front-matter, conflict, inspector, and preview contracts remain authoritative; the adapter only maps them to `DocumentEditorWorkspace.tsx` and the established panel renderers. This reduces `App.tsx` from 1551 to 1386 lines. Focused tests cover the conditional solution command and async conflict-command wrappers, while the isolated context-menu smoke verifies exactly one editor, inspector, and preview workspace with a clean browser console.
- Deferred preview values, mark totals, preview zoom/page format, pane visibility, shell/workspace grids, TOC construction, and active preview-anchor projection now compose through `useEditorWorkspacePresentationController`. Pure visibility, layout, and page-break-anchor decisions live in `editorWorkspacePresentation.ts`; no document state, mutation, persistence, or navigation path moved into the presentation boundary. This reduces `App.tsx` from 1387 to 1370 lines.
- Stateless editor runtime wiring now lives in `editorApplicationRuntime.ts`: block factories, document normalizers, TOC summaries, block selection, duplication, persistence, version previews, and solution validation are configured once and imported by the shell. `useStableEvent` is also a focused hook rather than an inline App helper. This reduces `App.tsx` from 1371 to 1264 lines without moving state, effects, history, or mutation ownership. Focused runtime tests, the full web action suite, and the isolated context-menu smoke verify the extraction.
- Manual solution composition now runs through `useEditorManualSolutionController`. The hook assembles the existing solution-copy, validation/repair, and solution-slot controllers over the shared factories, Mauth dialogs, and structured action path; it creates no parallel solution state. This reduces `App.tsx` from 1115 to 1075 lines, and the isolated diagram-solution smoke verifies root and nested solution surfaces with a clean browser console.
- File opens, documents-folder switches, and active-file version restores now share one explicit typed document-transition outcome. A stale-revision restore presents **Save recovery copy and restore**, **Restore without saving**, and **Cancel**; cancellation and recovery failure invoke no restore call. Focused tests and the isolated `pnpm smoke:document-session-conflict` workflow prove both file-open and version-restore recovery paths, including disk and editor state after cancellation.
- Manual `graph2d` annotation authoring now follows the active layer. In Solutions mode the editor exposes **Add solution annotation**, creates the feature with `solutionOnly: true`, labels it as a Solution item, keeps the inspector override, and hides it from Student mode. Focused tests and isolated rendered browser verification cover the behavior.
- Manual `graph2d` function authoring now follows the same active layer. In Solutions mode the editor exposes **Add solution function**, creates an editable answer curve with `solutionOnly: true`, keeps the inspector override, hides it and dependent features from Student mode without shifting function indexes, and renders only that curve in solution blue. Focused schema, action, visibility, validation, and isolated browser-smoke coverage verifies the path.
- Manual `geometry2d` primitive authoring now follows the active layer. Points, segments, arcs, angles, and construction markers added in Solutions mode default to structured `solutionOnly` elements, carry a Solution badge and inspector override, disappear from Student editor/preview, and render blue without recolouring the shared construction. Focused tests and the expanded isolated diagram-solution smoke cover the complete path.
- Manual `vector2d` authoring now follows the active layer. Vectors, segment labels, and angle markers added in Solutions mode default to structured `solutionOnly` elements, carry a Solution badge and layer override, disappear from Student editor/preview, and render blue without recolouring shared vector content. Dependent labels and angle markers are filtered when their referenced solution vector is hidden. Focused schema, action, visibility, and browser-smoke coverage verifies the path.
- Manual `graph3d` authoring now follows the active layer. Points, segments, and dimensions can be created directly; existing faces and solids expose the same structured `solutionOnly` override. Student mode hides answer elements and dependent geometry while preserving shared camera framing, and Solutions mode colours only the answer elements blue. Focused schema, action, visibility, in-app Browser, and deterministic smoke coverage verifies the path.
- Manual Plotly statistics authoring now follows the active layer. Supplemental lines, points, line-and-point traces, and bars live in structured `data.series`; Solutions mode defaults new series to `solutionOnly`, Student mode filters them, and Solutions mode colours only the answer series blue. Focused schema, action, visibility, Plotly, in-app Browser, and deterministic smoke coverage verifies the path.
- Manual uploaded-image authoring now follows the active layer. Labels, ellipses, and arrows live in structured `data.annotations` with percentage geometry; Solutions mode defaults new annotations to `solutionOnly`, Student mode filters them, and Solutions mode colours only the answer overlays blue without recolouring or replacing the bitmap. Focused schema, action, validation, visibility, and deterministic browser-smoke coverage verifies the path.
- Structured Penrose geometry, network, and Venn authoring now follows the active layer for the supported answer elements. Solution points/nodes and segments/links hide with dependent relationships in Student mode and render blue in Solutions mode; Venn region answers preserve fixed region positions while hiding solution labels/values and shading. Custom Advanced Substance and complex construction predicates remain a paired-solution-diagram path.
- Student diagram panels now expose **Complete in solutions** directly. Root and column-nested diagrams create one editable solution-only copy and later reopen it without duplication. Nested Columns editors render only the active replacement layer; focused tests and `pnpm smoke:diagram-solution-authoring` cover the workflow.
- Diagram solution completeness now distinguishes answer state from presentation state. Supported structured `solutionOnly` elements on shared diagrams count as response and solution content, can carry surface ticks without recolouring the whole diagram, and validate across JSXGraph, Plotly, and structured Penrose families. A paired solution copy stays incomplete while it differs only by size, colour, grid, view range, chart range, or 3D camera.
- Solutions mode now exposes compact validation state on marked question, part, and subpart headers. Leaf controls apply the existing deterministic fix, parent controls jump to their first descendant issue, and ready state is withheld while worked-solution text is blank or a shared or legacy paired completion table still has unanswered student-entry cells. The isolated context-menu smoke verifies the missing-slot, blank-solution, completed-solution, and Student-mode-hidden states. The grouped validation binding left `App.tsx` at 1387 lines before the workspace-presentation extraction reduced it to 1370; the version-transition binding leaves it at 1371.
- Browser editor tabs unregister on page exit, and the API immediately releases requests assigned to a closed session. System status exposes the unregister route; focused tests and a live register/navigate-away check cover the lifecycle.
- The app has strong tests around API storage, agent bridge endpoints, Mauth action contracts, graph domains, diagram inspection, and Plotly statistics charts.

## Main Risks

1. `apps/web/src/App.tsx` is still too large.

   The file remains the central risk for regressions because controller construction and top-level layout still meet there. The latest cleanup moved stateless editor-runtime configuration, document state, document-session orchestration, file operations, autosave, startup storage hydration, logo-library ownership, front-matter logo actions, bridge handling, print control, preview zoom, editor selection and reveal ownership, editor/preview navigation, active editor-surface and preview composition, open-document binding, quick/expanded navigator composition, overlay and header binding, context-menu state and commands, global delete, action proposal state, solution-validation fixes, block-context lookup, new-document plan building, question lifecycle, question/question-boundary page-break movement, nested module/part/subpart/page-break dragging, content mutation, and panel rendering into focused hooks/helpers.

2. File and folder state has too many overlapping concepts.

   The current model has visible project files, recent files, legacy migration, autosave, revision snapshots, and the selected external folder. Those are all valid, but the UI needs to make the active source of truth obvious. The safest direction is: one visible documents folder, explicit recents, explicit recovery, and no silent importing or copying when a teacher opens another folder. The external-folder/autosave smoke now guards the highest-risk part of that path.

3. Document lifecycle remains a high-risk boundary.

   Native browser prompts have been replaced with shared Mauth dialogs, close supports explicit save, discard, and cancel choices, and open/close/save/sync/recovery/reload are composed through a document-session controller. Before-open conflicts now have explicit recovery/open-without-saving/cancel outcomes shared by file and folder switches. Background active-file polling now preserves drafts through external-folder outages and distinguishes reconnection from deletion or revision conflict. The remaining risk is preserving that one outcome model as more operations and recovery paths are added; no controller should create a parallel implicit-discard path.

4. Render-heavy modules need boundaries.

   `FunctionGraph.tsx`, preview segmentation, and graph editors are the next largest frontend risks. Graph rendering should keep moving toward pure geometry/domain helpers plus thin React adapters.

5. The app can still feel stale when the user is running an older dev process.

   The header now checks `/api/system/status` and shows stale/unavailable API state. The launcher refuses to reuse an API process that responds to `/api/health` but not `/api/system/status`, desktop mode replaces Mauth-owned partial runtimes, status no longer blocks on external cloud metadata, and stop can force-release a port held by a Mauth-owned process that ignored `SIGTERM`. Normal browser exits now unregister their bridge session immediately; a crashed browser still relies on the server TTL.

## Direction

Mauth should stay agent-native first, with a polished human editor on top.

The product should not return to a provider-backed in-house chat as the main architecture. The better model is:

```text
structured document state
-> deterministic actions and dry runs
-> validation and preview inspection
-> browser verification
-> optional AI assistant that uses those same contracts
```

An in-app assistant can come back later, but it should be a client for the same local action/bridge layer that Codex, Claude Code, and future MCP tools use. It should not become a separate hidden editing pathway.

## Current Product Decisions

These are active decisions, not unresolved architecture questions. Revisit them only when new requirements materially change the trade-off.

| Area                 | Current decision                                                                                                                                                                     | Revisit when                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Application shape    | Keep the packaged Electron shell around the React/Vite editor and FastAPI sidecar.                                                                                                   | A proven platform requirement cannot be met reliably by this stack.                                                             |
| Agent integration    | External/local agents use the HTTP bridge, MCP wrapper, structured actions, validation, and browser proof.                                                                           | A required workflow cannot be represented by the shared action contract.                                                        |
| In-app AI            | Optional future assistant, implemented as another client of the same bridge and actions.                                                                                             | The transparent agent workflow is reliable and there is a clear teacher-facing use case.                                        |
| Solution authoring   | Structured manual solution editing is the source of truth; AI may draft editable content.                                                                                            | Never move to AI-only authoring without an explicit product decision.                                                           |
| Storage              | Visible teacher files plus folder-adjacent `.mauth` project state; global state and autosave live in Application Support.                                                            | Packaging or platform security requires a different storage boundary.                                                           |
| Desktop packaging    | Electron packaging, Hardened Runtime, per-launch API authentication, Developer ID signing, notarization, teacher-confirmed alpha updates, and guarded draft-first publication exist. | Distribution broadens beyond the current Apple Silicon alpha or another update channel becomes necessary.                       |
| Native Swift rewrite | Not on the near-term path.                                                                                                                                                           | Deep Finder, iCloud, print, classroom, sandbox, or accessibility requirements cannot be met reliably by the packaged web stack. |

The immediate development priority remains reliability and explicit state, followed by editor-shell reduction and complete manual solution surfaces. Distribution hardening and any chat UI come after those contracts.

## Recommended Roadmap

### 1. Stabilise The Local App

- Use `/api/system/status` as the launcher and support contract for process, folder, file, revision, autosave, and bridge diagnostics.
- Keep measured preview readiness visible in System Status and the current agent snapshot: copy mode, content/supplementary/total pages, and oversized-page warnings must all come from the rendered preview rather than guessed document structure.
- Keep the packaged app as the normal macOS runtime and the fixed-port browser launcher as a development-only diagnostic path.
- Keep external folder opening read-only until the user explicitly creates, saves, duplicates, imports, or moves files.
- Keep save, close, delete, rename, restore, folder selection, and solution-slot configuration on structured Mauth dialogs; preserve the shared typed outcome gates for recovery and conflict choices.
- Keep `docs/current-state.md` current whenever runtime, storage, bridge, or document lifecycle behaviour changes in a way a new agent would need to know.

### 2. Finish The Editor Shell Split

- `SelectionInspector.tsx`, document navigation, document workspace rendering and binding, header binding, overlay binding, the stateless editor runtime, project persistence, Files-drawer project management, editor-agent bridge, and manual-solution composition are now focused boundaries over existing controllers. Continue with remaining composition-only wiring in `App.tsx` only where a coherent boundary can be extracted without moving document, mutation, preview, navigation, inspector, history, solution, or session ownership.
- Keep recovery and conflict handling inside the document-session controller and extend the focused workflow coverage whenever another file operation joins that lifecycle.
- Keep preview pagination and render orchestration behind the existing preview/document-workspace boundaries; extract further only when a focused renderer or pagination contract is clearer than the current ownership.
- Keep the extracted panel-render plans and adapters aligned with the existing panel contracts, shared actions, solution visibility, and automatic labels.
- Keep `App.tsx` as composition only: state providers, controllers, layout, and component wiring.

### 3. Make Manual Solutions A First-Class Layer

- Keep Student/Solutions mode.
- Let teachers edit solution-only content in place.
- Keep solution annotations on the same surfaces students use: table cells, graph features, ticks, circled choices, and drawn marks. Multiple-choice answer metadata and ticks belong on the shared choices block and must be gated entirely by Solutions mode rather than duplicated into another list.
- Keep scoped solution status driven by the shared validator: blank solution slots, incomplete shared or legacy paired completion tables, and mathematically unchanged paired diagrams are unfinished; hidden text ticks plus structured choice/table/diagram ticks must match the item marks; shared choice answers, table entries, and structured diagram annotations count as answer content; recursive column slots use the same structured quick-fix actions; and parent summaries only navigate to existing issues.
- Keep element-level `graph2d` functions/features, `geometry2d`, `vector2d`, `graph3d`, Plotly `statsChart`, uploaded-image, and supported Penrose annotations on shared diagrams when only a few answer elements are needed.
- Keep whole-diagram response surfaces paired and idempotent for substantially different diagrams, custom Penrose Substance, and unsupported complex construction predicates.
- Keep AI as "draft solutions", not the source of truth.

### 4. Strengthen Agent Contracts

- Add more high-level actions for common teacher requests: add/replace question, populate a shared completion table, add graph solution annotations, run layout checks, and export print sets.
- Build future layout-check actions on the measured preview-readiness contract; keep safe mechanical repair separate from the browser evidence that confirms the result.
- Make validation output more teacher-readable and agent-readable.
- Add smoke tests for every agent-facing workflow that previously caused stale or hidden-state issues.

### 5. Harden The Standalone App

The first standalone Electron implementation is complete. Its next steps are operational hardening, not another shell rewrite:

1. Publish each signed/notarized artifact against the committed source state that produced it, with a versioned GitHub prerelease and direct download page.
2. Verify the downloaded artifact on a clean Apple Silicon Mac without bypassing Gatekeeper.
3. Keep the per-launch token requirement on all private packaged API routes and preserve automatic Codex/Claude discovery through the bundled connector and private runtime manifest.
4. Keep in-app updates teacher-controlled: check automatically once after launch, ask before download, ask before restart, and publish only verified draft assets. Treat installing the prior signed DMG as rollback; do not add silent downgrades.
5. Keep build, startup, Penrose, native quit, sidecar shutdown, external-folder, and agent-discovery smoke coverage current.
6. Consider a true macOS-native Swift app only if deep Finder, print, iCloud Drive, accessibility, or classroom requirements cannot be met by the packaged web stack.

## Strategic Call

The next major investment should be reliability and explicit contracts, not chat UI.

Mauth becomes much more useful when a teacher or agent can always answer:

- Which file is open?
- Where is it stored?
- Is it saved?
- What changed?
- What validation failed?
- What will print?
- What action will be applied before it is committed?

Once that is solid, a Codex-backed in-app assistant becomes straightforward because it can operate through the same transparent actions as every other editor surface.
