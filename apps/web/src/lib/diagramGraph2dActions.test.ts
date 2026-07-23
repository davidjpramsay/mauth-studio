import assert from "node:assert/strict";
import test from "node:test";

import type { GraphConfig } from "@mauth-studio/shared";

import {
  createAuthoredGraphFeature,
  createAuthoredGraphFunction,
  graphAxisArrowPatch,
  graphAxisArrowVisibility,
  graphFeaturesFromConfig,
  graphFeatureReferencesFunction,
  isSolutionOnlyGraphFunction,
  updateGraphFunction,
} from "./diagramGraph2d.ts";
import { graphAngleMarkerFeaturePoints } from "./graphFeatureGeometry.ts";

const graphConfig: GraphConfig = {
  type: "graph2d",
  xMin: -4,
  xMax: 4,
  yMin: -3,
  yMax: 5,
  functions: [{ expression: "x^2" }],
};

test("axis arrowheads suppress origin endpoints and allow explicit overrides", () => {
  assert.deepEqual(graphAxisArrowVisibility({ type: "graph2d", xMin: 0, xMax: 4, yMin: -2, yMax: 3 }), {
    xMin: false,
    xMax: true,
    yMin: true,
    yMax: true,
  });
  assert.deepEqual(graphAxisArrowVisibility({ type: "graph2d", xMin: 0, xMax: 4, yMin: 0, yMax: 3, showXAxisMinArrow: true }), {
    xMin: true,
    xMax: true,
    yMin: false,
    yMax: true,
  });
  assert.deepEqual(graphAxisArrowVisibility({ type: "graph2d", showArrows: false, showXAxisMaxArrow: true }), {
    xMin: false,
    xMax: false,
    yMin: false,
    yMax: false,
  });
  assert.deepEqual(graphAxisArrowPatch("showYAxisMaxArrow", false), { showArrows: true, showYAxisMaxArrow: false });
});

test("student-mode graph annotations remain shared", () => {
  const feature = createAuthoredGraphFeature("point", 0, graphConfig, false);

  assert.equal(feature.kind, "point");
  assert.equal(feature.solutionOnly, undefined);
});

test("solutions-mode graph annotations default to the solution layer", () => {
  const feature = createAuthoredGraphFeature("point", 0, graphConfig, true);

  assert.equal(feature.kind, "point");
  assert.equal(feature.solutionOnly, true);
});

test("graph functions follow the active authoring layer", () => {
  const studentFunction = createAuthoredGraphFunction(0, false, "x^2");
  const solutionFunction = createAuthoredGraphFunction(1, true, "2*x+1");

  assert.equal(isSolutionOnlyGraphFunction(studentFunction), false);
  assert.equal(solutionFunction.solutionOnly, true);
});

test("focused graph function updates preserve siblings and feature dependencies", () => {
  const functions = [createAuthoredGraphFunction(0, false, "x^2"), createAuthoredGraphFunction(1, true, "2*x+1")];
  const nextFunctions = updateGraphFunction(functions, 1, { label: "answer", showLabel: true });

  assert.ok(nextFunctions);
  assert.equal(nextFunctions?.[0], functions[0]);
  assert.equal(nextFunctions?.[1]?.label, "answer");
  assert.equal(graphFeatureReferencesFunction({ kind: "tangent", functionIndex: 1 }, 1), true);
  assert.equal(graphFeatureReferencesFunction({ kind: "point", x: 0, y: 0 }, 1), false);
});

test("legacy angle markers infer connected line segments and follow later endpoint changes", () => {
  const triangle: GraphConfig = {
    type: "graph2d",
    features: [
      { id: "AB", kind: "line_segment", x1: 0, y1: 0, x2: 3.4, y2: 0 },
      { id: "AC", kind: "line_segment", x1: 0, y1: 0, x2: 2.55, y2: 4.1 },
      { id: "angle-A", kind: "angle_marker", x: 0, y: 0, x1: 1, y1: 0, x2: 0.7, y2: 0.7 },
    ],
  };
  const features = graphFeaturesFromConfig(triangle);
  const marker = features[2];
  assert.equal(marker.firstSegmentId, "AB");
  assert.equal(marker.secondSegmentId, "AC");
  assert.deepEqual(graphAngleMarkerFeaturePoints(marker, { ...triangle, features }), [
    [3.4, 0],
    [0, 0],
    [2.55, 4.1],
  ]);

  const movedFeatures = features.map((feature) => (feature.id === "AC" ? { ...feature, x2: 3, y2: 5 } : feature));
  assert.deepEqual(graphAngleMarkerFeaturePoints(marker, { ...triangle, features: movedFeatures }), [
    [3.4, 0],
    [0, 0],
    [3, 5],
  ]);
});
