# Mauth Local Agent Bridge

Mauth exposes a local bridge for Codex, Claude Code, and MCP clients. V1 requires the FastAPI app, the web app, and one active browser editor tab.

## Start

```bash
pnpm dev:api
pnpm dev:web
```

Open `http://localhost:5173`.

Run:

```bash
pnpm agent:doctor
```

## HTTP Contract

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

Run:

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
