import assert from "node:assert/strict";
import test from "node:test";

import { reloadProjectConflictFile, saveProjectConflictRecoveryCopy } from "./projectFileConflictWorkflow.ts";

const conflict = {
  filePath: "tests/Exam.test.json",
  message: "changed",
  localRevision: 4,
  currentRevision: 5,
};

test("recovery-copy workflow ignores unavailable and busy conflict actions", async () => {
  let saveCount = 0;
  const saveRecoveryCopy = async () => {
    saveCount += 1;
  };

  assert.equal(await saveProjectConflictRecoveryCopy({ conflict: null, fileOperationBusy: false, saveRecoveryCopy }), "ignored");
  assert.equal(await saveProjectConflictRecoveryCopy({ conflict, fileOperationBusy: true, saveRecoveryCopy }), "ignored");
  assert.equal(saveCount, 0);
});

test("recovery-copy workflow saves exactly once when the conflict is actionable", async () => {
  let saveCount = 0;
  const result = await saveProjectConflictRecoveryCopy({
    conflict,
    fileOperationBusy: false,
    saveRecoveryCopy: async () => {
      saveCount += 1;
    },
  });

  assert.equal(result, "completed");
  assert.equal(saveCount, 1);
});

test("reload workflow keeps local work when the destructive confirmation is cancelled", async () => {
  let reloadCount = 0;
  const result = await reloadProjectConflictFile({
    conflict,
    fileOperationBusy: false,
    confirmReload: async () => false,
    reloadFromDisk: async () => {
      reloadCount += 1;
    },
  });

  assert.equal(result, "cancelled");
  assert.equal(reloadCount, 0);
});

test("reload workflow reloads exactly once after confirmation", async () => {
  let confirmCount = 0;
  let reloadCount = 0;
  const result = await reloadProjectConflictFile({
    conflict,
    fileOperationBusy: false,
    confirmReload: async () => {
      confirmCount += 1;
      return true;
    },
    reloadFromDisk: async () => {
      reloadCount += 1;
    },
  });

  assert.equal(result, "completed");
  assert.equal(confirmCount, 1);
  assert.equal(reloadCount, 1);
});
