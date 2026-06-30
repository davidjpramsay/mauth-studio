import assert from "node:assert/strict";
import test from "node:test";

import { resolveEditorClosePlan } from "./useEditorCloseController.ts";

const cleanOpenState = {
  editorDocumentOpen: true,
  fileOperationBusy: false,
  activeProjectFilePath: null,
  hasUnsavedProjectChanges: false,
  hasUnsavedDraftChanges: false,
};

test("resolveEditorClosePlan ignores closed documents and busy file operations", () => {
  assert.equal(resolveEditorClosePlan({ ...cleanOpenState, editorDocumentOpen: false, hasUnsavedDraftChanges: true }), "ignore");
  assert.equal(resolveEditorClosePlan({ ...cleanOpenState, fileOperationBusy: true, hasUnsavedDraftChanges: true }), "ignore");
});

test("resolveEditorClosePlan closes clean open documents immediately", () => {
  assert.equal(resolveEditorClosePlan(cleanOpenState), "close");
});

test("resolveEditorClosePlan asks before closing dirty project files", () => {
  assert.equal(
    resolveEditorClosePlan({
      ...cleanOpenState,
      activeProjectFilePath: "tests/Exam.test.json",
      hasUnsavedProjectChanges: true,
    }),
    "confirm-project-save",
  );
});

test("resolveEditorClosePlan asks before closing unsaved draft documents", () => {
  assert.equal(resolveEditorClosePlan({ ...cleanOpenState, hasUnsavedDraftChanges: true }), "confirm-draft-save");
});

test("resolveEditorClosePlan treats project file changes as the authoritative close prompt", () => {
  assert.equal(
    resolveEditorClosePlan({
      ...cleanOpenState,
      activeProjectFilePath: "tests/Exam.test.json",
      hasUnsavedProjectChanges: true,
      hasUnsavedDraftChanges: true,
    }),
    "confirm-project-save",
  );
});
