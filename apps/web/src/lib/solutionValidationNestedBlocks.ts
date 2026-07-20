import type { ContentBlock } from "@mauth-studio/shared";

type ColumnsContentBlock = Extract<ContentBlock, { kind: "columns" }>;

export interface NestedContentBlockMutation {
  rootBlock: ColumnsContentBlock;
  targetBlock: ContentBlock;
}

function mutateNestedBlockList(
  blocks: ContentBlock[],
  targetBlockId: string,
  mutate: (blocks: ContentBlock[], targetIndex: number) => ContentBlock[] | null,
): { blocks: ContentBlock[]; targetBlock: ContentBlock } | null {
  const targetIndex = blocks.findIndex((block) => block.id === targetBlockId);
  if (targetIndex >= 0) {
    const nextBlocks = mutate(blocks, targetIndex);
    return nextBlocks ? { blocks: nextBlocks, targetBlock: blocks[targetIndex] } : null;
  }

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    if (block?.kind !== "columns") continue;
    for (let columnIndex = 0; columnIndex < block.columns.length; columnIndex += 1) {
      const result = mutateNestedBlockList(block.columns[columnIndex] ?? [], targetBlockId, mutate);
      if (!result) continue;
      const columns = block.columns.map((column, index) => (index === columnIndex ? result.blocks : column));
      return {
        blocks: blocks.map((candidate, index) => (index === blockIndex ? { ...block, columns } : candidate)),
        targetBlock: result.targetBlock,
      };
    }
  }

  return null;
}

function mutateNestedColumnsRoot(
  rootBlock: ColumnsContentBlock,
  targetBlockId: string,
  mutate: (blocks: ContentBlock[], targetIndex: number) => ContentBlock[] | null,
): NestedContentBlockMutation | null {
  for (let columnIndex = 0; columnIndex < rootBlock.columns.length; columnIndex += 1) {
    const result = mutateNestedBlockList(rootBlock.columns[columnIndex] ?? [], targetBlockId, mutate);
    if (!result) continue;
    return {
      rootBlock: {
        ...rootBlock,
        columns: rootBlock.columns.map((column, index) => (index === columnIndex ? result.blocks : column)),
      },
      targetBlock: result.targetBlock,
    };
  }
  return null;
}

export function insertBesideNestedContentBlock(
  contentBlocks: ContentBlock[],
  targetBlockId: string,
  insertedBlock: ContentBlock,
  position: "before" | "after",
): NestedContentBlockMutation | null {
  for (const block of contentBlocks) {
    if (block.kind !== "columns") continue;
    const result = mutateNestedColumnsRoot(block, targetBlockId, (blocks, targetIndex) => {
      const insertionIndex = position === "before" ? targetIndex : targetIndex + 1;
      return [...blocks.slice(0, insertionIndex), insertedBlock, ...blocks.slice(insertionIndex)];
    });
    if (result) return result;
  }
  return null;
}

export function updateNestedContentBlock(
  contentBlocks: ContentBlock[],
  targetBlockId: string,
  update: (block: ContentBlock) => ContentBlock | null,
): NestedContentBlockMutation | null {
  for (const block of contentBlocks) {
    if (block.kind !== "columns") continue;
    const result = mutateNestedColumnsRoot(block, targetBlockId, (blocks, targetIndex) => {
      const nextBlock = update(blocks[targetIndex]);
      if (!nextBlock) return null;
      return blocks.map((candidate, index) => (index === targetIndex ? nextBlock : candidate));
    });
    if (result) return result;
  }
  return null;
}

export function nestedColumnsMutationPatch(result: NestedContentBlockMutation) {
  return {
    columnCount: result.rootBlock.columnCount,
    columns: result.rootBlock.columns,
  };
}
