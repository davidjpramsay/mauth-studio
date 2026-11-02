export interface SolutionMarkInsertion {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

const MATH_MARK_PATTERN = /\[\[marks:\s*\d+\s*\]\]/gi;

// Row annotations are Mauth metadata, never TeX. Keep nested cases/matrices
// intact: their row separators do not start a new row in the owning alignment.
export function alignedSolutionMarks(source: string) {
  const opening = source.match(/^\s*(?:\\displaystyle\s*)?\\begin\{(aligned|align\*?)\}(?:\s*\[[tb]\])?/);
  const unmarked = () => ({ latex: source.replace(MATH_MARK_PATTERN, ""), rowMarks: [] as number[] });
  if (!opening) return unmarked();
  const ending = `\\end{${opening[1]}}`;
  const end = source.lastIndexOf(ending);
  if (end < opening[0].length || source.slice(end + ending.length).trim()) return unmarked();
  const body = source.slice(opening[0].length, end);
  const rows: string[] = [];
  const separators: string[] = [];
  let start = 0;
  let braces = 0;
  let environments = 0;
  for (let cursor = 0; cursor < body.length; cursor++) {
    if (body[cursor] === "\\") {
      const environment = body.slice(cursor).match(/^\\(begin|end)\{[^}]+\}/);
      if (environment) {
        environments += environment[1] === "begin" ? 1 : -1;
        cursor += environment[0].length - 1;
        continue;
      }
      const separator = body.slice(cursor).match(/^\\\\(?:\s*\[[^\]]*\])?/);
      if (separator && braces === 0 && environments === 0) {
        rows.push(body.slice(start, cursor));
        separators.push(separator[0]);
        cursor += separator[0].length - 1;
        start = cursor + 1;
        continue;
      }
      cursor++; // Escaped braces and nested TeX row separators.
    } else if (body[cursor] === "{") braces++;
    else if (body[cursor] === "}") braces--;
  }
  if (braces !== 0 || environments !== 0) return unmarked();
  rows.push(body.slice(start));
  // TeX allows a trailing row separator without adding another rendered row.
  if (!rows.at(-1)?.trim() && separators.length) rows.pop();
  const rowMarks: number[] = [];
  const cleanRows = rows.map((row) => {
    const annotation = row.match(/\s*\[\[marks:\s*(\d+)\s*\]\]\s*$/i);
    rowMarks.push(annotation ? Math.max(0, Math.min(20, Number(annotation[1]))) : 0);
    return (annotation ? row.slice(0, annotation.index) : row).replace(MATH_MARK_PATTERN, "");
  });
  return {
    latex: opening[0] + cleanRows.map((row, index) => row + (separators[index] ?? "")).join("") + source.slice(end),
    rowMarks,
  };
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
