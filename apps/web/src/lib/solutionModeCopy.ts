export interface SolutionModeCopyInput {
  supportsSolutionTools: boolean;
  effectiveShowSolutions: boolean;
  isNotesTemplate?: boolean;
  isInvestigationTemplate?: boolean;
}

export interface SolutionModeCopy {
  layerLabel: string;
  layerTitle: string;
}

export function solutionModeCopy({
  supportsSolutionTools,
  effectiveShowSolutions,
  isNotesTemplate = false,
  isInvestigationTemplate = false,
}: SolutionModeCopyInput): SolutionModeCopy {
  if (isNotesTemplate || !supportsSolutionTools) {
    return {
      layerLabel: "Notes",
      layerTitle: "Notes documents do not use a separate solution layer.",
    };
  }

  if (isInvestigationTemplate) {
    return effectiveShowSolutions
      ? {
          layerLabel: "Teacher rubric",
          layerTitle: "Teacher mode adds the detailed rubric after the shared student investigation brief.",
        }
      : {
          layerLabel: "Student brief",
          layerTitle: "Student mode shows the investigation task and general marking guidance.",
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
