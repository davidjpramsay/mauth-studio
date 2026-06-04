export const DELIMITED_MATH_PATTERN = /((?<!\\)\$\$[\s\S]+?(?<!\\)\$\$|(?<!\\)\$(?:\\\$|[^$\n])+?(?<!\\)\$)/g;
export const MIXED_MATH_LINE_PATTERN =
  /((?<!\\)\$\$[\s\S]+?(?<!\\)\$\$(?:\s*\[\[marks:\d+]])?|(?<!\\)\$(?:\\\$|[^$\n])+?(?<!\\)\$(?:\s*\[\[marks:\d+]])?)/g;
export const DISPLAY_MATH_BLOCK_PATTERN = /((?<!\\)\$\$[\s\S]+?(?<!\\)\$\$(?:\s*\[\[marks:\d+]])?)/g;

export function unescapeTextMathDelimiters(text: string) {
  return text.replace(/\\\$/g, "$");
}
