import assert from "node:assert/strict";
import test from "node:test";

import { buildMauthAgentFileState } from "./mauthAgentFileState.ts";

test("buildMauthAgentFileState reports unsaved drafts without project file identity", () => {
  const state = buildMauthAgentFileState({
    documentFingerprint: "draft-fingerprint",
    lastProjectSaveFingerprint: null,
    autosaveStatus: "saved",
    autosaveMessage: "Autosaved draft",
  });

  assert.equal(state.activePath, undefined);
  assert.equal(state.dirty, false);
  assert.equal(state.saveStatus, "draft");
  assert.equal(state.autosaveStatus, "saved");
});

test("buildMauthAgentFileState distinguishes saved and dirty project files", () => {
  const savedState = buildMauthAgentFileState({
    projectId: "local-project",
    projectName: "Documents",
    activePath: "Tests/demo.test.json",
    activeRevision: 4,
    documentFingerprint: "same",
    lastProjectSaveFingerprint: "same",
  });
  const dirtyState = buildMauthAgentFileState({
    projectId: "local-project",
    projectName: "Documents",
    activePath: "Tests/demo.test.json",
    activeRevision: 4,
    documentFingerprint: "changed",
    lastProjectSaveFingerprint: "same",
  });

  assert.equal(savedState.dirty, false);
  assert.equal(savedState.saveStatus, "saved");
  assert.equal(dirtyState.dirty, true);
  assert.equal(dirtyState.saveStatus, "dirty");
});

test("buildMauthAgentFileState prioritizes loading and revision conflicts", () => {
  assert.equal(
    buildMauthAgentFileState({
      activePath: "Tests/demo.test.json",
      documentFingerprint: "changed",
      lastProjectSaveFingerprint: "same",
      fileOperationBusy: true,
      hasRevisionIssue: true,
    }).saveStatus,
    "loading",
  );
  assert.equal(
    buildMauthAgentFileState({
      activePath: "Tests/demo.test.json",
      documentFingerprint: "same",
      lastProjectSaveFingerprint: "same",
      hasRevisionIssue: true,
    }).saveStatus,
    "conflict",
  );
});
