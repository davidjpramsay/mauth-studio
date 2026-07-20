import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { GraphConfig } from "@mauth-studio/shared";
import JXG from "jsxgraph";

import { renderMathJaxSvg } from "@/lib/mathjax";
import { GRAPH_LABEL_FONT_CSS, graphLabelAttributes } from "./graphTypography";

const DEFAULT_GRAPH_WIDTH = 680;
const DEFAULT_GRAPH_HEIGHT = 300;
const AXIS_3D_LABEL_OFFSET_MULTIPLIER = 1.3;
const LABEL_ATTRIBUTES = graphLabelAttributes();
const DEFAULT_3D_VIEW_STATE = {
  az: 1,
  el: 0.3,
  bank: 0,
};
type Point3DCoords = [number, number, number];
type Point2DCoords = [number, number];
type Graph3DRanges = [[number, number], [number, number], [number, number]];
type Graph3DPointEntry = {
  id: string;
  label: string;
  coords: Point3DCoords;
  show: boolean;
  color?: string;
};
type Graph3DSegmentEntry = {
  id: string;
  from: string;
  to: string;
  label?: string;
  color?: string;
  dashed?: boolean;
  show: boolean;
};
type Graph3DDimensionEntry = {
  id: string;
  from: Point3DCoords;
  to: Point3DCoords;
  label?: string;
  color?: string;
  dashed?: boolean;
  strokeWidth?: number;
  show: boolean;
};
type Graph3DFaceEntry = {
  id: string;
  coords: Point3DCoords[];
  label?: string;
  fillColor?: string;
  fillOpacity: number;
  strokeColor?: string;
  strokeWidth?: number;
  dashed?: boolean;
  show: boolean;
};
type Graph3DSolidKind = "circle" | "cone" | "cylinder" | "sphere" | "spherecap" | "sphericalcap";
type Graph3DRenderStyle = "surface" | "wireframe" | "outline";
type Graph3DSolidEntry = {
  id: string;
  kind: Graph3DSolidKind;
  center?: Point3DCoords;
  baseCenter?: Point3DCoords;
  topCenter?: Point3DCoords;
  apex?: Point3DCoords;
  normal?: Point3DCoords;
  radius: number;
  height?: number;
  fillColor?: string;
  fillOpacity: number;
  strokeColor?: string;
  strokeWidth?: number;
  renderStyle: Graph3DRenderStyle;
  stepsU: number;
  stepsV: number;
  show: boolean;
};
type Graph3DLabelContext = {
  viewState: Basic3DViewState;
  frame: { minX: number; maxX: number; minY: number; maxY: number; center: Point2DCoords };
};
const AXIS_3D_LABEL_ATTRIBUTES = {
  label: LABEL_ATTRIBUTES,
  ticks3d: { label: LABEL_ATTRIBUTES },
};
const HIDDEN_3D_PLANE_ATTRIBUTES = {
  visible: false,
  mesh3d: { visible: false },
};
const HIDDEN_3D_PLANE_AXIS_ATTRIBUTES = {
  visible: false,
};
const POINT_3D_ATTRIBUTES = {
  fillColor: "#2563eb",
  strokeColor: "#0f172a",
  highlightFillColor: "#60a5fa",
  highlightStrokeColor: "#0f172a",
  size: 4,
  label: LABEL_ATTRIBUTES,
  withLabel: false,
};
const HIDDEN_3D_POINT_ATTRIBUTES = {
  visible: false,
  withLabel: false,
  showInfobox: false,
  fixed: true,
};
const LATEX_3D_LABEL_ATTRIBUTES = {
  ...LABEL_ATTRIBUTES,
  display: "html",
  anchorX: "middle",
  anchorY: "middle",
  fixed: true,
  highlight: false,
};

interface Basic3DViewState {
  az: number;
  el: number;
  bank: number;
}

interface Basic3DSlider {
  Value: () => number;
}

interface Basic3DView {
  create: (type: string, parents: unknown[], attributes?: Record<string, unknown>) => unknown;
  az_slide?: Basic3DSlider;
  el_slide?: Basic3DSlider;
  bank_slide?: Basic3DSlider;
}

function finiteNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function finiteTuple3(value: unknown): Point3DCoords | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  const z = Number(value[2]);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? [x, y, z] : null;
}

function positiveNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function clampedOpacity(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function colorValue(value: unknown, fallback?: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function graph3dRenderStyle(value: unknown): Graph3DRenderStyle {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "wireframe" || normalized === "wire" || normalized === "mesh") return "wireframe";
  if (normalized === "outline" || normalized === "edges") return "outline";
  return "surface";
}

function vectorAdd(left: Point3DCoords, right: Point3DCoords): Point3DCoords {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function vectorSubtract(left: Point3DCoords, right: Point3DCoords): Point3DCoords {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function vectorScale(vector: Point3DCoords, scalar: number): Point3DCoords {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function vectorLength(vector: Point3DCoords) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalizeVector(vector: Point3DCoords, fallback: Point3DCoords = [0, 0, 1]): Point3DCoords {
  const length = vectorLength(vector);
  if (length <= 1e-9) return fallback;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function crossProduct(left: Point3DCoords, right: Point3DCoords): Point3DCoords {
  return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]];
}

function basisFromNormal(normal: Point3DCoords) {
  const w = normalizeVector(normal);
  const helper: Point3DCoords = Math.abs(w[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
  const u = normalizeVector(crossProduct(w, helper), [1, 0, 0]);
  const v = normalizeVector(crossProduct(w, u), [0, 1, 0]);
  return { u, v, w };
}

function circlePoint(center: Point3DCoords, u: Point3DCoords, v: Point3DCoords, radius: number, angle: number) {
  return vectorAdd(center, vectorAdd(vectorScale(u, radius * Math.cos(angle)), vectorScale(v, radius * Math.sin(angle))));
}

function graph3dData(graphConfig?: GraphConfig | null) {
  return asRecord(graphConfig?.data) ?? {};
}

function graph3dPoints(graphConfig?: GraphConfig | null): Graph3DPointEntry[] {
  const data = graph3dData(graphConfig);
  const rawPoints = Array.isArray(data.points) ? data.points : Array.isArray(data.vertices) ? data.vertices : [];
  const points = rawPoints.flatMap((rawPoint): Graph3DPointEntry[] => {
    const point = asRecord(rawPoint);
    if (!point) return [];
    const id = stringValue(point.id, stringValue(point.name));
    if (!id) return [];
    const coords =
      finiteTuple3(point.coords) ??
      finiteTuple3(point.coordinates) ??
      finiteTuple3(point.position) ??
      (Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)) && Number.isFinite(Number(point.z))
        ? [Number(point.x), Number(point.y), Number(point.z)]
        : null);
    if (!coords) return [];
    return [
      {
        id,
        label: typeof point.label === "string" ? point.label : id,
        coords,
        show: point.show !== false,
        color: typeof point.color === "string" ? point.color : undefined,
      },
    ];
  });
  return points.length ? points : [{ id: "P", label: "P", coords: [2, 2, 2], show: true }];
}

function pointCoordsFromValue(value: unknown, pointMap: Map<string, Graph3DPointEntry>): Point3DCoords | null {
  if (typeof value === "string") return pointMap.get(value)?.coords ?? null;
  const tuple = finiteTuple3(value);
  if (tuple) return tuple;
  const record = asRecord(value);
  if (!record) return null;
  const id = stringValue(record.id, stringValue(record.name));
  if (id && pointMap.has(id)) return pointMap.get(id)?.coords ?? null;
  return (
    finiteTuple3(record.coords) ??
    finiteTuple3(record.coordinates) ??
    finiteTuple3(record.position) ??
    (Number.isFinite(Number(record.x)) && Number.isFinite(Number(record.y)) && Number.isFinite(Number(record.z))
      ? [Number(record.x), Number(record.y), Number(record.z)]
      : null)
  );
}

function graph3dSegments(graphConfig: GraphConfig | null | undefined, pointIds: Set<string>): Graph3DSegmentEntry[] {
  const data = graph3dData(graphConfig);
  const rawSegments = Array.isArray(data.segments) ? data.segments : Array.isArray(data.edges) ? data.edges : [];
  return rawSegments.flatMap((rawSegment, index): Graph3DSegmentEntry[] => {
    const segment = asRecord(rawSegment);
    if (!segment) return [];
    const pointPair = Array.isArray(segment.points) ? segment.points : undefined;
    const from = stringValue(segment.from, stringValue(pointPair?.[0]));
    const to = stringValue(segment.to, stringValue(pointPair?.[1]));
    if (!from || !to || !pointIds.has(from) || !pointIds.has(to)) return [];
    return [
      {
        id: stringValue(segment.id, `segment-${from}-${to}-${index + 1}`),
        from,
        to,
        label: typeof segment.label === "string" ? segment.label : undefined,
        color: typeof segment.color === "string" ? segment.color : undefined,
        dashed: segment.dashed === true || segment.strokeStyle === "dashed",
        show: segment.show !== false,
      },
    ];
  });
}

function graph3dDimensions(graphConfig: GraphConfig | null | undefined, pointMap: Map<string, Graph3DPointEntry>): Graph3DDimensionEntry[] {
  const data = graph3dData(graphConfig);
  const rawDimensions = Array.isArray(data.dimensions) ? data.dimensions : Array.isArray(data.dimensionLines) ? data.dimensionLines : [];
  return rawDimensions.flatMap((rawDimension, index): Graph3DDimensionEntry[] => {
    const dimension = asRecord(rawDimension);
    if (!dimension) return [];
    const pointPair = Array.isArray(dimension.points) ? dimension.points : undefined;
    const from = pointCoordsFromValue(dimension.from ?? dimension.start ?? pointPair?.[0], pointMap);
    const to = pointCoordsFromValue(dimension.to ?? dimension.end ?? pointPair?.[1], pointMap);
    if (!from || !to) return [];
    return [
      {
        id: stringValue(dimension.id, `dimension-${index + 1}`),
        from,
        to,
        label: typeof dimension.label === "string" ? dimension.label : undefined,
        color: colorValue(dimension.color, colorValue(dimension.strokeColor, "#6b7280")),
        dashed: dimension.dashed === true || dimension.strokeStyle === "dashed",
        strokeWidth: positiveNumber(dimension.strokeWidth, 1.3),
        show: dimension.show !== false,
      },
    ];
  });
}

function graph3dFaces(graphConfig: GraphConfig | null | undefined, pointMap: Map<string, Graph3DPointEntry>): Graph3DFaceEntry[] {
  const data = graph3dData(graphConfig);
  const rawFaces = Array.isArray(data.faces) ? data.faces : [];
  return rawFaces.flatMap((rawFace, index): Graph3DFaceEntry[] => {
    const face = asRecord(rawFace);
    if (!face) return [];
    const pointRefs = Array.isArray(face.points) ? face.points : Array.isArray(face.vertices) ? face.vertices : [];
    const coords = pointRefs.flatMap((pointRef): Point3DCoords[] => {
      const coordsValue = pointCoordsFromValue(pointRef, pointMap);
      return coordsValue ? [coordsValue] : [];
    });
    if (coords.length < 3) return [];
    return [
      {
        id: stringValue(face.id, `face-${index + 1}`),
        coords,
        label: typeof face.label === "string" ? face.label : undefined,
        fillColor: colorValue(face.fillColor, colorValue(face.color, "#93c5fd")),
        fillOpacity: clampedOpacity(face.fillOpacity ?? face.opacity, 0.14),
        strokeColor: colorValue(face.strokeColor, colorValue(face.color, "#1f2937")),
        strokeWidth: positiveNumber(face.strokeWidth, 1),
        dashed: face.dashed === true || face.strokeStyle === "dashed",
        show: face.show !== false,
      },
    ];
  });
}

function graph3dSolids(graphConfig: GraphConfig | null | undefined, pointMap: Map<string, Graph3DPointEntry>): Graph3DSolidEntry[] {
  const data = graph3dData(graphConfig);
  const rawSolids = Array.isArray(data.solids) ? data.solids : Array.isArray(data.surfaces) ? data.surfaces : [];
  return rawSolids.flatMap((rawSolid, index): Graph3DSolidEntry[] => {
    const solid = asRecord(rawSolid);
    if (!solid) return [];
    const kind = stringValue(solid.kind, stringValue(solid.type)).toLowerCase();
    if (kind !== "circle" && kind !== "cone" && kind !== "cylinder" && kind !== "sphere" && kind !== "spherecap" && kind !== "sphericalcap")
      return [];
    const radius = positiveNumber(solid.radius, 0);
    if (!radius) return [];
    const normal = finiteTuple3(solid.normal) ?? finiteTuple3(solid.axis) ?? [0, 0, 1];
    const height = Number(solid.height ?? solid.depth);
    const center = pointCoordsFromValue(solid.center, pointMap);
    const baseCenter = pointCoordsFromValue(solid.baseCenter, pointMap) ?? center;
    const topCenter =
      pointCoordsFromValue(solid.topCenter, pointMap) ??
      (baseCenter && Number.isFinite(height) ? vectorAdd(baseCenter, vectorScale(normalizeVector(normal), height)) : null);
    const apex =
      pointCoordsFromValue(solid.apex, pointMap) ??
      (baseCenter && Number.isFinite(height) ? vectorAdd(baseCenter, vectorScale(normalizeVector(normal), height)) : null);
    if ((kind === "sphere" || kind === "circle") && !center) return [];
    if ((kind === "spherecap" || kind === "sphericalcap") && (!center || !Number.isFinite(height) || height <= 0)) return [];
    if (kind === "cone" && (!baseCenter || !apex)) return [];
    if (kind === "cylinder" && (!baseCenter || !topCenter)) return [];
    return [
      {
        id: stringValue(solid.id, `solid-${index + 1}`),
        kind,
        center: center ?? undefined,
        baseCenter: baseCenter ?? undefined,
        topCenter: topCenter ?? undefined,
        apex: apex ?? undefined,
        normal,
        radius,
        height: Number.isFinite(height) && height > 0 ? height : undefined,
        fillColor: colorValue(solid.fillColor, colorValue(solid.color, "#93c5fd")),
        fillOpacity: clampedOpacity(solid.fillOpacity ?? solid.opacity, 0.16),
        strokeColor: colorValue(solid.strokeColor, colorValue(solid.color, "#1f2937")),
        strokeWidth: positiveNumber(solid.strokeWidth, 1.4),
        renderStyle: graph3dRenderStyle(solid.renderStyle ?? solid.display ?? solid.mode),
        stepsU: Math.max(8, Math.floor(positiveNumber(solid.stepsU, 32))),
        stepsV: Math.max(2, Math.floor(positiveNumber(solid.stepsV, 10))),
        show: solid.show !== false,
      },
    ];
  });
}

function rangeFromValue(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const left = Number(value[0]);
  const right = Number(value[1]);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left === right) return null;
  return left < right ? [left, right] : [right, left];
}

function rangeFromPoints(points: Graph3DPointEntry[], axisIndex: number, fallback: [number, number]) {
  const values = points.map((point) => point.coords[axisIndex]).filter(Number.isFinite);
  if (!values.length) return fallback;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  if (min === max) return [min - 1, max + 1] as [number, number];
  const pad = Math.max(0.5, (max - min) * 0.15);
  return [Number((min - pad).toFixed(6)), Number((max + pad).toFixed(6))] as [number, number];
}

function graph3dRanges(graphConfig: GraphConfig | null | undefined, points: Graph3DPointEntry[]): Graph3DRanges {
  const data = graph3dData(graphConfig);
  return [
    rangeFromValue(data.xRange) ?? rangeFromPoints(points, 0, [-5, 5]),
    rangeFromValue(data.yRange) ?? rangeFromPoints(points, 1, [-5, 5]),
    rangeFromValue(data.zRange) ?? rangeFromPoints(points, 2, [-5, 5]),
  ] as Graph3DRanges;
}

const GRAPH_3D_LABEL_DIRECTIONS: Point3DCoords[] = [
  [1, 1, 1],
  [1, 1, -1],
  [1, -1, 1],
  [1, -1, -1],
  [-1, 1, 1],
  [-1, 1, -1],
  [-1, -1, 1],
  [-1, -1, -1],
];

function graph3dFrameCorners(ranges: Graph3DRanges): Point3DCoords[] {
  return ranges[0].flatMap((x) => ranges[1].flatMap((y) => ranges[2].map((z) => [x, y, z] as Point3DCoords)));
}

function projectGraph3DPoint(coords: Point3DCoords, viewState: Basic3DViewState): Point2DCoords {
  const azCos = Math.cos(viewState.az);
  const azSin = Math.sin(viewState.az);
  const elCos = Math.cos(viewState.el);
  const elSin = Math.sin(viewState.el);
  const rawX = -coords[0] * azCos + coords[1] * azSin;
  const rawY = coords[0] * azSin * elSin + coords[1] * azCos * elSin - coords[2] * elCos;
  if (Math.abs(viewState.bank) <= 1e-9) return [rawX, rawY];
  const bankCos = Math.cos(viewState.bank);
  const bankSin = Math.sin(viewState.bank);
  return [rawX * bankCos - rawY * bankSin, rawX * bankSin + rawY * bankCos];
}

function graph3dLabelContext(ranges: Graph3DRanges, viewState: Basic3DViewState): Graph3DLabelContext {
  const projectedCorners = graph3dFrameCorners(ranges).map((corner) => projectGraph3DPoint(corner, viewState));
  const xValues = projectedCorners.map((corner) => corner[0]);
  const yValues = projectedCorners.map((corner) => corner[1]);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  return {
    viewState,
    frame: {
      minX,
      maxX,
      minY,
      maxY,
      center: [(minX + maxX) / 2, (minY + maxY) / 2],
    },
  };
}

function screenDistance(left: Point2DCoords, right: Point2DCoords) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function normalizedScreenDot(left: Point2DCoords, right: Point2DCoords) {
  const denominator = Math.hypot(left[0], left[1]) * Math.hypot(right[0], right[1]);
  if (denominator <= 1e-9) return 0;
  return (left[0] * right[0] + left[1] * right[1]) / denominator;
}

function graph3dLabelPoint(
  coords: Point3DCoords,
  context: Graph3DLabelContext,
  labelOffset: number,
  avoidCoords: Point3DCoords[] = [],
): Point3DCoords {
  const source = projectGraph3DPoint(coords, context.viewState);
  const avoidPoints = avoidCoords.map((point) => projectGraph3DPoint(point, context.viewState));
  const sourceOutward: Point2DCoords = [source[0] - context.frame.center[0], source[1] - context.frame.center[1]];
  let bestPoint = vectorAdd(coords, vectorScale(GRAPH_3D_LABEL_DIRECTIONS[0], labelOffset));
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const direction of GRAPH_3D_LABEL_DIRECTIONS) {
    const candidate = vectorAdd(coords, vectorScale(direction, labelOffset));
    const projected = projectGraph3DPoint(candidate, context.viewState);
    const edgeClearance = Math.min(
      projected[0] - context.frame.minX,
      context.frame.maxX - projected[0],
      projected[1] - context.frame.minY,
      context.frame.maxY - projected[1],
    );
    const nearestAvoidPoint = avoidPoints.length
      ? Math.min(...avoidPoints.map((point) => screenDistance(projected, point)))
      : screenDistance(projected, source);
    const candidateVector: Point2DCoords = [projected[0] - source[0], projected[1] - source[1]];
    const outwardScore = normalizedScreenDot(candidateVector, sourceOutward);
    const outsidePenalty = edgeClearance < 0 ? Math.abs(edgeClearance) * 5 : 0;
    const score = edgeClearance * 1.8 + nearestAvoidPoint * 1.4 + outwardScore * 0.35 - outsidePenalty;
    if (score > bestScore) {
      bestScore = score;
      bestPoint = candidate;
    }
  }

  return bestPoint;
}

function roundedViewValue(value: number) {
  return Number(value.toFixed(6));
}

function graph3dViewState(graphConfig?: GraphConfig | null): Basic3DViewState {
  const metadata = graphConfig?.metadata;
  const viewState = metadata && typeof metadata === "object" && "view3d" in metadata ? metadata.view3d : undefined;
  const viewRecord = viewState && typeof viewState === "object" ? (viewState as Record<string, unknown>) : {};
  return {
    az: finiteNumber(viewRecord.az, DEFAULT_3D_VIEW_STATE.az),
    el: finiteNumber(viewRecord.el, DEFAULT_3D_VIEW_STATE.el),
    bank: finiteNumber(viewRecord.bank, DEFAULT_3D_VIEW_STATE.bank),
  };
}

function currentViewState(view: Basic3DView): Basic3DViewState {
  return {
    az: roundedViewValue(finiteNumber(view.az_slide?.Value(), DEFAULT_3D_VIEW_STATE.az)),
    el: roundedViewValue(finiteNumber(view.el_slide?.Value(), DEFAULT_3D_VIEW_STATE.el)),
    bank: roundedViewValue(finiteNumber(view.bank_slide?.Value(), DEFAULT_3D_VIEW_STATE.bank)),
  };
}

function sameViewState(left: Basic3DViewState, right: Basic3DViewState) {
  return left.az === right.az && left.el === right.el && left.bank === right.bank;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function stripLatexDelimiters(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("$$") && trimmed.endsWith("$$")) return trimmed.slice(2, -2).trim();
  if (trimmed.startsWith("$") && trimmed.endsWith("$")) return trimmed.slice(1, -1).trim();
  return trimmed;
}

function escapeLatexText(value: string) {
  return value.replace(/\\/g, "\\textbackslash{}").replace(/([{}_%&#])/g, "\\$1");
}

function labelLatexSource(value: string) {
  const stripped = stripLatexDelimiters(value);
  if (!stripped) return "";
  if (/[\\^_{}=()[\]+-]/.test(stripped) || /^[A-Za-z][A-Za-z0-9]*$/.test(stripped)) return stripped;
  return `\\text{${escapeLatexText(stripped)}}`;
}

function labelDataAttributes(attributes: Record<string, string | undefined> = {}) {
  return Object.entries(attributes)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
    .join(" ");
}

function render3DLatexLabel(label: string, attributes: Record<string, string | undefined> = {}, color = "#0f172a") {
  const interactionCss = "pointer-events:none;user-select:none;-webkit-user-select:none;touch-action:none;";
  const latex = labelLatexSource(label);
  const labelAttrs = labelDataAttributes({ "data-mauth-label-text": latex, ...attributes });
  try {
    const html = renderMathJaxSvg(latex, false);
    return `<span class="jxg-latex-label" ${labelAttrs} style="${GRAPH_LABEL_FONT_CSS} color:${escapeHtml(color)};${interactionCss}">${html}</span>`;
  } catch {
    return `<span class="jxg-latex-label" ${labelAttrs} style="${GRAPH_LABEL_FONT_CSS} color:${escapeHtml(color)};${interactionCss}">${escapeHtml(label)}</span>`;
  }
}

function renderCurve3D(view: Basic3DView, from: Point3DCoords, to: Point3DCoords, attributes: Record<string, unknown>) {
  view.create(
    "curve3d",
    [
      (t: number) => from[0] + t * (to[0] - from[0]),
      (t: number) => from[1] + t * (to[1] - from[1]),
      (t: number) => from[2] + t * (to[2] - from[2]),
      [0, 1],
    ],
    attributes,
  );
}

function renderCircleCurve3D(
  view: Basic3DView,
  center: Point3DCoords,
  normal: Point3DCoords,
  radius: number,
  attributes: Record<string, unknown>,
) {
  const { u, v } = basisFromNormal(normal);
  view.create(
    "curve3d",
    [
      (t: number) => circlePoint(center, u, v, radius, t)[0],
      (t: number) => circlePoint(center, u, v, radius, t)[1],
      (t: number) => circlePoint(center, u, v, radius, t)[2],
      [0, Math.PI * 2],
    ],
    attributes,
  );
}

function solidStrokeAttributes(solid: Graph3DSolidEntry) {
  return {
    strokeColor: solid.strokeColor ?? "#1f2937",
    strokeWidth: solid.strokeWidth,
    strokeOpacity: 0.8,
    highlight: false,
  };
}

function surfaceAttributes(solid: Graph3DSolidEntry) {
  const surfaceMode = solid.renderStyle === "surface";
  return {
    ...solidStrokeAttributes(solid),
    strokeWidth: surfaceMode ? Math.min(0.8, solid.strokeWidth ?? 0.8) : solid.strokeWidth,
    strokeOpacity: surfaceMode ? 0.28 : 0.75,
    fillColor: solid.fillColor ?? "#93c5fd",
    fillOpacity: solid.renderStyle === "wireframe" ? 0 : solid.fillOpacity,
    gradient: null,
    stepsU: solid.stepsU,
    stepsV: solid.stepsV,
  };
}

function renderGraph3DFace(
  view: Basic3DView,
  face: Graph3DFaceEntry,
  labelContext: Graph3DLabelContext,
  labelOffset: number,
  avoidCoords: Point3DCoords[],
) {
  if (!face.show) return;
  try {
    view.create("polygon3d", face.coords, {
      fillColor: face.fillColor ?? "#93c5fd",
      fillOpacity: face.fillOpacity,
      gradient: null,
      borders: {
        strokeColor: face.strokeColor ?? "#1f2937",
        strokeWidth: face.strokeWidth ?? 1,
        dash: face.dashed ? 2 : 0,
        highlight: false,
      },
      vertices: {
        visible: false,
        withLabel: false,
        size: 0,
      },
      highlight: false,
    });
    if (face.label?.trim()) {
      const centroid = face.coords.reduce<Point3DCoords>(
        (sum, coords) => [sum[0] + coords[0], sum[1] + coords[1], sum[2] + coords[2]],
        [0, 0, 0],
      );
      const labelPoint = graph3dLabelPoint(
        [centroid[0] / face.coords.length, centroid[1] / face.coords.length, centroid[2] / face.coords.length],
        labelContext,
        labelOffset,
        avoidCoords,
      );
      view.create(
        "text3d",
        [
          labelPoint,
          render3DLatexLabel(
            face.label,
            { "data-mauth-label-role": "graph3d-face-label", "data-mauth-graph3d-element-id": face.id },
            face.strokeColor ?? face.fillColor ?? "#0f172a",
          ),
        ],
        LATEX_3D_LABEL_ATTRIBUTES,
      );
    }
  } catch {
    // Keep the rest of the 3D diagram rendering even if an optional face primitive is unsupported.
  }
}

function renderGraph3DDimension(
  view: Basic3DView,
  dimension: Graph3DDimensionEntry,
  labelContext: Graph3DLabelContext,
  labelOffset: number,
  avoidCoords: Point3DCoords[],
) {
  if (!dimension.show) return;
  const color = dimension.color ?? "#6b7280";
  renderCurve3D(view, dimension.from, dimension.to, {
    strokeColor: color,
    strokeWidth: dimension.strokeWidth ?? 1.3,
    dash: dimension.dashed ? 2 : 0,
    highlight: false,
  });
  for (const coords of [dimension.from, dimension.to]) {
    view.create("point3d", coords, {
      ...POINT_3D_ATTRIBUTES,
      fillColor: color,
      strokeColor: color,
      size: 2,
      withLabel: false,
    });
  }
  if (dimension.label?.trim()) {
    const midpoint: Point3DCoords = [
      (dimension.from[0] + dimension.to[0]) / 2,
      (dimension.from[1] + dimension.to[1]) / 2,
      (dimension.from[2] + dimension.to[2]) / 2,
    ];
    view.create(
      "text3d",
      [
        graph3dLabelPoint(midpoint, labelContext, labelOffset * 1.6, avoidCoords),
        render3DLatexLabel(
          dimension.label,
          { "data-mauth-label-role": "graph3d-dimension-label", "data-mauth-graph3d-element-id": dimension.id },
          color,
        ),
      ],
      LATEX_3D_LABEL_ATTRIBUTES,
    );
  }
}

function renderCone3D(view: Basic3DView, solid: Graph3DSolidEntry) {
  if (!solid.baseCenter || !solid.apex) return;
  const axis = vectorSubtract(solid.apex, solid.baseCenter);
  const { u, v } = basisFromNormal(axis);
  if (solid.renderStyle !== "outline") {
    try {
      view.create(
        "parametricsurface3d",
        [
          (angle: number, t: number) =>
            solid.baseCenter![0] + axis[0] * t + solid.radius * (1 - t) * (u[0] * Math.cos(angle) + v[0] * Math.sin(angle)),
          (angle: number, t: number) =>
            solid.baseCenter![1] + axis[1] * t + solid.radius * (1 - t) * (u[1] * Math.cos(angle) + v[1] * Math.sin(angle)),
          (angle: number, t: number) =>
            solid.baseCenter![2] + axis[2] * t + solid.radius * (1 - t) * (u[2] * Math.cos(angle) + v[2] * Math.sin(angle)),
          [0, Math.PI * 2],
          [0, 1],
        ],
        surfaceAttributes(solid),
      );
    } catch {
      // The outline fallback below still communicates the source solid faithfully.
    }
  }
  renderCircleCurve3D(view, solid.baseCenter, axis, solid.radius, solidStrokeAttributes(solid));
  for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    renderCurve3D(view, circlePoint(solid.baseCenter, u, v, solid.radius, angle), solid.apex, solidStrokeAttributes(solid));
  }
}

function renderCylinder3D(view: Basic3DView, solid: Graph3DSolidEntry) {
  if (!solid.baseCenter || !solid.topCenter) return;
  const axis = vectorSubtract(solid.topCenter, solid.baseCenter);
  const { u, v } = basisFromNormal(axis);
  if (solid.renderStyle !== "outline") {
    try {
      view.create(
        "parametricsurface3d",
        [
          (angle: number, t: number) =>
            solid.baseCenter![0] + axis[0] * t + solid.radius * (u[0] * Math.cos(angle) + v[0] * Math.sin(angle)),
          (angle: number, t: number) =>
            solid.baseCenter![1] + axis[1] * t + solid.radius * (u[1] * Math.cos(angle) + v[1] * Math.sin(angle)),
          (angle: number, t: number) =>
            solid.baseCenter![2] + axis[2] * t + solid.radius * (u[2] * Math.cos(angle) + v[2] * Math.sin(angle)),
          [0, Math.PI * 2],
          [0, 1],
        ],
        surfaceAttributes(solid),
      );
    } catch {
      // The outline fallback below still communicates the source solid faithfully.
    }
  }
  renderCircleCurve3D(view, solid.baseCenter, axis, solid.radius, solidStrokeAttributes(solid));
  renderCircleCurve3D(view, solid.topCenter, axis, solid.radius, solidStrokeAttributes(solid));
  for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    renderCurve3D(
      view,
      circlePoint(solid.baseCenter, u, v, solid.radius, angle),
      circlePoint(solid.topCenter, u, v, solid.radius, angle),
      solidStrokeAttributes(solid),
    );
  }
}

function renderSphere3D(view: Basic3DView, solid: Graph3DSolidEntry) {
  if (!solid.center) return;
  if (solid.renderStyle !== "outline") {
    try {
      const centerPoint = view.create("point3d", solid.center, HIDDEN_3D_POINT_ATTRIBUTES);
      const radiusPoint = view.create(
        "point3d",
        [solid.center[0] + solid.radius, solid.center[1], solid.center[2]],
        HIDDEN_3D_POINT_ATTRIBUTES,
      );
      view.create("sphere3d", [centerPoint, radiusPoint], surfaceAttributes(solid));
    } catch {
      // The three great circles below are a stable wireframe fallback.
    }
  }
  renderCircleCurve3D(view, solid.center, [0, 0, 1], solid.radius, solidStrokeAttributes(solid));
  renderCircleCurve3D(view, solid.center, [0, 1, 0], solid.radius, solidStrokeAttributes(solid));
  renderCircleCurve3D(view, solid.center, [1, 0, 0], solid.radius, solidStrokeAttributes(solid));
}

function renderSphereCap3D(view: Basic3DView, solid: Graph3DSolidEntry) {
  if (!solid.center || !solid.height) return;
  const height = Math.min(solid.radius * 2, Math.max(1e-6, solid.height));
  const axis = solid.normal ?? [0, 0, 1];
  const { u, v, w } = basisFromNormal(axis);
  const baseZ = solid.radius - height;
  const baseRadius = Math.sqrt(Math.max(0, solid.radius * solid.radius - baseZ * baseZ));
  const baseCenter = vectorAdd(solid.center, vectorScale(w, baseZ));
  const capPoint = (angle: number, t: number) => {
    const z = baseZ + height * t;
    const sectionRadius = Math.sqrt(Math.max(0, solid.radius * solid.radius - z * z));
    return vectorAdd(
      solid.center!,
      vectorAdd(
        vectorScale(w, z),
        vectorAdd(vectorScale(u, sectionRadius * Math.cos(angle)), vectorScale(v, sectionRadius * Math.sin(angle))),
      ),
    );
  };

  if (solid.renderStyle !== "outline") {
    try {
      view.create(
        "parametricsurface3d",
        [
          (angle: number, t: number) => capPoint(angle, t)[0],
          (angle: number, t: number) => capPoint(angle, t)[1],
          (angle: number, t: number) => capPoint(angle, t)[2],
          [0, Math.PI * 2],
          [0, 1],
        ],
        surfaceAttributes(solid),
      );
    } catch {
      // The outline below still shows the cap depth and circular section.
    }
  }

  if (solid.renderStyle !== "outline") {
    try {
      view.create(
        "parametricsurface3d",
        [
          (angle: number, radial: number) => baseCenter[0] + radial * baseRadius * (u[0] * Math.cos(angle) + v[0] * Math.sin(angle)),
          (angle: number, radial: number) => baseCenter[1] + radial * baseRadius * (u[1] * Math.cos(angle) + v[1] * Math.sin(angle)),
          (angle: number, radial: number) => baseCenter[2] + radial * baseRadius * (u[2] * Math.cos(angle) + v[2] * Math.sin(angle)),
          [0, Math.PI * 2],
          [0, 1],
        ],
        {
          ...surfaceAttributes(solid),
          fillOpacity: solid.renderStyle === "wireframe" ? 0 : Math.min(0.22, Math.max(0.06, solid.fillOpacity)),
        },
      );
    } catch {
      // The base circle below is the stable fallback for the flat cut face.
    }
  }

  renderCircleCurve3D(view, baseCenter, w, baseRadius, solidStrokeAttributes(solid));
  for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    view.create(
      "curve3d",
      [(t: number) => capPoint(angle, t)[0], (t: number) => capPoint(angle, t)[1], (t: number) => capPoint(angle, t)[2], [0, 1]],
      solidStrokeAttributes(solid),
    );
  }
}

function renderGraph3DSolid(view: Basic3DView, solid: Graph3DSolidEntry) {
  if (!solid.show) return;
  if (solid.kind === "circle" && solid.center) {
    renderCircleCurve3D(view, solid.center, solid.normal ?? [0, 0, 1], solid.radius, solidStrokeAttributes(solid));
  } else if (solid.kind === "cone") {
    renderCone3D(view, solid);
  } else if (solid.kind === "cylinder") {
    renderCylinder3D(view, solid);
  } else if (solid.kind === "sphere") {
    renderSphere3D(view, solid);
  } else if (solid.kind === "spherecap" || solid.kind === "sphericalcap") {
    renderSphereCap3D(view, solid);
  }
}

export function Basic3DGraph({
  graphConfig,
  onGraphConfigChange,
}: {
  graphConfig?: GraphConfig | null;
  onGraphConfigChange?: (graphConfig: GraphConfig) => void;
}) {
  const boardId = useMemo(() => `jxg-3d-${Math.random().toString(36).slice(2)}`, []);
  const graphConfigRef = useRef(graphConfig);
  const initialViewState = graph3dViewState(graphConfig);
  const initialAz = initialViewState.az;
  const initialEl = initialViewState.el;
  const initialBank = initialViewState.bank;
  const renderSignature = JSON.stringify({
    data: graphConfig?.data ?? null,
    widthPx: graphConfig?.widthPx ?? null,
    heightPx: graphConfig?.heightPx ?? null,
  });
  const labelExpectations = useMemo(() => {
    const points = graph3dPoints(graphConfig);
    const pointMap = new Map(points.map((point) => [point.id, point]));
    const pointIds = new Set(pointMap.keys());
    return {
      pointLabelCount: points.filter((point) => point.show && point.label.trim()).length,
      segmentLabelCount: graph3dSegments(graphConfig, pointIds).filter((segment) => segment.show && segment.label?.trim()).length,
      faceLabelCount: graph3dFaces(graphConfig, pointMap).filter((face) => face.show && face.label?.trim()).length,
      dimensionLabelCount: graph3dDimensions(graphConfig, pointMap).filter((dimension) => dimension.show && dimension.label?.trim()).length,
    };
  }, [graphConfig]);

  useLayoutEffect(() => {
    graphConfigRef.current = graphConfig;
  });

  useEffect(() => {
    const persistedViewState = { az: initialAz, el: initialEl, bank: initialBank };
    let commitTimer = 0;
    let lastCommittedViewState = persistedViewState;
    let pointerActive = false;
    const board = JXG.JSXGraph.initBoard(boardId, {
      boundingbox: [-6, 6, 6, -6],
      axis: false,
      showCopyright: false,
      showNavigation: false,
      text: LABEL_ATTRIBUTES,
    } as Record<string, unknown>);
    let view: Basic3DView | null = null;
    const renderGraphConfig = graphConfigRef.current;
    const graphPoints = graph3dPoints(renderGraphConfig);
    const graphRanges = graph3dRanges(renderGraphConfig, graphPoints);

    const commitViewState = () => {
      if (!view || !onGraphConfigChange) return;
      const nextViewState = currentViewState(view);
      if (sameViewState(nextViewState, lastCommittedViewState)) return;
      lastCommittedViewState = nextViewState;
      const currentGraphConfig = graphConfigRef.current;
      onGraphConfigChange({
        ...(currentGraphConfig ?? { type: "graph3d" }),
        type: currentGraphConfig?.type ?? "graph3d",
        metadata: {
          ...(currentGraphConfig?.metadata ?? {}),
          view3d: nextViewState,
        },
      });
    };

    const scheduleViewStateCommit = () => {
      if (!onGraphConfigChange) return;
      if (pointerActive) return;
      window.clearTimeout(commitTimer);
      commitTimer = window.setTimeout(commitViewState, 120);
    };

    const commitViewStateSoon = () => {
      if (!onGraphConfigChange) return;
      pointerActive = false;
      window.clearTimeout(commitTimer);
      commitTimer = window.setTimeout(commitViewState, 0);
    };

    try {
      view = board.create(
        "view3d",
        [
          [-4, -3],
          [8, 8],
          [graphRanges[0], graphRanges[1], graphRanges[2]],
        ],
        {
          az: { slider: { visible: false, start: persistedViewState.az } },
          el: { slider: { visible: false, start: persistedViewState.el } },
          bank: { slider: { visible: false, start: persistedViewState.bank } },
          xAxis: { point2: { name: "", withLabel: false } },
          yAxis: { point2: { name: "", withLabel: false } },
          zAxis: { point2: { name: "", withLabel: false } },
          xAxisBorder: AXIS_3D_LABEL_ATTRIBUTES,
          yAxisBorder: AXIS_3D_LABEL_ATTRIBUTES,
          zAxisBorder: AXIS_3D_LABEL_ATTRIBUTES,
          xPlaneRear: HIDDEN_3D_PLANE_ATTRIBUTES,
          yPlaneRear: HIDDEN_3D_PLANE_ATTRIBUTES,
          zPlaneRear: HIDDEN_3D_PLANE_ATTRIBUTES,
          xPlaneFront: HIDDEN_3D_PLANE_ATTRIBUTES,
          yPlaneFront: HIDDEN_3D_PLANE_ATTRIBUTES,
          zPlaneFront: HIDDEN_3D_PLANE_ATTRIBUTES,
          xPlaneRearYAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          xPlaneRearZAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          xPlaneFrontYAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          xPlaneFrontZAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          yPlaneRearXAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          yPlaneRearZAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          yPlaneFrontXAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          yPlaneFrontZAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          zPlaneRearXAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          zPlaneRearYAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          zPlaneFrontXAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          zPlaneFrontYAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          ticks3d: { label: LABEL_ATTRIBUTES },
        } as Record<string, unknown>,
      ) as unknown as Basic3DView;
      const points = graphPoints;
      const pointMap = new Map(points.map((point) => [point.id, point]));
      const faces = graph3dFaces(renderGraphConfig, pointMap);
      const solids = graph3dSolids(renderGraphConfig, pointMap);
      const segments = graph3dSegments(renderGraphConfig, new Set(pointMap.keys()));
      const dimensions = graph3dDimensions(renderGraphConfig, pointMap);
      const ranges = graphRanges;
      const labelOffset = Math.max(
        0.18,
        Math.max(ranges[0][1] - ranges[0][0], ranges[1][1] - ranges[1][0], ranges[2][1] - ranges[2][0]) * 0.035,
      );
      const axisLabelOffset = labelOffset * AXIS_3D_LABEL_OFFSET_MULTIPLIER;
      const labelContext = graph3dLabelContext(ranges, persistedViewState);
      const pointCoords = points.map((point) => point.coords);
      const axisLabelCoords: Point3DCoords[] = [
        [ranges[0][1] + axisLabelOffset, 0, 0],
        [0, ranges[1][1] + axisLabelOffset, 0],
        [0, 0, ranges[2][1] + axisLabelOffset],
      ];
      const commonLabelAvoidCoords = [...pointCoords, ...axisLabelCoords];

      solids.forEach((solid) => renderGraph3DSolid(view!, solid));
      faces.forEach((face) => renderGraph3DFace(view!, face, labelContext, labelOffset, commonLabelAvoidCoords));

      segments
        .filter((segment) => segment.show)
        .forEach((segment) => {
          const from = pointMap.get(segment.from);
          const to = pointMap.get(segment.to);
          if (!from || !to) return;
          renderCurve3D(view!, from.coords, to.coords, {
            strokeColor: segment.color ?? "#111827",
            strokeWidth: 1.8,
            dash: segment.dashed ? 2 : 0,
            highlight: false,
          });
          if (segment.label?.trim()) {
            const midpoint: Point3DCoords = [
              (from.coords[0] + to.coords[0]) / 2,
              (from.coords[1] + to.coords[1]) / 2,
              (from.coords[2] + to.coords[2]) / 2,
            ];
            view?.create(
              "text3d",
              [
                graph3dLabelPoint(midpoint, labelContext, labelOffset * 2.2, commonLabelAvoidCoords),
                render3DLatexLabel(
                  segment.label,
                  {
                    "data-mauth-label-role": "graph3d-segment-label",
                    "data-mauth-graph3d-element-id": segment.id,
                    "data-mauth-segment-from": segment.from,
                    "data-mauth-segment-to": segment.to,
                  },
                  segment.color ?? "#0f172a",
                ),
              ],
              LATEX_3D_LABEL_ATTRIBUTES,
            );
          }
        });
      dimensions.forEach((dimension) => renderGraph3DDimension(view!, dimension, labelContext, labelOffset, commonLabelAvoidCoords));

      points
        .filter((point) => point.show)
        .forEach((point) => {
          view?.create("point3d", point.coords, {
            name: point.id,
            ...POINT_3D_ATTRIBUTES,
            fillColor: point.color ?? POINT_3D_ATTRIBUTES.fillColor,
          });
          if (point.label.trim()) {
            const otherPointCoords = [
              ...points.filter((otherPoint) => otherPoint.id !== point.id).map((otherPoint) => otherPoint.coords),
              ...axisLabelCoords,
            ];
            view?.create(
              "text3d",
              [
                graph3dLabelPoint(point.coords, labelContext, labelOffset * 1.35, otherPointCoords),
                render3DLatexLabel(
                  point.label,
                  { "data-mauth-label-role": "graph3d-point-label", "data-mauth-point-id": point.id },
                  point.color ?? "#0f172a",
                ),
              ],
              LATEX_3D_LABEL_ATTRIBUTES,
            );
          }
        });
      view.create(
        "text3d",
        [axisLabelCoords[0], render3DLatexLabel("x", { "data-mauth-label-role": "axis-label" })],
        LATEX_3D_LABEL_ATTRIBUTES,
      );
      view.create(
        "text3d",
        [axisLabelCoords[1], render3DLatexLabel("y", { "data-mauth-label-role": "axis-label" })],
        LATEX_3D_LABEL_ATTRIBUTES,
      );
      view.create(
        "text3d",
        [axisLabelCoords[2], render3DLatexLabel("z", { "data-mauth-label-role": "axis-label" })],
        LATEX_3D_LABEL_ATTRIBUTES,
      );
    } catch {
      board.create("text", [-4.8, 4.8, "3D graph adapter"], LABEL_ATTRIBUTES);
    }

    const eventBoard = board as JXG.Board & {
      on?: (eventName: string, handler: () => void) => void;
      off?: (eventName: string, handler: () => void) => void;
    };
    eventBoard.on?.("update", scheduleViewStateCommit);

    const container = document.getElementById(boardId);
    const handlePointerDown = () => {
      pointerActive = true;
      window.addEventListener("pointerup", commitViewStateSoon, { once: true });
      window.addEventListener("pointercancel", commitViewStateSoon, { once: true });
    };
    container?.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("beforeprint", commitViewState);

    return () => {
      window.clearTimeout(commitTimer);
      eventBoard.off?.("update", scheduleViewStateCommit);
      container?.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", commitViewStateSoon);
      window.removeEventListener("pointercancel", commitViewStateSoon);
      window.removeEventListener("beforeprint", commitViewState);
      JXG.JSXGraph.freeBoard(board);
    };
  }, [boardId, initialAz, initialBank, initialEl, onGraphConfigChange, renderSignature]);

  return (
    <div
      id={boardId}
      className="overflow-hidden bg-white"
      data-mauth-diagram-type="graph3d"
      data-mauth-graph3d-point-label-count={labelExpectations.pointLabelCount}
      data-mauth-graph3d-segment-label-count={labelExpectations.segmentLabelCount}
      data-mauth-graph3d-face-label-count={labelExpectations.faceLabelCount}
      data-mauth-graph3d-dimension-label-count={labelExpectations.dimensionLabelCount}
      style={{
        height: graphConfig?.heightPx ?? DEFAULT_GRAPH_HEIGHT,
        maxWidth: "100%",
        width: graphConfig?.widthPx ?? DEFAULT_GRAPH_WIDTH,
      }}
    />
  );
}
