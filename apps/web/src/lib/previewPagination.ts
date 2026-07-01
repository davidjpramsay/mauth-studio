import type { FormattingConfig } from "@mauth-studio/shared";

import { normalizeFormattingConfig } from "./editorFormattingConfig.ts";
import { normalizeExamTitlePage, type ExamStructureRowConfig, type FrontMatterConfig } from "./frontMatterConfig.ts";
import type { PageFormat } from "./previewPageFormat.ts";

const QUESTION_GAP_PX = 32;
const WORKSHEET_QUESTION_GAP_PX = 16;

export interface PreviewPage {
  segmentIndexes: number[];
  overflow: boolean;
}

export interface PreviewPaginationSegmentLike {
  kind: string;
  spacingTop?: number;
}

export interface PreviewQuestionLike {
  id: string;
}

export interface PreviewQuestionSegmentLike<TQuestion extends PreviewQuestionLike = PreviewQuestionLike> {
  id: string;
  question?: TQuestion;
}

export interface PreviewPageSegmentEntry<TSegment extends PreviewQuestionSegmentLike = PreviewQuestionSegmentLike> {
  segment: TSegment;
  segmentPageIndex: number;
}

export interface PreviewQuestionSegmentGroup<TSegment extends PreviewQuestionSegmentLike = PreviewQuestionSegmentLike> {
  id: string;
  question?: TSegment["question"];
  entries: Array<PreviewPageSegmentEntry<TSegment>>;
}

export function pagesAreEqual(left: PreviewPage[], right: PreviewPage[]) {
  if (left.length !== right.length) return false;
  return left.every((page, pageIndex) => {
    const other = right[pageIndex];
    return page.overflow === other.overflow && page.segmentIndexes.join(",") === other.segmentIndexes.join(",");
  });
}

export function groupPreviewPageSegments<TSegment extends PreviewQuestionSegmentLike>(
  entries: Array<PreviewPageSegmentEntry<TSegment>>,
): Array<PreviewQuestionSegmentGroup<TSegment>> {
  const groups: Array<PreviewQuestionSegmentGroup<TSegment>> = [];

  for (const entry of entries) {
    if (!entry.segment.question) {
      groups.push({
        id: entry.segment.id,
        entries: [entry],
      });
      continue;
    }

    const previousGroup = groups.at(-1);
    if (previousGroup?.question?.id === entry.segment.question.id) {
      previousGroup.entries.push(entry);
      continue;
    }

    groups.push({
      id: `${entry.segment.question.id}:${entry.segmentPageIndex}`,
      question: entry.segment.question,
      entries: [entry],
    });
  }

  return groups;
}

export function frontMatterPageCount(frontMatter: FrontMatterConfig) {
  if (frontMatter.titlePageTemplate === "worksheet" || frontMatter.titlePageTemplate === "notes") return 0;
  return frontMatter.titlePageTemplate === "exam" ? 2 : 1;
}

export function examQuestionPageReservedHeight(frontMatter: FrontMatterConfig) {
  return frontMatter.titlePageTemplate === "exam" ? 86 : 0;
}

export function bookletSupplementaryPageCount(frontMatter: FrontMatterConfig, contentPageCount: number) {
  if (frontMatter.titlePageTemplate !== "exam") return 0;
  const exam = normalizeExamTitlePage(frontMatter.exam);
  const basePageCount = frontMatterPageCount(frontMatter) + contentPageCount;
  const minimumSupplementaryPages = Math.max(0, exam.supplementaryPageCount);
  const pageCountWithMinimum = basePageCount + minimumSupplementaryPages;
  return minimumSupplementaryPages + ((4 - (pageCountWithMinimum % 4)) % 4);
}

export function questionSpacingPx(formattingConfig?: FormattingConfig) {
  const spacing = normalizeFormattingConfig(formattingConfig).questionSpacing;
  if (spacing === "compact") return WORKSHEET_QUESTION_GAP_PX;
  if (spacing === "tight") return 10;
  return QUESTION_GAP_PX;
}

export function buildMeasuredPages(
  segmentHeights: number[],
  segments: PreviewPaginationSegmentLike[],
  pageFormat: PageFormat,
  reservedPageHeight = 0,
): PreviewPage[] {
  if (!segmentHeights.length) return [{ segmentIndexes: [], overflow: false }];

  const contentHeight = pageFormat.heightPx - pageFormat.paddingYPx * 2 - reservedPageHeight;
  const pages: PreviewPage[] = [];
  let currentSegmentIndexes: number[] = [];
  let currentHeight = 0;
  let currentOverflow = false;

  const pushCurrentPage = () => {
    pages.push({ segmentIndexes: currentSegmentIndexes, overflow: currentOverflow });
    currentSegmentIndexes = [];
    currentHeight = 0;
    currentOverflow = false;
  };

  segmentHeights.forEach((measuredHeight, segmentIndex) => {
    const segment = segments[segmentIndex];
    if (segment?.kind === "page-break") {
      if (currentSegmentIndexes.length) pushCurrentPage();
      return;
    }
    const fullHeight = measuredHeight || 0;
    const pageTopHeight = Math.max(0, fullHeight - (segment?.spacingTop ?? 0));
    const effectiveHeight = currentSegmentIndexes.length ? fullHeight : pageTopHeight;
    const proposedHeight = currentHeight + effectiveHeight;

    if (currentSegmentIndexes.length && proposedHeight > contentHeight) {
      pushCurrentPage();
    }

    const heightOnPage = currentSegmentIndexes.length ? fullHeight : pageTopHeight;
    currentSegmentIndexes.push(segmentIndex);
    currentHeight += heightOnPage;
    currentOverflow = currentOverflow || currentHeight > contentHeight;
  });

  if (currentSegmentIndexes.length || !pages.length) {
    pushCurrentPage();
  }

  return pages;
}

export function buildExplicitBreakPages(segments: PreviewPaginationSegmentLike[]): PreviewPage[] {
  if (!segments.length) return [{ segmentIndexes: [], overflow: false }];

  const pages: PreviewPage[] = [];
  let currentSegmentIndexes: number[] = [];

  const pushCurrentPage = () => {
    pages.push({ segmentIndexes: currentSegmentIndexes, overflow: false });
    currentSegmentIndexes = [];
  };

  segments.forEach((segment, segmentIndex) => {
    if (segment.kind === "page-break") {
      if (currentSegmentIndexes.length) pushCurrentPage();
      return;
    }
    currentSegmentIndexes.push(segmentIndex);
  });

  if (currentSegmentIndexes.length || !pages.length) pushCurrentPage();
  return pages;
}

export function examStructureRows(frontMatter: FrontMatterConfig, totalMarks: number, questionCount: number) {
  const exam = normalizeExamTitlePage(frontMatter.exam);
  return exam.structureRows.map((row) =>
    row.useCurrentDocument
      ? {
          ...row,
          questionsAvailable: questionCount,
          questionsToBeAnswered: questionCount,
          marksAvailable: totalMarks,
        }
      : row,
  );
}

export function examStructurePercentageTotal(rows: ExamStructureRowConfig[]) {
  return rows.reduce((sum, row) => sum + row.percentage, 0);
}
