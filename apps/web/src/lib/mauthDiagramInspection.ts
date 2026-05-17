import type { GraphConfig } from "@mauth-studio/shared";

import { diagramIntentFromText, type MauthDiagramIntent } from "./mauthDiagramIntent.ts";
import { inspectDiagramSemantics, type MauthDiagramSemanticWarning } from "./mauthDiagramSemanticInspection.ts";

export interface MauthDiagramInspectionWarning {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  path?: string;
}

export interface MauthDiagramInspection {
  graphType: string;
  expectedIntent?: MauthDiagramIntent;
  checks: string[];
  semanticChecks: string[];
  semanticWarnings: MauthDiagramSemanticWarning[];
  warnings: MauthDiagramInspectionWarning[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function graphOptions(config: GraphConfig) {
  return isRecord(config.options) ? config.options : {};
}

function graphData(config: GraphConfig) {
  return isRecord(config.data) ? config.data : {};
}

function graphMetadata(config: GraphConfig) {
  return isRecord(config.metadata) ? config.metadata : {};
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numericArray(value: unknown) {
  return Array.isArray(value) ? value.filter(finiteNumber) : [];
}

function graphSubstanceSource(config: GraphConfig) {
  const options = graphOptions(config);
  return typeof options.substanceSource === "string" ? options.substanceSource : "";
}

function uniqueSorted(values: Iterable<string>) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function expectedScalarVectorLabels(rawText: string) {
  const labels: string[] = [];
  for (const match of rawText.matchAll(
    /(?:\\mathbf\s*\{\s*([a-z])\s*\}|\\vec\s*\{\s*([a-z])\s*\}|(?<![A-Za-z])([a-z]))\s*(?:\\cdot|·|•|\.)\s*(?:\\mathbf\s*\{\s*([a-z])\s*\}|\\vec\s*\{\s*([a-z])\s*\}|([a-z]))/gi,
  )) {
    for (const item of match.slice(1)) {
      if (item) labels.push(item.toLowerCase());
    }
  }
  return uniqueSorted(labels);
}

function hasLatexLabel(source: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `\\bLabel\\s+\\w+\\s+\\$[^\\n$]*(?:\\\\mathbf\\s*\\{\\s*${escaped}\\s*\\}|\\\\vec\\s*\\{\\s*${escaped}\\s*\\}|\\b${escaped}\\b)`,
    "i",
  ).test(source);
}

function vector2dConfiguredLabels(config: GraphConfig) {
  const metadataVector2d = graphMetadata(config).vector2d;
  const vector2d: Record<string, unknown> = isRecord(metadataVector2d) ? metadataVector2d : {};
  return new Set(
    recordArray(vector2d.vectors)
      .flatMap((entry) => [entry.id, entry.name, entry.label])
      .flatMap((value) => {
        if (typeof value !== "string") return [];
        const normalized = normalizedMathText(value)
          .replace(/[^A-Za-z0-9]+/g, "")
          .toLowerCase();
        return normalized ? [normalized] : [];
      }),
  );
}

function vector2dAngleMarkers(config: GraphConfig) {
  const metadataVector2d = graphMetadata(config).vector2d;
  const vector2d: Record<string, unknown> = isRecord(metadataVector2d) ? metadataVector2d : {};
  return recordArray(vector2d.angleMarkers);
}

function normalizedMathText(rawText: string) {
  return rawText
    .replace(/\\mathbf\s*\{\s*([^}]+)\s*\}/g, "$1")
    .replace(/\\vec\s*\{\s*([^}]+)\s*\}/g, "$1")
    .replace(/\\overrightarrow\s*\{\s*([^}]+)\s*\}/g, "$1")
    .replace(/[{}$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expectedCoordinateVectorLabels(rawText: string) {
  const text = normalizedMathText(rawText);
  const labels: string[] = [];
  for (const match of text.matchAll(/\bvector\s+([a-z])\b/gi)) labels.push(match[1].toLowerCase());
  for (const match of text.matchAll(/\bvectors?\s+([a-z])\s*(?:,|\band\b)\s*([a-z])\b/gi)) {
    labels.push(match[1].toLowerCase(), match[2].toLowerCase());
  }
  for (const match of text.matchAll(/\b([a-z])\s*=\s*(?:\(\s*-?\d|\[\s*-?\d|\\begin\s*\{\s*(?:pmatrix|bmatrix|matrix)\s*\})/gi)) {
    labels.push(match[1].toLowerCase());
  }
  return uniqueSorted(labels);
}

function explicitFunctionGraphIntent(rawText: string) {
  return /\bgraph of\b|\bsketch(?: the)? graph\b|\bcurve\b|\by\s*=|f\s*\(\s*x\s*\)|g\s*\(\s*x\s*\)/i.test(rawText);
}

function hasVisibleGraphFunction(config: GraphConfig) {
  const functions = recordArray(config.functions);
  if (functions.some((entry) => entry.show !== false && typeof entry.expression === "string" && entry.expression.trim())) return true;
  return typeof config.expression === "string" && config.expression.trim().length > 0;
}

function visibleGraphFunctionExpressions(config: GraphConfig) {
  const expressions = recordArray(config.functions)
    .filter((entry) => entry.show !== false)
    .flatMap((entry) => {
      const expression = typeof entry.expression === "string" ? entry.expression.trim() : "";
      return expression ? [expression] : [];
    });
  if (expressions.length) return expressions;
  return typeof config.expression === "string" && config.expression.trim() ? [config.expression.trim()] : [];
}

function straightLineGraphExpectation(contextText: string) {
  if (/\btwo\s+(?:straight\s+)?lines?\b|\btwo\s+linear\s+(?:equations?|functions?)\b/i.test(contextText)) return 2;
  if (/\bstraight\s+line\b|\blinear\s+(?:equation|function|graph)\b/i.test(contextText)) return 1;
  return 0;
}

function graphExpressionLooksLinear(expression: string) {
  const compact = expression.replace(/\s+/g, "").toLowerCase();
  if (!compact) return false;
  if (/(?:sin|cos|tan|log|ln|sqrt|abs|exp)\s*\(/.test(compact)) return false;
  if (/x\s*(?:\^|\*\*)\s*[-+]?\d/.test(compact)) return false;
  if (/x\s*\*\s*x|x[)]?\s*x/.test(compact)) return false;
  return true;
}

function inspectGraph2d(config: GraphConfig, contextText: string): MauthDiagramInspectionWarning[] {
  if (config.type !== "graph2d") return [];
  const features = recordArray(config.features);
  const data = graphData(config);
  const warnings: MauthDiagramInspectionWarning[] = [];
  const visibleExpressions = visibleGraphFunctionExpressions(config);
  const expectedStraightLineCount = straightLineGraphExpectation(contextText);

  if (/\bslope\s+field\b|\bdirection\s+field\b|\\frac\{\s*dy\s*\}\{\s*dx\s*\}|\bdy\s*\/\s*dx\b/i.test(contextText)) {
    const slopeField = isRecord(data.slopeField) ? data.slopeField : {};
    const hasSlopeFieldExpression = typeof slopeField.expression === "string" && slopeField.expression.trim();
    if (!hasSlopeFieldExpression) {
      warnings.push({
        code: "graph2d-slope-field-missing",
        severity: "warning",
        message: "The prompt/source describes a slope field, but graph2d.data.slopeField is missing.",
        path: "graphConfig.data.slopeField",
      });
    }
    const asksForPointSlope = /\bcalculate\s+and\s+draw\b|\bdraw\s+the\s+slope\s+field\s+at\b|\bat\s+the\s+point\s*\(/i.test(contextText);
    const highlightedPoints = recordArray(slopeField.highlightedPoints);
    const points = recordArray(slopeField.points);
    if (asksForPointSlope && highlightedPoints.length + points.length === 0) {
      warnings.push({
        code: "graph2d-slope-field-point-missing",
        severity: "warning",
        message: "The source asks for a slope-field segment at a specific point, but no explicit/highlighted point is encoded.",
        path: "graphConfig.data.slopeField.highlightedPoints",
      });
    }
  }

  if (!hasVisibleGraphFunction(config) && explicitFunctionGraphIntent(contextText)) {
    warnings.push({
      code: "graph2d-visible-functions-missing",
      severity: "info",
      message:
        "The prompt describes a function or curve, but the 2D graph has no visible function. This may be fine for a student-drawn blank grid.",
      path: "graphConfig.functions",
    });
  }

  if (expectedStraightLineCount > 0) {
    const linearCount = visibleExpressions.filter(graphExpressionLooksLinear).length;
    if (visibleExpressions.length < expectedStraightLineCount) {
      warnings.push({
        code: "graph2d-straight-line-functions-missing",
        severity: "warning",
        message: `The prompt describes ${expectedStraightLineCount === 1 ? "a straight line" : `${expectedStraightLineCount} straight lines`}, but the graph has only ${visibleExpressions.length} visible function${visibleExpressions.length === 1 ? "" : "s"}.`,
        path: "graphConfig.functions",
      });
    } else if (linearCount < expectedStraightLineCount) {
      warnings.push({
        code: "graph2d-straight-line-mismatch",
        severity: "warning",
        message: `The prompt describes ${expectedStraightLineCount === 1 ? "a straight line" : `${expectedStraightLineCount} straight lines`}, but at least one visible graph expression appears nonlinear.`,
        path: "graphConfig.functions",
      });
    }
  }

  if (/\btangent\b/i.test(contextText) && !features.some((feature) => feature.kind === "tangent" && feature.show !== false)) {
    warnings.push({
      code: "graph2d-tangent-feature-missing",
      severity: "warning",
      message: "The prompt mentions a tangent, but the graph has no tangent feature.",
      path: "graphConfig.features",
    });
  }

  if (/\b(shade|shaded|region|area bounded|area under|between the curves?)\b/i.test(contextText)) {
    const hasRegion = features.some(
      (feature) =>
        (feature.kind === "region_between_curves" || feature.kind === "region_curve_axis" || feature.kind === "region_clipped_by_curve") &&
        feature.show !== false,
    );
    if (!hasRegion) {
      warnings.push({
        code: "graph2d-region-feature-missing",
        severity: "warning",
        message: "The prompt asks for a shaded/area region, but the graph has no visible region feature.",
        path: "graphConfig.features",
      });
    }
  }

  if (/\basymptote\b/i.test(contextText)) {
    const hasAsymptoteLikeFeature = features.some(
      (feature) =>
        feature.show !== false &&
        (feature.strokeStyle === "dashed" ||
          (typeof feature.label === "string" && /asymptote/i.test(feature.label)) ||
          feature.kind === "line_segment"),
    );
    if (!hasAsymptoteLikeFeature) {
      warnings.push({
        code: "graph2d-asymptote-feature-missing",
        severity: "warning",
        message: "The prompt mentions an asymptote, but the graph has no dashed/labelled asymptote-like feature.",
        path: "graphConfig.features",
      });
    }
  }

  return warnings;
}

function inspectScalarProductLabels(config: GraphConfig, contextText: string): MauthDiagramInspectionWarning[] {
  const expectedLabels = expectedScalarVectorLabels(contextText);
  if (!expectedLabels.length) return [];
  let missing: string[] = [];
  if (config.type === "geometricConstruction") {
    const source = graphSubstanceSource(config);
    if (!source.trim()) return [];
    missing = expectedLabels.filter((label) => !hasLatexLabel(source, label));
  } else if (config.type === "vector2d") {
    const configuredLabels = vector2dConfiguredLabels(config);
    missing = expectedLabels.filter((label) => !configuredLabels.has(label));
  } else {
    return [];
  }
  if (!missing.length) return [];
  return [
    {
      code: "scalar-product-vector-labels-missing",
      severity: "warning",
      message: `Scalar-product ray diagram is missing visible vector label${missing.length === 1 ? "" : "s"} ${missing
        .map((label) => `$\\mathbf{${label}}$`)
        .join(", ")}.`,
      path: "graphConfig.options.substanceSource",
    },
  ];
}

function inspectScalarProductAngleMarkers(config: GraphConfig, contextText: string): MauthDiagramInspectionWarning[] {
  if (!expectedScalarVectorLabels(contextText).length) return [];
  const warnings: MauthDiagramInspectionWarning[] = [];
  if (config.type === "geometricConstruction") {
    const source = graphSubstanceSource(config);
    if (!source.trim()) return [];
    if (/(?:90\s*(?:°|degrees?)|right angle|perpendicular)/i.test(contextText) && !/\bRightAngle\s*\(/.test(source)) {
      warnings.push({
        code: "scalar-product-right-angle-missing",
        severity: "warning",
        message:
          "Scalar-product ray diagram mentions a right angle or perpendicular vectors, but the Penrose substance has no RightAngle(...).",
        path: "graphConfig.options.substanceSource",
      });
    }
    if (/(?:\b\d+\s*(?:°|degrees?)|\bangle between\b)/i.test(contextText) && !/\b(?:LabelsAngle|AngleMark|RightAngle)\s*\(/.test(source)) {
      warnings.push({
        code: "scalar-product-angle-marker-missing",
        severity: "warning",
        message: "Scalar-product ray diagram mentions an angle, but the Penrose substance has no visible angle marker or angle label.",
        path: "graphConfig.options.substanceSource",
      });
    }
    return warnings;
  }

  if (config.type !== "vector2d") return [];
  const angleMarkers = vector2dAngleMarkers(config);
  if (/(?:90\s*(?:°|degrees?)|right angle|perpendicular)/i.test(contextText) && !angleMarkers.some((entry) => entry.rightAngle === true)) {
    warnings.push({
      code: "scalar-product-right-angle-missing",
      severity: "warning",
      message:
        "Scalar-product ray diagram mentions a right angle or perpendicular vectors, but the vector2d diagram has no rightAngle marker.",
      path: "graphConfig.metadata.vector2d.angleMarkers",
    });
  }
  if (/(?:\b\d+\s*(?:°|degrees?)|\bangle between\b)/i.test(contextText) && !angleMarkers.length) {
    warnings.push({
      code: "scalar-product-angle-marker-missing",
      severity: "warning",
      message: "Scalar-product ray diagram mentions an angle, but the vector2d diagram has no angle marker.",
      path: "graphConfig.metadata.vector2d.angleMarkers",
    });
  }
  if ((config.showAxes !== false || config.showGrid !== false) && /\bscalar products?\b|\bdot products?\b/i.test(contextText)) {
    warnings.push({
      code: "scalar-product-vector2d-axes-visible",
      severity: "warning",
      message: "Scalar-product source ray diagrams should normally hide vector2d axes and grid unless the source shows axes.",
      path: "graphConfig.showAxes",
    });
  }
  return warnings;
}

function inspectImageSource(config: GraphConfig): MauthDiagramInspectionWarning[] {
  if (config.type !== "image") return [];
  const data = graphData(config);
  const src = data.src;
  if (typeof src === "string" && src.trim()) return [];
  return [
    {
      code: "image-diagram-missing-source",
      severity: "warning",
      message: "Image diagram has no uploaded image source.",
      path: "graphConfig.data.src",
    },
  ];
}

function inspectGraph3d(config: GraphConfig, contextText: string): MauthDiagramInspectionWarning[] {
  if (config.type !== "graph3d") return [];
  const data = graphData(config);
  const points = recordArray(Array.isArray(data.points) ? data.points : data.vertices);
  const segments = recordArray(Array.isArray(data.segments) ? data.segments : data.edges);
  const warnings: MauthDiagramInspectionWarning[] = [];
  const needsStructured3d =
    /\brectangular prism\b|\bprism\b|\b3d\b|\bthree-dimensional\b|\bcoordinate system\b|\bvertices\b|\bmain diagonal\b/i.test(contextText);
  if (needsStructured3d && points.length < 4) {
    warnings.push({
      code: "graph3d-points-missing",
      severity: "warning",
      message: "3D source diagram should include named point/vertex data, not only a camera placeholder.",
      path: "graphConfig.data.points",
    });
  }
  if (needsStructured3d && segments.length < 3) {
    warnings.push({
      code: "graph3d-segments-missing",
      severity: "warning",
      message: "3D source diagram should include segment/edge data for the visible structure.",
      path: "graphConfig.data.segments",
    });
  }
  const compactContext = contextText.replace(/\s+/g, "").toLowerCase();
  for (const pair of ["bt", "am"]) {
    const [first, second] = pair;
    const hasPair = segments.some((segment) => {
      const pointPair = Array.isArray(segment.points) ? segment.points : [];
      const from = String(segment.from ?? pointPair[0] ?? "").toLowerCase();
      const to = String(segment.to ?? pointPair[1] ?? "").toLowerCase();
      return (from === first && to === second) || (from === second && to === first);
    });
    if (compactContext.includes(pair) && !hasPair) {
      warnings.push({
        code: "graph3d-named-segment-missing",
        severity: "warning",
        message: `3D diagram should include the named segment ${pair.toUpperCase()} from the source question.`,
        path: "graphConfig.data.segments",
      });
    }
  }
  return warnings;
}

function inspectStatsChart(config: GraphConfig): MauthDiagramInspectionWarning[] {
  if (config.type !== "statsChart") return [];
  const data = graphData(config);
  const chartType = typeof data.chartType === "string" ? data.chartType : "";
  const dataMode = typeof data.dataMode === "string" ? data.dataMode : "";
  const warnings: MauthDiagramInspectionWarning[] = [];
  if (!chartType) {
    warnings.push({
      code: "stats-chart-type-missing",
      severity: "warning",
      message: "Statistics chart has no chartType.",
      path: "graphConfig.data.chartType",
    });
  }
  if (dataMode === "manualProbabilities") {
    const xValues = Array.isArray(data.xValues) ? data.xValues : [];
    const probabilities = Array.isArray(data.probabilities) ? data.probabilities : [];
    if (!xValues.length || !probabilities.length || xValues.length !== probabilities.length) {
      warnings.push({
        code: "stats-chart-manual-probability-data-mismatch",
        severity: "warning",
        message: "Manual probability chart should have matching xValues and probabilities arrays.",
        path: "graphConfig.data.probabilities",
      });
    }
    const numericProbabilities = numericArray(data.probabilities);
    const invalidProbability = numericProbabilities.some((probability) => probability < 0 || probability > 1);
    if (invalidProbability) {
      warnings.push({
        code: "stats-chart-probability-out-of-range",
        severity: "warning",
        message: "Manual probability chart has probability values outside the interval [0, 1].",
        path: "graphConfig.data.probabilities",
      });
    } else if (numericProbabilities.length && Math.abs(numericProbabilities.reduce((sum, value) => sum + value, 0) - 1) > 0.005) {
      const total = numericProbabilities.reduce((sum, value) => sum + value, 0);
      warnings.push({
        code: "stats-chart-probabilities-not-normalised",
        severity: "warning",
        message: `Manual probability chart probabilities sum to ${Number(total.toFixed(4))}, not 1.`,
        path: "graphConfig.data.probabilities",
      });
    }
  }
  return warnings;
}

function inspectStatsChartIntent(config: GraphConfig, contextText: string): MauthDiagramInspectionWarning[] {
  if (config.type !== "statsChart") return [];
  const data = graphData(config);
  const chartType = typeof data.chartType === "string" ? data.chartType : "";
  const dataMode = typeof data.dataMode === "string" ? data.dataMode : "";
  const yAxisMode = typeof data.yAxisMode === "string" ? data.yAxisMode : "";
  const warnings: MauthDiagramInspectionWarning[] = [];
  if (chartType === "histogram" && /\brelative frequenc(?:y|ies)\b/i.test(contextText) && yAxisMode !== "relativeFrequency") {
    warnings.push({
      code: "stats-chart-relative-frequency-mode-missing",
      severity: "warning",
      message: "The prompt asks for relative frequency, but the statistics chart y-axis mode is not relativeFrequency.",
      path: "graphConfig.data.yAxisMode",
    });
  }
  if (
    chartType === "histogram" &&
    /\bmanual probabilities\b|\bprobability mass\b|\bpmf\b|P\s*\(\s*X\s*=\s*x\s*\)/i.test(contextText) &&
    dataMode !== "manualProbabilities"
  ) {
    warnings.push({
      code: "stats-chart-manual-probability-mode-missing",
      severity: "warning",
      message: "The prompt describes exact probability bars, but the histogram/column graph is not using manualProbabilities mode.",
      path: "graphConfig.data.dataMode",
    });
  }
  return warnings;
}

function inspectVector2d(config: GraphConfig, contextText: string): MauthDiagramInspectionWarning[] {
  if (config.type !== "vector2d") return [];
  const metadata = graphMetadata(config);
  const vector2d = isRecord(metadata.vector2d) ? metadata.vector2d : {};
  const vectors = Array.isArray(vector2d.vectors) ? vector2d.vectors : [];
  const warnings: MauthDiagramInspectionWarning[] = [];
  if (!vectors.length) {
    warnings.push({
      code: "vector2d-vectors-missing",
      severity: "info",
      message: "2D vector diagram has no vector metadata entries.",
      path: "graphConfig.metadata.vector2d.vectors",
    });
    return warnings;
  }

  const configuredNames = new Set(
    recordArray(vectors)
      .flatMap((entry) => [entry.name, entry.id, entry.label])
      .flatMap((value) => {
        if (typeof value !== "string") return [];
        const normalized = normalizedMathText(value).trim();
        return normalized ? [normalized.toLowerCase()] : [];
      }),
  );
  const expectedNames = expectedCoordinateVectorLabels(contextText);
  const missing = expectedNames.filter((name) => !configuredNames.has(name));
  if (missing.length) {
    warnings.push({
      code: "vector2d-labels-missing",
      severity: "warning",
      message: `The prompt names coordinate vector${missing.length === 1 ? "" : "s"} ${missing.join(", ")}, but the vector2d diagram does not contain matching vector metadata.`,
      path: "graphConfig.metadata.vector2d.vectors",
    });
  }

  const componentGuides = recordArray(vectors).filter((entry) => entry.showComponents === true);
  if (componentGuides.length && !/\b(component guide|component lines?|dashed components?|show components?)\b/i.test(contextText)) {
    warnings.push({
      code: "vector2d-component-guides-unrequested",
      severity: "info",
      message: "Vector component guide lines are shown; keep them off unless the question or solution explicitly needs component guides.",
      path: "graphConfig.metadata.vector2d.vectors",
    });
  }

  return warnings;
}

function hasSetShading(config: GraphConfig) {
  return recordArray(graphData(config).regions).some((region) => region.shaded === true || region.shade === true);
}

function setHasAnyCountLabel(config: GraphConfig) {
  const data = graphData(config);
  const universe = isRecord(data.universe) ? [data.universe] : [];
  const sets = recordArray(data.sets);
  const regions = recordArray(data.regions);
  return [...universe, ...sets, ...regions].some((entry) =>
    [entry.countLabel, entry.count, entry.total, entry.totalLabel, entry.value, entry.label].some((value) =>
      typeof value === "number" ? Number.isFinite(value) : typeof value === "string" && /\d/.test(value),
    ),
  );
}

function inspectSetDiagram(config: GraphConfig, contextText: string): MauthDiagramInspectionWarning[] {
  if (config.type !== "setDiagram") return [];
  const warnings: MauthDiagramInspectionWarning[] = [];
  const data = graphData(config);
  const sets = recordArray(data.sets);
  const regions = recordArray(data.regions);
  if (sets.length < 2) {
    warnings.push({
      code: "set-diagram-sets-missing",
      severity: "warning",
      message: "Set diagram should contain at least two set entries for a two-set Venn diagram.",
      path: "graphConfig.data.sets",
    });
  }
  if (regions.length < 4) {
    warnings.push({
      code: "set-diagram-regions-incomplete",
      severity: "warning",
      message: "Set diagram should include the four standard two-set regions: onlyA, intersection, onlyB, and outside.",
      path: "graphConfig.data.regions",
    });
  }
  if (/\b(shade|shaded|shading)\b/i.test(contextText) && !hasSetShading(config)) {
    warnings.push({
      code: "set-diagram-shading-missing",
      severity: "warning",
      message: "The prompt asks for shading, but no set diagram region is marked shaded.",
      path: "graphConfig.data.regions",
    });
  }
  if (
    /\b(number of elements|element counts?|counts?|n\s*\(|total number|universal total)\b/i.test(contextText) &&
    !setHasAnyCountLabel(config)
  ) {
    warnings.push({
      code: "set-diagram-counts-missing",
      severity: "warning",
      message: "The prompt asks for set element counts/totals, but the set diagram has no numeric region, set, or universe count labels.",
      path: "graphConfig.data",
    });
  }
  return warnings;
}

function intentWarnings(config: GraphConfig, contextText: string) {
  const intent = diagramIntentFromText(contextText);
  if (!intent || config.type === intent.expectedType) return { intent, warnings: [] as MauthDiagramInspectionWarning[] };
  return {
    intent,
    warnings: [
      {
        code: "diagram-renderer-mismatch",
        severity: "warning" as const,
        message: `${intent.label} appears to use ${config.type}; ${intent.reason}`,
        path: "graphConfig.type",
      },
    ],
  };
}

export function inspectMauthDiagram(config: GraphConfig, contextText: string): MauthDiagramInspection {
  const intent = intentWarnings(config, contextText);
  const semantic = inspectDiagramSemantics(config, contextText);
  const warnings = [
    ...intent.warnings,
    ...inspectImageSource(config),
    ...inspectGraph2d(config, contextText),
    ...inspectGraph3d(config, contextText),
    ...inspectStatsChart(config),
    ...inspectStatsChartIntent(config, contextText),
    ...inspectVector2d(config, contextText),
    ...inspectSetDiagram(config, contextText),
    ...inspectScalarProductLabels(config, contextText),
    ...inspectScalarProductAngleMarkers(config, contextText),
    ...semantic.warnings,
  ];
  return {
    graphType: config.type,
    expectedIntent: intent.intent,
    checks: [...(intent.intent ? [`intent:${intent.intent.id}`] : []), ...semantic.checks],
    semanticChecks: semantic.checks,
    semanticWarnings: semantic.warnings,
    warnings,
  };
}

export function isAssistantDiagramInspectionWarningBlocking(warning: MauthDiagramInspectionWarning) {
  return (
    warning.code === "diagram-renderer-mismatch" ||
    warning.code === "image-diagram-missing-source" ||
    warning.code === "graph2d-straight-line-functions-missing" ||
    warning.code === "graph2d-straight-line-mismatch" ||
    warning.code === "graph2d-slope-field-missing" ||
    warning.code === "graph2d-slope-field-point-missing" ||
    warning.code === "scalar-product-vector-labels-missing" ||
    warning.code === "scalar-product-right-angle-missing" ||
    warning.code === "scalar-product-angle-marker-missing" ||
    warning.code === "scalar-product-vector2d-axes-visible" ||
    warning.code === "vector2d-labels-missing" ||
    warning.code === "stats-chart-probabilities-not-normalised" ||
    warning.code === "stats-chart-probability-out-of-range" ||
    warning.code === "stats-chart-manual-probability-mode-missing" ||
    warning.code === "stats-chart-relative-frequency-mode-missing" ||
    warning.code === "set-diagram-shading-missing" ||
    warning.code === "set-diagram-counts-missing" ||
    warning.code === "graph3d-points-missing" ||
    warning.code === "graph3d-segments-missing" ||
    warning.code === "graph3d-named-segment-missing" ||
    warning.code.startsWith("penrose-")
  );
}
