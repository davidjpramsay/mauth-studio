import assert from "node:assert/strict";
import test from "node:test";

import { desktopReplacementReasons, listenersAreAmbiguous, shouldReplaceDesktopListeners } from "./mauth-launch-plan.mjs";

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
