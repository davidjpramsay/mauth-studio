import { normalizeColumnsBlock } from "./contentBlockNormalization.ts";
import type { EditorContentBlock, EditorPart, EditorSubpart, QuestionBlock } from "./editorDocumentNormalization.ts";

export interface EditorDocumentDuplicationOptions {
  id: (prefix: string) => string;
  cloneSerializable: <T>(value: T) => T;
}

export interface EditorColumnBlockPathEntry {
  columnIndex: number;
  blockId: string;
}

export type EditorColumnBlockPath = EditorColumnBlockPathEntry[];

export function createEditorDocumentDuplicator({ id, cloneSerializable }: EditorDocumentDuplicationOptions) {
  function duplicatedContentBlock(block: EditorContentBlock): EditorContentBlock {
    const nextBlock = cloneSerializable(block);
    nextBlock.id = id(block.kind);
    if (nextBlock.kind === "columns") {
      nextBlock.columns = normalizeColumnsBlock(nextBlock).columns.map((column) => column.map(duplicatedContentBlock));
    }
    return nextBlock;
  }

  function columnBlockAtPath(rootBlock: EditorContentBlock, path: EditorColumnBlockPath): EditorContentBlock | null {
    let currentBlock = rootBlock;
    for (const entry of path) {
      if (currentBlock.kind !== "columns") return null;
      const column = normalizeColumnsBlock(currentBlock).columns[entry.columnIndex] ?? [];
      const nextBlock = column.find((candidate) => candidate.id === entry.blockId);
      if (!nextBlock) return null;
      currentBlock = nextBlock;
    }
    return currentBlock;
  }

  function duplicateColumnBlockAtPath(
    rootBlock: Extract<EditorContentBlock, { kind: "columns" }>,
    path: EditorColumnBlockPath,
  ): { rootBlock: Extract<EditorContentBlock, { kind: "columns" }>; duplicatedPath: EditorColumnBlockPath } | null {
    if (!path.length) return null;
    const duplicateInColumnsBlock = (
      columnsBlock: Extract<EditorContentBlock, { kind: "columns" }>,
      pathIndex: number,
    ): { block: Extract<EditorContentBlock, { kind: "columns" }>; duplicatedPath: EditorColumnBlockPath } | null => {
      const entry = path[pathIndex];
      if (!entry) return null;
      const normalized = normalizeColumnsBlock(columnsBlock);
      const column = normalized.columns[entry.columnIndex];
      if (!column) return null;
      const childIndex = column.findIndex((child) => child.id === entry.blockId);
      if (childIndex < 0) return null;

      if (pathIndex === path.length - 1) {
        const nextBlock = duplicatedContentBlock(column[childIndex]);
        const columns = normalized.columns.map((currentColumn, index) =>
          index === entry.columnIndex
            ? [...currentColumn.slice(0, childIndex + 1), nextBlock, ...currentColumn.slice(childIndex + 1)]
            : currentColumn,
        );
        return {
          block: { ...columnsBlock, columnCount: normalized.columnCount, columns },
          duplicatedPath: path.map((pathEntry, index) =>
            index === pathIndex ? { ...pathEntry, blockId: nextBlock.id } : { ...pathEntry },
          ),
        };
      }

      const childBlock = column[childIndex];
      if (childBlock.kind !== "columns") return null;
      const nested = duplicateInColumnsBlock(childBlock, pathIndex + 1);
      if (!nested) return null;
      const columns = normalized.columns.map((currentColumn, index) =>
        index === entry.columnIndex ? currentColumn.map((child) => (child.id === entry.blockId ? nested.block : child)) : currentColumn,
      );
      return {
        block: { ...columnsBlock, columnCount: normalized.columnCount, columns },
        duplicatedPath: nested.duplicatedPath,
      };
    };

    const result = duplicateInColumnsBlock(rootBlock, 0);
    return result ? { rootBlock: result.block, duplicatedPath: result.duplicatedPath } : null;
  }

  function duplicatedContentBlocks(blocks: EditorContentBlock[]) {
    return blocks.map(duplicatedContentBlock);
  }

  function duplicatedSubpart(subpart: EditorSubpart): EditorSubpart {
    return {
      ...cloneSerializable(subpart),
      id: id("subpart"),
      contentBlocks: duplicatedContentBlocks(subpart.contentBlocks),
    };
  }

  function duplicatedPart(part: EditorPart): EditorPart {
    const originalSubparts = part.subparts ?? [];
    const nextSubparts = originalSubparts.map(duplicatedSubpart);
    const subpartIdMap = new Map(originalSubparts.map((subpart, index) => [subpart.id, nextSubparts[index]?.id ?? subpart.id]));
    const nextContentBlocks = duplicatedContentBlocks(part.contentBlocks);
    const blockIdMap = new Map(part.contentBlocks.map((block, index) => [block.id, nextContentBlocks[index]?.id ?? block.id]));

    return {
      ...cloneSerializable(part),
      id: id("part"),
      contentBlocks: nextContentBlocks,
      subparts: nextSubparts,
      itemOrder: part.itemOrder?.map((item) => ({
        ...item,
        id: item.kind === "subpart" ? (subpartIdMap.get(item.id) ?? item.id) : (blockIdMap.get(item.id) ?? item.id),
      })),
    };
  }

  function duplicatedQuestion(question: QuestionBlock): QuestionBlock {
    const originalParts = question.parts ?? [];
    const nextParts = originalParts.map(duplicatedPart);
    const partIdMap = new Map(originalParts.map((part, index) => [part.id, nextParts[index]?.id ?? part.id]));
    const nextContentBlocks = duplicatedContentBlocks(question.contentBlocks);
    const blockIdMap = new Map(question.contentBlocks.map((block, index) => [block.id, nextContentBlocks[index]?.id ?? block.id]));

    return {
      ...cloneSerializable(question),
      id: id("question"),
      contentBlocks: nextContentBlocks,
      parts: nextParts,
      itemOrder: question.itemOrder?.map((item) => ({
        ...item,
        id: item.kind === "part" ? (partIdMap.get(item.id) ?? item.id) : (blockIdMap.get(item.id) ?? item.id),
      })),
    };
  }

  return {
    duplicatedContentBlock,
    duplicatedContentBlocks,
    duplicatedSubpart,
    duplicatedPart,
    duplicatedQuestion,
    columnBlockAtPath,
    duplicateColumnBlockAtPath,
  };
}
