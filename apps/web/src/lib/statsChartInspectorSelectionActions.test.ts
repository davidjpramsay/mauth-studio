import assert from "node:assert/strict";
import test from "node:test";

import {
  statsChartDataPatch,
  statsChartFillOpacity,
  statsChartInspectorSelection,
  statsChartOptionsPatch,
} from "./statsChartInspectorSelection.ts";

test("statistics inspector selection normalizes Plotly data and options", () => {
  const selection = statsChartInspectorSelection({
    type: "statsChart",
    data: { chartType: "blankAxes", xLabel: "x" },
    options: { widthPx: 460, heightPx: 300, showFill: false },
  });
  assert.equal(selection.title, "Chart settings");
  assert.equal(selection.spec.data.chartType, "blankAxes");
  assert.equal(selection.spec.options?.widthPx, 460);
  assert.equal(selection.fillColor, "#f5f5f5");
  assert.equal(selection.fillOpacity, 1);
  assert.equal(selection.fillDisabled, true);
});

test("statistics inspector patches preserve normalized siblings and mirrored dimensions", () => {
  const spec = statsChartInspectorSelection({
    type: "statsChart",
    data: { chartType: "blankAxes", xLabel: "x" },
    options: { widthPx: 420, heightPx: 280, showGrid: true },
  }).spec;
  assert.deepEqual(statsChartDataPatch(spec, { xLabel: "t" }), {
    data: { ...spec.data, xLabel: "t" },
    options: spec.options,
    widthPx: 420,
    heightPx: 280,
  });
  assert.deepEqual(statsChartOptionsPatch(spec, { widthPx: 460, showGrid: false }), {
    options: { ...spec.options, widthPx: 460, showGrid: false },
    widthPx: 460,
    heightPx: 280,
  });
});

test("statistics inspector opacity keeps the existing zero-to-one clamp", () => {
  assert.equal(statsChartFillOpacity(""), undefined);
  assert.equal(statsChartFillOpacity("-0.5"), 0);
  assert.equal(statsChartFillOpacity("0.4"), 0.4);
  assert.equal(statsChartFillOpacity("2"), 1);
  assert.equal(statsChartFillOpacity("not-a-number"), undefined);
});
