import assert from "node:assert/strict";
import test from "node:test";

import type { GraphConfig } from "@mauth-studio/shared";

import {
  DEFAULT_STATS_CHART,
  diagramTypePatch,
  effectiveDiagramTextSide,
  isPenroseDiagramType,
  normalizeDiagramType,
  updateGraphConfig,
  withGraphDefaults,
} from "./editorDiagramConfig.ts";

test("normalizeDiagramType maps legacy graph names and rejects unknown types", () => {
  assert.equal(normalizeDiagramType("2d_graph"), "graph2d");
  assert.equal(normalizeDiagramType("function"), "graph2d");
  assert.equal(normalizeDiagramType("basic3d"), "graph3d");
  assert.equal(normalizeDiagramType("setDiagram"), "setDiagram");
  assert.equal(normalizeDiagramType("made-up"), "graph2d");
  assert.equal(isPenroseDiagramType("network"), true);
});

test("diagramTypePatch resets stale non-coordinate diagram state when switching type", () => {
  const patch = diagramTypePatch("graph3d", {
    type: "setDiagram",
    data: { sets: [] },
    style: "sets",
    options: { substanceSource: "Universe U" },
  } as GraphConfig);

  assert.equal(patch.type, "graph3d");
  assert.equal(patch.functions?.length, 0);
  assert.equal(patch.features?.length, 0);
});

test("withGraphDefaults normalizes stats and image diagrams", () => {
  const stats = withGraphDefaults({ type: "statsChart" } as GraphConfig);
  assert.equal(stats.type, "statsChart");
  assert.equal(stats.data?.chartType, DEFAULT_STATS_CHART.data?.chartType);
  assert.equal(stats.data?.yLabelOrientation, "vertical");
  assert.deepEqual(stats.data?.values, DEFAULT_STATS_CHART.data?.values);
  assert.deepEqual(stats.functions, []);
  assert.deepEqual(stats.features, []);

  const image = withGraphDefaults({ type: "image", data: { src: "x.png" }, widthPx: Number.NaN, heightPx: 120 } as GraphConfig);
  assert.equal(image.type, "image");
  assert.equal(image.widthPx, 420);
  assert.equal(image.heightPx, 120);
});

test("updateGraphConfig keeps function-derived expression and metadata stable", () => {
  const updated = updateGraphConfig(
    {
      type: "graph2d",
      metadata: { source: "manual" },
      functions: [{ expression: "x^2", latex: "x^2" }],
    } as GraphConfig,
    {
      functions: [{ expression: "x+1", latex: "x+1" }],
    } as Partial<GraphConfig>,
  );

  assert.equal(updated.expression, "x+1");
  assert.equal(updated.latex, "x+1");
  assert.deepEqual(updated.metadata, { source: "manual" });
});

test("effectiveDiagramTextSide follows alignment only when beside content exists", () => {
  assert.equal(effectiveDiagramTextSide({ diagramAlign: "left" }, true), "right");
  assert.equal(effectiveDiagramTextSide({ diagramAlign: "right" }, true), "left");
  assert.equal(effectiveDiagramTextSide({ diagramAlign: "left" }, false), "none");
});
