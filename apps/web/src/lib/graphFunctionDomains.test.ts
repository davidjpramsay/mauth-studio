import assert from "node:assert/strict";
import test from "node:test";

import {
  clampDomainToNaturalBoundaries,
  graphFunctionNaturalBoundaryRenderGap,
  graphFunctionNaturalBoundaries,
  graphFunctionNaturalDomainEpsilon,
  separateRangeFromStrictNaturalBoundaries,
  snapManualDomainToNaturalAsymptotes,
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
  const range = separateRangeFromStrictNaturalBoundaries("log(x + 1)", { xStart: -1, xEnd: 5 }, graphConfig);
  assert.equal(gap, graphFunctionNaturalDomainEpsilon(graphConfig));
  assert.equal(range.xStart, -1 + gap);
  assert.equal(range.xEnd, 5);
});

test("separateRangeFromStrictNaturalBoundaries adds a visual gap at a right-side asymptote", () => {
  const graphConfig = { type: "graph2d", xMin: -5, xMax: 1, widthPx: 600 } as const;
  const gap = graphFunctionNaturalBoundaryRenderGap(graphConfig);
  const range = separateRangeFromStrictNaturalBoundaries("ln(1 - x)", { xStart: -5, xEnd: 1 }, graphConfig);
  assert.equal(gap, graphFunctionNaturalDomainEpsilon(graphConfig));
  assert.equal(range.xStart, -5);
  assert.equal(range.xEnd, 1 - gap);
});

test("strict logarithm render gaps stay close enough to show the visible asymptote tail", () => {
  const graphConfig = { type: "graph2d", xMin: -3, xMax: 10, widthPx: 330 } as const;
  const gap = graphFunctionNaturalBoundaryRenderGap(graphConfig);
  assert.ok(gap < 0.001);
  assert.ok(Math.log10(gap) < -5);
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

test("snapManualDomainToNaturalAsymptotes repairs rounded log guard domains when an asymptote feature is present", () => {
  const graphConfig = {
    type: "graph2d",
    xMin: -6,
    xMax: 10,
    features: [{ kind: "line_segment", x1: -1, x2: -1, y1: -10, y2: 5, strokeStyle: "dashed" }],
  } as const;
  const snapped = snapManualDomainToNaturalAsymptotes("log(x + 1)", { xStart: -0.96, xEnd: 10 }, graphConfig);
  assert.equal(snapped.xStart, -1 + graphFunctionNaturalDomainEpsilon(graphConfig));
  assert.equal(snapped.xEnd, 10);
});

test("snapManualDomainToNaturalAsymptotes preserves intentional manual log restrictions", () => {
  const graphConfig = {
    type: "graph2d",
    xMin: -6,
    xMax: 10,
    features: [{ kind: "line_segment", x1: -1, x2: -1, y1: -10, y2: 5, strokeStyle: "dashed" }],
  } as const;
  const snapped = snapManualDomainToNaturalAsymptotes("log(x + 1)", { xStart: -0.5, xEnd: 10 }, graphConfig);
  assert.deepEqual(snapped, { xStart: -0.5, xEnd: 10 });
});
