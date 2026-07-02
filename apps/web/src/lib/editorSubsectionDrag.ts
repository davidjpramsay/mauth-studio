import type { DropPlacement } from "./documentNavigation.ts";
import {
  normalizeItemOrder,
  orderItemKey,
  partAllowedOrderItems,
  questionAllowedOrderItems,
  type ContainerOrderItem,
  type QuestionBlock,
} from "./editorDocumentNormalization.ts";

export type SubsectionDragKind = "question-block" | "part" | "part-block" | "subpart" | "subpart-block";
export type SubsectionItemKind = "block" | "part" | "subpart";
export type SubsectionContainerKind = "question" | "part" | "subpart";

export interface SubsectionDragTarget {
  kind: SubsectionDragKind;
  questionId: string;
  id: string;
  partId?: string;
  subpartId?: string;
}

export interface SubsectionContainerRef {
  kind: SubsectionContainerKind;
  questionId: string;
  partId?: string;
  subpartId?: string;
}

export interface SubsectionDropIntent {
  container: SubsectionContainerRef;
  beforeItem?: ContainerOrderItem;
  beforeBlockId?: string;
}

export interface SubsectionDropPreview {
  targetKey: string;
  placement: DropPlacement;
  intent: SubsectionDropIntent;
}

export type EditorPageBreakTarget =
  | { kind: "part"; questionId: string; partId: string }
  | { kind: "subpart"; questionId: string; partId: string; subpartId: string };

export interface EditorPageBreakDropPreview {
  targetKey: string;
  placement: Exclude<DropPlacement, "inside">;
  destination: EditorPageBreakTarget;
}

export const SUBSECTION_DRAG_MIME = "application/x-math-subsection";
export const SUBSECTION_DRAG_TEXT_PREFIX = "math-subsection:";
export const PAGE_BREAK_DRAG_MIME = "application/x-mauth-page-break";
export const PAGE_BREAK_DRAG_TEXT_PREFIX = "mauth-page-break:";
export const EDITOR_PAGE_BREAK_DRAG_MIME = "application/x-mauth-editor-page-break";
export const EDITOR_PAGE_BREAK_DRAG_TEXT_PREFIX = "mauth-editor-page-break:";

export function containerKey(container?: SubsectionContainerRef | null) {
  if (!container) return "";
  return `${container.kind}:${container.questionId}:${container.partId ?? ""}:${container.subpartId ?? ""}`;
}

export function containerDropKey(container: SubsectionContainerRef, placement: "start" | "end") {
  return `container:${containerKey(container)}:${placement}`;
}

export function itemDropKey(container: SubsectionContainerRef, beforeItem: ContainerOrderItem) {
  return `container:${containerKey(container)}:before:${orderItemKey(beforeItem)}`;
}

export function containerDropZoneLabel(container: SubsectionContainerRef, placement: "start" | "end") {
  const scope = container.kind === "question" ? "question" : container.kind;
  return placement === "start" ? `Drop at start of ${scope}` : `Drop at end of ${scope}`;
}

export function itemDropZoneLabel(beforeItem: ContainerOrderItem) {
  if (beforeItem.kind === "part") return "Drop above part";
  if (beforeItem.kind === "subpart") return "Drop above subpart";
  return "Drop above module";
}

export function subsectionKey(target?: SubsectionDragTarget | null) {
  if (!target) return "";
  return `${target.kind}:${target.questionId}:${target.partId ?? ""}:${target.subpartId ?? ""}:${target.id}`;
}

export function isSubsectionDragKind(value: string | undefined): value is SubsectionDragKind {
  return value === "question-block" || value === "part" || value === "part-block" || value === "subpart" || value === "subpart-block";
}

export function isSubsectionContainerKind(value: string | undefined): value is SubsectionContainerKind {
  return value === "question" || value === "part" || value === "subpart";
}

export function isContainerOrderItemKind(value: string | undefined): value is ContainerOrderItem["kind"] {
  return value === "block" || value === "part" || value === "subpart";
}

export function subsectionTargetDataAttributes(target: SubsectionDragTarget): Record<string, string> {
  return {
    "data-subsection-target-kind": target.kind,
    "data-subsection-target-question-id": target.questionId,
    "data-subsection-target-id": target.id,
    ...(target.partId ? { "data-subsection-target-part-id": target.partId } : {}),
    ...(target.subpartId ? { "data-subsection-target-subpart-id": target.subpartId } : {}),
  };
}

export function subsectionContainerDataAttributes(container: SubsectionContainerRef): Record<string, string> {
  return {
    "data-subsection-container-kind": container.kind,
    "data-subsection-container-question-id": container.questionId,
    ...(container.partId ? { "data-subsection-container-part-id": container.partId } : {}),
    ...(container.subpartId ? { "data-subsection-container-subpart-id": container.subpartId } : {}),
  };
}

export function subsectionTargetFromDataset(dataset: Pick<DOMStringMap, keyof DOMStringMap>): SubsectionDragTarget | null {
  const kind = dataset.subsectionTargetKind;
  const questionId = dataset.subsectionTargetQuestionId;
  const id = dataset.subsectionTargetId;
  if (!isSubsectionDragKind(kind) || !questionId || !id) return null;
  if ((kind === "part-block" || kind === "subpart" || kind === "subpart-block") && !dataset.subsectionTargetPartId) return null;
  if (kind === "subpart-block" && !dataset.subsectionTargetSubpartId) return null;
  return {
    kind,
    questionId,
    id,
    ...(dataset.subsectionTargetPartId ? { partId: dataset.subsectionTargetPartId } : {}),
    ...(dataset.subsectionTargetSubpartId ? { subpartId: dataset.subsectionTargetSubpartId } : {}),
  };
}

export function subsectionContainerFromDataset(dataset: Pick<DOMStringMap, keyof DOMStringMap>): SubsectionContainerRef | null {
  const kind = dataset.subsectionContainerKind;
  const questionId = dataset.subsectionContainerQuestionId;
  if (!isSubsectionContainerKind(kind) || !questionId) return null;
  if ((kind === "part" || kind === "subpart") && !dataset.subsectionContainerPartId) return null;
  if (kind === "subpart" && !dataset.subsectionContainerSubpartId) return null;
  return {
    kind,
    questionId,
    ...(dataset.subsectionContainerPartId ? { partId: dataset.subsectionContainerPartId } : {}),
    ...(dataset.subsectionContainerSubpartId ? { subpartId: dataset.subsectionContainerSubpartId } : {}),
  };
}

export function subsectionItemKind(target: SubsectionDragTarget): SubsectionItemKind {
  if (target.kind === "part") return "part";
  if (target.kind === "subpart") return "subpart";
  return "block";
}

export function subsectionSourceContainer(target: SubsectionDragTarget): SubsectionContainerRef {
  if (target.kind === "question-block" || target.kind === "part") return { kind: "question", questionId: target.questionId };
  if (target.kind === "part-block" || target.kind === "subpart") {
    return { kind: "part", questionId: target.questionId, partId: target.partId };
  }
  return { kind: "subpart", questionId: target.questionId, partId: target.partId, subpartId: target.subpartId };
}

export function subsectionOrderItem(target: SubsectionDragTarget): ContainerOrderItem | null {
  if (target.kind === "question-block" || target.kind === "part-block" || target.kind === "subpart-block") {
    return { kind: "block", id: target.id };
  }
  if (target.kind === "part") return { kind: "part", id: target.id };
  if (target.kind === "subpart") return { kind: "subpart", id: target.id };
  return null;
}

export function canDropIntoContainer(active: SubsectionDragTarget, container: SubsectionContainerRef) {
  const activeKind = subsectionItemKind(active);
  if (activeKind === "part") return container.kind === "question";
  if (activeKind === "subpart") return container.kind === "part";
  return true;
}

export function findPartInQuestions(questions: QuestionBlock[], questionId: string, partId?: string) {
  if (!partId) return null;
  return questions.find((question) => question.id === questionId)?.parts.find((part) => part.id === partId) ?? null;
}

export function findSubpartInQuestions(questions: QuestionBlock[], questionId: string, partId?: string, subpartId?: string) {
  if (!subpartId) return null;
  return findPartInQuestions(questions, questionId, partId)?.subparts.find((subpart) => subpart.id === subpartId) ?? null;
}

export function orderItemsForContainer(questions: QuestionBlock[], container: SubsectionContainerRef): ContainerOrderItem[] {
  if (container.kind === "question") {
    const question = questions.find((current) => current.id === container.questionId);
    return question ? normalizeItemOrder(question.itemOrder, questionAllowedOrderItems(question.contentBlocks, question.parts ?? [])) : [];
  }

  if (container.kind === "part") {
    const part = findPartInQuestions(questions, container.questionId, container.partId);
    return part ? normalizeItemOrder(part.itemOrder, partAllowedOrderItems(part.contentBlocks, part.subparts ?? [])) : [];
  }

  const subpart = findSubpartInQuestions(questions, container.questionId, container.partId, container.subpartId);
  return subpart?.contentBlocks.filter((block) => block.kind !== "pageBreak").map((block) => ({ kind: "block", id: block.id })) ?? [];
}

export function withoutOrderItem(items: ContainerOrderItem[], item?: ContainerOrderItem | null) {
  if (!item) return items;
  const key = orderItemKey(item);
  return items.filter((current) => orderItemKey(current) !== key);
}

export function nextOrderItemInContainer(
  questions: QuestionBlock[],
  container: SubsectionContainerRef,
  item: ContainerOrderItem,
  skipItem?: ContainerOrderItem | null,
) {
  const items = withoutOrderItem(orderItemsForContainer(questions, container), skipItem);
  const index = items.findIndex((current) => orderItemKey(current) === orderItemKey(item));
  return index >= 0 ? items[index + 1] : undefined;
}

export function firstOrderItemInContainer(
  questions: QuestionBlock[],
  container: SubsectionContainerRef,
  skipItem?: ContainerOrderItem | null,
) {
  return withoutOrderItem(orderItemsForContainer(questions, container), skipItem)[0];
}

export function subsectionDropWouldKeepSameOrder(
  active: SubsectionDragTarget,
  container: SubsectionContainerRef,
  beforeItem: ContainerOrderItem | undefined,
  questions: QuestionBlock[],
) {
  const activeContainer = subsectionSourceContainer(active);
  if (containerKey(activeContainer) !== containerKey(container)) return false;

  const activeItem = subsectionOrderItem(active);
  if (!activeItem) return false;

  const orderedKeys = orderItemsForContainer(questions, container).map(orderItemKey);
  const activeIndex = orderedKeys.indexOf(orderItemKey(activeItem));
  if (activeIndex < 0) return false;

  if (!beforeItem) return activeIndex === orderedKeys.length - 1;

  const beforeKey = orderItemKey(beforeItem);
  const beforeIndex = orderedKeys.indexOf(beforeKey);
  return beforeIndex === activeIndex || beforeIndex === activeIndex + 1;
}

export function dropIntentForContainer(
  active: SubsectionDragTarget,
  container: SubsectionContainerRef,
  questions: QuestionBlock[],
  placement: "start" | "end" = "end",
): SubsectionDropIntent | null {
  if (!canDropIntoContainer(active, container)) return null;
  const beforeItem = placement === "start" ? firstOrderItemInContainer(questions, container, subsectionOrderItem(active)) : undefined;
  if (subsectionDropWouldKeepSameOrder(active, container, beforeItem, questions)) return null;

  if (container.kind === "subpart") {
    return {
      container,
      beforeBlockId: beforeItem?.kind === "block" ? beforeItem.id : undefined,
    };
  }

  return { container, beforeItem };
}

export function dropIntentBeforeOrderItem(
  active: SubsectionDragTarget,
  container: SubsectionContainerRef,
  beforeItem: ContainerOrderItem,
  questions: QuestionBlock[],
): SubsectionDropIntent | null {
  if (!canDropIntoContainer(active, container)) return null;
  const activeItem = subsectionOrderItem(active);
  if (subsectionDropWouldKeepSameOrder(active, container, beforeItem, questions)) return null;
  const orderedItems = withoutOrderItem(orderItemsForContainer(questions, container), activeItem);
  if (!orderedItems.some((item) => orderItemKey(item) === orderItemKey(beforeItem))) return null;

  if (container.kind === "subpart") {
    return beforeItem.kind === "block" ? { container, beforeBlockId: beforeItem.id } : null;
  }

  return { container, beforeItem };
}

export function subsectionDropIntent(
  active: SubsectionDragTarget,
  target: SubsectionDragTarget,
  placement: Exclude<DropPlacement, "inside">,
  questions: QuestionBlock[],
): SubsectionDropIntent | null {
  if (subsectionKey(active) === subsectionKey(target)) return null;
  const targetItem = subsectionOrderItem(target);
  if (!targetItem) return null;
  const activeItem = subsectionOrderItem(active);
  const targetContainer = subsectionSourceContainer(target);
  if (!canDropIntoContainer(active, targetContainer)) return null;

  const beforeItem = placement === "before" ? targetItem : nextOrderItemInContainer(questions, targetContainer, targetItem, activeItem);
  if (subsectionDropWouldKeepSameOrder(active, targetContainer, beforeItem, questions)) return null;
  if (targetContainer.kind === "subpart") {
    return {
      container: targetContainer,
      beforeBlockId: beforeItem?.kind === "block" ? beforeItem.id : undefined,
    };
  }

  return { container: targetContainer, beforeItem };
}

export function subsectionDropPreviewTargetKey(target: SubsectionDragTarget, preview: Pick<SubsectionDropPreview, "placement" | "intent">) {
  if (preview.placement === "inside") return subsectionKey(target);
  const beforeItem =
    preview.intent.beforeItem ??
    (preview.intent.beforeBlockId ? ({ kind: "block", id: preview.intent.beforeBlockId } satisfies ContainerOrderItem) : undefined);
  return beforeItem ? itemDropKey(preview.intent.container, beforeItem) : containerDropKey(preview.intent.container, "end");
}

export function serializeSubsectionDrag(target: SubsectionDragTarget) {
  return JSON.stringify(target);
}

export function parseSubsectionDrag(payload: string): SubsectionDragTarget | null {
  if (!payload) return null;
  const json = payload.startsWith(SUBSECTION_DRAG_TEXT_PREFIX) ? payload.slice(SUBSECTION_DRAG_TEXT_PREFIX.length) : payload;
  try {
    const parsed = JSON.parse(json) as Partial<SubsectionDragTarget>;
    if (!parsed.kind || !parsed.questionId || !parsed.id) return null;
    if (!isSubsectionDragKind(parsed.kind)) return null;
    return {
      kind: parsed.kind,
      questionId: parsed.questionId,
      id: parsed.id,
      ...(parsed.partId ? { partId: parsed.partId } : {}),
      ...(parsed.subpartId ? { subpartId: parsed.subpartId } : {}),
    };
  } catch {
    return null;
  }
}

export function parsePageBreakDrag(payload: string, allowRaw = false) {
  if (!payload) return "";
  if (payload.startsWith(PAGE_BREAK_DRAG_TEXT_PREFIX)) return payload.slice(PAGE_BREAK_DRAG_TEXT_PREFIX.length);
  return allowRaw ? payload : "";
}

export function editorPageBreakKey(target?: EditorPageBreakTarget | null) {
  if (!target) return "";
  return target.kind === "part"
    ? `part:${target.questionId}:${target.partId}`
    : `subpart:${target.questionId}:${target.partId}:${target.subpartId}`;
}

export function editorPageBreakTargetKey(target: SubsectionDragTarget) {
  return `editor-page-break-target:${subsectionKey(target)}`;
}

export function serializeEditorPageBreakDrag(target: EditorPageBreakTarget) {
  return JSON.stringify(target);
}

export function parseEditorPageBreakDrag(payload: string): EditorPageBreakTarget | null {
  if (!payload) return null;
  const json = payload.startsWith(EDITOR_PAGE_BREAK_DRAG_TEXT_PREFIX) ? payload.slice(EDITOR_PAGE_BREAK_DRAG_TEXT_PREFIX.length) : payload;
  try {
    const parsed = JSON.parse(json) as Partial<EditorPageBreakTarget>;
    if (parsed.kind === "part" && parsed.questionId && parsed.partId) {
      return { kind: "part", questionId: parsed.questionId, partId: parsed.partId };
    }
    if (parsed.kind === "subpart" && parsed.questionId && parsed.partId && parsed.subpartId) {
      return { kind: "subpart", questionId: parsed.questionId, partId: parsed.partId, subpartId: parsed.subpartId };
    }
    return null;
  } catch {
    return null;
  }
}
