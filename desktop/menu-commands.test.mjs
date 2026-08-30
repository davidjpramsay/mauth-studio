import assert from "node:assert/strict";
import test from "node:test";

import {
  MAUTH_ACTIVE_DOCUMENT_CLOSE_CHANNEL,
  MAUTH_SOLUTION_VALIDATION_OPEN_CHANNEL,
  MAUTH_SYSTEM_STATUS_OPEN_CHANNEL,
  MAUTH_THEME_TOGGLE_CHANNEL,
  MAUTH_WINDOW_CLOSE_REQUEST_CHANNEL,
  desktopFileMenuItems,
  sendDesktopMenuCommand,
} from "./menu-commands.mjs";

test("desktop menu commands use stable renderer channels", () => {
  assert.equal(MAUTH_SYSTEM_STATUS_OPEN_CHANNEL, "mauth:open-system-status");
  assert.equal(MAUTH_THEME_TOGGLE_CHANNEL, "mauth:toggle-theme");
  assert.equal(MAUTH_SOLUTION_VALIDATION_OPEN_CHANNEL, "mauth:open-solution-validation");
  assert.equal(MAUTH_ACTIVE_DOCUMENT_CLOSE_CHANNEL, "mauth:close-active-document");
  assert.equal(MAUTH_WINDOW_CLOSE_REQUEST_CHANNEL, "mauth:request-window-close");
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

test("desktop File menu closes tabs before assigning a separate window shortcut", () => {
  const actions = [];
  const items = desktopFileMenuItems({
    closeActiveDocument: () => actions.push("document"),
    closeWindow: () => actions.push("window"),
  });

  assert.deepEqual(
    items.map(({ label, accelerator }) => ({ label, accelerator })),
    [
      { label: "Close Tab", accelerator: "CmdOrCtrl+W" },
      { label: "Close Window", accelerator: "CmdOrCtrl+Shift+W" },
    ],
  );
  items[0].click();
  items[1].click();
  assert.deepEqual(actions, ["document", "window"]);
});
