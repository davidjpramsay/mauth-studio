import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

export type MauthOrderItemKind = "block" | "part" | "subpart";

export interface MauthOrderItem {
  kind: MauthOrderItemKind;
  id: string;
}

export interface MauthSubpartLike {
  id: string;
  label?: string;
  text?: string;
  marks: number;
  pageBreakBefore?: boolean;
  contentBlocks: ContentBlock[];
}

export interface MauthPartLike {
  id: string;
  label?: string;
  text?: string;
  marks: number;
  pageBreakBefore?: boolean;
  contentBlocks: ContentBlock[];
  subparts?: MauthSubpartLike[];
  itemOrder?: MauthOrderItem[];
}

export interface MauthQuestionLike {
  id: string;
  text?: string;
  marks: number;
  contentBlocks: ContentBlock[];
  parts?: MauthPartLike[];
  itemOrder?: MauthOrderItem[];
  pageBreakAfter?: boolean;
}

export type MauthContentScope =
  | { kind: "question"; questionId: string }
  | { kind: "part"; questionId: string; partId: string }
  | { kind: "subpart"; questionId: string; partId: string; subpartId: string };

export type MauthMarkTarget =
  | { kind: "question"; questionId: string }
  | { kind: "part"; questionId: string; partId: string }
  | { kind: "subpart"; questionId: string; partId: string; subpartId: string };

export type MauthPageBreakTarget = MauthMarkTarget;

export interface MauthPartPlacement {
  partId: string;
  position: "before" | "after";
}

export interface MauthSubpartPlacement {
  subpartId: string;
  position: "before" | "after";
}

export interface MauthBlockPlacement {
  blockId: string;
  position: "before" | "after";
}

export interface MauthOrderPlacement {
  item: MauthOrderItem;
  position: "before" | "after";
}

export type MauthPartMovePlacement = MauthPartPlacement | MauthOrderPlacement;
export type MauthSubpartMovePlacement = MauthSubpartPlacement | MauthOrderPlacement;
export type MauthModuleMovePlacement = MauthBlockPlacement | MauthOrderPlacement;

export type MauthAction =
  | { type: "question.add"; question: MauthQuestionLike; afterQuestionId?: string }
  | { type: "question.update"; questionId: string; patch: Record<string, unknown> }
  | { type: "question.delete"; questionId: string; fallbackQuestion?: MauthQuestionLike }
  | { type: "question.reorder"; questionId: string; targetQuestionId: string; placement: "before" | "after" }
  | { type: "part.add"; questionId: string; part: MauthPartLike; placement?: MauthPartPlacement }
  | { type: "part.update"; questionId: string; partId: string; patch: Record<string, unknown> }
  | { type: "part.delete"; questionId: string; partId: string }
  | { type: "part.reorder"; questionId: string; partId: string; targetPartId: string; placement: "before" | "after" }
  | { type: "part.move"; fromQuestionId: string; toQuestionId: string; partId: string; placement?: MauthPartMovePlacement }
  | { type: "subpart.add"; questionId: string; partId: string; subpart: MauthSubpartLike; placement?: MauthSubpartPlacement }
  | { type: "subpart.update"; questionId: string; partId: string; subpartId: string; patch: Record<string, unknown> }
  | { type: "subpart.delete"; questionId: string; partId: string; subpartId: string }
  | {
      type: "subpart.reorder";
      questionId: string;
      partId: string;
      subpartId: string;
      targetSubpartId: string;
      placement: "before" | "after";
    }
  | {
      type: "subpart.move";
      from: { questionId: string; partId: string };
      to: { questionId: string; partId: string };
      subpartId: string;
      placement?: MauthSubpartMovePlacement;
    }
  | { type: "module.add"; scope: MauthContentScope; blocks: ContentBlock[]; placement?: MauthBlockPlacement }
  | { type: "module.update"; scope: MauthContentScope; blockId: string; patch: Record<string, unknown> }
  | { type: "module.delete"; scope: MauthContentScope; blockId: string }
  | { type: "module.reorder"; scope: MauthContentScope; blockId: string; targetBlockId: string; placement: "before" | "after" }
  | {
      type: "module.move";
      fromScope: MauthContentScope;
      toScope: MauthContentScope;
      blockId: string;
      placement?: MauthModuleMovePlacement;
    }
  | { type: "solutionSlot.add"; scope: MauthContentScope; blocks: ContentBlock[]; placement?: MauthBlockPlacement }
  | { type: "marks.update"; target: MauthMarkTarget; marks: number }
  | { type: "diagram.update"; scope: MauthContentScope; blockId: string; graphConfig: GraphConfig }
  | { type: "pageBreak.set"; target: MauthPageBreakTarget; enabled: boolean }
  | { type: "validation.solution.run" };

export type MauthDocumentAction =
  | MauthAction
  | { type: "frontMatter.update"; patch: Record<string, unknown> }
  | { type: "frontMatter.replace"; frontMatter: object }
  | { type: "frontMatter.logo.set"; logoId: string; schoolName?: string }
  | { type: "pageFormat.update"; patch: Record<string, unknown> }
  | { type: "formatting.update"; patch: Record<string, unknown> }
  | { type: "document.validation.run" };

export const MAUTH_CONTENT_ACTION_TYPES = [
  "question.add",
  "question.update",
  "question.delete",
  "question.reorder",
  "part.add",
  "part.update",
  "part.delete",
  "part.reorder",
  "part.move",
  "subpart.add",
  "subpart.update",
  "subpart.delete",
  "subpart.reorder",
  "subpart.move",
  "module.add",
  "module.update",
  "module.delete",
  "module.reorder",
  "module.move",
  "solutionSlot.add",
  "marks.update",
  "diagram.update",
  "pageBreak.set",
  "validation.solution.run",
] as const satisfies readonly MauthAction["type"][];

export const MAUTH_DOCUMENT_ONLY_ACTION_TYPES = [
  "frontMatter.update",
  "frontMatter.replace",
  "frontMatter.logo.set",
  "pageFormat.update",
  "formatting.update",
  "document.validation.run",
] as const satisfies readonly MauthDocumentAction["type"][];

export const MAUTH_DOCUMENT_ACTION_TYPES = [...MAUTH_CONTENT_ACTION_TYPES, ...MAUTH_DOCUMENT_ONLY_ACTION_TYPES] as const;

export interface MauthActionWarning {
  code: string;
  message: string;
  targetId?: string;
}

export interface MauthActionResult<Q extends MauthQuestionLike = MauthQuestionLike> {
  ok: boolean;
  actionType: MauthAction["type"] | "batch";
  questions: Q[];
  changedIds: string[];
  warnings: MauthActionWarning[];
  error?: string;
  validation?: unknown;
  appliedActionTypes?: MauthAction["type"][];
  results?: MauthActionResult<Q>[];
}

export interface MauthDocumentLike<
  Q extends MauthQuestionLike = MauthQuestionLike,
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
> {
  frontMatter: F;
  questions: Q[];
  formattingConfig?: C;
}

export interface MauthDocumentActionResult<
  Q extends MauthQuestionLike = MauthQuestionLike,
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
> {
  ok: boolean;
  actionType: MauthDocumentAction["type"] | "batch";
  document: MauthDocumentLike<Q, F, C>;
  questions: Q[];
  changedIds: string[];
  warnings: MauthActionWarning[];
  error?: string;
  validation?: unknown;
  appliedActionTypes?: MauthDocumentAction["type"][];
  results?: MauthDocumentActionResult<Q, F, C>[];
  preview?: MauthActionPreviewSummary;
}

export interface MauthActionPreviewCounts {
  actions: number;
  added: number;
  deleted: number;
  moved: number;
  reordered: number;
  updated: number;
  frontMatterFields: number;
  formattingFields: number;
  pageFormatFields: number;
  warnings: number;
}

export interface MauthActionPreviewSummary {
  dryRun: boolean;
  valid: boolean;
  requestedActionCount: number;
  attemptedActionCount: number;
  actionCounts: Partial<Record<MauthDocumentAction["type"], number>>;
  counts: MauthActionPreviewCounts;
  changedIds: string[];
  addedIds: string[];
  deletedIds: string[];
  movedIds: string[];
  reorderedIds: string[];
  updatedIds: string[];
  frontMatterFields: string[];
  formattingFields: string[];
  pageFormatFields: string[];
  validation?: unknown;
  error?: string;
}

export interface MauthActionOptions<Q extends MauthQuestionLike = MauthQuestionLike> {
  normalizeQuestion?: (question: Q) => Q;
  normalizePart?: (part: MauthPartLike) => MauthPartLike;
  validateSolutions?: (questions: Q[]) => unknown;
}

export interface MauthDocumentActionOptions<
  Q extends MauthQuestionLike = MauthQuestionLike,
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
> extends MauthActionOptions<Q> {
  dryRun?: boolean;
  normalizeFrontMatter?: (frontMatter: F) => F;
  normalizeFormattingConfig?: (formattingConfig: C) => C;
  validateDocument?: (document: MauthDocumentLike<Q, F, C>) => unknown;
}

interface ScopedPatchResult<Q extends MauthQuestionLike> {
  found: boolean;
  questions: Q[];
}

interface BlockPatchResult<Q extends MauthQuestionLike> extends ScopedPatchResult<Q> {
  blockFound: boolean;
}

type ScopedContentContainer = {
  contentBlocks: ContentBlock[];
  itemOrder?: MauthOrderItem[];
};

const DOCUMENT_ACTION_TYPES = new Set<MauthDocumentAction["type"]>(MAUTH_DOCUMENT_ONLY_ACTION_TYPES);

function ok<Q extends MauthQuestionLike>(
  action: MauthAction | "batch",
  questions: Q[],
  changedIds: string[],
  warnings: MauthActionWarning[] = [],
  validation?: unknown,
  extras: Pick<MauthActionResult<Q>, "appliedActionTypes" | "results"> = {},
): MauthActionResult<Q> {
  return { ok: true, actionType: action === "batch" ? "batch" : action.type, questions, changedIds, warnings, validation, ...extras };
}

function fail<Q extends MauthQuestionLike>(
  action: MauthAction | "batch",
  questions: readonly Q[],
  message: string,
  targetId?: string,
  warnings: MauthActionWarning[] = [{ code: "action-not-applied", message, targetId }],
  extras: Pick<MauthActionResult<Q>, "appliedActionTypes" | "results"> = {},
): MauthActionResult<Q> {
  return {
    ok: false,
    actionType: action === "batch" ? "batch" : action.type,
    questions: [...questions],
    changedIds: [],
    warnings,
    error: message,
    ...extras,
  };
}

function documentOk<Q extends MauthQuestionLike, F extends object, C extends object>(
  action: MauthDocumentAction | "batch",
  document: MauthDocumentLike<Q, F, C>,
  changedIds: string[],
  warnings: MauthActionWarning[] = [],
  validation?: unknown,
  extras: Pick<MauthDocumentActionResult<Q, F, C>, "appliedActionTypes" | "results" | "preview"> = {},
): MauthDocumentActionResult<Q, F, C> {
  return {
    ok: true,
    actionType: action === "batch" ? "batch" : action.type,
    document,
    questions: document.questions,
    changedIds,
    warnings,
    validation,
    ...extras,
  };
}

function documentFail<Q extends MauthQuestionLike, F extends object, C extends object>(
  action: MauthDocumentAction | "batch",
  document: MauthDocumentLike<Q, F, C>,
  message: string,
  targetId?: string,
  warnings: MauthActionWarning[] = [{ code: "action-not-applied", message, targetId }],
  extras: Pick<MauthDocumentActionResult<Q, F, C>, "appliedActionTypes" | "results" | "preview"> = {},
): MauthDocumentActionResult<Q, F, C> {
  return {
    ok: false,
    actionType: action === "batch" ? "batch" : action.type,
    document,
    questions: document.questions,
    changedIds: [],
    warnings,
    error: message,
    ...extras,
  };
}

function normalizeQuestion<Q extends MauthQuestionLike>(question: Q, options: MauthActionOptions<Q>) {
  return options.normalizeQuestion ? options.normalizeQuestion(question) : question;
}

function normalizePart<Q extends MauthQuestionLike>(part: MauthPartLike, options: MauthActionOptions<Q>) {
  return options.normalizePart ? options.normalizePart(part) : part;
}

function normalizeFrontMatter<Q extends MauthQuestionLike, F extends object, C extends object>(
  frontMatter: F,
  options: MauthDocumentActionOptions<Q, F, C>,
) {
  return options.normalizeFrontMatter ? options.normalizeFrontMatter(frontMatter) : frontMatter;
}

function normalizeFormattingConfig<Q extends MauthQuestionLike, F extends object, C extends object>(
  formattingConfig: C,
  options: MauthDocumentActionOptions<Q, F, C>,
) {
  return options.normalizeFormattingConfig ? options.normalizeFormattingConfig(formattingConfig) : formattingConfig;
}

function isQuestionAction(action: MauthDocumentAction): action is MauthAction {
  return !DOCUMENT_ACTION_TYPES.has(action.type);
}

function orderItemKey(item: MauthOrderItem) {
  return `${item.kind}:${item.id}`;
}

function normalizedMarks(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function insertArrayItem<T>(items: readonly T[], item: T, targetIndex: number) {
  const insertIndex = Math.max(0, Math.min(targetIndex, items.length));
  return [...items.slice(0, insertIndex), item, ...items.slice(insertIndex)];
}

function reorderArrayItem<T>(
  items: readonly T[],
  isMoved: (item: T) => boolean,
  isTarget: (item: T) => boolean,
  placement: "before" | "after",
) {
  const movedIndex = items.findIndex(isMoved);
  if (movedIndex === -1) return null;
  const movedItem = items[movedIndex];
  const withoutMoved = items.filter((_, index) => index !== movedIndex);
  const targetIndex = withoutMoved.findIndex(isTarget);
  if (targetIndex === -1) return null;
  return insertArrayItem(withoutMoved, movedItem, placement === "after" ? targetIndex + 1 : targetIndex);
}

function contentWithInsertedBlocks(container: ScopedContentContainer, blocks: ContentBlock[], placement?: MauthBlockPlacement) {
  const insertIndex = placement
    ? container.contentBlocks.findIndex((block) => block.id === placement.blockId)
    : container.contentBlocks.length;
  if (placement && insertIndex === -1) return null;
  const contentInsertIndex =
    insertIndex === -1 || !placement ? container.contentBlocks.length : insertIndex + (placement.position === "after" ? 1 : 0);
  const contentBlocks = [
    ...container.contentBlocks.slice(0, contentInsertIndex),
    ...blocks,
    ...container.contentBlocks.slice(contentInsertIndex),
  ];

  if (!container.itemOrder) return { contentBlocks };

  const blockOrderItems = blocks.map((block) => ({ kind: "block" as const, id: block.id }));
  const orderIndex = placement ? container.itemOrder.findIndex((item) => orderItemKey(item) === `block:${placement.blockId}`) : -1;
  const orderInsertIndex =
    orderIndex === -1 || !placement ? container.itemOrder.length : orderIndex + (placement.position === "after" ? 1 : 0);
  return {
    contentBlocks,
    itemOrder: [...container.itemOrder.slice(0, orderInsertIndex), ...blockOrderItems, ...container.itemOrder.slice(orderInsertIndex)],
  };
}

function isOrderPlacement(
  placement: MauthModuleMovePlacement | MauthPartMovePlacement | MauthSubpartMovePlacement,
): placement is MauthOrderPlacement {
  return "item" in placement;
}

function placementPosition(placement?: MauthModuleMovePlacement | MauthPartMovePlacement | MauthSubpartMovePlacement) {
  return placement?.position;
}

function placementOrderKey(placement?: MauthModuleMovePlacement | MauthPartMovePlacement | MauthSubpartMovePlacement) {
  if (!placement) return undefined;
  if (isOrderPlacement(placement)) return orderItemKey(placement.item);
  if ("blockId" in placement) return `block:${placement.blockId}`;
  if ("partId" in placement) return `part:${placement.partId}`;
  return `subpart:${placement.subpartId}`;
}

function placementBlockId(placement?: MauthModuleMovePlacement) {
  if (!placement) return undefined;
  if (isOrderPlacement(placement)) return placement.item.kind === "block" ? placement.item.id : undefined;
  return placement.blockId;
}

function placementPartId(placement?: MauthPartMovePlacement) {
  if (!placement) return undefined;
  if (isOrderPlacement(placement)) return placement.item.kind === "part" ? placement.item.id : undefined;
  return placement.partId;
}

function placementSubpartId(placement?: MauthSubpartMovePlacement) {
  if (!placement) return undefined;
  if (isOrderPlacement(placement)) return placement.item.kind === "subpart" ? placement.item.id : undefined;
  return placement.subpartId;
}

function contentWithInsertedMovedBlocks(container: ScopedContentContainer, blocks: ContentBlock[], placement?: MauthModuleMovePlacement) {
  const targetBlockId = placementBlockId(placement);
  const blockInsertIndex = targetBlockId ? container.contentBlocks.findIndex((block) => block.id === targetBlockId) : -1;
  if (targetBlockId && blockInsertIndex === -1) return null;
  const contentInsertIndex =
    blockInsertIndex === -1 || !placement ? container.contentBlocks.length : blockInsertIndex + (placement.position === "after" ? 1 : 0);
  const contentBlocks = [
    ...container.contentBlocks.slice(0, contentInsertIndex),
    ...blocks,
    ...container.contentBlocks.slice(contentInsertIndex),
  ];

  if (!container.itemOrder) {
    return placement && isOrderPlacement(placement) && placement.item.kind !== "block" ? null : { contentBlocks };
  }

  const targetKey = placementOrderKey(placement);
  const targetIndex = targetKey ? container.itemOrder.findIndex((item) => orderItemKey(item) === targetKey) : -1;
  if (targetKey && targetIndex === -1) return null;
  const blockOrderItems = blocks.map((block) => ({ kind: "block" as const, id: block.id }));
  const orderInsertIndex =
    targetIndex === -1 || !placement ? container.itemOrder.length : targetIndex + (placementPosition(placement) === "after" ? 1 : 0);
  return {
    contentBlocks,
    itemOrder: [...container.itemOrder.slice(0, orderInsertIndex), ...blockOrderItems, ...container.itemOrder.slice(orderInsertIndex)],
  };
}

function scopeKey(scope: MauthContentScope) {
  if (scope.kind === "question") return `question:${scope.questionId}`;
  if (scope.kind === "part") return `part:${scope.questionId}:${scope.partId}`;
  return `subpart:${scope.questionId}:${scope.partId}:${scope.subpartId}`;
}

function findQuestion<Q extends MauthQuestionLike>(questions: readonly Q[], questionId: string) {
  return questions.find((question) => question.id === questionId);
}

function findPart<Q extends MauthQuestionLike>(questions: readonly Q[], questionId: string, partId: string) {
  return findQuestion(questions, questionId)?.parts?.find((part) => part.id === partId);
}

function findSubpart<Q extends MauthQuestionLike>(questions: readonly Q[], questionId: string, partId: string, subpartId: string) {
  return findPart(questions, questionId, partId)?.subparts?.find((subpart) => subpart.id === subpartId);
}

function contentContainerForScope<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  scope: MauthContentScope,
): ScopedContentContainer | undefined {
  if (scope.kind === "question") return findQuestion(questions, scope.questionId);
  if (scope.kind === "part") return findPart(questions, scope.questionId, scope.partId);
  return findSubpart(questions, scope.questionId, scope.partId, scope.subpartId);
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

function emptyPreviewCounts(): MauthActionPreviewCounts {
  return {
    actions: 0,
    added: 0,
    deleted: 0,
    moved: 0,
    reordered: 0,
    updated: 0,
    frontMatterFields: 0,
    formattingFields: 0,
    pageFormatFields: 0,
    warnings: 0,
  };
}

function createPreviewSummary(requestedActionCount: number): MauthActionPreviewSummary {
  return {
    dryRun: true,
    valid: true,
    requestedActionCount,
    attemptedActionCount: 0,
    actionCounts: {},
    counts: emptyPreviewCounts(),
    changedIds: [],
    addedIds: [],
    deletedIds: [],
    movedIds: [],
    reorderedIds: [],
    updatedIds: [],
    frontMatterFields: [],
    formattingFields: [],
    pageFormatFields: [],
  };
}

function addUnique(target: string[], values: readonly string[]) {
  for (const value of values) {
    if (!target.includes(value)) target.push(value);
  }
}

function valuesEqual(left: unknown, right: unknown) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function changedObjectFields(left: unknown, right: unknown) {
  const leftRecord = left && typeof left === "object" ? (left as Record<string, unknown>) : {};
  const rightRecord = right && typeof right === "object" ? (right as Record<string, unknown>) : {};
  const fields = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
  return [...fields].filter((field) => !valuesEqual(leftRecord[field], rightRecord[field])).sort();
}

function updatePreviewCounts(summary: MauthActionPreviewSummary) {
  summary.attemptedActionCount = Object.values(summary.actionCounts).reduce((sum, count) => sum + (count ?? 0), 0);
  summary.counts = {
    actions: summary.attemptedActionCount,
    added: summary.addedIds.length,
    deleted: summary.deletedIds.length,
    moved: summary.movedIds.length,
    reordered: summary.reorderedIds.length,
    updated: summary.updatedIds.length,
    frontMatterFields: summary.frontMatterFields.length,
    formattingFields: summary.formattingFields.length,
    pageFormatFields: summary.pageFormatFields.length,
    warnings: summary.counts.warnings,
  };
}

function notePreviewAttempt(summary: MauthActionPreviewSummary, action: MauthDocumentAction) {
  summary.actionCounts[action.type] = (summary.actionCounts[action.type] ?? 0) + 1;
  updatePreviewCounts(summary);
}

function summarizeSuccessfulPreviewAction<Q extends MauthQuestionLike, F extends object, C extends object>(
  summary: MauthActionPreviewSummary,
  previousDocument: MauthDocumentLike<Q, F, C>,
  result: MauthDocumentActionResult<Q, F, C>,
  action: MauthDocumentAction,
) {
  addUnique(summary.changedIds, result.changedIds);
  summary.counts.warnings += result.warnings.length;

  if (
    action.type === "question.add" ||
    action.type === "part.add" ||
    action.type === "subpart.add" ||
    action.type === "module.add" ||
    action.type === "solutionSlot.add"
  ) {
    addUnique(summary.addedIds, result.changedIds);
  } else if (
    action.type === "question.delete" ||
    action.type === "part.delete" ||
    action.type === "subpart.delete" ||
    action.type === "module.delete"
  ) {
    addUnique(summary.deletedIds, result.changedIds);
  } else if (action.type === "part.move" || action.type === "subpart.move" || action.type === "module.move") {
    addUnique(summary.movedIds, result.changedIds);
  } else if (
    action.type === "question.reorder" ||
    action.type === "part.reorder" ||
    action.type === "subpart.reorder" ||
    action.type === "module.reorder"
  ) {
    addUnique(summary.reorderedIds, result.changedIds);
  } else if (result.changedIds.length) {
    addUnique(summary.updatedIds, result.changedIds);
  }

  if (action.type === "frontMatter.update" || action.type === "frontMatter.replace" || action.type === "frontMatter.logo.set") {
    addUnique(summary.frontMatterFields, changedObjectFields(previousDocument.frontMatter, result.document.frontMatter));
  }

  if (action.type === "formatting.update" || action.type === "pageFormat.update") {
    addUnique(summary.formattingFields, changedObjectFields(previousDocument.formattingConfig, result.document.formattingConfig));
  }

  if (action.type === "pageFormat.update") {
    const previousPage =
      previousDocument.formattingConfig && "page" in previousDocument.formattingConfig
        ? (previousDocument.formattingConfig as { page?: unknown }).page
        : undefined;
    const nextPage =
      result.document.formattingConfig && "page" in result.document.formattingConfig
        ? (result.document.formattingConfig as { page?: unknown }).page
        : undefined;
    addUnique(summary.pageFormatFields, changedObjectFields(previousPage, nextPage));
  }

  if (result.validation !== undefined) summary.validation = result.validation;
  updatePreviewCounts(summary);
}

function contentWithDeletedBlock(container: ScopedContentContainer, blockId: string) {
  return {
    contentBlocks: container.contentBlocks.filter((block) => block.id !== blockId),
    ...(container.itemOrder ? { itemOrder: container.itemOrder.filter((item) => orderItemKey(item) !== `block:${blockId}`) } : {}),
  };
}

function contentWithReorderedBlock(
  container: ScopedContentContainer,
  blockId: string,
  targetBlockId: string,
  placement: "before" | "after",
) {
  const contentBlocks = reorderArrayItem(
    container.contentBlocks,
    (block) => block.id === blockId,
    (block) => block.id === targetBlockId,
    placement,
  );
  if (!contentBlocks) return null;

  if (!container.itemOrder) return { contentBlocks };

  const itemOrder =
    reorderArrayItem(
      container.itemOrder,
      (item) => orderItemKey(item) === `block:${blockId}`,
      (item) => orderItemKey(item) === `block:${targetBlockId}`,
      placement,
    ) ?? container.itemOrder;
  return { contentBlocks, itemOrder };
}

function orderWithInsertedItem(
  items: readonly MauthOrderItem[] | undefined,
  item: MauthOrderItem,
  targetKey?: string,
  position?: "before" | "after",
) {
  if (!items) return undefined;
  if (!targetKey || !position) return [...items, item];
  const targetIndex = items.findIndex((current) => orderItemKey(current) === targetKey);
  if (targetIndex === -1) return null;
  const insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
  return [...items.slice(0, insertIndex), item, ...items.slice(insertIndex)];
}

function orderWithDeletedItem(items: readonly MauthOrderItem[] | undefined, targetKey: string) {
  return items ? items.filter((item) => orderItemKey(item) !== targetKey) : undefined;
}

function orderWithReorderedItem(
  items: readonly MauthOrderItem[] | undefined,
  movedKey: string,
  targetKey: string,
  placement: "before" | "after",
) {
  if (!items) return undefined;
  return (
    reorderArrayItem(
      items,
      (item) => orderItemKey(item) === movedKey,
      (item) => orderItemKey(item) === targetKey,
      placement,
    ) ?? null
  );
}

function questionWithInsertedMovedPart<Q extends MauthQuestionLike>(
  question: Q,
  part: MauthPartLike,
  placement: MauthPartMovePlacement | undefined,
  options: MauthActionOptions<Q>,
) {
  const parts = question.parts ?? [];
  const targetPartId = placementPartId(placement);
  const partIndex = targetPartId ? parts.findIndex((current) => current.id === targetPartId) : -1;
  if (targetPartId && partIndex === -1) return null;
  const partInsertIndex = partIndex === -1 || !placement ? parts.length : partIndex + (placement.position === "after" ? 1 : 0);
  const nextParts = insertArrayItem(parts, normalizePart(part, options), partInsertIndex);

  const targetKey = placementOrderKey(placement);
  const itemOrder = orderWithInsertedItem(question.itemOrder, { kind: "part", id: part.id }, targetKey, placementPosition(placement));
  if (itemOrder === null) return null;
  if (!itemOrder && placement && isOrderPlacement(placement) && placement.item.kind !== "part") return null;
  return normalizeQuestion({ ...question, parts: nextParts, ...(itemOrder ? { itemOrder } : {}) } as Q, options);
}

function partWithInsertedMovedSubpart<Q extends MauthQuestionLike>(
  part: MauthPartLike,
  subpart: MauthSubpartLike,
  placement: MauthSubpartMovePlacement | undefined,
  options: MauthActionOptions<Q>,
) {
  const subparts = part.subparts ?? [];
  const targetSubpartId = placementSubpartId(placement);
  const subpartIndex = targetSubpartId ? subparts.findIndex((current) => current.id === targetSubpartId) : -1;
  if (targetSubpartId && subpartIndex === -1) return null;
  const subpartInsertIndex = subpartIndex === -1 || !placement ? subparts.length : subpartIndex + (placement.position === "after" ? 1 : 0);
  const nextSubparts = insertArrayItem(subparts, subpart, subpartInsertIndex);

  const targetKey = placementOrderKey(placement);
  const itemOrder = orderWithInsertedItem(part.itemOrder, { kind: "subpart", id: subpart.id }, targetKey, placementPosition(placement));
  if (itemOrder === null) return null;
  if (!itemOrder && placement && isOrderPlacement(placement) && placement.item.kind !== "subpart") return null;
  return normalizePart({ ...part, subparts: nextSubparts, ...(itemOrder ? { itemOrder } : {}) }, options);
}

function insertMovedPart<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  questionId: string,
  part: MauthPartLike,
  placement: MauthPartMovePlacement | undefined,
  options: MauthActionOptions<Q>,
): ScopedPatchResult<Q> & { placementFound: boolean } {
  let found = false;
  let placementFound = true;
  const nextQuestions = questions.map((question) => {
    if (question.id !== questionId) return question;
    found = true;
    const nextQuestion = questionWithInsertedMovedPart(question, part, placement, options);
    if (!nextQuestion) {
      placementFound = false;
      return question;
    }
    return nextQuestion;
  });
  return { found, placementFound, questions: nextQuestions };
}

function insertMovedSubpart<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  questionId: string,
  partId: string,
  subpart: MauthSubpartLike,
  placement: MauthSubpartMovePlacement | undefined,
  options: MauthActionOptions<Q>,
): ScopedPatchResult<Q> & { partFound: boolean; placementFound: boolean } {
  let found = false;
  let partFound = false;
  let placementFound = true;
  const nextQuestions = questions.map((question) => {
    if (question.id !== questionId) return question;
    found = true;
    const parts = (question.parts ?? []).map((part) => {
      if (part.id !== partId) return part;
      partFound = true;
      const nextPart = partWithInsertedMovedSubpart(part, subpart, placement, options);
      if (!nextPart) {
        placementFound = false;
        return part;
      }
      return nextPart;
    });
    return normalizeQuestion({ ...question, parts } as Q, options);
  });
  return { found, partFound, placementFound, questions: nextQuestions };
}

function patchScopedContainer<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  scope: MauthContentScope,
  options: MauthActionOptions<Q>,
  patcher: (container: ScopedContentContainer) => Partial<ScopedContentContainer>,
): ScopedPatchResult<Q> {
  let found = false;

  const nextQuestions = questions.map((question) => {
    if (question.id !== scope.questionId) return question;

    if (scope.kind === "question") {
      found = true;
      return normalizeQuestion({ ...question, ...patcher(question) } as Q, options);
    }

    const parts = question.parts ?? [];
    const nextParts = parts.map((part) => {
      if (part.id !== scope.partId) return part;

      if (scope.kind === "part") {
        found = true;
        return normalizePart({ ...part, ...patcher(part) }, options);
      }

      const subparts = part.subparts ?? [];
      const nextSubparts = subparts.map((subpart) => {
        if (subpart.id !== scope.subpartId) return subpart;
        found = true;
        return { ...subpart, ...patcher(subpart) };
      });
      return normalizePart({ ...part, subparts: nextSubparts }, options);
    });

    return normalizeQuestion({ ...question, parts: nextParts } as Q, options);
  });

  return { found, questions: nextQuestions };
}

function updateBlockInScope<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  scope: MauthContentScope,
  blockId: string,
  options: MauthActionOptions<Q>,
  patcher: (block: ContentBlock) => ContentBlock,
): BlockPatchResult<Q> {
  let blockFound = false;
  const result = patchScopedContainer(questions, scope, options, (container) => ({
    contentBlocks: container.contentBlocks.map((block) => {
      if (block.id !== blockId) return block;
      blockFound = true;
      return patcher(block);
    }),
  }));
  return { ...result, blockFound };
}

function patchTargetMarks<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  target: MauthMarkTarget,
  marks: number,
  options: MauthActionOptions<Q>,
) {
  const patch = { marks: normalizedMarks(marks) };
  if (target.kind === "question") {
    return patchQuestion(questions, target.questionId, patch, options);
  }
  if (target.kind === "part") {
    return patchPart(questions, target.questionId, target.partId, patch, options);
  }
  return patchSubpart(questions, target.questionId, target.partId, target.subpartId, patch, options);
}

function patchQuestion<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  questionId: string,
  patch: Record<string, unknown>,
  options: MauthActionOptions<Q>,
): ScopedPatchResult<Q> {
  let found = false;
  const nextQuestions = questions.map((question) => {
    if (question.id !== questionId) return question;
    found = true;
    return normalizeQuestion({ ...question, ...patch } as Q, options);
  });
  return { found, questions: nextQuestions };
}

function patchPart<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  questionId: string,
  partId: string,
  patch: Record<string, unknown>,
  options: MauthActionOptions<Q>,
): ScopedPatchResult<Q> {
  let found = false;
  const nextQuestions = questions.map((question) => {
    if (question.id !== questionId) return question;
    const parts = (question.parts ?? []).map((part) => {
      if (part.id !== partId) return part;
      found = true;
      return normalizePart({ ...part, ...patch }, options);
    });
    return normalizeQuestion({ ...question, parts } as Q, options);
  });
  return { found, questions: nextQuestions };
}

function patchSubpart<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  questionId: string,
  partId: string,
  subpartId: string,
  patch: Record<string, unknown>,
  options: MauthActionOptions<Q>,
): ScopedPatchResult<Q> {
  let found = false;
  const nextQuestions = questions.map((question) => {
    if (question.id !== questionId) return question;
    const parts = (question.parts ?? []).map((part) => {
      if (part.id !== partId) return part;
      const subparts = (part.subparts ?? []).map((subpart) => {
        if (subpart.id !== subpartId) return subpart;
        found = true;
        return { ...subpart, ...patch };
      });
      return normalizePart({ ...part, subparts }, options);
    });
    return normalizeQuestion({ ...question, parts } as Q, options);
  });
  return { found, questions: nextQuestions };
}

export function applyMauthAction<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  action: MauthAction,
  options: MauthActionOptions<Q> = {},
): MauthActionResult<Q> {
  if (action.type === "validation.solution.run") {
    if (!options.validateSolutions) return fail(action, questions, "No solution validator is configured.");
    return ok(action, [...questions], [], [], options.validateSolutions([...questions]));
  }

  if (action.type === "question.add") {
    if (action.afterQuestionId && !questions.some((question) => question.id === action.afterQuestionId)) {
      return fail(action, questions, "Question insertion target was not found.", action.afterQuestionId);
    }
    const insertIndex = action.afterQuestionId
      ? questions.findIndex((question) => question.id === action.afterQuestionId) + 1
      : questions.length;
    const targetIndex = insertIndex <= 0 ? questions.length : insertIndex;
    const nextQuestions = insertArrayItem(questions, normalizeQuestion(action.question as Q, options), targetIndex);
    return ok(action, nextQuestions, [action.question.id]);
  }

  if (action.type === "question.update") {
    const result = patchQuestion(questions, action.questionId, action.patch, options);
    if (!result.found) return fail(action, questions, "Question was not found.", action.questionId);
    return ok(action, result.questions, [action.questionId]);
  }

  if (action.type === "question.delete") {
    if (!questions.some((question) => question.id === action.questionId)) {
      return fail(action, questions, "Question was not found.", action.questionId);
    }
    const remaining = questions.filter((question) => question.id !== action.questionId);
    const fallback = action.fallbackQuestion ? [normalizeQuestion(action.fallbackQuestion as Q, options)] : [];
    const nextQuestions = remaining.length ? [...remaining] : fallback;
    return ok(action, nextQuestions, [action.questionId, ...fallback.map((question) => question.id)]);
  }

  if (action.type === "question.reorder") {
    const nextQuestions = reorderArrayItem(
      questions,
      (question) => question.id === action.questionId,
      (question) => question.id === action.targetQuestionId,
      action.placement,
    );
    if (!nextQuestions) return fail(action, questions, "Question reorder target was not found.", action.questionId);
    return ok(action, nextQuestions, [action.questionId]);
  }

  if (action.type === "part.add") {
    let found = false;
    let placementFound = true;
    const nextQuestions = questions.map((question) => {
      if (question.id !== action.questionId) return question;
      found = true;
      const parts = question.parts ?? [];
      const insertIndex = action.placement ? parts.findIndex((part) => part.id === action.placement?.partId) : parts.length;
      if (action.placement && insertIndex === -1) {
        placementFound = false;
        return question;
      }
      const targetIndex = action.placement?.position === "after" ? insertIndex + 1 : insertIndex;
      const nextParts = insertArrayItem(parts, normalizePart(action.part, options), targetIndex);
      const itemOrder = orderWithInsertedItem(
        question.itemOrder,
        { kind: "part", id: action.part.id },
        action.placement ? `part:${action.placement.partId}` : undefined,
        action.placement?.position,
      );
      if (itemOrder === null) {
        placementFound = false;
        return question;
      }
      return normalizeQuestion({ ...question, parts: nextParts, ...(itemOrder ? { itemOrder } : {}) } as Q, options);
    });
    if (!found) return fail(action, questions, "Question was not found.", action.questionId);
    if (!placementFound) return fail(action, questions, "Part placement target was not found.", action.placement?.partId);
    return ok(action, nextQuestions, [action.part.id]);
  }

  if (action.type === "part.update") {
    const result = patchPart(questions, action.questionId, action.partId, action.patch, options);
    if (!result.found) return fail(action, questions, "Part was not found.", action.partId);
    return ok(action, result.questions, [action.partId]);
  }

  if (action.type === "part.delete") {
    let found = false;
    let partFound = false;
    const nextQuestions = questions.map((question) => {
      if (question.id !== action.questionId) return question;
      found = true;
      partFound = (question.parts ?? []).some((part) => part.id === action.partId);
      if (!partFound) return question;
      const itemOrder = orderWithDeletedItem(question.itemOrder, `part:${action.partId}`);
      return normalizeQuestion(
        {
          ...question,
          parts: (question.parts ?? []).filter((part) => part.id !== action.partId),
          ...(itemOrder ? { itemOrder } : {}),
        } as Q,
        options,
      );
    });
    if (!found) return fail(action, questions, "Question was not found.", action.questionId);
    if (!partFound) return fail(action, questions, "Part was not found.", action.partId);
    return ok(action, nextQuestions, [action.partId]);
  }

  if (action.type === "part.reorder") {
    let found = false;
    let reorderFound = false;
    const nextQuestions = questions.map((question) => {
      if (question.id !== action.questionId) return question;
      found = true;
      const parts = reorderArrayItem(
        question.parts ?? [],
        (part) => part.id === action.partId,
        (part) => part.id === action.targetPartId,
        action.placement,
      );
      const itemOrder = orderWithReorderedItem(
        question.itemOrder,
        `part:${action.partId}`,
        `part:${action.targetPartId}`,
        action.placement,
      );
      reorderFound = Boolean(parts && itemOrder !== null);
      if (!parts || itemOrder === null) return question;
      return normalizeQuestion({ ...question, parts, ...(itemOrder ? { itemOrder } : {}) } as Q, options);
    });
    if (!found) return fail(action, questions, "Question was not found.", action.questionId);
    if (!reorderFound) return fail(action, questions, "Part reorder target was not found.", action.partId);
    return ok(action, nextQuestions, [action.partId]);
  }

  if (action.type === "part.move") {
    const movedPart = findPart(questions, action.fromQuestionId, action.partId);
    if (!findQuestion(questions, action.fromQuestionId))
      return fail(action, questions, "Source question was not found.", action.fromQuestionId);
    if (!movedPart) return fail(action, questions, "Part was not found.", action.partId);
    if (!findQuestion(questions, action.toQuestionId))
      return fail(action, questions, "Destination question was not found.", action.toQuestionId);
    if (placementPartId(action.placement) === action.partId) {
      return fail(action, questions, "Part cannot be moved relative to itself.", action.partId);
    }

    const removed = applyMauthAction(questions, { type: "part.delete", questionId: action.fromQuestionId, partId: action.partId }, options);
    if (!removed.ok) return fail(action, questions, removed.error ?? "Part move failed.", action.partId, removed.warnings);

    const inserted = insertMovedPart(removed.questions, action.toQuestionId, movedPart, action.placement, options);
    if (!inserted.found) return fail(action, questions, "Destination question was not found.", action.toQuestionId);
    if (!inserted.placementFound) {
      return fail(action, questions, "Part move placement target was not found.", placementOrderKey(action.placement));
    }
    return ok(action, inserted.questions, [action.partId]);
  }

  if (action.type === "subpart.add") {
    let found = false;
    let partFound = false;
    let placementFound = true;
    const nextQuestions = questions.map((question) => {
      if (question.id !== action.questionId) return question;
      found = true;
      const parts = (question.parts ?? []).map((part) => {
        if (part.id !== action.partId) return part;
        partFound = true;
        const subparts = part.subparts ?? [];
        const insertIndex = action.placement
          ? subparts.findIndex((subpart) => subpart.id === action.placement?.subpartId)
          : subparts.length;
        if (action.placement && insertIndex === -1) {
          placementFound = false;
          return part;
        }
        const targetIndex = action.placement?.position === "after" ? insertIndex + 1 : insertIndex;
        const nextSubparts = insertArrayItem(subparts, action.subpart, targetIndex);
        const itemOrder = orderWithInsertedItem(
          part.itemOrder,
          { kind: "subpart", id: action.subpart.id },
          action.placement ? `subpart:${action.placement.subpartId}` : undefined,
          action.placement?.position,
        );
        if (itemOrder === null) {
          placementFound = false;
          return part;
        }
        return normalizePart({ ...part, subparts: nextSubparts, ...(itemOrder ? { itemOrder } : {}) }, options);
      });
      return normalizeQuestion({ ...question, parts } as Q, options);
    });
    if (!found) return fail(action, questions, "Question was not found.", action.questionId);
    if (!partFound) return fail(action, questions, "Part was not found.", action.partId);
    if (!placementFound) return fail(action, questions, "Subpart placement target was not found.", action.placement?.subpartId);
    return ok(action, nextQuestions, [action.subpart.id]);
  }

  if (action.type === "subpart.update") {
    const result = patchSubpart(questions, action.questionId, action.partId, action.subpartId, action.patch, options);
    if (!result.found) return fail(action, questions, "Subpart was not found.", action.subpartId);
    return ok(action, result.questions, [action.subpartId]);
  }

  if (action.type === "subpart.delete") {
    let found = false;
    let partFound = false;
    let subpartFound = false;
    const nextQuestions = questions.map((question) => {
      if (question.id !== action.questionId) return question;
      found = true;
      const parts = (question.parts ?? []).map((part) => {
        if (part.id !== action.partId) return part;
        partFound = true;
        subpartFound = (part.subparts ?? []).some((subpart) => subpart.id === action.subpartId);
        if (!subpartFound) return part;
        const itemOrder = orderWithDeletedItem(part.itemOrder, `subpart:${action.subpartId}`);
        return normalizePart(
          {
            ...part,
            subparts: (part.subparts ?? []).filter((subpart) => subpart.id !== action.subpartId),
            ...(itemOrder ? { itemOrder } : {}),
          },
          options,
        );
      });
      return normalizeQuestion({ ...question, parts } as Q, options);
    });
    if (!found) return fail(action, questions, "Question was not found.", action.questionId);
    if (!partFound) return fail(action, questions, "Part was not found.", action.partId);
    if (!subpartFound) return fail(action, questions, "Subpart was not found.", action.subpartId);
    return ok(action, nextQuestions, [action.subpartId]);
  }

  if (action.type === "subpart.reorder") {
    let found = false;
    let partFound = false;
    let reorderFound = false;
    const nextQuestions = questions.map((question) => {
      if (question.id !== action.questionId) return question;
      found = true;
      const parts = (question.parts ?? []).map((part) => {
        if (part.id !== action.partId) return part;
        partFound = true;
        const subparts = reorderArrayItem(
          part.subparts ?? [],
          (subpart) => subpart.id === action.subpartId,
          (subpart) => subpart.id === action.targetSubpartId,
          action.placement,
        );
        const itemOrder = orderWithReorderedItem(
          part.itemOrder,
          `subpart:${action.subpartId}`,
          `subpart:${action.targetSubpartId}`,
          action.placement,
        );
        reorderFound = Boolean(subparts && itemOrder !== null);
        if (!subparts || itemOrder === null) return part;
        return normalizePart({ ...part, subparts, ...(itemOrder ? { itemOrder } : {}) }, options);
      });
      return normalizeQuestion({ ...question, parts } as Q, options);
    });
    if (!found) return fail(action, questions, "Question was not found.", action.questionId);
    if (!partFound) return fail(action, questions, "Part was not found.", action.partId);
    if (!reorderFound) return fail(action, questions, "Subpart reorder target was not found.", action.subpartId);
    return ok(action, nextQuestions, [action.subpartId]);
  }

  if (action.type === "subpart.move") {
    const sourceQuestion = findQuestion(questions, action.from.questionId);
    const sourcePart = findPart(questions, action.from.questionId, action.from.partId);
    const movedSubpart = findSubpart(questions, action.from.questionId, action.from.partId, action.subpartId);
    if (!sourceQuestion) return fail(action, questions, "Source question was not found.", action.from.questionId);
    if (!sourcePart) return fail(action, questions, "Source part was not found.", action.from.partId);
    if (!movedSubpart) return fail(action, questions, "Subpart was not found.", action.subpartId);
    if (!findQuestion(questions, action.to.questionId))
      return fail(action, questions, "Destination question was not found.", action.to.questionId);
    if (!findPart(questions, action.to.questionId, action.to.partId))
      return fail(action, questions, "Destination part was not found.", action.to.partId);
    if (placementSubpartId(action.placement) === action.subpartId) {
      return fail(action, questions, "Subpart cannot be moved relative to itself.", action.subpartId);
    }

    const removed = applyMauthAction(
      questions,
      { type: "subpart.delete", questionId: action.from.questionId, partId: action.from.partId, subpartId: action.subpartId },
      options,
    );
    if (!removed.ok) return fail(action, questions, removed.error ?? "Subpart move failed.", action.subpartId, removed.warnings);

    const inserted = insertMovedSubpart(removed.questions, action.to.questionId, action.to.partId, movedSubpart, action.placement, options);
    if (!inserted.found) return fail(action, questions, "Destination question was not found.", action.to.questionId);
    if (!inserted.partFound) return fail(action, questions, "Destination part was not found.", action.to.partId);
    if (!inserted.placementFound) {
      return fail(action, questions, "Subpart move placement target was not found.", placementOrderKey(action.placement));
    }
    return ok(action, inserted.questions, [action.subpartId]);
  }

  if (action.type === "module.add" || action.type === "solutionSlot.add") {
    let placementFound = true;
    const result = patchScopedContainer(
      questions,
      action.scope,
      options,
      (container) =>
        contentWithInsertedBlocks(container, action.blocks, action.placement) ??
        (() => {
          placementFound = false;
          return {};
        })(),
    );
    if (!result.found) return fail(action, questions, "Module scope was not found.");
    if (!placementFound) return fail(action, questions, "Module placement target was not found.", action.placement?.blockId);
    return ok(
      action,
      result.questions,
      action.blocks.map((block) => block.id),
    );
  }

  if (action.type === "module.update") {
    const result = updateBlockInScope(
      questions,
      action.scope,
      action.blockId,
      options,
      (block) => ({ ...block, ...action.patch }) as ContentBlock,
    );
    if (!result.found) return fail(action, questions, "Module scope was not found.", action.blockId);
    if (!result.blockFound) return fail(action, questions, "Module was not found.", action.blockId);
    return ok(action, result.questions, [action.blockId]);
  }

  if (action.type === "module.delete") {
    let blockFound = false;
    const result = patchScopedContainer(questions, action.scope, options, (container) => {
      blockFound = container.contentBlocks.some((block) => block.id === action.blockId);
      return contentWithDeletedBlock(container, action.blockId);
    });
    if (!result.found) return fail(action, questions, "Module scope was not found.", action.blockId);
    if (!blockFound) return fail(action, questions, "Module was not found.", action.blockId);
    return ok(action, result.questions, [action.blockId]);
  }

  if (action.type === "module.reorder") {
    let blockFound = false;
    let targetFound = false;
    const result = patchScopedContainer(questions, action.scope, options, (container) => {
      blockFound = container.contentBlocks.some((block) => block.id === action.blockId);
      targetFound = container.contentBlocks.some((block) => block.id === action.targetBlockId);
      return contentWithReorderedBlock(container, action.blockId, action.targetBlockId, action.placement) ?? {};
    });
    if (!result.found) return fail(action, questions, "Module scope was not found.", action.blockId);
    if (!blockFound || !targetFound) return fail(action, questions, "Module reorder target was not found.", action.blockId);
    return ok(action, result.questions, [action.blockId]);
  }

  if (action.type === "module.move") {
    const sourceContainer = contentContainerForScope(questions, action.fromScope);
    const movedBlock = sourceContainer?.contentBlocks.find((block) => block.id === action.blockId);
    if (!sourceContainer) return fail(action, questions, "Source module scope was not found.", action.blockId);
    if (!movedBlock) {
      return fail(action, questions, "Module was not found.", action.blockId);
    }
    if (scopeKey(action.fromScope) === scopeKey(action.toScope) && placementBlockId(action.placement) === action.blockId) {
      return fail(action, questions, "Module cannot be moved relative to itself.", action.blockId);
    }

    const destinationContainer = contentContainerForScope(questions, action.toScope);
    if (!destinationContainer) return fail(action, questions, "Destination module scope was not found.", action.blockId);
    if (contentWithInsertedMovedBlocks(destinationContainer, [movedBlock], action.placement) === null) {
      return fail(action, questions, "Module move placement target was not found.", placementOrderKey(action.placement));
    }

    const removed = applyMauthAction(questions, { type: "module.delete", scope: action.fromScope, blockId: action.blockId }, options);
    if (!removed.ok) return fail(action, questions, removed.error ?? "Module move failed.", action.blockId, removed.warnings);

    let insertedPlacementFound = true;
    const inserted = patchScopedContainer(
      removed.questions,
      action.toScope,
      options,
      (container) =>
        contentWithInsertedMovedBlocks(container, [movedBlock], action.placement) ??
        (() => {
          insertedPlacementFound = false;
          return {};
        })(),
    );
    if (!inserted.found) return fail(action, questions, "Destination module scope was not found.", action.blockId);
    if (!insertedPlacementFound)
      return fail(action, questions, "Module move placement target was not found.", placementOrderKey(action.placement));
    return ok(action, inserted.questions, [action.blockId]);
  }

  if (action.type === "marks.update") {
    const result = patchTargetMarks(questions, action.target, action.marks, options);
    if (!result.found) return fail(action, questions, "Marks target was not found.");
    return ok(action, result.questions, [
      action.target.kind === "question"
        ? action.target.questionId
        : action.target.kind === "part"
          ? action.target.partId
          : action.target.subpartId,
    ]);
  }

  if (action.type === "diagram.update") {
    let wrongKind = false;
    const result = updateBlockInScope(questions, action.scope, action.blockId, options, (block) => {
      if (block.kind !== "diagram") {
        wrongKind = true;
        return block;
      }
      return { ...block, graphConfig: action.graphConfig };
    });
    if (!result.found) return fail(action, questions, "Diagram scope was not found.", action.blockId);
    if (!result.blockFound) return fail(action, questions, "Diagram module was not found.", action.blockId);
    if (wrongKind) return fail(action, questions, "Target module is not a diagram.", action.blockId);
    return ok(action, result.questions, [action.blockId]);
  }

  if (action.type === "pageBreak.set") {
    if (action.target.kind === "question") {
      const result = patchQuestion(
        questions,
        action.target.questionId,
        {
          pageBreakAfter: action.enabled,
          contentBlocks:
            questions
              .find((question) => question.id === action.target.questionId)
              ?.contentBlocks.filter((block) => block.kind !== "pageBreak") ?? [],
        },
        options,
      );
      if (!result.found) return fail(action, questions, "Question was not found.", action.target.questionId);
      return ok(action, result.questions, [action.target.questionId]);
    }

    const result =
      action.target.kind === "part"
        ? patchPart(questions, action.target.questionId, action.target.partId, { pageBreakBefore: action.enabled }, options)
        : patchSubpart(
            questions,
            action.target.questionId,
            action.target.partId,
            action.target.subpartId,
            { pageBreakBefore: action.enabled },
            options,
          );
    if (!result.found) return fail(action, questions, "Page-break target was not found.");
    return ok(action, result.questions, [action.target.kind === "part" ? action.target.partId : action.target.subpartId]);
  }

  return fail(action, questions, "Unknown Mauth action.");
}

export function applyMauthActions<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  actions: readonly MauthAction[],
  options: MauthActionOptions<Q> = {},
): MauthActionResult<Q> {
  let nextQuestions = [...questions];
  const results: MauthActionResult<Q>[] = [];
  const changedIds: string[] = [];
  const warnings: MauthActionWarning[] = [];
  const appliedActionTypes: MauthAction["type"][] = [];
  let validation: unknown;

  for (const action of actions) {
    const result = applyMauthAction(nextQuestions, action, options);
    results.push(result);
    appliedActionTypes.push(action.type);

    if (!result.ok) {
      return fail("batch", questions, result.error ?? "Action batch failed.", result.changedIds[0], [...warnings, ...result.warnings], {
        appliedActionTypes,
        results,
      });
    }

    nextQuestions = result.questions;
    changedIds.push(...result.changedIds);
    warnings.push(...result.warnings);
    if (result.validation !== undefined) validation = result.validation;
  }

  return ok("batch", nextQuestions, uniqueIds(changedIds), warnings, validation, { appliedActionTypes, results });
}

export function applyMauthDocumentAction<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  document: MauthDocumentLike<Q, F, C>,
  action: MauthDocumentAction,
  options: MauthDocumentActionOptions<Q, F, C> = {},
): MauthDocumentActionResult<Q, F, C> {
  if (isQuestionAction(action)) {
    const result = applyMauthAction<Q>(document.questions, action, options);
    if (!result.ok) {
      return documentFail(action, document, result.error ?? "Action was not applied.", result.changedIds[0], result.warnings);
    }
    return documentOk(action, { ...document, questions: result.questions }, result.changedIds, result.warnings, result.validation);
  }

  if (action.type === "frontMatter.update") {
    const frontMatter = normalizeFrontMatter({ ...document.frontMatter, ...action.patch } as F, options);
    return documentOk(action, { ...document, frontMatter }, ["frontMatter"]);
  }

  if (action.type === "frontMatter.replace") {
    const frontMatter = normalizeFrontMatter(action.frontMatter as F, options);
    return documentOk(action, { ...document, frontMatter }, ["frontMatter"]);
  }

  if (action.type === "frontMatter.logo.set") {
    const frontMatter = normalizeFrontMatter(
      {
        ...document.frontMatter,
        logoId: action.logoId,
        ...(typeof action.schoolName === "string" ? { schoolName: action.schoolName } : {}),
      } as F,
      options,
    );
    return documentOk(action, { ...document, frontMatter }, ["frontMatter", action.logoId]);
  }

  if (action.type === "formatting.update") {
    const formattingConfig = normalizeFormattingConfig({ ...(document.formattingConfig ?? ({} as C)), ...action.patch } as C, options);
    return documentOk(action, { ...document, formattingConfig }, ["formattingConfig"]);
  }

  if (action.type === "pageFormat.update") {
    const currentFormatting = (document.formattingConfig ?? {}) as C & { page?: Record<string, unknown> };
    const formattingConfig = normalizeFormattingConfig(
      {
        ...currentFormatting,
        page: {
          ...(currentFormatting.page ?? {}),
          ...action.patch,
        },
      } as C,
      options,
    );
    return documentOk(action, { ...document, formattingConfig }, ["formattingConfig", "pageFormat"]);
  }

  if (action.type === "document.validation.run") {
    if (!options.validateDocument) return documentFail(action, document, "No document validator is configured.");
    return documentOk(action, document, [], [], options.validateDocument(document));
  }

  return documentFail(action, document, "Unknown Mauth document action.");
}

export function applyMauthDocumentActions<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  document: MauthDocumentLike<Q, F, C>,
  actions: readonly MauthDocumentAction[],
  options: MauthDocumentActionOptions<Q, F, C> = {},
): MauthDocumentActionResult<Q, F, C> {
  let nextDocument = document;
  const results: MauthDocumentActionResult<Q, F, C>[] = [];
  const changedIds: string[] = [];
  const warnings: MauthActionWarning[] = [];
  const appliedActionTypes: MauthDocumentAction["type"][] = [];
  const preview = options.dryRun ? createPreviewSummary(actions.length) : undefined;
  let validation: unknown;

  for (const action of actions) {
    if (preview) notePreviewAttempt(preview, action);
    const previousDocument = nextDocument;
    const result = applyMauthDocumentAction(nextDocument, action, options);
    results.push(result);
    appliedActionTypes.push(action.type);

    if (!result.ok) {
      if (preview) {
        preview.valid = false;
        preview.error = result.error ?? "Document action batch failed.";
        preview.counts.warnings += result.warnings.length;
        updatePreviewCounts(preview);
      }
      return documentFail(
        "batch",
        document,
        result.error ?? "Document action batch failed.",
        result.changedIds[0],
        [...warnings, ...result.warnings],
        {
          appliedActionTypes,
          results,
          ...(preview ? { preview } : {}),
        },
      );
    }

    if (preview) summarizeSuccessfulPreviewAction(preview, previousDocument, result, action);
    nextDocument = result.document;
    changedIds.push(...result.changedIds);
    warnings.push(...result.warnings);
    if (result.validation !== undefined) validation = result.validation;
  }

  if (preview && validation === undefined && options.validateDocument) {
    validation = options.validateDocument(nextDocument);
    preview.validation = validation;
  }
  if (preview) updatePreviewCounts(preview);

  return documentOk("batch", nextDocument, uniqueIds(changedIds), warnings, validation, {
    appliedActionTypes,
    results,
    ...(preview ? { preview } : {}),
  });
}

export function previewMauthDocumentActions<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  document: MauthDocumentLike<Q, F, C>,
  actions: readonly MauthDocumentAction[],
  options: Omit<MauthDocumentActionOptions<Q, F, C>, "dryRun"> = {},
): MauthDocumentActionResult<Q, F, C> {
  return applyMauthDocumentActions(document, actions, { ...options, dryRun: true });
}
