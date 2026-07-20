import assert from "node:assert/strict";
import test from "node:test";

import { basicBlockInspectorSelection } from "./basicBlockInspectorSelection.ts";

test("basic block inspector normalizes columns and choices", () => {
  assert.deepEqual(basicBlockInspectorSelection({ id: "columns", kind: "columns", columnCount: 3, columns: [[], [], []] }), {
    kind: "columns",
    columnCount: 3,
  });
  assert.deepEqual(
    basicBlockInspectorSelection({
      id: "choices",
      kind: "choices",
      choices: ["A", "B"],
      numberingStyle: "unknown" as never,
      layout: "unknown" as never,
    }),
    { kind: "choices", numberingStyle: "roman", layout: "vertical" },
  );
});

test("basic block inspector normalizes visible table dimensions", () => {
  assert.deepEqual(
    basicBlockInspectorSelection({
      id: "table",
      kind: "table",
      headers: ["x", "y", "z"],
      rows: [["1"], ["2", "3"]],
      showHeader: true,
      tableAlign: "invalid" as never,
      cellAlignment: "right",
    }),
    {
      kind: "table",
      tableAlign: "center",
      cellAlignment: "right",
      rowCount: 3,
      columnCount: 3,
    },
  );
});

test("basic block inspector normalizes answer space settings and ignores unsupported blocks", () => {
  assert.deepEqual(basicBlockInspectorSelection({ id: "space", kind: "space", lines: -4, showLines: false }), {
    kind: "space",
    lines: 0,
    showLines: false,
  });
  assert.equal(basicBlockInspectorSelection({ id: "text", kind: "text", text: "Question" }), null);
});
