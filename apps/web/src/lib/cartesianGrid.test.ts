import assert from "node:assert/strict";
import test from "node:test";
import { cartesianGridLines, type CartesianGridOptions } from "./cartesianGrid.ts";

const example: CartesianGridOptions = {
  xMin: -1,
  xMax: 7,
  yMin: -1,
  yMax: 11,
  xMajorStep: 1,
  yMajorStep: 2,
  xMinorStep: 0.5,
  yMinorStep: 1,
  showGrid: true,
  showMajorGrid: true,
  showMinorGrid: false,
};

function assertClosed(config: CartesianGridOptions) {
  const original = structuredClone(config);
  const lines = cartesianGridLines(config);
  const { xMin, xMax, yMin, yMax } = config;
  assert.deepEqual(config, original, "rendering cannot mutate authored bounds");
  assert.equal(lines.filter((line) => line.boundary).length, 4);
  assert.equal(new Set(lines.map(({ from, to }) => JSON.stringify([from, to]))).size, lines.length, "no double strokes");
  for (const { from, to } of lines) {
    for (const [x, y] of [from, to]) {
      assert.ok(x >= xMin && x <= xMax && y >= yMin && y <= yMax, "no overshoot");
      assert.ok(x === xMin || x === xMax || y === yMin || y === yMax, "no dangling line ends");
    }
    assert.ok(from[0] === to[0] || from[1] === to[1]);
  }
  return lines;
}

test("the photographed two-unit grid closes its half-height top and bottom cells", () => {
  const lines = assertClosed(example);
  assert.equal(lines.length, 17);
  assert.deepEqual(
    lines.filter(({ boundary, from, to }) => boundary && from[1] === to[1]).map(({ from }) => from[1]),
    [-1, 11],
  );
  assert.deepEqual(
    lines.filter(({ boundary, from, to }) => !boundary && from[1] === to[1]).map(({ from }) => from[1]),
    [0, 2, 4, 6, 8, 10],
  );
});

test("aligned, fractional, negative and decimal-step views retain exact bounds without doubled edges", () => {
  for (const bounds of [
    { xMin: -2, xMax: 4, yMin: -2, yMax: 4 },
    { xMin: -2.3, xMax: 4.7, yMin: -3.2, yMax: 5.1 },
    { xMin: -8.8, xMax: -2.4, yMin: -7.3, yMax: -0.7 },
    { xMin: -0.3, xMax: 0.6, yMin: -0.6, yMax: 0.3, xMajorStep: 0.1, yMajorStep: 0.1 },
  ])
    assertClosed({ ...example, ...bounds, showMinorGrid: true });
});

test("minor-only grids retain their regular lines and use a minor-weight perimeter", () => {
  const lines = assertClosed({ ...example, showMajorGrid: false, showMinorGrid: true });
  assert.ok(lines.every(({ major }) => !major));
  assert.ok(lines.some(({ from, to, boundary }) => !boundary && from[0] === 0 && to[0] === 0));
});

test("hidden grids and disabled layers never leave an empty border", () => {
  assert.deepEqual(cartesianGridLines({ ...example, showGrid: false }), []);
  assert.deepEqual(cartesianGridLines({ ...example, showMajorGrid: false, showMinorGrid: false }), []);
});

test("small scales and large coordinate offsets keep their interior grid intervals", () => {
  for (const patch of [
    { xMin: -1e-12, xMax: 1e-12, xMajorStep: 1e-13 },
    { xMin: 1e12, xMax: 1e12 + 20, xMajorStep: 1 },
  ]) {
    const lines = assertClosed({ ...example, ...patch });
    assert.equal(lines.filter(({ from, to, boundary }) => !boundary && from[0] === to[0]).length, 19);
  }
});

test("invalid bounds produce no grid and excessively dense steps stay bounded", () => {
  for (const patch of [{ xMin: NaN }, { xMax: Infinity }, { yMin: 12 }, { xMin: 7 }]) {
    assert.deepEqual(cartesianGridLines({ ...example, ...patch }), []);
  }
  assertClosed({ ...example, xMajorStep: 1e-20, yMajorStep: 1e-20 });
});
