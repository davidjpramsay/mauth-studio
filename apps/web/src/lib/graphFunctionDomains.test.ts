import assert from "node:assert/strict";
import test from "node:test";

import {
  clampDomainToNaturalBoundaries,
  graphFunctionNaturalBoundaryRenderGap,
  graphFunctionNaturalBoundaries,
  separateRangeFromStrictNaturalBoundaries,
} from "./graphFunctionDomains.ts";

test("graphFunctionNaturalBoundaries detects log10 with a linear argument", () => {
  assert.deepEqual(graphFunctionNaturalBoundaries("log10(x + 1)"), [
    {
      kind: "log",
      boundary: -1,
      side: "left",
      strict: true,
      source: "log10(x + 1)",
    },
  ]);
});

test("clampDomainToNaturalBoundaries clamps a left-side logarithm domain", () => {
  const domain = clampDomainToNaturalBoundaries("log(x + 1)", { xStart: -6, xEnd: 10 }, { type: "graph2d", xMin: -6, xMax: 10 });
  assert.equal(domain.xStart > -1, true);
  assert.equal(domain.xEnd, 10);
});

test("clampDomainToNaturalBoundaries clamps a right-side logarithm domain", () => {
  const domain = clampDomainToNaturalBoundaries("log(1 - x)", { xStart: -6, xEnd: 10 }, { type: "graph2d", xMin: -6, xMax: 10 });
  assert.equal(domain.xStart, -6);
  assert.equal(domain.xEnd < 1, true);
});

test("clampDomainToNaturalBoundaries permits square root boundary endpoints", () => {
  const domain = clampDomainToNaturalBoundaries("sqrt(x + 1)", { xStart: -6, xEnd: 10 }, { type: "graph2d", xMin: -6, xMax: 10 });
  assert.equal(domain.xStart, -1);
  assert.equal(domain.xEnd, 10);
});

test("separateRangeFromStrictNaturalBoundaries adds a visual gap at a left-side asymptote", () => {
  const graphConfig = { type: "graph2d", xMin: -1, xMax: 5, widthPx: 600 } as const;
  const gap = graphFunctionNaturalBoundaryRenderGap(graphConfig);
  const range = separateRangeFromStrictNaturalBoundaries("log(x + 1)", { xStart: -0.999999, xEnd: 5 }, graphConfig);
  assert.equal(range.xStart, -1 + gap);
  assert.equal(range.xEnd, 5);
});

test("separateRangeFromStrictNaturalBoundaries adds a visual gap at a right-side asymptote", () => {
  const graphConfig = { type: "graph2d", xMin: -5, xMax: 1, widthPx: 600 } as const;
  const gap = graphFunctionNaturalBoundaryRenderGap(graphConfig);
  const range = separateRangeFromStrictNaturalBoundaries("ln(1 - x)", { xStart: -5, xEnd: 0.999999 }, graphConfig);
  assert.equal(range.xStart, -5);
  assert.equal(range.xEnd, 1 - gap);
});

test("separateRangeFromStrictNaturalBoundaries keeps square root endpoints at the natural boundary", () => {
  const range = separateRangeFromStrictNaturalBoundaries(
    "sqrt(x + 1)",
    { xStart: -1, xEnd: 5 },
    { type: "graph2d", xMin: -1, xMax: 5, widthPx: 600 },
  );
  assert.equal(range.xStart, -1);
  assert.equal(range.xEnd, 5);
});
