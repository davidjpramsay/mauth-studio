import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectFileDocument, ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";
import { useProjectDocumentOpenController as createDocumentOpenController } from "./useProjectDocumentOpenController";
import { ApiError } from "@/lib/api";
import { createDocumentOpenQueue } from "@/lib/documentOpenQueue";
import { createSerialWriteQueue, recoveryRetryDelay } from "@/lib/recoveryWrites";
import { documentTabsAfterFileOperation, documentTabsAfterSave } from "@/lib/documentTabFileOperations";
import type { EditorDocumentTab } from "@/lib/editorDocumentTabs";
import { documentTabsPersistencePlan, hydratedDocumentTabId } from "@/lib/editorDocumentTabs";
import { agentStorageError } from "@/lib/agentStorageError";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const project = { id: "local-project", documentsPath: "/documents/first", name: "First" } as ProjectSummary;
const summary = { id: "a", path: "tests/A.mauth", name: "A.mauth", kind: "file", revision: 2, fileType: "test" } as ProjectFileSummary;
const document = { ...summary, content: JSON.stringify({ title: "From disk" }) } as ProjectFileDocument;
const cloudError = () =>
  new ApiError("Hidden index is online-only. Make the folder available offline, then retry.", 503, {
    detail: { code: "STORAGE_UNAVAILABLE", reason: "PROJECT_INDEX_ONLINE_ONLY", action: "MAKE_FOLDER_AVAILABLE_OFFLINE", retryable: true },
  });

function setup(api: Parameters<typeof createDocumentOpenController<{ title: string }>>[0]["api"] = {}) {
  const state = {
    identity: "a",
    fingerprint: "clean",
    path: { current: "tests/A.mauth" as string | null },
    revision: { current: 1 as number | null },
  };
  const applied: { title: string }[] = [];
  const failures: string[] = [];
  const messages: string[] = [];
  const controller = createDocumentOpenController({
    activeProject: project,
    projectFiles: [summary],
    activeProjectFilePath: state.path.current,
    activeProjectFilePathRef: state.path,
    activeProjectFileRevisionRef: state.revision,
    lastProjectSaveFingerprintRef: { current: "clean" },
    fileOperationBusy: false,
    revisionMissingErrorMessage: "missing revision",
    parseSavedDocument: (content) => (content ? (JSON.parse(content) as { title: string }) : null),
    applySavedProjectDocument: (_project, _path, data) => {
      applied.push(data);
    },
    prepareCurrentProjectFileTransition: async () => {
      throw new Error("Must not discard or save a recovered document to open another");
    },
    prepareOpenProjectFileTransition: async () => "unchanged",
    currentEditorDocumentFingerprint: () => state.fingerprint,
    currentDocumentIdentity: () => state.identity,
    projectFileConflictFromError: () => null,
    setActiveProject: () => {},
    setProjectFiles: () => {},
    setProjectSaveConflict: () => {},
    setProjectFilesStatus: () => {},
    setProjectFilesMessage: (message) => messages.push(message),
    onOpenFailed: (request) => failures.push(request.message),
    refreshProjectFiles: async () => {},
    api: {
      getProjectFileSummary: async () => summary,
      getProjectFile: async () => document,
      getDefaultProject: async () => {
        throw new Error("Do not read an unavailable previous folder before Finder open");
      },
      listProjectFiles: async () => {
        throw new Error("Background sync must not scan all documents");
      },
      ...api,
    },
  });
  return { state, applied, failures, messages, controller };
}

test("a delayed active-file check cannot load into another tab", async () => {
  const response = deferred<ProjectFileSummary>();
  const fixture = setup({ getProjectFileSummary: () => response.promise });
  const result = fixture.controller.syncActiveProjectFileFromDisk();
  fixture.state.identity = "b";
  fixture.state.path.current = "tests/B.mauth";
  response.resolve(summary);
  assert.equal(await result, "skipped");
  assert.deepEqual(fixture.applied, []);
});

for (const change of ["edit", "close", "revision", "folder"] as const) {
  test(`a pending reload preserves a newer ${change}`, async () => {
    const response = deferred<ProjectFileDocument>();
    const fixture = setup({ getProjectFile: () => response.promise });
    const result = fixture.controller.syncActiveProjectFileFromDisk();
    await tick();
    if (change === "edit") fixture.state.fingerprint = "unsaved newer working";
    if (change === "close") fixture.state.path.current = null;
    if (change === "revision") fixture.state.revision.current = 3;
    if (change === "folder") fixture.state.identity = "another-folder-same-path";
    response.resolve(document);
    assert.equal(await result, "skipped");
    assert.deepEqual(fixture.applied, []);
  });
}

test("clean unchanged active documents can still refresh", async () => {
  const fixture = setup();
  assert.equal(await fixture.controller.syncActiveProjectFileFromDisk(), "reloaded");
  assert.deepEqual(fixture.applied, [{ title: "From disk" }]);
});

test("dirty documents are reported as conflicts, not reloaded", async () => {
  const fixture = setup();
  fixture.state.fingerprint = "unsaved working";
  assert.equal(await fixture.controller.syncActiveProjectFileFromDisk(), "conflict");
  assert.deepEqual(fixture.applied, []);
});

test("Finder opening leaves dirty recovery untouched on cloud failure and opens on retry", async () => {
  let available = false;
  const fixture = setup({
    openExternalProjectDocumentFile: async () => {
      if (!available) throw cloudError();
      return { project, document };
    },
  });
  fixture.state.fingerprint = "dirty recovered assessment";
  assert.equal(await fixture.controller.openExternalProjectDocument("/documents/first/A.mauth"), false);
  assert.deepEqual(fixture.applied, []);
  assert.equal(fixture.state.fingerprint, "dirty recovered assessment");
  assert.match(fixture.failures[0], /online-only/);
  available = true;
  assert.equal(await fixture.controller.openExternalProjectDocument("/documents/first/A.mauth"), true);
  assert.equal(fixture.applied.length, 1);
});

test("MCP opening returns the original actionable error without a hidden dialog", async () => {
  const fixture = setup({
    getProjectFile: async () => {
      throw cloudError();
    },
  });
  await assert.rejects(fixture.controller.openProjectFile("tests/A.mauth", { throwErrors: true }), (error: unknown) => {
    const result = agentStorageError(error);
    assert.equal(result.status, 503);
    assert.equal(result.body.reason, "PROJECT_INDEX_ONLINE_ONLY");
    assert.equal(result.body.action, "MAKE_FOLDER_AVAILABLE_OFFLINE");
    assert.equal(result.body.documentOpened, false);
    return true;
  });
  assert.deepEqual(fixture.failures, []);
});

test("Finder events wait for cold-start recovery and open in order", async () => {
  const opened: string[] = [];
  const first = deferred<void>();
  const queue = createDocumentOpenQueue(async (path) => {
    opened.push(path);
    if (path === "A") await first.promise;
  }, assert.fail);
  queue.enqueue("A");
  queue.enqueue("B");
  queue.enqueue("B");
  await tick();
  assert.deepEqual(opened, []);
  queue.setReady(true);
  assert.deepEqual(opened, ["A"]);
  first.resolve();
  await tick();
  assert.deepEqual(opened, ["A", "B"]);
  queue.enqueue("C");
  await tick();
  assert.deepEqual(opened, ["A", "B", "C"]);
});

test("recovery writes stay ordered after a temporary failure", async () => {
  const queue = createSerialWriteQueue();
  const first = deferred<void>();
  const writes: string[] = [];
  const old = queue(async () => {
    await first.promise;
    throw new Error("temporary failure");
  });
  const rejected = assert.rejects(old, /temporary failure/);
  const next = queue(async () => {
    writes.push("newest");
  });
  await tick();
  assert.deepEqual(writes, []);
  first.resolve();
  await rejected;
  await next;
  assert.deepEqual(writes, ["newest"]);
  assert.deepEqual([1, 2, 3, 6, 30].map(recoveryRetryDelay), [1000, 2000, 4000, 30000, 30000]);
});

const tab = {
  id: "existing-stable-id",
  project,
  filePath: "tests/A.mauth",
  revision: 1,
  dirty: true,
  document: { privateUnsavedText: "Keep me" },
  history: { undo: ["keep history"], redo: [] },
  conflict: null,
} as unknown as EditorDocumentTab;

test("an unavailable cloud lookup preserves the newer active recovery and its original folder", () => {
  const older = { ...tab, document: { old: true } } as unknown as EditorDocumentTab;
  const latest = { ...tab, project: null };
  const plan = documentTabsPersistencePlan([older], older.id, latest);
  assert.equal(plan.tabs.length, 1);
  assert.equal(plan.tabs[0].document, latest.document);
  assert.equal(plan.tabs[0].project, older.project);
  assert.equal(plan.tabs[0].dirty, true);
  assert.equal(plan.restoreActiveTab, true);
  const other = { ...tab, id: "other-folder", project: { ...project, documentsPath: "/other-folder" } };
  assert.equal(hydratedDocumentTabId({ tabs: [other, older], activeTabId: older.id }, { filePath: tab.filePath }), older.id);
});

test("a delayed save updates only its original tab and retains newer edits and undo history", () => {
  const other = { ...tab, id: "different-tab" };
  const result = {
    documentId: tab.id,
    sourcePath: tab.filePath,
    sourceRevision: 1,
    project,
    filePath: "tests/A.mauth",
    revision: 2,
    fingerprint: "saved working",
  };
  const [saved, untouched] = documentTabsAfterSave([tab, other], result, () => "newer unsaved working");
  assert.equal(saved.revision, 2);
  assert.equal(saved.lastSaveFingerprint, "saved working");
  assert.equal(saved.dirty, true);
  assert.equal(saved.document, tab.document);
  assert.equal(saved.history, tab.history);
  assert.equal(untouched, other);
  assert.equal(documentTabsAfterSave([tab], result, () => "saved working")[0].dirty, false);
  assert.deepEqual(
    documentTabsAfterSave([], result, () => "saved working"),
    [],
  );
  const moved = { ...tab, filePath: "tests/Renamed.mauth" };
  assert.equal(documentTabsAfterSave([moved], result, () => "saved working")[0], moved);
});

test("rename retargets inactive dirty tabs without changing their content, identity or history", () => {
  const [moved] = documentTabsAfterFileOperation([tab], {
    project,
    sourcePath: "tests/A.mauth",
    targetPath: "tests/B.mauth",
    files: [{ ...summary, path: "tests/B.mauth" }],
  });
  assert.equal(moved.filePath, "tests/B.mauth");
  assert.equal(moved.revision, 2);
  assert.equal(moved.id, tab.id);
  assert.equal(moved.document, tab.document);
  assert.equal(moved.history, tab.history);
  assert.equal(moved.dirty, true);
});

test("rename never grants a stale tab permission to overwrite a newer revision", () => {
  const [moved] = documentTabsAfterFileOperation([tab], {
    project,
    sourcePath: "tests/A.mauth",
    targetPath: "tests/B.mauth",
    files: [{ ...summary, path: "tests/B.mauth", revision: 5 }],
  });
  assert.equal(moved.revision, 1);
});

test("deleting a file retains its open document as an unsaved draft", () => {
  const [draft] = documentTabsAfterFileOperation([tab], { project, sourcePath: "tests/A.mauth", files: [] });
  assert.equal(draft.filePath, null);
  assert.equal(draft.document, tab.document);
  assert.equal(draft.history, tab.history);
  assert.equal(draft.dirty, true);
});

test("folder moves update descendants but not identically named documents in another folder", () => {
  const other = { ...tab, project: { ...project, documentsPath: "/other" } };
  const child = { ...tab, filePath: "tests/Old/A.mauth" };
  const [moved, untouched] = documentTabsAfterFileOperation([child, other], {
    project,
    sourcePath: "tests/Old",
    targetPath: "tests/New",
    files: [{ ...summary, path: "tests/New/A.mauth" }],
  });
  assert.equal(moved.filePath, "tests/New/A.mauth");
  assert.equal(untouched, other);
});
