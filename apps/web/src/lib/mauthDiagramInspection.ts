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

function vector2dSegmentLabels(config: GraphConfig) {
  const metadataVector2d = graphMetadata(config).vector2d;
  const vector2d: Record<string, unknown> = isRecord(metadataVector2d) ? metadataVector2d : {};
  return recordArray(vector2d.segmentLabels);
}

function vector2dVectors(config: GraphConfig) {
  const metadataVector2d = graphMetadata(config).vector2d;
  const vector2d: Record<string, unknown> = isRecord(metadataVector2d) ? metadataVector2d : {};
  return recordArray(vector2d.vectors);
}

function finiteNumberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function numericPairValue(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const x = finiteNumberValue(value[0]);
  const y = finiteNumberValue(value[1]);
  return x === undefined || y === undefined ? undefined : [x, y];
}

function vector2dAngleDegrees(vector: Record<string, unknown>) {
  const components = numericPairValue(vector.components ?? vector.vector);
  if (components) return (Math.atan2(components[1], components[0]) * 180) / Math.PI;
  const start = numericPairValue(vector.start) ?? [0, 0];
  const end = numericPairValue(vector.end);
  if (end) return (Math.atan2(end[1] - start[1], end[0] - start[0]) * 180) / Math.PI;
  return undefined;
}

function vectorReferenceKey(value: unknown) {
  return typeof value === "string"
    ? normalizedMathText(value)
        .replace(/[^A-Za-z0-9]+/g, "")
        .toLowerCase()
    : "";
}

function vector2dByReference(vectors: Array<Record<string, unknown>>, reference: unknown) {
  const key = vectorReferenceKey(reference);
  if (!key) return undefined;
  return vectors.find((vector) => [vector.id, vector.name, vector.label].some((value) => vectorReferenceKey(value) === key));
}

function angleDistanceDegrees(first: number, second: number) {
  const normalizedFirst = ((first % 360) + 360) % 360;
  const normalizedSecond = ((second % 360) + 360) % 360;
  const difference = Math.abs(normalizedFirst - normalizedSecond) % 360;
  return difference > 180 ? 360 - difference : difference;
}

function angleLabelDegrees(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const source = value
    .trim()
    .replace(/^\${1,2}|\${1,2}$/g, "")
    .replace(/^\\\(|\\\)$/g, "")
    .replace(/\s+/g, "")
    .replace(/\u00b0/g, "^\\circ")
    .replace(/\\degree\b/gi, "^\\circ")
    .replace(/\^\{\\circ\}/gi, "^\\circ");
  const match = source.match(/^([+-]?\d+(?:\.\d+)?)(?:\^\\circ|\\circ)?$/i);
  return match ? Number(match[1]) : undefined;
}

function scalarSegmentLabelNeedsTextUnits(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false;
  if (!/\bunits?\b/i.test(value)) return false;
  const source = value.trim().replace(/^\${1,2}|\${1,2}$/g, "");
  return !/(?:\\[,;:! ]|~|\s)\\(?:text|mathrm)\s*\{\s*units?\s*\}|\\(?:text|mathrm)\s*\{\s+units?\s*\}/i.test(source);
}

function scalarAngleLabelNeedsCirc(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false;
  const source = value
    .trim()
    .replace(/^\${1,2}|\${1,2}$/g, "")
    .replace(/^\\\(|\\\)$/g, "")
    .replace(/\s+/g, "");
  if (/\\circ\b|\\circ\}/i.test(source)) return false;
  if (/°|\\degree\b|degrees?/i.test(source)) return true;
  return /^-?\d+(?:\.\d+)?$/.test(source);
}

function hasExplicitLabelPosition(entry: Record<string, unknown>) {
  return finiteNumberValue(entry.labelX) !== undefined && finiteNumberValue(entry.labelY) !== undefined;
}

function segmentLabelHasPlacement(entry: Record<string, unknown>) {
  return (
    hasExplicitLabelPosition(entry) || finiteNumberValue(entry.offsetPx) !== undefined || finiteNumberValue(entry.offset) !== undefined
  );
}

function vector2dMarkerAngleDistance(config: GraphConfig, marker: Record<string, unknown>) {
  const vectors = vector2dVectors(config);
  const first = vector2dByReference(vectors, marker.from ?? marker.vectorA);
  const second = vector2dByReference(vectors, marker.to ?? marker.vectorB);
  if (!first || !second) return undefined;
  const firstAngle = vector2dAngleDegrees(first);
  const secondAngle = vector2dAngleDegrees(second);
  return firstAngle === undefined || secondAngle === undefined ? undefined : angleDistanceDegrees(firstAngle, secondAngle);
}

function normalizedMathText(rawText: string) {
  return rawText
    .replace(/\\underset\s*\{\s*\\sim\s*\}\s*\{\s*([^}]+)\s*\}/g, "$1")
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

function graphConfigText(config: GraphConfig) {
  return JSON.stringify(config).replace(/\\\\/g, "\\").toLowerCase();
}

type SourceGraph2dVectorLabel = {
  label: string;
  style: "vec" | "underset";
};

function sourceGraph2dVectorLabelKey(entry: SourceGraph2dVectorLabel) {
  return `${entry.style}:${entry.label}`;
}

function expectedGraph2dVectorLabels(contextText: string) {
  const labels = new Map<string, SourceGraph2dVectorLabel>();
  for (const match of contextText.matchAll(/\\vec\s*(?:\{\s*([a-z])\s*\}|\s+([a-z])\b)/gi)) {
    const label = (match[1] ?? match[2] ?? "").toLowerCase();
    if (!label) continue;
    const entry = { label, style: "vec" as const };
    labels.set(sourceGraph2dVectorLabelKey(entry), entry);
  }
  for (const match of contextText.matchAll(/\\underset\s*\{\s*\\sim\s*\}\s*\{\s*([a-z])\s*\}/gi)) {
    const label = (match[1] ?? "").toLowerCase();
    if (!label) continue;
    const entry = { label, style: "underset" as const };
    labels.set(sourceGraph2dVectorLabelKey(entry), entry);
  }
  return [...labels.values()];
}

function sourceGraph2dVectorLabelText(entry: SourceGraph2dVectorLabel) {
  return entry.style === "vec" ? `\\vec ${entry.label}` : `\\underset{\\sim}{${entry.label}}`;
}

function hasGraph2dLatexVectorLabel(config: GraphConfig, entry: SourceGraph2dVectorLabel) {
  const label = entry.label;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const source = graphConfigText(config);
  if (entry.style === "underset") {
    return new RegExp(`\\\\underset\\s*\\{\\s*\\\\sim\\s*\\}\\s*\\{\\s*${escaped}\\s*\\}`, "i").test(source);
  }
  return new RegExp(`\\\\vec\\s*(?:\\{\\s*${escaped}\\s*\\}|\\s+${escaped}\\b)`, "i").test(source);
}

function inspectGraph2dVectorLabels(config: GraphConfig, contextText: string): MauthDiagramInspectionWarning[] {
  if (config.type !== "graph2d") return [];
  if (!/\btop view\b/i.test(contextText)) return [];
  const expectedLabels = expectedGraph2dVectorLabels(contextText);
  if (!expectedLabels.length) return [];

  const missing = expectedLabels.filter((entry) => !hasGraph2dLatexVectorLabel(config, entry));
  if (!missing.length) return [];
  return [
    {
      code: "graph2d-source-vector-labels-missing",
      severity: "warning",
      message: `Top-view graph should preserve source vector label${missing.length === 1 ? "" : "s"} ${missing
        .map(sourceGraph2dVectorLabelText)
        .join(", ")}.`,
      path: "graphConfig.features",
    },
  ];
}

interface SourceGraphEquation {
  expression: string;
  normalized: string;
  requiredTokens: string[];
  domain?: { min: number; max: number };
}

interface SourceGraphPoint {
  label?: string;
  x: number;
  y: number;
}

function normalizedGraphText(rawText: string) {
  let text = rawText
    .replace(/\r/g, "\n")
    .replace(/\u2212/g, "-")
    .replace(/\\left|\\right/g, "")
    .replace(/\\,/g, "")
    .replace(/\\cdot/g, "*")
    .replace(/\\times/g, "*")
    .replace(/\\ln\b/g, "log")
    .replace(/\\log\b/g, "log")
    .replace(/\\leq?|≤/g, "<=")
    .replace(/\\geq?|≥/g, ">=")
    .replace(/\\d?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\^\{([^{}]+)\}/g, "^$1")
    .replace(/[$`]/g, " ")
    .replace(/[{}]/g, "");
  text = text.replace(/([0-9.])\s*x\b/g, "$1*x");
  return text.replace(/\s+/g, " ").trim();
}

function compactGraphExpression(rawText: string) {
  return normalizedGraphText(rawText)
    .toLowerCase()
    .replace(/\bln\b/g, "log")
    .replace(/\s+/g, "")
    .replace(/\*/g, "");
}

function sourceEquationKey(expression: string) {
  const compact = compactGraphExpression(expression);
  const equalityIndex = compact.indexOf("=");
  if (equalityIndex < 0) return compact;
  const left = compact.slice(0, equalityIndex);
  const right = compact.slice(equalityIndex + 1);
  if (/^(?:y|[a-z]\(x\))$/.test(left)) return right;
  return compact;
}

function tokenizedGraphExpression(expression: string) {
  const compact = sourceEquationKey(expression);
  const tokens = new Set<string>();
  for (const match of compact.matchAll(/-\d+(?:\.\d+)?/g)) tokens.add(match[0]);
  for (const match of compact.matchAll(/\d+(?:\.\d+)?/g)) tokens.add(match[0]);
  for (const match of compact.matchAll(/\b(?:x|y|log|sin|cos|tan|sqrt|exp)\b/g)) tokens.add(match[0]);
  for (const match of compact.matchAll(/-\d+(?:\.\d+)?x/g)) tokens.add(match[0]);
  for (const match of compact.matchAll(/(^|[^0-9.])-[xy](?!\/)/g)) tokens.add(match[0].slice(-2));
  for (const match of compact.matchAll(/(^|[^0-9.])\+[xy](?!\/)/g)) tokens.add(match[0].slice(-2));
  if (/\^2|\*\*2/.test(expression)) tokens.add("^2");
  if (/\^3|\*\*3/.test(expression)) tokens.add("^3");
  return [...tokens].filter((token) => token !== "1");
}

function mathLikeSegments(rawText: string) {
  const segments: Array<{ text: string; end: number }> = [];
  const dollarPattern = /\${1,2}([\s\S]*?)\${1,2}/g;
  for (const match of rawText.matchAll(dollarPattern)) {
    const text = match[1]?.trim() ?? "";
    if (text) segments.push({ text, end: match.index + match[0].length });
  }
  const normalized = normalizedGraphText(rawText);
  for (const match of normalized.matchAll(/\b(?:y|[a-z]\s*\(\s*x\s*\))\s*=\s*[^.;\n]+/gi)) {
    const text = match[0].split(/\s+for\s+|[,;]/i)[0]?.trim() ?? "";
    if (text) segments.push({ text, end: rawText.length });
  }
  return segments;
}

function sourceEquationLooksGraph2d(expression: string) {
  const compact = compactGraphExpression(expression);
  if (!compact.includes("=")) return false;
  if (/(?:dy.*dx|dydx|d2|x'\(t\)|x\(t\)|h\(t\)|p\(x|p\(x=)/i.test(compact)) return false;
  if (/^(?:y|[a-z]\(x\))=/.test(compact)) return true;
  return /x/.test(compact) && /y/.test(compact) && !/[a-z]\(t\)/.test(compact);
}

function extractDomainNear(rawText: string, startIndex: number) {
  const windowText = normalizedGraphText(rawText.slice(startIndex, startIndex + 180));
  const match = windowText.match(/(-?\d+(?:\.\d+)?)\s*<=\s*x\s*<=\s*(-?\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  const min = Number(match[1]);
  const max = Number(match[2]);
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : undefined;
}

function extractSourceGraphEquations(contextText: string): SourceGraphEquation[] {
  const seen = new Set<string>();
  const equations: SourceGraphEquation[] = [];
  for (const segment of mathLikeSegments(contextText)) {
    if (!sourceEquationLooksGraph2d(segment.text)) continue;
    const normalized = sourceEquationKey(segment.text);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    equations.push({
      expression: segment.text,
      normalized,
      requiredTokens: tokenizedGraphExpression(segment.text),
      domain: extractDomainNear(contextText, segment.end),
    });
  }
  return equations;
}

function sourceGraphEquationMatchesFunction(source: SourceGraphEquation, graphExpression: string) {
  const target = sourceEquationKey(graphExpression);
  if (!target) return false;
  if (target.includes(source.normalized) || source.normalized.includes(target)) return true;
  if (!source.requiredTokens.length) return false;
  return source.requiredTokens.every((token) => target.includes(token));
}

function finiteGraphNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  return undefined;
}

function graphNumberClose(value: unknown, expected: number, tolerance: number) {
  const number = finiteGraphNumber(value);
  return number !== undefined && Math.abs(number - expected) <= tolerance;
}

function graphFunctionDomainMatches(functionEntry: Record<string, unknown>, domain: { min: number; max: number }) {
  return graphNumberClose(functionEntry.domainMin, domain.min, 0.02) && graphNumberClose(functionEntry.domainMax, domain.max, 0.02);
}

function sourceGraphFunctions(config: GraphConfig) {
  const entries = recordArray(config.functions)
    .map((entry, index) => ({ entry, index, expression: typeof entry.expression === "string" ? entry.expression.trim() : "" }))
    .filter((item) => item.entry.show !== false && item.expression);
  if (entries.length) return entries;
  return typeof config.expression === "string" && config.expression.trim()
    ? [{ entry: { expression: config.expression }, index: -1, expression: config.expression.trim() }]
    : [];
}

function extractSourceGraphPoints(contextText: string): SourceGraphPoint[] {
  const normalized = normalizedGraphText(contextText);
  const points: SourceGraphPoint[] = [];
  const seen = new Set<string>();
  const pointPattern = /\b(?:point\s+)?([A-Z])\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
  for (const match of normalized.matchAll(pointPattern)) {
    const label = match[1];
    const x = Number(match[2]);
    const y = Number(match[3]);
    const key = `${label}:${x}:${y}`;
    if (!Number.isFinite(x) || !Number.isFinite(y) || seen.has(key)) continue;
    seen.add(key);
    points.push({ label, x, y });
  }
  const coordinatePattern = /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
  for (const match of normalized.matchAll(coordinatePattern)) {
    const before = normalized.slice(Math.max(0, match.index - 45), match.index).toLowerCase();
    if (!/\b(?:landing|intersection|intersect|turning|endpoint|end point)\b/.test(before)) continue;
    const x = Number(match[1]);
    const y = Number(match[2]);
    const key = `:${x}:${y}`;
    if (!Number.isFinite(x) || !Number.isFinite(y) || seen.has(key)) continue;
    seen.add(key);
    points.push({ x, y });
  }
  return points;
}

function graphFeatureLabelKey(value: unknown) {
  return typeof value === "string"
    ? normalizedMathText(value)
        .replace(/[^A-Za-z0-9]+/g, "")
        .toLowerCase()
    : "";
}

function graphHasPointFeature(features: Array<Record<string, unknown>>, sourcePoint: SourceGraphPoint) {
  const expectedLabel = sourcePoint.label?.toLowerCase();
  return features.some((feature) => {
    if (feature.show === false || feature.kind !== "point") return false;
    if (!graphNumberClose(feature.x, sourcePoint.x, 0.05) || !graphNumberClose(feature.y, sourcePoint.y, 0.05)) return false;
    if (!expectedLabel) return true;
    return graphFeatureLabelKey(feature.label) === expectedLabel || graphFeatureLabelKey(feature.name) === expectedLabel;
  });
}

function shouldInspectSourceGraphAxes(contextText: string, equations: SourceGraphEquation[], points: SourceGraphPoint[]) {
  if (!equations.length && !points.length) return false;
  return /\b(?:graph|coordinate|cartesian|axes?|axis|modelling|modeling|sloped ground|landing point)\b/i.test(contextText);
}

function inspectGraph2dSourceConsistency(config: GraphConfig, contextText: string): MauthDiagramInspectionWarning[] {
  const warnings: MauthDiagramInspectionWarning[] = [];
  const sourceEquations = extractSourceGraphEquations(contextText);
  const sourcePoints = extractSourceGraphPoints(contextText);
  const graphFunctions = sourceGraphFunctions(config);
  const features = recordArray(config.features);

  for (const sourceEquation of sourceEquations) {
    const match = graphFunctions.find((functionEntry) => sourceGraphEquationMatchesFunction(sourceEquation, functionEntry.expression));
    if (!match && graphFunctions.length > 0) {
      warnings.push({
        code: "graph2d-source-equation-missing",
        severity: "warning",
        message: `The question/source explicitly states ${sourceEquation.expression}, but no visible graph2d function or relation matches it.`,
        path: "graphConfig.functions",
      });
      continue;
    }
    if (match && sourceEquation.domain && !graphFunctionDomainMatches(match.entry, sourceEquation.domain)) {
      const pathIndex = match.index >= 0 ? `[${match.index}]` : "";
      warnings.push({
        code: "graph2d-source-domain-mismatch",
        severity: "warning",
        message: `The question/source gives ${sourceEquation.expression} on ${sourceEquation.domain.min} <= x <= ${sourceEquation.domain.max}, but the matching graph2d function does not preserve that domain.`,
        path: `graphConfig.functions${pathIndex}`,
      });
    }
  }

  for (const sourcePoint of sourcePoints) {
    if (graphHasPointFeature(features, sourcePoint)) continue;
    const labelText = sourcePoint.label ? `point ${sourcePoint.label}` : "the stated point";
    warnings.push({
      code: "graph2d-source-point-missing",
      severity: "warning",
      message: `The question/source explicitly states ${labelText} at (${sourcePoint.x}, ${sourcePoint.y}), but graph2d has no matching point feature.`,
      path: "graphConfig.features",
    });
  }

  if (shouldInspectSourceGraphAxes(contextText, sourceEquations, sourcePoints)) {
    if (config.showAxes === false || config.showGrid === false) {
      warnings.push({
        code: "graph2d-source-axes-hidden",
        severity: "warning",
        message: "The question/source describes a coordinate graph, but graph2d axes or grid are hidden.",
        path: "graphConfig.showAxes",
      });
    }
    if (config.showAxisLabels === false) {
      warnings.push({
        code: "graph2d-source-axis-labels-hidden",
        severity: "warning",
        message: "The question/source describes a coordinate graph, but graph2d axis labels are hidden.",
        path: "graphConfig.showAxisLabels",
      });
    }
  }

  return warnings;
}

function inspectGraph2d(config: GraphConfig, contextText: string): MauthDiagramInspectionWarning[] {
  if (config.type !== "graph2d") return [];
  const features = recordArray(config.features);
  const data = graphData(config);
  const warnings: MauthDiagramInspectionWarning[] = [];
  const visibleExpressions = visibleGraphFunctionExpressions(config);
  const expectedStraightLineCount = straightLineGraphExpectation(contextText);

  if (/\b(?:slope|direction)\s+field\b/i.test(contextText)) {
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

  warnings.push(...inspectGraph2dSourceConsistency(config, contextText));
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
  const expectedLabels = expectedScalarVectorLabels(contextText);
  if (!expectedLabels.length) return [];
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
  const vectors = vector2dVectors(config);
  const scalarProductContext = /\bscalar products?\b|\bdot products?\b/i.test(contextText);
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
  if (scalarProductContext) {
    const missingVectorLabelPositions = expectedLabels.filter((label) => {
      const vector = vector2dByReference(vectors, label);
      return vector && !hasExplicitLabelPosition(vector);
    });
    if (missingVectorLabelPositions.length) {
      warnings.push({
        code: "scalar-product-vector-label-placement-missing",
        severity: "warning",
        message: `Scalar-product source ray diagrams should set explicit labelX/labelY positions for vector labels ${missingVectorLabelPositions.join(
          ", ",
        )} so labels stay clear of the common origin and rays.`,
        path: "graphConfig.metadata.vector2d.vectors",
      });
    }
  }
  angleMarkers.forEach((marker, markerIndex) => {
    const distance = vector2dMarkerAngleDistance(config, marker);
    if (distance === undefined) return;
    if (marker.rightAngle === true && Math.abs(distance - 90) > 8) {
      warnings.push({
        code: "scalar-product-right-angle-geometry-mismatch",
        severity: "warning",
        message: `Scalar-product right-angle marker references vectors ${String(marker.from ?? marker.vectorA ?? "")} and ${String(
          marker.to ?? marker.vectorB ?? "",
        )}, which are ${Number(distance.toFixed(1))} degrees apart rather than perpendicular.`,
        path: `graphConfig.metadata.vector2d.angleMarkers[${markerIndex}]`,
      });
    }
    const labelledAngle = angleLabelDegrees(marker.label);
    if (marker.rightAngle !== true && labelledAngle !== undefined && Math.abs(distance - labelledAngle) > 8) {
      warnings.push({
        code: "scalar-product-angle-marker-geometry-mismatch",
        severity: "warning",
        message: `Scalar-product angle marker label ${Number(labelledAngle.toFixed(1))} degrees does not match vectors ${String(
          marker.from ?? marker.vectorA ?? "",
        )} and ${String(marker.to ?? marker.vectorB ?? "")}, which are ${Number(distance.toFixed(1))} degrees apart.`,
        path: `graphConfig.metadata.vector2d.angleMarkers[${markerIndex}]`,
      });
    }
    if (scalarProductContext && marker.rightAngle !== true && marker.label && !hasExplicitLabelPosition(marker)) {
      warnings.push({
        code: "scalar-product-angle-label-placement-missing",
        severity: "warning",
        message: `Scalar-product angle marker label ${String(marker.label)} should set explicit labelX/labelY so it does not overlap the rays or right-angle marker.`,
        path: `graphConfig.metadata.vector2d.angleMarkers[${markerIndex}]`,
      });
    }
  });
  if ((config.showAxes !== false || config.showGrid !== false) && /\bscalar products?\b|\bdot products?\b/i.test(contextText)) {
    warnings.push({
      code: "scalar-product-vector2d-axes-visible",
      severity: "warning",
      message: "Scalar-product source ray diagrams should normally hide vector2d axes and grid unless the source shows axes.",
      path: "graphConfig.showAxes",
    });
  }
  const unsafeSegmentLabel = vector2dSegmentLabels(config).find((entry) => scalarSegmentLabelNeedsTextUnits(entry.label));
  if (unsafeSegmentLabel) {
    warnings.push({
      code: "scalar-product-segment-label-tex-unsafe",
      severity: "warning",
      message:
        "Scalar-product vector magnitude labels that include units should use MathJax-safe text with spacing, for example 2\\ \\text{units}.",
      path: "graphConfig.metadata.vector2d.segmentLabels",
    });
  }
  const unplacedSegmentLabel = vector2dSegmentLabels(config).find(
    (entry) =>
      scalarProductContext && typeof entry.label === "string" && /\bunits?\b/i.test(entry.label) && !segmentLabelHasPlacement(entry),
  );
  if (unplacedSegmentLabel) {
    warnings.push({
      code: "scalar-product-segment-label-placement-missing",
      severity: "warning",
      message:
        "Scalar-product vector magnitude labels should use labelX/labelY or offsetPx so unit labels stay clear of the common origin and vector rays.",
      path: "graphConfig.metadata.vector2d.segmentLabels",
    });
  }
  const unsafeAngleLabel = angleMarkers.find((entry) => scalarAngleLabelNeedsCirc(entry.label));
  if (unsafeAngleLabel) {
    warnings.push({
      code: "scalar-product-angle-label-tex-unsafe",
      severity: "warning",
      message: "Scalar-product angle labels should use MathJax-safe degree notation such as 45^\\circ.",
      path: "graphConfig.metadata.vector2d.angleMarkers",
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
  const faces = recordArray(data.faces);
  const solids = recordArray(Array.isArray(data.solids) ? data.solids : data.surfaces);
  const warnings: MauthDiagramInspectionWarning[] = [];
  const needsStructured3d =
    /\brectangular prism\b|\bprism\b|\bpyramid\b|\bcone\b|\bcylinder\b|\bsphere\b|\bspherical cap\b|\b3d\b|\bthree-dimensional\b|\bcoordinate system\b|\bvertices\b|\bmain diagonal\b/i.test(
      contextText,
    );
  if (needsStructured3d && points.length < 4 && solids.length === 0) {
    warnings.push({
      code: "graph3d-points-missing",
      severity: "warning",
      message: "3D source diagram should include named point/vertex data, not only a camera placeholder.",
      path: "graphConfig.data.points",
    });
  }
  if (needsStructured3d && segments.length < 3 && faces.length === 0 && solids.length === 0) {
    warnings.push({
      code: "graph3d-segments-missing",
      severity: "warning",
      message: "3D source diagram should include segment/edge data for the visible structure.",
      path: "graphConfig.data.segments",
    });
  }
  if (/\bpyramid\b/i.test(contextText) && faces.length < 4 && solids.length === 0) {
    warnings.push({
      code: "graph3d-pyramid-faces-missing",
      severity: "warning",
      message: "3D pyramid source diagram should include polygon faces for the base and triangular sides, not just edge lines.",
      path: "graphConfig.data.faces",
    });
  }
  for (const kind of ["cone", "cylinder", "sphere"] as const) {
    if (!new RegExp(`\\b${kind}\\b`, "i").test(contextText)) continue;
    const hasSolidKind = solids.some((solid) => String(solid.kind ?? solid.type ?? "").toLowerCase() === kind);
    if (!hasSolidKind && points.length < 4 && segments.length < 4 && faces.length === 0) {
      warnings.push({
        code: "graph3d-solid-kind-missing",
        severity: "warning",
        message: `3D ${kind} source diagram should use a graph3d ${kind} solid or enough explicit geometry to show the shape.`,
        path: "graphConfig.data.solids",
      });
    }
  }
  if (/\bspherical cap\b|\bsphere cap\b/i.test(contextText)) {
    const hasCapSolid = solids.some((solid) => {
      const kind = String(solid.kind ?? solid.type ?? "").toLowerCase();
      return kind === "spherecap" || kind === "sphericalcap";
    });
    if (!hasCapSolid) {
      warnings.push({
        code: "graph3d-solid-kind-missing",
        severity: "warning",
        message: "3D spherical-cap source diagram should use a graph3d sphereCap solid, not a full sphere placeholder.",
        path: "graphConfig.data.solids",
      });
    }
  }
  const pointIds = graph3dPointIds(points);
  for (const pair of expectedGraph3dSegmentPairs(contextText)) {
    const [first, second] = pair;
    if (!pointIds.has(first) || !pointIds.has(second)) continue;
    const hasPair = segments.some((segment) => {
      const pointPair = Array.isArray(segment.points) ? segment.points : [];
      const from = String(segment.from ?? pointPair[0] ?? "").toLowerCase();
      const to = String(segment.to ?? pointPair[1] ?? "").toLowerCase();
      return (from === first && to === second) || (from === second && to === first);
    });
    if (!hasPair) {
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

function graph3dPointIds(points: Array<Record<string, unknown>>) {
  const ids = new Set<string>();
  for (const point of points) {
    for (const value of [point.id, point.name, point.label]) {
      if (typeof value !== "string") continue;
      const normalized = normalizedMathText(value)
        .replace(/[^A-Za-z0-9]+/g, "")
        .toLowerCase();
      if (/^[a-z][a-z0-9]*$/.test(normalized)) ids.add(normalized);
    }
  }
  return ids;
}

function addSegmentPair(pairs: Set<string>, rawPair: string) {
  const normalized = rawPair.replace(/[^A-Za-z]/g, "").toLowerCase();
  if (!/^[a-z]{2}$/.test(normalized)) return;
  pairs.add(normalized);
}

function expectedGraph3dSegmentPairs(contextText: string) {
  const pairs = new Set<string>();
  for (const match of contextText.matchAll(/\\overrightarrow\s*\{\s*([A-Za-z])\s*([A-Za-z])\s*\}/g)) {
    addSegmentPair(pairs, `${match[1]}${match[2]}`);
  }
  for (const match of contextText.matchAll(/\\angle\s*([A-Za-z])\s*([A-Za-z])\s*([A-Za-z])/g)) {
    addSegmentPair(pairs, `${match[1]}${match[2]}`);
    addSegmentPair(pairs, `${match[2]}${match[3]}`);
  }
  for (const match of contextText.matchAll(
    /\b(?:[Ll]ine|[Ss]egment|[Ee]dge|[Dd]iagonal|[Rr]ay|[Vv]ector)\s+\$?([A-Z]{2})\$?(?![A-Za-z])/g,
  )) {
    addSegmentPair(pairs, match[1]);
  }
  for (const match of contextText.matchAll(/\b(?:[Mm]idpoint)\s+of\s+\$?([A-Z]{2})\$?(?![A-Za-z])/g)) {
    addSegmentPair(pairs, match[1]);
  }
  return [...pairs];
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
    ...inspectGraph2dVectorLabels(config, contextText),
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
    warning.code === "graph2d-source-equation-missing" ||
    warning.code === "graph2d-source-domain-mismatch" ||
    warning.code === "graph2d-source-point-missing" ||
    warning.code === "graph2d-source-axes-hidden" ||
    warning.code === "graph2d-source-axis-labels-hidden" ||
    warning.code === "graph2d-source-vector-labels-missing" ||
    warning.code === "scalar-product-vector-labels-missing" ||
    warning.code === "scalar-product-right-angle-missing" ||
    warning.code === "scalar-product-angle-marker-missing" ||
    warning.code === "scalar-product-right-angle-geometry-mismatch" ||
    warning.code === "scalar-product-angle-marker-geometry-mismatch" ||
    warning.code === "scalar-product-vector2d-axes-visible" ||
    warning.code === "scalar-product-segment-label-tex-unsafe" ||
    warning.code === "scalar-product-angle-label-tex-unsafe" ||
    warning.code === "scalar-product-vector-label-placement-missing" ||
    warning.code === "scalar-product-segment-label-placement-missing" ||
    warning.code === "scalar-product-angle-label-placement-missing" ||
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
    warning.code === "graph3d-pyramid-faces-missing" ||
    warning.code === "graph3d-solid-kind-missing" ||
    warning.code.startsWith("penrose-")
  );
}
