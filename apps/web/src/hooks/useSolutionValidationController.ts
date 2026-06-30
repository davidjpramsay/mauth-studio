import { useMemo, useState } from "react";
import type { ContentBlock } from "@mauth-studio/shared";

import { useSolutionValidationFixController } from "@/hooks/useSolutionValidationFixController";
import type { MauthAction } from "@/lib/mauthActions";
import {
  validateSolutionCompleteness,
  type SolutionValidationPartLike,
  type SolutionValidationQuestionLike,
  type SolutionValidationResult,
  type SolutionValidationRuntime,
  type SolutionValidationSubpartLike,
} from "@/lib/solutionValidation";

interface ParsedSolutionAnchor {
  questionId?: string;
  partId?: string;
  subpartId?: string;
}

interface SolutionFixSubpartLike<TBlock extends ContentBlock> {
  id: string;
  contentBlocks: TBlock[];
}

interface SolutionFixPartLike<TBlock extends ContentBlock> {
  id: string;
  contentBlocks: TBlock[];
  subparts: SolutionFixSubpartLike<TBlock>[];
}

interface SolutionFixQuestionLike<TBlock extends ContentBlock> {
  id: string;
  contentBlocks: TBlock[];
  parts: SolutionFixPartLike<TBlock>[];
}

interface ApplyActionsResult {
  ok: boolean;
}

interface UseSolutionValidationControllerOptions<
  TQuestion extends SolutionValidationQuestionLike<TPart> & SolutionFixQuestionLike<TBlock>,
  TPart extends SolutionValidationPartLike<TSubpart>,
  TSubpart extends SolutionValidationSubpartLike,
  TBlock extends ContentBlock,
  TFrontMatter,
> {
  frontMatter: TFrontMatter;
  questions: TQuestion[];
  validationRuntime: (frontMatter: TFrontMatter) => SolutionValidationRuntime<TQuestion, TPart, TSubpart>;
  parseAnchor: (anchor: string) => ParsedSolutionAnchor;
  applyActions: (actions: MauthAction[]) => ApplyActionsResult;
  showSolutions: () => void;
  ensureEditorVisible: () => void;
  activateEditorAnchor: (anchor: string) => void;
  revealEditorAnchor: (anchor: string) => void;
  queueDocumentJump: (editorAnchor: string, previewAnchor: string, options?: { preservePaneMode?: boolean }) => void;
  buildSolutionSlotBlocks: (lines: number) => TBlock[];
  buildSolutionTextBlock: () => TBlock;
  buildStudentSpaceBlock: (lines: number) => TBlock;
  spaceLines: (value: unknown) => number;
}

export function useSolutionValidationController<
  TQuestion extends SolutionValidationQuestionLike<TPart> & SolutionFixQuestionLike<TBlock>,
  TPart extends SolutionValidationPartLike<TSubpart>,
  TSubpart extends SolutionValidationSubpartLike,
  TBlock extends ContentBlock,
  TFrontMatter,
>({
  frontMatter,
  questions,
  validationRuntime,
  parseAnchor,
  applyActions,
  showSolutions,
  ensureEditorVisible,
  activateEditorAnchor,
  revealEditorAnchor,
  queueDocumentJump,
  buildSolutionSlotBlocks,
  buildSolutionTextBlock,
  buildStudentSpaceBlock,
  spaceLines,
}: UseSolutionValidationControllerOptions<TQuestion, TPart, TSubpart, TBlock, TFrontMatter>) {
  const [solutionValidationOpen, setSolutionValidationOpen] = useState(false);
  const solutionValidation: SolutionValidationResult = useMemo(
    () => validateSolutionCompleteness(questions, validationRuntime(frontMatter)),
    [frontMatter, questions, validationRuntime],
  );

  const { jumpToSolutionValidationIssue, applySolutionValidationFix } = useSolutionValidationFixController<TQuestion, TBlock>({
    questions,
    parseAnchor,
    applyActions,
    closeValidationPanel: () => setSolutionValidationOpen(false),
    showSolutions,
    ensureEditorVisible,
    activateEditorAnchor,
    revealEditorAnchor,
    queueDocumentJump,
    buildSolutionSlotBlocks,
    buildSolutionTextBlock,
    buildStudentSpaceBlock,
    spaceLines,
  });

  return {
    solutionValidation,
    solutionValidationOpen,
    setSolutionValidationOpen,
    jumpToSolutionValidationIssue,
    applySolutionValidationFix,
  };
}
