const LEADING_STYLE_COMMAND_PATTERN = /^\\(?:display|text|script|scriptscript)style\b/;

export function normalizeLatexSource(latex: string) {
  return latex
    .trim()
    .replace(/\\begin\{aligned\*\}/g, "\\begin{aligned}")
    .replace(/\\end\{aligned\*\}/g, "\\end{aligned}");
}

export function inlineDisplayLatex(latex: string) {
  const trimmed = normalizeLatexSource(latex);
  if (!trimmed || LEADING_STYLE_COMMAND_PATTERN.test(trimmed)) return trimmed;
  // MathJax display mode is block layout, so keep inline maths inline and opt into display-style sizing explicitly.
  return `\\displaystyle ${trimmed}`;
}
