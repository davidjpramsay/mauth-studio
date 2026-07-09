import type { MoveDirection } from "./documentNavigation.ts";
import { orderItemKey, type DocumentFlowItem, type DocumentSectionHeading, type QuestionBlock } from "./editorDocumentNormalization.ts";
import type { NormalizeDocumentFlow } from "./editorSectionHeadings.ts";
import {
  orderItemsForContainer,
  subsectionOrderItem,
  subsectionSourceContainer,
  type SubsectionDragTarget,
} from "./editorSubsectionDrag.ts";
import { parseScrollAnchor, type ParsedScrollAnchor } from "./scrollAnchors.ts";

export function subsectionTargetFromParsed(parsed: ParsedScrollAnchor): SubsectionDragTarget | null {
  if (!parsed.questionId) return null;
  if (parsed.kind === "questionBlock" && parsed.blockId) {
    return { kind: "question-block", questionId: parsed.questionId, id: parsed.blockId };
  }
  if (parsed.kind === "part" && parsed.partId) return { kind: "part", questionId: parsed.questionId, id: parsed.partId };
  if (parsed.kind === "partBlock" && parsed.partId && parsed.blockId) {
    return { kind: "part-block", questionId: parsed.questionId, partId: parsed.partId, id: parsed.blockId };
  }
  if (parsed.kind === "subpart" && parsed.partId && parsed.subpartId) {
    return { kind: "subpart", questionId: parsed.questionId, partId: parsed.partId, id: parsed.subpartId };
  }
  if (parsed.kind === "subpartBlock" && parsed.partId && parsed.subpartId && parsed.blockId) {
    return {
      kind: "subpart-block",
      questionId: parsed.questionId,
      partId: parsed.partId,
      subpartId: parsed.subpartId,
      id: parsed.blockId,
    };
  }
  return null;
}

export function subsectionTargetFromAnchor(anchor: string) {
  return subsectionTargetFromParsed(parseScrollAnchor(anchor));
}

export function canDeleteAnchorTarget(anchor: string) {
  const parsed = parseScrollAnchor(anchor);
  return parsed.kind !== "frontMatter" && parsed.kind !== "unknown";
}

export function canMoveAnchorTarget({
  anchor,
  direction,
  questions,
  documentFlow,
  sectionHeadings,
  normalizeDocumentFlow,
}: {
  anchor: string;
  direction: MoveDirection;
  questions: QuestionBlock[];
  documentFlow: DocumentFlowItem[];
  sectionHeadings: DocumentSectionHeading[];
  normalizeDocumentFlow: NormalizeDocumentFlow;
}) {
  const parsed = parseScrollAnchor(anchor);
  if (parsed.kind === "sectionHeading" && parsed.sectionHeadingId) {
    const flow = normalizeDocumentFlow(documentFlow, questions, sectionHeadings);
    const index = flow.findIndex((item) => item.kind === "sectionHeading" && item.id === parsed.sectionHeadingId);
    return index >= 0 && Boolean(flow[index + direction]);
  }
  if (parsed.kind === "question" && parsed.questionId) {
    const index = questions.findIndex((question) => question.id === parsed.questionId);
    return index >= 0 && Boolean(questions[index + direction]);
  }

  const target = subsectionTargetFromParsed(parsed);
  if (!target) return false;
  const activeItem = subsectionOrderItem(target);
  if (!activeItem) return false;
  const items = orderItemsForContainer(questions, subsectionSourceContainer(target));
  const index = items.findIndex((item) => orderItemKey(item) === orderItemKey(activeItem));
  return index >= 0 && Boolean(items[index + direction]);
}
