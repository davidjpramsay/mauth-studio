import assert from "node:assert/strict";
import test from "node:test";
import type { GraphConfig, GraphFeature } from "@mauth-studio/shared";

import { previewGraphConfigForSolutionVisibility } from "./previewDiagramVisibility.ts";

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
