import type { ContentBlock } from "@mauth-studio/shared";

import {
  normalizeChoiceListLayout,
  normalizeChoiceNumberingStyle,
  normalizeColumnsBlock,
  normalizeTableBlock,
  plainTableRows,
} from "./contentBlockNormalization.ts";
import { inspectorSpaceLines, inspectorTableColumnCount } from "./moduleSettingsPatches.ts";

export type BasicBlockInspectorSelection =
  | {
      kind: "columns";
      columnCount: ReturnType<typeof normalizeColumnsBlock>["columnCount"];
    }
  | {
      kind: "choices";
      numberingStyle: ReturnType<typeof normalizeChoiceNumberingStyle>;
      layout: ReturnType<typeof normalizeChoiceListLayout>;
    }
  | {
      kind: "table";
      tableAlign: ReturnType<typeof normalizeTableBlock>["tableAlign"];
      cellAlignment: ReturnType<typeof normalizeTableBlock>["cellAlignment"];
      rowCount: number;
      columnCount: number;
    }
  | {
      kind: "space";
      lines: number;
      showLines: boolean;
    };

export function basicBlockInspectorSelection(block: ContentBlock): BasicBlockInspectorSelection | null {
  if (block.kind === "columns") {
    return {
      kind: "columns",
      columnCount: normalizeColumnsBlock(block).columnCount,
    };
  }
  if (block.kind === "choices") {
    return {
      kind: "choices",
      numberingStyle: normalizeChoiceNumberingStyle(block.numberingStyle),
      layout: normalizeChoiceListLayout(block.layout),
    };
  }
  if (block.kind === "table") {
    const table = normalizeTableBlock(block);
    const rows = plainTableRows(table);
    return {
      kind: "table",
      tableAlign: table.tableAlign,
      cellAlignment: table.cellAlignment,
      rowCount: rows.length,
      columnCount: inspectorTableColumnCount(rows),
    };
  }
  if (block.kind === "space") {
    return {
      kind: "space",
      lines: inspectorSpaceLines(block.lines),
      showLines: block.showLines !== false,
    };
  }
  return null;
}
