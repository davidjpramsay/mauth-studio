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
  Graph3DDimensionData,
  Graph3DFaceData,
  Graph3DPointData,
  Graph3DSegmentData,
  Graph3DSolidData,
  GraphConfig,
  GraphFunction,
  ImageDiagramAnnotation,
  TableCellAlignment,
} from "@mauth-studio/shared";
import {
  DEFAULT_STATS_CHART_SPEC,
  normalizeStatsChartSpec,
  type StatsChartData,
  type StatsChartOptions,
  type StatsChartSeriesData,
} from "@mauth-studio/diagram-plotly";

import {
  normalizeChoiceListLayout,
  normalizeChoiceNumberingStyle,
  normalizeColumnCount,
  normalizeDiagramAlignment,
  normalizeTableBlock,
  normalizeTableCellAlignment,
} from "./contentBlockNormalization.ts";
import { normalizeChoiceSolutionAnswerIndex, withChoiceSolutionAnswer } from "./choiceSolutionAnswers.ts";
import { DEFAULT_3D_GRAPH, type Graph3DViewState } from "./diagram3d.ts";
import { graphFunctionAt, graphFunctionIndexById, graphFunctionsFromConfig, updateGraphFunction } from "./diagramGraph2d.ts";
import {
  graph3dElementAt,
  graph3dDataWithRenamedPoint,
  graph3dElementDisplayName,
  graph3dElementIndexById,
  graph3dElementTarget,
  normalizeGraph3DElementKind,
  updateGraph3DElement,
  type Graph3DElement,
  type Graph3DElementKind,
  type Graph3DElementTarget,
} from "./diagramGraph3d.ts";
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
import { DEFAULT_IMAGE_DIAGRAM, imageAnnotationAt, imageAnnotationIndexById, updateImageAnnotation } from "./diagramImage.ts";
import { DEFAULT_PENROSE_SCALE_PERCENT } from "./diagramPenrose.ts";
import {
  penroseElementIndex,
  updatePenroseElement,
  type PenroseSolutionElementKind,
  type PenroseSolutionElementTarget,
} from "./diagramPenroseSolution.ts";
import { normalizedSetDiagramData } from "./diagramSet.ts";
import {
  normalizeStatsChartSeriesType,
  statsChartSeriesAt,
  statsChartSeriesDisplayName,
  statsChartSeriesIndexById,
  statsChartSeriesTarget,
  updateStatsChartSeries,
  type StatsChartSeriesTarget,
} from "./diagramStatsChart.ts";
import {
  DEFAULT_VECTOR_2D_GRAPH,
  normalizeVector2DElementKind,
  updateVector2DElement,
  vector2dElementAt,
  vector2dElementDisplayName,
  vector2dElementIndexById,
  vector2dElementTarget,
  vector2dLabelStyle,
  type Vector2DAngleMarkerEntry,
  type Vector2DControlEntry,
  type Vector2DElement,
  type Vector2DElementKind,
  type Vector2DElementTarget,
  type Vector2DLabelStyle,
  type Vector2DSegmentLabelEntry,
} from "./diagramVector2d.ts";
import {
  columnsColumnCountPatch,
  contentBlockDisplayVisibility,
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
import { tableSolutionEntryPatch } from "./tableSolutionEntries.ts";

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
      solutionEntry?: {
        row: number;
        column: number;
        value: string | null;
      };
    }
  | { kind: "columns"; columnCount: ColumnCount }
  | {
      kind: "choices";
      numberingStyle?: ChoiceNumberingStyle;
      layout?: ChoiceListLayout;
      solutionAnswerIndex?: number | null;
    }
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

interface Graph2DBaseSettingsUpdate extends Bounded2DSettingsUpdate {
  showArrows?: boolean;
  showXAxisMinArrow?: boolean;
  showXAxisMaxArrow?: boolean;
  showYAxisMinArrow?: boolean;
  showYAxisMaxArrow?: boolean;
  showFunctionArrows?: boolean;
  lockAspectRatio?: boolean;
  gridMajorStep?: number;
  gridMinorStep?: number;
  gridMajorStepX?: number;
  gridMajorStepY?: number;
  gridMinorStepX?: number;
  gridMinorStepY?: number;
}

interface Graph2DFunctionSettingsUpdate extends Record<string, unknown> {
  index?: number;
  id?: string;
  patch?: Record<string, unknown>;
}

interface Graph2DSettingsUpdate extends Graph2DBaseSettingsUpdate {
  function?: Graph2DFunctionSettingsUpdate;
}

interface Geometry2DPrimitiveSettingsUpdate extends Record<string, unknown> {
  kind?: Geometry2DPrimitiveKind | string;
  index?: number;
  id?: string;
  patch?: Record<string, unknown>;
}

interface Geometry2DSettingsUpdate extends Graph2DBaseSettingsUpdate {
  primitive?: Geometry2DPrimitiveSettingsUpdate;
  geometryPrimitive?: Geometry2DPrimitiveSettingsUpdate;
}

interface Vector2DElementSettingsUpdate extends Record<string, unknown> {
  kind?: Vector2DElementKind | string;
  index?: number;
  id?: string;
  patch?: Record<string, unknown>;
}

interface Vector2DSettingsUpdate extends Bounded2DSettingsUpdate {
  showArrows?: boolean;
  labelStyle?: Vector2DLabelStyle;
  element?: Vector2DElementSettingsUpdate;
}

interface Graph3DSettingsUpdate extends SizedSettingsUpdate {
  view?: Partial<Graph3DViewState>;
  resetView?: boolean;
  element?: Graph3DElementSettingsUpdate;
}

interface Graph3DElementSettingsUpdate extends Record<string, unknown> {
  kind?: Graph3DElementKind | string;
  index?: number;
  id?: string;
  patch?: Record<string, unknown>;
}

interface StatsChartSettingsUpdate extends SizedSettingsUpdate {
  chartType?: StatsChartData["chartType"];
  showGrid?: boolean;
  showFill?: boolean;
  fillColor?: string;
  fillOpacity?: number;
  element?: StatsChartSeriesSettingsUpdate;
}

interface StatsChartSeriesSettingsUpdate extends Record<string, unknown> {
  kind?: "series" | string;
  index?: number;
  id?: string;
  patch?: Record<string, unknown>;
}

interface PenroseSettingsUpdate {
  scalePercent?: number;
  original?: boolean;
  resample?: boolean;
  variation?: string;
  element?: PenroseElementSettingsUpdate;
}

interface PenroseElementSettingsUpdate extends Record<string, unknown> {
  kind?: PenroseSolutionElementKind | string;
  index?: number;
  id?: string;
  patch?: Record<string, unknown>;
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
  element?: ImageAnnotationSettingsUpdate;
}

interface ImageAnnotationSettingsUpdate extends Record<string, unknown> {
  kind?: "annotation" | string;
  index?: number;
  id?: string;
  patch?: Record<string, unknown>;
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

function graph2dSettingsPatch(config: GraphConfig, settings: Graph2DBaseSettingsUpdate): GraphPatch {
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
  setIfDefined(patch, "showXAxisMinArrow", settings.showXAxisMinArrow);
  setIfDefined(patch, "showXAxisMaxArrow", settings.showXAxisMaxArrow);
  setIfDefined(patch, "showYAxisMinArrow", settings.showYAxisMinArrow);
  setIfDefined(patch, "showYAxisMaxArrow", settings.showYAxisMaxArrow);
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

function graph2dFunctionPatchRecord(source: Graph2DFunctionSettingsUpdate, idUsedAsTarget: boolean): Record<string, unknown> {
  if (isRecord(source.patch)) return source.patch;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "index" || key === "patch") continue;
    if (key === "id" && idUsedAsTarget) continue;
    patch[key] = value;
  }
  return patch;
}

function graph2dFunctionPatch(record: Record<string, unknown>): Partial<GraphFunction> {
  const patch: Partial<GraphFunction> = {};
  setPatchValue(patch, "id", stringPatchValue(record.id));
  if (record.kind === "expression" || record.kind === "piecewise" || record.kind === "relation") patch.kind = record.kind;
  setPatchValue(patch, "expression", stringPatchValue(record.expression));
  setPatchValue(patch, "latex", stringPatchValue(record.latex));
  setPatchValue(patch, "label", stringPatchValue(record.label));
  setPatchValue(patch, "color", stringPatchValue(record.color));
  setPatchValue(patch, "strokeWidth", numberPatchValue(record.strokeWidth));
  if (record.strokeStyle === "solid" || record.strokeStyle === "dashed") patch.strokeStyle = record.strokeStyle;
  setPatchValue(patch, "show", booleanPatchValue(record.show));
  setPatchValue(patch, "solutionOnly", booleanPatchValue(record.solutionOnly));
  setPatchValue(patch, "showLabel", booleanPatchValue(record.showLabel));
  if (record.labelMode === "name" || record.labelMode === "equation") patch.labelMode = record.labelMode;
  setPatchValue(patch, "labelX", numberPatchValue(record.labelX));
  setPatchValue(patch, "labelY", numberPatchValue(record.labelY));
  if (record.domainMode === "auto" || record.domainMode === "manual") patch.domainMode = record.domainMode;
  setPatchValue(patch, "domainMin", numberPatchValue(record.domainMin));
  setPatchValue(patch, "domainMax", numberPatchValue(record.domainMax));
  if (record.functionExtensionMode === "auto" || record.functionExtensionMode === "manual") {
    patch.functionExtensionMode = record.functionExtensionMode;
  }
  setPatchValue(patch, "functionExtension", numberPatchValue(record.functionExtension));
  setPatchValue(patch, "functionExtensionLeft", numberPatchValue(record.functionExtensionLeft));
  setPatchValue(patch, "functionExtensionRight", numberPatchValue(record.functionExtensionRight));
  return patch;
}

function graph2dFunctionSettingsPatch(config: GraphConfig, settings: Graph2DSettingsUpdate): DiagramSettingsPatchSuccess | SettingsFailure {
  const basePatch = graph2dSettingsPatch(config, settings);
  if (!settings.function) return { ok: true, patch: basePatch };
  const functions = graphFunctionsFromConfig(config);
  const directIndex = nonNegativeInteger(settings.function.index);
  const idValue = typeof settings.function.id === "string" && settings.function.id.trim() ? settings.function.id.trim() : "";
  const matchedIndex = idValue ? graphFunctionIndexById(functions, idValue) : -1;
  const index = directIndex ?? (matchedIndex >= 0 ? matchedIndex : undefined);
  const idUsedAsTarget = directIndex === undefined && Boolean(idValue);
  if (index === undefined || !graphFunctionAt(functions, index)) {
    return settingsFailure("graph2d function settings could not find the requested function.");
  }
  const nextFunctions = updateGraphFunction(
    functions,
    index,
    graph2dFunctionPatch(graph2dFunctionPatchRecord(settings.function, idUsedAsTarget)),
  );
  if (!nextFunctions) return settingsFailure(`graph2d function index ${index} is outside functions.`);
  return {
    ok: true,
    patch: compactGraphPatch([basePatch, { functions: nextFunctions }]),
    targetLabel: `function ${idValue || index + 1}`,
  };
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
  setPatchValue(patch, "solutionOnly", booleanPatchValue(record.solutionOnly));
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
  setPatchValue(patch, "solutionOnly", booleanPatchValue(record.solutionOnly));
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
  setPatchValue(patch, "solutionOnly", booleanPatchValue(record.solutionOnly));
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
  setPatchValue(patch, "solutionOnly", booleanPatchValue(record.solutionOnly));
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
  setPatchValue(patch, "solutionOnly", booleanPatchValue(record.solutionOnly));
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

function vector2dBaseSettingsPatch(config: GraphConfig, settings: Vector2DSettingsUpdate): GraphPatch {
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

function vector2dElementPatchRecord(source: Vector2DElementSettingsUpdate, idUsedAsTarget: boolean): Record<string, unknown> {
  if (isRecord(source.patch)) return source.patch;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "kind" || key === "index" || key === "patch") continue;
    if (key === "id" && idUsedAsTarget) continue;
    patch[key] = value;
  }
  return patch;
}

function vector2dElementPatch(kind: Vector2DElementKind, record: Record<string, unknown>): Partial<Vector2DElement> {
  const common = {
    ...(stringPatchValue(record.id) !== undefined ? { id: stringPatchValue(record.id) } : {}),
    ...(stringPatchValue(record.label) !== undefined ? { label: stringPatchValue(record.label) } : {}),
    ...(stringPatchValue(record.color) !== undefined ? { color: stringPatchValue(record.color) } : {}),
    ...(numberPatchValue(record.labelX) !== undefined ? { labelX: numberPatchValue(record.labelX) } : {}),
    ...(numberPatchValue(record.labelY) !== undefined ? { labelY: numberPatchValue(record.labelY) } : {}),
    ...(booleanPatchValue(record.solutionOnly) !== undefined ? { solutionOnly: booleanPatchValue(record.solutionOnly) } : {}),
  };
  if (kind === "vector") {
    const start = Array.isArray(record.start) && record.start.length === 2 ? record.start.map(numberPatchValue) : undefined;
    const components =
      Array.isArray(record.components) && record.components.length === 2 ? record.components.map(numberPatchValue) : undefined;
    return {
      ...common,
      ...(stringPatchValue(record.name) !== undefined ? { name: stringPatchValue(record.name) } : {}),
      ...(start?.every((value) => value !== undefined) ? { start: start as [number, number] } : {}),
      ...(components?.every((value) => value !== undefined) ? { components: components as [number, number] } : {}),
      ...(booleanPatchValue(record.showComponents) !== undefined ? { showComponents: booleanPatchValue(record.showComponents) } : {}),
    } satisfies Partial<Vector2DControlEntry>;
  }
  if (kind === "segmentLabel") {
    return {
      ...common,
      ...(stringPatchValue(record.vectorId) !== undefined ? { vectorId: stringPatchValue(record.vectorId) } : {}),
      ...(numberPatchValue(record.position) !== undefined ? { position: numberPatchValue(record.position) } : {}),
      ...(numberPatchValue(record.offsetPx) !== undefined ? { offsetPx: numberPatchValue(record.offsetPx) } : {}),
    } satisfies Partial<Vector2DSegmentLabelEntry>;
  }
  return {
    ...common,
    ...(stringPatchValue(record.from) !== undefined ? { from: stringPatchValue(record.from) } : {}),
    ...(stringPatchValue(record.to) !== undefined ? { to: stringPatchValue(record.to) } : {}),
    ...(booleanPatchValue(record.rightAngle) !== undefined ? { rightAngle: booleanPatchValue(record.rightAngle) } : {}),
    ...(numberPatchValue(record.radius) !== undefined ? { radius: numberPatchValue(record.radius) } : {}),
  } satisfies Partial<Vector2DAngleMarkerEntry>;
}

function vector2dElementTargetFromSettings(
  config: GraphConfig,
  source: Vector2DElementSettingsUpdate,
): { ok: true; target: Vector2DElementTarget; idUsedAsTarget: boolean } | SettingsFailure {
  const kind = normalizeVector2DElementKind(source.kind);
  if (!kind) return settingsFailure("vector2d element settings must include kind: vector, segmentLabel, or angleMarker.");
  const directIndex = nonNegativeInteger(source.index);
  const idValue = typeof source.id === "string" && source.id.trim() ? source.id.trim() : "";
  const index = directIndex ?? (idValue ? vector2dElementIndexById(config, kind, idValue) : undefined);
  const idUsedAsTarget = directIndex === undefined && Boolean(idValue);
  if (index === undefined || index < 0) return settingsFailure(`vector2d element settings could not find the requested ${kind}.`);
  const target = vector2dElementTarget(kind, index);
  if (!target || !vector2dElementAt(config, target)) return settingsFailure(`vector2d element settings index ${index} is outside ${kind}.`);
  return { ok: true, target, idUsedAsTarget };
}

function vector2dSettingsPatch(config: GraphConfig, settings: Vector2DSettingsUpdate): DiagramSettingsPatchSuccess | SettingsFailure {
  const patch = vector2dBaseSettingsPatch(config, settings);
  if (!settings.element) return { ok: true, patch };
  const targetResult = vector2dElementTargetFromSettings(config, settings.element);
  if (!targetResult.ok) return targetResult;
  const elementPatch = vector2dElementPatch(
    targetResult.target.kind,
    vector2dElementPatchRecord(settings.element, targetResult.idUsedAsTarget),
  );
  if (Object.keys(elementPatch).length) patch.metadata = updateVector2DElement(config, targetResult.target, elementPatch);
  const nextConfig = mergePatch(config, patch);
  return { ok: true, patch, targetLabel: vector2dElementDisplayName(nextConfig, targetResult.target) };
}

function graph3dBaseSettingsPatch(config: GraphConfig, settings: Graph3DSettingsUpdate): GraphPatch {
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

function graph3dElementPatchRecord(source: Graph3DElementSettingsUpdate, idUsedAsTarget: boolean): Record<string, unknown> {
  if (isRecord(source.patch)) return source.patch;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "kind" || key === "index" || key === "patch") continue;
    if (key === "id" && idUsedAsTarget) continue;
    patch[key] = value;
  }
  return patch;
}

function numberTriplePatchValue(value: unknown) {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const triple = value.map(numberPatchValue);
  return triple.every((entry) => entry !== undefined) ? (triple as [number, number, number]) : undefined;
}

function graph3dPointReferencePatchValue(value: unknown) {
  return stringPatchValue(value) ?? numberTriplePatchValue(value);
}

function graph3dElementCommonPatch(record: Record<string, unknown>) {
  return {
    ...(stringPatchValue(record.id) !== undefined ? { id: stringPatchValue(record.id) } : {}),
    ...(stringPatchValue(record.label) !== undefined ? { label: stringPatchValue(record.label) } : {}),
    ...(stringPatchValue(record.color) !== undefined ? { color: stringPatchValue(record.color) } : {}),
    ...(booleanPatchValue(record.show) !== undefined ? { show: booleanPatchValue(record.show) } : {}),
    ...(booleanPatchValue(record.solutionOnly) !== undefined ? { solutionOnly: booleanPatchValue(record.solutionOnly) } : {}),
  };
}

function graph3dElementPatch(kind: Graph3DElementKind, record: Record<string, unknown>): Partial<Graph3DElement> {
  const common = graph3dElementCommonPatch(record);
  if (kind === "point") {
    return {
      ...common,
      ...(stringPatchValue(record.name) !== undefined ? { name: stringPatchValue(record.name) } : {}),
      ...(numberTriplePatchValue(record.coords) ? { coords: numberTriplePatchValue(record.coords) } : {}),
    } satisfies Partial<Graph3DPointData>;
  }
  if (kind === "segment" || kind === "dimension") {
    const linePatch = {
      ...common,
      ...(graph3dPointReferencePatchValue(record.from) !== undefined ? { from: graph3dPointReferencePatchValue(record.from) } : {}),
      ...(graph3dPointReferencePatchValue(record.to) !== undefined ? { to: graph3dPointReferencePatchValue(record.to) } : {}),
      ...(stringPatchValue(record.strokeColor) !== undefined ? { strokeColor: stringPatchValue(record.strokeColor) } : {}),
      ...(stringPatchValue(record.strokeStyle) !== undefined ? { strokeStyle: stringPatchValue(record.strokeStyle) } : {}),
      ...(numberPatchValue(record.strokeWidth) !== undefined ? { strokeWidth: numberPatchValue(record.strokeWidth) } : {}),
      ...(booleanPatchValue(record.dashed) !== undefined ? { dashed: booleanPatchValue(record.dashed) } : {}),
    };
    return linePatch as Partial<Graph3DSegmentData | Graph3DDimensionData>;
  }
  if (kind === "face") {
    return {
      ...common,
      ...(Array.isArray(record.points) ? { points: record.points as Graph3DFaceData["points"] } : {}),
      ...(stringPatchValue(record.fillColor) !== undefined ? { fillColor: stringPatchValue(record.fillColor) } : {}),
      ...(numberPatchValue(record.fillOpacity) !== undefined ? { fillOpacity: numberPatchValue(record.fillOpacity) } : {}),
      ...(stringPatchValue(record.strokeColor) !== undefined ? { strokeColor: stringPatchValue(record.strokeColor) } : {}),
      ...(numberPatchValue(record.strokeWidth) !== undefined ? { strokeWidth: numberPatchValue(record.strokeWidth) } : {}),
      ...(booleanPatchValue(record.dashed) !== undefined ? { dashed: booleanPatchValue(record.dashed) } : {}),
    } satisfies Partial<Graph3DFaceData>;
  }
  return {
    ...common,
    ...(stringPatchValue(record.kind) !== undefined ? { kind: stringPatchValue(record.kind) } : {}),
    ...(graph3dPointReferencePatchValue(record.center) !== undefined ? { center: graph3dPointReferencePatchValue(record.center) } : {}),
    ...(graph3dPointReferencePatchValue(record.baseCenter) !== undefined
      ? { baseCenter: graph3dPointReferencePatchValue(record.baseCenter) }
      : {}),
    ...(graph3dPointReferencePatchValue(record.topCenter) !== undefined
      ? { topCenter: graph3dPointReferencePatchValue(record.topCenter) }
      : {}),
    ...(graph3dPointReferencePatchValue(record.apex) !== undefined ? { apex: graph3dPointReferencePatchValue(record.apex) } : {}),
    ...(numberTriplePatchValue(record.normal) ? { normal: numberTriplePatchValue(record.normal) } : {}),
    ...(numberTriplePatchValue(record.axis) ? { axis: numberTriplePatchValue(record.axis) } : {}),
    ...(numberPatchValue(record.radius) !== undefined ? { radius: numberPatchValue(record.radius) } : {}),
    ...(numberPatchValue(record.height) !== undefined ? { height: numberPatchValue(record.height) } : {}),
    ...(numberPatchValue(record.depth) !== undefined ? { depth: numberPatchValue(record.depth) } : {}),
    ...(stringPatchValue(record.fillColor) !== undefined ? { fillColor: stringPatchValue(record.fillColor) } : {}),
    ...(numberPatchValue(record.fillOpacity) !== undefined ? { fillOpacity: numberPatchValue(record.fillOpacity) } : {}),
    ...(stringPatchValue(record.strokeColor) !== undefined ? { strokeColor: stringPatchValue(record.strokeColor) } : {}),
    ...(numberPatchValue(record.strokeWidth) !== undefined ? { strokeWidth: numberPatchValue(record.strokeWidth) } : {}),
  } satisfies Partial<Graph3DSolidData>;
}

function graph3dElementTargetFromSettings(
  config: GraphConfig,
  source: Graph3DElementSettingsUpdate,
): { ok: true; target: Graph3DElementTarget; idUsedAsTarget: boolean } | SettingsFailure {
  const kind = normalizeGraph3DElementKind(source.kind);
  if (!kind) return settingsFailure("graph3d element settings must include kind: point, segment, dimension, face, or solid.");
  const directIndex = nonNegativeInteger(source.index);
  const idValue = typeof source.id === "string" && source.id.trim() ? source.id.trim() : "";
  const index = directIndex ?? (idValue ? graph3dElementIndexById(config, kind, idValue) : undefined);
  const idUsedAsTarget = directIndex === undefined && Boolean(idValue);
  if (index === undefined || index < 0) return settingsFailure(`graph3d element settings could not find the requested ${kind}.`);
  const target = graph3dElementTarget(config, kind, index);
  if (!target || !graph3dElementAt(config, target)) return settingsFailure(`graph3d element settings index ${index} is outside ${kind}.`);
  return { ok: true, target, idUsedAsTarget };
}

function graph3dSettingsPatch(config: GraphConfig, settings: Graph3DSettingsUpdate): DiagramSettingsPatchSuccess | SettingsFailure {
  const patch = graph3dBaseSettingsPatch(config, settings);
  if (!settings.element) return { ok: true, patch };
  const targetResult = graph3dElementTargetFromSettings(config, settings.element);
  if (!targetResult.ok) return targetResult;
  const elementPatch = graph3dElementPatch(
    targetResult.target.kind,
    graph3dElementPatchRecord(settings.element, targetResult.idUsedAsTarget),
  );
  if (Object.keys(elementPatch).length) {
    const nextId = targetResult.target.kind === "point" && typeof elementPatch.id === "string" ? elementPatch.id : "";
    const renameData = nextId ? graph3dDataWithRenamedPoint(config, targetResult.target.index, nextId) : undefined;
    const configAfterRename = renameData ? { ...config, data: renameData } : config;
    const elementPatchWithoutId = { ...elementPatch };
    delete elementPatchWithoutId.id;
    patch.data = updateGraph3DElement(configAfterRename, targetResult.target, nextId ? elementPatchWithoutId : elementPatch);
  }
  const nextConfig = mergePatch(config, patch);
  return { ok: true, patch, targetLabel: graph3dElementDisplayName(nextConfig, targetResult.target) };
}

function statsChartBaseSettingsPatch(config: GraphConfig, settings: StatsChartSettingsUpdate): GraphPatch {
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
  const patch: GraphPatch = {};
  if (Object.keys(dataPatch).length) patch.data = { ...((config.data ?? {}) as StatsChartData), ...dataPatch };
  if (Object.keys(optionsPatch).length) {
    const nextOptions = { ...spec.options, ...optionsPatch };
    patch.options = nextOptions;
    patch.widthPx = nextOptions.widthPx;
    patch.heightPx = nextOptions.heightPx;
  }
  return patch;
}

function statsChartSeriesPatchRecord(source: StatsChartSeriesSettingsUpdate, idUsedAsTarget: boolean): Record<string, unknown> {
  if (isRecord(source.patch)) return source.patch;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "kind" || key === "index" || key === "patch") continue;
    if (key === "id" && idUsedAsTarget) continue;
    patch[key] = value;
  }
  return patch;
}

function numberArrayPatchValue(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const numbers = value.map(numberPatchValue);
  return numbers.every((entry) => entry !== undefined) ? (numbers as number[]) : undefined;
}

function statsChartSeriesPatch(record: Record<string, unknown>): Partial<StatsChartSeriesData> {
  return {
    ...(stringPatchValue(record.id) !== undefined ? { id: stringPatchValue(record.id) } : {}),
    ...(stringPatchValue(record.label) !== undefined ? { label: stringPatchValue(record.label) } : {}),
    ...(normalizeStatsChartSeriesType(record.seriesType) !== undefined
      ? { seriesType: normalizeStatsChartSeriesType(record.seriesType) }
      : {}),
    ...(numberArrayPatchValue(record.xValues) ? { xValues: numberArrayPatchValue(record.xValues) } : {}),
    ...(numberArrayPatchValue(record.yValues) ? { yValues: numberArrayPatchValue(record.yValues) } : {}),
    ...(stringPatchValue(record.color) !== undefined ? { color: stringPatchValue(record.color) } : {}),
    ...(numberPatchValue(record.lineWidth) !== undefined ? { lineWidth: numberPatchValue(record.lineWidth) } : {}),
    ...(numberPatchValue(record.markerSize) !== undefined ? { markerSize: numberPatchValue(record.markerSize) } : {}),
    ...(numberPatchValue(record.barWidth) !== undefined ? { barWidth: numberPatchValue(record.barWidth) } : {}),
    ...(booleanPatchValue(record.show) !== undefined ? { show: booleanPatchValue(record.show) } : {}),
    ...(booleanPatchValue(record.solutionOnly) !== undefined ? { solutionOnly: booleanPatchValue(record.solutionOnly) } : {}),
  };
}

function statsChartSeriesTargetFromSettings(
  config: GraphConfig,
  source: StatsChartSeriesSettingsUpdate,
): { ok: true; target: StatsChartSeriesTarget; idUsedAsTarget: boolean } | SettingsFailure {
  if (source.kind !== "series") return settingsFailure("statsChart element settings must include kind: series.");
  const directIndex = nonNegativeInteger(source.index);
  const idValue = typeof source.id === "string" && source.id.trim() ? source.id.trim() : "";
  const index = directIndex ?? (idValue ? statsChartSeriesIndexById(config, idValue) : undefined);
  const idUsedAsTarget = directIndex === undefined && Boolean(idValue);
  if (index === undefined || index < 0) return settingsFailure("statsChart element settings could not find the requested series.");
  const target = statsChartSeriesTarget(config, index);
  if (!target || !statsChartSeriesAt(config, target)) return settingsFailure(`statsChart series index ${index} is outside data.series.`);
  return { ok: true, target, idUsedAsTarget };
}

function statsChartSettingsPatch(config: GraphConfig, settings: StatsChartSettingsUpdate): DiagramSettingsPatchSuccess | SettingsFailure {
  const patch = statsChartBaseSettingsPatch(config, settings);
  if (!settings.element) return { ok: true, patch };
  const targetResult = statsChartSeriesTargetFromSettings(config, settings.element);
  if (!targetResult.ok) return targetResult;
  const elementPatch = statsChartSeriesPatch(statsChartSeriesPatchRecord(settings.element, targetResult.idUsedAsTarget));
  if (Object.keys(elementPatch).length) patch.data = updateStatsChartSeries(config, targetResult.target, elementPatch);
  const nextConfig = mergePatch(config, patch);
  return { ok: true, patch, targetLabel: statsChartSeriesDisplayName(nextConfig, targetResult.target) };
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

function penroseElementPatchRecord(source: PenroseElementSettingsUpdate, idUsedAsTarget: boolean) {
  const sourcePatch = isRecord(source.patch) ? source.patch : source;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sourcePatch)) {
    if (key === "kind" || key === "index" || key === "patch") continue;
    if (key === "id" && idUsedAsTarget) continue;
    if (["name", "label", "value", "type"].includes(key) && typeof value === "string") patch[key] = value;
    if (["solutionOnly", "shaded", "shade"].includes(key) && typeof value === "boolean") patch[key] = value;
    if (["points", "between"].includes(key) && Array.isArray(value) && value.every((item) => typeof item === "string")) patch[key] = value;
  }
  return patch;
}

function penroseElementSettingsPatch(config: GraphConfig, settings: PenroseSettingsUpdate): DiagramSettingsPatchSuccess | SettingsFailure {
  const basePatch =
    config.type === "network"
      ? networkSettingsPatch(config, settings as PenroseSettingsUpdate & NetworkSettingsUpdate)
      : config.type === "setDiagram"
        ? setDiagramSettingsPatch(config, settings as PenroseSettingsUpdate & SetDiagramSettingsUpdate)
        : penroseSettingsPatch(config, settings);
  if (!settings.element) return { ok: true, patch: basePatch };
  const allowedKinds: PenroseSolutionElementKind[] = config.type === "setDiagram" ? ["region"] : ["object", "relationship"];
  if (!allowedKinds.includes(settings.element.kind as PenroseSolutionElementKind)) {
    return settingsFailure(`${config.type} element settings require kind: ${allowedKinds.join(" | ")}.`);
  }
  const directIndex = nonNegativeInteger(settings.element.index);
  const idValue = typeof settings.element.id === "string" && settings.element.id.trim() ? settings.element.id.trim() : "";
  const target = {
    kind: settings.element.kind as PenroseSolutionElementKind,
    ...(directIndex !== undefined ? { index: directIndex } : {}),
    ...(directIndex === undefined && idValue ? { id: idValue } : {}),
  } satisfies PenroseSolutionElementTarget;
  const nextConfig = mergePatch(config, basePatch);
  const resolved = penroseElementIndex(nextConfig, target);
  if (!resolved) return settingsFailure(`${config.type} element settings could not find the requested ${target.kind}.`);
  const patch = updatePenroseElement(
    nextConfig,
    target,
    penroseElementPatchRecord(settings.element, directIndex === undefined && Boolean(idValue)),
  );
  if (!patch) return settingsFailure(`${config.type} element settings could not update the requested ${target.kind}.`);
  return {
    ok: true,
    patch: compactGraphPatch([basePatch, patch]),
    targetLabel: `${target.kind} ${idValue || resolved.index + 1}`,
  };
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

function imageAnnotationPatchRecord(source: ImageAnnotationSettingsUpdate, idUsedAsTarget: boolean) {
  const sourcePatch = isRecord(source.patch) ? source.patch : source;
  const patch: Partial<ImageDiagramAnnotation> = {};
  for (const [key, value] of Object.entries(sourcePatch)) {
    if (["kind", "index", "patch"].includes(key)) continue;
    if (key === "id" && idUsedAsTarget) continue;
    if (["id", "text", "color"].includes(key) && typeof value === "string") Object.assign(patch, { [key]: value });
    if (
      ["xPercent", "yPercent", "endXPercent", "endYPercent", "widthPercent", "heightPercent", "strokeWidth", "fontSizePx"].includes(key)
    ) {
      const numeric = numberPatchValue(value);
      if (numeric !== undefined) Object.assign(patch, { [key]: numeric });
    }
    if (["show", "solutionOnly"].includes(key) && typeof value === "boolean") Object.assign(patch, { [key]: value });
    if (key === "annotationKind" && ["label", "ellipse", "arrow"].includes(String(value))) {
      patch.kind = value as ImageDiagramAnnotation["kind"];
    }
  }
  return patch;
}

function imageElementSettingsPatch(config: GraphConfig, settings: ImageSettingsUpdate): DiagramSettingsPatchSuccess | SettingsFailure {
  const basePatch = imageSettingsPatch(config, settings);
  if (!settings.element) return { ok: true, patch: basePatch };
  if (settings.element.kind !== "annotation") return settingsFailure("image element settings must include kind: annotation.");
  const directIndex = nonNegativeInteger(settings.element.index);
  const idValue = typeof settings.element.id === "string" && settings.element.id.trim() ? settings.element.id.trim() : "";
  const index = directIndex ?? (idValue ? imageAnnotationIndexById(config, idValue) : undefined);
  const idUsedAsTarget = directIndex === undefined && Boolean(idValue);
  if (index === undefined || !imageAnnotationAt(config, { index })) {
    return settingsFailure("image element settings could not find the requested annotation.");
  }
  const nextConfig = mergePatch(config, basePatch);
  const data = updateImageAnnotation(nextConfig, { index }, imageAnnotationPatchRecord(settings.element, idUsedAsTarget));
  if (!data) return settingsFailure(`image annotation index ${index} is outside data.annotations.`);
  return {
    ok: true,
    patch: compactGraphPatch([basePatch, { data }]),
    targetLabel: `annotation ${idValue || index + 1}`,
  };
}

function diagramSettingsPatch(config: GraphConfig, settings: MauthDiagramSettingsUpdate): GraphPatch {
  if (settings.renderer === "graph2d") return graph2dSettingsPatch(config, settings);
  if (settings.renderer === "geometry2d") return graph2dSettingsPatch(config, settings);
  if (settings.renderer === "vector2d") return vector2dBaseSettingsPatch(config, settings);
  if (settings.renderer === "graph3d") return graph3dBaseSettingsPatch(config, settings);
  if (settings.renderer === "statsChart") return statsChartBaseSettingsPatch(config, settings);
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
    if (settings.solutionEntry !== undefined) {
      if (contentBlockDisplayVisibility(nextBlock) !== "always") {
        return settingsFailure("A structured solution table entry can only be set on a table shown in both copies.");
      }
      const table = normalizeTableBlock(nextBlock);
      const { row, column, value } = settings.solutionEntry;
      if (!Number.isInteger(row) || row < 0 || !Number.isInteger(column) || column < 0) {
        return settingsFailure("Table solution entry coordinates must be non-negative integers.");
      }
      if (!table.rows[row] || table.rows[row]?.[column] === undefined) {
        return settingsFailure(
          `Table solution entry coordinates must reference an existing body cell (rows 0-${Math.max(0, table.rows.length - 1)}, columns 0-${Math.max(0, table.headers.length - 1)}).`,
        );
      }
      if (table.rows[row]?.[column]?.trim()) {
        return settingsFailure("A solution table entry can only be set where the student table cell is blank.");
      }
      nextBlock = { ...nextBlock, ...tableSolutionEntryPatch(nextBlock, row, column, value) };
    }
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
    if (settings.solutionAnswerIndex !== undefined && contentBlockDisplayVisibility(block) === "student") {
      return settingsFailure("A circled solution answer cannot be set on a student-only choice list.");
    }
    if (
      settings.solutionAnswerIndex !== undefined &&
      settings.solutionAnswerIndex !== null &&
      normalizeChoiceSolutionAnswerIndex(settings.solutionAnswerIndex, block.choices.length) === undefined
    ) {
      return settingsFailure(`Choice answer index must be an integer from 0 to ${Math.max(0, block.choices.length - 1)}.`);
    }
    const nextBlock = settings.solutionAnswerIndex === undefined ? block : withChoiceSolutionAnswer(block, settings.solutionAnswerIndex);
    return {
      ok: true,
      block: {
        ...nextBlock,
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
    settings.renderer === "graph2d"
      ? graph2dFunctionSettingsPatch(block.graphConfig, settings)
      : settings.renderer === "geometry2d"
        ? geometry2dSettingsPatch(block.graphConfig, settings)
        : settings.renderer === "vector2d"
          ? vector2dSettingsPatch(block.graphConfig, settings)
          : settings.renderer === "graph3d"
            ? graph3dSettingsPatch(block.graphConfig, settings)
            : settings.renderer === "statsChart"
              ? statsChartSettingsPatch(block.graphConfig, settings)
              : settings.renderer === "geometricConstruction" || settings.renderer === "network" || settings.renderer === "setDiagram"
                ? penroseElementSettingsPatch(block.graphConfig, settings)
                : settings.renderer === "image"
                  ? imageElementSettingsPatch(block.graphConfig, settings)
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
