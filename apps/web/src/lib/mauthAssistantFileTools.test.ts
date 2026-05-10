import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectFileDocument, ProjectFileSaveRequest, ProjectFileSummary, ProjectFileVersion } from "@mauth-studio/shared";

import { describeMauthAssistantFileTools, runMauthAssistantFileTool, type MauthProjectFileDriver } from "./mauthAssistantFileTools.ts";

interface StoredFile {
  summary: ProjectFileSummary;
  content: string | null;
  versions: ProjectFileVersion[];
}

function fileSummary(path: string, kind: "file" | "folder", revision = 1): ProjectFileSummary {
  const name = path.split("/").at(-1) ?? path;
  return {
    id: `id:${path}`,
    projectId: "project-1",
    parentPath: path.split("/").slice(0, -1).join("/") || null,
    path,
    name,
    kind,
    fileType: kind === "folder" ? "folder" : "test",
    metadata: {},
    sortOrder: 0,
    revision,
    sizeBytes: 0,
    createdAt: "2026-05-08T00:00:00Z",
    updatedAt: "2026-05-08T00:00:00Z",
  };
}

function documentFromStored(file: StoredFile): ProjectFileDocument {
  return {
    ...file.summary,
    content: file.content,
    versionCount: file.versions.length,
  };
}

function createMemoryDriver(seed: StoredFile[]): MauthProjectFileDriver {
  const files = new Map(seed.map((file) => [file.summary.path, file]));

  function ensureParentFolders(path: string) {
    const parts = path.split("/").filter(Boolean);
    for (let index = 1; index < parts.length; index += 1) {
      const folderPath = parts.slice(0, index).join("/");
      if (!files.has(folderPath)) {
        files.set(folderPath, {
          summary: fileSummary(folderPath, "folder"),
          content: null,
          versions: [],
        });
      }
    }
  }

  return {
    async listFiles() {
      return [...files.values()].map((file) => file.summary).sort((left, right) => left.path.localeCompare(right.path));
    },
    async getFile(_projectId, path) {
      const file = files.get(path);
      if (!file) throw new Error(`File not found: ${path}`);
      return documentFromStored(file);
    },
    async saveFile(_projectId, path, request: ProjectFileSaveRequest) {
      ensureParentFolders(path);
      const existing = files.get(path);
      if (typeof request.baseRevision === "number" && existing && existing.summary.revision !== request.baseRevision) {
        throw new Error("File has changed since it was loaded");
      }
      const kind = request.kind === "folder" ? "folder" : "file";
      const revision = existing ? existing.summary.revision + 1 : 1;
      const versions = existing?.versions ?? [];
      if (existing?.summary.kind === "file") {
        versions.unshift({
          id: `version:${path}:${existing.summary.revision}`,
          projectId: existing.summary.projectId,
          filePath: path,
          fileId: existing.summary.id,
          fileType: existing.summary.fileType,
          metadata: existing.summary.metadata,
          revision: existing.summary.revision,
          reason: "overwrite",
          content: existing.content ?? "",
          createdAt: "2026-05-08T00:00:00Z",
        });
      }
      const summary: ProjectFileSummary = {
        ...(existing?.summary ?? fileSummary(path, kind)),
        name: path.split("/").at(-1) ?? path,
        path,
        kind,
        fileType: request.fileType ?? (kind === "folder" ? "folder" : "test"),
        metadata: request.metadata ?? existing?.summary.metadata ?? {},
        revision,
        sizeBytes: typeof request.content === "string" ? request.content.length : 0,
      };
      const stored = { summary, content: kind === "folder" ? null : (request.content ?? ""), versions };
      files.set(path, stored);
      return documentFromStored(stored);
    },
    async deleteFile(_projectId, path, baseRevision) {
      const existing = files.get(path);
      if (!existing) throw new Error(`File not found: ${path}`);
      if (typeof baseRevision === "number" && existing.summary.revision !== baseRevision) {
        throw new Error("File has changed since it was loaded");
      }
      for (const key of [...files.keys()]) {
        if (key === path || key.startsWith(`${path}/`)) files.delete(key);
      }
    },
    async listVersions(_projectId, path) {
      return files.get(path)?.versions ?? [];
    },
    async restoreVersion(_projectId, path, versionId) {
      const file = files.get(path);
      const version = file?.versions.find((item) => item.id === versionId);
      if (!file || !version) throw new Error("Version not found");
      file.content = version.content;
      file.summary = { ...file.summary, revision: file.summary.revision + 1, sizeBytes: version.content.length };
      return documentFromStored(file);
    },
  };
}

function seedDriver() {
  return createMemoryDriver([
    { summary: fileSummary("tests", "folder"), content: null, versions: [] },
    { summary: fileSummary("tests/Algebra", "folder"), content: null, versions: [] },
    { summary: fileSummary("tests/Algebra/Test 1.test.json", "file"), content: '{"name":"Test 1"}', versions: [] },
    { summary: fileSummary("tests/Calculus Test.test.json", "file"), content: '{"name":"Calculus"}', versions: [] },
  ]);
}

test("describes file assistant tools", () => {
  const description = describeMauthAssistantFileTools();

  assert(description.tools.some((tool) => tool.name === "mauth.files.open"));
  assert(description.tools.some((tool) => tool.name === "mauth.files.createFolder"));
  assert(description.workflow.some((step) => step.includes("List files")));
});

test("rejects malformed file-tool payloads before driver operations run", async () => {
  const driver = seedDriver();
  const context = { projectId: "project-1" };

  const result = await runMauthAssistantFileTool(driver, context, {
    name: "mauth.files.saveAs",
    arguments: { path: "Bad File", content: { title: "not serialized" } },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Mauth file-tool validation failed/);
  assert.equal(data.validationIssues?.[0]?.path, "arguments.content");
});

test("rejects malformed multi-path file-tool payloads before driver operations run", async () => {
  const driver = seedDriver();
  const context = { projectId: "project-1" };

  const result = await runMauthAssistantFileTool(driver, context, {
    name: "mauth.files.move",
    arguments: { paths: ["Algebra/Test 1", 42], targetFolderPath: "Archive" },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(result.ok, false);
  assert.equal(data.validationIssues?.[0]?.path, "arguments.paths[1]");
  assert.match(result.error ?? "", /arguments\.paths\[1\]/);
});

test("lists and opens test files through the driver", async () => {
  const driver = seedDriver();
  const context = { projectId: "project-1" };

  const listResult = await runMauthAssistantFileTool(driver, context, {
    name: "mauth.files.list",
    arguments: { folderPath: "Algebra" },
  });
  const openResult = await runMauthAssistantFileTool(driver, context, {
    name: "mauth.files.open",
    arguments: { path: "Algebra/Test 1" },
  });

  assert.equal(listResult.ok, true);
  assert.deepEqual(
    listResult.files?.map((file) => file.path),
    ["tests/Algebra/Test 1.test.json"],
  );
  assert.equal(openResult.ok, true);
  assert.equal((openResult.data as { document: ProjectFileDocument }).document.content, '{"name":"Test 1"}');
});

test("saves a new file with a unique path unless overwrite is requested", async () => {
  const driver = seedDriver();
  const context = { projectId: "project-1" };

  const result = await runMauthAssistantFileTool(driver, context, {
    name: "mauth.files.saveAs",
    arguments: { path: "Calculus Test", content: '{"name":"Copy"}' },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.changedPaths, ["tests/Calculus Test copy.test.json"]);
  assert(result.files?.some((file) => file.path === "tests/Calculus Test copy.test.json"));
});

test("creates folders and duplicates folder trees", async () => {
  const driver = seedDriver();
  const context = { projectId: "project-1" };

  const folderResult = await runMauthAssistantFileTool(driver, context, {
    name: "mauth.files.createFolder",
    arguments: { path: "Revision/Term 2" },
  });
  const duplicateResult = await runMauthAssistantFileTool(driver, context, {
    name: "mauth.files.duplicate",
    arguments: { path: "Algebra" },
  });

  assert.equal(folderResult.ok, true);
  assert(folderResult.files?.some((file) => file.path === "tests/Revision/Term 2"));
  assert.equal(duplicateResult.ok, true);
  assert(duplicateResult.files?.some((file) => file.path === "tests/Algebra copy/Test 1.test.json"));
});

test("renames, moves, and deletes files", async () => {
  const driver = seedDriver();
  const context = { projectId: "project-1" };

  const renameResult = await runMauthAssistantFileTool(driver, context, {
    name: "mauth.files.rename",
    arguments: { path: "Calculus Test", newName: "Methods Practice" },
  });
  const moveResult = await runMauthAssistantFileTool(driver, context, {
    name: "mauth.files.move",
    arguments: { path: "Methods Practice", targetFolderPath: "Algebra" },
  });
  const deleteResult = await runMauthAssistantFileTool(driver, context, {
    name: "mauth.files.delete",
    arguments: { path: "Algebra/Methods Practice" },
  });

  assert.equal(renameResult.ok, true);
  assert.deepEqual(renameResult.changedPaths, ["tests/Calculus Test.test.json", "tests/Methods Practice.test.json"]);
  assert.equal(moveResult.ok, true);
  assert(moveResult.files?.some((file) => file.path === "tests/Algebra/Methods Practice.test.json"));
  assert.equal(deleteResult.ok, true);
  assert(!deleteResult.files?.some((file) => file.path === "tests/Algebra/Methods Practice.test.json"));
});

test("lists and restores file versions when the driver supports versions", async () => {
  const driver = seedDriver();
  const context = { projectId: "project-1" };
  await runMauthAssistantFileTool(driver, context, {
    name: "mauth.files.save",
    arguments: { path: "Calculus Test", content: '{"name":"Updated"}' },
  });

  const versionsResult = await runMauthAssistantFileTool(driver, context, {
    name: "mauth.files.versions.list",
    arguments: { path: "Calculus Test" },
  });
  const versionId = (versionsResult.data as { versions: ProjectFileVersion[] }).versions[0].id;
  const restoreResult = await runMauthAssistantFileTool(driver, context, {
    name: "mauth.files.versions.restore",
    arguments: { path: "Calculus Test", versionId },
  });

  assert.equal(versionsResult.ok, true);
  assert.equal(restoreResult.ok, true);
  assert.equal((restoreResult.data as { document: ProjectFileDocument }).document.content, '{"name":"Calculus"}');
});
