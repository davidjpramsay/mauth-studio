# Connect Codex Or Claude

Mauth Studio works as a standalone app. Connecting an agent is optional and takes one setup command.

## Install Mauth Studio

1. [Download the signed Apple Silicon DMG](https://github.com/davidjpramsay/mauth-studio/releases/download/v0.1.3/Mauth-Studio-0.1.3-arm64.dmg).
2. Open the DMG and move **Mauth Studio** to Applications.
3. Open Mauth Studio normally.

No source checkout, Python, Node.js, pnpm, or permanently open Terminal window is required.

## Connect An Agent Once

1. In Mauth Studio, choose **Help > Set Up Codex or Claude...**.
2. Copy the command or configuration for your agent.
3. Run the Codex or Claude Code command once. For Claude Desktop, merge the shown `mauth` entry into **Settings > Developer > Edit Config**, then restart Claude Desktop.
4. Keep Mauth Studio open while the agent is using it.

That is the complete setup. You do not need a special prompt. Ask naturally, for example:

> Use Mauth Studio to inspect the open assessment, fix its formatting, validate it, and check the Student and Solutions previews.

MCP is simply the local connection that gives the agent structured Mauth tools. It does not require the repository and does not upload a document to a separate Mauth service.

## What The Connector Does

The installed configuration points to the connector inside **Mauth Studio.app**. Each time Mauth starts, the connector discovers the app's current local address and temporary authentication token automatically.

- Do not copy the token into a prompt or configuration file.
- Run setup again only if Mauth Studio moves to a different path or the agent configuration is removed.
- Use `activeDocumentId`/`openDocuments` when several Mauth tabs are open.

The normal authoring loop is:

```text
mauth_snapshot
mauth_actions_preview
mauth_actions_apply
mauth_validation_run
rendered Student and Solutions/Teacher verification
```

Agent actions pass through Mauth's editor history, autosave, validation, and revision checks. Direct edits to teacher files or private Application Support state are recovery-only.

## Troubleshooting

- `APP_NOT_CONNECTED`: open Mauth Studio, wait for the editor, then retry.
- `STALE_SNAPSHOT`: read a new snapshot and rebuild the action batch.
- `SAVE_CONFLICT`: resolve or reload the active file in Mauth before retrying.
- Mauth moved or was reinstalled elsewhere: repeat **Help > Set Up Codex or Claude...**.

Developers should clone the repository and follow `AGENTS.md` and `docs/current-state.md`. Technical connector details live in `docs/agent-bridge.md`; source diagnostics such as `pnpm agent:doctor` and `pnpm agent:mcp` are not end-user installation steps.
