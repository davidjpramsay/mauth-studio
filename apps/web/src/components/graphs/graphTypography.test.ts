import assert from "node:assert/strict";
import test from "node:test";

import { graphLabelSegments, graphLabelSourceLatex, stripGraphLatexDelimiters } from "./graphTypography.ts";

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

test("prose and legacy text-only labels use document text rather than mathematical glyphs", () => {
  for (const [source, text] of [
    ["Other", "Other"],
    ["Students (%)", "Students (%)"],
    ["Fruit 60%", "Fruit 60%"],
    ["\\text{Fruit 60\\%}", "Fruit 60%"],
    ["\\text{Price \\$5 \\& tax}", "Price $5 & tax"],
  ])
    assert.deepEqual(graphLabelSegments(source), [{ kind: "text", source: text }]);
});

test("mixed labels keep prose separate from complete mathematical expressions", () => {
  assert.deepEqual(graphLabelSegments("Time: $\\frac{x}{2}$"), [
    { kind: "text", source: "Time: " },
    { kind: "math", source: "\\frac{x}{2}" },
  ]);
  for (const source of [
    "x",
    "90^\\circ",
    "\\frac{1}{\\text{days}}",
    "x_{\\text{max}}",
    "\\text{\\textbf{Bold}}",
    "\\begin{pmatrix}\\text{speed}\\\\2\\end{pmatrix}",
  ])
    assert.deepEqual(graphLabelSegments(source), [{ kind: "math", source }]);
  assert.deepEqual(graphLabelSegments("$x=1$"), [{ kind: "math", source: "x=1" }]);
  assert.deepEqual(graphLabelSegments("12", true), [{ kind: "math", source: "12" }]);
  assert.deepEqual(graphLabelSegments("$12$", true, true), [{ kind: "math", source: "12" }]);
  assert.deepEqual(graphLabelSegments("12", false, true), [{ kind: "math", source: "12" }]);
  assert.deepEqual(graphLabelSegments("AB", false, true), [{ kind: "math", source: "AB" }]);
});

test("two inline maths runs retain the document-font prose between them", () => {
  assert.deepEqual(graphLabelSegments("$x$ to $y$"), [
    { kind: "math", source: "x" },
    { kind: "text", source: " to " },
    { kind: "math", source: "y" },
  ]);
});
