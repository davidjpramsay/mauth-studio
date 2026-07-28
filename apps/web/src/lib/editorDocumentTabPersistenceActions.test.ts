import assert from "node:assert/strict";
import test from "node:test";

import { normalizePersistedEditorDocumentTabsSession } from "./editorDocumentTabPersistence.ts";
import type { EditorDocumentState } from "./editorApplicationRuntime.ts";

const document = {
  frontMatter: {},
  questions: [],
  sectionHeadings: [],
  documentFlow: [],
  formattingConfig: {},
} as EditorDocumentState;

test("tab session normalization keeps valid tabs and selects a valid active id", () => {
  const session = normalizePersistedEditorDocumentTabsSession(
    {
      activeTabId: "missing",
      tabs: [
        {
          id: "tab-1",
          title: "Exam",
          filePath: "tests/Exam.mauth",
          revision: 4,
          document,
          navigation: { activeQuestionId: "question-1" },
          saveStatus: "dirty",
          dirty: true,
        },
        { id: "invalid" },
      ],
    },
    (value) => (value === document ? document : null),
  );

  assert.equal(session?.tabs.length, 1);
  assert.equal(session?.activeTabId, "tab-1");
  assert.equal(session?.tabs[0]?.revision, 4);
  assert.equal(session?.tabs[0]?.dirty, true);
});

test("tab session normalization rejects malformed roots", () => {
  assert.equal(
    normalizePersistedEditorDocumentTabsSession(null, () => document),
    null,
  );
  assert.equal(
    normalizePersistedEditorDocumentTabsSession({ tabs: "wrong" }, () => document),
    null,
  );
});
