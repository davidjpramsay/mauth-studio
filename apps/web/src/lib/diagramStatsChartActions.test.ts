import assert from "node:assert/strict";
import test from "node:test";
import type { GraphConfig, StatsChartRegionData, StatsChartSeriesData } from "@mauth-studio/shared";

import {
  deleteStatsChartRegion,
  statsChartConfigForSolutionVisibility,
  statsChartDataWithSeries,
  statsChartRegionAt,
  statsChartRegionForAuthoringLayer,
  statsChartRegionTarget,
  statsChartRegionWithSolutionOnly,
  statsChartRegions,
  statsChartSeries,
  statsChartSeriesAt,
  statsChartSeriesForAuthoringLayer,
  statsChartSeriesTarget,
  statsChartSeriesWithSolutionOnly,
  updateStatsChartSeries,
  updateStatsChartRegion,
  upsertStatsChartRegion,
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
const SHARED_REGION: StatsChartRegionData = {
  id: "shared-region",
  mode: "leftTail",
  upper: -1,
  fillColor: "#94a3b8",
  fillOpacity: 0.2,
};
const SOLUTION_REGION: StatsChartRegionData = {
  id: "answer-region",
  mode: "between",
  lower: -1,
  upper: 1,
  fillColor: "#be123c",
  fillOpacity: 0.22,
  solutionOnly: true,
};
const REGION_CONFIG: GraphConfig = {
  type: "statsChart",
  data: {
    chartType: "normal",
    mean: 0,
    stdDev: 1,
    range: [-3.2, 3.2],
    regions: [SHARED_REGION, SOLUTION_REGION],
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

test("statsChart regions follow the active authoring layer", () => {
  assert.equal(statsChartRegionForAuthoringLayer(SHARED_REGION, false).solutionOnly, undefined);
  assert.equal(statsChartRegionForAuthoringLayer(SHARED_REGION, true).solutionOnly, true);
  assert.equal(statsChartRegionWithSolutionOnly(SHARED_REGION, true).solutionOnly, true);
});

test("statsChart visibility hides student regions and colours only solution regions", () => {
  const student = statsChartConfigForSolutionVisibility(REGION_CONFIG, false, "#1d4ed8");
  const solutions = statsChartConfigForSolutionVisibility(REGION_CONFIG, true, "#1d4ed8");
  assert.deepEqual(
    statsChartRegions(student).map((region) => region.id),
    ["shared-region"],
  );
  assert.equal(statsChartRegions(solutions)[0]?.fillColor, "#94a3b8");
  assert.equal(statsChartRegions(solutions)[1]?.fillColor, "#1d4ed8");
  assert.deepEqual(student.data?.range, [-3.2, 3.2]);
});

test("statsChart region updates, upserts, and deletes preserve chart settings", () => {
  const target = statsChartRegionTarget(REGION_CONFIG, 1);
  assert.ok(target);
  const updatedData = updateStatsChartRegion(REGION_CONFIG, target, { upper: 2 });
  const updated: GraphConfig = { ...REGION_CONFIG, data: updatedData };
  assert.equal(statsChartRegionAt(updated, target)?.upper, 2);
  assert.deepEqual(updated.data?.range, [-3.2, 3.2]);

  const addedData = upsertStatsChartRegion(updated, {
    id: "right-tail",
    mode: "rightTail",
    lower: 2,
    solutionOnly: true,
  });
  const added: GraphConfig = { ...updated, data: addedData };
  assert.deepEqual(
    statsChartRegions(added).map((region) => region.id),
    ["shared-region", "answer-region", "right-tail"],
  );

  const removedData = deleteStatsChartRegion(added, statsChartRegionTarget(added, 2)!);
  assert.deepEqual(
    removedData.regions?.map((region) => region.id),
    ["shared-region", "answer-region"],
  );
  assert.deepEqual(added.options, REGION_CONFIG.options);
});
