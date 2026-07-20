export function shellSingleQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function launcherTerminalIntroLines({ stopCommandName = "Mauth Studio Stop.command" } = {}) {
  return [
    "Starting Mauth Studio...",
    "This window owns any API/web processes started by the launcher.",
    "Desktop mode restarts stale or partial Mauth sessions before opening the browser.",
    "Your Mauth documents are saved on disk; stopping this launcher only stops the local servers.",
    `Press Ctrl+C here, or use ${stopCommandName}, to stop them.`,
  ];
}

export function launcherMissingRepoMessage({ repoRoot, installCommand = "pnpm macos:install-launcher --reveal" }) {
  return `The Mauth Studio project folder could not be found at:

${repoRoot}

Move it back there, or reinstall the launcher from the current repo with:

${installCommand}`;
}

export function launcherMissingPnpmMessage({ installCommand = "pnpm macos:install-launcher --reveal" } = {}) {
  return `The pnpm command is not available to the launcher.

Install pnpm again, or reinstall the launcher from the Mauth repo with:

${installCommand}`;
}

export function launcherControlCommandScript({ repoRoot, pnpmCommand, pnpmScript, title }) {
  if (!/^[A-Za-z0-9:_-]+$/.test(pnpmScript)) {
    throw new Error(`Unsupported pnpm script name: ${pnpmScript}`);
  }
  const safeTitle = title || "Mauth Studio";
  const quotedTitle = shellSingleQuote(safeTitle);
  return `#!/bin/zsh
set -euo pipefail

readonly REPO_ROOT=${shellSingleQuote(repoRoot)}
readonly STORED_PNPM_COMMAND=${shellSingleQuote(pnpmCommand)}
readonly MISSING_REPO_MESSAGE=${shellSingleQuote(launcherMissingRepoMessage({ repoRoot }))}
readonly MISSING_PNPM_MESSAGE=${shellSingleQuote(launcherMissingPnpmMessage())}

pause_before_close() {
  echo ""
  echo "Press any key to close this window."
  read -k 1 -s || true
}

resolve_pnpm_command() {
  if [[ -n "$STORED_PNPM_COMMAND" ]]; then
    if [[ "$STORED_PNPM_COMMAND" == */* && -x "$STORED_PNPM_COMMAND" ]]; then
      printf "%s" "$STORED_PNPM_COMMAND"
      return 0
    fi
    if [[ "$STORED_PNPM_COMMAND" != */* ]] && command -v "$STORED_PNPM_COMMAND" >/dev/null 2>&1; then
      command -v "$STORED_PNPM_COMMAND"
      return 0
    fi
  fi

  if command -v pnpm >/dev/null 2>&1; then
    command -v pnpm
    return 0
  fi

  local candidate
  for candidate in "$HOME/Library/pnpm/pnpm" "/opt/homebrew/bin/pnpm" "/usr/local/bin/pnpm"; do
    if [[ -x "$candidate" ]]; then
      printf "%s" "$candidate"
      return 0
    fi
  done

  return 1
}

printf '\\033]0;%s\\007' ${quotedTitle}
clear
echo ${quotedTitle}
echo ""

if [[ ! -f "$REPO_ROOT/package.json" || ! -f "$REPO_ROOT/scripts/mauth-launch.mjs" ]]; then
  echo "$MISSING_REPO_MESSAGE"
  pause_before_close
  exit 1
fi

readonly RESOLVED_PNPM_COMMAND="$(resolve_pnpm_command || true)"
if [[ -z "$RESOLVED_PNPM_COMMAND" ]]; then
  echo "$MISSING_PNPM_MESSAGE"
  pause_before_close
  exit 1
fi

echo "Repo: $REPO_ROOT"
echo "Using pnpm: $RESOLVED_PNPM_COMMAND"
echo ""
cd "$REPO_ROOT"
"$RESOLVED_PNPM_COMMAND" ${pnpmScript}
pause_before_close
`;
}

export function launcherReadmeText({
  repoRoot,
  pnpmCommand,
  companionCommandDirectory = "~/Applications",
  statusCommandName = "Mauth Studio Status.command",
  stopCommandName = "Mauth Studio Stop.command",
}) {
  return `Mauth Studio

Runs pnpm dev:launch:desktop from:
${repoRoot}

Stored pnpm command:
${pnpmCommand}

At launch time the app uses the stored pnpm command when it still exists, then falls back to pnpm on PATH and common Homebrew/Corepack locations.

This app is a local development launcher. Desktop mode restarts stale or partial Mauth-owned runtime sessions before opening the browser, including the common case where the web server is still running but the API has stopped.

Leave the Terminal window open while using Mauth Studio. Press Ctrl+C in that Terminal window to stop any API/web processes started by the launcher.

Stopping the launcher does not remove your documents. Saved Mauth files live in the active documents folder on disk; the launcher only owns the local API/web server processes.

Companion commands are installed beside the app in:
${companionCommandDirectory}

- ${statusCommandName} checks whether the local API/web servers are ready, stopped, stale, or conflicting.
- ${stopCommandName} stops Mauth-owned local API/web servers without needing to remember a terminal command.

From the repo root, run pnpm dev:status to inspect local Mauth servers, pnpm dev:stop to stop Mauth-owned local servers, or pnpm dev:launch:replace for a deliberate clean restart.
`;
}
