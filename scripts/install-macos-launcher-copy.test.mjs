import assert from "node:assert/strict";
import test from "node:test";

import {
  launcherMissingPnpmMessage,
  launcherMissingRepoMessage,
  launcherReadmeText,
  launcherTerminalIntroLines,
} from "./install-macos-launcher-copy.mjs";

test("launcherTerminalIntroLines explains server ownership and document safety", () => {
  const lines = launcherTerminalIntroLines();

  assert(lines.includes("This window owns any API/web processes started by the launcher."));
  assert(lines.includes("Your Mauth documents are saved on disk; stopping this launcher only stops the local servers."));
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
  });

  assert.match(readme, /Runs pnpm dev:launch:desktop/);
  assert.match(readme, /pnpm dev:status/);
  assert.match(readme, /pnpm dev:stop/);
  assert.match(readme, /Saved Mauth files live in the active documents folder on disk/);
});
