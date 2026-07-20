import assert from "node:assert/strict";
import test from "node:test";
import type { Graph2DGeometryData, Graph2DGeometryPoint } from "@mauth-studio/shared";

import {
  geometry2dDataForSolutionVisibility,
  geometry2dDataHasSolutionOnly,
  geometry2dPrimitiveForAuthoringLayer,
  geometry2dPrimitiveWithSolutionOnly,
} from "./diagramGeometry2d.ts";

test("geometry2d primitives follow the active authoring layer", () => {
  const point: Graph2DGeometryPoint = { id: "A", x: 1, y: 2 };
  assert.equal(geometry2dPrimitiveForAuthoringLayer(point, false), point);

  const solutionPoint = geometry2dPrimitiveForAuthoringLayer(point, true);
  assert.notEqual(solutionPoint, point);
  assert.equal(solutionPoint.solutionOnly, true);
});

test("geometry2d solution visibility can be set and deliberately cleared", () => {
  const point: Graph2DGeometryPoint = { id: "A", x: 1, y: 2 };
  const solutionPoint = geometry2dPrimitiveWithSolutionOnly(point, true);
  assert.equal(solutionPoint.solutionOnly, true);

  const sharedPoint = geometry2dPrimitiveWithSolutionOnly(solutionPoint, false);
  assert.equal(sharedPoint.solutionOnly, false);
});

test("geometry2d student visibility removes solution primitives and solution preview colours only answers", () => {
  const data: Graph2DGeometryData = {
    points: [
      { id: "A", x: 0, y: 0, color: "#111111" },
      { id: "B", x: 2, y: 1, color: "#cc0000", solutionOnly: true },
    ],
    segments: [{ id: "AB", from: "A", to: "B", solutionOnly: true }],
    decorations: [{ kind: "rightAngle", angle: "ABC", solutionOnly: true }],
  };

  assert.equal(geometry2dDataHasSolutionOnly(data), true);

  const studentData = geometry2dDataForSolutionVisibility(data, false);
  assert.deepEqual(
    studentData.points?.map((point) => point.id),
    ["A"],
  );
  assert.deepEqual(studentData.segments, []);
  assert.deepEqual(studentData.decorations, []);

  const solutionData = geometry2dDataForSolutionVisibility(data, true, "#1d4ed8");
  assert.equal(solutionData.points?.[0]?.color, "#111111");
  assert.equal(solutionData.points?.[1]?.color, "#1d4ed8");
  assert.equal(solutionData.segments?.[0]?.color, "#1d4ed8");
  assert.equal(solutionData.decorations?.[0]?.color, "#1d4ed8");
});
