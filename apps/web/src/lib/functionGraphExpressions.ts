import type { GraphConfig } from "@mauth-studio/shared";

// Compile a restricted mathematical grammar into closures. Document text must never
// be compiled as JavaScript: the preview runs with the editor's API authority.
type MathNode = (x: number, y: number) => number;
const graphFunctions = new Map<string, (value: number) => number>([
  ["sin", Math.sin],
  ["cos", Math.cos],
  ["tan", Math.tan],
  ["asin", Math.asin],
  ["acos", Math.acos],
  ["atan", Math.atan],
  ["sqrt", Math.sqrt],
  ["abs", Math.abs],
  ["log", Math.log],
  ["ln", Math.log],
  ["log10", Math.log10],
  ["exp", Math.exp],
  ["sinh", Math.sinh],
  ["cosh", Math.cosh],
  ["tanh", Math.tanh],
  ["floor", Math.floor],
  ["ceil", Math.ceil],
  ["round", Math.round],
  ["trunc", Math.trunc],
  ["sign", Math.sign],
  ["cbrt", Math.cbrt],
  ["log2", Math.log2],
]);

class GraphExpressionParser {
  private index = 0;
  private readonly source: string;
  private readonly allowY: boolean;
  constructor(source: string, allowY: boolean) {
    if (!source.trim() || source.length > 512) throw new Error("Invalid graph expression");
    this.source = source;
    this.allowY = allowY;
  }

  parse(): MathNode {
    const result = this.sum();
    this.space();
    if (this.index !== this.source.length) throw new Error("Unexpected graph expression input");
    return result;
  }

  private space() {
    while (/\s/.test(this.source[this.index] ?? "")) this.index++;
  }
  private take(token: string) {
    this.space();
    if (!this.source.startsWith(token, this.index)) return false;
    this.index += token.length;
    return true;
  }
  private sum(): MathNode {
    let left = this.product();
    while (true) {
      if (this.take("+")) {
        const a = left,
          b = this.product();
        left = (x, y) => a(x, y) + b(x, y);
      } else if (this.take("-")) {
        const a = left,
          b = this.product();
        left = (x, y) => a(x, y) - b(x, y);
      } else return left;
    }
  }
  private product(): MathNode {
    let left = this.unary();
    while (true) {
      this.space();
      if (this.source.startsWith("**", this.index)) return left;
      if (this.take("*")) {
        const a = left,
          b = this.unary();
        left = (x, y) => a(x, y) * b(x, y);
      } else if (this.take("/")) {
        const a = left,
          b = this.unary();
        left = (x, y) => a(x, y) / b(x, y);
      } else if (/^[.(0-9xy]/i.test(this.source.slice(this.index))) {
        const a = left,
          b = this.unary();
        left = (x, y) => a(x, y) * b(x, y);
      } else return left;
    }
  }
  private unary(): MathNode {
    if (this.take("+")) return this.unary();
    if (this.take("-")) {
      const a = this.unary();
      return (x, y) => -a(x, y);
    }
    return this.power();
  }
  private power(): MathNode {
    const a = this.primary();
    if (this.take("**") || this.take("^")) {
      const b = this.unary();
      return (x, y) => a(x, y) ** b(x, y);
    }
    return a;
  }
  private primary(): MathNode {
    this.space();
    if (this.take("(")) {
      const node = this.sum();
      if (!this.take(")")) throw new Error("Missing closing parenthesis");
      return node;
    }
    const rest = this.source.slice(this.index);
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) {
      this.index += number[0].length;
      const value = Number(number[0]);
      return () => value;
    }
    const fn = rest.match(
      /^(?:Math\.)?(asin|acos|atan|sinh|cosh|tanh|sqrt|log10|floor|round|trunc|sign|ceil|cbrt|log2|sin|cos|tan|abs|log|exp|ln)(?=\s*\()/i,
    );
    if (fn) {
      this.index += fn[0].length;
      if (!this.take("(")) throw new Error("Expected function argument");
      const arg = this.sum();
      if (!this.take(")")) throw new Error("Missing function parenthesis");
      const operation = graphFunctions.get(fn[1].toLowerCase());
      if (!operation) throw new Error("Unknown function");
      return (x, y) => operation(arg(x, y));
    }
    const constant = rest.match(/^pi/i);
    if (constant) {
      this.index += constant[0].length;
      return () => Math.PI;
    }
    if (rest[0] === "e") {
      this.index++;
      return () => Math.E;
    }
    if (rest[0] === "x") {
      this.index++;
      return (x) => x;
    }
    if (rest[0] === "y" && this.allowY) {
      this.index++;
      return (_x, y) => y;
    }
    throw new Error("Invalid graph expression");
  }
}

export function createEvaluator(expression: string) {
  const evaluator = new GraphExpressionParser(expression, false).parse();
  return (x: number) => evaluator(x, 0);
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
  const evaluator = new GraphExpressionParser(relationExpressionToZero(expression), true).parse();
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
  const evaluator = new GraphExpressionParser(slopeFieldExpression(expression), true).parse();
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
