import type { RefObject } from "react";

import type { MauthDialogActions } from "@/hooks/useMauthDialogController";
import { useSolutionSlotController } from "@/hooks/useSolutionSlotController";
import { useSolutionSurfaceCopyController } from "@/hooks/useSolutionSurfaceCopyController";
import { useSolutionValidationController } from "@/hooks/useSolutionValidationController";
import {
  selectedEditorBlockFromAnchor,
  solutionSlotBlocks,
  solutionSurfaceColumnBlockCopyAtPath,
  solutionSurfaceContentBlock,
  solutionTextBlock,
  solutionValidationRuntime,
  studentSpaceBlock,
} from "@/lib/editorApplicationRuntime";
import { spaceLines } from "@/lib/editorContentBlockNormalization";
import type { EditorContentBlock, EditorPart, EditorSubpart, QuestionBlock } from "@/lib/editorDocumentNormalization";
import type { ContextAnchorSelectionOptions } from "@/lib/editorContextCommandRuntime";
import type { FrontMatterConfig } from "@/lib/frontMatterConfig";
import type { MauthAction, MauthActionResult } from "@/lib/mauthActions";
import { parseScrollAnchor } from "@/lib/scrollAnchors";
import { defaultSolutionSlotLinesForDocument } from "@/lib/solutionSlotDefaults";

interface UseEditorManualSolutionControllerOptions {
  frontMatter: FrontMatterConfig;
  frontMatterRef: RefObject<FrontMatterConfig>;
  questions: QuestionBlock[];
  dialogs: MauthDialogActions;
  showEditor: boolean;
  setShowSolutions: (show: boolean) => void;
  applyAction: (action: MauthAction) => MauthActionResult<QuestionBlock>;
  applyActions: (actions: MauthAction[]) => MauthActionResult<QuestionBlock>;
  selectContextAnchor: (anchor: string, options?: ContextAnchorSelectionOptions) => void;
  ensureEditorVisible: () => void;
  activateEditorAnchor: (anchor: string) => void;
  revealEditorAnchor: (anchor: string) => void;
  queueDocumentJump: (editorAnchor: string, previewAnchor: string, options?: { preservePaneMode?: boolean }) => void;
}

export function useEditorManualSolutionController({
  frontMatter,
  frontMatterRef,
  questions,
  dialogs,
  showEditor,
  setShowSolutions,
  applyAction,
  applyActions,
  selectContextAnchor,
  ensureEditorVisible,
  activateEditorAnchor,
  revealEditorAnchor,
  queueDocumentJump,
}: UseEditorManualSolutionControllerOptions) {
  const showSolutions = () => setShowSolutions(true);
  const solutionSurfaceCopyController = useSolutionSurfaceCopyController({
    questions,
    showEditor,
    applyActions,
    showSolutions,
    selectContextAnchor,
    solutionSurfaceContentBlock,
    solutionSurfaceColumnBlockCopyAtPath,
    selectedEditorBlockFromAnchor,
  });
  const solutionValidationController = useSolutionValidationController<
    QuestionBlock,
    EditorPart,
    EditorSubpart,
    EditorContentBlock,
    FrontMatterConfig
  >({
    frontMatter,
    questions,
    validationRuntime: solutionValidationRuntime,
    parseAnchor: parseScrollAnchor,
    applyActions,
    showSolutions,
    ensureEditorVisible,
    activateEditorAnchor,
    revealEditorAnchor,
    queueDocumentJump,
    buildSolutionSlotBlocks: solutionSlotBlocks,
    buildSolutionTextBlock: solutionTextBlock,
    buildStudentSpaceBlock: studentSpaceBlock,
    spaceLines,
  });
  const solutionSlotController = useSolutionSlotController<QuestionBlock, EditorPart, EditorSubpart, EditorContentBlock>({
    questions,
    dialogs,
    isEnabled: () => frontMatterRef.current.titlePageTemplate !== "notes",
    defaultLinesForMarks: (marks) => defaultSolutionSlotLinesForDocument(frontMatterRef.current, marks),
    normalizeLines: spaceLines,
    buildSolutionSlotBlocks: solutionSlotBlocks,
    applyAction,
    showSolutions,
  });

  return {
    solutionSurfaceCopyController,
    solutionValidationController,
    solutionSlotController,
  };
}
