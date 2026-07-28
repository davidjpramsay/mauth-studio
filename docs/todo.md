# Mauth Roadmap

Last reviewed: 28 July 2026. `docs/current-state.md` owns the live checkpoint; `docs/app-scan-and-direction.md` owns product direction.

## Current Direction

Mauth is a standalone teacher app with optional local agent authoring. Human controls and agents share one structured document/action/validation path. The app must remain useful without AI.

## Implemented Foundation

- Signed/notarized Apple Silicon app, packaged sidecars, guarded publication, and teacher-confirmed updater.
- Visible `.mauth` files, external folders, versions, revision-aware saves, autosave, recovery, and backup/import.
- Multi-document tabs with independent history/state and explicit MCP `documentId` targeting.
- Native `.mauth` icon, thumbnail, and read-only Quick Look summary.
- Snapshot, dry-run/apply, validation, comments, suggestions, presence, and events through one local bridge.
- Bundled Codex/Claude MCP connector with one-time Help-menu setup and no copied token.
- Student/Solutions authoring with structured shared and solution-only answer layers across supported surfaces.
- Browser-measured page totals and overflow evidence.
- Focused composition boundaries and regression smokes for high-risk workflows.

## Now

1. Clean-machine verify public `0.1.3`, including Finder/Quick Look, tab recovery, connector setup, and update from `0.1.2`.
2. Improve the next concrete teacher-facing manual-solution or authoring ergonomics gap.
3. Keep active folder, tab, file, revision, autosave, and bridge state obvious.
4. Add conservative measured-preview layout checks and explicit repair actions.
5. Add high-level Mauth actions and compact validation for common teacher/agent edits.
6. Continue `App.tsx` extraction only at coherent ownership boundaries.

## Active Goal Completion Criteria

The broad launcher/editor/lifecycle/manual-solutions milestone is complete:

- normal macOS use has one standalone app path;
- file, folder, version, close, recovery, and conflict choices are explicit;
- structured manual solutions are editable and printable;
- external agents use revision-safe shared actions rather than file mutation;
- focused storage/session/solution/preview tests and the full quality gate pass.

Completion does not require a Swift rewrite or restored in-app chat.

## Next

- Improve Mauthdown round-trip fidelity.
- Expand surface-specific solution completeness checks.
- Strengthen cloud-folder outage/reconnect and stale-autosave smoke coverage.
- Add preview repair suggestions for oversized or poorly distributed pages.
- Build a Windows packaging/test plan before promising Windows distribution.

## Later

- Optional in-app assistant as a visible client of the existing bridge.
- Deeper iCloud, printing, classroom, and accessibility integrations.
- Universal/Intel builds only with a complete native and sidecar test matrix.
- Native Swift rewrite only if proven platform requirements justify it.

## Agent Workflow Goals

- Keep installed-app setup to **Help > Set Up Codex or Claude...**; no setup prompt or separate agent download.
- Keep MCP thin over the HTTP bridge and structured Mauth action layer.
- Use `snapshot -> dry-run -> apply -> validate -> rendered verification`.
- Keep comments/suggestions non-mutating and all document changes revision protected.
- Expose enough state for agents to target tabs and recover from stale snapshots without guessing.

## Local Agent Bridge TODO

- Add high-level actions for frequent layout and content operations.
- Expand compact validation for structure, solutions, diagrams, and rendered readiness.
- Add a regression test for each stale, hidden-state, or ambiguous-target bug.
- Keep discovery docs and the bundled connector tool list aligned with the implemented bridge.

## Reliability Gates

```bash
pnpm check
```

At a model/developer handoff, update `docs/current-state.md` to the final Git state and run:

```bash
pnpm check:handoff:live
```

Use targeted browser smokes whenever changing storage, tabs, diagrams, preview, print, or bridge behavior.
