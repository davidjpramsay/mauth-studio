import assert from "node:assert/strict";
import test from "node:test";

import { buildEditorAutosaveSnapshot, editorDraftChangeKey } from "./editorSessionSnapshots.ts";

test("buildEditorAutosaveSnapshot preserves document state and active project identity", () => {
  const snapshot = buildEditorAutosaveSnapshot({
    document: {
      frontMatter: { title: "Test" },
      questions: [{ id: "q1" }],
      sectionHeadings: [{ id: "h1", title: "Section" }],
      documentFlow: [
        { kind: "sectionHeading", id: "h1" },
        { kind: "question", id: "q1" },
      ],
      formattingConfig: { preset: "exam" },
      logo: { id: "logo" },
    },
    file: {
      activeProjectFilePath: "Tests/demo.test.json",
      activeProjectFileRevision: 8,
      documentOpen: true,
    },
  });

  assert.deepEqual(snapshot, {
    frontMatter: { title: "Test" },
    questions: [{ id: "q1" }],
    sectionHeadings: [{ id: "h1", title: "Section" }],
    documentFlow: [
      { kind: "sectionHeading", id: "h1" },
      { kind: "question", id: "q1" },
    ],
    formattingConfig: { preset: "exam" },
    activeProjectFilePath: "Tests/demo.test.json",
    activeProjectFileRevision: 8,
    documentOpen: true,
    logo: { id: "logo" },
  });
});

test("buildEditorAutosaveSnapshot stores drafts without null project fields", () => {
  const snapshot = buildEditorAutosaveSnapshot({
    document: {
      frontMatter: { title: "Draft" },
      questions: [{ id: "q1" }],
      sectionHeadings: [],
      documentFlow: [{ kind: "question", id: "q1" }],
      formattingConfig: { preset: "worksheet" },
    },
    file: {
      activeProjectFilePath: null,
      activeProjectFileRevision: null,
      documentOpen: false,
    },
  });

  assert.equal("activeProjectFilePath" in snapshot, true);
  assert.equal(snapshot.activeProjectFilePath, undefined);
  assert.equal(snapshot.activeProjectFileRevision, undefined);
  assert.equal(snapshot.documentOpen, false);
});

test("editorDraftChangeKey tracks open state, active file identity, revision, and fingerprint", () => {
  assert.equal(
    editorDraftChangeKey({
      documentOpen: true,
      activeProjectFilePath: "Tests/demo.test.json",
      activeProjectFileRevision: 3,
      documentFingerprint: "abc",
    }),
    "open|Tests/demo.test.json|3|abc",
  );
  assert.equal(
    editorDraftChangeKey({
      documentOpen: false,
      activeProjectFilePath: null,
      activeProjectFileRevision: null,
      documentFingerprint: "draft",
    }),
    "closed|||draft",
  );
});
