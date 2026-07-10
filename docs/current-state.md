# Current State And Handoff

Last reviewed: 10 July 2026.

Use this file as the first project handoff note for a new model, agent, or development session. It summarises the current app shape, operating contracts, and next work queue. Treat the repo, tests, and runtime status as authoritative if this file and code ever disagree.

## Start Here

Read these files in order:

1. `AGENTS.md`
2. `README.md`
3. `docs/storage.md`
4. `docs/local-ai-workflow.md`
5. `docs/agent-bridge.md`
6. `docs/mauth-actions.md`
7. `docs/ai-brains.md`
8. `docs/app-scan-and-direction.md`

For development work, also inspect the relevant tests beside the changed code. For assessment authoring, inspect the live Mauth document through the bridge or browser before editing.

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

Normal local use should go through the launcher:

```bash
pnpm dev:launch:desktop
```

On macOS the installed entry point is:

```text
~/Applications/Mauth Studio.app
```

The desktop launcher checks the API and web app, replaces stale or partial Mauth-owned runtimes, starts the needed servers, and opens the browser. Companion commands are installed beside it:

```text
~/Applications/Mauth Studio Status.command
~/Applications/Mauth Studio Stop.command
```

Useful commands:

```bash
pnpm dev:status
pnpm dev:stop
pnpm dev:launch:replace
pnpm macos:install-launcher
pnpm macos:install-launcher --reveal
```

Use `pnpm dev:api` and `pnpm dev:web` only for lower-level debugging.

## Storage Model

Normal authored files live outside the repo:

```text
~/Documents/Mauth/
  Documents/
    visible teacher files and folders
  .mauth/
    project metadata
    autosave/current-test.json
    reusable logo assets
    version snapshots
    backups
```

The Files drawer can open another documents folder. Opening another folder must not silently import or copy old browser/repo files into that folder. Real `.test.json` and `.mauth.md` files in the selected folder are indexed in place, and hidden `.mauth/` metadata is kept beside that selected folder.

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
- Tables, diagrams, graph annotations, ticks, and selected/circled answers should place solutions where a student would write them.
- Blue solution content should be limited to the actual entered answer or annotation, not the whole table or diagram.
- Worked solution text should usually be one mathematical step or conclusion per line.
- Hidden `[[marks:n]]` ticks and surface `markTicks` both count toward mark verification.
- Solution slots should not show ruled lines by default; line display is optional.

The remaining work is to make this solution layer more discoverable and ergonomic in the editor, especially for in-place table/diagram/circled-answer edits.

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
- manual solution surface controls and solution validation

Recent `App.tsx` extractions include:

- editor anchor action helpers
- editor block context helpers
- page break lifecycle helpers
- module lifecycle helpers
- question lifecycle helpers
- project document recovery helpers
- new-document plan builders

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
   - Keep recovery, reload, save-as-copy, and conflict choices consistent.

3. Keep shrinking `App.tsx`.
   - Prefer pure helpers in `apps/web/src/lib`.
   - Prefer focused hooks in `apps/web/src/hooks`.
   - Add tests before or with every extraction.

4. Continue first-class manual solution editing.
   - Better Solution mode UI.
   - In-place solution annotations for tables, diagrams, choices, and graph features.
   - Keep AI solution drafting as optional assistant behaviour, not source of truth.

5. Strengthen agent contracts.
   - More high-level Mauth actions for common teacher/agent edits.
   - More validation for layout, solution coverage, and diagram issues.
   - More smoke tests for workflows that previously became stale or ambiguous.

6. Package later.
   - Keep the current macOS launcher while the app is changing quickly.
   - Consider Tauri/Electron only after storage, bridge, and document lifecycle contracts are stable.
   - A Swift/macOS-native rewrite is not the next practical step unless deep Finder/print/iCloud/classroom integration becomes essential.

## First Commands For A New Model

```bash
git status --short
git branch --show-current
git log --oneline -5
pnpm dev:status
```

Then inspect the specific subsystem before editing. Do not assume the browser tab, API process, or saved project file is current without checking status, snapshot, or file revision.
