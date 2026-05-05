import katex from "katex";

import { inlineDisplayLatex } from "@/lib/latex";

interface LatexProps {
  latex?: string | null;
  block?: boolean;
}

export function Latex({ latex, block = false }: LatexProps) {
  if (!latex) {
    return <span className="text-muted-foreground">No expression yet.</span>;
  }

  const html = katex.renderToString(block ? latex : inlineDisplayLatex(latex), {
    displayMode: block,
    throwOnError: false,
    strict: "ignore",
  });

  return <span className={block ? "latex-block" : "latex-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
}
