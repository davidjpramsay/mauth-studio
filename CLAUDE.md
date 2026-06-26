# Claude Code Guide

Use the same operating contract as Codex:

1. Read `AGENTS.md` first.
2. For app development, edit source files directly and run focused tests.
3. For assessment authoring, use the local Mauth bridge before editing any saved project JSON.
4. Keep generated artifacts in `workspace/` and do not commit local `storage/` data.

Key docs:

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
browser verification
```

The MCP server is a wrapper over the local HTTP bridge:

```bash
pnpm agent:mcp
```

Do not bypass the bridge by writing directly under `~/Documents/Mauth/Documents`, `~/Documents/Mauth/.mauth`, or legacy `storage/projects` unless the user explicitly asks for recovery or migration work.
