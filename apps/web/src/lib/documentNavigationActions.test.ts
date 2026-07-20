import assert from "node:assert/strict";
import test from "node:test";

import { documentNavigationPresentationPlan } from "./documentNavigation.ts";

test("document navigation presentation follows expanded state and assessment labels", () => {
  assert.deepEqual(documentNavigationPresentationPlan({ open: false, isNotesTemplate: false }), {
    showExpandedNavigator: false,
    questionItemLabel: "question",
    contextMenuSurface: "miniToc",
  });
  assert.deepEqual(documentNavigationPresentationPlan({ open: true, isNotesTemplate: false }), {
    showExpandedNavigator: true,
    questionItemLabel: "question",
    contextMenuSurface: "miniToc",
  });
});

test("document navigation uses automatic heading labels for notes", () => {
  assert.deepEqual(documentNavigationPresentationPlan({ open: true, isNotesTemplate: true }), {
    showExpandedNavigator: true,
    questionItemLabel: "heading",
    contextMenuSurface: "miniToc",
  });
});
