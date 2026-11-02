import assert from "node:assert/strict";
import test from "node:test";

import { lineSegmentFeatureEndpoints } from "../../lib/graphFeatureGeometry.ts";
import { graphFramePaddingForPixels } from "./graphFramePadding.ts";

test("graph frames keep the same 24-pixel clearance across coordinate scales", () => {
  for (const span of [0.2, 6, 110, 10000]) {
    for (const size of [220, 520, 680]) {
      const padding = graphFramePaddingForPixels(span, size);
      const actualPixels = (padding / (span + 2 * padding)) * size;
      assert.ok(Math.abs(actualPixels - 24) < 1e-8);
    }
  }
});

test("graph frame padding preserves the larger existing axis-label reserve", () => {
  const padding = graphFramePaddingForPixels(110, 220, 30);
  assert.ok(Math.abs((padding / (110 + 2 * padding)) * 220 - 30) < 1e-8);
});

test("small and unmeasured graph frames cannot produce an invalid content box", () => {
  assert.equal(graphFramePaddingForPixels(10, 0), 0);
  assert.equal(graphFramePaddingForPixels(10, Number.NaN), 0);
  const padding = graphFramePaddingForPixels(10, 20);
  assert.ok(Number.isFinite(padding) && padding > 0);
  assert.ok((padding / (10 + 2 * padding)) * 20 < 10);
});

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
