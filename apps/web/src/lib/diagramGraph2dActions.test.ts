import assert from "node:assert/strict";
import test from "node:test";

import type { GraphConfig } from "@mauth-studio/shared";

import {
  createAuthoredGraphFeature,
  createAuthoredGraphFunction,
  graphFeatureReferencesFunction,
  isSolutionOnlyGraphFunction,
  updateGraphFunction,
} from "./diagramGraph2d.ts";

const graphConfig: GraphConfig = {
  type: "graph2d",
  xMin: -4,
  xMax: 4,
  yMin: -3,
  yMax: 5,
  functions: [{ expression: "x^2" }],
};

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
