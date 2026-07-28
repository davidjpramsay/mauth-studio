import assert from "node:assert/strict";
import test from "node:test";

import {
  MAUTH_SOLUTION_VALIDATION_OPEN_CHANNEL,
  MAUTH_SYSTEM_STATUS_OPEN_CHANNEL,
  MAUTH_THEME_TOGGLE_CHANNEL,
  sendDesktopMenuCommand,
} from "./menu-commands.mjs";

test("desktop menu commands use stable renderer channels", () => {
  assert.equal(MAUTH_SYSTEM_STATUS_OPEN_CHANNEL, "mauth:open-system-status");
  assert.equal(MAUTH_THEME_TOGGLE_CHANNEL, "mauth:toggle-theme");
  assert.equal(MAUTH_SOLUTION_VALIDATION_OPEN_CHANNEL, "mauth:open-solution-validation");
});

test("desktop menu commands send only to a live window", () => {
  const channels = [];
  const browserWindow = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: (channel) => channels.push(channel),
    },
  };

  assert.equal(sendDesktopMenuCommand(browserWindow, MAUTH_SYSTEM_STATUS_OPEN_CHANNEL), true);
  assert.equal(sendDesktopMenuCommand(browserWindow, MAUTH_THEME_TOGGLE_CHANNEL), true);
  assert.equal(sendDesktopMenuCommand(browserWindow, MAUTH_SOLUTION_VALIDATION_OPEN_CHANNEL), true);
  assert.deepEqual(channels, [MAUTH_SYSTEM_STATUS_OPEN_CHANNEL, MAUTH_THEME_TOGGLE_CHANNEL, MAUTH_SOLUTION_VALIDATION_OPEN_CHANNEL]);
  assert.equal(sendDesktopMenuCommand(null, MAUTH_THEME_TOGGLE_CHANNEL), false);
  assert.equal(sendDesktopMenuCommand({ isDestroyed: () => true }, MAUTH_THEME_TOGGLE_CHANNEL), false);
});
