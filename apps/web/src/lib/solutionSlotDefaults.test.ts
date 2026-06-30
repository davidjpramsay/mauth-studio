import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SOLUTION_SLOT_LINES,
  DEFAULT_SOLUTION_SLOT_TEXT,
  DEFAULT_SOLUTION_SPACE_SHOW_LINES,
  MAX_SOLUTION_SLOT_LINES,
  MIN_SOLUTION_SLOT_LINES,
  defaultSolutionSlotLines,
  defaultSolutionSlotLinesForDocument,
} from "./solutionSlotDefaults.ts";

test("solution slot constants preserve manual solution defaults", () => {
  assert.equal(DEFAULT_SOLUTION_SLOT_LINES, 8);
  assert.equal(MIN_SOLUTION_SLOT_LINES, 4);
  assert.equal(MAX_SOLUTION_SLOT_LINES, 18);
  assert.equal(DEFAULT_SOLUTION_SLOT_TEXT, "\n");
  assert.equal(DEFAULT_SOLUTION_SPACE_SHOW_LINES, false);
});

test("defaultSolutionSlotLines sizes space from marks with clamps", () => {
  assert.equal(defaultSolutionSlotLines(0), DEFAULT_SOLUTION_SLOT_LINES);
  assert.equal(defaultSolutionSlotLines("not a number"), DEFAULT_SOLUTION_SLOT_LINES);
  assert.equal(defaultSolutionSlotLines(0.25), MIN_SOLUTION_SLOT_LINES);
  assert.equal(defaultSolutionSlotLines(1), 5);
  assert.equal(defaultSolutionSlotLines(3), 11);
  assert.equal(defaultSolutionSlotLines(20), MAX_SOLUTION_SLOT_LINES);
});

test("defaultSolutionSlotLinesForDocument gives exams more working room", () => {
  assert.equal(defaultSolutionSlotLinesForDocument({ titlePageTemplate: "worksheet" }, 1), 5);
  assert.equal(defaultSolutionSlotLinesForDocument({ titlePageTemplate: "exam" }, 1), 7);
  assert.equal(defaultSolutionSlotLinesForDocument({ titlePageTemplate: "exam" }, 0), 10);
  assert.equal(defaultSolutionSlotLinesForDocument({ titlePageTemplate: "exam" }, 20), MAX_SOLUTION_SLOT_LINES);
});
