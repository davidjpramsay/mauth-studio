import assert from "node:assert/strict";
import test from "node:test";

import {
  projectFileTransitionCanProceed,
  projectFileTransitionCopy,
  resolveProjectFileTransition,
} from "./projectFileBeforeOpenWorkflow.ts";

function conflictError() {
  return Object.assign(new Error("conflict"), { recoverable: true });
}

test("before-open workflow skips saving when the current file is clean", async () => {
  let saveCount = 0;
  const outcome = await resolveProjectFileTransition({
    shouldSave: false,
    saveCurrentFile: async () => {
      saveCount += 1;
    },
    isRecoverableSaveConflict: () => false,
    chooseConflictAction: async () => null,
    saveRecoveryCopy: async () => undefined,
  });

  assert.equal(outcome, "unchanged");
  assert.equal(saveCount, 0);
  assert.equal(projectFileTransitionCanProceed(outcome), true);
});

test("before-open workflow proceeds after a normal save", async () => {
  const outcome = await resolveProjectFileTransition({
    shouldSave: true,
    saveCurrentFile: async () => undefined,
    isRecoverableSaveConflict: () => false,
    chooseConflictAction: async () => null,
    saveRecoveryCopy: async () => undefined,
  });

  assert.equal(outcome, "saved");
  assert.equal(projectFileTransitionCanProceed(outcome), true);
});

test("before-open workflow rethrows ordinary save failures", async () => {
  const failure = new Error("disk offline");

  await assert.rejects(
    resolveProjectFileTransition({
      shouldSave: true,
      saveCurrentFile: async () => {
        throw failure;
      },
      isRecoverableSaveConflict: () => false,
      chooseConflictAction: async () => null,
      saveRecoveryCopy: async () => undefined,
    }),
    failure,
  );
});

test("before-open conflict choices preserve cancellation and deliberate discard", async () => {
  const run = (choice: "open-without-saving" | null) =>
    resolveProjectFileTransition({
      shouldSave: true,
      saveCurrentFile: async () => {
        throw conflictError();
      },
      isRecoverableSaveConflict: (error) => Boolean((error as { recoverable?: boolean }).recoverable),
      chooseConflictAction: async () => choice,
      saveRecoveryCopy: async () => undefined,
    });

  const cancelled = await run(null);
  const discarded = await run("open-without-saving");
  assert.equal(cancelled, "cancelled");
  assert.equal(projectFileTransitionCanProceed(cancelled), false);
  assert.equal(discarded, "open-without-saving");
  assert.equal(projectFileTransitionCanProceed(discarded), true);
});

test("before-open recovery choice distinguishes saved and failed copies", async () => {
  const run = (recoveryFails: boolean) =>
    resolveProjectFileTransition({
      shouldSave: true,
      saveCurrentFile: async () => {
        throw conflictError();
      },
      isRecoverableSaveConflict: () => true,
      chooseConflictAction: async () => "save-recovery",
      saveRecoveryCopy: async () => {
        if (recoveryFails) throw new Error("recovery failed");
      },
    });

  const saved = await run(false);
  const failed = await run(true);
  assert.equal(saved, "recovery-saved");
  assert.equal(projectFileTransitionCanProceed(saved), true);
  assert.equal(failed, "recovery-failed");
  assert.equal(projectFileTransitionCanProceed(failed), false);
});

test("document transition copy names open, folder, and version-restore outcomes explicitly", () => {
  const openCopy = projectFileTransitionCopy("Exam", { kind: "open-file", targetLabel: "Worksheet" });
  assert.match(openCopy.conflictDescription, /before opening "Worksheet"/);
  assert.equal(openCopy.recoveryLabel, "Save recovery copy and open");

  const folderCopy = projectFileTransitionCopy("Exam", { kind: "switch-folder" });
  assert.match(folderCopy.conflictDescription, /changing the documents folder/);
  assert.equal(folderCopy.discardLabel, "Change folder without saving");

  const restoreCopy = projectFileTransitionCopy("Exam", {
    kind: "restore-version",
    targetLabel: "Exam",
    revision: 4,
  });
  assert.match(restoreCopy.conflictDescription, /restoring "Exam" to revision 4/);
  assert.equal(restoreCopy.recoveryLabel, "Save recovery copy and restore");
  assert.equal(restoreCopy.cancelledMessage, "Restore cancelled; local changes kept");
});
