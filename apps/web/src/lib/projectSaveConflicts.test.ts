import test from "node:test";
import assert from "node:assert/strict";

import {
  FILE_CHANGED_ON_DISK_MESSAGE,
  MISSING_PROJECT_REVISION_MESSAGE,
  fileChangedProjectSaveConflict,
  missingProjectRevisionConflict,
  projectFileConflictFromError,
  projectFileSummaryFromApiError,
} from "./projectSaveConflicts.ts";

function apiError(status: number, detail: unknown) {
  return Object.assign(new Error("API error"), { status, detail });
}

test("fileChangedProjectSaveConflict builds a consistent reload-or-save-as conflict", () => {
  assert.deepEqual(fileChangedProjectSaveConflict("tests/example.test.json", 3, 5), {
    filePath: "tests/example.test.json",
    message: FILE_CHANGED_ON_DISK_MESSAGE,
    localRevision: 3,
    currentRevision: 5,
  });
});

test("missingProjectRevisionConflict builds a reload-before-saving conflict", () => {
  assert.deepEqual(missingProjectRevisionConflict("tests/example.test.json"), {
    filePath: "tests/example.test.json",
    message: MISSING_PROJECT_REVISION_MESSAGE,
    localRevision: null,
  });
});

test("projectFileSummaryFromApiError reads nested current file details", () => {
  const error = apiError(409, {
    detail: {
      current: {
        path: "tests/example.test.json",
        revision: 7,
        kind: "file",
      },
    },
  });

  assert.deepEqual(projectFileSummaryFromApiError(error), {
    path: "tests/example.test.json",
    revision: 7,
    kind: "file",
  });
});

test("projectFileConflictFromError maps 409 API errors and ignores other errors", () => {
  const error = apiError(409, {
    current: {
      path: "tests/example.test.json",
      revision: 9,
    },
  });

  assert.deepEqual(projectFileConflictFromError(error, "tests/local.test.json", 4), {
    filePath: "tests/local.test.json",
    message: FILE_CHANGED_ON_DISK_MESSAGE,
    localRevision: 4,
    currentRevision: 9,
  });
  assert.equal(projectFileConflictFromError(apiError(500, {}), "tests/local.test.json", 4), null);
  assert.equal(projectFileConflictFromError(new Error("No"), "tests/local.test.json", 4), null);
});
