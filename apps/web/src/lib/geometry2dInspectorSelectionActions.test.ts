import assert from "node:assert/strict";
import test from "node:test";
import type { GraphConfig } from "@mauth-studio/shared";

import { geometry2dInspectorSelection, geometry2dParentAnchor, selectedGeometryChildFromAnchor } from "./geometry2dInspectorSelection.ts";

const graphConfig: GraphConfig = {
  type: "geometry2d",
  data: {
    points: [
      { id: "A", label: "Alpha", x: 0, y: 0 },
      { id: "B", x: 2, y: 1 },
    ],
    segments: [{ id: "AB", from: "A", to: "B" }],
    arcs: [{ id: "arc-1", center: "A", from: "A", to: "B" }],
    angles: [{ id: "angle-1", points: ["A", "B", "A"] }],
    decorations: [{ kind: "equalLength", segments: ["AB"] }],
  },
};

test("geometry inspector anchors resolve only valid child targets", () => {
  assert.deepEqual(selectedGeometryChildFromAnchor("q:q1/b:d1/gpt:1"), { kind: "point", index: 1 });
  assert.deepEqual(selectedGeometryChildFromAnchor("q:q1/b:d1/gseg:0"), { kind: "segment", index: 0 });
  assert.deepEqual(selectedGeometryChildFromAnchor("q:q1/b:d1/garc:2"), { kind: "arc", index: 2 });
  assert.deepEqual(selectedGeometryChildFromAnchor("q:q1/b:d1/gang:3"), { kind: "angle", index: 3 });
  assert.deepEqual(selectedGeometryChildFromAnchor("q:q1/b:d1/gdec:4"), { kind: "decoration", index: 4 });
  assert.equal(selectedGeometryChildFromAnchor("q:q1/b:d1/gpt:-1"), null);
  assert.equal(selectedGeometryChildFromAnchor("q:q1/b:d1"), null);
});

test("geometry inspector selection preserves the parent anchor and readable child title", () => {
  assert.equal(geometry2dParentAnchor("q:q1/b:d1/gpt:0"), "q:q1/b:d1");
  assert.equal(geometry2dParentAnchor("q:q1/b:d1"), "q:q1/b:d1");

  assert.deepEqual(geometry2dInspectorSelection(graphConfig, "q:q1/b:d1/gpt:0"), {
    child: { kind: "point", index: 0 },
    title: "Point 1: Alpha",
  });
  assert.deepEqual(geometry2dInspectorSelection(graphConfig, "q:q1/b:d1/gseg:0"), {
    child: { kind: "segment", index: 0 },
    title: "Segment 1: AB",
  });
  assert.deepEqual(geometry2dInspectorSelection(graphConfig, "q:q1/b:d1/gdec:0"), {
    child: { kind: "decoration", index: 0 },
    title: "Equal length 1",
  });
});
