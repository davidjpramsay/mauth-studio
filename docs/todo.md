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
- Harden the local agent bridge around snapshot, action preview/apply, validation, presence, events, comments, and suggestions.
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

The first bridge slice exists and is the intended agent-facing editing path. Keep improving it rather than creating another mutation channel.

- Keep shared TypeScript/API contracts aligned for agent snapshots, preview/apply requests, mutation results, comments, suggestions, presence, and events.
- Keep the active-document snapshot compact and stable with question, part, subpart, module, diagram, file, revision, and validation summaries.
- Keep preview endpoints wired to the existing document action dry-run path and returning preview summary plus validation issues.
- Keep apply endpoints revision/idempotency protected and committed through editor history/autosave.
- Return stale-state conflicts with enough fresh snapshot/file information for an agent to rebuild its batch safely.
- Expand validation output for structural, solution, diagram, and layout checks in a compact agent-readable shape.
- Keep local comments and suggestions as review state separate from committed document edits.
- Expand presence/events so the app can show what an external agent is doing without exposing prompt internals.
- Keep `/.well-known/mauth-agent.json` and `/agent-docs` discovery docs current with the implemented bridge.
- Add bridge-specific tests and smoke checks for every new agent-facing workflow.

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
