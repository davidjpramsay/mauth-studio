import type { ContentBlock, QuestionPart, QuestionSubpart } from "@mauth-studio/shared";

import { recoverMissingSolutionSurfaceTicks } from "./solutionBlockVisibility.ts";

export type EditorContentBlock = ContentBlock;
export type EditorSubpart = Omit<QuestionSubpart, "contentBlocks"> & { contentBlocks: EditorContentBlock[] };
export type ContainerItemKind = "block" | "part" | "subpart";
export interface ContainerOrderItem {
  kind: ContainerItemKind;
  id: string;
}
export type EditorPart = Omit<QuestionPart, "contentBlocks" | "subparts"> & {
  contentBlocks: EditorContentBlock[];
  subparts: EditorSubpart[];
  itemOrder: ContainerOrderItem[];
};
export type OrderedQuestionItem = { kind: "block"; id: string; block: EditorContentBlock } | { kind: "part"; id: string; part: EditorPart };
export type OrderedPartItem =
  | { kind: "block"; id: string; block: EditorContentBlock }
  | { kind: "subpart"; id: string; subpart: EditorSubpart };

export interface QuestionBlock {
  id: string;
  section: string;
  text?: string;
  marks: number;
  contentBlocks: EditorContentBlock[];
  parts: EditorPart[];
  itemOrder: ContainerOrderItem[];
  pageBreakAfter?: boolean;
}

export interface DocumentSectionHeading {
  id: string;
  title: string;
}

export type DocumentFlowItem = { kind: "sectionHeading"; id: string } | { kind: "question"; id: string };

export interface EditorDocumentNormalizerOptions {
  id: (prefix: string) => string;
  normalizeContentBlocks: (value: unknown) => EditorContentBlock[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function safeMarkValue(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, numberValue) : 0;
}

export function alphaLabel(index: number) {
  let remaining = index;
  let result = "";
  do {
    result = String.fromCharCode(97 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return result;
}

export function romanLabel(index: number) {
  const values = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ] as const;
  let remaining = index + 1;
  let result = "";
  values.forEach(([value, numeral]) => {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  });
  return result;
}

export function orderItemKey(item?: ContainerOrderItem | null) {
  return item ? `${item.kind}:${item.id}` : "";
}

export function normalizeItemOrder(value: unknown, allowedItems: ContainerOrderItem[]) {
  const allowedKeys = new Set(allowedItems.map(orderItemKey));
  const seen = new Set<string>();
  const normalized: ContainerOrderItem[] = [];

  if (Array.isArray(value)) {
    value.forEach((item) => {
      const record = asRecord(item);
      if (!record || typeof record.id !== "string") return;
      if (record.kind !== "block" && record.kind !== "part" && record.kind !== "subpart") return;
      const orderItem = { kind: record.kind, id: record.id } satisfies ContainerOrderItem;
      const key = orderItemKey(orderItem);
      if (!allowedKeys.has(key) || seen.has(key)) return;
      normalized.push(orderItem);
      seen.add(key);
    });
  }

  allowedItems.forEach((item) => {
    const key = orderItemKey(item);
    if (!seen.has(key)) normalized.push(item);
  });

  return normalized;
}

export function questionAllowedOrderItems(contentBlocks: EditorContentBlock[], parts: EditorPart[]) {
  return [
    ...contentBlocks.filter((block) => block.kind !== "pageBreak").map((block) => ({ kind: "block" as const, id: block.id })),
    ...parts.map((part) => ({ kind: "part" as const, id: part.id })),
  ];
}

export function partAllowedOrderItems(contentBlocks: EditorContentBlock[], subparts: EditorSubpart[]) {
  return [
    ...contentBlocks.filter((block) => block.kind !== "pageBreak").map((block) => ({ kind: "block" as const, id: block.id })),
    ...subparts.map((subpart) => ({ kind: "subpart" as const, id: subpart.id })),
  ];
}

export function orderedQuestionItems(question: QuestionBlock): OrderedQuestionItem[] {
  const blockMap = new Map(question.contentBlocks.map((block) => [block.id, block]));
  const partMap = new Map(question.parts.map((part) => [part.id, part]));
  const orderedItems: OrderedQuestionItem[] = [];
  normalizeItemOrder(question.itemOrder, questionAllowedOrderItems(question.contentBlocks, question.parts)).forEach((item) => {
    if (item.kind === "block") {
      const block = blockMap.get(item.id);
      if (block && block.kind !== "pageBreak") orderedItems.push({ kind: "block", id: item.id, block });
      return;
    }
    if (item.kind === "part") {
      const part = partMap.get(item.id);
      if (part) orderedItems.push({ kind: "part", id: item.id, part });
    }
  });
  return orderedItems;
}

export function orderedPartItems(part: EditorPart): OrderedPartItem[] {
  const blockMap = new Map(part.contentBlocks.map((block) => [block.id, block]));
  const subpartMap = new Map(part.subparts.map((subpart) => [subpart.id, subpart]));
  const orderedItems: OrderedPartItem[] = [];
  normalizeItemOrder(part.itemOrder, partAllowedOrderItems(part.contentBlocks, part.subparts)).forEach((item) => {
    if (item.kind === "block") {
      const block = blockMap.get(item.id);
      if (block && block.kind !== "pageBreak") orderedItems.push({ kind: "block", id: item.id, block });
      return;
    }
    if (item.kind === "subpart") {
      const subpart = subpartMap.get(item.id);
      if (subpart) orderedItems.push({ kind: "subpart", id: item.id, subpart });
    }
  });
  return orderedItems;
}

function sortedPartsFromItemOrder(parts: EditorPart[], itemOrder: ContainerOrderItem[]) {
  const position = new Map(itemOrder.filter((item) => item.kind === "part").map((item, index) => [item.id, index]));
  return [...parts].sort(
    (left, right) => (position.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

function sortedSubpartsFromItemOrder(subparts: EditorSubpart[], itemOrder: ContainerOrderItem[]) {
  const position = new Map(itemOrder.filter((item) => item.kind === "subpart").map((item, index) => [item.id, index]));
  return [...subparts].sort(
    (left, right) => (position.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function relabelSubparts(subparts: EditorSubpart[]) {
  return subparts.map((subpart, index) => ({ ...subpart, label: romanLabel(index) }));
}

export function relabelParts(parts: EditorPart[]) {
  return parts.map((part, index) => withNormalizedPartOrder({ ...part, label: alphaLabel(index) }));
}

export function withNormalizedPartOrder(part: EditorPart) {
  const normalizedOrder = normalizeItemOrder(part.itemOrder, partAllowedOrderItems(part.contentBlocks, part.subparts ?? []));
  const subparts = relabelSubparts(sortedSubpartsFromItemOrder(part.subparts ?? [], normalizedOrder));
  return {
    ...part,
    subparts,
    itemOrder: normalizeItemOrder(normalizedOrder, partAllowedOrderItems(part.contentBlocks, subparts)),
  };
}

export function withNormalizedQuestionOrder(question: QuestionBlock) {
  const normalizedOrder = normalizeItemOrder(question.itemOrder, questionAllowedOrderItems(question.contentBlocks, question.parts ?? []));
  const parts = relabelParts(sortedPartsFromItemOrder(question.parts ?? [], normalizedOrder));
  return {
    ...question,
    parts,
    itemOrder: normalizeItemOrder(normalizedOrder, questionAllowedOrderItems(question.contentBlocks, parts)),
  };
}

export function flowItemKey(item: DocumentFlowItem) {
  return `${item.kind}:${item.id}`;
}

export function defaultDocumentFlow(questions: QuestionBlock[]): DocumentFlowItem[] {
  return questions.map((question) => ({ kind: "question", id: question.id }));
}

export function createEditorDocumentNormalizer({ id, normalizeContentBlocks }: EditorDocumentNormalizerOptions) {
  function normalizeEditorSubparts(value: unknown): EditorSubpart[] {
    if (!Array.isArray(value)) return [];

    return relabelSubparts(
      value.flatMap((subpart): EditorSubpart[] => {
        const record = asRecord(subpart);
        if (!record) return [];
        const marks = safeMarkValue(record.marks);
        return [
          {
            id: typeof record.id === "string" ? record.id : id("subpart"),
            label: typeof record.label === "string" ? record.label : "",
            text: typeof record.text === "string" ? record.text : "",
            marks,
            pageBreakBefore: record.pageBreakBefore === true,
            contentBlocks: recoverMissingSolutionSurfaceTicks(normalizeContentBlocks(record.contentBlocks), marks),
          },
        ];
      }),
    );
  }

  function normalizeEditorParts(value: unknown): EditorPart[] {
    if (!Array.isArray(value)) return [];

    return relabelParts(
      value.flatMap((part): EditorPart[] => {
        const record = asRecord(part);
        if (!record) return [];
        const marks = safeMarkValue(record.marks);
        const contentBlocks = recoverMissingSolutionSurfaceTicks(normalizeContentBlocks(record.contentBlocks), marks);
        const subparts = normalizeEditorSubparts(record.subparts);
        return [
          withNormalizedPartOrder({
            id: typeof record.id === "string" ? record.id : id("part"),
            label: "",
            text: typeof record.text === "string" ? record.text : "",
            marks,
            pageBreakBefore: record.pageBreakBefore === true,
            contentBlocks,
            subparts,
            itemOrder: normalizeItemOrder(record.itemOrder, partAllowedOrderItems(contentBlocks, subparts)),
          }),
        ];
      }),
    );
  }

  function normalizeQuestionBlocks(value: unknown): QuestionBlock[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((question): QuestionBlock[] => {
      const record = asRecord(question);
      if (!record) return [];
      const marks = safeMarkValue(record.marks);
      const contentBlocks = recoverMissingSolutionSurfaceTicks(normalizeContentBlocks(record.contentBlocks), marks);
      const filteredContentBlocks = contentBlocks.filter((block) => block.kind !== "pageBreak");
      const parts = normalizeEditorParts(record.parts);
      const hasLegacyPageBreak = contentBlocks.some((block) => block.kind === "pageBreak");
      return [
        withNormalizedQuestionOrder({
          id: typeof record.id === "string" ? record.id : id("question"),
          section: typeof record.section === "string" ? record.section : "Algebra",
          text: typeof record.text === "string" ? record.text : "",
          marks,
          contentBlocks: filteredContentBlocks,
          parts,
          itemOrder: normalizeItemOrder(record.itemOrder, questionAllowedOrderItems(filteredContentBlocks, parts)),
          pageBreakAfter: record.pageBreakAfter === true || hasLegacyPageBreak,
        }),
      ];
    });
  }

  function normalizeSectionHeadings(value: unknown): DocumentSectionHeading[] {
    if (!Array.isArray(value)) return [];

    const seen = new Set<string>();
    return value.flatMap((heading): DocumentSectionHeading[] => {
      const record = asRecord(heading);
      if (!record) return [];
      const headingId = typeof record.id === "string" && record.id.trim() ? record.id : id("section");
      if (seen.has(headingId)) return [];
      seen.add(headingId);
      const title = typeof record.title === "string" ? record.title : "";
      return [{ id: headingId, title }];
    });
  }

  function normalizeDocumentFlow(
    value: unknown,
    questions: QuestionBlock[],
    sectionHeadings: DocumentSectionHeading[],
  ): DocumentFlowItem[] {
    const allowedQuestionIds = new Set(questions.map((question) => question.id));
    const allowedHeadingIds = new Set(sectionHeadings.map((heading) => heading.id));
    const seen = new Set<string>();
    const normalized: DocumentFlowItem[] = [];

    if (Array.isArray(value)) {
      value.forEach((item) => {
        const record = asRecord(item);
        if (!record || typeof record.id !== "string") return;
        const kind = record.kind;
        if (kind !== "question" && kind !== "sectionHeading") return;
        if (kind === "question" && !allowedQuestionIds.has(record.id)) return;
        if (kind === "sectionHeading" && !allowedHeadingIds.has(record.id)) return;
        const flowItem = { kind, id: record.id } satisfies DocumentFlowItem;
        const key = flowItemKey(flowItem);
        if (seen.has(key)) return;
        seen.add(key);
        normalized.push(flowItem);
      });
    }

    for (const heading of sectionHeadings) {
      const item = { kind: "sectionHeading", id: heading.id } satisfies DocumentFlowItem;
      const key = flowItemKey(item);
      if (!seen.has(key)) {
        normalized.push(item);
        seen.add(key);
      }
    }

    for (const question of questions) {
      const item = { kind: "question", id: question.id } satisfies DocumentFlowItem;
      const key = flowItemKey(item);
      if (!seen.has(key)) {
        normalized.push(item);
        seen.add(key);
      }
    }

    return normalized.length ? normalized : defaultDocumentFlow(questions);
  }

  return {
    normalizeEditorSubparts,
    normalizeEditorParts,
    normalizeQuestionBlocks,
    normalizeSectionHeadings,
    normalizeDocumentFlow,
  };
}
