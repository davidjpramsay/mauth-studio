import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectFileSummary } from "@mauth-studio/shared";

import {
  LEGACY_SAVED_TESTS_MIGRATED_AT_KEY,
  hasLegacySavedTestsMigration,
  isExternalDocumentsFolder,
  planLegacySavedTestMigration,
} from "./projectLegacyMigration.ts";
import { projectPathForTestPath, uniqueTestPath } from "./projectFiles.ts";

function project(overrides: Record<string, unknown> = {}) {
  return {
    documentsPath: "/Users/teacher/Documents/Mauth/Documents",
    workspacePath: "/Users/teacher/Documents/Mauth",
    metadata: {},
    ...overrides,
  };
}

function fileSummary(path: string, metadata: Record<string, unknown> = {}): ProjectFileSummary {
  const name = path.split("/").filter(Boolean).at(-1) ?? path;
  return {
    id: `file-${path}`,
    projectId: "local-project",
    parentId: null,
    parentPath: path.split("/").filter(Boolean).slice(0, -1).join("/") || null,
    path,
    name,
    kind: "file",
    fileType: "test",
    metadata,
    sortOrder: 0,
    revision: 1,
    sizeBytes: 12,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

test("external documents folders never plan legacy saved-test imports", () => {
  const externalProject = project({
    documentsPath: "/Users/teacher/Desktop/Test 4 - Exam",
    workspacePath: "/Users/teacher/Desktop/Test 4 - Exam",
  });
  const plan = planLegacySavedTestMigration(externalProject, [{ id: "old", name: "Old test" }], [], () => {
    assert.fail("external folder should not build legacy imports");
  });

  assert.equal(isExternalDocumentsFolder(externalProject), true);
  assert.deepEqual(plan.imports, []);
  assert.equal(plan.shouldMarkMigrated, false);
  assert.equal(plan.skippedExternalFolder, true);
});

test("default documents folder marks legacy saved-test migration even when there is nothing to import", () => {
  const plan = planLegacySavedTestMigration(project(), [], [], () => {
    assert.fail("empty legacy list should not build imports");
  });

  assert.equal(plan.shouldMarkMigrated, true);
  assert.equal(plan.skippedExternalFolder, false);
  assert.deepEqual(plan.imports, []);
});

test("legacy saved-test migration skips already imported tests", () => {
  const plan = planLegacySavedTestMigration(
    project(),
    [
      { id: "saved-1", name: "Already here" },
      { id: "saved-2", name: "New test" },
    ],
    [fileSummary("tests/Already here.test.json", { legacySavedTestId: "saved-1" })],
    (savedTest) => ({
      path: projectPathForTestPath(`${savedTest.name}.test.json`),
      content: JSON.stringify(savedTest),
    }),
  );

  assert.equal(plan.shouldMarkMigrated, true);
  assert.deepEqual(
    plan.imports.map((legacyImport) => legacyImport.savedTest.id),
    ["saved-2"],
  );
});

test("legacy saved-test migration exposes planned imports to unique filename generation", () => {
  const plan = planLegacySavedTestMigration(
    project(),
    [
      { id: "first", name: "Common name" },
      { id: "second", name: "Common name" },
    ],
    [],
    (savedTest, filesForImport) => ({
      path: projectPathForTestPath(uniqueTestPath(filesForImport, "", savedTest.name, "file")),
      content: JSON.stringify(savedTest),
    }),
  );

  assert.deepEqual(
    plan.imports.map((legacyImport) => legacyImport.path),
    ["tests/Common name.test.json", "tests/Common name copy.test.json"],
  );
});

test("completed legacy saved-test migration is not planned again", () => {
  const migratedProject = project({
    metadata: { [LEGACY_SAVED_TESTS_MIGRATED_AT_KEY]: "2026-06-01T00:00:00Z" },
  });
  const plan = planLegacySavedTestMigration(migratedProject, [{ id: "old", name: "Old test" }], [], () => {
    assert.fail("completed migration should not build imports");
  });

  assert.equal(hasLegacySavedTestsMigration(migratedProject), true);
  assert.deepEqual(plan.imports, []);
  assert.equal(plan.shouldMarkMigrated, false);
  assert.equal(plan.skippedExternalFolder, false);
});
