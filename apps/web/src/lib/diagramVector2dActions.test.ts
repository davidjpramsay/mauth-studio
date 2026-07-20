import assert from "node:assert/strict";
import test from "node:test";
import type { GraphConfig } from "@mauth-studio/shared";

import {
  vector2dConfigForSolutionVisibility,
  vector2dConfigHasSolutionOnly,
  vector2dElementForAuthoringLayer,
  vector2dElementTarget,
  vector2dElementWithSolutionOnly,
  vector2dMetadata,
  updateVector2DElement,
  type Vector2DControlEntry,
} from "./diagramVector2d.ts";

const config: GraphConfig = {
  type: "vector2d",
  metadata: {
    vector2d: {
      labelStyle: "boldLower",
      vectors: [
        { id: "a", name: "a", label: "", start: [0, 0], components: [2, 1], color: "#111111", showComponents: false },
        {
          id: "b",
          name: "b",
          label: "",
          start: [0, 0],
          components: [1, 3],
          color: "#cc0000",
          showComponents: false,
          solutionOnly: true,
        },
      ],
      segmentLabels: [
        { id: "length-a", vectorId: "a", label: "2", position: 0.5, offsetPx: 18, color: "#111111" },
        { id: "length-b", vectorId: "b", label: "3", position: 0.5, offsetPx: 18, color: "#cc0000", solutionOnly: true },
      ],
      angleMarkers: [
        { id: "angle-ab", from: "a", to: "b", label: "", rightAngle: false, radius: 0.5, color: "#cc0000", solutionOnly: true },
      ],
    },
  },
};

test("vector2d elements follow the active authoring layer", () => {
  const vector: Vector2DControlEntry = {
    id: "c",
    name: "c",
    label: "",
    start: [0, 0],
    components: [1, 1],
    color: "#111111",
    showComponents: false,
  };
  assert.equal(vector2dElementForAuthoringLayer(vector, false), vector);
  assert.equal(vector2dElementForAuthoringLayer(vector, true).solutionOnly, true);
  assert.equal(vector2dElementWithSolutionOnly({ ...vector, solutionOnly: true }, false).solutionOnly, false);
});

test("vector2d visibility hides solution elements from students and colours only answers", () => {
  assert.equal(vector2dConfigHasSolutionOnly(config), true);
  const student = vector2dConfigForSolutionVisibility(config, false, "#1d4ed8");
  assert.deepEqual(
    student.metadata?.vector2d?.vectors?.map((vector) => vector.id),
    ["a"],
  );
  assert.deepEqual(
    student.metadata?.vector2d?.segmentLabels?.map((label) => label.id),
    ["length-a"],
  );
  assert.deepEqual(student.metadata?.vector2d?.angleMarkers, []);

  const solutions = vector2dConfigForSolutionVisibility(config, true, "#1d4ed8");
  assert.equal(solutions.metadata?.vector2d?.vectors?.[0]?.color, "#111111");
  assert.equal(solutions.metadata?.vector2d?.vectors?.[1]?.color, "#1d4ed8");
  assert.equal(solutions.metadata?.vector2d?.segmentLabels?.[1]?.color, "#1d4ed8");
  assert.equal(solutions.metadata?.vector2d?.angleMarkers?.[0]?.color, "#1d4ed8");
});

test("vector2d element updates preserve sibling metadata", () => {
  const target = vector2dElementTarget("angleMarker", 0);
  assert.ok(target);
  const metadata = updateVector2DElement(config, target, { label: "45^\\circ", solutionOnly: false });
  const next: GraphConfig = { ...config, metadata };
  assert.equal(vector2dMetadata(next).angleMarkers?.[0]?.label, "45^\\circ");
  assert.equal(vector2dMetadata(next).angleMarkers?.[0]?.solutionOnly, false);
  assert.deepEqual(vector2dMetadata(next).vectors, vector2dMetadata(config).vectors);
  assert.deepEqual(vector2dMetadata(next).segmentLabels, vector2dMetadata(config).segmentLabels);
});
