import assert from "node:assert/strict";
import test from "node:test";

import { insertSolutionMarkAnnotation, normalizedSolutionMarkCount, solutionMarkAnnotationText } from "./solutionTextMarks.ts";

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
