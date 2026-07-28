import assert from "node:assert/strict";
import test from "node:test";

import { PRINT_RENDER_STATE_ATTRIBUTE, printReadinessSnapshot, waitForPrintPreviewReady } from "./printReadiness.ts";

function printStage(states: string[]): ParentNode {
  return {
    querySelectorAll() {
      return states.map((state) => ({
        getAttribute(name: string) {
          return name === PRINT_RENDER_STATE_ATTRIBUTE ? state : null;
        },
      }));
    },
  } as unknown as ParentNode;
}

test("print readiness requires the print stage and every asynchronous surface to settle", () => {
  assert.deepEqual(printReadinessSnapshot(null), {
    mounted: false,
    total: 0,
    pending: 0,
    errors: 0,
    ready: false,
  });
  assert.deepEqual(printReadinessSnapshot(printStage(["ready", "loading", "error"])), {
    mounted: true,
    total: 3,
    pending: 1,
    errors: 1,
    ready: false,
  });
  assert.deepEqual(printReadinessSnapshot(printStage(["ready", "error"])), {
    mounted: true,
    total: 2,
    pending: 0,
    errors: 1,
    ready: true,
  });
});

test("print readiness waits for Plotly-style loading surfaces and two settled layout frames", async () => {
  let frame = 0;
  const result = await waitForPrintPreviewReady({
    findPrintStage: () => printStage([frame >= 2 ? "ready" : "loading"]),
    requestFrame: (callback) => {
      frame += 1;
      callback(frame * 16);
      return frame;
    },
    now: () => frame * 16,
    fontsReady: Promise.resolve(),
    timeoutMs: 200,
  });

  assert.deepEqual(result, {
    mounted: true,
    total: 1,
    pending: 0,
    errors: 0,
    ready: true,
    timedOut: false,
  });
  assert.equal(frame, 4);
});

test("print readiness times out instead of blocking the print command forever", async () => {
  let frame = 0;
  const result = await waitForPrintPreviewReady({
    findPrintStage: () => printStage(["loading"]),
    requestFrame: (callback) => {
      frame += 1;
      callback(frame * 20);
      return frame;
    },
    now: () => frame * 20,
    fontsReady: Promise.resolve(),
    timeoutMs: 40,
  });

  assert.equal(result.ready, false);
  assert.equal(result.timedOut, true);
  assert.equal(result.pending, 1);
  assert.equal(frame, 4);
});
