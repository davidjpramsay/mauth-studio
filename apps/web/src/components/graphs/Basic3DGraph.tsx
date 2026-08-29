import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { GraphConfig } from "@mauth-studio/shared";
import JXG from "jsxgraph";

import {
  GRAPH3D_BOARD_BOUNDING_BOX,
  GRAPH3D_FACE_RIGHT_ANGLE_TARGET_PREFIX,
  GRAPH3D_VIEW_ORIGIN,
  GRAPH3D_VIEW_SIZE,
  graph3dAxesVisible,
  graph3dAxisLabelsVisible,
  graph3dCircularSilhouetteAngles,
  graph3dDimensionDisplay,
  graph3dDimensionFaceRightAngleMarkerPoints,
  graph3dDimensionLabelScreenOffset,
  graph3dDraggedLabelScreenOffset,
  graph3dDimensionTickDirection,
  graph3dDimensionTickEndpoints,
  graph3dEqualScaleRanges,
  graph3dRadialLabelScreenOffset,
  graph3dRightAngleMarkerPoints,
  graph3dSphereCapSilhouetteArc,
  graph3dViewDirection,
} from "@/lib/graph3dPresentation";
import { DEFAULT_3D_VIEW_STATE } from "@/lib/diagram3d";
import { graph3dConfigWithLabelScreenOffset, type Graph3DLabelElementKind } from "@/lib/diagramGraph3d";
import { renderMathJaxSvg } from "@/lib/mathjax";
import { GRAPH_LABEL_FONT_CSS, graphLabelAttributes } from "./graphTypography";

const DEFAULT_GRAPH_WIDTH = 680;
const DEFAULT_GRAPH_HEIGHT = 300;
const AXIS_3D_LABEL_OFFSET_MULTIPLIER = 1.3;
const LABEL_ATTRIBUTES = graphLabelAttributes();
type Point3DCoords = [number, number, number];
type Point2DCoords = [number, number];
type Graph3DRanges = [[number, number], [number, number], [number, number]];
type Graph3DPointEntry = {
  id: string;
  label: string;
  coords: Point3DCoords;
  show: boolean;
  color?: string;
  labelScreenOffsetPx?: Point2DCoords;
};
type Graph3DSegmentEntry = {
  id: string;
  from: string;
  to: string;
  label?: string;
  color?: string;
  labelScreenOffsetPx?: Point2DCoords;
  dashed?: boolean;
  show: boolean;
};
type Graph3DDimensionEntry = {
  id: string;
  from: Point3DCoords;
  to: Point3DCoords;
  label?: string;
  labelPosition?: Point3DCoords;
  display: "label" | "guide" | "bracket";
  labelOffsetPx: number;
  labelScreenOffsetPx?: Point2DCoords;
  rightAngleWith?: string;
  rightAngleSize?: number;
  color?: string;
  dashed?: boolean;
  strokeWidth?: number;
  show: boolean;
};
type Graph3DFaceEntry = {
  id: string;
  coords: Point3DCoords[];
  label?: string;
  labelScreenOffsetPx?: Point2DCoords;
  fillColor?: string;
  fillOpacity: number;
  strokeColor?: string;
  strokeWidth?: number;
  dashed?: boolean;
  show: boolean;
};
type Graph3DSolidKind = "circle" | "cone" | "cylinder" | "sphere" | "spherecap" | "sphericalcap";
type Graph3DRenderStyle = "surface" | "wireframe" | "outline";
type Graph3DSurfaceFace = number[] | [number[], Record<string, unknown>];
type Graph3DSurfaceMesh = {
  vertices: Point3DCoords[];
  faces: number[][];
};
type Graph3DJoinedSurfaceMesh = Graph3DSurfaceMesh & {
  coneFaces: number[][];
  capFaces: number[][];
};
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
  screenScale: { x: number; y: number };
  sceneCenter: Point3DCoords;
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
  size: 4,
  label: LABEL_ATTRIBUTES,
  withLabel: false,
  fixed: true,
  highlight: false,
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
  zoom: number;
}

interface Basic3DSlider {
  Value: () => number;
}

interface Basic3DView {
  create: (type: string, parents: unknown[], attributes?: Record<string, unknown>) => unknown;
  board?: {
    create: (type: string, parents: unknown[], attributes?: Record<string, unknown>) => unknown;
    unitX: number;
    unitY: number;
  };
  project3DTo2D?: (coords: Point3DCoords) => [number, number, number];
  az_slide?: Basic3DSlider;
  el_slide?: Basic3DSlider;
  bank_slide?: Basic3DSlider;
}

interface Basic2DElement {
  prepareUpdate?: () => Basic2DElement;
  update?: () => Basic2DElement;
  updateRenderer?: () => Basic2DElement;
  rendNode?: HTMLElement;
}

interface BasicLiveGraphElement extends Basic2DElement {
  element2D?: Basic2DElement;
}

interface BasicStaticGraphElement extends BasicLiveGraphElement {
  isDraggable?: boolean;
  borders?: BasicStaticGraphElement[];
  vertices?: BasicStaticGraphElement[];
  faces?: BasicStaticGraphElement[];
}

type RegisterLiveGraphElement = (element: BasicLiveGraphElement) => void;
type CommitGraph3DLabelScreenOffset = (kind: Graph3DLabelElementKind, id: string, offset: Point2DCoords | undefined) => void;

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

function finiteTuple2(value: unknown): Point2DCoords | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
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

function dotProduct(left: Point3DCoords, right: Point3DCoords) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
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
        labelScreenOffsetPx: finiteTuple2(point.labelScreenOffsetPx) ?? undefined,
      },
    ];
  });
  if (points.length) return points;
  const hasAuthoredContent = ["segments", "edges", "dimensions", "dimensionLines", "faces", "solids", "surfaces"].some(
    (key) => Array.isArray(data[key]) && data[key].length > 0,
  );
  return hasAuthoredContent ? [] : [{ id: "P", label: "P", coords: [2, 2, 2], show: true }];
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
        labelScreenOffsetPx: finiteTuple2(segment.labelScreenOffsetPx) ?? undefined,
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
        labelPosition: finiteTuple3(dimension.labelPosition ?? dimension.labelAt) ?? undefined,
        display: graph3dDimensionDisplay(dimension.display),
        labelOffsetPx: positiveNumber(dimension.labelOffsetPx, 12),
        labelScreenOffsetPx: finiteTuple2(dimension.labelScreenOffsetPx) ?? undefined,
        rightAngleWith: typeof dimension.rightAngleWith === "string" ? dimension.rightAngleWith.trim() || undefined : undefined,
        rightAngleSize: positiveNumber(dimension.rightAngleSize, 0) || undefined,
        color: colorValue(dimension.color, colorValue(dimension.strokeColor, "#000000")),
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
        labelScreenOffsetPx: finiteTuple2(face.labelScreenOffsetPx) ?? undefined,
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
  const ranges = graph3dEqualScaleRanges([
    rangeFromValue(data.xRange) ?? rangeFromPoints(points, 0, [-5, 5]),
    rangeFromValue(data.yRange) ?? rangeFromPoints(points, 1, [-5, 5]),
    rangeFromValue(data.zRange) ?? rangeFromPoints(points, 2, [-5, 5]),
  ]);
  const zoom = graph3dViewState(graphConfig).zoom;
  return ranges.map(([minimum, maximum]) => {
    const centre = (minimum + maximum) / 2;
    const halfSpan = (maximum - minimum) / (2 * zoom);
    return [centre - halfSpan, centre + halfSpan] as [number, number];
  }) as Graph3DRanges;
}

function graph3dLabelContext(ranges: Graph3DRanges, viewState: Basic3DViewState, widthPx: number, heightPx: number): Graph3DLabelContext {
  const sceneSpan = Math.max(...ranges.map(([minimum, maximum]) => maximum - minimum));
  const equalScreenScale = Math.min(widthPx, heightPx) / Math.max(1e-9, sceneSpan);
  const screenScale = {
    x: equalScreenScale,
    y: equalScreenScale,
  };
  return {
    viewState,
    screenScale,
    sceneCenter: [(ranges[0][0] + ranges[0][1]) / 2, (ranges[1][0] + ranges[1][1]) / 2, (ranges[2][0] + ranges[2][1]) / 2],
  };
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
    zoom: Math.min(3, Math.max(0.5, finiteNumber(viewRecord.zoom, DEFAULT_3D_VIEW_STATE.zoom))),
  };
}

function currentViewState(view: Basic3DView, zoom = DEFAULT_3D_VIEW_STATE.zoom): Basic3DViewState {
  return {
    az: roundedViewValue(finiteNumber(view.az_slide?.Value(), DEFAULT_3D_VIEW_STATE.az)),
    el: roundedViewValue(finiteNumber(view.el_slide?.Value(), DEFAULT_3D_VIEW_STATE.el)),
    bank: roundedViewValue(finiteNumber(view.bank_slide?.Value(), DEFAULT_3D_VIEW_STATE.bank)),
    zoom,
  };
}

function sameViewState(left: Basic3DViewState, right: Basic3DViewState) {
  return left.az === right.az && left.el === right.el && left.bank === right.bank;
}

function viewStateKey(viewState: Basic3DViewState) {
  return `${viewState.az}:${viewState.el}:${viewState.bank}`;
}

function liveViewValue<T>(view: Basic3DView, derive: (viewState: Basic3DViewState) => T) {
  let cachedKey = "";
  let cachedValue: T | undefined;
  return () => {
    const viewState = currentViewState(view);
    const nextKey = viewStateKey(viewState);
    if (cachedValue === undefined || nextKey !== cachedKey) {
      cachedKey = nextKey;
      cachedValue = derive(viewState);
    }
    return cachedValue;
  };
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

function projectedUserPoint(view: Basic3DView, coords: Point3DCoords): Point2DCoords {
  const projected = view.project3DTo2D?.(coords);
  return projected ? [projected[1], projected[2]] : [coords[0], coords[1]];
}

function projectedScreenPoint(view: Basic3DView, coords: Point3DCoords): Point2DCoords {
  const userPoint = projectedUserPoint(view, coords);
  const unitX = Math.max(1e-9, Math.abs(view.board?.unitX ?? 1));
  const unitY = Math.max(1e-9, Math.abs(view.board?.unitY ?? 1));
  return [userPoint[0] * unitX, -userPoint[1] * unitY];
}

function userPointWithScreenOffset(view: Basic3DView, point: Point2DCoords, offset: Point2DCoords): Point2DCoords {
  const unitX = Math.max(1e-9, Math.abs(view.board?.unitX ?? 1));
  const unitY = Math.max(1e-9, Math.abs(view.board?.unitY ?? 1));
  return [point[0] + offset[0] / unitX, point[1] - offset[1] / unitY];
}

function radialProjectedLabelPoint(
  view: Basic3DView,
  anchor: Point3DCoords,
  sceneCenter: Point3DCoords,
  distancePx: number,
): Point2DCoords {
  const anchorUser = projectedUserPoint(view, anchor);
  const offset = graph3dRadialLabelScreenOffset(projectedScreenPoint(view, anchor), projectedScreenPoint(view, sceneCenter), distancePx);
  return userPointWithScreenOffset(view, anchorUser, offset);
}

function segmentProjectedLabelPoint(
  view: Basic3DView,
  from: Point3DCoords,
  to: Point3DCoords,
  sceneCenter: Point3DCoords,
  distancePx: number,
  anchorFraction = 0.5,
): Point2DCoords {
  const fromUser = projectedUserPoint(view, from);
  const toUser = projectedUserPoint(view, to);
  const anchorUser: Point2DCoords = [
    fromUser[0] + (toUser[0] - fromUser[0]) * anchorFraction,
    fromUser[1] + (toUser[1] - fromUser[1]) * anchorFraction,
  ];
  const offset = graph3dDimensionLabelScreenOffset(
    projectedScreenPoint(view, from),
    projectedScreenPoint(view, to),
    projectedScreenPoint(view, sceneCenter),
    distancePx,
    anchorFraction,
  );
  return userPointWithScreenOffset(view, anchorUser, offset);
}

function enableProjectedLabelDragging(
  board: JXG.Board,
  text: Basic2DElement,
  screenOffset: Point2DCoords,
  onMove: (offset: Point2DCoords | undefined) => void,
) {
  const node = text.rendNode;
  if (!node) return () => undefined;
  let activePointerId: number | null = null;
  let removeWindowListeners: () => void = () => undefined;

  const updateOffsetAttributes = () => {
    node.dataset.mauthLabelScreenOffsetX = String(screenOffset[0]);
    node.dataset.mauthLabelScreenOffsetY = String(screenOffset[1]);
  };
  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    activePointerId = event.pointerId;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startOffset: Point2DCoords = [...screenOffset];
    let moved = false;

    event.preventDefault();
    event.stopPropagation();
    node.setPointerCapture?.(event.pointerId);

    const removeListeners = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      removeWindowListeners = () => undefined;
    };
    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== activePointerId) return;
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startClientX;
      const deltaY = moveEvent.clientY - startClientY;
      moved = moved || Math.hypot(deltaX, deltaY) >= 1;
      const nextOffset = graph3dDraggedLabelScreenOffset(startOffset, deltaX, deltaY);
      screenOffset[0] = nextOffset[0];
      screenOffset[1] = nextOffset[1];
      updateOffsetAttributes();
      board.update();
    };
    const finish = (finishEvent: PointerEvent, commit: boolean) => {
      if (finishEvent.pointerId !== activePointerId) return;
      removeListeners();
      node.releasePointerCapture?.(finishEvent.pointerId);
      activePointerId = null;
      if (!commit) {
        screenOffset[0] = startOffset[0];
        screenOffset[1] = startOffset[1];
        updateOffsetAttributes();
        board.update();
      }
      if (commit && moved) onMove([...screenOffset]);
    };
    const handlePointerUp = (upEvent: PointerEvent) => finish(upEvent, true);
    const handlePointerCancel = (cancelEvent: PointerEvent) => finish(cancelEvent, false);
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    removeWindowListeners = removeListeners;
  };
  const handleDoubleClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    screenOffset[0] = 0;
    screenOffset[1] = 0;
    updateOffsetAttributes();
    board.update();
    onMove(undefined);
  };

  node.dataset.mauthDraggableGraph3dLabel = "true";
  node.title = "Drag to move this label. Double-click to reset its position.";
  node.style.setProperty("cursor", "move");
  node.style.setProperty("pointer-events", "auto");
  node.style.setProperty("user-select", "none");
  node.style.setProperty("-webkit-user-select", "none");
  node.style.setProperty("touch-action", "none");
  updateOffsetAttributes();
  node.addEventListener("pointerdown", handlePointerDown);
  node.addEventListener("dblclick", handleDoubleClick);

  return () => {
    removeWindowListeners();
    node.removeEventListener("pointerdown", handlePointerDown);
    node.removeEventListener("dblclick", handleDoubleClick);
  };
}

function renderProjectedGraph3DLabel({
  board,
  view,
  basePoint,
  labelHtml,
  elementKind,
  elementId,
  labelScreenOffsetPx,
  onMove,
  registerCleanup,
}: {
  board: JXG.Board;
  view: Basic3DView;
  basePoint: () => Point2DCoords;
  labelHtml: string;
  elementKind: Graph3DLabelElementKind;
  elementId: string;
  labelScreenOffsetPx?: Point2DCoords;
  onMove?: (offset: Point2DCoords | undefined) => void;
  registerCleanup: (cleanup: () => void) => void;
}) {
  const screenOffset: Point2DCoords = [...(labelScreenOffsetPx ?? [0, 0])];
  const labelPoint = () => userPointWithScreenOffset(view, basePoint(), screenOffset);
  const text = board.create(
    "text",
    [() => labelPoint()[0], () => labelPoint()[1], labelHtml],
    LATEX_3D_LABEL_ATTRIBUTES,
  ) as unknown as Basic2DElement;
  if (text.rendNode) {
    text.rendNode.dataset.mauthGraph3dLabelKind = elementKind;
    text.rendNode.dataset.mauthGraph3dElementId = elementId;
  }
  if (onMove) registerCleanup(enableProjectedLabelDragging(board, text, screenOffset, onMove));
  else text.rendNode?.style.setProperty("pointer-events", "none");
  return text;
}

function renderCurve3D(view: Basic3DView, from: Point3DCoords, to: Point3DCoords, attributes: Record<string, unknown>) {
  return view.create(
    "curve3d",
    [
      (t: number) => from[0] + t * (to[0] - from[0]),
      (t: number) => from[1] + t * (to[1] - from[1]),
      (t: number) => from[2] + t * (to[2] - from[2]),
      [0, 1],
    ],
    attributes,
  ) as BasicLiveGraphElement;
}

function renderLiveCurve3D(
  view: Basic3DView,
  pointAt: (parameter: number) => Point3DCoords,
  range: [number, number],
  attributes: Record<string, unknown>,
) {
  return view.create("curve3d", [pointAt, range], attributes) as unknown as BasicLiveGraphElement;
}

function interpolatePoint(from: Point3DCoords, to: Point3DCoords, parameter: number): Point3DCoords {
  return [from[0] + parameter * (to[0] - from[0]), from[1] + parameter * (to[1] - from[1]), from[2] + parameter * (to[2] - from[2])];
}

function liveCircularSilhouetteAngles(view: Basic3DView, center: Point3DCoords, axis: Point3DCoords, radius: number) {
  return liveViewValue(view, (viewState) => graph3dCircularSilhouetteAngles(center, axis, radius, viewState));
}

function renderLiveCircularSilhouetteLines(
  view: Basic3DView,
  center: Point3DCoords,
  axis: Point3DCoords,
  radius: number,
  pointAt: (angle: number, parameter: number) => Point3DCoords,
  attributes: Record<string, unknown>,
  registerLiveElement: RegisterLiveGraphElement,
) {
  const angles = liveCircularSilhouetteAngles(view, center, axis, radius);
  for (const angleIndex of [0, 1] as const) {
    registerLiveElement(renderLiveCurve3D(view, (parameter) => pointAt(angles()[angleIndex], parameter), [0, 1], attributes));
  }
}

function renderLiveCircularSilhouetteJoinedAtEnd(
  view: Basic3DView,
  center: Point3DCoords,
  axis: Point3DCoords,
  radius: number,
  pointAt: (angle: number, parameter: number) => Point3DCoords,
  attributes: Record<string, unknown>,
  registerLiveElement: RegisterLiveGraphElement,
) {
  const angles = liveCircularSilhouetteAngles(view, center, axis, radius);
  registerLiveElement(
    renderLiveCurve3D(
      view,
      (parameter) => {
        const currentAngles = angles();
        return parameter <= 1 ? pointAt(currentAngles[0], parameter) : pointAt(currentAngles[1], 2 - parameter);
      },
      [0, 2],
      attributes,
    ),
  );
}

function renderLiveSphereSilhouette(
  view: Basic3DView,
  center: Point3DCoords,
  radius: number,
  attributes: Record<string, unknown>,
  registerLiveElement: RegisterLiveGraphElement,
) {
  const basis = liveViewValue(view, (viewState) => basisFromNormal(graph3dViewDirection(viewState)));
  registerLiveElement(
    renderLiveCurve3D(
      view,
      (angle) => {
        const currentBasis = basis();
        return circlePoint(center, currentBasis.u, currentBasis.v, radius, angle);
      },
      [0, Math.PI * 2],
      attributes,
    ),
  );
}

function renderLiveSphereCapSilhouette(
  view: Basic3DView,
  center: Point3DCoords,
  axis: Point3DCoords,
  radius: number,
  baseZ: number,
  attributes: Record<string, unknown>,
  registerLiveElement: RegisterLiveGraphElement,
) {
  const capAxis = normalizeVector(axis);
  const silhouette = liveViewValue(view, (viewState) => {
    const { u, v } = basisFromNormal(graph3dViewDirection(viewState));
    const arc = graph3dSphereCapSilhouetteArc(capAxis, radius, baseZ, viewState);
    return {
      u,
      v,
      ...arc,
    };
  });

  registerLiveElement(
    renderLiveCurve3D(
      view,
      (parameter) => {
        const current = silhouette();
        const angle = current.firstAngle + parameter * (current.secondAngle - current.firstAngle);
        return circlePoint(center, current.u, current.v, radius, angle);
      },
      [0, 1],
      attributes,
    ),
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
  // JSXGraph renders curve3d circles as sampled open paths. Extending the
  // parameter range by one small sample overlaps the stroke at 2π so a butt
  // line cap cannot leave a visible hairline gap after projection or rotation.
  const closureOverlap = (Math.PI * 2) / 96;
  return view.create(
    "curve3d",
    [
      (t: number) => circlePoint(center, u, v, radius, t)[0],
      (t: number) => circlePoint(center, u, v, radius, t)[1],
      (t: number) => circlePoint(center, u, v, radius, t)[2],
      [0, Math.PI * 2 + closureOverlap],
    ],
    attributes,
  ) as BasicLiveGraphElement;
}

function solidStrokeAttributes(solid: Graph3DSolidEntry) {
  return {
    strokeColor: solid.strokeColor ?? "#1f2937",
    strokeWidth: solid.strokeWidth,
    strokeOpacity: 0.8,
    layer: 15,
    fixed: true,
    highlight: false,
  };
}

function preventGraph3DPrimitiveDragging(
  element: BasicStaticGraphElement | null | undefined,
  visited = new Set<BasicStaticGraphElement>(),
) {
  if (!element || visited.has(element)) return;
  visited.add(element);
  element.isDraggable = false;
  preventGraph3DPrimitiveDragging(element.element2D as BasicStaticGraphElement | undefined, visited);
  element.vertices?.forEach((vertex) => preventGraph3DPrimitiveDragging(vertex, visited));
  element.borders?.forEach((border) => preventGraph3DPrimitiveDragging(border, visited));
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

function surfaceShader(fillColor: string | undefined) {
  const normalized = fillColor?.trim().match(/^#([0-9a-f]{6})$/i)?.[1];
  let hue = 212;
  let saturation = 38;
  let lightness = 84;
  if (normalized) {
    const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
    const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
    const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const delta = maximum - minimum;
    lightness = ((maximum + minimum) / 2) * 100;
    if (delta > 1e-6) {
      saturation = (delta / (1 - Math.abs(2 * ((maximum + minimum) / 2) - 1))) * 100;
      if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
      else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
      else hue = 60 * ((red - green) / delta + 4);
      if (hue < 0) hue += 360;
    }
  }
  return {
    enabled: true,
    type: "angle",
    hue,
    saturation: Math.min(48, Math.max(18, saturation * 0.55)),
    minLightness: Math.min(92, Math.max(76, lightness + 4)),
    maxLightness: Math.min(98, Math.max(90, lightness + 15)),
  };
}

function renderSurfacePolyhedron3D(
  view: Basic3DView,
  vertices: Point3DCoords[],
  faces: Graph3DSurfaceFace[],
  solid: Graph3DSolidEntry,
  { fillOpacity, surfaceGroup = solid.id }: { fillOpacity?: number; surfaceGroup?: string } = {},
) {
  try {
    const surface = view.create("polyhedron3d", [vertices, faces], {
      fillColorArray: [solid.fillColor ?? "#93c5fd"],
      fillOpacity: fillOpacity ?? Math.max(0.82, solid.fillOpacity),
      strokeColor: solid.strokeColor ?? "#1f2937",
      strokeWidth: 0,
      strokeOpacity: 0,
      layer: 8,
      fixed: true,
      highlight: false,
      shader: surfaceShader(solid.fillColor),
    });
    const staticSurface = surface as BasicStaticGraphElement;
    preventGraph3DPrimitiveDragging(staticSurface);
    staticSurface.faces?.forEach((face) => {
      const node = face.element2D?.rendNode ?? face.rendNode;
      node?.setAttribute("data-mauth-graph3d-surface-face", "true");
      node?.setAttribute("data-mauth-graph3d-surface-group", surfaceGroup);
    });
    return true;
  } catch {
    return false;
  }
}

function renderCircularBaseFace3D(
  view: Basic3DView,
  center: Point3DCoords,
  normal: Point3DCoords,
  radius: number,
  solid: Graph3DSolidEntry,
) {
  const { u, v } = basisFromNormal(normal);
  const steps = Math.min(36, Math.max(16, solid.stepsU));
  const vertices = Array.from({ length: steps }, (_, index) => circlePoint(center, u, v, radius, (index / steps) * Math.PI * 2));
  return renderSurfacePolyhedron3D(view, vertices, [vertices.map((_, index) => index)], solid);
}

function coneSurfaceMesh(solid: Graph3DSolidEntry): Graph3DSurfaceMesh | null {
  if (!solid.baseCenter || !solid.apex) return null;
  const axis = vectorSubtract(solid.apex, solid.baseCenter);
  const { u, v } = basisFromNormal(axis);
  const steps = Math.min(36, Math.max(16, solid.stepsU));
  const vertices = Array.from({ length: steps }, (_, index) =>
    circlePoint(solid.baseCenter!, u, v, solid.radius, (index / steps) * Math.PI * 2),
  );
  const apexIndex = vertices.push(solid.apex) - 1;
  const faces = Array.from({ length: steps }, (_, index) => [index, (index + 1) % steps, apexIndex]);
  return { vertices, faces };
}

function renderConeSurface3D(view: Basic3DView, solid: Graph3DSolidEntry) {
  const mesh = coneSurfaceMesh(solid);
  return mesh ? renderSurfacePolyhedron3D(view, mesh.vertices, mesh.faces, solid) : false;
}

function sphereCapSurfaceMesh(solid: Graph3DSolidEntry, capPoint: (angle: number, t: number) => Point3DCoords): Graph3DSurfaceMesh {
  const angularSteps = Math.min(32, Math.max(16, solid.stepsU));
  const ringCount = Math.min(8, Math.max(4, solid.stepsV));
  const vertices: Point3DCoords[] = [];
  for (let ring = 0; ring < ringCount; ring += 1) {
    const t = ring / ringCount;
    for (let index = 0; index < angularSteps; index += 1) {
      vertices.push(capPoint((index / angularSteps) * Math.PI * 2, t));
    }
  }
  const tipIndex = vertices.push(capPoint(0, 1)) - 1;
  const faces: number[][] = [];
  for (let ring = 0; ring < ringCount - 1; ring += 1) {
    for (let index = 0; index < angularSteps; index += 1) {
      const next = (index + 1) % angularSteps;
      const lower = ring * angularSteps;
      const upper = (ring + 1) * angularSteps;
      faces.push([lower + index, lower + next, upper + next, upper + index]);
    }
  }
  const finalRing = (ringCount - 1) * angularSteps;
  for (let index = 0; index < angularSteps; index += 1) {
    faces.push([finalRing + index, finalRing + ((index + 1) % angularSteps), tipIndex]);
  }
  return { vertices, faces };
}

function faceCentroid(vertices: Point3DCoords[], face: number[]) {
  const total = face.reduce<Point3DCoords>((sum, index) => vectorAdd(sum, vertices[index]), [0, 0, 0]);
  return vectorScale(total, 1 / Math.max(1, face.length));
}

function outwardFace(vertices: Point3DCoords[], face: number[], outwardAt: (centroid: Point3DCoords) => Point3DCoords) {
  if (face.length < 3) return face;
  const first = vertices[face[0]];
  const second = vertices[face[1]];
  const third = vertices[face[2]];
  const normal = crossProduct(vectorSubtract(second, first), vectorSubtract(third, first));
  return dotProduct(normal, outwardAt(faceCentroid(vertices, face))) < 0 ? [...face].reverse() : face;
}

function joinedConeSphereCapSurfaceMesh(cone: Graph3DSolidEntry, cap: Graph3DSolidEntry): Graph3DJoinedSurfaceMesh | null {
  if (!cone.baseCenter || !cone.apex || !cap.center) return null;
  const capGeometry = sphereCapGeometry(cap);
  if (!capGeometry) return null;
  const { height, u, v, w, baseZ, baseRadius, baseCenter } = capGeometry;
  const angularSteps = Math.min(36, Math.max(16, cone.stepsU, cap.stepsU));
  const ringCount = Math.min(8, Math.max(4, cap.stepsV));
  const vertices = Array.from({ length: angularSteps }, (_, index) =>
    circlePoint(baseCenter, u, v, baseRadius, (index / angularSteps) * Math.PI * 2),
  );
  const apexIndex = vertices.push(cone.apex) - 1;
  const coneFaces = Array.from({ length: angularSteps }, (_, index) => [index, (index + 1) % angularSteps, apexIndex]);
  const capPoint = (angle: number, t: number): Point3DCoords => {
    const z = baseZ + height * t;
    const sectionRadius = Math.sqrt(Math.max(0, cap.radius * cap.radius - z * z));
    return vectorAdd(
      cap.center!,
      vectorAdd(
        vectorScale(w, z),
        vectorAdd(vectorScale(u, sectionRadius * Math.cos(angle)), vectorScale(v, sectionRadius * Math.sin(angle))),
      ),
    );
  };

  const ringStarts = [0];
  for (let ring = 1; ring < ringCount; ring += 1) {
    ringStarts.push(vertices.length);
    const t = ring / ringCount;
    for (let index = 0; index < angularSteps; index += 1) {
      vertices.push(capPoint((index / angularSteps) * Math.PI * 2, t));
    }
  }
  const tipIndex = vertices.push(capPoint(0, 1)) - 1;
  const capFaces: number[][] = [];
  for (let ring = 0; ring < ringStarts.length - 1; ring += 1) {
    const lower = ringStarts[ring];
    const upper = ringStarts[ring + 1];
    for (let index = 0; index < angularSteps; index += 1) {
      const next = (index + 1) % angularSteps;
      capFaces.push([lower + index, lower + next, upper + next, upper + index]);
    }
  }
  const finalRing = ringStarts[ringStarts.length - 1];
  for (let index = 0; index < angularSteps; index += 1) {
    capFaces.push([finalRing + index, finalRing + ((index + 1) % angularSteps), tipIndex]);
  }

  const coneAxis = normalizeVector(vectorSubtract(cone.apex, cone.baseCenter));
  const orientedConeFaces = coneFaces.map((face) =>
    outwardFace(vertices, face, (centroid) => {
      const fromBase = vectorSubtract(centroid, cone.baseCenter!);
      const axisPoint = vectorAdd(cone.baseCenter!, vectorScale(coneAxis, dotProduct(fromBase, coneAxis)));
      return vectorSubtract(centroid, axisPoint);
    }),
  );
  const orientedCapFaces = capFaces.map((face) => outwardFace(vertices, face, (centroid) => vectorSubtract(centroid, cap.center!)));
  return {
    vertices,
    faces: [...orientedConeFaces, ...orientedCapFaces],
    coneFaces: orientedConeFaces,
    capFaces: orientedCapFaces,
  };
}

function convexHull2D(points: Point2DCoords[]) {
  const unique = Array.from(new Map(points.map((point) => [`${point[0].toFixed(9)}:${point[1].toFixed(9)}`, point])).values()).sort(
    (left, right) => left[0] - right[0] || left[1] - right[1],
  );
  if (unique.length <= 2) return unique;
  const turn = (a: Point2DCoords, b: Point2DCoords, c: Point2DCoords) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (source: Point2DCoords[]) => {
    const result: Point2DCoords[] = [];
    source.forEach((point) => {
      while (result.length >= 2 && turn(result[result.length - 2], result[result.length - 1], point) <= 0) result.pop();
      result.push(point);
    });
    return result;
  };
  const lower = half(unique);
  const upper = half([...unique].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function closedHullPoint(points: Point2DCoords[], parameter: number): Point2DCoords {
  if (!points.length) return [0, 0];
  if (points.length === 1) return points[0];
  const scaled = Math.min(1, Math.max(0, parameter)) * points.length;
  const index = Math.min(points.length - 1, Math.floor(scaled));
  const fraction = scaled >= points.length ? 1 : scaled - index;
  const next = (index + 1) % points.length;
  return [
    points[index][0] + fraction * (points[next][0] - points[index][0]),
    points[index][1] + fraction * (points[next][1] - points[index][1]),
  ];
}

function renderLiveProjectedCompositeSilhouette(
  view: Basic3DView,
  vertices: Point3DCoords[],
  attributes: Record<string, unknown>,
  registerLiveElement: RegisterLiveGraphElement,
) {
  if (!view.board) return;
  const hull = liveViewValue(view, () => convexHull2D(vertices.map((vertex) => projectedUserPoint(view, vertex))));
  const rendered = view.board.create(
    "curve",
    [(parameter: number) => closedHullPoint(hull(), parameter)[0], (parameter: number) => closedHullPoint(hull(), parameter)[1], 0, 1],
    attributes,
  ) as BasicLiveGraphElement;
  rendered.rendNode?.setAttribute("data-mauth-graph3d-composite-silhouette", "true");
  registerLiveElement(rendered);
}

function renderSphereCapSurface3D(view: Basic3DView, solid: Graph3DSolidEntry, capPoint: (angle: number, t: number) => Point3DCoords) {
  const mesh = sphereCapSurfaceMesh(solid, capPoint);
  return renderSurfacePolyhedron3D(view, mesh.vertices, mesh.faces, solid);
}

function renderGraph3DFace(
  view: Basic3DView,
  board: JXG.Board,
  face: Graph3DFaceEntry,
  labelContext: Graph3DLabelContext,
  onLabelMove: CommitGraph3DLabelScreenOffset | undefined,
  registerCleanup: (cleanup: () => void) => void,
) {
  if (!face.show) return;
  try {
    const renderedFace = view.create("polygon3d", face.coords, {
      fillColor: face.fillColor ?? "#93c5fd",
      fillOpacity: face.fillOpacity,
      gradient: null,
      fixed: true,
      borders: {
        strokeColor: face.strokeColor ?? "#1f2937",
        strokeWidth: face.strokeWidth ?? 1,
        dash: face.dashed ? 2 : 0,
        fixed: true,
        highlight: false,
      },
      vertices: {
        visible: false,
        withLabel: false,
        size: 0,
        fixed: true,
        highlight: false,
      },
      highlight: false,
    }) as BasicStaticGraphElement;
    // JSXGraph marks polygon3d and its generated 2D polygon as draggable during
    // construction. Explicitly lock the complete primitive tree so a face can
    // never translate briefly before the next 3D projection update restores it.
    preventGraph3DPrimitiveDragging(renderedFace);
    renderedFace.element2D?.rendNode?.setAttribute("data-mauth-static-graph3d-face", "true");
    if (face.label?.trim()) {
      const centroidSum = face.coords.reduce<Point3DCoords>(
        (sum, coords) => [sum[0] + coords[0], sum[1] + coords[1], sum[2] + coords[2]],
        [0, 0, 0],
      );
      const centroid: Point3DCoords = [
        centroidSum[0] / face.coords.length,
        centroidSum[1] / face.coords.length,
        centroidSum[2] / face.coords.length,
      ];
      renderProjectedGraph3DLabel({
        board,
        view,
        basePoint: () => radialProjectedLabelPoint(view, centroid, labelContext.sceneCenter, 12),
        labelHtml: render3DLatexLabel(
          face.label,
          { "data-mauth-label-role": "graph3d-face-label", "data-mauth-graph3d-element-id": face.id },
          face.strokeColor ?? face.fillColor ?? "#0f172a",
        ),
        elementKind: "face",
        elementId: face.id,
        labelScreenOffsetPx: face.labelScreenOffsetPx,
        onMove: onLabelMove ? (offset) => onLabelMove("face", face.id, offset) : undefined,
        registerCleanup,
      });
    }
  } catch {
    // Keep the rest of the 3D diagram rendering even if an optional face primitive is unsupported.
  }
}

function renderGraph3DDimension(
  view: Basic3DView,
  board: JXG.Board,
  dimension: Graph3DDimensionEntry,
  labelContext: Graph3DLabelContext,
  labelOffset: number,
  onLabelMove: CommitGraph3DLabelScreenOffset | undefined,
  registerCleanup: (cleanup: () => void) => void,
) {
  if (!dimension.show) return null;
  const color = dimension.color ?? "#000000";
  if (dimension.display !== "label") {
    renderCurve3D(view, dimension.from, dimension.to, {
      strokeColor: color,
      strokeWidth: dimension.strokeWidth ?? 1.3,
      dash: dimension.display === "guide" || dimension.dashed ? 2 : 0,
      layer: 18,
      fixed: true,
      highlight: false,
    });
  }
  if (dimension.display === "bracket") {
    const tickDirection = graph3dDimensionTickDirection(dimension.from, dimension.to, labelContext.viewState, labelContext.screenScale);
    const tickLength = Math.max(0.12, labelOffset * 1.35);
    for (const coords of [dimension.from, dimension.to]) {
      const [tickStart, tickEnd] = graph3dDimensionTickEndpoints(coords, tickDirection, tickLength);
      renderCurve3D(view, tickStart, tickEnd, {
        strokeColor: color,
        strokeWidth: dimension.strokeWidth ?? 1.3,
        layer: 18,
        fixed: true,
        highlight: false,
      });
    }
  }
  if (dimension.label?.trim()) {
    const labelHtml = render3DLatexLabel(
      dimension.label,
      {
        "data-mauth-label-role": "graph3d-dimension-label",
        "data-mauth-graph3d-element-id": dimension.id,
        "data-mauth-graph3d-dimension-display": dimension.display,
      },
      color,
    );
    const anchorFraction = dimension.display === "guide" ? 0.62 : 0.5;
    return renderProjectedGraph3DLabel({
      board,
      view,
      basePoint: () =>
        dimension.display === "bracket" && dimension.labelPosition
          ? projectedUserPoint(view, dimension.labelPosition)
          : segmentProjectedLabelPoint(
              view,
              dimension.from,
              dimension.to,
              labelContext.sceneCenter,
              dimension.labelOffsetPx,
              anchorFraction,
            ),
      labelHtml,
      elementKind: "dimension",
      elementId: dimension.id,
      labelScreenOffsetPx: dimension.labelScreenOffsetPx,
      onMove: onLabelMove ? (offset) => onLabelMove("dimension", dimension.id, offset) : undefined,
      registerCleanup,
    });
  }
  return null;
}

function renderGraph3DRightAngleMarkers(view: Basic3DView, dimensions: Graph3DDimensionEntry[], faces: Graph3DFaceEntry[]) {
  const dimensionMap = new Map(dimensions.map((dimension) => [dimension.id, dimension]));
  const faceMap = new Map(faces.map((face) => [face.id, face]));
  const renderedPairs = new Set<string>();
  for (const dimension of dimensions) {
    if (!dimension.show || !dimension.rightAngleWith) continue;
    if (dimension.rightAngleWith.startsWith(GRAPH3D_FACE_RIGHT_ANGLE_TARGET_PREFIX)) {
      const faceId = dimension.rightAngleWith.slice(GRAPH3D_FACE_RIGHT_ANGLE_TARGET_PREFIX.length);
      const face = faceMap.get(faceId);
      if (!face?.show) continue;
      const pairKey = `${dimension.id}::${GRAPH3D_FACE_RIGHT_ANGLE_TARGET_PREFIX}${face.id}`;
      const marker = graph3dDimensionFaceRightAngleMarkerPoints(dimension.from, dimension.to, face.coords, dimension.rightAngleSize);
      if (!marker) continue;
      const attributes = {
        strokeColor: dimension.color ?? face.strokeColor ?? "#000000",
        strokeWidth: Math.max(dimension.strokeWidth ?? 1.3, face.strokeWidth ?? 1),
        dash: 0,
        layer: 18,
        highlight: false,
        fixed: true,
      };
      for (const element of [
        renderCurve3D(view, marker.vertex, marker.secondArm, attributes),
        renderCurve3D(view, marker.firstArm, marker.corner, attributes),
        renderCurve3D(view, marker.corner, marker.secondArm, attributes),
      ]) {
        const renderedNode = element.element2D?.rendNode ?? element.rendNode;
        if (renderedNode) renderedNode.dataset.mauthGraph3dRightAngle = pairKey;
      }
      continue;
    }
    const other = dimensionMap.get(dimension.rightAngleWith);
    if (!other?.show || other.id === dimension.id) continue;
    const pairKey = [dimension.id, other.id].sort().join("::");
    if (renderedPairs.has(pairKey)) continue;
    const marker = graph3dRightAngleMarkerPoints(dimension.from, dimension.to, other.from, other.to, dimension.rightAngleSize);
    if (!marker) continue;
    renderedPairs.add(pairKey);
    const attributes = {
      strokeColor: dimension.color ?? other.color ?? "#000000",
      strokeWidth: Math.max(dimension.strokeWidth ?? 1.3, other.strokeWidth ?? 1.3),
      dash: 0,
      layer: 18,
      highlight: false,
      fixed: true,
    };
    for (const element of [
      renderCurve3D(view, marker.firstArm, marker.corner, attributes),
      renderCurve3D(view, marker.corner, marker.secondArm, attributes),
    ]) {
      const renderedNode = element.element2D?.rendNode ?? element.rendNode;
      if (renderedNode) renderedNode.dataset.mauthGraph3dRightAngle = pairKey;
    }
  }
}

function renderCone3D(
  view: Basic3DView,
  solid: Graph3DSolidEntry,
  registerLiveElement: RegisterLiveGraphElement,
  {
    renderBaseCircle = true,
    renderBaseFace = true,
    renderSurface = true,
    renderSilhouette = true,
  }: { renderBaseCircle?: boolean; renderBaseFace?: boolean; renderSurface?: boolean; renderSilhouette?: boolean } = {},
) {
  if (!solid.baseCenter || !solid.apex) return;
  const axis = vectorSubtract(solid.apex, solid.baseCenter);
  const { u, v } = basisFromNormal(axis);
  if (solid.renderStyle === "surface" && renderSurface) {
    const renderedSurface = renderConeSurface3D(view, solid);
    if (!renderedSurface) {
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
        // The silhouette below remains available when the 3D surface is unsupported.
      }
    }
    if (renderBaseFace) renderCircularBaseFace3D(view, solid.baseCenter, axis, solid.radius, solid);
  } else if (solid.renderStyle === "wireframe") {
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
  if (renderBaseCircle) renderCircleCurve3D(view, solid.baseCenter, axis, solid.radius, solidStrokeAttributes(solid));
  if (renderSilhouette) {
    renderLiveCircularSilhouetteJoinedAtEnd(
      view,
      solid.baseCenter,
      axis,
      solid.radius,
      (angle, parameter) => interpolatePoint(circlePoint(solid.baseCenter!, u, v, solid.radius, angle), solid.apex!, parameter),
      solidStrokeAttributes(solid),
      registerLiveElement,
    );
  }
}

function renderCylinder3D(view: Basic3DView, solid: Graph3DSolidEntry, registerLiveElement: RegisterLiveGraphElement) {
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
  renderLiveCircularSilhouetteLines(
    view,
    solid.baseCenter,
    axis,
    solid.radius,
    (angle, parameter) =>
      interpolatePoint(
        circlePoint(solid.baseCenter!, u, v, solid.radius, angle),
        circlePoint(solid.topCenter!, u, v, solid.radius, angle),
        parameter,
      ),
    solidStrokeAttributes(solid),
    registerLiveElement,
  );
}

function renderSphere3D(view: Basic3DView, solid: Graph3DSolidEntry, registerLiveElement: RegisterLiveGraphElement) {
  if (!solid.center) return;
  if (solid.renderStyle !== "outline") {
    try {
      const centerPoint = view.create("point3d", solid.center, HIDDEN_3D_POINT_ATTRIBUTES);
      const radiusPoint = view.create(
        "point3d",
        [solid.center[0] + solid.radius, solid.center[1], solid.center[2]],
        HIDDEN_3D_POINT_ATTRIBUTES,
      );
      view.create("sphere3d", [centerPoint, radiusPoint], {
        fillColor: solid.fillColor ?? "#93c5fd",
        fillOpacity: solid.renderStyle === "wireframe" ? 0 : solid.fillOpacity,
        strokeOpacity: 0,
        strokeWidth: 0,
        highlight: false,
      });
      const sphereGuideAttributes = {
        ...solidStrokeAttributes(solid),
        strokeWidth: Math.min(0.9, solid.strokeWidth ?? 0.9),
        strokeOpacity: solid.renderStyle === "wireframe" ? 0.5 : 0.24,
      };
      const guideNormals: Point3DCoords[] =
        solid.renderStyle === "wireframe"
          ? [
              [1, 0, 0],
              [0, 1, 0],
              [0, 0, 1],
            ]
          : [
              [1, 0, 0],
              [0, 0, 1],
            ];
      for (const normal of guideNormals) {
        renderCircleCurve3D(view, solid.center, normal, solid.radius, sphereGuideAttributes);
      }
    } catch {
      // The live silhouette below remains available if the optional sphere projection is unsupported.
    }
  }
  renderLiveSphereSilhouette(view, solid.center, solid.radius, solidStrokeAttributes(solid), registerLiveElement);
}

function sphereCapGeometry(solid: Graph3DSolidEntry) {
  if (!solid.center || !solid.height) return;
  const height = Math.min(solid.radius * 2, Math.max(1e-6, solid.height));
  const axis = solid.normal ?? [0, 0, 1];
  const { u, v, w } = basisFromNormal(axis);
  const baseZ = solid.radius - height;
  const baseRadius = Math.sqrt(Math.max(0, solid.radius * solid.radius - baseZ * baseZ));
  const baseCenter = vectorAdd(solid.center, vectorScale(w, baseZ));
  return { height, u, v, w, baseZ, baseRadius, baseCenter };
}

function joinedSurfaceFace(face: number[], offset: number, solid: Graph3DSolidEntry): Graph3DSurfaceFace {
  return [
    face.map((index) => index + offset),
    {
      fillColor: solid.fillColor ?? "#93c5fd",
      fillOpacity: 1,
      strokeWidth: 0,
      strokeOpacity: 0,
      shader: surfaceShader(solid.fillColor),
    },
  ];
}

function renderJoinedConeSphereCapSurface3D(
  view: Basic3DView,
  cone: Graph3DSolidEntry,
  cap: Graph3DSolidEntry,
  registerLiveElement: RegisterLiveGraphElement,
) {
  const mesh = joinedConeSphereCapSurfaceMesh(cone, cap);
  if (!mesh) return false;
  const faces: Graph3DSurfaceFace[] = [
    ...mesh.coneFaces.map((face) => joinedSurfaceFace(face, 0, cone)),
    ...mesh.capFaces.map((face) => joinedSurfaceFace(face, 0, cap)),
  ];
  const rendered = renderSurfacePolyhedron3D(view, mesh.vertices, faces, cone, {
    fillOpacity: 1,
    surfaceGroup: `joined:${cone.id}:${cap.id}`,
  });
  if (!rendered) return false;
  renderLiveProjectedCompositeSilhouette(view, mesh.vertices, solidStrokeAttributes(cone), registerLiveElement);
  const sharedSeam = renderCircleCurve3D(view, cone.baseCenter!, vectorSubtract(cone.apex!, cone.baseCenter!), cone.radius, {
    ...solidStrokeAttributes(cone),
    dash: 2,
  });
  (sharedSeam.rendNode ?? sharedSeam.element2D?.rendNode)?.setAttribute("data-mauth-graph3d-shared-seam", "true");
  return true;
}

function renderSphereCap3D(
  view: Basic3DView,
  solid: Graph3DSolidEntry,
  registerLiveElement: RegisterLiveGraphElement,
  {
    renderBaseCircle = true,
    renderBaseFace = true,
    renderSurface = true,
    silhouette = "sphere",
  }: {
    renderBaseCircle?: boolean;
    renderBaseFace?: boolean;
    renderSurface?: boolean;
    silhouette?: "sphere" | "profile" | "none";
  } = {},
) {
  if (!solid.center) return;
  const geometry = sphereCapGeometry(solid);
  if (!geometry) return;
  const { height, u, v, w, baseZ, baseRadius, baseCenter } = geometry;
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

  if (solid.renderStyle === "surface" && renderSurface) {
    const renderedSurface = renderSphereCapSurface3D(view, solid, capPoint);
    if (!renderedSurface) {
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
        // The silhouette below still shows the cap depth and circular section.
      }
    }
  } else if (solid.renderStyle === "wireframe") {
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

  if (renderBaseFace && solid.renderStyle === "surface") {
    renderCircularBaseFace3D(view, baseCenter, w, baseRadius, solid);
  } else if (renderBaseFace && solid.renderStyle === "wireframe") {
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

  if (renderBaseCircle) renderCircleCurve3D(view, baseCenter, w, baseRadius, solidStrokeAttributes(solid));
  if (silhouette === "profile") {
    renderLiveCircularSilhouetteJoinedAtEnd(
      view,
      baseCenter,
      w,
      baseRadius,
      (angle, parameter) => capPoint(angle, parameter),
      solidStrokeAttributes(solid),
      registerLiveElement,
    );
  } else if (silhouette === "sphere") {
    renderLiveSphereCapSilhouette(view, solid.center, w, solid.radius, baseZ, solidStrokeAttributes(solid), registerLiveElement);
  }
}

function matchingJoinedSolids(solids: Graph3DSolidEntry[]) {
  const coneIds = new Set<string>();
  const capIds = new Set<string>();
  const pairs: Array<{ cone: Graph3DSolidEntry; cap: Graph3DSolidEntry }> = [];
  const cones = solids.filter((solid) => solid.show && solid.kind === "cone" && solid.baseCenter && solid.apex);

  for (const cap of solids) {
    if (!cap.show || (cap.kind !== "spherecap" && cap.kind !== "sphericalcap")) continue;
    const capGeometry = sphereCapGeometry(cap);
    if (!capGeometry) continue;
    const tolerance = Math.max(1e-6, cap.radius * 1e-6);
    const matchingCone = cones.find((cone) => {
      if (coneIds.has(cone.id)) return false;
      if (!cone.baseCenter || !cone.apex) return false;
      const coneAxis = normalizeVector(vectorSubtract(cone.apex, cone.baseCenter));
      return (
        vectorLength(vectorSubtract(cone.baseCenter, capGeometry.baseCenter)) <= tolerance &&
        Math.abs(cone.radius - capGeometry.baseRadius) <= tolerance &&
        dotProduct(coneAxis, capGeometry.w) <= -1 + 1e-6
      );
    });
    if (matchingCone) {
      coneIds.add(matchingCone.id);
      capIds.add(cap.id);
      pairs.push({ cone: matchingCone, cap });
    }
  }

  return { coneIds, capIds, pairs };
}

function renderGraph3DSolid(
  view: Basic3DView,
  solid: Graph3DSolidEntry,
  registerLiveElement: RegisterLiveGraphElement,
  {
    renderBaseCircle = true,
    renderBaseFace = true,
    renderSurface = true,
    renderSilhouette = true,
    sphereCapSilhouette = "sphere",
  }: {
    renderBaseCircle?: boolean;
    renderBaseFace?: boolean;
    renderSurface?: boolean;
    renderSilhouette?: boolean;
    sphereCapSilhouette?: "sphere" | "profile" | "none";
  } = {},
) {
  if (!solid.show) return;
  if (solid.kind === "circle" && solid.center) {
    renderCircleCurve3D(view, solid.center, solid.normal ?? [0, 0, 1], solid.radius, solidStrokeAttributes(solid));
  } else if (solid.kind === "cone") {
    renderCone3D(view, solid, registerLiveElement, { renderBaseCircle, renderBaseFace, renderSurface, renderSilhouette });
  } else if (solid.kind === "cylinder") {
    renderCylinder3D(view, solid, registerLiveElement);
  } else if (solid.kind === "sphere") {
    renderSphere3D(view, solid, registerLiveElement);
  } else if (solid.kind === "spherecap" || solid.kind === "sphericalcap") {
    renderSphereCap3D(view, solid, registerLiveElement, {
      renderBaseCircle,
      renderBaseFace,
      renderSurface,
      silhouette: sphereCapSilhouette,
    });
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
  const initialZoom = initialViewState.zoom;
  const renderSignature = JSON.stringify({
    data: graphConfig?.data ?? null,
    widthPx: graphConfig?.widthPx ?? null,
    heightPx: graphConfig?.heightPx ?? null,
  });
  const labelExpectations = useMemo(() => {
    const points = graph3dPoints(graphConfig);
    const pointMap = new Map(points.map((point) => [point.id, point]));
    const pointIds = new Set(pointMap.keys());
    const axesVisible = graph3dAxesVisible(
      graphConfig,
      points.some((point) => point.show),
    );
    return {
      axesVisible,
      axisLabelsVisible: graph3dAxisLabelsVisible(graphConfig, axesVisible),
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
    const persistedViewState = { az: initialAz, el: initialEl, bank: initialBank, zoom: initialZoom };
    let commitTimer = 0;
    let lastCommittedViewState = persistedViewState;
    let pointerActive = false;
    const liveProjectionElements: BasicLiveGraphElement[] = [];
    const labelDragCleanups: Array<() => void> = [];
    const board = JXG.JSXGraph.initBoard(boardId, {
      boundingbox: GRAPH3D_BOARD_BOUNDING_BOX,
      axis: false,
      keepAspectRatio: true,
      showCopyright: false,
      showNavigation: false,
      text: LABEL_ATTRIBUTES,
    } as Record<string, unknown>);
    let view: Basic3DView | null = null;
    const renderGraphConfig = graphConfigRef.current;
    const graphPoints = graph3dPoints(renderGraphConfig);
    const graphRanges = graph3dRanges(renderGraphConfig, graphPoints);
    const axesVisible = graph3dAxesVisible(
      renderGraphConfig,
      graphPoints.some((point) => point.show),
    );
    const axisLabelsVisible = graph3dAxisLabelsVisible(renderGraphConfig, axesVisible);
    const registerLabelDragCleanup = (cleanup: () => void) => labelDragCleanups.push(cleanup);
    const commitLabelScreenOffset: CommitGraph3DLabelScreenOffset | undefined = onGraphConfigChange
      ? (kind, id, offset) => {
          const currentGraphConfig = graphConfigRef.current;
          if (!currentGraphConfig) return;
          onGraphConfigChange(graph3dConfigWithLabelScreenOffset(currentGraphConfig, kind, id, offset));
        }
      : undefined;

    const commitViewState = () => {
      if (!view || !onGraphConfigChange) return;
      const nextViewState = currentViewState(view, persistedViewState.zoom);
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
      view = board.create("view3d", [GRAPH3D_VIEW_ORIGIN, GRAPH3D_VIEW_SIZE, [graphRanges[0], graphRanges[1], graphRanges[2]]], {
        projection: "parallel",
        depthOrder: { enabled: true },
        az: { slider: { visible: false, start: persistedViewState.az } },
        el: { slider: { visible: false, start: persistedViewState.el } },
        bank: { slider: { visible: false, start: persistedViewState.bank } },
        xAxis: axesVisible ? { point2: { name: "", withLabel: false } } : { visible: false },
        yAxis: axesVisible ? { point2: { name: "", withLabel: false } } : { visible: false },
        zAxis: axesVisible ? { point2: { name: "", withLabel: false } } : { visible: false },
        xAxisBorder: axesVisible ? AXIS_3D_LABEL_ATTRIBUTES : { visible: false },
        yAxisBorder: axesVisible ? AXIS_3D_LABEL_ATTRIBUTES : { visible: false },
        zAxisBorder: axesVisible ? AXIS_3D_LABEL_ATTRIBUTES : { visible: false },
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
      } as Record<string, unknown>) as unknown as Basic3DView;
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
      const labelContext = graph3dLabelContext(
        ranges,
        persistedViewState,
        renderGraphConfig?.widthPx ?? DEFAULT_GRAPH_WIDTH,
        renderGraphConfig?.heightPx ?? DEFAULT_GRAPH_HEIGHT,
      );
      const axisLabelCoords: Point3DCoords[] = axisLabelsVisible
        ? [
            [ranges[0][1] + axisLabelOffset, 0, 0],
            [0, ranges[1][1] + axisLabelOffset, 0],
            [0, 0, ranges[2][1] + axisLabelOffset],
          ]
        : [];
      const joinedSolids = matchingJoinedSolids(solids);
      const joinedSurfaceIds = new Set<string>();
      joinedSolids.pairs.forEach(({ cone, cap }) => {
        if (cone.renderStyle !== "surface" || cap.renderStyle !== "surface") return;
        if (renderJoinedConeSphereCapSurface3D(view!, cone, cap, (element) => liveProjectionElements.push(element))) {
          joinedSurfaceIds.add(cone.id);
          joinedSurfaceIds.add(cap.id);
        }
      });
      solids.forEach((solid) =>
        renderGraph3DSolid(view!, solid, (element) => liveProjectionElements.push(element), {
          renderBaseCircle: !joinedSolids.capIds.has(solid.id) && !joinedSolids.coneIds.has(solid.id),
          renderBaseFace: !joinedSolids.capIds.has(solid.id) && !joinedSolids.coneIds.has(solid.id),
          renderSurface: !joinedSurfaceIds.has(solid.id),
          renderSilhouette: !joinedSurfaceIds.has(solid.id),
          sphereCapSilhouette: joinedSurfaceIds.has(solid.id) ? "none" : joinedSolids.capIds.has(solid.id) ? "profile" : "sphere",
        }),
      );
      faces.forEach((face) => renderGraph3DFace(view!, board, face, labelContext, commitLabelScreenOffset, registerLabelDragCleanup));

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
            renderProjectedGraph3DLabel({
              board,
              view: view!,
              basePoint: () => segmentProjectedLabelPoint(view!, from.coords, to.coords, labelContext.sceneCenter, 12),
              labelHtml: render3DLatexLabel(
                segment.label,
                {
                  "data-mauth-label-role": "graph3d-segment-label",
                  "data-mauth-graph3d-element-id": segment.id,
                  "data-mauth-segment-from": segment.from,
                  "data-mauth-segment-to": segment.to,
                },
                segment.color ?? "#0f172a",
              ),
              elementKind: "segment",
              elementId: segment.id,
              labelScreenOffsetPx: segment.labelScreenOffsetPx,
              onMove: commitLabelScreenOffset ? (offset) => commitLabelScreenOffset("segment", segment.id, offset) : undefined,
              registerCleanup: registerLabelDragCleanup,
            });
          }
        });
      dimensions.forEach((dimension) => {
        const liveProjectionElement = renderGraph3DDimension(
          view!,
          board,
          dimension,
          labelContext,
          labelOffset,
          commitLabelScreenOffset,
          registerLabelDragCleanup,
        );
        if (liveProjectionElement) liveProjectionElements.push(liveProjectionElement);
      });
      renderGraph3DRightAngleMarkers(view!, dimensions, faces);

      points
        .filter((point) => point.show)
        .forEach((point) => {
          view?.create("point3d", point.coords, {
            name: point.id,
            ...POINT_3D_ATTRIBUTES,
            fillColor: point.color ?? POINT_3D_ATTRIBUTES.fillColor,
          });
          if (point.label.trim()) {
            renderProjectedGraph3DLabel({
              board,
              view: view!,
              basePoint: () => radialProjectedLabelPoint(view!, point.coords, labelContext.sceneCenter, 12),
              labelHtml: render3DLatexLabel(
                point.label,
                { "data-mauth-label-role": "graph3d-point-label", "data-mauth-point-id": point.id },
                point.color ?? "#0f172a",
              ),
              elementKind: "point",
              elementId: point.id,
              labelScreenOffsetPx: point.labelScreenOffsetPx,
              onMove: commitLabelScreenOffset ? (offset) => commitLabelScreenOffset("point", point.id, offset) : undefined,
              registerCleanup: registerLabelDragCleanup,
            });
          }
        });
      if (axisLabelsVisible) {
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
      }
    } catch {
      board.create("text", [-4.8, 4.8, "3D graph adapter"], LABEL_ATTRIBUTES);
    }

    const eventBoard = board as JXG.Board & {
      on?: (eventName: string, handler: () => void) => void;
      off?: (eventName: string, handler: () => void) => void;
    };
    const handleBoardUpdate = () => {
      for (const element of liveProjectionElements) {
        element.prepareUpdate?.();
        element.update?.();
        element.updateRenderer?.();
        element.element2D?.prepareUpdate?.();
        element.element2D?.update?.();
        element.element2D?.updateRenderer?.();
      }
      scheduleViewStateCommit();
    };
    eventBoard.on?.("update", handleBoardUpdate);

    const container = document.getElementById(boardId);
    const renderedRangeSpans = graphRanges.map(([minimum, maximum]) => maximum - minimum);
    const minimumRangeSpan = Math.min(...renderedRangeSpans);
    const maximumRangeSpan = Math.max(...renderedRangeSpans);
    container?.setAttribute(
      "data-mauth-graph3d-screen-scale-ratio",
      (Math.abs(board.unitX) / Math.max(1e-9, Math.abs(board.unitY))).toFixed(6),
    );
    container?.setAttribute("data-mauth-graph3d-range-span-ratio", (maximumRangeSpan / Math.max(1e-9, minimumRangeSpan)).toFixed(6));
    const handlePointerDown = () => {
      pointerActive = true;
      window.addEventListener("pointerup", commitViewStateSoon, { once: true });
      window.addEventListener("pointercancel", commitViewStateSoon, { once: true });
    };
    container?.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("beforeprint", commitViewState);

    return () => {
      window.clearTimeout(commitTimer);
      labelDragCleanups.forEach((cleanup) => cleanup());
      eventBoard.off?.("update", handleBoardUpdate);
      container?.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", commitViewStateSoon);
      window.removeEventListener("pointercancel", commitViewStateSoon);
      window.removeEventListener("beforeprint", commitViewState);
      JXG.JSXGraph.freeBoard(board);
    };
  }, [boardId, initialAz, initialBank, initialEl, initialZoom, onGraphConfigChange, renderSignature]);

  return (
    <div
      id={boardId}
      className="overflow-hidden bg-white"
      data-mauth-diagram-type="graph3d"
      data-mauth-graph3d-axes-visible={String(labelExpectations.axesVisible)}
      data-mauth-graph3d-axis-labels-visible={String(labelExpectations.axisLabelsVisible)}
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
