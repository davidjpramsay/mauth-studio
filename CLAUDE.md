# Claude Code Guide

Use the same operating contract as Codex:

1. Read `AGENTS.md`, then `docs/current-state.md`, then `docs/architecture.md`.
2. Treat the current-state checkpoint as the model-transition handoff: preserve its dirty worktree, live runtime caveats, and exact resume point.
3. For app development, edit source files directly and run focused tests.
4. For assessment authoring, use the local Mauth bridge before editing any saved project JSON.
5. Keep generated artifacts in `workspace/` and do not commit local `storage/` data.
6. Before resuming the exact implementation slice, run `pnpm check:handoff:live`; it proves the recorded branch, commit, dirty-worktree counts, and key source sizes still match the checkout.

Key docs:

- `docs/current-state.md`
- `docs/architecture.md`
- `docs/agent-local-setup.md`
- `docs/agent-bridge.md`
- `docs/local-ai-workflow.md`
- `docs/mauth-actions.md`
- `docs/ai-brains.md`

Local authoring loop:

```text
mauth_snapshot
mauth_actions_preview
mauth_actions_apply
mauth_validation_run
mauth_comment_create
mauth_suggestion_create
rendered app verification
```

The MCP server is a wrapper over the local HTTP bridge:

```bash
pnpm agent:mcp
```

Do not bypass the bridge by writing directly under the selected documents folder, its `.mauth` metadata, `~/Library/Application Support/Mauth Studio/storage`, or legacy `storage/projects` unless the user explicitly asks for recovery or migration work.
