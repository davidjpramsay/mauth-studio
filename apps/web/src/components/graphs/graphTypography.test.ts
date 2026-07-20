import assert from "node:assert/strict";
import test from "node:test";

import { graphLabelSourceLatex, stripGraphLatexDelimiters } from "./graphTypography.ts";

test("stripGraphLatexDelimiters removes common math wrappers", () => {
  assert.equal(stripGraphLatexDelimiters("$x^2 + y^2 = 2$"), "x^2 + y^2 = 2");
  assert.equal(stripGraphLatexDelimiters("$$(x - 1)^2 + y^2 = 2$$"), "(x - 1)^2 + y^2 = 2");
  assert.equal(stripGraphLatexDelimiters("\\(45^\\circ\\)"), "45^\\circ");
  assert.equal(stripGraphLatexDelimiters("\\[A \\cap B\\]"), "A \\cap B");
});

test("stripGraphLatexDelimiters preserves literal trailing escaped dollar", () => {
  assert.equal(stripGraphLatexDelimiters("$5\\$"), "$5\\$");
});

test("graphLabelSourceLatex preserves full latex labels", () => {
  assert.equal(graphLabelSourceLatex("$x=1$"), "x=1");
  assert.equal(graphLabelSourceLatex("90^\\circ"), "90^\\circ");
  assert.equal(graphLabelSourceLatex("A"), "A");
});

test("graphLabelSourceLatex renders mixed text and inline latex labels", () => {
  assert.equal(graphLabelSourceLatex("axis: $x=1$"), "\\text{axis: }x=1");
  assert.equal(graphLabelSourceLatex("horizontal asymptote: $y=1$"), "\\text{horizontal asymptote: }y=1");
});

test("graphLabelSourceLatex treats prose and unmatched currency dollars as text", () => {
  assert.equal(graphLabelSourceLatex("opens up"), "\\text{opens up}");
  assert.equal(graphLabelSourceLatex("simple: +$100/yr"), "\\text{simple: +\\$100/yr}");
});
