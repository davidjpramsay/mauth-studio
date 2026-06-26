import assert from "node:assert/strict";
import test from "node:test";

import { sampledFunctionCurveSegments } from "./functionCurveSampling.ts";

test("sampledFunctionCurveSegments keeps dense points near a logarithm asymptote", () => {
  const [segment] = sampledFunctionCurveSegments((x) => Math.log10(x), 1e-5, 5);
  assert.ok(segment);
  assert.equal(segment.xs[0], 1e-5);
  assert.equal(segment.ys[0], -5);
  assert.ok(segment.xs.filter((x) => x < 0.001).length >= 8);
});

test("sampledFunctionCurveSegments splits at invalid function values", () => {
  const segments = sampledFunctionCurveSegments((x) => (x === 0 ? Number.NaN : 1 / x), -1, 1, {
    uniformSamples: 4,
    endpointSamples: 2,
  });
  assert.ok(segments.length >= 2);
  assert.ok(segments.every((segment) => segment.xs.length === segment.ys.length));
});

test("sampledFunctionCurveSegments clips logarithm tails to the visible y range", () => {
  const [segment] = sampledFunctionCurveSegments((x) => Math.log10(x), 1e-8, 10, {
    yMin: -3,
    yMax: 3,
  });
  assert.ok(segment);
  assert.equal(segment.ys[0], -3);
  assert.ok(segment.xs[0] > 0.0009 && segment.xs[0] < 0.0011);
  assert.ok(segment.ys.every((y) => y >= -3 && y <= 3));
});
