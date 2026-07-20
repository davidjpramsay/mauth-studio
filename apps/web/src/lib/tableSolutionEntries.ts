import type { ContentBlock, ContentBlockVisibility } from "@mauth-studio/shared";

import { normalizeTableBlock, plainTableRows } from "./contentBlockNormalization.ts";
import { solutionBlockVisibility, visibilityReplacementSlotAt } from "./solutionBlockVisibility.ts";

type TableBlock = Extract<ContentBlock, { kind: "table" }>;

export type TableSolutionEntryMask = boolean[][];
export type TableSolutionEntryMasks = Record<string, TableSolutionEntryMask>;

function tableSolutionCellValue(value: unknown) {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

export function normalizeTableSolutionEntries(value: unknown, rows: string[][]) {
  const entries = Array.isArray(value) ? value : [];
  return rows.map((row, rowIndex) => {
    const entryRow = Array.isArray(entries[rowIndex]) ? entries[rowIndex] : [];
    return row.map((cell, columnIndex) => (cell.trim() ? "" : tableSolutionCellValue(entryRow[columnIndex])));
  });
}

export function tableBlockSolutionEntries(block: TableBlock) {
  const table = normalizeTableBlock(block);
  return normalizeTableSolutionEntries(block.solutionEntries, table.rows);
}

export function tableSolutionEntryCount(block: TableBlock) {
  return tableBlockSolutionEntries(block).reduce(
    (count, row) => count + row.reduce((rowCount, cell) => rowCount + (cell.trim() ? 1 : 0), 0),
    0,
  );
}

export function tableBlockHasSharedSolutionEntries(block: ContentBlock): block is TableBlock {
  return block.kind === "table" && solutionBlockVisibility(block) === "always" && tableSolutionEntryCount(block) > 0;
}

export function tableSharedSolutionEntryFields(
  value: unknown,
  rows: string[][],
  visibility: ContentBlockVisibility | undefined,
): Partial<Pick<TableBlock, "solutionEntries">> {
  if (visibility === "student" || visibility === "solution") return {};
  const solutionEntries = normalizeTableSolutionEntries(value, rows);
  return solutionEntries.some((row) => row.some((cell) => cell.trim())) ? { solutionEntries } : {};
}

export function tableSolutionEntryPatch(block: TableBlock, rowIndex: number, columnIndex: number, value: string | null) {
  const table = normalizeTableBlock(block);
  const solutionEntries = normalizeTableSolutionEntries(block.solutionEntries, table.rows);
  if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return {};
  if (!solutionEntries[rowIndex] || solutionEntries[rowIndex]?.[columnIndex] === undefined) return {};
  if (table.rows[rowIndex]?.[columnIndex]?.trim()) return {};

  solutionEntries[rowIndex][columnIndex] = value ?? "";
  const hasEntries = solutionEntries.some((row) => row.some((cell) => cell.trim()));
  return {
    solutionEntries: hasEntries ? solutionEntries : undefined,
    ...(!hasEntries && block.markTicks !== undefined ? { markTicks: undefined } : {}),
  } satisfies Partial<TableBlock>;
}

export function sharedTableSolutionPresentation(block: TableBlock, showSolutions: boolean) {
  const table = normalizeTableBlock(block);
  const solutionEntries = tableBlockSolutionEntries(table);
  const showSharedEntries = showSolutions && solutionBlockVisibility(block) === "always";
  const bodyRows = table.rows.map((row, rowIndex) =>
    row.map((cell, columnIndex) => {
      const solutionEntry = solutionEntries[rowIndex]?.[columnIndex] ?? "";
      return showSharedEntries && !cell.trim() && solutionEntry.trim() ? solutionEntry : cell;
    }),
  );
  const bodyMask = table.rows.map((row, rowIndex) =>
    row.map((cell, columnIndex) => showSharedEntries && !cell.trim() && Boolean(solutionEntries[rowIndex]?.[columnIndex]?.trim())),
  );
  return {
    table,
    rows: table.showHeader ? [table.headers, ...bodyRows] : bodyRows,
    solutionEntryMask: table.showHeader ? [table.headers.map(() => false), ...bodyMask] : bodyMask,
  };
}

export function sharedTableHasBlankAnswerCells(block: TableBlock) {
  const table = normalizeTableBlock(block);
  const solutionEntries = tableBlockSolutionEntries(table);
  return table.rows.some((row, rowIndex) =>
    row.some((cell, columnIndex) => !cell.trim() && !(solutionEntries[rowIndex]?.[columnIndex] ?? "").trim()),
  );
}

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
