import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import { normalizeColumnCount, normalizeTableBlock, paddedTableRow, plainTablePatch, plainTableRows } from "./contentBlockNormalization.ts";
import { DEFAULT_3D_VIEW_STATE, graph3dViewState, type Graph3DViewState } from "./diagram3d.ts";
import { finiteGraphNumber, imageDiagramData } from "./diagramImage.ts";
import { DEFAULT_NETWORK_DATA, networkDataForSave, normalizedNetworkDiagramData } from "./diagramNetwork.ts";
import { penroseOptions, removePenroseSubstanceOverride } from "./diagramPenrose.ts";
import { normalizedSetDiagramData } from "./diagramSet.ts";
import { defaultVector2DName, normalizedVector2DEntries, vector2dMetadata, type Vector2DLabelStyle } from "./diagramVector2d.ts";

export type InspectorColumnsBlock = Extract<ContentBlock, { kind: "columns" }>;
export type InspectorTableBlock = Extract<ContentBlock, { kind: "table" }>;

export const INSPECTOR_MIN_TABLE_ROWS = 1;
export const INSPECTOR_MAX_TABLE_ROWS = 24;
export const INSPECTOR_MIN_TABLE_COLUMNS = 1;
export const INSPECTOR_MAX_TABLE_COLUMNS = 12;
export const INSPECTOR_SET_REGION_COUNT_LABELS = ["8", "10", "6", "6"] as const;
export const INSPECTOR_SET_SHADING_OPTIONS: Array<{ label: string; regionIndex: number | null }> = [
  { label: "None", regionIndex: null },
  { label: "A only", regionIndex: 0 },
  { label: "A and B", regionIndex: 1 },
  { label: "B only", regionIndex: 2 },
  { label: "Outside", regionIndex: 3 },
];

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
  const [leftSet, rightSet] = data.sets;
  return setDiagramStructuredPatch(config, {
    ...data,
    regions: data.regions.map((region, index) => ({
      ...region,
      label:
        index === 0
          ? `${leftSet.name} \\cap ${rightSet.name}'`
          : index === 1
            ? `${leftSet.name} \\cap ${rightSet.name}`
            : index === 2
              ? `${leftSet.name}' \\cap ${rightSet.name}`
              : `(${leftSet.name} \\cup ${rightSet.name})'`,
    })),
  });
}

export function setDiagramCountLabelsPatch(config: GraphConfig, includeTotals: boolean): Partial<GraphConfig> {
  const data = normalizedSetDiagramData(config);
  return setDiagramStructuredPatch(config, {
    ...data,
    universe: { ...data.universe, countLabel: includeTotals ? "30" : "" },
    sets: data.sets.map((set, index) => ({ ...set, countLabel: includeTotals ? (index === 0 ? "18" : "16") : "" })),
    regions: data.regions.map((region, index) => ({
      ...region,
      label: INSPECTOR_SET_REGION_COUNT_LABELS[index] ?? "",
    })),
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
