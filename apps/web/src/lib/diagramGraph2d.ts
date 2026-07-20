import type { GraphConfig, GraphFeature, GraphFunction, GraphFunctionPiece } from "@mauth-studio/shared";

export const GRAPH_COLORS = ["#1677ff", "#7955ff", "#0f766e", "#b45309", "#be123c"];
export const GRAPH_LABELS = ["f", "g", "h", "p", "q"];
export const DEFAULT_GRAPH_FUNCTION_STROKE_WIDTH = 2.5;

export const DEFAULT_2D_GRAPH: GraphConfig = {
  type: "graph2d",
  expression: "x^2 - 5*x + 6",
  latex: "x^2 - 5x + 6",
  functions: [
    {
      expression: "x^2 - 5*x + 6",
      latex: "x^2 - 5x + 6",
      label: "f",
      color: GRAPH_COLORS[0],
      strokeWidth: DEFAULT_GRAPH_FUNCTION_STROKE_WIDTH,
      strokeStyle: "solid",
      kind: "expression",
      domainMode: "auto",
      functionExtensionMode: "auto",
      functionExtension: 0,
      functionExtensionLeft: 0,
      functionExtensionRight: 0,
      pieces: [],
    },
  ],
  features: [],
  xMin: -5,
  xMax: 4,
  yMin: -10,
  yMax: 10,
  widthPx: 680,
  heightPx: 300,
  lockAspectRatio: false,
  equalScale: false,
  showGrid: true,
  showMajorGrid: true,
  showMinorGrid: false,
  showGridBorder: false,
  showAxes: true,
  showArrows: true,
  showAxisLabels: true,
  showAxisNumbers: true,
  axisLabelIntervalMode: "auto",
  axisLabelStepX: undefined,
  axisLabelStepY: undefined,
  axisLabelMinSpacingPx: 48,
  showFunctionArrows: true,
  gridMajorStep: 1,
  gridMinorStep: 0.5,
  gridMajorStepX: 1,
  gridMajorStepY: 1,
  gridMinorStepX: 0.5,
  gridMinorStepY: 0.5,
  gridMajorColor: "#b9b9b9",
  gridMinorColor: "#dddddd",
  axisExtensionMode: "auto",
  functionExtensionMode: "auto",
  axisExtension: 0,
  functionExtension: 0,
  functionExtensionLeft: 0,
  functionExtensionRight: 0,
  metadata: {},
};

export const GRAPH_FEATURE_TYPES: Array<{ value: GraphFeature["kind"]; label: string }> = [
  { value: "point", label: "Point" },
  { value: "region_between_curves", label: "Region between two curves" },
  { value: "region_curve_axis", label: "Region between curve and axis" },
  { value: "turning_point", label: "Turning point" },
  { value: "intersection", label: "Point of intersection" },
  { value: "tangent", label: "Tangent at point" },
  { value: "line_segment", label: "Line segment" },
  { value: "angle_marker", label: "Angle marker" },
  { value: "label", label: "Label" },
];

export const GRAPH_FEATURE_LABEL_MODES: Array<{ value: NonNullable<GraphFeature["labelMode"]>; label: string }> = [
  { value: "name", label: "Name" },
  { value: "coordinates", label: "Coordinates" },
  { value: "name_and_coordinates", label: "Name + coordinates" },
  { value: "none", label: "No label" },
];

export const GRAPH_REGION_LABEL_MODES: Array<{ value: NonNullable<GraphFeature["labelMode"]>; label: string }> = [
  { value: "area", label: "Area" },
  { value: "name_and_area", label: "Name + area" },
  { value: "name", label: "Name" },
  { value: "none", label: "No label" },
];

export const GRAPH_TANGENT_LABEL_MODES: Array<{ value: NonNullable<GraphFeature["labelMode"]>; label: string }> = [
  { value: "name_and_value", label: "Name + value" },
  { value: "value", label: "Value" },
  { value: "name", label: "Name" },
  { value: "coordinates", label: "Coordinates" },
  { value: "name_and_coordinates", label: "Name + coordinates" },
  { value: "none", label: "No label" },
];

export const GRAPH_ANGLE_MARKER_LABEL_MODES: Array<{ value: NonNullable<GraphFeature["labelMode"]>; label: string }> = [
  { value: "name", label: "Name" },
  { value: "none", label: "No label" },
];

export const GRAPH_LINE_STYLES: Array<{ value: NonNullable<GraphFunction["strokeStyle"]>; label: string }> = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
];

export const GRAPH_FEATURE_LINE_STYLES: Array<{ value: NonNullable<GraphFeature["strokeStyle"]>; label: string }> = [
  { value: "none", label: "None" },
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
];

export const GRAPH_INTERSECTION_TARGETS: Array<{ value: NonNullable<GraphFeature["intersectionTarget"]>; label: string }> = [
  { value: "function", label: "Another function" },
  { value: "xAxis", label: "x-axis" },
  { value: "yAxis", label: "y-axis" },
];

export type GraphFunctionKind = NonNullable<GraphFunction["kind"]>;
export type GraphFeatureKind = NonNullable<GraphFeature["kind"]>;

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function graphFunctionLabel(index: number) {
  return GRAPH_LABELS[index] ?? `f_${index + 1}`;
}

export function createGraphFunction(index: number, expression = "x"): GraphFunction {
  return {
    id: id("function"),
    kind: "expression",
    expression,
    latex: "",
    label: graphFunctionLabel(index),
    color: GRAPH_COLORS[index % GRAPH_COLORS.length],
    strokeWidth: DEFAULT_GRAPH_FUNCTION_STROKE_WIDTH,
    strokeStyle: "solid",
    show: true,
    domainMode: "auto",
    functionExtensionMode: "auto",
    functionExtension: 0,
    functionExtensionLeft: 0,
    functionExtensionRight: 0,
    pieces: [],
  };
}

export function createAuthoredGraphFunction(index: number, showSolutions: boolean, expression = "x"): GraphFunction {
  const graphFunction = createGraphFunction(index, expression);
  return showSolutions ? { ...graphFunction, solutionOnly: true } : graphFunction;
}

export function createGraphPiece(expression = "x", xMin?: number, xMax?: number): GraphFunctionPiece {
  return {
    id: id("piece"),
    expression,
    xMin,
    xMax,
    includeStart: true,
    includeEnd: true,
  };
}

export function isRegionFeatureKind(kind?: GraphFeature["kind"]) {
  return kind === "region_between_curves" || kind === "region_curve_axis";
}

export function isStrokeStyledFeatureKind(kind?: GraphFeature["kind"]) {
  return (
    kind === "line_segment" ||
    kind === "angle_marker" ||
    kind === "tangent" ||
    kind === "region_clipped_by_curve" ||
    isRegionFeatureKind(kind)
  );
}

function normalFeatureKind(kind?: GraphFeature["kind"]): GraphFeatureKind {
  return kind === "point_between_points" ? "point" : (kind ?? "point");
}

function normalFeatureLabelMode(feature: GraphFeature): NonNullable<GraphFeature["labelMode"]> {
  const labelMode = feature.labelMode;
  if (normalFeatureKind(feature.kind) === "label") return "name";
  if (normalFeatureKind(feature.kind) === "line_segment") {
    if (labelMode === "area" || labelMode === "name_and_area" || labelMode === "value" || labelMode === "name_and_value") return "name";
    return labelMode ?? "none";
  }
  if (normalFeatureKind(feature.kind) === "angle_marker") {
    if (labelMode && labelMode !== "name" && labelMode !== "none") return "name";
    return labelMode ?? "name";
  }
  if (normalFeatureKind(feature.kind) === "tangent") {
    if (labelMode === "area" || labelMode === "name_and_area") return "name_and_value";
    return labelMode ?? "name_and_value";
  }
  if (isRegionFeatureKind(normalFeatureKind(feature.kind))) {
    if (labelMode === "coordinates" || labelMode === "name_and_coordinates" || labelMode === "value" || labelMode === "name_and_value") {
      return "area";
    }
    return labelMode ?? "area";
  }
  if (labelMode === "area" || labelMode === "name_and_area" || labelMode === "value" || labelMode === "name_and_value") return "name";
  return labelMode ?? "name_and_coordinates";
}

export function createGraphFeature(kind: GraphFeatureKind, index: number, graphConfig?: GraphConfig | null): GraphFeature {
  const xMin = graphConfig?.xMin ?? DEFAULT_2D_GRAPH.xMin ?? -5;
  const xMax = graphConfig?.xMax ?? DEFAULT_2D_GRAPH.xMax ?? 5;
  const yMin = graphConfig?.yMin ?? DEFAULT_2D_GRAPH.yMin ?? -5;
  const yMax = graphConfig?.yMax ?? DEFAULT_2D_GRAPH.yMax ?? 5;
  const firstFunction = 0;
  const secondFunction = Math.min(1, Math.max(0, (graphConfig?.functions?.length ?? 1) - 1));
  const defaultLabel =
    kind === "point"
      ? "A"
      : kind === "tangent"
        ? "T"
        : kind === "line_segment"
          ? `Line ${index + 1}`
          : kind === "angle_marker"
            ? "\\theta"
            : kind === "label"
              ? `Label ${index + 1}`
              : `Feature ${index + 1}`;
  const defaultLabelMode = isRegionFeatureKind(kind)
    ? "area"
    : kind === "tangent"
      ? "name_and_value"
      : kind === "label"
        ? "name"
        : kind === "line_segment"
          ? "none"
          : kind === "angle_marker"
            ? "name"
            : "name_and_coordinates";

  return {
    id: id("feature"),
    kind,
    label: defaultLabel,
    labelMode: defaultLabelMode,
    color: GRAPH_COLORS[index % GRAPH_COLORS.length],
    fillOpacity: 0.18,
    strokeWidth: isRegionFeatureKind(kind) ? 0.5 : 2,
    strokeStyle: isRegionFeatureKind(kind) ? "none" : "solid",
    span: "manual",
    size: 0.35,
    show: true,
    x: 0,
    y: 0,
    x1: kind === "angle_marker" ? 1 : xMin,
    y1: kind === "angle_marker" ? 0 : yMin,
    x2: kind === "angle_marker" ? 0.7 : xMax,
    y2: kind === "angle_marker" ? 0.7 : yMax,
    rightAngle: false,
    ratio: 0.5,
    functionIndex: firstFunction,
    functionAIndex: firstFunction,
    functionBIndex: secondFunction,
    intersectionTarget: "function",
    baseFeatureIndex: 0,
    clipFunctionIndex: firstFunction,
    clipSide: "inside",
    axis: "x",
    xMin,
    xMax,
    labelX: undefined,
    labelY: undefined,
  };
}

export function createAuthoredGraphFeature(
  kind: GraphFeatureKind,
  index: number,
  graphConfig: GraphConfig | null | undefined,
  solutionsMode: boolean,
): GraphFeature {
  const feature = createGraphFeature(kind, index, graphConfig);
  return solutionsMode ? { ...feature, solutionOnly: true } : feature;
}

export function graphFeaturesFromConfig(graphConfig?: GraphConfig | null): GraphFeature[] {
  return (graphConfig?.features ?? []).flatMap((feature, index) => {
    if (feature.kind === "region_clipped_by_curve") return [];

    const kind = normalFeatureKind(feature.kind);
    const ratio = feature.ratio ?? 0.5;
    const pointX =
      feature.kind === "point_between_points" ? (feature.x1 ?? 0) + ((feature.x2 ?? 0) - (feature.x1 ?? 0)) * ratio : (feature.x ?? 0);
    const pointY =
      feature.kind === "point_between_points" ? (feature.y1 ?? 0) + ((feature.y2 ?? 0) - (feature.y1 ?? 0)) * ratio : (feature.y ?? 0);

    return {
      id: feature.id ?? `feature-${index}`,
      kind,
      label: feature.label ?? `Feature ${index + 1}`,
      labelMode: normalFeatureLabelMode(feature),
      color: feature.color ?? GRAPH_COLORS[index % GRAPH_COLORS.length],
      show: feature.show ?? true,
      fillOpacity: feature.fillOpacity ?? 0.18,
      strokeWidth: feature.strokeWidth ?? (isRegionFeatureKind(kind) ? 0.5 : 2),
      strokeStyle: feature.strokeStyle ?? (isRegionFeatureKind(kind) ? "none" : "solid"),
      span: feature.span === "grid" ? "grid" : "manual",
      size: feature.size ?? 0.35,
      x: pointX,
      y: pointY,
      x1: feature.x1 ?? (kind === "angle_marker" ? 1 : (graphConfig?.xMin ?? DEFAULT_2D_GRAPH.xMin)),
      y1: feature.y1 ?? (kind === "angle_marker" ? 0 : (graphConfig?.yMin ?? DEFAULT_2D_GRAPH.yMin)),
      x2: feature.x2 ?? (kind === "angle_marker" ? 0.7 : (graphConfig?.xMax ?? DEFAULT_2D_GRAPH.xMax)),
      y2: feature.y2 ?? (kind === "angle_marker" ? 0.7 : (graphConfig?.yMax ?? DEFAULT_2D_GRAPH.yMax)),
      rightAngle: feature.rightAngle === true,
      ratio,
      functionIndex: feature.functionIndex ?? 0,
      functionAIndex: feature.functionAIndex ?? 0,
      functionBIndex: feature.functionBIndex ?? 1,
      intersectionTarget: feature.intersectionTarget ?? "function",
      baseFeatureIndex: feature.baseFeatureIndex ?? 0,
      clipFunctionIndex: feature.clipFunctionIndex ?? 0,
      clipSide: feature.clipSide ?? "inside",
      axis: feature.axis ?? "x",
      xMin: feature.xMin ?? graphConfig?.xMin ?? DEFAULT_2D_GRAPH.xMin,
      xMax: feature.xMax ?? graphConfig?.xMax ?? DEFAULT_2D_GRAPH.xMax,
      labelX: feature.labelX,
      labelY: feature.labelY,
      solutionOnly: feature.solutionOnly === true,
    };
  });
}

export function expressionToLatex(expression?: string) {
  return (expression ?? "")
    .trim()
    .replace(/\*\*/g, "^")
    .replace(/(\d)\s*\*\s*([a-zA-Z])/g, "$1$2")
    .replace(/([a-zA-Z])\s*\*\s*(\d)/g, "$1\\cdot $2")
    .replace(/\*/g, "\\cdot ")
    .replace(/\s+/g, " ");
}

function expressionLooksLikeEquation(expression?: string | null) {
  return /[=<>]/.test(expression ?? "");
}

export function functionSummaryLatex(graphFunction: GraphFunction) {
  const expressionLatex = graphFunction.latex?.trim() || expressionToLatex(graphFunction.expression);
  if (graphFunction.kind === "relation") return expressionLatex || "\\text{relation}";
  if (!expressionLatex) return "\\text{expression}";
  if (expressionLooksLikeEquation(graphFunction.expression) || expressionLooksLikeEquation(graphFunction.latex)) return expressionLatex;
  return `y=${expressionLatex}`;
}

export function graphPiecesFromFunction(graphFunction: GraphFunction, graphConfig?: GraphConfig | null): GraphFunctionPiece[] {
  if (graphFunction.pieces?.length) {
    return graphFunction.pieces.map((piece) => ({
      ...piece,
      expression: piece.expression ?? "",
      includeStart: piece.includeStart ?? true,
      includeEnd: piece.includeEnd ?? true,
    }));
  }
  return [createGraphPiece(graphFunction.expression || "x", graphConfig?.xMin, graphConfig?.xMax)];
}

export function graphFunctionsFromConfig(graphConfig?: GraphConfig | null): GraphFunction[] {
  const configured: GraphFunction[] = Array.isArray(graphConfig?.functions)
    ? graphConfig.functions
    : graphConfig?.expression
      ? [
          {
            kind: "expression" as const,
            expression: graphConfig.expression,
            latex: graphConfig.latex,
            label: "f",
            color: GRAPH_COLORS[0],
            strokeWidth: DEFAULT_GRAPH_FUNCTION_STROKE_WIDTH,
            strokeStyle: "solid",
            show: true,
            domainMode: "auto",
            functionExtensionMode: graphConfig.functionExtensionMode,
            functionExtension: graphConfig.functionExtension,
            functionExtensionLeft: graphConfig.functionExtensionLeft,
            functionExtensionRight: graphConfig.functionExtensionRight,
            pieces: [],
          },
        ]
      : (DEFAULT_2D_GRAPH.functions ?? []);

  return configured.map((graphFunction, index): GraphFunction => {
    const functionExtension = graphFunction.functionExtension ?? graphConfig?.functionExtension ?? DEFAULT_2D_GRAPH.functionExtension;
    return {
      ...graphFunction,
      kind: graphFunction.kind ?? ("expression" as const),
      expression: graphFunction.expression ?? "",
      label: graphFunction.label || graphFunctionLabel(index),
      color: graphFunction.color || GRAPH_COLORS[index % GRAPH_COLORS.length],
      strokeWidth: graphFunction.strokeWidth ?? DEFAULT_GRAPH_FUNCTION_STROKE_WIDTH,
      strokeStyle: graphFunction.strokeStyle ?? "solid",
      show: graphFunction.show ?? true,
      showLabel: graphFunction.showLabel ?? false,
      labelMode: graphFunction.labelMode ?? "equation",
      labelX: graphFunction.labelX ?? graphConfig?.xMin ?? DEFAULT_2D_GRAPH.xMin,
      labelY: graphFunction.labelY ?? graphConfig?.yMax ?? DEFAULT_2D_GRAPH.yMax,
      domainMode: graphFunction.domainMode ?? "auto",
      domainMin: graphFunction.domainMin,
      domainMax: graphFunction.domainMax,
      functionExtensionMode:
        graphFunction.functionExtensionMode ?? graphConfig?.functionExtensionMode ?? DEFAULT_2D_GRAPH.functionExtensionMode,
      functionExtension,
      functionExtensionLeft:
        graphFunction.functionExtensionLeft ??
        graphFunction.functionExtension ??
        graphConfig?.functionExtensionLeft ??
        graphConfig?.functionExtension ??
        DEFAULT_2D_GRAPH.functionExtensionLeft,
      functionExtensionRight:
        graphFunction.functionExtensionRight ??
        graphFunction.functionExtension ??
        graphConfig?.functionExtensionRight ??
        graphConfig?.functionExtension ??
        DEFAULT_2D_GRAPH.functionExtensionRight,
      pieces: graphFunction.kind === "piecewise" ? graphPiecesFromFunction(graphFunction, graphConfig) : (graphFunction.pieces ?? []),
    };
  });
}

export function graphWidth(graphConfig?: GraphConfig | null) {
  return graphConfig?.widthPx ?? DEFAULT_2D_GRAPH.widthPx ?? 680;
}

export function graphHeight(graphConfig?: GraphConfig | null) {
  return graphConfig?.heightPx ?? DEFAULT_2D_GRAPH.heightPx ?? 300;
}

export function lockedAspectHeight(graphConfig: GraphConfig, nextWidth: number) {
  const currentWidth = graphWidth(graphConfig);
  const currentHeight = graphConfig.heightPx ?? DEFAULT_2D_GRAPH.heightPx ?? 300;
  if (!Number.isFinite(currentWidth) || currentWidth <= 0 || !Number.isFinite(currentHeight) || currentHeight <= 0) {
    return currentHeight;
  }
  return Math.max(1, Math.round(nextWidth * (currentHeight / currentWidth)));
}

export function isSolutionOnlyGraphFeature(feature: GraphFeature) {
  return feature.solutionOnly === true;
}

export function isSolutionOnlyGraphFunction(graphFunction: GraphFunction) {
  return graphFunction.solutionOnly === true;
}

export function graphFunctionIndexById(functions: readonly GraphFunction[], idValue: string) {
  return functions.findIndex((graphFunction) => graphFunction.id === idValue);
}

export function graphFunctionAt(functions: readonly GraphFunction[], index: number) {
  return Number.isInteger(index) && index >= 0 ? functions[index] : undefined;
}

export function updateGraphFunction(
  functions: readonly GraphFunction[],
  index: number,
  patch: Partial<GraphFunction>,
): GraphFunction[] | null {
  if (!graphFunctionAt(functions, index)) return null;
  return functions.map((graphFunction, functionIndex) => (functionIndex === index ? { ...graphFunction, ...patch } : graphFunction));
}

export function graphFeatureReferencesFunction(feature: GraphFeature, functionIndex: number) {
  return [feature.functionIndex, feature.functionAIndex, feature.functionBIndex, feature.clipFunctionIndex].some(
    (candidate) => candidate === functionIndex,
  );
}
