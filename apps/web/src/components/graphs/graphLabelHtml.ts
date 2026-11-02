import { renderMathJaxSvg } from "@/lib/mathjax";
import { graphLabelSegments, TEST_TEXT_FONT_FAMILY } from "./graphTypography";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function graphLabelHtml(source: string, forceMath = false, sourceIsLatex = false) {
  return graphLabelSegments(source, forceMath, sourceIsLatex)
    .map((segment) =>
      segment.kind === "text"
        ? `<span class="graph-label-prose" style="font-family:${TEST_TEXT_FONT_FAMILY};font-weight:400;font-style:normal;white-space:pre;">${escapeHtml(segment.source)}</span>`
        : renderMathJaxSvg(segment.source, { display: false, plainSimpleInlineLatex: false }),
    )
    .join("");
}
