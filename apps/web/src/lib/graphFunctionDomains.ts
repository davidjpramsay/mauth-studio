import type { GraphConfig } from "@mauth-studio/shared";

interface LinearXExpression {
  slope: number;
  intercept: number;
}

export interface GraphFunctionNaturalBoundary {
  kind: "log" | "sqrt";
  boundary: number;
  side: "left" | "right";
  strict: boolean;
  source: string;
}

export interface GraphFunctionDomain {
  xStart: number;
  xEnd: number;
}

const NATURAL_DOMAIN_EPSILON_RATIO = 1e-12;
const MIN_NATURAL_DOMAIN_EPSILON = 1e-12;
const NATURAL_BOUNDARY_MANUAL_SNAP_RATIO = 0.01;
const MIN_NATURAL_BOUNDARY_MANUAL_SNAP = 0.025;

function stripBalancedOuterParens(expression: string) {
  let source = expression.trim();
  while (source.startsWith("(") && source.endsWith(")")) {
    let depth = 0;
    let wraps = true;
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (depth === 0 && index < source.length - 1) {
        wraps = false;
        break;
      }
    }
    if (!wraps) break;
    source = source.slice(1, -1).trim();
  }
  return source;
}

function parseSimpleLinearXExpression(expression: string): LinearXExpression | undefined {
  const source = stripBalancedOuterParens(expression)
    .replace(/\s+/g, "")
    .replace(/Math\./g, "")
    .replace(/\*\*/g, "^");
  const match = source.match(/^([+-]?(?:\d+(?:\.\d+)?)?)\*?x([+-]\d+(?:\.\d+)?)?$/i);
  if (!match) {
    const leadingInterceptMatch = source.match(/^([+-]?\d+(?:\.\d+)?)([+-])((?:\d+(?:\.\d+)?)?)\*?x$/i);
    if (!leadingInterceptMatch) return undefined;
    const intercept = Number(leadingInterceptMatch[1]);
    const magnitudeText = leadingInterceptMatch[3] ?? "";
    const magnitude = magnitudeText === "" ? 1 : Number(magnitudeText);
    const slope = leadingInterceptMatch[2] === "-" ? -magnitude : magnitude;
    if (!Number.isFinite(slope) || !Number.isFinite(intercept) || slope === 0) return undefined;
    return { slope, intercept };
  }

  const slopeText = match[1] ?? "";
  const slope = slopeText === "" || slopeText === "+" ? 1 : slopeText === "-" ? -1 : Number(slopeText);
  const intercept = match[2] === undefined ? 0 : Number(match[2]);
  if (!Number.isFinite(slope) || !Number.isFinite(intercept) || slope === 0) return undefined;
  return { slope, intercept };
}

function extractFunctionCallArguments(expression: string, names: readonly string[]) {
  const argumentsByName: Array<{ name: string; argument: string }> = [];
  const namePattern = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`\\b(${namePattern})\\s*\\(`, "gi");
  for (let match = pattern.exec(expression); match; match = pattern.exec(expression)) {
    let depth = 1;
    let cursor = pattern.lastIndex;
    for (; cursor < expression.length; cursor += 1) {
      const char = expression[cursor];
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (depth === 0) break;
    }
    if (depth !== 0) continue;
    argumentsByName.push({ name: match[1].toLowerCase(), argument: expression.slice(pattern.lastIndex, cursor) });
    pattern.lastIndex = cursor + 1;
  }
  return argumentsByName;
}

export function graphFunctionNaturalBoundaries(expression: string): GraphFunctionNaturalBoundary[] {
  return extractFunctionCallArguments(expression, ["log10", "log", "ln", "sqrt"]).flatMap(({ name, argument }) => {
    const linear = parseSimpleLinearXExpression(argument);
    if (!linear) return [];
    const boundary = -linear.intercept / linear.slope;
    if (!Number.isFinite(boundary)) return [];
    const side = linear.slope > 0 ? "left" : "right";
    return [
      {
        kind: name === "sqrt" ? "sqrt" : "log",
        boundary,
        side,
        strict: name !== "sqrt",
        source: `${name}(${argument})`,
      },
    ];
  });
}

export function graphFunctionNaturalDomainText(boundary: GraphFunctionNaturalBoundary) {
  const relation = boundary.side === "left" ? (boundary.strict ? ">" : ">=") : boundary.strict ? "<" : "<=";
  return `x ${relation} ${Number(boundary.boundary.toFixed(6))}`;
}

export function graphFunctionNaturalDomainEpsilon(graphConfig: GraphConfig) {
  const xMin = graphConfig.xMin ?? -10;
  const xMax = graphConfig.xMax ?? 10;
  const span = Math.abs(xMax - xMin);
  return Math.max(span * NATURAL_DOMAIN_EPSILON_RATIO, MIN_NATURAL_DOMAIN_EPSILON);
}

export function graphFunctionNaturalBoundaryRenderGap(graphConfig: GraphConfig) {
  return graphFunctionNaturalDomainEpsilon(graphConfig);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
}

function verticalLineSegmentX(feature: Record<string, unknown>, tolerance: number) {
  if (feature.kind !== "line_segment" || feature.show === false) return undefined;
  const x1 = finiteNumber(feature.x1) ? feature.x1 : undefined;
  const x2 = finiteNumber(feature.x2) ? feature.x2 : undefined;
  if (x1 === undefined || x2 === undefined || Math.abs(x1 - x2) > tolerance) return undefined;
  return (x1 + x2) / 2;
}

function hasMatchingNaturalAsymptoteFeature(graphConfig: GraphConfig, boundary: number, tolerance: number) {
  return recordArray(graphConfig.features).some((feature) => {
    const verticalX = verticalLineSegmentX(feature, tolerance);
    return verticalX !== undefined && Math.abs(verticalX - boundary) <= tolerance;
  });
}

export function snapManualDomainToNaturalAsymptotes(
  expression: string | undefined,
  domain: GraphFunctionDomain,
  graphConfig: GraphConfig,
): GraphFunctionDomain {
  if (!expression?.trim()) return domain;
  const xMin = graphConfig.xMin ?? -10;
  const xMax = graphConfig.xMax ?? 10;
  const span = Math.abs(xMax - xMin);
  const tolerance = Math.max(span * NATURAL_BOUNDARY_MANUAL_SNAP_RATIO, MIN_NATURAL_BOUNDARY_MANUAL_SNAP);
  const epsilon = graphFunctionNaturalDomainEpsilon(graphConfig);
  let { xStart, xEnd } = domain;

  for (const boundary of graphFunctionNaturalBoundaries(expression)) {
    if (!boundary.strict || !hasMatchingNaturalAsymptoteFeature(graphConfig, boundary.boundary, tolerance)) continue;
    if (boundary.side === "left") {
      const distance = xStart - boundary.boundary;
      if (distance > epsilon && distance <= tolerance) xStart = boundary.boundary + epsilon;
    } else {
      const distance = boundary.boundary - xEnd;
      if (distance > epsilon && distance <= tolerance) xEnd = boundary.boundary - epsilon;
    }
  }

  return { xStart, xEnd };
}

export function clampDomainToNaturalBoundaries(
  expression: string | undefined,
  domain: GraphFunctionDomain,
  graphConfig: GraphConfig,
): GraphFunctionDomain {
  if (!expression?.trim()) return domain;
  const epsilon = graphFunctionNaturalDomainEpsilon(graphConfig);
  let { xStart, xEnd } = domain;
  for (const boundary of graphFunctionNaturalBoundaries(expression)) {
    const boundaryValue = boundary.boundary + (boundary.strict ? epsilon : 0) * (boundary.side === "left" ? 1 : -1);
    if (boundary.side === "left") {
      xStart = Math.max(xStart, boundaryValue);
    } else {
      xEnd = Math.min(xEnd, boundaryValue);
    }
  }
  return { xStart, xEnd };
}

export function separateRangeFromStrictNaturalBoundaries(
  expression: string | undefined,
  range: GraphFunctionDomain,
  graphConfig: GraphConfig,
): GraphFunctionDomain {
  if (!expression?.trim()) return range;
  const renderGap = graphFunctionNaturalBoundaryRenderGap(graphConfig);
  let { xStart, xEnd } = range;
  for (const boundary of graphFunctionNaturalBoundaries(expression)) {
    if (!boundary.strict) continue;
    const boundaryValue = boundary.boundary + renderGap * (boundary.side === "left" ? 1 : -1);
    if (boundary.side === "left") {
      xStart = Math.max(xStart, boundaryValue);
    } else {
      xEnd = Math.min(xEnd, boundaryValue);
    }
  }
  return { xStart, xEnd };
}
