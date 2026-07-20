export const DEFAULT_SOLUTION_SLOT_LINES = 8;
export const MIN_SOLUTION_SLOT_LINES = 4;
export const MAX_SOLUTION_SLOT_LINES = 18;
export const DEFAULT_SOLUTION_SLOT_TEXT = "\n";
export const DEFAULT_SOLUTION_SPACE_SHOW_LINES = false;

interface SolutionSlotDocumentLike {
  titlePageTemplate?: string;
}

function safeMarkValue(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, numberValue) : 0;
}

export function defaultSolutionSlotLines(marks: unknown) {
  const safeMarks = safeMarkValue(marks);
  if (!safeMarks) return DEFAULT_SOLUTION_SLOT_LINES;
  return Math.max(MIN_SOLUTION_SLOT_LINES, Math.min(MAX_SOLUTION_SLOT_LINES, Math.ceil(safeMarks * 3 + 2)));
}

export function defaultSolutionSlotLinesForDocument(document: SolutionSlotDocumentLike, marks: unknown) {
  const baseLines = defaultSolutionSlotLines(marks);
  if (document.titlePageTemplate !== "exam") return baseLines;

  const safeMarks = safeMarkValue(marks);
  const generousExamLines = safeMarks ? Math.ceil(safeMarks * 3 + 4) : DEFAULT_SOLUTION_SLOT_LINES + 2;
  return Math.max(baseLines, Math.min(MAX_SOLUTION_SLOT_LINES, generousExamLines));
}
