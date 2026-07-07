import test from "node:test";
import assert from "node:assert/strict";

import {
  editorSubsectionDragClassName,
  editorSubsectionDropZoneClassName,
  editorSubsectionDropZoneLabel,
} from "./editorSubsectionDragControls.ts";

test("editorSubsectionDropZoneLabel prioritizes page-break-only drops", () => {
  assert.equal(
    editorSubsectionDropZoneLabel({
      pageBreakCanDrop: true,
      subsectionCanDrop: false,
      fallbackLabel: "Drop above module",
    }),
    "Drop page break here",
  );
  assert.equal(
    editorSubsectionDropZoneLabel({
      pageBreakCanDrop: true,
      subsectionCanDrop: true,
      fallbackLabel: "Drop above module",
    }),
    "Drop above module",
  );
});

test("editorSubsectionDragClassName includes dragging and inside-drop affordances", () => {
  assert.match(editorSubsectionDragClassName({ isDragging: true, dropPlacement: null }), /opacity-70/);
  assert.match(editorSubsectionDragClassName({ isDragging: false, dropPlacement: "inside" }), /ring-2/);
  assert.doesNotMatch(editorSubsectionDragClassName({ isDragging: false, dropPlacement: "before" }), /ring-2/);
});

test("editorSubsectionDropZoneClassName distinguishes active container and item zones", () => {
  assert.match(editorSubsectionDropZoneClassName({ active: true, kind: "container" }), /h-11/);
  assert.match(editorSubsectionDropZoneClassName({ active: true, kind: "item" }), /h-12/);
  assert.doesNotMatch(editorSubsectionDropZoneClassName({ active: false, kind: "container" }), /border-primary/);
});
