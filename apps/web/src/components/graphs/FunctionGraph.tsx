import { useEffect, useMemo } from "react";
import type {
  Graph2DGeometryAngle,
  Graph2DGeometryArc,
  Graph2DGeometryData,
  Graph2DGeometryPoint,
  Graph2DGeometrySegment,
  Graph2DPolarGridData,
  GraphConfig,
  GraphFeature,
  GraphFunction,
  GraphFunctionPiece,
  GraphSlopeFieldPoint,
} from "@mauth-studio/shared";
import JXG from "jsxgraph";

import { sampledFunctionCurveSegments } from "@/lib/functionCurveSampling";
import {
  clampDomainToNaturalBoundaries,
  graphFunctionNaturalBoundaries,
  separateRangeFromStrictNaturalBoundaries,
  snapManualDomainToNaturalAsymptotes,
} from "@/lib/graphFunctionDomains";
import { graphAngleMarkerFeaturePoints, lineSegmentFeatureEndpoints } from "@/lib/graphFeatureGeometry";
import { graphAxisArrowVisibility } from "@/lib/diagramGraph2d";
import { renderMathJaxSvg } from "@/lib/mathjax";
import {
  GRAPH_LABEL_FONT_CSS,
  GRAPH_LABEL_FONT_SIZE_PT,
  GRAPH_LABEL_FONT_UNIT,
  graphLabelSourceLatex,
  graphLabelAttributes,
} from "./graphTypography";

interface FunctionGraphProps {
  graphConfig?: GraphConfig | null;
  previewAnchor?: string;
  solutionColor?: string;
  solutionFeatureColor?: string;
  solutionFunctionColor?: string;
  onGraphConfigChange?: (graphConfig: GraphConfig) => void;
  onGraphConfigPatch?: (patch: Partial<GraphConfig>) => void;
}

function skipSpaces(expression: string, index: number) {
  let cursor = index;
  while (cursor < expression.length && /\s/.test(expression[cursor])) cursor += 1;
  return cursor;
}

function matchingParenthesisEnd(expression: string, startIndex: number) {
  let depth = 0;
  for (let index = startIndex; index < expression.length; index += 1) {
    if (expression[index] === "(") depth += 1;
    if (expression[index] === ")") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return startIndex + 1;
}

function readIdentifierOrNumberEnd(expression: string, startIndex: number) {
  let cursor = startIndex;
  while (cursor < expression.length && /[A-Za-z0-9_.]/.test(expression[cursor])) cursor += 1;
  cursor = skipSpaces(expression, cursor);
  if (expression[cursor] === "(") return matchingParenthesisEnd(expression, cursor);
  return cursor;
}

function readPowerTermEnd(expression: string, startIndex: number) {
  let cursor = skipSpaces(expression, startIndex);
  if (expression[cursor] === "+" || expression[cursor] === "-") cursor = skipSpaces(expression, cursor + 1);
  if (expression[cursor] === "(") return matchingParenthesisEnd(expression, cursor);
  return readIdentifierOrNumberEnd(expression, cursor);
}

function isUnaryMinusContext(expression: string, index: number) {
  const previous = expression.slice(0, index).trimEnd().at(-1);
  return !previous || "+-*/,(=".includes(previous);
}

function normalizeUnaryMinusBeforePowers(expression: string) {
  let normalized = expression;
  let index = 0;

  while (index < normalized.length) {
    if (normalized[index] !== "-" || !isUnaryMinusContext(normalized, index)) {
      index += 1;
      continue;
    }

    const baseStart = skipSpaces(normalized, index + 1);
    const baseEnd = readPowerTermEnd(normalized, baseStart);
    const operatorStart = skipSpaces(normalized, baseEnd);
    if (normalized.slice(operatorStart, operatorStart + 2) !== "**") {
      index += 1;
      continue;
    }

    const exponentStart = skipSpaces(normalized, operatorStart + 2);
    const exponentEnd = readPowerTermEnd(normalized, exponentStart);
    const base = normalized.slice(baseStart, baseEnd);
    const exponent = normalized.slice(exponentStart, exponentEnd);
    const replacement = `-(${base}**${exponent})`;
    normalized = `${normalized.slice(0, index)}${replacement}${normalized.slice(exponentEnd)}`;
    index += replacement.length;
  }

  return normalized;
}

function normalizeImplicitXYMultiplication(expression: string) {
  let normalized = "";

  const nonWhitespaceAfter = (index: number) => {
    let cursor = index + 1;
    while (cursor < expression.length && /\s/.test(expression[cursor])) cursor += 1;
    return cursor < expression.length ? cursor : -1;
  };
  const isIdentifierLetter = (value: string | undefined) => Boolean(value && /[A-Za-z_.]/.test(value));
  const isXYVariable = (index: number) => {
    const value = expression[index]?.toLowerCase();
    if (value !== "x" && value !== "y") return false;
    const previous = expression[index - 1];
    const next = expression[index + 1];
    if (isIdentifierLetter(previous) && previous.toLowerCase() !== "x" && previous.toLowerCase() !== "y") return false;
    if (isIdentifierLetter(next) && next.toLowerCase() !== "x" && next.toLowerCase() !== "y") return false;
    return true;
  };

  for (let index = 0; index < expression.length; index += 1) {
    normalized += expression[index];
    const nextIndex = nonWhitespaceAfter(index);
    if (nextIndex === -1) continue;
    const current = expression[index];
    const next = expression[nextIndex];
    const leftFactor = /\d/.test(current) || current === ")" || isXYVariable(index);
    const rightFactor = next === "(" || isXYVariable(nextIndex) || (/\d/.test(next) && (current === ")" || isXYVariable(index)));
    if (leftFactor && rightFactor) normalized += "*";
  }

  return normalized;
}

function toJavaScriptExpression(expression: string) {
  const jsExpression = normalizeImplicitXYMultiplication(expression)
    .replace(/\*\*/g, "^")
    .replace(/\^/g, "**")
    .replace(/\bpi\b/gi, "Math.PI")
    .replace(/\be\b/g, "Math.E")
    .replace(/\bln\(/gi, "Math.log(")
    .replace(/\blog10\(/gi, "Math.log10(")
    .replace(/\b(sin|cos|tan|asin|acos|atan|sqrt|abs|log|exp)\(/g, "Math.$1(");

  return normalizeUnaryMinusBeforePowers(jsExpression);
}

const FUNCTION_COLORS = ["#0f766e", "#b45309", "#2563eb", "#7c3aed", "#be123c"];
const DEFAULT_GRAPH_FUNCTION_STROKE_WIDTH = 2.5;
const GRID_MAJOR_COLOR = "#b9b9b9";
const GRID_MINOR_COLOR = "#dddddd";
const AXIS_COLOR = "#000000";
const DEFAULT_GRAPH_WIDTH = 680;
const DEFAULT_GRAPH_HEIGHT = 300;
const BOARD_EDGE_PADDING_RATIO = 0.022;
const BOARD_EDGE_PADDING_MIN_UNITS = 0.22;
const AXIS_LABEL_EDGE_PADDING_RATIO = 0.018;
const AXIS_LABEL_EDGE_PADDING_MIN_UNITS = 0.32;
const ARROW_SCAN_STEPS = 180;
const AXIS_ARROW_SIZE = 4;
const AXIS_STROKE_WIDTH = 2;
const AXIS_TEXT_FONT_SIZE = GRAPH_LABEL_FONT_SIZE_PT;
const X_TICK_LABEL_OFFSET_PX = -18;
const Y_TICK_LABEL_OFFSET_PX = -10;
const FUNCTION_ARROW_LENGTH_PX = 9;
const FUNCTION_ARROW_HALF_WIDTH_PX = 4.5;
const FUNCTION_ARROW_SAMPLE_RATIOS = [0.002, 0.005, 0.01, 0.02];
const GRAPH_LAYERS = {
  grid: 1,
  axis: 3,
  featureFill: 6,
  slopeField: 7,
  function: 8,
  point: 9,
  functionArrow: 10,
  axisLabel: 11,
  featureLabel: 12,
};
const X_EPSILON = 1e-7;
const PASSIVE_GRAPH_DECORATION_CSS = "pointer-events:none;user-select:none;-webkit-user-select:none;touch-action:none;";

interface FunctionArrowGeometry {
  tip: [number, number];
  baseCenter: [number, number];
  baseLeft: [number, number];
  baseRight: [number, number];
}

interface IntervalPiece {
  expression: string;
  xStart: number;
  xEnd: number;
  includeStart: boolean;
  includeEnd: boolean;
  isPiecewise: boolean;
  isManualDomain: boolean;
}

type GraphPoint = [number, number];

interface PointDragResult {
  x: number;
  y: number;
  value?: number | null;
}

type JXGElement = {
  X?: () => number;
  Y?: () => number;
  moveTo?: (coords: [number, number], time?: number) => void;
  on?: (event: string, callback: () => void) => void;
  coords?: { usrCoords?: number[] };
  isDraggable?: boolean;
  rendNode?: HTMLElement;
};
type NativeRegionElement = unknown;

interface SlopeFieldSpec {
  expression: string;
  xValues?: number[];
  yValues?: number[];
  xRange?: [number, number];
  yRange?: [number, number];
  xStep?: number;
  yStep?: number;
  segmentLength?: number;
  color?: string;
  strokeWidth?: number;
  points?: GraphSlopeFieldPoint[];
  highlightedPoints?: GraphSlopeFieldPoint[];
}

interface PolarGridSpec {
  center: [number, number];
  radii: number[];
  angleLinesDeg: number[];
  radius: number;
  color?: string;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed";
}

function graphFunctions(graphConfig?: GraphConfig | null): GraphFunction[] {
  if (!graphConfig) return [];
  if (Array.isArray(graphConfig.functions)) return graphConfig.functions;
  if (!graphConfig.expression) return [];
  return [
    {
      expression: graphConfig.expression,
      latex: graphConfig.latex,
      label: "f",
      color: FUNCTION_COLORS[0],
      strokeWidth: DEFAULT_GRAPH_FUNCTION_STROKE_WIDTH,
      strokeStyle: "solid",
      show: true,
    },
  ];
}

function shouldShowGraphItem(item: { show?: boolean }) {
  return item.show !== false;
}

function graphFeatures(graphConfig?: GraphConfig | null): GraphFeature[] {
  return graphConfig?.features ?? [];
}

function graphDataRecord(graphConfig?: GraphConfig | null): Record<string, unknown> {
  return graphConfig?.data && typeof graphConfig.data === "object" && !Array.isArray(graphConfig.data)
    ? (graphConfig.data as Record<string, unknown>)
    : {};
}

function isBaseRegionFeature(feature?: GraphFeature) {
  return feature?.kind === "region_between_curves" || feature?.kind === "region_curve_axis";
}

function resolvedBaseRegionIndex(features: GraphFeature[], clippedFeature: GraphFeature, clippedFeatureIndex: number) {
  const requestedIndex = clippedFeature.baseFeatureIndex;
  if (typeof requestedIndex === "number" && requestedIndex !== clippedFeatureIndex && isBaseRegionFeature(features[requestedIndex])) {
    return requestedIndex;
  }

  const fallbackIndex = features.findIndex((candidate, index) => index !== clippedFeatureIndex && isBaseRegionFeature(candidate));
  return fallbackIndex >= 0 ? fallbackIndex : null;
}

function clippedRegionBaseIndexes(features: GraphFeature[]) {
  const indexes = new Set<number>();
  features.forEach((feature, index) => {
    if (feature.kind !== "region_clipped_by_curve" || !shouldShowGraphItem(feature)) return;
    const baseIndex = resolvedBaseRegionIndex(features, feature, index);
    if (baseIndex !== null) indexes.add(baseIndex);
  });
  return indexes;
}

function lineDash(style?: "none" | "solid" | "dashed") {
  return style === "dashed" ? 2 : 0;
}

function lineWeight(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && value && value > 0 ? value : fallback;
}

const ROUNDED_GRAPH_STROKE = {
  lineCap: "round",
  lineJoin: "round",
} as const;

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

function createEvaluator(expression: string) {
  const jsExpression = toJavaScriptExpression(expression);
  return new Function("x", `"use strict"; return (${jsExpression});`) as (x: number) => number;
}

function singleEqualsIndex(expression: string) {
  for (let index = 0; index < expression.length; index += 1) {
    if (expression[index] !== "=") continue;
    const previous = expression[index - 1];
    const next = expression[index + 1];
    if (previous === "<" || previous === ">" || previous === "!" || previous === "=" || next === "=") continue;
    return index;
  }
  return -1;
}

function relationExpressionToZero(expression: string) {
  const equalsIndex = singleEqualsIndex(expression);
  if (equalsIndex === -1) return expression;

  const left = expression.slice(0, equalsIndex).trim();
  const right = expression.slice(equalsIndex + 1).trim();
  if (!left || !right) return expression;
  return `(${left}) - (${right})`;
}

function createImplicitEvaluator(expression: string) {
  const jsExpression = toJavaScriptExpression(relationExpressionToZero(expression));
  const evaluator = new Function("x", "y", `"use strict"; return (${jsExpression});`) as (x: number, y: number) => number;
  return (x: number, y: number) => {
    try {
      const value = evaluator(x, y);
      return Number.isFinite(value) ? value : NaN;
    } catch {
      return NaN;
    }
  };
}

function slopeFieldExpression(expression: string) {
  const equalsIndex = singleEqualsIndex(expression);
  if (equalsIndex !== -1) return expression.slice(equalsIndex + 1).trim();
  return expression.trim();
}

function createSlopeFieldEvaluator(expression: string) {
  const jsExpression = toJavaScriptExpression(slopeFieldExpression(expression));
  const evaluator = new Function("x", "y", `"use strict"; return (${jsExpression});`) as (x: number, y: number) => number;
  return (x: number, y: number) => {
    try {
      const value = evaluator(x, y);
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  };
}

function finiteNumberFromUnknown(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberTuple(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const left = finiteNumberFromUnknown(value[0]);
  const right = finiteNumberFromUnknown(value[1]);
  if (left === null || right === null || left === right) return undefined;
  return left < right ? [left, right] : [right, left];
}

function pointTuple(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const x = finiteNumberFromUnknown(value[0]);
  const y = finiteNumberFromUnknown(value[1]);
  return x === null || y === null ? undefined : [x, y];
}

function numberList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : undefined;
}

function slopeFieldPoint(value: unknown): GraphSlopeFieldPoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const x = finiteNumberFromUnknown(record.x);
  const y = finiteNumberFromUnknown(record.y);
  if (x === null || y === null) return null;
  return {
    x,
    y,
    ...(finiteNumberFromUnknown(record.slope) !== null ? { slope: finiteNumberFromUnknown(record.slope) as number } : {}),
    ...(typeof record.label === "string" ? { label: record.label } : {}),
    ...(typeof record.color === "string" ? { color: record.color } : {}),
    ...(typeof record.show === "boolean" ? { show: record.show } : {}),
  };
}

function slopeFieldSpec(graphConfig: GraphConfig): SlopeFieldSpec | null {
  const data = graphDataRecord(graphConfig);
  const raw = data.slopeField;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.show === false) return null;
  const expression =
    typeof record.expression === "string" && record.expression.trim()
      ? record.expression.trim()
      : typeof record.differentialEquation === "string" && record.differentialEquation.trim()
        ? record.differentialEquation.trim()
        : "";
  if (!expression) return null;
  return {
    expression,
    xValues: numberList(record.xValues),
    yValues: numberList(record.yValues),
    xRange: numberTuple(record.xRange),
    yRange: numberTuple(record.yRange),
    xStep: finiteNumberFromUnknown(record.xStep) ?? undefined,
    yStep: finiteNumberFromUnknown(record.yStep) ?? undefined,
    segmentLength: finiteNumberFromUnknown(record.segmentLength) ?? undefined,
    color: typeof record.color === "string" ? record.color : undefined,
    strokeWidth: finiteNumberFromUnknown(record.strokeWidth) ?? undefined,
    points: Array.isArray(record.points) ? record.points.flatMap((point) => slopeFieldPoint(point) ?? []) : undefined,
    highlightedPoints: Array.isArray(record.highlightedPoints)
      ? record.highlightedPoints.flatMap((point) => slopeFieldPoint(point) ?? [])
      : undefined,
  };
}

function polarGridSpec(graphConfig: GraphConfig): PolarGridSpec | null {
  const data = graphDataRecord(graphConfig);
  const raw = data.polarGrid;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Graph2DPolarGridData & Record<string, unknown>;
  if (record.show === false) return null;
  const centerTuple = pointTuple(record.center);
  const radii = (numberList(record.radii) ?? []).filter((radius) => radius > 0);
  const angleLinesDeg = numberList(record.angleLinesDeg) ?? numberList(record.anglesDeg) ?? [];
  const angleLinesRad = numberList(record.angleLinesRad);
  const convertedAngles = angleLinesRad?.map((angle) => (angle * 180) / Math.PI) ?? [];
  const radius = finiteNumberFromUnknown(record.radius) ?? Math.max(0, ...radii);
  if (!radii.length && !angleLinesDeg.length && !convertedAngles.length) return null;
  return {
    center: centerTuple ?? [0, 0],
    radii,
    angleLinesDeg: [...angleLinesDeg, ...convertedAngles],
    radius: radius > 0 ? radius : Math.max(1, ...radii),
    color: typeof record.color === "string" ? record.color : undefined,
    strokeWidth: finiteNumberFromUnknown(record.strokeWidth) ?? undefined,
    strokeStyle: record.strokeStyle === "dashed" || record.strokeStyle === "solid" ? record.strokeStyle : undefined,
  };
}

function normalizedAngleLineDegrees(values: number[]) {
  const seen = new Set<number>();
  return values.flatMap((value) => {
    if (!Number.isFinite(value)) return [];
    const normalized = ((value % 180) + 180) % 180;
    const key = Math.round(normalized * 1000);
    if (seen.has(key)) return [];
    seen.add(key);
    return normalized;
  });
}

function finiteValue(evaluator: (x: number) => number, x: number) {
  try {
    const value = evaluator(x);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function graphSpan(min: number, max: number) {
  const span = max - min;
  return Number.isFinite(span) && span > 0 ? span : 1;
}

function majorGridStep(step: number | undefined, fallback: number | undefined, defaultValue: number) {
  const candidate = step ?? fallback ?? defaultValue;
  return Number.isFinite(candidate) && candidate > 0 ? candidate : defaultValue;
}

function minorGridStep(step: number | undefined, fallback: number | undefined, defaultValue: number) {
  const candidate = step ?? fallback ?? defaultValue;
  return Number.isFinite(candidate) && candidate > 0 ? candidate : null;
}

function positiveNumber(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && value && value > 0 ? value : fallback;
}

function axisLabelStep({ graphConfig, axis, majorStep }: { graphConfig: GraphConfig; axis: "x" | "y"; majorStep: number }) {
  const manualStep = axis === "x" ? graphConfig.axisLabelStepX : graphConfig.axisLabelStepY;
  if ((graphConfig.axisLabelIntervalMode ?? "auto") === "manual") {
    return positiveNumber(manualStep, majorStep);
  }

  return positiveNumber(majorStep, 1);
}

function boardEdgePadding(span: number) {
  return Math.max(span * BOARD_EDGE_PADDING_RATIO, BOARD_EDGE_PADDING_MIN_UNITS);
}

function axisLabelEdgePadding(span: number) {
  return Math.max(span * AXIS_LABEL_EDGE_PADDING_RATIO, AXIS_LABEL_EDGE_PADDING_MIN_UNITS);
}

function graphFunctionDomain(graphFunction: GraphFunction, graphConfig: GraphConfig) {
  const xMin = graphConfig.xMin ?? -10;
  const xMax = graphConfig.xMax ?? 10;
  if ((graphFunction.domainMode ?? "auto") !== "manual") {
    return { ...clampDomainToNaturalBoundaries(graphFunction.expression, { xStart: xMin, xEnd: xMax }, graphConfig), isManual: false };
  }

  const xStart = Number.isFinite(graphFunction.domainMin) ? (graphFunction.domainMin as number) : xMin;
  const xEnd = Number.isFinite(graphFunction.domainMax) ? (graphFunction.domainMax as number) : xMax;
  const gridClippedDomain = { xStart: Math.max(xMin, xStart), xEnd: Math.min(xMax, xEnd) };
  const snappedDomain = snapManualDomainToNaturalAsymptotes(graphFunction.expression, gridClippedDomain, graphConfig);
  return { ...clampDomainToNaturalBoundaries(graphFunction.expression, snappedDomain, graphConfig), isManual: true };
}

function graphBoardSizing(graphConfig: GraphConfig) {
  const xMin = graphConfig.xMin ?? -10;
  const xMax = graphConfig.xMax ?? 10;
  const yMin = graphConfig.yMin ?? -10;
  const yMax = graphConfig.yMax ?? 10;
  const xSpan = graphSpan(xMin, xMax);
  const ySpan = graphSpan(yMin, yMax);
  const showAxes = graphConfig.showAxes ?? true;
  const showAxisLabels = graphConfig.showAxisLabels ?? true;
  const xMajorStep = majorGridStep(graphConfig.gridMajorStepX, graphConfig.gridMajorStep, 1);
  const yMajorStep = majorGridStep(graphConfig.gridMajorStepY, graphConfig.gridMajorStep, 1);
  const xMinorStep = minorGridStep(graphConfig.gridMinorStepX, graphConfig.gridMinorStep, 0.5);
  const yMinorStep = minorGridStep(graphConfig.gridMinorStepY, graphConfig.gridMinorStep, 0.5);
  const xAxisExtension = 0;
  const yAxisExtension = 0;
  const axisLabelPaddingX = showAxes && showAxisLabels ? axisLabelEdgePadding(xSpan) : 0;
  const axisLabelPaddingY = showAxes && showAxisLabels ? axisLabelEdgePadding(ySpan) : 0;
  const boardPaddingX = Math.max(xAxisExtension + boardEdgePadding(xSpan) + axisLabelPaddingX, xSpan * 0.015);
  const boardPaddingY = Math.max(yAxisExtension + boardEdgePadding(ySpan) + axisLabelPaddingY, ySpan * 0.015);

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

function slopeFieldAxisValues(
  explicitValues: number[] | undefined,
  range: [number, number] | undefined,
  step: number | undefined,
  fallbackMin: number,
  fallbackMax: number,
  fallbackStep: number,
) {
  if (explicitValues?.length) return explicitValues;
  const [min, max] = range ?? [fallbackMin, fallbackMax];
  const spacing = Number.isFinite(step) && step && step > 0 ? step : fallbackStep;
  return numericRange(min, max, spacing);
}

function slopeFieldSegmentEndpoints(x: number, y: number, slope: number, length: number): [[number, number], [number, number]] | null {
  if (!Number.isFinite(slope)) return null;
  if (Math.abs(slope) > 1e6) {
    const halfLength = length / 2;
    return [
      [x, y - halfLength],
      [x, y + halfLength],
    ];
  }
  const scale = length / (2 * Math.sqrt(1 + slope * slope));
  const dx = scale;
  const dy = slope * scale;
  return [
    [x - dx, y - dy],
    [x + dx, y + dy],
  ];
}

function drawSlopeFieldSegment(
  board: JXG.Board,
  x: number,
  y: number,
  slope: number | null,
  length: number,
  attributes: Record<string, unknown>,
) {
  if (slope === null) return;
  const endpoints = slopeFieldSegmentEndpoints(x, y, slope, length);
  if (!endpoints) return;
  board.create("segment", endpoints, attributes);
}

function renderSlopeField(
  board: JXG.Board,
  graphConfig: GraphConfig,
  xMajorStep: number,
  yMajorStep: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
) {
  const field = slopeFieldSpec(graphConfig);
  if (!field) return;
  let evaluator: (x: number, y: number) => number | null;
  try {
    evaluator = createSlopeFieldEvaluator(field.expression);
  } catch {
    return;
  }

  const xStep = Number.isFinite(field.xStep) && field.xStep && field.xStep > 0 ? field.xStep : xMajorStep;
  const yStep = Number.isFinite(field.yStep) && field.yStep && field.yStep > 0 ? field.yStep : yMajorStep;
  const xValues = slopeFieldAxisValues(field.xValues, field.xRange, field.xStep, xMin, xMax, xStep);
  const yValues = slopeFieldAxisValues(field.yValues, field.yRange, field.yStep, yMin, yMax, yStep);
  const segmentLength =
    Number.isFinite(field.segmentLength) && field.segmentLength && field.segmentLength > 0
      ? field.segmentLength
      : Math.max(0.18, Math.min(xStep, yStep) * 0.55);
  const baseAttributes = {
    fixed: true,
    highlight: false,
    straightFirst: false,
    straightLast: false,
    strokeColor: field.color ?? "#475569",
    strokeWidth: field.strokeWidth ?? 1.6,
    layer: GRAPH_LAYERS.slopeField,
    ...ROUNDED_GRAPH_STROKE,
  } as Record<string, unknown>;

  let rendered = 0;
  const maxSegments = 420;
  for (const x of xValues) {
    for (const y of yValues) {
      if (rendered >= maxSegments) break;
      drawSlopeFieldSegment(board, x, y, evaluator(x, y), segmentLength, baseAttributes);
      rendered += 1;
    }
  }

  const explicitPoints = [...(field.points ?? []), ...(field.highlightedPoints ?? [])].filter((point) => point.show !== false);
  explicitPoints.forEach((point, index) => {
    const color = point.color ?? (index >= (field.points?.length ?? 0) ? "#be123c" : (field.color ?? "#475569"));
    drawSlopeFieldSegment(board, point.x, point.y, point.slope ?? evaluator(point.x, point.y), segmentLength * 1.15, {
      ...baseAttributes,
      strokeColor: color,
      strokeWidth: Math.max(2.2, Number(field.strokeWidth ?? 1.6) + 0.8),
      layer: GRAPH_LAYERS.point,
    });
    board.create("point", [point.x, point.y], {
      fixed: true,
      withLabel: false,
      size: 2,
      fillColor: color,
      strokeColor: color,
      highlight: false,
      layer: GRAPH_LAYERS.point,
    } as Record<string, unknown>);
    if (point.label?.trim()) {
      createLabelText(board, point.x, point.y, point.label, color);
    }
  });
}

function renderPolarGrid(board: JXG.Board, graphConfig: GraphConfig) {
  const grid = polarGridSpec(graphConfig);
  if (!grid) return;

  const [centerX, centerY] = grid.center;
  const attributes = {
    fixed: true,
    highlight: false,
    strokeColor: grid.color ?? "#d9d9d9",
    strokeWidth: grid.strokeWidth ?? 1,
    dash: lineDash(grid.strokeStyle),
    layer: GRAPH_LAYERS.grid,
  } as Record<string, unknown>;

  grid.radii.forEach((radius) => {
    board.create(
      "curve",
      [(t: number) => centerX + radius * Math.cos(t), (t: number) => centerY + radius * Math.sin(t), 0, 2 * Math.PI],
      attributes,
    );
  });

  normalizedAngleLineDegrees(grid.angleLinesDeg).forEach((angleDeg) => {
    const angleRad = (angleDeg * Math.PI) / 180;
    const dx = grid.radius * Math.cos(angleRad);
    const dy = grid.radius * Math.sin(angleRad);
    board.create(
      "segment",
      [
        [centerX - dx, centerY - dy],
        [centerX + dx, centerY + dy],
      ],
      {
        ...attributes,
        straightFirst: false,
        straightLast: false,
      },
    );
  });
}

export function graphDisplayHeight(graphConfig?: GraphConfig | null) {
  return graphConfig?.heightPx ?? DEFAULT_GRAPH_HEIGHT;
}

function functionBoardBoundingBox(
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

function sameX(left: number, right: number) {
  return Math.abs(left - right) < X_EPSILON;
}

function yInView(y: number, yMin: number, yMax: number) {
  return y >= yMin && y <= yMax;
}

function visibleBoundaryTargetY(outsideY: number | null, insideY: number | null, yMin: number, yMax: number) {
  if (outsideY === null || insideY === null) return null;
  if (outsideY < yMin && insideY >= yMin) return yMin;
  if (outsideY > yMax && insideY <= yMax) return yMax;
  return null;
}

function intervalPieces(graphFunction: GraphFunction, graphConfig: GraphConfig): IntervalPiece[] {
  const gridXMin = graphConfig.xMin ?? -10;
  const gridXMax = graphConfig.xMax ?? 10;
  if (graphFunction.kind === "piecewise" && graphFunction.pieces?.length) {
    return graphFunction.pieces.map((piece: GraphFunctionPiece) => {
      const domain = clampDomainToNaturalBoundaries(
        piece.expression,
        {
          xStart: Math.max(gridXMin, piece.xMin ?? gridXMin),
          xEnd: Math.min(gridXMax, piece.xMax ?? gridXMax),
        },
        graphConfig,
      );
      return {
        expression: piece.expression,
        xStart: domain.xStart,
        xEnd: domain.xEnd,
        includeStart: piece.includeStart ?? true,
        includeEnd: piece.includeEnd ?? true,
        isPiecewise: true,
        isManualDomain: false,
      };
    });
  }

  const domain = graphFunctionDomain(graphFunction, graphConfig);
  return [
    {
      expression: graphFunction.expression,
      xStart: domain.xStart,
      xEnd: domain.xEnd,
      includeStart: false,
      includeEnd: false,
      isPiecewise: false,
      isManualDomain: domain.isManual,
    },
  ];
}

function createEndpointMarker(board: JXG.Board, evaluator: (x: number) => number, x: number, includePoint: boolean, color: string) {
  const y = finiteValue(evaluator, x);
  if (y === null) return;
  board.create("point", [x, y], {
    fixed: true,
    showInfobox: false,
    withLabel: false,
    size: 3,
    strokeColor: color,
    fillColor: includePoint ? color : "#ffffff",
    strokeWidth: 2,
    layer: GRAPH_LAYERS.point,
  });
}

function refineVisibleBoundary(evaluator: (x: number) => number, outsideX: number, insideX: number, yMin: number, yMax: number) {
  let outside = outsideX;
  let inside = insideX;
  const targetY = visibleBoundaryTargetY(finiteValue(evaluator, outsideX), finiteValue(evaluator, insideX), yMin, yMax);

  if (targetY !== null) {
    for (let index = 0; index < 26; index += 1) {
      const midpoint = (outside + inside) / 2;
      const y = finiteValue(evaluator, midpoint);
      if (y === null) {
        outside = midpoint;
        continue;
      }
      const outsideSide = targetY === yMin ? y < yMin : y > yMax;
      if (outsideSide) {
        outside = midpoint;
      } else {
        inside = midpoint;
      }
    }
    return inside;
  }

  for (let index = 0; index < 18; index += 1) {
    const midpoint = (outside + inside) / 2;
    const y = finiteValue(evaluator, midpoint);
    if (y !== null && yInView(y, yMin, yMax)) {
      inside = midpoint;
    } else {
      outside = midpoint;
    }
  }
  return inside;
}

function findVisibleBoundaryX(
  evaluator: (x: number) => number,
  xStart: number,
  xEnd: number,
  side: "start" | "end",
  yMin: number,
  yMax: number,
) {
  if (xEnd <= xStart) return null;

  const direction = side === "start" ? 1 : -1;
  const scanStart = side === "start" ? xStart : xEnd;
  const step = (xEnd - xStart) / ARROW_SCAN_STEPS;
  let previousX = scanStart;

  for (let endpointIndex = 0; endpointIndex <= ARROW_SCAN_STEPS; endpointIndex += 1) {
    const endpointX = scanStart + direction * step * endpointIndex;
    const endpointY = finiteValue(evaluator, endpointX);
    if (endpointY !== null && yInView(endpointY, yMin, yMax)) {
      return endpointIndex === 0 ? endpointX : refineVisibleBoundary(evaluator, previousX, endpointX, yMin, yMax);
    }
    previousX = endpointX;
  }

  return null;
}

function visiblePlotRange(evaluator: (x: number) => number, xStart: number, xEnd: number, yMin: number, yMax: number) {
  const visibleStart = findVisibleBoundaryX(evaluator, xStart, xEnd, "start", yMin, yMax);
  const visibleEnd = findVisibleBoundaryX(evaluator, xStart, xEnd, "end", yMin, yMax);
  if (visibleStart === null || visibleEnd === null || visibleEnd <= visibleStart) return null;
  return { xStart: visibleStart, xEnd: visibleEnd };
}

function defaultXAxisLabelPosition(xMax: number, xAxisExtension: number): [number, number] {
  return [xMax + xAxisExtension, 0];
}

function defaultYAxisLabelPosition(yMax: number, yAxisExtension: number): [number, number] {
  return [0, yMax + yAxisExtension];
}

function axisArrowAttributes() {
  return { type: 1, size: AXIS_ARROW_SIZE, highlightSize: AXIS_ARROW_SIZE };
}

function boardUnit(board: JXG.Board, axis: "x" | "y") {
  const unit = (board as JXG.Board & { unitX?: number; unitY?: number })[axis === "x" ? "unitX" : "unitY"];
  return typeof unit === "number" && Number.isFinite(unit) && unit > 0 ? unit : 1;
}

function offsetUserByPixels(board: JXG.Board, x: number, y: number, dxPx: number, dyPx: number): [number, number] {
  return [x + dxPx / boardUnit(board, "x"), y - dyPx / boardUnit(board, "y")];
}

function functionArrowGeometry(
  board: JXG.Board,
  evaluator: (x: number) => number,
  tipX: number,
  side: "start" | "end",
  xStart: number,
  xEnd: number,
): FunctionArrowGeometry | null {
  const tipY = finiteValue(evaluator, tipX);
  if (tipY === null) return null;

  const inwardDirection = side === "start" ? 1 : -1;
  const span = graphSpan(xStart, xEnd);
  let directionX = side === "start" ? -1 : 1;
  let directionY = 0;

  for (const ratio of FUNCTION_ARROW_SAMPLE_RATIOS) {
    const sampleX = Math.min(xEnd, Math.max(xStart, tipX + inwardDirection * span * ratio));
    if (sameX(sampleX, tipX)) continue;
    const sampleY = finiteValue(evaluator, sampleX);
    if (sampleY === null) continue;

    const vx = (tipX - sampleX) * boardUnit(board, "x");
    const vy = -(tipY - sampleY) * boardUnit(board, "y");
    const length = Math.hypot(vx, vy);
    if (length > 0.001) {
      directionX = vx / length;
      directionY = vy / length;
      break;
    }
  }

  const baseCenter = offsetUserByPixels(board, tipX, tipY, -directionX * FUNCTION_ARROW_LENGTH_PX, -directionY * FUNCTION_ARROW_LENGTH_PX);
  const perpendicularX = -directionY;
  const perpendicularY = directionX;
  const baseLeft = offsetUserByPixels(
    board,
    baseCenter[0],
    baseCenter[1],
    perpendicularX * FUNCTION_ARROW_HALF_WIDTH_PX,
    perpendicularY * FUNCTION_ARROW_HALF_WIDTH_PX,
  );
  const baseRight = offsetUserByPixels(
    board,
    baseCenter[0],
    baseCenter[1],
    -perpendicularX * FUNCTION_ARROW_HALF_WIDTH_PX,
    -perpendicularY * FUNCTION_ARROW_HALF_WIDTH_PX,
  );
  return {
    tip: [tipX, tipY],
    baseCenter,
    baseLeft,
    baseRight,
  };
}

function createFunctionArrowhead(board: JXG.Board, geometry: FunctionArrowGeometry, color: string) {
  board.create("polygon", [geometry.tip, geometry.baseLeft, geometry.baseRight], {
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
    layer: GRAPH_LAYERS.functionArrow,
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

function verticalLineSegmentX(feature: GraphFeature) {
  if (feature.kind !== "line_segment") return null;
  const x1 = Number.isFinite(feature.x1) ? (feature.x1 as number) : null;
  const x2 = Number.isFinite(feature.x2) ? (feature.x2 as number) : null;
  if (x1 === null || x2 === null || Math.abs(x1 - x2) > X_EPSILON) return null;
  return (x1 + x2) / 2;
}

function strictNaturalVerticalAsymptoteXs(functions: GraphFunction[]) {
  return functions
    .filter(shouldShowGraphItem)
    .flatMap((graphFunction) => {
      if (graphFunction.kind === "piecewise" && graphFunction.pieces?.length) {
        return graphFunction.pieces.flatMap((piece) => graphFunctionNaturalBoundaries(piece.expression ?? ""));
      }
      return graphFunctionNaturalBoundaries(graphFunction.expression ?? "");
    })
    .filter((boundary) => boundary.strict)
    .map((boundary) => boundary.boundary)
    .filter((boundary) => Number.isFinite(boundary));
}

function featureWithAutoNaturalAsymptoteSpan(feature: GraphFeature, graphConfig: GraphConfig, functions: GraphFunction[]) {
  if (feature.kind !== "line_segment" || feature.span === "grid") return feature;
  const verticalX = verticalLineSegmentX(feature);
  if (verticalX === null) return feature;
  const xSpan = graphSpan(graphConfig.xMin ?? -10, graphConfig.xMax ?? 10);
  const tolerance = Math.max(xSpan * 1e-6, 1e-6);
  if (!strictNaturalVerticalAsymptoteXs(functions).some((boundary) => Math.abs(boundary - verticalX) <= tolerance)) return feature;
  return { ...feature, span: "grid" as const };
}

function expressionToLatex(expression?: string) {
  return (expression ?? "")
    .trim()
    .replace(/\*\*/g, "^")
    .replace(/(\d)\s*\*\s*([a-zA-Z])/g, "$1$2")
    .replace(/([a-zA-Z])\s*\*\s*(\d)/g, "$1\\cdot $2")
    .replace(/\*/g, "\\cdot ")
    .replace(/\s+/g, " ");
}

function graphFunctionLabel(index: number) {
  return ["f", "g", "h", "p", "q"][index] ?? `f_${index + 1}`;
}

function functionLabelLatex(graphFunction: GraphFunction, index: number) {
  const label = labelNameLatex(graphFunction.label || graphFunctionLabel(index)) || graphFunctionLabel(index);
  if (graphFunction.labelMode === "name") return label;

  const expressionLatex = graphFunction.latex?.trim() || expressionToLatex(graphFunction.expression);
  if (graphFunction.kind === "relation") return expressionLatex || label;
  return `${label}(x)=${expressionLatex || "\\text{expression}"}`;
}

function createGraphFunctionEvaluator(graphFunction: GraphFunction | undefined, graphConfig: GraphConfig) {
  if (!graphFunction || graphFunction.kind === "relation") return null;

  try {
    const pieces = intervalPieces(graphFunction, graphConfig).map((piece) => ({
      ...piece,
      evaluator: createEvaluator(piece.expression),
    }));
    if (!pieces.length) return null;

    return (x: number) => {
      const piece =
        graphFunction.kind === "piecewise"
          ? pieces.find((candidate) => x >= candidate.xStart - X_EPSILON && x <= candidate.xEnd + X_EPSILON)
          : pieces[0];
      if (!piece) return null;
      return finiteValue(piece.evaluator, x);
    };
  } catch {
    return null;
  }
}

function formatCoordinate(value: number) {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.abs(value) < 1e-9 ? 0 : value;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, "");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function safeCssColor(color: string) {
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : "#111827";
}

function labelNameLatex(value?: string) {
  return graphLabelSourceLatex(value);
}

function coordinateLatex(point?: [number, number]) {
  if (!point) return "";
  return `\\left(${formatCoordinate(point[0])}, ${formatCoordinate(point[1])}\\right)`;
}

function areaLatex(area?: number | null) {
  if (area === null || area === undefined || !Number.isFinite(area)) return "";
  return `\\text{Area}=${formatCoordinate(area)}`;
}

function valueLatex(value?: number | null) {
  if (value === null || value === undefined) return "";
  if (value === Number.POSITIVE_INFINITY) return "m=\\infty";
  if (value === Number.NEGATIVE_INFINITY) return "m=-\\infty";
  if (!Number.isFinite(value)) return "";
  return `m=${formatCoordinate(value)}`;
}

function featureLabelLatex(feature: GraphFeature, point?: [number, number], area?: number | null, value?: number | null) {
  const mode = feature.labelMode ?? "name";
  if (mode === "none") return "";

  const name = labelNameLatex(feature.label);
  const coordinates = coordinateLatex(point);
  const areaLabel = areaLatex(area);
  const valueLabel = valueLatex(value);
  if (mode === "area") return areaLabel;
  if (mode === "name_and_area") return [name, areaLabel].filter(Boolean).join("\\;");
  if (mode === "value") return valueLabel;
  if (mode === "name_and_value") return [name, valueLabel].filter(Boolean).join("\\;");
  if (mode === "coordinates") return coordinates;
  if (mode === "name_and_coordinates") return [name, coordinates].filter(Boolean).join("\\;");
  return name;
}

function textCoordinates(text: unknown): [number, number] | null {
  const candidate = text as { X?: () => number; Y?: () => number; coords?: { usrCoords?: number[] } };
  const x = typeof candidate.X === "function" ? candidate.X() : candidate.coords?.usrCoords?.[1];
  const y = typeof candidate.Y === "function" ? candidate.Y() : candidate.coords?.usrCoords?.[2];
  return Number.isFinite(x) && Number.isFinite(y) ? [x as number, y as number] : null;
}

function moveElement(element: unknown, x: number, y: number) {
  const candidate = element as JXGElement;
  candidate.moveTo?.([x, y], 0);
}

function enableHtmlTextDragging(board: JXG.Board, text: unknown, onMove: (x: number, y: number) => void) {
  const draggableText = text as JXGElement;
  const node = draggableText.rendNode;
  if (!node || node.dataset.mauthDragBound === "true") return;

  node.dataset.mauthDragBound = "true";
  draggableText.isDraggable = false;
  node.style.setProperty("cursor", "move");
  node.style.setProperty("pointer-events", "auto");
  node.style.setProperty("user-select", "none");
  node.style.setProperty("-webkit-user-select", "none");
  node.style.setProperty("touch-action", "none");
  node.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const start = textCoordinates(text);
    if (!start) return;
    const sizedBoard = board as JXG.Board & { unitX?: number; unitY?: number };
    const unitX = sizedBoard.unitX || 1;
    const unitY = sizedBoard.unitY || 1;
    const startClientX = event.clientX;
    const startClientY = event.clientY;

    event.preventDefault();
    event.stopPropagation();
    node.setPointerCapture?.(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const x = start[0] + (moveEvent.clientX - startClientX) / unitX;
      const y = start[1] - (moveEvent.clientY - startClientY) / unitY;
      moveElement(text, x, y);
      board.update();
    };
    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      node.releasePointerCapture?.(upEvent.pointerId);
      const coords = textCoordinates(text);
      if (coords) onMove(coords[0], coords[1]);
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
  });
}

function setRenderedDataAttributes(element: unknown, attributes: Record<string, string | undefined>) {
  if (!element || typeof element !== "object") return;
  const node = (element as JXGElement).rendNode;
  if (!node) return;
  for (const [key, value] of Object.entries(attributes)) {
    if (value) node.setAttribute(key, value);
  }
}

function makePassiveDecoration(element: unknown) {
  const node = (element as JXGElement | undefined)?.rendNode;
  if (!node) return;
  node.style.setProperty("pointer-events", "none");
  node.style.setProperty("user-select", "none");
  node.style.setProperty("-webkit-user-select", "none");
  node.style.setProperty("touch-action", "none");
  node.setAttribute("aria-hidden", "true");
  node.querySelectorAll("*").forEach((child) => {
    const childElement = child as HTMLElement | SVGElement;
    childElement.style.setProperty("pointer-events", "none");
    childElement.style.setProperty("user-select", "none");
    childElement.style.setProperty("-webkit-user-select", "none");
    childElement.style.setProperty("touch-action", "none");
    childElement.setAttribute("aria-hidden", "true");
  });
}

function graphLabelLatex(source: string) {
  return graphLabelSourceLatex(source);
}

function labelDataAttributes(attributes: Record<string, string | undefined>) {
  return Object.entries(attributes)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
    .join(" ");
}

function renderLatexLabelHtml(latex: string, color: string, attributes: Record<string, string | undefined> = {}) {
  const normalizedLatex = graphLabelLatex(latex);
  const safeColor = safeCssColor(color);
  const interactionCss = PASSIVE_GRAPH_DECORATION_CSS;
  const labelAttrs = labelDataAttributes({ "data-mauth-label-text": normalizedLatex, ...attributes });
  try {
    const html = renderMathJaxSvg(normalizedLatex, false);
    return `<span class="jxg-latex-label" ${labelAttrs} style="${GRAPH_LABEL_FONT_CSS} color:${safeColor};${interactionCss}">${html}</span>`;
  } catch {
    return `<span class="jxg-latex-label" ${labelAttrs} style="${GRAPH_LABEL_FONT_CSS} color:${safeColor};${interactionCss}">${escapeHtml(normalizedLatex)}</span>`;
  }
}

function createLabelText(
  board: JXG.Board,
  x: number,
  y: number,
  latex: string | (() => string),
  color: string,
  onMove?: (x: number, y: number) => void,
  attributes: Record<string, string | undefined> = {},
) {
  const initialLatex = typeof latex === "function" ? latex() : latex;
  if (!initialLatex.trim()) return null;
  const safeColor = safeCssColor(color);
  const labelInteractionCss = ` user-select: none; -webkit-user-select: none; touch-action: none;${onMove ? " cursor: move;" : ""}`;
  const labelCss = `${GRAPH_LABEL_FONT_CSS} color: ${safeColor};${labelInteractionCss}`;
  const labelContent =
    typeof latex === "function" ? () => renderLatexLabelHtml(latex(), color, attributes) : renderLatexLabelHtml(latex, color, attributes);
  const text = board.create("text", [x, y, labelContent], {
    fixed: !onMove,
    highlight: false,
    strokeColor: safeColor,
    highlightStrokeColor: safeColor,
    fontSize: AXIS_TEXT_FONT_SIZE,
    fontUnit: GRAPH_LABEL_FONT_UNIT,
    cssStyle: labelCss,
    highlightCssStyle: labelCss,
    anchorX: "left",
    anchorY: "bottom",
    offset: [8, -8],
    display: "html",
    parse: false,
    layer: GRAPH_LAYERS.featureLabel,
  } as Record<string, unknown>);

  if (onMove) {
    window.requestAnimationFrame(() => enableHtmlTextDragging(board, text, onMove));
  }

  return text;
}

function createAxisLabelText(
  board: JXG.Board,
  x: number,
  y: number,
  latex: string,
  offset: [number, number],
  anchorX: "left" | "middle" | "right",
  anchorY: "top" | "middle" | "bottom",
  onMove?: (x: number, y: number) => void,
) {
  const axisLabelCss = `${GRAPH_LABEL_FONT_CSS} color:${AXIS_COLOR}; user-select:none; -webkit-user-select:none; touch-action:none;${onMove ? " pointer-events:auto; cursor:move;" : ""}`;
  const text = board.create("text", [x, y, () => renderLatexLabelHtml(latex, AXIS_COLOR)], {
    fixed: !onMove,
    highlight: false,
    strokeColor: AXIS_COLOR,
    highlightStrokeColor: AXIS_COLOR,
    fontSize: AXIS_TEXT_FONT_SIZE,
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
  if (onMove) {
    window.requestAnimationFrame(() =>
      enableHtmlTextDragging(board, text, (nextX, nextY) => onMove(Number(nextX.toFixed(6)), Number(nextY.toFixed(6)))),
    );
  }
}

function createFeaturePoint(
  board: JXG.Board,
  x: number,
  y: number,
  feature: GraphFeature,
  color: string,
  onLabelMove?: (x: number, y: number) => void,
  value?: number | null,
  onPointMove?: (x: number, y: number, previousX: number, previousY: number) => void,
  onPointDrag?: (x: number, y: number) => PointDragResult | null,
) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  let currentLabelPoint: GraphPoint = [x, y];
  let currentValue = value;
  const point = board.create("point", [x, y], {
    fixed: !onPointMove,
    showInfobox: false,
    withLabel: false,
    size: 3.5,
    strokeColor: color,
    fillColor: color,
    strokeWidth: lineWeight(feature.strokeWidth, 2),
    layer: GRAPH_LAYERS.point,
  });
  const labelText = createLabelText(
    board,
    Number.isFinite(feature.labelX) ? (feature.labelX as number) : x,
    Number.isFinite(feature.labelY) ? (feature.labelY as number) : y,
    () => featureLabelLatex(feature, currentLabelPoint, undefined, currentValue),
    color,
    onLabelMove,
  );

  if (onPointMove) {
    let previousDragPoint: GraphPoint = [x, y];
    const applyLiveDrag = () => {
      const coords = textCoordinates(point);
      if (!coords) return previousDragPoint;

      const transformed = onPointDrag?.(coords[0], coords[1]) ?? { x: coords[0], y: coords[1], value };
      if (!Number.isFinite(transformed.x) || !Number.isFinite(transformed.y)) return previousDragPoint;
      const nextPoint: GraphPoint = [transformed.x, transformed.y];
      currentLabelPoint = nextPoint;
      currentValue = transformed.value ?? value;

      if (Math.abs(coords[0] - nextPoint[0]) > 1e-9 || Math.abs(coords[1] - nextPoint[1]) > 1e-9) {
        moveElement(point, nextPoint[0], nextPoint[1]);
      }

      if (labelText) {
        const labelCoords = textCoordinates(labelText);
        if (labelCoords) {
          moveElement(
            labelText,
            labelCoords[0] + nextPoint[0] - previousDragPoint[0],
            labelCoords[1] + nextPoint[1] - previousDragPoint[1],
          );
        }
      }

      previousDragPoint = nextPoint;
      board.update();
      return nextPoint;
    };

    (point as JXGElement).on?.("drag", applyLiveDrag);
    (point as JXGElement).on?.("up", () => {
      const nextPoint = applyLiveDrag();
      onPointMove(nextPoint[0], nextPoint[1], x, y);
    });
  }

  return point as JXGElement;
}

function createFreeLabel(board: JXG.Board, feature: GraphFeature, color: string, onMove?: (x: number, y: number) => void) {
  const x = Number.isFinite(feature.x) ? (feature.x as number) : 0;
  const y = Number.isFinite(feature.y) ? (feature.y as number) : 0;
  createLabelText(board, x, y, () => featureLabelLatex({ ...feature, labelMode: "name" }), color, onMove);
}

function createLineSegmentFeature(
  board: JXG.Board,
  feature: GraphFeature,
  graphConfig: GraphConfig,
  color: string,
  onLabelMove?: (x: number, y: number) => void,
) {
  const [startCoords, endCoords] = lineSegmentFeatureEndpoints(feature, graphConfig);
  const start = board.create("point", startCoords, { visible: false, fixed: true, withLabel: false } as Record<string, unknown>);
  const end = board.create("point", endCoords, { visible: false, fixed: true, withLabel: false } as Record<string, unknown>);
  board.create("segment", [start, end], {
    fixed: true,
    highlight: false,
    strokeColor: color,
    highlightStrokeColor: color,
    strokeWidth: lineWeight(feature.strokeWidth, 2),
    dash: lineDash(feature.strokeStyle),
    layer: GRAPH_LAYERS.point,
    ...ROUNDED_GRAPH_STROKE,
  } as Record<string, unknown>);

  const label = featureLabelLatex(feature);
  if (label.trim()) {
    createLabelText(
      board,
      Number.isFinite(feature.labelX) ? (feature.labelX as number) : (startCoords[0] + endCoords[0]) / 2,
      Number.isFinite(feature.labelY) ? (feature.labelY as number) : (startCoords[1] + endCoords[1]) / 2,
      label,
      color,
      onLabelMove,
    );
  }
}

function graph2DGeometryData(graphConfig: GraphConfig): Graph2DGeometryData | null {
  if (graphConfig.type === "geometry2d") {
    return graphConfig.data && typeof graphConfig.data === "object" && !Array.isArray(graphConfig.data)
      ? (graphConfig.data as Graph2DGeometryData)
      : null;
  }
  const geometry = graphDataRecord(graphConfig).geometry2d;
  return geometry && typeof geometry === "object" && !Array.isArray(geometry) ? (geometry as Graph2DGeometryData) : null;
}

function geometryPointMap(geometry: Graph2DGeometryData) {
  const points = new Map<string, Graph2DGeometryPoint>();
  (geometry.points ?? []).forEach((point) => {
    if (!point.id || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    points.set(point.id, point);
  });
  return points;
}

function geometrySegmentMap(geometry: Graph2DGeometryData) {
  const segments = new Map<string, Graph2DGeometrySegment>();
  (geometry.segments ?? []).forEach((segment) => {
    if (!segment.id) return;
    segments.set(segment.id, segment);
  });
  return segments;
}

function geometryArcMap(geometry: Graph2DGeometryData) {
  const arcs = new Map<string, Graph2DGeometryArc>();
  (geometry.arcs ?? []).forEach((arc) => {
    if (!arc.id) return;
    arcs.set(arc.id, arc);
  });
  return arcs;
}

function geometryAngleMap(geometry: Graph2DGeometryData) {
  const angles = new Map<string, Graph2DGeometryAngle>();
  (geometry.angles ?? []).forEach((angle) => {
    if (!angle.id || !Array.isArray(angle.points) || angle.points.length !== 3) return;
    angles.set(angle.id, angle);
  });
  return angles;
}

function geometryPointTuple(point?: Graph2DGeometryPoint): [number, number] | null {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return [point.x, point.y];
}

function geometrySegmentEndpoints(
  segment: Graph2DGeometrySegment | undefined,
  points: Map<string, Graph2DGeometryPoint>,
): [[number, number], [number, number]] | null {
  if (!segment) return null;
  const start = geometryPointTuple(points.get(segment.from));
  const end = geometryPointTuple(points.get(segment.to));
  return start && end ? [start, end] : null;
}

function geometryPointPairEndpoints(
  pair: readonly unknown[] | undefined,
  points: Map<string, Graph2DGeometryPoint>,
): [[number, number], [number, number]] | null {
  if (!pair || pair.length !== 2 || typeof pair[0] !== "string" || typeof pair[1] !== "string") return null;
  const start = geometryPointTuple(points.get(pair[0]));
  const end = geometryPointTuple(points.get(pair[1]));
  return start && end ? [start, end] : null;
}

function geometryAnglePoints(
  angle: Graph2DGeometryAngle | undefined,
  points: Map<string, Graph2DGeometryPoint>,
): [[number, number], [number, number], [number, number]] | null {
  if (!angle) return null;
  const first = geometryPointTuple(points.get(angle.points[0]));
  const vertex = geometryPointTuple(points.get(angle.points[1]));
  const second = geometryPointTuple(points.get(angle.points[2]));
  return first && vertex && second ? [first, vertex, second] : null;
}

function geometryDirectAnglePoints(
  value: readonly unknown[] | undefined,
  points: Map<string, Graph2DGeometryPoint>,
): [[number, number], [number, number], [number, number]] | null {
  if (!value || value.length !== 3 || typeof value[0] !== "string" || typeof value[1] !== "string" || typeof value[2] !== "string") {
    return null;
  }
  const first = geometryPointTuple(points.get(value[0]));
  const vertex = geometryPointTuple(points.get(value[1]));
  const second = geometryPointTuple(points.get(value[2]));
  return first && vertex && second ? [first, vertex, second] : null;
}

function geometry2DRenderedAttributes(kind: string, id: string | undefined, role?: string) {
  return {
    "data-mauth-geometry2d-primitive": "true",
    "data-mauth-geometry2d-kind": kind,
    "data-mauth-geometry2d-id": id,
    "data-mauth-geometry2d-role": role,
  };
}

function pixelDirection(board: JXG.Board, start: [number, number], end: [number, number]) {
  const unitX = boardUnit(board, "x");
  const unitY = boardUnit(board, "y");
  const dxPx = (end[0] - start[0]) * unitX;
  const dyPx = -(end[1] - start[1]) * unitY;
  const length = Math.hypot(dxPx, dyPx);
  if (!Number.isFinite(length) || length < 1e-6) return null;
  return { x: dxPx / length, y: dyPx / length };
}

function createPixelSegment(
  board: JXG.Board,
  center: [number, number],
  firstOffset: [number, number],
  secondOffset: [number, number],
  color: string,
  strokeWidth = 1.6,
  attributes: Record<string, string | undefined> = {},
) {
  const segment = board.create(
    "segment",
    [
      offsetUserByPixels(board, center[0], center[1], firstOffset[0], firstOffset[1]),
      offsetUserByPixels(board, center[0], center[1], secondOffset[0], secondOffset[1]),
    ],
    {
      fixed: true,
      highlight: false,
      strokeColor: color,
      highlightStrokeColor: color,
      strokeWidth,
      layer: GRAPH_LAYERS.point,
      ...ROUNDED_GRAPH_STROKE,
    } as Record<string, unknown>,
  );
  setRenderedDataAttributes(segment, attributes);
}

function drawGeometryEqualLengthTicks(
  board: JXG.Board,
  segment: Graph2DGeometrySegment | undefined,
  points: Map<string, Graph2DGeometryPoint>,
  color: string,
  tickCount: number,
  sizePx: number,
  attributes: Record<string, string | undefined>,
) {
  const endpoints = geometrySegmentEndpoints(segment, points);
  if (!endpoints) return;
  drawGeometryEqualLengthTicksAtEndpoints(board, endpoints, color, tickCount, sizePx, attributes);
}

function drawGeometryEqualLengthTicksAtEndpoints(
  board: JXG.Board,
  endpoints: [[number, number], [number, number]],
  color: string,
  tickCount: number,
  sizePx: number,
  attributes: Record<string, string | undefined>,
) {
  const [start, end] = endpoints;
  const direction = pixelDirection(board, start, end);
  if (!direction) return;
  const normal = { x: -direction.y, y: direction.x };
  const midpoint: [number, number] = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const count = Math.max(1, Math.min(4, Math.round(tickCount)));
  const spacingPx = sizePx * 0.65;
  for (let index = 0; index < count; index += 1) {
    const alongPx = (index - (count - 1) / 2) * spacingPx;
    const center = offsetUserByPixels(board, midpoint[0], midpoint[1], direction.x * alongPx, direction.y * alongPx);
    createPixelSegment(
      board,
      center,
      [-normal.x * sizePx * 0.5, -normal.y * sizePx * 0.5],
      [normal.x * sizePx * 0.5, normal.y * sizePx * 0.5],
      color,
      undefined,
      attributes,
    );
  }
}

function shortestAngleDelta(start: number, end: number) {
  let delta = end - start;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
}

function drawGeometryAngleArc(
  board: JXG.Board,
  angle: Graph2DGeometryAngle | undefined,
  points: Map<string, Graph2DGeometryPoint>,
  color: string,
  radius: number,
  arcCount: number,
  strokeWidth = 1.6,
  strokeStyle?: GraphFeature["strokeStyle"],
  attributes: Record<string, string | undefined> = {},
) {
  const anglePoints = geometryAnglePoints(angle, points);
  if (!anglePoints) return;
  const [first, vertex, second] = anglePoints;
  drawAngleArcFromPoints(board, first, vertex, second, color, radius, arcCount, strokeWidth, strokeStyle, attributes);
}

function drawAngleArcFromPoints(
  board: JXG.Board,
  first: GraphPoint,
  vertex: GraphPoint,
  second: GraphPoint,
  color: string,
  radius: number,
  arcCount = 1,
  strokeWidth = 1.6,
  strokeStyle?: GraphFeature["strokeStyle"],
  attributes: Record<string, string | undefined> = {},
) {
  if (!Number.isFinite(radius) || radius <= 0) return;
  const startAngle = Math.atan2(first[1] - vertex[1], first[0] - vertex[0]);
  const delta = shortestAngleDelta(startAngle, Math.atan2(second[1] - vertex[1], second[0] - vertex[0]));
  if (!Number.isFinite(delta) || Math.abs(delta) < 1e-6) return;
  const count = Math.max(1, Math.min(4, Math.round(arcCount)));
  for (let arcIndex = 0; arcIndex < count; arcIndex += 1) {
    const arcRadius = radius + arcIndex * radius * 0.16;
    const steps = Math.max(8, Math.ceil(Math.abs(delta) / (Math.PI / 24)));
    const xs: number[] = [];
    const ys: number[] = [];
    for (let step = 0; step <= steps; step += 1) {
      const theta = startAngle + (delta * step) / steps;
      xs.push(vertex[0] + Math.cos(theta) * arcRadius);
      ys.push(vertex[1] + Math.sin(theta) * arcRadius);
    }
    const arc = board.create("curve", [xs, ys], {
      fixed: true,
      highlight: false,
      strokeColor: color,
      highlightStrokeColor: color,
      strokeWidth,
      dash: lineDash(strokeStyle),
      layer: GRAPH_LAYERS.point,
      ...ROUNDED_GRAPH_STROKE,
    } as Record<string, unknown>);
    setRenderedDataAttributes(arc, attributes);
  }
}

function drawGeometryArc(
  board: JXG.Board,
  arc: Graph2DGeometryArc | undefined,
  points: Map<string, Graph2DGeometryPoint>,
  solutionColor?: string,
  attributes: Record<string, string | undefined> = {},
) {
  if (!arc || arc.show === false) return;
  const center = geometryPointTuple(points.get(arc.center));
  const from = geometryPointTuple(points.get(arc.from));
  const to = geometryPointTuple(points.get(arc.to));
  if (!center || !from || !to) return;

  const radius = Math.hypot(from[0] - center[0], from[1] - center[1]);
  if (!Number.isFinite(radius) || radius <= 0) return;
  const startAngle = Math.atan2(from[1] - center[1], from[0] - center[0]);
  const delta = shortestAngleDelta(startAngle, Math.atan2(to[1] - center[1], to[0] - center[0]));
  if (!Number.isFinite(delta) || Math.abs(delta) < 1e-6) return;
  const steps = Math.max(8, Math.ceil(Math.abs(delta) / (Math.PI / 36)));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const theta = startAngle + (delta * step) / steps;
    xs.push(center[0] + Math.cos(theta) * radius);
    ys.push(center[1] + Math.sin(theta) * radius);
  }

  const color = solutionColor ?? arc.color ?? "#000000";
  const renderedArc = board.create("curve", [xs, ys], {
    fixed: true,
    highlight: false,
    strokeColor: color,
    highlightStrokeColor: color,
    strokeWidth: lineWeight(arc.strokeWidth, 2),
    dash: lineDash(arc.strokeStyle),
    layer: GRAPH_LAYERS.point,
    ...ROUNDED_GRAPH_STROKE,
  } as Record<string, unknown>);
  setRenderedDataAttributes(renderedArc, attributes);

  if (arc.label?.trim()) {
    const middleTheta = startAngle + delta / 2;
    createLabelText(
      board,
      Number.isFinite(arc.labelX) ? (arc.labelX as number) : center[0] + Math.cos(middleTheta) * radius,
      Number.isFinite(arc.labelY) ? (arc.labelY as number) : center[1] + Math.sin(middleTheta) * radius,
      arc.label,
      color,
      undefined,
      { ...attributes, "data-mauth-label-role": "geometry2d-arc-label" },
    );
  }
}

function unitUserVector(from: [number, number], to: [number, number]): [number, number] | null {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1e-9) return null;
  return [dx / length, dy / length];
}

function drawGeometryRightAngleMarker(
  board: JXG.Board,
  angle: Graph2DGeometryAngle | undefined,
  points: Map<string, Graph2DGeometryPoint>,
  color: string,
  size: number,
  attributes: Record<string, string | undefined> = {},
) {
  const anglePoints = geometryAnglePoints(angle, points);
  if (!anglePoints) return;
  const [first, vertex, second] = anglePoints;
  drawRightAngleMarkerFromPoints(board, first, vertex, second, color, size, undefined, undefined, attributes);
}

function drawGeometryRightAngleMarkerFromDirectPoints(
  board: JXG.Board,
  value: readonly unknown[] | undefined,
  points: Map<string, Graph2DGeometryPoint>,
  color: string,
  size: number,
  attributes: Record<string, string | undefined> = {},
) {
  const anglePoints = geometryDirectAnglePoints(value, points);
  if (!anglePoints) return;
  const [first, vertex, second] = anglePoints;
  drawRightAngleMarkerFromPoints(board, first, vertex, second, color, size, undefined, undefined, attributes);
}

function drawRightAngleMarkerFromPoints(
  board: JXG.Board,
  first: GraphPoint,
  vertex: GraphPoint,
  second: GraphPoint,
  color: string,
  size: number,
  strokeWidth = 1.6,
  strokeStyle?: GraphFeature["strokeStyle"],
  attributes: Record<string, string | undefined> = {},
) {
  if (!Number.isFinite(size) || size <= 0) return;
  const firstUnit = unitUserVector(vertex, first);
  const secondUnit = unitUserVector(vertex, second);
  if (!firstUnit || !secondUnit) return;
  const p1: [number, number] = [vertex[0] + firstUnit[0] * size, vertex[1] + firstUnit[1] * size];
  const p3: [number, number] = [vertex[0] + secondUnit[0] * size, vertex[1] + secondUnit[1] * size];
  const p2: [number, number] = [p1[0] + secondUnit[0] * size, p1[1] + secondUnit[1] * size];
  const attrs = {
    fixed: true,
    highlight: false,
    strokeColor: color,
    highlightStrokeColor: color,
    strokeWidth,
    dash: lineDash(strokeStyle),
    layer: GRAPH_LAYERS.point,
    ...ROUNDED_GRAPH_STROKE,
  } as Record<string, unknown>;
  const firstSegment = board.create("segment", [p1, p2], attrs);
  const secondSegment = board.create("segment", [p2, p3], attrs);
  setRenderedDataAttributes(firstSegment, attributes);
  setRenderedDataAttributes(secondSegment, attributes);
}

function createAngleMarkerFeature(
  board: JXG.Board,
  feature: GraphFeature,
  graphConfig: GraphConfig,
  color: string,
  onLabelMove?: (x: number, y: number) => void,
) {
  const [first, vertex, second] = graphAngleMarkerFeaturePoints(feature, graphConfig);
  const featureSize = feature.size;
  const markerSize = typeof featureSize === "number" && Number.isFinite(featureSize) && featureSize > 0 ? featureSize : 0.35;
  const strokeWidth = lineWeight(feature.strokeWidth, 1.6);
  if (feature.rightAngle === true) {
    drawRightAngleMarkerFromPoints(board, first, vertex, second, color, markerSize, strokeWidth, feature.strokeStyle);
  } else {
    drawAngleArcFromPoints(board, first, vertex, second, color, markerSize, 1, strokeWidth, feature.strokeStyle);
  }

  const label = featureLabelLatex(feature);
  if (!label.trim()) return;
  const startAngle = Math.atan2(first[1] - vertex[1], first[0] - vertex[0]);
  const middleAngle = startAngle + shortestAngleDelta(startAngle, Math.atan2(second[1] - vertex[1], second[0] - vertex[0])) / 2;
  const labelRadius = markerSize * 1.65;
  createLabelText(
    board,
    Number.isFinite(feature.labelX) ? (feature.labelX as number) : vertex[0] + Math.cos(middleAngle) * labelRadius,
    Number.isFinite(feature.labelY) ? (feature.labelY as number) : vertex[1] + Math.sin(middleAngle) * labelRadius,
    label,
    color,
    onLabelMove,
  );
}

function renderGraph2DGeometry(board: JXG.Board, graphConfig: GraphConfig, solutionColor?: string) {
  const geometry = graph2DGeometryData(graphConfig);
  if (!geometry) return;
  const points = geometryPointMap(geometry);
  const segments = geometrySegmentMap(geometry);
  const arcs = geometryArcMap(geometry);
  const angles = geometryAngleMap(geometry);

  segments.forEach((segment) => {
    if (segment.show === false) return;
    const endpoints = geometrySegmentEndpoints(segment, points);
    if (!endpoints) return;
    const [start, end] = endpoints;
    const color = solutionColor ?? segment.color ?? "#000000";
    const attributes = geometry2DRenderedAttributes("segment", segment.id);
    const renderedSegment = board.create("segment", [start, end], {
      fixed: true,
      highlight: false,
      strokeColor: color,
      highlightStrokeColor: color,
      strokeWidth: lineWeight(segment.strokeWidth, 2),
      dash: lineDash(segment.strokeStyle),
      layer: GRAPH_LAYERS.point,
      ...ROUNDED_GRAPH_STROKE,
    } as Record<string, unknown>);
    setRenderedDataAttributes(renderedSegment, attributes);
    if (segment.label?.trim()) {
      createLabelText(
        board,
        Number.isFinite(segment.labelX) ? (segment.labelX as number) : (start[0] + end[0]) / 2,
        Number.isFinite(segment.labelY) ? (segment.labelY as number) : (start[1] + end[1]) / 2,
        segment.label,
        color,
        undefined,
        { ...attributes, "data-mauth-label-role": "geometry2d-segment-label" },
      );
    }
  });

  arcs.forEach((arc) => drawGeometryArc(board, arc, points, solutionColor, geometry2DRenderedAttributes("arc", arc.id)));

  (geometry.decorations ?? []).forEach((decoration) => {
    if (decoration.show === false) return;
    const color = solutionColor ?? decoration.color ?? "#000000";
    const attributes = geometry2DRenderedAttributes("decoration", decoration.id, decoration.kind);
    if (decoration.kind === "equalLength") {
      const tickCount = decoration.tickCount ?? 1;
      const sizePx = decoration.size ?? 16;
      (decoration.segments ?? []).forEach((segmentId) =>
        drawGeometryEqualLengthTicks(board, segments.get(segmentId), points, color, tickCount, sizePx, {
          ...attributes,
          "data-mauth-geometry2d-decoration-target": segmentId,
        }),
      );
      (decoration.pointPairs ?? []).forEach((pair, pairIndex) => {
        const endpoints = geometryPointPairEndpoints(pair, points);
        if (!endpoints) return;
        drawGeometryEqualLengthTicksAtEndpoints(board, endpoints, color, tickCount, sizePx, {
          ...attributes,
          "data-mauth-geometry2d-decoration-target": `pointPairs[${pairIndex}]`,
        });
      });
    }
    if (decoration.kind === "equalAngle") {
      const arcCount = decoration.arcCount ?? 1;
      const radius = decoration.radius ?? 0.55;
      (decoration.angles ?? []).forEach((angleId) =>
        drawGeometryAngleArc(board, angles.get(angleId), points, color, radius, arcCount, undefined, undefined, {
          ...attributes,
          "data-mauth-geometry2d-decoration-target": angleId,
        }),
      );
      (decoration.anglePoints ?? []).forEach((value, angleIndex) => {
        const directAnglePoints = geometryDirectAnglePoints(value, points);
        if (!directAnglePoints) return;
        const [first, vertex, second] = directAnglePoints;
        drawAngleArcFromPoints(board, first, vertex, second, color, radius, arcCount, undefined, undefined, {
          ...attributes,
          "data-mauth-geometry2d-decoration-target": `anglePoints[${angleIndex}]`,
        });
      });
    }
    if (decoration.kind === "rightAngle") {
      drawGeometryRightAngleMarker(board, angles.get(decoration.angle ?? ""), points, color, decoration.size ?? 0.35, {
        ...attributes,
        "data-mauth-geometry2d-decoration-target": decoration.angle,
      });
      drawGeometryRightAngleMarkerFromDirectPoints(board, decoration.points, points, color, decoration.size ?? 0.35, {
        ...attributes,
        "data-mauth-geometry2d-decoration-target": "points",
      });
    }
  });

  angles.forEach((angle) => {
    if (angle.show === false) return;
    const anglePoints = geometryAnglePoints(angle, points);
    if (!anglePoints) return;
    const [first, vertex, second] = anglePoints;
    const color = solutionColor ?? angle.color ?? "#000000";
    const attributes = geometry2DRenderedAttributes("angle", angle.id);
    drawGeometryAngleArc(
      board,
      angle,
      points,
      color,
      angle.radius ?? 0.55,
      angle.arcCount ?? 1,
      lineWeight(angle.strokeWidth, 1.6),
      angle.strokeStyle,
      attributes,
    );
    if (!angle.label?.trim()) return;
    const startAngle = Math.atan2(first[1] - vertex[1], first[0] - vertex[0]);
    const middleAngle = startAngle + shortestAngleDelta(startAngle, Math.atan2(second[1] - vertex[1], second[0] - vertex[0])) / 2;
    const labelRadius = (angle.radius ?? 0.55) * 1.45;
    createLabelText(
      board,
      Number.isFinite(angle.labelX) ? (angle.labelX as number) : vertex[0] + Math.cos(middleAngle) * labelRadius,
      Number.isFinite(angle.labelY) ? (angle.labelY as number) : vertex[1] + Math.sin(middleAngle) * labelRadius,
      angle.label,
      color,
      undefined,
      { ...attributes, "data-mauth-label-role": "geometry2d-angle-label" },
    );
  });

  points.forEach((point) => {
    if (point.show === false) return;
    const color = solutionColor ?? point.color ?? "#000000";
    const renderedPoint = createFeaturePoint(
      board,
      point.x,
      point.y,
      {
        kind: "point",
        label: point.label ?? point.id,
        labelMode: point.label || point.id ? "name" : "none",
        labelX: point.labelX,
        labelY: point.labelY,
        size: 0.15,
      },
      color,
    );
    setRenderedDataAttributes(renderedPoint, geometry2DRenderedAttributes("point", point.id));
  });
}

function boundedInterval(feature: GraphFeature, graphConfig: GraphConfig) {
  const graphXMin = graphConfig.xMin ?? -10;
  const graphXMax = graphConfig.xMax ?? 10;
  const xMin = Number.isFinite(feature.xMin) ? (feature.xMin as number) : graphXMin;
  const xMax = Number.isFinite(feature.xMax) ? (feature.xMax as number) : graphXMax;
  return xMax >= xMin ? { xMin, xMax } : { xMin: xMax, xMax: xMin };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function gridClipRect(graphConfig: GraphConfig) {
  return {
    xMin: graphConfig.xMin ?? -10,
    xMax: graphConfig.xMax ?? 10,
    yMin: graphConfig.yMin ?? -10,
    yMax: graphConfig.yMax ?? 10,
  };
}

function boundedGridInterval(feature: GraphFeature, graphConfig: GraphConfig) {
  const { xMin: featureXMin, xMax: featureXMax } = boundedInterval(feature, graphConfig);
  const { xMin: gridXMin, xMax: gridXMax } = gridClipRect(graphConfig);
  const xMin = Math.max(featureXMin, gridXMin);
  const xMax = Math.min(featureXMax, gridXMax);
  return xMax > xMin ? { xMin, xMax } : null;
}

function clipPolygonToEdge(
  points: GraphPoint[],
  inside: (point: GraphPoint) => boolean,
  intersect: (start: GraphPoint, end: GraphPoint) => GraphPoint,
) {
  if (!points.length) return [];
  const clipped: GraphPoint[] = [];
  let previous = points.at(-1) as GraphPoint;
  let previousInside = inside(previous);

  points.forEach((current) => {
    const currentInside = inside(current);
    if (currentInside) {
      if (!previousInside) clipped.push(intersect(previous, current));
      clipped.push(current);
    } else if (previousInside) {
      clipped.push(intersect(previous, current));
    }
    previous = current;
    previousInside = currentInside;
  });

  return clipped.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}

function clipPolygonToRect(points: GraphPoint[], rect: ReturnType<typeof gridClipRect>) {
  let clipped = points;
  clipped = clipPolygonToEdge(
    clipped,
    ([x]) => x >= rect.xMin,
    ([x1, y1], [x2, y2]) => {
      const ratio = x2 === x1 ? 0 : (rect.xMin - x1) / (x2 - x1);
      return [rect.xMin, y1 + (y2 - y1) * ratio];
    },
  );
  clipped = clipPolygonToEdge(
    clipped,
    ([x]) => x <= rect.xMax,
    ([x1, y1], [x2, y2]) => {
      const ratio = x2 === x1 ? 0 : (rect.xMax - x1) / (x2 - x1);
      return [rect.xMax, y1 + (y2 - y1) * ratio];
    },
  );
  clipped = clipPolygonToEdge(
    clipped,
    ([, y]) => y >= rect.yMin,
    ([x1, y1], [x2, y2]) => {
      const ratio = y2 === y1 ? 0 : (rect.yMin - y1) / (y2 - y1);
      return [x1 + (x2 - x1) * ratio, rect.yMin];
    },
  );
  clipped = clipPolygonToEdge(
    clipped,
    ([, y]) => y <= rect.yMax,
    ([x1, y1], [x2, y2]) => {
      const ratio = y2 === y1 ? 0 : (rect.yMax - y1) / (y2 - y1);
      return [x1 + (x2 - x1) * ratio, rect.yMax];
    },
  );
  return clipped;
}

function clampedRegionLabelPoint(x: number, y: number, graphConfig: GraphConfig) {
  const rect = gridClipRect(graphConfig);
  return [clamp(x, rect.xMin, rect.xMax), clamp(y, rect.yMin, rect.yMax)] as GraphPoint;
}

function absoluteTrapezoidalArea(
  upperEvaluator: (x: number) => number | null,
  lowerEvaluator: (x: number) => number | null,
  xMin: number,
  xMax: number,
) {
  if (xMax <= xMin) return null;
  const samples = 800;
  const step = (xMax - xMin) / samples;
  let area = 0;
  let previousValue: number | null = null;

  for (let index = 0; index <= samples; index += 1) {
    const x = xMin + step * index;
    const upperY = upperEvaluator(x);
    const lowerY = lowerEvaluator(x);
    const value = upperY === null || lowerY === null ? null : Math.abs(upperY - lowerY);

    if (previousValue !== null && value !== null) {
      area += ((previousValue + value) / 2) * step;
    }

    previousValue = value;
  }

  return Number.isFinite(area) ? area : null;
}

function polygonArea(points: GraphPoint[]) {
  if (points.length < 3) return null;
  let sum = 0;
  points.forEach(([x1, y1], index) => {
    const [x2, y2] = points[(index + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  });
  return Math.abs(sum) / 2;
}

interface RegionGeometry {
  polygon: GraphPoint[];
  area: number | null;
  labelPoint: GraphPoint;
}

interface VerticalRegionDefinition {
  feature: GraphFeature;
  firstEvaluator: (x: number) => number | null;
  secondEvaluator: (x: number) => number | null;
}

function polygonCenter(points: GraphPoint[]) {
  if (!points.length) return [0, 0] as GraphPoint;
  const [xTotal, yTotal] = points.reduce(([xSum, ySum], [x, y]) => [xSum + x, ySum + y], [0, 0]);
  return [xTotal / points.length, yTotal / points.length] as GraphPoint;
}

function drawRegionPolygon(board: JXG.Board, polygon: GraphPoint[], feature: GraphFeature, color: string) {
  const strokeWidth = lineWeight(feature.strokeWidth, 1);
  const shouldDrawBorder = feature.strokeStyle !== "none" && strokeWidth > 0;
  board.create("polygon", polygon, {
    fixed: true,
    highlight: false,
    withLabel: false,
    withLines: shouldDrawBorder,
    hasInnerPoints: false,
    fillColor: color,
    fillOpacity: feature.fillOpacity ?? 0.18,
    highlightFillOpacity: feature.fillOpacity ?? 0.18,
    strokeColor: color,
    strokeOpacity: shouldDrawBorder ? 1 : 0,
    strokeWidth,
    dash: lineDash(feature.strokeStyle),
    layer: GRAPH_LAYERS.featureFill,
    vertices: {
      fixed: true,
      visible: false,
      withLabel: false,
    },
    borders: {
      visible: shouldDrawBorder,
      strokeColor: color,
      strokeOpacity: shouldDrawBorder ? 1 : 0,
      strokeWidth,
      dash: lineDash(feature.strokeStyle),
    },
  } as Record<string, unknown>);
}

function drawRegionGeometry(
  board: JXG.Board,
  geometry: RegionGeometry,
  feature: GraphFeature,
  color: string,
  onLabelMove?: (x: number, y: number) => void,
) {
  drawRegionPolygon(board, geometry.polygon, feature, color);
  createLabelText(
    board,
    Number.isFinite(feature.labelX) ? (feature.labelX as number) : geometry.labelPoint[0],
    Number.isFinite(feature.labelY) ? (feature.labelY as number) : geometry.labelPoint[1],
    featureLabelLatex(feature, undefined, geometry.area),
    color,
    onLabelMove,
  );
}

function drawRegionGeometries(
  board: JXG.Board,
  geometries: RegionGeometry[],
  feature: GraphFeature,
  color: string,
  onLabelMove?: (x: number, y: number) => void,
) {
  if (!geometries.length) return;
  geometries.forEach((geometry) => drawRegionPolygon(board, geometry.polygon, feature, color));
  drawRegionGeometriesLabel(board, geometries, feature, color, onLabelMove);
}

function drawRegionGeometriesLabel(
  board: JXG.Board,
  geometries: RegionGeometry[],
  feature: GraphFeature,
  color: string,
  onLabelMove?: (x: number, y: number) => void,
) {
  if (!geometries.length) return;
  const totalArea = geometries.reduce((sum, geometry) => sum + (geometry.area ?? 0), 0);
  const labelGeometry = geometries.reduce((largest, geometry) => {
    const largestArea = largest.area ?? 0;
    const geometryArea = geometry.area ?? 0;
    return geometryArea > largestArea ? geometry : largest;
  }, geometries[0]);

  createLabelText(
    board,
    Number.isFinite(feature.labelX) ? (feature.labelX as number) : labelGeometry.labelPoint[0],
    Number.isFinite(feature.labelY) ? (feature.labelY as number) : labelGeometry.labelPoint[1],
    featureLabelLatex(feature, undefined, totalArea),
    color,
    onLabelMove,
  );
}

function drawRegionGeometryLabel(
  board: JXG.Board,
  geometry: RegionGeometry,
  feature: GraphFeature,
  color: string,
  onLabelMove?: (x: number, y: number) => void,
) {
  createLabelText(
    board,
    Number.isFinite(feature.labelX) ? (feature.labelX as number) : geometry.labelPoint[0],
    Number.isFinite(feature.labelY) ? (feature.labelY as number) : geometry.labelPoint[1],
    featureLabelLatex(feature, undefined, geometry.area),
    color,
    onLabelMove,
  );
}

function buildRegionBetweenEvaluatorsGeometry(
  upperEvaluator: (x: number) => number | null,
  lowerEvaluator: (x: number) => number | null,
  feature: GraphFeature,
  graphConfig: GraphConfig,
): RegionGeometry | null {
  const interval = boundedGridInterval(feature, graphConfig);
  if (!interval) return null;
  const { xMin, xMax } = interval;

  const upper: GraphPoint[] = [];
  const lower: GraphPoint[] = [];
  const samples = 90;
  for (let index = 0; index <= samples; index += 1) {
    const x = xMin + ((xMax - xMin) * index) / samples;
    const upperY = upperEvaluator(x);
    const lowerY = lowerEvaluator(x);
    if (upperY === null || lowerY === null) continue;
    upper.push([x, upperY]);
    lower.push([x, lowerY]);
  }
  if (upper.length < 2 || lower.length < 2) return null;

  const clippedPolygon = clipPolygonToRect([...upper, ...lower.reverse()], gridClipRect(graphConfig));
  if (clippedPolygon.length < 3) return null;

  const labelX = (xMin + xMax) / 2;
  const upperY = upperEvaluator(labelX);
  const lowerY = lowerEvaluator(labelX);
  const labelPoint =
    upperY !== null && lowerY !== null
      ? clampedRegionLabelPoint(labelX, (upperY + lowerY) / 2, graphConfig)
      : polygonCenter(clippedPolygon);

  return {
    polygon: clippedPolygon,
    area: absoluteTrapezoidalArea(upperEvaluator, lowerEvaluator, xMin, xMax),
    labelPoint,
  };
}

function buildRegionToYAxisGeometry(
  evaluator: (x: number) => number | null,
  feature: GraphFeature,
  graphConfig: GraphConfig,
): RegionGeometry | null {
  const interval = boundedGridInterval(feature, graphConfig);
  if (!interval) return null;
  const { xMin, xMax } = interval;

  const curve: GraphPoint[] = [];
  const axis: GraphPoint[] = [];
  const samples = 90;
  for (let index = 0; index <= samples; index += 1) {
    const x = xMin + ((xMax - xMin) * index) / samples;
    const y = evaluator(x);
    if (y === null) continue;
    curve.push([x, y]);
    axis.push([0, y]);
  }
  if (curve.length < 2 || axis.length < 2) return null;

  const clippedPolygon = clipPolygonToRect([...curve, ...axis.reverse()], gridClipRect(graphConfig));
  if (clippedPolygon.length < 3) return null;

  const labelX = (xMin + xMax) / 4;
  const labelY = evaluator((xMin + xMax) / 2);
  return {
    polygon: clippedPolygon,
    area: polygonArea(clippedPolygon),
    labelPoint: labelY !== null ? clampedRegionLabelPoint(labelX, labelY, graphConfig) : polygonCenter(clippedPolygon),
  };
}

function nativeRegionAttributes(feature: GraphFeature, color: string, visible: boolean) {
  const fillOpacity = visible ? (feature.fillOpacity ?? 0.18) : 0;
  const strokeWidth = visible && feature.strokeStyle !== "none" ? lineWeight(feature.strokeWidth, 1) : 0;
  return {
    fixed: true,
    highlight: false,
    withLabel: false,
    fillColor: color,
    highlightFillColor: color,
    fillOpacity,
    highlightFillOpacity: fillOpacity,
    strokeColor: color,
    strokeOpacity: visible && strokeWidth > 0 ? 1 : 0,
    strokeWidth,
    dash: lineDash(feature.strokeStyle),
    layer: GRAPH_LAYERS.featureFill,
  } as Record<string, unknown>;
}

function nativeBoundaryAttributes() {
  return {
    fixed: true,
    highlight: false,
    withLabel: false,
    strokeColor: "none",
    strokeOpacity: 0,
    strokeWidth: 0,
    fillOpacity: 0,
    visible: true,
    layer: GRAPH_LAYERS.featureFill,
  } as Record<string, unknown>;
}

function createNativeFunctionBoundary(board: JXG.Board, evaluator: (x: number) => number | null, xMin: number, xMax: number) {
  if (xMax <= xMin) return null;
  try {
    return board.create("functiongraph", [(x: number) => evaluator(x) ?? NaN, xMin, xMax], nativeBoundaryAttributes());
  } catch {
    return null;
  }
}

function createNativeInequality(
  board: JXG.Board,
  evaluator: (x: number) => number | null,
  xMin: number,
  xMax: number,
  keepAbove: boolean,
  feature: GraphFeature,
  color: string,
) {
  const boundary = createNativeFunctionBoundary(board, evaluator, xMin, xMax);
  if (!boundary) return null;

  try {
    return board.create("inequality", [boundary], {
      ...nativeRegionAttributes(feature, color, false),
      inverse: keepAbove,
    } as Record<string, unknown>);
  } catch {
    return null;
  }
}

function createNativeIntervalPolygon(
  board: JXG.Board,
  xMin: number,
  xMax: number,
  graphConfig: GraphConfig,
  feature: GraphFeature,
  color: string,
) {
  const rect = gridClipRect(graphConfig);
  if (xMax <= xMin) return null;
  try {
    return board.create(
      "polygon",
      [
        [xMin, rect.yMin],
        [xMax, rect.yMin],
        [xMax, rect.yMax],
        [xMin, rect.yMax],
      ],
      {
        ...nativeRegionAttributes(feature, color, false),
        vertices: {
          fixed: true,
          visible: false,
          withLabel: false,
        },
        borders: {
          strokeOpacity: 0,
          visible: true,
        },
      } as Record<string, unknown>,
    );
  } catch {
    return null;
  }
}

function createNativeRelationBoundary(board: JXG.Board, graphFunction: GraphFunction, graphConfig: GraphConfig) {
  if (graphFunction.kind !== "relation" || !graphFunction.expression.trim()) return null;
  const rect = gridClipRect(graphConfig);
  try {
    return board.create(
      "implicitcurve",
      [createImplicitEvaluator(graphFunction.expression), [rect.xMin, rect.xMax], [rect.yMin, rect.yMax]],
      nativeBoundaryAttributes(),
    );
  } catch {
    return null;
  }
}

function intersectNativeElements(
  board: JXG.Board,
  elements: NativeRegionElement[],
  feature: GraphFeature,
  color: string,
  visible: boolean,
) {
  if (elements.length < 2) return null;
  try {
    return elements.slice(1).reduce((current, element, index, rest) => {
      const isFinal = index === rest.length - 1;
      return board.create("curveintersection", [current, element], nativeRegionAttributes(feature, color, visible && isFinal));
    }, elements[0]);
  } catch {
    return null;
  }
}

function nativeExplicitEvaluator(graphFunction: GraphFunction | undefined, graphConfig: GraphConfig) {
  if (!graphFunction || graphFunction.kind === "piecewise" || graphFunction.kind === "relation") return null;
  if (!graphFunction.expression.trim()) return null;
  return createGraphFunctionEvaluator(graphFunction, graphConfig);
}

function stableVerticalOrder(
  firstEvaluator: (x: number) => number | null,
  secondEvaluator: (x: number) => number | null,
  xMin: number,
  xMax: number,
) {
  let sign = 0;
  const samples = 24;
  for (let index = 0; index <= samples; index += 1) {
    const x = xMin + ((xMax - xMin) * index) / samples;
    const firstY = firstEvaluator(x);
    const secondY = secondEvaluator(x);
    if (firstY === null || secondY === null) return null;
    const difference = firstY - secondY;
    if (Math.abs(difference) < 1e-7) continue;
    const currentSign = difference > 0 ? 1 : -1;
    if (sign && sign !== currentSign) return null;
    sign = currentSign;
  }
  return sign || 1;
}

function createNativeVerticalBandElement(
  board: JXG.Board,
  firstEvaluator: (x: number) => number | null,
  secondEvaluator: (x: number) => number | null,
  feature: GraphFeature,
  graphConfig: GraphConfig,
  color: string,
  visible: boolean,
) {
  const interval = boundedGridInterval(feature, graphConfig);
  if (!interval) return null;

  const order = stableVerticalOrder(firstEvaluator, secondEvaluator, interval.xMin, interval.xMax);
  if (!order) return null;

  const upperEvaluator = order > 0 ? firstEvaluator : secondEvaluator;
  const lowerEvaluator = order > 0 ? secondEvaluator : firstEvaluator;
  const belowUpper = createNativeInequality(board, upperEvaluator, interval.xMin, interval.xMax, false, feature, color);
  const aboveLower = createNativeInequality(board, lowerEvaluator, interval.xMin, interval.xMax, true, feature, color);
  const intervalBox = createNativeIntervalPolygon(board, interval.xMin, interval.xMax, graphConfig, feature, color);
  const elements = [belowUpper, aboveLower, intervalBox].filter(Boolean) as NativeRegionElement[];
  return intersectNativeElements(board, elements, feature, color, visible);
}

function createNativeBaseRegionElement(
  board: JXG.Board,
  feature: GraphFeature | undefined,
  graphConfig: GraphConfig,
  functions: GraphFunction[],
  color: string,
  visible: boolean,
) {
  if (!feature) return null;

  if (feature.kind === "region_between_curves") {
    const evaluatorA = nativeExplicitEvaluator(functions[feature.functionAIndex ?? feature.functionIndex ?? 0], graphConfig);
    const evaluatorB = nativeExplicitEvaluator(functions[feature.functionBIndex ?? 1], graphConfig);
    return evaluatorA && evaluatorB
      ? createNativeVerticalBandElement(board, evaluatorA, evaluatorB, feature, graphConfig, color, visible)
      : null;
  }

  if (feature.kind === "region_curve_axis" && feature.axis !== "y") {
    const evaluator = nativeExplicitEvaluator(functions[feature.functionIndex ?? 0], graphConfig);
    return evaluator ? createNativeVerticalBandElement(board, evaluator, () => 0, feature, graphConfig, color, visible) : null;
  }

  return null;
}

function createNativeRegionBetweenCurves(
  board: JXG.Board,
  evaluatorA: (x: number) => number | null,
  evaluatorB: (x: number) => number | null,
  feature: GraphFeature,
  graphConfig: GraphConfig,
  color: string,
  onLabelMove?: (x: number, y: number) => void,
) {
  const region = createNativeVerticalBandElement(board, evaluatorA, evaluatorB, feature, graphConfig, color, true);
  if (!region) return false;

  const geometry = buildRegionBetweenEvaluatorsGeometry(evaluatorA, evaluatorB, feature, graphConfig);
  if (geometry) drawRegionGeometryLabel(board, geometry, feature, color, onLabelMove);
  return true;
}

function createNativeClippedRegion(
  board: JXG.Board,
  feature: GraphFeature,
  graphConfig: GraphConfig,
  functions: GraphFunction[],
  featureIndex: number,
  color: string,
  onLabelMove?: (x: number, y: number) => void,
) {
  const features = graphFeatures(graphConfig);
  const baseIndex = resolvedBaseRegionIndex(features, feature, featureIndex);
  const baseFeature = baseIndex === null ? undefined : features[baseIndex];
  const baseElement = createNativeBaseRegionElement(board, baseFeature, graphConfig, functions, color, false);
  const clipFunction = functions[feature.clipFunctionIndex ?? feature.functionIndex ?? 0];
  if (!baseElement || !clipFunction) return false;

  let clippedElement: NativeRegionElement | null = null;
  if (clipFunction.kind === "relation" && (feature.clipSide === "inside" || feature.clipSide === "outside")) {
    const relationBoundary = createNativeRelationBoundary(board, clipFunction, graphConfig);
    if (!relationBoundary) return false;
    try {
      clippedElement = board.create(
        feature.clipSide === "outside" ? "curvedifference" : "curveintersection",
        [baseElement, relationBoundary],
        nativeRegionAttributes(feature, color, true),
      );
    } catch {
      clippedElement = null;
    }
  } else {
    const clipEvaluator = nativeExplicitEvaluator(clipFunction, graphConfig);
    const interval = baseFeature ? boundedGridInterval(baseFeature, graphConfig) : null;
    if (!clipEvaluator || !interval) return false;
    const clipRegion = createNativeInequality(
      board,
      clipEvaluator,
      interval.xMin,
      interval.xMax,
      clippedRegionKeepsPositive(feature),
      feature,
      color,
    );
    if (!clipRegion) return false;
    clippedElement = intersectNativeElements(board, [baseElement, clipRegion], feature, color, true);
  }

  if (!clippedElement) return false;

  const verticalRegion = buildVerticalRegionDefinition(baseFeature, graphConfig, functions);
  const explicitClipEvaluator = createGraphFunctionEvaluator(clipFunction, graphConfig);
  if (verticalRegion && explicitClipEvaluator) {
    drawRegionGeometriesLabel(
      board,
      buildClippedVerticalRegionGeometries(verticalRegion, explicitClipEvaluator, feature, graphConfig),
      feature,
      color,
      onLabelMove,
    );
  } else {
    const baseGeometry = buildRegionGeometryFromFeature(baseFeature, graphConfig, functions);
    if (baseGeometry) drawRegionGeometryLabel(board, baseGeometry, feature, color, onLabelMove);
  }

  return true;
}

function createRegionPolygon(
  board: JXG.Board,
  upperEvaluator: (x: number) => number | null,
  lowerEvaluator: (x: number) => number | null,
  feature: GraphFeature,
  graphConfig: GraphConfig,
  color: string,
  onLabelMove?: (x: number, y: number) => void,
) {
  const geometry = buildRegionBetweenEvaluatorsGeometry(upperEvaluator, lowerEvaluator, feature, graphConfig);
  if (!geometry) return;
  drawRegionGeometry(board, geometry, feature, color, onLabelMove);
}

function createRegionToYAxisPolygon(
  board: JXG.Board,
  evaluator: (x: number) => number | null,
  feature: GraphFeature,
  graphConfig: GraphConfig,
  color: string,
  onLabelMove?: (x: number, y: number) => void,
) {
  const geometry = buildRegionToYAxisGeometry(evaluator, feature, graphConfig);
  if (!geometry) return;
  drawRegionGeometry(board, geometry, feature, color, onLabelMove);
}

function buildRegionGeometryFromFeature(feature: GraphFeature | undefined, graphConfig: GraphConfig, functions: GraphFunction[]) {
  if (!feature) return null;

  if (feature.kind === "region_between_curves") {
    const evaluatorA = createGraphFunctionEvaluator(functions[feature.functionAIndex ?? feature.functionIndex ?? 0], graphConfig);
    const evaluatorB = createGraphFunctionEvaluator(functions[feature.functionBIndex ?? 1], graphConfig);
    return evaluatorA && evaluatorB ? buildRegionBetweenEvaluatorsGeometry(evaluatorA, evaluatorB, feature, graphConfig) : null;
  }

  if (feature.kind === "region_curve_axis") {
    const evaluator = createGraphFunctionEvaluator(functions[feature.functionIndex ?? 0], graphConfig);
    if (!evaluator) return null;
    return feature.axis === "y"
      ? buildRegionToYAxisGeometry(evaluator, feature, graphConfig)
      : buildRegionBetweenEvaluatorsGeometry(evaluator, () => 0, feature, graphConfig);
  }

  return null;
}

function buildVerticalRegionDefinition(feature: GraphFeature | undefined, graphConfig: GraphConfig, functions: GraphFunction[]) {
  if (!feature) return null;

  if (feature.kind === "region_between_curves") {
    const evaluatorA = createGraphFunctionEvaluator(functions[feature.functionAIndex ?? feature.functionIndex ?? 0], graphConfig);
    const evaluatorB = createGraphFunctionEvaluator(functions[feature.functionBIndex ?? 1], graphConfig);
    return evaluatorA && evaluatorB
      ? {
          feature,
          firstEvaluator: evaluatorA,
          secondEvaluator: evaluatorB,
        }
      : null;
  }

  if (feature.kind === "region_curve_axis" && feature.axis !== "y") {
    const evaluator = createGraphFunctionEvaluator(functions[feature.functionIndex ?? 0], graphConfig);
    return evaluator
      ? {
          feature,
          firstEvaluator: evaluator,
          secondEvaluator: () => 0,
        }
      : null;
  }

  return null;
}

function pushUniqueSorted(values: number[], value: number) {
  if (!Number.isFinite(value)) return;
  if (values.some((candidate) => Math.abs(candidate - value) < 1e-6)) return;
  values.push(value);
}

function explicitClipSampleXs(region: VerticalRegionDefinition, clipEvaluator: (x: number) => number | null, xMin: number, xMax: number) {
  const baseXs: number[] = [];
  const samples = 180;
  for (let index = 0; index <= samples; index += 1) {
    baseXs.push(xMin + ((xMax - xMin) * index) / samples);
  }
  const xs = [...baseXs];

  for (let index = 0; index < baseXs.length - 1; index += 1) {
    const left = baseXs[index];
    const right = baseXs[index + 1];
    [region.firstEvaluator, region.secondEvaluator].forEach((boundaryEvaluator) => {
      const root = findRootBetween(
        (x) => {
          const clipY = clipEvaluator(x);
          const boundaryY = boundaryEvaluator(x);
          return clipY === null || boundaryY === null ? null : clipY - boundaryY;
        },
        left,
        right,
      );
      if (root !== null) pushUniqueSorted(xs, root);
    });
  }

  return xs.sort((left, right) => left - right);
}

function clippedVerticalBandAtX(
  region: VerticalRegionDefinition,
  clipEvaluator: (x: number) => number | null,
  feature: GraphFeature,
  x: number,
) {
  const firstY = region.firstEvaluator(x);
  const secondY = region.secondEvaluator(x);
  const clipY = clipEvaluator(x);
  if (firstY === null || secondY === null || clipY === null) return null;

  const lower = Math.min(firstY, secondY);
  const upper = Math.max(firstY, secondY);
  const keepUpperSide = clippedRegionKeepsPositive(feature);
  const clippedLower = keepUpperSide ? Math.max(lower, clipY) : lower;
  const clippedUpper = keepUpperSide ? upper : Math.min(upper, clipY);
  if (clippedUpper < clippedLower - 1e-8) return null;
  return { lower: clippedLower, upper: clippedUpper };
}

function buildClippedVerticalRegionGeometries(
  region: VerticalRegionDefinition,
  clipEvaluator: (x: number) => number | null,
  feature: GraphFeature,
  graphConfig: GraphConfig,
) {
  const interval = boundedGridInterval(region.feature, graphConfig);
  if (!interval) return [];

  const xs = explicitClipSampleXs(region, clipEvaluator, interval.xMin, interval.xMax);
  const geometries: RegionGeometry[] = [];
  let upperPoints: GraphPoint[] = [];
  let lowerPoints: GraphPoint[] = [];

  const pushSegment = () => {
    if (upperPoints.length < 2 || lowerPoints.length < 2) {
      upperPoints = [];
      lowerPoints = [];
      return;
    }

    const clippedPolygon = clipPolygonToRect([...upperPoints, ...lowerPoints.reverse()], gridClipRect(graphConfig));
    if (clippedPolygon.length >= 3) {
      geometries.push({
        polygon: clippedPolygon,
        area: polygonArea(clippedPolygon),
        labelPoint: polygonCenter(clippedPolygon),
      });
    }
    upperPoints = [];
    lowerPoints = [];
  };

  xs.forEach((x) => {
    const band = clippedVerticalBandAtX(region, clipEvaluator, feature, x);
    if (!band) {
      pushSegment();
      return;
    }
    upperPoints.push([x, band.upper]);
    lowerPoints.push([x, band.lower]);
  });
  pushSegment();

  return geometries;
}

function createClipBoundaryScalar(graphFunction: GraphFunction | undefined, graphConfig: GraphConfig) {
  if (!graphFunction?.expression.trim()) return null;

  if (graphFunction.kind === "relation") {
    try {
      const evaluator = createImplicitEvaluator(graphFunction.expression);
      return ([x, y]: GraphPoint) => finiteImplicitValue(evaluator, x, y);
    } catch {
      return null;
    }
  }

  const evaluator = createGraphFunctionEvaluator(graphFunction, graphConfig);
  if (!evaluator) return null;
  return ([x, y]: GraphPoint) => {
    const boundaryY = evaluator(x);
    return boundaryY === null ? null : y - boundaryY;
  };
}

function clippedRegionKeepsPositive(feature: GraphFeature) {
  const side = feature.clipSide ?? "inside";
  return side === "above" || side === "right" || side === "outside";
}

function clipPolygonByScalar(points: GraphPoint[], scalar: (point: GraphPoint) => number | null, keepPositive: boolean) {
  if (!points.length) return [];
  const epsilon = 1e-9;
  const isInside = (value: number | null) => value !== null && (keepPositive ? value >= -epsilon : value <= epsilon);
  const intersection = (start: GraphPoint, end: GraphPoint, startValue: number, endValue: number): GraphPoint => {
    const denominator = startValue - endValue;
    const ratio = Math.abs(denominator) < epsilon ? 0 : clamp(startValue / denominator, 0, 1);
    return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
  };

  const clipped: GraphPoint[] = [];
  let previous = points.at(-1) as GraphPoint;
  let previousValue = scalar(previous);
  let previousInside = isInside(previousValue);

  points.forEach((current) => {
    const currentValue = scalar(current);
    const currentInside = isInside(currentValue);

    if (currentInside) {
      if (!previousInside && previousValue !== null && currentValue !== null) {
        clipped.push(intersection(previous, current, previousValue, currentValue));
      }
      clipped.push(current);
    } else if (previousInside && previousValue !== null && currentValue !== null) {
      clipped.push(intersection(previous, current, previousValue, currentValue));
    }

    previous = current;
    previousValue = currentValue;
    previousInside = currentInside;
  });

  return clipped.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}

function createClippedRegionPolygon(
  board: JXG.Board,
  feature: GraphFeature,
  graphConfig: GraphConfig,
  functions: GraphFunction[],
  featureIndex: number,
  color: string,
  onLabelMove?: (x: number, y: number) => void,
) {
  const features = graphFeatures(graphConfig);
  const baseIndex = resolvedBaseRegionIndex(features, feature, featureIndex);
  const baseFeature = baseIndex === null ? undefined : features[baseIndex];
  const clipFunction = functions[feature.clipFunctionIndex ?? feature.functionIndex ?? 0];
  const verticalRegion = buildVerticalRegionDefinition(baseFeature, graphConfig, functions);
  const clipEvaluator = createGraphFunctionEvaluator(clipFunction, graphConfig);

  if (verticalRegion && clipEvaluator) {
    const geometries = buildClippedVerticalRegionGeometries(verticalRegion, clipEvaluator, feature, graphConfig);
    drawRegionGeometries(board, geometries, feature, color, onLabelMove);
    return;
  }

  const baseGeometry = buildRegionGeometryFromFeature(baseFeature, graphConfig, functions);
  const boundaryScalar = createClipBoundaryScalar(clipFunction, graphConfig);
  if (!baseGeometry || !boundaryScalar) return;

  const clippedPolygon = clipPolygonToRect(
    clipPolygonByScalar(baseGeometry.polygon, boundaryScalar, clippedRegionKeepsPositive(feature)),
    gridClipRect(graphConfig),
  );
  if (clippedPolygon.length < 3) return;

  drawRegionGeometry(
    board,
    {
      polygon: clippedPolygon,
      area: polygonArea(clippedPolygon),
      labelPoint: polygonCenter(clippedPolygon),
    },
    feature,
    color,
    onLabelMove,
  );
}

function findRootBetween(evaluator: (x: number) => number | null, xMin: number, xMax: number) {
  if (xMax <= xMin) return null;
  const samples = 160;
  let previousX = xMin;
  let previousY = evaluator(previousX);

  for (let index = 1; index <= samples; index += 1) {
    const x = xMin + ((xMax - xMin) * index) / samples;
    const y = evaluator(x);
    if (y === null || previousY === null) {
      previousX = x;
      previousY = y;
      continue;
    }
    if (Math.abs(y) < 1e-8) return x;
    if (previousY === 0 || y * previousY < 0) {
      let low = previousX;
      let high = x;
      for (let step = 0; step < 40; step += 1) {
        const midpoint = (low + high) / 2;
        const midpointY = evaluator(midpoint);
        if (midpointY === null) break;
        if (Math.abs(midpointY) < 1e-8) return midpoint;
        if ((evaluator(low) ?? 0) * midpointY <= 0) {
          high = midpoint;
        } else {
          low = midpoint;
        }
      }
      return (low + high) / 2;
    }
    previousX = x;
    previousY = y;
  }
  return null;
}

function derivativeAt(evaluator: (x: number) => number | null, x: number, h: number) {
  const left = evaluator(x - h);
  const right = evaluator(x + h);
  if (left === null || right === null) return null;
  return (right - left) / (2 * h);
}

function findTurningPoint(evaluator: (x: number) => number | null, xMin: number, xMax: number) {
  if (xMax <= xMin) return null;
  const span = xMax - xMin;
  const h = Math.max(span / 10000, 1e-5);
  const root = findRootBetween((x) => derivativeAt(evaluator, x, h), xMin, xMax);
  if (root === null) return null;
  const y = evaluator(root);
  return y === null ? null : ([root, y] as [number, number]);
}

function finiteImplicitValue(evaluator: (x: number, y: number) => number, x: number, y: number) {
  try {
    const value = evaluator(x, y);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function uniqueScalar(values: number[], value: number) {
  if (!Number.isFinite(value)) return;
  if (values.some((candidate) => Math.abs(candidate - value) < 1e-5)) return;
  values.push(value);
}

function findScalarRoots(evaluator: (value: number) => number | null, min: number, max: number) {
  if (max <= min) return [];
  const roots: number[] = [];
  const samples = 260;
  const epsilon = 1e-7;
  let previousValue = min;
  let previousResult = evaluator(previousValue);

  if (previousResult !== null && Math.abs(previousResult) < epsilon) uniqueScalar(roots, previousValue);

  for (let index = 1; index <= samples; index += 1) {
    const currentValue = min + ((max - min) * index) / samples;
    const currentResult = evaluator(currentValue);

    if (currentResult === null || previousResult === null) {
      previousValue = currentValue;
      previousResult = currentResult;
      continue;
    }

    if (Math.abs(currentResult) < epsilon) uniqueScalar(roots, currentValue);
    if (previousResult * currentResult < 0) {
      let low = previousValue;
      let high = currentValue;
      let lowResult = previousResult;

      for (let step = 0; step < 45; step += 1) {
        const midpoint = (low + high) / 2;
        const midpointResult = evaluator(midpoint);
        if (midpointResult === null) break;
        if (Math.abs(midpointResult) < epsilon) {
          low = midpoint;
          high = midpoint;
          break;
        }
        if (lowResult * midpointResult <= 0) {
          high = midpoint;
        } else {
          low = midpoint;
          lowResult = midpointResult;
        }
      }
      uniqueScalar(roots, (low + high) / 2);
    }

    previousValue = currentValue;
    previousResult = currentResult;
  }

  return roots.sort((left, right) => left - right);
}

export function snapImplicitRelationPointAtX(
  expression: string,
  x: number | undefined,
  preferredY: number | undefined,
  graphConfig: GraphConfig,
): [number, number] | null {
  if (!Number.isFinite(x)) return null;
  const rect = gridClipRect(graphConfig);
  const fixedX = x as number;
  if (fixedX < rect.xMin || fixedX > rect.xMax) return null;

  let evaluator: (x: number, y: number) => number;
  try {
    evaluator = createImplicitEvaluator(expression);
  } catch {
    return null;
  }

  const roots = findScalarRoots((candidateY) => finiteImplicitValue(evaluator, fixedX, candidateY), rect.yMin, rect.yMax);
  if (!roots.length) return null;
  const targetY = Number.isFinite(preferredY) ? (preferredY as number) : 0;
  const y = roots.reduce((best, candidate) => (Math.abs(candidate - targetY) < Math.abs(best - targetY) ? candidate : best), roots[0]);
  return [fixedX, y];
}

export function snapImplicitRelationPointAtY(
  expression: string,
  y: number | undefined,
  preferredX: number | undefined,
  graphConfig: GraphConfig,
): [number, number] | null {
  if (!Number.isFinite(y)) return null;
  const rect = gridClipRect(graphConfig);
  const fixedY = y as number;
  if (fixedY < rect.yMin || fixedY > rect.yMax) return null;

  let evaluator: (x: number, y: number) => number;
  try {
    evaluator = createImplicitEvaluator(expression);
  } catch {
    return null;
  }

  const roots = findScalarRoots((candidateX) => finiteImplicitValue(evaluator, candidateX, fixedY), rect.xMin, rect.xMax);
  if (!roots.length) return null;
  const targetX = Number.isFinite(preferredX) ? (preferredX as number) : 0;
  const x = roots.reduce((best, candidate) => (Math.abs(candidate - targetX) < Math.abs(best - targetX) ? candidate : best), roots[0]);
  return [x, fixedY];
}

export function snapImplicitRelationPoint(
  expression: string,
  x: number | undefined,
  y: number | undefined,
  graphConfig: GraphConfig,
): [number, number] | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const fixedXCandidate = snapImplicitRelationPointAtX(expression, x, y, graphConfig);
  const fixedYCandidate = snapImplicitRelationPointAtY(expression, y, x, graphConfig);
  const candidates = [fixedXCandidate, fixedYCandidate].filter(Boolean) as [number, number][];
  if (!candidates.length) return null;

  const rect = gridClipRect(graphConfig);
  const xSpan = graphSpan(rect.xMin, rect.xMax);
  const ySpan = graphSpan(rect.yMin, rect.yMax);
  return candidates.reduce((best, candidate) => {
    const bestDistance = ((best[0] - (x as number)) / xSpan) ** 2 + ((best[1] - (y as number)) / ySpan) ** 2;
    const candidateDistance = ((candidate[0] - (x as number)) / xSpan) ** 2 + ((candidate[1] - (y as number)) / ySpan) ** 2;
    return candidateDistance < bestDistance ? candidate : best;
  }, candidates[0]);
}

function implicitSlopeAt(expression: string, x: number, y: number, graphConfig: GraphConfig) {
  const evaluator = createImplicitEvaluator(expression);
  const { xMin, xMax, yMin, yMax } = gridClipRect(graphConfig);
  const hx = Math.max(graphSpan(xMin, xMax) / 10000, 1e-5);
  const hy = Math.max(graphSpan(yMin, yMax) / 10000, 1e-5);
  const left = finiteImplicitValue(evaluator, x - hx, y);
  const right = finiteImplicitValue(evaluator, x + hx, y);
  const down = finiteImplicitValue(evaluator, x, y - hy);
  const up = finiteImplicitValue(evaluator, x, y + hy);
  if (left === null || right === null || down === null || up === null) return null;

  const fx = (right - left) / (2 * hx);
  const fy = (up - down) / (2 * hy);
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null;
  if (Math.abs(fy) < 1e-9) return Math.abs(fx) < 1e-9 ? null : Number.POSITIVE_INFINITY;
  return -fx / fy;
}

function uniquePoint(points: GraphPoint[], point: GraphPoint) {
  if (points.some(([x, y]) => Math.abs(x - point[0]) < 1e-7 && Math.abs(y - point[1]) < 1e-7)) return;
  points.push(point);
}

function tangentLineEndpoints(point: GraphPoint, slope: number, graphConfig: GraphConfig) {
  const [x0, y0] = point;
  const rect = gridClipRect(graphConfig);
  const points: GraphPoint[] = [];

  if (!Number.isFinite(slope)) {
    if (x0 < rect.xMin || x0 > rect.xMax) return null;
    return [
      [x0, rect.yMin],
      [x0, rect.yMax],
    ] as [GraphPoint, GraphPoint];
  }

  if (Math.abs(slope) < 1e-12) {
    if (y0 < rect.yMin || y0 > rect.yMax) return null;
    return [
      [rect.xMin, y0],
      [rect.xMax, y0],
    ] as [GraphPoint, GraphPoint];
  }

  const yAtLeft = y0 + slope * (rect.xMin - x0);
  if (yAtLeft >= rect.yMin && yAtLeft <= rect.yMax) uniquePoint(points, [rect.xMin, yAtLeft]);

  const yAtRight = y0 + slope * (rect.xMax - x0);
  if (yAtRight >= rect.yMin && yAtRight <= rect.yMax) uniquePoint(points, [rect.xMax, yAtRight]);

  const xAtBottom = x0 + (rect.yMin - y0) / slope;
  if (xAtBottom >= rect.xMin && xAtBottom <= rect.xMax) uniquePoint(points, [xAtBottom, rect.yMin]);

  const xAtTop = x0 + (rect.yMax - y0) / slope;
  if (xAtTop >= rect.xMin && xAtTop <= rect.xMax) uniquePoint(points, [xAtTop, rect.yMax]);

  if (points.length < 2) return null;

  let best: [GraphPoint, GraphPoint] = [points[0], points[1]];
  let bestDistance = -1;
  points.forEach((start, startIndex) => {
    points.slice(startIndex + 1).forEach((end) => {
      const distance = (start[0] - end[0]) ** 2 + (start[1] - end[1]) ** 2;
      if (distance > bestDistance) {
        best = [start, end];
        bestDistance = distance;
      }
    });
  });

  return best;
}

function createDependentPoint(board: JXG.Board, x: () => number, y: () => number) {
  return board.create("point", [x, y], {
    fixed: true,
    visible: false,
    withLabel: false,
    showInfobox: false,
  } as Record<string, unknown>);
}

function renderTangentFeature(
  board: JXG.Board,
  feature: GraphFeature,
  graphConfig: GraphConfig,
  graphFunction: GraphFunction | undefined,
  color: string,
  onLabelMove?: (x: number, y: number) => void,
  onPointMove?: (x: number, y: number, previousX: number, previousY: number) => void,
) {
  if (!graphFunction) return;

  let handlePointMove = onPointMove;
  let computeTangent: (x: number, y: number) => { point: GraphPoint; slope: number; endpoints: [GraphPoint, GraphPoint] } | null;

  if (graphFunction.kind === "relation") {
    computeTangent = (candidateX, candidateY) => {
      const point = snapImplicitRelationPoint(graphFunction.expression, candidateX, candidateY, graphConfig);
      if (!point) return null;
      const slope = implicitSlopeAt(graphFunction.expression, point[0], point[1], graphConfig);
      if (slope === null) return null;
      const endpoints = tangentLineEndpoints(point, slope, graphConfig);
      return endpoints ? { point, slope, endpoints } : null;
    };
    handlePointMove = onPointMove
      ? (nextX, nextY, previousX, previousY) => {
          const tangent = computeTangent(nextX, nextY);
          onPointMove(tangent?.point[0] ?? nextX, tangent?.point[1] ?? nextY, previousX, previousY);
        }
      : undefined;
  } else {
    const evaluator = createGraphFunctionEvaluator(graphFunction, graphConfig);
    if (!evaluator) return;
    const { xMin, xMax } = gridClipRect(graphConfig);
    const derivativeStep = Math.max(graphSpan(xMin, xMax) / 10000, 1e-5);
    computeTangent = (candidateX, candidateY) => {
      const y = evaluator(candidateX);
      if (y === null) return null;
      const slope = derivativeAt(evaluator, candidateX, derivativeStep);
      if (slope === null) return null;
      const point: GraphPoint = [candidateX, y];
      const endpoints = tangentLineEndpoints(point, slope, graphConfig);
      return endpoints ? { point, slope, endpoints } : { point: [candidateX, candidateY], slope, endpoints: [point, point] };
    };
    handlePointMove = onPointMove
      ? (nextX, nextY, previousX, previousY) => {
          const tangent = computeTangent(nextX, nextY);
          onPointMove(tangent?.point[0] ?? nextX, tangent?.point[1] ?? nextY, previousX, previousY);
        }
      : undefined;
  }

  const initialTangent = computeTangent(feature.x ?? 0, feature.y ?? 0);
  if (!initialTangent) return;

  const tangentPoint = createFeaturePoint(
    board,
    initialTangent.point[0],
    initialTangent.point[1],
    feature,
    color,
    onLabelMove,
    initialTangent.slope,
    handlePointMove,
    (nextX, nextY) => {
      const tangent = computeTangent(nextX, nextY);
      if (!tangent) return null;
      return { x: tangent.point[0], y: tangent.point[1], value: tangent.slope };
    },
  );
  if (!tangentPoint) return;

  const currentTangent = () => {
    const coords = textCoordinates(tangentPoint);
    return coords ? (computeTangent(coords[0], coords[1]) ?? initialTangent) : initialTangent;
  };
  const startPoint = createDependentPoint(
    board,
    () => currentTangent().endpoints[0][0],
    () => currentTangent().endpoints[0][1],
  );
  const endPoint = createDependentPoint(
    board,
    () => currentTangent().endpoints[1][0],
    () => currentTangent().endpoints[1][1],
  );

  board.create("segment", [startPoint, endPoint], {
    fixed: true,
    highlight: false,
    strokeColor: color,
    strokeWidth: lineWeight(feature.strokeWidth, 2),
    dash: lineDash(feature.strokeStyle),
    layer: GRAPH_LAYERS.function,
    ...ROUNDED_GRAPH_STROKE,
  } as Record<string, unknown>);
}

function intersectionPointWithAxis(
  graphFunction: GraphFunction | undefined,
  graphConfig: GraphConfig,
  feature: GraphFeature,
): GraphPoint | null {
  if (!graphFunction) return null;

  const axis = feature.intersectionTarget === "yAxis" ? "y" : "x";
  const rect = gridClipRect(graphConfig);
  const { xMin, xMax } = boundedInterval(feature, graphConfig);

  if (graphFunction.kind === "relation") {
    let evaluator: (x: number, y: number) => number;
    try {
      evaluator = createImplicitEvaluator(graphFunction.expression);
    } catch {
      return null;
    }

    if (axis === "y") {
      if (0 < rect.xMin || 0 > rect.xMax) return null;
      const roots = findScalarRoots((candidateY) => finiteImplicitValue(evaluator, 0, candidateY), rect.yMin, rect.yMax);
      if (!roots.length) return null;
      const targetY = Number.isFinite(feature.y) ? (feature.y as number) : 0;
      const y = roots.reduce((best, candidate) => (Math.abs(candidate - targetY) < Math.abs(best - targetY) ? candidate : best), roots[0]);
      return [0, y];
    }

    const roots = findScalarRoots((candidateX) => finiteImplicitValue(evaluator, candidateX, 0), xMin, xMax);
    if (!roots.length) return null;
    const targetX = Number.isFinite(feature.x) ? (feature.x as number) : 0;
    const x = roots.reduce((best, candidate) => (Math.abs(candidate - targetX) < Math.abs(best - targetX) ? candidate : best), roots[0]);
    return [x, 0];
  }

  const evaluator = createGraphFunctionEvaluator(graphFunction, graphConfig);
  if (!evaluator) return null;

  if (axis === "y") {
    if (0 < xMin || 0 > xMax) return null;
    const y = evaluator(0);
    if (y === null || y < rect.yMin || y > rect.yMax) return null;
    return [0, y];
  }

  const x = findRootBetween((candidateX) => evaluator(candidateX), xMin, xMax);
  if (x === null) return null;
  return [x, 0];
}

function renderGraphFeature(
  board: JXG.Board,
  feature: GraphFeature,
  graphConfig: GraphConfig,
  functions: GraphFunction[],
  featureIndex: number,
  solutionColor?: string,
  solutionFeatureColor?: string,
  onLabelMove?: (featureIndex: number, x: number, y: number) => void,
  onPointMove?: (featureIndex: number, x: number, y: number, previousX: number, previousY: number) => void,
  onFreeLabelMove?: (featureIndex: number, x: number, y: number) => void,
) {
  const color =
    solutionColor ??
    (feature.solutionOnly === true ? solutionFeatureColor : undefined) ??
    feature.color ??
    FUNCTION_COLORS[featureIndex % FUNCTION_COLORS.length];
  const handleLabelMove = onLabelMove ? (x: number, y: number) => onLabelMove(featureIndex, x, y) : undefined;
  const handlePointMove = onPointMove
    ? (x: number, y: number, previousX: number, previousY: number) => onPointMove(featureIndex, x, y, previousX, previousY)
    : undefined;
  const handleFreeLabelMove = onFreeLabelMove ? (x: number, y: number) => onFreeLabelMove(featureIndex, x, y) : undefined;
  const evaluatorA = createGraphFunctionEvaluator(functions[feature.functionAIndex ?? feature.functionIndex ?? 0], graphConfig);
  const evaluatorB = createGraphFunctionEvaluator(functions[feature.functionBIndex ?? 1], graphConfig);
  const singleEvaluator = createGraphFunctionEvaluator(functions[feature.functionIndex ?? 0], graphConfig);
  const { xMin, xMax } = boundedInterval(feature, graphConfig);

  if (feature.kind === "point") {
    createFeaturePoint(board, feature.x ?? 0, feature.y ?? 0, feature, color, handleLabelMove, undefined, handlePointMove);
    return;
  }

  if (feature.kind === "label") {
    createFreeLabel(board, feature, color, handleFreeLabelMove ?? handleLabelMove);
    return;
  }

  if (feature.kind === "line_segment") {
    createLineSegmentFeature(
      board,
      featureWithAutoNaturalAsymptoteSpan(feature, graphConfig, functions),
      graphConfig,
      color,
      handleLabelMove,
    );
    return;
  }

  if (feature.kind === "angle_marker") {
    createAngleMarkerFeature(board, feature, graphConfig, color, handleLabelMove);
    return;
  }

  if (feature.kind === "tangent") {
    renderTangentFeature(board, feature, graphConfig, functions[feature.functionIndex ?? 0], color, handleLabelMove, handlePointMove);
    return;
  }

  if (feature.kind === "region_clipped_by_curve") {
    if (createNativeClippedRegion(board, feature, graphConfig, functions, featureIndex, color, handleLabelMove)) return;
    createClippedRegionPolygon(board, feature, graphConfig, functions, featureIndex, color, handleLabelMove);
    return;
  }

  if (feature.kind === "region_between_curves" && evaluatorA && evaluatorB) {
    const nativeEvaluatorA = nativeExplicitEvaluator(functions[feature.functionAIndex ?? feature.functionIndex ?? 0], graphConfig);
    const nativeEvaluatorB = nativeExplicitEvaluator(functions[feature.functionBIndex ?? 1], graphConfig);
    if (
      nativeEvaluatorA &&
      nativeEvaluatorB &&
      createNativeRegionBetweenCurves(board, nativeEvaluatorA, nativeEvaluatorB, feature, graphConfig, color, handleLabelMove)
    ) {
      return;
    }
    createRegionPolygon(board, evaluatorA, evaluatorB, feature, graphConfig, color, handleLabelMove);
    return;
  }

  if (feature.kind === "region_curve_axis" && singleEvaluator) {
    if (feature.axis === "y") {
      createRegionToYAxisPolygon(board, singleEvaluator, feature, graphConfig, color, handleLabelMove);
    } else {
      const nativeEvaluator = nativeExplicitEvaluator(functions[feature.functionIndex ?? 0], graphConfig);
      if (
        nativeEvaluator &&
        createNativeRegionBetweenCurves(board, nativeEvaluator, () => 0, feature, graphConfig, color, handleLabelMove)
      ) {
        return;
      }
      createRegionPolygon(board, singleEvaluator, () => 0, feature, graphConfig, color, handleLabelMove);
    }
    return;
  }

  if (feature.kind === "intersection" && (feature.intersectionTarget ?? "function") !== "function") {
    const point = intersectionPointWithAxis(functions[feature.functionAIndex ?? feature.functionIndex ?? 0], graphConfig, feature);
    if (point) createFeaturePoint(board, point[0], point[1], feature, color, handleLabelMove);
    return;
  }

  if (feature.kind === "intersection" && evaluatorA && evaluatorB) {
    const root = findRootBetween(
      (x) => {
        const yA = evaluatorA(x);
        const yB = evaluatorB(x);
        return yA === null || yB === null ? null : yA - yB;
      },
      xMin,
      xMax,
    );
    if (root === null) return;
    const y = evaluatorA(root);
    if (y !== null) createFeaturePoint(board, root, y, feature, color, handleLabelMove);
    return;
  }

  if (feature.kind === "turning_point" && singleEvaluator) {
    const point = findTurningPoint(singleEvaluator, xMin, xMax);
    if (point) createFeaturePoint(board, point[0], point[1], feature, color, handleLabelMove);
  }
}

export function FunctionGraph({
  graphConfig,
  previewAnchor,
  solutionColor,
  solutionFeatureColor,
  solutionFunctionColor,
  onGraphConfigChange,
  onGraphConfigPatch,
}: FunctionGraphProps) {
  const boardId = useMemo(() => `jxg-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    const features = graphFeatures(graphConfig);
    const functions = graphFunctions(graphConfig).filter((graphFunction) =>
      graphFunction.kind === "piecewise" ? graphFunction.pieces?.some((piece) => piece.expression.trim()) : graphFunction.expression.trim(),
    );
    if (!graphConfig) return;

    const {
      xMin,
      xMax,
      yMin,
      yMax,
      xMajorStep,
      yMajorStep,
      xMinorStep,
      yMinorStep,
      xAxisExtension,
      yAxisExtension,
      boardPaddingX,
      boardPaddingY,
    } = graphBoardSizing(graphConfig);
    const showAxes = graphConfig.showAxes ?? true;
    const showGrid = graphConfig.showGrid ?? true;
    const showMajorGrid = graphConfig.showMajorGrid ?? true;
    const showMinorGrid = graphConfig.showMinorGrid ?? false;
    const axisArrows = graphAxisArrowVisibility(graphConfig);
    const showAxisLabels = graphConfig.showAxisLabels ?? true;
    const showAxisNumbers = graphConfig.showAxisNumbers ?? true;
    const showFunctionArrows = graphConfig.showFunctionArrows ?? true;
    const gridMajorColor = graphConfig.gridMajorColor || GRID_MAJOR_COLOR;
    const gridMinorColor = graphConfig.gridMinorColor || GRID_MINOR_COLOR;
    const displayWidth = graphConfig.widthPx ?? DEFAULT_GRAPH_WIDTH;
    const displayHeight = graphDisplayHeight(graphConfig);
    const xLabelStep = axisLabelStep({
      graphConfig,
      axis: "x",
      majorStep: xMajorStep,
    });
    const yLabelStep = axisLabelStep({
      graphConfig,
      axis: "y",
      majorStep: yMajorStep,
    });

    const board = JXG.JSXGraph.initBoard(boardId, {
      boundingbox: functionBoardBoundingBox(
        xMin - boardPaddingX,
        yMax + boardPaddingY,
        xMax + boardPaddingX,
        yMin - boardPaddingY,
        displayWidth,
        displayHeight,
        graphConfig.equalScale === true,
      ),
      axis: false,
      grid: false,
      showCopyright: false,
      showNavigation: false,
    });

    const commitAxisLabelPosition = (axis: "x" | "y", x: number, y: number) => {
      const patch = axis === "x" ? { xAxisLabelX: x, xAxisLabelY: y } : { yAxisLabelX: x, yAxisLabelY: y };
      if (onGraphConfigPatch) onGraphConfigPatch(patch);
      else if (onGraphConfigChange) onGraphConfigChange({ ...graphConfig, ...patch });
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

      if (showMinorGrid && xMinorStep && xMinorStep < xMajorStep) {
        const lineAttributes = gridLineAttributes(false);
        numericRange(xMin, xMax, xMinorStep).forEach((x) => {
          if (isMultiple(x, xMajorStep)) return;
          makePassiveDecoration(
            board.create(
              "segment",
              [
                [x, yMin],
                [x, yMax],
              ],
              lineAttributes,
            ),
          );
        });
      }

      if (showMinorGrid && yMinorStep && yMinorStep < yMajorStep) {
        const lineAttributes = gridLineAttributes(false);
        numericRange(yMin, yMax, yMinorStep).forEach((y) => {
          if (isMultiple(y, yMajorStep)) return;
          makePassiveDecoration(
            board.create(
              "segment",
              [
                [xMin, y],
                [xMax, y],
              ],
              lineAttributes,
            ),
          );
        });
      }

      if (showMajorGrid) {
        const lineAttributes = gridLineAttributes(true);
        numericRange(xMin, xMax, xMajorStep).forEach((x) => {
          makePassiveDecoration(
            board.create(
              "segment",
              [
                [x, yMin],
                [x, yMax],
              ],
              lineAttributes,
            ),
          );
        });
        numericRange(yMin, yMax, yMajorStep).forEach((y) => {
          makePassiveDecoration(
            board.create(
              "segment",
              [
                [xMin, y],
                [xMax, y],
              ],
              lineAttributes,
            ),
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

      makePassiveDecoration(
        board.create(
          "axis",
          [
            [xMin - xAxisExtension, 0],
            [xMax + xAxisExtension, 0],
          ],
          {
            ...axisAttributes,
            firstArrow: axisArrows.xMin ? axisArrowAttributes() : false,
            lastArrow: axisArrows.xMax ? axisArrowAttributes() : false,
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
                ...graphLabelAttributes(`${PASSIVE_GRAPH_DECORATION_CSS} color:${AXIS_COLOR};`),
                strokeColor: AXIS_COLOR,
                layer: GRAPH_LAYERS.axisLabel,
              },
            },
          } as Record<string, unknown>,
        ),
      );
      makePassiveDecoration(
        board.create(
          "axis",
          [
            [0, yMin - yAxisExtension],
            [0, yMax + yAxisExtension],
          ],
          {
            ...axisAttributes,
            firstArrow: axisArrows.yMin ? axisArrowAttributes() : false,
            lastArrow: axisArrows.yMax ? axisArrowAttributes() : false,
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
                ...graphLabelAttributes(`${PASSIVE_GRAPH_DECORATION_CSS} color:${AXIS_COLOR};`),
                strokeColor: AXIS_COLOR,
                layer: GRAPH_LAYERS.axisLabel,
              },
            },
          } as Record<string, unknown>,
        ),
      );

      if (showAxisLabels) {
        const [defaultXAxisLabelX, defaultXAxisLabelY] = defaultXAxisLabelPosition(xMax, xAxisExtension);
        const [defaultYAxisLabelX, defaultYAxisLabelY] = defaultYAxisLabelPosition(yMax, yAxisExtension);
        const xAxisLabelX = Number.isFinite(graphConfig.xAxisLabelX) ? (graphConfig.xAxisLabelX as number) : defaultXAxisLabelX;
        const xAxisLabelY = Number.isFinite(graphConfig.xAxisLabelY) ? (graphConfig.xAxisLabelY as number) : defaultXAxisLabelY;
        const yAxisLabelX = Number.isFinite(graphConfig.yAxisLabelX) ? (graphConfig.yAxisLabelX as number) : defaultYAxisLabelX;
        const yAxisLabelY = Number.isFinite(graphConfig.yAxisLabelY) ? (graphConfig.yAxisLabelY as number) : defaultYAxisLabelY;

        createAxisLabelText(
          board,
          xAxisLabelX,
          xAxisLabelY,
          graphConfig.xAxisLabel?.trim() || "x",
          [-10, 8],
          "middle",
          "bottom",
          onGraphConfigChange || onGraphConfigPatch ? (x, y) => commitAxisLabelPosition("x", x, y) : undefined,
        );
        createAxisLabelText(
          board,
          yAxisLabelX,
          yAxisLabelY,
          graphConfig.yAxisLabel?.trim() || "y",
          [8, -8],
          "left",
          "bottom",
          onGraphConfigChange || onGraphConfigPatch ? (x, y) => commitAxisLabelPosition("y", x, y) : undefined,
        );
      }
    }

    renderPolarGrid(board, graphConfig);
    renderSlopeField(board, graphConfig, xMajorStep, yMajorStep, xMin, xMax, yMin, yMax);

    const commitFunctionLabelPosition = (functionIndex: number, x: number, y: number) => {
      if (!onGraphConfigChange) return;
      const nextFunctions = (graphConfig.functions ?? functions).map((graphFunction, index) =>
        index === functionIndex ? { ...graphFunction, labelX: x, labelY: y } : graphFunction,
      );
      onGraphConfigChange({ ...graphConfig, functions: nextFunctions });
    };

    const commitFeatureLabelPosition = (featureIndex: number, x: number, y: number) => {
      if (!onGraphConfigChange) return;
      const nextFeatures = graphFeatures(graphConfig).map((feature, index) =>
        index === featureIndex ? { ...feature, labelX: x, labelY: y } : feature,
      );
      onGraphConfigChange({ ...graphConfig, features: nextFeatures });
    };

    const commitFreeLabelPosition = (featureIndex: number, x: number, y: number) => {
      if (!onGraphConfigChange) return;
      const nextFeatures = graphFeatures(graphConfig).map((feature, index) =>
        index === featureIndex ? { ...feature, x: Number(x.toFixed(6)), y: Number(y.toFixed(6)) } : feature,
      );
      onGraphConfigChange({ ...graphConfig, features: nextFeatures });
    };

    const commitFeaturePointPosition = (featureIndex: number, x: number, y: number, previousX: number, previousY: number) => {
      if (!onGraphConfigChange) return;
      const nextFeatures = graphFeatures(graphConfig).map((feature, index) =>
        index === featureIndex
          ? (() => {
              const deltaX = x - previousX;
              const deltaY = y - previousY;
              return {
                ...feature,
                x: Number(x.toFixed(6)),
                y: Number(y.toFixed(6)),
                labelX: Number.isFinite(feature.labelX) ? Number(((feature.labelX as number) + deltaX).toFixed(6)) : feature.labelX,
                labelY: Number.isFinite(feature.labelY) ? Number(((feature.labelY as number) + deltaY).toFixed(6)) : feature.labelY,
              };
            })()
          : feature,
      );
      onGraphConfigChange({ ...graphConfig, features: nextFeatures });
    };

    functions.forEach((graphFunction, index) => {
      if (!shouldShowGraphItem(graphFunction)) return;
      const color =
        solutionColor ??
        (graphFunction.solutionOnly === true ? solutionFunctionColor : undefined) ??
        graphFunction.color ??
        FUNCTION_COLORS[index % FUNCTION_COLORS.length];
      const strokeWidth = lineWeight(graphFunction.strokeWidth, DEFAULT_GRAPH_FUNCTION_STROKE_WIDTH);
      const dash = lineDash(graphFunction.strokeStyle);
      const functionAnchor = previewAnchor ? `${previewAnchor}/gf:${index}` : undefined;
      const functionPreviewAttributes = {
        "data-scroll-anchor": functionAnchor,
        "data-preview-module-anchor": functionAnchor ? "true" : undefined,
        "data-mauth-graph-function-index": String(index),
        "data-mauth-graph-function-kind": graphFunction.kind ?? "expression",
      };
      if (graphFunction.kind === "relation") {
        try {
          const evaluator = createImplicitEvaluator(graphFunction.expression);
          const domain = graphFunctionDomain(graphFunction, graphConfig);
          const relationCurve = board.create("implicitcurve", [evaluator, [domain.xStart, domain.xEnd], [yMin, yMax]], {
            name: graphFunction.label ?? `r${index + 1}`,
            strokeColor: color,
            strokeWidth,
            dash,
            strokeOpacity: 1,
            highlight: false,
            needsRegularUpdate: false,
            layer: GRAPH_LAYERS.function,
            ...ROUNDED_GRAPH_STROKE,
          } as Record<string, unknown>);
          setRenderedDataAttributes(relationCurve, functionPreviewAttributes);
        } catch {
          // Invalid relation input should not prevent the rest of the graph from rendering.
        }
        return;
      }

      const pieces = intervalPieces(graphFunction, graphConfig);
      pieces.forEach((piece, pieceIndex) => {
        if (!piece.expression.trim() || piece.xEnd <= piece.xStart) return;
        let evaluator: (x: number) => number;
        try {
          evaluator = createEvaluator(piece.expression);
        } catch {
          return;
        }

        const renderRange = separateRangeFromStrictNaturalBoundaries(
          piece.expression,
          { xStart: piece.xStart, xEnd: piece.xEnd },
          graphConfig,
        );
        if (renderRange.xEnd <= renderRange.xStart) return;
        const plotRange = visiblePlotRange(evaluator, renderRange.xStart, renderRange.xEnd, yMin, yMax);
        if (!plotRange) return;

        const hasInternalStart =
          piece.isPiecewise && pieces.some((otherPiece, otherIndex) => otherIndex !== pieceIndex && sameX(otherPiece.xEnd, piece.xStart));
        const hasInternalEnd =
          piece.isPiecewise && pieces.some((otherPiece, otherIndex) => otherIndex !== pieceIndex && sameX(otherPiece.xStart, piece.xEnd));
        const drawStartArrow = showFunctionArrows && (!piece.isPiecewise || !hasInternalStart);
        const drawEndArrow = showFunctionArrows && (!piece.isPiecewise || !hasInternalEnd);
        const startArrow = drawStartArrow
          ? functionArrowGeometry(board, evaluator, plotRange.xStart, "start", plotRange.xStart, plotRange.xEnd)
          : null;
        const endArrow = drawEndArrow
          ? functionArrowGeometry(board, evaluator, plotRange.xEnd, "end", plotRange.xStart, plotRange.xEnd)
          : null;
        const curveStart = startArrow ? startArrow.baseCenter[0] : plotRange.xStart;
        const curveEnd = endArrow ? endArrow.baseCenter[0] : plotRange.xEnd;
        if (curveEnd <= curveStart) return;

        sampledFunctionCurveSegments(evaluator, curveStart, curveEnd, { yMin, yMax }).forEach((curveSegment, segmentIndex) => {
          const curve = board.create("curve", [curveSegment.xs, curveSegment.ys], {
            name: segmentIndex === 0 ? (graphFunction.label ?? `f${index + 1}`) : "",
            strokeColor: color,
            strokeWidth,
            dash,
            highlight: false,
            layer: GRAPH_LAYERS.function,
            ...ROUNDED_GRAPH_STROKE,
          } as Record<string, unknown>);
          setRenderedDataAttributes(curve, {
            ...functionPreviewAttributes,
            "data-mauth-graph-function-piece-index": String(pieceIndex),
            "data-mauth-graph-function-segment-index": String(segmentIndex),
          });
        });
        if (startArrow) createFunctionArrowhead(board, startArrow, color);
        if (endArrow) createFunctionArrowhead(board, endArrow, color);

        if (piece.isPiecewise) {
          if (!drawStartArrow) createEndpointMarker(board, evaluator, piece.xStart, piece.includeStart, color);
          if (!drawEndArrow) createEndpointMarker(board, evaluator, piece.xEnd, piece.includeEnd, color);
        }
      });
    });

    const hiddenBaseRegions = clippedRegionBaseIndexes(features);
    features.forEach((feature, index) => {
      if (!shouldShowGraphItem(feature)) return;
      if (hiddenBaseRegions.has(index)) return;
      renderGraphFeature(
        board,
        feature,
        graphConfig,
        functions,
        index,
        solutionColor,
        solutionFeatureColor,
        commitFeatureLabelPosition,
        commitFeaturePointPosition,
        commitFreeLabelPosition,
      );
    });

    renderGraph2DGeometry(board, graphConfig, solutionColor);

    functions.forEach((graphFunction, index) => {
      if (!shouldShowGraphItem(graphFunction) || !graphFunction.showLabel) return;
      const labelX = graphFunction.labelX ?? xMin;
      const labelY = graphFunction.labelY ?? yMax;
      createLabelText(
        board,
        labelX,
        labelY,
        functionLabelLatex(graphFunction, index),
        solutionColor ??
          (graphFunction.solutionOnly === true ? solutionFunctionColor : undefined) ??
          graphFunction.color ??
          FUNCTION_COLORS[index % FUNCTION_COLORS.length],
        onGraphConfigChange ? (x, y) => commitFunctionLabelPosition(index, x, y) : undefined,
      );
    });

    return () => {
      JXG.JSXGraph.freeBoard(board);
    };
  }, [
    boardId,
    graphConfig,
    onGraphConfigChange,
    onGraphConfigPatch,
    previewAnchor,
    solutionColor,
    solutionFeatureColor,
    solutionFunctionColor,
  ]);

  return (
    <div
      id={boardId}
      className="overflow-hidden bg-white"
      style={{
        height: graphDisplayHeight(graphConfig),
        maxWidth: "100%",
        width: graphConfig?.widthPx ?? DEFAULT_GRAPH_WIDTH,
      }}
    />
  );
}
