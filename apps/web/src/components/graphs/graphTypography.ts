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
