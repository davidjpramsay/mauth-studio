import type { MauthActionValidationIssue } from "./mauthActionValidation.ts";

const SUPPORTED_DIAGRAM_TYPES = new Set([
  "graph2d",
  "vector2d",
  "graph3d",
  "image",
  "geometricConstruction",
  "vectorRelationship",
  "setDiagram",
  "statsChart",
]);
const STATS_CHART_TYPES = new Set(["histogram", "binomial", "normal", "box"]);
const HISTOGRAM_BAR_TYPES = new Set(["continuous", "discrete"]);
const STATS_CHART_DATA_MODES = new Set(["raw", "manualProbabilities"]);
const STATS_CHART_Y_AXIS_MODES = new Set(["frequency", "relativeFrequency"]);
const STATS_CHART_Y_LABEL_ORIENTATIONS = new Set(["vertical", "horizontal"]);
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
const GRAPH_FEATURE_INTERSECTION_TARGETS = new Set(["function", "xAxis", "yAxis"]);
const GRAPH_FEATURE_CLIP_SIDES = new Set(["above", "below", "left", "right", "inside", "outside"]);
const GRAPH_AXES = new Set(["x", "y"]);
const GRAPH_AXIS_LABEL_INTERVAL_MODES = new Set(["auto", "manual"]);
const GRAPH_EXTENSION_MODES = new Set(["auto", "manual"]);
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
const SET_REGION_NAMES = new Set(["onlyA", "intersection", "onlyB", "outside"]);
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
  features?.forEach((entry, index) => {
    const entryPath = `${path}.features[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be a graph feature object", "GraphFeature");
      return;
    }
    requiredEnum(entry, "kind", entryPath, GRAPH_FEATURE_KINDS, issues);
    optionalString(entry, "label", entryPath, issues);
    optionalEnum(entry, "labelMode", entryPath, GRAPH_FEATURE_LABEL_MODES, issues);
    optionalString(entry, "color", entryPath, issues);
    optionalBoolean(entry, "show", entryPath, issues);
    optionalBoolean(entry, "solutionOnly", entryPath, issues);
    optionalNumber(entry, "fillOpacity", entryPath, issues, { min: 0, max: 1 });
    optionalNumber(entry, "strokeWidth", entryPath, issues, { min: 0 });
    optionalEnum(entry, "strokeStyle", entryPath, GRAPH_FEATURE_STROKE_STYLES, issues);
    optionalNumber(entry, "size", entryPath, issues, { positive: true });
    optionalNumber(entry, "labelX", entryPath, issues);
    optionalNumber(entry, "labelY", entryPath, issues);
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

function validateCoordinateGraph(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  validateCommonGraphConfig(config, path, issues);
  validateGraphFunctions(config, path, issues);
  validateGraphFeatures(config, path, issues);
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
    optionalString(entry, "color", entryPath, issues);
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
  });
}

function validateGraph3D(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  validateCommonGraphConfig(config, path, issues);
  const metadata = optionalRecord(config, "metadata", path, issues);
  const view3d = metadata ? optionalRecord(metadata, "view3d", `${path}.metadata`, issues) : undefined;
  if (!view3d) return;
  optionalNumber(view3d, "az", `${path}.metadata.view3d`, issues);
  optionalNumber(view3d, "el", `${path}.metadata.view3d`, issues);
  optionalNumber(view3d, "bank", `${path}.metadata.view3d`, issues);
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

  if (data.chartType === "histogram") {
    const xValues = numberArray(data, "xValues", `${path}.data`, issues);
    const probabilities = numberArray(data, "probabilities", `${path}.data`, issues);
    numberArray(data, "values", `${path}.data`, issues);
    optionalNumber(data, "bins", `${path}.data`, issues, { integer: true, positive: true });
    optionalNumber(data, "binSize", `${path}.data`, issues, { positive: true });
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
    if (hasOwn(data, "range")) {
      numberPair(data.range, `${path}.data.range`, issues);
      if (Array.isArray(data.range) && finiteNumber(data.range[0]) && finiteNumber(data.range[1]) && data.range[0] >= data.range[1]) {
        addIssue(issues, `${path}.data.range[1]`, "must be greater than range[0]", "range[1] > range[0]");
      }
    }
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
    if (entry.type === undefined || entry.type === "point") {
      if (typeof entry.name === "string") pointNames.add(entry.name);
    }
  });

  if (!pointNames.size) addIssue(issues, `${path}.objects`, "must contain at least one point", "point objects");
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

function validatePenroseSubstanceSource(source: string, path: string, issues: MauthActionValidationIssue[]) {
  for (const item of COMMON_UNSUPPORTED_PENROSE_PREDICATES) {
    if (item.pattern.test(source)) addIssue(issues, path, item.message, item.expected);
  }

  for (const args of penroseCallArguments(source, "RightAngle")) {
    if (countSimplePenroseArgs(args) !== 3) {
      addIssue(issues, path, "RightAngle must receive exactly three point names", "RightAngle(pointOnFirstRay, vertex, pointOnSecondRay)");
    }
  }

  for (const args of penroseCallArguments(source, "PerpendicularToSegment")) {
    if (countSimplePenroseArgs(args) !== 3) {
      addIssue(
        issues,
        path,
        "PerpendicularToSegment must receive a line name and two point names",
        "PerpendicularToSegment(lineName, A, B)",
      );
    }
  }
}

function penroseSubstanceSource(config: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  if (!hasOwn(config, "options")) return false;
  const options = isRecord(config.options) ? config.options : undefined;
  if (!options) return false;
  if (!hasOwn(options, "substanceSource")) return false;
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
  if (sets && sets.length < 2) addIssue(issues, `${path}.data.sets`, "must contain at least two sets", "two-set Venn data");

  const regions = requiredArray(data, "regions", `${path}.data`, issues);
  regions?.forEach((entry, index) => {
    const entryPath = `${path}.data.regions[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, entryPath, "must be a set region object", "{ name, label }");
      return;
    }
    validateIdentifier(entry, "name", entryPath, issues);
    if (typeof entry.name === "string" && !SET_REGION_NAMES.has(entry.name)) {
      addIssue(issues, `${entryPath}.name`, "must be a supported two-set Venn region", [...SET_REGION_NAMES].join(" | "));
    }
    optionalString(entry, "label", entryPath, issues);
    optionalString(entry, "value", entryPath, issues);
    optionalBoolean(entry, "shaded", entryPath, issues);
    optionalBoolean(entry, "shade", entryPath, issues);
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
  if (value.type === "vector2d") validateVector2D(value, path, issues);
  if (value.type === "graph3d") validateGraph3D(value, path, issues);
  if (value.type === "image") validateImageDiagram(value, path, issues);
  if (value.type === "statsChart") validateStatsChart(value, path, issues);
  if (value.type === "geometricConstruction") validatePenroseDiagram(value, path, issues);
  if (value.type === "vectorRelationship") validatePenroseDiagram(value, path, issues, true);
  if (value.type === "setDiagram") validateSetDiagram(value, path, issues);
}
