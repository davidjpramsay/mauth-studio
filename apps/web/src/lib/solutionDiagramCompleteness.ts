import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import { geometry2dData, geometry2dDataHasSolutionOnly } from "./diagramGeometry2d.ts";
import { graph3dConfigHasSolutionOnly } from "./diagramGraph3d.ts";
import { isSolutionOnlyGraphFeature, isSolutionOnlyGraphFunction } from "./diagramGraph2d.ts";
import { imageConfigHasSolutionOnly } from "./diagramImage.ts";
import { penroseConfigHasSolutionOnly } from "./diagramPenroseSolution.ts";
import { statsChartConfigHasSolutionOnly } from "./diagramStatsChart.ts";
import { vector2dConfigHasSolutionOnly } from "./diagramVector2d.ts";

type DiagramBlock = Extract<ContentBlock, { kind: "diagram" }>;

const PRESENTATION_ONLY_KEYS = new Set([
  "axisExtension",
  "axisExtensionMode",
  "axisLabelIntervalMode",
  "axisLabelMinSpacingPx",
  "axisLabelStepX",
  "axisLabelStepY",
  "barWidth",
  "color",
  "equalScale",
  "fillColor",
  "fillOpacity",
  "fontSizePt",
  "functionExtension",
  "functionExtensionLeft",
  "functionExtensionMode",
  "functionExtensionRight",
  "gridMajorColor",
  "gridMajorStep",
  "gridMajorStepX",
  "gridMajorStepY",
  "gridMinorColor",
  "gridMinorStep",
  "gridMinorStepX",
  "gridMinorStepY",
  "heightPx",
  "labelX",
  "labelY",
  "lineWidth",
  "lockAspectRatio",
  "markerSize",
  "scalePercent",
  "show",
  "showArrows",
  "showXAxisMinArrow",
  "showXAxisMaxArrow",
  "showYAxisMinArrow",
  "showYAxisMaxArrow",
  "showAxes",
  "showAxisLabels",
  "showAxisNumbers",
  "showFunctionArrows",
  "showGrid",
  "showGridBorder",
  "showMajorGrid",
  "showMinorGrid",
  "solutionOnly",
  "strokeColor",
  "strokeStyle",
  "strokeWidth",
  "widthPx",
  "xAxisLabelX",
  "xAxisLabelY",
  "yAxisLabelX",
  "yAxisLabelY",
]);

function answerValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(answerValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, entry]) => entry !== undefined && !PRESENTATION_ONLY_KEYS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, answerValue(entry)]),
  );
}

function substanceSource(config: GraphConfig) {
  const value = config.options?.substanceSource;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function dataAnswerContent(config: GraphConfig) {
  if (!config.data || typeof config.data !== "object" || Array.isArray(config.data)) return config.data;
  const data = { ...(config.data as Record<string, unknown>) };
  if (config.type === "graph3d" || config.type === "basic3d") {
    delete data.xRange;
    delete data.yRange;
    delete data.zRange;
  }
  if (config.type === "statsChart") {
    delete data.range;
    delete data.yRange;
  }
  return data;
}

/**
 * Returns only mathematical/answer-bearing diagram state. View bounds, sizing,
 * colours, grids, camera ranges, and other presentation controls are omitted so
 * resizing an untouched solution copy does not make it appear complete.
 */
export function diagramAnswerContent(config: GraphConfig) {
  return answerValue({
    type: config.type,
    expression: config.expression,
    latex: config.latex,
    functions: config.functions,
    features: config.features,
    data: dataAnswerContent(config),
    vector2d: config.metadata?.vector2d,
    xAxisLabel: config.xAxisLabel,
    yAxisLabel: config.yAxisLabel,
    substanceSource: substanceSource(config),
  });
}

export function diagramAnswerContentChanged(studentConfig: GraphConfig, solutionConfig: GraphConfig) {
  return JSON.stringify(diagramAnswerContent(studentConfig)) !== JSON.stringify(diagramAnswerContent(solutionConfig));
}

export function diagramConfigHasSolutionAnnotations(config: GraphConfig) {
  if (config.functions?.some(isSolutionOnlyGraphFunction)) return true;
  if (config.features?.some(isSolutionOnlyGraphFeature)) return true;
  if (config.type === "geometry2d" && geometry2dDataHasSolutionOnly(geometry2dData(config))) return true;
  if (vector2dConfigHasSolutionOnly(config)) return true;
  if (graph3dConfigHasSolutionOnly(config)) return true;
  if (statsChartConfigHasSolutionOnly(config)) return true;
  if (imageConfigHasSolutionOnly(config)) return true;
  if (penroseConfigHasSolutionOnly(config)) return true;
  return false;
}

export function diagramBlockHasSharedSolutionAnswer(block: ContentBlock): block is DiagramBlock {
  return block.kind === "diagram" && diagramConfigHasSolutionAnnotations(block.graphConfig);
}
