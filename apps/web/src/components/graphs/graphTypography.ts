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
