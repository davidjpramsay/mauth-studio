import assert from "node:assert/strict";
import test from "node:test";

import {
  launcherControlCommandScript,
  launcherMissingPnpmMessage,
  launcherMissingRepoMessage,
  launcherReadmeText,
  launcherTerminalIntroLines,
} from "./install-macos-launcher-copy.mjs";

test("launcherTerminalIntroLines explains server ownership and document safety", () => {
  const lines = launcherTerminalIntroLines();

  assert(lines.includes("This window owns any API/web processes started by the launcher."));
  assert(lines.includes("Your Mauth documents are saved on disk; stopping this launcher only stops the local servers."));
  assert(lines.includes("Press Ctrl+C here, or use Mauth Studio Stop.command, to stop them."));
});

test("launcherMissingRepoMessage points at the missing repo and reinstall command", () => {
  const message = launcherMissingRepoMessage({
    repoRoot: "/Users/example/Documents/Code/Mauth",
    installCommand: "pnpm macos:install-launcher --reveal",
  });

  assert.match(message, /\/Users\/example\/Documents\/Code\/Mauth/);
  assert.match(message, /pnpm macos:install-launcher --reveal/);
});

test("launcherMissingPnpmMessage gives a recoverable reinstall path", () => {
  const message = launcherMissingPnpmMessage();

  assert.match(message, /pnpm command is not available/);
  assert.match(message, /pnpm macos:install-launcher --reveal/);
});

test("launcherReadmeText documents start, stop, and storage behaviour", () => {
  const readme = launcherReadmeText({
    repoRoot: "/Users/example/Documents/Code/Mauth",
    pnpmCommand: "/opt/homebrew/bin/pnpm",
    companionCommandDirectory: "/Users/example/Applications",
  });

  assert.match(readme, /Runs pnpm dev:launch:desktop/);
  assert.match(readme, /pnpm dev:status/);
  assert.match(readme, /pnpm dev:stop/);
  assert.match(readme, /Mauth Studio Status\.command/);
  assert.match(readme, /Mauth Studio Stop\.command/);
  assert.match(readme, /\/Users\/example\/Applications/);
  assert.match(readme, /Saved Mauth files live in the active documents folder on disk/);
});

test("launcherControlCommandScript wraps status and stop commands with recoverable checks", () => {
  const script = launcherControlCommandScript({
    repoRoot: "/Users/example/Documents/Code/Mauth",
    pnpmCommand: "/opt/homebrew/bin/pnpm",
    pnpmScript: "dev:status",
    title: "Mauth Studio Status",
  });

  assert.match(script, /readonly REPO_ROOT='\/Users\/example\/Documents\/Code\/Mauth'/);
  assert.match(script, /readonly STORED_PNPM_COMMAND='\/opt\/homebrew\/bin\/pnpm'/);
  assert.match(script, /"\$RESOLVED_PNPM_COMMAND" dev:status/);
  assert.match(script, /pause_before_close/);
  assert.match(script, /Mauth Studio Status/);
});

test("launcherControlCommandScript rejects unsupported script names", () => {
  assert.throws(
    () =>
      launcherControlCommandScript({
        repoRoot: "/Users/example/Documents/Code/Mauth",
        pnpmCommand: "/opt/homebrew/bin/pnpm",
        pnpmScript: "dev:status; rm -rf /",
        title: "Mauth Studio Status",
      }),
    /Unsupported pnpm script name/,
  );
});
