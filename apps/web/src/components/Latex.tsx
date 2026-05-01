import katex from "katex";

interface LatexProps {
  latex?: string | null;
  block?: boolean;
  displayStyle?: boolean;
}

export function Latex({ latex, block = false, displayStyle = false }: LatexProps) {
  if (!latex) {
    return <span className="text-muted-foreground">No expression yet.</span>;
  }

  const source = !block && displayStyle && !latex.trim().startsWith("\\displaystyle") ? `\\displaystyle ${latex}` : latex;
  const html = katex.renderToString(source, {
    displayMode: block,
    throwOnError: false,
    strict: "ignore",
  });

  return <span className={block ? "latex-block" : "latex-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
}
