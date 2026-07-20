import test from "node:test";
import assert from "node:assert/strict";

import {
  editorPageBreakAriaLabel,
  editorPageBreakContextLabel,
  editorPageBreakSummary,
  editorPageBreakTitle,
} from "./editorPageBreakRows.ts";

test("editorPageBreakContextLabel names assessment part and subpart page breaks", () => {
  assert.equal(editorPageBreakContextLabel({ kind: "part" }, false), "next part");
  assert.equal(editorPageBreakContextLabel({ kind: "subpart" }, false), "next subpart");
});

test("editorPageBreakContextLabel names notes page breaks as subheadings and details", () => {
  assert.equal(editorPageBreakContextLabel({ kind: "part" }, true), "next subheading");
  assert.equal(editorPageBreakContextLabel({ kind: "subpart" }, true), "next detail");
});

test("editor page-break row copy stays stable for keyboard and screen-reader guidance", () => {
  assert.equal(
    editorPageBreakTitle("next part"),
    "Page break. The next part starts on a new page. Drag or press Alt+Up/Alt+Down to move it. Delete removes it.",
  );
  assert.equal(editorPageBreakAriaLabel("next part"), "Page break. The next part starts on a new page.");
  assert.equal(editorPageBreakSummary("next part"), "Next part starts on a new page");
});
