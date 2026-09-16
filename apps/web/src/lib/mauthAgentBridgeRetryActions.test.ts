import assert from "node:assert/strict";
import test from "node:test";

import { afterEditorStateSettles, bridgeRetryDelayMs, isLostBrowserSession, runMauthAgentBridgeLoop } from "./mauthAgentBridgeRetry.ts";

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

for (const detail of [{ code: "BRIDGE_TIMEOUT" }, { detail: { code: "BRIDGE_TIMEOUT" } }]) {
  test(`late acknowledgement keeps the bridge listening without replaying a request: ${JSON.stringify(detail)}`, async () => {
    const controller = new AbortController();
    const requests = ["expired-apply", "next-snapshot"];
    const handled: string[] = [];
    const acknowledged: string[] = [];
    const delays: number[] = [];
    let registrations = 0;

    await runMauthAgentBridgeLoop({
      signal: controller.signal,
      register: async () => {
        registrations += 1;
      },
      processNextRequest: async () => {
        const request = requests.shift();
        assert.ok(request, "must not replay the expired request");
        handled.push(request);
        // The handler has finished, but the server no longer awaits its response.
        if (request === "expired-apply") throw apiError(404, detail);
        acknowledged.push(request);
        controller.abort();
      },
      delay: async (ms) => {
        delays.push(ms);
      },
    });

    assert.deepEqual(handled, ["expired-apply", "next-snapshot"]);
    assert.deepEqual(acknowledged, ["next-snapshot"]);
    assert.equal(registrations, 1);
    assert.deepEqual(delays, [0]);
  });
}

test("bridge loop re-registers a lost session before processing another request", async () => {
  const controller = new AbortController();
  let registrations = 0;
  let polls = 0;
  await runMauthAgentBridgeLoop({
    signal: controller.signal,
    register: async () => {
      registrations += 1;
    },
    processNextRequest: async () => {
      polls += 1;
      if (polls === 1) throw apiError(404, { code: "APP_NOT_CONNECTED" });
      controller.abort();
    },
    delay: async () => undefined,
  });
  assert.equal(registrations, 2);
  assert.equal(polls, 2);
});

test("missing routes and authorization failures still stop the loop", async () => {
  for (const error of [apiError(404), apiError(404, { code: "INVALID_REQUEST" }), apiError(401), apiError(403), apiError(405)]) {
    let polls = 0;
    await runMauthAgentBridgeLoop({
      signal: new AbortController().signal,
      register: async () => undefined,
      processNextRequest: async () => {
        polls += 1;
        throw error;
      },
      delay: async () => {
        assert.fail("fatal failures must not retry");
      },
    });
    assert.equal(polls, 1);
  }
});

test("cleanup during a delayed request stops recovery", async () => {
  const controller = new AbortController();
  await runMauthAgentBridgeLoop({
    signal: controller.signal,
    register: async () => undefined,
    processNextRequest: async () => {
      controller.abort();
      throw apiError(404, { code: "BRIDGE_TIMEOUT" });
    },
    delay: async () => {
      assert.fail("an unmounted editor must not retry");
    },
  });
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
