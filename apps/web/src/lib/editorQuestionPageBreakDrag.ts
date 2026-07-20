import type { DropPlacement } from "./documentNavigation.ts";
import type { QuestionBlock } from "./editorDocumentNormalization.ts";

type QuestionPlacement = Exclude<DropPlacement, "inside">;

export function questionDropIsNoop(questions: readonly QuestionBlock[], draggedId: string, targetId: string, placement: QuestionPlacement) {
  if (draggedId === targetId) return true;
  const draggedIndex = questions.findIndex((question) => question.id === draggedId);
  const targetIndex = questions.findIndex((question) => question.id === targetId);
  if (draggedIndex === -1 || targetIndex === -1) return true;
  return (placement === "before" && targetIndex === draggedIndex + 1) || (placement === "after" && targetIndex === draggedIndex - 1);
}

export function pageBreakDropBoundaryQuestionId(
  questions: readonly QuestionBlock[],
  targetQuestionId: string,
  placement: QuestionPlacement,
) {
  if (placement === "after") return targetQuestionId;
  const targetIndex = questions.findIndex((question) => question.id === targetQuestionId);
  if (targetIndex <= 0) return "";
  return questions[targetIndex - 1]?.id ?? "";
}

export function questionsWithMovedPageBreak(
  questions: readonly QuestionBlock[],
  sourceQuestionId: string,
  targetQuestionId: string,
): QuestionBlock[] {
  if (!sourceQuestionId || !targetQuestionId || sourceQuestionId === targetQuestionId) return [...questions];
  return questions.map((question) => {
    if (question.id !== sourceQuestionId && question.id !== targetQuestionId) return question;
    const contentBlocks = question.contentBlocks.filter((block) => block.kind !== "pageBreak");
    if (question.id === sourceQuestionId) return { ...question, pageBreakAfter: false, contentBlocks };
    return { ...question, pageBreakAfter: true, contentBlocks };
  });
}
