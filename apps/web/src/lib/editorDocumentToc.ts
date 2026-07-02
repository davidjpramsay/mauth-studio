import { normalizeChoiceItems, normalizeColumnsBlock, normalizeTableBlock, plainTableRows } from "./contentBlockNormalization.ts";
import { tocBlockKind, tocBlockLabel } from "./editorBlockSummaries.ts";
import {
  alphaLabel,
  orderedPartItems,
  orderedQuestionItems,
  romanLabel,
  type DocumentFlowItem,
  type DocumentSectionHeading,
  type EditorContentBlock,
  type EditorPart,
  type OrderedPartItem,
  type OrderedQuestionItem,
  type QuestionBlock,
} from "./editorDocumentNormalization.ts";
import { questionDisplayNumber } from "./editorSolutionValidationRuntime.ts";
import { assessmentTitleText, type FrontMatterConfig } from "./frontMatterConfig.ts";
import type { DocumentTocItem } from "./documentNavigation.ts";
import {
  SCROLL_ANCHOR_FRONT_MATTER,
  partBlockScrollAnchor,
  partScrollAnchor,
  questionBlockScrollAnchor,
  questionScrollAnchor,
  sectionHeadingScrollAnchor,
  subpartBlockScrollAnchor,
  subpartScrollAnchor,
} from "./scrollAnchors.ts";
import {
  isContentBlockVisible,
  isContentBlockVisibleInScope,
  isSolutionReplacementBlock,
  solutionBlockVisibility,
  visibilityReplacementSlotAt,
  type SolutionVisibilityReplacementSlotGroup,
} from "./solutionBlockVisibility.ts";

export function markLabel(marks: number) {
  return `(${marks} mark${marks === 1 ? "" : "s"})`;
}

export function partMarks(part: EditorPart) {
  const subparts = part.subparts ?? [];
  if (subparts.length) return subparts.reduce((sum, subpart) => sum + Number(subpart.marks || 0), 0);
  return Number(part.marks || 0);
}

export function questionMarks(question: QuestionBlock) {
  if (question.parts.length) {
    return question.parts.reduce((sum, part) => sum + partMarks(part), 0);
  }
  return Math.max(0, Number(question.marks) || 0);
}

export function visibleContentBlocks(blocks: EditorContentBlock[], showSolutions: boolean) {
  return blocks.filter((_, blockIndex) => isContentBlockVisibleInScope(blocks, blockIndex, showSolutions));
}

export function firstTextSource(blocks: EditorContentBlock[], showSolutions = true): string {
  const visibleBlocks = visibleContentBlocks(blocks, showSolutions);
  const textBlock = visibleBlocks.find((block) => block.kind === "text");
  if (textBlock?.kind === "text") return textBlock.text?.replace(/\s+/g, " ").trim() || "";
  const columnsBlock = visibleBlocks.find((block) => block.kind === "columns");
  if (columnsBlock?.kind === "columns") {
    const nestedText = normalizeColumnsBlock(columnsBlock)
      .columns.map((column) => firstTextSource(column, showSolutions))
      .find(Boolean);
    if (nestedText) return nestedText;
  }
  const choicesBlock = visibleBlocks.find((block) => block.kind === "choices");
  if (choicesBlock?.kind === "choices") return normalizeChoiceItems(choicesBlock.choices).filter(Boolean).join("; ");
  const tableContentBlock = visibleBlocks.find((block) => block.kind === "table");
  if (tableContentBlock?.kind === "table") {
    const table = normalizeTableBlock(tableContentBlock);
    return `${plainTableRows(table).length} row table`;
  }
  return "";
}

export function partPanelSummary(blocks: EditorContentBlock[], showSolutions = true) {
  return firstTextSource(blocks, showSolutions);
}

export function visibilityReplacementSlotAtOrderedItems(
  items: Array<OrderedQuestionItem | OrderedPartItem>,
  startIndex: number,
): (SolutionVisibilityReplacementSlotGroup<EditorContentBlock> & { endItemIndex: number }) | null {
  const contiguousBlocks: EditorContentBlock[] = [];
  const itemIndexes: number[] = [];
  for (let cursor = startIndex; cursor < items.length; cursor += 1) {
    const item = items[cursor];
    if (item.kind !== "block") break;
    contiguousBlocks.push(item.block);
    itemIndexes.push(cursor);
  }

  const slot = visibilityReplacementSlotAt(contiguousBlocks, 0);
  if (!slot) return null;
  return {
    ...slot,
    endItemIndex: itemIndexes[slot.endIndex] ?? startIndex,
  };
}

function replacementSlotContainingOrderedBlock(items: Array<OrderedQuestionItem | OrderedPartItem>, itemIndex: number) {
  const item = items[itemIndex];
  if (item?.kind !== "block") return null;

  const directSlot = visibilityReplacementSlotAtOrderedItems(items, itemIndex);
  if (directSlot) return directSlot;

  for (let cursor = itemIndex - 1; cursor >= 0; cursor -= 1) {
    const candidate = items[cursor];
    if (candidate?.kind !== "block" || candidate.block.kind === "pageBreak" || !isSolutionReplacementBlock(candidate.block)) break;
    const slot = visibilityReplacementSlotAtOrderedItems(items, cursor);
    if (slot && itemIndex <= slot.endItemIndex) return slot;
  }

  return null;
}

function isOrderedUnpairedStudentAnswerSpace(items: Array<OrderedQuestionItem | OrderedPartItem>, itemIndex: number) {
  const item = items[itemIndex];
  return Boolean(
    item?.kind === "block" &&
    item.block.kind === "space" &&
    solutionBlockVisibility(item.block) === "student" &&
    !replacementSlotContainingOrderedBlock(items, itemIndex),
  );
}

export function isOrderedBlockVisible(items: Array<OrderedQuestionItem | OrderedPartItem>, itemIndex: number, showSolutions: boolean) {
  const item = items[itemIndex];
  if (item?.kind !== "block") return false;
  if (showSolutions && isOrderedUnpairedStudentAnswerSpace(items, itemIndex)) return true;
  return isContentBlockVisible(item.block, showSolutions);
}

export function isOrderedDiagramBesideContentBlock(
  items: Array<OrderedQuestionItem | OrderedPartItem>,
  itemIndex: number,
  showSolutions: boolean,
) {
  const item = items[itemIndex];
  return Boolean(
    item?.kind === "block" &&
    (item.block.kind === "text" || item.block.kind === "space") &&
    isOrderedBlockVisible(items, itemIndex, showSolutions),
  );
}

export function notesSectionTitle(question: QuestionBlock, index: number) {
  return question.text?.trim() || question.section.trim() || `Heading ${index + 1}`;
}

export interface BuildDocumentTocOptions {
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  sectionHeadings: DocumentSectionHeading[];
  documentFlow: DocumentFlowItem[];
  showSolutions: boolean;
  normalizeDocumentFlow: (value: unknown, questions: QuestionBlock[], sectionHeadings: DocumentSectionHeading[]) => DocumentFlowItem[];
  tocBlockSummary: (block: EditorContentBlock) => string;
}

export function buildDocumentToc({
  frontMatter,
  questions,
  sectionHeadings,
  documentFlow,
  showSolutions,
  normalizeDocumentFlow,
  tocBlockSummary,
}: BuildDocumentTocOptions) {
  const isNotesTemplate = frontMatter.titlePageTemplate === "notes";
  const isCompactDocumentTemplate = frontMatter.titlePageTemplate === "worksheet" || isNotesTemplate;
  const items: DocumentTocItem[] = [
    {
      id: SCROLL_ANCHOR_FRONT_MATTER,
      label: isNotesTemplate ? "Notes heading" : frontMatter.titlePageTemplate === "worksheet" ? "Worksheet heading" : "Title Page",
      summary: `${frontMatter.subjectTitle} - ${
        isCompactDocumentTemplate ? frontMatter.assessmentTitle : assessmentTitleText(frontMatter.assessmentTitle)
      }`,
      kind: "title",
      depth: 0,
      editorAnchor: SCROLL_ANCHOR_FRONT_MATTER,
      previewAnchor: SCROLL_ANCHOR_FRONT_MATTER,
    },
  ];

  const questionMap = new Map(questions.map((question, index) => [question.id, { question, questionIndex: index }]));
  const sectionHeadingMap = new Map(sectionHeadings.map((heading) => [heading.id, heading]));
  const normalizedFlow = normalizeDocumentFlow(documentFlow, questions, sectionHeadings);

  normalizedFlow.forEach((flowItem) => {
    if (flowItem.kind === "sectionHeading") {
      const heading = sectionHeadingMap.get(flowItem.id);
      if (!heading) return;
      const headingAnchor = sectionHeadingScrollAnchor(heading.id);
      items.push({
        id: headingAnchor,
        label: heading.title.trim() || "Section heading",
        summary: isNotesTemplate ? "Notes section" : "Worksheet section",
        kind: "sectionHeading",
        depth: 0,
        editorAnchor: headingAnchor,
        previewAnchor: headingAnchor,
      });
      return;
    }

    const questionEntry = questionMap.get(flowItem.id);
    if (!questionEntry) return;
    const { question, questionIndex } = questionEntry;
    const questionAnchor = questionScrollAnchor(question.id);
    items.push({
      id: questionAnchor,
      label: isNotesTemplate ? notesSectionTitle(question, questionIndex) : `Question ${questionDisplayNumber(frontMatter, questionIndex)}`,
      summary: firstTextSource(question.contentBlocks, showSolutions) || markLabel(questionMarks(question)),
      kind: "question",
      depth: 0,
      editorAnchor: questionAnchor,
      previewAnchor: questionAnchor,
    });

    const questionItems = orderedQuestionItems(question);
    questionItems.forEach((item, itemIndex) => {
      if (item.kind === "block") {
        if (!isOrderedBlockVisible(questionItems, itemIndex, showSolutions)) return;
        const blockAnchor = questionBlockScrollAnchor(question.id, item.block.id);
        items.push({
          id: blockAnchor,
          label: tocBlockLabel(item.block, itemIndex),
          summary: tocBlockSummary(item.block),
          kind: tocBlockKind(item.block),
          depth: 1,
          editorAnchor: blockAnchor,
          previewAnchor: blockAnchor,
        });
        return;
      }

      const partIndex = Math.max(
        0,
        question.parts.findIndex((part) => part.id === item.part.id),
      );
      const partLabel = alphaLabel(partIndex);
      const partAnchor = partScrollAnchor(question.id, item.part.id);
      items.push({
        id: partAnchor,
        label: isNotesTemplate ? `Subheading ${partIndex + 1}` : `Part (${partLabel})`,
        summary: partPanelSummary(item.part.contentBlocks, showSolutions) || markLabel(partMarks(item.part)),
        kind: "part",
        depth: 1,
        editorAnchor: partAnchor,
        previewAnchor: partAnchor,
      });

      const partItems = orderedPartItems(item.part);
      partItems.forEach((partItem, partItemIndex) => {
        if (partItem.kind === "block") {
          if (!isOrderedBlockVisible(partItems, partItemIndex, showSolutions)) return;
          const blockAnchor = partBlockScrollAnchor(question.id, item.part.id, partItem.block.id);
          items.push({
            id: blockAnchor,
            label: tocBlockLabel(partItem.block, partItemIndex),
            summary: tocBlockSummary(partItem.block),
            kind: tocBlockKind(partItem.block),
            depth: 2,
            editorAnchor: blockAnchor,
            previewAnchor: blockAnchor,
          });
          return;
        }

        const subpartIndex = Math.max(
          0,
          item.part.subparts.findIndex((subpart) => subpart.id === partItem.subpart.id),
        );
        const subpartLabel = romanLabel(subpartIndex);
        const subpartAnchor = subpartScrollAnchor(question.id, item.part.id, partItem.subpart.id);
        items.push({
          id: subpartAnchor,
          label: isNotesTemplate ? `Detail ${subpartIndex + 1}` : `Subpart (${subpartLabel})`,
          summary: partPanelSummary(partItem.subpart.contentBlocks, showSolutions) || markLabel(partItem.subpart.marks),
          kind: "subpart",
          depth: 2,
          editorAnchor: subpartAnchor,
          previewAnchor: subpartAnchor,
        });

        partItem.subpart.contentBlocks
          .filter(
            (block, blockIndex) =>
              block.kind !== "pageBreak" && isContentBlockVisibleInScope(partItem.subpart.contentBlocks, blockIndex, showSolutions),
          )
          .forEach((block, blockIndex) => {
            const blockAnchor = subpartBlockScrollAnchor(question.id, item.part.id, partItem.subpart.id, block.id);
            items.push({
              id: blockAnchor,
              label: tocBlockLabel(block, blockIndex),
              summary: tocBlockSummary(block),
              kind: tocBlockKind(block),
              depth: 3,
              editorAnchor: blockAnchor,
              previewAnchor: blockAnchor,
            });
          });
      });
    });
  });

  return items;
}
