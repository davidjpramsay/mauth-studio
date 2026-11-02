export const GRAPH_LABEL_FONT_SIZE_PT = 10;
export const GRAPH_LABEL_FONT_UNIT = "pt";
export const TEST_TEXT_FONT_FAMILY = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const GRAPH_LABEL_FONT_CSS = `font-size: ${GRAPH_LABEL_FONT_SIZE_PT}pt; font-family: ${TEST_TEXT_FONT_FAMILY}; font-weight: 400; font-style: normal;`;

export function graphLabelAttributes(extraCss = "") {
  return {
    fontSize: GRAPH_LABEL_FONT_SIZE_PT,
    fontUnit: GRAPH_LABEL_FONT_UNIT,
    cssStyle: `${GRAPH_LABEL_FONT_CSS}${extraCss}`,
    highlightCssStyle: `${GRAPH_LABEL_FONT_CSS}${extraCss}`,
    parse: false,
    useMathJax: false,
  };
}

const GRAPH_DELIMITED_MATH_PATTERN = /((?<!\\)\$\$[\s\S]+?(?<!\\)\$\$|(?<!\\)\$(?:\\\$|[^$\n])+?(?<!\\)\$)/g;

function endsWithUnescapedDollar(value: string) {
  if (!value.endsWith("$")) return false;
  let backslashCount = 0;
  for (let index = value.length - 2; index >= 0 && value[index] === "\\"; index -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 0;
}

export function stripGraphLatexDelimiters(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("$") && endsWithUnescapedDollar(trimmed)) {
    GRAPH_DELIMITED_MATH_PATTERN.lastIndex = 0;
    const matches = Array.from(trimmed.matchAll(GRAPH_DELIMITED_MATH_PATTERN));
    if (matches.length === 1 && matches[0][0] === trimmed)
      return trimmed.startsWith("$$") ? trimmed.slice(2, -2).trim() : trimmed.slice(1, -1).trim();
  }
  if (trimmed.startsWith("\\(") && trimmed.endsWith("\\)")) return trimmed.slice(2, -2).trim();
  if (trimmed.startsWith("\\[") && trimmed.endsWith("\\]")) return trimmed.slice(2, -2).trim();
  return trimmed;
}

function escapeGraphLatexText(value: string) {
  return value
    .replace(/\\\$/g, "$")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}_%&#$])/g, "\\$1");
}

function graphTextLatex(value: string) {
  return value ? `\\text{${escapeGraphLatexText(value)}}` : "";
}

function looksLikeBareGraphLatex(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/\\[A-Za-z]+|[_^{}]/.test(trimmed)) return true;
  if (/^[A-Za-z](?:\d+|_\{?[A-Za-z0-9]+\}?)?$/.test(trimmed)) return true;
  if (/[\s:]/.test(trimmed)) return false;
  return /[=<>+\-*/()[\]]/.test(trimmed) && /[A-Za-z0-9]/.test(trimmed);
}

export function graphLabelSourceLatex(value?: string) {
  const source = value ?? "";
  const trimmed = source.trim();
  if (!trimmed) return "";

  const stripped = stripGraphLatexDelimiters(trimmed);
  if (stripped !== trimmed) return stripped;

  GRAPH_DELIMITED_MATH_PATTERN.lastIndex = 0;
  const matches = Array.from(trimmed.matchAll(GRAPH_DELIMITED_MATH_PATTERN));
  if (matches.length) {
    const parts: string[] = [];
    let cursor = 0;
    matches.forEach((match) => {
      const start = match.index ?? 0;
      if (start > cursor) parts.push(graphTextLatex(trimmed.slice(cursor, start)));
      parts.push(stripGraphLatexDelimiters(match[0]));
      cursor = start + match[0].length;
    });
    if (cursor < trimmed.length) parts.push(graphTextLatex(trimmed.slice(cursor)));
    return parts.filter(Boolean).join("");
  }

  return looksLikeBareGraphLatex(trimmed) ? trimmed : graphTextLatex(trimmed);
}

export interface GraphLabelSegment {
  kind: "text" | "math";
  source: string;
}

// Decode only ordinary text and literal TeX escapes. Formatting commands and
// nested mathematical groups remain MathJax's responsibility.
function graphPlainTextGroup(source: string, start: number) {
  let text = "";
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "}") return { text, end: index + 1 };
    if (char === "{") return null;
    if (char !== "\\") {
      text += char;
      continue;
    }
    if (source.startsWith("\\textbackslash{}", index)) {
      text += "\\";
      index += "\\textbackslash{}".length - 1;
    } else if (/[{}_%&#$\\ ]/.test(source[index + 1] ?? "")) {
      text += source[++index];
    } else return null;
  }
  return null;
}

export function graphLabelSegments(value: string, forceMath = false, sourceIsLatex = false): GraphLabelSegment[] {
  const source = forceMath ? stripGraphLatexDelimiters(value) : sourceIsLatex ? value : graphLabelSourceLatex(value);
  if (!source) return [];
  if (forceMath) return [{ kind: "math", source }];
  const segments: GraphLabelSegment[] = [];
  let depth = 0;
  let environmentDepth = 0;
  let mathStart = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\\") {
      const environment = source.slice(index).match(/^\\(begin|end)\s*\{[^{}]*\}/);
      if (environment) {
        environmentDepth = Math.max(0, environmentDepth + (environment[1] === "begin" ? 1 : -1));
        index += environment[0].length - 1;
        continue;
      }
      if (depth === 0 && environmentDepth === 0 && source.startsWith("\\text{", index)) {
        const group = graphPlainTextGroup(source, index + 6);
        if (group) {
          if (index > mathStart) segments.push({ kind: "math", source: source.slice(mathStart, index) });
          if (group.text) segments.push({ kind: "text", source: group.text });
          index = group.end - 1;
          mathStart = group.end;
          continue;
        }
      }
      // Escaped braces are literals rather than group boundaries.
      if (source[index + 1] === "{" || source[index + 1] === "}") index += 1;
    } else if (source[index] === "{") depth += 1;
    else if (source[index] === "}") depth -= 1;
  }
  if (mathStart < source.length) segments.push({ kind: "math", source: source.slice(mathStart) });
  return segments;
}
