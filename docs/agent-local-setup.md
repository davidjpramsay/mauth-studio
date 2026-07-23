# Local Agent Setup

This is the intended Codex, Claude Code, and Claude Desktop workflow for Mauth authoring.

For current project state and development context, read `docs/current-state.md`. Ordinary teachers and agent users do not need a source checkout.

## Install The App

Download the current signed DMG from the [GitHub release](https://github.com/davidjpramsay/mauth-studio/releases/tag/v0.1.2), move **Mauth Studio** to Applications, and open it normally.

Mauth Studio starts its packaged FastAPI service on a dynamic loopback port, opens the editor in a native window, and stops the service when the app quits. No Python, Node.js, pnpm, repository checkout, or open Terminal window is required for the app or its bundled connector.

## Connect An Agent Once

1. Keep Mauth Studio in Applications and open it.
2. Choose **Help > Set Up Codex or Claude...**.
3. Copy the setup for the agent being used.
4. Keep Mauth Studio open while the agent reads or edits the current document.

The setup panel provides:

- a `codex mcp add` command for Codex;
- a user-scoped `claude mcp add` command for Claude Code;
- a Claude Desktop `mcpServers.mauth` configuration entry; and
- a connection-test command.

For Codex or Claude Code, run the copied command once in Terminal. For Claude Desktop, open **Settings > Developer > Edit Config**, merge the copied `mauth` entry with any existing `mcpServers`, save, then fully restart Claude Desktop. Do not replace unrelated server entries.

The saved configuration points to the connector inside the installed app. It does not contain an API URL or token. If Mauth Studio is moved after setup, run setup again so the path remains valid.

## Runtime Security

Each app launch creates a new random bridge token. Mauth writes it with the current dynamic URL to the private mode-`0600` runtime manifest under `~/Library/Application Support/Mauth Studio/runtime.json`. The connector reads that file at launch and sends the token only to Mauth's loopback API.

Do not paste the token into an MCP config, prompt, source file, issue, or log. The app removes its runtime manifest when it quits.

The MCP process is a thin wrapper over the local HTTP bridge. It does not read or write React state, localStorage, visible `.mauth` files, project metadata, or autosave files directly.

## Agent Tool Loop

The main authoring loop is:

```text
mauth_snapshot
mauth_actions_preview
mauth_actions_apply
mauth_validation_run
rendered app verification
```

`mauth_actions_apply` requires `baseSnapshotId` from the latest snapshot and adds an idempotency key internally. Comments and suggestions are review state; they do not mutate the document.

## Source Development

Clone the repository only to change or diagnose Mauth itself:

```bash
git clone https://github.com/davidjpramsay/mauth-studio.git
cd mauth-studio
pnpm install
cd apps/api
uv sync
cd ../..
```

Use the watched Electron development shell:

```bash
pnpm macos:dev
```

React/CSS changes use Vite HMR and API source changes reload through Uvicorn. Restart `pnpm macos:dev` after changing Electron main-process, preload, startup, or packaging files.

Repository diagnostics remain available:

```bash
pnpm agent:doctor
pnpm agent:mcp
pnpm macos:build:agent
pnpm smoke:agent-connector
```

The first two use the source wrapper; the generated connector smoke negotiates MCP tools and reads a live snapshot. These are developer checks, not installation requirements for users of the signed app.

Build and install an ad-hoc local checkpoint only when needed:

```bash
pnpm macos:build
pnpm macos:install
```

Use `pnpm macos:release` only for a versioned signed/notarized local release bundle. Use `pnpm macos:ship` only from clean, pushed `main` to publish a verified release.

## Failure Modes

- `APP_NOT_CONNECTED`: open Mauth Studio, wait for the editor window, then retry the connection test.
- `AGENT_AUTH_REQUIRED`: use the bundled connector or repository wrapper so the current token is discovered automatically.
- `MULTIPLE_ACTIVE_EDITORS`: close extra Mauth editor windows or browser tabs.
- `STALE_SNAPSHOT`: call `mauth_snapshot` again and rebuild the action batch.
- `VALIDATION_FAILED`: repair the action payload before applying it.
- `SAVE_CONFLICT`: reload or resolve the active project file before applying again.
- `BRIDGE_TIMEOUT`: reload the Mauth Studio window and retry.

The human app remains the review surface for preview, files, validation, print, and judgement. The connector remains the deterministic agent control surface for snapshots, dry runs, applies, validation, events, comments, suggestions, and presence.
