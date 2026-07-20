import assert from "node:assert/strict";
import test from "node:test";

import { insertionActionLabel, insertionActionTooltip } from "./editorInsertionActions.ts";

test("insertionActionLabel marks inserted modules as solution-only in solution mode", () => {
  assert.equal(insertionActionLabel("Text", false), "Text");
  assert.equal(insertionActionLabel("Choice list", true), "Solution choice list");
  assert.equal(insertionActionLabel("Diagram", true), "Solution diagram");
});

test("insertionActionTooltip explains solution-only insertions", () => {
  assert.equal(
    insertionActionTooltip({
      actionVerb: "Add",
      label: "choice list",
      fallback: "Add answer choices such as i, ii, iii",
      solutionMode: false,
    }),
    "Add answer choices such as i, ii, iii",
  );
  assert.equal(
    insertionActionTooltip({
      actionVerb: "Add",
      label: "choice list",
      fallback: "Add answer choices such as i, ii, iii",
      solutionMode: true,
    }),
    "Add a solution-only choice list here",
  );
});
