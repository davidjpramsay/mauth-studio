import assert from "node:assert/strict";
import test from "node:test";

import { afterEditorStateSettles, bridgeRetryDelayMs, isLostBrowserSession } from "./mauthAgentBridgeRetry.ts";

function apiError(status: number, detail?: unknown) {
  return Object.assign(new Error(`Request failed: ${status}`), { name: "ApiError", status, detail });
}

test("missing browser bridge routes stop retrying", () => {
  assert.equal(bridgeRetryDelayMs(apiError(404), false, 0), null);
  assert.equal(bridgeRetryDelayMs(apiError(403), false, 0), null);
});

test("lost sessions register again and recognise FastAPI detail envelopes", () => {
  const error = apiError(404, { detail: { code: "APP_NOT_CONNECTED" } });
  assert.equal(isLostBrowserSession(error), true);
  assert.equal(bridgeRetryDelayMs(error, false, 0), 1_500);
});

test("temporary failures back off to a bounded delay", () => {
  assert.equal(bridgeRetryDelayMs(new TypeError("Network unavailable"), false, 0), 1_500);
  assert.equal(bridgeRetryDelayMs(new TypeError("Network unavailable"), false, 3), 12_000);
  assert.equal(bridgeRetryDelayMs(new TypeError("Network unavailable"), false, 9), 30_000);
  assert.equal(bridgeRetryDelayMs(new TypeError("Network unavailable"), true, 1), 2_000);
});

test("editor lifecycle acknowledgement falls back when animation frames are suspended", async () => {
  let fallback: (() => void) | undefined;
  const promise = afterEditorStateSettles({
    requestAnimationFrame: () => 1,
    setTimeout: (callback) => {
      fallback = callback;
      return 2;
    },
    clearTimeout: () => undefined,
  });
  fallback?.();
  await promise;
});

test("editor lifecycle acknowledgement prefers two visible animation frames", async () => {
  const frames: FrameRequestCallback[] = [];
  let clearedTimer: number | null = null;
  const promise = afterEditorStateSettles({
    requestAnimationFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
    setTimeout: () => 7,
    clearTimeout: (timer) => {
      clearedTimer = timer;
    },
  });
  frames.shift()?.(0);
  frames.shift()?.(1);
  await promise;
  assert.equal(clearedTimer, 7);
});
