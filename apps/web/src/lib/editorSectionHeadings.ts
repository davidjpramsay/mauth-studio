import type { MoveDirection } from "./documentNavigation.ts";
import { type DocumentFlowItem, type DocumentSectionHeading, type QuestionBlock } from "./editorDocumentNormalization.ts";
import {
  SCROLL_ANCHOR_FRONT_MATTER,
  questionIdFromScrollAnchor,
  questionScrollAnchor,
  sectionHeadingIdFromScrollAnchor,
  sectionHeadingScrollAnchor,
} from "./scrollAnchors.ts";

export const DEFAULT_SECTION_HEADING_TITLE = "Section heading";

export type NormalizeDocumentFlow = (
  value: unknown,
  questions: QuestionBlock[],
  sectionHeadings: DocumentSectionHeading[],
) => DocumentFlowItem[];

export interface SectionHeadingAddPlan {
  heading: DocumentSectionHeading;
  sectionHeadings: DocumentSectionHeading[];
  documentFlow: DocumentFlowItem[];
  anchor: string;
}

export interface SectionHeadingRemovalPlan {
  sectionHeadings: DocumentSectionHeading[];
  documentFlow: DocumentFlowItem[];
  fallbackAnchor: string;
  fallbackQuestionId: string;
}

export interface SectionHeadingMovePlan {
  documentFlow: DocumentFlowItem[];
  anchor: string;
}

export function firstQuestionId(questions: QuestionBlock[]) {
  return questions[0]?.id ?? "";
}

export function existingOrFirstQuestionId(questions: QuestionBlock[], preferredQuestionId: string) {
  return questions.some((question) => question.id === preferredQuestionId) ? preferredQuestionId : firstQuestionId(questions);
}

export function firstQuestionAnchor(questions: QuestionBlock[]) {
  const questionId = firstQuestionId(questions);
  return questionId ? questionScrollAnchor(questionId) : SCROLL_ANCHOR_FRONT_MATTER;
}

export function flowItemAnchor(item?: DocumentFlowItem | null) {
  if (!item) return "";
  return item.kind === "sectionHeading" ? sectionHeadingScrollAnchor(item.id) : questionScrollAnchor(item.id);
}

export function firstDocumentFlowAnchor(documentFlow: DocumentFlowItem[], questions: QuestionBlock[]) {
  return flowItemAnchor(documentFlow[0]) || firstQuestionAnchor(questions);
}

export function topLevelFlowInsertIndex(anchor: string, normalizedFlow: DocumentFlowItem[]) {
  const sectionHeadingId = sectionHeadingIdFromScrollAnchor(anchor);
  if (sectionHeadingId) {
    const headingIndex = normalizedFlow.findIndex((item) => item.kind === "sectionHeading" && item.id === sectionHeadingId);
    return headingIndex >= 0 ? headingIndex + 1 : normalizedFlow.length;
  }

  const questionId = questionIdFromScrollAnchor(anchor);
  if (questionId) {
    const questionIndex = normalizedFlow.findIndex((item) => item.kind === "question" && item.id === questionId);
    return questionIndex >= 0 ? questionIndex : normalizedFlow.length;
  }

  return normalizedFlow.length;
}

export function plannedSectionHeadingAdd({
  headingId,
  anchor,
  documentFlow,
  questions,
  sectionHeadings,
  normalizeDocumentFlow,
  title = DEFAULT_SECTION_HEADING_TITLE,
}: {
  headingId: string;
  anchor: string;
  documentFlow: DocumentFlowItem[];
  questions: QuestionBlock[];
  sectionHeadings: DocumentSectionHeading[];
  normalizeDocumentFlow: NormalizeDocumentFlow;
  title?: string;
}): SectionHeadingAddPlan {
  const heading = { id: headingId, title } satisfies DocumentSectionHeading;
  const normalizedFlow = normalizeDocumentFlow(documentFlow, questions, sectionHeadings);
  const insertIndex = topLevelFlowInsertIndex(anchor, normalizedFlow);
  const clampedInsertIndex = Math.max(0, Math.min(insertIndex, normalizedFlow.length));
  const nextFlow = [
    ...normalizedFlow.slice(0, clampedInsertIndex),
    { kind: "sectionHeading", id: heading.id } satisfies DocumentFlowItem,
    ...normalizedFlow.slice(clampedInsertIndex),
  ];
  const nextAnchor = sectionHeadingScrollAnchor(heading.id);
  return {
    heading,
    sectionHeadings: [...sectionHeadings, heading],
    documentFlow: nextFlow,
    anchor: nextAnchor,
  };
}

export function updatedSectionHeadings(
  sectionHeadings: DocumentSectionHeading[],
  sectionHeadingId: string,
  update: string | Partial<DocumentSectionHeading>,
): DocumentSectionHeading[] | null {
  const existing = sectionHeadings.find((heading) => heading.id === sectionHeadingId);
  if (!existing) return null;
  const patch = typeof update === "string" ? { title: update } : update;
  const nextHeading = { ...existing, ...patch, id: existing.id };
  if (JSON.stringify(existing) === JSON.stringify(nextHeading)) return null;
  return sectionHeadings.map((heading) => (heading.id === sectionHeadingId ? nextHeading : heading));
}

export function plannedSectionHeadingRemoval({
  sectionHeadingId,
  documentFlow,
  questions,
  sectionHeadings,
  normalizeDocumentFlow,
}: {
  sectionHeadingId: string;
  documentFlow: DocumentFlowItem[];
  questions: QuestionBlock[];
  sectionHeadings: DocumentSectionHeading[];
  normalizeDocumentFlow: NormalizeDocumentFlow;
}): SectionHeadingRemovalPlan | null {
  if (!sectionHeadings.some((heading) => heading.id === sectionHeadingId)) return null;

  const normalizedFlow = normalizeDocumentFlow(documentFlow, questions, sectionHeadings);
  const removedIndex = normalizedFlow.findIndex((item) => item.kind === "sectionHeading" && item.id === sectionHeadingId);
  const nextHeadings = sectionHeadings.filter((heading) => heading.id !== sectionHeadingId);
  const nextFlow = normalizedFlow.filter((item) => item.kind !== "sectionHeading" || item.id !== sectionHeadingId);
  const fallbackIndex = Math.min(Math.max(removedIndex, 0), nextFlow.length - 1);
  const fallbackAnchor = flowItemAnchor(nextFlow[fallbackIndex]) || firstQuestionAnchor(questions);
  return {
    sectionHeadings: nextHeadings,
    documentFlow: nextFlow,
    fallbackAnchor,
    fallbackQuestionId: questionIdFromScrollAnchor(fallbackAnchor),
  };
}

export function plannedSectionHeadingMove({
  sectionHeadingId,
  direction,
  documentFlow,
  questions,
  sectionHeadings,
  normalizeDocumentFlow,
}: {
  sectionHeadingId: string;
  direction: MoveDirection;
  documentFlow: DocumentFlowItem[];
  questions: QuestionBlock[];
  sectionHeadings: DocumentSectionHeading[];
  normalizeDocumentFlow: NormalizeDocumentFlow;
}): SectionHeadingMovePlan | null {
  const normalizedFlow = normalizeDocumentFlow(documentFlow, questions, sectionHeadings);
  const sourceIndex = normalizedFlow.findIndex((item) => item.kind === "sectionHeading" && item.id === sectionHeadingId);
  const targetIndex = sourceIndex + direction;
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= normalizedFlow.length) return null;

  const nextFlow = [...normalizedFlow];
  const [item] = nextFlow.splice(sourceIndex, 1);
  nextFlow.splice(targetIndex, 0, item);
  return {
    documentFlow: nextFlow,
    anchor: sectionHeadingScrollAnchor(sectionHeadingId),
  };
}
