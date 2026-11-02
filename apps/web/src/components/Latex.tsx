import { memo, useMemo } from "react";

import { renderMathJaxSvg } from "@/lib/mathjax";

interface LatexProps {
  latex?: string | null;
  block?: boolean;
  plainSimpleInlineLatex?: boolean;
  showSolutionMarks?: boolean;
}

export const Latex = memo(function Latex({ latex, block = false, plainSimpleInlineLatex = true, showSolutionMarks = false }: LatexProps) {
  const html = useMemo(
    () => (latex ? renderMathJaxSvg(latex, { display: block, plainSimpleInlineLatex, showSolutionMarks }) : ""),
    [block, latex, plainSimpleInlineLatex, showSolutionMarks],
  );

  if (!latex) {
    return <span className="text-muted-foreground">No expression yet.</span>;
  }

  return (
    <span className={block ? "latex-block mathjax-block" : "latex-inline mathjax-inline"} dangerouslySetInnerHTML={{ __html: html }} />
  );
});
