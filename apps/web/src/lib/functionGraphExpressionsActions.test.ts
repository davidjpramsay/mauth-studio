import assert from "node:assert/strict";
import test from "node:test";
import {
  createEvaluator,
  createImplicitEvaluator,
  createSlopeFieldEvaluator,
  snapImplicitRelationPointAtX,
  snapImplicitRelationPointAtY,
} from "./functionGraphExpressions.ts";

test("graph evaluator preserves powers, implicit multiplication and natural domains", () => {
  assert.equal(createEvaluator("-x^2 + 2x")(3), -3);
  assert.equal(createEvaluator("sin(pi*x)")(0.5), 1);
  assert.ok(Number.isNaN(createEvaluator("sqrt(x)")(-1)));
});
test("implicit relations and slope fields share the expression conversion", () => {
  assert.equal(createImplicitEvaluator("x^2+y^2=25")(3, 4), 0);
  assert.equal(createSlopeFieldEvaluator("dy/dx=x+y")(2, 3), 5);
});
test("all graph evaluators reject executable expressions without side effects", () => {
  const payloads = [
    "globalThis.graphAttack=1",
    "x.constructor.constructor('return 1')()",
    "x;globalThis.graphAttack=1",
    "x[0]",
    "x,2",
    "sin.constructor(1)",
  ];
  for (const payload of payloads) {
    assert.throws(() => createEvaluator(payload));
    assert.throws(() => createImplicitEvaluator(payload));
    assert.throws(() => createSlopeFieldEvaluator(`dy/dx=${payload}`));
  }
  assert.equal((globalThis as Record<string, unknown>).graphAttack, undefined);
});
test("graph arithmetic preserves mathematical precedence and functions", () => {
  assert.equal(createEvaluator("2^3^2")(0), 512);
  assert.equal(createEvaluator("2**-2")(0), 0.25);
  assert.equal(createEvaluator("1e-3 + 2(x+1)")(2), 6.001);
  assert.equal(createEvaluator("log(e)")(0), 1);
  assert.equal(createEvaluator("LN(e)+LOG10(100)")(0), 3);
  assert.equal(createEvaluator("Math.floor(x)+Math.sinh(0)")(2.5), 2);
  assert.equal(createImplicitEvaluator("xy=6")(2, 3), 0);
  assert.throws(() => createEvaluator("x trailing"));
});
test("point snapping preserves the preferred branch without importing a browser renderer", () => {
  const config = { type: "graph2d", xMin: -6, xMax: 6, yMin: -6, yMax: 6 };
  const atX = snapImplicitRelationPointAtX("x^2+y^2=25", 3, -4, config);
  const atY = snapImplicitRelationPointAtY("x^2+y^2=25", 4, 3, config);
  assert.ok(atX && Math.abs(atX[1] + 4) < 1e-5);
  assert.ok(atY && Math.abs(atY[0] - 3) < 1e-5);
  assert.equal(snapImplicitRelationPointAtX("x^2+y^2=25", 8, 0, config), null);
});
