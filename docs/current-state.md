# Current State And Handoff

Last reviewed: 10 August 2026.

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
- **Current release:** signed and notarized Apple Silicon alpha `v0.1.4`; the public DMG, ZIP updater artifact, metadata, blockmap, release notes, and GitHub Pages download page are published.
- **Normal use:** open **Mauth Studio.app**. It owns its local FastAPI sidecar and needs no open Terminal window.
- **Development:** use `pnpm desktop:dev`; `pnpm macos:dev` remains an alias. React/CSS and API edits are watched, while Electron main-process and packaging edits require a restart.
- **Documents:** visible `.mauth` files live in the selected folder. Shared state and recovery live under `~/Library/Application Support/Mauth Studio/storage`.
- **Tabs:** several documents can be open with independent history, dirty state, revision, autosave, drag-to-reorder, and explicit agent `documentId` targeting.
- **Agent setup:** **Help > Set Up Codex or Claude...** provides one-time client configuration for the connector bundled inside the app. No setup prompt or token copying is required.
- **Finder:** `.mauth` uses a dedicated portrait document icon with the large Mauth M and has a read-only native Spacebar Quick Look summary.
- **Solutions:** manual structured solution layers exist for text, choices, tables, graph functions/features, supported 2D/3D/Plotly/image/Penrose elements, and paired whole-diagram copies.
- **Current public limitation:** Apple Silicon only; Mauth remains alpha software.

## Immediate Worktree Checkpoint

```text
branch: CURRENT
baseline commit: HEAD
App.tsx: 1664 lines
SelectionInspector.tsx: 115 lines after the focused basic-block, diagram-router, renderer-specific inspector extractions, explicit Solutions-mode binding, and Investigation diagram selection support
worktree: clean at this checkpoint; all verified source and documentation changes are committed
```

Observed runtime on 10 August 2026:

- one isolated source-development Electron runtime was healthy on dynamic loopback ports;
- API, web, bridge discovery, active snapshot, and MCP connector checks passed through `pnpm agent:doctor`;
- the MCP client listed documents, created a worksheet, read its targeted snapshot, closed it, reopened it by relative path, and closed it again through the packaged-equivalent stdio contract;
- the lifecycle smoke used `/tmp/mauth-mcp-lifecycle-documents` and did not touch a teacher-selected documents folder.

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

Printable question and solution text now use one slightly more generous shared line rhythm, with a small prompt-to-solution gap, so display-size inline fractions on adjacent lines do not touch. Paired student-space/solution replacement rows receive the same gap as standalone solution rows, regardless of which hidden block appears first. This is renderer-level behaviour: existing documents gain it without stored-file migration, although tightly packed pages may reflow slightly.

Finder now uses a dedicated portrait Mauth document icon with a folded page corner and a large centred M. The generated thumbnail provider remains removed because macOS applies inconsistent framing to third-party thumbnails. The richer read-only metadata remains available through the sandboxed Spacebar Quick Look preview. The exported Mauth document type conforms to `public.data` rather than generic `public.json`, preventing macOS from intermittently replacing the Mauth artwork with its built-in JSON text thumbnail.

Current work should improve teacher-facing authoring reliability and ergonomics through existing contracts. Do not introduce another document store, mutation path, preview engine, validation system, or provider-backed chat state.

The editor and Inspector have completed a broad clarity pass. The Inspector is only present for a real selection and becomes a compact overlay at narrower desktop widths instead of permanently crushing the preview. Diagram settings have one owner in the Inspector; changing renderer type is isolated behind an explicit destructive-change warning. Manual solution actions use one consistent **Create solution copy** or in-place answer label. The 2D graph Inspector separates axes, view window, and scale/grid controls, and all authoring number fields use the same clear-and-retype, exact-expression input with 10 px dimension steppers. Question labels are static identifiers with a separate preview-jump command. Investigation student pages, text sections, and rubric criteria are independently collapsible. Drag handles support `Alt+Up` and `Alt+Down`, while Add menus support standard arrow, Home/End, submenu, and Escape navigation.

The browser agent bridge now distinguishes stale or incompatible APIs from temporary outages. Missing register routes and authentication/permission failures stop the browser loop instead of producing repeated 404/401/403 traffic. Lost sessions still register again, and transient network failures use bounded exponential backoff. The packaged connector and current bridge contract are unchanged.

The local bridge and bundled MCP connector now expose the complete document lifecycle needed for agent-first authoring: list the selected folder, create a saved document from a Mauth template, open a saved document in a tab, and close a tab under an explicit `require-clean`, `save`, or `discard` policy. Paths are relative to the selected documents folder and traversal-safe. Create and close carry idempotency keys; creation uses the same template factory, serializer, project-file API, revision metadata, and saved-tab applier as the human UI. The default close policy refuses dirty work rather than displaying an agent-invisible browser dialog or discarding edits. MCP now publishes 16 local-only tools with explicit object output schemas, compatible JSON text plus `structuredContent`, truthful error results, and read/write/destructive annotations.

Document tabs can now be dragged horizontally to reorder them. The active tab remains active, each tab's document/history/save state remains intact, and the reordered array is reused by the overflow menu, open-tab recovery, and agent `openDocuments` snapshot.

Coordinate graph number labels now use one MathJax SVG path rather than JSXGraph's plain-text tick labels. Automatic numbers are anchored to the exact major-grid coordinates, y values remain on the left by default, and `showXAxisNumbers`/`showYAxisNumbers` allow one automatic numeric axis to remain visible when the other axis uses custom symbolic ticks. The legacy `showAxisNumbers` field remains the shared fallback. The Year 11 combined test uses this path for Question 4(c), retaining its symbolic x labels while replacing manually offset y-number label features.

Print now derives physical `@page` margins and the printable content box from the active document's stored A4 padding. This keeps PDF line wrapping identical to the visible preview for compact investigations, worksheets, and notes instead of forcing the older 76 px test margin and creating print-only overflow pages.

Standard-test and investigation title pages now render the student Name/Result row at the same compact font size as that template's assessment subtitle. This is shared renderer styling, so existing documents inherit it without a stored-file migration.

Investigation general marking guidance now keeps its explanatory copy at an explicit compact print size beneath the criterion headings. This prevents utility-class inheritance from making the guidance larger than its heading and preserves a comfortable bottom margin on dense student briefs.

Standard school tests now treat a final question-level `**End of Test**` text block as a dedicated print marker. Student and Solutions previews centre it at the bottom of the final question page without filler Space blocks or stored positioning data; existing tests inherit the placement once their marker uses that wording.

Investigation briefs now use structured `studentPages`, each with stable ordered text sections, while diagrams target pages by `pageId`. The first page keeps the shared title identity and Name/Result row; any number of later pages repeat compact assessment context only, and general marking guidance remains on the final student page. The narrow mini TOC is grouped into **T** investigation identity, one **P** per student page, and **R** rubric; text sections and diagrams stay nested under their page in the collapsible full navigator. **P+** creates a student page. The rubric always exists, so **R** turns on Teacher mode, opens its editor, and jumps the preview to the rubric, where criteria and their performance levels or mark allocations are added, reordered, and removed. Text sections are added from the selected page editor. Legacy two-page task fields remain readable and are mirrored during edits so existing investigation files continue to open correctly.

Investigation diagrams now use the same selected-module Inspector path as Test diagrams. Selecting a diagram or one of its graph children opens the shared renderer controls, and Inspector changes write back through `frontMatter.investigation.diagrams` without exposing solution-surface controls. Tangent, perpendicular, angle, shortest-distance, and circle constructions should use `equalScale: true` with bounds and pixel dimensions chosen together so the visible geometry remains both truthful and readable.

### Exact Resume Point

Choose the first item relevant to the next request:

1. Clean-Mac verify the public `0.1.4` DMG, Finder/Quick Look behavior, tab recovery, bundled connector setup, and an in-app update from `0.1.3`.
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

Latest full gate on 10 August 2026:

```text
formatting and lint: passed
API: 88 passed
web/actions: 637 passed
Plotly: 8 passed
launcher: 55 passed (desktop and connector contract)
native Quick Look: 3 passed
TypeScript and Vite production build: passed
```

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

1. Clean-machine and in-app-update verification for `0.1.4`.
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
