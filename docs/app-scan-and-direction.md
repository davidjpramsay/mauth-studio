# App Scan And Direction

Last reviewed: 28 July 2026. Read `docs/current-state.md` for the live checkpoint and `docs/architecture.md` for durable boundaries.

## Current Health

Mauth has a coherent standalone foundation:

- signed/notarized Apple Silicon app with teacher-confirmed updates;
- packaged FastAPI, web, Penrose, Quick Look, and MCP connector runtimes;
- visible local `.mauth` files, selected external folders, revision-aware saves, versions, and autosave recovery;
- multi-document tabs with explicit agent `documentId` targeting;
- deterministic snapshot, action preview/apply, validation, and rendered-preview contracts;
- structured Student/Solutions authoring across text and supported answer surfaces;
- browser-measured pagination/overflow evidence;
- focused tests for storage, session conflicts, tabs, bridge actions, and diagram solutions.

The current risk is no longer “can this become an app?” It is whether authoring, storage, preview, and agent workflows remain simple and predictable as features expand.

## Main Risks

1. **Document-state ambiguity:** active tab, saved revision, autosave, selected folder, and bridge target must remain explicit.
2. **Cloud-folder outages:** dataless or disconnected File Provider folders must fail promptly without losing or silently relocating drafts.
3. **Parallel implementations:** UI, MCP, file APIs, and any future assistant must use one action/document model.
4. **Layout confidence:** structural validation cannot replace rendered Student and Solutions/Teacher checks.
5. **Frontend concentration:** `App.tsx` remains a composition shell that should shrink only through coherent ownership extractions.
6. **Alpha distribution:** clean-machine installation and updater behavior need continued real-world verification.

## Direction

Build a teacher-controlled local authoring app with an optional agent control plane:

```text
teacher edits or asks for help
-> one structured document/action model
-> revision-safe save and validation
-> rendered evidence
-> teacher approval
```

The app must remain complete without AI. External agents are first-class clients of the shared contracts, not a reason to hide core controls or require prompts, tokens, source checkouts, or raw file edits.

## Current Product Decisions

| Area           | Decision                                                                                         | Revisit when                                                              |
| -------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Desktop        | Continue with Electron plus packaged FastAPI and web UI.                                         | A proven native-only requirement cannot be met reliably.                  |
| Files          | Keep visible teacher files in a selected folder and private shared state in Application Support. | Sandbox/cloud constraints require another explicit boundary.              |
| Agents         | Keep MCP thin over the authenticated HTTP bridge and Mauth action layer.                         | A required workflow cannot be represented as state/actions/validation.    |
| Solutions      | Manual structured solution data is authoritative; AI may draft it.                               | Never move to AI-only solutions.                                          |
| Preview/print  | Use the same paginated A4 render tree for screen evidence and browser print.                     | A specific compatibility failure proves another path is necessary.        |
| Updates        | Keep signed, notarized, teacher-confirmed alpha updates.                                         | Distribution broadens beyond Apple Silicon/GitHub releases.               |
| In-app chat    | Optional future client of the same bridge only.                                                  | Shared contracts are stable and a clear teacher need remains.             |
| Native rewrite | Not a near-term objective.                                                                       | Deep Finder, iCloud, print, classroom, or accessibility needs justify it. |

## Recommended Roadmap

### 1. Authoring Reliability

- Improve high-value teacher editing and manual-solution gaps.
- Add high-level Mauth actions for common operations.
- Expand compact structural, solution, diagram, and layout validation.

### 2. Storage And Session Reliability

- Keep folder, tab, file, revision, autosave, bridge, and conflict state legible.
- Add focused smokes for external-folder disappearance, reconnect, and stale recovery.
- Preserve explicit Save, Save Copy, Reload, Discard, and Cancel outcomes.

### 3. Preview Readiness

- Keep page totals and overflow evidence measured from the renderer.
- Add conservative repair suggestions/actions; never silently rewrite teacher spacing.
- Verify Student and Solutions/Teacher output after layout changes.

### 4. Maintainable Composition

- Extract another frontend owner only when state and mutation responsibility are clear.
- Keep JSXGraph, Penrose, Plotly, and image rendering adapters separate.
- Add focused tests with every extraction.

### 5. Distribution

- Clean-machine verify `0.1.3` and an in-app update from `0.1.2`.
- Keep website, README, release notes, app version, and public assets aligned.
- Consider Windows only after a dedicated package, sidecar, native integration, installer, and update test matrix exists.

## Strategic Call

Continue the current architecture. Prioritise authoring reliability, explicit state, and measured evidence over another platform rewrite or a new chat layer.
