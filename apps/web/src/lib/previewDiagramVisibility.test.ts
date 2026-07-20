import assert from "node:assert/strict";
import test from "node:test";
import type { GraphConfig, GraphFeature } from "@mauth-studio/shared";

import { geometry2dData } from "./diagramGeometry2d.ts";
import { normalizedGraph3DElements } from "./diagramGraph3d.ts";
import {
  previewGeometry2DConfigForSolutionVisibility,
  previewGraph3DConfigForSolutionVisibility,
  previewGraphConfigForSolutionVisibility,
  previewStatsChartConfigForSolutionVisibility,
  previewVector2DConfigForSolutionVisibility,
} from "./previewDiagramVisibility.ts";

const visibleFeature: GraphFeature = { kind: "point", x: 0, y: 0, label: "A" };
const solutionOnlyFeature: GraphFeature = { kind: "point", x: 1, y: 1, label: "B", solutionOnly: true };

function isSolutionOnly(feature: GraphFeature) {
  return feature.solutionOnly === true;
}

test("previewGraphConfigForSolutionVisibility leaves solution features visible in solutions mode", () => {
  const config: GraphConfig = {
    type: "graph2d",
    features: [visibleFeature, solutionOnlyFeature],
  };

  assert.equal(previewGraphConfigForSolutionVisibility(config, true, isSolutionOnly), config);
});

test("previewGraphConfigForSolutionVisibility hides solution-only features in student mode", () => {
  const config: GraphConfig = {
    type: "graph2d",
    features: [visibleFeature, solutionOnlyFeature],
  };

  const result = previewGraphConfigForSolutionVisibility(config, false, isSolutionOnly);

  assert.notEqual(result, config);
  assert.deepEqual(result.features, [visibleFeature]);
});

test("previewGraphConfigForSolutionVisibility reuses the config when no solution-only features exist", () => {
  const config: GraphConfig = {
    type: "graph2d",
    features: [visibleFeature],
  };

  assert.equal(previewGraphConfigForSolutionVisibility(config, false, isSolutionOnly), config);
});

test("previewGraphConfigForSolutionVisibility hides solution functions without shifting dependent indexes", () => {
  const sharedFeature: GraphFeature = { kind: "point", x: 0, y: 0, label: "O" };
  const dependentFeature: GraphFeature = { kind: "tangent", functionIndex: 1, x: 0 };
  const config: GraphConfig = {
    type: "graph2d",
    functions: [
      { id: "shared", expression: "x^2" },
      { id: "answer", expression: "2*x+1", show: true, showLabel: true, solutionOnly: true },
    ],
    features: [sharedFeature, dependentFeature],
  };

  const student = previewGraphConfigForSolutionVisibility(config, false, isSolutionOnly);
  assert.equal(student.functions?.length, 2);
  assert.equal(student.functions?.[1]?.show, false);
  assert.equal(student.functions?.[1]?.showLabel, false);
  assert.deepEqual(student.features, [sharedFeature]);
  assert.equal(previewGraphConfigForSolutionVisibility(config, true, isSolutionOnly), config);
});

test("previewGeometry2DConfigForSolutionVisibility hides solution-only primitives from students", () => {
  const config: GraphConfig = {
    type: "geometry2d",
    data: {
      points: [
        { id: "A", x: 0, y: 0 },
        { id: "B", x: 1, y: 1, solutionOnly: true },
      ],
    },
  };

  const result = previewGeometry2DConfigForSolutionVisibility(config, false, "#1d4ed8");
  assert.deepEqual(
    geometry2dData(result).points?.map((point) => point.id),
    ["A"],
  );
});

test("previewGeometry2DConfigForSolutionVisibility colours solution-only primitives in solutions mode", () => {
  const config: GraphConfig = {
    type: "geometry2d",
    data: {
      points: [{ id: "B", x: 1, y: 1, color: "#cc0000", solutionOnly: true }],
    },
  };

  const result = previewGeometry2DConfigForSolutionVisibility(config, true, "#1d4ed8");
  assert.equal(geometry2dData(result).points?.[0]?.color, "#1d4ed8");
  assert.equal(geometry2dData(config).points?.[0]?.color, "#cc0000");
});

test("previewVector2DConfigForSolutionVisibility filters and colours structured vector elements", () => {
  const config: GraphConfig = {
    type: "vector2d",
    metadata: {
      vector2d: {
        vectors: [
          { id: "a", name: "a", label: "", start: [0, 0], components: [1, 0], color: "#111111", showComponents: false },
          {
            id: "b",
            name: "b",
            label: "",
            start: [0, 0],
            components: [0, 1],
            color: "#cc0000",
            showComponents: false,
            solutionOnly: true,
          },
        ],
      },
    },
  };
  assert.deepEqual(
    previewVector2DConfigForSolutionVisibility(config, false, "#1d4ed8").metadata?.vector2d?.vectors?.map((vector) => vector.id),
    ["a"],
  );
  assert.equal(previewVector2DConfigForSolutionVisibility(config, true, "#1d4ed8").metadata?.vector2d?.vectors?.[1]?.color, "#1d4ed8");
});

test("previewGraph3DConfigForSolutionVisibility hides and colours structured 3D elements", () => {
  const config: GraphConfig = {
    type: "graph3d",
    data: {
      points: [
        { id: "A", coords: [0, 0, 0], color: "#111111" },
        { id: "B", coords: [1, 1, 1], color: "#cc0000", solutionOnly: true },
      ],
      segments: [{ id: "answer", from: "A", to: "B", label: "AB", solutionOnly: true }],
    },
  };
  const student = previewGraph3DConfigForSolutionVisibility(config, false, "#1d4ed8");
  const solutions = previewGraph3DConfigForSolutionVisibility(config, true, "#1d4ed8");
  assert.equal(normalizedGraph3DElements(student, "point")[1]?.show, false);
  assert.deepEqual(normalizedGraph3DElements(student, "segment"), []);
  assert.equal(normalizedGraph3DElements(solutions, "point")[1]?.color, "#1d4ed8");
  assert.equal(normalizedGraph3DElements(solutions, "segment")[0]?.color, "#1d4ed8");
});

test("previewStatsChartConfigForSolutionVisibility hides and colours supplemental series", () => {
  const config: GraphConfig = {
    type: "statsChart",
    data: {
      chartType: "blankAxes",
      series: [
        { id: "shared", seriesType: "points", xValues: [0], yValues: [1], color: "#111111" },
        { id: "answer", seriesType: "line", xValues: [0, 1], yValues: [0, 1], color: "#cc0000", solutionOnly: true },
      ],
    },
  };
  const student = previewStatsChartConfigForSolutionVisibility(config, false, "#1d4ed8");
  const solutions = previewStatsChartConfigForSolutionVisibility(config, true, "#1d4ed8");
  assert.deepEqual(
    student.data?.series?.map((series) => series.id),
    ["shared"],
  );
  assert.equal(solutions.data?.series?.[1]?.color, "#1d4ed8");
});
