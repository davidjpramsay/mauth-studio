import type { ContentBlock } from "@mauth-studio/shared";

import { normalizeTableBlock, plainTableRows } from "./contentBlockNormalization.ts";
import { visibilityReplacementSlotAt } from "./solutionBlockVisibility.ts";

type TableBlock = Extract<ContentBlock, { kind: "table" }>;

export type TableSolutionEntryMask = boolean[][];
export type TableSolutionEntryMasks = Record<string, TableSolutionEntryMask>;

export function tableSolutionEntryMask(studentBlock: ContentBlock, solutionBlock: ContentBlock): TableSolutionEntryMask | undefined {
  if (studentBlock.kind !== "table" || solutionBlock.kind !== "table") return undefined;

  const studentRows = plainTableRows(normalizeTableBlock(studentBlock));
  const solutionRows = plainTableRows(normalizeTableBlock(solutionBlock));
  return solutionRows.map((row, rowIndex) =>
    row.map((cell, cellIndex) => {
      const studentCell = studentRows[rowIndex]?.[cellIndex] ?? "";
      return !studentCell.trim() && Boolean(cell.trim());
    }),
  );
}

export function fallbackSolutionTableEntryMask(solutionBlock: TableBlock): TableSolutionEntryMask | undefined {
  if (solutionBlock.visibility !== "solution" && solutionBlock.solutionOnly !== true) return undefined;
  const table = normalizeTableBlock(solutionBlock);
  const rows = plainTableRows(table);
  const headerRowCount = table.showHeader ? 1 : 0;
  return rows.map((row, rowIndex) => row.map((cell, cellIndex) => rowIndex >= headerRowCount && cellIndex > 0 && Boolean(cell.trim())));
}

export function tableSolutionEntryMasksForSlot(studentBlock: ContentBlock, solutionBlocks: ContentBlock[]) {
  const masks: TableSolutionEntryMasks = {};
  for (const solutionBlock of solutionBlocks) {
    const mask = tableSolutionEntryMask(studentBlock, solutionBlock);
    if (mask) masks[solutionBlock.id] = mask;
  }
  return Object.keys(masks).length ? masks : undefined;
}

export function tableSolutionEntryMasksForBlocks(blocks: ContentBlock[]) {
  const masks: TableSolutionEntryMasks = {};
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const slot = visibilityReplacementSlotAt(blocks, blockIndex);
    if (!slot) continue;
    const slotMasks = tableSolutionEntryMasksForSlot(slot.studentBlock, slot.solutionBlocks);
    if (slotMasks) Object.assign(masks, slotMasks);
    blockIndex = slot.endIndex;
  }

  for (const block of blocks) {
    if (block.kind !== "table" || masks[block.id]) continue;
    const fallbackMask = fallbackSolutionTableEntryMask(block);
    if (fallbackMask) masks[block.id] = fallbackMask;
  }

  return Object.keys(masks).length ? masks : undefined;
}
