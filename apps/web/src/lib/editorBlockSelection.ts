import { normalizeColumnsBlock } from "./contentBlockNormalization.ts";
import { tocBlockLabel } from "./editorBlockSummaries.ts";
import type { EditorContentBlock, QuestionBlock } from "./editorDocumentNormalization.ts";
import { parseScrollAnchor } from "./scrollAnchors.ts";

export type SelectedEditorBaseBlockScope =
  | { kind: "question"; questionId: string }
  | { kind: "part"; questionId: string; partId: string }
  | { kind: "subpart"; questionId: string; partId: string; subpartId: string };

export interface ColumnBlockPathEntry {
  columnIndex: number;
  blockId: string;
}

export type ColumnBlockPath = ColumnBlockPathEntry[];

export type SelectedEditorBlockScope =
  | SelectedEditorBaseBlockScope
  | { kind: "column"; rootScope: SelectedEditorBaseBlockScope; rootBlockId: string; path: ColumnBlockPath };

export interface SelectedEditorBlock {
  scope: SelectedEditorBlockScope;
  block: EditorContentBlock;
  label: string;
  summary: string;
}

export interface EditorBlockSelectionRuntimeOptions {
  tocBlockSummary: (block: EditorContentBlock) => string;
}

function lowerFirst(value: string) {
  return value ? `${value[0].toLowerCase()}${value.slice(1)}` : value;
}

export function createEditorBlockSelectionRuntime({ tocBlockSummary }: EditorBlockSelectionRuntimeOptions) {
  function selectedEditorBlockFromBlocks(
    contentBlocks: EditorContentBlock[],
    blockId: string,
    scope: SelectedEditorBaseBlockScope,
    labelPrefix = "",
  ): SelectedEditorBlock | null {
    const blocks = contentBlocks.filter((current) => current.kind !== "pageBreak");
    const blockIndex = blocks.findIndex((current) => current.id === blockId);
    const block = blockIndex >= 0 ? blocks[blockIndex] : null;
    if (!block) return null;

    const blockLabel = tocBlockLabel(block, blockIndex);
    return {
      scope,
      block,
      label: labelPrefix ? `${labelPrefix} ${lowerFirst(blockLabel)}` : blockLabel,
      summary: tocBlockSummary(block),
    };
  }

  function selectedColumnBlockFromRoot(
    rootBlock: EditorContentBlock,
    rootScope: SelectedEditorBaseBlockScope,
    rootBlockId: string,
    path: ColumnBlockPath,
    labelPrefix = "",
  ): SelectedEditorBlock | null {
    let currentBlock = rootBlock;
    let currentPrefix = labelPrefix;

    for (let pathIndex = 0; pathIndex < path.length; pathIndex += 1) {
      const entry = path[pathIndex];
      if (currentBlock.kind !== "columns") return null;
      const columnsBlock = normalizeColumnsBlock(currentBlock);
      const column = columnsBlock.columns[entry.columnIndex] ?? [];
      const blockIndex = column.findIndex((candidate) => candidate.id === entry.blockId);
      const childBlock = blockIndex >= 0 ? column[blockIndex] : null;
      if (!childBlock) return null;

      const columnPrefix = `${currentPrefix ? `${currentPrefix} ` : ""}Column ${entry.columnIndex + 1}`;
      if (pathIndex === path.length - 1) {
        const blockLabel = tocBlockLabel(childBlock, blockIndex);
        return {
          scope: { kind: "column", rootScope, rootBlockId, path },
          block: childBlock,
          label: `${columnPrefix} ${lowerFirst(blockLabel)}`,
          summary: tocBlockSummary(childBlock),
        };
      }

      currentBlock = childBlock;
      currentPrefix = columnPrefix;
    }

    return null;
  }

  function selectedEditorBlockFromAnchor(questions: QuestionBlock[], anchor: string): SelectedEditorBlock | null {
    const parsed = parseScrollAnchor(anchor);
    if (!parsed.questionId || !parsed.blockId) return null;

    const question = questions.find((current) => current.id === parsed.questionId);
    if (!question) return null;

    if (parsed.kind === "columnBlock" && parsed.rootBlockId && parsed.columnPath?.length) {
      if (parsed.partId && parsed.subpartId) {
        const part = question.parts.find((current) => current.id === parsed.partId);
        const subpart = part?.subparts.find((current) => current.id === parsed.subpartId);
        const rootBlock = subpart?.contentBlocks.find((current) => current.id === parsed.rootBlockId);
        if (!rootBlock) return null;
        return selectedColumnBlockFromRoot(
          rootBlock,
          { kind: "subpart", questionId: parsed.questionId, partId: parsed.partId, subpartId: parsed.subpartId },
          parsed.rootBlockId,
          parsed.columnPath,
          "Subpart",
        );
      }

      if (parsed.partId) {
        const part = question.parts.find((current) => current.id === parsed.partId);
        const rootBlock = part?.contentBlocks.find((current) => current.id === parsed.rootBlockId);
        if (!rootBlock) return null;
        return selectedColumnBlockFromRoot(
          rootBlock,
          { kind: "part", questionId: parsed.questionId, partId: parsed.partId },
          parsed.rootBlockId,
          parsed.columnPath,
          "Part",
        );
      }

      const rootBlock = question.contentBlocks.find((current) => current.id === parsed.rootBlockId);
      if (!rootBlock) return null;
      return selectedColumnBlockFromRoot(
        rootBlock,
        { kind: "question", questionId: parsed.questionId },
        parsed.rootBlockId,
        parsed.columnPath,
      );
    }

    if (parsed.kind === "questionBlock") {
      return selectedEditorBlockFromBlocks(question.contentBlocks, parsed.blockId, { kind: "question", questionId: parsed.questionId });
    }

    if (parsed.kind === "partBlock" && parsed.partId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      if (!part) return null;
      return selectedEditorBlockFromBlocks(
        part.contentBlocks,
        parsed.blockId,
        { kind: "part", questionId: parsed.questionId, partId: parsed.partId },
        "Part",
      );
    }

    if (parsed.kind === "subpartBlock" && parsed.partId && parsed.subpartId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      const subpart = part?.subparts.find((current) => current.id === parsed.subpartId);
      if (!subpart) return null;
      return selectedEditorBlockFromBlocks(
        subpart.contentBlocks,
        parsed.blockId,
        { kind: "subpart", questionId: parsed.questionId, partId: parsed.partId, subpartId: parsed.subpartId },
        "Subpart",
      );
    }

    return null;
  }

  return {
    selectedColumnBlockFromRoot,
    selectedEditorBlockFromAnchor,
    selectedEditorBlockFromBlocks,
  };
}
