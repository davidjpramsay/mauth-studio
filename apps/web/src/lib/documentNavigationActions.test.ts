import assert from "node:assert/strict";
import test from "node:test";

import { documentNavigationPresentationPlan, documentNavigationRailItems, type DocumentTocItem } from "./documentNavigation.ts";

test("document navigation presentation follows expanded state and assessment labels", () => {
  assert.deepEqual(documentNavigationPresentationPlan({ open: false, isNotesTemplate: false, isStandardTestTemplate: false }), {
    showExpandedNavigator: false,
    showStructureControls: true,
    questionItemLabel: "question",
    sectionItemPresentation: "section",
    contextMenuSurface: "miniToc",
  });
  assert.deepEqual(documentNavigationPresentationPlan({ open: true, isNotesTemplate: false, isStandardTestTemplate: false }), {
    showExpandedNavigator: true,
    showStructureControls: true,
    questionItemLabel: "question",
    sectionItemPresentation: "section",
    contextMenuSurface: "miniToc",
  });
});

test("document navigation uses automatic heading labels for notes", () => {
  assert.deepEqual(documentNavigationPresentationPlan({ open: true, isNotesTemplate: true, isStandardTestTemplate: false }), {
    showExpandedNavigator: true,
    showStructureControls: true,
    questionItemLabel: "heading",
    sectionItemPresentation: "section",
    contextMenuSurface: "miniToc",
  });
});

test("standard tests present section markers as title pages", () => {
  assert.deepEqual(documentNavigationPresentationPlan({ open: true, isNotesTemplate: false, isStandardTestTemplate: true }), {
    showExpandedNavigator: true,
    showStructureControls: true,
    questionItemLabel: "question",
    sectionItemPresentation: "titlePage",
    contextMenuSurface: "miniToc",
  });
});

test("investigations hide question and section creation controls", () => {
  assert.deepEqual(
    documentNavigationPresentationPlan({
      open: true,
      isNotesTemplate: false,
      isStandardTestTemplate: false,
      isInvestigationTemplate: true,
    }),
    {
      showExpandedNavigator: true,
      showStructureControls: false,
      questionItemLabel: "question",
      sectionItemPresentation: "section",
      contextMenuSurface: "miniToc",
    },
  );
});

test("standard-test mini TOC shows one T target for each physical title page", () => {
  const items: DocumentTocItem[] = [
    { id: "front", label: "Title Page", kind: "title", depth: 0, editorAnchor: "front", previewAnchor: "front" },
    { id: "s1", label: "Section One", kind: "sectionHeading", depth: 0, editorAnchor: "s1", previewAnchor: "s1" },
    { id: "q1", label: "Question 1", kind: "question", depth: 0, editorAnchor: "q1", previewAnchor: "q1" },
    { id: "s2", label: "Section Two", kind: "sectionHeading", depth: 0, editorAnchor: "s2", previewAnchor: "s2" },
  ];

  assert.deepEqual(
    documentNavigationRailItems(items, "titlePage").map((item) => item.id),
    ["s1", "q1", "s2"],
  );
  assert.deepEqual(
    documentNavigationRailItems(items, "section").map((item) => item.id),
    ["front", "s1", "q1", "s2"],
  );
});
