import assert from "node:assert/strict";
import test from "node:test";
import type { GraphConfig, GraphFeature, GraphFunction } from "@mauth-studio/shared";

import {
  graph2dInspectorSelection,
  graphFeatureInspectorLabel,
  graphFeatureLabelModeOptions,
  graphFeaturePatch,
  graphFeatureSolutionOnlyPatch,
  graphFunctionPatch,
  graphFunctionSolutionOnlyPatch,
  selectedGraphChildFromAnchor,
} from "./graph2dInspectorSelection.ts";

const functions: GraphFunction[] = [{ expression: "x^2" }, { kind: "relation", expression: "x=y" }];
const features: GraphFeature[] = [
  { kind: "point", x: 1, y: 2, label: "A" },
  { kind: "tangent", functionIndex: 0, x: 1, solutionOnly: true },
];
const graphConfig: GraphConfig = { type: "graph2d", functions, features };

test("graph inspector anchors resolve valid function and feature children", () => {
  assert.deepEqual(selectedGraphChildFromAnchor("q:q1/b:d1/gf:1"), { kind: "function", index: 1 });
  assert.deepEqual(selectedGraphChildFromAnchor("q:q1/b:d1/gfeat:0"), { kind: "feature", index: 0 });
  assert.equal(selectedGraphChildFromAnchor("q:q1/b:d1/gf:-1"), null);
  assert.equal(selectedGraphChildFromAnchor("q:q1/b:d1"), null);
});

test("graph inspector selection exposes readable titles and summaries", () => {
  const relationSelection = graph2dInspectorSelection(graphConfig, "q:q1/b:d1/gf:1");
  assert.equal(relationSelection.title, "Relation 2");
  assert.equal(relationSelection.summary, "Function display settings");
  assert.equal(relationSelection.selectedFunction?.graphFunction, functions[1]);

  const featureSelection = graph2dInspectorSelection(graphConfig, "q:q1/b:d1/gfeat:0");
  assert.equal(featureSelection.title, "Point 1: A");
  assert.equal(featureSelection.summary, "Feature display settings");
  assert.equal(featureSelection.selectedFeature?.feature, features[0]);

  const missingSelection = graph2dInspectorSelection(graphConfig, "q:q1/b:d1/gfeat:9");
  assert.equal(missingSelection.selectedFeature, null);
  assert.equal(missingSelection.title, null);
});

test("graph inspector patches update one child and preserve siblings", () => {
  const nextFunctions = graphFunctionPatch(functions, 1, { label: "relation" });
  assert.equal(nextFunctions[0], functions[0]);
  assert.equal(nextFunctions[1].label, "relation");

  const solutionFunctions = graphFunctionSolutionOnlyPatch(functions, 0, true);
  assert.equal(solutionFunctions[0].solutionOnly, true);
  assert.equal(solutionFunctions[1], functions[1]);
  const sharedFunctions = graphFunctionSolutionOnlyPatch(solutionFunctions, 0, false);
  assert.equal(sharedFunctions[0].solutionOnly, undefined);

  const nextFeatures = graphFeaturePatch(features, 0, { color: "#123456" });
  assert.equal(nextFeatures[0].color, "#123456");
  assert.equal(nextFeatures[1], features[1]);

  const sharedFeatures = graphFeatureSolutionOnlyPatch(features, 1, false);
  assert.equal(sharedFeatures[1].solutionOnly, undefined);
  assert.equal(features[1].solutionOnly, true);
});

test("graph feature labels and label modes follow the feature kind", () => {
  assert.equal(graphFeatureInspectorLabel(features[0], 0), "Point 1: A");
  assert.ok(graphFeatureLabelModeOptions(features[1]).some((option) => option.value === "coordinates"));
});
