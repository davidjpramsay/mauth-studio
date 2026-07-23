# Local Agent Bridge

Mauth runs locally with an implemented agent bridge for assessment authoring. Normal agent work uses that bridge instead of direct project-file edits or an in-app provider chat panel.

The bridge is a machine-facing contract around the existing editor state, Mauth action layer, validators, project-file API, and browser preview. Codex, Claude Code, Cursor, or a local MCP/App tool should use this contract for authoring work while the human keeps using the web app as the review and preview surface.

## Product Shape

```text
Repo and source files
  App development, tests, schemas, docs, CI, and durable fixtures.

Local Mauth API and web app
  Assessment authoring state, project files, autosave, validation, preview, and browser review.

Local agent bridge
  Snapshot, dry-run, apply, validate, comments, suggestions, presence, and events for external agents.
```

This is still a local-first workflow. The app does not need hosted collaboration before the bridge is useful. If Mauth becomes hosted later, the same contract can become the hosted collaboration/API boundary.

## Authoring Loop

Agents should use this loop for document authoring:

1. Read the current Mauth snapshot.
2. Build a structured Mauth action batch.
3. Dry-run the batch.
4. Inspect preview summary, validation output, changed ids, and warnings.
5. Apply the same batch with the current revision and an idempotency key.
6. Verify the rendered result in the browser.

If the bridge is unavailable in a given runtime, agents should prefer the closest existing equivalent: Mauth actions in code/tests, the project-file API, the visible Files drawer, and browser verification. Direct edits under the selected documents folder, its `.mauth` metadata, `~/Library/Application Support/Mauth Studio/storage`, or legacy `storage/projects` are a recovery fallback, not the normal authoring path.

## Local Endpoints

The implemented bridge surface is local and deterministic:

```text
GET  /api/agent/current/snapshot
POST /api/agent/current/actions/preview
POST /api/agent/current/actions/apply
POST /api/agent/current/validation/run
POST /api/agent/current/browser/register
POST /api/agent/current/browser/unregister
GET  /api/agent/current/browser/requests?sessionId=...
POST /api/agent/current/browser/respond
GET  /api/agent/current/events?after=...
POST /api/agent/current/presence
GET  /api/agent/current/comments
POST /api/agent/current/comments
POST /api/agent/current/comments/{id}/resolve
GET  /api/agent/current/suggestions
POST /api/agent/current/suggestions
POST /api/agent/current/suggestions/{id}/accept
POST /api/agent/current/suggestions/{id}/reject
GET  /api/system/status
GET  /.well-known/mauth-agent.json
GET  /agent-docs
```

`/api/system/status` is the process and bridge-health check for local tools. It reports the API build/version state, runtime kind, active documents folder, default project, browser bridge session count, authentication requirement, and route names. The standalone app publishes its dynamic URL and random per-launch bridge token in the mode-`0600` file `~/Library/Application Support/Mauth Studio/runtime.json`; the bundled connector, `pnpm agent:doctor`, `pnpm agent:mcp`, and bridge smoke tooling discover them automatically before checking status.

Packaged private API routes require `Authorization: Bearer <token>`. Electron injects that header into its own `/api/*` traffic without exposing the token to document state or renderer JavaScript. Codex and Claude wrappers read it from the runtime manifest, and the manifest is removed when the owning app quits. Health, discovery, and system-status routes stay readable for diagnostics, but they never return the token. Fixed-port development runs remain unauthenticated unless `MAUTH_AGENT_TOKEN` is explicitly configured.

The browser registers when the editor loads and unregisters with a beacon-safe request on normal page exit. Unregistering removes the session and releases requests assigned to it immediately. A crashed browser still falls back to the server-side session TTL.

## Snapshot Shape

The snapshot is compact, stable, and targeted at agent planning. Its contract includes:

- active project id, file path, saved revision, dirty state, and autosave state
- front matter, formatting config, page format, and selected logo summary
- question, part, subpart, and module ids with labels and text previews
- diagram summaries with renderer type, ids, warnings, and sizing/alignment state
- student/solution visibility markers and response-space summaries
- solution coverage, selected shared choice answers, and text or surface mark ticks where available
- validation warnings and layout/preview warnings
- action links and the preferred mutation precondition

Agents should target ids from this snapshot. They should not infer document identity from DOM order, React component state, browser localStorage, or raw JSON file paths.

Layout warnings are measured browser evidence, not speculative action validation. After a Student or Solutions preview has rendered, its page totals and oversized-page results are retained for the current document fingerprint and exposed as `rendered-page-overflow` warnings. Editing or opening another document clears those reports until the new preview is measured. A dry-run or applied-action result snapshot does not reuse warnings measured against the previous rendered document; verify the changed document in the browser to obtain fresh layout evidence.

## Mutation Rules

Action application is safe to retry and safe under stale state:

- require `baseSnapshotId`
- require `Idempotency-Key` for write routes
- return `409 STALE_SNAPSHOT` with a fresh snapshot when the document changed
- return field-level validation issues for malformed action payloads
- apply batches atomically
- commit through the normal editor history/autosave path
- return changed ids, warnings, validation results, and the next snapshot

File operations should keep using the project-file API and loaded revision checks. The bridge must not create a second hidden save path that bypasses project metadata, version snapshots, autosave alignment, or stale-file protection.

## Comments And Suggestions

Comments and suggestions are review state, not committed document edits.

Use comments for notes such as:

- wording may not match curriculum intent
- diagram label likely overlaps
- solution mark total looks wrong
- source conversion needs teacher judgement

Use suggestions for proposed replacements that a human can accept or reject. A suggestion should target a stable question, part, subpart, module, or text range where possible, include the proposed action payload or replacement text, and record the proposing actor.

Comments and suggestions are local to the active document. The current bridge does not provide multi-user realtime collaboration.

## Presence And Events

Presence and events should make agent work inspectable without exposing prompt internals.

Presence examples:

- `ai:codex` is inspecting layout
- `ai:codex` is dry-running a solution batch
- `ai:codex` is verifying diagrams in the browser

Event examples:

- snapshot read
- action previewed
- validation failed
- action batch applied
- suggestion created
- browser smoke completed

Events should be concise, structured, and safe to show in a future activity panel.

## Non-Goals

The local agent bridge is not:

- a provider-backed chat panel
- a hidden model router
- a replacement for the human editor UI
- a license to mutate raw project JSON directly
- a second autosave or file-save system
- a full realtime collaboration server

Provider calls can be added later as optional tooling only after the local deterministic contract is working.

## Mauth Agent Connector

The signed app includes a self-contained stdio MCP connector under `Contents/Resources/agent`. It is built from the same `scripts/mauth-agent-mcp.mjs` entry point as development tooling, bundles the MCP SDK and validation dependencies, and launches with the Electron runtime already inside the app. Agent users therefore do not need Node, pnpm, a source checkout, or a separate agent-files download.

Choose **Help > Set Up Codex or Claude...** for the one-time Codex, Claude Code, or Claude Desktop configuration. The saved client configuration contains only the connector command path. The connector discovers the dynamic URL and token on every launch; the token is not persisted in client configuration.

For source development, run:

```bash
pnpm agent:mcp
```

The MCP server wraps the HTTP bridge and exposes:

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

Run `pnpm agent:doctor` to check API health, web reachability, MCP dependencies, discovery docs, and active editor presence. Run `pnpm macos:build:agent` followed by `pnpm smoke:agent-connector` to exercise MCP negotiation and a live snapshot through the generated self-contained bundle.

Keep `pnpm test:web-actions`, `pnpm smoke:context-menu-actions`, and `pnpm smoke:file-manager` green while evolving the bridge. Comments and suggestions are intentionally non-mutating review state; applying document edits still goes through preview/apply action batches.
