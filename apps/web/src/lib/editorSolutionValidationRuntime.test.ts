import assert from "node:assert/strict";
import test from "node:test";
import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import { questionScrollAnchor } from "./scrollAnchors.ts";
import {
  createEditorSolutionValidationRuntime,
  normalizedStartQuestionNumber,
  questionDisplayNumber,
} from "./editorSolutionValidationRuntime.ts";

test("questionDisplayNumber respects a normalized start question number", () => {
  assert.equal(normalizedStartQuestionNumber({ startQuestionNumber: 0 }), 1);
  assert.equal(normalizedStartQuestionNumber({ startQuestionNumber: 4.9 }), 4);
  assert.equal(questionDisplayNumber({ startQuestionNumber: 10 }, 2), 12);
});

test("createEditorSolutionValidationRuntime wires anchors, labels, and normalizers", () => {
  const withGraphDefaults = (graphConfig?: GraphConfig | null): GraphConfig => ({
    type: "graph2d",
    xMin: -5,
    xMax: 5,
    yMin: -5,
    yMax: 5,
    widthPx: 320,
    heightPx: 240,
    ...(graphConfig ?? {}),
  });
  const runtime = createEditorSolutionValidationRuntime({ graphHeight: () => 240, withGraphDefaults })({ startQuestionNumber: 3 });
  const tableBlock: Extract<ContentBlock, { kind: "table" }> = {
    id: "table-1",
    kind: "table",
    headers: ["x", "0", "1"],
    rows: [["y", "", "4"]],
    showHeader: true,
  };

  assert.equal(runtime.questionDisplayNumber(1), 4);
  assert.equal(runtime.alphaLabel(1), "b");
  assert.equal(runtime.romanLabel(2), "iii");
  assert.equal(runtime.questionScrollAnchor("q1"), questionScrollAnchor("q1"));
  assert.deepEqual(runtime.plainTableRows(runtime.normalizeTableBlock(tableBlock)), [
    ["x", "0", "1"],
    ["y", "", "4"],
  ]);
  assert.equal(runtime.withGraphDefaults({ type: "graph2d", xMin: -2 }).xMin, -2);
});
