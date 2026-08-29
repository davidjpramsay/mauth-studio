import assert from "node:assert/strict";
import test from "node:test";
import type { GraphConfig } from "@mauth-studio/shared";

import {
  graph3dConnectedDimensionOptions,
  graph3dDimensionsShareEndpoint,
  graph3dConfigForSolutionVisibility,
  graph3dConfigWithLabelScreenOffset,
  graph3dData,
  graph3dDataWithRenamedPoint,
  graph3dElementAt,
  graph3dElementForAuthoringLayer,
  graph3dElementTarget,
  graph3dElementWithSolutionOnly,
  graph3dPerpendicularTargetOptions,
  normalizedGraph3DElements,
  updateGraph3DElement,
} from "./diagramGraph3d.ts";

const GRAPH_3D_CONFIG: GraphConfig = {
  type: "graph3d",
  data: {
    points: [
      { id: "A", label: "A", coords: [0, 0, 0], color: "#111827" },
      { id: "B", label: "B", coords: [2, 1, 1], color: "#b45309", solutionOnly: true },
      { id: "C", label: "C", coords: [2, 0, 0], color: "#0f766e" },
    ],
    segments: [
      { id: "shared", from: "A", to: "C", color: "#111827" },
      { id: "answer", from: "A", to: "B", color: "#be123c", solutionOnly: true },
      { id: "dependent", from: "B", to: "C", color: "#7c3aed" },
    ],
    dimensions: [{ id: "length", from: "A", to: "B", label: "d", solutionOnly: true }],
    faces: [{ id: "face", points: ["A", "B", "C"], fillColor: "#93c5fd" }],
    solids: [{ id: "sphere", kind: "sphere", center: "B", radius: 0.5, solutionOnly: true }],
    xRange: [-1, 3],
    yRange: [-1, 3],
    zRange: [-1, 3],
  },
};

test("graph3d elements follow the active authoring layer", () => {
  const point = { id: "D", label: "D", coords: [1, 2, 3] as [number, number, number] };
  assert.equal(graph3dElementForAuthoringLayer(point, false).solutionOnly, undefined);
  assert.equal(graph3dElementForAuthoringLayer(point, true).solutionOnly, true);
  assert.equal(graph3dElementWithSolutionOnly(point, true).solutionOnly, true);
});

test("graph3d student visibility preserves framing and removes answer dependencies", () => {
  const student = graph3dConfigForSolutionVisibility(GRAPH_3D_CONFIG, false, "#1d4ed8");
  const studentPoints = normalizedGraph3DElements(student, "point");
  const studentSegments = normalizedGraph3DElements(student, "segment");

  assert.equal(studentPoints.length, 3);
  assert.equal(studentPoints.find((point) => point.id === "B")?.show, false);
  assert.deepEqual(
    studentSegments.map((segment) => segment.id),
    ["shared"],
  );
  assert.deepEqual(normalizedGraph3DElements(student, "dimension"), []);
  assert.deepEqual(normalizedGraph3DElements(student, "face"), []);
  assert.deepEqual(normalizedGraph3DElements(student, "solid"), []);
  assert.deepEqual(graph3dData(student).xRange, [-1, 3]);
});

test("graph3d solution visibility colours only solution elements", () => {
  const solutions = graph3dConfigForSolutionVisibility(GRAPH_3D_CONFIG, true, "#1d4ed8");
  const points = normalizedGraph3DElements(solutions, "point");
  const segments = normalizedGraph3DElements(solutions, "segment");
  const dimensions = normalizedGraph3DElements(solutions, "dimension");
  const faces = normalizedGraph3DElements(solutions, "face");
  const solids = normalizedGraph3DElements(solutions, "solid");

  assert.equal(points.find((point) => point.id === "A")?.color, "#111827");
  assert.equal(points.find((point) => point.id === "B")?.color, "#1d4ed8");
  assert.equal(segments.find((segment) => segment.id === "shared")?.color, "#111827");
  assert.equal(segments.find((segment) => segment.id === "answer")?.color, "#1d4ed8");
  assert.equal(dimensions[0]?.strokeColor, "#1d4ed8");
  assert.equal(faces[0]?.fillColor, "#93c5fd");
  assert.equal(solids[0]?.fillColor, "#1d4ed8");
});

test("graph3d element updates preserve sibling data and legacy list aliases", () => {
  const config: GraphConfig = {
    type: "graph3d",
    data: {
      vertices: [
        { id: "A", coords: [0, 0, 0] },
        { id: "B", coords: [1, 1, 1] },
      ],
      edges: [{ from: "A", to: "B", label: "AB" }],
      xRange: [-2, 2],
    },
  };
  const target = graph3dElementTarget(config, "segment", 0);
  assert.ok(target);
  const data = updateGraph3DElement(config, target, { solutionOnly: true, color: "#1d4ed8" });
  const updated: GraphConfig = { ...config, data };

  assert.equal(target.listKey, "edges");
  assert.equal(graph3dElementAt(updated, target)?.solutionOnly, true);
  assert.equal(normalizedGraph3DElements(updated, "point").length, 2);
  assert.deepEqual(graph3dData(updated).xRange, [-2, 2]);
});

test("graph3d label screen offsets update one labelled element and can be reset", () => {
  const moved = graph3dConfigWithLabelScreenOffset(GRAPH_3D_CONFIG, "dimension", "length", [34, -18]);
  assert.deepEqual(normalizedGraph3DElements(moved, "dimension")[0]?.labelScreenOffsetPx, [34, -18]);
  assert.equal(normalizedGraph3DElements(moved, "segment")[0]?.labelScreenOffsetPx, undefined);

  const reset = graph3dConfigWithLabelScreenOffset(moved, "dimension", "length", undefined);
  assert.equal(normalizedGraph3DElements(reset, "dimension")[0]?.labelScreenOffsetPx, undefined);
});

test("graph3d dimensions report whether they share an authored endpoint", () => {
  assert.equal(graph3dDimensionsShareEndpoint({ from: "A", to: "B" }, { from: "A", to: "C" }), true);
  assert.equal(graph3dDimensionsShareEndpoint({ from: [0, 0, 0], to: [0, 0, 8] }, { from: [3, 0, 0], to: [0, 0, 0] }), true);
  assert.equal(graph3dDimensionsShareEndpoint({ from: "A", to: "B" }, { from: "C", to: "D" }), false);
});

test("graph3d connected dimension options expose only valid perpendicular partners", () => {
  const config: GraphConfig = {
    type: "graph3d",
    data: {
      dimensions: [
        { id: "radius", from: [0, 0, 0], to: [3, 0, 0] },
        { id: "height", from: [0, 0, 0], to: [0, 0, 8] },
        { id: "separate", from: [4, 0, 0], to: [4, 2, 0] },
      ],
    },
  };

  assert.deepEqual(graph3dConnectedDimensionOptions(config, 0), [{ id: "height", index: 1, label: "Dimension 2 (height)" }]);
  assert.deepEqual(graph3dConnectedDimensionOptions(config, 2), []);
});

test("graph3d perpendicular targets include a compatible face plane", () => {
  const config: GraphConfig = {
    type: "graph3d",
    data: {
      points: [
        { id: "O", coords: [0, 0, 0] },
        { id: "B", coords: [6, 0, 0] },
        { id: "C", coords: [6, 6, 0] },
        { id: "D", coords: [0, 6, 0] },
        { id: "T", coords: [0, 0, 10] },
      ],
      dimensions: [{ id: "height", from: "O", to: "T" }],
      faces: [
        { id: "base", points: ["O", "B", "C", "D"] },
        { id: "side", points: ["O", "B", "T"] },
      ],
    },
  };

  assert.deepEqual(graph3dPerpendicularTargetOptions(config, 0), [{ id: "face:base", index: 0, kind: "face", label: "Face 1 (base)" }]);
});

test("graph3d point renames update every dependent reference atomically", () => {
  const renamed = graph3dDataWithRenamedPoint(GRAPH_3D_CONFIG, 1, "D");
  const config: GraphConfig = { ...GRAPH_3D_CONFIG, data: renamed };
  assert.equal(normalizedGraph3DElements(config, "point")[1]?.id, "D");
  assert.equal(normalizedGraph3DElements(config, "segment")[1]?.to, "D");
  assert.equal(normalizedGraph3DElements(config, "segment")[2]?.from, "D");
  assert.equal(normalizedGraph3DElements(config, "dimension")[0]?.to, "D");
  assert.deepEqual(normalizedGraph3DElements(config, "face")[0]?.points, ["A", "D", "C"]);
  assert.equal(normalizedGraph3DElements(config, "solid")[0]?.center, "D");
});
