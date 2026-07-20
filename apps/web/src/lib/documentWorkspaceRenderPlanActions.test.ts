import assert from "node:assert/strict";
import test from "node:test";

import { documentEditorSurfaceKind, documentPageBreakPanelLabel, documentQuestionPanelLabel } from "./documentWorkspaceRenderPlan.ts";

test("document workspace surface precedence preserves the existing selection modes", () => {
  assert.equal(
    documentEditorSurfaceKind({
      editingFrontMatter: true,
      editingPageBreak: true,
      editingSectionHeading: true,
      hasActivePageBreak: true,
      hasActiveSectionHeading: true,
      hasActiveQuestion: true,
    }),
    "frontMatter",
  );
  assert.equal(
    documentEditorSurfaceKind({
      editingFrontMatter: false,
      editingPageBreak: true,
      editingSectionHeading: true,
      hasActivePageBreak: true,
      hasActiveSectionHeading: true,
      hasActiveQuestion: true,
    }),
    "pageBreak",
  );
  assert.equal(
    documentEditorSurfaceKind({
      editingFrontMatter: false,
      editingPageBreak: false,
      editingSectionHeading: true,
      hasActivePageBreak: false,
      hasActiveSectionHeading: true,
      hasActiveQuestion: true,
    }),
    "sectionHeading",
  );
  assert.equal(
    documentEditorSurfaceKind({
      editingFrontMatter: false,
      editingPageBreak: false,
      editingSectionHeading: false,
      hasActivePageBreak: false,
      hasActiveSectionHeading: false,
      hasActiveQuestion: true,
    }),
    "question",
  );
});

test("missing selected entities keep stale editor modes empty", () => {
  assert.equal(
    documentEditorSurfaceKind({
      editingFrontMatter: false,
      editingPageBreak: true,
      editingSectionHeading: false,
      hasActivePageBreak: false,
      hasActiveSectionHeading: false,
      hasActiveQuestion: true,
    }),
    "empty",
  );
  assert.equal(
    documentEditorSurfaceKind({
      editingFrontMatter: false,
      editingPageBreak: false,
      editingSectionHeading: true,
      hasActivePageBreak: false,
      hasActiveSectionHeading: false,
      hasActiveQuestion: true,
    }),
    "empty",
  );
});

test("document workspace labels use notes headings and assessment question numbers", () => {
  assert.equal(documentQuestionPanelLabel({ isNotesTemplate: true, questionIndex: 2, displayNumber: 12 }), "Heading 3");
  assert.equal(documentQuestionPanelLabel({ isNotesTemplate: false, questionIndex: 2, displayNumber: 12 }), "Question 12");
  assert.equal(documentPageBreakPanelLabel({ isNotesTemplate: true, questionIndex: 2, displayNumber: 12 }), "Page break after Heading 3");
  assert.equal(
    documentPageBreakPanelLabel({ isNotesTemplate: false, questionIndex: 2, displayNumber: 12 }),
    "Page break after Question 12",
  );
});
