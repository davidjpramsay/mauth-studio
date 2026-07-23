# Mauth Studio Architecture

This document describes the current Mauth Studio system from process startup to document editing, persistence, rendering, agent operation, and verification. Read `docs/current-state.md` first for the current worktree checkpoint and immediate next work.

## System Shape

Mauth Studio is a local-first desktop application with a React editor, a local FastAPI sidecar, and an external-agent control plane.

```text
Electron macOS app
  -> packaged Vite/React editor
  -> packaged FastAPI sidecar on a dynamic loopback port
       -> maths and formatting services
       -> file-backed document workspace
       -> local agent bridge coordinator

external agent or MCP client
  -> local agent bridge
  -> active React editor tab
  -> shared Mauth action layer
  -> editor history, validation, autosave, and project-file save
```

The editor renderer is the authoritative live editing surface while it is registered with the bridge. Visible project files and their revisions are the durable source of truth. Autosave is recovery state, not a saved project file.

## Runtime And Desktop Shell

Normal macOS use starts through the installed app:

```bash
open ~/Applications/Mauth\ Studio.app
```

`pnpm macos:build` creates a Hardened Runtime, ad-hoc-signed local bundle and `pnpm macos:install` installs it. `pnpm macos:release` creates the Developer ID signed/notarized artifact set, while `pnpm macos:ship` guards and publishes that set as a GitHub prerelease. The Electron main process:

1. reserves a dynamic `127.0.0.1` port;
2. starts the packaged FastAPI executable as a child process;
3. waits for `/api/system/status` before opening the editor window;
4. generates a random per-launch bridge token and writes it with the URL in a mode-`0600` runtime manifest under Application Support for Codex/MCP discovery;
5. serves the built editor and API from one local origin;
6. removes the manifest and stops the sidecar when the app quits.

Update-enabled packaged releases use `electron-updater` against the public GitHub alpha channel. A check runs once shortly after launch and is also available from the application menu. Downloads and restart/install actions each require teacher confirmation; source-development and ad-hoc directory builds without `app-update.yml` never check. The updater consumes the signed ZIP and `latest-mac.yml` published beside the signed DMG. The first updater-enabled release after 0.1.0 remains a manual bootstrap install because 0.1.0 did not contain an updater.

The packaged sidecar includes the Python maths stack and a bundled Penrose renderer. Electron supplies the Node runtime used by Penrose. The BrowserWindow uses context isolation, renderer sandboxing, no Node integration, and main-process authorization-header injection for local API traffic. When the desktop token is configured, every `/api/*` route except health and system status requires it; discovery docs remain public. External tools discover the token through the private runtime manifest. Unauthenticated local requests receive `401 AGENT_AUTH_REQUIRED` for bridge routes or `401 API_AUTH_REQUIRED` for other private APIs. Navigation outside the local app origin opens in the system browser.

The status route remains deliberately lightweight. For an external cloud-backed documents folder it reports configured identity without opening `.mauth/project.json`; unavailable File Provider placeholders return `503 STORAGE_UNAVAILABLE` on normal project routes rather than blocking app startup. The older `dev:launch:desktop` browser stack remains a debugging path. `pnpm macos:dev` runs the Electron shell from source with a watched Uvicorn API and Vite HMR renderer on separate dynamic loopback ports; the private runtime manifest records the API and web URLs independently. Electron main-process and packaging edits still require a development-shell restart. See `docs/agent-local-setup.md`.

## Frontend Composition

The frontend is in `apps/web` and uses React, TypeScript, Vite, Tailwind, MathJax SVG, JSXGraph, Penrose, and Plotly.

`apps/web/src/App.tsx` is the composition shell. It still coordinates too much and is being reduced incrementally. New separable state or workflows should move into:

- `apps/web/src/hooks`: stateful controllers and lifecycle composition;
- `apps/web/src/lib`: pure document, action, validation, persistence, and geometry helpers;
- `apps/web/src/components`: editor, preview, inspector, dialog, solution, and file-manager UI.

The intended frontend dependency direction is:

```text
App composition
  -> focused controllers/hooks
  -> pure helpers and Mauth actions
  -> shared schema

components
  -> callbacks/actions supplied by composition
  -> rendering helpers
  -> shared schema
```

Avoid adding a second mutation path inside a component. Human controls and agent operations should use the same structured Mauth action contract where practical.

The concrete stateless editor runtime is assembled once in `editorApplicationRuntime.ts`. It wires the shared id factory, content-block factories, document normalizers, TOC summaries, block selection, duplication, persistence, version previews, and solution-validation runtime used by the composition shell. `App.tsx` consumes those configured contracts rather than rebuilding them at module scope. Keep React state and lifecycle effects out of this runtime; reusable stateful callback identity lives in the focused `useStableEvent` hook.

Question reorder and question-boundary page-break movement are composed through `useQuestionPageBreakDragController`, with drag state in `useQuestionPageBreakDragState` and pure boundary/no-op/relocation rules in `editorQuestionPageBreakDrag.ts`. Module, part, subpart, and nested editor-page-break movement are composed through `useNestedEditorDragController` and `useNestedEditorDragState`. Pure hierarchy, move-action, keyboard-intent, destination, and atomic page-break rules live in `editorSubsectionDrag.ts` and `editorNestedDragActions.ts`; shared DOM placement and drag-image behavior lives in `editorDragDom.ts`.

Question creation, deletion, question-boundary page-break creation/removal, and their post-action focus changes are composed through `createEditorQuestionLifecycleController`. Pure question factories, fallback-selection rules, destination helpers, and action construction stay in `editorQuestionLifecycle.ts`. Keep those commands on the shared document-action path rather than rebuilding lifecycle behavior inline in `App.tsx`.

Question, part, subpart, and content-module mutation callbacks are built by `createEditorContentMutationActions` in `editorContentMutationActions.ts`. It maps human editor operations to the same structured Mauth actions used by external agents, including selected blocks nested in columns, preview graph edits, module insertion/removal, part/subpart creation, and nested page-break insertion. `App.tsx` supplies current state and navigation callbacks; it should not reintroduce parallel mutation logic.

Question, part, and subpart panel callbacks are assembled by `createEditorPanelRenderers.tsx`. Pure render decisions live in `editorPanelRenderPlans.ts`, which selects solution-visible blocks, hierarchy targets, scope blocks, and anchors before the React adapters render `EditorQuestionPanel`, `EditorNestedPartPanel`, and `EditorScopedContentBlockPanel`. Keep hierarchy and visibility decisions in those plans rather than rebuilding them inline in `App.tsx`.

Editor context commands are composed through `useEditorContextCommandController`. Its `editorContextCommandRuntime.ts` owns selection, duplication, movement capabilities and dispatch, deletion, nested-column behavior, and post-action focus; the hook attaches the global Delete/Backspace listener to the same runtime. Context menus and keyboard commands must not grow separate hierarchy or mutation logic.

Editor/preview navigation is composed through `useEditorNavigationController`. It owns active-question selection, anchor activation, reveal sequencing, containing-panel open signals, queued editor/preview jumps, graph-child preview mirroring, preview click routing, pane toggles, and left-edge editor pinning. Pure activation and reveal decisions live in `editorAnchorActions.ts`; `App.tsx` should supply state setters and renderer anchors rather than rebuilding navigation wrappers.

Workspace presentation state is composed through `useEditorWorkspacePresentationController`. It owns deferred preview document values, current and deferred mark totals, page-format and zoom state, pane visibility, shell/workspace grid styles, document TOC construction, and active preview-anchor projection. Pure visibility, grid-layout, and page-break-anchor rules live in `editorWorkspacePresentation.ts`. Keep document mutation, persistence, navigation intent, and rendering behavior outside this presentation boundary.

The open document's editor/inspector/preview layout is rendered by `DocumentEditorWorkspace.tsx`. It owns only presentation composition: active front-matter/page-break/section/question surface selection, conflict-banner placement, inline inspector placement, the preview pane, and synchronising the rendered preview selection after layout changes. `DocumentEditorWorkspaceBindings.tsx` adapts the existing selection, navigation, context-menu, drag, mutation, lifecycle, solution, front-matter, conflict, and preview contracts to that renderer and assembles the established panel renderers. `documentWorkspaceRenderPlan.ts` contains the pure surface precedence and label rules, while `documentWorkspaceBindings.ts` contains only the supported-solution-handler and void async-command binding decisions. Document state, mutations, history, persistence, navigation intent, and preview-edit callbacks remain owned by their existing controllers; do not add a second action or session path inside either workspace component.

The quick document rail and expanded document table of contents are composed by `DocumentNavigationWorkspace.tsx`. It adapts the existing editor-navigation, question lifecycle, section-heading lifecycle, and question/page-break drag controllers to `DocumentNavigatorRail` and `DocumentNavigator`; it does not own their state or actions. `documentNavigationPresentationPlan` supplies expanded-panel visibility, notes-versus-assessment item labels, and the shared `miniToc` context-menu origin. Keep future navigator behavior on those existing controllers rather than adding local movement, selection, or mutation state to the workspace component.

The application header is bound by `AppHeaderWorkspace.tsx` and rendered by `AppHeader.tsx`. The workspace receives the existing pane/navigation, file-status, document-session, file-manager, System status, theme, solution-mode, solution-validation, print, and editor-history contracts by domain. `appHeaderBindings.ts` maps those contracts to the renderer props and owns only the explicit async-close and panel-open callback wrappers. Keep save, close, solution, print, pane, theme, and history decisions in their existing controllers rather than adding header-local state or commands.

Application overlays are bound by `AppOverlayWorkspace.tsx` and rendered by `AppOverlays.tsx`. The workspace adapter receives the existing file, documents-folder, version, backup, file-operation, status, validation, action-proposal, context-menu, dialog, and print contracts by domain; it maps them to the established overlay component props without owning state or creating another action path. `appOverlayPresentation.ts` contains only visibility and proposal-draft presentation rules. Keep file/session decisions in their existing controllers and keep overlay components focused on rendering.

Renderer-specific inspector surfaces should leave `SelectionInspector.tsx` as focused components rather than growing one conditional monolith. `Geometry2DSelectionInspector.tsx` owns the geometry canvas and point, segment, arc, angle, and construction-marker controls. Pure geometry-child anchor parsing, parent-anchor resolution, and inspector-title selection live in `geometry2dInspectorSelection.ts`; both the parent inspector and the geometry component consume that shared selection contract. Keep block updates on the callbacks supplied by `SelectionInspector` so extraction does not create another mutation path.

`Graph2DSelectionInspector.tsx` similarly owns graph canvas, function, feature, grid, size, label, and solution-layer controls. `graph2dInspectorSelection.ts` owns function/feature anchor parsing, readable titles and summaries, sibling-preserving patches, solution-layer clearing, and feature-specific label-mode choices. The parent inspector uses the same selection object for its header and renderer branch, while the extracted component continues to mutate through supplied `onBlockChange` and `updateGraphConfig` callbacks.

`PenroseSelectionInspector.tsx` owns the shared Penrose scale controls plus geometry resampling, network presets/visibility, and Venn set-count/notation/count/shading controls. `penroseInspectorSelection.ts` selects the family title and normalized network or set view data. Mutations still use the existing `moduleSettingsPatches` helpers, which return structured data and clear stale custom Substance where required; the component does not duplicate that renderer invariant.

`Vector2DSelectionInspector.tsx` owns vector label style, axes/grid visibility, coordinate bounds, dimensions, equal-scale mode, and major/minor grid intervals. `vector2dInspectorSelection.ts` normalizes its view state and provides the existing visibility and interval patches, including keeping automatic axis-number intervals attached to the corresponding major-grid step. The component keeps mutations on the parent `onBlockChange` and `updateGraphConfig` callbacks; grid interval edits must not resize or reframe the stored vector graph.

`Graph3DSelectionInspector.tsx` owns 3D dimensions, saved camera values, and camera reset. `graph3dInspectorSelection.ts` normalizes dimensions and camera state, while `graph3dViewPatch` and `graph3dResetViewPatch` remain the metadata-preserving mutation rules. The component receives the parent block/config callbacks; camera edits must not resize the diagram or bypass the shared document update path.

`StatsChartSelectionInspector.tsx` owns Plotly chart type, dimensions, grid/fill visibility, fill colour, and fill opacity. `statsChartInspectorSelection.ts` normalizes data/options and supplies sibling-preserving data/options patches plus the existing zero-to-one opacity clamp. Options dimensions remain mirrored onto the shared graph config, and the component continues to mutate through the parent block/config callbacks rather than creating a Plotly-only state path.

`ImageSelectionInspector.tsx` owns image name, alternative text, and display dimensions. `imageInspectorSelection.ts` normalizes image metadata and keeps the existing `420` by `260` dimension fallbacks. Metadata edits continue through `imageDataPatch`, which preserves the embedded source, MIME type, and natural dimensions while clearing graph-only content; display-size edits use the parent block/config callbacks and do not create an upload or image-storage path.

`BasicBlockSelectionInspector.tsx` owns the non-diagram columns, choices, table, and answer-space controls. `basicBlockInspectorSelection.ts` normalizes the selected view state, while column/table mutations continue through the existing limits and patches in `moduleSettingsPatches.ts`. `DiagramSelectionInspector.tsx` owns diagram type/alignment controls and dispatches to the focused renderer inspectors; `diagramInspectorRouting.ts` keeps base controls hidden while a function, graph feature, or geometry primitive is selected. `SelectionInspector.tsx` is now the small header, solution-control, and surface-routing shell rather than a block-kind or renderer implementation.

## Document State And Actions

The shared document schema lives in `packages/shared/src/index.ts`. A document contains front matter, section headings and flow, questions, parts, subparts, content modules, formatting configuration, solution visibility, and diagram configuration.

The main action engine is `apps/web/src/lib/mauthActions.ts`. Related validation and settings patches live beside it. The action contract supports dry runs before a batch is committed.

The normal mutation flow is:

```text
current editor snapshot
  -> action validation
  -> action dry run and preview summary
  -> atomic apply against the expected snapshot
  -> one editor-history update
  -> validation refresh
  -> autosave
  -> revision-aware project-file save when required
```

Direct edits to saved JSON are reserved for recovery or migration because they can bypass editor history, active revisions, autosave, and version snapshots.

## Document Lifecycle

Document open, close, save, discard, autosave, conflict recovery, and active-file synchronization are composed through focused hooks under `apps/web/src/hooks`, particularly `useDocumentSessionController` and the project-file controllers. Recovery-copy and confirmed reload conflict actions are created inside `useDocumentSessionController` after persistence and open controllers are available, rather than being separately wired by `App.tsx`.

`useEditorProjectPersistenceController` is the composition boundary for active-file path/revision refs, the last durable save fingerprint, current document fingerprints, browser and disk draft autosave, derived file/header status, and the before-unload guard. It delegates those behaviors to the existing focused hooks and does not open, save, close, reload, or synchronize project files itself. Those mutations remain exclusively on `useDocumentSessionController` and the project-file controllers so extraction from `App.tsx` cannot create a second lifecycle path.

Startup stale-file reconciliation is implemented in the tested `projectAutosaveResolution.ts` runtime. Clean stale autosaves advance to the current disk revision; dirty or unverifiable stale autosaves retain their local snapshot and expose a revision conflict. Recovery-copy and destructive reload orchestration is implemented in `projectFileConflictWorkflow.ts`, with the React hook supplying the Mauth confirmation dialog and persistence callbacks.

While a saved document is open, `useActiveProjectFileSyncController` polls through an explicit active-file outcome contract. Storage/network failures are absorbed as `unavailable` rather than becoming unhandled promise rejections; the open editor draft and selected folder remain intact. A missing file and a newer dirty file stay distinct from an outage. After an outage, Mauth reports reconnection only when the selected active file is confirmed current or is safely reloaded from a newer clean revision.

Before opening another project file, switching documents folders, or restoring a version of the active file, `projectFileBeforeOpenWorkflow.ts` returns one explicit typed document-transition outcome. A clean current file proceeds unchanged; a dirty current file is saved normally when possible. If the loaded revision is missing or stale, operation-specific Mauth choices offer a recovery copy, deliberate continuation without saving, or cancellation. File, folder, and version controllers continue only for successful save, successful recovery, deliberate discard, or unchanged outcomes. Cancellation and recovery-copy failure preserve the current editor document and block the requested operation. `projectFileVersionRestoreWorkflow.ts` enforces this guard before invoking the disk restore; inactive-file restores do not disturb the current document.

Startup disk/browser hydration and revision reconciliation are composed through `useEditorStorageHydrationController`. Reusable logo state and persistence are owned by `useLogoLibraryController`; document lifecycle code imports portable logos through that controller rather than maintaining another logo store.

Front-matter logo interactions use the tested `createFrontMatterLogoActions` runtime so logo selection, uploads, metadata changes, selected-school-name synchronization, and deletion fallback all emit explicit document actions without returning persistence logic to `App.tsx`.

Important distinctions:

- **Editor state**: the current in-memory document and undo history.
- **Project file**: the visible saved file and its loaded revision.
- **Autosave draft**: recovery protection for current editor state.
- **Version snapshot**: a prior durable project-file revision.
- **Recent document**: a pointer to a previously opened file, not part of the current folder listing.
- **Legacy saved test**: migration input retained for compatibility, not the normal save model.

Any lifecycle change must preserve these distinctions and keep the loaded revision attached to the active file.

## Storage

The default visible document workspace and macOS app state are:

```text
~/Documents/Mauth/
  Documents/       visible teacher files and folders

~/Library/Application Support/Mauth Studio/
  storage/         active-folder identity, autosave, logos, default-project metadata
  runtime.json     live packaged-app discovery record
  desktop.log      desktop-shell diagnostics
```

`apps/api/app/services/storage.py` implements file-backed legacy, logo, and project storage. `apps/api/app/api/storage.py` exposes the HTTP routes.

The Files drawer can switch to an external documents folder. That operation changes the active workspace identity; it must not import browser fallback data or unrelated legacy files into the selected folder. Canonical `.mauth` documents are versioned JSON editor snapshots; `.test.json` remains a compatibility format and `.mauth.md` remains the separate text interchange format. The packaged macOS shell registers `.mauth` with Finder and forwards document-open events through a narrow preload bridge into the normal guarded editor lifecycle. Project metadata and versions for that selected folder remain in its hidden `.mauth` directory, while global autosave, logos, and the remembered path remain in Application Support.

Project saves use base revisions. A stale editor cannot silently overwrite a file changed by another process. See `docs/storage.md` for the full storage contract and recovery rules.

## Local Agent Bridge

The bridge is implemented by FastAPI coordination routes in `apps/api/app/api/agent.py` and a browser-side controller in the web app. It requires one active editor tab to register with the API. Tabs unregister on normal page exit; the API removes that session and releases its pending requests immediately so closed tabs do not remain as false active editors until the TTL expires.

The external authoring loop is:

```text
mauth_snapshot
mauth_actions_preview
mauth_actions_apply
mauth_validation_run
browser verification
```

The MCP process in `scripts/mauth-agent-mcp.mjs` is a wrapper over this local HTTP bridge. Release builds bundle it and its JavaScript dependencies into `Contents/Resources/agent/mauth-agent-mcp.mjs`, with an executable launcher that uses the app-owned Electron runtime in Node mode. The human setup surface receives only the connector path and client commands through narrow preload IPC; the renderer never receives the bridge token. The repository wrapper and generated connector share the same source and are not separate document implementations. Comments, suggestions, presence, and events are collaboration/review state; only an applied action batch mutates the document.

See `docs/agent-bridge.md`, `docs/agent-docs.md`, and `docs/mauth-actions.md`.

## Manual Solutions

Solutions are a structured layer over the same question and module hierarchy.

`useEditorManualSolutionController` is the app-level composition boundary for solution-surface copies, scoped solution validation and repairs, and answer/solution-slot creation. It delegates to the existing focused controllers, factories, validators, Mauth dialogs, and structured Mauth actions; it does not own a second solution state or mutation path.

The product rule is:

```text
AI may draft -> teacher can edit -> structured solution layer -> preview and print consume it
```

Student/Solutions mode controls authoring context. Solution-only modules and solution copies of student surfaces support worked text, independently changed diagrams, and ticks. Choices and completion tables use first-class shared answers: `solutionAnswerIndex` lives on the shared choices block, while sparse body-row `solutionEntries` live on the shared table. Their `markTicks` stay on the same surface, editor controls expose the answer only in Solutions mode, and preview/print ignore it in Student mode. Legacy solution-only choice copies and adjacent paired tables remain compatible. Solution blue belongs only on the answer or annotation, not on the whole shared surface.

In Solutions mode, marked question, part, and subpart headers consume the shared solution-validation result. Leaf scopes expose the existing deterministic quick fix, parent scopes summarize descendant issues, and completed scopes show a compact ready state. These controls do not own solution state or mutate modules directly; they call the same validation-fix controller and structured Mauth actions as the global validation panel. A newly created but blank worked-solution text block remains incomplete, shared or paired solution tables with unanswered student-entry cells remain flagged, and **Solution ready** also requires printed solution ticks to match the item marks.

The validator treats supported structured `solutionOnly` elements inside a shared diagram as both response and solution content. Diagram `markTicks` on that shared block count toward the marked scope and render beside the diagram without applying whole-surface solution colour. For paired solution diagrams, `solutionDiagramCompleteness.ts` compares deterministic answer-bearing content after removing size, colour, grid, view-range, chart-range, camera, and other presentation-only state. An untouched copied diagram therefore remains incomplete until mathematical answer content changes.

For shared `graph2d` surfaces, adding a graph feature in Solutions mode creates an editable `solutionOnly` annotation by default. Functions added in Solutions mode use the same structured layer, so an answer curve remains editable on the shared graph, hides from Student editor/preview, and renders in solution blue without recolouring shared curves. Student mode also suppresses features that reference a hidden solution function while preserving function indexes. Function and feature inspectors can deliberately return individual elements to the shared layer, and focused `diagram.settings.update` targets preserve sibling graph content. Use a paired solution diagram only when the entire graph should differ independently.

Shared `geometry2d` surfaces support the same element-level solution model for points, segments, arcs, angles, and construction markers. New primitives added in Solutions mode default to `solutionOnly`, Student mode filters them from the editor and preview, Solutions preview colours only those primitives blue, and the primitive inspector can deliberately return them to the shared layer. This state is part of the shared schema and `diagram.settings.update` contract rather than a React-only overlay.

Shared `vector2d` surfaces use that same structured model for vectors, segment labels, and angle markers. New elements added in Solutions mode default to `solutionOnly`; Student mode removes them from the editor and preview, including labels and markers whose referenced vector is hidden; Solutions preview colours only the solution elements blue. Element updates use the shared `diagram.settings.update` contract and preserve sibling vector metadata.

Shared `graph3d` surfaces use structured `solutionOnly` state for points, segments, dimensions, faces, and solids. The 3D element editor directly authors points, segments, and dimensions; existing faces and solids expose the same layer override. Student mode retains hidden solution points as non-rendered range inputs so the camera frame remains stable, while dependent geometry is removed. Solutions preview colours only answer elements blue. Element updates use `diagram.settings.update` and preserve sibling data, range settings, and camera metadata.

Shared Plotly `statsChart` surfaces use `data.series` for editable supplemental lines, points, line-and-point traces, and bars. New series added in Solutions mode default to `solutionOnly`; Student mode removes them from the editor and chart, while Solutions preview colours only those series blue. Element-level `diagram.settings.update` targets one series by id or index and preserves sibling series plus base chart data, ranges, and options. A paired solution diagram remains the right path when the entire chart should differ independently.

Shared uploaded `image` surfaces use `data.annotations` for editable labels, ellipses, and arrows. Annotation geometry is stored as percentages of the configured image box so overlays remain aligned through resizing. New annotations added in Solutions mode default to `solutionOnly`; Student mode removes them from the editor and preview, while Solutions preview colours only those annotations blue and leaves the bitmap and shared annotations unchanged. Element-level `diagram.settings.update` targets one annotation by id or index and preserves the embedded source plus sibling annotations. A paired solution image remains the right path when the whole bitmap should differ independently.

Structured Penrose geometry and network surfaces use `solutionOnly` on points/nodes and segment/link relationships. Student mode removes answer elements and relationships that depend on hidden points; Solutions preview preserves shared styling and colours only the answer geometry and labels blue. Structured two-set and three-set Venn diagrams use `solutionOnly` on fixed region records so answer labels/values and shading can be hidden without changing the region layout. Element-level `diagram.settings.update` targets one object, relationship, or region while preserving siblings and the rest of the renderer config.

Custom Penrose `options.substanceSource` and structured element editing are intentionally separate authoring modes. The manual element editor does not write into custom Substance. Use structured data for focused editable solution points, links, or Venn answers; use one paired solution diagram for custom constraints, unsupported construction predicates, or a substantially different completed diagram.

Student table panels expose **Complete in solutions** as an in-place authoring action. For a shared root or column-nested table it switches to Solutions mode and selects the same block without creating another module. Blank body cells write to the sparse `solutionEntries` matrix; given cells are read-only in that mode. Student preview ignores the matrix, Solutions preview substitutes its values and colours only those cells blue, and `module.settings.update` can set or clear one entry by zero-based body row and column. Legacy adjacent student/solution table slots retain their existing entry-mask rendering and reopening behavior.

Student diagram panels use the same **Complete in solutions** action and idempotent solution-surface plan. Root and column-nested diagrams create one editable solution-only copy and later reopen it. Columns editors apply replacement-slot visibility to nested children, so only the active student or solution layer renders. Existing diagram editors remain the authoring surface for coordinate graphs, statistics charts, vectors, 3D graphs, Penrose geometry, networks, Venn diagrams, and images; agents and human controls do not need a second diagram mutation contract.

Marks can come from hidden `[[marks:n]]` text ticks and structured choice/table/diagram `markTicks`. The shared solution validator recursively follows columns and parent visibility, totals only marks that print on the solutions layer, including shared diagrams with structured answer elements, shared choices with a valid selected answer, and shared tables with at least one valid solution entry, and compares that total with the marked question, part, or subpart. It reports incomplete shared and paired tables specifically when a blank student response cell still lacks an answer. Its quick-fix path can insert or resize answer/solution blocks inside nested columns by updating the owning columns module through a structured Mauth action. See `docs/mauthdown.md` and `configs/ai-brains/solutions.json`.

## Rendering Boundaries

Rendering systems remain separate by design:

- MathJax SVG: mathematical text.
- JSXGraph: `graph2d`, `vector2d`, and `graph3d` coordinate systems.
- Penrose: geometric constructions, networks, and Venn/set diagrams.
- Plotly: statistics charts.
- Formatting engine: backend structured/HTML render output.

Do not move Plotly or Penrose behavior into JSXGraph or React-only overlays. Solution graph annotations should be stored as editable diagram features, not one-off SVG markup.

Browser preview uses generated A4 page boxes. Print uses the browser print dialog and physical `@page` rules. Preview and print must consume the same page segmentation rather than maintaining separate layouts.

`PaginatedTestPreview` emits a measured pagination report after DOM measurement. `usePreviewReadinessController` keeps separate Student and Solutions reports for the current document fingerprint, projects the active copy into System Status, and supplies measured `rendered-page-overflow` warnings to the current agent snapshot. Document edits reset this evidence until the new preview is measured. Action-result snapshots deliberately omit the previous rendered document's warnings, and solution validation remains a separate mathematical/answer-layer contract.

## Backend And Package Boundaries

- `apps/api/app/services`: SymPy, formatting, graph, Penrose, parser, solver, and storage services.
- `apps/api/app/api`: FastAPI route adapters.
- `packages/question-engine`: question generation and question-type plugins.
- `packages/marking-engine`: marking rules and equivalence.
- `packages/formatting-engine`: formatting decisions and backend rendering.
- `packages/diagram-penrose`: Penrose presets and rendering.
- `packages/diagram-plotly`: Plotly chart adapter.
- `packages/shared`: TypeScript contracts shared with the web app.
- `configs`: question, marking, formatting, and AI-brain rule data.
- `desktop`: Electron lifecycle, secure window, sidecar ownership, and runtime-manifest integration.
- `scripts/build-macos-sidecar.mjs`: PyInstaller FastAPI sidecar build.
- `scripts/build-penrose-runtime.mjs`: self-contained Penrose/Node runtime build.

Question generation must not own marking or formatting decisions.

## Verification Layers

Use the narrowest relevant check while iterating, then broaden for shared contracts.

```text
pure helper tests
  -> action and controller tests
  -> API/package tests
  -> TypeScript, lint, and build
  -> runtime smoke test
  -> browser visual verification when rendering changed
```

The complete repository gate is:

```bash
pnpm check
```

The durable transition-document contract is checked with `pnpm check:handoff`. It verifies that the required handoff documents, checkpoint sections, entry-point references, package scripts, local Markdown links, and recorded test baselines remain internally consistent. `pnpm check:handoff:live` adds a working-tree comparison for the documented branch, baseline commit, dirty-file counts, and key source line counts. Neither command validates volatile runtime facts; refresh those with `pnpm dev:status`, `/api/system/status`, and `pnpm agent:doctor`.

Runtime smoke scripts are listed in `package.json` and `docs/current-state.md`. Generated screenshots, PDFs, and temporary fixtures belong in ignored `workspace/` or `tmp/` paths unless deliberately promoted into source.

## Change Rules

When adding or changing a durable behavior:

1. update the shared schema or structured action contract if state changes;
2. normalize old or malformed data at the boundary;
3. add focused tests;
4. update the relevant human documentation and AI brain config;
5. run the appropriate gate;
6. verify the live preview for visual behavior;
7. update `docs/current-state.md` when the change affects handoff, runtime, storage, lifecycle, or product direction.
