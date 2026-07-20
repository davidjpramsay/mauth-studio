import type { EditorPart, OrderedPartItem, OrderedQuestionItem, QuestionBlock } from "./editorDocumentNormalization.ts";
import { orderedPartItems, orderedQuestionItems } from "./editorDocumentNormalization.ts";
import type { MauthAction } from "./mauthActions.ts";
import { parseScrollAnchor } from "./scrollAnchors.ts";
import type { EditorPageBreakTarget } from "./editorSubsectionDrag.ts";

export type MauthPageBreakTarget = Extract<MauthAction, { type: "pageBreak.set" }>["target"];

export type PartPageBreakTarget = Extract<EditorPageBreakTarget, { kind: "part" }>;
export type SubpartPageBreakTarget = Extract<EditorPageBreakTarget, { kind: "subpart" }>;

export function mauthTargetFromEditorPageBreak(target: EditorPageBreakTarget): MauthPageBreakTarget {
  if (target.kind === "part") {
    return { kind: "part", questionId: target.questionId, partId: target.partId };
  }
  return { kind: "subpart", questionId: target.questionId, partId: target.partId, subpartId: target.subpartId };
}

export function editorPageBreakTargetHasBreak(questions: readonly QuestionBlock[], target: EditorPageBreakTarget) {
  const question = questions.find((current) => current.id === target.questionId);
  if (!question) return false;
  if (target.kind === "part") {
    return question.parts.find((part) => part.id === target.partId)?.pageBreakBefore === true;
  }
  return (
    question.parts.find((part) => part.id === target.partId)?.subparts.find((subpart) => subpart.id === target.subpartId)
      ?.pageBreakBefore === true
  );
}

export function orderedPartPageBreakTargets(question: QuestionBlock): PartPageBreakTarget[] {
  return orderedQuestionItems(question)
    .filter((item): item is Extract<OrderedQuestionItem, { kind: "part" }> => item.kind === "part")
    .map((item) => ({ kind: "part" as const, questionId: question.id, partId: item.part.id }));
}

export function orderedSubpartPageBreakTargets(questionId: string, part: EditorPart): SubpartPageBreakTarget[] {
  return orderedPartItems(part)
    .filter((item): item is Extract<OrderedPartItem, { kind: "subpart" }> => item.kind === "subpart")
    .map((item) => ({ kind: "subpart" as const, questionId, partId: part.id, subpartId: item.subpart.id }));
}

export function firstInsertableEditorPageBreakTarget<TTarget extends EditorPageBreakTarget>({
  targets,
  hasBreak,
  preferredAfterIndex = -1,
}: {
  targets: readonly TTarget[];
  hasBreak: (target: TTarget) => boolean;
  preferredAfterIndex?: number;
}) {
  const afterPreferred = preferredAfterIndex >= 0 ? targets.slice(preferredAfterIndex + 1) : [];
  return afterPreferred.find((target) => !hasBreak(target)) ?? targets.find((target) => !hasBreak(target)) ?? null;
}

export function partPageBreakInsertTarget({
  question,
  activeAnchor,
  hasBreak,
}: {
  question: QuestionBlock;
  activeAnchor: string;
  hasBreak: (target: PartPageBreakTarget) => boolean;
}) {
  const targets = orderedPartPageBreakTargets(question);
  const active = parseScrollAnchor(activeAnchor);
  const preferredAfterIndex =
    active.questionId === question.id && active.partId ? targets.findIndex((target) => target.partId === active.partId) : -1;
  return firstInsertableEditorPageBreakTarget({ targets, hasBreak, preferredAfterIndex });
}

export function subpartPageBreakInsertTarget({
  questionId,
  part,
  activeAnchor,
  hasBreak,
}: {
  questionId: string;
  part: EditorPart;
  activeAnchor: string;
  hasBreak: (target: SubpartPageBreakTarget) => boolean;
}) {
  const targets = orderedSubpartPageBreakTargets(questionId, part);
  const active = parseScrollAnchor(activeAnchor);
  const preferredAfterIndex =
    active.questionId === questionId && active.partId === part.id && active.subpartId
      ? targets.findIndex((target) => target.subpartId === active.subpartId)
      : -1;
  return firstInsertableEditorPageBreakTarget({ targets, hasBreak, preferredAfterIndex });
}
