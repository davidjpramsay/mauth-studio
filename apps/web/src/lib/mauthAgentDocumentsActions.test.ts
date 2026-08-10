import assert from "node:assert/strict";
import test from "node:test";

import type { MauthAgentOpenDocument, ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import { listMauthAgentDocuments, mauthAgentProjectFilePath, normalizeMauthAgentFolderPath } from "./mauthAgentDocuments.ts";

test("agent document paths are relative, structured, and traversal-safe", () => {
  assert.equal(mauthAgentProjectFilePath("Assessments/Test 1.mauth"), "tests/Assessments/Test 1.mauth");
  assert.equal(mauthAgentProjectFilePath("tests/Assessments/Test 1.mauth"), "tests/Assessments/Test 1.mauth");
  assert.equal(mauthAgentProjectFilePath("../Test 1.mauth"), null);
  assert.equal(mauthAgentProjectFilePath("/tmp/Test 1.mauth"), null);
  assert.equal(mauthAgentProjectFilePath("Test 1.pdf"), null);
  assert.equal(normalizeMauthAgentFolderPath("Past exams / 2026"), "Past exams/2026");
  assert.equal(normalizeMauthAgentFolderPath("../Past exams"), null);
});

test("agent document listing exposes relative paths and current open-tab state", () => {
  const project = {
    id: "default",
    name: "Documents",
    documentsPath: "/Users/teacher/Documents/Mauth/Documents",
  } as ProjectSummary;
  const files = [
    {
      path: "tests/Tests/Functions.mauth",
      kind: "file",
      fileType: "test",
      revision: 3,
      sizeBytes: 1200,
      updatedAt: "2026-08-10T00:00:00Z",
    },
    {
      path: "tests/Tests/Nested/Trigonometry.mauth",
      kind: "file",
      fileType: "test",
      revision: 2,
      sizeBytes: 900,
      updatedAt: "2026-08-09T00:00:00Z",
    },
  ] as ProjectFileSummary[];
  const openDocuments: MauthAgentOpenDocument[] = [
    {
      id: "file:documents:tests/Tests/Functions.mauth",
      title: "Functions",
      active: true,
      path: "tests/Tests/Functions.mauth",
      revision: 3,
      dirty: false,
      saveStatus: "saved",
    },
  ];

  const direct = listMauthAgentDocuments({ project, files, openDocuments, folderPath: "Tests", recursive: false });
  assert.equal(direct.documentCount, 1);
  assert.deepEqual(direct.documents[0], {
    path: "Tests/Functions.mauth",
    title: "Functions",
    revision: 3,
    sizeBytes: 1200,
    updatedAt: "2026-08-10T00:00:00Z",
    open: true,
    documentId: "file:documents:tests/Tests/Functions.mauth",
    active: true,
    dirty: false,
    saveStatus: "saved",
  });

  const recursive = listMauthAgentDocuments({ project, files, openDocuments, folderPath: "Tests", recursive: true });
  assert.equal(recursive.documentCount, 2);
});
