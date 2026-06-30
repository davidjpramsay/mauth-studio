import test from "node:test";
import assert from "node:assert/strict";
import type { GraphConfig } from "@mauth-studio/shared";

import {
  createEditorContentBlockNormalizer,
  normalizedBlockVisibility,
  normalizeDiagramTextSideValue,
  spaceLines,
  surfaceMarkTickFields,
} from "./editorContentBlockNormalization.ts";

function testNormalizer() {
  let count = 0;
  const defaultGraphConfig: GraphConfig = { type: "graph2d", functions: [], features: [], metadata: { source: "default" } };
  const normalizer = createEditorContentBlockNormalizer({
    id: (prefix) => `${prefix}-${++count}`,
    defaultGraphConfig,
    withGraphDefaults: (graphConfig = defaultGraphConfig) => ({
      ...graphConfig,
      metadata: { ...(graphConfig.metadata ?? {}), defaulted: true },
    }),
  });
  return { ...normalizer, defaultGraphConfig };
}

test("spaceLines clamps invalid and negative values", () => {
  assert.equal(spaceLines(undefined), 3);
  assert.equal(spaceLines("7"), 7);
  assert.equal(spaceLines(-4), 0);
});

test("normalizer preserves legacy solution and student visibility fields", () => {
  assert.equal(normalizedBlockVisibility({ solutionOnly: true }, "text-1"), "solution");
  assert.equal(normalizedBlockVisibility({}, "solution-legacy"), "solution");
  assert.equal(normalizedBlockVisibility({ studentOnly: true }, "text-1"), "student");
  assert.equal(normalizedBlockVisibility({ visibility: "always", solutionOnly: true }, "solution-legacy"), "always");
});

test("surfaceMarkTickFields keeps solution surface ticks only when valid", () => {
  assert.deepEqual(surfaceMarkTickFields({ markTicks: 2 }, "solution"), { markTicks: 2 });
  assert.deepEqual(surfaceMarkTickFields({ markTicks: 2 }, "student"), {});
  assert.deepEqual(surfaceMarkTickFields({ markTicks: 30 }, "solution"), {});
});

test("normalizeDiagramTextSideValue accepts only supported sides", () => {
  assert.equal(normalizeDiagramTextSideValue("left"), "left");
  assert.equal(normalizeDiagramTextSideValue("right"), "right");
  assert.equal(normalizeDiagramTextSideValue("beside"), "none");
});

test("editor content block normalizer normalizes text, space, and table blocks", () => {
  const { normalizeContentBlocks } = testNormalizer();
  const blocks = normalizeContentBlocks([
    { id: "text-1", kind: "text", text: "Working", solutionOnly: true },
    { id: "space-1", kind: "space", lines: "5", showLines: false, studentOnly: true },
    { id: "table-1", kind: "table", rows: [["x", "0"], ["y"]], markTicks: 2, visibility: "solution" },
    { id: "ignored", kind: "unknown" },
  ]);

  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[0], {
    id: "text-1",
    kind: "text",
    text: "Working",
    visibility: "solution",
    solutionOnly: true,
  });
  assert.deepEqual(blocks[1], {
    id: "space-1",
    kind: "space",
    lines: 5,
    showLines: false,
    visibility: "student",
    studentOnly: true,
  });
  assert.equal(blocks[2].kind, "table");
  assert.equal(blocks[2].visibility, "solution");
  assert.equal(blocks[2].kind === "table" ? blocks[2].markTicks : undefined, 2);
  assert.deepEqual(blocks[2].kind === "table" ? blocks[2].rows : undefined, [
    ["x", "0"],
    ["y", ""],
  ]);
});

test("editor content block normalizer normalizes nested columns recursively", () => {
  const { normalizeContentBlocks } = testNormalizer();
  const [columns] = normalizeContentBlocks([
    {
      id: "columns-1",
      kind: "columns",
      columnCount: 2,
      columns: [[{ id: "text-a", kind: "text", text: "A" }], [{ id: "space-b", kind: "space", lines: 2, showLines: true }]],
    },
  ]);

  assert.equal(columns.kind, "columns");
  assert.equal(columns.kind === "columns" ? columns.columns[0][0]?.kind : undefined, "text");
  assert.equal(columns.kind === "columns" ? columns.columns[1][0]?.kind : undefined, "space");
});

test("editor content block normalizer applies graph defaults", () => {
  const { normalizeContentBlocks } = testNormalizer();
  const [diagram] = normalizeContentBlocks([
    {
      id: "diagram-1",
      kind: "diagram",
      diagramTextSide: "left",
      graphConfig: { type: "statsChart", functions: [], features: [], metadata: { source: "chart" } },
      visibility: "solution",
      markTicks: 1,
    },
  ]);

  assert.equal(diagram.kind, "diagram");
  assert.equal(diagram.kind === "diagram" ? diagram.diagramTextSide : undefined, "left");
  assert.equal(diagram.kind === "diagram" ? diagram.graphConfig.type : undefined, "statsChart");
  assert.equal(diagram.kind === "diagram" ? diagram.graphConfig.metadata?.defaulted : undefined, true);
  assert.equal(diagram.kind === "diagram" ? diagram.markTicks : undefined, 1);
});
