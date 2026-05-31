import assert from "node:assert/strict";
import test from "node:test";

import { stripGraphLatexDelimiters } from "./graphTypography.ts";

test("stripGraphLatexDelimiters removes common math wrappers", () => {
  assert.equal(stripGraphLatexDelimiters("$x^2 + y^2 = 2$"), "x^2 + y^2 = 2");
  assert.equal(stripGraphLatexDelimiters("$$(x - 1)^2 + y^2 = 2$$"), "(x - 1)^2 + y^2 = 2");
  assert.equal(stripGraphLatexDelimiters("\\(45^\\circ\\)"), "45^\\circ");
  assert.equal(stripGraphLatexDelimiters("\\[A \\cap B\\]"), "A \\cap B");
});

test("stripGraphLatexDelimiters preserves literal trailing escaped dollar", () => {
  assert.equal(stripGraphLatexDelimiters("$5\\$"), "$5\\$");
});
