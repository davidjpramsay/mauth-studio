export interface SolutionMarkInsertion {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

export function normalizedSolutionMarkCount(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return 1;
  return Math.max(1, Math.min(20, Math.round(numberValue)));
}

export function solutionMarkAnnotationText(marks: unknown) {
  return `[[marks:${normalizedSolutionMarkCount(marks)}]]`;
}

export function insertSolutionMarkAnnotation(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  marks: unknown,
): SolutionMarkInsertion {
  const start = Math.max(0, Math.min(text.length, Math.floor(Number.isFinite(selectionStart) ? selectionStart : text.length)));
  const end = Math.max(0, Math.min(text.length, Math.floor(Number.isFinite(selectionEnd) ? selectionEnd : start)));
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const annotation = solutionMarkAnnotationText(marks);
  const prefixNeedsSpace = from > 0 && !/\s/.test(text[from - 1] ?? "");
  const suffixNeedsSpace = to < text.length && !/\s/.test(text[to] ?? "");
  const insertion = `${prefixNeedsSpace ? " " : ""}${annotation}${suffixNeedsSpace ? " " : ""}`;
  const nextText = `${text.slice(0, from)}${insertion}${text.slice(to)}`;
  const caret = from + insertion.length;
  return {
    text: nextText,
    selectionStart: caret,
    selectionEnd: caret,
  };
}
