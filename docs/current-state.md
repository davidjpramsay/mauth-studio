# Current State And Handoff

Last reviewed: 16 September 2026.

This is the resumable checkpoint for a new developer or model. Git, tests, and a fresh runtime check override this document if they disagree.

## Start Here

Read, in order:

1. `AGENTS.md`
2. this file
3. `docs/architecture.md`
4. the subsystem guide and focused tests relevant to the task

For assessment authoring, inspect the live document through the installed app's MCP tools. A repository checkout is not required.

### Documentation Ownership

| Topic                                                   | Owner                                              |
| ------------------------------------------------------- | -------------------------------------------------- |
| Agent rules and authoring conventions                   | `AGENTS.md`                                        |
| Current source/runtime checkpoint and next work         | `docs/current-state.md`                            |
| Runtime, state, rendering, and package boundaries       | `docs/architecture.md`                             |
| Files, folders, autosave, revisions, versions, recovery | `docs/storage.md`                                  |
| Installed-app agent setup                               | `docs/agent-local-setup.md`                        |
| HTTP/MCP bridge contract                                | `docs/agent-bridge.md`                             |
| Structured mutations                                    | `docs/mauth-actions.md`                            |
| Mauthdown format                                        | `docs/mauthdown.md`                                |
| AI authoring rules                                      | `docs/ai-brains.md` and `configs/ai-brains/*.json` |
| macOS signing and publication                           | `docs/macos-release.md`                            |
| Prioritised work                                        | `docs/todo.md`                                     |

### Project Snapshot At A Glance

- **Product:** local-first desktop mathematics assessment authoring, with optional external-agent authoring through the same structured action layer as the UI. macOS is the only distributed build today.
- **Current release:** signed and notarized Apple Silicon alpha `v0.1.5`; the public DMG, ZIP updater artifact, metadata, blockmap, release notes, and GitHub Pages download page are published.
- **Normal use:** open **Mauth Studio.app**. It owns its local FastAPI sidecar and needs no open Terminal window.
- **Startup:** the app shows a local loading state immediately, waits only on `/api/health`, then replaces it with the editor; the packaged Python sidecar is an onedir bundle and does not extract itself on every launch.
- **Development:** use `pnpm desktop:dev`; `pnpm macos:dev` remains an alias. React/CSS and API edits are watched, while Electron main-process and packaging edits require a restart.
- **Documents:** visible `.mauth` files live in the selected folder. Shared state and recovery live under `~/Library/Application Support/Mauth Studio/storage`.
- **Tabs:** several documents can be open with independent history, dirty state, revision, autosave, drag-to-reorder, Command-W close-first behavior, and explicit agent `documentId` targeting.
- **Agent setup:** **Help > Set Up Codex or Claude...** provides one-time client configuration for the connector bundled inside the app. No setup prompt or token copying is required.
- **Finder:** `.mauth` uses a dedicated portrait document icon with the large Mauth M and has a read-only native Spacebar Quick Look summary.
- **Solutions:** manual structured solution layers exist for text, choices, tables, graph functions/features, supported 2D/3D/Plotly/image/Penrose elements, and paired whole-diagram copies.
- **Current public limitation:** Apple Silicon only; Mauth remains alpha software.

## Immediate Worktree Checkpoint

```text
branch: CURRENT
baseline commit: HEAD
App.tsx: 1839 lines
SelectionInspector.tsx: 153 lines after the focused basic-block, diagram-router, renderer-specific settings extractions, explicit Solutions-mode binding, Investigation diagram selection support, pane-local responsive ownership, Content return action, and actionable empty state
worktree: clean at this checkpoint; includes native document commands, the bridge timeout recovery repair and earlier diagram-completion spacing rules; the installed app and public installer remain unchanged
```

### 16 September Native Document Commands

Desktop Open now uses the native multi-file picker and the existing Finder-open queue. File menu commands include New, Open Recent, Save, Save As, Show in Finder, folder backup/restore, and version history. The first save of an unsaved document uses the native save dialog. Save As resolves a destination without switching the global folder, checks its revision and content hash, retains previous versions, and retargets only the owning tab. Another open tab cannot be overwritten by Save As. Ordinary Save remains bound to the tab's own folder. Browser-only use retains the Files drawer. The installed app and public release have not been replaced by these source changes.

Verification: `pnpm check` passes (112 API, 707 web/action, 17 lifecycle, 11 Plotly, 72 launcher, and 3 Quick Look tests, plus formatting/lint/TypeScript/build). The new browser regression passes native-command routing, cancellation, open-tab overwrite refusal, Save As, and independent folder ownership. An isolated source Electron run with disposable folders also passes the real preload/IPC/menu integration and backend writes; native dialog responses were stubbed, so manual picker interaction, Open Recent presentation, and Finder reveal remain manual checks. Existing teacher documents and recovery are untouched.

### 15 September Bridge Timeout Recovery

During assessment PDF authoring, validation timed out and its late browser acknowledgement received `404 BRIDGE_TIMEOUT`. The API and storage remained healthy, but the editor loop treated the expired request as a missing route and stopped polling. The bridge now continues in the same session after that specific response, without replaying the handler or acknowledgement. Authentication failures and unknown missing routes still stop; a lost editor session still re-registers. The existing loop is extracted into the retry helper so deterministic tests exercise late acknowledgement followed by a successful request, session recovery, fatal failures, and cleanup. The regression fails with the previous fatal-timeout policy. `pnpm check` passes, including all ten focused retry/loop tests, 707 web/action tests, 104 API tests, TypeScript and the production build. The running dev editor loaded the change through HMR and `pnpm agent:doctor` passes. Native print-modal timing was not deliberately reproduced against the teacher document; the expired-response sequence is tested deterministically. No teacher documents are changed by the repair.

### 8 September Safety And Usability Repair

Follow-on reliability work includes bounded fail-closed printing with Retry/Cancel and Command/Ctrl-P, lazy renderer loading, extraction of shared expression/snapping helpers from `FunctionGraph`, a versioned MCP action resource and typed action envelopes, and optional question-scoped summaries. Seven print-page baselines and a compact error-dialog baseline cover Student/Solutions assessments and investigations. Tests export real PDFs and record non-gating first-graph, copy-switch, and edit timings for a 30-question fixture. The local bundle passed hardened verification and isolated native opening/recovery checks before the final print-overflow change. No new installer release or installation was performed.

### 8 September Print Scale And CI

The Year 12 Methods Test 4 Student PDF reproduced a roughly 79% print scale despite A4 paper and a 100% native print setting. A wide equation in the hidden Solutions replacement copy expanded the printable overflow bounds, causing Chromium to fit every page to that width. Hidden replacement copies now use `overflow: clip` while retaining their layout height; visible solutions and teacher answer spaces are unchanged. The browser regression compares the clipped page against the same page without the hidden copy, then proves that removing the clip recreates the overflow. An isolated export of the current unsaved draft retains all eight A4 pages at the intended scale, with the question heading restored from about 7.91 pt to 10 pt. All eight pages, including the logo, graph, and table, were rendered and visually checked. The original Desktop PDF is retained alongside a separately named corrected export. Automated native Save as PDF completion remains unverified after the native dialog left the dev editor unresponsive; the backed-up draft was not discarded or saved over the project file.

GitHub Check remains one Ubuntu job running the complete `pnpm check` gate. It now caches uv dependencies by `apps/api/uv.lock`, installs Python dependencies with `uv sync --locked`, cancels superseded checks on the same branch or pull request, uses read-only repository permissions, and has a 15-minute timeout. Two local policy tests protect those settings. No installer matrix or extra release workflow was added; the existing Pages publication remains unchanged.

- Finder opening validates the requested document and hidden project index before remembering its folder. Online-only metadata receives a specific `PROJECT_INDEX_ONLINE_ONLY` error with offline-folder guidance and Retry. Mauth does not force hydration through a potentially blocking filesystem read. Cold-start requests wait for recovery/tab hydration; successful requests add or activate a tab without replacing dirty recovery.
- Full project operations use process and local cross-process locks around revision checks, versions, and writes. Requests retain their owning folder identity, background refresh checks only the active file, and late reads/saves cannot replace another tab or newer edits. Backend moves preserve file ids and version history, retarget inactive tabs, and leave old-path tombstones; deleted open files remain drafts.
- Local draft and tab-session backups serialize writes and retry after temporary failures independently of cloud availability. Backup failures are visible even when the project file itself is saved. Files badges distinguish all open documents from the active tab.
- Cold recovery retains the newer active draft when its project lookup fails, using only the matching saved tab's folder identity. The browser regression includes a remembered-folder outage and an intentionally older tab snapshot; neither may replace the latest unsaved working.
- MCP lifecycle errors retain the original status, storage reason/action, and current open-tab context rather than showing a hidden dialog or reporting generic success. Authentication, revision protection, idempotency, and the existing 16-tool contract remain unchanged.
- Packaged cold-start opening flushes queued file requests after Electron stops loading; `did-finish-load` alone can still report a loading main frame and strand the request. Targeted MCP reads and mutations wait for bounded editor settlement after tab activation, then use callbacks from the committed render. Immediate recovered-draft snapshots now align file and tab dirty state without changing saved-file revision preconditions.
- New Document uses compact template choices and neutral subject/title defaults. Shared dialogs have bounded scrolling, focus trapping, Escape, and focus restoration; Escape on a context menu does not also close its parent drawer. Existing tab smoke fixtures were updated for the current preload events, Content/Settings tabs, and logo listbox.
- The fixed-port development runtime was stopped, then restarted and verified healthy at `http://localhost:5173/`. Tests use disposable storage roots; teacher assessment files and recovery data were not edited to make the tests pass.
- Production dependency audit is clean after focused patches to ws, immutable, js-yaml, and xmldom. `FunctionGraph` is now 3682 lines after the focused expression/snapping extraction; further renderer decomposition remains incremental work. The production entry bundle fell from about 1310 kB to 1212 kB, and blank documents do not fetch the roughly 976 kB JSXGraph engine. MathJax remains eager. Local timing samples are non-gating and do not establish a general percentage speedup.

Cloud failures are simulated in automated browser tests and exercised through the real backend placeholder guard in Python tests. The rebuilt bundle passed cold file-argument opening and genuine running-instance macOS open-file events with disposable documents, a simulated unavailable index, Retry, four retained tabs, dirty recovery, and the bundled MCP connector. These checks do not certify Google Drive's actual download service, native quit prompts, or signed in-app updates. The installed/public app remains unchanged at `0.1.5`; the tested bundle under `release/mac-arm64` is a local development checkpoint, not a published installer update.

Observed runtime through 2 September 2026:

- native `statsChart` normal and density diagrams now store deterministic under-curve `regions` for between, left-tail, right-tail, and outside shading. Each region has stable bounds, colour, opacity, visibility, and solution-only state; the renderer interpolates exact boundary points, fills to the axis without boundary strokes, keeps the distribution curve above the fill, and exposes focused `diagram.settings.update` upsert/update/delete actions. Normal charts use renderer-owned major ticks, short outward tick marks on both axes, and a default domain of mean plus or minus 3.2 standard deviations, while larger Plotly margins and an 8 px source-space clip allowance protect ticks, axes, and curve tails during preview and print scaling. The isolated `1540 x 1100` browser smoke measured the exact labels `55, 60, 65, 70, 75, 80`, six native 5 px tick marks on each axis, 10.41 px tick-label clearance, 16 px total clip expansion in both directions, no console warnings or errors, solution-only shading, and an unshaded Student copy. `pnpm check` passed 89 API tests, 693 web/action tests, 11 Plotly tests, 64 launcher/runtime tests, Quick Look tests, lint, formatting, TypeScript, and the production web build. A hardened local app rebuild/install passed connector doctor, then the live Year 12 Methods Test 4 graph was converted through MCP preview/apply at saved revision 10; validation checked 20 items across 7 questions with zero errors or warnings, and installed Student/Solutions render checks confirmed unclipped tails, native axis numbering, and the shaded interval `63<X<78`.
- on 2 September the real Application Support recovery state reproduced a tab header for an empty Year 10 starter while its saved Year 11 path and document body were detached. A protected backup was taken before repair. The source desktop app then restored Year 11 Methods Test 3 at revision 2 with all 8 questions, rendered its preview, passed the local bridge doctor, and rewrote both `current-test.json` and `open-documents.json` with the correct active path and document. Focused tests cover disk-over-browser precedence, unavailable cloud-file recovery, browser-only API fallback, active-tab restoration, and saved-tab id collisions;
- a fresh locally installed `0.1.5` development checkpoint on 31 August created its loading window 148 ms after launch began, presented it at 245 ms, reported API health at 699 ms, and completed editor navigation at 835 ms after launch began (about 327 ms to presentation and 917 ms to the editor from packaged process startup). The previous packaged cold launches recorded roughly 4.4-7.6 seconds. `pnpm agent:doctor` passed API health, web, bridge discovery, and active snapshot; the complete connector smoke reached the app but its document-list operation was correctly blocked by the teacher's currently unavailable selected folder with `503 STORAGE_UNAVAILABLE`, so no folder or document state was changed.
- the locally installed `Mauth Studio.app` was rebuilt and opened with its packaged FastAPI sidecar on a dynamic loopback port;
- the packaged MCP connector exposed all 16 local-only tools and returned a live snapshot;
- one unchanged connector process followed the installed app across a quit/relaunch from one dynamic API port to another, proving that per-request runtime rediscovery works;
- a 45-mark Year 10 measurement test was edited through the packaged MCP connector, saved cleanly at revision 13, validated with 21 checked items and no errors or warnings, and render-checked in Student mode; its sphere now uses the light `surface` presentation rather than an ambiguous flat outline alone;
- the installed app was explicitly quit and relaunched after the local bundle update, after which the packaged connector preserved the new dimension display fields and saved the clean revision through the live bridge;
- the installed app was rebuilt and reinstalled again after the draggable-label change. The packaged connector doctor passed every check, and an MCP-only dry run accepted `labelScreenOffsetPx: [12,-6]` on an existing dimension with zero validation warnings while the following live snapshot confirmed the teacher file remained clean and unchanged;
- the packaged connector opened the saved measurement test and returned its follow-up snapshot while the installed Electron window was in the background. Lifecycle acknowledgement now has a bounded timer fallback when macOS suspends animation frames, so the request completed in about three seconds instead of expiring the bridge session;
- the source browser check showed seven measurement `graph3d` diagrams with axes and helper labels hidden, values placed beside existing solid edges, and dashed unticked guides only for radii, diameters, central axes, or perpendicular heights. An in-app Browser pass dragged one dimension label to a persisted `[40,-25]` screen offset without changing the camera, then double-clicked it back to automatic placement with no browser errors or warnings. The dedicated graph3d render smoke independently saved `[36,-22]`, retained it through camera rotation, exercised deliberately rectangular prism, cylinder, and sphere boxes with both board screen scale and normalized x/y/z span ratios at `1.000000`, and showed no visible cylinder or sphere post-release snap. The source Files drawer still emits the pre-existing duplicate React-key error when one indexed path is listed twice.
- JSXGraph's `polygon3d` constructor marks generated face polygons as draggable even when Mauth uses them only as authored display geometry. Mauth now fixes and explicitly disables dragging across each face, generated 2D polygon, border, and hidden vertex while retaining camera rotation and independently draggable labels. The graph3d render smoke drags directly across a face and checks that the rendered geometry does not snap after release.
- Cone and spherical-cap outlines now join their two camera-facing generators into one continuous projected path at the shared apex/tip, preventing a small open seam at the bottom of an outline hemisphere. Spherical caps clip the true camera-facing sphere silhouette to the authored cap, and exact outline cone/cap joins share one cut-circle seam so hidden hemisphere curves cannot cross through the cone during rotation. Surface-mode cones and spherical caps use depth-ordered shaded `polyhedron3d` faces rather than JSXGraph's curve-only parametric mesh; exact joined components omit both internal base faces and retain one shared seam, so the composite reads as a true 3D solid. The graph3d smoke requires more than 100 generated surface faces for that fixture rather than accepting any collection of SVG strokes. The 3D Settings surface also separates **Object size (%)** from frame width/height: `metadata.view3d.zoom` changes geometry size inside the fixed frame while preserving the 1:1 projection. New and unspecified views default to 130%, explicit document overrides remain intact, and the internal 3D viewport uses a smaller centred inset so its baseline frame padding is restrained and even rather than bottom-heavy.
- Exact surface-mode cone/spherical-cap joins now render as one opaque `polyhedron3d` mesh whose two components use the same seam vertex indices rather than merely coincident duplicate rings. Every generated face is wound outwards, both internal base faces are omitted, and one camera-live convex silhouette is derived from the complete projected mesh. Independent cone generators and cap profile curves are suppressed for the joined surface because JSXGraph curve overlays do not take part in the polyhedron's hidden-line removal and previously crossed the wrong component at steep camera angles. The graph3d smoke rejects joins with more than one surface group, requires exactly one composite silhouette, and visually verifies the normal, rotated, and steep saved camera angles;
- Joined cone/spherical-cap composites now draw their internal shared cut-circle exactly once as a fully closed dashed seam. The circle sampler deliberately overlaps its projected start/end stroke so a subpixel cap gap cannot reappear after camera rotation; the graph3d smoke checks seam count, dash styling, and a subpixel closure tolerance at normal, rotated, and steep views;
- source Browser and freshly installed-app Playwright passes at `1800 x 1000` verified page-width zoom against the Year 10 test surface: the A4 page grew from about `794 px` to `1676 px`, leaving about `36 px` at each Preview-pane edge. The same width-derived maximum now remains available when the Editor or Inspector is open, can use the complete Preview content width inside the pane's existing 16 px inset, and automatically follows the pane as those tools resize it. Source Browser inspection confirmed the Editor/Inspector/Preview layout rendered with a `780 px` Preview pane and no framework overlay, error, or warning; the direct packaged-runtime browser check showed only the expected `401` responses from loading an authenticated standalone runtime outside Electron.
- a source Browser pass at `1800 x 1000` verified that the wide Editor now uses its full `635 px` grid column with a `12 px` inset instead of centring a capped `48rem` surface and leaving unused side bands. At the `1280 x 720` compact breakpoint, the same inset remained, Editor/Inspector switching stayed intact, and the keyboard resize separator moved the authoring dock from `448 px` to `464 px`.
- source Browser passes reproduced the Inspector toolbar button changing pressed state without revealing anything when no inspectable block was selected. After the fix, wide mode immediately reserved the Inspector column and showed the actionable empty state; selecting a text block replaced it with the real block controls. At `1280 x 720`, compact Editor/Inspector tabs switched, hid, and reopened predictably with no browser warnings or errors. The rebuilt installed app then exercised the macOS `did-finish-load` presentation fallback, restored the clean Year 10 measurement test, exposed the same empty Inspector pane, passed every connector-doctor check, and passed the bundled 16-tool MCP smoke with a live snapshot.
- after the packaged-renderer API authentication change, the source Electron shell launched on separate dynamic API/web ports, hydrated one active editor session, passed every `pnpm agent:doctor` check, and passed the bundled connector smoke with all 16 tools plus a live snapshot. The same source was rebuilt into a hardened arm64 app and installed locally. macOS locked before the final installed-window folder-access UI could be inspected, so that last visual check remains distinct from the successful desktop-shell bridge check.
- the live Year 10 measurement test was cleaned through a revision-safe MCP batch at revision 27: all eight ordinary shared stems moved into Question wording, all eight redundant leading text modules were deleted, Question 8 retained its diagram and final **End of Test** marker, the document remained clean at 45 marks, and validation checked all 8 questions plus 21 solution items with no errors or warnings. A dry run that deliberately recreated the old Question 4 pattern returned the new `redundant-leading-text-stem` warning without changing the file. The source Electron Browser then confirmed that Question wording renders directly in the preview without creating a text block and produced no console errors or warnings.
- the installed app accepted a revision-safe MCP dry run and save of the Year 10 Measurement formula sheet at clean revision 37 with all 21 solution items checked and no errors or warnings. The rebuilt installed app rendered title page, formula sheet, and eight Student question pages as ten A4 frames. Its generated Student PDF is ten A4 pages with every question on one page; a render check caught and then removed an initial conversion-block spill onto Question 1. The final formula page contains all ten sections, including volume and capacity conversions, without clipping. The Solutions preview and 12-page PDF retain the same formula sheet and render Questions 3 and 7 across two pages because of their full worked solutions and diagrams, with no clipped content.
- the title-page logo selector no longer relies on Chromium's native macOS option popup, whose independently drawn check gutter could not share the web-font baseline. The focused Mauth listbox uses Inter, fixed 40 px rows, a centred 20 px check gutter, mouse selection, outside-click dismissal, and Arrow, Home/End, Enter/Space, Escape, and Tab keyboard behavior. Source Browser verification selected Cornerstone by keyboard, restored Australian Christian College by pointer, and reported no console warnings or errors.
- the 3D Inspector now labels its independent pixel dimensions **Frame width** and **Frame height**, followed by the explicit note that they change only the frame while horizontal and vertical 3D scale stays 1:1. A temporary source Browser document confirmed that changing width from `420` to `500` retained height `320` and azimuth `1`; the direct browser profile produced only the expected authenticated-runtime `401` responses. The diagram brain and authoring docs now state that 1:1 is an equal-scale rule, not a square-frame rule.
- `geometry2d` point, segment, arc, and angle labels now use their existing `labelX`/`labelY` fields as live drag positions instead of rendering as fixed text. A targeted unit test proved that a drag update changes only the requested primitive, and the full editor/Inspector smoke found the draggable targets, dragged a segment label, observed the Inspector coordinates change, and completed with no console or page errors. The teacher's active measurement test was not mutated for this source-level verification.

Runtime and folder facts are transient. Recheck them before authoring or debugging.

### Model Transition Readiness

- Entry-point docs now separate three concerns: install the app, optionally connect an agent, or develop the app.
- The public site links directly to the signed DMG and no longer asks users to paste a large setup/development prompt.
- `README.md` is the concise public/repository overview; detailed contracts remain in their owning documents.
- Historical implementation detail lives in Git history and `docs/releases/`, not in this handoff.
- The handoff checker still validates required files, headings, scripts, links, verification counts, source sizes, and clean/dirty checkpoint state.

### Active Development Goal

The standalone foundation, multi-document session, manual solution layers, native Finder integration, updater, bundled connector, and guarded release pipeline are implemented.

Desktop portability groundwork is now explicit without claiming unsupported releases. Runtime-manifest discovery follows the host application-data convention, development Python paths account for Windows virtual environments, Vite runs through Electron's Node mode instead of a Unix `.bin` shim, packaged helper names are platform-aware, and standalone folder selection uses Electron's native directory dialog through narrow preload IPC. These seams have local macOS tests for macOS, Windows, and Linux plans and do not consume hosted CI minutes. macOS remains the only packaged and supported distribution: Windows still needs a native FastAPI sidecar, MCP launcher, installer, signing/update plan, and real-machine QA; Linux remains demand-driven. Quick Look, Finder registration, signing, notarization, and mac updater metadata stay macOS-only adapters.

Packaged startup no longer waits on the system-status route before creating a window. Electron starts the FastAPI child, presents a dependency-free local loading page, polls only `/api/health`, establishes the authenticated runtime manifest and desktop IPC, and then navigates that same window to the editor. Document-open requests remain queued until the editor origin is ready. The macOS Python service is built as a PyInstaller onedir directory with a nested executable, and app verification checks that executable's presence, permissions, arm64 architecture, and startup help path.

Startup recovery treats Application Support disk state as authoritative whenever it loads successfully. Dynamic localhost browser storage is an emergency fallback only and cannot replace a disk document from an older port. If a cloud project file is temporarily unavailable, Mauth still opens the disk recovery draft and keeps disk autosave paused rather than presenting an empty editor or overwriting the draft. If only the tab session survives, its active structured document is restored into the editor; a mismatched draft cannot take over a saved tab's identity.

Printable question and solution text now use one slightly more generous shared line rhythm, with a small prompt-to-solution gap, so display-size inline fractions on adjacent lines do not touch. Paired student-space/solution replacement rows receive the same gap as standalone solution rows, regardless of which hidden block appears first. This is renderer-level behaviour: existing documents gain it without stored-file migration, although tightly packed pages may reflow slightly.

Finder now uses a dedicated portrait Mauth document icon with a folded page corner and a large centred M. The generated thumbnail provider remains removed because macOS applies inconsistent framing to third-party thumbnails. The richer read-only metadata remains available through the sandboxed Spacebar Quick Look preview. The exported Mauth document type conforms to `public.data` rather than generic `public.json`, preventing macOS from intermittently replacing the Mauth artwork with its built-in JSON text thumbnail.

Current work should improve teacher-facing authoring reliability and ergonomics through existing contracts. Do not introduce another document store, mutation path, preview engine, validation system, or provider-backed chat state.

Ordinary test, exam, and worksheet stems now have one structured owner: `question.text`, `part.text`, or `subpart.text`, exposed to teachers as the matching wording field. The agent action descriptions, Mauthdown and action docs, Question brain, human operating guide, editor checks, and live MCP validation all reinforce that path. A blank Question wording field followed by a leading shared text block raises `redundant-leading-text-stem`; deliberately ordered prose, student/solution-specific content, the final **End of Test** marker, and Math Notes retain normal text blocks.

The authoring workspace has completed a broad clarity pass around an explicit **Content** and **Settings** split. Content owns wording, mathematical definitions, coordinates, values, ordered structure, and add/remove/reorder actions. Settings owns presentation and behavior for the selected block or diagram element. Responsive behavior follows the actual authoring-workspace width rather than the monitor width: wide workspaces retain Content, Settings, and Preview; compact workspaces use one resizable 384-520 px Content/Settings dock beside the Preview; and workspaces below 840 px use that dock as a bounded overlay. The wide Content surface uses its allocated column with a compact consistent inset rather than centring a capped inner surface and wasting width on both sides. Compact Content and Settings tabs make the active tool explicit, and each configurable answer space, choice list, table, columns block, diagram, 2D graph child, and 3D graph child has a settings button that selects it and opens Settings. Before a real selection exists, an actionable empty state explains what can be configured. Pane-local container queries stack dense grids before labels or inputs can overflow; the cleanup does not rely on globally shrinking typography. In 3D diagrams, point identity/label/coordinates and segment/dimension endpoints remain in Content while colour, visibility, solution-only state, line style, dimension display, solid style, and label-position resets live in Settings. Renderer type changes remain isolated behind an explicit destructive-change warning. Manual solution actions use one consistent **Create solution copy** or in-place answer label. The 2D graph Settings surface separates axes, view window, and scale/grid controls, and all authoring number fields use the same clear-and-retype, exact-expression input with 10 px dimension steppers. Question labels are static identifiers with a separate preview-jump command. Investigation student pages, text sections, and rubric criteria are independently collapsible. Drag handles support `Alt+Up` and `Alt+Down`, while Add menus support standard arrow, Home/End, submenu, and Escape navigation. Preview zoom can grow an A4 page to almost the full usable width of the remaining Preview pane in page-only, Content, and Settings layouts, with a small left/right gutter.

The document rail uses a flat selected-tab treatment: a restrained neutral fill and fine border identify the active document without a bright blue outline or inset shadow. Inactive tabs remain transparent until hover, while dirty/save status dots and drag-reorder indicators retain their existing semantics.

Top-level question surfaces are intentionally unframed. The editor pane already establishes the workspace boundary, while borders remain on wording fields, parts, modules, and real controls where they communicate editable structure. This avoids a redundant outer card around nested content without changing the existing editor type scale.

The browser agent bridge now distinguishes stale or incompatible APIs from temporary outages. Missing register routes and authentication/permission failures stop the browser loop instead of producing repeated 404/401/403 traffic. Lost sessions still register again, and transient network failures use bounded exponential backoff. Mutation operations use a longer bounded bridge timeout than reads so a normal document create/open/apply does not fail at 20 seconds while the browser later completes it.

Packaged renderer API authentication no longer depends on an Electron URL filter containing the app's dynamic port. The session hook examines every request but injects the private token only for an `/api/` path on the exact current app or API origin. The exact-origin predicate has focused desktop tests for accepted app/API requests and rejected non-API, unrelated-loopback, and external requests.

The local bridge and bundled MCP connector now expose the complete document lifecycle needed for agent-first authoring: list the selected folder, create a saved document from a Mauth template, open a saved document in a tab, and close a tab under an explicit `require-clean`, `save`, or `discard` policy. Paths are relative to the selected documents folder and traversal-safe. Create and close carry idempotency keys; creation uses the same template factory, serializer, project-file API, revision metadata, and saved-tab applier as the human UI. The default close policy refuses dirty work rather than displaying an agent-invisible browser dialog or discarding edits. MCP publishes 16 local-only tools with explicit object output schemas, compatible JSON text plus `structuredContent`, truthful error results, and read/write/destructive annotations. The connector now resolves the private runtime manifest for every request and retries once only when that manifest changes during a failed or unauthorised call, so the same client process survives an app relaunch or token rotation without exposing the token. Snapshot mark totals now recurse through question parts and subparts instead of reporting only question-level marks.

Document tabs can now be dragged horizontally to reorder them. The active tab remains active, each tab's document/history/save state remains intact, and the reordered array is reused by the overflow menu, open-tab recovery, and agent `openDocuments` snapshot.

Coordinate graph number labels now use one MathJax SVG path rather than JSXGraph's plain-text tick labels. Automatic numbers are anchored to the exact major-grid coordinates, y values remain on the left by default, and `showXAxisNumbers`/`showYAxisNumbers` allow one automatic numeric axis to remain visible when the other axis uses custom symbolic ticks. The legacy `showAxisNumbers` field remains the shared fallback. The Year 11 combined test uses this path for Question 4(c), retaining its symbolic x labels while replacing manually offset y-number label features.

Automatic graph tick labels now convert renderer-owned pixel corrections to board coordinates before creating standalone MathJax HTML text; JSXGraph's `offset` field applies to attached labels but was silently ignored for these text objects. The automatic board bounds also reserve a capped 34 px source-space margin when axis numbers or letters need it, preventing the corrected HTML labels from extending into the graph container's clipped overflow. Fresh Browser measurements on an isolated copy of Year 11 Methods Test 3 show about 8.8 px clearance to the y-axis, 8.1 px below the x-axis, and 2.1 px of remaining bottom-edge clearance around the x numbers at the 55% print preview scale, compared with 0 px at the y-axis before the correction and clipped x numbers before the edge-padding refinement. The same placement path is used by graph2d and vector2d. This is a presentation-only source change; graph scales, coordinates, and authored diagram data remain unchanged.

School measurement `graph3d` diagrams now default to a textbook-object presentation when they contain solids or hidden construction geometry: coordinate axes and helper labels are omitted unless explicitly requested, cylinders and cones use only their camera-facing silhouette generators, and spheres use a camera-facing silhouette. Those camera-dependent curves and screen-offset labels are explicitly resampled during every board update, so the visible solid remains correct while a pointer drag is still in progress rather than snapping to a rebuilt shape after release. Cone and spherical-cap generator pairs use one continuous path at their shared apex/tip, so an outline hemisphere cannot show an open lower seam. Spherical-cap outlines are clipped from the true camera-facing sphere silhouette, and exact cone/cap joins are composed with one shared seam rather than duplicated independent outlines. Every graph3d board keeps a 1:1 horizontal/vertical screen scale, and the renderer expands each authored x/y/z range about its existing centre to one equal-span cube before projection. This does not require a square frame: the Settings pane's independent **Frame width** and **Frame height** controls provide rectangular page-composition space, and their spare area becomes whitespace instead of stretching the geometry. **Object size (%)** stores `metadata.view3d.zoom` and changes the geometry size inside that fixed frame without distorting the equal scale. Spheres expose `surface`, `wireframe`, and `outline` presentation styles: `outline` provides the clean circle-and-radius convention, while `surface` adds a restrained pale fill and projected great-circle cues to communicate volume without clutter. A dimension with `display: "label"` places only its black value beside an existing solid edge; `display: "guide"` draws one dashed unticked construction line for a radius, diameter, central axis, or perpendicular height. Both modes recompute a screen-space `labelOffsetPx` as the object rotates. Every authored point, segment, face, and dimension label is independently draggable; its projected geometry remains the anchor while an optional element-level `labelScreenOffsetPx: [dx,dy]` persists the teacher's adjustment across camera rotation. Double-click and the editor's **Reset label** control clear the field, while `diagram.settings.update` accepts `null` for the same reset. The old ticked `display: "bracket"` path remains the compatibility fallback for documents that omit the field and for deliberately fixed views. JSXGraph `View3D` uses parallel projection with native depth ordering enabled. The structured settings action, editor, schema, validator, renderer smoke, diagram brain, and authoring docs share this contract. Authoring rules still require a clearly readable extrusion direction for prisms. Because a sphere's orthographic silhouette is mathematically circular from every viewing direction, communicate its three-dimensionality with restrained surface cues rather than distorting that outline.

Standalone diagram selection now keeps the full-width row only as the alignment surface and places the active dashed selection outline on the shrink-wrapped rendered diagram. Right-aligned diagrams therefore retain their page position without appearing to own an empty full-width box. A `graph3d` dimension may store `rightAngleWith` plus an optional `rightAngleSize`: plain ids target connected dimensions, while `face:<face-id>` targets a face met perpendicularly at a dimension endpoint. Content offers only geometrically valid targets, and the renderer derives the camera-aware perpendicular square from the linked guides or the actual face plane. At a face vertex, the marker's on-face arm follows the internal corner bisector and is drawn explicitly inside the face instead of reusing the nearest boundary edge. The graph3d smoke covers the joined cone-and-hemisphere measurement solid plus normal, saved-rotated, and interactively rotated square-pyramid face targets; connected-dimension markers retain two added sides while line-to-face markers retain all three explicit sides through rotation. The live Year 10 Measurement test retains the structured `height`/`radius` relation at revision 30 and links Question 7's `height` guide to `face:base` at saved revision 35, with zero validation errors or warnings.

The perpendicular relationship is explicit and discoverable in Content: one top-level 3D **Annotations** section follows **Dimensions**, identifies each owning dimension, and offers only connected dimensions or compatible faces under **Perpendicular to**. The relationship is no longer buried inside every dimension card or duplicated in Settings. Teacher-facing diagram terminology consistently groups marks added to existing geometry under **Annotations**: coordinate-graph angle marks and free labels share that group, `geometry2d` equal-length/equal-angle/right-angle decorations appear there with human-readable names, vector and image diagrams retain their existing Annotations surfaces, and 3D perpendicular marks use the same top-level category. Renderer-specific saved keys remain unchanged for document compatibility.

Print now derives physical `@page` margins and the printable content box from the active document's stored A4 padding. This keeps PDF line wrapping identical to the visible preview for compact investigations, worksheets, and notes instead of forcing the older 76 px test margin and creating print-only overflow pages.

Standard-test and investigation title pages now render the student Name/Result row at the same compact font size as that template's assessment subtitle. This is shared renderer styling, so existing documents inherit it without a stored-file migration.

Standard tests now support one optional structured `frontMatter.formulaSheet` page. The mini TOC exposes an enabled sheet as a fixed **F** item immediately after the opening **T**, while conditional **F+** creates and selects it. **F** owns a dedicated Content editor and preview anchor; the Title editor retains only the inclusion status, and the sheet cannot be dragged among questions. The renderer places its unnumbered two-column A4 page immediately after the opening title page in Student and Solutions copies, includes it in physical page-number calculations, and prints it through the same A4 preview path without changing marks or question numbering.

A source Browser pass at `1280 x 720` used the Year 10 Measurement document to exercise **F+**, dedicated Content selection from a previously active Settings tab, editable heading/body fields, live MathJax preview, selected and non-draggable **F**, expanded-navigator order, Remove, and Undo restoration. The formula page retained the stable `formula-sheet` preview anchor, and the browser console reported no errors or warnings.

Investigation general marking guidance now keeps its explanatory copy at an explicit compact print size beneath the criterion headings. This prevents utility-class inheritance from making the guidance larger than its heading and preserves a comfortable bottom margin on dense student briefs.

Standard school tests now treat a final question-level `**End of Test**` text block as a dedicated print marker. Student and Solutions previews centre it at the bottom of the final question page without filler Space blocks or stored positioning data; existing tests inherit the placement once their marker uses that wording.

Investigation briefs now use structured `studentPages`, each with stable ordered text sections, while diagrams target pages by `pageId`. The first page keeps the shared title identity and Name/Result row; any number of later pages repeat compact assessment context only, and general marking guidance remains on the final student page. The narrow mini TOC is grouped into **T** investigation identity, one **P** per student page, and **R** rubric; text sections and diagrams stay nested under their page in the collapsible full navigator. **P+** creates a student page. The rubric always exists, so **R** turns on Teacher mode, opens its editor, and jumps the preview to the rubric, where criteria and their performance levels or mark allocations are added, reordered, and removed. Text sections are added from the selected page editor. Legacy two-page task fields remain readable and are mirrored during edits so existing investigation files continue to open correctly.

Investigation diagrams now use the same selected-module Inspector path as Test diagrams. Selecting a diagram or one of its graph children opens the shared renderer controls, and Inspector changes write back through `frontMatter.investigation.diagrams` without exposing solution-surface controls. Tangent, perpendicular, angle, shortest-distance, and circle constructions should use `equalScale: true` with bounds and pixel dimensions chosen together so the visible geometry remains both truthful and readable.

### Exact Resume Point

Choose the first item relevant to the next request:

1. Clean-Mac verify the public `0.1.5` DMG, Finder/Quick Look behavior, tab recovery, bundled connector setup, and an in-app update from `0.1.4`.
2. Improve the next concrete manual-solution editing or completeness gap using structured solution data and focused tests.
3. Add conservative measured-preview layout checks or repair actions without turning intentional answer spaces into generic automatic filler.
4. Continue reducing `App.tsx` only at a coherent ownership boundary; existing persistence, Files, bridge, preview, navigation, header, overlay, drag, lifecycle, and inspector owners must not be duplicated.
5. Recheck cloud-backed selected-folder behavior before changing teacher files. Preserve drafts through `STORAGE_UNAVAILABLE`; never reset or silently switch folders to make status appear healthy.

### New Model Safety Check

Before editing:

1. Run `git status --short --branch`, `git log --oneline -5`, and `pnpm dev:status`.
2. Preserve all user changes and untracked work.
3. For authoring, run `pnpm agent:doctor`, inspect `openDocuments`, and target the intended `documentId`.
4. Treat unavailable cloud files as an external storage state, not permission to migrate, import, overwrite, or switch folders.
5. Use focused tests while iterating and `pnpm check` before handoff.
6. Use `pnpm check:handoff:live` only after this volatile checkpoint matches the final Git state.

## Product Direction

Mauth is a teacher-controlled local app with an agent-friendly structured control plane:

```text
explicit document state
-> deterministic dry-run actions
-> revision-safe apply
-> validation and rendered evidence
-> teacher review
```

The app must remain useful without AI. Codex, Claude, and future assistants should use the same bridge and action contracts rather than hidden file edits or a second in-app document model.

## Runtime Model

- **Installed app:** packaged Electron renderer and FastAPI sidecar on dynamic loopback ports; app launch/quit owns both processes.
- **Source development:** `pnpm desktop:dev` owns watched Vite and Uvicorn processes plus the Electron shell; `pnpm macos:dev` is a compatibility alias.
- **Low-level diagnostics:** `pnpm dev:api`, `pnpm dev:web`, and the fixed-port launcher are debugging paths only.
- **Discovery:** both desktop modes publish API/web URLs and a random per-launch token in a private runtime manifest under the host application-data directory. The connector discovers it automatically.
- **Updates:** signed releases use teacher-confirmed download and restart through the public GitHub alpha channel.

Useful commands:

```bash
open ~/Applications/Mauth\ Studio.app
pnpm macos:dev
pnpm dev:status
pnpm agent:doctor
```

## Storage Model

```text
selected documents folder/
  visible .mauth files
  .mauth/ project metadata and versions

platform application-data/Mauth Studio/
  storage/ shared state, autosave, open-tab recovery, logos, folder identity
  runtime.json private runtime discovery
  desktop.log
```

The currently distributed macOS build resolves that application-data location to `~/Library/Application Support/Mauth Studio`.

Autosave is recovery state, not a saved file. Browser localStorage is fallback cache. Direct edits to visible documents, `.mauth` metadata, or Application Support state are recovery/migration tools, not normal authoring.

External File Provider folders can disappear or contain dataless placeholders. Status must remain lightweight, file routes should return `503 STORAGE_UNAVAILABLE` promptly, and background sync must preserve the editor draft until the active file is confirmed current or deliberately reloaded.

## Agent Editing Contract

```text
mauth_documents_list
mauth_document_create
mauth_document_open
mauth_document_close
mauth_snapshot
mauth_actions_preview
mauth_actions_apply
mauth_validation_run
rendered Student and Solutions/Teacher verification
```

Use the latest `baseSnapshotId`, preserve idempotency, and use `documentId` when several tabs are open. Comments and suggestions are review state only. Successful actions pass through editor history, autosave, validation, and revision-aware save logic.

## Manual Solutions Direction

The source of truth is a teacher-editable structured solution layer:

```text
AI drafts -> teacher edits -> structured solution data -> preview/print
```

- Put answers where students would write them: shared table cells, selected choices, graph features, annotations, ticks, or worked lines.
- Colour only solution content blue, not the shared surface.
- Keep solution-only elements hidden from Student mode and editable in Solutions mode.
- Prefer one worked step or conclusion per line and place each mark tick on the line/surface that earns it.
- Keep ruled lines optional and off by default in solution slots.
- Use paired solution diagrams only when the whole surface genuinely differs or a structured element layer cannot represent the answer.

## Current Architecture Shape

- `apps/api`: maths, storage, diagnostics, project files, and bridge services.
- `desktop`: platform-neutral Electron process/runtime/dialog boundaries plus explicit platform packaging adapters.
- `apps/web`: editor composition, action history, preview, files, validation, and print.
- `packages/question-engine`: question generation only.
- `packages/marking-engine`: marking only.
- `packages/formatting-engine`: formatting only.
- `packages/diagram-penrose`, `packages/diagram-plotly`, and JSXGraph rendering remain separate systems.
- `apps/web/src/App.tsx` is a composition shell; extract coherent owners instead of adding unrelated state to it.

## Current Verification Baseline

Latest full gate on 16 September 2026:

```text
formatting and lint: passed
API: 112 passed
web/actions: 707 passed
document lifecycle: 17 passed
Plotly: 11 passed
launcher: 72 passed (desktop, connector, and CI contract)
native Quick Look: 3 passed
TypeScript and Vite production build: passed
```

Isolated document-opening, document-tabs, and Files browser checks passed. The opening check covers cold and running Finder-style events, an unavailable remembered folder, dirty recovery, retry into separate tabs, and temporary backup failure. Compact dialogs were keyboard-checked at 800 x 600 and the Files drawer at 1280 x 720. Seven visual tests pass against eight inspected baselines, including hidden-solution overflow and delayed and failed Penrose/image rendering; actual Student/Solutions PDFs retain the expected 2/2 assessment and 1/2 investigation A4 pages. The existing 3D render smoke passes camera, geometry, label, and pixel checks. The local bundle also passes signing verification and native opening/MCP/recovery smoke checks with an isolated profile. The production dependency audit reports no known vulnerabilities. Actual Google Drive hydration, real native quit confirmation, native print-dialog cancellation/reopening, and signed in-app updates remain separate manual checks.

Main gate:

```bash
pnpm check
```

Documentation transition checks:

```bash
pnpm check:handoff
pnpm check:handoff:live
```

Run visual smoke tests when changing rendered behavior; tests alone do not prove printable layout.

## Recent Development State

The published `0.1.3` slice added native `.mauth` Finder presentation, sharper preview scaling, multi-document tabs and recovery, explicit agent document targeting, compact/native menu controls, System Status contrast repair, reusable-logo reconciliation, and ZIP-only updater metadata. The subsequent documentation slice removed the obsolete website setup prompt, made MCP explicitly optional, linked directly to the DMG, and aligned repository agent entry points. Current authoring rules also require full display-size fractions unless compact notation is deliberately requested.

Release `0.1.4` adds `mauth_documents_list`, `mauth_document_create`, `mauth_document_open`, and guarded `mauth_document_close` to the bundled connector. Lifecycle requests use the authenticated browser bridge and existing project/tab/revision systems instead of direct file edits. The connector returns schema-valid structured results for every tool, marks unsuccessful HTTP results as MCP errors, and exposes local-only behavioural annotations. Focused API, web, connector-contract, and isolated live stdio lifecycle tests pass.

Release `0.1.4` fixes asynchronous Plotly charts disappearing from browser print/PDF output. Statistical charts expose an explicit loading, ready, or error state; the print controller waits for all chart surfaces, document fonts, and two settled layout frames before opening the print dialog, with stale-request suppression and a fail-open timeout. Focused readiness tests cover pending, ready, error, settled-frame, and timeout behavior. A fresh 11-page A4 print of the Year 12 logarithms and continuous-random-variables test showed both the Question 6 histogram and Question 8 density graph.

Part and subpart editor panels now activate their structural anchor on pointer or keyboard focus before a nested block takes over selection. This makes collapsed later parts such as Part (b) selectable and editable directly from their panel header while preserving nested block inspection.

The public features page now replaces its sparse geometry and 3D thumbnails with larger vector constructions. The geometry card shows a coherent isosceles triangle, circumcircle, altitude, midpoint, angle arcs, equality marks, and dimensions; the 3D card shows a coordinate grid, translucent rectangular prism, dimensions, coordinate point, and space diagonal. Both SVGs remain sharp at desktop and mobile sizes without changing the surrounding diagram grid.

The public Exam template example now uses the actual Australian Christian College Year 10 Units 1-4 Calculator-Free examination cover rendered by Mauth. It shows the school logo, exam identity, student-name line, timing, materials, and candidate instructions without curriculum-authority branding.

The public Math Notes example is now a full original function-transformations page with a transformation rule, comparison graph, parameter guide, worked example, sketching checklist, and common mistakes. It replaces the mostly blank raster thumbnail with a sharp vector page.

The public Investigation template example now uses the actual first teacher-rubric page rendered by Mauth for the current Year 12 investigation. It shows the real performance-level table and marking columns rather than a fabricated illustration or the student brief.

The public Home and Features pages now use one restrained responsive heading hierarchy with fixed desktop, tablet, and phone sizes. Hero headings cap at 72 px on wide screens and 44 px on phones; section headings cap at 52 px and 33.6 px respectively, avoiding the previous viewport-scaled headings that became oversized on wide displays.

New Exam documents now use the selected school logo and school name with neutral school-exam headings, materials, and candidate instructions. The old Western Australian external-examination and ATAR-specific default wording is removed; legacy schema fields remain readable for existing documents.

Release-specific history is in `docs/releases/` and Git. Do not copy it back into this handoff.

## Near-Term Work Queue

1. Clean-machine and in-app-update verification for `0.1.5`.
2. Focused teacher-facing authoring and manual-solution ergonomics.
3. Measured-preview overflow/readiness checks and explicit repair actions.
4. External/cloud-folder availability and stale-autosave smoke coverage.
5. Coherent `App.tsx` composition reductions with focused tests.
6. Extend high-level Mauth actions and validation only where real authoring sessions reveal a missing structured edit.

## First Commands For A New Model

```bash
git status --short --branch
git log --oneline -5
pnpm dev:status
```

For assessment authoring, also run `pnpm agent:doctor` and inspect the current Mauth snapshot. For a repository handoff, run `pnpm check:handoff:live` after confirming this checkpoint matches Git.
