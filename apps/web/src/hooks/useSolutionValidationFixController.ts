import type { ContentBlock } from "@mauth-studio/shared";

import type { MauthAction, MauthContentScope } from "@/lib/mauthActions";
import type { SolutionValidationFix, SolutionValidationIssue } from "@/lib/solutionValidation";
import { insertBesideNestedContentBlock, nestedColumnsMutationPatch, updateNestedContentBlock } from "@/lib/solutionValidationNestedBlocks";

interface ParsedSolutionAnchor {
  questionId?: string;
  partId?: string;
  subpartId?: string;
}

interface SolutionSubpartLike<TBlock extends ContentBlock> {
  id: string;
  contentBlocks: TBlock[];
}

interface SolutionPartLike<TBlock extends ContentBlock> {
  id: string;
  contentBlocks: TBlock[];
  subparts: SolutionSubpartLike<TBlock>[];
}

interface SolutionQuestionLike<TBlock extends ContentBlock> {
  id: string;
  contentBlocks: TBlock[];
  parts: SolutionPartLike<TBlock>[];
}

interface ApplyActionsResult {
  ok: boolean;
}

interface UseSolutionValidationFixControllerOptions<TQuestion extends SolutionQuestionLike<TBlock>, TBlock extends ContentBlock> {
  questions: TQuestion[];
  parseAnchor: (anchor: string) => ParsedSolutionAnchor;
  applyActions: (actions: MauthAction[]) => ApplyActionsResult;
  closeValidationPanel: () => void;
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

export function useSolutionValidationFixController<TQuestion extends SolutionQuestionLike<TBlock>, TBlock extends ContentBlock>({
  questions,
  parseAnchor,
  applyActions,
  closeValidationPanel,
  showSolutions,
  ensureEditorVisible,
  activateEditorAnchor,
  revealEditorAnchor,
  queueDocumentJump,
  buildSolutionSlotBlocks,
  buildSolutionTextBlock,
  buildStudentSpaceBlock,
  spaceLines,
}: UseSolutionValidationFixControllerOptions<TQuestion, TBlock>) {
  function focusSolutionValidationAnchor(anchor: string) {
    ensureEditorVisible();
    activateEditorAnchor(anchor);
    revealEditorAnchor(anchor);
    queueDocumentJump(anchor, anchor, { preservePaneMode: true });
  }

  function jumpToSolutionValidationIssue(anchor: string) {
    closeValidationPanel();
    focusSolutionValidationAnchor(anchor);
  }

  function solutionValidationScope(question: TQuestion, parsed: ParsedSolutionAnchor) {
    if (!parsed.questionId) return null;

    if (parsed.partId && parsed.subpartId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      const subpart = part?.subparts.find((current) => current.id === parsed.subpartId);
      if (!part || !subpart) return null;
      return {
        scope: {
          kind: "subpart",
          questionId: parsed.questionId,
          partId: parsed.partId,
          subpartId: parsed.subpartId,
        } satisfies MauthContentScope,
        contentBlocks: subpart.contentBlocks,
      };
    }

    if (parsed.partId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      if (!part) return null;
      return {
        scope: { kind: "part", questionId: parsed.questionId, partId: parsed.partId } satisfies MauthContentScope,
        contentBlocks: part.contentBlocks,
      };
    }

    return {
      scope: { kind: "question", questionId: parsed.questionId } satisfies MauthContentScope,
      contentBlocks: question.contentBlocks,
    };
  }

  function solutionValidationFixActions(scope: MauthContentScope, contentBlocks: TBlock[], fix: SolutionValidationFix) {
    if (fix.kind === "add-slot") {
      return {
        actions: [{ type: "solutionSlot.add", scope, blocks: buildSolutionSlotBlocks(fix.lines) } satisfies MauthAction],
        showSolutionsAfter: true,
      };
    }

    if (fix.kind === "add-solution") {
      const solutionBlock = buildSolutionTextBlock();
      const directTarget = contentBlocks.some((block) => block.id === fix.afterBlockId);
      if (!directTarget) {
        const nested = insertBesideNestedContentBlock(contentBlocks, fix.afterBlockId, solutionBlock, "after");
        if (!nested) return null;
        return {
          actions: [
            {
              type: "module.update",
              scope,
              blockId: nested.rootBlock.id,
              patch: nestedColumnsMutationPatch(nested),
            } satisfies MauthAction,
          ],
          showSolutionsAfter: true,
        };
      }
      return {
        actions: [
          {
            type: "module.add",
            scope,
            blocks: [solutionBlock],
            placement: { blockId: fix.afterBlockId, position: "after" },
          } satisfies MauthAction,
        ],
        showSolutionsAfter: true,
      };
    }

    if (fix.kind === "add-student-space") {
      const studentBlock = buildStudentSpaceBlock(fix.lines);
      const directTarget = contentBlocks.some((block) => block.id === fix.beforeBlockId);
      if (!directTarget) {
        const nested = insertBesideNestedContentBlock(contentBlocks, fix.beforeBlockId, studentBlock, "before");
        if (!nested) return null;
        return {
          actions: [
            {
              type: "module.update",
              scope,
              blockId: nested.rootBlock.id,
              patch: nestedColumnsMutationPatch(nested),
            } satisfies MauthAction,
          ],
          showSolutionsAfter: true,
        };
      }
      return {
        actions: [
          {
            type: "module.add",
            scope,
            blocks: [studentBlock],
            placement: { blockId: fix.beforeBlockId, position: "before" },
          } satisfies MauthAction,
        ],
        showSolutionsAfter: true,
      };
    }

    const block = contentBlocks.find((current) => current.id === fix.blockId);
    if (!block) {
      const nested = updateNestedContentBlock(contentBlocks, fix.blockId, (candidate) =>
        candidate.kind === "space" ? { ...candidate, lines: Math.max(spaceLines(candidate.lines), fix.lines) } : null,
      );
      if (!nested || nested.targetBlock.kind !== "space") return null;
      return {
        actions: [
          {
            type: "module.update",
            scope,
            blockId: nested.rootBlock.id,
            patch: nestedColumnsMutationPatch(nested),
          } satisfies MauthAction,
        ],
        showSolutionsAfter: false,
      };
    }
    if (block.kind !== "space") return null;
    return {
      actions: [
        {
          type: "module.update",
          scope,
          blockId: fix.blockId,
          patch: { lines: Math.max(spaceLines(block.lines), fix.lines) },
        } satisfies MauthAction,
      ],
      showSolutionsAfter: false,
    };
  }

  function applySolutionValidationFix(issue: SolutionValidationIssue) {
    const fix = issue.fix;
    if (!fix) {
      jumpToSolutionValidationIssue(issue.anchor);
      return;
    }

    const parsed = parseAnchor(issue.anchor);
    const question = parsed.questionId ? questions.find((current) => current.id === parsed.questionId) : null;
    if (!question || !parsed.questionId) {
      jumpToSolutionValidationIssue(issue.anchor);
      return;
    }

    const target = solutionValidationScope(question, parsed);
    const actionPatch = target ? solutionValidationFixActions(target.scope, target.contentBlocks, fix) : null;
    if (!actionPatch) {
      jumpToSolutionValidationIssue(issue.anchor);
      return;
    }

    const result = applyActions(actionPatch.actions);
    if (!result.ok) {
      jumpToSolutionValidationIssue(issue.anchor);
      return;
    }

    if (actionPatch.showSolutionsAfter) showSolutions();
    focusSolutionValidationAnchor(issue.anchor);
  }

  return {
    jumpToSolutionValidationIssue,
    applySolutionValidationFix,
  };
}
