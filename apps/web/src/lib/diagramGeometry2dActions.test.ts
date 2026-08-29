import assert from "node:assert/strict";
import test from "node:test";
import type { Graph2DGeometryData, Graph2DGeometryPoint } from "@mauth-studio/shared";

import {
  geometry2dConfigWithLabelPosition,
  geometry2dDataForSolutionVisibility,
  geometry2dDataHasSolutionOnly,
  geometry2dPrimitiveForAuthoringLayer,
  geometry2dPrimitiveWithSolutionOnly,
} from "./diagramGeometry2d.ts";

test("geometry2d label drags update only the targeted primitive position", () => {
  const graphConfig = {
    type: "geometry2d",
    data: {
      points: [{ id: "A", x: 0, y: 0, label: "$A$", labelX: -0.2, labelY: 0.2 }],
      segments: [
        { id: "AB", from: "A", to: "B", label: "$6\\text{ cm}$", labelX: 1, labelY: 2 },
        { id: "BC", from: "B", to: "C", label: "$8\\text{ cm}$", labelX: 3, labelY: 4 },
      ],
    },
  } as const;

  const nextConfig = geometry2dConfigWithLabelPosition(graphConfig, "segment", "AB", 1.23456789, -2.34567891);
  const nextData = nextConfig.data as Graph2DGeometryData;

  assert.deepEqual(nextData.segments?.[0], {
    ...graphConfig.data.segments[0],
    labelX: 1.234568,
    labelY: -2.345679,
  });
  assert.equal(nextData.segments?.[1], graphConfig.data.segments[1]);
  assert.equal(nextData.points?.[0], graphConfig.data.points[0]);
});

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
