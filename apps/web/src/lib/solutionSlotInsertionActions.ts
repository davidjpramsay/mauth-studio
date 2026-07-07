import { safeMarkValue } from "./editorDocumentNormalization.ts";

export type SolutionSlotScopeLabel = "question" | "part" | "subpart";

export interface SolutionSlotInsertionPlanOptions {
  supportsSolutionTools: boolean;
  marks: unknown;
  scope: SolutionSlotScopeLabel;
  hasNestedItems?: boolean;
}

export interface SolutionSlotInsertionPlan {
  usesPairedSolutionSpace: boolean;
  showManualSolutionSlotAction: boolean;
  spaceActionLabel: "Answer + solution" | "Space";
  spaceActionTooltip?: string;
  solutionSlotActionLabel: "Solution slot";
  solutionSlotActionTooltip: string;
}

export function solutionSlotInsertionPlan({
  supportsSolutionTools,
  marks,
  scope,
  hasNestedItems = false,
}: SolutionSlotInsertionPlanOptions): SolutionSlotInsertionPlan {
  const usesPairedSolutionSpace = supportsSolutionTools && !hasNestedItems && safeMarkValue(marks) > 0;

  return {
    usesPairedSolutionSpace,
    showManualSolutionSlotAction: supportsSolutionTools && !usesPairedSolutionSpace,
    spaceActionLabel: usesPairedSolutionSpace ? "Answer + solution" : "Space",
    spaceActionTooltip: usesPairedSolutionSpace
      ? `Add the default paired student answer space and solution block for this marked ${scope}`
      : undefined,
    solutionSlotActionLabel: "Solution slot",
    solutionSlotActionTooltip: "Add paired answer space and solution text",
  };
}
