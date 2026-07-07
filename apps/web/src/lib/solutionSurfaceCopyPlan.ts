import type { ContentBlock } from "@mauth-studio/shared";

import type { ColumnBlockPath, SelectedEditorBaseBlockScope, SelectedEditorBlock } from "./editorBlockSelection.ts";
import { studentSurfaceBlockPatch } from "./editorDocumentDuplication.ts";
import type { QuestionBlock } from "./editorDocumentNormalization.ts";
import type { MauthAction, MauthContentScope } from "./mauthActions.ts";
import { columnPathScrollAnchor, partBlockScrollAnchor, questionBlockScrollAnchor, subpartBlockScrollAnchor } from "./scrollAnchors.ts";
import { solutionBlockVisibility } from "./solutionBlockVisibility.ts";

type ColumnsContentBlock = Extract<ContentBlock, { kind: "columns" }>;

export interface SolutionSurfaceColumnCopyResult {
  rootBlock: ColumnsContentBlock;
  solutionPath: ColumnBlockPath;
}

export interface SolutionSurfaceCopyPlan {
  actions: MauthAction[];
  selectAnchor?: string;
}

interface SolutionSurfaceCopyPlanOptions {
  questions: QuestionBlock[];
  selection: SelectedEditorBlock;
  solutionSurfaceContentBlock: (block: ContentBlock) => ContentBlock | null;
  solutionSurfaceColumnBlockCopyAtPath: (rootBlock: ColumnsContentBlock, path: ColumnBlockPath) => SolutionSurfaceColumnCopyResult | null;
}

function contentBlockContextFromBaseScope(questions: QuestionBlock[], scope: SelectedEditorBaseBlockScope, blockId: string) {
  const question = questions.find((current) => current.id === scope.questionId);
  if (!question) return null;

  if (scope.kind === "subpart") {
    const part = question.parts.find((current) => current.id === scope.partId);
    const subpart = part?.subparts.find((current) => current.id === scope.subpartId);
    const block = subpart?.contentBlocks.find((current) => current.id === blockId);
    if (!block) return null;
    return {
      block,
      scope: {
        kind: "subpart",
        questionId: scope.questionId,
        partId: scope.partId,
        subpartId: scope.subpartId,
      } satisfies MauthContentScope,
      anchorForBlock: (nextBlockId: string) => subpartBlockScrollAnchor(scope.questionId, scope.partId, scope.subpartId, nextBlockId),
    };
  }

  if (scope.kind === "part") {
    const part = question.parts.find((current) => current.id === scope.partId);
    const block = part?.contentBlocks.find((current) => current.id === blockId);
    if (!block) return null;
    return {
      block,
      scope: { kind: "part", questionId: scope.questionId, partId: scope.partId } satisfies MauthContentScope,
      anchorForBlock: (nextBlockId: string) => partBlockScrollAnchor(scope.questionId, scope.partId, nextBlockId),
    };
  }

  const block = question.contentBlocks.find((current) => current.id === blockId);
  if (!block) return null;
  return {
    block,
    scope: { kind: "question", questionId: scope.questionId } satisfies MauthContentScope,
    anchorForBlock: (nextBlockId: string) => questionBlockScrollAnchor(scope.questionId, nextBlockId),
  };
}

export function solutionSurfaceCopyPlan({
  questions,
  selection,
  solutionSurfaceContentBlock,
  solutionSurfaceColumnBlockCopyAtPath,
}: SolutionSurfaceCopyPlanOptions): SolutionSurfaceCopyPlan | null {
  if (solutionBlockVisibility(selection.block) === "solution") return null;

  if (selection.scope.kind === "column") {
    const rootContext = contentBlockContextFromBaseScope(questions, selection.scope.rootScope, selection.scope.rootBlockId);
    if (!rootContext?.block || rootContext.block.kind !== "columns") return null;
    const solutionCopy = solutionSurfaceColumnBlockCopyAtPath(rootContext.block, selection.scope.path);
    if (!solutionCopy) return null;

    return {
      actions: [
        {
          type: "module.update",
          scope: rootContext.scope,
          blockId: rootContext.block.id,
          patch: {
            columnCount: solutionCopy.rootBlock.columnCount,
            columns: solutionCopy.rootBlock.columns,
            visibility: "always",
            solutionOnly: false,
            studentOnly: false,
            markTicks: undefined,
          },
        },
      ],
      selectAnchor: columnPathScrollAnchor(rootContext.anchorForBlock(rootContext.block.id), solutionCopy.solutionPath),
    };
  }

  const context = contentBlockContextFromBaseScope(questions, selection.scope, selection.block.id);
  if (!context) return null;
  const nextBlock = solutionSurfaceContentBlock(selection.block);
  if (!nextBlock) return null;

  return {
    actions: [
      {
        type: "module.update",
        scope: selection.scope,
        blockId: selection.block.id,
        patch: studentSurfaceBlockPatch() as Record<string, unknown>,
      },
      {
        type: "module.add",
        scope: selection.scope,
        blocks: [nextBlock],
        placement: { blockId: selection.block.id, position: "after" },
      },
    ],
    selectAnchor: context.anchorForBlock(nextBlock.id),
  };
}
