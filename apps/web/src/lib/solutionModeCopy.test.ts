import test from "node:test";
import assert from "node:assert/strict";

import { solutionModeCopy } from "./solutionModeCopy.ts";

test("solutionModeCopy labels student edits", () => {
  assert.deepEqual(solutionModeCopy({ supportsSolutionTools: true, effectiveShowSolutions: false }), {
    layerLabel: "Student layer",
    layerTitle: "New content is added to the student copy.",
  });
});

test("solutionModeCopy labels solution-layer edits", () => {
  assert.deepEqual(solutionModeCopy({ supportsSolutionTools: true, effectiveShowSolutions: true }), {
    layerLabel: "Solution layer",
    layerTitle: "New text, tables, diagrams, and columns are added to the solution copy.",
  });
});

test("solutionModeCopy labels notes documents without solution tools", () => {
  assert.deepEqual(solutionModeCopy({ supportsSolutionTools: false, effectiveShowSolutions: false, isNotesTemplate: true }), {
    layerLabel: "Notes",
    layerTitle: "Notes documents do not use a separate solution layer.",
  });
});

test("solutionModeCopy labels investigation student and teacher layers", () => {
  assert.deepEqual(
    solutionModeCopy({
      supportsSolutionTools: true,
      effectiveShowSolutions: false,
      isInvestigationTemplate: true,
    }),
    {
      layerLabel: "Student brief",
      layerTitle: "Student mode shows the investigation task and general marking guidance.",
    },
  );
  assert.deepEqual(
    solutionModeCopy({
      supportsSolutionTools: true,
      effectiveShowSolutions: true,
      isInvestigationTemplate: true,
    }),
    {
      layerLabel: "Teacher rubric",
      layerTitle: "Teacher mode adds the detailed rubric after the shared student investigation brief.",
    },
  );
});
