import assert from "node:assert/strict";
import test from "node:test";

import { resolveProjectAutosaveAgainstFile, type ProjectAutosaveSnapshotLike } from "./projectAutosaveResolution.ts";

interface AutosaveSnapshot extends ProjectAutosaveSnapshotLike {
  fingerprint: string;
}

interface SavedDocument {
  fingerprint: string;
}

const project = {
  id: "local-project",
  name: "Documents",
  metadata: {},
};

function runtime(
  patch: Partial<Parameters<typeof resolveProjectAutosaveAgainstFile<AutosaveSnapshot, SavedDocument>>[1]> = {},
): Parameters<typeof resolveProjectAutosaveAgainstFile<AutosaveSnapshot, SavedDocument>>[1] {
  return {
    activeProject: project,
    getDefaultProject: async () => project,
    getProjectFile: async () => ({ content: JSON.stringify({ fingerprint: "disk" }), revision: 5 }),
    listProjectFileVersions: async () => ({
      versions: [{ content: JSON.stringify({ fingerprint: "base" }), revision: 4 }],
    }),
    parseSavedDocument: (content) => (content ? (JSON.parse(content) as SavedDocument) : null),
    savedDocumentFingerprint: (document) => document.fingerprint,
    autosaveSnapshotFingerprint: (snapshot) => snapshot.fingerprint,
    savedDocumentToAutosaveSnapshot: (document, filePath, revision) => ({
      fingerprint: document.fingerprint,
      activeProjectFilePath: filePath,
      activeProjectFileRevision: revision ?? undefined,
    }),
    ...patch,
  };
}

test("autosaves without a complete saved-file identity remain ordinary drafts", async () => {
  let projectReadCount = 0;
  const snapshot = { fingerprint: "draft" };
  const result = await resolveProjectAutosaveAgainstFile(
    snapshot,
    runtime({
      getProjectFile: async () => {
        projectReadCount += 1;
        throw new Error("should not read a project file");
      },
    }),
  );

  assert.equal(projectReadCount, 0);
  assert.deepEqual(result, {
    snapshot,
    project: null,
    cleanFingerprint: null,
    conflict: null,
  });
});

test("an autosave at the current revision keeps its draft and clean disk fingerprint", async () => {
  const snapshot = {
    fingerprint: "local-edit",
    activeProjectFilePath: "tests/Exam.test.json",
    activeProjectFileRevision: 5,
  };
  const result = await resolveProjectAutosaveAgainstFile(snapshot, runtime());

  assert.equal(result.snapshot, snapshot);
  assert.equal(result.cleanFingerprint, "disk");
  assert.equal(result.conflict, null);
});

test("a clean stale autosave advances to the newer disk document and revision", async () => {
  const snapshot = {
    fingerprint: "base",
    activeProjectFilePath: "tests/Exam.test.json",
    activeProjectFileRevision: 4,
  };
  const result = await resolveProjectAutosaveAgainstFile(snapshot, runtime());

  assert.deepEqual(result.snapshot, {
    fingerprint: "disk",
    activeProjectFilePath: "tests/Exam.test.json",
    activeProjectFileRevision: 5,
  });
  assert.equal(result.cleanFingerprint, "disk");
  assert.equal(result.conflict, null);
});

test("a dirty stale autosave is preserved and blocked from overwriting the newer disk file", async () => {
  const snapshot = {
    fingerprint: "local-edit",
    activeProjectFilePath: "tests/Exam.test.json",
    activeProjectFileRevision: 4,
  };
  const result = await resolveProjectAutosaveAgainstFile(snapshot, runtime());

  assert.equal(result.snapshot, snapshot);
  assert.equal(result.cleanFingerprint, "base");
  assert.deepEqual(result.conflict, {
    filePath: "tests/Exam.test.json",
    message: "File changed on disk. Reload it before saving, or use Save as to keep this draft as a copy.",
    localRevision: 4,
    currentRevision: 5,
  });
});

test("a missing historical revision keeps the stale draft in conflict instead of assuming it is clean", async () => {
  const snapshot = {
    fingerprint: "base",
    activeProjectFilePath: "tests/Exam.test.json",
    activeProjectFileRevision: 4,
  };
  const result = await resolveProjectAutosaveAgainstFile(snapshot, runtime({ listProjectFileVersions: async () => ({ versions: [] }) }));

  assert.equal(result.snapshot, snapshot);
  assert.equal(result.cleanFingerprint, null);
  assert.equal(result.conflict?.currentRevision, 5);
});

test("an unsupported newer disk document keeps the recoverable autosave and raises a conflict", async () => {
  const snapshot = {
    fingerprint: "local-edit",
    activeProjectFilePath: "tests/Exam.test.json",
    activeProjectFileRevision: 4,
  };
  const result = await resolveProjectAutosaveAgainstFile(snapshot, runtime({ parseSavedDocument: () => null }));

  assert.equal(result.snapshot, snapshot);
  assert.equal(result.cleanFingerprint, null);
  assert.equal(result.conflict?.localRevision, 4);
  assert.equal(result.conflict?.currentRevision, 5);
});
