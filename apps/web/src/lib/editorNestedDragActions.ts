import type { MoveDirection, DropPlacement } from "./documentNavigation.ts";
import type { ContainerOrderItem, QuestionBlock } from "./editorDocumentNormalization.ts";
import { orderItemKey } from "./editorDocumentNormalization.ts";
import {
  editorPageBreakTargetHasBreak,
  mauthTargetFromEditorPageBreak,
  orderedPartPageBreakTargets,
  orderedSubpartPageBreakTargets,
} from "./editorPageBreakLifecycle.ts";
import {
  editorPageBreakKey,
  findPartInQuestions,
  firstOrderItemInContainer,
  orderItemsForContainer,
  subsectionItemKind,
  subsectionOrderItem,
  subsectionSourceContainer,
  type EditorPageBreakTarget,
  type SubsectionContainerRef,
  type SubsectionDragTarget,
  type SubsectionDropIntent,
} from "./editorSubsectionDrag.ts";
import type { MauthAction, MauthContentScope } from "./mauthActions.ts";

export function contentScopeFromSubsectionContainer(container: SubsectionContainerRef): MauthContentScope | null {
  if (container.kind === "question") return { kind: "question", questionId: container.questionId };
  if (container.kind === "part" && container.partId) {
    return { kind: "part", questionId: container.questionId, partId: container.partId };
  }
  if (container.kind === "subpart" && container.partId && container.subpartId) {
    return { kind: "subpart", questionId: container.questionId, partId: container.partId, subpartId: container.subpartId };
  }
  return null;
}

function movePlacementFromIntent(intent: SubsectionDropIntent) {
  const beforeItem =
    intent.beforeItem ?? (intent.beforeBlockId ? ({ kind: "block", id: intent.beforeBlockId } satisfies ContainerOrderItem) : undefined);
  return beforeItem ? { item: beforeItem, position: "before" as const } : undefined;
}

export function subsectionMoveAction(active: SubsectionDragTarget, intent: SubsectionDropIntent): MauthAction | null {
  const activeKind = subsectionItemKind(active);
  const sourceContainer = subsectionSourceContainer(active);
  const placement = movePlacementFromIntent(intent);

  if (activeKind === "block") {
    const fromScope = contentScopeFromSubsectionContainer(sourceContainer);
    const toScope = contentScopeFromSubsectionContainer(intent.container);
    if (!fromScope || !toScope) return null;
    return {
      type: "module.move",
      fromScope,
      toScope,
      blockId: active.id,
      ...(placement ? { placement } : {}),
    };
  }

  if (activeKind === "part" && sourceContainer.kind === "question" && intent.container.kind === "question") {
    return {
      type: "part.move",
      fromQuestionId: sourceContainer.questionId,
      toQuestionId: intent.container.questionId,
      partId: active.id,
      ...(placement ? { placement } : {}),
    };
  }

  if (
    activeKind === "subpart" &&
    sourceContainer.kind === "part" &&
    sourceContainer.partId &&
    intent.container.kind === "part" &&
    intent.container.partId
  ) {
    return {
      type: "subpart.move",
      from: { questionId: sourceContainer.questionId, partId: sourceContainer.partId },
      to: { questionId: intent.container.questionId, partId: intent.container.partId },
      subpartId: active.id,
      ...(placement ? { placement } : {}),
    };
  }

  return null;
}

export function subsectionKeyboardMoveIntent(
  questions: QuestionBlock[],
  active: SubsectionDragTarget,
  direction: MoveDirection,
): SubsectionDropIntent | null {
  const container = subsectionSourceContainer(active);
  const activeItem = subsectionOrderItem(active);
  if (!activeItem) return null;
  const items = orderItemsForContainer(questions, container);
  const index = items.findIndex((item) => orderItemKey(item) === orderItemKey(activeItem));
  if (index < 0 || !items[index + direction]) return null;
  const beforeItem = direction < 0 ? items[index + direction] : items[index + 2];
  return container.kind === "subpart"
    ? { container, beforeBlockId: beforeItem?.kind === "block" ? beforeItem.id : undefined }
    : { container, beforeItem };
}

export function editorPageBreakDestinationAfter(
  targets: EditorPageBreakTarget[],
  target: EditorPageBreakTarget,
  placement: Exclude<DropPlacement, "inside">,
) {
  if (placement === "before") return target;
  const index = targets.findIndex((current) => editorPageBreakKey(current) === editorPageBreakKey(target));
  return index >= 0 ? targets[index + 1] : undefined;
}

export function editorPageBreakDestinationForTarget(
  questions: QuestionBlock[],
  source: EditorPageBreakTarget,
  target: SubsectionDragTarget,
  placement: Exclude<DropPlacement, "inside">,
): EditorPageBreakTarget | null {
  if (source.kind === "part" && target.kind === "part" && source.questionId === target.questionId) {
    const question = questions.find((current) => current.id === target.questionId);
    if (!question) return null;
    return (
      editorPageBreakDestinationAfter(
        orderedPartPageBreakTargets(question),
        { kind: "part", questionId: target.questionId, partId: target.id },
        placement,
      ) ?? null
    );
  }

  if (
    source.kind === "subpart" &&
    target.kind === "subpart" &&
    source.questionId === target.questionId &&
    source.partId === target.partId
  ) {
    const part = findPartInQuestions(questions, target.questionId, target.partId);
    if (!part) return null;
    return (
      editorPageBreakDestinationAfter(
        orderedSubpartPageBreakTargets(target.questionId, part),
        { kind: "subpart", questionId: target.questionId, partId: target.partId, subpartId: target.id },
        placement,
      ) ?? null
    );
  }

  return null;
}

export function editorPageBreakDestinationForOrderItem(
  source: EditorPageBreakTarget,
  container: SubsectionContainerRef,
  beforeItem: ContainerOrderItem,
): EditorPageBreakTarget | null {
  if (source.kind === "part" && container.kind === "question" && beforeItem.kind === "part") {
    if (source.questionId !== container.questionId) return null;
    return { kind: "part", questionId: container.questionId, partId: beforeItem.id };
  }

  if (source.kind === "subpart" && container.kind === "part" && beforeItem.kind === "subpart") {
    if (source.questionId !== container.questionId || source.partId !== container.partId) return null;
    return { kind: "subpart", questionId: container.questionId, partId: container.partId, subpartId: beforeItem.id };
  }

  return null;
}

export function editorPageBreakDestinationForContainer(
  questions: QuestionBlock[],
  source: EditorPageBreakTarget,
  container: SubsectionContainerRef,
  placement: "start" | "end",
): EditorPageBreakTarget | null {
  if (placement !== "start") return null;
  const firstItem = firstOrderItemInContainer(questions, container);
  return firstItem ? editorPageBreakDestinationForOrderItem(source, container, firstItem) : null;
}

export function editorPageBreakCanMoveTo(
  questions: QuestionBlock[],
  source: EditorPageBreakTarget,
  destination: EditorPageBreakTarget | null | undefined,
) {
  return Boolean(
    destination && editorPageBreakKey(source) !== editorPageBreakKey(destination) && !editorPageBreakTargetHasBreak(questions, destination),
  );
}

export function editorPageBreakMoveActions(
  questions: QuestionBlock[],
  source: EditorPageBreakTarget,
  destination: EditorPageBreakTarget,
): MauthAction[] | null {
  if (!editorPageBreakCanMoveTo(questions, source, destination)) return null;
  return [
    { type: "pageBreak.set", target: mauthTargetFromEditorPageBreak(source), enabled: false },
    { type: "pageBreak.set", target: mauthTargetFromEditorPageBreak(destination), enabled: true },
  ];
}

export function editorPageBreakKeyboardDestination(questions: QuestionBlock[], target: EditorPageBreakTarget, direction: MoveDirection) {
  const question = questions.find((current) => current.id === target.questionId);
  if (!question) return null;
  const targets =
    target.kind === "part"
      ? orderedPartPageBreakTargets(question)
      : (() => {
          const part = question.parts.find((current) => current.id === target.partId);
          return part ? orderedSubpartPageBreakTargets(question.id, part) : [];
        })();
  const sourceIndex = targets.findIndex((current) => editorPageBreakKey(current) === editorPageBreakKey(target));
  return sourceIndex >= 0 ? (targets[sourceIndex + direction] ?? null) : null;
}
