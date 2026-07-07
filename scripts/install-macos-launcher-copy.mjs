export function launcherTerminalIntroLines() {
  return [
    "Starting Mauth Studio...",
    "This window owns any API/web processes started by the launcher.",
    "Desktop mode restarts stale or partial Mauth sessions before opening the browser.",
    "Your Mauth documents are saved on disk; stopping this launcher only stops the local servers.",
    "Press Ctrl+C here to stop them.",
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

export function launcherReadmeText({ repoRoot, pnpmCommand }) {
  return `Mauth Studio

Runs pnpm dev:launch:desktop from:
${repoRoot}

Stored pnpm command:
${pnpmCommand}

At launch time the app uses the stored pnpm command when it still exists, then falls back to pnpm on PATH and common Homebrew/Corepack locations.

This app is a local development launcher. Desktop mode restarts stale or partial Mauth-owned runtime sessions before opening the browser, including the common case where the web server is still running but the API has stopped.

Leave the Terminal window open while using Mauth Studio. Press Ctrl+C in that Terminal window to stop any API/web processes started by the launcher.

Stopping the launcher does not remove your documents. Saved Mauth files live in the active documents folder on disk; the launcher only owns the local API/web server processes.

From the repo root, run pnpm dev:status to inspect local Mauth servers, pnpm dev:stop to stop Mauth-owned local servers, or pnpm dev:launch:replace for a deliberate clean restart.
`;
}
