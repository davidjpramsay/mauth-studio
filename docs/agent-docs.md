# Mauth Local Agent Bridge

Mauth exposes a local bridge for Codex, Claude Code, Claude Desktop, and other stdio MCP clients. The standalone app supplies the FastAPI sidecar, editor renderer, one active editor session, and a self-contained connector. For current handoff context, read `docs/current-state.md`; for the process and state boundaries around the bridge, read `docs/architecture.md`.

## Start

```bash
open ~/Applications/Mauth\ Studio.app
```

The app owns its dynamic local port and sidecar. No Terminal windows need to remain open. For source development use `pnpm macos:dev`; for lower-level browser debugging, `pnpm dev:launch:desktop` or separate `pnpm dev:api` and `pnpm dev:web` processes remain available.

For a signed installed app, choose **Help > Set Up Codex or Claude...** and copy the one-time client setup. No source checkout or Node installation is required. For source development and diagnostics, run:

```bash
pnpm agent:doctor
```

The bundled connector and repository doctor discover the packaged runtime URL and per-launch bridge token from `~/Library/Application Support/Mauth Studio/runtime.json`. If a manual Vite runtime uses another URL, pass it explicitly:

```bash
MAUTH_WEB_URL=http://127.0.0.1:5174 pnpm agent:doctor
```

## HTTP Contract

Packaged `/api/agent/*` requests require the bearer token from the private runtime manifest. The supplied doctor, MCP wrapper, and smoke tooling attach it automatically. Do not copy the token into a persistent Claude/Codex configuration; it changes every time Mauth starts. Development runtimes remain unauthenticated unless `MAUTH_AGENT_TOKEN` is explicitly set.

```text
GET  /api/agent/current/snapshot
POST /api/agent/current/actions/preview
POST /api/agent/current/actions/apply
POST /api/agent/current/validation/run
POST /api/agent/current/presence
GET  /api/agent/current/events?after=0
GET  /api/agent/current/comments
POST /api/agent/current/comments
POST /api/agent/current/comments/{id}/resolve
GET  /api/agent/current/suggestions
POST /api/agent/current/suggestions
POST /api/agent/current/suggestions/{id}/accept
POST /api/agent/current/suggestions/{id}/reject
GET  /.well-known/mauth-agent.json
GET  /agent-docs
```

`actions.apply` requires:

- `baseSnapshotId`
- `Idempotency-Key`
- `actions: MauthDocumentAction[]`

Successful applies go through the live React action layer, editor history, autosave, and project-file save logic when a file is open. The bridge must not write `storage/projects` directly.

## MCP Tools

The installed app exposes these through its bundled connector. Repository development can start the same source entry point with:

```bash
pnpm agent:mcp
```

Tools:

- `mauth_snapshot`
- `mauth_actions_preview`
- `mauth_actions_apply`
- `mauth_validation_run`
- `mauth_presence_set`
- `mauth_events_read`
- `mauth_comments_read`
- `mauth_comment_create`
- `mauth_comment_resolve`
- `mauth_suggestions_read`
- `mauth_suggestion_create`
- `mauth_suggestion_mark`

## Agent Loop

```text
read snapshot
dry-run action batch
inspect preview and validation
apply same batch with baseSnapshotId
run validation
verify in browser
```

If the snapshot is stale, read a fresh snapshot and rebuild the batch. Do not retry a changed apply payload with the same idempotency key.

Comments and suggestions are review state only. Creating a suggestion does not mutate the document; use `mauth_actions_preview` and `mauth_actions_apply` for actual edits.
