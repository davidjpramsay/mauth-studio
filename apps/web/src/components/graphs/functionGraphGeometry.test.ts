import assert from "node:assert/strict";
import test from "node:test";

import { lineSegmentFeatureEndpoints } from "../../lib/graphFeatureGeometry.ts";

test("lineSegmentFeatureEndpoints spans vertical line segments to the grid range", () => {
  assert.deepEqual(
    lineSegmentFeatureEndpoints(
      { kind: "line_segment", x1: -1, y1: -7, x2: -1, y2: 5, span: "grid" },
      { type: "graph2d", xMin: -6, xMax: 10, yMin: -10, yMax: 5 },
    ),
    [
      [-1, -10],
      [-1, 5],
    ],
  );
});

test("lineSegmentFeatureEndpoints clips diagonal grid-spanning lines to the graph bounds", () => {
  assert.deepEqual(
    lineSegmentFeatureEndpoints(
      { kind: "line_segment", x1: 0, y1: 0, x2: 1, y2: 1, span: "grid" },
      { type: "graph2d", xMin: -2, xMax: 3, yMin: -1, yMax: 2 },
    ),
    [
      [-1, -1],
      [2, 2],
    ],
  );
});

test("lineSegmentFeatureEndpoints preserves manual endpoints by default", () => {
  assert.deepEqual(
    lineSegmentFeatureEndpoints(
      { kind: "line_segment", x1: -1, y1: -7, x2: -1, y2: 5 },
      { type: "graph2d", xMin: -6, xMax: 10, yMin: -10, yMax: 5 },
    ),
    [
      [-1, -7],
      [-1, 5],
    ],
  );
});
