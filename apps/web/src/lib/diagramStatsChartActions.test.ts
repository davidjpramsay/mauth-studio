import assert from "node:assert/strict";
import test from "node:test";
import type { GraphConfig, StatsChartSeriesData } from "@mauth-studio/shared";

import {
  statsChartConfigForSolutionVisibility,
  statsChartDataWithSeries,
  statsChartSeries,
  statsChartSeriesAt,
  statsChartSeriesForAuthoringLayer,
  statsChartSeriesTarget,
  statsChartSeriesWithSolutionOnly,
  updateStatsChartSeries,
} from "./diagramStatsChart.ts";

const SHARED_SERIES: StatsChartSeriesData = {
  id: "shared",
  label: "Observed",
  seriesType: "points",
  xValues: [0, 1],
  yValues: [1, 2],
  color: "#111111",
};
const SOLUTION_SERIES: StatsChartSeriesData = {
  id: "answer",
  label: "Model",
  seriesType: "line",
  xValues: [0, 1, 2],
  yValues: [0, 1, 0],
  color: "#be123c",
  solutionOnly: true,
};
const CONFIG: GraphConfig = {
  type: "statsChart",
  data: {
    chartType: "blankAxes",
    range: [0, 2],
    yRange: [0, 2],
    series: [SHARED_SERIES, SOLUTION_SERIES],
  },
  options: { widthPx: 420, heightPx: 260 },
};

test("statsChart series follow the active authoring layer", () => {
  assert.equal(statsChartSeriesForAuthoringLayer(SHARED_SERIES, false).solutionOnly, undefined);
  assert.equal(statsChartSeriesForAuthoringLayer(SHARED_SERIES, true).solutionOnly, true);
  assert.equal(statsChartSeriesWithSolutionOnly(SHARED_SERIES, true).solutionOnly, true);
});

test("statsChart visibility hides student answers and colours only solution series", () => {
  const student = statsChartConfigForSolutionVisibility(CONFIG, false, "#1d4ed8");
  const solutions = statsChartConfigForSolutionVisibility(CONFIG, true, "#1d4ed8");
  assert.deepEqual(
    statsChartSeries(student).map((series) => series.id),
    ["shared"],
  );
  assert.equal(statsChartSeries(solutions)[0]?.color, "#111111");
  assert.equal(statsChartSeries(solutions)[1]?.color, "#1d4ed8");
  assert.deepEqual(student.data?.range, [0, 2]);
});

test("statsChart series updates preserve siblings and chart settings", () => {
  const target = statsChartSeriesTarget(CONFIG, 1);
  assert.ok(target);
  const data = updateStatsChartSeries(CONFIG, target, { label: "Completed curve", solutionOnly: true });
  const updated: GraphConfig = { ...CONFIG, data };
  assert.deepEqual(data.series?.[0], SHARED_SERIES);
  assert.equal(statsChartSeriesAt(updated, target)?.label, "Completed curve");
  assert.deepEqual(updated.data?.range, [0, 2]);
  assert.deepEqual(updated.options, CONFIG.options);
});

test("statsChart data patches preserve non-series data", () => {
  const data = statsChartDataWithSeries(CONFIG, [SHARED_SERIES]);
  assert.equal(data.chartType, "blankAxes");
  assert.deepEqual(data.yRange, [0, 2]);
  assert.deepEqual(data.series, [SHARED_SERIES]);
});
