import assert from "node:assert/strict";
import test from "node:test";

import {
  activeDocumentNavigationRailItemId,
  documentNavigationPresentationPlan,
  documentNavigationRailItems,
  documentNavigationShowsTeacherRubric,
  type DocumentTocItem,
} from "./documentNavigation.ts";

test("document navigation presentation follows expanded state and assessment labels", () => {
  assert.deepEqual(documentNavigationPresentationPlan({ open: false, isNotesTemplate: false, isStandardTestTemplate: false }), {
    showExpandedNavigator: false,
    showStructureControls: true,
    showInvestigationControls: false,
    questionItemLabel: "question",
    sectionItemPresentation: "section",
    contextMenuSurface: "miniToc",
  });
  assert.deepEqual(documentNavigationPresentationPlan({ open: true, isNotesTemplate: false, isStandardTestTemplate: false }), {
    showExpandedNavigator: true,
    showStructureControls: true,
    showInvestigationControls: false,
    questionItemLabel: "question",
    sectionItemPresentation: "section",
    contextMenuSurface: "miniToc",
  });
});

test("document navigation uses automatic heading labels for notes", () => {
  assert.deepEqual(documentNavigationPresentationPlan({ open: true, isNotesTemplate: true, isStandardTestTemplate: false }), {
    showExpandedNavigator: true,
    showStructureControls: true,
    showInvestigationControls: false,
    questionItemLabel: "heading",
    sectionItemPresentation: "section",
    contextMenuSurface: "miniToc",
  });
});

test("standard tests present section markers as title pages", () => {
  assert.deepEqual(documentNavigationPresentationPlan({ open: true, isNotesTemplate: false, isStandardTestTemplate: true }), {
    showExpandedNavigator: true,
    showStructureControls: true,
    showInvestigationControls: false,
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
      showInvestigationControls: true,
      questionItemLabel: "question",
      sectionItemPresentation: "section",
      contextMenuSurface: "miniToc",
    },
  );
});

test("investigation mini TOC groups text sections and diagrams under their student page", () => {
  const items: DocumentTocItem[] = [
    { id: "front", label: "Investigation", kind: "title", depth: 0, editorAnchor: "front", previewAnchor: "front" },
    { id: "ip:p1", label: "Student page 1", kind: "investigationPage", depth: 0, editorAnchor: "ip:p1", previewAnchor: "ip:p1" },
    { id: "ip:p1/it:t1", label: "Story", kind: "investigationText", depth: 1, editorAnchor: "ip:p1/it:t1", previewAnchor: "ip:p1/it:t1" },
    { id: "ip:p1/id:d1", label: "Diagram", kind: "diagram", depth: 1, editorAnchor: "ip:p1/id:d1", previewAnchor: "ip:p1/id:d1" },
    {
      id: "ir:rubric",
      label: "Teacher rubric",
      kind: "investigationRubric",
      depth: 0,
      editorAnchor: "ir:rubric",
      previewAnchor: "ir:rubric",
    },
  ];

  const railItems = documentNavigationRailItems(items, "section");
  assert.deepEqual(
    railItems.map((item) => item.id),
    ["front", "ip:p1", "ir:rubric"],
  );
  assert.equal(activeDocumentNavigationRailItemId(items, railItems, "ip:p1/it:t1"), "ip:p1");
  assert.equal(activeDocumentNavigationRailItemId(items, railItems, "ip:p1/id:d1"), "ip:p1");
});

test("only the investigation rubric destination requests Teacher mode", () => {
  assert.equal(documentNavigationShowsTeacherRubric(true, { kind: "investigationRubric" }), true);
  assert.equal(documentNavigationShowsTeacherRubric(true, { kind: "investigationPage" }), false);
  assert.equal(documentNavigationShowsTeacherRubric(false, { kind: "investigationRubric" }), false);
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
