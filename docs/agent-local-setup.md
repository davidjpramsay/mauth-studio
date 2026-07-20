# Local Agent Setup

This is the intended Codex/Claude Code workflow for Mauth authoring.

For current project state and next-work context, read `docs/current-state.md` before starting a new model/session.

## Local Project Folder

Normal teacher use does not require this repository. Download the signed DMG from the [GitHub release](https://github.com/davidjpramsay/mauth-studio/releases/tag/v0.1.0), move Mauth Studio to Applications, and open it normally.

Clone or pull the repo into a normal local project folder when connecting Codex/Claude helper tools or developing the app. For bridge tools only, install the Node dependencies from the repo root:

```bash
pnpm install
```

For application development, also install the Python environment:

```bash
cd apps/api
uv sync
cd ../..
```

Build and install an ad-hoc-signed local checkpoint only when needed:

```bash
pnpm macos:build
pnpm macos:install
```

Then open it normally:

```bash
open ~/Applications/Mauth\ Studio.app
```

Mauth Studio starts its packaged FastAPI service on a dynamic loopback port, opens the editor in a native window, and stops the service when the app quits. No Terminal windows need to remain open. If an unsaved page blocks quitting, the native confirmation explains that the current draft is backed up before allowing Close.

For ordinary source development, use:

```bash
pnpm macos:dev
```

The Codex app also exposes a project Run action through `.codex/environments/environment.toml`; it calls `script/build_and_run.sh` to build, sign, and launch the current bundle.

Do not run the Developer ID/notarization pipeline after routine source edits. `pnpm macos:release` is reserved for building versioned external artifacts, and `pnpm macos:ship` is the guarded publication path from clean, pushed `main` after the full quality gate passes.

The previous Terminal-backed browser launcher remains available for runtime debugging:

```bash
pnpm dev:launch:desktop
pnpm dev:status
pnpm dev:stop
```

These commands manage only the fixed-port development launcher, not a running packaged app. Quit the packaged app from its normal macOS menu.

For lower-level debugging, run the API and web app in two terminals:

```bash
pnpm dev:api
pnpm dev:web
```

Open the web URL printed by `pnpm dev:web` (usually `http://localhost:5173`) and keep exactly one Mauth editor tab active.

Check the bridge:

```bash
pnpm agent:doctor
```

With the packaged app, the doctor discovers the current dynamic URL and per-launch bridge token from `~/Library/Application Support/Mauth Studio/runtime.json`. The file is private to the local user and is removed when Mauth quits. If a manual Vite runtime uses another URL, pass it explicitly:

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
      "args": ["--dir", "/Users/djpramsay@acc.edu.au/Documents/Code/Mauth", "agent:mcp"]
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

The human app remains the review surface: preview, file drawer, validation, print, and human judgement.

The local bridge is the agent control surface: snapshot, dry run, apply, validation, events, and presence.

This gives local Codex/Claude the structure of an API-driven product without making the app hosted-first. Hosted collaboration can come later, but V1 assumes the standalone app is running locally and the helper repository is available when MCP tooling is required.

## Failure Modes

- `AGENT_AUTH_REQUIRED`: use `pnpm agent:doctor`, `pnpm agent:mcp`, or the normal bridge smoke command so the current packaged token is discovered automatically. Do not copy the token into a config file.
- `APP_NOT_CONNECTED`: open `~/Applications/Mauth Studio.app`, wait for its editor window, then rerun `pnpm agent:doctor`. For a deliberate browser-debug runtime, run `pnpm dev:launch:desktop` and keep exactly one Mauth tab open.
- `MULTIPLE_ACTIVE_EDITORS`: close extra Mauth tabs.
- `STALE_SNAPSHOT`: call `mauth_snapshot` again and rebuild the action batch.
- `VALIDATION_FAILED`: repair the action payload.
- `ACTION_FAILED`: inspect the action result and current snapshot.
- `SAVE_CONFLICT`: reload or resolve the active project file before applying again.
- `BRIDGE_TIMEOUT`: reload the Mauth Studio window and retry.
