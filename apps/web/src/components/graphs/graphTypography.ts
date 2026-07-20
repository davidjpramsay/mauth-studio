export const GRAPH_LABEL_FONT_SIZE_PT = 10;
export const GRAPH_LABEL_FONT_UNIT = "pt";
export const TEST_TEXT_FONT_FAMILY = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const GRAPH_LABEL_FONT_CSS = `font-size: ${GRAPH_LABEL_FONT_SIZE_PT}pt; font-family: ${TEST_TEXT_FONT_FAMILY};`;

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
  if (trimmed.length >= 4 && trimmed.startsWith("$$") && trimmed.endsWith("$$")) return trimmed.slice(2, -2).trim();
  if (trimmed.length >= 2 && trimmed.startsWith("$") && endsWithUnescapedDollar(trimmed)) return trimmed.slice(1, -1).trim();
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
