import type { ContentBlock, ContentBlockVisibility } from "@mauth-studio/shared";

import { choiceBlockHasSolutionAnswer } from "./choiceSolutionAnswers.ts";
import { canCreateSolutionSurfaceCopy } from "./editorDocumentDuplication.ts";
import { diagramBlockHasSharedSolutionAnswer } from "./solutionDiagramCompleteness.ts";
import { tableBlockHasSharedSolutionEntries } from "./tableSolutionEntries.ts";
import {
  contentBlockDisplayVisibility,
  contentBlockSolutionTickHelp,
  contentBlockSolutionTickLabel,
  contentBlockSupportsSolutionSurfaceTicks,
} from "./moduleSettingsPatches.ts";

export const SOLUTION_SURFACE_COPY_ENABLED_TITLE = "Create or open the editable solutions-only copy for this block.";
export const SOLUTION_SURFACE_COPY_DISABLED_TITLE =
  "Select a student text, table, diagram, or columns block to copy into the solutions layer.";
export const SOLUTION_TABLE_EDIT_ENABLED_TITLE =
  "Open this table in Solutions mode and enter answers directly into its blank student cells.";

export interface SolutionSurfaceControlState {
  visibility: ContentBlockVisibility;
  markTicks: number;
  supportsSurfaceTicks: boolean;
  showSurfaceTicks: boolean;
  tickLabel: string;
  tickHelp: string;
  canCreateSolutionCopy: boolean;
  copyTitle: string;
}

export function solutionSurfaceControlState(block: ContentBlock, showSolutions = false): SolutionSurfaceControlState {
  const visibility = contentBlockDisplayVisibility(block);
  const canCreateSolutionCopy = visibility !== "solution" && canCreateSolutionSurfaceCopy(block);
  const markTicks = typeof block.markTicks === "number" && Number.isInteger(block.markTicks) ? block.markTicks : 0;
  const supportsSurfaceTicks = contentBlockSupportsSolutionSurfaceTicks(block);
  const sharedDiagramAnswer = visibility === "always" && diagramBlockHasSharedSolutionAnswer(block);
  const sharedChoiceAnswer = visibility === "always" && choiceBlockHasSolutionAnswer(block);
  const sharedTableAnswer = visibility === "always" && tableBlockHasSharedSolutionEntries(block);

  return {
    visibility,
    markTicks,
    supportsSurfaceTicks,
    showSurfaceTicks:
      showSolutions &&
      supportsSurfaceTicks &&
      (visibility === "solution" || sharedDiagramAnswer || sharedChoiceAnswer || sharedTableAnswer),
    tickLabel: contentBlockSolutionTickLabel(block),
    tickHelp: contentBlockSolutionTickHelp(block),
    canCreateSolutionCopy,
    copyTitle: canCreateSolutionCopy
      ? block.kind === "table" && visibility === "always"
        ? SOLUTION_TABLE_EDIT_ENABLED_TITLE
        : SOLUTION_SURFACE_COPY_ENABLED_TITLE
      : SOLUTION_SURFACE_COPY_DISABLED_TITLE,
  };
}
