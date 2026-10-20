import assert from "node:assert/strict";
import test from "node:test";

import {
  alignedSolutionMarks,
  insertSolutionMarkAnnotation,
  normalizedSolutionMarkCount,
  solutionMarkAnnotationText,
} from "./solutionTextMarks.ts";

test("aligned marks preserve one equation table and assign marks only to their earning rows", () => {
  const result = alignedSolutionMarks(
    String.raw`\begin{aligned}f(x)&=6x^{-2}\\[3pt]f'(x)&=-12x^{-3} [[marks:1]]\\[3pt]&=-\dfrac{12}{x^3} [[marks:1]]\end{aligned}`,
  );
  assert.deepEqual(result.rowMarks, [0, 1, 1]);
  assert.equal(result.latex, String.raw`\begin{aligned}f(x)&=6x^{-2}\\[3pt]f'(x)&=-12x^{-3}\\[3pt]&=-\dfrac{12}{x^3}\end{aligned}`);
});

test("aligned marks ignore row separators in nested cases and grouped expressions", () => {
  const result = alignedSolutionMarks(
    String.raw`\begin{aligned}[t]f(x)&=\begin{cases}1&x<0\\0&x\ge0\end{cases} [[marks:2]]\\[2pt]g(x)&=\underbrace{\substack{a\\b}}_{c} [[marks:1]]\end{aligned}`,
  );
  assert.deepEqual(result.rowMarks, [2, 1]);
  assert.ok(result.latex.includes(String.raw`1&x<0\\0&x\ge0`));
  assert.ok(result.latex.includes(String.raw`\substack{a\\b}`));
  assert.ok(!result.latex.includes("[[marks:"));
});

test("aligned marks support multiline display source, zero marks and a trailing separator", () => {
  const result = alignedSolutionMarks("\\begin{align*}\na&=1 [[marks:0]]\\\\\nb&=2 [[marks:3]]\\\\\n\\end{align*}");
  assert.deepEqual(result.rowMarks, [0, 3]);
  assert.ok(!result.latex.includes("[[marks:"));
});

test("math metadata never leaks through unsupported or malformed TeX", () => {
  for (const source of [
    "x=1 [[marks:1]]",
    String.raw`\begin{aligned} x&=1 [[marks:1]]`,
    String.raw`\begin{aligned} x&={1 [[marks:1]]\end{aligned}`,
  ]) {
    const result = alignedSolutionMarks(source);
    assert.deepEqual(result.rowMarks, []);
    assert.ok(!result.latex.includes("[[marks:"));
  }
});

test("normalizedSolutionMarkCount keeps hidden mark annotations within the supported range", () => {
  assert.equal(normalizedSolutionMarkCount(undefined), 1);
  assert.equal(normalizedSolutionMarkCount(0), 1);
  assert.equal(normalizedSolutionMarkCount(2.6), 3);
  assert.equal(normalizedSolutionMarkCount(99), 20);
});

test("solutionMarkAnnotationText formats hidden mark annotations", () => {
  assert.equal(solutionMarkAnnotationText(2), "[[marks:2]]");
});

test("insertSolutionMarkAnnotation inserts at the cursor with a readable leading space", () => {
  const result = insertSolutionMarkAnnotation("x=3", 3, 3, 1);

  assert.deepEqual(result, {
    text: "x=3 [[marks:1]]",
    selectionStart: 15,
    selectionEnd: 15,
  });
});

test("insertSolutionMarkAnnotation replaces the selected range", () => {
  const result = insertSolutionMarkAnnotation("Answer old text", 7, 15, 2);

  assert.deepEqual(result, {
    text: "Answer [[marks:2]]",
    selectionStart: 18,
    selectionEnd: 18,
  });
});

test("insertSolutionMarkAnnotation preserves spacing before following text", () => {
  const result = insertSolutionMarkAnnotation("Firstsecond", 5, 5, 1);

  assert.deepEqual(result, {
    text: "First [[marks:1]] second",
    selectionStart: 18,
    selectionEnd: 18,
  });
});
