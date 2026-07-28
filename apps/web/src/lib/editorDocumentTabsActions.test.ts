import assert from "node:assert/strict";
import test from "node:test";

import {
  documentTabIdentity,
  nextActiveDocumentTabId,
  persistedDocumentTabsSession,
  savedDocumentTabId,
  upsertDocumentTab,
  type EditorDocumentTab,
} from "./editorDocumentTabs.ts";

function tab(id: string, filePath: string | null = null): EditorDocumentTab {
  return {
    id,
    title: id,
    project: null,
    filePath,
    revision: null,
    document: {
      frontMatter: {},
      questions: [],
      sectionHeadings: [],
      documentFlow: [],
      formattingConfig: {},
    } as EditorDocumentTab["document"],
    history: { undo: [], redo: [] },
    navigation: { activeQuestionId: "", activeTocItemId: "front-matter", activeRailItemId: "front-matter" },
    lastSaveFingerprint: null,
    cleanUnsavedFingerprint: null,
    conflict: null,
    saveStatus: "saved",
    statusMessage: "Saved",
    statusTitle: "Saved",
    dirty: false,
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
}

test("saved tab identities are stable by project and path", () => {
  assert.equal(savedDocumentTabId("project-1", "tests/Exam.mauth"), "file:project-1:tests/Exam.mauth");
  assert.equal(documentTabIdentity(tab("other", "tests/Exam.mauth")), "file:default:tests/Exam.mauth");
});

test("upsert replaces the same saved document without duplicating its tab", () => {
  const first = tab("old-id", "tests/Exam.mauth");
  const replacement = { ...tab("new-id", "tests/Exam.mauth"), title: "Updated" };
  const result = upsertDocumentTab([first, tab("draft")], replacement);

  assert.equal(result.length, 2);
  assert.equal(result[0]?.title, "Updated");
});

test("closing selection prefers the following tab then the preceding tab", () => {
  const tabs = [tab("one"), tab("two"), tab("three")];
  assert.equal(nextActiveDocumentTabId(tabs, "two"), "three");
  assert.equal(nextActiveDocumentTabId(tabs, "three"), "two");
  assert.equal(nextActiveDocumentTabId([tab("one")], "one"), null);
});

test("persisted sessions omit undo and redo history", () => {
  const active = { ...tab("one"), history: { undo: [tab("snapshot").document], redo: [] } };
  const persisted = persistedDocumentTabsSession([active], active.id);
  assert.equal(persisted.activeTabId, "one");
  assert.equal("history" in persisted.tabs[0]!, false);
});
