# Current State And Handoff

Last reviewed: 20 July 2026.

Use this file as the first project handoff note for a new model, agent, or development session. It summarises the current app shape, operating contracts, and next work queue. Treat the repo, tests, and runtime status as authoritative if this file and code ever disagree.

## Start Here

For a model transition, the minimum required reading is:

1. `AGENTS.md`
2. this file
3. `docs/architecture.md`
4. the subsystem document, source file, and focused tests named in the **Exact Resume Point** below

Use the wider reference set when the task crosses subsystem boundaries:

1. `README.md`
2. `docs/storage.md`
3. `docs/local-ai-workflow.md`
4. `docs/agent-bridge.md`
5. `docs/mauth-actions.md`
6. `docs/ai-brains.md`
7. `docs/app-scan-and-direction.md`
8. `docs/todo.md`

For development work, also inspect the relevant tests beside the changed code. For assessment authoring, inspect the live Mauth document through the bridge or browser before editing.

### Project Snapshot At A Glance

- **Product:** Mauth Studio is an alpha, local-first mathematics assessment authoring system. The React/Vite editor is the human review and print surface; the FastAPI service owns maths, storage, diagnostics, and the local agent bridge.
- **Normal launch path:** open `~/Applications/Mauth Studio.app`. It is a standalone Electron app that owns a packaged FastAPI sidecar on a dynamic loopback port; no Terminal windows need to remain open. `pnpm macos:dev` is the source-development shell, and `dev:launch:desktop` remains a fixed-port browser debugging path.
- **Durable data:** visible teacher documents live in the selected documents folder. On macOS, shared state, autosave, logos, and remembered-folder identity live under `~/Library/Application Support/Mauth Studio/storage`; external selected folders keep project metadata and versions in their own `.mauth/`. Autosave is recovery state, not a saved project file.
- **Authoring contract:** inspect the current snapshot, dry-run structured Mauth actions, apply with revision/idempotency protection, validate, then verify in the browser. Direct edits to teacher JSON or `.mauth` metadata are recovery-only.
- **Current source state:** the updater bootstrap release was merged through PR #37 at `c9316f4` and published as `v0.1.1`. The clean checkpoint below uses symbolic `CURRENT`/`HEAD` markers so it remains truthful after a committed documentation handoff; always inspect Git before editing.
- **Implemented direction:** launcher/status tooling, guarded file and folder lifecycle, system diagnostics, deterministic agent actions, and manual solution layers for shared choices and tables, `graph2d` functions/features, `geometry2d`, `vector2d`, `graph3d`, Plotly `statsChart` series, uploaded-image annotations, supported Penrose elements, and paired diagrams are present in the current worktree.
- **Completed milestone:** the broad editor/lifecycle/manual-solutions goal and the standalone macOS foundation meet their completion criteria. The installed app, packaged Python/Node diagram runtime, authenticated dynamic runtime discovery, native quit confirmation, storage-state migration, Hardened Runtime local signing, Developer ID signing, app-and-DMG notarization/stapling, release verification, Codex Run action, teacher-confirmed alpha updater, and guarded draft-first ship pipeline are implemented. The signed/notarized `v0.1.1` updater bootstrap is public with its DMG, ZIP, metadata, and blockmaps; the downloaded DMG has been manually installed and the packaged updater reports the app is current.
- **Do not infer:** the old provider-backed chat is not the product path, the current browser tab is not automatically authoritative, and a running API alone does not mean the full app or active documents folder is healthy.

### Documentation Ownership

Use this map to avoid reconciling the same fact from several files:

| Topic                                                                                      | Authoritative document                             |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Agent rules, repository boundaries, edit and verification requirements                     | `AGENTS.md`                                        |
| Current branch, dirty worktree, live runtime caveats, completed slices, exact resume point | `docs/current-state.md`                            |
| Durable process, state, package, rendering, and dependency boundaries                      | `docs/architecture.md`                             |
| Visible files, external folders, metadata, autosave, revisions, versions, and recovery     | `docs/storage.md`                                  |
| Browser bridge lifecycle and HTTP/MCP agent control plane                                  | `docs/agent-bridge.md`                             |
| Structured mutation contract and action semantics                                          | `docs/mauth-actions.md`                            |
| Assessment-authoring behavior and focused AI rule sets                                     | `docs/ai-brains.md` and `configs/ai-brains/*.json` |
| Product direction, risks, and staged packaging decision                                    | `docs/app-scan-and-direction.md`                   |
| Developer ID signing, notarization, release verification, and clean-Mac checks             | `docs/macos-release.md`                            |
| Prioritised implementation queue                                                           | `docs/todo.md`                                     |
| Installation and normal day-to-day operation                                               | `README.md` and `docs/agent-local-setup.md`        |

When a transient runtime fact conflicts with a durable architecture document, trust a fresh command result and update this handoff. When code conflicts with any document, code and tests are authoritative and the documentation must be corrected in the same change.

## Immediate Worktree Checkpoint

This checkpoint was refreshed after implementing the updater and guarded release publication workflow on 20 July 2026. Runtime and external-service facts are deliberately timestamped because they can change without a source edit.

Handoff status: standalone implementation, signed/notarized release building, teacher-confirmed updates, and draft-first publication are implemented; final repository gates are recorded below. The next model should prepare and clean-machine-test the first updater-enabled release or begin another prioritised follow-on item rather than reconstructing the desktop shell, bridge security, updater, or Apple signing setup.

Repository state at the checkpoint:

```text
branch: CURRENT
baseline commit: HEAD
runtime: installed packaged app running on a dynamic loopback port after authenticated API, MCP, bridge, Hardened Runtime, and installed-bundle verification
active documents folder: external Year 10 Test 4 - Exam folder on Google Drive
current Drive state at 5:52 pm AWST: Google Drive and the selected folder are online, but File Provider still marks `.mauth/project.json` as `dataless`, download-requested, and downloading; the guarded project and file routes return `503 STORAGE_UNAVAILABLE` in about 1-2 ms instead of hanging until materialisation completes
latest durable/recovery identity: not re-inspected in this slice; the prior checkpoint recorded `Y10 Units 1-4 Exam S2 Calculator-Assumed` at saved revision 2, but that fact must be refreshed before authoring
current runtime state at 1:46 pm AWST: installed packaged app version 0.1.1 is running at the dynamic URL in its private runtime manifest; the app and both packaged sidecar processes require no Terminal window
live bridge state at 1:46 pm AWST: packaged discovery, web/API health, active editor snapshot, automatic bearer authentication, and one live bridge session pass; the updater reached the public `v0.1.1` feed and reported the app is current
App.tsx: 1053 lines
SelectionInspector.tsx: 107 lines after the focused basic-block, diagram-router, renderer-specific inspector extractions, and explicit Solutions-mode binding
worktree: clean at this checkpoint; inspect Git before assuming a later session is also clean
```

Always confirm this with:

```bash
git status --short --branch
git log --oneline -5
pnpm dev:status
```

### Model Transition Readiness

- Repository branch, baseline commit, `App.tsx`/`SelectionInspector.tsx` sizes, and dirty-worktree counts were rechecked against Git.
- The full `pnpm check` gate passes after updater and release hardening: API 81, web/actions 569, Plotly 8, launcher/runtime 34, formatting/lint, TypeScript, and the Vite production build. The isolated solution-authoring smoke also passes against disposable storage.
- Documented `pnpm` project commands were checked against `package.json`; `pnpm dev` is the one intentional contextual command and is only used when already inside `apps/web`.
- `pnpm check:handoff` verifies the required handoff files, checkpoint sections, root entry-point links, documented package scripts, and local Markdown links.
- All documents named in the handoff reading order exist and the local documentation link audit passes.
- The API status and web app are healthy against the configured external Google Drive folder, but Google File Provider had not finished downloading `.mauth/project.json`. Earlier guarded project-route checks returned `503` promptly; an authenticated file-list check in this slice did not complete promptly and was terminated without changing teacher files. Treat cloud-placeholder listing as a separate follow-up, wait for materialisation, and require a fully passing `pnpm agent:doctor` before snapshot or mutation work.
- The preview-composition, workspace-presentation, navigator-composition, overlay-composition, header-composition, document-workspace-binding, basic-block, diagram-router, geometry2d, graph2d, Penrose, vector2d, graph3d, statistics, and image selection-inspector extractions are complete and verified.
- The project-persistence, Files-drawer project-management, editor-agent bridge, and manual-solution composition slices are complete. `SelectionInspector.tsx` and the workspace-presentation, navigator, overlay, header, document-workspace, project-persistence, project-file-management, agent-bridge, and manual-solution adapters are now focused boundaries; the next model should use **Exact Resume Point** rather than trying to reconstruct completed work.
- The standalone implementation and release-alignment documentation are committed and merged through PR #34. Preserve any new uncommitted work found in a later checkout.

### Active Development Goal

The Codex goal completed on 18 July 2026. Its scope was:

1. package the launcher into a better desktop/macOS entry point;
2. replace remaining browser prompts with Mauth-owned dialogs;
3. keep shrinking `App.tsx` along coherent ownership boundaries;
4. improve open, close, save, autosave, recovery, and conflict lifecycle behavior; and
5. continue first-class manual solution editing.

The completion criteria in `docs/todo.md` are met: normal macOS use has one standalone app path; browser-native prompts are guarded out; file, folder, version, recovery, and conflict transitions use the shared document-session outcome model; `App.tsx` is a composition shell over focused owners; structured manual solutions remain editable across text, choices, tables, graphs, and supported diagram surfaces; focused regression coverage and the full repository gate pass. Clean-machine updater verification, further composition reduction, deeper page-flow repair actions, and optional in-app AI remain deliberate follow-on work; Developer ID signing, notarization, update policy, and guarded publication are complete.

The document-workspace binding and workspace-presentation slices are complete. A new model should begin from the source named in **Exact Resume Point**, not search for an unfinished workspace adapter.

The standalone alpha worktree contains fifty-seven completed or active change groups:

1. **Completed and verified multiple-choice solution-answer work.**
   - Choice lists can store a zero-based `solutionAnswerIndex`; legacy solutions-only copies remain readable.
   - The selected choice label is circled in solution blue only in Solutions mode; Student mode ignores the stored answer and its ticks.
   - Editor, inspector, normalization, actions, validation, agent snapshot, backend formatting, shared schema, tests, and durable solution rules were updated together.
   - Focused browser verification passed in Student and Solutions modes.

2. **Completed and verified atomic legacy-storage migration fix.**
   - One-time legacy directory copies now use a unique temporary sibling and atomic rename.
   - A concurrent startup regression test covers the previous copy race.

3. **Completed and verified `App.tsx` logo/storage hydration extraction.**
   - `useLogoLibraryController` now owns the in-memory logo list/ref, browser persistence, API load/save/delete, portable logo imports, and pure update/add/remove operations.
   - `useSavedProjectDocumentApplier` imports portable saved-document logos through one callback instead of owning logo persistence.
   - `useEditorStorageHydrationController` now composes disk loading, browser fallback, legacy merge, logo seeding, autosave revision reconciliation, and restore state.
   - `createFrontMatterLogoActions` now owns front-matter logo selection, metadata updates, upload reading, persistence calls, and deletion fallback actions.
   - Pure helpers cover logo merge order, saved-document-to-autosave conversion, and active project identity clearing.
   - The duplicate `App.tsx` logo functions, front-matter logo callback cluster, synchronization effect, and unused `legacySavedTestsRef` were removed.

4. **Completed and verified question/page-break drag extraction.**
   - `useQuestionPageBreakDragState` owns question and question-boundary page-break drag state.
   - `useQuestionPageBreakDragController` owns keyboard moves, question reorder drag/drop, question drops at page-break boundaries, page-break moves, and post-move navigation focus.
   - `editorQuestionPageBreakDrag.ts` contains the pure no-op, boundary, and page-break relocation helpers.
   - Focused tests cover invalid and adjacent drops, boundary resolution, and moving a page break while clearing legacy page-break blocks.
   - Live browser verification moved Question 1 down, proved the rail identity order changed, undid the move, restored the original order, and returned the active exam to its saved state without console warnings or errors.

5. **Completed and verified nested subsection/editor-page-break drag extraction.**
   - `useNestedEditorDragState` owns subsection, nested page-break, and pointer-cleanup state.
   - `useNestedEditorDragController` owns module/part/subpart pointer and native drag handling, nested page-break movement, shared drop zones, keyboard moves, and drag-row rendering.
   - `editorNestedDragActions.ts` contains pure module/part/subpart move actions, keyboard intents, nested page-break destinations, and atomic page-break move actions.
   - `editorDragDom.ts` contains the shared question/nested drag placement and drag-image helpers.
   - Focused tests cover module, part, and subpart action construction; keyboard insertion points; page-break hierarchy, destinations, occupied targets, and atomic moves; and collapsed-target placement.
   - `App.tsx` fell from 3315 to 2383 lines. The existing editor panel contracts did not change.
   - Live pointer verification moved `part-133` below `part-137`, confirmed automatic visible relabelling, then used Undo to restore `part-133, part-137, part-141, part-145, part-149`. The bridge then reported revision 1, clean, saved, and autosaved, with no browser warnings or errors.

6. **Completed and verified stale-file recovery orchestration coverage.**
   - `projectAutosaveResolution.ts` now owns startup reconciliation between an autosave snapshot, its loaded file revision, historical versions, and the current disk file.
   - Focused tests prove that clean stale autosaves advance to the newer disk document, dirty stale autosaves remain recoverable and conflicted, missing historical revisions never assume a draft is clean, and an unsupported newer disk document preserves the draft and raises a conflict.
   - `projectFileConflictWorkflow.ts` now owns the guarded recovery-copy and confirmed reload workflows used by `useProjectFileConflictController`.
   - Focused tests prove that busy or missing conflicts are ignored, recovery copies run once, cancelled destructive reloads preserve local work, and confirmed reloads run once.

7. **Completed and verified question/part/subpart content mutation extraction.**
   - `createEditorContentMutationActions` now owns scoped question/module updates, selected-column-root updates, preview graph edits, module insertion/removal, part/subpart creation/removal, and nested page-break insertion.
   - Every edit still emits the existing structured Mauth action and preserves the existing editor anchors, focus/reveal behavior, automatic labels, and solution-mode visibility defaults.
   - Focused tests cover hierarchy-specific update scopes, insertion anchors, part/subpart factories, page-break targets, invalid question guards, and preview graph routing.
   - `App.tsx` fell from 2383 to 2214 lines.

8. **Completed and verified question/part/subpart panel-render adapter extraction.**
   - `createEditorPanelRenderers.tsx` now owns the question, part, and subpart panel-render callbacks that previously lived inline in `App.tsx`.
   - `editorPanelRenderPlans.ts` owns pure visibility, hierarchy-target, scope-block, and anchor decisions for those adapters.
   - Existing `EditorQuestionPanel`, `EditorNestedPartPanel`, and `EditorScopedContentBlockPanel` contracts remain the UI boundary; their reusable prop types are exported rather than duplicated.
   - Focused tests cover question, part, and subpart render plans, including solution visibility and nested identity.
   - Live browser verification opened manual editor mode, expanded Part (a), proved the nested text and answer-space editors rendered, produced no console warnings or errors, and restored preview-only mode.
   - `App.tsx` fell from 2214 to 2089 lines.

9. **Completed and verified editor context-command extraction.**
   - `editorContextCommandRuntime.ts` now owns context selection, duplication, move/can-move, delete/can-delete, nested-column handling, and post-action focus.
   - `useEditorContextCommandController` composes that runtime with the global Delete/Backspace listener, so menus and keyboard deletion use the same command path.
   - Focused tests cover selection/navigation, question/part/subpart/module duplication, nested-column duplication, move routing and capabilities, hierarchy-specific deletion, and the invariant that deleting a nested column child must not delete its root columns block.
   - Live browser verification duplicated Question 1 through the context menu, deleted the selected duplicate with the global Delete key, then used Undo to restore the original six-question saved exam. No browser warnings or errors were emitted.
   - The isolated `pnpm smoke:context-menu-actions` workflow passes.
   - `App.tsx` fell from 2089 to 1900 lines.

10. **Completed document-session conflict-action composition.**
    - `useDocumentSessionController` now composes the recovery-copy and confirmed reload workflows after persistence and open controllers are available.
    - `App.tsx` no longer wires `useProjectFileConflictController` separately or retains direct recovery/reload callbacks that belong to the session model.
    - Existing focused conflict-workflow tests still cover busy guards, one-time recovery saves, cancelled reloads, and confirmed reloads.
    - `App.tsx` fell from 1900 to 1889 lines.

11. **Completed browser-bridge session release.**
    - The API now exposes `POST /api/agent/current/browser/unregister` and reports it through `/api/system/status`.
    - Browser tabs unregister on `pagehide` or `beforeunload` using a beacon-safe query request, so normal close or navigation does not leave an apparently connected but unresponsive editor for the full session TTL.
    - Unregistering releases any pending request assigned to that session immediately with `APP_NOT_CONNECTED` instead of waiting for the bridge timeout.
    - Focused API tests cover body and beacon-query unregister calls, session removal, pending-request release, and system-status route discovery.
    - Live verification proved one registered session returned to zero immediately after navigating away; reopening Mauth restored one session and `pnpm agent:doctor` passed the active snapshot check.

12. **Completed and verified explicit before-open conflict choices.**
    - `projectFileBeforeOpenWorkflow.ts` now owns the typed outcome model for clean opens, normal saves, recovery-copy saves, deliberate open-without-saving, cancellation, and recovery failure.
    - Opening another file or switching documents folders after a stale-revision save conflict now presents a Mauth dialog with **Save recovery copy and open**, **Open without saving**, and **Cancel**.
    - Cancellation keeps the current local document open. A failed recovery copy also blocks the open or folder switch instead of discarding local work.
    - File-open and documents-folder controllers use the same outcome gate, so they cannot accidentally continue after cancellation or recovery failure.
    - Focused action tests cover every outcome. The isolated `pnpm smoke:document-session-conflict` workflow proves cancellation preserves the edited document, recovery creates a timestamped file under `Recovery/`, and the requested next file opens only after an allowed outcome.

13. **Completed and verified Solutions-mode graph annotation defaults.**
    - `createAuthoredGraphFeature` now applies the active authoring layer when a teacher adds a `graph2d` feature.
    - In Solutions mode, **Add feature** becomes **Add solution annotation** and new points, labels, segments, tangents, markers, and shading features default to `solutionOnly: true`.
    - The editor labels those features with a Solution badge, Student mode filters them out, and the existing inspector checkbox remains the deliberate shared-layer override.
    - Focused tests cover student and solution authoring defaults. Isolated rendered browser verification opened a disposable graph document, added a solution point, confirmed the Solution badge and checked inspector setting, switched to Student mode to prove the feature disappeared, and left the teacher documents workspace untouched.

14. **Completed and verified discoverable table solution-authoring foundation.**
    - Student table panels now expose **Complete in solutions** directly in the table header, including tables nested in columns; the inspector and context menu use the same wording and action path.
    - This slice established the idempotent selection/copy plan and table-entry masks. The later group 45 keeps one shared table for ordinary completion tables; the paired path remains only for legacy student-only tables.
    - Existing paired-table masks still colour only cells that were blank for student entry. Labels, given values, and the grid stay in normal styling.
    - Focused plan tests cover root and column scope plus legacy pair reopening without duplicate copies.

15. **Completed external-folder availability errors.**
    - Project-file routes now translate filesystem failures such as a stalled cloud-drive read into `503 STORAGE_UNAVAILABLE` with a teacher-readable reconnect-and-retry message.
    - The Files drawer preserves that specific message instead of collapsing it to generic **Files unavailable**; ordinary network failures remain concise.
    - Focused API and web tests cover the timeout mapping and message selection. Live verification against the currently selected Google Drive folder returned the expected 503 payload without changing folders or copying files.

16. **Completed and verified question lifecycle controller extraction.**
    - `createEditorQuestionLifecycleController` now owns adding and removing questions, adding and removing question-boundary page breaks, and the navigation/focus changes that follow successful actions.
    - Existing pure factories and destination helpers remain in `editorQuestionLifecycle.ts`; `App.tsx` now composes the controller instead of maintaining a second inline lifecycle path.
    - Focused tests cover successful and failed question creation, active-boundary page-break add/remove behavior, and deletion focus on the surviving question.
    - Isolated browser verification added Question 5, added and removed its boundary page break, deleted Question 5, and confirmed focus returned to Question 4 with no console warnings or errors.
    - `App.tsx` fell from 1891 to 1835 lines.

17. **Completed and verified direct diagram solution authoring.**
    - Student diagram panels now expose **Complete in solutions** directly instead of requiring the inspector or context menu.
    - The control uses the existing structured solution-surface plan, so root and column-nested diagrams create one editable solution-only copy and later reopen that same copy without duplication.
    - Notes documents suppress the control because they do not support a student/solution layer. Existing diagram editors remain the editing surface for coordinate graphs, statistics charts, vectors, 3D graphs, Penrose geometry, networks, Venn diagrams, and images.
    - Nested Columns editors now apply the same replacement-slot visibility rules as top-level modules, so Solutions mode renders only the active diagram or table layer rather than both copies.
    - Focused tests cover diagram eligibility, independent graph-config cloning, and nested active-layer visibility. The isolated `pnpm smoke:diagram-solution-authoring` workflow proves root creation, idempotent reopening, nested-column creation, one visible active nested layer, and a clean browser console without touching teacher files.
    - Durable rules were updated in the Solutions Brain, Mauthdown guide, architecture, AI-brain guide, roadmap, and direction scan.

18. **Completed and verified editor navigation ownership extraction.**
    - `useEditorNavigationController` now owns question selection, anchor activation, editor reveal sequencing, panel-open signals, graph-child preview mirroring, and keeping the editor pane pinned to its left edge.
    - `editorAnchorActions.ts` now provides pure activation, reveal-sequence, and open-signal decisions used by the controller instead of leaving those wrappers in `App.tsx`.
    - Focused tests cover reveal sequencing, containing-panel opening, and graph-child preview mirroring. The isolated diagram-solution smoke also proves that a newly created nested solution diagram is selected, revealed, and expanded with one active replacement layer and no browser console errors.
    - `App.tsx` fell from 1835 to 1794 lines without creating another mutation or navigation path.

19. **Completed and verified open-document workspace composition extraction.**
    - `DocumentEditorWorkspace.tsx` now owns active front-matter/page-break/section/question rendering, conflict-banner placement, inspector placement, and paginated preview-pane composition.
    - `documentWorkspaceRenderPlan.ts` owns the pure surface precedence and visible label rules. Missing stale selections continue to render no incorrect fallback surface.
    - Document state, actions, history, persistence, navigation, and preview graph edits remain supplied by the existing controllers; the new shell creates no mutation or session path.
    - Focused render-plan tests pass, the web/action suite is 417 tests, and the isolated `pnpm smoke:diagram-solution-authoring` workflow verifies editor, nested solution surface, inspector, preview, selection reveal, and a clean browser console together.
    - `App.tsx` fell from 1794 to 1689 lines.

20. **Completed and verified element-level `geometry2d` solution authoring.**
    - Points, segments, arcs, angles, and construction markers now carry structured `solutionOnly` state in the shared schema, diagram settings actions, validators, editor, inspector, and preview.
    - New primitives added in Solutions mode default to the solution layer and display a Solution badge. The selected primitive's **Show in solutions only** checkbox can deliberately move it back to the shared layer or return it to Solutions.
    - Student mode filters solution-only primitives from both the editor list and rendered diagram. Solutions preview overrides only those primitives to solution blue without recolouring the shared construction.
    - Focused authoring, preview, action, and schema-validation tests pass. The expanded isolated `pnpm smoke:diagram-solution-authoring` workflow creates a solution point, toggles its layer through the inspector, verifies its blue rendered stroke, and proves it is absent from Student editor and preview.

21. **Completed and verified element-level `vector2d` solution authoring.**
    - Vectors, segment labels, and angle markers now carry structured `solutionOnly` state in the shared schema, diagram settings actions, validators, editor, and preview.
    - New vectors and annotations added in Solutions mode default to the solution layer and display a Solution badge. Their **Show in solutions only** controls can deliberately move individual elements between the shared and solution layers.
    - Student mode filters solution-only elements from editor and preview. It also suppresses segment labels and angle markers whose referenced solution vector is hidden, avoiding invalid student-only dependants.
    - Solutions preview colours only solution vectors and annotations blue while preserving shared element colours. Element-level `diagram.settings.update` patches preserve sibling vector metadata.
    - Focused authoring, preview, action, and schema-validation tests pass. The expanded isolated `pnpm smoke:diagram-solution-authoring` workflow adds a solution vector, verifies its blue rendered arrow, proves it is absent from Student editor and preview, and confirms it returns in Solutions mode.

22. **Completed and verified element-level `graph3d` solution authoring.**
    - Points, segments, dimensions, faces, and solids now carry structured `solutionOnly` state in the shared schema, diagram settings actions, validators, editor, renderer, and preview.
    - `Graph3DElementsEditor.tsx` is a focused editor boundary for direct point, segment, and dimension authoring plus face/solid layer overrides; the camera/size component remains small and independent.
    - New points, segments, and dimensions added in Solutions mode default to the solution layer and display a Solution badge. Every supported 3D element has a **Show in solutions only** override.
    - Student mode hides solution elements and any dependent line, face, or solid. Hidden solution points remain non-rendered range inputs so the camera frame and shared labels do not jump between copies.
    - Solutions preview colours only answer elements and their labels blue. Element-level `diagram.settings.update` patches preserve sibling data, aliases, ranges, and camera metadata.
    - Focused authoring, preview, action, and schema-validation tests pass. In-app Browser QA on an isolated unsaved document exercised the real type selector, point/segment/dimension controls, layer overrides, Student/Solutions toggle, framing, and console health. The expanded `pnpm smoke:diagram-solution-authoring` workflow repeats the full path deterministically without touching teacher files.

23. **Completed and verified element-level Plotly `statsChart` solution authoring.**
    - `data.series` now stores structured supplemental `line`, `points`, `linePoints`, and `bars` traces with stable ids, coordinates, styling, visibility, and `solutionOnly` state.
    - `StatsChartSeriesEditor.tsx` provides direct authoring without growing the generic diagram inspector. New series added in Solutions mode default to the solution layer, display a Solution badge, and retain an explicit **Show in solutions only** override.
    - Student mode removes solution series from both the editor and Plotly chart. Solutions preview colours only answer series blue while preserving the base statistical chart and shared traces.
    - Element-level `diagram.settings.update` targets one series by id or index and preserves sibling series, base chart data, ranges, options, and unknown forward-compatible fields. Schema and action validation reject malformed series and mismatched coordinate arrays.
    - Focused authoring, preview, action, schema-validation, and Plotly trace tests pass. In-app Browser QA on an isolated unsaved worksheet verified pane fit, Student/Solutions visibility, in-range defaults, answer-blue rendering, and a clean console. The expanded `pnpm smoke:diagram-solution-authoring` workflow covers the same layer transition without touching teacher files.

24. **Completed and verified supported element-level Penrose solution authoring.**
    - Structured `geometricConstruction` and `network` points/nodes plus segment/link relationships now carry `solutionOnly` through the shared schema, normalizers, generated Substance, Penrose predicates/style, editor, preview, actions, and validation.
    - New supported elements added in Solutions mode default to the solution layer. Student mode removes answer points and dependent relationships; Solutions mode preserves shared styling and colours only answer geometry and labels blue.
    - Structured two-set and three-set Venn regions support solution-only labels/values and shading. Student mode preserves each fixed region slot while blanking the answer and shading; Solutions mode renders the answer text and shade in solution blue.
    - Element-level `diagram.settings.update` targets one Penrose object, relationship, or region by id/index while preserving siblings and clearing stale generated Substance overrides. Custom Advanced Substance is intentionally not mixed with structured element editing.
    - Complex construction predicates that do not yet have a faithful element-level solution representation remain a paired solution-diagram path. Validation rejects pretending those predicates are supported rather than leaking incomplete answers into Student mode.
    - Focused web/action tests pass (64 for the Penrose slice), real Penrose API renderer tests pass (23), and the expanded isolated `pnpm smoke:diagram-solution-authoring` workflow verifies geometry and network solution controls, answer-blue SVG output, Student filtering, and pane readability without touching teacher files.

25. **Completed and verified geometry2d selection-inspector extraction.**
    - `Geometry2DSelectionInspector.tsx` now owns geometry canvas settings plus point, segment, arc, angle, construction-marker, and solution-layer controls that previously lived inline in `SelectionInspector.tsx`.
    - `geometry2dInspectorSelection.ts` owns pure child-anchor parsing, parent-anchor resolution, point labels, and readable inspector-title selection. The parent inspector and extracted component consume the same typed selection contract.
    - The extracted component still receives the existing `onBlockChange` and `updateGraphConfig` callbacks, so human controls continue through the established block-update/Mauth action path instead of creating another mutation route.
    - Focused tests cover valid and invalid child anchors, parent navigation, and readable point/segment/decoration titles. TypeScript and ESLint pass, and the isolated `pnpm smoke:diagram-solution-authoring` workflow exercised the geometry add/select/solution-toggle/Student-filter path with a clean rendered result.
    - `SelectionInspector.tsx` fell from 3237 to 2379 lines. `App.tsx` remains 1689 lines because this slice reduces the inspector monolith rather than the app composition shell.

26. **Completed and verified graph2d selection-inspector extraction.**
    - `Graph2DSelectionInspector.tsx` now owns graph canvas, function, feature, grid, dimension, label, and solution-layer controls that previously lived inline in `SelectionInspector.tsx`.
    - `graph2dInspectorSelection.ts` owns pure function/feature anchor parsing, readable inspector titles and summaries, sibling-preserving function/feature patches, solution-layer clearing, and feature-specific label-mode choices.
    - The parent inspector uses the same typed selection object for its header and active renderer branch. The extracted component receives the existing `onBlockChange` and `updateGraphConfig` callbacks, preserving the established Mauth action path.
    - Focused tests cover valid/invalid anchors, function/relation and feature titles, missing children, sibling preservation, solution-layer clearing, and feature label modes. TypeScript and ESLint pass.
    - The expanded isolated `pnpm smoke:diagram-solution-authoring` workflow selected and edited a graph function, selected a solution point feature, moved it to the shared layer and back, and proved Student-mode editor filtering before continuing through the wider diagram workflow.
    - `SelectionInspector.tsx` fell from 2379 to 1084 lines. `App.tsx` remains 1689 lines because this slice continues reducing the inspector composition surface.

27. **Completed and verified Penrose selection-inspector extraction.**
    - `PenroseSelectionInspector.tsx` now owns shared scale controls, geometry resampling, network presets/visibility, and Venn set-count/notation/count/shading controls that previously lived inline in `SelectionInspector.tsx`.
    - `penroseInspectorSelection.ts` provides a typed family title and normalized network or set view data for the component. Existing `moduleSettingsPatches` helpers remain the only mutation rules.
    - Structured edits still clear stale custom Substance where required; the extracted component receives the existing `onBlockChange` and `updateGraphConfig` callbacks and does not create a renderer-specific mutation path.
    - Focused tests distinguish geometry, network, and Venn view state and continue running the existing scale, resample, preset, visibility, count-label, notation, and shading patch tests.
    - The expanded isolated `pnpm smoke:diagram-solution-authoring` workflow selected the network diagram, toggled node-dot visibility off and on through the extracted inspector, verified stored data, and then completed the existing solution-node/link and Student-filter checks.
    - `SelectionInspector.tsx` fell from 1084 to 872 lines. `App.tsx` remains 1689 lines because this slice continues reducing the inspector composition surface.

28. **Completed and verified vector2d selection-inspector extraction.**
    - `Vector2DSelectionInspector.tsx` now owns vector label style, axes/grid visibility, equal-scale mode, coordinate bounds, dimensions, and major/minor grid intervals that previously lived in or belonged with the vector inspector branch.
    - `vector2dInspectorSelection.ts` provides normalized view state plus pure axes, grid, major-step, and minor-step patches. Major-step patches keep the attached axis-number interval aligned without resizing the graph.
    - The extracted component receives the existing `onBlockChange` and `updateGraphConfig` callbacks, reuses `vector2dLabelStylePatch`, and does not create another renderer mutation path.
    - Focused tests cover defaults, explicit settings, visibility behavior, and grid/axis interval patches. The isolated `pnpm smoke:diagram-solution-authoring` workflow selects the vector diagram, clears and replaces its major interval, enables the minor grid, and verifies stored dimensions remain `360` by `280` before continuing the solution-layer checks.
    - `SelectionInspector.tsx` fell from 872 to 713 lines. `App.tsx` remains 1689 lines because this slice continues reducing the inspector composition surface.

29. **Completed and verified graph3d selection-inspector extraction.**
    - `Graph3DSelectionInspector.tsx` now owns 3D dimensions, saved azimuth/elevation/bank values, and camera reset controls that previously lived inline in `SelectionInspector.tsx`.
    - `graph3dInspectorSelection.ts` normalizes dimensions and camera state. Existing `graph3dViewPatch` and `graph3dResetViewPatch` helpers remain the only camera mutation rules and preserve sibling metadata.
    - The extracted component receives the existing `onBlockChange` and `updateGraphConfig` callbacks and does not create another renderer mutation path.
    - Focused tests cover default/explicit view state, sibling metadata preservation, and reset behavior. The isolated `pnpm smoke:diagram-solution-authoring` workflow edits azimuth, verifies dimensions remain `420` by `320`, resets the camera, and then continues the existing 3D solution-element checks.
    - `SelectionInspector.tsx` fell from 713 to 601 lines. `App.tsx` remains 1689 lines because this slice continues reducing the inspector composition surface.

30. **Completed and verified statistics-chart selection-inspector extraction.**
    - `StatsChartSelectionInspector.tsx` now owns chart type, dimensions, grid/fill visibility, fill colour, and fill opacity controls that previously lived inline in `SelectionInspector.tsx`.
    - `statsChartInspectorSelection.ts` normalizes Plotly data/options and provides sibling-preserving data/options patches plus the existing zero-to-one opacity clamp. Option dimensions remain mirrored to top-level graph dimensions.
    - The extracted component receives the existing `onBlockChange` and `updateGraphConfig` callbacks and keeps `defaultStatsDataForType` as the chart-type transition rule.
    - Focused tests cover normalized state, sibling preservation, dimension mirroring, and opacity clamping. The isolated `pnpm smoke:diagram-solution-authoring` workflow changes width, toggles gridlines, edits opacity, verifies stored state, and then continues the existing solution-series checks.
    - `SelectionInspector.tsx` fell from 601 to 460 lines. `App.tsx` remains 1689 lines because this slice continues reducing the inspector composition surface.

31. **Completed and verified image selection-inspector extraction.**
    - `ImageSelectionInspector.tsx` now owns image name, alternative text, width, and height controls that previously lived inline in `SelectionInspector.tsx`.
    - `imageInspectorSelection.ts` normalizes image metadata and display dimensions while preserving the existing `420` by `260` fallbacks. Metadata edits still use `imageDataPatch`, and all mutations still flow through the existing parent block/config callbacks.
    - Focused tests cover explicit and malformed metadata, dimension normalization, and editable-value fallbacks. The isolated `pnpm smoke:diagram-solution-authoring` workflow edits both labels and dimensions and proves the data URI, MIME type, and natural dimensions remain intact.
    - `SelectionInspector.tsx` fell from 460 to 391 lines. `App.tsx` remains 1689 lines because this slice completes the renderer-specific inspector split without changing app-level composition.

32. **Completed and verified selection-inspector shell extraction.**
    - `BasicBlockSelectionInspector.tsx` now owns columns, choices, table, and answer-space controls. `basicBlockInspectorSelection.ts` provides normalized view state while existing column/table limits and mutation patches remain authoritative.
    - `DiagramSelectionInspector.tsx` now owns diagram type/alignment and focused renderer dispatch. `diagramInspectorRouting.ts` preserves the rule that base diagram controls disappear while a function, feature, or geometry primitive is selected.
    - Focused tests cover every normalized basic block and child-aware diagram routing. `pnpm smoke:inspector:basic` verifies wide/compact controls and nested-table deletion; `pnpm smoke:diagram-solution-authoring` verifies renderer dispatch and solution editing. The basic-block smoke now waits for the real editor shell rather than Vite network idleness and uses the current Student/Solutions radios.
    - `SelectionInspector.tsx` fell from 391 to 104 lines. The following navigator slice then reduced `App.tsx` from 1689 to 1640 lines.

33. **Completed and verified document-navigation composition extraction.**
    - `DocumentNavigationWorkspace.tsx` now composes the quick rail and expanded document table of contents that previously lived inline in `App.tsx`.
    - It receives the existing editor-navigation, question lifecycle, section-heading lifecycle, question/page-break drag, and drag-state objects by domain. Selection, movement, deletion, context commands, active ids, and drag behavior remain owned by those controllers.
    - `documentNavigationPresentationPlan` provides the expanded-panel decision, automatic `question` versus notes `heading` label, and shared `miniToc` context-menu origin.
    - Focused tests cover assessment/notes labels, expanded visibility, and context origin. The isolated `pnpm smoke:context-menu-actions` workflow opens and screenshots the expanded navigator, verifies rail and expanded context actions, deletes through the expanded TOC, closes the panel, and reports a clean browser console.
    - `App.tsx` fell from 1689 to 1640 lines without adding a navigation, drag, lifecycle, or mutation path.

34. **Completed and verified application-overlay composition extraction.**
    - `AppOverlayWorkspace.tsx` now adapts the existing file, documents-folder, version, folder, backup, file-operation, dialog, new-document, System status, solution-validation, action-proposal, context-menu, and print contracts to the unchanged `AppOverlays.tsx` renderer.
    - Existing controller return objects are passed by domain. The adapter owns no file, session, validation, proposal, context-menu, or print state and creates no second action path.
    - `appOverlayPresentation.ts` contains only independent panel visibility, open-document print-preview gating, and the existing proposal-text feedback-clearing sequence.
    - Focused tests cover the visibility matrix and proposal update order. The isolated `pnpm smoke:context-menu-actions` workflow now opens and closes Files, System status, and solution validation, verifies exactly one hidden print-preview stage, continues the navigator and context-action checks, and reports a clean browser console.
    - `App.tsx` fell from 1640 to 1588 lines.

35. **Completed and verified application-header composition extraction.**
    - `AppHeaderWorkspace.tsx` now adapts the existing pane/navigation, file-status, document-session, file-manager, System status, theme, solution-mode, solution-validation, print, and editor-history contracts to the unchanged `AppHeader.tsx` renderer.
    - `appHeaderBindings.ts` is a pure mapping layer. It owns no state or decisions and only wraps the asynchronous close command plus panel-open setters so the renderer continues to receive void callbacks.
    - Focused tests cover state projection, solution issue counts, and every mapped command. The isolated `pnpm smoke:context-menu-actions` workflow exercises pane/inspector controls, New and Save Mauth dialogs, theme switching, Student/Solutions mode, Files, System status, solution validation, print mounting, navigator actions, and a clean browser console.
    - `App.tsx` fell from 1588 to 1551 lines.

36. **Completed and verified document-workspace binding extraction.**
    - `DocumentEditorWorkspaceBindings.tsx` now adapts the existing selection, navigation, context-menu, nested drag, content mutation, question/section lifecycle, solution, front-matter, conflict, inspector, and preview contracts to `DocumentEditorWorkspace.tsx` and `createEditorPanelRenderers.tsx`.
    - Existing controllers remain authoritative. The adapter owns no document state, persistence, history, mutation, navigation, or preview path; `documentWorkspaceBindings.ts` contains only the supported solution-command and void async-command binding decisions.
    - Focused tests cover both binding decisions. The isolated `pnpm smoke:context-menu-actions` workflow verifies exactly one workspace, editor pane, inspector pane, and preview pane, captures the rendered workspace, continues the context-action workflow, and reports a clean browser console.
    - `App.tsx` fell from 1551 to 1386 lines.

37. **Completed and verified scoped manual-solution status and completeness validation.**
    - Marked question, part, and subpart headers now show solution state only in Solutions mode. Leaf controls apply the existing validation fix, parent controls summarize and jump to descendant issues, and completed scopes show a compact ready state.
    - `SolutionScopeStatus.tsx` consumes the shared `SolutionValidationResult`; it owns no document state and delegates mutations and navigation to `useSolutionValidationController` through the existing workspace binding.
    - Blank solution-only text remains an error after a slot is created, and shared or legacy paired completion tables with unanswered student-entry cells remain warnings. A placeholder module therefore no longer produces a false ready state.
    - Focused validation tests cover leaf fixes, parent aggregation, ready/unmarked scopes, blank solution text, and incomplete solution tables. The isolated `pnpm smoke:context-menu-actions` workflow verifies missing, blank, ready, and Student-hidden states with rendered screenshots and a clean browser console.
    - The grouped validation binding adds one composition line after the workspace extraction; `App.tsx` is now 1387 lines.

38. **Completed and verified recursive solution-mark validation and nested-column repairs.**
    - `solutionValidation.ts` now recursively intersects parent and child Student/Solutions visibility, discovers replacement slots inside shared columns, and sums printed hidden text `[[marks:n]]` annotations plus structured choice/table/diagram `markTicks`.
    - A complete solution whose tick total differs from its question, part, or subpart marks now reports one scoped review warning. Blank text, an unanswered choice, or an incomplete solution table remains the primary issue until the answer surface is complete; Mauth does not guess how a teacher wants marks redistributed.
    - `solutionValidationNestedBlocks.ts` lets the existing validation-fix controller insert missing answer/solution blocks and resize answer spaces inside nested columns by updating the owning columns module through one structured `module.update` action.
    - Saved solution-choice ticks are preserved by normalization, while columns no longer offer a surface-tick control that preview and persistence do not support.
    - Focused tests cover mixed text/surface totals, mismatches, shared and solution-only columns, nested pairing, nested insert/update mutations, choice-tick persistence, and unsupported column ticks. The isolated `pnpm smoke:context-menu-actions` workflow proves nested **Add solution**, amber mismatched-tick review, green matching-tick readiness, and Student-hidden status with rendered screenshots and a clean browser console.

39. **Completed and verified workspace-presentation controller extraction.**
    - `useEditorWorkspacePresentationController` now owns deferred preview document values, current and deferred mark totals, preview page-format and zoom state, workspace visibility, shell/workspace grid styles, document TOC construction, and active preview-anchor projection.
    - `editorWorkspacePresentation.ts` contains the pure pane-visibility, grid-layout, and page-break-anchor decisions. It owns no document state, mutations, persistence, navigation intent, or renderer behavior.
    - Focused tests cover preview/split/inspector visibility, stable grid layouts, expanded navigator width, and normal versus page-break preview anchors. The existing context-menu smoke still verifies one editor/inspector/preview workspace, layout and zoom controls, dialogs, solution mode, context actions, and a clean browser console.
    - `App.tsx` fell from 1387 to 1370 lines without introducing a second preview, TOC, zoom, navigation, or layout path.

40. **Completed and verified version-restore document-transition safety.**
    - The former before-open guard is now a generic typed document-transition outcome model used by file opens, documents-folder switches, and active-file version restores. Operation-specific Mauth copy names recovery, deliberate discard, cancellation, and failure accurately.
    - `restoreProjectFileVersionWithSession` requires the active document transition to succeed before it invokes the disk restore. Cancellation and recovery-copy failure therefore result in zero restore calls; restoring a different, inactive file does not disturb the current editor.
    - Active dirty files are saved before a normal restore. If the file changed on disk, the teacher can **Save recovery copy and restore**, **Restore without saving**, or **Cancel**; only the first two outcomes can continue.
    - Focused tests cover all transition copy and restore outcomes. The isolated `pnpm smoke:document-session-conflict` workflow now proves cancel keeps edited Beta in the editor and leaves disk unchanged, then proves recovery creates a second recovery file, restores revision 1, reloads the active editor, and emits no unexpected console warning or error.
    - The extra version-controller binding leaves `App.tsx` at 1371 lines.

41. **Completed and verified diagram-answer completeness.**
    - `solutionDiagramCompleteness.ts` detects supported structured `solutionOnly` answer elements across shared `graph2d`, `geometry2d`, `vector2d`, `graph3d`, Plotly `statsChart`, and structured Penrose/Venn diagrams.
    - A shared annotated diagram now counts as both response and solution content. Its `markTicks` survive normalization, remain editable in the shared diagram inspector, count toward the marked scope, and render beside the surface without applying whole-diagram solution colour.
    - Paired solution diagrams are compared through a deterministic answer-content projection. Size, colour, line weight, grids, coordinate/chart view ranges, and 3D camera state are ignored, so an untouched or presentation-only edited copy remains an explicit warning until a curve, point, label, value, shading, series, vector, construction, or replacement image changes.
    - Focused tests cover every supported answer family, presentation-only versus mathematical edits, shared tick persistence and controls, validator response/solution/tick accounting, and unchanged/completed paired diagrams. The isolated `pnpm smoke:diagram-solution-authoring` workflow proves green shared-diagram readiness, four surface ticks without whole-surface blue styling, the untouched-copy warning, supported renderer authoring, and a clean browser console without touching teacher files.

42. **Completed and verified stateless application-runtime extraction.**
    - `editorApplicationRuntime.ts` now owns the one configured set of editor ids, content-block factories, document normalizers, TOC summaries, block selection, duplication, persistence, version previews, and solution-validation wiring consumed by the application shell.
    - `useStableEvent.ts` owns reusable stable callback identity instead of leaving a React hook implementation inline in `App.tsx`.
    - No document state, effect, history, mutation, persistence decision, or controller ownership moved. Focused runtime tests cover the configured factories, normalization, summaries, selection, and duplication; the full web action suite passes with 527 tests.
    - The isolated context-menu smoke renders the editor, inspector, preview, nested columns, and solution control with a clean browser console. The live bridge retained the exact `snap_45xkb5` teacher snapshot before and after hot reload, so the dirty unavailable-drive document was not mutated or replaced.
    - `App.tsx` fell from 1371 to 1264 lines.

43. **Completed and verified shared multiple-choice solution authoring.**
    - A teacher now selects the correct answer directly on the one shared choice list in Solutions mode. The same structured `solutionAnswerIndex` is editable from the block and inspector, and the answer's `markTicks` live on that surface rather than a duplicated list.
    - Student editor, preview, and print paths ignore the stored answer ring and ticks. Solutions preview circles only the selected label in blue, leaves the other labels and choice content in normal ink, and renders ticks beside the shared surface without colouring the whole list.
    - Normalization and visibility changes preserve a valid shared answer and ticks, clear them when the block becomes student-only, and keep legacy solutions-only choice copies compatible. Structured actions accept shared or solutions-only answers and reject student-only answer metadata.
    - Solution validation treats every shared choice list as its own solution surface, reports a specific unanswered-choice warning instead of a generic missing-module error, and counts shared ticks only after a valid answer is selected. The paired-copy command no longer offers a duplicate for new choice authoring.
    - Focused tests cover helpers, persistence, visibility patches, duplication capability, action validation/application, agent snapshot summaries, solution completeness, and recursive mark allocation. Agent snapshots expose both the shared selected answer and surface ticks. The web action suite now has 530 passing tests.
    - The isolated context-menu smoke stores answer B and one tick on a shared list, proves the blue ring and tick in Solutions mode, proves the selector, ring, and tick are absent in Student mode, captures both rendered states, and reports a clean browser console.

44. **Completed and verified project-persistence composition extraction.**
    - `useEditorProjectPersistenceController` now composes active project-file path/revision refs, the last durable save fingerprint, autosave snapshot creation, browser and disk draft autosave, current document fingerprints, derived file/header status, and the before-unload guard.
    - The extraction delegates to the existing focused hooks. It does not open, save, close, reload, or synchronize project files; those mutations remain exclusively on `useDocumentSessionController` and the project-file controllers.
    - `App.tsx` no longer rebuilds the autosave/status cluster and fell from 1264 to 1202 lines without changing the document-session outcome model.
    - The context-menu and editor-column isolated browser smokes now mock their own agent bridge. They can no longer register phantom editor sessions against the teacher's live API; both smokes pass and the real bridge remains at one active session.
    - The web/action suite remains at 530 passing tests, the production build passes, and the isolated context-menu and basic-block inspector smokes render cleanly. The live teacher snapshot remained exactly `snap_45xkb5` before and after HMR.

45. **Completed and verified shared in-place table solution authoring.**
    - One shared table now stores sparse `solutionEntries` beside its student-facing body rows. Entries are accepted only where the matching body cell is blank; headings and given values remain shared and unchanged.
    - **Complete in solutions** switches to Solutions mode and selects the same root or column-nested table without creating a second module. Student mode hides entries and ticks; Solutions mode substitutes the stored values and colours only those answer cells blue.
    - Focused `module.settings.update` actions set or clear one answer by zero-based body row and column. Normalization, raw action validation, agent snapshots, duplication, visibility changes, surface ticks, and solution completeness use the same structured state; legacy paired tables remain readable.
    - Resizing uses the student table rows rather than the rendered solution values, so structural edits cannot copy answers into the student layer. Invalid shared-entry metadata on student-only or solution-only tables is removed during normalization.
    - Focused tests cover sparse normalization, action application and rejection, Student/Solutions presentation, nested selection plans, tick allocation, validation, and snapshot summaries. The isolated context-menu smoke proves one table block, two blue answer cells with two surface ticks in Solutions mode, blank cells with no ticks in Student mode, and a clean browser console.

46. **Completed and verified Files-drawer project-management composition extraction.**
    - `useEditorProjectFileManagementController` now composes documents-folder switching, version restore, folder creation, backup/import, rename, move, duplicate, and delete through the existing focused project controllers.
    - Save, open, close, conflict, recovery, and transition decisions remain on `useDocumentSessionController`; the new hook consumes its transition and save callbacks rather than creating another lifecycle path.
    - `createEditorProjectFileDuplicatePlan` serializes the current structured editor document at command time, preserving front matter, questions, section headings, document flow, selected logo, formatting, and the correct `notes`, `worksheet`, or `test` file type. Its focused test proves duplicate naming, metadata, fingerprinting, and source-document immutability.
    - `App.tsx` no longer wires five Files-drawer controller clusters or rebuilds active-editor duplicate serialization. It fell from 1202 to 1119 lines.
    - The focused duplicate test, 543-test web/action suite, isolated context-menu/Files-drawer smoke, full `pnpm check`, TypeScript, and Vite production build all pass.

47. **Completed and verified editor-agent bridge composition extraction.**
    - `useEditorAgentBridgeController` now owns the application-specific adapter between editor file identity, solution validation, structured action preview/apply, editor history commit, and revision-aware project-file saves.
    - The hook delegates protocol handling to `useMauthAgentBridgeController`, file-state calculation to `useMauthAgentFileStateController`, actions to the existing document action engine, and saves to the existing document-session writer. It does not create another mutation, validation, save, or conflict path.
    - `editorAgentBridgeSaveConflictMessage` reuses the shared project-file conflict copy for stale revisions and keeps the explicit guarantee that failed bridge saves do not mutate live editor state. Focused tests cover both conflict and fallback paths.
    - `App.tsx` no longer assembles the bridge adapter inline and fell from 1119 to 1105 lines.
    - The isolated mocked-app browser smoke passes without registering against the teacher API. The full gate passes with 545 web/action tests.

48. **Completed and verified structured uploaded-image solution annotations.**
    - Uploaded `image` diagrams now store editable `label`, `ellipse`, and `arrow` overlays in `data.annotations`, using percentage geometry so annotations remain aligned when the configured image size changes.
    - New annotations created in Solutions mode default to `solutionOnly`, disappear from Student editor/preview, and render in solution blue without recolouring the bitmap or shared annotations. Teachers retain a per-annotation **Show in solutions only** override.
    - `ImageDiagramCanvas` is the shared editor/preview/print surface. `ImageAnnotationsEditor` provides direct annotation creation and focused properties, including clearable numeric fields with one-unit steppers.
    - `diagram.settings.update` targets one image annotation by stable id or index and preserves the embedded image plus sibling annotations. Shared schema, normalization, raw action validation, diagram validation, duplication, visibility, and diagram-answer completeness use the same structured state.
    - Focused tests cover authoring defaults, normalization, visibility and solution colouring, focused action updates, validation, and solution completeness. The isolated `pnpm smoke:diagram-solution-authoring` workflow proved a blue solution ellipse, bitmap preservation, position editing, Student filtering, and a clean browser console without touching teacher storage.
    - The full gate passes with 554 web/action tests. Visual evidence is in the ignored verification output at `workspace/verification/diagram-solution-authoring-smoke/2026-07-13T12-06-23-228Z/image-solution-annotation.png`.

49. **Completed and verified per-function `graph2d` solution authoring.**
    - `GraphFunction` now carries structured `solutionOnly` state. Functions added in Solutions mode default to that layer, display a Solution badge, remain directly editable, and expose the selected function's **Show in solutions only** inspector override.
    - Student editor/preview hides solution functions without removing or shifting their array indexes. Features that reference a hidden answer function are suppressed with it, preserving valid sibling references; Solutions preview colours only answer curves and their labels blue while leaving shared functions unchanged.
    - Focused `diagram.settings.update` function targets address a stable id or zero-based index, validate supported function/domain/style/visibility fields, and preserve sibling functions, features, graph bounds, and renderer settings. Raw diagram validation and solution completeness use the same schema state.
    - Focused action, schema, inspector, visibility, dependency, and completeness tests pass. The isolated `pnpm smoke:diagram-solution-authoring` workflow created and edited an answer parabola, toggled its layer through the inspector, proved Student filtering, and rendered a black shared curve plus blue solution curve with a clean browser console.
    - The full gate passes with 562 web/action tests. Visual evidence is in the ignored verification output at `workspace/verification/diagram-solution-authoring-smoke/2026-07-13T12-39-22-174Z/graph2d-solution-function.png`.

50. **Completed and verified measured preview-readiness reporting.**
    - `PaginatedTestPreview` now emits a structured report after real DOM measurement, including Student/Solutions copy mode, content pages, supplementary pages, total physical pages, and any page containing a block taller than the printable A4 content area.
    - `usePreviewReadinessController` retains separate Student and Solutions reports only for the current document fingerprint. Editing or opening a different document clears stale evidence until the new preview is measured.
    - System Status displays the active copy's measured page totals and print readiness. The current agent snapshot exposes all measured copy warnings as `rendered-page-overflow`, while dry-run and applied-action result snapshots deliberately omit warnings measured against the previous rendered document.
    - Preview readiness remains a formatting/rendering contract, separate from mathematical solution-completeness validation. Focused pagination and agent-snapshot tests cover physical page numbering, targets, copy labels, report equality, and warning transport.
    - The isolated `pnpm smoke:context-menu-actions` workflow verifies the rendered System Status rows and a clean browser console without opening teacher files. Visual evidence is in ignored verification output at `workspace/verification/context-menu-actions-smoke/2026-07-14T06-34-10-005Z/app-overlays-system-status.png`.
    - The full gate passes with 565 web/action tests. `App.tsx` is 1115 lines after the focused readiness composition wiring.

51. **Completed and verified cloud-folder outage/reconnect and launcher shutdown hardening.**
    - Active-file polling now returns explicit `current`, `reloaded`, `conflict`, `missing`, `unavailable`, `reload-failed`, and `skipped` outcomes. Polling absorbs storage/network rejection, preserves the draft and selected folder, avoids unhandled promises, and reports reconnection only after the active file is confirmed current or safely reloaded.
    - Manual Open and Reload use the same storage-unavailable copy as background sync. Missing files and newer dirty revisions remain distinct error/conflict states instead of being treated as successful reconnections.
    - `/api/system/status` no longer opens external cloud-hosted `.mauth/project.json`. It reports folder identity with `defaultProject: null` until normal project APIs load metadata, preventing an unavailable Google Drive placeholder from blocking the launcher before Vite starts. Normal storage reads detect macOS `dataless` placeholders and return `503 STORAGE_UNAVAILABLE` immediately instead of hanging.
    - `pnpm dev:stop` first sends `SIGTERM`, then sends `SIGKILL` only to Mauth-owned listeners still holding the configured port. This recovered a Uvicorn reload parent that ignored graceful shutdown while leaving external listeners outside the stop scope.
    - Focused tests cover sync planning, outage absorption, reconnect reporting, storage-error classification, dataless-placeholder rejection, and cloud-safe system status. The full web action suite now has 569 passing tests, focused API storage/status tests have 20 passing tests, lint/build pass, and an isolated launcher smoke reached healthy API status plus Vite in about three seconds without opening or changing teacher files.

52. **Completed and verified manual-solution controller composition.**
    - `useEditorManualSolutionController` now assembles solution-surface copying, scoped validation and deterministic repairs, and answer/solution-slot creation over the existing focused controllers.
    - Shared factories, Mauth dialogs, Student/Solutions mode, navigation, and `applyEditorAction`/`applyEditorActions` remain authoritative. The extraction creates no second solution state, validator, or mutation path.
    - `App.tsx` fell from 1115 to 1075 lines. ESLint, all 569 web/action tests, the Vite production build, and the isolated `pnpm smoke:diagram-solution-authoring` workflow pass; the smoke verified root and nested solution surfaces with a clean browser console and did not touch teacher files.

53. **Completed and verified standalone macOS foundation.**
    - `desktop/main.mjs` now owns a secure Electron window, a dynamic loopback port, the packaged FastAPI sidecar, runtime-manifest discovery, single-instance focus, external-navigation handling, logs, and child-process shutdown.
    - The API sidecar is built with PyInstaller and serves the production Vite build from the same origin. Penrose is bundled as a self-contained Node entry and runs through Electron's Node runtime, so the installed app needs neither Python nor Node on the user's `PATH`.
    - `~/Applications/Mauth Studio.app` is installed as a valid ad-hoc-signed local bundle. The previous launcher is retained at `~/Library/Application Support/Mauth Studio/Launcher Backups/Previous Mauth Studio.app`.
    - Normal macOS state is shared between development and packaged runtimes under `~/Library/Application Support/Mauth Studio/storage`. The guarded installer copied existing `.mauth` state there without deleting the source; visible documents and external-folder project metadata remain in their teacher-selected locations.
    - `pnpm agent:doctor` discovers the packaged dynamic URL through `runtime.json`. Packaged system status reported `desktop-packaged`, app version `0.1.0`, the selected Google Drive folder, and one bridge session. A real packaged Venn render returned SVG.
    - Native Quit now turns the renderer's unsaved-page guard into a two-choice backed-up-draft confirmation. Choosing Close removed the runtime manifest immediately and both PyInstaller processes exited shortly afterward.
    - `pnpm macos:build`, `pnpm macos:install`, `pnpm macos:dev`, ad-hoc signing, the Codex Run action, focused storage/runtime tests, package signature verification, actual-window screenshot inspection, and installed-app lifecycle checks are in place. Group 54 records the subsequent bridge-authentication, Hardened Runtime, Developer ID, notarization, and release-tooling work; only a clean-machine release test remains for the first shared beta.

54. **Completed and verified first external-release hardening slice.**
    - Every desktop launch now generates a random bridge token, passes it privately to FastAPI, injects it into Electron editor API traffic, and records it only in the mode-`0600` dynamic runtime manifest. Packaged private API routes reject unauthenticated local callers; only health, system status, and discovery remain public diagnostics.
    - `pnpm agent:doctor`, `pnpm agent:mcp`, and `pnpm smoke:agent-bridge` discover and attach the token automatically, preserving Codex and Claude authoring without a copied secret or second mutation path.
    - The local bundle now enables Hardened Runtime with explicit Electron entitlements. Build and installed-app verification confirm a valid nested signature, runtime flag, arm64 architecture, live editor registration, authenticated action smoke, and rejection of an unauthenticated snapshot request.
    - `pnpm dev:status` now discovers and reports the running packaged app before inspecting fixed development ports. `pnpm dev:stop` reports that the packaged app is independent and stops only development servers; users quit the standalone app normally with Command-Q or the application menu.
    - `pnpm macos:release` is a fail-closed Developer ID/notarization pipeline for arm64 DMG and ZIP artifacts, with `pnpm macos:verify` and distribution verification. This Mac now has `Developer ID Application: David Ramsay (9TZPXJ6JGH)` and the validated `mauth-notary` Keychain profile. The latest release `0.1.0` rebuild completed on 19 July 2026: Apple accepted the app submission `98159fbd-8ac0-4d71-bfba-1c6e63e26dd5` and the signed DMG submission `176d7d15-6461-490a-be0b-6de62d1c9a13`; both the app and DMG have stapled tickets and Gatekeeper reports `Notarized Developer ID`.
    - The release pipeline strips the certificate-class prefix before passing the identity to electron-builder, then explicitly signs, notarizes, staples, and Gatekeeper-validates the final DMG. The original v0.1.0 path removed updater metadata because that build was manual; group 57 supersedes that behavior for later updater-enabled releases.
    - `docs/macos-release.md` records certificate setup, credential hygiene, release verification, clean-machine testing, Apple-Silicon scope, and the authenticated agent contract.

55. **Completed and verified blank new-test creation.**
    - New school tests, exams, and worksheets now begin with title-page settings and zero questions; teachers add only the questions they need through the existing **Add question** control.
    - Math Notes keeps its intentional first editable heading. The old first-run screenshot fixture remains available only as an explicit test fixture and is no longer injected into production documents.
    - Empty drafts are valid persistence snapshots, and initial editor startup no longer creates a fallback question. A blank test therefore remains blank after closing and reopening the app.
    - Focused starter-document and persistence tests cover blank standard, exam, and worksheet plans, blank-draft recovery, plus the retained notes behavior. The signed/notarized packaged app was verified through **New document -> School test** with zero question buttons, `questionCount: 0`, and an empty document flow.

56. **Completed public-release bootstrap.**
    - The README and GitHub Pages source now lead with the standalone signed Apple Silicon app instead of presenting the two-terminal browser runtime as normal installation.
    - Normal teacher download, optional Codex/Claude bridge setup, source development, local installed checkpoints, and external notarized releases are documented as separate workflows.
    - `AGENTS.md`, local-agent setup, release guidance, product direction, and the roadmap now state that notarization is a versioned release operation rather than part of every edit-test cycle.
    - PR #37 is merged at `c9316f4`, and the signed/notarized `v0.1.1` alpha prerelease is public with five verified assets.
    - The public DMG was downloaded, matched SHA-256 `38d9a9df890631a89598226c1fc79ca73e90e430ef2c08fe4cbc97d7d4b263b2`, passed Gatekeeper, and was installed at `~/Applications/Mauth Studio.app`. The previous `0.1.0` bundle remains in the launcher-backup folder.
    - GitHub reported a partial outage for API Requests and Actions on 20 July 2026. The older `v0.1.0` release remains an asset-free historical record and must not be reconstructed as an updater release because its app bundle predates updater support.

57. **Completed teacher-confirmed updater and guarded publication workflow.**
    - Update-enabled packaged releases use `electron-updater` against the public GitHub prerelease channel, check once after launch, expose a dynamic **Check for Updates…** application-menu item, and never check from source-development or ad-hoc directory builds without release metadata.
    - Available releases ask before download; completed downloads ask before restart/install. Background network failures remain quiet, while manual-check and approved-download failures produce Mauth-owned dialogs. Alpha prereleases are allowed and downgrades are not.
    - Release packaging now retains `latest-mac.yml` and blockmaps and verifies that metadata points to the generated signed ZIP with its exact size and SHA-512.
    - `pnpm macos:ship` requires clean pushed `main`, a new version, matching release notes, valid GitHub authentication, and Apple signing/notarization prerequisites. It runs `pnpm check`, builds the release, creates or resumes a matching draft prerelease, uploads all update assets, verifies names/sizes/digests, and publishes only after verification.
    - Version 0.1.0 cannot discover this feature. Version 0.1.1 is the completed one-time manual updater bootstrap; update-to-the-next-alpha is the first complete end-to-end updater acceptance test.
    - The `v0.1.1` ship exposed a GitHub API detail: private drafts are not available from the public tag endpoint. Draft verification now resolves the numeric release ID through `gh release view` and verifies assets through `/releases/{id}` before publication.

The full `pnpm check` gate passes on this checkpoint: API 81 passed, web/actions 569 passed, Plotly 8 passed, launcher 34 passed, and TypeScript/Vite production build passed. The packaged updater bundle contains its provider config and dependencies. The public `v0.1.1` DMG, ZIP, metadata, and blockmaps match the locally verified release artifacts; the installed app is healthy and its background updater check reports the app is current. The prior authenticated agent, bridge, Penrose, and native Close verification remains valid. Recheck external cloud-folder materialisation before teacher-file authoring.

The two API listeners shown by `pnpm dev:status` are the expected Uvicorn reloader parent and worker for one Mauth runtime. Do not treat that pair alone as evidence of a stale duplicate API.

### Exact Resume Point

Resume follow-on development in this order:

1. Prepare the next alpha after `v0.1.1` and use it for the first complete in-app updater acceptance test: confirm detection, teacher approval before download, teacher approval before restart, successful replacement, preserved documents/settings, and a current-version check after relaunch. Include a normal visible quit/restart check with an unsaved backed-up draft; the command-line AppleScript quit used during the bootstrap install became wedged behind the native confirmation and had to be ended after the clean autosaved state was verified. Also clean-machine-test the public `v0.1.1` DMG on another Apple Silicon Mac.
2. Continue first-class manual solution editing through the next coherent teacher-facing ergonomic or validation gap, or build the next conservative page-flow check on the measured preview-readiness contract. Do not create a second status, mark, preview, validation, or mutation path.
3. Continue the `App.tsx` composition split only at a coherent remaining boundary. Existing persistence, Files, bridge, manual-solution, preview, workspace, navigator, overlay, header, inspector, drag, mutation, and lifecycle slices are complete; do not duplicate controller ownership merely to reduce line count.
4. Recheck the selected Google Drive documents folder and live editor session before authoring teacher files. The packaged app starts independently of cloud metadata, but the normal project route still correctly returns `503` while `.mauth/project.json` is dataless. Do not reset the folder or import files automatically.
5. Add focused tests with each change, run `pnpm check`, and use the packaged-app smoke path when changing desktop, storage, Penrose, or bridge discovery.

The preview-composition, workspace-presentation, document-navigation, application-overlay, application-header, document-workspace binding, solution-element, basic-block, diagram-router, geometry2d, graph2d, Penrose, vector2d, graph3d, statistics, and image inspector slices are complete.

The completed milestones established the standalone Electron macOS entry point, a composition-only editor shell, explicit document/session lifecycle, and first-class manual solution editing. Continue with the ordered hardening and authoring work above; do not start a Tauri or Swift rewrite unless a proven requirement cannot be met by the packaged web/API stack.

### New Model Safety Check

Before a new model edits anything:

1. Read the files in **Start Here** and this checkpoint completely.
2. Run `git status --short --branch`, `git log --oneline -5`, and `pnpm dev:status`.
3. Preserve any modified and untracked source file reported by Git; the recorded checkpoint is clean, but a later user's work is never disposable generated output.
4. Confirm the active folder and file through `/api/system/status` or the bridge snapshot before assessment-authoring actions.
5. The current packaged `0.1.1` runtime is running. Use `pnpm dev:status` before opening another copy; do not start manual API/web terminals alongside it.
6. Run `pnpm agent:doctor` and require passing web and active-editor checks before bridge mutation. The doctor discovers the packaged dynamic URL automatically; use explicit URL variables only for manual fixed-port debugging.
7. The selected Google Drive folder identity passed launcher status at this checkpoint, but its project metadata was still a downloading File Provider placeholder. If normal project routes return `503 STORAGE_UNAVAILABLE`, treat that as an external-drive availability/download state; do not switch folders, migrate files, save, discard, or reset the open teacher document merely to make the status green.
8. For code changes, run focused tests while iterating and `pnpm check` before handoff. For visual behavior, also verify the live browser and restore any temporary document mutation.

## Product Direction

Mauth Studio is a local-first high-school mathematics assessment authoring app built for external agent workflows.

The strategic direction is:

```text
explicit document state
-> deterministic Mauth actions and dry runs
-> validation and preview evidence
-> browser verification
-> optional AI assistant using the same contracts
```

The old provider-backed in-app chat panel is not the product path. If chat returns, it should be a UI client for the same local action/bridge layer used by Codex, Claude Code, Cursor, and MCP tools.

## Runtime Model

Normal macOS use should go through the standalone app:

```bash
open ~/Applications/Mauth\ Studio.app
```

On macOS the installed entry point is:

```text
~/Applications/Mauth Studio.app
```

The Electron main process owns a packaged FastAPI sidecar and production web build on one dynamic loopback origin. It writes the live URL to a private Application Support runtime manifest for Codex/MCP discovery and removes that record when the app quits. No Terminal windows need to remain open.

Useful commands:

```bash
pnpm macos:dev
pnpm macos:build
pnpm macos:install
pnpm agent:doctor
```

The older fixed-port browser launcher remains a debugging path:

```bash
pnpm dev:launch:desktop
pnpm dev:status
pnpm dev:stop
pnpm dev:launch:replace
```

Use `pnpm dev:api` and `pnpm dev:web` only for lower-level debugging.

## Storage Model

Normal authored files live outside the repo:

```text
~/Documents/Mauth/
  Documents/
    visible teacher files and folders

~/Library/Application Support/Mauth Studio/
  storage/
    remembered folder identity
    autosave/current-test.json
    reusable logo assets
    default-project metadata
    version snapshots
    backups
  runtime.json
  desktop.log
```

The Files drawer can open another documents folder. Real `.test.json` and `.mauth.md` files in the selected folder are indexed in place, and hidden `.mauth/` project metadata is kept beside that selected folder. Global autosave, logo state, and remembered-folder identity remain in Application Support so packaged and development runtimes agree.

For external cloud-backed folders, `/api/system/status` reports folder identity without opening `.mauth/project.json`; `defaultProject` can be `null` until the normal project API loads metadata. Background active-file sync preserves the current editor draft through storage outages and only reports reconnection after the active file is confirmed current or safely reloaded.

Project-file saves are revision-aware. Autosave is recovery state, not a saved project file. Do not treat direct writes to visible files or `.mauth` metadata as the normal authoring path; use the bridge, Mauth actions, project-file API, or Files drawer.

## Agent Editing Contract

Assessment authoring should follow this loop:

```text
mauth_snapshot
mauth_actions_preview
mauth_actions_apply
mauth_validation_run
browser verification
```

Large generated edits should be previewed before applying. Action application should go through editor history, autosave, validation, and project-file revision checks. Comments and suggestions are review state only; they do not mutate the document.

Direct project JSON edits are a recovery or migration fallback, not the default workflow.

## Manual Solutions Direction

Manual solution editing is a first-class product direction.

The intended model is:

```text
AI drafts -> teacher edits -> structured solution layer -> print/export uses that layer
```

Current rules:

- Student/Solutions mode stays.
- Solution-only blocks and solution surface copies are editable.
- Tables, diagrams, graph functions/annotations, ticks, and selected/circled answers should place solutions where a student would write them.
- Plotly statistics-chart answers use structured supplemental series rather than React or SVG overlays.
- Uploaded-image answers use structured percentage-positioned labels, ellipses, and arrows rather than one-off React or SVG overlays.
- Blue solution content should be limited to the actual entered answer or annotation, not the whole table or diagram.
- Worked solution text should usually be one mathematical step or conclusion per line.
- Hidden `[[marks:n]]` ticks and surface `markTicks` both count toward mark verification.
- Solution slots should not show ruled lines by default; line display is optional.

The remaining manual-solution work is deeper surface-specific answer completeness and editing ergonomics. Scoped status, recursive mark totals, nested-column repairs, circled multiple-choice answers, completed tables, `graph2d` functions/features, `geometry2d` primitives, `vector2d` elements, `graph3d` elements, Plotly `statsChart` series, uploaded-image labels/ellipses/arrows, supported Penrose geometry/network elements, and structured Venn region answers now have implementations in the current dirty worktree. Custom Penrose Substance and unsupported complex construction predicates intentionally remain paired solution-diagram work rather than an unsafe mixed editing model.

## Current Architecture Shape

Important frontend boundaries:

- `apps/web/src/App.tsx` is still the main composition shell and remains too large.
- New code should keep shrinking `App.tsx` rather than growing it.
- Document state/history lives in focused hooks under `apps/web/src/hooks`.
- Document lifecycle is composed through `useDocumentSessionController`.
- New-document template construction lives in `apps/web/src/lib/editorStarterDocuments.ts`.
- Context actions, block contexts, page breaks, module lifecycle, question lifecycle, selection, navigation, autosave, and solution validation have focused helpers/controllers.
- Mauth actions live in `apps/web/src/lib/mauthActions.ts`.
- Diagram logic is split by renderer: JSXGraph coordinate graphs, Penrose static diagrams, Plotly statistics charts.
- Geometry2d inspector rendering lives in `Geometry2DSelectionInspector.tsx`; pure child-anchor/title selection lives in `geometry2dInspectorSelection.ts`.
- Graph2d inspector rendering lives in `Graph2DSelectionInspector.tsx`; pure function/feature selection and patches live in `graph2dInspectorSelection.ts`.
- Penrose inspector rendering lives in `PenroseSelectionInspector.tsx`; typed family view-state selection lives in `penroseInspectorSelection.ts`.
- Vector2d inspector rendering lives in `Vector2DSelectionInspector.tsx`; normalized view state and visibility/interval patches live in `vector2dInspectorSelection.ts`.
- Graph3d inspector rendering lives in `Graph3DSelectionInspector.tsx`; normalized dimensions and camera state live in `graph3dInspectorSelection.ts`.
- Statistics inspector rendering lives in `StatsChartSelectionInspector.tsx`; normalized data/options patches and opacity clamping live in `statsChartInspectorSelection.ts`.
- Image inspector rendering lives in `ImageSelectionInspector.tsx`; normalized metadata and dimensions live in `imageInspectorSelection.ts`.
- Columns, choices, table, and answer-space inspector rendering lives in `BasicBlockSelectionInspector.tsx`; normalized view state lives in `basicBlockInspectorSelection.ts`.
- Diagram type/alignment and renderer dispatch live in `DiagramSelectionInspector.tsx`; child-aware base-control visibility lives in `diagramInspectorRouting.ts`.

Backend boundaries:

- FastAPI services live in `apps/api/app/services`.
- Storage/project files live in `apps/api/app/services/storage.py`.
- API routes live in `apps/api/app/api`.

Package boundaries:

- `packages/question-engine`: question generation.
- `packages/marking-engine`: marking logic.
- `packages/formatting-engine`: formatting logic.
- `packages/diagram-penrose`: Penrose diagrams.
- `packages/diagram-plotly`: Plotly statistics charts.

Do not put marking or formatting decisions inside question generation logic.

## Current Verification Baseline

Before handing development work back, run the narrowest relevant checks plus broader gates for shared changes.

Main gate:

```bash
pnpm check
```

Documentation-only transition check:

```bash
pnpm check:handoff
```

This verifies the required handoff files and sections, entry-point references, package scripts, local Markdown links, and consistent recorded test counts. It does not replace the full code-quality gate or a fresh live-runtime audit.

Before an actual model transition, also run:

```bash
pnpm check:handoff:live
```

The live variant additionally checks the documented branch, baseline commit, dirty-worktree counts, and `App.tsx`/`SelectionInspector.tsx` line counts against Git and the working tree. It is intentionally separate from the normal `pnpm check` gate because those volatile facts change during an implementation slice.

Latest handoff result on 19 July 2026:

```text
formatting and lint: passed
API: 81 passed
web/actions: 569 passed
Plotly: 8 passed
launcher: 34 passed
TypeScript and Vite production build: passed
```

Useful narrower checks:

```bash
pnpm test:api
pnpm test:web-actions
pnpm test:plotly
pnpm test:launcher
pnpm build:web
```

Useful runtime checks:

```bash
pnpm dev:status
pnpm agent:doctor
pnpm smoke:agent-bridge
pnpm smoke:file-manager
pnpm smoke:external-folder-autosave
pnpm smoke:context-menu-actions
pnpm smoke:document-session-conflict
pnpm smoke:diagram-solution-authoring
pnpm smoke:diagram-gallery
```

Run browser smoke tests only when the API/web runtime is available or the task requires rendered proof.

## Recent Development State

The current work stream has focused on:

- macOS launcher and stale-runtime cleanup
- replacing native browser prompts with Mauth dialogs
- making file/folder operations safer
- explicit close/save/discard/cancel document lifecycle
- external folder picker support
- system status and launcher diagnostics
- project-file recents and recovery handling
- shrinking `App.tsx` by extracting focused controllers/helpers
- focused logo-library and editor-storage hydration controllers
- tested front-matter logo action orchestration
- tested question and question-boundary page-break drag state/controller extraction
- tested nested subsection/editor-page-break state/controller and pure action extraction
- tested stale-file autosave reconciliation and conflict recovery/reload workflows
- tested question/part/subpart content mutation action extraction
- tested question/part/subpart panel-render plans and adapter extraction
- tested editor context-command extraction and nested-column command behavior
- tested question add/remove and question-boundary page-break lifecycle controller extraction
- direct root and nested diagram **Complete in solutions** authoring with idempotent paired-copy reopening
- editor navigation ownership for selection, activation, reveal/open signals, preview mirroring, and pane pinning
- document-session ownership of recovery-copy and reload conflict actions
- explicit save-recovery/open-without-saving/cancel outcomes before file or folder switches
- Solutions-mode graph functions and annotations that default to `solutionOnly` and remain manually overridable
- Solutions-mode `geometry2d` primitives with Student filtering, solution-blue preview styling, and an inspector override
- Solutions-mode `vector2d` vectors, segment labels, and angle markers with dependency-aware Student filtering, solution-blue preview styling, and element-level overrides
- Solutions-mode `graph3d` points, segments, dimensions, faces, and solids with direct element editing, stable Student framing, solution-blue preview styling, and deterministic action support
- Solutions-mode Plotly statistics-series lines, points, line-and-point traces, and bars with direct editing, Student filtering, solution-blue preview styling, and deterministic element actions
- Solutions-mode uploaded-image labels, ellipses, and arrows with percentage geometry, Student filtering, solution-blue preview styling, deterministic element actions, and bitmap-preserving updates
- Solutions-mode structured Penrose points/nodes, segments/links, and Venn region answers with dependency-aware Student filtering, solution-blue rendering, and deterministic element actions
- focused geometry2d selection-inspector rendering with pure, tested child-anchor and title selection
- focused graph2d selection-inspector rendering with pure, tested function/feature selection and patch logic
- focused Penrose selection-inspector rendering that preserves structured patch and custom-Substance clearing invariants
- focused vector2d selection-inspector rendering with attached major-grid/axis-number steps and stable dimensions
- focused graph3d selection-inspector rendering with metadata-preserving camera edits and reset
- focused statistics-chart selection-inspector rendering with mirrored dimensions and normalized Plotly updates
- focused image selection-inspector rendering with preserved embedded metadata and dimensions
- focused basic-block settings plus child-aware diagram-router composition, leaving `SelectionInspector.tsx` as a small shell
- immediate browser-bridge unregister and pending-request release
- manual solution surface controls and solution validation
- structured multiple-choice answer keys: one shared choice list stores a zero-based `solutionAnswerIndex` and `markTicks`, renders only the selected label as a blue circle in Solutions mode, hides the answer in Student mode, and remains editable from the block or inspector; legacy solution-only copies remain compatible
- atomic legacy storage migration so concurrent startup requests cannot expose a half-copied tree or fail with a directory-copy race

Recent `App.tsx` extractions include:

- editor anchor action helpers
- editor block context helpers
- page break lifecycle helpers
- module lifecycle helpers
- question lifecycle helpers
- project document recovery helpers
- new-document plan builders
- logo-library and editor-storage hydration controllers
- front-matter logo action helpers
- question and question-boundary page-break drag controller/state
- nested subsection/editor-page-break drag controller/state, pure move actions, and shared drag DOM helpers
- stale-file autosave reconciliation and conflict workflow runtimes
- question/part/subpart content mutation action runtime
- question/part/subpart panel-render adapters and pure render plans
- editor context-command controller/runtime and global-delete composition
- question add/remove and question-boundary page-break lifecycle controller
- editor selection/reveal/open-signal ownership inside `useEditorNavigationController`
- active editor-surface, inspector, and paginated preview composition in `DocumentEditorWorkspace.tsx`
- manual solution-surface, validation/repair, and solution-slot composition in `useEditorManualSolutionController`

At this handoff, `App.tsx` is still large but should be treated as a composition shell being gradually reduced. Verify its current size with:

```bash
wc -l apps/web/src/App.tsx
```

## Near-Term Work Queue

1. Make external folder behaviour safer and more legible.
   - The active folder must be obvious.
   - Opening another folder must not silently copy/import unrelated files.
   - Recents should be clearly separate from the current folder listing.

2. Improve system status and session lifecycle.
   - Surface API path, web build, active folder, active file, revision, autosave, and browser bridge session state.
   - Preserve the shared explicit outcome model for recovery, reload, save-as-copy, and conflict choices.

3. Keep shrinking `App.tsx`.
   - Prefer pure helpers in `apps/web/src/lib`.
   - Prefer focused hooks in `apps/web/src/hooks`.
   - Question lifecycle, anchor navigation, open-document workspace rendering and binding, document navigation, overlays, header, and the complete selection-inspector shell are extracted; inspect current source and take only another coherent ownership boundary.
   - Add tests before or with every extraction.

4. Continue first-class manual solution editing.
   - Scoped question, part, and subpart status now makes missing, incomplete, mismatched-mark, and ready solution state visible in Solutions mode.
   - Hidden text and structured surface ticks are totalled recursively through columns, and quick repairs can insert or resize nested answer/solution blocks through the owning columns action.
   - Table entries, graph features, geometry2d primitives, vector2d elements, graph3d elements, Plotly statistics series, supported Penrose elements, selected choices, and paired whole-diagram copies now have direct paths; extend surface-specific answer completeness next.
   - Keep custom Penrose Substance and unsupported complex construction predicates on the paired solution-diagram path until they have a complete structured representation.
   - Keep AI solution drafting as optional assistant behaviour, not source of truth.

5. Strengthen agent contracts.
   - More high-level Mauth actions for common teacher/agent edits.
   - More validation for layout, solution coverage, and diagram issues.
   - More smoke tests for workflows that previously became stale or ambiguous.

6. Harden the standalone package.
   - Keep the Electron app as the normal macOS entry point and the fixed-port browser launcher as a debugging path.
   - Clean-machine-test the first updater-enabled Developer ID signed/notarized release, then verify an in-app update to the following alpha. Teacher-confirmed update and manual-DMG rollback policy, per-launch bridge authentication, and Hardened Runtime are implemented.
   - A Swift/macOS-native rewrite is not the next practical step unless deep Finder/print/iCloud/classroom integration becomes essential.

## First Commands For A New Model

```bash
git status --short --branch
git log --oneline -5
pnpm check:handoff:live
```

For authoring or runtime work, open `~/Applications/Mauth Studio.app` and run `pnpm agent:doctor`. For development-launcher work, also run `pnpm dev:status`. Do not assume the editor session, API process, or saved project file is current without checking status, snapshot, or file revision.
