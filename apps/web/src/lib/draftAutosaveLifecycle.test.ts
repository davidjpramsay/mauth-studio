import test from "node:test";
import assert from "node:assert/strict";

import { draftAutosaveSavedMessage, draftAutosaveStartMessage, resolveDraftAutosaveRevisionPlan } from "./draftAutosaveLifecycle.ts";

test("draftAutosaveStartMessage distinguishes saved files, drafts, and closed workspace state", () => {
  assert.equal(
    draftAutosaveStartMessage({ activeProjectFilePath: "Tests/Exam.test.json", editorDocumentOpen: true }),
    "Autosaving file draft",
  );
  assert.equal(draftAutosaveStartMessage({ activeProjectFilePath: null, editorDocumentOpen: true }), "Autosaving draft");
  assert.equal(draftAutosaveStartMessage({ activeProjectFilePath: null, editorDocumentOpen: false }), "Saving closed workspace state");
});

test("resolveDraftAutosaveRevisionPlan saves when there is no newer project file revision", () => {
  assert.deepEqual(
    resolveDraftAutosaveRevisionPlan({
      activeProjectFilePath: null,
      activeProjectFileRevision: null,
      remoteRevision: 3,
      currentProjectFileClean: false,
    }),
    { kind: "save" },
  );
  assert.deepEqual(
    resolveDraftAutosaveRevisionPlan({
      activeProjectFilePath: "Tests/Exam.test.json",
      activeProjectFileRevision: 4,
      remoteRevision: 4,
      currentProjectFileClean: false,
    }),
    { kind: "save" },
  );
});

test("resolveDraftAutosaveRevisionPlan reloads clean files when disk has a newer revision", () => {
  assert.deepEqual(
    resolveDraftAutosaveRevisionPlan({
      activeProjectFilePath: "Tests/Exam.test.json",
      activeProjectFileRevision: 4,
      remoteRevision: 5,
      currentProjectFileClean: true,
    }),
    {
      kind: "reload-clean-file",
      conflict: {
        filePath: "Tests/Exam.test.json",
        message: "File changed on disk. Reload it before saving, or use Save as to keep this draft as a copy.",
        localRevision: 4,
        currentRevision: 5,
      },
      draftStatus: "ready",
      draftMessage: "File changed on disk; reloading",
    },
  );
});

test("resolveDraftAutosaveRevisionPlan blocks autosave for dirty files when disk has a newer revision", () => {
  assert.deepEqual(
    resolveDraftAutosaveRevisionPlan({
      activeProjectFilePath: "Tests/Exam.test.json",
      activeProjectFileRevision: 4,
      remoteRevision: 5,
      currentProjectFileClean: false,
    }),
    {
      kind: "block-dirty-file",
      conflict: {
        filePath: "Tests/Exam.test.json",
        message: "File changed on disk. Reload it before saving, or use Save as to keep this draft as a copy.",
        localRevision: 4,
        currentRevision: 5,
      },
      projectFilesStatus: "error",
      projectFilesMessage: "File changed on disk",
      draftStatus: "ready",
      draftMessage: "Draft not autosaved; file changed on disk",
    },
  );
});

test("draftAutosaveSavedMessage formats autosave timestamps through an injectable formatter", () => {
  assert.equal(draftAutosaveSavedMessage(undefined), "Autosaved draft at now");
  assert.equal(
    draftAutosaveSavedMessage("2026-07-07T04:05:06.000Z", () => "12:05:06 pm"),
    "Autosaved draft at 12:05:06 pm",
  );
});
