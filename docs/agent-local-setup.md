# Local Agent Setup

This is the intended Codex/Claude Code workflow for Mauth authoring.

## Local Project Folder

Clone or pull the repo into a normal local project folder. From the repo root:

```bash
pnpm install
cd apps/api
uv sync
cd ../..
```

For normal local use, run the app through the launcher:

```bash
pnpm dev:launch
```

On macOS, install the Finder/desktop entry point:

```bash
pnpm macos:install-launcher
```

This creates `~/Applications/Mauth Studio.app`, which opens a labelled Terminal session and runs the same launcher/status checks.

If stale manual servers are still running, stop their terminals with `Ctrl+C`. To force a clean launcher-owned restart, run:

```bash
pnpm dev:launch:replace
```

The normal launcher reuses healthy existing Mauth servers, but it now warns when same-port listeners could make `localhost` and `127.0.0.1` show different app versions.

For lower-level debugging, run the API and web app in two terminals:

```bash
pnpm dev:api
pnpm dev:web
```

Open the web URL printed by the launcher or by `pnpm dev:web` (usually `http://localhost:5173`) and keep exactly one Mauth editor tab active.

Check the bridge:

```bash
pnpm agent:doctor
```

If Vite prints a different web URL, pass it to the doctor:

```bash
MAUTH_WEB_URL=http://127.0.0.1:5174 pnpm agent:doctor
```

## MCP

The MCP server wraps the local HTTP bridge. It does not read or write React state, localStorage, visible document files, `.mauth` metadata, or legacy `storage/projects` files directly.

Claude Desktop example:

```json
{
  "mcpServers": {
    "mauth": {
      "command": "pnpm",
      "args": ["--dir", "/Users/djpramsay@acc.edu.au/Documents/Code/Mauth", "agent:mcp"],
      "env": {
        "MAUTH_AGENT_API_URL": "http://127.0.0.1:8000"
      }
    }
  }
}
```

Tool loop:

```text
mauth_snapshot
mauth_actions_preview
mauth_actions_apply
mauth_validation_run
mauth_comment_create
mauth_suggestion_create
mauth_events_read
```

`mauth_actions_apply` requires `baseSnapshotId` from the latest snapshot and uses an `Idempotency-Key` header internally.
Comments and suggestions are review state; they do not mutate the document.

## Proof-Style Split

The human app remains the review surface: preview, file drawer, validation, browser print, and human judgement.

The local bridge is the agent control surface: snapshot, dry run, apply, validation, events, and presence.

This gives local Codex/Claude the structure of an API-driven product without making the app hosted-first. Hosted collaboration can come later, but V1 assumes the repo, API, and browser are running on the user’s machine.

## Failure Modes

- `APP_NOT_CONNECTED`: start the API/web app and open the web URL printed by `pnpm dev:web`.
- `MULTIPLE_ACTIVE_EDITORS`: close extra Mauth tabs.
- `STALE_SNAPSHOT`: call `mauth_snapshot` again and rebuild the action batch.
- `VALIDATION_FAILED`: repair the action payload.
- `ACTION_FAILED`: inspect the action result and current snapshot.
- `SAVE_CONFLICT`: reload or resolve the active project file before applying again.
- `BRIDGE_TIMEOUT`: reload the browser app and retry.
