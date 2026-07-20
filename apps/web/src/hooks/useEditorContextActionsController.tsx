import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Copy, CopyPlus, Trash2 } from "lucide-react";

import type { ContextMenuAction } from "@/components/ui/context-menu";
import type { MoveDirection } from "@/lib/documentNavigation";
import type { SelectedEditorBlock } from "@/lib/editorBlockSelection";
import type { QuestionBlock } from "@/lib/editorDocumentNormalization";
import { editorContextActionDescriptors, type EditorContextActionDescriptor, type EditorContextActionId } from "@/lib/editorContextActions";
import { solutionSurfaceControlState } from "@/lib/solutionSurfaceControls";

interface ContextAnchorDescriptor {
  editorAnchor: string;
}

interface UseEditorContextActionsControllerOptions<TDescriptor extends ContextAnchorDescriptor> {
  questions: QuestionBlock[];
  supportsSolutionTools: boolean;
  contextDescriptorForAnchor: (anchor: string) => TDescriptor;
  contextReferenceText: (anchor: string) => string;
  canMoveAnchorTarget: (anchor: string, direction: MoveDirection) => boolean;
  moveAnchorTarget: (anchor: string, direction: MoveDirection) => void;
  canDuplicateAnchorTarget: (anchor: string) => boolean;
  duplicateAnchorTarget: (anchor: string) => void;
  canDeleteAnchorTarget: (anchor: string) => boolean;
  deleteEditorSelection: (anchor: string) => void;
  selectedEditorBlockFromAnchor: (questions: QuestionBlock[], anchor: string) => SelectedEditorBlock | null;
  createSolutionCopyForSelectedBlock: (selection: SelectedEditorBlock) => void;
}

function actionIcon(actionId: EditorContextActionId): ReactNode {
  if (actionId === "copy-reference") return <Copy className="size-4" aria-hidden="true" />;
  if (actionId === "move-up") return <ArrowUp className="size-4" aria-hidden="true" />;
  if (actionId === "move-down") return <ArrowDown className="size-4" aria-hidden="true" />;
  if (actionId === "delete") return <Trash2 className="size-4" aria-hidden="true" />;
  return <CopyPlus className="size-4" aria-hidden="true" />;
}

export function useEditorContextActionsController<TDescriptor extends ContextAnchorDescriptor>({
  questions,
  supportsSolutionTools,
  contextDescriptorForAnchor,
  contextReferenceText,
  canMoveAnchorTarget,
  moveAnchorTarget,
  canDuplicateAnchorTarget,
  duplicateAnchorTarget,
  canDeleteAnchorTarget,
  deleteEditorSelection,
  selectedEditorBlockFromAnchor,
  createSolutionCopyForSelectedBlock,
}: UseEditorContextActionsControllerOptions<TDescriptor>) {
  function copyAnchorReference(anchor: string) {
    const reference = contextReferenceText(anchor);
    void navigator.clipboard?.writeText(reference).catch(() => undefined);
  }

  function contextActionCallback(
    descriptor: EditorContextActionDescriptor,
    editorAnchor: string,
    solutionCopySelection: SelectedEditorBlock | null,
  ) {
    if (descriptor.id === "copy-reference") return () => copyAnchorReference(editorAnchor);
    if (descriptor.id === "move-up") return () => moveAnchorTarget(editorAnchor, -1);
    if (descriptor.id === "move-down") return () => moveAnchorTarget(editorAnchor, 1);
    if (descriptor.id === "duplicate") return () => duplicateAnchorTarget(editorAnchor);
    if (descriptor.id === "copy-to-solutions") {
      return () => {
        if (solutionCopySelection) createSolutionCopyForSelectedBlock(solutionCopySelection);
      };
    }
    return () => deleteEditorSelection(editorAnchor);
  }

  function contextActionsForAnchor(anchor: string): ContextMenuAction[] {
    const item = contextDescriptorForAnchor(anchor);
    const editorAnchor = item.editorAnchor;
    const solutionCopySelection = supportsSolutionTools ? selectedEditorBlockFromAnchor(questions, editorAnchor) : null;
    const canCreateSolutionCopy = Boolean(
      solutionCopySelection && solutionSurfaceControlState(solutionCopySelection.block).canCreateSolutionCopy,
    );

    return editorContextActionDescriptors({
      canMoveUp: canMoveAnchorTarget(editorAnchor, -1),
      canMoveDown: canMoveAnchorTarget(editorAnchor, 1),
      canDuplicate: canDuplicateAnchorTarget(editorAnchor),
      canCreateSolutionCopy,
      canDelete: canDeleteAnchorTarget(editorAnchor),
    }).map((descriptor) => ({
      ...descriptor,
      icon: actionIcon(descriptor.id),
      onSelect: contextActionCallback(descriptor, editorAnchor, solutionCopySelection),
    }));
  }

  return { contextActionsForAnchor };
}
