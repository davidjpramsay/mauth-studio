import assert from "node:assert/strict";
import test from "node:test";

import { buildStatsChartPlotlyConfig, normalizeStatsChartSpec } from "../src/index.ts";

test("normalizes manual probability column graphs with horizontal y-axis labels", () => {
  const spec = normalizeStatsChartSpec({
    type: "statsChart",
    data: {
      chartType: "histogram",
      dataMode: "manualProbabilities",
      yLabelOrientation: "horizontal",
      xValues: [2, 4, 5],
      probabilities: [0.1, 0.25, 0.3],
      yLabel: "P(X=x)",
    },
  });

  assert.equal(spec.data.dataMode, "manualProbabilities");
  assert.equal(spec.data.barType, "discrete");
  assert.equal(spec.data.yAxisMode, "frequency");
  assert.equal(spec.data.yLabelOrientation, "horizontal");

  const config = buildStatsChartPlotlyConfig(spec);
  const trace = config.data[0];
  const layout = config.layout as { margin: { l: number; t: number }; yaxis: { title: { text: string } } };

  assert.deepEqual(trace.x, [2, 4, 5]);
  assert.deepEqual(trace.y, [0.1, 0.25, 0.3]);
  assert.equal(layout.yaxis.title.text, "");
  assert.equal(layout.margin.l, 60);
  assert.equal(layout.margin.t, 34);
});

test("plots discrete raw data as relative-frequency columns", () => {
  const config = buildStatsChartPlotlyConfig({
    type: "statsChart",
    data: {
      chartType: "histogram",
      barType: "discrete",
      yAxisMode: "relativeFrequency",
      values: [2, 2, 4, 5],
    },
  });

  const trace = config.data[0];
  const layout = config.layout as { yaxis: { dtick: number; range: [number, number] } };

  assert.deepEqual(trace.x, [2, 4, 5]);
  assert.deepEqual(trace.y, [0.5, 0.25, 0.25]);
  assert.equal(layout.yaxis.dtick, 0.1);
  assert.deepEqual(layout.yaxis.range, [0, 0.5]);
});

test("keeps vertical y-axis labels as the default", () => {
  const spec = normalizeStatsChartSpec({
    type: "statsChart",
    data: {
      chartType: "histogram",
      values: [1, 2, 3],
    },
  });

  assert.equal(spec.data.yLabelOrientation, "vertical");
});

test("plots source probability density curves from explicit points", () => {
  const config = buildStatsChartPlotlyConfig({
    type: "statsChart",
    data: {
      chartType: "density",
      points: [
        { x: 150, y: 0 },
        { x: 180, y: 0.02 },
        { x: 210, y: 0 },
      ],
      range: [150, 210],
      yRange: [0, 0.03],
      xLabel: "Response length",
      yLabel: "Density",
    },
  });

  const trace = config.data[0];
  const layout = config.layout as { xaxis: { range: [number, number] }; yaxis: { range: [number, number] } };

  assert.equal(trace.type, "scatter");
  assert.equal(trace.mode, "lines");
  assert.deepEqual(trace.x, [150, 180, 210]);
  assert.deepEqual(trace.y, [0, 0.02, 0]);
  assert.deepEqual(layout.xaxis.range, [150, 210]);
  assert.deepEqual(layout.yaxis.range, [0, 0.03]);
});

test("renders blank statistics axes for student distribution sketches", () => {
  const config = buildStatsChartPlotlyConfig({
    type: "statsChart",
    data: {
      chartType: "blankAxes",
      range: [2.1, 2.7],
      yRange: [0, 4],
      xLabel: "Sample mean",
      yLabel: "Density",
    },
  });

  const layout = config.layout as { xaxis: { range: [number, number] }; yaxis: { range: [number, number] } };

  assert.deepEqual(config.data, []);
  assert.deepEqual(layout.xaxis.range, [2.1, 2.7]);
  assert.deepEqual(layout.yaxis.range, [0, 4]);
});
