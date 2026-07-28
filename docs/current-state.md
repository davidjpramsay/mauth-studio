# Current State And Handoff

Last reviewed: 29 July 2026.

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

- **Product:** local-first mathematics assessment authoring for macOS, with optional external-agent authoring through the same structured action layer as the UI.
- **Current release:** signed and notarized Apple Silicon alpha `v0.1.3`; the public DMG, ZIP updater artifact, metadata, blockmap, release notes, and GitHub Pages download page are published.
- **Normal use:** open **Mauth Studio.app**. It owns its local FastAPI sidecar and needs no open Terminal window.
- **Development:** use `pnpm macos:dev`; React/CSS and API edits are watched, while Electron main-process and packaging edits require a restart.
- **Documents:** visible `.mauth` files live in the selected folder. Shared state and recovery live under `~/Library/Application Support/Mauth Studio/storage`.
- **Tabs:** several documents can be open with independent history, dirty state, revision, autosave, and explicit agent `documentId` targeting.
- **Agent setup:** **Help > Set Up Codex or Claude...** provides one-time client configuration for the connector bundled inside the app. No setup prompt or token copying is required.
- **Finder:** `.mauth` has a dedicated document icon, thumbnail, and read-only native Quick Look summary.
- **Solutions:** manual structured solution layers exist for text, choices, tables, graph functions/features, supported 2D/3D/Plotly/image/Penrose elements, and paired whole-diagram copies.
- **Current public limitation:** Apple Silicon only; Mauth remains alpha software.

## Immediate Worktree Checkpoint

```text
branch: CURRENT
baseline commit: HEAD
App.tsx: 1370 lines
SelectionInspector.tsx: 107 lines after the focused basic-block, diagram-router, renderer-specific inspector extractions, and explicit Solutions-mode binding
worktree: clean at this checkpoint; Plotly print-readiness, nested part-selection, neutral exam-default, and public feature-showcase updates are committed
```

Observed runtime on 28 July 2026:

- one source-development Electron runtime was healthy on dynamic loopback ports;
- API, web, bridge discovery, and active snapshot checks passed through `pnpm agent:doctor`;
- the selected documents folder was `/Users/djpramsay@acc.edu.au/Desktop`;
- no teacher document was changed during this documentation audit.

Runtime and folder facts are transient. Recheck them before authoring or debugging.

### Model Transition Readiness

- Entry-point docs now separate three concerns: install the app, optionally connect an agent, or develop the app.
- The public site links directly to the signed DMG and no longer asks users to paste a large setup/development prompt.
- `README.md` is the concise public/repository overview; detailed contracts remain in their owning documents.
- Historical implementation detail lives in Git history and `docs/releases/`, not in this handoff.
- The handoff checker still validates required files, headings, scripts, links, verification counts, source sizes, and clean/dirty checkpoint state.

### Active Development Goal

The standalone foundation, multi-document session, manual solution layers, native Finder integration, updater, bundled connector, and guarded release pipeline are implemented.

Current work should improve teacher-facing authoring reliability and ergonomics through existing contracts. Do not introduce another document store, mutation path, preview engine, validation system, or provider-backed chat state.

### Exact Resume Point

Choose the first item relevant to the next request:

1. Clean-Mac verify the public `0.1.3` DMG, Finder/Quick Look behavior, tab recovery, bundled connector setup, and an in-app update from `0.1.2`.
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
- **Source development:** `pnpm macos:dev` owns watched Vite and Uvicorn processes plus the Electron shell.
- **Low-level diagnostics:** `pnpm dev:api`, `pnpm dev:web`, and the fixed-port launcher are debugging paths only.
- **Discovery:** both desktop modes publish API/web URLs and a random per-launch token in a private mode-`0600` runtime manifest. The connector discovers them automatically.
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

~/Library/Application Support/Mauth Studio/
  storage/ shared state, autosave, open-tab recovery, logos, folder identity
  runtime.json private runtime discovery
  desktop.log
```

Autosave is recovery state, not a saved file. Browser localStorage is fallback cache. Direct edits to visible documents, `.mauth` metadata, or Application Support state are recovery/migration tools, not normal authoring.

External File Provider folders can disappear or contain dataless placeholders. Status must remain lightweight, file routes should return `503 STORAGE_UNAVAILABLE` promptly, and background sync must preserve the editor draft until the active file is confirmed current or deliberately reloaded.

## Agent Editing Contract

```text
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
- `apps/web`: editor composition, action history, preview, files, validation, and print.
- `packages/question-engine`: question generation only.
- `packages/marking-engine`: marking only.
- `packages/formatting-engine`: formatting only.
- `packages/diagram-penrose`, `packages/diagram-plotly`, and JSXGraph rendering remain separate systems.
- `apps/web/src/App.tsx` is a composition shell; extract coherent owners instead of adding unrelated state to it.

## Current Verification Baseline

Latest full gate on 29 July 2026:

```text
formatting and lint: passed
API: 84 passed
web/actions: 616 passed
Plotly: 8 passed
launcher: 47 passed
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

The latest source-development slice fixes asynchronous Plotly charts disappearing from browser print/PDF output. Statistical charts now expose an explicit loading, ready, or error state; the print controller waits for all chart surfaces, document fonts, and two settled layout frames before opening the print dialog, with stale-request suppression and a fail-open timeout. Focused readiness tests cover pending, ready, error, settled-frame, and timeout behavior. A fresh 11-page A4 print of the Year 12 logarithms and continuous-random-variables test showed both the Question 6 histogram and Question 8 density graph. This source fix is not present in the already-running installed `0.1.3` app until a deliberate rebuild/install or a later signed update.

Part and subpart editor panels now activate their structural anchor on pointer or keyboard focus before a nested block takes over selection. This makes collapsed later parts such as Part (b) selectable and editable directly from their panel header while preserving nested block inspection.

The public features page now replaces its sparse geometry and 3D thumbnails with larger vector constructions. The geometry card shows a coherent isosceles triangle, circumcircle, altitude, midpoint, angle arcs, equality marks, and dimensions; the 3D card shows a coordinate grid, translucent rectangular prism, dimensions, coordinate point, and space diagonal. Both SVGs remain sharp at desktop and mobile sizes without changing the surrounding diagram grid.

The public Exam template example now uses the actual Australian Christian College Year 10 Units 1-4 Calculator-Free examination cover rendered by Mauth. It shows the school logo, exam identity, student-name line, timing, materials, and candidate instructions without curriculum-authority branding.

The public Math Notes example is now a full original function-transformations page with a transformation rule, comparison graph, parameter guide, worked example, sketching checklist, and common mistakes. It replaces the mostly blank raster thumbnail with a sharp vector page.

The public Investigation template example now uses the actual first teacher-rubric page rendered by Mauth for the current Year 12 investigation. It shows the real performance-level table and marking columns rather than a fabricated illustration or the student brief.

New Exam documents now use the selected school logo and school name with neutral school-exam headings, materials, and candidate instructions. The old Western Australian external-examination and ATAR-specific default wording is removed; legacy schema fields remain readable for existing documents.

Release-specific history is in `docs/releases/` and Git. Do not copy it back into this handoff.

## Near-Term Work Queue

1. Clean-machine and in-app-update verification for `0.1.3`.
2. Focused teacher-facing authoring and manual-solution ergonomics.
3. Measured-preview overflow/readiness checks and explicit repair actions.
4. External/cloud-folder availability and stale-autosave smoke coverage.
5. Coherent `App.tsx` composition reductions with focused tests.
6. More high-level Mauth actions and validation for common agent edits.

## First Commands For A New Model

```bash
git status --short --branch
git log --oneline -5
pnpm dev:status
```

For assessment authoring, also run `pnpm agent:doctor` and inspect the current Mauth snapshot. For a repository handoff, run `pnpm check:handoff:live` after confirming this checkpoint matches Git.
