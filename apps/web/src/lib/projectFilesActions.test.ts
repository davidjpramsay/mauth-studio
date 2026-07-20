import assert from "node:assert/strict";
import test from "node:test";

import {
  isProjectFilesUnavailableError,
  PROJECT_FILES_UNAVAILABLE_MESSAGE,
  projectFilesUnavailableMessage,
} from "./projectFilesActions.ts";

test("projectFilesUnavailableMessage exposes a specific storage availability message", () => {
  const error = Object.assign(new Error("Reconnect the active documents drive, then try again."), { status: 503 });
  assert.equal(projectFilesUnavailableMessage(error), "Reconnect the active documents drive, then try again.");
});

test("projectFilesUnavailableMessage keeps generic request failures concise", () => {
  assert.equal(projectFilesUnavailableMessage(new Error("fetch failed")), PROJECT_FILES_UNAVAILABLE_MESSAGE);
});

test("project file availability errors distinguish drive and network failures from document errors", () => {
  const unavailable = Object.assign(new Error("Reconnect the active documents drive, then try again."), { status: 503 });
  assert.equal(isProjectFilesUnavailableError(unavailable), true);
  assert.equal(isProjectFilesUnavailableError(new Error("Failed to fetch")), true);
  assert.equal(isProjectFilesUnavailableError(new Error("Unsupported project file")), false);
});
