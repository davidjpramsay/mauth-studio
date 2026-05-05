const LEADING_STYLE_COMMAND_PATTERN = /^\\(?:display|text|script|scriptscript)style\b/;

export function inlineDisplayLatex(latex: string) {
  const trimmed = latex.trim();
  if (!trimmed || LEADING_STYLE_COMMAND_PATTERN.test(trimmed)) return trimmed;
  return `\\displaystyle ${trimmed}`;
}
