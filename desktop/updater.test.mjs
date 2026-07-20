import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { createDesktopUpdaterController, desktopUpdateMenuPresentation, initialDesktopUpdateState, releaseNotesText } from "./updater.mjs";

class FakeUpdater extends EventEmitter {
  checkCalls = 0;
  downloadCalls = 0;
  installCalls = [];

  async checkForUpdates() {
    this.checkCalls += 1;
  }

  async downloadUpdate() {
    this.downloadCalls += 1;
  }

  quitAndInstall(...args) {
    this.installCalls.push(args);
  }
}

function flushEvents() {
  return new Promise((resolve) => setImmediate(resolve));
}

function updaterHarness({ enabled = true, dialogResponses = [] } = {}) {
  const updater = new FakeUpdater();
  const dialogs = [];
  const logs = [];
  const progress = [];
  const timers = [];
  const window = {
    isDestroyed: () => false,
    setProgressBar: (value) => progress.push(value),
  };
  const controller = createDesktopUpdaterController({
    enabled,
    updater,
    dialog: {
      async showMessageBox(...args) {
        const options = args.at(-1);
        dialogs.push(options);
        return { response: dialogResponses.shift() ?? 1 };
      },
    },
    getWindow: () => window,
    log: (message) => logs.push(message),
    refreshMenu: () => {},
    checkDelayMs: 25,
    setTimeoutFn: (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeoutFn: () => {},
  });
  return { controller, dialogs, logs, progress, timers, updater };
}

test("desktop updater defaults remain teacher-controlled", () => {
  const { updater } = updaterHarness();
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowPrerelease, true);
  assert.equal(updater.allowDowngrade, false);
});

test("automatic checks run once only for packaged builds", async () => {
  const packaged = updaterHarness();
  assert.equal(packaged.controller.scheduleAutomaticCheck(), true);
  assert.equal(packaged.controller.scheduleAutomaticCheck(), false);
  assert.deepEqual(
    packaged.timers.map(({ delay }) => delay),
    [25],
  );
  packaged.timers[0].callback();
  await flushEvents();
  assert.equal(packaged.updater.checkCalls, 1);

  const development = updaterHarness({ enabled: false });
  assert.equal(development.controller.scheduleAutomaticCheck(), false);
  assert.equal(development.updater.checkCalls, 0);
  assert.equal(development.controller.menuItem().enabled, false);
});

test("available updates ask before downloading", async () => {
  const { controller, dialogs, updater } = updaterHarness({ dialogResponses: [0] });
  updater.emit("update-available", { version: "0.1.1", releaseNotes: "Improved graph tools." });
  await flushEvents();

  assert.equal(dialogs[0].title, "Mauth Studio update available");
  assert.equal(dialogs[0].detail, "Improved graph tools.");
  assert.equal(updater.downloadCalls, 1);
  assert.equal(controller.getState().status, "downloading");
});

test("downloaded updates wait for an explicit restart", async () => {
  const { controller, dialogs, updater } = updaterHarness({ dialogResponses: [1, 0] });
  updater.emit("update-downloaded", { version: "0.1.1" });
  await flushEvents();

  assert.equal(dialogs[0].title, "Mauth Studio update ready");
  assert.deepEqual(updater.installCalls, []);
  assert.equal(controller.menuItem().label, "Restart to Install Mauth Studio 0.1.1…");

  controller.menuItem().click();
  await flushEvents();
  assert.deepEqual(updater.installCalls, [[false, true]]);
});

test("manual checks report current status and errors while background failures stay quiet", async () => {
  const current = updaterHarness();
  await current.controller.checkManually();
  current.updater.emit("update-not-available", { version: "0.1.0" });
  await flushEvents();
  assert.equal(current.dialogs[0].title, "Mauth Studio is up to date");

  const background = updaterHarness();
  background.controller.scheduleAutomaticCheck();
  background.timers[0].callback();
  await flushEvents();
  background.updater.emit("error", new Error("offline"));
  await flushEvents();
  assert.equal(background.dialogs.length, 0);
  assert.equal(background.controller.getState().status, "error");

  const manual = updaterHarness();
  await manual.controller.checkManually();
  manual.updater.emit("error", new Error("offline"));
  await flushEvents();
  assert.equal(manual.dialogs[0].title, "Mauth Studio update check failed");
});

test("a teacher-approved download failure is reported", async () => {
  const harness = updaterHarness({ dialogResponses: [0] });
  harness.updater.downloadUpdate = async () => {
    throw new Error("download unavailable");
  };
  harness.updater.emit("update-available", { version: "0.1.1" });
  await flushEvents();

  assert.equal(harness.dialogs[1].title, "Mauth Studio update download failed");
  assert.equal(harness.controller.getState().status, "error");
});

test("download progress updates the menu and window progress", () => {
  const { controller, progress, updater } = updaterHarness();
  updater.emit("download-progress", { percent: 42.4 });
  assert.equal(controller.menuItem().label, "Downloading Update (42%)…");
  assert.deepEqual(progress, [0.424]);
});

test("menu presentation and release notes remain stable", () => {
  assert.deepEqual(desktopUpdateMenuPresentation(initialDesktopUpdateState()), {
    label: "Check for Updates…",
    enabled: true,
    action: "check",
  });
  assert.equal(releaseNotesText({ releaseNotes: [{ note: "One" }, { note: "Two" }] }), "One\n\nTwo");
  assert.match(releaseNotesText({}), /release page/);
});
