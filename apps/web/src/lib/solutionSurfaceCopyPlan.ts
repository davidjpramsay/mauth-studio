import type { ContentBlock } from "@mauth-studio/shared";

import { normalizeColumnsBlock } from "./contentBlockNormalization.ts";
import type { ColumnBlockPath, SelectedEditorBaseBlockScope, SelectedEditorBlock } from "./editorBlockSelection.ts";
import { studentSurfaceBlockPatch } from "./editorDocumentDuplication.ts";
import type { QuestionBlock } from "./editorDocumentNormalization.ts";
import type { MauthAction, MauthContentScope } from "./mauthActions.ts";
import { columnPathScrollAnchor, partBlockScrollAnchor, questionBlockScrollAnchor, subpartBlockScrollAnchor } from "./scrollAnchors.ts";
import { replacementSlotContainingBlock, solutionBlockVisibility } from "./solutionBlockVisibility.ts";

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
    if (!subpart) return null;
    const block = subpart.contentBlocks.find((current) => current.id === blockId);
    if (!block) return null;
    return {
      block,
      blocks: subpart.contentBlocks,
      blockIndex: subpart.contentBlocks.findIndex((candidate) => candidate.id === blockId),
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
    if (!part) return null;
    const block = part.contentBlocks.find((current) => current.id === blockId);
    if (!block) return null;
    return {
      block,
      blocks: part.contentBlocks,
      blockIndex: part.contentBlocks.findIndex((candidate) => candidate.id === blockId),
      scope: { kind: "part", questionId: scope.questionId, partId: scope.partId } satisfies MauthContentScope,
      anchorForBlock: (nextBlockId: string) => partBlockScrollAnchor(scope.questionId, scope.partId, nextBlockId),
    };
  }

  const block = question.contentBlocks.find((current) => current.id === blockId);
  if (!block) return null;
  return {
    block,
    blocks: question.contentBlocks,
    blockIndex: question.contentBlocks.findIndex((candidate) => candidate.id === blockId),
    scope: { kind: "question", questionId: scope.questionId } satisfies MauthContentScope,
    anchorForBlock: (nextBlockId: string) => questionBlockScrollAnchor(scope.questionId, nextBlockId),
  };
}

function existingSolutionSurfaceBlock(blocks: ContentBlock[], blockIndex: number, studentBlock: ContentBlock) {
  const slot = replacementSlotContainingBlock(blocks, blockIndex);
  if (!slot || slot.studentBlock.id !== studentBlock.id) return null;
  return slot.solutionBlocks.find((block) => block.kind === studentBlock.kind) ?? null;
}

function existingSolutionColumnPath(rootBlock: ColumnsContentBlock, path: ColumnBlockPath): ColumnBlockPath | null {
  if (!path.length) return null;
  let currentBlock: ContentBlock = rootBlock;

  for (let pathIndex = 0; pathIndex < path.length; pathIndex += 1) {
    const entry = path[pathIndex];
    if (!entry || currentBlock.kind !== "columns") return null;
    const column: ContentBlock[] = normalizeColumnsBlock(currentBlock).columns[entry.columnIndex] ?? [];
    const childIndex: number = column.findIndex((candidate: ContentBlock) => candidate.id === entry.blockId);
    const childBlock: ContentBlock | null = childIndex >= 0 ? (column[childIndex] ?? null) : null;
    if (!childBlock) return null;

    if (pathIndex === path.length - 1) {
      const solutionBlock = existingSolutionSurfaceBlock(column, childIndex, childBlock);
      if (!solutionBlock) return null;
      return path.map((pathEntry, index) => (index === pathIndex ? { ...pathEntry, blockId: solutionBlock.id } : { ...pathEntry }));
    }

    currentBlock = childBlock;
  }

  return null;
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
    if (selection.block.kind === "table" && solutionBlockVisibility(selection.block) === "always") {
      return {
        actions: [],
        selectAnchor: columnPathScrollAnchor(rootContext.anchorForBlock(rootContext.block.id), selection.scope.path),
      };
    }
    const existingPath = existingSolutionColumnPath(rootContext.block, selection.scope.path);
    if (existingPath) {
      return {
        actions: [],
        selectAnchor: columnPathScrollAnchor(rootContext.anchorForBlock(rootContext.block.id), existingPath),
      };
    }
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
  if (selection.block.kind === "table" && solutionBlockVisibility(selection.block) === "always") {
    return {
      actions: [],
      selectAnchor: context.anchorForBlock(selection.block.id),
    };
  }
  const existingBlock = existingSolutionSurfaceBlock(context.blocks, context.blockIndex, context.block);
  if (existingBlock) {
    return {
      actions: [],
      selectAnchor: context.anchorForBlock(existingBlock.id),
    };
  }
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
