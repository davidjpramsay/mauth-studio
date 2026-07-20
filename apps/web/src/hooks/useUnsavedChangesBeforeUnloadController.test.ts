import assert from "node:assert/strict";
import test from "node:test";

import { shouldBlockEditorBeforeUnload } from "./useUnsavedChangesBeforeUnloadController.ts";

const cleanOpenState = {
  editorDocumentOpen: true,
  fileOperationBusy: false,
  hasUnsavedProjectChanges: false,
  hasUnsavedDraftChanges: false,
};

test("shouldBlockEditorBeforeUnload ignores closed or clean documents", () => {
  assert.equal(shouldBlockEditorBeforeUnload(cleanOpenState), false);
  assert.equal(shouldBlockEditorBeforeUnload({ ...cleanOpenState, editorDocumentOpen: false, hasUnsavedProjectChanges: true }), false);
});

test("shouldBlockEditorBeforeUnload blocks unsaved project or draft changes", () => {
  assert.equal(shouldBlockEditorBeforeUnload({ ...cleanOpenState, hasUnsavedProjectChanges: true }), true);
  assert.equal(shouldBlockEditorBeforeUnload({ ...cleanOpenState, hasUnsavedDraftChanges: true }), true);
});

test("shouldBlockEditorBeforeUnload blocks active file operations", () => {
  assert.equal(shouldBlockEditorBeforeUnload({ ...cleanOpenState, fileOperationBusy: true }), true);
});
