import assert from "node:assert/strict";
import test from "node:test";

import { dragPlacementFromRect } from "./editorDragDom.ts";

test("dragPlacementFromRect splits a target at its vertical midpoint", () => {
  const rect = { top: 100, height: 40 };
  assert.equal(dragPlacementFromRect(rect, 119), "before");
  assert.equal(dragPlacementFromRect(rect, 120), "after");
});

test("dragPlacementFromRect falls back to after for collapsed targets", () => {
  assert.equal(dragPlacementFromRect({ top: 100, height: 0 }, 50), "after");
});
