import type { ContentBlock, ContentBlockVisibility, GraphConfig } from "@mauth-studio/shared";

import { normalizeColumnCount, normalizeTableBlock, paddedTableRow, plainTablePatch, plainTableRows } from "./contentBlockNormalization.ts";
import { DEFAULT_3D_VIEW_STATE, graph3dViewState, type Graph3DViewState } from "./diagram3d.ts";
import { finiteGraphNumber, imageDiagramData } from "./diagramImage.ts";
import { DEFAULT_NETWORK_DATA, networkDataForSave, normalizedNetworkDiagramData } from "./diagramNetwork.ts";
import { penroseOptions, removePenroseSubstanceOverride } from "./diagramPenrose.ts";
import {
  DEFAULT_SET_DATA,
  DEFAULT_THREE_SET_DATA,
  normalizedSetDiagramData,
  setDiagramCountLabels,
  setDiagramNotationLabel,
  setDiagramRegionEditorLabels,
  setDiagramRegionNameAt,
  setDiagramSetTotalLabels,
} from "./diagramSet.ts";
import { defaultVector2DName, normalizedVector2DEntries, vector2dMetadata, type Vector2DLabelStyle } from "./diagramVector2d.ts";

export type InspectorColumnsBlock = Extract<ContentBlock, { kind: "columns" }>;
export type InspectorTableBlock = Extract<ContentBlock, { kind: "table" }>;

export const CONTENT_BLOCK_DISPLAY_OPTIONS: Array<{ value: ContentBlockVisibility; label: string }> = [
  { value: "always", label: "Both copies" },
  { value: "student", label: "Student only" },
  { value: "solution", label: "Solutions only" },
];

export const INSPECTOR_MIN_TABLE_ROWS = 1;
export const INSPECTOR_MAX_TABLE_ROWS = 24;
export const INSPECTOR_MIN_TABLE_COLUMNS = 1;
export const INSPECTOR_MAX_TABLE_COLUMNS = 12;

export function contentBlockDisplayVisibility(block: ContentBlock): ContentBlockVisibility {
  if (block.solutionOnly === true || (block.solutionOnly !== false && block.id.startsWith("solution-"))) return "solution";
  if (block.visibility === "solution") return "solution";
  if (block.visibility === "student" || block.studentOnly === true) return "student";
  return "always";
}

export function contentBlockVisibilityPatch(block: ContentBlock, visibility: ContentBlockVisibility): Partial<ContentBlock> {
  return {
    visibility,
    solutionOnly: visibility === "solution",
    studentOnly: visibility === "student",
    ...(visibility !== "solution" && block.markTicks !== undefined ? { markTicks: undefined } : {}),
  };
}

export function contentBlockMarkTicksPatch(value: unknown): Partial<ContentBlock> {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return { markTicks: undefined };
  return { markTicks: Math.min(20, Math.max(0, Math.round(parsed))) };
}

export function contentBlockSupportsSolutionSurfaceTicks(block: ContentBlock) {
  if (block.kind === "text" || block.kind === "space") return block.markTicks !== undefined;
  return true;
}

export function contentBlockSolutionTickLabel(block: ContentBlock) {
  if (block.kind === "text" || block.kind === "space") return "Block ticks";
  return "Surface ticks";
}

export function contentBlockSolutionTickHelp(block: ContentBlock) {
  if (block.kind === "text") {
    return "For worked text, put hidden ticks on the earning line with [[marks:1]].";
  }
  if (block.kind === "space") {
    return "Space blocks normally do not carry solution ticks; pair them with a solution text, table, or diagram block.";
  }
  return "Use this for answers completed directly on this solution surface, such as a table, diagram, graph, or circled choice.";
}

export function inspectorSetShadingOptions(config: GraphConfig): Array<{ label: string; regionIndex: number | null }> {
  const data = normalizedSetDiagramData(config);
  return [
    { label: "None", regionIndex: null },
    ...setDiagramRegionEditorLabels(data.setCount).map((label, index) => ({ label, regionIndex: index })),
  ];
}

export function columnsColumnCountPatch(
  block: InspectorColumnsBlock,
  value: unknown,
  createTextBlock: () => ContentBlock,
): Partial<InspectorColumnsBlock> {
  const normalized = {
    ...block,
    columnCount: normalizeColumnCount(block.columnCount),
    columns: block.columns.length
      ? block.columns
      : Array.from({ length: normalizeColumnCount(block.columnCount) }, () => [createTextBlock()]),
  };
  const columnCount = normalizeColumnCount(value);
  const columns = Array.from({ length: columnCount }, (_, index) => normalized.columns[index] ?? [createTextBlock()]);
  return { columnCount, columns };
}

export function clampedInspectorTableDimension(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function inspectorTableColumnCount(rows: string[][]) {
  return Math.max(1, ...rows.map((row) => row.length));
}

export function tableRowsCountPatch(block: InspectorTableBlock, value: number): Partial<InspectorTableBlock> {
  const table = normalizeTableBlock(block);
  const tableRows = plainTableRows(table);
  const columnCount = inspectorTableColumnCount(tableRows);
  const nextRowCount = clampedInspectorTableDimension(value, INSPECTOR_MIN_TABLE_ROWS, INSPECTOR_MAX_TABLE_ROWS);
  return plainTablePatch(
    Array.from({ length: nextRowCount }, (_, rowIndex) =>
      paddedTableRow(tableRows[rowIndex] ?? Array.from({ length: columnCount }, () => ""), columnCount),
    ),
  );
}

export function tableColumnCountPatch(block: InspectorTableBlock, value: number): Partial<InspectorTableBlock> {
  const table = normalizeTableBlock(block);
  const tableRows = plainTableRows(table);
  const nextColumnCount = clampedInspectorTableDimension(value, INSPECTOR_MIN_TABLE_COLUMNS, INSPECTOR_MAX_TABLE_COLUMNS);
  return plainTablePatch(tableRows.map((row) => paddedTableRow(row, nextColumnCount).slice(0, nextColumnCount)));
}

export function inspectorOptionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

export function inspectorNumberInputValue(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

export function inspectorSpaceLines(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.round(numberValue)) : 3;
}

export function penroseVariationId() {
  return `penrose-layout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function penroseScalePatch(config: GraphConfig, value: number): Partial<GraphConfig> {
  return {
    scalePercent: value,
    options: { ...penroseOptions(config), scalePercent: value },
    widthPx: undefined,
    heightPx: undefined,
  };
}

export function penroseResamplePatch(config: GraphConfig, variation = penroseVariationId()): Partial<GraphConfig> {
  return {
    options: { ...penroseOptions(config), variation },
    widthPx: undefined,
    heightPx: undefined,
  };
}

function networkStructuredPatch(config: GraphConfig, data: ReturnType<typeof normalizedNetworkDiagramData>): Partial<GraphConfig> {
  return {
    data: networkDataForSave(data),
    options: removePenroseSubstanceOverride(config),
    widthPx: undefined,
    heightPx: undefined,
  };
}

export function networkPresetPatch(config: GraphConfig): Partial<GraphConfig> {
  return networkStructuredPatch(config, {
    hidePoints: false,
    hidePointLabels: false,
    objects: DEFAULT_NETWORK_DATA.objects.map((object) => ({ ...object, label: object.name })),
    relationships: DEFAULT_NETWORK_DATA.relationships.map((relationship) => ({ ...relationship })),
  });
}

export function networkVisibilityPatch(
  config: GraphConfig,
  patch: Partial<Pick<ReturnType<typeof normalizedNetworkDiagramData>, "hidePoints" | "hidePointLabels">>,
): Partial<GraphConfig> {
  return networkStructuredPatch(config, { ...normalizedNetworkDiagramData(config), ...patch });
}

function setDiagramStructuredPatch(config: GraphConfig, data: ReturnType<typeof normalizedSetDiagramData>): Partial<GraphConfig> {
  return {
    data,
    options: removePenroseSubstanceOverride(config),
    widthPx: undefined,
    heightPx: undefined,
  };
}

export function setDiagramNotationPatch(config: GraphConfig): Partial<GraphConfig> {
  const data = normalizedSetDiagramData(config);
  return setDiagramStructuredPatch(config, {
    ...data,
    regions: data.regions.map((region, index) => ({
      ...region,
      label: setDiagramNotationLabel(setDiagramRegionNameAt(data.setCount, index, region.name), data.sets),
    })),
  });
}

export function setDiagramCountLabelsPatch(config: GraphConfig, includeTotals: boolean): Partial<GraphConfig> {
  const data = normalizedSetDiagramData(config);
  return setDiagramStructuredPatch(config, {
    ...data,
    universe: { ...data.universe, countLabel: includeTotals ? "30" : "" },
    sets: data.sets.map((set, index) => ({ ...set, countLabel: includeTotals ? setDiagramSetTotalLabels(data.setCount)[index] : "" })),
    regions: data.regions.map((region, index) => ({
      ...region,
      label: setDiagramCountLabels(data.setCount)[index] ?? "",
    })),
  });
}

export function setDiagramSetCountPatch(config: GraphConfig, setCount: 2 | 3): Partial<GraphConfig> {
  const data = normalizedSetDiagramData(config);
  const defaults = setCount === 3 ? DEFAULT_THREE_SET_DATA : DEFAULT_SET_DATA;
  return setDiagramStructuredPatch(config, {
    ...data,
    setCount,
    sets: defaults.sets.map((fallback, index) => ({
      ...fallback,
      ...(data.sets[index] ?? {}),
      countLabel: data.sets[index]?.countLabel ?? "",
    })),
    regions: defaults.regions.map((region) => ({ ...region, shaded: false })),
  });
}

export function setDiagramShadingPatch(config: GraphConfig, regionIndex: number | null): Partial<GraphConfig> {
  const data = normalizedSetDiagramData(config);
  return setDiagramStructuredPatch(config, {
    ...data,
    regions: data.regions.map((region, index) => ({ ...region, shaded: regionIndex === index })),
  });
}

export function imageDataPatch(config: GraphConfig, patch: Partial<ReturnType<typeof imageDiagramData>>): Partial<GraphConfig> {
  return {
    data: {
      ...imageDiagramData(config),
      ...patch,
    },
    functions: [],
    features: [],
  };
}

export function imageSizePatch(widthPx: unknown, heightPx: unknown) {
  return {
    widthPx: finiteGraphNumber(widthPx, 420),
    heightPx: finiteGraphNumber(heightPx, 260),
  };
}

export function graphInspectorWidthPatch(
  config: GraphConfig,
  value: string,
  lockedAspectHeight: (config: GraphConfig, widthPx: number) => number,
): Partial<GraphConfig> {
  const widthPx = inspectorOptionalNumber(value);
  if (typeof widthPx !== "number" || !Number.isFinite(widthPx)) return { widthPx };
  return config.lockAspectRatio && !config.equalScale ? { widthPx, heightPx: lockedAspectHeight(config, widthPx) } : { widthPx };
}

export function vector2dLabelStylePatch(config: GraphConfig, nextLabelStyle: Vector2DLabelStyle): Partial<GraphConfig> {
  const vectors = normalizedVector2DEntries(config);
  return {
    metadata: {
      ...(config.metadata ?? {}),
      vector2d: {
        ...vector2dMetadata(config),
        labelStyle: nextLabelStyle,
        vectors: vectors.map((vector, index) => {
          const autoNames = new Set([
            defaultVector2DName(index, "boldLower"),
            defaultVector2DName(index, "arrow"),
            defaultVector2DName(index, "custom"),
            `v_${index + 1}`,
          ]);
          return autoNames.has(vector.name) ? { ...vector, name: defaultVector2DName(index, nextLabelStyle) } : vector;
        }),
      },
    },
  };
}

export function graph3dViewPatch(config: GraphConfig, patch: Partial<Graph3DViewState>): Partial<GraphConfig> {
  return {
    metadata: {
      ...(config.metadata ?? {}),
      view3d: {
        ...graph3dViewState(config),
        ...patch,
      },
    },
  };
}

export function graph3dResetViewPatch(config: GraphConfig): Partial<GraphConfig> {
  return {
    metadata: { ...(config.metadata ?? {}), view3d: DEFAULT_3D_VIEW_STATE },
  };
}

export function isInspectorPenroseDiagramType(type?: string | null) {
  return type === "geometricConstruction" || type === "network" || type === "setDiagram";
}
