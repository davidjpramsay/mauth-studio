const NUMBER_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i;
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*/i;
const MAX_EXPRESSION_LENGTH = 160;

type NumericFunction = (value: number) => number;

const NUMERIC_CONSTANTS: Record<string, number> = {
  e: Math.E,
  pi: Math.PI,
};

const NUMERIC_FUNCTIONS: Record<string, NumericFunction> = {
  abs: Math.abs,
  acos: Math.acos,
  asin: Math.asin,
  atan: Math.atan,
  cos: Math.cos,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  sin: Math.sin,
  sqrt: Math.sqrt,
  tan: Math.tan,
};

function normalizedNumericExpression(expression: string) {
  return expression
    .trim()
    .replaceAll("\\pi", "pi")
    .replace(/\\sqrt\s*/gi, "sqrt")
    .replaceAll("π", "pi")
    .replaceAll("√", "sqrt ")
    .replaceAll("×", "*")
    .replaceAll("·", "*")
    .replaceAll("÷", "/")
    .replace(/[−–—]/g, "-")
    .replaceAll("{", "(")
    .replaceAll("}", ")");
}

class NumericExpressionParser {
  private index = 0;
  private readonly expression: string;

  constructor(expression: string) {
    this.expression = expression;
  }

  parse() {
    const value = this.parseSum();
    this.skipWhitespace();
    if (this.index !== this.expression.length) throw new Error("Unexpected input");
    return value;
  }

  private parseSum(): number {
    let value = this.parseProduct();
    while (true) {
      this.skipWhitespace();
      if (this.consume("+")) value += this.parseProduct();
      else if (this.consume("-")) value -= this.parseProduct();
      else return value;
    }
  }

  private parseProduct(): number {
    let value = this.parseUnary();
    while (true) {
      this.skipWhitespace();
      if (this.consume("*")) value *= this.parseUnary();
      else if (this.consume("/")) value /= this.parseUnary();
      else if (this.startsPrimary()) value *= this.parseUnary();
      else return value;
    }
  }

  private parseUnary(): number {
    this.skipWhitespace();
    if (this.consume("+")) return this.parseUnary();
    if (this.consume("-")) return -this.parseUnary();
    return this.parsePower();
  }

  private parsePower(): number {
    const base = this.parsePrimary();
    this.skipWhitespace();
    return this.consume("^") ? base ** this.parseUnary() : base;
  }

  private parsePrimary(): number {
    this.skipWhitespace();

    if (this.consume("(")) {
      const value = this.parseSum();
      this.skipWhitespace();
      if (!this.consume(")")) throw new Error("Missing closing parenthesis");
      return value;
    }

    const remainder = this.expression.slice(this.index);
    const numberMatch = remainder.match(NUMBER_PATTERN);
    if (numberMatch) {
      this.index += numberMatch[0].length;
      return Number(numberMatch[0]);
    }

    const identifierMatch = remainder.match(IDENTIFIER_PATTERN);
    if (!identifierMatch) throw new Error("Expected a number");

    const identifier = identifierMatch[0].toLowerCase();
    this.index += identifierMatch[0].length;
    const constant = NUMERIC_CONSTANTS[identifier];
    if (constant !== undefined) return constant;

    const numericFunction = NUMERIC_FUNCTIONS[identifier];
    if (!numericFunction) throw new Error("Unknown identifier");

    this.skipWhitespace();
    const argument = this.expression[this.index] === "(" ? this.parsePrimary() : this.parseUnary();
    return numericFunction(argument);
  }

  private startsPrimary() {
    this.skipWhitespace();
    const next = this.expression[this.index];
    return next === "(" || next === "." || Boolean(next && /[0-9a-z]/i.test(next));
  }

  private skipWhitespace() {
    while (/\s/.test(this.expression[this.index] ?? "")) this.index += 1;
  }

  private consume(token: string) {
    if (this.expression.startsWith(token, this.index)) {
      this.index += token.length;
      return true;
    }
    return false;
  }
}

export function parseNumericExpression(expression: string): number | undefined {
  const normalized = normalizedNumericExpression(expression);
  if (!normalized || normalized.length > MAX_EXPRESSION_LENGTH) return undefined;

  try {
    const value = new NumericExpressionParser(normalized).parse();
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function roundedStepperValue(value: number) {
  return Number(value.toPrecision(14));
}

export function steppedNumericValue(value: number, direction: 1 | -1, step = 1, min?: number, max?: number) {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  const base = Number.isFinite(min) ? (min as number) : 0;
  const ratio = (value - base) / safeStep;
  const roundedRatio = Math.round(ratio);
  const isOnStep = Math.abs(ratio - roundedRatio) < 1e-10;
  const nextRatio = direction > 0 ? (isOnStep ? roundedRatio + 1 : Math.ceil(ratio)) : isOnStep ? roundedRatio - 1 : Math.floor(ratio);
  const stepped = roundedStepperValue(base + nextRatio * safeStep);
  return Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, stepped));
}
