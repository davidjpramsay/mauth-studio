import type {
  ChoiceListLayout,
  ChoiceNumberingStyle,
  ContentBlock,
  DiagramAlignment,
  Graph2DGeometryAngle,
  Graph2DGeometryArc,
  Graph2DGeometryDecoration,
  Graph2DGeometryPoint,
  Graph2DGeometrySegment,
  GraphConfig,
  GraphFeature,
  GraphFunction,
  TableCellAlignment,
} from "@mauth-studio/shared";
import {
  DEFAULT_STATS_CHART_SPEC,
  STATS_CHART_TYPES,
  normalizeStatsChartSpec,
  type StatsChartData,
  type StatsChartOptions,
  type StatsChartType,
} from "@mauth-studio/diagram-plotly";
import { ArrowLeft, Shuffle } from "lucide-react";

import { defaultStatsDataForType } from "./StatsChartEditor";
import {
  CHOICE_LIST_LAYOUTS,
  CHOICE_NUMBERING_STYLES,
  COLUMN_COUNT_OPTIONS,
  DIAGRAM_ALIGNMENTS,
  DIAGRAM_TYPES,
  DIAGRAM_TYPE_GROUPS,
  TABLE_CELL_ALIGNMENTS,
  VECTOR_2D_LABEL_STYLES,
} from "./editorOptions";
import {
  INSPECTOR_MAX_TABLE_COLUMNS,
  INSPECTOR_MAX_TABLE_ROWS,
  INSPECTOR_MIN_TABLE_COLUMNS,
  INSPECTOR_MIN_TABLE_ROWS,
  INSPECTOR_SET_SHADING_OPTIONS,
  columnsColumnCountPatch,
  graph3dResetViewPatch,
  graph3dViewPatch,
  graphInspectorWidthPatch,
  imageDataPatch,
  inspectorNumberInputValue,
  inspectorOptionalNumber,
  inspectorSpaceLines,
  inspectorTableColumnCount,
  isInspectorPenroseDiagramType,
  networkPresetPatch,
  networkVisibilityPatch,
  penroseResamplePatch,
  penroseScalePatch,
  setDiagramCountLabelsPatch,
  setDiagramNotationPatch,
  setDiagramShadingPatch,
  tableColumnCountPatch,
  tableRowsCountPatch,
  vector2dLabelStylePatch,
  type InspectorColumnsBlock,
  type InspectorTableBlock,
} from "../../lib/moduleSettingsPatches";
import { Button } from "../ui/button";
import {
  normalizeChoiceListLayout,
  normalizeChoiceNumberingStyle,
  normalizeColumnsBlock,
  normalizeDiagramAlignment,
  normalizeTableBlock,
  plainTableRows,
} from "../../lib/contentBlockNormalization";
import { DEFAULT_3D_GRAPH, DEFAULT_3D_VIEW_STATE, graph3dViewState } from "../../lib/diagram3d";
import {
  createGeometry2DDecoration,
  geometry2dData,
  geometry2dPatch,
  updateGeometry2DAngle,
  updateGeometry2DArc,
  updateGeometry2DDecoration,
  updateGeometry2DPoint,
  updateGeometry2DSegment,
} from "../../lib/diagramGeometry2d";
import {
  GRAPH_COLORS,
  GRAPH_ANGLE_MARKER_LABEL_MODES,
  GRAPH_FEATURE_LABEL_MODES,
  GRAPH_FEATURE_LINE_STYLES,
  GRAPH_FEATURE_TYPES,
  GRAPH_INTERSECTION_TARGETS,
  GRAPH_LINE_STYLES,
  GRAPH_REGION_LABEL_MODES,
  GRAPH_TANGENT_LABEL_MODES,
  graphFunctionLabel,
  graphHeight,
  isRegionFeatureKind,
  lockedAspectHeight,
} from "../../lib/diagramGraph2d";
import { DEFAULT_IMAGE_DIAGRAM, finiteGraphNumber, imageDiagramData } from "../../lib/diagramImage";
import { normalizedNetworkDiagramData } from "../../lib/diagramNetwork";
import { DEFAULT_PENROSE_SCALE_PERCENT, penroseScalePercent } from "../../lib/diagramPenrose";
import { DEFAULT_VECTOR_2D_GRAPH, vector2dLabelStyle, vector2dMetadata, type Vector2DLabelStyle } from "../../lib/diagramVector2d";
import { cn } from "../../lib/utils";

export type SelectedEditorBaseBlockScope =
  | { kind: "question"; questionId: string }
  | { kind: "part"; questionId: string; partId: string }
  | { kind: "subpart"; questionId: string; partId: string; subpartId: string };

export interface ColumnBlockPathEntry {
  columnIndex: number;
  blockId: string;
}

export type ColumnBlockPath = ColumnBlockPathEntry[];

export type SelectedEditorBlockScope =
  | SelectedEditorBaseBlockScope
  | { kind: "column"; rootScope: SelectedEditorBaseBlockScope; rootBlockId: string; path: ColumnBlockPath };

export interface SelectedEditorBlock {
  scope: SelectedEditorBlockScope;
  block: ContentBlock;
  label: string;
  summary: string;
}

export interface SelectionInspectorProps {
  selectedBlock: SelectedEditorBlock | null;
  activeAnchor?: string;
  onActivateAnchor?: (anchor: string) => void;
  onBlockChange: (selection: SelectedEditorBlock, patch: Partial<ContentBlock>) => void;
  createTextBlock: () => ContentBlock;
  diagramTypePatch: (type: string, current: GraphConfig) => Partial<GraphConfig>;
  updateGraphConfig: (graphConfig: GraphConfig, patch: Partial<GraphConfig>) => GraphConfig;
  withGraphDefaults: (graphConfig?: GraphConfig | null) => GraphConfig;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function graphFeatureTypeLabel(kind?: GraphFeature["kind"]) {
  return GRAPH_FEATURE_TYPES.find((type) => type.value === kind)?.label ?? "Feature";
}

function graphFunctionInspectorLabel(graphFunction: GraphFunction, index: number) {
  return `${graphFunction.kind === "relation" ? "Relation" : "Function"} ${index + 1}`;
}

function graphFeatureInspectorLabel(feature: GraphFeature, index: number) {
  const typeLabel = graphFeatureTypeLabel(feature.kind);
  const label = feature.label?.trim();
  return label ? `${typeLabel} ${index + 1}: ${label}` : `${typeLabel} ${index + 1}`;
}

function graphFunctionPatch(functions: readonly GraphFunction[], functionIndex: number, patch: Partial<GraphFunction>) {
  return functions.map((graphFunction, index) => (index === functionIndex ? { ...graphFunction, ...patch } : graphFunction));
}

function graphFeaturePatch(features: readonly GraphFeature[], featureIndex: number, patch: Partial<GraphFeature>) {
  return features.map((feature, index) => (index === featureIndex ? { ...feature, ...patch } : feature));
}

function graphFeatureSolutionOnlyPatch(features: readonly GraphFeature[], featureIndex: number, solutionOnly: boolean) {
  return features.map((feature, index) => {
    if (index !== featureIndex) return feature;
    if (solutionOnly) return { ...feature, solutionOnly: true };
    const { solutionOnly: _solutionOnly, ...nextFeature } = feature;
    return nextFeature;
  });
}

function graphFeatureLabelModeOptions(feature: GraphFeature) {
  if (feature.kind === "tangent") return GRAPH_TANGENT_LABEL_MODES;
  if (feature.kind === "angle_marker") return GRAPH_ANGLE_MARKER_LABEL_MODES;
  if (isRegionFeatureKind(feature.kind)) return GRAPH_REGION_LABEL_MODES;
  return GRAPH_FEATURE_LABEL_MODES;
}

function selectedGraphChildFromAnchor(anchor?: string) {
  const lastSegment = anchor?.split("/").at(-1) ?? "";
  if (lastSegment.startsWith("gf:")) {
    const index = Number(lastSegment.slice(3));
    return Number.isInteger(index) && index >= 0 ? ({ kind: "function", index } as const) : null;
  }
  if (lastSegment.startsWith("gfeat:")) {
    const index = Number(lastSegment.slice(6));
    return Number.isInteger(index) && index >= 0 ? ({ kind: "feature", index } as const) : null;
  }
  return null;
}

type SelectedGeometryChild =
  | { kind: "point"; index: number }
  | { kind: "segment"; index: number }
  | { kind: "arc"; index: number }
  | { kind: "angle"; index: number }
  | { kind: "decoration"; index: number };

function selectedGeometryChildFromAnchor(anchor?: string): SelectedGeometryChild | null {
  const lastSegment = anchor?.split("/").at(-1) ?? "";
  const prefixes: Array<[string, SelectedGeometryChild["kind"]]> = [
    ["gpt:", "point"],
    ["gseg:", "segment"],
    ["garc:", "arc"],
    ["gang:", "angle"],
    ["gdec:", "decoration"],
  ];
  const match = prefixes.find(([prefix]) => lastSegment.startsWith(prefix));
  if (!match) return null;
  const [prefix, kind] = match;
  const index = Number(lastSegment.slice(prefix.length));
  return Number.isInteger(index) && index >= 0 ? { kind, index } : null;
}

function geometryPointLabel(point: Graph2DGeometryPoint, index: number) {
  return point.label?.trim() || point.id?.trim() || `Point ${index + 1}`;
}

function geometryDecorationLabel(decoration: Graph2DGeometryDecoration, index: number) {
  if (decoration.kind === "equalLength") return `Equal length ${index + 1}`;
  if (decoration.kind === "equalAngle") return `Equal angle ${index + 1}`;
  return `Right angle ${index + 1}`;
}

function geometry2dParentAnchor(anchor?: string) {
  if (!anchor) return "";
  return anchor.replace(/\/g(?:pt|seg|arc|ang|dec):\d+$/, "");
}

function csvList(value: readonly string[] | undefined) {
  return (value ?? []).join(", ");
}

function parseCsvList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function geometryPrimitiveTitle(child: SelectedGeometryChild | null, data: ReturnType<typeof geometry2dData> | null) {
  if (!child || !data) return null;
  if (child.kind === "point")
    return `Point ${child.index + 1}: ${geometryPointLabel(data.points?.[child.index] ?? { id: "", x: 0, y: 0 }, child.index)}`;
  if (child.kind === "segment") return `Segment ${child.index + 1}: ${data.segments?.[child.index]?.id || "unnamed"}`;
  if (child.kind === "arc") return `Arc ${child.index + 1}: ${data.arcs?.[child.index]?.id || "unnamed"}`;
  if (child.kind === "angle") return `Angle ${child.index + 1}: ${data.angles?.[child.index]?.id || "unnamed"}`;
  return geometryDecorationLabel(data.decorations?.[child.index] ?? { kind: "equalLength" }, child.index);
}

interface Geometry2DInspectorProps {
  selectedBlock: SelectedEditorBlock;
  selectedDiagramConfig: GraphConfig;
  controlClassName: string;
  checkboxLabelClassName: string;
  selectedGeometryChild: SelectedGeometryChild | null;
  activeAnchor?: string;
  onActivateAnchor?: (anchor: string) => void;
  onBlockChange: SelectionInspectorProps["onBlockChange"];
  updateGraphConfig: SelectionInspectorProps["updateGraphConfig"];
}

function Geometry2DInspector({
  selectedBlock,
  selectedDiagramConfig,
  controlClassName,
  checkboxLabelClassName,
  selectedGeometryChild,
  activeAnchor,
  onActivateAnchor,
  onBlockChange,
  updateGraphConfig,
}: Geometry2DInspectorProps) {
  const data = geometry2dData(selectedDiagramConfig);
  const points = data.points ?? [];
  const segments = data.segments ?? [];
  const arcs = data.arcs ?? [];
  const angles = data.angles ?? [];
  const decorations = data.decorations ?? [];
  const pointOptions = points.map((point, index) => ({ value: point.id, label: geometryPointLabel(point, index) }));
  const segmentOptions = segments.map((segment, index) => ({ value: segment.id, label: segment.id || `Segment ${index + 1}` }));
  const angleOptions = angles.map((angle, index) => ({ value: angle.id, label: angle.id || `Angle ${index + 1}` }));
  const parentAnchor = geometry2dParentAnchor(activeAnchor);
  const writeData = (nextData: ReturnType<typeof geometry2dData>) => {
    onBlockChange(selectedBlock, {
      graphConfig: updateGraphConfig(selectedDiagramConfig, geometry2dPatch(selectedDiagramConfig, nextData)),
    });
  };
  const patchPoint = (index: number, patch: Partial<Graph2DGeometryPoint>) => writeData(updateGeometry2DPoint(data, index, patch));
  const patchSegment = (index: number, patch: Partial<Graph2DGeometrySegment>) => writeData(updateGeometry2DSegment(data, index, patch));
  const patchArc = (index: number, patch: Partial<Graph2DGeometryArc>) => writeData(updateGeometry2DArc(data, index, patch));
  const patchAngle = (index: number, patch: Partial<Graph2DGeometryAngle>) => writeData(updateGeometry2DAngle(data, index, patch));
  const patchDecoration = (index: number, patch: Partial<Graph2DGeometryDecoration>) =>
    writeData(updateGeometry2DDecoration(data, index, patch));
  const updateCanvas = (patch: Partial<GraphConfig>) => {
    onBlockChange(selectedBlock, { graphConfig: updateGraphConfig(selectedDiagramConfig, patch) });
  };
  const primitiveHeader = (title: string) => (
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {parentAnchor ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onActivateAnchor?.(parentAnchor)}>
          <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
          2D diagram
        </Button>
      ) : null}
    </div>
  );

  if (!selectedGeometryChild) {
    return (
      <div className="space-y-3 border-t pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2D diagram settings</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            x min
            <input
              type="number"
              value={inspectorNumberInputValue(selectedDiagramConfig.xMin)}
              aria-label={`${selectedBlock.label} 2D diagram x min`}
              onChange={(event) => updateCanvas({ xMin: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            x max
            <input
              type="number"
              value={inspectorNumberInputValue(selectedDiagramConfig.xMax)}
              aria-label={`${selectedBlock.label} 2D diagram x max`}
              onChange={(event) => updateCanvas({ xMax: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            y min
            <input
              type="number"
              value={inspectorNumberInputValue(selectedDiagramConfig.yMin)}
              aria-label={`${selectedBlock.label} 2D diagram y min`}
              onChange={(event) => updateCanvas({ yMin: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            y max
            <input
              type="number"
              value={inspectorNumberInputValue(selectedDiagramConfig.yMax)}
              aria-label={`${selectedBlock.label} 2D diagram y max`}
              onChange={(event) => updateCanvas({ yMax: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Width
            <input
              type="number"
              min={120}
              step={20}
              value={inspectorNumberInputValue(selectedDiagramConfig.widthPx)}
              aria-label={`${selectedBlock.label} 2D diagram width`}
              onChange={(event) =>
                updateCanvas(
                  graphInspectorWidthPatch(selectedDiagramConfig, event.target.value, () => selectedDiagramConfig.heightPx ?? 340),
                )
              }
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Height
            <input
              type="number"
              min={120}
              step={20}
              value={inspectorNumberInputValue(selectedDiagramConfig.heightPx)}
              aria-label={`${selectedBlock.label} 2D diagram height`}
              onChange={(event) => updateCanvas({ heightPx: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
        </div>
        <label className={checkboxLabelClassName}>
          <input
            type="checkbox"
            checked={selectedDiagramConfig.equalScale ?? true}
            aria-label={`${selectedBlock.label} 2D diagram equal scale`}
            onChange={(event) => updateCanvas({ equalScale: event.target.checked })}
          />
          1:1 scale
        </label>
        <label className={checkboxLabelClassName}>
          <input
            type="checkbox"
            checked={selectedDiagramConfig.showGrid ?? false}
            aria-label={`${selectedBlock.label} 2D diagram guide grid`}
            onChange={(event) =>
              updateCanvas({
                showGrid: event.target.checked,
                showMajorGrid: event.target.checked,
              })
            }
          />
          Guide grid
        </label>
      </div>
    );
  }

  if (selectedGeometryChild.kind === "point") {
    const point = points[selectedGeometryChild.index];
    if (!point) return null;
    return (
      <div className="space-y-3 border-t pt-3">
        {primitiveHeader("Point")}
        <label className={checkboxLabelClassName}>
          <input
            type="checkbox"
            checked={point.show ?? true}
            aria-label={`${selectedBlock.label} point ${selectedGeometryChild.index + 1} visible`}
            onChange={(event) => patchPoint(selectedGeometryChild.index, { show: event.target.checked })}
          />
          Visible
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Id
            <input
              value={point.id}
              aria-label={`${selectedBlock.label} point ${selectedGeometryChild.index + 1} id`}
              onChange={(event) => patchPoint(selectedGeometryChild.index, { id: event.target.value })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Label
            <input
              value={point.label ?? ""}
              aria-label={`${selectedBlock.label} point ${selectedGeometryChild.index + 1} label`}
              onChange={(event) => patchPoint(selectedGeometryChild.index, { label: event.target.value })}
              className={controlClassName}
            />
          </label>
          {[
            ["x", "x"],
            ["y", "y"],
            ["Label x", "labelX"],
            ["Label y", "labelY"],
          ].map(([label, field]) => (
            <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {label}
              <input
                type="number"
                step={0.25}
                value={inspectorNumberInputValue(point[field as keyof Graph2DGeometryPoint] as number | undefined)}
                aria-label={`${selectedBlock.label} point ${selectedGeometryChild.index + 1} ${label.toLowerCase()}`}
                onChange={(event) =>
                  patchPoint(selectedGeometryChild.index, {
                    [field]: inspectorOptionalNumber(event.target.value),
                  } as Partial<Graph2DGeometryPoint>)
                }
                className={controlClassName}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Colour
            <input
              type="color"
              value={point.color ?? "#000000"}
              aria-label={`${selectedBlock.label} point ${selectedGeometryChild.index + 1} colour`}
              onChange={(event) => patchPoint(selectedGeometryChild.index, { color: event.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background p-1"
            />
          </label>
        </div>
      </div>
    );
  }

  if (selectedGeometryChild.kind === "segment") {
    const segment = segments[selectedGeometryChild.index];
    if (!segment) return null;
    return (
      <div className="space-y-3 border-t pt-3">
        {primitiveHeader("Segment")}
        <label className={checkboxLabelClassName}>
          <input
            type="checkbox"
            checked={segment.show ?? true}
            aria-label={`${selectedBlock.label} segment ${selectedGeometryChild.index + 1} visible`}
            onChange={(event) => patchSegment(selectedGeometryChild.index, { show: event.target.checked })}
          />
          Visible
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Id
            <input
              value={segment.id}
              aria-label={`${selectedBlock.label} segment ${selectedGeometryChild.index + 1} id`}
              onChange={(event) => patchSegment(selectedGeometryChild.index, { id: event.target.value })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Label
            <input
              value={segment.label ?? ""}
              aria-label={`${selectedBlock.label} segment ${selectedGeometryChild.index + 1} label`}
              onChange={(event) => patchSegment(selectedGeometryChild.index, { label: event.target.value })}
              className={controlClassName}
            />
          </label>
          {[
            ["From", "from"],
            ["To", "to"],
          ].map(([label, field]) => (
            <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {label}
              <select
                value={String(segment[field as keyof Graph2DGeometrySegment] ?? "")}
                aria-label={`${selectedBlock.label} segment ${selectedGeometryChild.index + 1} ${label.toLowerCase()}`}
                onChange={(event) =>
                  patchSegment(selectedGeometryChild.index, { [field]: event.target.value } as Partial<Graph2DGeometrySegment>)
                }
                className={controlClassName}
              >
                {pointOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Line style
            <select
              value={segment.strokeStyle ?? "solid"}
              aria-label={`${selectedBlock.label} segment ${selectedGeometryChild.index + 1} line style`}
              onChange={(event) => patchSegment(selectedGeometryChild.index, { strokeStyle: event.target.value as "solid" | "dashed" })}
              className={controlClassName}
            >
              {GRAPH_LINE_STYLES.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Weight
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={inspectorNumberInputValue(segment.strokeWidth)}
              aria-label={`${selectedBlock.label} segment ${selectedGeometryChild.index + 1} weight`}
              onChange={(event) => patchSegment(selectedGeometryChild.index, { strokeWidth: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
          {[
            ["Label x", "labelX"],
            ["Label y", "labelY"],
          ].map(([label, field]) => (
            <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {label}
              <input
                type="number"
                step={0.25}
                value={inspectorNumberInputValue(segment[field as keyof Graph2DGeometrySegment] as number | undefined)}
                aria-label={`${selectedBlock.label} segment ${selectedGeometryChild.index + 1} ${label.toLowerCase()}`}
                onChange={(event) =>
                  patchSegment(selectedGeometryChild.index, {
                    [field]: inspectorOptionalNumber(event.target.value),
                  } as Partial<Graph2DGeometrySegment>)
                }
                className={controlClassName}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Colour
            <input
              type="color"
              value={segment.color ?? "#000000"}
              aria-label={`${selectedBlock.label} segment ${selectedGeometryChild.index + 1} colour`}
              onChange={(event) => patchSegment(selectedGeometryChild.index, { color: event.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background p-1"
            />
          </label>
        </div>
      </div>
    );
  }

  if (selectedGeometryChild.kind === "arc") {
    const arc = arcs[selectedGeometryChild.index];
    if (!arc) return null;
    return (
      <div className="space-y-3 border-t pt-3">
        {primitiveHeader("Arc")}
        <label className={checkboxLabelClassName}>
          <input
            type="checkbox"
            checked={arc.show ?? true}
            aria-label={`${selectedBlock.label} arc ${selectedGeometryChild.index + 1} visible`}
            onChange={(event) => patchArc(selectedGeometryChild.index, { show: event.target.checked })}
          />
          Visible
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Id
            <input
              value={arc.id}
              aria-label={`${selectedBlock.label} arc ${selectedGeometryChild.index + 1} id`}
              onChange={(event) => patchArc(selectedGeometryChild.index, { id: event.target.value })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Label
            <input
              value={arc.label ?? ""}
              aria-label={`${selectedBlock.label} arc ${selectedGeometryChild.index + 1} label`}
              onChange={(event) => patchArc(selectedGeometryChild.index, { label: event.target.value })}
              className={controlClassName}
            />
          </label>
          {[
            ["Centre", "center"],
            ["From", "from"],
            ["To", "to"],
          ].map(([label, field]) => (
            <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {label}
              <select
                value={String(arc[field as keyof Graph2DGeometryArc] ?? "")}
                aria-label={`${selectedBlock.label} arc ${selectedGeometryChild.index + 1} ${label.toLowerCase()}`}
                onChange={(event) => patchArc(selectedGeometryChild.index, { [field]: event.target.value } as Partial<Graph2DGeometryArc>)}
                className={controlClassName}
              >
                {pointOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Line style
            <select
              value={arc.strokeStyle ?? "solid"}
              aria-label={`${selectedBlock.label} arc ${selectedGeometryChild.index + 1} line style`}
              onChange={(event) => patchArc(selectedGeometryChild.index, { strokeStyle: event.target.value as "solid" | "dashed" })}
              className={controlClassName}
            >
              {GRAPH_LINE_STYLES.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Weight
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={inspectorNumberInputValue(arc.strokeWidth)}
              aria-label={`${selectedBlock.label} arc ${selectedGeometryChild.index + 1} weight`}
              onChange={(event) => patchArc(selectedGeometryChild.index, { strokeWidth: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
          {[
            ["Label x", "labelX"],
            ["Label y", "labelY"],
          ].map(([label, field]) => (
            <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {label}
              <input
                type="number"
                step={0.25}
                value={inspectorNumberInputValue(arc[field as keyof Graph2DGeometryArc] as number | undefined)}
                aria-label={`${selectedBlock.label} arc ${selectedGeometryChild.index + 1} ${label.toLowerCase()}`}
                onChange={(event) =>
                  patchArc(selectedGeometryChild.index, {
                    [field]: inspectorOptionalNumber(event.target.value),
                  } as Partial<Graph2DGeometryArc>)
                }
                className={controlClassName}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Colour
            <input
              type="color"
              value={arc.color ?? "#000000"}
              aria-label={`${selectedBlock.label} arc ${selectedGeometryChild.index + 1} colour`}
              onChange={(event) => patchArc(selectedGeometryChild.index, { color: event.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background p-1"
            />
          </label>
        </div>
      </div>
    );
  }

  if (selectedGeometryChild.kind === "angle") {
    const angle = angles[selectedGeometryChild.index];
    if (!angle) return null;
    return (
      <div className="space-y-3 border-t pt-3">
        {primitiveHeader("Angle")}
        <label className={checkboxLabelClassName}>
          <input
            type="checkbox"
            checked={angle.show ?? true}
            aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} visible`}
            onChange={(event) => patchAngle(selectedGeometryChild.index, { show: event.target.checked })}
          />
          Visible
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Id
            <input
              value={angle.id}
              aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} id`}
              onChange={(event) => patchAngle(selectedGeometryChild.index, { id: event.target.value })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Label
            <input
              value={angle.label ?? ""}
              aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} label`}
              onChange={(event) => patchAngle(selectedGeometryChild.index, { label: event.target.value })}
              className={controlClassName}
            />
          </label>
          {[
            ["First arm", 0],
            ["Vertex", 1],
            ["Second arm", 2],
          ].map(([label, pointIndex]) => (
            <label key={String(pointIndex)} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {label}
              <select
                value={angle.points[pointIndex as number] ?? ""}
                aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} ${String(label).toLowerCase()}`}
                onChange={(event) => {
                  const nextPoints = [...angle.points] as Graph2DGeometryAngle["points"];
                  nextPoints[pointIndex as number] = event.target.value;
                  patchAngle(selectedGeometryChild.index, { points: nextPoints });
                }}
                className={controlClassName}
              >
                {pointOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Radius
            <input
              type="number"
              min={0.05}
              step={0.05}
              value={inspectorNumberInputValue(angle.radius)}
              aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} radius`}
              onChange={(event) => patchAngle(selectedGeometryChild.index, { radius: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Count
            <input
              type="number"
              min={1}
              max={4}
              step={1}
              value={inspectorNumberInputValue(angle.arcCount)}
              aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} count`}
              onChange={(event) => patchAngle(selectedGeometryChild.index, { arcCount: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Line style
            <select
              value={angle.strokeStyle ?? "solid"}
              aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} line style`}
              onChange={(event) => patchAngle(selectedGeometryChild.index, { strokeStyle: event.target.value as "solid" | "dashed" })}
              className={controlClassName}
            >
              {GRAPH_LINE_STYLES.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Weight
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={inspectorNumberInputValue(angle.strokeWidth)}
              aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} weight`}
              onChange={(event) => patchAngle(selectedGeometryChild.index, { strokeWidth: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
          {[
            ["Label x", "labelX"],
            ["Label y", "labelY"],
          ].map(([label, field]) => (
            <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {label}
              <input
                type="number"
                step={0.25}
                value={inspectorNumberInputValue(angle[field as keyof Graph2DGeometryAngle] as number | undefined)}
                aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} ${label.toLowerCase()}`}
                onChange={(event) =>
                  patchAngle(selectedGeometryChild.index, {
                    [field]: inspectorOptionalNumber(event.target.value),
                  } as Partial<Graph2DGeometryAngle>)
                }
                className={controlClassName}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Colour
            <input
              type="color"
              value={angle.color ?? "#000000"}
              aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} colour`}
              onChange={(event) => patchAngle(selectedGeometryChild.index, { color: event.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background p-1"
            />
          </label>
        </div>
      </div>
    );
  }

  const decoration = decorations[selectedGeometryChild.index];
  if (!decoration) return null;
  return (
    <div className="space-y-3 border-t pt-3">
      {primitiveHeader("Marker")}
      <label className={checkboxLabelClassName}>
        <input
          type="checkbox"
          checked={decoration.show ?? true}
          aria-label={`${selectedBlock.label} marker ${selectedGeometryChild.index + 1} visible`}
          onChange={(event) => patchDecoration(selectedGeometryChild.index, { show: event.target.checked })}
        />
        Visible
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Type
          <select
            value={decoration.kind}
            aria-label={`${selectedBlock.label} marker ${selectedGeometryChild.index + 1} type`}
            onChange={(event) =>
              writeData(
                updateGeometry2DDecoration(
                  data,
                  selectedGeometryChild.index,
                  createGeometry2DDecoration(event.target.value as Graph2DGeometryDecoration["kind"], data),
                ),
              )
            }
            className={controlClassName}
          >
            <option value="equalLength">Equal length</option>
            <option value="equalAngle">Equal angle</option>
            <option value="rightAngle">Right angle</option>
          </select>
        </label>
        {decoration.kind === "equalLength" ? (
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Segments
            <input
              value={csvList(decoration.segments)}
              aria-label={`${selectedBlock.label} marker ${selectedGeometryChild.index + 1} segments`}
              list={`${selectedBlock.label}-geometry-segments`}
              onChange={(event) => patchDecoration(selectedGeometryChild.index, { segments: parseCsvList(event.target.value) })}
              className={controlClassName}
            />
          </label>
        ) : decoration.kind === "equalAngle" ? (
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Angles
            <input
              value={csvList(decoration.angles)}
              aria-label={`${selectedBlock.label} marker ${selectedGeometryChild.index + 1} angles`}
              onChange={(event) => patchDecoration(selectedGeometryChild.index, { angles: parseCsvList(event.target.value) })}
              className={controlClassName}
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Angle
            <select
              value={decoration.angle ?? ""}
              aria-label={`${selectedBlock.label} marker ${selectedGeometryChild.index + 1} angle`}
              onChange={(event) => patchDecoration(selectedGeometryChild.index, { angle: event.target.value })}
              className={controlClassName}
            >
              {angleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <datalist id={`${selectedBlock.label}-geometry-segments`}>
          {segmentOptions.map((option) => (
            <option key={option.value} value={option.value} />
          ))}
        </datalist>
        {decoration.kind !== "rightAngle" ? (
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Count
            <input
              type="number"
              min={1}
              max={4}
              step={1}
              value={inspectorNumberInputValue(decoration.kind === "equalAngle" ? decoration.arcCount : decoration.tickCount)}
              aria-label={`${selectedBlock.label} marker ${selectedGeometryChild.index + 1} count`}
              onChange={(event) =>
                patchDecoration(
                  selectedGeometryChild.index,
                  decoration.kind === "equalAngle"
                    ? { arcCount: inspectorOptionalNumber(event.target.value) }
                    : { tickCount: inspectorOptionalNumber(event.target.value) },
                )
              }
              className={controlClassName}
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Size
          <input
            type="number"
            min={0.05}
            step={0.05}
            value={inspectorNumberInputValue(decoration.size ?? decoration.radius)}
            aria-label={`${selectedBlock.label} marker ${selectedGeometryChild.index + 1} size`}
            onChange={(event) =>
              patchDecoration(
                selectedGeometryChild.index,
                decoration.kind === "equalAngle"
                  ? { radius: inspectorOptionalNumber(event.target.value) }
                  : { size: inspectorOptionalNumber(event.target.value) },
              )
            }
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Colour
          <input
            type="color"
            value={decoration.color ?? "#000000"}
            aria-label={`${selectedBlock.label} marker ${selectedGeometryChild.index + 1} colour`}
            onChange={(event) => patchDecoration(selectedGeometryChild.index, { color: event.target.value })}
            className="h-9 w-full rounded-md border border-input bg-background p-1"
          />
        </label>
      </div>
    </div>
  );
}

export function SelectionInspector({
  selectedBlock,
  activeAnchor,
  onActivateAnchor,
  createTextBlock,
  diagramTypePatch,
  updateGraphConfig,
  withGraphDefaults,
  onBlockChange,
}: SelectionInspectorProps) {
  if (!selectedBlock) return null;

  const selectedColumnsBlock = selectedBlock.block.kind === "columns" ? normalizeColumnsBlock(selectedBlock.block) : null;
  const selectedChoiceBlock = selectedBlock.block.kind === "choices" ? selectedBlock.block : null;
  const selectedTableBlock = selectedBlock.block.kind === "table" ? normalizeTableBlock(selectedBlock.block) : null;
  const selectedTableRows = selectedTableBlock ? plainTableRows(selectedTableBlock) : [];
  const selectedTableColumnCount = inspectorTableColumnCount(selectedTableRows);
  const selectedSpaceBlock = selectedBlock.block.kind === "space" ? selectedBlock.block : null;
  const selectedDiagramBlock = selectedBlock.block.kind === "diagram" ? selectedBlock.block : null;
  const selectedDiagramConfig = selectedDiagramBlock ? withGraphDefaults(selectedDiagramBlock.graphConfig) : null;
  const selectedGraphFunctions = selectedDiagramConfig?.type === "graph2d" ? (selectedDiagramConfig.functions ?? []) : [];
  const selectedGraphFeatures = selectedDiagramConfig?.type === "graph2d" ? (selectedDiagramConfig.features ?? []) : [];
  const selectedGraphChild = selectedDiagramConfig?.type === "graph2d" ? selectedGraphChildFromAnchor(activeAnchor) : null;
  const selectedGraphFunction =
    selectedGraphChild?.kind === "function" && selectedGraphChild.index < selectedGraphFunctions.length
      ? { graphFunction: selectedGraphFunctions[selectedGraphChild.index], functionIndex: selectedGraphChild.index }
      : null;
  const selectedGraphFeature =
    selectedGraphChild?.kind === "feature" && selectedGraphChild.index < selectedGraphFeatures.length
      ? { feature: selectedGraphFeatures[selectedGraphChild.index], featureIndex: selectedGraphChild.index }
      : null;
  const selectedGeometryData = selectedDiagramConfig?.type === "geometry2d" ? geometry2dData(selectedDiagramConfig) : null;
  const selectedGeometryChild = selectedGeometryData ? selectedGeometryChildFromAnchor(activeAnchor) : null;
  const selectedGeometryTitle = geometryPrimitiveTitle(selectedGeometryChild, selectedGeometryData);
  const selectedNetworkData = selectedDiagramConfig?.type === "network" ? normalizedNetworkDiagramData(selectedDiagramConfig) : null;
  const selectedImageData = selectedDiagramConfig?.type === "image" ? imageDiagramData(selectedDiagramConfig) : null;
  const selectedStatsChartSpec = selectedDiagramConfig?.type === "statsChart" ? normalizeStatsChartSpec(selectedDiagramConfig) : null;
  const updateSelectedStatsChartData = (patch: Partial<StatsChartData>) => {
    if (!selectedDiagramConfig || !selectedStatsChartSpec) return;
    const nextData = { ...selectedStatsChartSpec.data, ...patch };
    onBlockChange(selectedBlock, {
      graphConfig: updateGraphConfig(selectedDiagramConfig, {
        data: nextData,
        options: selectedStatsChartSpec.options,
        widthPx: selectedStatsChartSpec.options?.widthPx,
        heightPx: selectedStatsChartSpec.options?.heightPx,
      }),
    });
  };
  const updateSelectedStatsChartOptions = (patch: Partial<StatsChartOptions>) => {
    if (!selectedDiagramConfig || !selectedStatsChartSpec) return;
    const nextOptions = { ...selectedStatsChartSpec.options, ...patch };
    onBlockChange(selectedBlock, {
      graphConfig: updateGraphConfig(selectedDiagramConfig, {
        options: nextOptions,
        widthPx: nextOptions.widthPx,
        heightPx: nextOptions.heightPx,
      }),
    });
  };
  const controlClassName = "h-9 rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground";
  const checkboxLabelClassName = "flex items-center gap-2 text-xs font-semibold text-muted-foreground";
  const inspectorTitle = selectedGraphFunction
    ? `${selectedBlock.label} ${graphFunctionInspectorLabel(selectedGraphFunction.graphFunction, selectedGraphFunction.functionIndex)}`
    : selectedGraphFeature
      ? `${selectedBlock.label} ${graphFeatureInspectorLabel(selectedGraphFeature.feature, selectedGraphFeature.featureIndex)}`
      : selectedGeometryTitle
        ? `${selectedBlock.label} ${selectedGeometryTitle}`
        : selectedBlock.label;
  const inspectorSummary = selectedGraphFunction
    ? "Function display settings"
    : selectedGraphFeature
      ? "Feature display settings"
      : selectedGeometryChild
        ? "2D diagram element settings"
        : selectedBlock.summary;

  return (
    <aside
      data-inspector-placement="inline"
      className="selection-inspector-pane flex min-h-0 min-w-0 flex-col overflow-hidden border-b bg-card/95 lg:border-b-0 lg:border-r"
    >
      <div className="shrink-0 border-b p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inspector</div>
        <div className="mt-1 truncate text-sm font-semibold">{inspectorTitle}</div>
        <div className="mt-1 text-xs text-muted-foreground">{inspectorSummary}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedColumnsBlock ? (
          <div className="space-y-3 p-3">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Layout
              <select
                value={selectedColumnsBlock.columnCount}
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
        ) : selectedChoiceBlock ? (
          <div className="space-y-3 p-3">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Labels
              <select
                value={normalizeChoiceNumberingStyle(selectedChoiceBlock.numberingStyle)}
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
                value={normalizeChoiceListLayout(selectedChoiceBlock.layout)}
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
        ) : selectedTableBlock ? (
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 2xl:grid-cols-1">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Position
              <select
                value={selectedTableBlock.tableAlign}
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
                value={selectedTableBlock.cellAlignment}
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
                value={selectedTableRows.length}
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
                value={selectedTableColumnCount}
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
        ) : selectedSpaceBlock ? (
          <div className="space-y-3 p-3">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Lines
              <input
                type="number"
                min={0}
                step={1}
                value={inspectorSpaceLines(selectedSpaceBlock.lines)}
                aria-label={`${selectedBlock.label} lines`}
                onChange={(event) => onBlockChange(selectedBlock, { lines: inspectorSpaceLines(event.currentTarget.valueAsNumber) })}
                className={controlClassName}
              />
            </label>
          </div>
        ) : selectedDiagramBlock && selectedDiagramConfig ? (
          <div className="space-y-3 p-3">
            {!selectedGraphFunction && !selectedGraphFeature && !selectedGeometryChild ? (
              <>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                  Type
                  <select
                    value={selectedDiagramConfig.type ?? "graph2d"}
                    aria-label={`${selectedBlock.label} type`}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(selectedDiagramConfig, diagramTypePatch(event.target.value, selectedDiagramConfig)),
                      })
                    }
                    className={controlClassName}
                  >
                    {DIAGRAM_TYPE_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.values.map((value) => {
                          const diagramType = DIAGRAM_TYPES.find((candidate) => candidate.value === value);
                          if (!diagramType) return null;
                          return (
                            <option key={diagramType.value} value={diagramType.value}>
                              {diagramType.label}
                            </option>
                          );
                        })}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                  Position
                  <select
                    value={normalizeDiagramAlignment(selectedDiagramBlock.diagramAlign)}
                    aria-label={`${selectedBlock.label} position`}
                    onChange={(event) => onBlockChange(selectedBlock, { diagramAlign: event.target.value as DiagramAlignment })}
                    className={controlClassName}
                  >
                    {DIAGRAM_ALIGNMENTS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            {selectedDiagramConfig.type === "geometry2d" ? (
              <Geometry2DInspector
                selectedBlock={selectedBlock}
                selectedDiagramConfig={selectedDiagramConfig}
                controlClassName={controlClassName}
                checkboxLabelClassName={checkboxLabelClassName}
                selectedGeometryChild={selectedGeometryChild}
                activeAnchor={activeAnchor}
                onActivateAnchor={onActivateAnchor}
                onBlockChange={onBlockChange}
                updateGraphConfig={updateGraphConfig}
              />
            ) : isInspectorPenroseDiagramType(selectedDiagramConfig.type) ? (
              <div className="space-y-3 border-t pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {selectedDiagramConfig.type === "network"
                    ? "Network settings"
                    : selectedDiagramConfig.type === "setDiagram"
                      ? "Set diagram settings"
                      : "Penrose settings"}
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Scale
                    <input
                      type="number"
                      min={25}
                      max={250}
                      step={5}
                      value={inspectorNumberInputValue(penroseScalePercent(selectedDiagramConfig))}
                      aria-label={`${selectedBlock.label} Penrose scale`}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(
                            selectedDiagramConfig,
                            penroseScalePatch(
                              selectedDiagramConfig,
                              inspectorOptionalNumber(event.target.value) ?? DEFAULT_PENROSE_SCALE_PERCENT,
                            ),
                          ),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-end"
                    onClick={() =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(
                          selectedDiagramConfig,
                          penroseScalePatch(selectedDiagramConfig, DEFAULT_PENROSE_SCALE_PERCENT),
                        ),
                      })
                    }
                  >
                    Original
                  </Button>
                </div>
                {selectedDiagramConfig.type === "geometricConstruction" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(selectedDiagramConfig, penroseResamplePatch(selectedDiagramConfig)),
                      })
                    }
                  >
                    <Shuffle className="mr-2 size-4" aria-hidden="true" />
                    Resample
                  </Button>
                ) : null}
                {selectedDiagramConfig.type === "network" && selectedNetworkData ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, networkPresetPatch(selectedDiagramConfig)),
                        })
                      }
                    >
                      Network preset
                    </Button>
                    <label className={checkboxLabelClassName}>
                      <input
                        type="checkbox"
                        checked={!selectedNetworkData.hidePoints}
                        aria-label={`${selectedBlock.label} show node dots`}
                        onChange={(event) =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(
                              selectedDiagramConfig,
                              networkVisibilityPatch(selectedDiagramConfig, { hidePoints: !event.target.checked }),
                            ),
                          })
                        }
                      />
                      Show node dots
                    </label>
                    <label className={checkboxLabelClassName}>
                      <input
                        type="checkbox"
                        checked={!selectedNetworkData.hidePointLabels}
                        aria-label={`${selectedBlock.label} show node labels`}
                        onChange={(event) =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(
                              selectedDiagramConfig,
                              networkVisibilityPatch(selectedDiagramConfig, { hidePointLabels: !event.target.checked }),
                            ),
                          })
                        }
                      />
                      Show node labels
                    </label>
                  </>
                ) : null}
                {selectedDiagramConfig.type === "setDiagram" ? (
                  <>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 2xl:grid-cols-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(selectedDiagramConfig, setDiagramNotationPatch(selectedDiagramConfig)),
                          })
                        }
                      >
                        Set notation
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(selectedDiagramConfig, setDiagramCountLabelsPatch(selectedDiagramConfig, false)),
                          })
                        }
                      >
                        Counts
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(selectedDiagramConfig, setDiagramCountLabelsPatch(selectedDiagramConfig, true)),
                          })
                        }
                      >
                        Counts + totals
                      </Button>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="text-xs font-semibold text-muted-foreground">Shading</div>
                      <div className="grid grid-cols-2 gap-2">
                        {INSPECTOR_SET_SHADING_OPTIONS.map((option) => (
                          <Button
                            key={`${option.label}-${option.regionIndex ?? "none"}`}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              onBlockChange(selectedBlock, {
                                graphConfig: updateGraphConfig(
                                  selectedDiagramConfig,
                                  setDiagramShadingPatch(selectedDiagramConfig, option.regionIndex),
                                ),
                              })
                            }
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            ) : selectedDiagramConfig.type === "image" && selectedImageData ? (
              <div className="space-y-3 border-t pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Image settings</div>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                  Name
                  <input
                    value={selectedImageData.name}
                    aria-label={`${selectedBlock.label} image name`}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(
                          selectedDiagramConfig,
                          imageDataPatch(selectedDiagramConfig, { name: event.target.value }),
                        ),
                      })
                    }
                    className={controlClassName}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                  Alt text
                  <input
                    value={selectedImageData.alt}
                    aria-label={`${selectedBlock.label} image alt text`}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(
                          selectedDiagramConfig,
                          imageDataPatch(selectedDiagramConfig, { alt: event.target.value }),
                        ),
                      })
                    }
                    className={controlClassName}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Width
                    <input
                      type="number"
                      min={40}
                      step={20}
                      value={inspectorNumberInputValue(selectedDiagramConfig.widthPx)}
                      aria-label={`${selectedBlock.label} image width`}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            widthPx: finiteGraphNumber(event.target.value, DEFAULT_IMAGE_DIAGRAM.widthPx),
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Height
                    <input
                      type="number"
                      min={40}
                      step={20}
                      value={inspectorNumberInputValue(selectedDiagramConfig.heightPx)}
                      aria-label={`${selectedBlock.label} image height`}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            heightPx: finiteGraphNumber(event.target.value, DEFAULT_IMAGE_DIAGRAM.heightPx),
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                </div>
              </div>
            ) : selectedDiagramConfig.type === "graph2d" ? (
              <div className="space-y-3 border-t pt-3">
                {!selectedGraphFunction && !selectedGraphFeature ? (
                  <>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Graph settings</div>
                    <label className={checkboxLabelClassName}>
                      <input
                        type="checkbox"
                        checked={selectedDiagramConfig.showAxes ?? true}
                        onChange={(event) =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(selectedDiagramConfig, { showAxes: event.target.checked }),
                          })
                        }
                      />
                      Axes
                    </label>
                    <label className={checkboxLabelClassName}>
                      <input
                        type="checkbox"
                        checked={selectedDiagramConfig.showArrows ?? true}
                        onChange={(event) =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(selectedDiagramConfig, { showArrows: event.target.checked }),
                          })
                        }
                      />
                      Axis arrows
                    </label>
                    <label className={checkboxLabelClassName}>
                      <input
                        type="checkbox"
                        checked={selectedDiagramConfig.showAxisLabels ?? true}
                        onChange={(event) =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(selectedDiagramConfig, { showAxisLabels: event.target.checked }),
                          })
                        }
                      />
                      Axis labels
                    </label>
                    <label className={checkboxLabelClassName}>
                      <input
                        type="checkbox"
                        checked={selectedDiagramConfig.showAxisNumbers ?? true}
                        onChange={(event) =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(selectedDiagramConfig, { showAxisNumbers: event.target.checked }),
                          })
                        }
                      />
                      Axis numbers
                    </label>
                    <label className={checkboxLabelClassName}>
                      <input
                        type="checkbox"
                        checked={selectedDiagramConfig.showFunctionArrows ?? true}
                        onChange={(event) =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(selectedDiagramConfig, { showFunctionArrows: event.target.checked }),
                          })
                        }
                      />
                      Function arrows
                    </label>
                  </>
                ) : null}
                {selectedGraphFunction ? (
                  <div className="space-y-2 border-t pt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Function display</div>
                    <div className="space-y-2">
                      {[selectedGraphFunction].map(({ graphFunction, functionIndex }) => {
                        const functionLabel = graphFunction.label || graphFunctionLabel(functionIndex);
                        const functionDomainMode = graphFunction.domainMode ?? "auto";
                        return (
                          <details
                            open
                            key={graphFunction.id ?? `function-${functionIndex}`}
                            className="rounded-md border bg-muted/20 px-2 py-2"
                          >
                            <summary className="cursor-pointer text-xs font-semibold text-foreground">
                              {graphFunctionInspectorLabel(graphFunction, functionIndex)}
                            </summary>
                            <div className="mt-2 space-y-2">
                              <label className={checkboxLabelClassName}>
                                <input
                                  type="checkbox"
                                  checked={graphFunction.show ?? true}
                                  aria-label={`${selectedBlock.label} function ${functionIndex + 1} visible`}
                                  onChange={(event) =>
                                    onBlockChange(selectedBlock, {
                                      graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                        functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                          show: event.target.checked,
                                        }),
                                      }),
                                    })
                                  }
                                />
                                Visible
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                  Label
                                  <input
                                    value={functionLabel}
                                    aria-label={`${selectedBlock.label} function ${functionIndex + 1} label`}
                                    onChange={(event) =>
                                      onBlockChange(selectedBlock, {
                                        graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                          functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                            label: event.target.value,
                                          }),
                                        }),
                                      })
                                    }
                                    className={controlClassName}
                                  />
                                </label>
                                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                  Colour
                                  <input
                                    type="color"
                                    value={graphFunction.color ?? GRAPH_COLORS[functionIndex % GRAPH_COLORS.length]}
                                    aria-label={`${selectedBlock.label} function ${functionIndex + 1} colour`}
                                    onChange={(event) =>
                                      onBlockChange(selectedBlock, {
                                        graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                          functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                            color: event.target.value,
                                          }),
                                        }),
                                      })
                                    }
                                    className="h-9 w-full rounded-md border border-input bg-background p-1"
                                  />
                                </label>
                                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                  Weight
                                  <input
                                    type="number"
                                    min={0.5}
                                    max={10}
                                    step={0.5}
                                    value={inspectorNumberInputValue(graphFunction.strokeWidth)}
                                    aria-label={`${selectedBlock.label} function ${functionIndex + 1} weight`}
                                    onChange={(event) =>
                                      onBlockChange(selectedBlock, {
                                        graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                          functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                            strokeWidth: inspectorOptionalNumber(event.target.value),
                                          }),
                                        }),
                                      })
                                    }
                                    className={controlClassName}
                                  />
                                </label>
                                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                  Line style
                                  <select
                                    value={graphFunction.strokeStyle ?? "solid"}
                                    aria-label={`${selectedBlock.label} function ${functionIndex + 1} line style`}
                                    onChange={(event) =>
                                      onBlockChange(selectedBlock, {
                                        graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                          functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                            strokeStyle: event.target.value as NonNullable<GraphFunction["strokeStyle"]>,
                                          }),
                                        }),
                                      })
                                    }
                                    className={controlClassName}
                                  >
                                    {GRAPH_LINE_STYLES.map((style) => (
                                      <option key={style.value} value={style.value}>
                                        {style.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              {graphFunction.kind !== "piecewise" ? (
                                <div className="grid grid-cols-2 gap-2 border-t pt-2">
                                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                    Domain
                                    <select
                                      value={functionDomainMode}
                                      aria-label={`${selectedBlock.label} function ${functionIndex + 1} domain`}
                                      onChange={(event) => {
                                        const domainMode = event.target.value as NonNullable<GraphFunction["domainMode"]>;
                                        onBlockChange(selectedBlock, {
                                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                            functions: graphFunctionPatch(
                                              selectedGraphFunctions,
                                              functionIndex,
                                              domainMode === "manual"
                                                ? {
                                                    domainMode,
                                                    domainMin: graphFunction.domainMin ?? selectedDiagramConfig.xMin,
                                                    domainMax: graphFunction.domainMax ?? selectedDiagramConfig.xMax,
                                                  }
                                                : { domainMode },
                                            ),
                                          }),
                                        });
                                      }}
                                      className={controlClassName}
                                    >
                                      <option value="auto">Auto</option>
                                      <option value="manual">Manual</option>
                                    </select>
                                  </label>
                                  {functionDomainMode === "manual" ? (
                                    <>
                                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                        Left x
                                        <input
                                          type="number"
                                          step={0.5}
                                          value={inspectorNumberInputValue(graphFunction.domainMin ?? selectedDiagramConfig.xMin)}
                                          aria-label={`${selectedBlock.label} function ${functionIndex + 1} left domain`}
                                          onChange={(event) =>
                                            onBlockChange(selectedBlock, {
                                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                                functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                                  domainMin: inspectorOptionalNumber(event.target.value),
                                                }),
                                              }),
                                            })
                                          }
                                          className={controlClassName}
                                        />
                                      </label>
                                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                        Right x
                                        <input
                                          type="number"
                                          step={0.5}
                                          value={inspectorNumberInputValue(graphFunction.domainMax ?? selectedDiagramConfig.xMax)}
                                          aria-label={`${selectedBlock.label} function ${functionIndex + 1} right domain`}
                                          onChange={(event) =>
                                            onBlockChange(selectedBlock, {
                                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                                functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                                  domainMax: inspectorOptionalNumber(event.target.value),
                                                }),
                                              }),
                                            })
                                          }
                                          className={controlClassName}
                                        />
                                      </label>
                                    </>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="space-y-2 border-t pt-2">
                                <label className={checkboxLabelClassName}>
                                  <input
                                    type="checkbox"
                                    checked={graphFunction.showLabel ?? false}
                                    aria-label={`${selectedBlock.label} function ${functionIndex + 1} graph label`}
                                    onChange={(event) =>
                                      onBlockChange(selectedBlock, {
                                        graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                          functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                            showLabel: event.target.checked,
                                          }),
                                        }),
                                      })
                                    }
                                  />
                                  Graph label
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                    Label style
                                    <select
                                      value={graphFunction.labelMode ?? "equation"}
                                      aria-label={`${selectedBlock.label} function ${functionIndex + 1} graph label style`}
                                      onChange={(event) =>
                                        onBlockChange(selectedBlock, {
                                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                            functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                              labelMode: event.target.value as NonNullable<GraphFunction["labelMode"]>,
                                            }),
                                          }),
                                        })
                                      }
                                      className={controlClassName}
                                    >
                                      <option value="equation">Equation</option>
                                      <option value="name">Name only</option>
                                    </select>
                                  </label>
                                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                    Label x
                                    <input
                                      type="number"
                                      step={0.5}
                                      value={inspectorNumberInputValue(graphFunction.labelX)}
                                      aria-label={`${selectedBlock.label} function ${functionIndex + 1} label x`}
                                      onChange={(event) =>
                                        onBlockChange(selectedBlock, {
                                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                            functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                              labelX: inspectorOptionalNumber(event.target.value),
                                            }),
                                          }),
                                        })
                                      }
                                      className={controlClassName}
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                    Label y
                                    <input
                                      type="number"
                                      step={0.5}
                                      value={inspectorNumberInputValue(graphFunction.labelY)}
                                      aria-label={`${selectedBlock.label} function ${functionIndex + 1} label y`}
                                      onChange={(event) =>
                                        onBlockChange(selectedBlock, {
                                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                            functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                              labelY: inspectorOptionalNumber(event.target.value),
                                            }),
                                          }),
                                        })
                                      }
                                      className={controlClassName}
                                    />
                                  </label>
                                </div>
                              </div>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {selectedGraphFeature ? (
                  <div className="space-y-2 border-t pt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Feature display</div>
                    <div className="space-y-2">
                      {[selectedGraphFeature].map(({ feature, featureIndex }) => {
                        const isFreeLabel = feature.kind === "label";
                        const featureStrokeStyle = feature.strokeStyle ?? (isRegionFeatureKind(feature.kind) ? "none" : "solid");
                        const featureLineStyles = isRegionFeatureKind(feature.kind) ? GRAPH_FEATURE_LINE_STYLES : GRAPH_LINE_STYLES;
                        const functionOptions = selectedGraphFunctions.map((graphFunction, index) => ({
                          value: index,
                          label: `${index + 1}: ${graphFunction.label || graphFunctionLabel(index)}`,
                        }));
                        return (
                          <details open key={feature.id ?? `feature-${featureIndex}`} className="rounded-md border bg-muted/20 px-2 py-2">
                            <summary className="cursor-pointer text-xs font-semibold text-foreground">
                              {graphFeatureInspectorLabel(feature, featureIndex)}
                            </summary>
                            <div className="mt-2 space-y-2">
                              <div className="space-y-2">
                                <label className={checkboxLabelClassName}>
                                  <input
                                    type="checkbox"
                                    checked={feature.show ?? true}
                                    aria-label={`${selectedBlock.label} feature ${featureIndex + 1} visible`}
                                    onChange={(event) =>
                                      onBlockChange(selectedBlock, {
                                        graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                          features: graphFeaturePatch(selectedGraphFeatures, featureIndex, { show: event.target.checked }),
                                        }),
                                      })
                                    }
                                  />
                                  Visible
                                </label>
                                <label className={checkboxLabelClassName}>
                                  <input
                                    type="checkbox"
                                    checked={feature.solutionOnly === true}
                                    aria-label={`${selectedBlock.label} feature ${featureIndex + 1} show in solutions only`}
                                    onChange={(event) =>
                                      onBlockChange(selectedBlock, {
                                        graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                          features: graphFeatureSolutionOnlyPatch(
                                            selectedGraphFeatures,
                                            featureIndex,
                                            event.target.checked,
                                          ),
                                        }),
                                      })
                                    }
                                  />
                                  Show in solutions only
                                </label>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                  {isFreeLabel ? "LaTeX label" : "Label"}
                                  <input
                                    value={feature.label ?? ""}
                                    aria-label={`${selectedBlock.label} feature ${featureIndex + 1} label`}
                                    onChange={(event) =>
                                      onBlockChange(selectedBlock, {
                                        graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                          features: graphFeaturePatch(selectedGraphFeatures, featureIndex, { label: event.target.value }),
                                        }),
                                      })
                                    }
                                    className={controlClassName}
                                  />
                                </label>
                                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                  Colour
                                  <input
                                    type="color"
                                    value={feature.color ?? GRAPH_COLORS[featureIndex % GRAPH_COLORS.length]}
                                    aria-label={`${selectedBlock.label} feature ${featureIndex + 1} colour`}
                                    onChange={(event) =>
                                      onBlockChange(selectedBlock, {
                                        graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                          features: graphFeaturePatch(selectedGraphFeatures, featureIndex, { color: event.target.value }),
                                        }),
                                      })
                                    }
                                    className="h-9 w-full rounded-md border border-input bg-background p-1"
                                  />
                                </label>
                                {isFreeLabel ? null : (
                                  <>
                                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                      Label display
                                      <select
                                        value={feature.labelMode ?? "name"}
                                        aria-label={`${selectedBlock.label} feature ${featureIndex + 1} label display`}
                                        onChange={(event) =>
                                          onBlockChange(selectedBlock, {
                                            graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                              features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                                labelMode: event.target.value as NonNullable<GraphFeature["labelMode"]>,
                                              }),
                                            }),
                                          })
                                        }
                                        className={controlClassName}
                                      >
                                        {graphFeatureLabelModeOptions(feature).map((mode) => (
                                          <option key={mode.value} value={mode.value}>
                                            {mode.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                      Line style
                                      <select
                                        value={featureStrokeStyle}
                                        aria-label={`${selectedBlock.label} feature ${featureIndex + 1} line style`}
                                        onChange={(event) =>
                                          onBlockChange(selectedBlock, {
                                            graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                              features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                                strokeStyle: event.target.value as NonNullable<GraphFeature["strokeStyle"]>,
                                              }),
                                            }),
                                          })
                                        }
                                        className={controlClassName}
                                      >
                                        {featureLineStyles.map((style) => (
                                          <option key={style.value} value={style.value}>
                                            {style.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                      Weight
                                      <input
                                        type="number"
                                        min={0.5}
                                        max={10}
                                        step={0.5}
                                        value={inspectorNumberInputValue(feature.strokeWidth)}
                                        disabled={featureStrokeStyle === "none"}
                                        aria-label={`${selectedBlock.label} feature ${featureIndex + 1} weight`}
                                        onChange={(event) =>
                                          onBlockChange(selectedBlock, {
                                            graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                              features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                                strokeWidth: inspectorOptionalNumber(event.target.value),
                                              }),
                                            }),
                                          })
                                        }
                                        className={cn(controlClassName, "disabled:cursor-not-allowed disabled:opacity-60")}
                                      />
                                    </label>
                                  </>
                                )}
                                {isRegionFeatureKind(feature.kind) ? (
                                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                    Opacity
                                    <input
                                      type="number"
                                      min={0.05}
                                      max={0.8}
                                      step={0.05}
                                      value={inspectorNumberInputValue(feature.fillOpacity)}
                                      aria-label={`${selectedBlock.label} feature ${featureIndex + 1} fill opacity`}
                                      onChange={(event) =>
                                        onBlockChange(selectedBlock, {
                                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                            features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                              fillOpacity: inspectorOptionalNumber(event.target.value),
                                            }),
                                          }),
                                        })
                                      }
                                      className={controlClassName}
                                    />
                                  </label>
                                ) : null}
                              </div>
                              {feature.kind === "point" || feature.kind === "label" ? (
                                <div className="grid grid-cols-2 gap-2 border-t pt-2">
                                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                    x
                                    <input
                                      type="number"
                                      step={0.5}
                                      value={inspectorNumberInputValue(feature.x)}
                                      aria-label={`${selectedBlock.label} feature ${featureIndex + 1} x`}
                                      onChange={(event) =>
                                        onBlockChange(selectedBlock, {
                                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                            features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                              x: inspectorOptionalNumber(event.target.value),
                                            }),
                                          }),
                                        })
                                      }
                                      className={controlClassName}
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                    y
                                    <input
                                      type="number"
                                      step={0.5}
                                      value={inspectorNumberInputValue(feature.y)}
                                      aria-label={`${selectedBlock.label} feature ${featureIndex + 1} y`}
                                      onChange={(event) =>
                                        onBlockChange(selectedBlock, {
                                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                            features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                              y: inspectorOptionalNumber(event.target.value),
                                            }),
                                          }),
                                        })
                                      }
                                      className={controlClassName}
                                    />
                                  </label>
                                </div>
                              ) : null}
                              {feature.kind === "line_segment" ? (
                                <div className="grid grid-cols-2 gap-2 border-t pt-2">
                                  <label className="col-span-2 flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                    Span
                                    <select
                                      value={feature.span ?? "manual"}
                                      aria-label={`${selectedBlock.label} feature ${featureIndex + 1} span`}
                                      onChange={(event) =>
                                        onBlockChange(selectedBlock, {
                                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                            features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                              span: event.target.value as NonNullable<GraphFeature["span"]>,
                                            }),
                                          }),
                                        })
                                      }
                                      className={controlClassName}
                                    >
                                      <option value="manual">Manual endpoints</option>
                                      <option value="grid">Span grid</option>
                                    </select>
                                  </label>
                                  {[
                                    ["Start x", "x1"],
                                    ["Start y", "y1"],
                                    ["End x", "x2"],
                                    ["End y", "y2"],
                                  ].map(([label, field]) => (
                                    <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                      {label}
                                      <input
                                        type="number"
                                        step={0.5}
                                        value={inspectorNumberInputValue(feature[field as keyof GraphFeature] as number | undefined)}
                                        aria-label={`${selectedBlock.label} feature ${featureIndex + 1} ${label.toLowerCase()}`}
                                        onChange={(event) =>
                                          onBlockChange(selectedBlock, {
                                            graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                              features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                                [field]: inspectorOptionalNumber(event.target.value),
                                              }),
                                            }),
                                          })
                                        }
                                        className={controlClassName}
                                      />
                                    </label>
                                  ))}
                                </div>
                              ) : null}
                              {feature.kind === "angle_marker" ? (
                                <div className="grid grid-cols-2 gap-2 border-t pt-2">
                                  <label className={cn(checkboxLabelClassName, "col-span-2")}>
                                    <input
                                      type="checkbox"
                                      checked={feature.rightAngle === true}
                                      aria-label={`${selectedBlock.label} feature ${featureIndex + 1} right angle`}
                                      onChange={(event) =>
                                        onBlockChange(selectedBlock, {
                                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                            features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                              rightAngle: event.target.checked,
                                            }),
                                          }),
                                        })
                                      }
                                    />
                                    Right angle square
                                  </label>
                                  {[
                                    ["Vertex x", "x"],
                                    ["Vertex y", "y"],
                                    ["First arm x", "x1"],
                                    ["First arm y", "y1"],
                                    ["Second arm x", "x2"],
                                    ["Second arm y", "y2"],
                                    ["Radius", "size"],
                                  ].map(([label, field]) => (
                                    <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                      {label}
                                      <input
                                        type="number"
                                        min={field === "size" ? 0.05 : undefined}
                                        step={field === "size" ? 0.05 : 0.5}
                                        value={inspectorNumberInputValue(feature[field as keyof GraphFeature] as number | undefined)}
                                        aria-label={`${selectedBlock.label} feature ${featureIndex + 1} ${label.toLowerCase()}`}
                                        onChange={(event) =>
                                          onBlockChange(selectedBlock, {
                                            graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                              features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                                [field]: inspectorOptionalNumber(event.target.value),
                                              } as Partial<GraphFeature>),
                                            }),
                                          })
                                        }
                                        className={controlClassName}
                                      />
                                    </label>
                                  ))}
                                </div>
                              ) : null}
                              {feature.kind === "region_between_curves" || feature.kind === "intersection" ? (
                                <div className="grid grid-cols-2 gap-2 border-t pt-2">
                                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                    First function
                                    <select
                                      value={feature.functionAIndex ?? 0}
                                      aria-label={`${selectedBlock.label} feature ${featureIndex + 1} first function`}
                                      onChange={(event) =>
                                        onBlockChange(selectedBlock, {
                                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                            features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                              functionAIndex: Number(event.target.value),
                                            }),
                                          }),
                                        })
                                      }
                                      className={controlClassName}
                                    >
                                      {functionOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  {feature.kind === "intersection" ? (
                                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                      Intersect with
                                      <select
                                        value={feature.intersectionTarget ?? "function"}
                                        aria-label={`${selectedBlock.label} feature ${featureIndex + 1} intersection target`}
                                        onChange={(event) =>
                                          onBlockChange(selectedBlock, {
                                            graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                              features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                                intersectionTarget: event.target.value as NonNullable<GraphFeature["intersectionTarget"]>,
                                              }),
                                            }),
                                          })
                                        }
                                        className={controlClassName}
                                      >
                                        {GRAPH_INTERSECTION_TARGETS.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  ) : null}
                                  {feature.kind === "region_between_curves" ||
                                  (feature.kind === "intersection" && (feature.intersectionTarget ?? "function") === "function") ? (
                                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                      Second function
                                      <select
                                        value={feature.functionBIndex ?? 1}
                                        aria-label={`${selectedBlock.label} feature ${featureIndex + 1} second function`}
                                        onChange={(event) =>
                                          onBlockChange(selectedBlock, {
                                            graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                              features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                                functionBIndex: Number(event.target.value),
                                              }),
                                            }),
                                          })
                                        }
                                        className={controlClassName}
                                      >
                                        {functionOptions.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  ) : null}
                                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                    From x
                                    <input
                                      type="number"
                                      step={0.5}
                                      value={inspectorNumberInputValue(feature.xMin)}
                                      aria-label={`${selectedBlock.label} feature ${featureIndex + 1} from x`}
                                      onChange={(event) =>
                                        onBlockChange(selectedBlock, {
                                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                            features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                              xMin: inspectorOptionalNumber(event.target.value),
                                            }),
                                          }),
                                        })
                                      }
                                      className={controlClassName}
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                    To x
                                    <input
                                      type="number"
                                      step={0.5}
                                      value={inspectorNumberInputValue(feature.xMax)}
                                      aria-label={`${selectedBlock.label} feature ${featureIndex + 1} to x`}
                                      onChange={(event) =>
                                        onBlockChange(selectedBlock, {
                                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                            features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                              xMax: inspectorOptionalNumber(event.target.value),
                                            }),
                                          }),
                                        })
                                      }
                                      className={controlClassName}
                                    />
                                  </label>
                                </div>
                              ) : null}
                              {feature.kind === "region_curve_axis" || feature.kind === "turning_point" || feature.kind === "tangent" ? (
                                <div className="grid grid-cols-2 gap-2 border-t pt-2">
                                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                    Function
                                    <select
                                      value={feature.functionIndex ?? 0}
                                      aria-label={`${selectedBlock.label} feature ${featureIndex + 1} function`}
                                      onChange={(event) =>
                                        onBlockChange(selectedBlock, {
                                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                            features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                              functionIndex: Number(event.target.value),
                                            }),
                                          }),
                                        })
                                      }
                                      className={controlClassName}
                                    >
                                      {functionOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  {feature.kind === "region_curve_axis" ? (
                                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                      Axis
                                      <select
                                        value={feature.axis ?? "x"}
                                        aria-label={`${selectedBlock.label} feature ${featureIndex + 1} axis`}
                                        onChange={(event) =>
                                          onBlockChange(selectedBlock, {
                                            graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                              features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                                axis: event.target.value as NonNullable<GraphFeature["axis"]>,
                                              }),
                                            }),
                                          })
                                        }
                                        className={controlClassName}
                                      >
                                        <option value="x">x-axis</option>
                                        <option value="y">y-axis</option>
                                      </select>
                                    </label>
                                  ) : null}
                                  {feature.kind === "tangent" ? (
                                    <>
                                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                        x
                                        <input
                                          type="number"
                                          step={0.5}
                                          value={inspectorNumberInputValue(feature.x)}
                                          aria-label={`${selectedBlock.label} feature ${featureIndex + 1} tangent x`}
                                          onChange={(event) =>
                                            onBlockChange(selectedBlock, {
                                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                                features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                                  x: inspectorOptionalNumber(event.target.value),
                                                }),
                                              }),
                                            })
                                          }
                                          className={controlClassName}
                                        />
                                      </label>
                                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                        y
                                        <input
                                          type="number"
                                          step={0.5}
                                          value={inspectorNumberInputValue(feature.y)}
                                          aria-label={`${selectedBlock.label} feature ${featureIndex + 1} tangent y`}
                                          onChange={(event) =>
                                            onBlockChange(selectedBlock, {
                                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                                features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                                  y: inspectorOptionalNumber(event.target.value),
                                                }),
                                              }),
                                            })
                                          }
                                          className={controlClassName}
                                        />
                                      </label>
                                    </>
                                  ) : (
                                    <>
                                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                        From x
                                        <input
                                          type="number"
                                          step={0.5}
                                          value={inspectorNumberInputValue(feature.xMin)}
                                          aria-label={`${selectedBlock.label} feature ${featureIndex + 1} from x`}
                                          onChange={(event) =>
                                            onBlockChange(selectedBlock, {
                                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                                features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                                  xMin: inspectorOptionalNumber(event.target.value),
                                                }),
                                              }),
                                            })
                                          }
                                          className={controlClassName}
                                        />
                                      </label>
                                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                        To x
                                        <input
                                          type="number"
                                          step={0.5}
                                          value={inspectorNumberInputValue(feature.xMax)}
                                          aria-label={`${selectedBlock.label} feature ${featureIndex + 1} to x`}
                                          onChange={(event) =>
                                            onBlockChange(selectedBlock, {
                                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                                features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                                  xMax: inspectorOptionalNumber(event.target.value),
                                                }),
                                              }),
                                            })
                                          }
                                          className={controlClassName}
                                        />
                                      </label>
                                    </>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {!selectedGraphFunction && !selectedGraphFeature ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                        Domain min
                        <input
                          type="number"
                          value={inspectorNumberInputValue(selectedDiagramConfig.xMin)}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, { xMin: inspectorOptionalNumber(event.target.value) }),
                            })
                          }
                          className={controlClassName}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                        Domain max
                        <input
                          type="number"
                          value={inspectorNumberInputValue(selectedDiagramConfig.xMax)}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, { xMax: inspectorOptionalNumber(event.target.value) }),
                            })
                          }
                          className={controlClassName}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                        Range min
                        <input
                          type="number"
                          value={inspectorNumberInputValue(selectedDiagramConfig.yMin)}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, { yMin: inspectorOptionalNumber(event.target.value) }),
                            })
                          }
                          className={controlClassName}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                        Range max
                        <input
                          type="number"
                          value={inspectorNumberInputValue(selectedDiagramConfig.yMax)}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, { yMax: inspectorOptionalNumber(event.target.value) }),
                            })
                          }
                          className={controlClassName}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                        Width
                        <input
                          type="number"
                          min={240}
                          step={20}
                          value={inspectorNumberInputValue(selectedDiagramConfig.widthPx)}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(
                                selectedDiagramConfig,
                                graphInspectorWidthPatch(selectedDiagramConfig, event.target.value, lockedAspectHeight),
                              ),
                            })
                          }
                          className={controlClassName}
                        />
                      </label>
                      {selectedDiagramConfig.equalScale || selectedDiagramConfig.lockAspectRatio ? (
                        <div className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                          Height
                          <div className="flex h-9 items-center rounded-md border border-input bg-muted px-2 text-sm font-normal text-muted-foreground">
                            {Math.round(graphHeight(selectedDiagramConfig))} px
                          </div>
                        </div>
                      ) : (
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                          Height
                          <input
                            type="number"
                            min={160}
                            step={20}
                            value={inspectorNumberInputValue(selectedDiagramConfig.heightPx)}
                            onChange={(event) =>
                              onBlockChange(selectedBlock, {
                                graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                  heightPx: inspectorOptionalNumber(event.target.value),
                                }),
                              })
                            }
                            className={controlClassName}
                          />
                        </label>
                      )}
                    </div>
                    <label className={checkboxLabelClassName}>
                      <input
                        type="checkbox"
                        checked={(selectedDiagramConfig.lockAspectRatio ?? false) && !(selectedDiagramConfig.equalScale ?? false)}
                        onChange={(event) =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(selectedDiagramConfig, {
                              lockAspectRatio: event.target.checked,
                              equalScale: event.target.checked ? false : selectedDiagramConfig.equalScale,
                            }),
                          })
                        }
                      />
                      Lock ratio
                    </label>
                    <label className={checkboxLabelClassName}>
                      <input
                        type="checkbox"
                        checked={selectedDiagramConfig.equalScale ?? false}
                        onChange={(event) =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(selectedDiagramConfig, {
                              equalScale: event.target.checked,
                              lockAspectRatio: event.target.checked ? false : selectedDiagramConfig.lockAspectRatio,
                            }),
                          })
                        }
                      />
                      1:1 scale
                    </label>
                    <label className={checkboxLabelClassName}>
                      <input
                        type="checkbox"
                        checked={selectedDiagramConfig.showMajorGrid ?? true}
                        onChange={(event) =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(selectedDiagramConfig, { showMajorGrid: event.target.checked, showGrid: true }),
                          })
                        }
                      />
                      Major grid
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                        X major
                        <input
                          type="number"
                          min={0.1}
                          step={0.5}
                          value={inspectorNumberInputValue(selectedDiagramConfig.gridMajorStepX ?? selectedDiagramConfig.gridMajorStep)}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                gridMajorStepX: inspectorOptionalNumber(event.target.value),
                              }),
                            })
                          }
                          className={controlClassName}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                        Y major
                        <input
                          type="number"
                          min={0.1}
                          step={0.5}
                          value={inspectorNumberInputValue(selectedDiagramConfig.gridMajorStepY ?? selectedDiagramConfig.gridMajorStep)}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                gridMajorStepY: inspectorOptionalNumber(event.target.value),
                              }),
                            })
                          }
                          className={controlClassName}
                        />
                      </label>
                    </div>
                    <label className={checkboxLabelClassName}>
                      <input
                        type="checkbox"
                        checked={selectedDiagramConfig.showMinorGrid ?? false}
                        onChange={(event) =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(selectedDiagramConfig, { showMinorGrid: event.target.checked, showGrid: true }),
                          })
                        }
                      />
                      Minor grid
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                        X minor
                        <input
                          type="number"
                          min={0.1}
                          step={0.5}
                          value={inspectorNumberInputValue(selectedDiagramConfig.gridMinorStepX ?? selectedDiagramConfig.gridMinorStep)}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                gridMinorStepX: inspectorOptionalNumber(event.target.value),
                              }),
                            })
                          }
                          className={controlClassName}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                        Y minor
                        <input
                          type="number"
                          min={0.1}
                          step={0.5}
                          value={inspectorNumberInputValue(selectedDiagramConfig.gridMinorStepY ?? selectedDiagramConfig.gridMinorStep)}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                gridMinorStepY: inspectorOptionalNumber(event.target.value),
                              }),
                            })
                          }
                          className={controlClassName}
                        />
                      </label>
                    </div>
                  </>
                ) : null}
              </div>
            ) : selectedDiagramConfig.type === "vector2d" ? (
              <div className="space-y-3 border-t pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vector settings</div>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                  Label style
                  <select
                    value={vector2dLabelStyle(vector2dMetadata(selectedDiagramConfig).labelStyle)}
                    aria-label={`${selectedBlock.label} vector label style`}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(
                          selectedDiagramConfig,
                          vector2dLabelStylePatch(selectedDiagramConfig, event.target.value as Vector2DLabelStyle),
                        ),
                      })
                    }
                    className={controlClassName}
                  >
                    {VECTOR_2D_LABEL_STYLES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedDiagramConfig.showAxes ?? true}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(selectedDiagramConfig, {
                          showAxes: event.target.checked,
                          showArrows: event.target.checked ? selectedDiagramConfig.showArrows : false,
                        }),
                      })
                    }
                  />
                  Axes
                </label>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedDiagramConfig.showGrid ?? true}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(selectedDiagramConfig, {
                          showGrid: event.target.checked,
                          showMajorGrid: event.target.checked,
                        }),
                      })
                    }
                  />
                  Grid
                </label>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedDiagramConfig.equalScale ?? false}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(selectedDiagramConfig, { equalScale: event.target.checked }),
                      })
                    }
                  />
                  1:1 scale
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    x min
                    <input
                      type="number"
                      value={inspectorNumberInputValue(selectedDiagramConfig.xMin)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            xMin: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.xMin,
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    x max
                    <input
                      type="number"
                      value={inspectorNumberInputValue(selectedDiagramConfig.xMax)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            xMax: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.xMax,
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    y min
                    <input
                      type="number"
                      value={inspectorNumberInputValue(selectedDiagramConfig.yMin)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            yMin: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.yMin,
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    y max
                    <input
                      type="number"
                      value={inspectorNumberInputValue(selectedDiagramConfig.yMax)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            yMax: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.yMax,
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Width
                    <input
                      type="number"
                      min={160}
                      step={20}
                      value={inspectorNumberInputValue(selectedDiagramConfig.widthPx)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            widthPx: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.widthPx,
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Height
                    <input
                      type="number"
                      min={120}
                      step={20}
                      value={inspectorNumberInputValue(selectedDiagramConfig.heightPx)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            heightPx: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.heightPx,
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                </div>
              </div>
            ) : selectedDiagramConfig.type === "graph3d" ? (
              <div className="space-y-3 border-t pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">3D settings</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Width
                    <input
                      type="number"
                      min={240}
                      step={20}
                      value={inspectorNumberInputValue(selectedDiagramConfig.widthPx)}
                      aria-label={`${selectedBlock.label} 3D width`}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            widthPx: inspectorOptionalNumber(event.target.value) ?? DEFAULT_3D_GRAPH.widthPx,
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Height
                    <input
                      type="number"
                      min={180}
                      step={20}
                      value={inspectorNumberInputValue(selectedDiagramConfig.heightPx)}
                      aria-label={`${selectedBlock.label} 3D height`}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            heightPx: inspectorOptionalNumber(event.target.value) ?? DEFAULT_3D_GRAPH.heightPx,
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Azimuth
                    <input
                      type="number"
                      step={0.05}
                      value={inspectorNumberInputValue(graph3dViewState(selectedDiagramConfig).az)}
                      aria-label={`${selectedBlock.label} 3D azimuth`}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(
                            selectedDiagramConfig,
                            graph3dViewPatch(selectedDiagramConfig, {
                              az: inspectorOptionalNumber(event.target.value) ?? DEFAULT_3D_VIEW_STATE.az,
                            }),
                          ),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Elevation
                    <input
                      type="number"
                      step={0.05}
                      value={inspectorNumberInputValue(graph3dViewState(selectedDiagramConfig).el)}
                      aria-label={`${selectedBlock.label} 3D elevation`}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(
                            selectedDiagramConfig,
                            graph3dViewPatch(selectedDiagramConfig, {
                              el: inspectorOptionalNumber(event.target.value) ?? DEFAULT_3D_VIEW_STATE.el,
                            }),
                          ),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Bank
                    <input
                      type="number"
                      step={0.05}
                      value={inspectorNumberInputValue(graph3dViewState(selectedDiagramConfig).bank)}
                      aria-label={`${selectedBlock.label} 3D bank`}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(
                            selectedDiagramConfig,
                            graph3dViewPatch(selectedDiagramConfig, {
                              bank: inspectorOptionalNumber(event.target.value) ?? DEFAULT_3D_VIEW_STATE.bank,
                            }),
                          ),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    onBlockChange(selectedBlock, {
                      graphConfig: updateGraphConfig(selectedDiagramConfig, graph3dResetViewPatch(selectedDiagramConfig)),
                    })
                  }
                >
                  Reset view
                </Button>
              </div>
            ) : selectedDiagramConfig.type === "statsChart" && selectedStatsChartSpec ? (
              <div className="space-y-3 border-t pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chart settings</div>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                  Chart type
                  <select
                    value={selectedStatsChartSpec.data.chartType}
                    aria-label={`${selectedBlock.label} chart type`}
                    onChange={(event) =>
                      updateSelectedStatsChartData(
                        defaultStatsDataForType(event.target.value as StatsChartType, selectedStatsChartSpec.data),
                      )
                    }
                    className={controlClassName}
                  >
                    {STATS_CHART_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Width
                    <input
                      type="number"
                      min={240}
                      step={20}
                      value={inspectorNumberInputValue(selectedStatsChartSpec.options?.widthPx)}
                      aria-label={`${selectedBlock.label} chart width`}
                      onChange={(event) =>
                        updateSelectedStatsChartOptions({
                          widthPx: inspectorOptionalNumber(event.target.value) ?? DEFAULT_STATS_CHART_SPEC.options?.widthPx,
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Height
                    <input
                      type="number"
                      min={180}
                      step={20}
                      value={inspectorNumberInputValue(selectedStatsChartSpec.options?.heightPx)}
                      aria-label={`${selectedBlock.label} chart height`}
                      onChange={(event) =>
                        updateSelectedStatsChartOptions({
                          heightPx: inspectorOptionalNumber(event.target.value) ?? DEFAULT_STATS_CHART_SPEC.options?.heightPx,
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                </div>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedStatsChartSpec.options?.showGrid ?? true}
                    onChange={(event) => updateSelectedStatsChartOptions({ showGrid: event.target.checked })}
                  />
                  Gridlines
                </label>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedStatsChartSpec.options?.showFill !== false}
                    onChange={(event) => updateSelectedStatsChartOptions({ showFill: event.target.checked })}
                  />
                  Fill
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Fill colour
                    <input
                      type="color"
                      value={
                        typeof selectedStatsChartSpec.options?.fillColor === "string" ? selectedStatsChartSpec.options.fillColor : "#f5f5f5"
                      }
                      aria-label={`${selectedBlock.label} fill colour`}
                      disabled={selectedStatsChartSpec.options?.showFill === false}
                      onChange={(event) => updateSelectedStatsChartOptions({ fillColor: event.target.value, showFill: true })}
                      className="h-9 rounded-md border border-input bg-background p-1 disabled:opacity-45"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Opacity
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={inspectorNumberInputValue(
                        typeof selectedStatsChartSpec.options?.fillOpacity === "number" ? selectedStatsChartSpec.options.fillOpacity : 1,
                      )}
                      aria-label={`${selectedBlock.label} fill opacity`}
                      disabled={selectedStatsChartSpec.options?.showFill === false}
                      onChange={(event) => {
                        const nextOpacity = inspectorOptionalNumber(event.target.value);
                        updateSelectedStatsChartOptions({
                          fillOpacity:
                            typeof nextOpacity === "number" && Number.isFinite(nextOpacity) ? clamp(nextOpacity, 0, 1) : undefined,
                          showFill: true,
                        });
                      }}
                      className={cn(controlClassName, "disabled:opacity-45")}
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="p-3 text-sm text-muted-foreground">No settings</div>
        )}
      </div>
    </aside>
  );
}
