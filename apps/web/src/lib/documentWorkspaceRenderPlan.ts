export type DocumentEditorSurfaceKind = "frontMatter" | "pageBreak" | "sectionHeading" | "question" | "empty";

export function documentEditorSurfaceKind({
  editingFrontMatter,
  editingPageBreak,
  editingSectionHeading,
  hasActivePageBreak,
  hasActiveSectionHeading,
  hasActiveQuestion,
}: {
  editingFrontMatter: boolean;
  editingPageBreak: boolean;
  editingSectionHeading: boolean;
  hasActivePageBreak: boolean;
  hasActiveSectionHeading: boolean;
  hasActiveQuestion: boolean;
}): DocumentEditorSurfaceKind {
  if (editingFrontMatter) return "frontMatter";
  if (editingPageBreak) return hasActivePageBreak ? "pageBreak" : "empty";
  if (editingSectionHeading) return hasActiveSectionHeading ? "sectionHeading" : "empty";
  return hasActiveQuestion ? "question" : "empty";
}

export function documentQuestionPanelLabel({
  isNotesTemplate,
  questionIndex,
  displayNumber,
}: {
  isNotesTemplate: boolean;
  questionIndex: number;
  displayNumber: number;
}) {
  return isNotesTemplate ? `Heading ${questionIndex + 1}` : `Question ${displayNumber}`;
}

export function documentPageBreakPanelLabel({
  isNotesTemplate,
  questionIndex,
  displayNumber,
}: {
  isNotesTemplate: boolean;
  questionIndex: number;
  displayNumber: number;
}) {
  return `Page break after ${documentQuestionPanelLabel({ isNotesTemplate, questionIndex, displayNumber })}`;
}
