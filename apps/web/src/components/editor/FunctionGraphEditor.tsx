import type { ReactNode } from "react";
import type { GraphConfig, GraphFeature, GraphFunction, GraphFunctionPiece } from "@mauth-studio/shared";
import { PlusCircle, Trash2 } from "lucide-react";

import { Latex } from "@/components/Latex";
import { CollapsiblePanel } from "@/components/editor/EditorPanels";
import { snapImplicitRelationPointAtX, snapImplicitRelationPointAtY } from "@/components/graphs/FunctionGraph";
import { Button } from "@/components/ui/button";
import { GraphAngleMarkerControls } from "@/components/editor/GraphAngleMarkerControls";
import { GraphAxisArrowControls } from "@/components/editor/GraphAxisArrowControls";
import { NumericExpressionInput } from "@/components/editor/NumericExpressionInput";
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
  createAuthoredGraphFunction,
  createAuthoredGraphFeature,
  createGraphFeature,
  createGraphPiece,
  functionSummaryLatex,
  graphFunctionLabel,
  graphFeatureReferencesFunction,
  graphHeight,
  graphPiecesFromFunction,
  isRegionFeatureKind,
  isSolutionOnlyGraphFeature,
  isSolutionOnlyGraphFunction,
  isStrokeStyledFeatureKind,
  lockedAspectHeight,
  type GraphFeatureKind,
  type GraphFunctionKind,
} from "@/lib/diagramGraph2d";
import { cn } from "@/lib/utils";

function optionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

function InlineSummaryTitle({ label, summary }: { label: ReactNode; summary?: string }) {
  const trimmedSummary = summary?.trim();

  if (!trimmedSummary) return <>{label}</>;

  return (
    <span className="flex w-full min-w-0 max-w-full items-baseline gap-1">
      <span className="shrink-0">{label}:</span>
      <span className="min-w-0 flex-1 truncate font-normal text-muted-foreground">{trimmedSummary}</span>
    </span>
  );
}

type GraphFeatureEntry = {
  feature: GraphFeature;
  featureIndex: number;
};

type GraphFeatureGroupId = "points" | "segments" | "markers" | "shading" | "labels" | "other";

const GRAPH_FEATURE_GROUPS: Array<{
  id: GraphFeatureGroupId;
  label: string;
  description: string;
}> = [
  {
    id: "points",
    label: "Points",
    description: "Manual points, intersections, and turning points",
  },
  {
    id: "segments",
    label: "Segments and tangents",
    description: "Line segments and tangent lines",
  },
  {
    id: "markers",
    label: "Markers",
    description: "Angle and construction markers",
  },
  {
    id: "shading",
    label: "Shading",
    description: "Regions between curves or against an axis",
  },
  {
    id: "labels",
    label: "Labels",
    description: "Free labels and graph annotations",
  },
  {
    id: "other",
    label: "Other",
    description: "Legacy or specialised graph features",
  },
];

function graphFeatureGroupId(feature: GraphFeature): GraphFeatureGroupId {
  if (feature.kind === "label") return "labels";
  if (feature.kind === "line_segment" || feature.kind === "tangent") return "segments";
  if (feature.kind === "angle_marker") return "markers";
  if (isRegionFeatureKind(feature.kind) || feature.kind === "region_clipped_by_curve") return "shading";
  if (
    feature.kind === "point" ||
    feature.kind === "point_between_points" ||
    feature.kind === "turning_point" ||
    feature.kind === "intersection"
  ) {
    return "points";
  }
  return "other";
}

type FunctionGraphEditorProps = {
  config: GraphConfig;
  showSolutions: boolean;
  settingsMode?: "inline" | "inspector";
  anchor?: string;
  activeAnchor?: string;
  onActivateAnchor?: (anchor: string) => void;
  onChange: (patch: Partial<GraphConfig>) => void;
};

export function FunctionGraphEditor({
  config,
  showSolutions,
  settingsMode = "inline",
  anchor,
  activeAnchor,
  onActivateAnchor,
  onChange,
}: FunctionGraphEditorProps) {
  const patchConfig = onChange;
  const showInlineSettings = settingsMode === "inline";
  const updateDiagramWidth = (value: string) => {
    const widthPx = optionalNumber(value);
    if (typeof widthPx !== "number" || !Number.isFinite(widthPx)) {
      patchConfig({ widthPx });
      return;
    }
    patchConfig(config.lockAspectRatio && !config.equalScale ? { widthPx, heightPx: lockedAspectHeight(config, widthPx) } : { widthPx });
  };
  const functions = config.functions ?? [];
  const features = config.features ?? [];
  const solutionFunctionIndexes = new Set<number>();
  functions.forEach((graphFunction, functionIndex) => {
    if (isSolutionOnlyGraphFunction(graphFunction)) solutionFunctionIndexes.add(functionIndex);
  });
  const visibleFunctionEntries = functions
    .map((graphFunction, functionIndex) => ({ graphFunction, functionIndex }))
    .filter(({ graphFunction }) => showSolutions || !isSolutionOnlyGraphFunction(graphFunction));
  const visibleFeatureEntries: GraphFeatureEntry[] = features
    .map((feature, featureIndex) => ({ feature, featureIndex }))
    .filter(
      ({ feature }) =>
        showSolutions ||
        (!isSolutionOnlyGraphFeature(feature) &&
          ![...solutionFunctionIndexes].some((functionIndex) => graphFeatureReferencesFunction(feature, functionIndex))),
    );
  const visibleFeatureGroups = GRAPH_FEATURE_GROUPS.map((group) => ({
    ...group,
    entries: visibleFeatureEntries.filter(({ feature }) => graphFeatureGroupId(feature) === group.id),
  })).filter((group) => group.entries.length);
  const functionOptions = visibleFunctionEntries.map(({ graphFunction, functionIndex }) => ({
    value: functionIndex,
    label: `${functionIndex + 1}: ${graphFunction.label || graphFunctionLabel(functionIndex)}`,
  }));
  const updateFunction = (functionIndex: number, patch: Partial<GraphFunction>) => {
    patchConfig({
      functions: functions.map((graphFunction, index) => (index === functionIndex ? { ...graphFunction, ...patch } : graphFunction)),
    });
  };
  const addFunction = () => {
    patchConfig({ functions: [...functions, createAuthoredGraphFunction(functions.length, showSolutions)] });
  };
  const removeFunction = (functionIndex: number) => {
    const nextFunctions = functions.filter((_, index) => index !== functionIndex);
    patchConfig({ functions: nextFunctions });
  };
  const setFunctionKind = (functionIndex: number, kind: GraphFunctionKind) => {
    const graphFunction = functions[functionIndex];
    updateFunction(functionIndex, {
      kind,
      expression: graphFunction.expression || (kind === "relation" ? "x^2 + y^2 = 1" : "x"),
      pieces: kind === "piecewise" ? graphPiecesFromFunction(graphFunction, config) : [],
    });
  };
  const updatePiece = (functionIndex: number, pieceIndex: number, patch: Partial<GraphFunctionPiece>) => {
    const graphFunction = functions[functionIndex];
    const pieces = graphPiecesFromFunction(graphFunction, config);
    updateFunction(functionIndex, {
      pieces: pieces.map((piece, index) => (index === pieceIndex ? { ...piece, ...patch } : piece)),
    });
  };
  const addPiece = (functionIndex: number) => {
    const graphFunction = functions[functionIndex];
    const pieces = graphPiecesFromFunction(graphFunction, config);
    updateFunction(functionIndex, {
      kind: "piecewise",
      pieces: [...pieces, createGraphPiece("x", config.xMin, config.xMax)],
    });
  };
  const removePiece = (functionIndex: number, pieceIndex: number) => {
    const graphFunction = functions[functionIndex];
    const pieces = graphPiecesFromFunction(graphFunction, config).filter((_, index) => index !== pieceIndex);
    updateFunction(functionIndex, {
      pieces: pieces.length ? pieces : [createGraphPiece(graphFunction.expression || "x", config.xMin, config.xMax)],
    });
  };
  const updateFeature = (featureIndex: number, patch: Partial<GraphFeature>) => {
    patchConfig({
      features: features.map((feature, index) => (index === featureIndex ? { ...feature, ...patch } : feature)),
    });
  };
  const updateRelationTangentCoordinate = (
    featureIndex: number,
    feature: GraphFeature,
    graphFunction: GraphFunction | undefined,
    axis: "x" | "y",
    value: number | undefined,
  ) => {
    if (graphFunction?.kind !== "relation") {
      updateFeature(featureIndex, { [axis]: value });
      return;
    }

    const snapped =
      axis === "x"
        ? snapImplicitRelationPointAtX(graphFunction.expression, value, feature.y, config)
        : snapImplicitRelationPointAtY(graphFunction.expression, value, feature.x, config);
    updateFeature(
      featureIndex,
      snapped
        ? {
            x: Number(snapped[0].toFixed(6)),
            y: Number(snapped[1].toFixed(6)),
          }
        : { [axis]: value },
    );
  };
  const addFeature = () => {
    patchConfig({ features: [...features, createAuthoredGraphFeature("point", features.length, config, showSolutions)] });
  };
  const removeFeature = (featureIndex: number) => {
    patchConfig({ features: features.filter((_, index) => index !== featureIndex) });
  };
  const setFeatureKind = (featureIndex: number, kind: GraphFeatureKind) => {
    const current = features[featureIndex];
    const currentIsRegion = isRegionFeatureKind(current.kind);
    const nextIsRegion = isRegionFeatureKind(kind);
    const defaultFeature = createGraphFeature(kind, featureIndex, config);
    updateFeature(featureIndex, {
      ...defaultFeature,
      id: current.id,
      color: current.color,
      strokeWidth: currentIsRegion === nextIsRegion ? current.strokeWidth : defaultFeature.strokeWidth,
      strokeStyle:
        currentIsRegion === nextIsRegion
          ? current.strokeStyle
          : nextIsRegion
            ? "none"
            : current.strokeStyle === "none"
              ? "solid"
              : current.strokeStyle,
      show: current.show ?? true,
      solutionOnly: current.solutionOnly === true,
      label: current.label || defaultFeature.label,
      kind,
    });
  };

  return (
    <>
      {showInlineSettings ? (
        <CollapsiblePanel
          title={<InlineSummaryTitle label="Axes and grid" summary="Domain, range, graph size, grid intervals and arrows" />}
          defaultOpen={false}
          className="mt-3 bg-muted/20"
        >
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <input
                  type="checkbox"
                  checked={config.showAxes ?? true}
                  onChange={(event) => patchConfig({ showAxes: event.target.checked })}
                  aria-label="Show axes"
                />
                Axis options
              </label>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.showAxisLabels ?? true}
                    onChange={(event) => patchConfig({ showAxisLabels: event.target.checked })}
                  />
                  Axis labels
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.showAxisNumbers ?? true}
                    onChange={(event) => patchConfig({ showAxisNumbers: event.target.checked })}
                  />
                  Axis numbers
                </label>
              </div>
            </div>
            <GraphAxisArrowControls config={config} onChange={patchConfig} className="mt-3" />
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <label className="flex flex-col gap-2 text-xs font-medium">
                Domain min
                <NumericExpressionInput
                  value={config.xMin}
                  ariaLabel="Domain minimum"
                  onValueChange={(value) => patchConfig({ xMin: value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Domain max
                <NumericExpressionInput
                  value={config.xMax}
                  ariaLabel="Domain maximum"
                  onValueChange={(value) => patchConfig({ xMax: value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Range min
                <NumericExpressionInput
                  value={config.yMin}
                  ariaLabel="Range minimum"
                  onValueChange={(value) => patchConfig({ yMin: value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Range max
                <NumericExpressionInput
                  value={config.yMax}
                  ariaLabel="Range maximum"
                  onValueChange={(value) => patchConfig({ yMax: value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
            </div>
          </section>

          <div className="mt-4 flex flex-col gap-4">
            <section className="border-t pt-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Image size</div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={(config.lockAspectRatio ?? false) && !(config.equalScale ?? false)}
                      onChange={(event) =>
                        patchConfig({ lockAspectRatio: event.target.checked, equalScale: event.target.checked ? false : config.equalScale })
                      }
                    />
                    Lock ratio
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.equalScale ?? false}
                      onChange={(event) =>
                        patchConfig({
                          equalScale: event.target.checked,
                          lockAspectRatio: event.target.checked ? false : config.lockAspectRatio,
                        })
                      }
                    />
                    1:1 scale
                  </label>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Diagram width
                  <NumericExpressionInput
                    min={240}
                    step={10}
                    value={config.widthPx}
                    ariaLabel="Diagram width"
                    onValueChange={(value) => updateDiagramWidth(value === undefined ? "" : String(value))}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                {config.equalScale || config.lockAspectRatio ? (
                  <div className="flex flex-col gap-2 text-xs font-medium">
                    Diagram height
                    <div className="flex h-9 items-center rounded-md border border-input bg-muted px-2 text-sm font-normal text-muted-foreground">
                      {Math.round(graphHeight(config))} px
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Diagram height
                    <NumericExpressionInput
                      min={160}
                      step={10}
                      value={config.heightPx}
                      ariaLabel="Diagram height"
                      onValueChange={(value) => patchConfig({ heightPx: value })}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    />
                  </label>
                )}
              </div>
            </section>

            <section className="border-t pt-3">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <input
                  type="checkbox"
                  checked={config.showMajorGrid ?? true}
                  onChange={(event) => patchConfig({ showMajorGrid: event.target.checked, showGrid: true })}
                  aria-label="Show major grid"
                />
                Major grid intervals
              </label>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-xs font-medium">
                  X major interval
                  <NumericExpressionInput
                    min={0.1}
                    step={1}
                    value={config.gridMajorStepX}
                    fallbackValue={config.gridMajorStep}
                    ariaLabel="X major interval"
                    onValueChange={(value) => patchConfig({ gridMajorStepX: value, axisLabelStepX: value })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Y major interval
                  <NumericExpressionInput
                    min={0.1}
                    step={1}
                    value={config.gridMajorStepY}
                    fallbackValue={config.gridMajorStep}
                    ariaLabel="Y major interval"
                    onValueChange={(value) => patchConfig({ gridMajorStepY: value, axisLabelStepY: value })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
              </div>
            </section>

            <section className="border-t pt-3">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <input
                  type="checkbox"
                  checked={config.showMinorGrid ?? false}
                  onChange={(event) => patchConfig({ showMinorGrid: event.target.checked, showGrid: true })}
                  aria-label="Show minor grid"
                />
                Minor grid intervals
              </label>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-xs font-medium">
                  X minor interval
                  <NumericExpressionInput
                    min={0}
                    step={1}
                    value={config.gridMinorStepX}
                    fallbackValue={config.gridMinorStep}
                    ariaLabel="X minor interval"
                    onValueChange={(value) => patchConfig({ gridMinorStepX: value })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Y minor interval
                  <NumericExpressionInput
                    min={0}
                    step={1}
                    value={config.gridMinorStepY}
                    fallbackValue={config.gridMinorStep}
                    ariaLabel="Y minor interval"
                    onValueChange={(value) => patchConfig({ gridMinorStepY: value })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
              </div>
            </section>
          </div>
        </CollapsiblePanel>
      ) : null}

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-sm font-medium">Functions</div>
        <div className="flex flex-wrap items-center justify-end gap-4">
          {showInlineSettings ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.showFunctionArrows ?? true}
                onChange={(event) => patchConfig({ showFunctionArrows: event.target.checked })}
                aria-label="Show function arrows"
              />
              Function Arrows
            </label>
          ) : null}
          <Button variant="outline" size="sm" onClick={addFunction}>
            <PlusCircle data-icon="inline-start" />
            {showSolutions ? "Add solution function" : "Add function"}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {visibleFunctionEntries.map(({ graphFunction, functionIndex }) => {
          const functionAnchor = anchor ? `${anchor}/gf:${functionIndex}` : undefined;
          const pieces = graphPiecesFromFunction(graphFunction, config);
          const functionLabel = graphFunction.label || graphFunctionLabel(functionIndex);
          const functionSubtitle =
            graphFunction.kind === "piecewise"
              ? `${pieces.length} piece${pieces.length === 1 ? "" : "s"}`
              : graphFunction.kind === "relation"
                ? graphFunction.expression || "Relation"
                : graphFunction.expression || "Expression";
          const functionTitleLabel = graphFunction.kind === "relation" ? "Relation" : "Function";
          const functionDomainMode = graphFunction.domainMode ?? "auto";
          const functionTitle = (
            <span className="inline-flex min-w-0 items-baseline gap-1">
              <span className="shrink-0">
                {functionTitleLabel} {functionIndex + 1}:
              </span>
              <Latex latex={functionSummaryLatex(graphFunction)} />
              {isSolutionOnlyGraphFunction(graphFunction) ? (
                <span className="rounded border border-blue-400/40 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-300">
                  Solution
                </span>
              ) : null}
              {graphFunction.kind === "piecewise" ? <span className="font-normal text-muted-foreground">{functionSubtitle}</span> : null}
            </span>
          );

          const functionPanel = (
            <CollapsiblePanel
              key={graphFunction.id ?? `${graphFunction.label}-${functionIndex}`}
              title={functionTitle}
              leading={
                showInlineSettings ? (
                  <input
                    type="checkbox"
                    checked={graphFunction.show ?? true}
                    onChange={(event) => updateFunction(functionIndex, { show: event.target.checked })}
                    title={`Show ${functionTitleLabel.toLowerCase()} ${functionIndex + 1}`}
                    aria-label={`Show ${functionTitleLabel.toLowerCase()} ${functionIndex + 1}`}
                    className="size-4"
                  />
                ) : null
              }
              className="bg-muted/30"
              bodyClassName="p-2"
              active={functionAnchor === activeAnchor}
              actions={
                <Button
                  variant="outline"
                  size="icon"
                  title={`Remove function ${functionIndex + 1}`}
                  aria-label={`Remove function ${functionIndex + 1}`}
                  onClick={() => removeFunction(functionIndex)}
                  className="size-8"
                >
                  <Trash2 />
                </Button>
              }
            >
              <div className="graph-auto-grid graph-auto-grid-function">
                {showInlineSettings ? (
                  <>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Colour
                      <input
                        type="color"
                        value={graphFunction.color ?? GRAPH_COLORS[functionIndex % GRAPH_COLORS.length]}
                        onChange={(event) => updateFunction(functionIndex, { color: event.target.value })}
                        className="h-9 w-full rounded-md border border-input bg-background p-1"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Label
                      <input
                        value={functionLabel}
                        onChange={(event) => updateFunction(functionIndex, { label: event.target.value })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                  </>
                ) : null}
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Type
                  <select
                    value={graphFunction.kind ?? "expression"}
                    onChange={(event) => setFunctionKind(functionIndex, event.target.value as GraphFunctionKind)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  >
                    <option value="expression">Expression</option>
                    <option value="piecewise">Piecewise</option>
                    <option value="relation">Relation / Implicit</option>
                  </select>
                </label>
                {showInlineSettings ? (
                  <>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Weight
                      <NumericExpressionInput
                        min={0.5}
                        max={10}
                        step={1}
                        value={graphFunction.strokeWidth}
                        ariaLabel={`Function ${functionIndex + 1} weight`}
                        onValueChange={(value) => updateFunction(functionIndex, { strokeWidth: value })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Line style
                      <select
                        value={graphFunction.strokeStyle ?? "solid"}
                        onChange={(event) =>
                          updateFunction(functionIndex, { strokeStyle: event.target.value as NonNullable<GraphFunction["strokeStyle"]> })
                        }
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      >
                        {GRAPH_LINE_STYLES.map((style) => (
                          <option key={style.value} value={style.value}>
                            {style.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
                {graphFunction.kind === "piecewise" ? (
                  <div className="hidden md:block" aria-hidden="true" />
                ) : (
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    {graphFunction.kind === "relation" ? "Equation or relation" : "Expression"}
                    <input
                      value={graphFunction.expression}
                      onChange={(event) => updateFunction(functionIndex, { expression: event.target.value, latex: "" })}
                      placeholder={graphFunction.kind === "relation" ? "x^2 + y^2 = 1" : "x^2 - 5*x + 6"}
                      className="h-9 rounded-md border border-input bg-background px-2 font-mono text-sm font-normal"
                    />
                  </label>
                )}
              </div>

              {showInlineSettings && graphFunction.kind !== "piecewise" ? (
                <div className="graph-auto-grid mt-2 border-t pt-2">
                  <div className="flex flex-col gap-2 text-xs font-medium">
                    <span>Domain</span>
                    <select
                      value={functionDomainMode}
                      onChange={(event) => {
                        const domainMode = event.target.value as "auto" | "manual";
                        updateFunction(
                          functionIndex,
                          domainMode === "manual"
                            ? {
                                domainMode,
                                domainMin: graphFunction.domainMin ?? config.xMin,
                                domainMax: graphFunction.domainMax ?? config.xMax,
                              }
                            : { domainMode },
                        );
                      }}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    >
                      <option value="auto">Auto</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>
                  {functionDomainMode === "manual" ? (
                    <>
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        Left x
                        <NumericExpressionInput
                          step={1}
                          value={graphFunction.domainMin ?? config.xMin}
                          ariaLabel={`Function ${functionIndex + 1} left domain`}
                          onValueChange={(value) => updateFunction(functionIndex, { domainMin: value })}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        Right x
                        <NumericExpressionInput
                          step={1}
                          value={graphFunction.domainMax ?? config.xMax}
                          ariaLabel={`Function ${functionIndex + 1} right domain`}
                          onValueChange={(value) => updateFunction(functionIndex, { domainMax: value })}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                        />
                      </label>
                    </>
                  ) : null}
                </div>
              ) : null}

              {showInlineSettings ? (
                <div className="graph-auto-grid mt-2 border-t pt-2">
                  <label className="flex items-center gap-2 text-xs font-medium md:pb-2">
                    <input
                      type="checkbox"
                      checked={graphFunction.showLabel ?? false}
                      onChange={(event) => updateFunction(functionIndex, { showLabel: event.target.checked })}
                    />
                    Graph label
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Label style
                    <select
                      value={graphFunction.labelMode ?? "equation"}
                      onChange={(event) =>
                        updateFunction(functionIndex, { labelMode: event.target.value as NonNullable<GraphFunction["labelMode"]> })
                      }
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    >
                      <option value="equation">f(x)= expression</option>
                      <option value="name">Name only</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Label x
                    <NumericExpressionInput
                      step={1}
                      value={graphFunction.labelX}
                      ariaLabel={`Function ${functionIndex + 1} label x`}
                      onValueChange={(value) => updateFunction(functionIndex, { labelX: value })}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Label y
                    <NumericExpressionInput
                      step={1}
                      value={graphFunction.labelY}
                      ariaLabel={`Function ${functionIndex + 1} label y`}
                      onValueChange={(value) => updateFunction(functionIndex, { labelY: value })}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    />
                  </label>
                </div>
              ) : null}

              {graphFunction.kind === "piecewise" ? (
                <div className="mt-2 flex flex-col gap-2 border-t pt-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium">Pieces</span>
                    <Button variant="outline" size="sm" onClick={() => addPiece(functionIndex)}>
                      <PlusCircle data-icon="inline-start" />
                      Add piece
                    </Button>
                  </div>
                  {pieces.map((piece, pieceIndex) => (
                    <div key={piece.id ?? `${piece.expression}-${pieceIndex}`} className="graph-auto-grid">
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        Expression
                        <input
                          value={piece.expression}
                          onChange={(event) => updatePiece(functionIndex, pieceIndex, { expression: event.target.value })}
                          className="h-9 rounded-md border border-input bg-background px-2 font-mono text-sm font-normal"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        From x
                        <NumericExpressionInput
                          value={piece.xMin}
                          ariaLabel={`Function ${functionIndex + 1} piece ${pieceIndex + 1} from x`}
                          onValueChange={(value) => updatePiece(functionIndex, pieceIndex, { xMin: value })}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        To x
                        <NumericExpressionInput
                          value={piece.xMax}
                          ariaLabel={`Function ${functionIndex + 1} piece ${pieceIndex + 1} to x`}
                          onValueChange={(value) => updatePiece(functionIndex, pieceIndex, { xMax: value })}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs font-medium md:pb-2">
                        <input
                          type="checkbox"
                          checked={piece.includeStart ?? true}
                          onChange={(event) => updatePiece(functionIndex, pieceIndex, { includeStart: event.target.checked })}
                        />
                        Start
                      </label>
                      <label className="flex items-center gap-2 text-xs font-medium md:pb-2">
                        <input
                          type="checkbox"
                          checked={piece.includeEnd ?? true}
                          onChange={(event) => updatePiece(functionIndex, pieceIndex, { includeEnd: event.target.checked })}
                        />
                        End
                      </label>
                      <Button
                        variant="outline"
                        size="icon"
                        title={`Remove piece ${pieceIndex + 1}`}
                        aria-label={`Remove piece ${pieceIndex + 1}`}
                        onClick={() => removePiece(functionIndex, pieceIndex)}
                        className="size-9 justify-self-start md:justify-self-end"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </CollapsiblePanel>
          );

          if (!functionAnchor) return functionPanel;

          return (
            <div
              key={graphFunction.id ?? `${graphFunction.label}-${functionIndex}`}
              data-scroll-anchor={functionAnchor}
              onPointerDownCapture={() => onActivateAnchor?.(functionAnchor)}
              onFocusCapture={() => onActivateAnchor?.(functionAnchor)}
            >
              {functionPanel}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 border-t pt-3">
        <div>
          <div className="text-sm font-medium">Graph objects</div>
          <div className="text-xs text-muted-foreground">
            {showSolutions ? "New annotations are added to the solution layer" : "Grouped by how they affect the graph"}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          title={showSolutions ? "Add an annotation that appears only in solutions" : "Add a graph feature"}
          onClick={addFeature}
        >
          <PlusCircle data-icon="inline-start" />
          {showSolutions ? "Add solution annotation" : "Add feature"}
        </Button>
      </div>

      {visibleFeatureGroups.length ? (
        <div className="mt-3 flex flex-col gap-4">
          {visibleFeatureGroups.map((group) => (
            <section key={group.id} data-graph-feature-group={group.id} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</div>
                  <div className="text-xs text-muted-foreground">{group.description}</div>
                </div>
                <div
                  className="rounded border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  aria-label={`${group.label} count`}
                >
                  {group.entries.length}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {group.entries.map(({ feature, featureIndex }) => {
                  const featureAnchor = anchor ? `${anchor}/gfeat:${featureIndex}` : undefined;
                  const featureTypeLabel = GRAPH_FEATURE_TYPES.find((type) => type.value === feature.kind)?.label ?? "Feature";
                  const featureLabelModes =
                    feature.kind === "tangent"
                      ? GRAPH_TANGENT_LABEL_MODES
                      : feature.kind === "angle_marker"
                        ? GRAPH_ANGLE_MARKER_LABEL_MODES
                        : isRegionFeatureKind(feature.kind)
                          ? GRAPH_REGION_LABEL_MODES
                          : GRAPH_FEATURE_LABEL_MODES;
                  const featureLineStyles = isRegionFeatureKind(feature.kind) ? GRAPH_FEATURE_LINE_STYLES : GRAPH_LINE_STYLES;
                  const featureStrokeStyle = feature.strokeStyle ?? (isRegionFeatureKind(feature.kind) ? "none" : "solid");
                  const showFeatureStrokeControls = isStrokeStyledFeatureKind(feature.kind);
                  const selectedFeatureFunction = functions[feature.functionIndex ?? 0];
                  const selectedFeatureIsRelation = selectedFeatureFunction?.kind === "relation";
                  const isFreeLabel = feature.kind === "label";
                  const featureTitle = (
                    <InlineSummaryTitle
                      label={
                        <span className="inline-flex items-center gap-2">
                          <span>{`${featureTypeLabel} ${featureIndex + 1}`}</span>
                          {isSolutionOnlyGraphFeature(feature) ? (
                            <span className="rounded border border-blue-400/40 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-300">
                              Solution
                            </span>
                          ) : null}
                        </span>
                      }
                      summary={feature.label || featureTypeLabel}
                    />
                  );

                  const featurePanel = (
                    <CollapsiblePanel
                      key={feature.id ?? `${feature.kind}-${featureIndex}`}
                      title={featureTitle}
                      leading={
                        showInlineSettings ? (
                          <input
                            type="checkbox"
                            checked={feature.show ?? true}
                            onChange={(event) => updateFeature(featureIndex, { show: event.target.checked })}
                            title={`Show feature ${featureIndex + 1}`}
                            aria-label={`Show feature ${featureIndex + 1}`}
                            className="size-4"
                          />
                        ) : null
                      }
                      className="bg-muted/30"
                      bodyClassName="p-2"
                      active={featureAnchor === activeAnchor}
                      actions={
                        <Button
                          variant="outline"
                          size="icon"
                          title={`Remove feature ${featureIndex + 1}`}
                          aria-label={`Remove feature ${featureIndex + 1}`}
                          onClick={() => removeFeature(featureIndex)}
                          className="size-8"
                        >
                          <Trash2 />
                        </Button>
                      }
                    >
                      <div className={cn("graph-auto-grid", isFreeLabel && "graph-auto-grid-free-label")}>
                        <label className="flex flex-col gap-2 text-xs font-medium">
                          Type
                          <select
                            value={feature.kind}
                            onChange={(event) => setFeatureKind(featureIndex, event.target.value as GraphFeatureKind)}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                          >
                            {GRAPH_FEATURE_TYPES.map((type) => (
                              <option key={type.value} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {showInlineSettings ? (
                          <label className="flex flex-col gap-2 text-xs font-medium">
                            Colour
                            <input
                              type="color"
                              value={feature.color ?? GRAPH_COLORS[featureIndex % GRAPH_COLORS.length]}
                              onChange={(event) => updateFeature(featureIndex, { color: event.target.value })}
                              className="h-9 w-full rounded-md border border-input bg-background p-1"
                            />
                          </label>
                        ) : null}
                        {showInlineSettings && showFeatureStrokeControls ? (
                          <>
                            <label className="flex flex-col gap-2 text-xs font-medium">
                              Weight
                              <NumericExpressionInput
                                min={0.5}
                                max={10}
                                step={1}
                                value={feature.strokeWidth}
                                disabled={featureStrokeStyle === "none"}
                                ariaLabel={`Feature ${featureIndex + 1} weight`}
                                onValueChange={(value) => updateFeature(featureIndex, { strokeWidth: value })}
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal disabled:cursor-not-allowed disabled:opacity-60"
                              />
                            </label>
                            <label className="flex flex-col gap-2 text-xs font-medium">
                              Line style
                              <select
                                value={featureStrokeStyle}
                                onChange={(event) =>
                                  updateFeature(featureIndex, {
                                    strokeStyle: event.target.value as NonNullable<GraphFeature["strokeStyle"]>,
                                  })
                                }
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                              >
                                {featureLineStyles.map((style) => (
                                  <option key={style.value} value={style.value}>
                                    {style.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </>
                        ) : null}
                        {showInlineSettings || isFreeLabel ? (
                          <label className="flex flex-col gap-2 text-xs font-medium">
                            {isFreeLabel ? "LaTeX label" : "Label"}
                            <input
                              value={feature.label ?? ""}
                              onChange={(event) => updateFeature(featureIndex, { label: event.target.value })}
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                            />
                          </label>
                        ) : null}
                        {showInlineSettings && !isFreeLabel ? (
                          <label className="flex flex-col gap-2 text-xs font-medium">
                            Label display
                            <select
                              value={feature.labelMode ?? "name"}
                              onChange={(event) =>
                                updateFeature(featureIndex, { labelMode: event.target.value as NonNullable<GraphFeature["labelMode"]> })
                              }
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                            >
                              {featureLabelModes.map((mode) => (
                                <option key={mode.value} value={mode.value}>
                                  {mode.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </div>

                      {showInlineSettings && (feature.kind === "point" || feature.kind === "label") ? (
                        <div className="graph-auto-grid mt-2 border-t pt-2">
                          <label className="flex flex-col gap-2 text-xs font-medium">
                            x
                            <NumericExpressionInput
                              step={1}
                              value={feature.x}
                              ariaLabel={`Feature ${featureIndex + 1} x`}
                              onValueChange={(value) => updateFeature(featureIndex, { x: value })}
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-medium">
                            y
                            <NumericExpressionInput
                              step={1}
                              value={feature.y}
                              ariaLabel={`Feature ${featureIndex + 1} y`}
                              onValueChange={(value) => updateFeature(featureIndex, { y: value })}
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                            />
                          </label>
                        </div>
                      ) : null}

                      {showInlineSettings && feature.kind === "line_segment" ? (
                        <div className="graph-auto-grid mt-2 border-t pt-2">
                          <label className="col-span-full flex flex-col gap-2 text-xs font-medium">
                            Span
                            <select
                              value={feature.span ?? "manual"}
                              onChange={(event) =>
                                updateFeature(featureIndex, { span: event.target.value as NonNullable<GraphFeature["span"]> })
                              }
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                            >
                              <option value="manual">Manual endpoints</option>
                              <option value="grid">Span grid</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-medium">
                            Start x
                            <NumericExpressionInput
                              step={1}
                              value={feature.x1}
                              ariaLabel={`Feature ${featureIndex + 1} start x`}
                              onValueChange={(value) => updateFeature(featureIndex, { x1: value })}
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-medium">
                            Start y
                            <NumericExpressionInput
                              step={1}
                              value={feature.y1}
                              ariaLabel={`Feature ${featureIndex + 1} start y`}
                              onValueChange={(value) => updateFeature(featureIndex, { y1: value })}
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-medium">
                            End x
                            <NumericExpressionInput
                              step={1}
                              value={feature.x2}
                              ariaLabel={`Feature ${featureIndex + 1} end x`}
                              onValueChange={(value) => updateFeature(featureIndex, { x2: value })}
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-medium">
                            End y
                            <NumericExpressionInput
                              step={1}
                              value={feature.y2}
                              ariaLabel={`Feature ${featureIndex + 1} end y`}
                              onValueChange={(value) => updateFeature(featureIndex, { y2: value })}
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                            />
                          </label>
                        </div>
                      ) : null}

                      {showInlineSettings && feature.kind === "angle_marker" ? (
                        <GraphAngleMarkerControls
                          feature={feature}
                          features={features}
                          variant="inline"
                          ariaPrefix={`Feature ${featureIndex + 1}`}
                          controlClassName="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                          onChange={(patch) => updateFeature(featureIndex, patch)}
                        />
                      ) : null}

                      {showInlineSettings && (feature.kind === "region_between_curves" || feature.kind === "intersection") ? (
                        <div className="graph-auto-grid mt-2 border-t pt-2">
                          <label className="flex flex-col gap-2 text-xs font-medium">
                            First function
                            <select
                              value={feature.functionAIndex ?? 0}
                              onChange={(event) => updateFeature(featureIndex, { functionAIndex: Number(event.target.value) })}
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                            >
                              {functionOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          {feature.kind === "intersection" ? (
                            <label className="flex flex-col gap-2 text-xs font-medium">
                              Intersect with
                              <select
                                value={feature.intersectionTarget ?? "function"}
                                onChange={(event) =>
                                  updateFeature(featureIndex, {
                                    intersectionTarget: event.target.value as NonNullable<GraphFeature["intersectionTarget"]>,
                                  })
                                }
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
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
                            <label className="flex flex-col gap-2 text-xs font-medium">
                              Second function
                              <select
                                value={feature.functionBIndex ?? 1}
                                onChange={(event) => updateFeature(featureIndex, { functionBIndex: Number(event.target.value) })}
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                              >
                                {functionOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          <label className="flex flex-col gap-2 text-xs font-medium">
                            From x
                            <NumericExpressionInput
                              step={1}
                              value={feature.xMin}
                              ariaLabel={`Feature ${featureIndex + 1} from x`}
                              onValueChange={(value) => updateFeature(featureIndex, { xMin: value })}
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-medium">
                            To x
                            <NumericExpressionInput
                              step={1}
                              value={feature.xMax}
                              ariaLabel={`Feature ${featureIndex + 1} to x`}
                              onValueChange={(value) => updateFeature(featureIndex, { xMax: value })}
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                            />
                          </label>
                          {showInlineSettings && feature.kind === "region_between_curves" ? (
                            <label className="flex flex-col gap-2 text-xs font-medium">
                              Opacity
                              <NumericExpressionInput
                                min={0.05}
                                max={0.8}
                                step={0.05}
                                value={feature.fillOpacity}
                                ariaLabel={`Feature ${featureIndex + 1} opacity`}
                                onValueChange={(value) => updateFeature(featureIndex, { fillOpacity: value })}
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                              />
                            </label>
                          ) : null}
                        </div>
                      ) : null}

                      {showInlineSettings &&
                      (feature.kind === "region_curve_axis" || feature.kind === "turning_point" || feature.kind === "tangent") ? (
                        <div className="graph-auto-grid mt-2 border-t pt-2">
                          <label className="flex flex-col gap-2 text-xs font-medium">
                            Function
                            <select
                              value={feature.functionIndex ?? 0}
                              onChange={(event) => updateFeature(featureIndex, { functionIndex: Number(event.target.value) })}
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                            >
                              {functionOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          {feature.kind === "region_curve_axis" ? (
                            <label className="flex flex-col gap-2 text-xs font-medium">
                              Axis
                              <select
                                value={feature.axis ?? "x"}
                                onChange={(event) =>
                                  updateFeature(featureIndex, { axis: event.target.value as NonNullable<GraphFeature["axis"]> })
                                }
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                              >
                                <option value="x">x-axis</option>
                                <option value="y">y-axis</option>
                              </select>
                            </label>
                          ) : null}
                          {feature.kind === "tangent" ? (
                            <>
                              <label className="flex flex-col gap-2 text-xs font-medium">
                                x
                                <NumericExpressionInput
                                  step={1}
                                  value={feature.x}
                                  ariaLabel={`Feature ${featureIndex + 1} tangent x`}
                                  onValueChange={(value) =>
                                    updateRelationTangentCoordinate(featureIndex, feature, selectedFeatureFunction, "x", value)
                                  }
                                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                                />
                              </label>
                              {selectedFeatureIsRelation ? (
                                <label className="flex flex-col gap-2 text-xs font-medium">
                                  y
                                  <NumericExpressionInput
                                    step={1}
                                    value={feature.y}
                                    ariaLabel={`Feature ${featureIndex + 1} tangent y`}
                                    onValueChange={(value) =>
                                      updateRelationTangentCoordinate(featureIndex, feature, selectedFeatureFunction, "y", value)
                                    }
                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                                  />
                                </label>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <label className="flex flex-col gap-2 text-xs font-medium">
                                From x
                                <NumericExpressionInput
                                  step={1}
                                  value={feature.xMin}
                                  ariaLabel={`Feature ${featureIndex + 1} from x`}
                                  onValueChange={(value) => updateFeature(featureIndex, { xMin: value })}
                                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                                />
                              </label>
                              <label className="flex flex-col gap-2 text-xs font-medium">
                                To x
                                <NumericExpressionInput
                                  step={1}
                                  value={feature.xMax}
                                  ariaLabel={`Feature ${featureIndex + 1} to x`}
                                  onValueChange={(value) => updateFeature(featureIndex, { xMax: value })}
                                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                                />
                              </label>
                              {showInlineSettings && feature.kind === "region_curve_axis" ? (
                                <label className="flex flex-col gap-2 text-xs font-medium">
                                  Opacity
                                  <NumericExpressionInput
                                    min={0.05}
                                    max={0.8}
                                    step={0.05}
                                    value={feature.fillOpacity}
                                    ariaLabel={`Feature ${featureIndex + 1} opacity`}
                                    onValueChange={(value) => updateFeature(featureIndex, { fillOpacity: value })}
                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                                  />
                                </label>
                              ) : null}
                            </>
                          )}
                        </div>
                      ) : null}
                    </CollapsiblePanel>
                  );

                  if (!featureAnchor) return featurePanel;

                  return (
                    <div
                      key={feature.id ?? `${feature.kind}-${featureIndex}`}
                      data-scroll-anchor={featureAnchor}
                      onPointerDownCapture={() => onActivateAnchor?.(featureAnchor)}
                      onFocusCapture={() => onActivateAnchor?.(featureAnchor)}
                    >
                      {featurePanel}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </>
  );
}
