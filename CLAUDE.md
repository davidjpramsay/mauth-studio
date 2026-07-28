# Claude Code Guide

`AGENTS.md` is the operating contract for this repository. Read it first, then read `docs/current-state.md`, `docs/architecture.md`, and the subsystem document named by the current task.

- **App development:** edit source, preserve existing work, run focused tests, then run `pnpm check`.
- **Assessment authoring:** use the running app's Mauth MCP tools. Inspect a snapshot, preview actions, apply against that snapshot, validate, and verify the rendered Student and Solutions/Teacher views.
- **Storage:** do not edit teacher documents, `.mauth` metadata, Application Support state, or legacy storage directly unless the user explicitly requests recovery or migration work.
- **Artifacts:** keep generated PDFs, screenshots, crops, and temporary files in ignored `workspace/` paths.

The signed app contains its own MCP connector. Users configure it once through **Help > Set Up Codex or Claude...**; `pnpm agent:mcp` is only the source-development wrapper.
