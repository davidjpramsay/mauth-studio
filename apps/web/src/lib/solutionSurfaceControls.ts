import type { ContentBlock, ContentBlockVisibility } from "@mauth-studio/shared";

import { canCreateSolutionSurfaceCopy } from "./editorDocumentDuplication.ts";
import {
  contentBlockDisplayVisibility,
  contentBlockSolutionTickHelp,
  contentBlockSolutionTickLabel,
  contentBlockSupportsSolutionSurfaceTicks,
} from "./moduleSettingsPatches.ts";

export const SOLUTION_SURFACE_COPY_ENABLED_TITLE = "Create an editable solutions-only copy after this block.";
export const SOLUTION_SURFACE_COPY_DISABLED_TITLE =
  "Select a student text, choice list, table, diagram, or columns block to copy into the solutions layer.";

export interface SolutionSurfaceControlState {
  visibility: ContentBlockVisibility;
  markTicks: number;
  supportsSurfaceTicks: boolean;
  tickLabel: string;
  tickHelp: string;
  canCreateSolutionCopy: boolean;
  copyTitle: string;
}

export function solutionSurfaceControlState(block: ContentBlock): SolutionSurfaceControlState {
  const visibility = contentBlockDisplayVisibility(block);
  const canCreateSolutionCopy = visibility !== "solution" && canCreateSolutionSurfaceCopy(block);
  const markTicks = typeof block.markTicks === "number" && Number.isInteger(block.markTicks) ? block.markTicks : 0;

  return {
    visibility,
    markTicks,
    supportsSurfaceTicks: contentBlockSupportsSolutionSurfaceTicks(block),
    tickLabel: contentBlockSolutionTickLabel(block),
    tickHelp: contentBlockSolutionTickHelp(block),
    canCreateSolutionCopy,
    copyTitle: canCreateSolutionCopy ? SOLUTION_SURFACE_COPY_ENABLED_TITLE : SOLUTION_SURFACE_COPY_DISABLED_TITLE,
  };
}
