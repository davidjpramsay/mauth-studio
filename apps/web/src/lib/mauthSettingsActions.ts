import type {
  ChoiceListLayout,
  ChoiceNumberingStyle,
  ColumnCount,
  ContentBlock,
  DiagramAlignment,
  DiagramTextSide,
  Graph2DGeometryAngle,
  Graph2DGeometryArc,
  Graph2DGeometryDecoration,
  Graph2DGeometryPoint,
  Graph2DGeometrySegment,
  GraphConfig,
  TableCellAlignment,
} from "@mauth-studio/shared";
import {
  DEFAULT_STATS_CHART_SPEC,
  normalizeStatsChartSpec,
  type StatsChartData,
  type StatsChartOptions,
} from "@mauth-studio/diagram-plotly";

import {
  normalizeChoiceListLayout,
  normalizeChoiceNumberingStyle,
  normalizeColumnCount,
  normalizeDiagramAlignment,
  normalizeTableCellAlignment,
} from "./contentBlockNormalization.ts";
import { DEFAULT_3D_GRAPH, type Graph3DViewState } from "./diagram3d.ts";
import {
  geometry2dData,
  geometry2dListKeyForPrimitiveKind,
  geometry2dPrimitiveAt,
  geometry2dPrimitiveDisplayName,
  geometry2dPrimitiveIndexById,
  geometry2dPrimitiveTarget,
  normalizeGeometry2DPrimitiveKind,
  updateGeometry2DPrimitive,
  type Geometry2DPrimitive,
  type Geometry2DPrimitiveKind,
  type Geometry2DPrimitiveTarget,
} from "./diagramGeometry2d.ts";
import { DEFAULT_IMAGE_DIAGRAM } from "./diagramImage.ts";
import { DEFAULT_PENROSE_SCALE_PERCENT } from "./diagramPenrose.ts";
import { normalizedSetDiagramData } from "./diagramSet.ts";
import { DEFAULT_VECTOR_2D_GRAPH, vector2dLabelStyle, type Vector2DLabelStyle } from "./diagramVector2d.ts";
import {
  columnsColumnCountPatch,
  graph3dResetViewPatch,
  graph3dViewPatch,
  graphInspectorWidthPatch,
  imageDataPatch,
  imageSizePatch,
  inspectorOptionalNumber,
  inspectorSpaceLines,
  networkPresetPatch,
  networkVisibilityPatch,
  penroseResamplePatch,
  penroseScalePatch,
  setDiagramCountLabelsPatch,
  setDiagramNotationPatch,
  setDiagramSetCountPatch,
  setDiagramShadingPatch,
  tableColumnCountPatch,
  tableRowsCountPatch,
  vector2dLabelStylePatch,
  type InspectorColumnsBlock,
  type InspectorTableBlock,
} from "./moduleSettingsPatches.ts";

export const MAUTH_MODULE_SETTINGS_KINDS = ["space", "table", "columns", "choices", "diagram"] as const;
export const MAUTH_DIAGRAM_SETTINGS_RENDERERS = [
  "graph2d",
  "geometry2d",
  "vector2d",
  "graph3d",
  "statsChart",
  "geometricConstruction",
  "network",
  "setDiagram",
  "image",
] as const;
export const MAUTH_SET_DIAGRAM_SHADING_KEYS = [
  "none",
  "onlyA",
  "intersection",
  "onlyB",
  "outside",
  "onlyC",
  "onlyAB",
  "onlyAC",
  "onlyBC",
] as const;
export const MAUTH_SET_DIAGRAM_LABEL_PRESETS = ["notation", "counts", "countsWithTotals"] as const;

type ModuleSettingsKind = (typeof MAUTH_MODULE_SETTINGS_KINDS)[number];
type DiagramSettingsRenderer = (typeof MAUTH_DIAGRAM_SETTINGS_RENDERERS)[number];
export type MauthSetDiagramShading = (typeof MAUTH_SET_DIAGRAM_SHADING_KEYS)[number] | number | null;
export type MauthSetDiagramLabelPreset = (typeof MAUTH_SET_DIAGRAM_LABEL_PRESETS)[number];

export type MauthModuleSettingsUpdate =
  | { kind: "space"; lines?: number; showLines?: boolean }
  | {
      kind: "table";
      rows?: number;
      columns?: number;
      tableAlign?: DiagramAlignment;
      cellAlignment?: TableCellAlignment;
      showHeader?: boolean;
    }
  | { kind: "columns"; columnCount: ColumnCount }
  | { kind: "choices"; numberingStyle?: ChoiceNumberingStyle; layout?: ChoiceListLayout }
  | { kind: "diagram"; diagramAlign?: DiagramAlignment; diagramTextSide?: DiagramTextSide };

export type MauthDiagramSettingsUpdate =
  | (Graph2DSettingsUpdate & { renderer: "graph2d" })
  | (Geometry2DSettingsUpdate & { renderer: "geometry2d" })
  | (Vector2DSettingsUpdate & { renderer: "vector2d" })
  | (Graph3DSettingsUpdate & { renderer: "graph3d" })
  | (StatsChartSettingsUpdate & { renderer: "statsChart" })
  | (PenroseSettingsUpdate & { renderer: "geometricConstruction" })
  | (PenroseSettingsUpdate & NetworkSettingsUpdate & { renderer: "network" })
  | (PenroseSettingsUpdate & SetDiagramSettingsUpdate & { renderer: "setDiagram" })
  | (ImageSettingsUpdate & { renderer: "image" });

interface SettingsSuccess {
  ok: true;
  block: ContentBlock;
  targetLabel?: string;
}

interface SettingsFailure {
  ok: false;
  error: string;
}

export type MauthSettingsActionApplyResult = SettingsSuccess | SettingsFailure;

type GraphPatch = Partial<GraphConfig>;

interface DiagramSettingsPatchSuccess {
  ok: true;
  patch: GraphPatch;
  targetLabel?: string;
}

interface SizedSettingsUpdate {
  widthPx?: number;
  heightPx?: number;
}

interface Bounded2DSettingsUpdate extends SizedSettingsUpdate {
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  showAxes?: boolean;
  showGrid?: boolean;
  showMajorGrid?: boolean;
  showAxisLabels?: boolean;
  showAxisNumbers?: boolean;
  equalScale?: boolean;
}

interface Graph2DSettingsUpdate extends Bounded2DSettingsUpdate {
  showArrows?: boolean;
  showFunctionArrows?: boolean;
  lockAspectRatio?: boolean;
  gridMajorStep?: number;
  gridMinorStep?: number;
  gridMajorStepX?: number;
  gridMajorStepY?: number;
  gridMinorStepX?: number;
  gridMinorStepY?: number;
}

interface Geometry2DPrimitiveSettingsUpdate extends Record<string, unknown> {
  kind?: Geometry2DPrimitiveKind | string;
  index?: number;
  id?: string;
  patch?: Record<string, unknown>;
}

interface Geometry2DSettingsUpdate extends Graph2DSettingsUpdate {
  primitive?: Geometry2DPrimitiveSettingsUpdate;
  geometryPrimitive?: Geometry2DPrimitiveSettingsUpdate;
}

interface Vector2DSettingsUpdate extends Bounded2DSettingsUpdate {
  showArrows?: boolean;
  labelStyle?: Vector2DLabelStyle;
}

interface Graph3DSettingsUpdate extends SizedSettingsUpdate {
  view?: Partial<Graph3DViewState>;
  resetView?: boolean;
}

interface StatsChartSettingsUpdate extends SizedSettingsUpdate {
  chartType?: StatsChartData["chartType"];
  showGrid?: boolean;
  showFill?: boolean;
  fillColor?: string;
  fillOpacity?: number;
}

interface PenroseSettingsUpdate {
  scalePercent?: number;
  original?: boolean;
  resample?: boolean;
  variation?: string;
}

interface NetworkSettingsUpdate {
  preset?: boolean;
  showNodeDots?: boolean;
  showNodeLabels?: boolean;
}

interface SetDiagramSettingsUpdate {
  setCount?: 2 | 3;
  labels?: MauthSetDiagramLabelPreset;
  shading?: MauthSetDiagramShading;
}

interface ImageSettingsUpdate extends SizedSettingsUpdate {
  name?: string;
  alt?: string;
}

function settingsFailure(error: string): SettingsFailure {
  return { ok: false, error };
}

function blockKindError(expected: ModuleSettingsKind, actual: ContentBlock["kind"]) {
  return `module.settings.update expected a ${expected} module, but target module is ${actual}.`;
}

function collectBlockIds(blocks: readonly ContentBlock[], ids = new Set<string>()) {
  for (const block of blocks) {
    ids.add(block.id);
    if (block.kind === "columns") block.columns.forEach((column) => collectBlockIds(column, ids));
  }
  return ids;
}

function deterministicColumnTextFactory(block: InspectorColumnsBlock) {
  const usedIds = collectBlockIds(block.columns.flat());
  let nextIndex = block.columns.length ? block.columns.length + 1 : 1;
  return (): ContentBlock => {
    const base = `${block.id}-column-${nextIndex++}-text`;
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${base}-${suffix++}`;
    }
    usedIds.add(id);
    return { id, kind: "text", text: "" };
  };
}

function mergePatch(config: GraphConfig, patch: GraphPatch) {
  return { ...config, ...patch };
}

function applyPatchAccumulator(config: GraphConfig, patch: GraphPatch, patches: GraphPatch[]) {
  patches.push(patch);
  return mergePatch(config, patch);
}

function compactGraphPatch(patches: readonly GraphPatch[]): GraphPatch {
  return Object.assign({}, ...patches);
}

function setIfDefined<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined) {
  if (value !== undefined) target[key] = value;
}

function finitePositiveNumber(value: unknown, fallback?: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function graph2dLockedAspectHeight(config: GraphConfig, nextWidth: number) {
  const currentWidth = finitePositiveNumber(config.widthPx, 680) ?? 680;
  const currentHeight = finitePositiveNumber(config.heightPx, 300) ?? 300;
  return Math.max(1, Math.round(nextWidth * (currentHeight / currentWidth)));
}

function graph2dSettingsPatch(config: GraphConfig, settings: Graph2DSettingsUpdate): GraphPatch {
  const patch: GraphPatch = {};
  setIfDefined(patch, "xMin", settings.xMin);
  setIfDefined(patch, "xMax", settings.xMax);
  setIfDefined(patch, "yMin", settings.yMin);
  setIfDefined(patch, "yMax", settings.yMax);
  setIfDefined(patch, "showAxes", settings.showAxes);
  setIfDefined(patch, "showGrid", settings.showGrid);
  setIfDefined(patch, "showAxisLabels", settings.showAxisLabels);
  setIfDefined(patch, "showAxisNumbers", settings.showAxisNumbers);
  setIfDefined(patch, "showArrows", settings.showArrows);
  setIfDefined(patch, "showFunctionArrows", settings.showFunctionArrows);
  if (settings.gridMajorStep !== undefined) {
    patch.gridMajorStep = settings.gridMajorStep;
    patch.axisLabelStepX = settings.gridMajorStep;
    patch.axisLabelStepY = settings.gridMajorStep;
  }
  setIfDefined(patch, "gridMinorStep", settings.gridMinorStep);
  if (settings.gridMajorStepX !== undefined) {
    patch.gridMajorStepX = settings.gridMajorStepX;
    patch.axisLabelStepX = settings.gridMajorStepX;
  }
  if (settings.gridMajorStepY !== undefined) {
    patch.gridMajorStepY = settings.gridMajorStepY;
    patch.axisLabelStepY = settings.gridMajorStepY;
  }
  setIfDefined(patch, "gridMinorStepX", settings.gridMinorStepX);
  setIfDefined(patch, "gridMinorStepY", settings.gridMinorStepY);
  if (settings.widthPx !== undefined) {
    Object.assign(patch, graphInspectorWidthPatch(config, String(settings.widthPx), graph2dLockedAspectHeight));
  }
  setIfDefined(patch, "heightPx", settings.heightPx);
  if (settings.lockAspectRatio !== undefined) {
    patch.lockAspectRatio = settings.lockAspectRatio;
    if (settings.lockAspectRatio) patch.equalScale = false;
  }
  if (settings.equalScale !== undefined) {
    patch.equalScale = settings.equalScale;
    if (settings.equalScale) patch.lockAspectRatio = false;
  }
  if (settings.showMajorGrid !== undefined) {
    patch.showMajorGrid = settings.showMajorGrid;
    if (settings.showMajorGrid) patch.showGrid = true;
  }
  return patch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function geometry2dPrimitiveSettings(settings: Geometry2DSettingsUpdate) {
  return isRecord(settings.primitive) ? settings.primitive : isRecord(settings.geometryPrimitive) ? settings.geometryPrimitive : null;
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function stringPatchValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberPatchValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanPatchValue(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function stringArrayPatchValue(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value] : undefined;
}

function setPatchValue<T extends object, K extends keyof T>(target: Partial<T>, key: K, value: T[K] | undefined) {
  if (value !== undefined) target[key] = value;
}

function geometry2dPrimitivePatchRecord(source: Geometry2DPrimitiveSettingsUpdate, idUsedAsTarget: boolean): Record<string, unknown> {
  if (isRecord(source.patch)) return source.patch;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "kind" || key === "index" || key === "patch") continue;
    if (key === "id" && idUsedAsTarget) continue;
    patch[key] = value;
  }
  return patch;
}

function geometry2dPointPatch(record: Record<string, unknown>): Partial<Graph2DGeometryPoint> {
  const patch: Partial<Graph2DGeometryPoint> = {};
  setPatchValue(patch, "id", stringPatchValue(record.id));
  setPatchValue(patch, "x", numberPatchValue(record.x));
  setPatchValue(patch, "y", numberPatchValue(record.y));
  setPatchValue(patch, "label", stringPatchValue(record.label));
  setPatchValue(patch, "labelX", numberPatchValue(record.labelX));
  setPatchValue(patch, "labelY", numberPatchValue(record.labelY));
  setPatchValue(patch, "color", stringPatchValue(record.color));
  setPatchValue(patch, "show", booleanPatchValue(record.show));
  return patch;
}

function geometry2dSegmentPatch(record: Record<string, unknown>): Partial<Graph2DGeometrySegment> {
  const patch: Partial<Graph2DGeometrySegment> = {};
  setPatchValue(patch, "id", stringPatchValue(record.id));
  setPatchValue(patch, "from", stringPatchValue(record.from));
  setPatchValue(patch, "to", stringPatchValue(record.to));
  setPatchValue(patch, "label", stringPatchValue(record.label));
  setPatchValue(patch, "labelX", numberPatchValue(record.labelX));
  setPatchValue(patch, "labelY", numberPatchValue(record.labelY));
  setPatchValue(patch, "color", stringPatchValue(record.color));
  setPatchValue(patch, "strokeWidth", numberPatchValue(record.strokeWidth));
  if (record.strokeStyle === "solid" || record.strokeStyle === "dashed") patch.strokeStyle = record.strokeStyle;
  setPatchValue(patch, "show", booleanPatchValue(record.show));
  return patch;
}

function geometry2dArcPatch(record: Record<string, unknown>): Partial<Graph2DGeometryArc> {
  const patch: Partial<Graph2DGeometryArc> = {};
  setPatchValue(patch, "id", stringPatchValue(record.id));
  setPatchValue(patch, "center", stringPatchValue(record.center));
  setPatchValue(patch, "from", stringPatchValue(record.from));
  setPatchValue(patch, "to", stringPatchValue(record.to));
  setPatchValue(patch, "label", stringPatchValue(record.label));
  setPatchValue(patch, "labelX", numberPatchValue(record.labelX));
  setPatchValue(patch, "labelY", numberPatchValue(record.labelY));
  setPatchValue(patch, "color", stringPatchValue(record.color));
  setPatchValue(patch, "strokeWidth", numberPatchValue(record.strokeWidth));
  if (record.strokeStyle === "solid" || record.strokeStyle === "dashed") patch.strokeStyle = record.strokeStyle;
  setPatchValue(patch, "show", booleanPatchValue(record.show));
  return patch;
}

function geometry2dAnglePatch(record: Record<string, unknown>): Partial<Graph2DGeometryAngle> {
  const patch: Partial<Graph2DGeometryAngle> = {};
  const points = stringArrayPatchValue(record.points);
  setPatchValue(patch, "id", stringPatchValue(record.id));
  if (points?.length === 3) patch.points = [points[0] ?? "", points[1] ?? "", points[2] ?? ""];
  setPatchValue(patch, "label", stringPatchValue(record.label));
  setPatchValue(patch, "labelX", numberPatchValue(record.labelX));
  setPatchValue(patch, "labelY", numberPatchValue(record.labelY));
  setPatchValue(patch, "radius", numberPatchValue(record.radius));
  setPatchValue(patch, "arcCount", numberPatchValue(record.arcCount));
  setPatchValue(patch, "color", stringPatchValue(record.color));
  setPatchValue(patch, "strokeWidth", numberPatchValue(record.strokeWidth));
  if (record.strokeStyle === "solid" || record.strokeStyle === "dashed") patch.strokeStyle = record.strokeStyle;
  setPatchValue(patch, "show", booleanPatchValue(record.show));
  return patch;
}

function geometry2dDecorationPatch(record: Record<string, unknown>): Partial<Graph2DGeometryDecoration> {
  const patch: Partial<Graph2DGeometryDecoration> = {};
  if (record.kind === "equalLength" || record.kind === "equalAngle" || record.kind === "rightAngle") patch.kind = record.kind;
  setPatchValue(patch, "id", stringPatchValue(record.id));
  setPatchValue(patch, "segments", stringArrayPatchValue(record.segments));
  setPatchValue(patch, "angles", stringArrayPatchValue(record.angles));
  setPatchValue(patch, "angle", stringPatchValue(record.angle));
  setPatchValue(patch, "tickCount", numberPatchValue(record.tickCount));
  setPatchValue(patch, "arcCount", numberPatchValue(record.arcCount));
  setPatchValue(patch, "radius", numberPatchValue(record.radius));
  setPatchValue(patch, "size", numberPatchValue(record.size));
  setPatchValue(patch, "color", stringPatchValue(record.color));
  setPatchValue(patch, "show", booleanPatchValue(record.show));
  return patch;
}

function geometry2dPrimitivePatch(kind: Geometry2DPrimitiveKind, record: Record<string, unknown>): Partial<Geometry2DPrimitive> {
  if (kind === "point") return geometry2dPointPatch(record);
  if (kind === "segment") return geometry2dSegmentPatch(record);
  if (kind === "arc") return geometry2dArcPatch(record);
  if (kind === "angle") return geometry2dAnglePatch(record);
  return geometry2dDecorationPatch(record);
}

function geometry2dPrimitiveTargetFromSettings(
  config: GraphConfig,
  source: Geometry2DPrimitiveSettingsUpdate,
): { ok: true; target: Geometry2DPrimitiveTarget; idUsedAsTarget: boolean } | SettingsFailure {
  const kind = normalizeGeometry2DPrimitiveKind(source.kind);
  if (!kind) return settingsFailure("geometry2d primitive settings must include kind: point, segment, arc, angle, or decoration.");

  const data = geometry2dData(config);
  const directIndex = nonNegativeInteger(source.index);
  const idValue = typeof source.id === "string" && source.id.trim() ? source.id.trim() : "";
  const index = directIndex ?? (idValue ? geometry2dPrimitiveIndexById(data, kind, idValue) : undefined);
  const idUsedAsTarget = directIndex === undefined && Boolean(idValue);
  if (index === undefined || index < 0) {
    const listKey = geometry2dListKeyForPrimitiveKind(kind);
    return settingsFailure(`geometry2d primitive settings could not find the requested ${kind} in ${listKey}.`);
  }
  const target = geometry2dPrimitiveTarget(kind, index);
  if (!target || !geometry2dPrimitiveAt(data, target)) {
    const listKey = geometry2dListKeyForPrimitiveKind(kind);
    return settingsFailure(`geometry2d primitive settings index ${index} is outside ${listKey}.`);
  }
  return { ok: true, target, idUsedAsTarget };
}

function geometry2dSettingsPatch(config: GraphConfig, settings: Geometry2DSettingsUpdate): DiagramSettingsPatchSuccess | SettingsFailure {
  const patch = graph2dSettingsPatch(config, settings);
  const primitiveSettings = geometry2dPrimitiveSettings(settings);
  if (!primitiveSettings) return { ok: true, patch };

  const targetResult = geometry2dPrimitiveTargetFromSettings(config, primitiveSettings);
  if (!targetResult.ok) return targetResult;

  const patchRecord = geometry2dPrimitivePatchRecord(primitiveSettings, targetResult.idUsedAsTarget);
  const primitivePatch = geometry2dPrimitivePatch(targetResult.target.kind, patchRecord);
  if (Object.keys(primitivePatch).length) {
    patch.data = updateGeometry2DPrimitive(geometry2dData(config), targetResult.target, primitivePatch);
  }
  return {
    ok: true,
    patch,
    targetLabel: geometry2dPrimitiveDisplayName(geometry2dData(mergePatch(config, patch)), targetResult.target),
  };
}

function vector2dSettingsPatch(config: GraphConfig, settings: Vector2DSettingsUpdate): GraphPatch {
  const patch: GraphPatch = {};
  setIfDefined(patch, "xMin", settings.xMin ?? (settings.xMin === undefined ? undefined : DEFAULT_VECTOR_2D_GRAPH.xMin));
  setIfDefined(patch, "xMax", settings.xMax ?? (settings.xMax === undefined ? undefined : DEFAULT_VECTOR_2D_GRAPH.xMax));
  setIfDefined(patch, "yMin", settings.yMin ?? (settings.yMin === undefined ? undefined : DEFAULT_VECTOR_2D_GRAPH.yMin));
  setIfDefined(patch, "yMax", settings.yMax ?? (settings.yMax === undefined ? undefined : DEFAULT_VECTOR_2D_GRAPH.yMax));
  setIfDefined(patch, "widthPx", settings.widthPx ?? (settings.widthPx === undefined ? undefined : DEFAULT_VECTOR_2D_GRAPH.widthPx));
  setIfDefined(patch, "heightPx", settings.heightPx ?? (settings.heightPx === undefined ? undefined : DEFAULT_VECTOR_2D_GRAPH.heightPx));
  setIfDefined(patch, "showAxes", settings.showAxes);
  setIfDefined(patch, "showGrid", settings.showGrid);
  setIfDefined(patch, "showArrows", settings.showArrows);
  setIfDefined(patch, "showAxisLabels", settings.showAxisLabels);
  setIfDefined(patch, "showAxisNumbers", settings.showAxisNumbers);
  setIfDefined(patch, "showMajorGrid", settings.showMajorGrid);
  setIfDefined(patch, "equalScale", settings.equalScale);
  if (settings.showAxes === false) patch.showArrows = false;
  if (settings.showGrid !== undefined) patch.showMajorGrid = settings.showGrid;
  if (settings.labelStyle !== undefined) Object.assign(patch, vector2dLabelStylePatch(config, vector2dLabelStyle(settings.labelStyle)));
  return patch;
}

function graph3dSettingsPatch(config: GraphConfig, settings: Graph3DSettingsUpdate): GraphPatch {
  const patches: GraphPatch[] = [];
  const sizePatch: GraphPatch = {};
  setIfDefined(sizePatch, "widthPx", settings.widthPx ?? (settings.widthPx === undefined ? undefined : DEFAULT_3D_GRAPH.widthPx));
  setIfDefined(sizePatch, "heightPx", settings.heightPx ?? (settings.heightPx === undefined ? undefined : DEFAULT_3D_GRAPH.heightPx));
  if (Object.keys(sizePatch).length) patches.push(sizePatch);
  if (settings.resetView) patches.push(graph3dResetViewPatch(config));
  if (settings.view) {
    patches.push(graph3dViewPatch(config, settings.view));
  }
  return compactGraphPatch(patches);
}

function statsChartSettingsPatch(config: GraphConfig, settings: StatsChartSettingsUpdate): GraphPatch {
  const spec = normalizeStatsChartSpec(config);
  const dataPatch: Partial<StatsChartData> = {};
  const optionsPatch: Partial<StatsChartOptions> = {};
  setIfDefined(dataPatch, "chartType", settings.chartType);
  setIfDefined(
    optionsPatch,
    "widthPx",
    settings.widthPx ?? (settings.widthPx === undefined ? undefined : DEFAULT_STATS_CHART_SPEC.options?.widthPx),
  );
  setIfDefined(
    optionsPatch,
    "heightPx",
    settings.heightPx ?? (settings.heightPx === undefined ? undefined : DEFAULT_STATS_CHART_SPEC.options?.heightPx),
  );
  setIfDefined(optionsPatch, "showGrid", settings.showGrid);
  setIfDefined(optionsPatch, "showFill", settings.showFill);
  if (settings.fillColor !== undefined) {
    optionsPatch.fillColor = settings.fillColor;
    optionsPatch.showFill = true;
  }
  if (settings.fillOpacity !== undefined) {
    optionsPatch.fillOpacity = Math.min(1, Math.max(0, settings.fillOpacity));
    optionsPatch.showFill = true;
  }
  const nextOptions = { ...spec.options, ...optionsPatch };
  return {
    data: { ...spec.data, ...dataPatch },
    options: nextOptions,
    widthPx: nextOptions.widthPx,
    heightPx: nextOptions.heightPx,
  };
}

function penroseSettingsPatch(config: GraphConfig, settings: PenroseSettingsUpdate): GraphPatch {
  const patches: GraphPatch[] = [];
  let nextConfig = config;
  if (settings.original) {
    nextConfig = applyPatchAccumulator(nextConfig, penroseScalePatch(nextConfig, DEFAULT_PENROSE_SCALE_PERCENT), patches);
  } else if (settings.scalePercent !== undefined) {
    nextConfig = applyPatchAccumulator(nextConfig, penroseScalePatch(nextConfig, settings.scalePercent), patches);
  }
  if (settings.resample) {
    applyPatchAccumulator(nextConfig, penroseResamplePatch(nextConfig, settings.variation), patches);
  }
  return compactGraphPatch(patches);
}

function networkSettingsPatch(config: GraphConfig, settings: PenroseSettingsUpdate & NetworkSettingsUpdate): GraphPatch {
  const penrosePatch = penroseSettingsPatch(config, settings);
  const patches: GraphPatch[] = [penrosePatch];
  let nextConfig = mergePatch(config, penrosePatch);
  if (settings.preset) nextConfig = applyPatchAccumulator(nextConfig, networkPresetPatch(nextConfig), patches);
  if (settings.showNodeDots !== undefined || settings.showNodeLabels !== undefined) {
    const visibilityPatch: Parameters<typeof networkVisibilityPatch>[1] = {};
    if (settings.showNodeDots !== undefined) visibilityPatch.hidePoints = !settings.showNodeDots;
    if (settings.showNodeLabels !== undefined) visibilityPatch.hidePointLabels = !settings.showNodeLabels;
    applyPatchAccumulator(nextConfig, networkVisibilityPatch(nextConfig, visibilityPatch), patches);
  }
  return compactGraphPatch(patches);
}

function setDiagramRegionIndex(config: GraphConfig, shading: MauthSetDiagramShading) {
  if (shading === null || shading === "none") return null;
  const data = normalizedSetDiagramData(config);
  const maxIndex = Math.max(0, data.regions.length - 1);
  if (typeof shading === "number") return Math.max(0, Math.min(maxIndex, Math.round(shading)));
  const index = data.regions.findIndex((region) => region.name === shading);
  if (index >= 0) return index;
  if (shading === "onlyA") return 0;
  if (shading === "intersection") return data.setCount === 3 ? 6 : 1;
  if (shading === "onlyB") return 2;
  return maxIndex;
}

function setDiagramSettingsPatch(config: GraphConfig, settings: PenroseSettingsUpdate & SetDiagramSettingsUpdate): GraphPatch {
  const penrosePatch = penroseSettingsPatch(config, settings);
  const patches: GraphPatch[] = [penrosePatch];
  let nextConfig = mergePatch(config, penrosePatch);
  if (settings.setCount === 2 || settings.setCount === 3)
    nextConfig = applyPatchAccumulator(nextConfig, setDiagramSetCountPatch(nextConfig, settings.setCount), patches);
  if (settings.labels === "notation") nextConfig = applyPatchAccumulator(nextConfig, setDiagramNotationPatch(nextConfig), patches);
  if (settings.labels === "counts") nextConfig = applyPatchAccumulator(nextConfig, setDiagramCountLabelsPatch(nextConfig, false), patches);
  if (settings.labels === "countsWithTotals")
    nextConfig = applyPatchAccumulator(nextConfig, setDiagramCountLabelsPatch(nextConfig, true), patches);
  if (settings.shading !== undefined) {
    applyPatchAccumulator(nextConfig, setDiagramShadingPatch(nextConfig, setDiagramRegionIndex(nextConfig, settings.shading)), patches);
  }
  return compactGraphPatch(patches);
}

function imageSettingsPatch(config: GraphConfig, settings: ImageSettingsUpdate): GraphPatch {
  const patches: GraphPatch[] = [];
  if (settings.name !== undefined || settings.alt !== undefined) {
    const dataPatch: Parameters<typeof imageDataPatch>[1] = {};
    if (settings.name !== undefined) dataPatch.name = settings.name;
    if (settings.alt !== undefined) dataPatch.alt = settings.alt;
    patches.push(imageDataPatch(config, dataPatch));
  }
  if (settings.widthPx !== undefined || settings.heightPx !== undefined) {
    patches.push(
      imageSizePatch(
        settings.widthPx ?? config.widthPx ?? DEFAULT_IMAGE_DIAGRAM.widthPx,
        settings.heightPx ?? config.heightPx ?? DEFAULT_IMAGE_DIAGRAM.heightPx,
      ),
    );
  }
  return compactGraphPatch(patches);
}

function diagramSettingsPatch(config: GraphConfig, settings: MauthDiagramSettingsUpdate): GraphPatch {
  if (settings.renderer === "graph2d") return graph2dSettingsPatch(config, settings);
  if (settings.renderer === "geometry2d") return graph2dSettingsPatch(config, settings);
  if (settings.renderer === "vector2d") return vector2dSettingsPatch(config, settings);
  if (settings.renderer === "graph3d") return graph3dSettingsPatch(config, settings);
  if (settings.renderer === "statsChart") return statsChartSettingsPatch(config, settings);
  if (settings.renderer === "geometricConstruction") return penroseSettingsPatch(config, settings);
  if (settings.renderer === "network") return networkSettingsPatch(config, settings);
  if (settings.renderer === "setDiagram") return setDiagramSettingsPatch(config, settings);
  return imageSettingsPatch(config, settings);
}

export function applyModuleSettingsUpdate(block: ContentBlock, settings: MauthModuleSettingsUpdate): MauthSettingsActionApplyResult {
  if (settings.kind === "space") {
    if (block.kind !== "space") return settingsFailure(blockKindError(settings.kind, block.kind));
    return {
      ok: true,
      block: {
        ...block,
        ...(settings.lines !== undefined ? { lines: inspectorSpaceLines(settings.lines) } : {}),
        ...(settings.showLines !== undefined ? { showLines: settings.showLines } : {}),
      },
    };
  }

  if (settings.kind === "table") {
    if (block.kind !== "table") return settingsFailure(blockKindError(settings.kind, block.kind));
    let nextBlock: InspectorTableBlock = block;
    if (settings.rows !== undefined) nextBlock = { ...nextBlock, ...tableRowsCountPatch(nextBlock, settings.rows) };
    if (settings.columns !== undefined) nextBlock = { ...nextBlock, ...tableColumnCountPatch(nextBlock, settings.columns) };
    return {
      ok: true,
      block: {
        ...nextBlock,
        ...(settings.tableAlign !== undefined ? { tableAlign: normalizeDiagramAlignment(settings.tableAlign) } : {}),
        ...(settings.cellAlignment !== undefined ? { cellAlignment: normalizeTableCellAlignment(settings.cellAlignment) } : {}),
        ...(settings.showHeader !== undefined ? { showHeader: settings.showHeader } : {}),
      },
    };
  }

  if (settings.kind === "columns") {
    if (block.kind !== "columns") return settingsFailure(blockKindError(settings.kind, block.kind));
    return {
      ok: true,
      block: {
        ...block,
        ...columnsColumnCountPatch(block, normalizeColumnCount(settings.columnCount), deterministicColumnTextFactory(block)),
      },
    };
  }

  if (settings.kind === "choices") {
    if (block.kind !== "choices") return settingsFailure(blockKindError(settings.kind, block.kind));
    return {
      ok: true,
      block: {
        ...block,
        ...(settings.numberingStyle !== undefined ? { numberingStyle: normalizeChoiceNumberingStyle(settings.numberingStyle) } : {}),
        ...(settings.layout !== undefined ? { layout: normalizeChoiceListLayout(settings.layout) } : {}),
      },
    };
  }

  if (block.kind !== "diagram") return settingsFailure(blockKindError(settings.kind, block.kind));
  return {
    ok: true,
    block: {
      ...block,
      ...(settings.diagramAlign !== undefined ? { diagramAlign: normalizeDiagramAlignment(settings.diagramAlign) } : {}),
      ...(settings.diagramTextSide !== undefined ? { diagramTextSide: settings.diagramTextSide } : {}),
    },
  };
}

export function applyDiagramSettingsUpdate(block: ContentBlock, settings: MauthDiagramSettingsUpdate): MauthSettingsActionApplyResult {
  if (block.kind !== "diagram") return settingsFailure("diagram.settings.update target module is not a diagram.");
  if (!MAUTH_DIAGRAM_SETTINGS_RENDERERS.includes(block.graphConfig.type as DiagramSettingsRenderer)) {
    return settingsFailure(`diagram.settings.update does not support renderer ${block.graphConfig.type}.`);
  }
  if (block.graphConfig.type !== settings.renderer) {
    return settingsFailure(
      `diagram.settings.update expected a ${settings.renderer} diagram, but target diagram renderer is ${block.graphConfig.type}.`,
    );
  }
  const patchResult =
    settings.renderer === "geometry2d"
      ? geometry2dSettingsPatch(block.graphConfig, settings)
      : ({ ok: true, patch: diagramSettingsPatch(block.graphConfig, settings) } satisfies DiagramSettingsPatchSuccess);
  if (!patchResult.ok) return patchResult;
  return {
    ok: true,
    ...(patchResult.targetLabel ? { targetLabel: patchResult.targetLabel } : {}),
    block: {
      ...block,
      graphConfig: mergePatch(block.graphConfig, patchResult.patch),
    },
  };
}

export function isSupportedModuleSettingsKind(value: unknown): value is ModuleSettingsKind {
  return typeof value === "string" && MAUTH_MODULE_SETTINGS_KINDS.includes(value as ModuleSettingsKind);
}

export function isSupportedDiagramSettingsRenderer(value: unknown): value is DiagramSettingsRenderer {
  return typeof value === "string" && MAUTH_DIAGRAM_SETTINGS_RENDERERS.includes(value as DiagramSettingsRenderer);
}

export function settingsNumberInputValue(value: unknown) {
  return inspectorOptionalNumber(String(value ?? ""));
}
