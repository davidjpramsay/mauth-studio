import type { GraphConfig } from "@mauth-studio/shared";

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

export function createEvaluator(expression: string) {
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

export function createImplicitEvaluator(expression: string) {
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

export function createSlopeFieldEvaluator(expression: string) {
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

export function graphSpan(min: number, max: number) {
  const span = max - min;
  return Number.isFinite(span) && span > 0 ? span : 1;
}

export function gridClipRect(graphConfig: GraphConfig) {
  return {
    xMin: graphConfig.xMin ?? -10,
    xMax: graphConfig.xMax ?? 10,
    yMin: graphConfig.yMin ?? -10,
    yMax: graphConfig.yMax ?? 10,
  };
}

export function finiteImplicitValue(evaluator: (x: number, y: number) => number, x: number, y: number) {
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

export function findScalarRoots(evaluator: (value: number) => number | null, min: number, max: number) {
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

export function implicitSlopeAt(expression: string, x: number, y: number, graphConfig: GraphConfig) {
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
