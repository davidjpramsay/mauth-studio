import type {
  GraphConfig,
  GraphMetadata,
  GraphVector2DAngleMarker,
  GraphVector2DSegmentLabel,
  GraphVector2DVector,
} from "@mauth-studio/shared";

export type Vector2DLabelStyle = "boldLower" | "arrow" | "custom";

export type Vector2DControlEntry = GraphVector2DVector;
export type Vector2DSegmentLabelEntry = GraphVector2DSegmentLabel;
export type Vector2DAngleMarkerEntry = GraphVector2DAngleMarker;

export type Vector2DSourceVectorInput = {
  id?: string;
  name?: string;
  label?: string;
  start?: [number, number];
  components?: [number, number];
  end?: [number, number];
  length?: number;
  angleDeg?: number;
  lengthLabel?: string | false;
  color?: string;
  showComponents?: boolean;
  labelX?: number;
  labelY?: number;
  solutionOnly?: boolean;
};

export type Vector2DSourceSegmentLabelInput = {
  id?: string;
  vectorId?: string;
  vector?: string;
  label?: string;
  position?: number;
  offsetPx?: number;
  offset?: number;
  color?: string;
  labelX?: number;
  labelY?: number;
  solutionOnly?: boolean;
};

export type Vector2DSourceAngleMarkerInput = {
  id?: string;
  from?: string;
  to?: string;
  vectorA?: string;
  vectorB?: string;
  label?: string;
  rightAngle?: boolean;
  kind?: string;
  type?: string;
  radius?: number;
  color?: string;
  labelX?: number;
  labelY?: number;
  solutionOnly?: boolean;
};

export type Vector2DSourceDiagramInput = {
  vectors?: Vector2DSourceVectorInput[];
  segmentLabels?: Vector2DSourceSegmentLabelInput[];
  angleMarkers?: Vector2DSourceAngleMarkerInput[];
  widthPx?: number;
  heightPx?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  showAxes?: boolean;
  showGrid?: boolean;
  equalScale?: boolean;
  labelStyle?: Vector2DLabelStyle;
};

export type Vector2DElementKind = "vector" | "segmentLabel" | "angleMarker";
export type Vector2DElementListKey = "vectors" | "segmentLabels" | "angleMarkers";
export type Vector2DElement = Vector2DControlEntry | Vector2DSegmentLabelEntry | Vector2DAngleMarkerEntry;

export interface Vector2DElementTarget {
  kind: Vector2DElementKind;
  listKey: Vector2DElementListKey;
  index: number;
}

export const VECTOR_2D_COLORS = ["#0f766e", "#b45309", "#1d4ed8", "#be123c", "#7c3aed"];
export const VECTOR_2D_ANNOTATION_COLOR = "#0f172a";

export const DEFAULT_VECTOR_2D_METADATA = {
  vector2d: {
    labelStyle: "boldLower",
    vectors: [
      { id: "a", name: "a", label: "", start: [0, 0], components: [2, 3], color: VECTOR_2D_COLORS[0], showComponents: false },
      { id: "b", name: "b", label: "", start: [0, 0], components: [4, -3], color: VECTOR_2D_COLORS[1], showComponents: false },
    ],
  },
} satisfies GraphMetadata;

export const DEFAULT_VECTOR_2D_GRAPH: GraphConfig = {
  type: "vector2d",
  expression: "x^2 - 5*x + 6",
  latex: "x^2 - 5x + 6",
  functions: [],
  features: [],
  xMin: -1,
  xMax: 6,
  yMin: -4,
  yMax: 4,
  widthPx: 520,
  heightPx: 320,
  lockAspectRatio: false,
  equalScale: false,
  showGrid: true,
  showMajorGrid: true,
  showMinorGrid: false,
  showGridBorder: false,
  showAxes: true,
  showArrows: true,
  showAxisLabels: true,
  xAxisLabel: "\\mathbf{i}",
  yAxisLabel: "\\mathbf{j}",
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
  axisExtension: 0.5,
  functionExtension: 0.25,
  functionExtensionLeft: 0.25,
  functionExtensionRight: 0.25,
  metadata: DEFAULT_VECTOR_2D_METADATA,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function finiteVectorNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function vectorPair(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value)) return fallback;
  return [finiteVectorNumber(value[0], fallback[0]), finiteVectorNumber(value[1], fallback[1])];
}

function finiteOptionalVectorNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function positiveVectorNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function finiteVectorNumberOrUndefined(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function stripInlineMathDelimiters(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("$$") && trimmed.endsWith("$$")) return trimmed.slice(2, -2).trim();
  if (trimmed.startsWith("$") && trimmed.endsWith("$")) return trimmed.slice(1, -1).trim();
  if (trimmed.startsWith("\\(") && trimmed.endsWith("\\)")) return trimmed.slice(2, -2).trim();
  return trimmed;
}

function normalizeSourceLabelLatex(value: string) {
  return stripInlineMathDelimiters(value)
    .replace(/\u00a0/g, " ")
    .trim();
}

function normalizeSourceLengthLabel(value: string) {
  const source = normalizeSourceLabelLatex(value)
    .replace(/\\(?:text|mathrm)\s*\{\s*units?\s*\}/gi, "\\text{units}")
    .replace(/\s+/g, " ")
    .trim();
  const unitsMatch = source.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:\\\s*)?(?:\\text\s*\{\s*units?\s*\}|units?)$/i);
  if (unitsMatch) return `${unitsMatch[1]}\\ \\text{units}`;
  return source;
}

function normalizeSourceAngleLabel(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  const source = normalizeSourceLabelLatex(value)
    .replace(/\s+/g, "")
    .replace(/\u00b0/g, "^\\circ")
    .replace(/\\degree\b/gi, "^\\circ")
    .replace(/\^\{\\circ\}/gi, "^\\circ");
  const degreeMatch = source.match(/^([+-]?\d+(?:\.\d+)?)(?:\^\\circ|\\circ)?$/i);
  if (degreeMatch) return `${degreeMatch[1]}^\\circ`;
  return source;
}

function optionalVectorPair(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const x = finiteVectorNumberOrUndefined(value[0]);
  const y = finiteVectorNumberOrUndefined(value[1]);
  return x === undefined || y === undefined ? undefined : [x, y];
}

function sanitizeVectorId(value: unknown, fallback: string) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : fallback;
  const normalized = raw.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (/^[A-Za-z][A-Za-z0-9_]*$/.test(normalized)) return normalized;
  return /^[A-Za-z]/.test(fallback) ? fallback : `v_${fallback.replace(/[^A-Za-z0-9_]+/g, "_")}`;
}

function vectorLabelForSource(name: string, explicitLabel: unknown) {
  if (typeof explicitLabel === "string" && explicitLabel.trim()) return normalizeSourceLabelLatex(explicitLabel);
  return `\\mathbf{${name.toLowerCase()}}`;
}

function formatSourceVectorNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.abs(value) < 1e-9 ? 0 : Number(value.toFixed(6));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function defaultSourceLengthLabel(value: unknown) {
  const numberValue = finiteVectorNumberOrUndefined(value);
  return numberValue === undefined ? "" : `${formatSourceVectorNumber(numberValue)}\\ \\text{units}`;
}

function componentsFromSourceVector(entry: Vector2DSourceVectorInput, start: [number, number]): [number, number] {
  const explicitComponents = optionalVectorPair(entry.components);
  if (explicitComponents) return explicitComponents;

  const end = optionalVectorPair(entry.end);
  if (end) return [end[0] - start[0], end[1] - start[1]];

  const length = finiteVectorNumberOrUndefined(entry.length);
  const angleDeg = finiteVectorNumberOrUndefined(entry.angleDeg);
  if (length !== undefined && angleDeg !== undefined) {
    const angleRadians = (angleDeg * Math.PI) / 180;
    return [Number((length * Math.cos(angleRadians)).toFixed(8)), Number((length * Math.sin(angleRadians)).toFixed(8))];
  }

  return [1, 0];
}

function sourceVectorBounds(points: Array<[number, number]>, widthPx: number, heightPx: number) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (minX === maxX) {
    minX -= 1;
    maxX += 1;
  }
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }

  const xSpan = maxX - minX;
  const ySpan = maxY - minY;
  const padding = Math.max(xSpan, ySpan, 1) * 0.34;
  minX -= padding;
  maxX += padding;
  minY -= padding;
  maxY += padding;

  const desiredAspect = Math.max(0.5, widthPx / Math.max(1, heightPx));
  const currentAspect = (maxX - minX) / Math.max(0.001, maxY - minY);
  if (currentAspect < desiredAspect) {
    const targetSpan = (maxY - minY) * desiredAspect;
    const extra = targetSpan - (maxX - minX);
    minX -= extra / 2;
    maxX += extra / 2;
  } else if (currentAspect > desiredAspect) {
    const targetSpan = (maxX - minX) / desiredAspect;
    const extra = targetSpan - (maxY - minY);
    minY -= extra / 2;
    maxY += extra / 2;
  }

  return { minX, maxX, minY, maxY };
}

function defaultSourceSegmentOffsetPx(components: [number, number]) {
  const angle = ((Math.atan2(components[1], components[0]) * 180) / Math.PI + 360) % 360;
  return angle <= 60 ? -24 : 24;
}

function roundedSourceCoordinate(value: number) {
  return Number(value.toFixed(6));
}

function sourceUnitVector(components: [number, number]): [number, number] {
  const length = Math.hypot(components[0], components[1]);
  return length > 1e-9 ? [components[0] / length, components[1] / length] : [1, 0];
}

function defaultSourceVectorLabelPosition(start: [number, number], components: [number, number]): [number, number] {
  const end: [number, number] = [start[0] + components[0], start[1] + components[1]];
  const direction = sourceUnitVector(components);
  return [
    roundedSourceCoordinate(end[0] + direction[0] * 0.28 + direction[1] * 0.14),
    roundedSourceCoordinate(end[1] + direction[1] * 0.28 + direction[0] * 0.14),
  ];
}

function sourceSegmentLabel(
  vectorId: string,
  label: string,
  index: number,
  entry: Partial<Vector2DSourceSegmentLabelInput> = {},
  fallbackOffsetPx = 18,
) {
  const labelX = finiteOptionalVectorNumber(entry.labelX);
  const labelY = finiteOptionalVectorNumber(entry.labelY);

  return {
    id: String(entry.id ?? `segment-label-${vectorId}-${index + 1}`),
    vectorId,
    label: normalizeSourceLengthLabel(label),
    position: Math.min(0.95, Math.max(0.05, finiteVectorNumber(entry.position, 0.55))),
    offsetPx: finiteVectorNumber(entry.offsetPx ?? entry.offset, fallbackOffsetPx),
    color: String(entry.color ?? VECTOR_2D_ANNOTATION_COLOR),
    ...(entry.solutionOnly === true ? { solutionOnly: true } : {}),
    ...(labelX !== undefined ? { labelX } : {}),
    ...(labelY !== undefined ? { labelY } : {}),
  };
}

function shortestSourceAngleDelta(from: number, to: number) {
  let delta = to - from;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
}

function defaultSourceAngleLabelPosition(
  first: { start: [number, number]; components: [number, number] },
  second: { components: [number, number] },
  radius: number,
): [number, number] {
  const startAngle = Math.atan2(first.components[1], first.components[0]);
  const middleAngle = startAngle + shortestSourceAngleDelta(startAngle, Math.atan2(second.components[1], second.components[0])) / 2;
  const labelRadius = radius * 1.75;
  return [
    roundedSourceCoordinate(first.start[0] + Math.cos(middleAngle) * labelRadius),
    roundedSourceCoordinate(first.start[1] + Math.sin(middleAngle) * labelRadius),
  ];
}

function sourceAngleMarker(
  entry: Vector2DSourceAngleMarkerInput,
  index: number,
  vectorsById: Map<string, { start: [number, number]; components: [number, number] }>,
) {
  const from = String(entry.from ?? entry.vectorA ?? "").trim();
  const to = String(entry.to ?? entry.vectorB ?? "").trim();
  if (!from || !to) return null;
  const rightAngle = entry.rightAngle === true || entry.kind === "rightAngle" || entry.type === "rightAngle";
  const radius = Math.max(0.05, positiveVectorNumber(entry.radius, rightAngle ? 0.38 : 0.62));
  const label = normalizeSourceAngleLabel(entry.label);
  const defaultLabelPosition =
    !rightAngle && label
      ? defaultSourceAngleLabelPosition(
          vectorsById.get(from) ?? { start: [0, 0], components: [1, 0] },
          vectorsById.get(to) ?? { components: [1, 0] },
          radius,
        )
      : undefined;
  const labelX = finiteOptionalVectorNumber(entry.labelX) ?? defaultLabelPosition?.[0];
  const labelY = finiteOptionalVectorNumber(entry.labelY) ?? defaultLabelPosition?.[1];

  return {
    id: String(entry.id ?? `angle-marker-${index + 1}`),
    from,
    to,
    label,
    rightAngle,
    radius,
    color: String(entry.color ?? VECTOR_2D_ANNOTATION_COLOR),
    ...(entry.solutionOnly === true ? { solutionOnly: true } : {}),
    ...(labelX !== undefined ? { labelX } : {}),
    ...(labelY !== undefined ? { labelY } : {}),
  };
}

export function vector2dMetadata(config?: GraphConfig | null) {
  const metadata = config?.metadata ?? {};
  const vector2d = asRecord(metadata.vector2d) ?? {};
  return vector2d;
}

export function vector2dLabelStyle(value: unknown, fallback: Vector2DLabelStyle = "boldLower"): Vector2DLabelStyle {
  return value === "boldLower" || value === "arrow" || value === "custom" ? value : fallback;
}

export function defaultVector2DName(index: number, labelStyle: Vector2DLabelStyle) {
  if (labelStyle === "arrow") {
    const arrowNames = ["AB", "CD", "EF", "GH", "PQ", "RS", "UV", "WX"];
    return arrowNames[index] ?? `AB_${index + 1}`;
  }

  if (index >= 0 && index < 26) return String.fromCharCode(97 + index);
  return `v_${index + 1}`;
}

export function normalizedVector2DEntries(config: GraphConfig): Vector2DControlEntry[] {
  const vector2d = vector2dMetadata(config);
  const rawVectors = Array.isArray(vector2d.vectors)
    ? vector2d.vectors
    : Array.isArray(config.metadata?.vectors)
      ? config.metadata.vectors
      : undefined;

  if (rawVectors?.length) {
    return rawVectors.map((entry, index) => {
      const record = asRecord(entry) ?? {};
      const fallback = DEFAULT_VECTOR_2D_METADATA.vector2d.vectors[index % DEFAULT_VECTOR_2D_METADATA.vector2d.vectors.length];
      const name = String(record.name ?? record.id ?? fallback.name);
      return {
        id: String(record.id ?? name ?? `v${index + 1}`),
        name,
        label: String(record.label ?? ""),
        start: vectorPair(record.start, fallback.start as [number, number]),
        components: vectorPair(record.components ?? record.vector, fallback.components as [number, number]),
        color: String(record.color ?? VECTOR_2D_COLORS[index % VECTOR_2D_COLORS.length]),
        showComponents: record.showComponents === true,
        labelX: finiteOptionalVectorNumber(record.labelX),
        labelY: finiteOptionalVectorNumber(record.labelY),
        ...(record.solutionOnly === true ? { solutionOnly: true } : {}),
      };
    });
  }

  if (Array.isArray(config.metadata?.vector)) {
    return [
      {
        id: "a",
        name: "a",
        label: "",
        start: [0, 0],
        components: vectorPair(config.metadata.vector, [2, 3]),
        color: VECTOR_2D_COLORS[0],
        showComponents: false,
      },
    ];
  }

  return DEFAULT_VECTOR_2D_METADATA.vector2d.vectors.map((vector) => ({
    ...vector,
    start: vector.start as [number, number],
    components: vector.components as [number, number],
  }));
}

export function normalizedVector2DSegmentLabels(config: GraphConfig): Vector2DSegmentLabelEntry[] {
  const vector2d = vector2dMetadata(config);
  const rawLabels = Array.isArray(vector2d.segmentLabels) ? vector2d.segmentLabels : [];

  return rawLabels
    .map((entry, index): Vector2DSegmentLabelEntry | null => {
      const record = asRecord(entry) ?? {};
      const vectorId = String(record.vectorId ?? record.vector ?? "");
      const label = String(record.label ?? "");
      if (!vectorId.trim() || !label.trim()) return null;
      return {
        id: String(record.id ?? `segment-label-${index + 1}`),
        vectorId,
        label,
        position: Math.max(0.05, Math.min(0.95, finiteVectorNumber(record.position, 0.55))),
        offsetPx: finiteVectorNumber(record.offsetPx ?? record.offset, 18),
        color: String(record.color ?? VECTOR_2D_ANNOTATION_COLOR),
        labelX: finiteOptionalVectorNumber(record.labelX),
        labelY: finiteOptionalVectorNumber(record.labelY),
        ...(record.solutionOnly === true ? { solutionOnly: true } : {}),
      };
    })
    .filter((entry): entry is Vector2DSegmentLabelEntry => !!entry);
}

export function normalizedVector2DAngleMarkers(config: GraphConfig): Vector2DAngleMarkerEntry[] {
  const vector2d = vector2dMetadata(config);
  const rawMarkers = Array.isArray(vector2d.angleMarkers) ? vector2d.angleMarkers : [];

  return rawMarkers
    .map((entry, index): Vector2DAngleMarkerEntry | null => {
      const record = asRecord(entry) ?? {};
      const from = String(record.from ?? record.vectorA ?? "");
      const to = String(record.to ?? record.vectorB ?? "");
      if (!from.trim() || !to.trim()) return null;

      return {
        id: String(record.id ?? `angle-marker-${index + 1}`),
        from,
        to,
        label: String(record.label ?? ""),
        rightAngle: record.rightAngle === true || record.kind === "rightAngle" || record.type === "rightAngle",
        radius: Math.max(0.05, finiteVectorNumber(record.radius, 0.45)),
        color: String(record.color ?? VECTOR_2D_ANNOTATION_COLOR),
        labelX: finiteOptionalVectorNumber(record.labelX),
        labelY: finiteOptionalVectorNumber(record.labelY),
        ...(record.solutionOnly === true ? { solutionOnly: true } : {}),
      };
    })
    .filter((entry): entry is Vector2DAngleMarkerEntry => !!entry);
}

export function vector2dMetadataFromEntries(config: GraphConfig, vectors: Vector2DControlEntry[]) {
  return {
    ...(config.metadata ?? {}),
    vector2d: {
      ...vector2dMetadata(config),
      vectors,
    },
  };
}

export function vector2dMetadataFromSegmentLabels(config: GraphConfig, segmentLabels: Vector2DSegmentLabelEntry[]) {
  return {
    ...(config.metadata ?? {}),
    vector2d: {
      ...vector2dMetadata(config),
      segmentLabels,
    },
  };
}

export function vector2dMetadataFromAngleMarkers(config: GraphConfig, angleMarkers: Vector2DAngleMarkerEntry[]) {
  return {
    ...(config.metadata ?? {}),
    vector2d: {
      ...vector2dMetadata(config),
      angleMarkers,
    },
  };
}

const VECTOR_2D_ELEMENT_LIST_KEYS = {
  vector: "vectors",
  segmentLabel: "segmentLabels",
  angleMarker: "angleMarkers",
} as const satisfies Record<Vector2DElementKind, Vector2DElementListKey>;

export function normalizeVector2DElementKind(value: unknown): Vector2DElementKind | null {
  if (value === "vector" || value === "vectors") return "vector";
  if (value === "segmentLabel" || value === "segment-label" || value === "segmentLabels") return "segmentLabel";
  if (value === "angleMarker" || value === "angle-marker" || value === "angleMarkers") return "angleMarker";
  return null;
}

export function vector2dElementTarget(kind: Vector2DElementKind, index: number): Vector2DElementTarget | null {
  if (!Number.isInteger(index) || index < 0) return null;
  return { kind, listKey: VECTOR_2D_ELEMENT_LIST_KEYS[kind], index };
}

export function vector2dElements(config: GraphConfig, kind: Vector2DElementKind): Vector2DElement[] {
  if (kind === "vector") return normalizedVector2DEntries(config);
  if (kind === "segmentLabel") return normalizedVector2DSegmentLabels(config);
  return normalizedVector2DAngleMarkers(config);
}

export function vector2dElementAt(config: GraphConfig, target: Vector2DElementTarget): Vector2DElement | undefined {
  return vector2dElements(config, target.kind)[target.index];
}

export function vector2dElementIndexById(config: GraphConfig, kind: Vector2DElementKind, idValue: string) {
  return vector2dElements(config, kind).findIndex((entry) => entry.id === idValue);
}

export function vector2dElementDisplayName(config: GraphConfig, target: Vector2DElementTarget) {
  const element = vector2dElementAt(config, target);
  const kindLabel = target.kind === "segmentLabel" ? "Segment label" : target.kind === "angleMarker" ? "Angle marker" : "Vector";
  const name = element && "name" in element && element.name.trim() ? element.name.trim() : element?.id?.trim();
  return name ? `${kindLabel} ${target.index + 1}: ${name}` : `${kindLabel} ${target.index + 1}`;
}

export function isSolutionOnlyVector2DElement(element: Vector2DElement) {
  return element.solutionOnly === true;
}

export function vector2dElementForAuthoringLayer<TElement extends Vector2DElement>(element: TElement, solutionsMode: boolean): TElement {
  return solutionsMode ? ({ ...element, solutionOnly: true } as TElement) : element;
}

export function vector2dElementWithSolutionOnly<TElement extends Vector2DElement>(element: TElement, solutionOnly: boolean): TElement {
  return { ...element, solutionOnly } as TElement;
}

export function updateVector2DElement(
  config: GraphConfig,
  target: Vector2DElementTarget,
  patch: Partial<Vector2DElement>,
): Record<string, unknown> {
  const elements = vector2dElements(config, target.kind);
  if (!elements[target.index]) return config.metadata ?? {};
  const nextElements = elements.map((entry, index) => (index === target.index ? { ...entry, ...patch } : entry));
  return {
    ...(config.metadata ?? {}),
    vector2d: {
      ...vector2dMetadata(config),
      [target.listKey]: nextElements,
    },
  };
}

function vector2dRawElementLists(config: GraphConfig) {
  const metadata = config.metadata ?? {};
  const vector2d = vector2dMetadata(config);
  return {
    metadata,
    vector2d,
    vectors: Array.isArray(vector2d.vectors) ? vector2d.vectors : [],
    segmentLabels: Array.isArray(vector2d.segmentLabels) ? vector2d.segmentLabels : [],
    angleMarkers: Array.isArray(vector2d.angleMarkers) ? vector2d.angleMarkers : [],
  };
}

export function vector2dConfigHasSolutionOnly(config: GraphConfig) {
  if (config.type !== "vector2d") return false;
  const lists = vector2dRawElementLists(config);
  return [lists.vectors, lists.segmentLabels, lists.angleMarkers].some((entries) =>
    entries.some((entry) => asRecord(entry)?.solutionOnly === true),
  );
}

export function vector2dConfigForSolutionVisibility(config: GraphConfig, showSolutions: boolean, solutionColor?: string): GraphConfig {
  if (!vector2dConfigHasSolutionOnly(config)) return config;
  const lists = vector2dRawElementLists(config);
  const visibleList = (entries: unknown[]) =>
    showSolutions
      ? entries.map((entry) => {
          const record = asRecord(entry);
          return record?.solutionOnly === true && solutionColor ? { ...record, color: solutionColor } : entry;
        })
      : entries.filter((entry) => asRecord(entry)?.solutionOnly !== true);
  return {
    ...config,
    metadata: {
      ...lists.metadata,
      vector2d: {
        ...lists.vector2d,
        vectors: visibleList(lists.vectors),
        segmentLabels: visibleList(lists.segmentLabels),
        angleMarkers: visibleList(lists.angleMarkers),
      },
    } as GraphMetadata,
  };
}

export function buildVector2DSourceDiagramConfig(input: Vector2DSourceDiagramInput): GraphConfig {
  const labelStyle = vector2dLabelStyle(input.labelStyle, "custom");
  const widthPx = positiveVectorNumber(input.widthPx, 560);
  const heightPx = positiveVectorNumber(input.heightPx, 360);
  const rawVectors = input.vectors?.length ? input.vectors : [{ id: "a", name: "a", length: 2, angleDeg: 0 }];
  const points: Array<[number, number]> = [[0, 0]];
  const segmentLabels: ReturnType<typeof sourceSegmentLabel>[] = [];

  const vectors = rawVectors.map((entry, index) => {
    const fallbackName = defaultVector2DName(index, "boldLower");
    const id = sanitizeVectorId(entry.id ?? entry.name, fallbackName);
    const name = String(entry.name ?? entry.id ?? fallbackName).trim() || fallbackName;
    const start = optionalVectorPair(entry.start) ?? [0, 0];
    const components = componentsFromSourceVector(entry, start);
    const defaultLabelPosition = defaultSourceVectorLabelPosition(start, components);
    const labelX = finiteOptionalVectorNumber(entry.labelX) ?? defaultLabelPosition[0];
    const labelY = finiteOptionalVectorNumber(entry.labelY) ?? defaultLabelPosition[1];
    points.push(start, [start[0] + components[0], start[1] + components[1]]);
    points.push([labelX, labelY]);

    if (entry.lengthLabel !== false) {
      const label =
        typeof entry.lengthLabel === "string" && entry.lengthLabel.trim()
          ? entry.lengthLabel.trim()
          : defaultSourceLengthLabel(entry.length);
      if (label) segmentLabels.push(sourceSegmentLabel(id, label, segmentLabels.length, {}, defaultSourceSegmentOffsetPx(components)));
    }

    return {
      id,
      name,
      label: vectorLabelForSource(name, entry.label),
      start,
      components,
      color: String(entry.color ?? VECTOR_2D_ANNOTATION_COLOR),
      showComponents: entry.showComponents === true,
      ...(entry.solutionOnly === true ? { solutionOnly: true } : {}),
      ...(labelX !== undefined ? { labelX } : {}),
      ...(labelY !== undefined ? { labelY } : {}),
    };
  });

  const vectorIds = new Set(vectors.map((vector) => vector.id));
  for (const [index, entry] of (input.segmentLabels ?? []).entries()) {
    const vectorId = String(entry.vectorId ?? entry.vector ?? "").trim();
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    if (vectorId && vectorIds.has(vectorId) && label) {
      segmentLabels.push(sourceSegmentLabel(vectorId, label, segmentLabels.length + index, entry));
    }
  }

  const vectorsById = new Map(vectors.map((vector) => [vector.id, { start: vector.start, components: vector.components }]));
  const angleMarkers = (input.angleMarkers ?? [])
    .map((entry, index) => sourceAngleMarker(entry, index, vectorsById))
    .filter((entry): entry is NonNullable<ReturnType<typeof sourceAngleMarker>> => !!entry);
  angleMarkers.forEach((marker) => {
    if (marker.label.trim() && marker.labelX !== undefined && marker.labelY !== undefined) points.push([marker.labelX, marker.labelY]);
  });

  const bounds = sourceVectorBounds(points, widthPx, heightPx);
  const xMin = finiteVectorNumberOrUndefined(input.xMin) ?? bounds.minX;
  const xMax = finiteVectorNumberOrUndefined(input.xMax) ?? bounds.maxX;
  const yMin = finiteVectorNumberOrUndefined(input.yMin) ?? bounds.minY;
  const yMax = finiteVectorNumberOrUndefined(input.yMax) ?? bounds.maxY;

  return {
    ...DEFAULT_VECTOR_2D_GRAPH,
    type: "vector2d",
    expression: "",
    latex: "",
    functions: [],
    features: [],
    xMin,
    xMax,
    yMin,
    yMax,
    widthPx,
    heightPx,
    lockAspectRatio: false,
    equalScale: input.equalScale !== false,
    showGrid: input.showGrid === true,
    showMajorGrid: input.showGrid === true,
    showMinorGrid: false,
    showGridBorder: false,
    showAxes: input.showAxes === true,
    showArrows: input.showAxes === true,
    showAxisLabels: false,
    showAxisNumbers: false,
    axisLabelStepX: 1,
    axisLabelStepY: 1,
    axisExtensionMode: "manual",
    functionExtensionMode: "manual",
    axisExtension: 0,
    functionExtension: 0,
    functionExtensionLeft: 0,
    functionExtensionRight: 0,
    metadata: {
      vector2d: {
        labelStyle,
        vectors,
        ...(segmentLabels.length ? { segmentLabels } : {}),
        ...(angleMarkers.length ? { angleMarkers } : {}),
      },
    },
  } as GraphConfig;
}
