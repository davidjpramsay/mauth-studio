import assert from "node:assert/strict";
import test from "node:test";

import {
  desktopReplacementReasons,
  listenersAreAmbiguous,
  runtimeStatusSummary,
  shouldReplaceDesktopListeners,
} from "./mauth-launch-plan.mjs";

const mauthListener = (pid = 1001, names = ["*:5173"]) => ({
  pid,
  names,
  isMauthOwned: true,
});

const externalListener = (pid = 2001, names = ["*:5173"]) => ({
  pid,
  names,
  isMauthOwned: false,
});

test("ambiguous listeners require multiple listener addresses", () => {
  assert.equal(listenersAreAmbiguous([mauthListener(1, ["*:5173"])]), false);
  assert.equal(listenersAreAmbiguous([mauthListener(1, ["127.0.0.1:5173"]), mauthListener(2, ["*:5173"])]), true);
});

test("desktop mode replaces a Mauth web listener when the API is missing", () => {
  const state = {
    apiHealthy: false,
    webHealthy: true,
    apiListeners: [],
    webListeners: [mauthListener()],
  };

  assert.equal(shouldReplaceDesktopListeners(state), true);
  assert.deepEqual(desktopReplacementReasons(state), ["Mauth web is running without a healthy API."]);
});

test("desktop mode replaces stale Mauth-owned listeners but ignores external conflicts", () => {
  assert.equal(
    shouldReplaceDesktopListeners({
      apiHealthy: false,
      webHealthy: false,
      apiListeners: [mauthListener(1, ["*:8000"])],
      webListeners: [mauthListener(2, ["*:5173"])],
    }),
    true,
  );
  assert.equal(
    shouldReplaceDesktopListeners({
      apiHealthy: false,
      webHealthy: false,
      apiListeners: [externalListener(1, ["*:8000"])],
      webListeners: [externalListener(2, ["*:5173"])],
    }),
    false,
  );
});

test("desktop mode reuses a healthy API while starting a missing web app", () => {
  assert.equal(
    shouldReplaceDesktopListeners({
      apiHealthy: true,
      webHealthy: false,
      apiListeners: [mauthListener(1, ["*:8000"])],
      webListeners: [],
    }),
    false,
  );
});

test("runtime status explains a clean stopped app as stopped", () => {
  assert.deepEqual(
    runtimeStatusSummary({
      apiHealthy: false,
      webHealthy: false,
      apiListeners: [],
      webListeners: [],
      webUrl: "http://127.0.0.1:5173",
    }),
    {
      level: "info",
      message: "Mauth is stopped.",
      detail: "Start it with pnpm dev:launch:desktop, or double-click ~/Applications/Mauth Studio.app.",
    },
  );
});

test("runtime status reports a ready API and web pair", () => {
  assert.deepEqual(
    runtimeStatusSummary({
      apiHealthy: true,
      webHealthy: true,
      apiListeners: [mauthListener(1, ["*:8000"])],
      webListeners: [mauthListener(2, ["*:5173"])],
      webUrl: "http://127.0.0.1:5173",
    }),
    {
      level: "ok",
      message: "Mauth is ready at http://127.0.0.1:5173.",
      detail: "Use the open browser tab, or stop the launcher Terminal with Ctrl+C when finished.",
    },
  );
});

test("runtime status points stale Mauth listeners at desktop repair", () => {
  assert.deepEqual(
    runtimeStatusSummary({
      apiHealthy: false,
      webHealthy: true,
      apiListeners: [],
      webListeners: [mauthListener(2, ["*:5173"])],
      webUrl: "http://127.0.0.1:5173",
    }),
    {
      level: "warn",
      message: "Mauth is partially running or stale.",
      detail: "Run pnpm dev:launch:desktop to repair it, or pnpm dev:stop to stop Mauth-owned listeners.",
    },
  );
});

test("runtime status distinguishes non-Mauth port conflicts", () => {
  assert.deepEqual(
    runtimeStatusSummary({
      apiHealthy: false,
      webHealthy: false,
      apiListeners: [externalListener(1, ["*:8000"])],
      webListeners: [],
      webUrl: "http://127.0.0.1:5173",
    }),
    {
      level: "warn",
      message: "Mauth is not ready and the configured ports are occupied by non-Mauth processes.",
      detail: "Stop the conflicting processes, or set MAUTH_AGENT_API_URL and MAUTH_WEB_URL to free ports.",
    },
  );
});
