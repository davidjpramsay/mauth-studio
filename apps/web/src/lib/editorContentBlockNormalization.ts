import type { ContentBlock, ContentBlockVisibility, DiagramTextSide, GraphConfig } from "@mauth-studio/shared";

import {
  normalizeChoiceItems,
  normalizeChoiceListLayout,
  normalizeChoiceNumberingStyle,
  normalizeColumnCount,
  normalizeDiagramAlignment,
  normalizeTableCellAlignment,
  normalizeTableCells,
  normalizeTableRows,
  normalizedTableColumnCount,
  paddedTableRow,
} from "./contentBlockNormalization.ts";
import { contentBlockVisibilityFields } from "./editorContentBlocks.ts";
import { choiceSolutionAnswerFields } from "./choiceSolutionAnswers.ts";
import { diagramConfigHasSolutionAnnotations } from "./solutionDiagramCompleteness.ts";
import { normalizeContentBlockVisibility } from "./solutionBlockVisibility.ts";
import { tableSharedSolutionEntryFields } from "./tableSolutionEntries.ts";

export interface EditorContentBlockNormalizerOptions {
  id: (prefix: string) => string;
  defaultGraphConfig: GraphConfig;
  withGraphDefaults: (graphConfig?: GraphConfig | null) => GraphConfig;
  normalizeDiagramTextSide?: (value: unknown) => DiagramTextSide;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function spaceLines(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, numberValue) : 3;
}

function spaceShowsLines(value: unknown) {
  return value !== false;
}

export function normalizeDiagramTextSideValue(value: unknown): DiagramTextSide {
  return value === "left" || value === "right" ? value : "none";
}

export function normalizedBlockVisibility(record: Record<string, unknown>, blockId: string): ContentBlockVisibility | undefined {
  const explicitVisibility = normalizeContentBlockVisibility(record.visibility);
  if (explicitVisibility) return explicitVisibility;
  if (record.studentOnly === true) return "student";
  if (record.solutionOnly === true || blockId.startsWith("solution-")) return "solution";
  return undefined;
}

export function surfaceMarkTickFields(record: Record<string, unknown>, visibility?: ContentBlockVisibility, sharedSolutionSurface = false) {
  if (visibility !== "solution" && !sharedSolutionSurface) return {};
  const markTicks = Number(record.markTicks);
  if (!Number.isInteger(markTicks) || markTicks < 0 || markTicks > 20) return {};
  return { markTicks };
}

export function createEditorContentBlockNormalizer({
  id,
  defaultGraphConfig,
  withGraphDefaults,
  normalizeDiagramTextSide = normalizeDiagramTextSideValue,
}: EditorContentBlockNormalizerOptions) {
  function normalizeContentBlocks(value: unknown): ContentBlock[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((block): ContentBlock[] => {
      const record = asRecord(block);
      if (!record) return [];
      const blockId = typeof record.id === "string" ? record.id : id("block");
      const visibility = normalizedBlockVisibility(record, blockId);

      if (record.kind === "text") {
        return [
          {
            id: blockId,
            kind: "text",
            text: typeof record.text === "string" ? record.text : "",
            ...contentBlockVisibilityFields(visibility),
          },
        ];
      }

      if (record.kind === "choices") {
        const choices = normalizeChoiceItems(record.choices);
        const solutionAnswerFields = choiceSolutionAnswerFields(record.solutionAnswerIndex, visibility, choices.length);
        return [
          {
            id: blockId,
            kind: "choices",
            choices,
            numberingStyle: normalizeChoiceNumberingStyle(record.numberingStyle),
            layout: normalizeChoiceListLayout(record.layout),
            ...contentBlockVisibilityFields(visibility),
            ...solutionAnswerFields,
            ...surfaceMarkTickFields(record, visibility, solutionAnswerFields.solutionAnswerIndex !== undefined),
          },
        ];
      }

      if (record.kind === "table") {
        const headers = normalizeTableCells(record.headers);
        const rows = normalizeTableRows(record.rows, Math.max(2, headers.length || 0));
        const columnCount = normalizedTableColumnCount(headers, rows);
        const normalizedRows = rows.map((row) => paddedTableRow(row, columnCount));
        const solutionEntryFields = tableSharedSolutionEntryFields(record.solutionEntries, normalizedRows, visibility);
        return [
          {
            id: blockId,
            kind: "table",
            headers: paddedTableRow(headers, columnCount),
            rows: normalizedRows,
            ...solutionEntryFields,
            showHeader: record.showHeader !== false,
            tableAlign: normalizeDiagramAlignment(record.tableAlign),
            cellAlignment: normalizeTableCellAlignment(record.cellAlignment),
            ...contentBlockVisibilityFields(visibility),
            ...surfaceMarkTickFields(record, visibility, solutionEntryFields.solutionEntries !== undefined),
          },
        ];
      }

      if (record.kind === "diagram") {
        const graphConfig = asRecord(record.graphConfig) ? (record.graphConfig as GraphConfig) : defaultGraphConfig;
        const normalizedGraphConfig = withGraphDefaults(graphConfig);
        return [
          {
            id: blockId,
            kind: "diagram",
            diagramAlign: normalizeDiagramAlignment(record.diagramAlign),
            diagramTextSide: normalizeDiagramTextSide(record.diagramTextSide),
            graphConfig: normalizedGraphConfig,
            ...contentBlockVisibilityFields(visibility),
            ...surfaceMarkTickFields(
              record,
              visibility,
              visibility !== "student" && diagramConfigHasSolutionAnnotations(normalizedGraphConfig),
            ),
          },
        ];
      }

      if (record.kind === "columns") {
        const columnCount = normalizeColumnCount(record.columnCount ?? (Array.isArray(record.columns) ? record.columns.length : 2));
        const rawColumns = Array.isArray(record.columns) ? record.columns : [];
        return [
          {
            id: blockId,
            kind: "columns",
            columnCount,
            columns: Array.from({ length: columnCount }, (_, index) => normalizeContentBlocks(rawColumns[index])),
            ...contentBlockVisibilityFields(visibility),
          },
        ];
      }

      if (record.kind === "space") {
        return [
          {
            id: blockId,
            kind: "space",
            lines: spaceLines(record.lines),
            showLines: spaceShowsLines(record.showLines),
            ...contentBlockVisibilityFields(visibility),
          },
        ];
      }

      if (record.kind === "pageBreak") {
        return [{ id: blockId, kind: "pageBreak" }];
      }

      return [];
    });
  }

  return { normalizeContentBlocks };
}
