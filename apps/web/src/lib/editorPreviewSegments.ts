import type { FormattingConfig, GraphConfig } from "@mauth-studio/shared";

import { normalizeColumnsBlock } from "./contentBlockNormalization.ts";
import { effectiveDiagramTextSide } from "./editorDiagramConfig.ts";
import {
  isOrderedBlockVisible,
  isOrderedDiagramBesideContentBlock,
  questionMarks,
  visibilityReplacementSlotAtOrderedItems,
} from "./editorDocumentToc.ts";
import {
  orderedPartItems,
  orderedQuestionItems,
  type DocumentFlowItem,
  type DocumentSectionHeading,
  type EditorContentBlock,
  type EditorPart,
  type OrderedPartItem,
  type QuestionBlock,
} from "./editorDocumentNormalization.ts";
import type { FrontMatterConfig } from "./frontMatterConfig.ts";
import { questionSpacingPx } from "./previewPagination.ts";
import { isContentBlockVisibleInScope, visibilityReplacementSlotAt } from "./solutionBlockVisibility.ts";

export interface PreviewSegment {
  id: string;
  kind:
    | "worksheet-header"
    | "notes-header"
    | "section-title-page"
    | "section-heading"
    | "question-start"
    | "question-block"
    | "part-group"
    | "page-break";
  questionIndex?: number;
  spacingTop: number;
  sectionHeading?: DocumentSectionHeading;
  sectionMarks?: number;
  question?: QuestionBlock;
  block?: EditorContentBlock;
  blocks?: EditorContentBlock[];
  part?: EditorPart;
  partItems?: OrderedPartItem[];
  partIndex?: number;
  showPartLabel?: boolean;
}

export interface PreviewGraphConfigChange {
  questionId: string;
  blockId: string;
  graphConfig: GraphConfig;
  partId?: string;
  subpartId?: string;
}

export interface TestSectionPlan {
  heading: DocumentSectionHeading;
  marks: number;
  questionIds: string[];
}

export function buildTestSectionPlans(
  normalizedFlow: DocumentFlowItem[],
  questions: QuestionBlock[],
  sectionHeadings: DocumentSectionHeading[],
): TestSectionPlan[] {
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const sectionHeadingMap = new Map(sectionHeadings.map((heading) => [heading.id, heading]));
  const plans: TestSectionPlan[] = [];
  let currentPlan: TestSectionPlan | null = null;

  normalizedFlow.forEach((flowItem) => {
    if (flowItem.kind === "sectionHeading") {
      const heading = sectionHeadingMap.get(flowItem.id);
      currentPlan = heading ? { heading, marks: 0, questionIds: [] } : null;
      if (currentPlan) plans.push(currentPlan);
      return;
    }
    if (!currentPlan) return;
    const question = questionMap.get(flowItem.id);
    if (!question) return;
    currentPlan.questionIds.push(question.id);
    currentPlan.marks += questionMarks(question);
  });

  return plans;
}

export interface BuildPreviewSegmentsOptions {
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  sectionHeadings: DocumentSectionHeading[];
  documentFlow: DocumentFlowItem[];
  showSolutions: boolean;
  formattingConfig?: FormattingConfig;
  normalizeDocumentFlow: (value: unknown, questions: QuestionBlock[], sectionHeadings: DocumentSectionHeading[]) => DocumentFlowItem[];
}

export function contentBlocksHaveDiagram(blocks: EditorContentBlock[], showSolutions = true): boolean {
  return blocks.some((block, blockIndex) => {
    if (!isContentBlockVisibleInScope(blocks, blockIndex, showSolutions)) return false;
    if (block.kind === "diagram") return true;
    if (block.kind === "columns")
      return normalizeColumnsBlock(block).columns.some((column) => contentBlocksHaveDiagram(column, showSolutions));
    return false;
  });
}

export function contentBlocksHaveVisibilityReplacementSlot(blocks: EditorContentBlock[]): boolean {
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    if (block.kind === "pageBreak") continue;
    if (visibilityReplacementSlotAt(blocks, blockIndex)) return true;
    if (block.kind === "columns") {
      const columns = normalizeColumnsBlock(block).columns;
      if (columns.some(contentBlocksHaveVisibilityReplacementSlot)) return true;
    }
  }
  return false;
}

export function promptTextBlock(id: string, text?: string): Extract<EditorContentBlock, { kind: "text" }> | null {
  const trimmed = text?.trim();
  return trimmed ? { id, kind: "text", text: trimmed } : null;
}

function partGroupPageBreakSegment(question: QuestionBlock, questionIndex: number, part: EditorPart, suffix: string): PreviewSegment {
  return {
    id: `${question.id}:part-group:${part.id}:page-break:${suffix}`,
    kind: "page-break",
    questionIndex,
    spacingTop: 0,
    question,
  };
}

function pushPartGroupSegment({
  segments,
  question,
  questionIndex,
  part,
  partIndex,
  itemIndex,
  partItems,
  segmentIndex,
}: {
  segments: PreviewSegment[];
  question: QuestionBlock;
  questionIndex: number;
  part: EditorPart;
  partIndex: number;
  itemIndex: number;
  partItems: OrderedPartItem[];
  segmentIndex: number;
}) {
  segments.push({
    id: `${question.id}:part-group:${part.id}:${segmentIndex}`,
    kind: "part-group",
    questionIndex,
    spacingTop: itemIndex === 0 && segmentIndex === 0 ? 12 : 18,
    question,
    part,
    partItems,
    partIndex: Math.max(0, partIndex),
    showPartLabel: segmentIndex === 0,
  });
}

export function buildPreviewSegments({
  frontMatter,
  questions,
  sectionHeadings,
  documentFlow,
  showSolutions,
  formattingConfig,
  normalizeDocumentFlow,
}: BuildPreviewSegmentsOptions): PreviewSegment[] {
  const gapPx = questionSpacingPx(formattingConfig);
  const questionSegmentsById = new Map<string, PreviewSegment[]>();
  questions.forEach((question, questionIndex) => {
    const segments: PreviewSegment[] = [
      {
        id: `${question.id}:start`,
        kind: "question-start",
        questionIndex,
        spacingTop: gapPx,
        question,
      },
    ];

    const questionItems = orderedQuestionItems(question);
    for (let itemIndex = 0; itemIndex < questionItems.length; itemIndex += 1) {
      const item = questionItems[itemIndex];
      if (item.kind === "block") {
        const nextItem = questionItems[itemIndex + 1];
        const replacementSlotFollows = visibilityReplacementSlotAtOrderedItems(questionItems, itemIndex + 1);
        if (
          item.block.kind === "diagram" &&
          isOrderedBlockVisible(questionItems, itemIndex, showSolutions) &&
          replacementSlotFollows &&
          effectiveDiagramTextSide(item.block, true) !== "none"
        ) {
          segments.push({
            id: `${question.id}:block:${item.block.id}:${replacementSlotFollows.blocks.map((block) => block.id).join(":")}`,
            kind: "question-block",
            questionIndex,
            spacingTop: itemIndex === 0 ? 8 : 12,
            question,
            block: item.block,
            blocks: [item.block, ...replacementSlotFollows.blocks],
          });
          itemIndex = replacementSlotFollows.endItemIndex;
          continue;
        }
        const replacementSlot = visibilityReplacementSlotAtOrderedItems(questionItems, itemIndex);
        if (replacementSlot) {
          segments.push({
            id: `${question.id}:block:${replacementSlot.blocks.map((block) => block.id).join(":")}`,
            kind: "question-block",
            questionIndex,
            spacingTop: itemIndex === 0 ? 8 : 12,
            question,
            block: replacementSlot.studentBlock,
            blocks: replacementSlot.blocks,
          });
          itemIndex = replacementSlot.endItemIndex;
          continue;
        }
        if (!isOrderedBlockVisible(questionItems, itemIndex, showSolutions)) continue;
        const pairedBlocks =
          item.block.kind === "diagram" &&
          nextItem?.kind === "block" &&
          isOrderedDiagramBesideContentBlock(questionItems, itemIndex + 1, showSolutions) &&
          effectiveDiagramTextSide(item.block, true) !== "none"
            ? [item.block, nextItem.block]
            : undefined;
        segments.push({
          id: `${question.id}:block:${item.block.id}`,
          kind: "question-block",
          questionIndex,
          spacingTop: itemIndex === 0 ? 8 : 12,
          question,
          block: item.block,
          blocks: pairedBlocks,
        });
        if (pairedBlocks) itemIndex += 1;
        continue;
      }

      const partIndex = question.parts.findIndex((part) => part.id === item.part.id);
      if (item.part.pageBreakBefore) {
        segments.push(partGroupPageBreakSegment(question, questionIndex, item.part, "before-part"));
      }

      const partItems = orderedPartItems(item.part);
      let partItemChunk: OrderedPartItem[] = [];
      let partSegmentIndex = 0;
      for (const partItem of partItems) {
        if (partItem.kind === "subpart" && partItem.subpart.pageBreakBefore) {
          if (partItemChunk.length) {
            pushPartGroupSegment({
              segments,
              question,
              questionIndex,
              part: item.part,
              partIndex,
              itemIndex,
              partItems: partItemChunk,
              segmentIndex: partSegmentIndex,
            });
            partSegmentIndex += 1;
            partItemChunk = [];
          }
          segments.push(partGroupPageBreakSegment(question, questionIndex, item.part, `before-subpart-${partItem.subpart.id}`));
        }
        partItemChunk.push(partItem);
      }

      if (partItemChunk.length || !partItems.length) {
        pushPartGroupSegment({
          segments,
          question,
          questionIndex,
          part: item.part,
          partIndex,
          itemIndex,
          partItems: partItemChunk,
          segmentIndex: partSegmentIndex,
        });
      }
    }

    if (question.pageBreakAfter || question.contentBlocks.some((block) => block.kind === "pageBreak")) {
      segments.push({
        id: `${question.id}:page-break`,
        kind: "page-break",
        questionIndex,
        spacingTop: 0,
        question,
      });
    }

    questionSegmentsById.set(question.id, segments);
  });

  const sectionHeadingMap = new Map(sectionHeadings.map((heading) => [heading.id, heading]));
  const questionSegments: PreviewSegment[] = [];
  let topLevelItemCount = 0;
  const normalizedFlow = normalizeDocumentFlow(documentFlow, questions, sectionHeadings);
  const sectionMarks = new Map(
    buildTestSectionPlans(normalizedFlow, questions, sectionHeadings).map((plan) => [plan.heading.id, plan.marks]),
  );

  const leadingStandardSectionHeadingId =
    frontMatter.titlePageTemplate === "standard" && normalizedFlow[0]?.kind === "sectionHeading" ? normalizedFlow[0].id : null;

  normalizedFlow.forEach((flowItem) => {
    const spacingTop = topLevelItemCount === 0 ? 0 : gapPx;

    if (flowItem.kind === "sectionHeading") {
      const sectionHeading = sectionHeadingMap.get(flowItem.id);
      if (!sectionHeading) return;
      if (flowItem.id === leadingStandardSectionHeadingId) return;
      if (frontMatter.titlePageTemplate === "standard") {
        if (questionSegments.at(-1)?.kind !== "page-break") {
          questionSegments.push({
            id: `section-title-page:${sectionHeading.id}:page-break-before`,
            kind: "page-break",
            spacingTop: 0,
          });
        }
        questionSegments.push({
          id: `section-title-page:${sectionHeading.id}`,
          kind: "section-title-page",
          spacingTop: 0,
          sectionHeading,
          sectionMarks: sectionMarks.get(sectionHeading.id) ?? 0,
        });
        questionSegments.push({
          id: `section-title-page:${sectionHeading.id}:page-break-after`,
          kind: "page-break",
          spacingTop: 0,
        });
        topLevelItemCount += 1;
        return;
      }
      questionSegments.push({
        id: `section-heading:${sectionHeading.id}`,
        kind: "section-heading",
        spacingTop,
        sectionHeading,
      });
      topLevelItemCount += 1;
      return;
    }

    const segments = questionSegmentsById.get(flowItem.id);
    if (!segments?.length) return;
    const [firstSegment, ...remainingSegments] = segments;
    questionSegments.push({ ...firstSegment, spacingTop });
    questionSegments.push(...remainingSegments);
    topLevelItemCount += 1;
  });

  if (frontMatter.titlePageTemplate !== "worksheet" && frontMatter.titlePageTemplate !== "notes") return questionSegments;

  return [
    {
      id: frontMatter.titlePageTemplate === "notes" ? "notes-header" : "worksheet-header",
      kind: frontMatter.titlePageTemplate === "notes" ? "notes-header" : "worksheet-header",
      spacingTop: 0,
    },
    ...questionSegments,
  ];
}

export function previewPartBlockRowIds(partItems: OrderedPartItem[], showSolutions: boolean) {
  const rowIds: string[] = [];
  for (let index = 0; index < partItems.length; index += 1) {
    const item = partItems[index];
    if (item.kind !== "block") continue;
    const nextItem = partItems[index + 1];
    const replacementSlotFollows = visibilityReplacementSlotAtOrderedItems(partItems, index + 1);
    if (
      item.block.kind === "diagram" &&
      isOrderedBlockVisible(partItems, index, showSolutions) &&
      replacementSlotFollows &&
      effectiveDiagramTextSide(item.block, true) !== "none"
    ) {
      rowIds.push(item.id);
      index = replacementSlotFollows.endItemIndex;
      continue;
    }
    const replacementSlot = visibilityReplacementSlotAtOrderedItems(partItems, index);
    if (replacementSlot) {
      rowIds.push(item.id);
      index = replacementSlot.endItemIndex;
      continue;
    }
    if (
      item.block.kind === "diagram" &&
      isOrderedBlockVisible(partItems, index, showSolutions) &&
      nextItem?.kind === "block" &&
      isOrderedDiagramBesideContentBlock(partItems, index + 1, showSolutions) &&
      effectiveDiagramTextSide(item.block, true) !== "none"
    ) {
      rowIds.push(item.id);
      index += 1;
      continue;
    }
    if (isOrderedBlockVisible(partItems, index, showSolutions)) rowIds.push(item.id);
  }
  return rowIds;
}
