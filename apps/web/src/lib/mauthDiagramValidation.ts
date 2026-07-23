import type { GraphFeature } from "@mauth-studio/shared";

import { graphLineSegmentsShareEndpoint } from "./graphFeatureGeometry.ts";
import type { MauthActionValidationIssue } from "./mauthActionValidation.ts";

const SUPPORTED_DIAGRAM_TYPES = new Set([
  "graph2d",
  "geometry2d",
  "vector2d",
  "graph3d",
  "image",
  "geometricConstruction",
  "network",
  "setDiagram",
  "statsChart",
]);
const STATS_CHART_TYPES = new Set(["histogram", "binomial", "normal", "box", "density", "blankAxes"]);
const HISTOGRAM_BAR_TYPES = new Set(["continuous", "discrete"]);
const STATS_CHART_DATA_MODES = new Set(["raw", "manualProbabilities", "manualFrequencies"]);
const STATS_CHART_Y_AXIS_MODES = new Set(["frequency", "relativeFrequency"]);
const STATS_CHART_Y_LABEL_ORIENTATIONS = new Set(["vertical", "horizontal"]);
const STATS_CHART_SERIES_TYPES = new Set(["line", "points", "linePoints", "bars"]);
const GRAPH_FUNCTION_KINDS = new Set(["expression", "piecewise", "relation"]);
const STROKE_STYLES = new Set(["solid", "dashed"]);
const GRAPH_FEATURE_KINDS = new Set([
  "point",
  "point_between_points",
  "region_between_curves",
  "region_curve_axis",
  "turning_point",
  "intersection",
  "tangent",
  "line_segment",
  "angle_marker",
  "label",
  "region_clipped_by_curve",
]);
const GRAPH_FEATURE_LABEL_MODES = new Set([
  "none",
  "name",
  "coordinates",
  "name_and_coordinates",
  "area",
  "name_and_area",
  "value",
  "name_and_value",
]);
const GRAPH_FEATURE_STROKE_STYLES = new Set(["none", "solid", "dashed"]);
const GRAPH_FEATURE_SPANS = new Set(["manual", "grid"]);
const GRAPH_FEATURE_INTERSECTION_TARGETS = new Set(["function", "xAxis", "yAxis"]);
const GRAPH_FEATURE_CLIP_SIDES = new Set(["above", "below", "left", "right", "inside", "outside"]);
const GRAPH_AXES = new Set(["x", "y"]);
const GRAPH2D_GEOMETRY_DECORATION_KINDS = new Set(["equalLength", "equalAngle", "rightAngle"]);
const UNSUPPORTED_GRAPH_FUNCTION_FIELDS = new Map([["equation", "Use expression for every graph2d function or relation."]]);
const UNSUPPORTED_GRAPH_FEATURE_FIELDS = new Map([
  ["expressionTop", "Use graphConfig.functions plus functionAIndex/functionBIndex on a region feature."],
  ["expressionBottom", "Use graphConfig.functions plus functionAIndex/functionBIndex on a region feature."],
  ["opacity", "Use fillOpacity for graph2d region shading opacity."],
  ["fillColor", "Use color for graph2d feature colour."],
  ["text", "Use label for graph2d feature text."],
  ["points", "Use graph2d region features for shading or x1/y1/x2/y2 for line_segment endpoints."],
  ["coords", "Use x and y directly on graph2d point and label features."],
  ["from", "Use x1/y1 on graph2d line_segment features."],
  ["to", "Use x2/y2 on graph2d line_segment features."],
  ["strokeColor", "Use color for graph2d feature stroke colour."],
  ["functionIndex1", "Use functionAIndex for region_between_curves."],
  ["functionIndex2", "Use functionBIndex for region_between_curves."],
  ["domainMin", "Use xMin for graph2d region feature bounds."],
  ["domainMax", "Use xMax for graph2d region feature bounds."],
]);
const GRAPH_AXIS_LABEL_INTERVAL_MODES = new Set(["auto", "manual"]);
const GRAPH_EXTENSION_MODES = new Set(["auto", "manual"]);
const GRAPH2D_DATA_TOP_LEVEL_FIELDS = new Map([
  ["functions", "graphConfig.functions"],
  ["features", "graphConfig.features"],
  ["xMin", "graphConfig.xMin"],
  ["xMax", "graphConfig.xMax"],
  ["yMin", "graphConfig.yMin"],
  ["yMax", "graphConfig.yMax"],
  ["width", "graphConfig.widthPx"],
  ["height", "graphConfig.heightPx"],
  ["widthPx", "graphConfig.widthPx"],
  ["heightPx", "graphConfig.heightPx"],
  ["scalePercent", "graphConfig.scalePercent"],
  ["showGrid", "graphConfig.showGrid"],
  ["showAxes", "graphConfig.showAxes"],
  ["showAxisLabels", "graphConfig.showAxisLabels"],
  ["showAxisNumbers", "graphConfig.showAxisNumbers"],
]);
const GRAPH2D_OPTIONS_TOP_LEVEL_FIELDS = new Map([
  ...GRAPH2D_DATA_TOP_LEVEL_FIELDS,
  ["gridMajorStep", "graphConfig.gridMajorStep"],
  ["gridMinorStep", "graphConfig.gridMinorStep"],
  ["gridMajorStepX", "graphConfig.gridMajorStepX"],
  ["gridMajorStepY", "graphConfig.gridMajorStepY"],
  ["axisLabelStepX", "graphConfig.axisLabelStepX"],
  ["axisLabelStepY", "graphConfig.axisLabelStepY"],
]);
const GRAPH2D_UNSUPPORTED_TOP_LEVEL_FIELDS = new Map([
  ["axisLabels", "Use showAxisLabels for the renderer-owned x/y axis letters; graph2d does not read axisLabels."],
  ["gridStep", "Use gridMajorStep/gridMinorStep, or gridMajorStepX/gridMajorStepY for per-axis spacing."],
]);
const GRAPH3D_UNSUPPORTED_METADATA_FIELDS = new Map([
  ["axisLabels", "Graph3d axis labels are renderer-owned; do not put axisLabels in metadata."],
  ["showAxes", "Graph3d axes are renderer-owned; do not put showAxes in metadata."],
  ["showGrid", "Graph3d plane grids are hidden by default; do not put showGrid in metadata."],
  ["width", "Graph3d size belongs on top-level graphConfig.widthPx, not metadata."],
  ["height", "Graph3d size belongs on top-level graphConfig.heightPx, not metadata."],
  ["widthPx", "Graph3d size belongs on top-level graphConfig.widthPx, not metadata."],
  ["heightPx", "Graph3d size belongs on top-level graphConfig.heightPx, not metadata."],
  ["scalePercent", "Graph3d scale belongs on top-level graphConfig.scalePercent, not metadata."],
]);
const GRAPH3D_RESERVED_AXIS_POINT_IDS = new Set(["xaxis", "yaxis", "zaxis"]);
const GRAPH3D_VIEW_LIMITS = {
  az: Math.PI * 2,
  el: Math.PI,
  bank: Math.PI * 2,
} as const;
const GRAPH3D_SOLID_KINDS = new Set(["circle", "cone", "cylinder", "sphere", "sphereCap", "spherecap", "sphericalCap", "sphericalcap"]);
const VECTOR_2D_LABEL_STYLES = new Set(["boldLower", "arrow", "custom"]);
const PENROSE_RELATIONSHIP_TYPES = new Set([
  "triangle",
  "rightAngle",
  "labelLength",
  "labelAngle",
  "segment",
  "vectorSegment",
  "equalLength",
  "angleMark",
]);
const PENROSE_OBJECT_TYPES = new Set(["point"]);
const SET_REGION_NAMES = new Set(["onlyA", "intersection", "onlyB", "outside", "onlyC", "onlyAB", "onlyAC", "onlyBC"]);
const PENROSE_IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const COMMON_UNSUPPORTED_PENROSE_PREDICATES: Array<{
  pattern: RegExp;
  message: string;
  expected: string;
}> = [
  {
    pattern: /\bLabelsPoint\s*\(/,
    message: "uses unsupported LabelsPoint predicate",
    expected: "Label the existing point directly, e.g. `Label A $A$` or `Label A $\\mathbf{a}$`.",
  },
  {
    pattern: /\bLabel\s*\(/,
    message: "uses unsupported Label(...) predicate syntax",
    expected: "Label declarations use `Label A $A$`, not `Label(A, $A$)`.",
  },
  {
    pattern: /\bSegmentLength\s*\(/,
    message: "uses unsupported SegmentLength predicate",
    expected: "Declare a Label and attach it with LabelsSegment(labelName, A, B).",
  },
  {
    pattern: /\bOppositeRays\s*\(/,
    message: "uses unsupported OppositeRays predicate",
    expected: "Draw the visible rays or vectors directly with RayFrom or VectorSegment.",
  },
  {
    pattern: /\bCollinear\s*\(/,
    message: "uses unsupported Collinear predicate",
    expected: "Use LineThrough(lineName, A, B) plus On(P, lineName) when incidence is essential, or omit it.",
  },
  {
    pattern: /\bConnect\s*\(/,
    message: "uses unsupported Connect predicate",
    expected: "Use Segment(name, A, B) or VectorSegment(name, A, B).",
  },
  {
    pattern: /\bLabelsAngle\s*\([^)]*\$/,
    message: "uses raw TeX inside LabelsAngle",
    expected: "Declare `Label angleName $...$` first, then use `LabelsAngle(angleName, A, B, C)`.",
  },
  {
    pattern: /^\s*(VectorSegment|LineThrough|RayFrom|RightAngle|LabelsSegment|LabelsAngle|ParallelToSegment|PerpendicularToSegment)\s+\S+/m,
    message: "uses non-parenthesized Penrose predicate syntax",
    expected: "Use comma-separated predicate calls such as `VectorSegment(OA, O, A)`.",
  },
  {
    pattern: /^\s*Segment\s+\S+\s+\S+\s+\S+/m,
    message: "uses non-parenthesized Segment predicate syntax",
    expected: "Use `NamedSegment AB` for declaration and `Segment(AB, A, B)` to draw it.",
  },
  {
    pattern: /\bLabelSegment\s*\(/,
    message: "uses unsupported LabelSegment predicate",
    expected: "Use LabelsSegment(labelName, A, B).",
  },
  {
    pattern: /(^|\n)\s*Ray\s*\(/,
    message: "uses unsupported Ray(...) syntax",
    expected: "Declare `Ray rayName` and draw it with RayFrom(rayName, startPoint, throughPoint).",
  },
];
const PENROSE_DECLARATION_TYPES = new Set(["Point", "Circle", "Line", "Ray", "NamedSegment", "LengthLabel"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function addIssue(issues: MauthActionValidationIssue[], path: string, message: string, expected?: string) {
  issues.push({ path, message, ...(expected ? { expected } : {}) });
}

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalString(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[]) {
  if (!hasOwn(record, key)) return;
  if (typeof record[key] !== "string") addIssue(issues, `${path}.${key}`, "must be a string", "string");
}

function requiredString(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[]) {
  if (typeof record[key] !== "string" || !record[key].trim()) {
    addIssue(issues, `${path}.${key}`, "must be a non-empty string", "string");
  }
}

function optionalBoolean(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[]) {
  if (!hasOwn(record, key)) return;
  if (typeof record[key] !== "boolean") addIssue(issues, `${path}.${key}`, "must be a boolean", "boolean");
}

function optionalNumber(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: MauthActionValidationIssue[],
  options: { positive?: boolean; integer?: boolean; min?: number; max?: number } = {},
) {
  if (!hasOwn(record, key)) return;
  const value = record[key];
  if (!finiteNumber(value)) {
    addIssue(issues, `${path}.${key}`, "must be a finite number", "number");
    return;
  }
  if (options.positive && value <= 0) addIssue(issues, `${path}.${key}`, "must be greater than 0", "positive number");
  if (options.integer && !Number.isInteger(value)) addIssue(issues, `${path}.${key}`, "must be an integer", "integer");
  if (options.min !== undefined && value < options.min)
    addIssue(issues, `${path}.${key}`, `must be at least ${options.min}`, `>= ${options.min}`);
  if (options.max !== undefined && value > options.max)
    addIssue(issues, `${path}.${key}`, `must be at most ${options.max}`, `<= ${options.max}`);
}

function requiredNumber(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: MauthActionValidationIssue[],
  options: { positive?: boolean } = {},
) {
  const value = record[key];
  if (!finiteNumber(value)) {
    addIssue(issues, `${path}.${key}`, "must be a finite number", "number");
    return;
  }
  if (options.positive && value <= 0) addIssue(issues, `${path}.${key}`, "must be greater than 0", "positive number");
}

function optionalEnum(
  record: Record<string, unknown>,
  key: string,
  path: string,
  values: Set<string>,
  issues: MauthActionValidationIssue[],
) {
  if (!hasOwn(record, key)) return;
  const value = record[key];
  if (typeof value !== "string" || !values.has(value)) {
    addIssue(issues, `${path}.${key}`, `must be one of: ${[...values].join(", ")}`, [...values].join(" | "));
  }
}

function requiredEnum(
  record: Record<string, unknown>,
  key: string,
  path: string,
  values: Set<string>,
  issues: MauthActionValidationIssue[],
) {
  const value = record[key];
  if (typeof value !== "string" || !values.has(value)) {
    addIssue(issues, `${path}.${key}`, `must be one of: ${[...values].join(", ")}`, [...values].join(" | "));
  }
}

function optionalRecord(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[]) {
  if (!hasOwn(record, key)) return undefined;
  if (!isRecord(record[key])) {
    addIssue(issues, `${path}.${key}`, "must be an object", "object");
    return undefined;
  }
  return record[key] as Record<string, unknown>;
}

function requiredRecord(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[]) {
  if (!isRecord(record[key])) {
    addIssue(issues, `${path}.${key}`, "must be an object", "object");
    return undefined;
  }
  return record[key] as Record<string, unknown>;
}

function optionalArray(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[]) {
  if (!hasOwn(record, key)) return undefined;
  if (!Array.isArray(record[key])) {
    addIssue(issues, `${path}.${key}`, "must be an array", "array");
    return undefined;
  }
  return record[key] as unknown[];
}

function requiredArray(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[]) {
  if (!Array.isArray(record[key])) {
    addIssue(issues, `${path}.${key}`, "must be an array", "array");
    return undefined;
  }
  return record[key] as unknown[];
}

function numberArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: MauthActionValidationIssue[],
  options = { optional: true },
) {
  const values = options.optional ? optionalArray(record, key, path, issues) : requiredArray(record, key, path, issues);
  if (!values) return undefined;
  values.forEach((value, index) => {
    if (!finiteNumber(value)) addIssue(issues, `${path}.${key}[${index}]`, "must be a finite number", "number");
  });
  return values;
}

function numberPair(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  if (!Array.isArray(value) || value.length !== 2) {
    addIssue(issues, path, "must be a pair of finite numbers", "[number, number]");
    return;
  }
  value.forEach((item, index) => {
    if (!finiteNumber(item)) addIssue(issues, `${path}[${index}]`, "must be a finite number", "number");
  });
}

function numberTriple(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  if (!Array.isArray(value) || value.length !== 3) {
    addIssue(issues, path, "must be a triple of finite numbers", "[number, number, number]");
    return;
  }
  value.forEach((item, index) => {
    if (!finiteNumber(item)) addIssue(issues, `${path}[${index}]`, "must be a finite number", "number");
  });
}

function graph3dPointReference(value: unknown, path: string, pointNames: Set<string>, issues: MauthActionValidationIssue[]) {
  if (typeof value === "string") {
    if (!value.trim()) addIssue(issues, path, "must be a non-empty point id", "point id or [x,y,z]");
    else if (GRAPH3D_RESERVED_AXIS_POINT_IDS.has(value.toLowerCase()))
      addIssue(issues, path, "must reference a named 3D vertex/point, not an axis helper", "omit axis helper references");
    else if (pointNames.size && !pointNames.has(value)) addIssue(issues, path, "must reference a graph3d point", "declared point id");
    return;
  }
  if (Array.isArray(value)) {
    numberTriple(value, path, issues);
    return;
  }
  if (isRecord(value)) {
    const id = typeof value.id === "string" && value.id.trim() ? value.id : typeof value.name === "string" ? value.name : "";
    if (id) {
      if (GRAPH3D_RESERVED_AXIS_POINT_IDS.has(id.toLowerCase()))
        addIssue(issues, `${path}.id`, "must reference a named 3D vertex/point, not an axis helper", "omit axis helper references");
      else if (pointNames.size && !pointNames.has(id))
        addIssue(issues, `${path}.id`, "must reference a graph3d point", "declared point id");
      return;
    }
    if (hasOwn(value, "coords")) numberTriple(value.coords, `${path}.coords`, issues);
    else if (hasOwn(value, "coordinates")) numberTriple(value.coordinates, `${path}.coordinates`, issues);
    else if (hasOwn(value, "position")) numberTriple(value.position, `${path}.position`, issues);
    else {
      requiredNumber(value, "x", path, issues);
      requiredNumber(value, "y", path, issues);
      requiredNumber(value, "z", path, issues);
    }
    return;
  }
  addIssue(issues, path, "must be a point id, coordinate triple, or point object", "point id | [x,y,z] | { x, y, z }");
}

function rejectGraph3DVisibleAlias(entry: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  if (hasOwn(entry, "visible")) addIssue(issues, `${path}.visible`, "is not read by graph3d; use show instead", "show");
}

function requiredGraph3dPointReference(
  record: Record<string, unknown>,
  key: string,
  path: string,
  pointNames: Set<string>,
  issues: MauthActionValidationIssue[],
) {
  if (!hasOwn(record, key)) {
    addIssue(issues, `${path}.${key}`, "is required", "point id or [x,y,z]");
    return;
  }
  graph3dPointReference(record[key], `${path}.${key}`, pointNames, issues);
}

function optionalNumberPair(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[]) {
  if (!hasOwn(record, key)) return;
  numberPair(record[key], `${path}.${key}`, issues);
  if (Array.isArray(record[key]) && finiteNumber(record[key][0]) && finiteNumber(record[key][1]) && record[key][0] >= record[key][1]) {
    addIssue(issues, `${path}.${key}[1]`, `must be greater than ${key}[0]`, `${key}[1] > ${key}[0]`);
  }
}

function pointArray(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[]) {
  const values = optionalArray(record, key, path, issues);
  if (!values) return undefined;
  values.forEach((value, index) => {
    const point = isRecord(value) ? value : undefined;
    const pointPath = `${path}.${key}[${index}]`;
    if (!point) {
      addIssue(issues, pointPath, "must be an object", "{ x: number, y: number }");
      return;
    }
    requiredNumber(point, "x", pointPath, issues);
    requiredNumber(point, "y", pointPath, issues);
    optionalString(point, "label", pointPath, issues);
  });
  return values;
}

function pointNameArray(
  value: unknown,
  path: string,
  issues: MauthActionValidationIssue[],
  knownNames: Set<string>,
  expectedLength?: number,
) {
  if (!Array.isArray(value)) {
    addIssue(issues, path, "must be an array of point names", "string[]");
    return;
  }
  if (expectedLength !== undefined && value.length !== expectedLength) {
    addIssue(issues, path, `must contain exactly ${expectedLength} point names`, `length ${expectedLength}`);
  }
  value.forEach((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      addIssue(issues, `${path}[${index}]`, "must be a non-empty point name", "string");
      return;
    }
    if (!PENROSE_IDENTIFIER_PATTERN.test(item)) addIssue(issues, `${path}[${index}]`, "must be a Penrose identifier", "A, B, point_1");
    if (knownNames.size && !knownNames.has(item))
      addIssue(issues, `${path}[${index}]`, "must reference a declared point", "declared point name");
  });
}

function compareRange(record: Record<string, unknown>, minKey: string, maxKey: string, path: string, issues: MauthActionValidationIssue[]) {
  if (!finiteNumber(record[minKey]) || !finiteNumber(record[maxKey])) return;
  if (record[minKey] >= record[maxKey]) {
    addIssue(issues, `${path}.${maxKey}`, `must be greater than ${minKey}`, `${maxKey} > ${minKey}`);
  }
}

function validateCommonGraphConfig(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  optionalNumber(config, "widthPx", path, issues, { positive: true });
  optionalNumber(config, "heightPx", path, issues, { positive: true });
  optionalNumber(config, "scalePercent", path, issues, { positive: true });
  optionalNumber(config, "xMin", path, issues);
  optionalNumber(config, "xMax", path, issues);
  optionalNumber(config, "yMin", path, issues);
  optionalNumber(config, "yMax", path, issues);
  compareRange(config, "xMin", "xMax", path, issues);
  compareRange(config, "yMin", "yMax", path, issues);
  optionalNumber(config, "gridMajorStep", path, issues, { positive: true });
  optionalNumber(config, "gridMinorStep", path, issues, { positive: true });
  optionalNumber(config, "gridMajorStepX", path, issues, { positive: true });
  optionalNumber(config, "gridMajorStepY", path, issues, { positive: true });
  optionalNumber(config, "gridMinorStepX", path, issues, { positive: true });
  optionalNumber(config, "gridMinorStepY", path, issues, { positive: true });
  optionalNumber(config, "axisExtension", path, issues, { min: 0 });
  optionalNumber(config, "functionExtension", path, issues, { min: 0 });
  optionalNumber(config, "functionExtensionLeft", path, issues, { min: 0 });
  optionalNumber(config, "functionExtensionRight", path, issues, { min: 0 });
  optionalNumber(config, "xAxisLabelX", path, issues);
  optionalNumber(config, "xAxisLabelY", path, issues);
  optionalNumber(config, "yAxisLabelX", path, issues);
  optionalNumber(config, "yAxisLabelY", path, issues);
  optionalNumber(config, "axisLabelStepX", path, issues, { positive: true });
  optionalNumber(config, "axisLabelStepY", path, issues, { positive: true });
  optionalNumber(config, "axisLabelMinSpacingPx", path, issues, { positive: true });
  optionalBoolean(config, "lockAspectRatio", path, issues);
  optionalBoolean(config, "equalScale", path, issues);
  optionalBoolean(config, "showGrid", path, issues);
  optionalBoolean(config, "showMajorGrid", path, issues);
  optionalBoolean(config, "showMinorGrid", path, issues);
  optionalBoolean(config, "showGridBorder", path, issues);
  optionalBoolean(config, "showAxes", path, issues);
  optionalBoolean(config, "showArrows", path, issues);
  optionalBoolean(config, "showXAxisMinArrow", path, issues);
  optionalBoolean(config, "showXAxisMaxArrow", path, issues);
  optionalBoolean(config, "showYAxisMinArrow", path, issues);
  optionalBoolean(config, "showYAxisMaxArrow", path, issues);
  optionalBoolean(config, "showAxisLabels", path, issues);
  optionalBoolean(config, "showAxisNumbers", path, issues);
  optionalBoolean(config, "showFunctionArrows", path, issues);
  optionalEnum(config, "axisLabelIntervalMode", path, GRAPH_AXIS_LABEL_INTERVAL_MODES, issues);
  optionalEnum(config, "axisExtensionMode", path, GRAPH_EXTENSION_MODES, issues);
  optionalEnum(config, "functionExtensionMode", path, GRAPH_EXTENSION_MODES, issues);
  optionalString(config, "expression", path, issues);
  optionalString(config, "latex", path, issues);
  optionalString(config, "style", path, issues);
  optionalString(config, "penrosePreset", path, issues);
  optionalString(config, "xAxisLabel", path, issues);
  optionalString(config, "yAxisLabel", path, issues);
  optionalString(config, "gridMajorColor", path, issues);
  optionalString(config, "gridMinorColor", path, issues);
  optionalRecord(config, "metadata", path, issues);
  optionalRecord(config, "options", path, issues);
}

function validateGraphFunctions(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  const functions = optionalArray(config, "functions", path, issues);
  functions?.forEach((entry, index) => {
    const entryPath = `${path}.functions[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be a graph function object", "GraphFunction");
      return;
    }
    requiredString(entry, "expression", entryPath, issues);
    optionalEnum(entry, "kind", entryPath, GRAPH_FUNCTION_KINDS, issues);
    optionalString(entry, "latex", entryPath, issues);
    optionalString(entry, "label", entryPath, issues);
    optionalString(entry, "color", entryPath, issues);
    optionalEnum(entry, "strokeStyle", entryPath, STROKE_STYLES, issues);
    optionalNumber(entry, "strokeWidth", entryPath, issues, { positive: true });
    optionalBoolean(entry, "show", entryPath, issues);
    optionalBoolean(entry, "solutionOnly", entryPath, issues);
    optionalBoolean(entry, "showLabel", entryPath, issues);
    optionalNumber(entry, "labelX", entryPath, issues);
    optionalNumber(entry, "labelY", entryPath, issues);
    optionalNumber(entry, "domainMin", entryPath, issues);
    optionalNumber(entry, "domainMax", entryPath, issues);
    optionalNumber(entry, "functionExtension", entryPath, issues, { min: 0 });
    optionalNumber(entry, "functionExtensionLeft", entryPath, issues, { min: 0 });
    optionalNumber(entry, "functionExtensionRight", entryPath, issues, { min: 0 });
    optionalEnum(entry, "domainMode", entryPath, GRAPH_EXTENSION_MODES, issues);
    optionalEnum(entry, "functionExtensionMode", entryPath, GRAPH_EXTENSION_MODES, issues);
    compareRange(entry, "domainMin", "domainMax", entryPath, issues);
    if (hasOwn(entry, "domain")) {
      addIssue(
        issues,
        `${entryPath}.domain`,
        "is not a supported graph2d function field; split the interval into domainMin and domainMax",
        "{ domainMin, domainMax }",
      );
    }
    if (hasOwn(entry, "style")) {
      addIssue(
        issues,
        `${entryPath}.style`,
        "is not a supported graph2d function style object; put styling directly on the function",
        "{ color?, strokeWidth?, strokeStyle? }",
      );
    }
    for (const [key, expected] of UNSUPPORTED_GRAPH_FUNCTION_FIELDS) {
      if (!hasOwn(entry, key)) continue;
      addIssue(issues, `${entryPath}.${key}`, "is not a supported graph2d function field", expected);
    }

    const pieces = optionalArray(entry, "pieces", entryPath, issues);
    pieces?.forEach((piece, pieceIndex) => {
      const piecePath = `${entryPath}.pieces[${pieceIndex}]`;
      if (!isRecord(piece)) {
        addIssue(issues, piecePath, "must be a piecewise function object", "GraphFunctionPiece");
        return;
      }
      requiredString(piece, "expression", piecePath, issues);
      optionalNumber(piece, "xMin", piecePath, issues);
      optionalNumber(piece, "xMax", piecePath, issues);
      compareRange(piece, "xMin", "xMax", piecePath, issues);
      optionalBoolean(piece, "includeStart", piecePath, issues);
      optionalBoolean(piece, "includeEnd", piecePath, issues);
    });
  });
}

function nonNegativeIndex(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[]) {
  optionalNumber(record, key, path, issues, { integer: true, min: 0 });
}

function validateGraphFeatures(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  const features = optionalArray(config, "features", path, issues);
  const lineSegmentIds = new Set(
    features?.flatMap((entry, index) =>
      isRecord(entry) && entry.kind === "line_segment"
        ? [typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : `feature-${index}`]
        : [],
    ) ?? [],
  );
  features?.forEach((entry, index) => {
    const entryPath = `${path}.features[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be a graph feature object", "GraphFeature");
      return;
    }
    if (hasOwn(entry, "type") && !hasOwn(entry, "kind")) {
      addIssue(issues, `${entryPath}.type`, "must be named kind for graph2d features", "kind");
    }
    if (hasOwn(entry, "style")) {
      addIssue(
        issues,
        `${entryPath}.style`,
        "is not a supported graph2d feature style object; put styling directly on the feature",
        "{ color?, size?, strokeWidth?, strokeStyle? }",
      );
    }
    for (const [key, expected] of UNSUPPORTED_GRAPH_FEATURE_FIELDS) {
      if (!hasOwn(entry, key)) continue;
      addIssue(issues, `${entryPath}.${key}`, "is not a supported graph2d feature field", expected);
    }
    requiredEnum(entry, "kind", entryPath, GRAPH_FEATURE_KINDS, issues);
    optionalString(entry, "label", entryPath, issues);
    optionalEnum(entry, "labelMode", entryPath, GRAPH_FEATURE_LABEL_MODES, issues);
    optionalString(entry, "color", entryPath, issues);
    optionalBoolean(entry, "show", entryPath, issues);
    optionalBoolean(entry, "solutionOnly", entryPath, issues);
    optionalBoolean(entry, "rightAngle", entryPath, issues);
    optionalNumber(entry, "fillOpacity", entryPath, issues, { min: 0, max: 1 });
    optionalNumber(entry, "strokeWidth", entryPath, issues, { min: 0 });
    optionalEnum(entry, "strokeStyle", entryPath, GRAPH_FEATURE_STROKE_STYLES, issues);
    optionalEnum(entry, "span", entryPath, GRAPH_FEATURE_SPANS, issues);
    optionalNumber(entry, "size", entryPath, issues, { positive: true });
    optionalNumber(entry, "labelX", entryPath, issues);
    optionalNumber(entry, "labelY", entryPath, issues);
    optionalString(entry, "firstSegmentId", entryPath, issues);
    optionalString(entry, "secondSegmentId", entryPath, issues);
    nonNegativeIndex(entry, "functionIndex", entryPath, issues);
    nonNegativeIndex(entry, "functionAIndex", entryPath, issues);
    nonNegativeIndex(entry, "functionBIndex", entryPath, issues);
    nonNegativeIndex(entry, "baseFeatureIndex", entryPath, issues);
    nonNegativeIndex(entry, "clipFunctionIndex", entryPath, issues);
    optionalEnum(entry, "intersectionTarget", entryPath, GRAPH_FEATURE_INTERSECTION_TARGETS, issues);
    optionalEnum(entry, "clipSide", entryPath, GRAPH_FEATURE_CLIP_SIDES, issues);
    optionalEnum(entry, "axis", entryPath, GRAPH_AXES, issues);
    optionalNumber(entry, "xMin", entryPath, issues);
    optionalNumber(entry, "xMax", entryPath, issues);
    compareRange(entry, "xMin", "xMax", entryPath, issues);

    if (entry.kind === "point" || entry.kind === "label") {
      requiredNumber(entry, "x", entryPath, issues);
      requiredNumber(entry, "y", entryPath, issues);
    }
    if (entry.kind === "point_between_points" || entry.kind === "line_segment") {
      requiredNumber(entry, "x1", entryPath, issues);
      requiredNumber(entry, "y1", entryPath, issues);
      requiredNumber(entry, "x2", entryPath, issues);
      requiredNumber(entry, "y2", entryPath, issues);
    }
    if (entry.kind === "angle_marker") {
      const firstSegmentId = typeof entry.firstSegmentId === "string" ? entry.firstSegmentId.trim() : "";
      const secondSegmentId = typeof entry.secondSegmentId === "string" ? entry.secondSegmentId.trim() : "";
      if (firstSegmentId || secondSegmentId) {
        if (!firstSegmentId || !lineSegmentIds.has(firstSegmentId)) {
          addIssue(issues, `${entryPath}.firstSegmentId`, "must reference an existing line segment", "line_segment id");
        }
        if (!secondSegmentId || !lineSegmentIds.has(secondSegmentId)) {
          addIssue(issues, `${entryPath}.secondSegmentId`, "must reference an existing line segment", "line_segment id");
        }
        if (firstSegmentId && secondSegmentId && firstSegmentId === secondSegmentId) {
          addIssue(issues, `${entryPath}.secondSegmentId`, "must reference a different line segment", "different line_segment id");
        } else if (
          firstSegmentId &&
          secondSegmentId &&
          lineSegmentIds.has(firstSegmentId) &&
          lineSegmentIds.has(secondSegmentId) &&
          !graphLineSegmentsShareEndpoint(features as GraphFeature[], firstSegmentId, secondSegmentId)
        ) {
          addIssue(issues, `${entryPath}.secondSegmentId`, "must share an endpoint with the first segment", "connected line_segment id");
        }
      } else {
        requiredNumber(entry, "x", entryPath, issues);
        requiredNumber(entry, "y", entryPath, issues);
        requiredNumber(entry, "x1", entryPath, issues);
        requiredNumber(entry, "y1", entryPath, issues);
        requiredNumber(entry, "x2", entryPath, issues);
        requiredNumber(entry, "y2", entryPath, issues);
      }
    }
    if (entry.kind === "point_between_points") optionalNumber(entry, "ratio", entryPath, issues);
    if (entry.kind === "region_between_curves") {
      nonNegativeIndex(entry, "functionAIndex", entryPath, issues);
      nonNegativeIndex(entry, "functionBIndex", entryPath, issues);
    }
    if (entry.kind === "region_clipped_by_curve") {
      nonNegativeIndex(entry, "baseFeatureIndex", entryPath, issues);
      nonNegativeIndex(entry, "clipFunctionIndex", entryPath, issues);
      if (!hasOwn(entry, "clipSide"))
        addIssue(issues, `${entryPath}.clipSide`, "must be set for clipped regions", "above | below | left | right");
    }
  });
}

function validateGraph2DReference(
  value: unknown,
  path: string,
  knownIds: Set<string>,
  referenceLabel: string,
  issues: MauthActionValidationIssue[],
) {
  if (typeof value !== "string" || !value.trim()) {
    addIssue(issues, path, `must be a non-empty ${referenceLabel} id`, referenceLabel);
    return;
  }
  if (knownIds.size && !knownIds.has(value)) {
    addIssue(issues, path, `must reference a declared geometry2d ${referenceLabel}`, `declared ${referenceLabel} id`);
  }
}

function addUniqueGraph2DId(value: unknown, path: string, knownIds: Set<string>, label: string, issues: MauthActionValidationIssue[]) {
  if (typeof value !== "string" || !value.trim()) {
    addIssue(issues, path, `must be a non-empty ${label} id`, `${label} id`);
    return;
  }
  if (knownIds.has(value)) addIssue(issues, path, `duplicates a geometry2d ${label} id`, `unique ${label} id`);
  knownIds.add(value);
}

function validateGraph2DReferenceArray(
  entry: Record<string, unknown>,
  key: string,
  path: string,
  knownIds: Set<string>,
  referenceLabel: string,
  issues: MauthActionValidationIssue[],
  options: { minLength?: number } = {},
) {
  const values = requiredArray(entry, key, path, issues);
  if (!values) return;
  if (options.minLength !== undefined && values.length < options.minLength) {
    addIssue(issues, `${path}.${key}`, `must contain at least ${options.minLength} ${referenceLabel} ids`, `${referenceLabel} id[]`);
  }
  values.forEach((value, index) => validateGraph2DReference(value, `${path}.${key}[${index}]`, knownIds, referenceLabel, issues));
}

function validateGraph2DPointPair(value: unknown, path: string, pointIds: Set<string>, issues: MauthActionValidationIssue[]) {
  if (!Array.isArray(value)) {
    addIssue(issues, path, "must be a point-id pair", "[fromPoint, toPoint]");
    return;
  }
  if (value.length !== 2) addIssue(issues, path, "must contain exactly 2 point ids", "[fromPoint, toPoint]");
  value.forEach((pointId, index) => validateGraph2DReference(pointId, `${path}[${index}]`, pointIds, "point", issues));
}

function validateGraph2DAnglePointTriple(value: unknown, path: string, pointIds: Set<string>, issues: MauthActionValidationIssue[]) {
  if (!Array.isArray(value)) {
    addIssue(issues, path, "must be an angle point triple", "[from, vertex, to]");
    return;
  }
  if (value.length !== 3) addIssue(issues, path, "must contain exactly 3 point ids", "[from, vertex, to]");
  value.forEach((pointId, index) => validateGraph2DReference(pointId, `${path}[${index}]`, pointIds, "point", issues));
}

function validateGraph2DPointPairArray(
  entry: Record<string, unknown>,
  key: string,
  path: string,
  pointIds: Set<string>,
  issues: MauthActionValidationIssue[],
) {
  const values = requiredArray(entry, key, path, issues);
  values?.forEach((value, index) => validateGraph2DPointPair(value, `${path}.${key}[${index}]`, pointIds, issues));
}

function validateGraph2DAnglePointTripleArray(
  entry: Record<string, unknown>,
  key: string,
  path: string,
  pointIds: Set<string>,
  issues: MauthActionValidationIssue[],
) {
  const values = requiredArray(entry, key, path, issues);
  values?.forEach((value, index) => validateGraph2DAnglePointTriple(value, `${path}.${key}[${index}]`, pointIds, issues));
}

function validateGraph2DGeometryData(geometry: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  const pointIds = new Set<string>();
  const points = optionalArray(geometry, "points", path, issues);
  points?.forEach((entry, index) => {
    const entryPath = `${path}.points[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be a geometry2d point object", "{ id, x, y }");
      return;
    }
    addUniqueGraph2DId(entry.id, `${entryPath}.id`, pointIds, "point", issues);
    requiredNumber(entry, "x", entryPath, issues);
    requiredNumber(entry, "y", entryPath, issues);
    optionalString(entry, "label", entryPath, issues);
    optionalNumber(entry, "labelX", entryPath, issues);
    optionalNumber(entry, "labelY", entryPath, issues);
    optionalString(entry, "color", entryPath, issues);
    optionalBoolean(entry, "show", entryPath, issues);
    optionalBoolean(entry, "solutionOnly", entryPath, issues);
  });

  const segmentIds = new Set<string>();
  const segments = optionalArray(geometry, "segments", path, issues);
  segments?.forEach((entry, index) => {
    const entryPath = `${path}.segments[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be a geometry2d segment object", "{ id, from, to }");
      return;
    }
    addUniqueGraph2DId(entry.id, `${entryPath}.id`, segmentIds, "segment", issues);
    validateGraph2DReference(entry.from, `${entryPath}.from`, pointIds, "point", issues);
    validateGraph2DReference(entry.to, `${entryPath}.to`, pointIds, "point", issues);
    optionalString(entry, "label", entryPath, issues);
    optionalNumber(entry, "labelX", entryPath, issues);
    optionalNumber(entry, "labelY", entryPath, issues);
    optionalString(entry, "color", entryPath, issues);
    optionalNumber(entry, "strokeWidth", entryPath, issues, { positive: true });
    optionalEnum(entry, "strokeStyle", entryPath, STROKE_STYLES, issues);
    optionalBoolean(entry, "show", entryPath, issues);
    optionalBoolean(entry, "solutionOnly", entryPath, issues);
  });

  const arcIds = new Set<string>();
  const arcs = optionalArray(geometry, "arcs", path, issues);
  arcs?.forEach((entry, index) => {
    const entryPath = `${path}.arcs[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be a geometry2d arc object", "{ id, center, from, to }");
      return;
    }
    addUniqueGraph2DId(entry.id, `${entryPath}.id`, arcIds, "arc", issues);
    validateGraph2DReference(entry.center, `${entryPath}.center`, pointIds, "point", issues);
    validateGraph2DReference(entry.from, `${entryPath}.from`, pointIds, "point", issues);
    validateGraph2DReference(entry.to, `${entryPath}.to`, pointIds, "point", issues);
    optionalString(entry, "label", entryPath, issues);
    optionalNumber(entry, "labelX", entryPath, issues);
    optionalNumber(entry, "labelY", entryPath, issues);
    optionalString(entry, "color", entryPath, issues);
    optionalNumber(entry, "strokeWidth", entryPath, issues, { positive: true });
    optionalEnum(entry, "strokeStyle", entryPath, STROKE_STYLES, issues);
    optionalBoolean(entry, "show", entryPath, issues);
    optionalBoolean(entry, "solutionOnly", entryPath, issues);
  });

  const angleIds = new Set<string>();
  const angles = optionalArray(geometry, "angles", path, issues);
  angles?.forEach((entry, index) => {
    const entryPath = `${path}.angles[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be a geometry2d angle object", "{ id, points: [A, B, C] }");
      return;
    }
    addUniqueGraph2DId(entry.id, `${entryPath}.id`, angleIds, "angle", issues);
    const anglePoints = requiredArray(entry, "points", entryPath, issues);
    if (anglePoints) {
      if (anglePoints.length !== 3) addIssue(issues, `${entryPath}.points`, "must contain exactly 3 point ids", "[from, vertex, to]");
      anglePoints.forEach((value, pointIndex) =>
        validateGraph2DReference(value, `${entryPath}.points[${pointIndex}]`, pointIds, "point", issues),
      );
    }
    optionalString(entry, "label", entryPath, issues);
    optionalNumber(entry, "labelX", entryPath, issues);
    optionalNumber(entry, "labelY", entryPath, issues);
    optionalNumber(entry, "radius", entryPath, issues, { positive: true });
    optionalNumber(entry, "arcCount", entryPath, issues, { integer: true, min: 1, max: 4 });
    optionalString(entry, "color", entryPath, issues);
    optionalNumber(entry, "strokeWidth", entryPath, issues, { positive: true });
    optionalEnum(entry, "strokeStyle", entryPath, STROKE_STYLES, issues);
    optionalBoolean(entry, "show", entryPath, issues);
    optionalBoolean(entry, "solutionOnly", entryPath, issues);
  });

  const decorations = optionalArray(geometry, "decorations", path, issues);
  decorations?.forEach((entry, index) => {
    const entryPath = `${path}.decorations[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be a geometry2d decoration object", "{ kind, ... }");
      return;
    }
    requiredEnum(entry, "kind", entryPath, GRAPH2D_GEOMETRY_DECORATION_KINDS, issues);
    optionalString(entry, "id", entryPath, issues);
    optionalNumber(entry, "tickCount", entryPath, issues, { integer: true, min: 1, max: 4 });
    optionalNumber(entry, "arcCount", entryPath, issues, { integer: true, min: 1, max: 4 });
    optionalNumber(entry, "radius", entryPath, issues, { positive: true });
    optionalNumber(entry, "size", entryPath, issues, { positive: true });
    optionalString(entry, "color", entryPath, issues);
    optionalBoolean(entry, "show", entryPath, issues);
    optionalBoolean(entry, "solutionOnly", entryPath, issues);

    if (entry.kind === "equalLength") {
      if (hasOwn(entry, "segments")) validateGraph2DReferenceArray(entry, "segments", entryPath, segmentIds, "segment", issues);
      if (hasOwn(entry, "pointPairs")) validateGraph2DPointPairArray(entry, "pointPairs", entryPath, pointIds, issues);
      const targetCount =
        (Array.isArray(entry.segments) ? entry.segments.length : 0) + (Array.isArray(entry.pointPairs) ? entry.pointPairs.length : 0);
      if (targetCount < 2) {
        addIssue(
          issues,
          hasOwn(entry, "segments") ? `${entryPath}.segments` : `${entryPath}.pointPairs`,
          "must contain at least 2 segment ids or point pairs",
          "segment id[] or pointPairs[]",
        );
      }
    }
    if (entry.kind === "equalAngle") {
      if (hasOwn(entry, "angles")) validateGraph2DReferenceArray(entry, "angles", entryPath, angleIds, "angle", issues);
      if (hasOwn(entry, "anglePoints")) validateGraph2DAnglePointTripleArray(entry, "anglePoints", entryPath, pointIds, issues);
      const targetCount =
        (Array.isArray(entry.angles) ? entry.angles.length : 0) + (Array.isArray(entry.anglePoints) ? entry.anglePoints.length : 0);
      if (targetCount < 2) {
        addIssue(
          issues,
          hasOwn(entry, "angles") ? `${entryPath}.angles` : `${entryPath}.anglePoints`,
          "must contain at least 2 angle ids or angle point triples",
          "angle id[] or anglePoints[]",
        );
      }
    }
    if (entry.kind === "rightAngle") {
      if (hasOwn(entry, "angle")) validateGraph2DReference(entry.angle, `${entryPath}.angle`, angleIds, "angle", issues);
      if (hasOwn(entry, "points")) validateGraph2DAnglePointTriple(entry.points, `${entryPath}.points`, pointIds, issues);
      if (!hasOwn(entry, "angle") && !hasOwn(entry, "points")) {
        addIssue(issues, `${entryPath}.angle`, "must include an angle id or points triple", "angle id or points: [from, vertex, to]");
      }
    }
  });
}

function validateGraph2DGeometry(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  const data = optionalRecord(config, "data", path, issues);
  if (!data || !hasOwn(data, "geometry2d")) return;
  const geometry = optionalRecord(data, "geometry2d", `${path}.data`, issues);
  if (geometry) validateGraph2DGeometryData(geometry, `${path}.data.geometry2d`, issues);
}

function validateGeometry2D(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  validateCommonGraphConfig(config, path, issues);
  const data = requiredRecord(config, "data", path, issues);
  if (data) validateGraph2DGeometryData(data, `${path}.data`, issues);

  const functions = optionalArray(config, "functions", path, issues);
  if (functions?.length) {
    addIssue(issues, `${path}.functions`, "geometry2d uses data primitives instead of graph functions", "omit or use []");
  }
  const features = optionalArray(config, "features", path, issues);
  if (features?.length) {
    addIssue(issues, `${path}.features`, "geometry2d uses data primitives instead of graph features", "omit or use []");
  }
}

function validateSlopeFieldPoint(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be a slope-field point object", "{ x, y, slope? }");
    return;
  }
  requiredNumber(value, "x", path, issues);
  requiredNumber(value, "y", path, issues);
  optionalNumber(value, "slope", path, issues);
  optionalString(value, "label", path, issues);
  optionalString(value, "color", path, issues);
  optionalBoolean(value, "show", path, issues);
}

function validateSlopeField(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  const data = optionalRecord(config, "data", path, issues);
  if (!data || !hasOwn(data, "slopeField")) return;
  const slopeField = optionalRecord(data, "slopeField", `${path}.data`, issues);
  if (!slopeField) return;
  requiredString(slopeField, "expression", `${path}.data.slopeField`, issues);
  numberArray(slopeField, "xValues", `${path}.data.slopeField`, issues);
  numberArray(slopeField, "yValues", `${path}.data.slopeField`, issues);
  optionalNumberPair(slopeField, "xRange", `${path}.data.slopeField`, issues);
  optionalNumberPair(slopeField, "yRange", `${path}.data.slopeField`, issues);
  optionalNumber(slopeField, "xStep", `${path}.data.slopeField`, issues, { positive: true });
  optionalNumber(slopeField, "yStep", `${path}.data.slopeField`, issues, { positive: true });
  optionalNumber(slopeField, "segmentLength", `${path}.data.slopeField`, issues, { positive: true });
  optionalNumber(slopeField, "strokeWidth", `${path}.data.slopeField`, issues, { positive: true });
  optionalString(slopeField, "color", `${path}.data.slopeField`, issues);
  optionalBoolean(slopeField, "show", `${path}.data.slopeField`, issues);

  const points = optionalArray(slopeField, "points", `${path}.data.slopeField`, issues);
  points?.forEach((point, index) => validateSlopeFieldPoint(point, `${path}.data.slopeField.points[${index}]`, issues));
  const highlightedPoints = optionalArray(slopeField, "highlightedPoints", `${path}.data.slopeField`, issues);
  highlightedPoints?.forEach((point, index) =>
    validateSlopeFieldPoint(point, `${path}.data.slopeField.highlightedPoints[${index}]`, issues),
  );
}

function validatePolarGrid(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  const data = optionalRecord(config, "data", path, issues);
  if (!data || !hasOwn(data, "polarGrid")) return;
  const polarGrid = optionalRecord(data, "polarGrid", `${path}.data`, issues);
  if (!polarGrid) return;
  optionalBoolean(polarGrid, "show", `${path}.data.polarGrid`, issues);
  optionalString(polarGrid, "color", `${path}.data.polarGrid`, issues);
  optionalEnum(polarGrid, "strokeStyle", `${path}.data.polarGrid`, STROKE_STYLES, issues);
  optionalNumber(polarGrid, "strokeWidth", `${path}.data.polarGrid`, issues, { positive: true });
  optionalNumber(polarGrid, "radius", `${path}.data.polarGrid`, issues, { positive: true });
  numberArray(polarGrid, "radii", `${path}.data.polarGrid`, issues);
  numberArray(polarGrid, "angleLinesDeg", `${path}.data.polarGrid`, issues);
  numberArray(polarGrid, "anglesDeg", `${path}.data.polarGrid`, issues);
  numberArray(polarGrid, "angleLinesRad", `${path}.data.polarGrid`, issues);
  const center = optionalArray(polarGrid, "center", `${path}.data.polarGrid`, issues);
  if (center) {
    if (center.length !== 2) {
      addIssue(issues, `${path}.data.polarGrid.center`, "must be a pair of finite numbers", "[x, y]");
    }
    center.forEach((value, index) => {
      if (!finiteNumber(value)) addIssue(issues, `${path}.data.polarGrid.center[${index}]`, "must be a finite number", "number");
    });
  }
}

function validateGraph2DFieldPlacement(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  for (const [key, expected] of GRAPH2D_UNSUPPORTED_TOP_LEVEL_FIELDS) {
    if (!hasOwn(config, key)) continue;
    addIssue(issues, `${path}.${key}`, "is not a supported graph2d field", expected);
  }

  const data = isRecord(config.data) ? config.data : undefined;
  if (data) {
    for (const [key, expected] of GRAPH2D_DATA_TOP_LEVEL_FIELDS) {
      if (!hasOwn(data, key)) continue;
      addIssue(
        issues,
        `${path}.data.${key}`,
        "must be moved out of graphConfig.data; graph2d.data is only for renderer data such as slopeField or polarGrid",
        expected,
      );
    }
    if (hasOwn(data, "xRange")) {
      addIssue(
        issues,
        `${path}.data.xRange`,
        "must not be placed directly under graphConfig.data",
        "graphConfig.xMin/xMax for graph bounds, or graphConfig.data.slopeField.xRange for slope-field sampling",
      );
    }
    if (hasOwn(data, "yRange")) {
      addIssue(
        issues,
        `${path}.data.yRange`,
        "must not be placed directly under graphConfig.data",
        "graphConfig.yMin/yMax for graph bounds, or graphConfig.data.slopeField.yRange for slope-field sampling",
      );
    }
  }

  const options = isRecord(config.options) ? config.options : undefined;
  if (!options) return;
  for (const [key, expected] of GRAPH2D_OPTIONS_TOP_LEVEL_FIELDS) {
    if (!hasOwn(options, key)) continue;
    addIssue(
      issues,
      `${path}.options.${key}`,
      "must be a top-level graphConfig field; graph2d.options is not used for axes, ranges, size, functions, or features",
      expected,
    );
  }
  if (hasOwn(options, "xRange")) {
    addIssue(issues, `${path}.options.xRange`, "must be expressed as top-level graph bounds", "graphConfig.xMin/xMax");
  }
  if (hasOwn(options, "yRange")) {
    addIssue(issues, `${path}.options.yRange`, "must be expressed as top-level graph bounds", "graphConfig.yMin/yMax");
  }
  if (hasOwn(options, "axisLabels")) {
    addIssue(
      issues,
      `${path}.options.axisLabels`,
      "is not a supported graph2d axis-label field",
      "Use showAxisLabels plus the default x/y axis labels.",
    );
  }
}

function validateCoordinateGraph(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  validateGraph2DFieldPlacement(config, path, issues);
  validateCommonGraphConfig(config, path, issues);
  validateGraphFunctions(config, path, issues);
  validateGraphFeatures(config, path, issues);
  validateGraph2DGeometry(config, path, issues);
  validateSlopeField(config, path, issues);
  validatePolarGrid(config, path, issues);
}

function validateVector2D(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  validateCoordinateGraph(config, path, issues);
  const metadata = optionalRecord(config, "metadata", path, issues);
  const vector2d = metadata ? optionalRecord(metadata, "vector2d", `${path}.metadata`, issues) : undefined;
  if (!vector2d) return;

  optionalEnum(vector2d, "labelStyle", `${path}.metadata.vector2d`, VECTOR_2D_LABEL_STYLES, issues);
  const vectors = optionalArray(vector2d, "vectors", `${path}.metadata.vector2d`, issues);
  vectors?.forEach((entry, index) => {
    const entryPath = `${path}.metadata.vector2d.vectors[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be a vector object", "{ id, name, start, components }");
      return;
    }
    requiredString(entry, "id", entryPath, issues);
    requiredString(entry, "name", entryPath, issues);
    optionalString(entry, "label", entryPath, issues);
    optionalString(entry, "color", entryPath, issues);
    optionalBoolean(entry, "showComponents", entryPath, issues);
    optionalBoolean(entry, "solutionOnly", entryPath, issues);
    numberPair(entry.start, `${entryPath}.start`, issues);
    numberPair(entry.components ?? entry.vector, `${entryPath}.components`, issues);
    optionalNumber(entry, "labelX", entryPath, issues);
    optionalNumber(entry, "labelY", entryPath, issues);
  });

  const segmentLabels = optionalArray(vector2d, "segmentLabels", `${path}.metadata.vector2d`, issues);
  segmentLabels?.forEach((entry, index) => {
    const entryPath = `${path}.metadata.vector2d.segmentLabels[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be a segment label object", "{ vectorId, label }");
      return;
    }
    optionalString(entry, "id", entryPath, issues);
    const vectorRef = typeof entry.vectorId === "string" ? entry.vectorId : typeof entry.vector === "string" ? entry.vector : "";
    if (!vectorRef.trim()) {
      addIssue(issues, `${entryPath}.vectorId`, "must be a non-empty string", "a");
    }
    requiredString(entry, "label", entryPath, issues);
    optionalNumber(entry, "position", entryPath, issues, { min: 0, max: 1 });
    optionalNumber(entry, "offsetPx", entryPath, issues);
    optionalNumber(entry, "offset", entryPath, issues);
    optionalNumber(entry, "labelX", entryPath, issues);
    optionalNumber(entry, "labelY", entryPath, issues);
    optionalString(entry, "color", entryPath, issues);
    optionalBoolean(entry, "solutionOnly", entryPath, issues);
  });

  const angleMarkers = optionalArray(vector2d, "angleMarkers", `${path}.metadata.vector2d`, issues);
  angleMarkers?.forEach((entry, index) => {
    const entryPath = `${path}.metadata.vector2d.angleMarkers[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be an angle marker object", "{ from, to, label?, rightAngle? }");
      return;
    }
    optionalString(entry, "id", entryPath, issues);
    const fromRef = typeof entry.from === "string" ? entry.from : typeof entry.vectorA === "string" ? entry.vectorA : "";
    const toRef = typeof entry.to === "string" ? entry.to : typeof entry.vectorB === "string" ? entry.vectorB : "";
    if (!fromRef.trim()) addIssue(issues, `${entryPath}.from`, "must be a non-empty string", "a");
    if (!toRef.trim()) addIssue(issues, `${entryPath}.to`, "must be a non-empty string", "b");
    optionalString(entry, "label", entryPath, issues);
    optionalBoolean(entry, "rightAngle", entryPath, issues);
    optionalString(entry, "kind", entryPath, issues);
    optionalString(entry, "type", entryPath, issues);
    optionalNumber(entry, "radius", entryPath, issues, { positive: true });
    optionalNumber(entry, "labelX", entryPath, issues);
    optionalNumber(entry, "labelY", entryPath, issues);
    optionalString(entry, "color", entryPath, issues);
    optionalBoolean(entry, "solutionOnly", entryPath, issues);
  });
}

function validateGraph3D(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  validateCommonGraphConfig(config, path, issues);
  const data = optionalRecord(config, "data", path, issues);
  if (data) {
    optionalNumberPair(data, "xRange", `${path}.data`, issues);
    optionalNumberPair(data, "yRange", `${path}.data`, issues);
    optionalNumberPair(data, "zRange", `${path}.data`, issues);
    const points = optionalArray(data, "points", `${path}.data`, issues) ?? optionalArray(data, "vertices", `${path}.data`, issues);
    const pointNames = new Set<string>();
    points?.forEach((entry, index) => {
      const entryPath = `${path}.data.points[${index}]`;
      if (!isRecord(entry)) {
        addIssue(issues, entryPath, "must be a 3D point object", "{ id, coords }");
        return;
      }
      const id = typeof entry.id === "string" && entry.id.trim() ? entry.id : typeof entry.name === "string" ? entry.name : "";
      if (!id.trim()) addIssue(issues, `${entryPath}.id`, "must be a non-empty string", "point id");
      else {
        pointNames.add(id);
        if (GRAPH3D_RESERVED_AXIS_POINT_IDS.has(id.toLowerCase())) {
          addIssue(issues, `${entryPath}.id`, "must be a named 3D vertex/point, not an axis helper", "omit axis helper points");
        }
      }
      if (hasOwn(entry, "coords")) {
        numberTriple(entry.coords, `${entryPath}.coords`, issues);
      } else if (hasOwn(entry, "coordinates")) {
        numberTriple(entry.coordinates, `${entryPath}.coordinates`, issues);
      } else if (hasOwn(entry, "position")) {
        numberTriple(entry.position, `${entryPath}.position`, issues);
      } else {
        requiredNumber(entry, "x", entryPath, issues);
        requiredNumber(entry, "y", entryPath, issues);
        requiredNumber(entry, "z", entryPath, issues);
      }
      optionalString(entry, "label", entryPath, issues);
      optionalString(entry, "color", entryPath, issues);
      rejectGraph3DVisibleAlias(entry, entryPath, issues);
      optionalBoolean(entry, "show", entryPath, issues);
      optionalBoolean(entry, "solutionOnly", entryPath, issues);
    });

    const segments = optionalArray(data, "segments", `${path}.data`, issues) ?? optionalArray(data, "edges", `${path}.data`, issues);
    segments?.forEach((entry, index) => {
      const entryPath = `${path}.data.segments[${index}]`;
      if (!isRecord(entry)) {
        addIssue(issues, entryPath, "must be a 3D segment object", "{ from, to }");
        return;
      }
      optionalString(entry, "id", entryPath, issues);
      const pointsValue = Array.isArray(entry.points) ? entry.points : [];
      const from = typeof entry.from === "string" ? entry.from : typeof pointsValue[0] === "string" ? pointsValue[0] : "";
      const to = typeof entry.to === "string" ? entry.to : typeof pointsValue[1] === "string" ? pointsValue[1] : "";
      if (!from.trim()) addIssue(issues, `${entryPath}.from`, "must be a non-empty point id", "point id");
      else if (pointNames.size && !pointNames.has(from))
        addIssue(issues, `${entryPath}.from`, "must reference a graph3d point", "declared point id");
      else if (GRAPH3D_RESERVED_AXIS_POINT_IDS.has(from.toLowerCase()))
        addIssue(issues, `${entryPath}.from`, "must reference a named 3D vertex/point, not an axis helper", "omit axis helper segments");
      if (!to.trim()) addIssue(issues, `${entryPath}.to`, "must be a non-empty point id", "point id");
      else if (pointNames.size && !pointNames.has(to))
        addIssue(issues, `${entryPath}.to`, "must reference a graph3d point", "declared point id");
      else if (GRAPH3D_RESERVED_AXIS_POINT_IDS.has(to.toLowerCase()))
        addIssue(issues, `${entryPath}.to`, "must reference a named 3D vertex/point, not an axis helper", "omit axis helper segments");
      optionalString(entry, "label", entryPath, issues);
      optionalString(entry, "color", entryPath, issues);
      if (hasOwn(entry, "style"))
        addIssue(issues, `${entryPath}.style`, "must use graph3d segment strokeStyle or dashed", "strokeStyle or dashed");
      optionalString(entry, "strokeStyle", entryPath, issues);
      optionalNumber(entry, "strokeWidth", entryPath, issues, { positive: true });
      optionalBoolean(entry, "dashed", entryPath, issues);
      rejectGraph3DVisibleAlias(entry, entryPath, issues);
      optionalBoolean(entry, "show", entryPath, issues);
      optionalBoolean(entry, "solutionOnly", entryPath, issues);
    });

    const dimensionLists = [
      { key: "dimensions", values: optionalArray(data, "dimensions", `${path}.data`, issues) },
      { key: "dimensionLines", values: optionalArray(data, "dimensionLines", `${path}.data`, issues) },
    ];
    for (const dimensionList of dimensionLists) {
      dimensionList.values?.forEach((entry, index) => {
        const entryPath = `${path}.data.${dimensionList.key}[${index}]`;
        if (!isRecord(entry)) {
          addIssue(issues, entryPath, "must be a graph3d dimension object", "{ from, to, label }");
          return;
        }
        optionalString(entry, "id", entryPath, issues);
        const pointsValue = Array.isArray(entry.points) ? entry.points : undefined;
        graph3dPointReference(entry.from ?? entry.start ?? pointsValue?.[0], `${entryPath}.from`, pointNames, issues);
        graph3dPointReference(entry.to ?? entry.end ?? pointsValue?.[1], `${entryPath}.to`, pointNames, issues);
        optionalString(entry, "label", entryPath, issues);
        optionalString(entry, "color", entryPath, issues);
        optionalString(entry, "strokeColor", entryPath, issues);
        optionalString(entry, "strokeStyle", entryPath, issues);
        optionalNumber(entry, "strokeWidth", entryPath, issues, { positive: true });
        optionalBoolean(entry, "dashed", entryPath, issues);
        rejectGraph3DVisibleAlias(entry, entryPath, issues);
        optionalBoolean(entry, "show", entryPath, issues);
        optionalBoolean(entry, "solutionOnly", entryPath, issues);
      });
    }

    const faces = optionalArray(data, "faces", `${path}.data`, issues);
    faces?.forEach((entry, index) => {
      const entryPath = `${path}.data.faces[${index}]`;
      if (!isRecord(entry)) {
        addIssue(issues, entryPath, "must be a 3D face object", "{ points: [...] }");
        return;
      }
      optionalString(entry, "id", entryPath, issues);
      const pointRefs = Array.isArray(entry.points) ? entry.points : Array.isArray(entry.vertices) ? entry.vertices : undefined;
      if (!pointRefs) {
        addIssue(issues, `${entryPath}.points`, "must be an array of point ids or coordinate triples", "point references[]");
      } else if (pointRefs.length < 3) {
        addIssue(issues, `${entryPath}.points`, "must contain at least three point references", "3 or more points");
      } else {
        pointRefs.forEach((pointRef, pointIndex) =>
          graph3dPointReference(pointRef, `${entryPath}.points[${pointIndex}]`, pointNames, issues),
        );
      }
      optionalString(entry, "label", entryPath, issues);
      optionalString(entry, "color", entryPath, issues);
      optionalString(entry, "fillColor", entryPath, issues);
      optionalString(entry, "strokeColor", entryPath, issues);
      optionalString(entry, "strokeStyle", entryPath, issues);
      optionalNumber(entry, "fillOpacity", entryPath, issues, { min: 0, max: 1 });
      optionalNumber(entry, "opacity", entryPath, issues, { min: 0, max: 1 });
      optionalNumber(entry, "strokeWidth", entryPath, issues, { positive: true });
      optionalBoolean(entry, "dashed", entryPath, issues);
      rejectGraph3DVisibleAlias(entry, entryPath, issues);
      optionalBoolean(entry, "show", entryPath, issues);
      optionalBoolean(entry, "solutionOnly", entryPath, issues);
      if (hasOwn(entry, "style"))
        addIssue(issues, `${entryPath}.style`, "must use graph3d face fillColor/strokeColor fields, not style", "fillColor/strokeColor");
    });

    const solidLists = [
      { key: "solids", values: optionalArray(data, "solids", `${path}.data`, issues) },
      { key: "surfaces", values: optionalArray(data, "surfaces", `${path}.data`, issues) },
    ];
    for (const solidList of solidLists) {
      solidList.values?.forEach((entry, index) => {
        const entryPath = `${path}.data.${solidList.key}[${index}]`;
        if (!isRecord(entry)) {
          addIssue(issues, entryPath, "must be a graph3d solid object", "{ kind, ... }");
          return;
        }
        optionalString(entry, "id", entryPath, issues);
        const kind = typeof entry.kind === "string" ? entry.kind : typeof entry.type === "string" ? entry.type : "";
        const normalizedKind = kind.toLowerCase();
        if (!GRAPH3D_SOLID_KINDS.has(kind)) {
          addIssue(
            issues,
            `${entryPath}.kind`,
            "must be one of: circle, cone, cylinder, sphere, sphereCap",
            "circle | cone | cylinder | sphere | sphereCap",
          );
        }
        optionalString(entry, "type", entryPath, issues);
        for (const styleKey of ["renderStyle", "display", "mode"] as const) {
          optionalString(entry, styleKey, entryPath, issues);
          const styleValue = entry[styleKey];
          if (
            typeof styleValue === "string" &&
            !["surface", "wireframe", "wire", "mesh", "outline", "edges"].includes(styleValue.trim().toLowerCase())
          ) {
            addIssue(issues, `${entryPath}.${styleKey}`, "must be surface, wireframe, or outline", "surface | wireframe | outline");
          }
        }
        optionalString(entry, "color", entryPath, issues);
        optionalString(entry, "fillColor", entryPath, issues);
        optionalString(entry, "strokeColor", entryPath, issues);
        optionalNumber(entry, "radius", entryPath, issues, { positive: true });
        optionalNumber(entry, "height", entryPath, issues, { positive: true });
        optionalNumber(entry, "depth", entryPath, issues, { positive: true });
        optionalNumber(entry, "fillOpacity", entryPath, issues, { min: 0, max: 1 });
        optionalNumber(entry, "opacity", entryPath, issues, { min: 0, max: 1 });
        optionalNumber(entry, "strokeWidth", entryPath, issues, { positive: true });
        optionalNumber(entry, "stepsU", entryPath, issues, { integer: true, min: 8 });
        optionalNumber(entry, "stepsV", entryPath, issues, { integer: true, min: 2 });
        rejectGraph3DVisibleAlias(entry, entryPath, issues);
        optionalBoolean(entry, "show", entryPath, issues);
        optionalBoolean(entry, "solutionOnly", entryPath, issues);
        if (hasOwn(entry, "normal")) numberTriple(entry.normal, `${entryPath}.normal`, issues);
        if (hasOwn(entry, "axis")) numberTriple(entry.axis, `${entryPath}.axis`, issues);
        if (!hasOwn(entry, "radius")) addIssue(issues, `${entryPath}.radius`, "is required", "positive number");
        if (
          normalizedKind === "sphere" ||
          normalizedKind === "circle" ||
          normalizedKind === "spherecap" ||
          normalizedKind === "sphericalcap"
        ) {
          requiredGraph3dPointReference(entry, "center", entryPath, pointNames, issues);
        }
        if (normalizedKind === "spherecap" || normalizedKind === "sphericalcap") {
          if (!hasOwn(entry, "height") && !hasOwn(entry, "depth")) {
            addIssue(issues, `${entryPath}.height`, "is required for a graph3d sphereCap", "positive cap height/depth");
          }
        }
        if (normalizedKind === "cone") {
          requiredGraph3dPointReference(entry, "baseCenter", entryPath, pointNames, issues);
          if (!hasOwn(entry, "apex") && !hasOwn(entry, "height")) {
            addIssue(issues, `${entryPath}.apex`, "is required when height is omitted", "point id or [x,y,z]");
          }
          if (hasOwn(entry, "apex")) graph3dPointReference(entry.apex, `${entryPath}.apex`, pointNames, issues);
        }
        if (normalizedKind === "cylinder") {
          requiredGraph3dPointReference(entry, "baseCenter", entryPath, pointNames, issues);
          if (!hasOwn(entry, "topCenter") && !hasOwn(entry, "height")) {
            addIssue(issues, `${entryPath}.topCenter`, "is required when height is omitted", "point id or [x,y,z]");
          }
          if (hasOwn(entry, "topCenter")) graph3dPointReference(entry.topCenter, `${entryPath}.topCenter`, pointNames, issues);
        }
      });
    }
  }
  const metadata = optionalRecord(config, "metadata", path, issues);
  if (metadata) {
    for (const [key, message] of GRAPH3D_UNSUPPORTED_METADATA_FIELDS) {
      if (hasOwn(metadata, key)) addIssue(issues, `${path}.metadata.${key}`, message, "metadata.view3d only");
    }
  }
  const view3d = metadata ? optionalRecord(metadata, "view3d", `${path}.metadata`, issues) : undefined;
  if (!view3d) return;
  if (hasOwn(view3d, "camera")) {
    addIssue(issues, `${path}.metadata.view3d.camera`, "graph3d uses az/el/bank, not Plotly-style camera metadata", "{ az, el, bank }");
  }
  requiredNumber(view3d, "az", `${path}.metadata.view3d`, issues);
  requiredNumber(view3d, "el", `${path}.metadata.view3d`, issues);
  requiredNumber(view3d, "bank", `${path}.metadata.view3d`, issues);
  for (const key of ["az", "el", "bank"] as const) {
    const value = view3d[key];
    if (finiteNumber(value) && Math.abs(value) > GRAPH3D_VIEW_LIMITS[key]) {
      addIssue(issues, `${path}.metadata.view3d.${key}`, "must be a renderer view value in radians, not degrees", "radian value");
    }
  }
}

function validateImageDiagram(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  validateCommonGraphConfig(config, path, issues);
  const data = requiredRecord(config, "data", path, issues);
  if (!data) return;
  requiredString(data, "src", `${path}.data`, issues);
  optionalString(data, "name", `${path}.data`, issues);
  optionalString(data, "alt", `${path}.data`, issues);
  optionalString(data, "mimeType", `${path}.data`, issues);
  optionalNumber(data, "naturalWidth", `${path}.data`, issues, { positive: true });
  optionalNumber(data, "naturalHeight", `${path}.data`, issues, { positive: true });
  const annotations = optionalArray(data, "annotations", `${path}.data`, issues);
  const ids = new Set<string>();
  annotations?.forEach((entry, index) => {
    const entryPath = `${path}.data.annotations[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be an image annotation", "{ id, kind, xPercent, yPercent } ");
      return;
    }
    requiredString(entry, "id", entryPath, issues);
    requiredEnum(entry, "kind", entryPath, new Set(["label", "ellipse", "arrow"]), issues);
    requiredNumber(entry, "xPercent", entryPath, issues);
    requiredNumber(entry, "yPercent", entryPath, issues);
    optionalNumber(entry, "xPercent", entryPath, issues, { min: 0, max: 100 });
    optionalNumber(entry, "yPercent", entryPath, issues, { min: 0, max: 100 });
    optionalString(entry, "text", entryPath, issues);
    optionalString(entry, "color", entryPath, issues);
    optionalNumber(entry, "strokeWidth", entryPath, issues, { min: 0.5, max: 12 });
    optionalNumber(entry, "fontSizePx", entryPath, issues, { min: 8, max: 48 });
    optionalBoolean(entry, "show", entryPath, issues);
    optionalBoolean(entry, "solutionOnly", entryPath, issues);
    if (entry.kind === "label" && (typeof entry.text !== "string" || !entry.text.trim())) {
      addIssue(issues, `${entryPath}.text`, "must contain visible label text", "non-empty string");
    }
    if (entry.kind === "ellipse") {
      requiredNumber(entry, "widthPercent", entryPath, issues, { positive: true });
      requiredNumber(entry, "heightPercent", entryPath, issues, { positive: true });
      optionalNumber(entry, "widthPercent", entryPath, issues, { min: 1, max: 100 });
      optionalNumber(entry, "heightPercent", entryPath, issues, { min: 1, max: 100 });
    }
    if (entry.kind === "arrow") {
      requiredNumber(entry, "endXPercent", entryPath, issues);
      requiredNumber(entry, "endYPercent", entryPath, issues);
      optionalNumber(entry, "endXPercent", entryPath, issues, { min: 0, max: 100 });
      optionalNumber(entry, "endYPercent", entryPath, issues, { min: 0, max: 100 });
    }
    if (typeof entry.id === "string") {
      if (ids.has(entry.id)) addIssue(issues, `${entryPath}.id`, "must be unique within data.annotations", "unique annotation id");
      ids.add(entry.id);
    }
  });
}

function validateStatsChartOptions(options: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  optionalNumber(options, "widthPx", path, issues, { positive: true });
  optionalNumber(options, "heightPx", path, issues, { positive: true });
  optionalNumber(options, "fillOpacity", path, issues, { min: 0, max: 1 });
  optionalNumber(options, "fontSizePt", path, issues, { positive: true });
  optionalNumber(options, "normalPointCount", path, issues, { integer: true, min: 20 });
  optionalBoolean(options, "showGrid", path, issues);
  optionalBoolean(options, "blackAndWhite", path, issues);
  optionalBoolean(options, "showFill", path, issues);
  optionalBoolean(options, "interactive", path, issues);
  optionalBoolean(options, "showLegend", path, issues);
  optionalString(options, "fillColor", path, issues);
}

function validateStatsChartSeries(data: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  const series = optionalArray(data, "series", path, issues);
  const ids = new Set<string>();
  series?.forEach((entry, index) => {
    const entryPath = `${path}.series[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be a statistics chart series", "{ id, seriesType, xValues, yValues }");
      return;
    }
    requiredString(entry, "id", entryPath, issues);
    requiredEnum(entry, "seriesType", entryPath, STATS_CHART_SERIES_TYPES, issues);
    optionalString(entry, "label", entryPath, issues);
    optionalString(entry, "color", entryPath, issues);
    optionalBoolean(entry, "show", entryPath, issues);
    optionalBoolean(entry, "solutionOnly", entryPath, issues);
    optionalNumber(entry, "lineWidth", entryPath, issues, { positive: true });
    optionalNumber(entry, "markerSize", entryPath, issues, { positive: true });
    optionalNumber(entry, "barWidth", entryPath, issues, { positive: true });
    const xValues = numberArray(entry, "xValues", entryPath, issues, { optional: false });
    const yValues = numberArray(entry, "yValues", entryPath, issues, { optional: false });
    if (xValues && yValues && xValues.length !== yValues.length) {
      addIssue(issues, `${entryPath}.yValues`, "must have the same length as xValues", "one y-value per x-value");
    }
    if (xValues && xValues.length < 1) addIssue(issues, `${entryPath}.xValues`, "must contain at least one value", "number[]");
    if (typeof entry.id === "string") {
      if (ids.has(entry.id)) addIssue(issues, `${entryPath}.id`, "must be unique within data.series", "unique series id");
      ids.add(entry.id);
    }
  });
}

function validateStatsChart(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  validateCommonGraphConfig(config, path, issues);
  const data = requiredRecord(config, "data", path, issues);
  const options = optionalRecord(config, "options", path, issues);
  if (options) validateStatsChartOptions(options, `${path}.options`, issues);
  if (!data) return;

  requiredEnum(data, "chartType", `${path}.data`, STATS_CHART_TYPES, issues);
  optionalEnum(data, "barType", `${path}.data`, HISTOGRAM_BAR_TYPES, issues);
  optionalEnum(data, "dataMode", `${path}.data`, STATS_CHART_DATA_MODES, issues);
  optionalEnum(data, "yAxisMode", `${path}.data`, STATS_CHART_Y_AXIS_MODES, issues);
  optionalEnum(data, "yLabelOrientation", `${path}.data`, STATS_CHART_Y_LABEL_ORIENTATIONS, issues);
  optionalString(data, "xLabel", `${path}.data`, issues);
  optionalString(data, "yLabel", `${path}.data`, issues);
  optionalString(data, "title", `${path}.data`, issues);
  validateStatsChartSeries(data, `${path}.data`, issues);

  if (data.chartType === "histogram") {
    const xValues = numberArray(data, "xValues", `${path}.data`, issues);
    const probabilities = numberArray(data, "probabilities", `${path}.data`, issues);
    const frequencies = numberArray(data, "frequencies", `${path}.data`, issues);
    numberArray(data, "values", `${path}.data`, issues);
    optionalNumber(data, "bins", `${path}.data`, issues, { integer: true, positive: true });
    optionalNumber(data, "binSize", `${path}.data`, issues, { positive: true });
    optionalNumber(data, "binWidth", `${path}.data`, issues, { positive: true });
    if (data.dataMode === "manualProbabilities") {
      if (!xValues?.length) addIssue(issues, `${path}.data.xValues`, "manual probabilities need x-values", "number[]");
      if (!probabilities?.length) addIssue(issues, `${path}.data.probabilities`, "manual probabilities need probabilities", "number[]");
      if (xValues && probabilities && xValues.length !== probabilities.length) {
        addIssue(issues, `${path}.data.probabilities`, "must have the same length as xValues", "one probability per x-value");
      }
      probabilities?.forEach((probability, index) => {
        if (finiteNumber(probability) && probability < 0) {
          addIssue(issues, `${path}.data.probabilities[${index}]`, "must not be negative", "probability >= 0");
        }
      });
    }
    if (data.dataMode === "manualFrequencies") {
      if (!xValues?.length) addIssue(issues, `${path}.data.xValues`, "manual frequencies need x-values", "number[]");
      if (!frequencies?.length) addIssue(issues, `${path}.data.frequencies`, "manual frequencies need frequencies", "number[]");
      if (xValues && frequencies && xValues.length !== frequencies.length) {
        addIssue(issues, `${path}.data.frequencies`, "must have the same length as xValues", "one frequency per x-value");
      }
      frequencies?.forEach((frequency, index) => {
        if (finiteNumber(frequency) && frequency < 0) {
          addIssue(issues, `${path}.data.frequencies[${index}]`, "must not be negative", "frequency >= 0");
        }
      });
    }
  }

  if (data.chartType === "binomial") {
    requiredNumber(data, "trials", `${path}.data`, issues, { positive: true });
    optionalNumber(data, "trials", `${path}.data`, issues, { integer: true });
    requiredNumber(data, "probability", `${path}.data`, issues);
    optionalNumber(data, "probability", `${path}.data`, issues, { min: 0, max: 1 });
  }

  if (data.chartType === "normal") {
    requiredNumber(data, "mean", `${path}.data`, issues);
    requiredNumber(data, "stdDev", `${path}.data`, issues, { positive: true });
    optionalNumberPair(data, "range", `${path}.data`, issues);
  }

  if (data.chartType === "density") {
    const xValues = numberArray(data, "xValues", `${path}.data`, issues);
    const yValues = numberArray(data, "yValues", `${path}.data`, issues);
    const points = pointArray(data, "points", `${path}.data`, issues);
    const hasPointCurve = Boolean(points?.length);
    const hasPairedValues = Boolean(xValues?.length || yValues?.length);
    if (!hasPointCurve && !hasPairedValues) {
      addIssue(issues, `${path}.data.points`, "density curves need points or paired xValues/yValues", "points[] or xValues/yValues");
    }
    if (points && points.length < 2)
      addIssue(issues, `${path}.data.points`, "density curves need at least two points", "at least two points");
    if (xValues || yValues) {
      if (!xValues?.length) addIssue(issues, `${path}.data.xValues`, "density curves need x-values", "number[]");
      if (!yValues?.length) addIssue(issues, `${path}.data.yValues`, "density curves need y-values", "number[]");
      if (xValues && yValues && xValues.length !== yValues.length) {
        addIssue(issues, `${path}.data.yValues`, "must have the same length as xValues", "one y-value per x-value");
      }
      if (xValues && yValues && xValues.length < 2 && yValues.length < 2) {
        addIssue(issues, `${path}.data.xValues`, "density curves need at least two paired values", "at least two x/y pairs");
      }
    }
    optionalNumberPair(data, "range", `${path}.data`, issues);
    optionalNumberPair(data, "yRange", `${path}.data`, issues);
  }

  if (data.chartType === "blankAxes") {
    optionalNumberPair(data, "range", `${path}.data`, issues);
    optionalNumberPair(data, "yRange", `${path}.data`, issues);
  }

  if (data.chartType === "box") {
    const values = numberArray(data, "values", `${path}.data`, issues, { optional: false });
    if (values && values.length < 1) addIssue(issues, `${path}.data.values`, "must contain at least one value", "number[]");
  }
}

function validateIdentifier(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[]) {
  requiredString(record, key, path, issues);
  const value = record[key];
  if (typeof value === "string" && !PENROSE_IDENTIFIER_PATTERN.test(value)) {
    addIssue(issues, `${path}.${key}`, "must be a Penrose identifier", "A, point_1");
  }
}

function validatePenrosePointData(data: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[], vectorOnly = false) {
  const objects = requiredArray(data, "objects", path, issues);
  const relationships = requiredArray(data, "relationships", path, issues);
  const pointNames = new Set<string>();
  let sharedPointCount = 0;
  objects?.forEach((entry, index) => {
    const entryPath = `${path}.objects[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be a diagram object", "{ type, name }");
      return;
    }
    optionalString(entry, "type", entryPath, issues);
    if (typeof entry.type === "string" && !PENROSE_OBJECT_TYPES.has(entry.type)) {
      addIssue(issues, `${entryPath}.type`, "must be a supported Penrose object type", [...PENROSE_OBJECT_TYPES].join(" | "));
    }
    validateIdentifier(entry, "name", entryPath, issues);
    optionalString(entry, "label", entryPath, issues);
    optionalBoolean(entry, "hideLabel", entryPath, issues);
    optionalBoolean(entry, "showLabel", entryPath, issues);
    optionalBoolean(entry, "hidePoint", entryPath, issues);
    optionalBoolean(entry, "hidden", entryPath, issues);
    optionalBoolean(entry, "showPoint", entryPath, issues);
    optionalBoolean(entry, "solutionOnly", entryPath, issues);
    if (entry.type === undefined || entry.type === "point") {
      if (typeof entry.name === "string") pointNames.add(entry.name);
      if (entry.solutionOnly !== true) sharedPointCount += 1;
    }
  });

  if (!pointNames.size) addIssue(issues, `${path}.objects`, "must contain at least one point", "point objects");
  if (pointNames.size && !sharedPointCount)
    addIssue(issues, `${path}.objects`, "must retain at least one student-visible point", "one point without solutionOnly");
  optionalBoolean(data, "hidePoints", path, issues);
  optionalBoolean(data, "hidePointLabels", path, issues);

  relationships?.forEach((entry, index) => {
    const entryPath = `${path}.relationships[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be a relationship object", "{ type, ... }");
      return;
    }
    requiredEnum(entry, "type", entryPath, vectorOnly ? new Set(["segment", "vectorSegment"]) : PENROSE_RELATIONSHIP_TYPES, issues);
    optionalString(entry, "name", entryPath, issues);
    optionalString(entry, "label", entryPath, issues);
    optionalString(entry, "value", entryPath, issues);
    optionalNumber(entry, "marks", entryPath, issues, { integer: true, min: 1, max: 3 });
    optionalNumber(entry, "markCount", entryPath, issues, { integer: true, min: 1, max: 3 });
    optionalNumber(entry, "tickCount", entryPath, issues, { integer: true, min: 1, max: 3 });
    optionalNumber(entry, "arcCount", entryPath, issues, { integer: true, min: 1, max: 3 });
    optionalNumber(entry, "count", entryPath, issues, { integer: true, min: 1, max: 3 });
    optionalBoolean(entry, "solutionOnly", entryPath, issues);
    if (entry.solutionOnly === true && entry.type !== "segment" && entry.type !== "vectorSegment") {
      addIssue(
        issues,
        `${entryPath}.solutionOnly`,
        "is currently supported only for segment and vectorSegment relationships",
        "Use a solution point/segment or a paired solution diagram for the full construction.",
      );
    }

    if (entry.type === "triangle") pointNameArray(entry.points, `${entryPath}.points`, issues, pointNames, 3);
    if (entry.type === "segment" || entry.type === "vectorSegment") {
      validateIdentifier(entry, "name", entryPath, issues);
      pointNameArray(entry.points ?? entry.between, `${entryPath}.points`, issues, pointNames, 2);
    }
    if (entry.type === "rightAngle") {
      if (hasOwn(entry, "points")) pointNameArray(entry.points, `${entryPath}.points`, issues, pointNames, 3);
      if (hasOwn(entry, "at") && (typeof entry.at !== "string" || !pointNames.has(entry.at))) {
        addIssue(issues, `${entryPath}.at`, "must reference a declared point", "declared point name");
      }
    }
    if (entry.type === "labelLength" || entry.type === "labelAngle" || entry.type === "angleMark") {
      if (hasOwn(entry, "points")) pointNameArray(entry.points, `${entryPath}.points`, issues, pointNames);
      if (hasOwn(entry, "between")) pointNameArray(entry.between, `${entryPath}.between`, issues, pointNames);
    }
    if (entry.type === "equalLength") {
      if (hasOwn(entry, "first")) pointNameArray(entry.first, `${entryPath}.first`, issues, pointNames, 2);
      if (hasOwn(entry, "second")) pointNameArray(entry.second, `${entryPath}.second`, issues, pointNames, 2);
      if (hasOwn(entry, "segmentA")) pointNameArray(entry.segmentA, `${entryPath}.segmentA`, issues, pointNames, 2);
      if (hasOwn(entry, "segmentB")) pointNameArray(entry.segmentB, `${entryPath}.segmentB`, issues, pointNames, 2);
    }
  });
}

function penroseCallArguments(source: string, predicateName: string) {
  const matches: string[] = [];
  const pattern = new RegExp(`\\b${predicateName}\\s*\\(([^)]*)\\)`, "g");
  for (const match of source.matchAll(pattern)) matches.push(match[1] ?? "");
  return matches;
}

function countSimplePenroseArgs(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function penroseDeclaredNames(source: string, declarationTypes = PENROSE_DECLARATION_TYPES) {
  const names = new Set<string>();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.includes("(")) continue;
    const match = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s+(.+)$/);
    const declarationType = match?.[1];
    const declarationBody = match?.[2];
    if (!declarationType || !declarationBody || !declarationTypes.has(declarationType)) continue;
    for (const item of declarationBody.split(",")) {
      const name = item.trim().split(/\s+/)[0];
      if (name && PENROSE_IDENTIFIER_PATTERN.test(name)) names.add(name);
    }
  }
  return names;
}

function penroseLabelTargets(source: string) {
  const names = new Set<string>();
  for (const match of source.matchAll(/^\s*Label\s+([A-Za-z][A-Za-z0-9_]*)\s+\$/gm)) {
    const target = match[1];
    if (target) names.add(target);
  }
  return names;
}

function penrosePlacedLabelTargets(source: string) {
  const names = new Set<string>();
  for (const predicateName of ["LabelsSegment", "LabelsAngle", "LabelsCircle", "LabelsLine"]) {
    for (const args of penroseCallArguments(source, predicateName)) {
      const firstArg = args.split(",")[0]?.trim();
      if (firstArg && PENROSE_IDENTIFIER_PATTERN.test(firstArg)) names.add(firstArg);
    }
  }
  return names;
}

function validatePenroseLabelTargets(source: string, path: string, issues: MauthActionValidationIssue[]) {
  const declaredNames = penroseDeclaredNames(source);
  const placedLabels = penrosePlacedLabelTargets(source);
  for (const target of penroseLabelTargets(source)) {
    if (declaredNames.has(target) || placedLabels.has(target)) continue;
    addIssue(
      issues,
      path,
      `labels undeclared Penrose variable ${target}`,
      "For point labels, label the existing point directly, e.g. `Label L $L$`; segment/angle labels must be attached with LabelsSegment/LabelsAngle.",
    );
  }
}

function validatePenroseSubstanceSource(source: string, path: string, issues: MauthActionValidationIssue[]) {
  for (const item of COMMON_UNSUPPORTED_PENROSE_PREDICATES) {
    if (item.pattern.test(source)) addIssue(issues, path, item.message, item.expected);
  }
  validatePenroseLabelTargets(source, path, issues);

  for (const args of penroseCallArguments(source, "CircleThrough")) {
    if (countSimplePenroseArgs(args) !== 3) {
      addIssue(
        issues,
        path,
        "CircleThrough must receive exactly a circle name, centre point, and one circumference point",
        "Use `CircleThrough(Gamma, O, A)` for centre O through A, then `OnCircle(B, Gamma)` and `OnCircle(C, Gamma)` for other circumference points.",
      );
    }
  }

  for (const args of penroseCallArguments(source, "RightAngle")) {
    if (countSimplePenroseArgs(args) !== 3) {
      addIssue(issues, path, "RightAngle must receive exactly three point names", "RightAngle(pointOnFirstRay, vertex, pointOnSecondRay)");
    }
  }

  const lineNames = penroseDeclaredNames(source, new Set(["Line"]));
  const namedSegmentNames = penroseDeclaredNames(source, new Set(["NamedSegment"]));
  for (const args of penroseCallArguments(source, "PerpendicularToSegment")) {
    if (countSimplePenroseArgs(args) !== 3) {
      addIssue(
        issues,
        path,
        "PerpendicularToSegment must receive a line name and two point names",
        "PerpendicularToSegment(lineName, A, B)",
      );
      continue;
    }
    const lineName = args.split(",")[0]?.trim();
    if (!lineName) continue;
    if (namedSegmentNames.has(lineName)) {
      addIssue(
        issues,
        path,
        `PerpendicularToSegment first argument ${lineName} is a NamedSegment, not a Line`,
        "For a visible right-angle marker, use `RightAngle(L, C, P)`. For a line constraint, declare `Line lineName` and use `PerpendicularToSegment(lineName, A, B)`.",
      );
    } else if (!lineNames.has(lineName)) {
      addIssue(
        issues,
        path,
        `PerpendicularToSegment first argument ${lineName} is not declared as a Line`,
        "Declare `Line lineName` before `PerpendicularToSegment(lineName, A, B)`, or use `RightAngle(A, B, C)` for a visible right-angle marker.",
      );
    }
  }
}

function penroseSubstanceSource(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  if (!hasOwn(config, "options")) return false;
  const options = isRecord(config.options) ? config.options : undefined;
  if (!options) return false;
  if (!hasOwn(options, "substanceSource")) return false;
  for (const key of ["styleSource", "domainSource"]) {
    if (hasOwn(options, key)) {
      addIssue(
        issues,
        `${path}.options.${key}`,
        `custom Penrose ${key === "styleSource" ? "Style" : "Domain"} source is not accepted in agent-authored diagrams`,
        "Omit custom Penrose Style/Domain; use the geometry/set preset and graphConfig.options.substanceSource only.",
      );
    }
  }
  if (typeof options.substanceSource !== "string" || !options.substanceSource.trim()) {
    addIssue(issues, `${path}.options.substanceSource`, "must be a non-empty Penrose Substance string", "Point A, B");
    return false;
  }
  validatePenroseSubstanceSource(options.substanceSource, `${path}.options.substanceSource`, issues);
  return true;
}

function validatePenroseDiagram(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[], vectorOnly = false) {
  validateCommonGraphConfig(config, path, issues);
  const hasSubstanceSource = penroseSubstanceSource(config, path, issues);
  const data = hasSubstanceSource ? optionalRecord(config, "data", path, issues) : requiredRecord(config, "data", path, issues);
  if (hasSubstanceSource && data && !hasOwn(data, "objects") && !hasOwn(data, "relationships")) return;
  if (data) validatePenrosePointData(data, `${path}.data`, issues, vectorOnly);
}

function validateSetDiagram(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  validateCommonGraphConfig(config, path, issues);
  const data = requiredRecord(config, "data", path, issues);
  if (!data) return;
  const universe = optionalRecord(data, "universe", `${path}.data`, issues);
  if (universe) {
    validateIdentifier(universe, "name", `${path}.data.universe`, issues);
    optionalString(universe, "label", `${path}.data.universe`, issues);
    optionalString(universe, "countLabel", `${path}.data.universe`, issues);
  }

  const sets = requiredArray(data, "sets", `${path}.data`, issues);
  const setNames = new Set<string>();
  sets?.forEach((entry, index) => {
    const entryPath = `${path}.data.sets[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be a set object", "{ name, label }");
      return;
    }
    optionalString(entry, "type", entryPath, issues);
    validateIdentifier(entry, "name", entryPath, issues);
    optionalString(entry, "label", entryPath, issues);
    optionalString(entry, "countLabel", entryPath, issues);
    if (typeof entry.name === "string") {
      if (setNames.has(entry.name)) addIssue(issues, `${entryPath}.name`, "must be unique", "unique set name");
      setNames.add(entry.name);
    }
  });
  if (sets && sets.length < 2) addIssue(issues, `${path}.data.sets`, "must contain at least two sets", "Venn data");

  const regions = requiredArray(data, "regions", `${path}.data`, issues);
  regions?.forEach((entry, index) => {
    const entryPath = `${path}.data.regions[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be a set region object", "{ name, label }");
      return;
    }
    validateIdentifier(entry, "name", entryPath, issues);
    if (typeof entry.name === "string" && !SET_REGION_NAMES.has(entry.name)) {
      addIssue(issues, `${entryPath}.name`, "must be a supported Venn region", [...SET_REGION_NAMES].join(" | "));
    }
    optionalString(entry, "label", entryPath, issues);
    optionalString(entry, "value", entryPath, issues);
    optionalBoolean(entry, "shaded", entryPath, issues);
    optionalBoolean(entry, "shade", entryPath, issues);
    optionalBoolean(entry, "solutionOnly", entryPath, issues);
  });
}

export function validateMauthDiagramConfig(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be a diagram graphConfig object", "GraphConfig");
    return;
  }

  requiredEnum(value, "type", path, SUPPORTED_DIAGRAM_TYPES, issues);
  if (typeof value.type !== "string" || !SUPPORTED_DIAGRAM_TYPES.has(value.type)) return;

  if (value.type === "graph2d") validateCoordinateGraph(value, path, issues);
  if (value.type === "geometry2d") validateGeometry2D(value, path, issues);
  if (value.type === "vector2d") validateVector2D(value, path, issues);
  if (value.type === "graph3d") validateGraph3D(value, path, issues);
  if (value.type === "image") validateImageDiagram(value, path, issues);
  if (value.type === "statsChart") validateStatsChart(value, path, issues);
  if (value.type === "geometricConstruction") validatePenroseDiagram(value, path, issues);
  if (value.type === "network") validatePenroseDiagram(value, path, issues, true);
  if (value.type === "setDiagram") validateSetDiagram(value, path, issues);
}
