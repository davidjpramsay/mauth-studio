export interface SolutionModeCopyInput {
  supportsSolutionTools: boolean;
  effectiveShowSolutions: boolean;
  isNotesTemplate?: boolean;
}

export interface SolutionModeCopy {
  layerLabel: string;
  layerTitle: string;
}

export function solutionModeCopy({
  supportsSolutionTools,
  effectiveShowSolutions,
  isNotesTemplate = false,
}: SolutionModeCopyInput): SolutionModeCopy {
  if (isNotesTemplate || !supportsSolutionTools) {
    return {
      layerLabel: "Notes",
      layerTitle: "Notes documents do not use a separate solution layer.",
    };
  }

  if (effectiveShowSolutions) {
    return {
      layerLabel: "Solution layer",
      layerTitle: "New text, tables, diagrams, and columns are added to the solution copy.",
    };
  }

  return {
    layerLabel: "Student layer",
    layerTitle: "New content is added to the student copy.",
  };
}
