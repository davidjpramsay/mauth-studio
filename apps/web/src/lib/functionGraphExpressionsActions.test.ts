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
test("point snapping preserves the preferred branch without importing a browser renderer", () => {
  const config = { type: "graph2d", xMin: -6, xMax: 6, yMin: -6, yMax: 6 };
  const atX = snapImplicitRelationPointAtX("x^2+y^2=25", 3, -4, config);
  const atY = snapImplicitRelationPointAtY("x^2+y^2=25", 4, 3, config);
  assert.ok(atX && Math.abs(atX[1] + 4) < 1e-5);
  assert.ok(atY && Math.abs(atY[0] - 3) < 1e-5);
  assert.equal(snapImplicitRelationPointAtX("x^2+y^2=25", 8, 0, config), null);
});
