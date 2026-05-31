# Mauth Roadmap

## Current Direction

Mauth is moving from an in-app assistant experiment to an agent-native authoring workbench.

The app should be excellent for:

- a teacher editing directly
- Codex/Claude Code inspecting and operating the app through browser control
- external agents using stable files, actions, validation, and preview evidence

## Near-Term Product Goals

- Keep the editor, inspector, preview, and file drawer stable after the repo flattening.
- Make `workspace/` the standard location for local generated artifacts.
- Keep the right-click menu small: copy agent reference, move, duplicate, delete.
- Preserve structured Mauth actions as the deterministic edit contract.
- Build the local agent bridge around snapshot, action preview/apply, validation, presence, events, comments, and suggestions.
- Add better document export/import and Mauthdown round-trip support.
- Improve diagram primitives and geometry authoring without relying on model-authored low-level renderer payloads.
- Add browser-visible validation/reporting surfaces that external agents can inspect without hidden React state.

## Agent Workflow Goals

- Create explicit development and authoring work streams:
  - `Development`: code, tests, schemas, docs, repository maintenance.
  - `Authoring`: teacher-facing assessment creation, source conversion, layout, and validation.
- Prefer structured actions and browser verification over provider chat loops.
- Make assessment authoring use `snapshot -> dry-run -> validate -> apply -> browser verify` rather than raw project-file JSON edits.
- Add an explicit MCP/App surface only after the local agent bridge and document operation contracts are stable.
- Treat paid provider calls as optional future tooling, not the default product path.

## Local Agent Bridge TODO

- Define shared TypeScript types for agent snapshots, preview/apply requests, mutation results, comments, suggestions, presence, and events.
- Add a read-only snapshot builder for the active document with stable question, part, subpart, module, diagram, file, revision, and validation summaries.
- Expose a preview endpoint that calls the existing document action dry-run path and returns preview summary plus validation issues.
- Expose an apply endpoint that requires revision/idempotency protection and commits through editor history/autosave.
- Return `409 STALE_REVISION` with a fresh snapshot when the active file/document changed.
- Add a validation endpoint that surfaces structural, solution, diagram, and layout checks in a compact agent-readable shape.
- Add local comments and suggestions as review state separate from committed document edits.
- Add presence/events so the app can show what an external agent is doing without exposing prompt internals.
- Add `/.well-known/mauth-agent.json` and `/agent-docs` discovery docs once the first bridge slice is usable.
- Add bridge-specific tests and smoke checks before recommending it as the normal authoring path.

## Reliability Gates

Use these before considering a migration complete:

```bash
pnpm test:api
pnpm test:web-actions
pnpm build:web
pnpm smoke:context-menu-actions
pnpm smoke:file-manager
```

Use broader smoke tests when touching diagrams, preview, print, or drag/drop.
