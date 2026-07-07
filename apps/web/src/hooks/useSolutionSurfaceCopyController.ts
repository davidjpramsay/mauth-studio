import type { ContentBlock } from "@mauth-studio/shared";

import type { ColumnBlockPath, SelectedEditorBlock } from "@/lib/editorBlockSelection";
import type { MauthAction } from "@/lib/mauthActions";
import type { QuestionBlock } from "@/lib/editorDocumentNormalization";
import { solutionSurfaceCopyPlan, type SolutionSurfaceColumnCopyResult } from "@/lib/solutionSurfaceCopyPlan";

interface ApplyActionResult {
  ok: boolean;
}

type ColumnsContentBlock = Extract<ContentBlock, { kind: "columns" }>;

interface UseSolutionSurfaceCopyControllerOptions {
  questions: QuestionBlock[];
  showEditor: boolean;
  applyActions: (actions: MauthAction[]) => ApplyActionResult;
  showSolutions: () => void;
  selectContextAnchor: (anchor: string, options?: { openEditor?: boolean; openInspector?: boolean; previewOnly?: boolean }) => void;
  solutionSurfaceContentBlock: (block: ContentBlock) => ContentBlock | null;
  solutionSurfaceColumnBlockCopyAtPath: (rootBlock: ColumnsContentBlock, path: ColumnBlockPath) => SolutionSurfaceColumnCopyResult | null;
}

export function useSolutionSurfaceCopyController({
  questions,
  showEditor,
  applyActions,
  showSolutions,
  selectContextAnchor,
  solutionSurfaceContentBlock,
  solutionSurfaceColumnBlockCopyAtPath,
}: UseSolutionSurfaceCopyControllerOptions) {
  function createSolutionCopyForSelectedBlock(selection: SelectedEditorBlock) {
    const plan = solutionSurfaceCopyPlan({ questions, selection, solutionSurfaceContentBlock, solutionSurfaceColumnBlockCopyAtPath });
    if (!plan) return;
    const result = applyActions(plan.actions);
    if (!result.ok) return;
    showSolutions();
    if (plan.selectAnchor) selectContextAnchor(plan.selectAnchor, { openEditor: showEditor, openInspector: true });
  }

  return { createSolutionCopyForSelectedBlock };
}
