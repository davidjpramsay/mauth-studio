const LEADING_STYLE_COMMAND_PATTERN = /^\\(?:display|text|script|scriptscript)style\b/;
const SIMPLE_INLINE_NUMBER_PATTERN = /^[+-]?(?:(?:\d+(?:[ ,]\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:\s*%)?$/;

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

export function plainTextForSimpleInlineLatex(latex: string) {
  const trimmed = normalizeLatexSource(latex).replace(LEADING_STYLE_COMMAND_PATTERN, "").trim();
  const candidate = trimmed
    .replace(/\\,/g, " ")
    .replace(/\\%/g, "%")
    .replace(/\s+/g, " ")
    .replace(/\s+(?=%$)/, "")
    .trim();
  return SIMPLE_INLINE_NUMBER_PATTERN.test(candidate) ? candidate : null;
}
