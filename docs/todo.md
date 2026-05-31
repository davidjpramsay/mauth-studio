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
- Add better document export/import and Mauthdown round-trip support.
- Improve diagram primitives and geometry authoring without relying on model-authored low-level renderer payloads.
- Add browser-visible validation/reporting surfaces that external agents can inspect without hidden React state.

## Agent Workflow Goals

- Create explicit development and authoring work streams:
  - `Development`: code, tests, schemas, docs, repository maintenance.
  - `Authoring`: teacher-facing assessment creation, source conversion, layout, and validation.
- Prefer structured actions and browser verification over provider chat loops.
- Add an explicit MCP/App surface only after the web app and document operation contracts are stable.
- Treat paid provider calls as optional future tooling, not the default product path.

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
