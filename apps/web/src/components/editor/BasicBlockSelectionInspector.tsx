import type { ChoiceListLayout, ChoiceNumberingStyle, ContentBlock, DiagramAlignment, TableCellAlignment } from "@mauth-studio/shared";

import type { BasicBlockInspectorSelection } from "../../lib/basicBlockInspectorSelection";
import type { SelectedEditorBlock } from "../../lib/editorBlockSelection";
import {
  INSPECTOR_MAX_TABLE_COLUMNS,
  INSPECTOR_MAX_TABLE_ROWS,
  INSPECTOR_MIN_TABLE_COLUMNS,
  INSPECTOR_MIN_TABLE_ROWS,
  columnsColumnCountPatch,
  inspectorSpaceLines,
  tableColumnCountPatch,
  tableRowsCountPatch,
  type InspectorColumnsBlock,
  type InspectorTableBlock,
} from "../../lib/moduleSettingsPatches";
import {
  CHOICE_LIST_LAYOUTS,
  CHOICE_NUMBERING_STYLES,
  COLUMN_COUNT_OPTIONS,
  DIAGRAM_ALIGNMENTS,
  TABLE_CELL_ALIGNMENTS,
} from "./editorOptions";

interface BasicBlockSelectionInspectorProps {
  selectedBlock: SelectedEditorBlock;
  selection: BasicBlockInspectorSelection;
  controlClassName: string;
  createTextBlock: () => ContentBlock;
  onBlockChange: (selection: SelectedEditorBlock, patch: Partial<ContentBlock>) => void;
}

export function BasicBlockSelectionInspector({
  selectedBlock,
  selection,
  controlClassName,
  createTextBlock,
  onBlockChange,
}: BasicBlockSelectionInspectorProps) {
  if (selection.kind === "columns") {
    return (
      <div className="space-y-3 p-3">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Layout
          <select
            value={selection.columnCount}
            aria-label={`${selectedBlock.label} layout`}
            onChange={(event) =>
              onBlockChange(
                selectedBlock,
                columnsColumnCountPatch(selectedBlock.block as InspectorColumnsBlock, event.target.value, createTextBlock),
              )
            }
            className={controlClassName}
          >
            {COLUMN_COUNT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  if (selection.kind === "choices") {
    return (
      <div className="space-y-3 p-3">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Labels
          <select
            value={selection.numberingStyle}
            aria-label={`${selectedBlock.label} labels`}
            onChange={(event) => onBlockChange(selectedBlock, { numberingStyle: event.target.value as ChoiceNumberingStyle })}
            className={controlClassName}
          >
            {CHOICE_NUMBERING_STYLES.map((style) => (
              <option key={style.value} value={style.value}>
                {style.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Layout
          <select
            value={selection.layout}
            aria-label={`${selectedBlock.label} layout`}
            onChange={(event) => onBlockChange(selectedBlock, { layout: event.target.value as ChoiceListLayout })}
            className={controlClassName}
          >
            {CHOICE_LIST_LAYOUTS.map((layout) => (
              <option key={layout.value} value={layout.value}>
                {layout.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  if (selection.kind === "table") {
    return (
      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 2xl:grid-cols-1">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Position
          <select
            value={selection.tableAlign}
            aria-label={`${selectedBlock.label} position`}
            onChange={(event) => onBlockChange(selectedBlock, { tableAlign: event.target.value as DiagramAlignment })}
            className={controlClassName}
          >
            {DIAGRAM_ALIGNMENTS.map((alignment) => (
              <option key={alignment.value} value={alignment.value}>
                {alignment.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Cell text
          <select
            value={selection.cellAlignment}
            aria-label={`${selectedBlock.label} cell text`}
            onChange={(event) => onBlockChange(selectedBlock, { cellAlignment: event.target.value as TableCellAlignment })}
            className={controlClassName}
          >
            {TABLE_CELL_ALIGNMENTS.map((alignment) => (
              <option key={alignment.value} value={alignment.value}>
                {alignment.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Rows
          <input
            type="number"
            min={INSPECTOR_MIN_TABLE_ROWS}
            max={INSPECTOR_MAX_TABLE_ROWS}
            value={selection.rowCount}
            aria-label={`${selectedBlock.label} rows`}
            onChange={(event) =>
              onBlockChange(
                selectedBlock,
                tableRowsCountPatch(selectedBlock.block as InspectorTableBlock, event.currentTarget.valueAsNumber),
              )
            }
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Columns
          <input
            type="number"
            min={INSPECTOR_MIN_TABLE_COLUMNS}
            max={INSPECTOR_MAX_TABLE_COLUMNS}
            value={selection.columnCount}
            aria-label={`${selectedBlock.label} columns`}
            onChange={(event) =>
              onBlockChange(
                selectedBlock,
                tableColumnCountPatch(selectedBlock.block as InspectorTableBlock, event.currentTarget.valueAsNumber),
              )
            }
            className={controlClassName}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
        Lines
        <input
          type="number"
          min={0}
          step={1}
          value={selection.lines}
          aria-label={`${selectedBlock.label} lines`}
          onChange={(event) => onBlockChange(selectedBlock, { lines: inspectorSpaceLines(event.currentTarget.valueAsNumber) })}
          className={controlClassName}
        />
      </label>
      <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <input
          type="checkbox"
          checked={selection.showLines}
          aria-label={`${selectedBlock.label} show ruled lines`}
          onChange={(event) => onBlockChange(selectedBlock, { showLines: event.currentTarget.checked })}
          className="size-4 rounded border-input"
        />
        Show ruled lines
      </label>
    </div>
  );
}
