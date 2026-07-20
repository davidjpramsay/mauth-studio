import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_BRIDGE_SAVE_CONFLICT_FALLBACK, editorAgentBridgeSaveConflictMessage } from "./editorAgentBridge.ts";
import { FILE_CHANGED_ON_DISK_MESSAGE } from "./projectSaveConflicts.ts";

function apiConflict(currentRevision: number) {
  return Object.assign(new Error("Conflict"), {
    status: 409,
    detail: {
      current: {
        path: "tests/current.test.json",
        revision: currentRevision,
      },
    },
  });
}

test("agent bridge save conflicts use the shared document-session conflict copy", () => {
  assert.equal(editorAgentBridgeSaveConflictMessage(apiConflict(8), "tests/local.test.json", 5), FILE_CHANGED_ON_DISK_MESSAGE);
});

test("agent bridge save failures preserve the live-editor mutation guarantee", () => {
  assert.equal(editorAgentBridgeSaveConflictMessage(new Error("Offline"), "tests/local.test.json", 5), AGENT_BRIDGE_SAVE_CONFLICT_FALLBACK);
});
