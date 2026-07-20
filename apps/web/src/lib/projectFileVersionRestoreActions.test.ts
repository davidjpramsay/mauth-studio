import assert from "node:assert/strict";
import test from "node:test";

import { restoreProjectFileVersionWithSession } from "./projectFileVersionRestoreWorkflow.ts";

test("version restore leaves an unrelated active document outside the transition guard", async () => {
  const events: string[] = [];
  const outcome = await restoreProjectFileVersionWithSession({
    activeFile: false,
    prepareCurrentDocument: async () => {
      events.push("prepare");
      return "cancelled";
    },
    restoreVersion: async () => {
      events.push("restore");
    },
  });

  assert.equal(outcome, "restored");
  assert.deepEqual(events, ["restore"]);
});

test("version restore prepares the active document before changing its disk revision", async () => {
  const events: string[] = [];
  const outcome = await restoreProjectFileVersionWithSession({
    activeFile: true,
    prepareCurrentDocument: async () => {
      events.push("prepare");
      return "saved";
    },
    restoreVersion: async () => {
      events.push("restore");
    },
  });

  assert.equal(outcome, "restored");
  assert.deepEqual(events, ["prepare", "restore"]);
});

test("version restore preserves the active document when transition preparation is cancelled or blocked", async () => {
  for (const [prepared, expected] of [
    ["cancelled", "cancelled"],
    ["recovery-failed", "blocked"],
  ] as const) {
    let restoreCount = 0;
    const outcome = await restoreProjectFileVersionWithSession({
      activeFile: true,
      prepareCurrentDocument: async () => prepared,
      restoreVersion: async () => {
        restoreCount += 1;
      },
    });

    assert.equal(outcome, expected);
    assert.equal(restoreCount, 0);
  }
});

test("version restore proceeds after recovery or deliberate restore without saving", async () => {
  for (const prepared of ["recovery-saved", "open-without-saving"] as const) {
    let restoreCount = 0;
    const outcome = await restoreProjectFileVersionWithSession({
      activeFile: true,
      prepareCurrentDocument: async () => prepared,
      restoreVersion: async () => {
        restoreCount += 1;
      },
    });

    assert.equal(outcome, "restored");
    assert.equal(restoreCount, 1);
  }
});
