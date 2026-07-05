import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import {
  RECENT_PROJECT_FILES_KEY,
  nextRecentProjectFileReferences,
  projectUsesExternalDocumentsFolder,
  readRecentProjectFileReferences,
  recentProjectFileEntries,
  recentProjectFileReferencesForProject,
  writeRecentProjectFileReferences,
} from "./projectFileRecents.ts";

function project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: "local-project",
    name: "Local Project",
    metadata: {},
    workspacePath: "/Users/teacher/Documents/Mauth",
    documentsPath: "/Users/teacher/Documents/Mauth/Documents",
    fileCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function file(path: string): ProjectFileSummary {
  return {
    id: `file-${path}`,
    projectId: "local-project",
    parentId: null,
    parentPath: null,
    path,
    name: path.split("/").at(-1) ?? path,
    kind: "file",
    fileType: "test",
    metadata: {},
    sortOrder: 0,
    revision: 1,
    sizeBytes: 10,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function memoryStorage(initialValue: unknown = []) {
  const values = new Map<string, string>([[RECENT_PROJECT_FILES_KEY, JSON.stringify(initialValue)]]);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    value: (key: string) => values.get(key) ?? null,
  };
}

test("readRecentProjectFileReferences migrates legacy string entries", () => {
  const storage = memoryStorage(["tests/Alpha.test.json", { filePath: "tests/Beta.test.json", projectId: "local-project" }, 12]);

  assert.deepEqual(readRecentProjectFileReferences(storage), [
    { filePath: "tests/Alpha.test.json" },
    { filePath: "tests/Beta.test.json", projectId: "local-project", documentsPath: undefined, openedAt: undefined },
  ]);
});

test("recentProjectFileReferencesForProject ignores unscoped legacy recents in external folders", () => {
  const externalProject = project({
    workspacePath: "/Users/teacher/Desktop/Test 4 - Exam",
    documentsPath: "/Users/teacher/Desktop/Test 4 - Exam",
  });
  const references = [
    { filePath: "tests/Legacy.test.json" },
    {
      filePath: "tests/External.test.json",
      projectId: "local-project",
      documentsPath: "/Users/teacher/Desktop/Test 4 - Exam",
    },
    {
      filePath: "tests/Other.test.json",
      projectId: "local-project",
      documentsPath: "/Users/teacher/Desktop/Other Folder",
    },
  ];

  assert.equal(projectUsesExternalDocumentsFolder(externalProject), true);
  assert.deepEqual(recentProjectFileReferencesForProject(references, externalProject), [references[1]]);
});

test("recentProjectFileEntries maps only matching files in the active project folder", () => {
  const activeProject = project();
  const references = nextRecentProjectFileReferences([], activeProject, "tests/Alpha.test.json", "2026-01-01T00:00:00Z");

  assert.deepEqual(recentProjectFileEntries(references, activeProject, [file("tests/Alpha.test.json")]), [
    { file: file("tests/Alpha.test.json"), testPath: "Alpha.test.json" },
  ]);
  assert.deepEqual(recentProjectFileEntries(references, activeProject, [file("tests/Beta.test.json")]), []);
});

test("nextRecentProjectFileReferences deduplicates by file and folder identity", () => {
  const defaultProject = project();
  const externalProject = project({
    workspacePath: "/Users/teacher/Desktop/Test 4 - Exam",
    documentsPath: "/Users/teacher/Desktop/Test 4 - Exam",
  });

  const first = nextRecentProjectFileReferences([], defaultProject, "tests/Exam.test.json", "first");
  const second = nextRecentProjectFileReferences(first, externalProject, "tests/Exam.test.json", "second");
  const third = nextRecentProjectFileReferences(second, externalProject, "tests/Exam.test.json", "third");

  assert.deepEqual(
    third.map((reference) => [reference.filePath, reference.documentsPath, reference.openedAt]),
    [
      ["tests/Exam.test.json", "/Users/teacher/Desktop/Test 4 - Exam", "third"],
      ["tests/Exam.test.json", "/Users/teacher/Documents/Mauth/Documents", "first"],
    ],
  );
});

test("writeRecentProjectFileReferences stores only the configured recent limit", () => {
  const storage = memoryStorage();
  writeRecentProjectFileReferences(
    Array.from({ length: 12 }, (_, index) => ({ filePath: `tests/File ${index}.test.json` })),
    storage,
  );

  const saved = JSON.parse(storage.value(RECENT_PROJECT_FILES_KEY) ?? "[]") as unknown[];
  assert.equal(saved.length, 10);
});
