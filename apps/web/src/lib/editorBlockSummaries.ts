import type { ChoiceNumberingStyle, GraphConfig } from "@mauth-studio/shared";
import { statsChartSummary } from "@mauth-studio/diagram-plotly";

import {
  normalizeChoiceItems,
  normalizeChoiceNumberingStyle,
  normalizeColumnsBlock,
  normalizeTableBlock,
  plainTableRows,
} from "./contentBlockNormalization.ts";
import { geometry2dSummary } from "./diagramGeometry2d.ts";
import { imageDiagramData, imageDiagramName } from "./diagramImage.ts";
import { normalizedSetDiagramData } from "./diagramSet.ts";
import { normalizedVector2DEntries } from "./diagramVector2d.ts";
import type { TocItemKind } from "./documentNavigation.ts";
import { spaceLines } from "./editorContentBlockNormalization.ts";
import type { EditorContentBlock } from "./editorDocumentNormalization.ts";

interface LabelledOption<T extends string = string> {
  value: T;
  label: string;
}

interface EditorBlockSummaryRuntimeOptions {
  withGraphDefaults: (graphConfig?: GraphConfig | null) => GraphConfig;
  normalizeDiagramType: (type?: string | null) => string;
  diagramTypes: Array<LabelledOption<string>>;
  choiceNumberingStyles: Array<LabelledOption<ChoiceNumberingStyle>>;
}

export function textBlockSummary(text: string) {
  return text.trim().replace(/\s+/g, " ") || "Empty text block";
}

export function spaceBlockSummary(lines: number) {
  const normalizedLines = spaceLines(lines);
  return `${normalizedLines} line${normalizedLines === 1 ? "" : "s"}`;
}

export function tableBlockSummary(block: Extract<EditorContentBlock, { kind: "table" }>) {
  const table = normalizeTableBlock(block);
  const rows = plainTableRows(table);
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const columnLabel = `${columnCount} column${columnCount === 1 ? "" : "s"}`;
  const rowLabel = `${rows.length} row${rows.length === 1 ? "" : "s"}`;
  return `${rowLabel}, ${columnLabel}`;
}

export function columnsBlockSummary(block: Extract<EditorContentBlock, { kind: "columns" }>) {
  const columns = normalizeColumnsBlock(block);
  const moduleCount = columns.columns.reduce((sum, column) => sum + column.length, 0);
  return `${columns.columnCount} columns, ${moduleCount} module${moduleCount === 1 ? "" : "s"}`;
}

export function tocBlockLabel(block: EditorContentBlock, blockIndex: number) {
  const itemNumber = blockIndex + 1;
  if (block.kind === "text") return `Text ${itemNumber}`;
  if (block.kind === "choices") return `Choices ${itemNumber}`;
  if (block.kind === "table") return `Table ${itemNumber}`;
  if (block.kind === "diagram") return `Diagram ${itemNumber}`;
  if (block.kind === "columns") return `Columns ${itemNumber}`;
  if (block.kind === "space") return `Space ${itemNumber}`;
  return `Block ${itemNumber}`;
}

export function tocBlockKind(block: EditorContentBlock): TocItemKind {
  if (block.kind === "choices") return "choices";
  if (block.kind === "table") return "table";
  if (block.kind === "diagram") return "diagram";
  if (block.kind === "columns") return "columns";
  if (block.kind === "space") return "space";
  return "text";
}

export function createEditorBlockSummaryRuntime({
  withGraphDefaults,
  normalizeDiagramType,
  diagramTypes,
  choiceNumberingStyles,
}: EditorBlockSummaryRuntimeOptions) {
  function choiceListSummary(block: Extract<EditorContentBlock, { kind: "choices" }>) {
    const choices = normalizeChoiceItems(block.choices).filter((choice) => choice.trim());
    const style =
      choiceNumberingStyles.find((item) => item.value === normalizeChoiceNumberingStyle(block.numberingStyle))?.label ?? "Choices";
    return `${choices.length || 0} ${style.toLowerCase()} choice${choices.length === 1 ? "" : "s"}`;
  }

  function diagramTypeLabel(type?: string | null) {
    const normalizedType = normalizeDiagramType(type);
    return diagramTypes.find((diagramType) => diagramType.value === normalizedType)?.label ?? "Diagram";
  }

  function diagramConfigSummary(graphConfig: GraphConfig) {
    const config = withGraphDefaults(graphConfig);
    if (config.type === "image") return imageDiagramData(config).src ? imageDiagramName(config) : "No image selected";
    if (config.type === "statsChart") return statsChartSummary(config);
    if (config.type === "geometry2d") return geometry2dSummary(config);
    if (config.type === "graph2d") {
      const visibleFunctions = (config.functions ?? []).filter((graphFunction) => graphFunction.show !== false).length;
      const visibleFeatures = (config.features ?? []).filter((feature) => feature.show !== false).length;
      if (!visibleFunctions && !visibleFeatures) return "Blank coordinate grid";
      const functionLabel = `${visibleFunctions} function${visibleFunctions === 1 ? "" : "s"}`;
      return visibleFeatures ? `${functionLabel}, ${visibleFeatures} feature${visibleFeatures === 1 ? "" : "s"}` : functionLabel;
    }
    if (config.type === "vector2d") {
      const vectorCount = normalizedVector2DEntries(config).length;
      return `${vectorCount} coordinate vector${vectorCount === 1 ? "" : "s"}`;
    }
    if (config.type === "graph3d") return "3D axes and saved camera view";
    if (config.type === "network") return "Schematic network";
    if (config.type === "setDiagram") {
      const setCount = normalizedSetDiagramData(config).setCount;
      return setCount === 3 ? "Three-set Venn" : "Two-set Venn";
    }
    if (config.type === "geometricConstruction") return "Penrose construction";
    return diagramTypeLabel(config.type);
  }

  function diagramBlockSummary(block: Extract<EditorContentBlock, { kind: "diagram" }>) {
    return diagramConfigSummary(block.graphConfig);
  }

  function tocBlockSummary(block: EditorContentBlock) {
    if (block.kind === "text") return textBlockSummary(block.text ?? "");
    if (block.kind === "choices") return choiceListSummary(block);
    if (block.kind === "table") return tableBlockSummary(block);
    if (block.kind === "diagram") return diagramBlockSummary(block);
    if (block.kind === "columns") return columnsBlockSummary(block);
    if (block.kind === "space") return spaceBlockSummary(block.lines);
    return "";
  }

  return {
    choiceListSummary,
    diagramBlockSummary,
    diagramConfigSummary,
    tocBlockSummary,
  };
}
