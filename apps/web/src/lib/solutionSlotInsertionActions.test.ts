import test from "node:test";
import assert from "node:assert/strict";

import { solutionSlotInsertionPlan } from "./solutionSlotInsertionActions.ts";

test("solutionSlotInsertionPlan promotes marked leaf scopes to paired answer and solution space", () => {
  assert.deepEqual(
    solutionSlotInsertionPlan({
      supportsSolutionTools: true,
      marks: 2,
      scope: "question",
    }),
    {
      usesPairedSolutionSpace: true,
      showManualSolutionSlotAction: false,
      spaceActionLabel: "Answer + solution",
      spaceActionTooltip: "Add the default paired student answer space and solution block for this marked question",
      solutionSlotActionLabel: "Solution slot",
      solutionSlotActionTooltip: "Add paired answer space and solution text",
    },
  );
});

test("solutionSlotInsertionPlan keeps normal space and manual solution slot for unmarked solution-capable scopes", () => {
  assert.deepEqual(
    solutionSlotInsertionPlan({
      supportsSolutionTools: true,
      marks: 0,
      scope: "part",
    }),
    {
      usesPairedSolutionSpace: false,
      showManualSolutionSlotAction: true,
      spaceActionLabel: "Space",
      spaceActionTooltip: undefined,
      solutionSlotActionLabel: "Solution slot",
      solutionSlotActionTooltip: "Add paired answer space and solution text",
    },
  );
});

test("solutionSlotInsertionPlan keeps manual solution slots available for nested scopes", () => {
  const plan = solutionSlotInsertionPlan({
    supportsSolutionTools: true,
    marks: 5,
    scope: "question",
    hasNestedItems: true,
  });

  assert.equal(plan.usesPairedSolutionSpace, false);
  assert.equal(plan.showManualSolutionSlotAction, true);
  assert.equal(plan.spaceActionLabel, "Space");
  assert.equal(plan.spaceActionTooltip, undefined);
});

test("solutionSlotInsertionPlan hides all solution-slot actions when solution tools are unavailable", () => {
  const plan = solutionSlotInsertionPlan({
    supportsSolutionTools: false,
    marks: 3,
    scope: "subpart",
  });

  assert.equal(plan.usesPairedSolutionSpace, false);
  assert.equal(plan.showManualSolutionSlotAction, false);
  assert.equal(plan.spaceActionLabel, "Space");
  assert.equal(plan.spaceActionTooltip, undefined);
});
