import type { ChoiceListLayout, ChoiceNumberingStyle, ContentBlock, DiagramAlignment, TableCellAlignment } from "@mauth-studio/shared";

type EditorContentBlock = ContentBlock;

export function normalizeDiagramAlignment(value: unknown): DiagramAlignment {
  return value === "left" || value === "right" || value === "center" ? value : "center";
}

export function normalizeChoiceNumberingStyle(value: unknown): ChoiceNumberingStyle {
  return value === "upper-alpha" || value === "lower-alpha" || value === "decimal" || value === "bullet" || value === "roman"
    ? value
    : "roman";
}

export function normalizeChoiceListLayout(value: unknown): ChoiceListLayout {
  return value === "two-column" || value === "inline" || value === "vertical" ? value : "vertical";
}

export function normalizeChoiceItems(value: unknown): string[] {
  if (!Array.isArray(value)) return ["", "", ""];
  const choices = value.map((choice) => (typeof choice === "string" ? choice : String(choice ?? "")));
  return choices.length ? choices : [""];
}

export function normalizeTableCellAlignment(value: unknown): TableCellAlignment {
  return value === "left" || value === "right" || value === "center" ? value : "center";
}

export function normalizeTableCells(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((cell) => (typeof cell === "string" ? cell : String(cell ?? "")));
}

export function normalizedTableColumnCount(headers: string[], rows: string[][]) {
  return Math.max(1, headers.length, ...rows.map((row) => row.length));
}

export function paddedTableRow(row: string[], columnCount: number) {
  return Array.from({ length: columnCount }, (_, index) => row[index] ?? "");
}

export function normalizeTableRows(value: unknown, fallbackColumnCount = 2): string[][] {
  if (!Array.isArray(value)) return [Array.from({ length: fallbackColumnCount }, () => "")];
  const rows = value.filter((row): row is unknown[] => Array.isArray(row)).map((row) => normalizeTableCells(row));
  return rows.length ? rows : [Array.from({ length: fallbackColumnCount }, () => "")];
}

export function normalizeTableBlock(block: Extract<EditorContentBlock, { kind: "table" }>) {
  const headers = normalizeTableCells(block.headers);
  const rows = normalizeTableRows(block.rows, Math.max(2, headers.length || 0));
  const columnCount = normalizedTableColumnCount(headers, rows);
  return {
    ...block,
    headers: paddedTableRow(headers, columnCount),
    rows: rows.map((row) => paddedTableRow(row, columnCount)),
    showHeader: block.showHeader !== false,
    tableAlign: normalizeDiagramAlignment(block.tableAlign),
    cellAlignment: normalizeTableCellAlignment(block.cellAlignment),
  };
}

export type NormalizedTableBlock = ReturnType<typeof normalizeTableBlock>;

export function plainTableRows(table: NormalizedTableBlock) {
  return table.showHeader ? [table.headers, ...table.rows] : table.rows;
}

export function plainTablePatch(rows: string[][]): Partial<Extract<EditorContentBlock, { kind: "table" }>> {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  return {
    headers: Array.from({ length: columnCount }, () => ""),
    rows: rows.map((row) => paddedTableRow(row, columnCount)),
    showHeader: false,
  };
}
