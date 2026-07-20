import type {
  Graph2DGeometryAngle,
  Graph2DGeometryArc,
  Graph2DGeometryData,
  Graph2DGeometryDecoration,
  Graph2DGeometryPoint,
  Graph2DGeometrySegment,
  GraphConfig,
} from "@mauth-studio/shared";

export type Geometry2DListKey = "points" | "segments" | "arcs" | "angles" | "decorations";
export type Geometry2DPrimitiveKind = "point" | "segment" | "arc" | "angle" | "decoration";

export interface Geometry2DPrimitiveTarget {
  kind: Geometry2DPrimitiveKind;
  listKey: Geometry2DListKey;
  index: number;
}

export type Geometry2DPrimitive =
  | Graph2DGeometryPoint
  | Graph2DGeometrySegment
  | Graph2DGeometryArc
  | Graph2DGeometryAngle
  | Graph2DGeometryDecoration;

export const GEOMETRY_2D_CHILD_SEGMENTS = {
  points: "gpt",
  segments: "gseg",
  arcs: "garc",
  angles: "gang",
  decorations: "gdec",
} as const satisfies Record<Geometry2DListKey, string>;

export const GEOMETRY_2D_PRIMITIVE_KINDS = ["point", "segment", "arc", "angle", "decoration"] as const;

const GEOMETRY_2D_KIND_TO_LIST_KEY = {
  point: "points",
  segment: "segments",
  arc: "arcs",
  angle: "angles",
  decoration: "decorations",
} as const satisfies Record<Geometry2DPrimitiveKind, Geometry2DListKey>;

const GEOMETRY_2D_LIST_KEY_TO_KIND = {
  points: "point",
  segments: "segment",
  arcs: "arc",
  angles: "angle",
  decorations: "decoration",
} as const satisfies Record<Geometry2DListKey, Geometry2DPrimitiveKind>;

const GEOMETRY_2D_CHILD_SEGMENT_TO_LIST_KEY = Object.fromEntries(
  Object.entries(GEOMETRY_2D_CHILD_SEGMENTS).map(([listKey, segment]) => [segment, listKey]),
) as Record<string, Geometry2DListKey | undefined>;

export function geometry2dChildAnchor(anchor: string | undefined, key: Geometry2DListKey, index: number) {
  return `${anchor ?? "geometry2d"}/${GEOMETRY_2D_CHILD_SEGMENTS[key]}:${index}`;
}

export function geometry2dPrimitiveKindLabel(kind: Geometry2DPrimitiveKind) {
  if (kind === "decoration") return "Marker";
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

export function geometry2dListKeyForPrimitiveKind(kind: Geometry2DPrimitiveKind): Geometry2DListKey {
  return GEOMETRY_2D_KIND_TO_LIST_KEY[kind];
}

export function geometry2dPrimitiveKindForListKey(listKey: Geometry2DListKey): Geometry2DPrimitiveKind {
  return GEOMETRY_2D_LIST_KEY_TO_KIND[listKey];
}

export function normalizeGeometry2DPrimitiveKind(value: unknown): Geometry2DPrimitiveKind | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (key === "marker" || key === "markers") return "decoration";
  if (key === "points") return "point";
  if (key === "segments") return "segment";
  if (key === "arcs") return "arc";
  if (key === "angles") return "angle";
  if (key === "decorations") return "decoration";
  return (GEOMETRY_2D_PRIMITIVE_KINDS as readonly string[]).includes(key) ? (key as Geometry2DPrimitiveKind) : null;
}

export function geometry2dPrimitiveTarget(kind: Geometry2DPrimitiveKind, index: number): Geometry2DPrimitiveTarget | null {
  if (!Number.isInteger(index) || index < 0) return null;
  return { kind, listKey: geometry2dListKeyForPrimitiveKind(kind), index };
}

export function geometry2dPrimitiveTargetFromAnchor(anchor: string | null | undefined): Geometry2DPrimitiveTarget | null {
  const match = anchor?.match(/\/(gpt|gseg|garc|gang|gdec):(\d+)$/);
  if (!match) return null;
  const listKey = GEOMETRY_2D_CHILD_SEGMENT_TO_LIST_KEY[match[1] ?? ""];
  const index = Number(match[2]);
  if (!listKey || !Number.isInteger(index) || index < 0) return null;
  return { kind: geometry2dPrimitiveKindForListKey(listKey), listKey, index };
}

export function geometry2dPrimitiveAt(data: Graph2DGeometryData, target: Geometry2DPrimitiveTarget): Geometry2DPrimitive | undefined {
  return data[target.listKey]?.[target.index] as Geometry2DPrimitive | undefined;
}

export function geometry2dPrimitiveIndexById(data: Graph2DGeometryData, kind: Geometry2DPrimitiveKind, idValue: string) {
  const listKey = geometry2dListKeyForPrimitiveKind(kind);
  return (data[listKey] ?? []).findIndex((entry) => typeof entry.id === "string" && entry.id === idValue);
}

export function geometry2dPrimitiveDisplayName(data: Graph2DGeometryData, target: Geometry2DPrimitiveTarget) {
  const primitive = geometry2dPrimitiveAt(data, target);
  const kindLabel = geometry2dPrimitiveKindLabel(target.kind);
  const idValue = primitive && "id" in primitive && typeof primitive.id === "string" && primitive.id.trim() ? primitive.id.trim() : "";
  const decorationKind =
    target.kind === "decoration" && primitive && "kind" in primitive && typeof primitive.kind === "string" && primitive.kind.trim()
      ? primitive.kind.trim()
      : "";
  const suffix = idValue || decorationKind;
  return suffix ? `${kindLabel} ${target.index + 1}: ${suffix}` : `${kindLabel} ${target.index + 1}`;
}

export function isSolutionOnlyGeometry2DPrimitive(primitive: Geometry2DPrimitive) {
  return primitive.solutionOnly === true;
}

export function geometry2dPrimitiveForAuthoringLayer<TPrimitive extends Geometry2DPrimitive>(
  primitive: TPrimitive,
  solutionsMode: boolean,
): TPrimitive {
  return solutionsMode ? ({ ...primitive, solutionOnly: true } as TPrimitive) : primitive;
}

export function geometry2dPrimitiveWithSolutionOnly<TPrimitive extends Geometry2DPrimitive>(
  primitive: TPrimitive,
  solutionOnly: boolean,
): TPrimitive {
  return { ...primitive, solutionOnly } as TPrimitive;
}

export function updateGeometry2DPrimitive(
  data: Graph2DGeometryData,
  target: Geometry2DPrimitiveTarget,
  patch: Partial<Geometry2DPrimitive>,
): Graph2DGeometryData {
  if (target.kind === "point") return updateGeometry2DPoint(data, target.index, patch as Partial<Graph2DGeometryPoint>);
  if (target.kind === "segment") return updateGeometry2DSegment(data, target.index, patch as Partial<Graph2DGeometrySegment>);
  if (target.kind === "arc") return updateGeometry2DArc(data, target.index, patch as Partial<Graph2DGeometryArc>);
  if (target.kind === "angle") return updateGeometry2DAngle(data, target.index, patch as Partial<Graph2DGeometryAngle>);
  return updateGeometry2DDecoration(data, target.index, patch as Partial<Graph2DGeometryDecoration>);
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const DEFAULT_GEOMETRY_2D_DATA: Graph2DGeometryData = {
  points: [
    { id: "O", x: 0, y: 0, label: "$O$", labelX: -0.42, labelY: 0.28 },
    { id: "A", x: 2, y: -3.464, label: "$A$", labelX: 2.04, labelY: -3.78 },
    { id: "B", x: 4, y: 0, label: "$B$", labelX: 4.16, labelY: -0.26 },
    { id: "C", x: 4, y: 2.5, label: "$C$", labelX: 4.16, labelY: 2.58 },
  ],
  segments: [
    { id: "OA", from: "O", to: "A", label: "$4\\text{ cm}$", labelX: 0.85, labelY: -1.85, strokeWidth: 2 },
    { id: "OB", from: "O", to: "B", strokeStyle: "dashed", strokeWidth: 2 },
    { id: "BC", from: "B", to: "C", label: "$2.5\\text{ cm}$", labelX: 4.35, labelY: 1.1, strokeWidth: 2 },
    { id: "CO", from: "C", to: "O", strokeWidth: 2 },
  ],
  arcs: [{ id: "arc-BA", center: "O", from: "B", to: "A", strokeWidth: 2 }],
  angles: [
    { id: "BOA", points: ["B", "O", "A"], label: "$60^\\circ$", labelX: 0.95, labelY: -0.62, radius: 0.7, strokeWidth: 1.6 },
    { id: "OBC", points: ["O", "B", "C"], radius: 0.45, show: false },
  ],
  decorations: [
    { kind: "equalLength", id: "equal-radii", segments: ["OA", "OB"], tickCount: 1, size: 16, show: true },
    { kind: "rightAngle", id: "right-angle-B", angle: "OBC", size: 0.35, show: true },
  ],
};

export const DEFAULT_GEOMETRY_2D_GRAPH: GraphConfig = {
  type: "geometry2d",
  data: DEFAULT_GEOMETRY_2D_DATA,
  functions: [],
  features: [],
  xMin: -0.8,
  xMax: 4.8,
  yMin: -4,
  yMax: 3.2,
  widthPx: 420,
  heightPx: 340,
  lockAspectRatio: false,
  equalScale: true,
  showGrid: false,
  showMajorGrid: false,
  showMinorGrid: false,
  showGridBorder: false,
  showAxes: false,
  showArrows: false,
  showAxisLabels: false,
  showAxisNumbers: false,
  showFunctionArrows: false,
  gridMajorStep: 1,
  gridMinorStep: 0.5,
  gridMajorStepX: 1,
  gridMajorStepY: 1,
  gridMinorStepX: 0.5,
  gridMinorStepY: 0.5,
  metadata: {},
};

export function geometry2dData(graphConfig?: GraphConfig | null): Graph2DGeometryData {
  const data = graphConfig?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return DEFAULT_GEOMETRY_2D_DATA;
  if (graphConfig?.type === "geometry2d") return data as Graph2DGeometryData;
  const nested = (data as Record<string, unknown>).geometry2d;
  return nested && typeof nested === "object" && !Array.isArray(nested) ? (nested as Graph2DGeometryData) : DEFAULT_GEOMETRY_2D_DATA;
}

function geometry2dListForSolutionVisibility<TPrimitive extends Geometry2DPrimitive>(
  primitives: TPrimitive[] | undefined,
  showSolutions: boolean,
  solutionColor?: string,
) {
  if (!primitives?.some(isSolutionOnlyGeometry2DPrimitive)) return primitives;
  if (!showSolutions) return primitives.filter((primitive) => !isSolutionOnlyGeometry2DPrimitive(primitive));
  if (!solutionColor) return primitives;
  return primitives.map((primitive) =>
    isSolutionOnlyGeometry2DPrimitive(primitive) ? ({ ...primitive, color: solutionColor } as TPrimitive) : primitive,
  );
}

export function geometry2dDataForSolutionVisibility(
  data: Graph2DGeometryData,
  showSolutions: boolean,
  solutionColor?: string,
): Graph2DGeometryData {
  const points = geometry2dListForSolutionVisibility(data.points, showSolutions, solutionColor);
  const segments = geometry2dListForSolutionVisibility(data.segments, showSolutions, solutionColor);
  const arcs = geometry2dListForSolutionVisibility(data.arcs, showSolutions, solutionColor);
  const angles = geometry2dListForSolutionVisibility(data.angles, showSolutions, solutionColor);
  const decorations = geometry2dListForSolutionVisibility(data.decorations, showSolutions, solutionColor);
  if (
    points === data.points &&
    segments === data.segments &&
    arcs === data.arcs &&
    angles === data.angles &&
    decorations === data.decorations
  ) {
    return data;
  }
  return { ...data, points, segments, arcs, angles, decorations };
}

export function geometry2dDataHasSolutionOnly(data: Graph2DGeometryData) {
  return [data.points, data.segments, data.arcs, data.angles, data.decorations].some((primitives) =>
    primitives?.some(isSolutionOnlyGeometry2DPrimitive),
  );
}

export function geometry2dCounts(data: Graph2DGeometryData) {
  return {
    pointCount: data.points?.length ?? 0,
    segmentCount: data.segments?.length ?? 0,
    arcCount: data.arcs?.length ?? 0,
    angleCount: data.angles?.length ?? 0,
    decorationCount: data.decorations?.length ?? 0,
  };
}

export function geometry2dSummary(graphConfig?: GraphConfig | null) {
  const counts = geometry2dCounts(geometry2dData(graphConfig));
  const parts = [
    counts.pointCount ? `${counts.pointCount} point${counts.pointCount === 1 ? "" : "s"}` : "",
    counts.segmentCount ? `${counts.segmentCount} segment${counts.segmentCount === 1 ? "" : "s"}` : "",
    counts.arcCount ? `${counts.arcCount} arc${counts.arcCount === 1 ? "" : "s"}` : "",
    counts.angleCount ? `${counts.angleCount} angle${counts.angleCount === 1 ? "" : "s"}` : "",
    counts.decorationCount ? `${counts.decorationCount} marker${counts.decorationCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Blank 2D diagram";
}

export function geometry2dPatch(config: GraphConfig, dataPatch: Partial<Graph2DGeometryData>) {
  return {
    data: {
      ...geometry2dData(config),
      ...dataPatch,
    },
  } satisfies Partial<GraphConfig>;
}

export function createGeometry2DPoint(index: number): Graph2DGeometryPoint {
  const name = String.fromCharCode("A".charCodeAt(0) + (index % 26));
  return {
    id: id("point"),
    x: index % 2 === 0 ? -1 : 1,
    y: Math.floor(index / 2),
    label: name,
    show: true,
  };
}

export function createGeometry2DSegment(points: readonly Graph2DGeometryPoint[]): Graph2DGeometrySegment {
  return {
    id: id("segment"),
    from: points[0]?.id ?? "A",
    to: points[1]?.id ?? points[0]?.id ?? "B",
    strokeWidth: 2,
    strokeStyle: "solid",
    show: true,
  };
}

export function createGeometry2DArc(points: readonly Graph2DGeometryPoint[]): Graph2DGeometryArc {
  return {
    id: id("arc"),
    center: points[0]?.id ?? "O",
    from: points[1]?.id ?? points[0]?.id ?? "A",
    to: points[2]?.id ?? points[1]?.id ?? points[0]?.id ?? "B",
    strokeWidth: 2,
    strokeStyle: "solid",
    show: true,
  };
}

export function createGeometry2DAngle(points: readonly Graph2DGeometryPoint[]): Graph2DGeometryAngle {
  return {
    id: id("angle"),
    points: [points[0]?.id ?? "A", points[1]?.id ?? points[0]?.id ?? "B", points[2]?.id ?? points[0]?.id ?? "C"],
    radius: 0.45,
    arcCount: 1,
    strokeWidth: 1.6,
    strokeStyle: "solid",
    show: true,
  };
}

export function createGeometry2DDecoration(kind: Graph2DGeometryDecoration["kind"], data: Graph2DGeometryData): Graph2DGeometryDecoration {
  if (kind === "equalLength") {
    const segmentIds = (data.segments ?? []).slice(0, 2).map((segment) => segment.id);
    return { kind, id: id("equal-length"), segments: segmentIds, tickCount: 1, size: 16, show: true };
  }
  if (kind === "equalAngle") {
    const angleIds = (data.angles ?? []).slice(0, 2).map((angle) => angle.id);
    return { kind, id: id("equal-angle"), angles: angleIds, arcCount: 1, radius: 0.45, show: true };
  }
  return { kind, id: id("right-angle"), angle: data.angles?.[0]?.id ?? "", size: 0.35, show: true };
}

export function updateGeometry2DPoint(data: Graph2DGeometryData, index: number, patch: Partial<Graph2DGeometryPoint>): Graph2DGeometryData {
  return { ...data, points: (data.points ?? []).map((point, pointIndex) => (pointIndex === index ? { ...point, ...patch } : point)) };
}

export function updateGeometry2DSegment(
  data: Graph2DGeometryData,
  index: number,
  patch: Partial<Graph2DGeometrySegment>,
): Graph2DGeometryData {
  return {
    ...data,
    segments: (data.segments ?? []).map((segment, segmentIndex) => (segmentIndex === index ? { ...segment, ...patch } : segment)),
  };
}

export function updateGeometry2DArc(data: Graph2DGeometryData, index: number, patch: Partial<Graph2DGeometryArc>): Graph2DGeometryData {
  return { ...data, arcs: (data.arcs ?? []).map((arc, arcIndex) => (arcIndex === index ? { ...arc, ...patch } : arc)) };
}

export function updateGeometry2DAngle(data: Graph2DGeometryData, index: number, patch: Partial<Graph2DGeometryAngle>): Graph2DGeometryData {
  return { ...data, angles: (data.angles ?? []).map((angle, angleIndex) => (angleIndex === index ? { ...angle, ...patch } : angle)) };
}

export function updateGeometry2DDecoration(
  data: Graph2DGeometryData,
  index: number,
  patch: Partial<Graph2DGeometryDecoration>,
): Graph2DGeometryData {
  return {
    ...data,
    decorations: (data.decorations ?? []).map((decoration, decorationIndex) =>
      decorationIndex === index ? { ...decoration, ...patch } : decoration,
    ),
  };
}
