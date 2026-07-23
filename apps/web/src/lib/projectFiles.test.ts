import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectFileSummary } from "@mauth-studio/shared";

import {
  absoluteMauthDocumentTarget,
  ensureTestFileName,
  isProjectTestFile,
  isStructuredMauthDocumentPath,
  LEGACY_TEST_DOCUMENT_EXTENSION,
  MAUTH_DOCUMENT_EXTENSION,
  structuredMauthDocumentExtension,
  testFileDisplayName,
  uniqueTestPath,
} from "./projectFiles.ts";

function file(path: string): ProjectFileSummary {
  return {
    id: path,
    projectId: "local-project",
    path,
    name: path.split("/").at(-1) ?? path,
    kind: "file",
    fileType: "test",
    sortOrder: 0,
    revision: 1,
    sizeBytes: 1,
    metadata: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

test("new structured documents use the canonical .mauth extension", () => {
  assert.equal(ensureTestFileName("Year 10 Exam"), "Year 10 Exam.mauth");
  assert.equal(ensureTestFileName("Year 10 Exam.test.json"), "Year 10 Exam.mauth");
  assert.equal(ensureTestFileName("Year 10 Exam.mauth"), "Year 10 Exam.mauth");
});

test("legacy extensions can be preserved deliberately", () => {
  assert.equal(ensureTestFileName("Year 10 Exam", LEGACY_TEST_DOCUMENT_EXTENSION), "Year 10 Exam.test.json");
  assert.equal(structuredMauthDocumentExtension("Year 10 Exam.TEST.JSON"), LEGACY_TEST_DOCUMENT_EXTENSION);
  assert.equal(structuredMauthDocumentExtension("Year 10 Exam.MAUTH"), MAUTH_DOCUMENT_EXTENSION);
});

test("display names and file recognition support canonical and legacy documents", () => {
  assert.equal(testFileDisplayName("Year 10 Exam.mauth"), "Year 10 Exam");
  assert.equal(testFileDisplayName("Year 10 Exam.test.json"), "Year 10 Exam");
  assert.equal(isStructuredMauthDocumentPath("tests/Year 10 Exam.mauth"), true);
  assert.equal(isStructuredMauthDocumentPath("tests/Year 10 Exam.mauth.md"), false);
  assert.equal(isProjectTestFile(file("tests/Year 10 Exam.mauth")), true);
});

test("unique document paths default to .mauth and can preserve a legacy extension", () => {
  const files = [file("tests/Exam.mauth"), file("tests/Legacy.test.json")];
  assert.equal(uniqueTestPath(files, "", "Exam", "file"), "Exam copy.mauth");
  assert.equal(uniqueTestPath(files, "", "Legacy", "file", LEGACY_TEST_DOCUMENT_EXTENSION), "Legacy copy.test.json");
});

test("absolute document targets keep the selected root when possible", () => {
  assert.deepEqual(absoluteMauthDocumentTarget("/Documents/Mauth/Archive/Exam.mauth", "/Documents/Mauth"), {
    documentsPath: "/Documents/Mauth",
    projectFilePath: "tests/Archive/Exam.mauth",
  });
  assert.deepEqual(absoluteMauthDocumentTarget("/Desktop/Exam.mauth", "/Documents/Mauth"), {
    documentsPath: "/Desktop",
    projectFilePath: "tests/Exam.mauth",
  });
  assert.equal(absoluteMauthDocumentTarget("/Desktop/Exam.pdf", "/Documents/Mauth"), null);
});
