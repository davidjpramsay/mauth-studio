import assert from "node:assert/strict";
import test from "node:test";

import { parseNumericExpression, steppedNumericValue } from "./numericExpression.ts";

test("parses exact constants, roots, fractions, powers, and simple calculations", () => {
  assert.equal(parseNumericExpression("pi"), Math.PI);
  assert.equal(parseNumericExpression("π + 3"), Math.PI + 3);
  assert.equal(parseNumericExpression("sqrt(2)"), Math.sqrt(2));
  assert.equal(parseNumericExpression("√2"), Math.sqrt(2));
  assert.equal(parseNumericExpression("\\sqrt{2}"), Math.sqrt(2));
  assert.equal(parseNumericExpression("2pi"), 2 * Math.PI);
  assert.equal(parseNumericExpression("1/3"), 1 / 3);
  assert.equal(parseNumericExpression("-2^2"), -4);
  assert.equal(parseNumericExpression("2^-3"), 1 / 8);
});

test("rejects incomplete, unsafe, non-finite, and unknown expressions", () => {
  assert.equal(parseNumericExpression(""), undefined);
  assert.equal(parseNumericExpression("pi +"), undefined);
  assert.equal(parseNumericExpression("x + 2"), undefined);
  assert.equal(parseNumericExpression("Math.PI"), undefined);
  assert.equal(parseNumericExpression("1 / 0"), undefined);
  assert.equal(parseNumericExpression("sqrt(-1)"), undefined);
});

test("step controls move to the next aligned value and respect bounds", () => {
  assert.equal(steppedNumericValue(4.1, 1, 1), 5);
  assert.equal(steppedNumericValue(4.1, -1, 1), 4);
  assert.equal(steppedNumericValue(340, 1, 10), 350);
  assert.equal(steppedNumericValue(345, -1, 10), 340);
  assert.equal(steppedNumericValue(0.1, -1, 1, 0.1), 0.1);
});
