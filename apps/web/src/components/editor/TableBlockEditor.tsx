import type { ReactNode } from "react";
import type { ContentBlock, DiagramAlignment, TableCellAlignment } from "@mauth-studio/shared";

import {
  normalizeTableBlock,
  paddedTableRow,
  plainTablePatch,
  plainTableRows,
  type NormalizedTableBlock,
} from "@/lib/contentBlockNormalization";
import { cn } from "@/lib/utils";
import { CollapsiblePanel, RemoveActionButton } from "./EditorPanels";

type TableBlock = Extract<ContentBlock, { kind: "table" }>;

interface TableBlockEditorProps {
  label: string;
  title: ReactNode;
  block: TableBlock;
  diagramAlignments: Array<{ value: DiagramAlignment; label: string }>;
  cellAlignments: Array<{ value: TableCellAlignment; label: string }>;
  settingsMode?: "inline" | "inspector";
  dragHandle?: ReactNode;
  muted?: boolean;
  active?: boolean;
  openSignal?: number;
  onChange: (patch: Partial<TableBlock>) => void;
  onRemove: () => void;
}

const MIN_TABLE_ROWS = 1;
const MAX_TABLE_ROWS = 24;
const MIN_TABLE_COLUMNS = 1;
const MAX_TABLE_COLUMNS = 12;

function clampedTableDimension(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function tableEditorContentLength(value: string) {
  const readableSource = value
    .replace(/\\[a-zA-Z]+/g, "mm")
    .replace(/[{}_$^]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(readableSource).length;
}

function tableEditorColumnWidthCh(table: NormalizedTableBlock, columnIndex: number) {
  const values = plainTableRows(table).map((row) => row[columnIndex] ?? "");
  const longestValue = Math.max(1, ...values.map(tableEditorContentLength));
  return Math.min(42, Math.max(6, longestValue + 3));
}

export function TableBlockEditor({
  label,
  title,
  block,
  diagramAlignments,
  cellAlignments,
  settingsMode = "inline",
  dragHandle,
  muted = false,
  active = false,
  openSignal,
  onChange,
  onRemove,
}: TableBlockEditorProps) {
  const table = normalizeTableBlock(block);
  const tableRows = plainTableRows(table);
  const columnCount = Math.max(1, ...tableRows.map((row) => row.length));
  const columnWidths = Array.from({ length: columnCount }, (_, columnIndex) => tableEditorColumnWidthCh(table, columnIndex));
  const patchTable = (patch: Partial<TableBlock>) => onChange({ ...patch });
  const updateRows = (rows: string[][]) => patchTable(plainTablePatch(rows));
  const updateCell = (rowIndex: number, columnIndex: number, value: string) =>
    updateRows(
      tableRows.map((row, currentRowIndex) =>
        currentRowIndex === rowIndex ? row.map((cell, currentColumnIndex) => (currentColumnIndex === columnIndex ? value : cell)) : row,
      ),
    );
  const showInlineSettings = settingsMode === "inline";
  const resizeColumns = (nextColumnCountValue: number) => {
    const nextColumnCount = clampedTableDimension(nextColumnCountValue, MIN_TABLE_COLUMNS, MAX_TABLE_COLUMNS);
    updateRows(tableRows.map((row) => paddedTableRow(row, nextColumnCount).slice(0, nextColumnCount)));
  };
  const resizeRows = (nextRowCountValue: number) => {
    const nextRowCount = clampedTableDimension(nextRowCountValue, MIN_TABLE_ROWS, MAX_TABLE_ROWS);
    updateRows(
      Array.from({ length: nextRowCount }, (_, rowIndex) =>
        paddedTableRow(tableRows[rowIndex] ?? Array.from({ length: columnCount }, () => ""), columnCount),
      ),
    );
  };

  return (
    <CollapsiblePanel
      title={title}
      leading={dragHandle}
      actions={<RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />}
      className={cn("bg-background", muted && "bg-muted/30")}
      bodyClassName="p-3"
      active={active}
      openSignal={openSignal}
    >
      <div className="flex flex-col gap-4">
        {showInlineSettings ? (
          <div className="table-editor-controls">
            <label className="flex flex-col gap-2 text-xs font-medium">
              Position
              <select
                value={table.tableAlign}
                onChange={(event) => patchTable({ tableAlign: event.target.value as DiagramAlignment })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              >
                {diagramAlignments.map((alignment) => (
                  <option key={alignment.value} value={alignment.value}>
                    {alignment.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Cell text
              <select
                value={table.cellAlignment}
                onChange={(event) => patchTable({ cellAlignment: event.target.value as TableCellAlignment })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              >
                {cellAlignments.map((alignment) => (
                  <option key={alignment.value} value={alignment.value}>
                    {alignment.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Rows
              <input
                type="number"
                min={MIN_TABLE_ROWS}
                max={MAX_TABLE_ROWS}
                value={tableRows.length}
                onChange={(event) => resizeRows(event.currentTarget.valueAsNumber)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Columns
              <input
                type="number"
                min={MIN_TABLE_COLUMNS}
                max={MAX_TABLE_COLUMNS}
                value={columnCount}
                onChange={(event) => resizeColumns(event.currentTarget.valueAsNumber)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              />
            </label>
          </div>
        ) : null}

        <div className="rounded-md border bg-muted/20 p-2">
          <div tabIndex={0} aria-label="Table editor cells" className="table-editor-scroll">
            <table className="table-editor-table">
              <colgroup>
                {columnWidths.map((width, columnIndex) => (
                  <col key={`column-width-${columnIndex}`} style={{ width: `${width}ch` }} />
                ))}
              </colgroup>
              <tbody>
                {tableRows.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    {row.map((cell, columnIndex) => (
                      <td key={`cell-${rowIndex}-${columnIndex}`}>
                        <input
                          aria-label={`Table cell row ${rowIndex + 1} column ${columnIndex + 1}`}
                          value={cell}
                          onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}
                          className="table-editor-input"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </CollapsiblePanel>
  );
}
