import { useEffect, useMemo } from "react";
import type { GraphConfig } from "@mauth-studio/shared";
import JXG from "jsxgraph";

import { renderMathJaxSvg } from "@/lib/mathjax";

import { GRAPH_LABEL_FONT_CSS, GRAPH_LABEL_FONT_SIZE_PT, GRAPH_LABEL_FONT_UNIT, graphLabelAttributes } from "./graphTypography";

const DEFAULT_GRAPH_WIDTH = 680;
const DEFAULT_GRAPH_HEIGHT = 300;
const GRID_MAJOR_COLOR = "#b9b9b9";
const GRID_MINOR_COLOR = "#dddddd";
const AXIS_COLOR = "#000000";
const AXIS_STROKE_WIDTH = 2;
const AXIS_ARROW_SIZE = 4;
const DEFAULT_AXIS_LABEL_MIN_SPACING_PX = 48;
const AUTO_AXIS_EXTENSION_RATIO = 0.055;
const BOARD_EDGE_PADDING_RATIO = 0.022;
const AXIS_LABEL_EDGE_PADDING_RATIO = 0.018;
const X_TICK_LABEL_OFFSET_PX = -18;
const Y_TICK_LABEL_OFFSET_PX = -10;
const VECTOR_ARROW_LENGTH_PX = 18;
const VECTOR_ARROW_HALF_WIDTH_PX = 7;
const DEFAULT_VECTOR_COLORS = ["#0f766e", "#b45309", "#1d4ed8", "#be123c"];
const GRAPH_LAYERS = {
  grid: 1,
  axis: 3,
  vectorGuide: 7,
  vector: 8,
  axisLabel: 11,
  vectorLabel: 12,
};

type Vector2DLabelStyle = "boldLower" | "arrow" | "custom";

interface Vector2DEntry {
  id: string;
  name: string;
  label: string;
  labelStyle: Vector2DLabelStyle;
  start: [number, number];
  components: [number, number];
  color: string;
  showComponents: boolean;
  labelX?: number;
  labelY?: number;
}

interface Vector2DSegmentLabel {
  id: string;
  vectorId: string;
  label: string;
  position: number;
  offsetPx: number;
  color: string;
  labelX?: number;
  labelY?: number;
}

interface Vector2DAngleMarker {
  id: string;
  from: string;
  to: string;
  label: string;
  rightAngle: boolean;
  radius: number;
  color: string;
  labelX?: number;
  labelY?: number;
}

type JXGElement = {
  X?: () => number;
  Y?: () => number;
  coords?: { usrCoords?: number[] };
  isDraggable?: boolean;
  rendNode?: HTMLElement;
  moveTo?: (coordinates: [number, number], time?: number) => void;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
};

const DEFAULT_VECTORS: Vector2DEntry[] = [
  {
    id: "a",
    name: "a",
    label: "",
    labelStyle: "boldLower",
    start: [0, 0],
    components: [2, 3],
    color: DEFAULT_VECTOR_COLORS[0],
    showComponents: false,
  },
  {
    id: "b",
    name: "b",
    label: "",
    labelStyle: "boldLower",
    start: [0, 0],
    components: [4, -3],
    color: DEFAULT_VECTOR_COLORS[1],
    showComponents: false,
  },
];

function finiteNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function positiveNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function graphSpan(min: number, max: number) {
  return Math.max(Math.abs(max - min), 1);
}

function numericRange(min: number, max: number, step: number) {
  if (!Number.isFinite(step) || step <= 0) return [];
  const values: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let value = start; value <= max + step / 1000; value += step) {
    values.push(Number(value.toFixed(8)));
  }
  return values;
}

function isMultiple(value: number, step: number) {
  if (!Number.isFinite(step) || step <= 0) return false;
  return Math.abs(value / step - Math.round(value / step)) < 0.001;
}

function niceGridAlignedStep(baseStep: number, minimumStep: number) {
  if (!Number.isFinite(baseStep) || baseStep <= 0) return 1;
  if (!Number.isFinite(minimumStep) || minimumStep <= baseStep) return baseStep;

  const minimumMultiple = Math.max(1, Math.ceil(minimumStep / baseStep));
  const magnitude = 10 ** Math.floor(Math.log10(minimumMultiple));
  const normalized = minimumMultiple / magnitude;
  const niceMultiple = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return baseStep * niceMultiple * magnitude;
}

function vectorLabelStyle(value: unknown, fallback: Vector2DLabelStyle = "boldLower"): Vector2DLabelStyle {
  return value === "arrow" || value === "custom" || value === "boldLower" ? value : fallback;
}

function coordinatePair(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value)) return fallback;
  return [finiteNumber(value[0], fallback[0]), finiteNumber(value[1], fallback[1])];
}

function finiteOptionalNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function formatVectorNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.abs(value) < 1e-9 ? 0 : value;
  return Number.isInteger(rounded) ? String(rounded) : Number(rounded.toFixed(6)).toString();
}

function columnVectorLatex(components: [number, number]) {
  return `\\begin{pmatrix}${formatVectorNumber(components[0])}\\\\${formatVectorNumber(components[1])}\\end{pmatrix}`;
}

function vectorLabelLatex(vector: Vector2DEntry) {
  const style = vector.labelStyle;
  if (style === "custom") return vector.label.trim();

  const name = vector.name.trim() || vector.id;
  const vectorName = style === "arrow" ? `\\overrightarrow{${name || "AB"}}` : `\\mathbf{${(name || "v").toLowerCase()}}`;
  return `${vectorName}=${columnVectorLatex(vector.components)}`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderLatexLabelHtml(latex: string, color: string) {
  const source = latex.trim();
  const safeColor = /^#[0-9a-f]{3,8}$/i.test(color) ? color : "#0f172a";
  const interactionCss = "pointer-events:none;user-select:none;-webkit-user-select:none;touch-action:none;";
  if (!source) return "";
  try {
    return `<span class="jxg-latex-label" style="${GRAPH_LABEL_FONT_CSS} color:${safeColor};${interactionCss}">${renderMathJaxSvg(source, false)}</span>`;
  } catch {
    return `<span class="jxg-latex-label" style="${GRAPH_LABEL_FONT_CSS} color:${safeColor};${interactionCss}">${escapeHtml(source)}</span>`;
  }
}

function vector2dEntries(graphConfig?: GraphConfig | null): Vector2DEntry[] {
  const metadata = graphConfig?.metadata ?? {};
  const vectorData =
    typeof metadata.vector2d === "object" && metadata.vector2d !== null ? (metadata.vector2d as Record<string, unknown>) : {};
  const defaultLabelStyle = vectorLabelStyle(vectorData.labelStyle);
  const rawVectors = Array.isArray(vectorData.vectors)
    ? vectorData.vectors
    : Array.isArray(metadata.vectors)
      ? metadata.vectors
      : undefined;

  if (rawVectors?.length) {
    return rawVectors.map((entry, index) => {
      const record = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
      const fallback = DEFAULT_VECTORS[index % DEFAULT_VECTORS.length];
      const components = coordinatePair(record.components ?? record.vector, fallback.components);
      const name = String(record.name ?? record.id ?? fallback.name);
      return {
        id: String(record.id ?? name ?? `v${index + 1}`),
        name,
        label: String(record.label ?? ""),
        labelStyle: defaultLabelStyle,
        start: coordinatePair(record.start, fallback.start),
        components,
        color: String(record.color ?? DEFAULT_VECTOR_COLORS[index % DEFAULT_VECTOR_COLORS.length]),
        showComponents: record.showComponents === true,
        labelX: finiteOptionalNumber(record.labelX),
        labelY: finiteOptionalNumber(record.labelY),
      };
    });
  }

  if (Array.isArray(metadata.vector)) {
    return [
      {
        ...DEFAULT_VECTORS[0],
        components: coordinatePair(metadata.vector, DEFAULT_VECTORS[0].components),
      },
    ];
  }

  return DEFAULT_VECTORS;
}

function vector2dAnnotationData(graphConfig?: GraphConfig | null) {
  const metadata = graphConfig?.metadata ?? {};
  const vectorData =
    typeof metadata.vector2d === "object" && metadata.vector2d !== null ? (metadata.vector2d as Record<string, unknown>) : {};
  const rawSegmentLabels = Array.isArray(vectorData.segmentLabels) ? vectorData.segmentLabels : [];
  const rawAngleMarkers = Array.isArray(vectorData.angleMarkers) ? vectorData.angleMarkers : [];
  return {
    segmentLabels: rawSegmentLabels
      .map((entry, index): Vector2DSegmentLabel | null => {
        const record = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
        const vectorId = String(record.vectorId ?? record.vector ?? "");
        const label = String(record.label ?? "");
        if (!vectorId || !label.trim()) return null;
        return {
          id: String(record.id ?? `segment-label-${index + 1}`),
          vectorId,
          label,
          position: Math.max(0.05, Math.min(0.95, finiteNumber(record.position, 0.55))),
          offsetPx: finiteNumber(record.offsetPx ?? record.offset, 18),
          color: String(record.color ?? AXIS_COLOR),
          labelX: finiteOptionalNumber(record.labelX),
          labelY: finiteOptionalNumber(record.labelY),
        };
      })
      .filter((entry): entry is Vector2DSegmentLabel => !!entry),
    angleMarkers: rawAngleMarkers
      .map((entry, index): Vector2DAngleMarker | null => {
        const record = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
        const from = String(record.from ?? record.vectorA ?? "");
        const to = String(record.to ?? record.vectorB ?? "");
        if (!from || !to) return null;
        return {
          id: String(record.id ?? `angle-marker-${index + 1}`),
          from,
          to,
          label: String(record.label ?? ""),
          rightAngle: record.rightAngle === true || record.kind === "rightAngle" || record.type === "rightAngle",
          radius: positiveNumber(record.radius, 0.45),
          color: String(record.color ?? AXIS_COLOR),
          labelX: finiteOptionalNumber(record.labelX),
          labelY: finiteOptionalNumber(record.labelY),
        };
      })
      .filter((entry): entry is Vector2DAngleMarker => !!entry),
  };
}

function vectorGraphSizing(graphConfig?: GraphConfig | null) {
  const xMin = graphConfig?.xMin ?? -6;
  const xMax = graphConfig?.xMax ?? 6;
  const yMin = graphConfig?.yMin ?? -6;
  const yMax = graphConfig?.yMax ?? 6;
  const xSpan = graphSpan(xMin, xMax);
  const ySpan = graphSpan(yMin, yMax);
  const xMajorStep = positiveNumber(graphConfig?.gridMajorStepX ?? graphConfig?.gridMajorStep, 1);
  const yMajorStep = positiveNumber(graphConfig?.gridMajorStepY ?? graphConfig?.gridMajorStep, 1);
  const xMinorStep = positiveNumber(graphConfig?.gridMinorStepX ?? graphConfig?.gridMinorStep, 0.5);
  const yMinorStep = positiveNumber(graphConfig?.gridMinorStepY ?? graphConfig?.gridMinorStep, 0.5);
  const showAxes = graphConfig?.showAxes ?? true;
  const showAxisLabels = graphConfig?.showAxisLabels ?? true;
  const xAxisExtension = showAxes ? Math.max(xSpan * AUTO_AXIS_EXTENSION_RATIO, xMajorStep * 0.4) : 0;
  const yAxisExtension = showAxes ? Math.max(ySpan * AUTO_AXIS_EXTENSION_RATIO, yMajorStep * 0.4) : 0;
  const axisLabelPaddingX = showAxes && showAxisLabels ? Math.max(xSpan * AXIS_LABEL_EDGE_PADDING_RATIO, xMajorStep * 0.32) : 0;
  const axisLabelPaddingY = showAxes && showAxisLabels ? Math.max(ySpan * AXIS_LABEL_EDGE_PADDING_RATIO, yMajorStep * 0.32) : 0;
  const boardPaddingX = Math.max(xAxisExtension + xSpan * BOARD_EDGE_PADDING_RATIO + axisLabelPaddingX, xSpan * 0.015);
  const boardPaddingY = Math.max(yAxisExtension + ySpan * BOARD_EDGE_PADDING_RATIO + axisLabelPaddingY, ySpan * 0.015);

  return {
    xMin,
    xMax,
    yMin,
    yMax,
    xSpan,
    ySpan,
    xMajorStep,
    yMajorStep,
    xMinorStep,
    yMinorStep,
    xAxisExtension,
    yAxisExtension,
    boardPaddingX,
    boardPaddingY,
  };
}

function vectorBoardBoundingBox(
  left: number,
  top: number,
  right: number,
  bottom: number,
  displayWidth: number,
  displayHeight: number,
  equalScale: boolean,
): [number, number, number, number] {
  if (!equalScale || displayWidth <= 0 || displayHeight <= 0) return [left, top, right, bottom];

  const boardWidth = right - left;
  const boardHeight = top - bottom;
  if (boardWidth <= 0 || boardHeight <= 0) return [left, top, right, bottom];

  const displayRatio = displayWidth / displayHeight;
  const boardRatio = boardWidth / boardHeight;
  if (!Number.isFinite(displayRatio) || displayRatio <= 0 || !Number.isFinite(boardRatio) || boardRatio <= 0) {
    return [left, top, right, bottom];
  }

  if (boardRatio < displayRatio) {
    const nextWidth = boardHeight * displayRatio;
    const padding = (nextWidth - boardWidth) / 2;
    return [left - padding, top, right + padding, bottom];
  }

  const nextHeight = boardWidth / displayRatio;
  const padding = (nextHeight - boardHeight) / 2;
  return [left, top + padding, right, bottom - padding];
}

function axisLabelStep({
  graphConfig,
  axis,
  majorStep,
  span,
  padding,
  displayPx,
}: {
  graphConfig?: GraphConfig | null;
  axis: "x" | "y";
  majorStep: number;
  span: number;
  padding: number;
  displayPx: number;
}) {
  const manualStep = axis === "x" ? graphConfig?.axisLabelStepX : graphConfig?.axisLabelStepY;
  if ((graphConfig?.axisLabelIntervalMode ?? "auto") === "manual") {
    return positiveNumber(manualStep, majorStep);
  }

  const boardSpan = span + padding * 2;
  const pixelsPerUnit = boardSpan > 0 && displayPx > 0 ? displayPx / boardSpan : 1;
  const minSpacingPx = positiveNumber(graphConfig?.axisLabelMinSpacingPx, DEFAULT_AXIS_LABEL_MIN_SPACING_PX);
  return niceGridAlignedStep(majorStep, minSpacingPx / pixelsPerUnit);
}

function axisArrowAttributes() {
  return { type: 1, size: AXIS_ARROW_SIZE, highlightSize: AXIS_ARROW_SIZE };
}

function textCoordinates(text: unknown): [number, number] | null {
  const candidate = text as JXGElement;
  const x = typeof candidate.X === "function" ? candidate.X() : candidate.coords?.usrCoords?.[1];
  const y = typeof candidate.Y === "function" ? candidate.Y() : candidate.coords?.usrCoords?.[2];
  return Number.isFinite(x) && Number.isFinite(y) ? [x as number, y as number] : null;
}

function boardUnit(board: JXG.Board, axis: "x" | "y") {
  const unit = (board as JXG.Board & { unitX?: number; unitY?: number })[axis === "x" ? "unitX" : "unitY"];
  return typeof unit === "number" && Number.isFinite(unit) && unit > 0 ? unit : 1;
}

function offsetUserByPixels(board: JXG.Board, x: number, y: number, dxPx: number, dyPx: number): [number, number] {
  return [x + dxPx / boardUnit(board, "x"), y - dyPx / boardUnit(board, "y")];
}

function drawVectorArrow(board: JXG.Board, start: [number, number], end: [number, number], color: string) {
  const lengthPx = Math.hypot((end[0] - start[0]) * boardUnit(board, "x"), (end[1] - start[1]) * boardUnit(board, "y"));
  const directionX = lengthPx > 0 ? ((end[0] - start[0]) * boardUnit(board, "x")) / lengthPx : 1;
  const directionY = lengthPx > 0 ? -((end[1] - start[1]) * boardUnit(board, "y")) / lengthPx : 0;
  const baseCenter = offsetUserByPixels(board, end[0], end[1], -directionX * VECTOR_ARROW_LENGTH_PX, -directionY * VECTOR_ARROW_LENGTH_PX);
  const perpendicularX = -directionY;
  const perpendicularY = directionX;
  const baseLeft = offsetUserByPixels(
    board,
    baseCenter[0],
    baseCenter[1],
    perpendicularX * VECTOR_ARROW_HALF_WIDTH_PX,
    perpendicularY * VECTOR_ARROW_HALF_WIDTH_PX,
  );
  const baseRight = offsetUserByPixels(
    board,
    baseCenter[0],
    baseCenter[1],
    -perpendicularX * VECTOR_ARROW_HALF_WIDTH_PX,
    -perpendicularY * VECTOR_ARROW_HALF_WIDTH_PX,
  );

  board.create("segment", [start, baseCenter], {
    strokeColor: color,
    highlightStrokeColor: color,
    strokeWidth: 3,
    fixed: true,
    withLabel: false,
    layer: GRAPH_LAYERS.vector,
  });
  board.create("polygon", [end, baseLeft, baseRight], {
    fixed: true,
    highlight: false,
    withLabel: false,
    withLines: false,
    hasInnerPoints: false,
    fillColor: color,
    highlightFillColor: color,
    fillOpacity: 1,
    highlightFillOpacity: 1,
    strokeColor: color,
    strokeOpacity: 0,
    strokeWidth: 0,
    layer: GRAPH_LAYERS.vector,
    vertices: {
      fixed: true,
      visible: false,
      withLabel: false,
    },
    borders: {
      visible: false,
    },
  } as Record<string, unknown>);
}

function vectorEnd(vector: Vector2DEntry): [number, number] {
  return [vector.start[0] + vector.components[0], vector.start[1] + vector.components[1]];
}

function vectorLookupKey(value: string) {
  return value.trim().toLowerCase();
}

function vectorByReference(vectors: readonly Vector2DEntry[], reference: string) {
  const key = vectorLookupKey(reference);
  return vectors.find(
    (vector) =>
      vectorLookupKey(vector.id) === key ||
      vectorLookupKey(vector.name) === key ||
      vectorLookupKey(vector.label.replace(/\\mathbf\s*\{([^}]*)\}/g, "$1").replace(/[{}$\\]/g, "")) === key,
  );
}

function unitVector(vector: Vector2DEntry): [number, number] {
  const length = Math.hypot(vector.components[0], vector.components[1]);
  return length > 1e-9 ? [vector.components[0] / length, vector.components[1] / length] : [1, 0];
}

function shortestAngleDelta(from: number, to: number) {
  let delta = to - from;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
}

function drawSegmentLabel(board: JXG.Board, vector: Vector2DEntry, label: Vector2DSegmentLabel, onMove?: (x: number, y: number) => void) {
  const end = vectorEnd(vector);
  const baseX = vector.start[0] + (end[0] - vector.start[0]) * label.position;
  const baseY = vector.start[1] + (end[1] - vector.start[1]) * label.position;
  const direction = unitVector(vector);
  const offsetX = -direction[1] * label.offsetPx;
  const offsetY = -direction[0] * label.offsetPx;
  const [defaultX, defaultY] = offsetUserByPixels(board, baseX, baseY, offsetX, offsetY);
  const x = Number.isFinite(label.labelX) ? (label.labelX as number) : defaultX;
  const y = Number.isFinite(label.labelY) ? (label.labelY as number) : defaultY;
  createVectorLabelText(board, x, y, label.label, label.color, onMove);
}

function drawRightAngleMarker(board: JXG.Board, marker: Vector2DAngleMarker, first: Vector2DEntry, second: Vector2DEntry) {
  const vertex = first.start;
  const firstUnit = unitVector(first);
  const secondUnit = unitVector(second);
  const radius = marker.radius;
  const p1: [number, number] = [vertex[0] + firstUnit[0] * radius, vertex[1] + firstUnit[1] * radius];
  const p3: [number, number] = [vertex[0] + secondUnit[0] * radius, vertex[1] + secondUnit[1] * radius];
  const p2: [number, number] = [p1[0] + secondUnit[0] * radius, p1[1] + secondUnit[1] * radius];
  const attrs = {
    strokeColor: marker.color,
    highlightStrokeColor: marker.color,
    strokeWidth: 1.6,
    fixed: true,
    highlight: false,
    straightFirst: false,
    straightLast: false,
    withLabel: false,
    layer: GRAPH_LAYERS.vectorGuide,
  } as Record<string, unknown>;
  board.create("segment", [p1, p2], attrs);
  board.create("segment", [p2, p3], attrs);
}

function drawAngleArc(board: JXG.Board, marker: Vector2DAngleMarker, first: Vector2DEntry, second: Vector2DEntry) {
  const vertex = first.start;
  const startAngle = Math.atan2(first.components[1], first.components[0]);
  const delta = shortestAngleDelta(startAngle, Math.atan2(second.components[1], second.components[0]));
  const steps = Math.max(8, Math.ceil(Math.abs(delta) / (Math.PI / 24)));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = startAngle + (delta * index) / steps;
    xs.push(vertex[0] + Math.cos(angle) * marker.radius);
    ys.push(vertex[1] + Math.sin(angle) * marker.radius);
  }
  board.create("curve", [xs, ys], {
    strokeColor: marker.color,
    highlightStrokeColor: marker.color,
    strokeWidth: 1.6,
    fixed: true,
    highlight: false,
    layer: GRAPH_LAYERS.vectorGuide,
  } as Record<string, unknown>);
}

function drawAngleMarker(
  board: JXG.Board,
  vectors: readonly Vector2DEntry[],
  marker: Vector2DAngleMarker,
  onLabelMove?: (x: number, y: number) => void,
) {
  const first = vectorByReference(vectors, marker.from);
  const second = vectorByReference(vectors, marker.to);
  if (!first || !second) return;
  if (marker.rightAngle) drawRightAngleMarker(board, marker, first, second);
  else drawAngleArc(board, marker, first, second);
  if (!marker.label.trim()) return;
  const vertex = first.start;
  const startAngle = Math.atan2(first.components[1], first.components[0]);
  const middleAngle = startAngle + shortestAngleDelta(startAngle, Math.atan2(second.components[1], second.components[0])) / 2;
  const labelRadius = marker.radius * 1.45;
  const labelX = Number.isFinite(marker.labelX) ? (marker.labelX as number) : vertex[0] + Math.cos(middleAngle) * labelRadius;
  const labelY = Number.isFinite(marker.labelY) ? (marker.labelY as number) : vertex[1] + Math.sin(middleAngle) * labelRadius;
  createVectorLabelText(board, labelX, labelY, marker.label, marker.color, onLabelMove);
}

function createVectorLabelText(
  board: JXG.Board,
  x: number,
  y: number,
  latex: string,
  color: string,
  onMove?: (x: number, y: number) => void,
) {
  if (!latex.trim()) return;
  const safeColor = /^#[0-9a-f]{3,8}$/i.test(color) ? color : "#0f172a";
  const labelInteractionCss = ` user-select: none; -webkit-user-select: none; touch-action: none;${onMove ? " cursor: move;" : ""}`;
  const labelCss = `${GRAPH_LABEL_FONT_CSS} color: ${safeColor};${labelInteractionCss}`;
  const text = board.create("text", [x, y, () => renderLatexLabelHtml(latex, safeColor)], {
    fixed: !onMove,
    highlight: false,
    strokeColor: safeColor,
    highlightStrokeColor: safeColor,
    fontSize: GRAPH_LABEL_FONT_SIZE_PT,
    fontUnit: GRAPH_LABEL_FONT_UNIT,
    cssStyle: labelCss,
    highlightCssStyle: labelCss,
    anchorX: "left",
    anchorY: "bottom",
    offset: [8, -8],
    display: "html",
    parse: false,
    layer: GRAPH_LAYERS.vectorLabel,
  } as Record<string, unknown>);

  if (onMove) {
    const draggableText = text as unknown as JXGElement;
    draggableText.isDraggable = true;
    draggableText.rendNode?.style.setProperty("cursor", "move");
    draggableText.rendNode?.style.setProperty("user-select", "none");
    draggableText.rendNode?.style.setProperty("-webkit-user-select", "none");
    draggableText.rendNode?.style.setProperty("touch-action", "none");
    draggableText.on?.("up", () => {
      const coords = textCoordinates(text);
      if (coords) onMove(Number(coords[0].toFixed(6)), Number(coords[1].toFixed(6)));
    });
  }
}

function createAxisLabelText(
  board: JXG.Board,
  x: number,
  y: number,
  latex: string,
  offset: [number, number],
  anchorX: "left" | "middle" | "right",
  anchorY: "top" | "middle" | "bottom",
) {
  const axisLabelCss = `${GRAPH_LABEL_FONT_CSS} color:${AXIS_COLOR}; user-select:none; -webkit-user-select:none; touch-action:none;`;
  board.create("text", [x, y, () => renderLatexLabelHtml(latex, AXIS_COLOR)], {
    fixed: true,
    highlight: false,
    strokeColor: AXIS_COLOR,
    highlightStrokeColor: AXIS_COLOR,
    fontSize: GRAPH_LABEL_FONT_SIZE_PT,
    fontUnit: GRAPH_LABEL_FONT_UNIT,
    cssStyle: axisLabelCss,
    highlightCssStyle: axisLabelCss,
    anchorX,
    anchorY,
    offset,
    display: "html",
    parse: false,
    layer: GRAPH_LAYERS.axisLabel,
  } as Record<string, unknown>);
}

function vector2dMetadataForSave(graphConfig: GraphConfig | undefined | null, vectors: Vector2DEntry[]) {
  const metadata = graphConfig?.metadata ?? {};
  const vectorData =
    typeof metadata.vector2d === "object" && metadata.vector2d !== null ? (metadata.vector2d as Record<string, unknown>) : {};
  return {
    ...metadata,
    vector2d: {
      ...vectorData,
      vectors: vectors.map(({ id, name, label, start, components, color, showComponents, labelX, labelY }) => ({
        id,
        name,
        label,
        start,
        components,
        color,
        showComponents,
        ...(Number.isFinite(labelX) ? { labelX } : {}),
        ...(Number.isFinite(labelY) ? { labelY } : {}),
      })),
    },
  };
}

function vector2dMetadataWithAnnotationLabelPosition(
  graphConfig: GraphConfig | undefined | null,
  collectionKey: "segmentLabels" | "angleMarkers",
  id: string,
  x: number,
  y: number,
) {
  const metadata = graphConfig?.metadata ?? {};
  const vectorData =
    typeof metadata.vector2d === "object" && metadata.vector2d !== null ? (metadata.vector2d as Record<string, unknown>) : {};
  const collection = Array.isArray(vectorData[collectionKey]) ? (vectorData[collectionKey] as unknown[]) : [];
  return {
    ...metadata,
    vector2d: {
      ...vectorData,
      [collectionKey]: collection.map((entry, index) => {
        const record = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
        const fallbackId = `${collectionKey === "segmentLabels" ? "segment-label" : "angle-marker"}-${index + 1}`;
        return String(record.id ?? fallbackId) === id ? { ...record, labelX: x, labelY: y } : record;
      }),
    },
  };
}

export function Vector2DGraph({
  graphConfig,
  onGraphConfigChange,
}: {
  graphConfig?: GraphConfig | null;
  onGraphConfigChange?: (graphConfig: GraphConfig) => void;
}) {
  const boardId = useMemo(() => `jxg-vector-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    const {
      xMin,
      xMax,
      yMin,
      yMax,
      xSpan,
      ySpan,
      xMajorStep,
      yMajorStep,
      xMinorStep,
      yMinorStep,
      xAxisExtension,
      yAxisExtension,
      boardPaddingX,
      boardPaddingY,
    } = vectorGraphSizing(graphConfig);
    const showAxes = graphConfig?.showAxes ?? true;
    const showGrid = graphConfig?.showGrid ?? true;
    const showMajorGrid = graphConfig?.showMajorGrid ?? true;
    const showMinorGrid = graphConfig?.showMinorGrid ?? false;
    const showArrows = graphConfig?.showArrows ?? true;
    const showAxisLabels = graphConfig?.showAxisLabels ?? true;
    const showAxisNumbers = graphConfig?.showAxisNumbers ?? true;
    const gridMajorColor = graphConfig?.gridMajorColor || GRID_MAJOR_COLOR;
    const gridMinorColor = graphConfig?.gridMinorColor || GRID_MINOR_COLOR;
    const displayWidth = graphConfig?.widthPx ?? DEFAULT_GRAPH_WIDTH;
    const displayHeight = graphConfig?.heightPx ?? DEFAULT_GRAPH_HEIGHT;
    const xLabelStep = axisLabelStep({
      graphConfig,
      axis: "x",
      majorStep: xMajorStep,
      span: xSpan,
      padding: boardPaddingX,
      displayPx: displayWidth,
    });
    const yLabelStep = axisLabelStep({
      graphConfig,
      axis: "y",
      majorStep: yMajorStep,
      span: ySpan,
      padding: boardPaddingY,
      displayPx: displayHeight,
    });

    const board = JXG.JSXGraph.initBoard(boardId, {
      boundingbox: vectorBoardBoundingBox(
        xMin - boardPaddingX,
        yMax + boardPaddingY,
        xMax + boardPaddingX,
        yMin - boardPaddingY,
        displayWidth,
        displayHeight,
        graphConfig?.equalScale === true,
      ),
      axis: false,
      grid: false,
      showCopyright: false,
      showNavigation: false,
    } as Record<string, unknown>);

    const vectors = vector2dEntries(graphConfig);
    const annotationData = vector2dAnnotationData(graphConfig);
    const commitVectorLabelPosition = (vectorIndex: number, x: number, y: number) => {
      if (!onGraphConfigChange || !graphConfig) return;
      const nextVectors = vectors.map((vector, index) => (index === vectorIndex ? { ...vector, labelX: x, labelY: y } : vector));
      onGraphConfigChange({
        ...graphConfig,
        metadata: vector2dMetadataForSave(graphConfig, nextVectors),
      });
    };
    const commitAnnotationLabelPosition = (collectionKey: "segmentLabels" | "angleMarkers", id: string, x: number, y: number) => {
      if (!onGraphConfigChange || !graphConfig) return;
      onGraphConfigChange({
        ...graphConfig,
        metadata: vector2dMetadataWithAnnotationLabelPosition(graphConfig, collectionKey, id, x, y),
      });
    };

    if (showGrid) {
      const gridLineAttributes = (major: boolean) =>
        ({
          fixed: true,
          highlight: false,
          straightFirst: false,
          straightLast: false,
          strokeColor: major ? gridMajorColor : gridMinorColor,
          strokeWidth: major ? 1.35 : 0.8,
          dash: major ? 0 : 2,
          layer: GRAPH_LAYERS.grid,
        }) as Record<string, unknown>;

      if (showMinorGrid && xMinorStep < xMajorStep) {
        const lineAttributes = gridLineAttributes(false);
        numericRange(xMin, xMax, xMinorStep).forEach((x) => {
          if (isMultiple(x, xMajorStep)) return;
          board.create(
            "segment",
            [
              [x, yMin],
              [x, yMax],
            ],
            lineAttributes,
          );
        });
      }

      if (showMinorGrid && yMinorStep < yMajorStep) {
        const lineAttributes = gridLineAttributes(false);
        numericRange(yMin, yMax, yMinorStep).forEach((y) => {
          if (isMultiple(y, yMajorStep)) return;
          board.create(
            "segment",
            [
              [xMin, y],
              [xMax, y],
            ],
            lineAttributes,
          );
        });
      }

      if (showMajorGrid) {
        const lineAttributes = gridLineAttributes(true);
        numericRange(xMin, xMax, xMajorStep).forEach((x) => {
          board.create(
            "segment",
            [
              [x, yMin],
              [x, yMax],
            ],
            lineAttributes,
          );
        });
        numericRange(yMin, yMax, yMajorStep).forEach((y) => {
          board.create(
            "segment",
            [
              [xMin, y],
              [xMax, y],
            ],
            lineAttributes,
          );
        });
      }
    }

    if (showAxes) {
      const axisAttributes = {
        fixed: true,
        highlight: false,
        straightFirst: false,
        straightLast: false,
        firstArrow: showArrows ? axisArrowAttributes() : false,
        lastArrow: showArrows ? axisArrowAttributes() : false,
        strokeColor: AXIS_COLOR,
        strokeWidth: AXIS_STROKE_WIDTH,
        layer: GRAPH_LAYERS.axis,
      } as Record<string, unknown>;
      const ticksAttributes = {
        drawLabels: showAxisNumbers,
        drawZero: false,
        majorHeight: showAxisNumbers ? 8 : 0,
        strokeColor: AXIS_COLOR,
        layer: GRAPH_LAYERS.axis,
      };

      board.create(
        "axis",
        [
          [xMin - xAxisExtension, 0],
          [xMax + xAxisExtension, 0],
        ],
        {
          ...axisAttributes,
          name: "",
          withLabel: false,
          ticks: {
            ...ticksAttributes,
            ticksDistance: xLabelStep,
            minorTicks: 0,
            label: {
              anchorX: "middle",
              anchorY: "top",
              offset: [0, X_TICK_LABEL_OFFSET_PX],
              ...graphLabelAttributes(` color:${AXIS_COLOR};`),
              strokeColor: AXIS_COLOR,
              layer: GRAPH_LAYERS.axisLabel,
            },
          },
        } as Record<string, unknown>,
      );
      board.create(
        "axis",
        [
          [0, yMin - yAxisExtension],
          [0, yMax + yAxisExtension],
        ],
        {
          ...axisAttributes,
          name: "",
          withLabel: false,
          ticks: {
            ...ticksAttributes,
            ticksDistance: yLabelStep,
            minorTicks: 0,
            label: {
              anchorX: "right",
              anchorY: "middle",
              offset: [Y_TICK_LABEL_OFFSET_PX, 0],
              ...graphLabelAttributes(` color:${AXIS_COLOR};`),
              strokeColor: AXIS_COLOR,
              layer: GRAPH_LAYERS.axisLabel,
            },
          },
        } as Record<string, unknown>,
      );

      if (showAxisLabels) {
        createAxisLabelText(board, xMax + xAxisExtension, 0, "x", [-10, 8], "middle", "bottom");
        createAxisLabelText(board, 0, yMax + yAxisExtension, "y", [8, -8], "left", "bottom");
      }
    }

    vectors.forEach((vector, vectorIndex) => {
      const end = vectorEnd(vector);
      const elbow: [number, number] = [end[0], vector.start[1]];
      if (vector.showComponents) {
        board.create("segment", [vector.start, elbow], {
          strokeColor: vector.color,
          highlightStrokeColor: vector.color,
          strokeWidth: 1.4,
          dash: 2,
          fixed: true,
          withLabel: false,
          opacity: 0.65,
          layer: GRAPH_LAYERS.vectorGuide,
        });
        board.create("segment", [elbow, end], {
          strokeColor: vector.color,
          highlightStrokeColor: vector.color,
          strokeWidth: 1.4,
          dash: 2,
          fixed: true,
          withLabel: false,
          opacity: 0.65,
          layer: GRAPH_LAYERS.vectorGuide,
        });
      }
      drawVectorArrow(board, vector.start, end, vector.color);
      const labelLatex = vectorLabelLatex(vector);
      if (labelLatex.trim()) {
        const labelX = Number.isFinite(vector.labelX) ? (vector.labelX as number) : vector.start[0] + vector.components[0] * 0.55;
        const labelY = Number.isFinite(vector.labelY) ? (vector.labelY as number) : vector.start[1] + vector.components[1] * 0.55;
        createVectorLabelText(
          board,
          labelX,
          labelY,
          labelLatex,
          vector.color,
          onGraphConfigChange ? (x, y) => commitVectorLabelPosition(vectorIndex, x, y) : undefined,
        );
      }
    });
    annotationData.segmentLabels.forEach((label) => {
      const vector = vectorByReference(vectors, label.vectorId);
      if (vector) {
        drawSegmentLabel(
          board,
          vector,
          label,
          onGraphConfigChange ? (x, y) => commitAnnotationLabelPosition("segmentLabels", label.id, x, y) : undefined,
        );
      }
    });
    annotationData.angleMarkers.forEach((marker) =>
      drawAngleMarker(
        board,
        vectors,
        marker,
        onGraphConfigChange && marker.label.trim() ? (x, y) => commitAnnotationLabelPosition("angleMarkers", marker.id, x, y) : undefined,
      ),
    );
    return () => JXG.JSXGraph.freeBoard(board);
  }, [boardId, graphConfig, onGraphConfigChange]);

  return (
    <div
      id={boardId}
      className="overflow-hidden bg-white"
      style={{
        height: graphConfig?.heightPx ?? DEFAULT_GRAPH_HEIGHT,
        maxWidth: "100%",
        width: graphConfig?.widthPx ?? DEFAULT_GRAPH_WIDTH,
      }}
    />
  );
}
