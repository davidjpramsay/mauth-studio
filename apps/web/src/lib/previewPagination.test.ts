import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_EXAM_FRONT_MATTER, DEFAULT_FRONT_MATTER, DEFAULT_NOTES_FRONT_MATTER } from "./frontMatterConfig.ts";
import {
  bookletSupplementaryPageCount,
  buildExplicitBreakPages,
  buildMeasuredPages,
  buildPreviewPaginationReport,
  examQuestionPageReservedHeight,
  examStructurePercentageTotal,
  examStructureRows,
  frontMatterPageCount,
  groupPreviewPageSegments,
  investigationPreviewPageCount,
  pagesAreEqual,
  previewPaginationReportsEqual,
  previewReadinessWarnings,
  questionSpacingPx,
} from "./previewPagination.ts";
import type { PageFormat } from "./previewPageFormat.ts";

const compactPageFormat: PageFormat = {
  widthPx: 100,
  heightPx: 120,
  paddingXPx: 10,
  paddingYPx: 10,
  showPageBreaks: true,
};

test("pagesAreEqual compares segment indexes and overflow flags", () => {
  assert.equal(
    pagesAreEqual(
      [
        { segmentIndexes: [0, 1], overflow: false },
        { segmentIndexes: [2], overflow: true },
      ],
      [
        { segmentIndexes: [0, 1], overflow: false },
        { segmentIndexes: [2], overflow: true },
      ],
    ),
    true,
  );
  assert.equal(pagesAreEqual([{ segmentIndexes: [0], overflow: false }], [{ segmentIndexes: [0], overflow: true }]), false);
  assert.equal(pagesAreEqual([{ segmentIndexes: [0], overflow: false }], [{ segmentIndexes: [1], overflow: false }]), false);
});

test("buildPreviewPaginationReport records physical page numbers and overflow targets", () => {
  const report = buildPreviewPaginationReport({
    pages: [
      { segmentIndexes: [0, 1], overflow: false },
      { segmentIndexes: [2], overflow: true },
    ],
    segments: [
      { id: "q1-start", question: { id: "q1" } },
      { id: "q1-block", question: { id: "q1" } },
      { id: "q2-block", question: { id: "q2" } },
    ],
    frontMatter: DEFAULT_EXAM_FRONT_MATTER,
    supplementaryPageCount: 1,
    showSolutions: true,
  });

  assert.deepEqual(report, {
    mode: "solutions",
    contentPageCount: 2,
    supplementaryPageCount: 1,
    totalPageCount: 5,
    overflowPages: [
      {
        pageIndex: 1,
        pageNumber: 4,
        segmentIds: ["q2-block"],
        targetId: "q2",
      },
    ],
  });
});

test("preview readiness warnings identify the measured copy and target", () => {
  const report = buildPreviewPaginationReport({
    pages: [{ segmentIndexes: [0], overflow: true }],
    segments: [{ id: "q1-block", question: { id: "q1" } }],
    frontMatter: DEFAULT_FRONT_MATTER,
    supplementaryPageCount: 0,
    showSolutions: false,
  });

  assert.deepEqual(previewReadinessWarnings(report), [
    {
      code: "rendered-page-overflow",
      message: "Student preview page 2 contains a block taller than the printable A4 content area.",
      targetId: "q1",
    },
  ]);
  assert.equal(previewPaginationReportsEqual(report, { ...report }), true);
  assert.equal(previewPaginationReportsEqual(report, { ...report, mode: "solutions" }), false);
});

test("groupPreviewPageSegments keeps adjacent question segments together", () => {
  const questionA = { id: "q1" };
  const questionB = { id: "q2" };

  const groups = groupPreviewPageSegments([
    { segment: { id: "heading" }, segmentPageIndex: 0 },
    { segment: { id: "q1-start", question: questionA }, segmentPageIndex: 1 },
    { segment: { id: "q1-block", question: questionA }, segmentPageIndex: 2 },
    { segment: { id: "q2-start", question: questionB }, segmentPageIndex: 3 },
  ]);

  assert.deepEqual(
    groups.map((group) => ({ id: group.id, entryCount: group.entries.length, questionId: group.question?.id })),
    [
      { id: "heading", entryCount: 1, questionId: undefined },
      { id: "q1:1", entryCount: 2, questionId: "q1" },
      { id: "q2:3", entryCount: 1, questionId: "q2" },
    ],
  );
});

test("frontMatterPageCount reflects document title-page templates", () => {
  assert.equal(frontMatterPageCount(DEFAULT_FRONT_MATTER), 1);
  assert.equal(frontMatterPageCount(DEFAULT_EXAM_FRONT_MATTER), 2);
  assert.equal(frontMatterPageCount({ ...DEFAULT_FRONT_MATTER, titlePageTemplate: "worksheet" }), 0);
  assert.equal(frontMatterPageCount(DEFAULT_NOTES_FRONT_MATTER), 0);
  assert.equal(frontMatterPageCount({ ...DEFAULT_FRONT_MATTER, titlePageTemplate: "investigation" }), 0);
});

test("investigation preview adds enough teacher rubric pages for the criteria", () => {
  assert.equal(investigationPreviewPageCount(false), 1);
  assert.equal(investigationPreviewPageCount(true), 2);
  assert.equal(investigationPreviewPageCount(true, 3), 2);
  assert.equal(investigationPreviewPageCount(true, 4), 3);
  assert.equal(investigationPreviewPageCount(true, 5), 3);
  assert.equal(investigationPreviewPageCount(true, 7), 4);
});

test("exam reserved question-page height is only used for exam booklets", () => {
  assert.equal(examQuestionPageReservedHeight(DEFAULT_EXAM_FRONT_MATTER), 86);
  assert.equal(examQuestionPageReservedHeight(DEFAULT_FRONT_MATTER), 0);
});

test("bookletSupplementaryPageCount pads exam booklets to a multiple of four pages", () => {
  assert.equal(bookletSupplementaryPageCount(DEFAULT_FRONT_MATTER, 3), 0);
  assert.equal(bookletSupplementaryPageCount(DEFAULT_EXAM_FRONT_MATTER, 1), 1);
  assert.equal(bookletSupplementaryPageCount(DEFAULT_EXAM_FRONT_MATTER, 2), 0);

  assert.equal(
    bookletSupplementaryPageCount(
      {
        ...DEFAULT_EXAM_FRONT_MATTER,
        exam: {
          ...DEFAULT_EXAM_FRONT_MATTER.exam!,
          supplementaryPageCount: 2,
        },
      },
      3,
    ),
    3,
  );
});

test("questionSpacingPx follows formatting presets", () => {
  assert.equal(questionSpacingPx(), 32);
  assert.equal(questionSpacingPx({ id: "worksheet", questionSpacing: "compact" }), 16);
  assert.equal(questionSpacingPx({ id: "tight", questionSpacing: "tight" }), 10);
});

test("buildExplicitBreakPages splits only on explicit page-break segments", () => {
  assert.deepEqual(buildExplicitBreakPages([]), [{ segmentIndexes: [], overflow: false }]);
  assert.deepEqual(
    buildExplicitBreakPages([
      { kind: "page-break" },
      { kind: "question-start" },
      { kind: "question-block" },
      { kind: "page-break" },
      { kind: "question-start" },
    ]),
    [
      { segmentIndexes: [1, 2], overflow: false },
      { segmentIndexes: [4], overflow: false },
    ],
  );
});

test("buildMeasuredPages paginates by measured height and ignores top spacing at page top", () => {
  assert.deepEqual(buildMeasuredPages([], [], compactPageFormat), [{ segmentIndexes: [], overflow: false }]);

  assert.deepEqual(
    buildMeasuredPages(
      [60, 60, 60],
      [
        { kind: "question-start", spacingTop: 10 },
        { kind: "question-block", spacingTop: 10 },
        { kind: "question-block", spacingTop: 10 },
      ],
      compactPageFormat,
    ),
    [
      { segmentIndexes: [0], overflow: false },
      { segmentIndexes: [1], overflow: false },
      { segmentIndexes: [2], overflow: false },
    ],
  );
});

test("buildMeasuredPages respects explicit page-breaks and flags oversized pages", () => {
  assert.deepEqual(
    buildMeasuredPages(
      [40, 0, 140],
      [{ kind: "question-start" }, { kind: "page-break" }, { kind: "question-block", spacingTop: 10 }],
      compactPageFormat,
    ),
    [
      { segmentIndexes: [0], overflow: false },
      { segmentIndexes: [2], overflow: true },
    ],
  );
});

test("examStructureRows projects current document totals into the active row", () => {
  const rows = examStructureRows(DEFAULT_EXAM_FRONT_MATTER, 45, 8);

  assert.equal(rows[0].questionsAvailable, 8);
  assert.equal(rows[0].questionsToBeAnswered, 8);
  assert.equal(rows[0].marksAvailable, 45);
  assert.equal(rows[1].questionsAvailable, DEFAULT_EXAM_FRONT_MATTER.exam!.structureRows[1].questionsAvailable);
});

test("examStructurePercentageTotal sums row percentages", () => {
  assert.equal(examStructurePercentageTotal(DEFAULT_EXAM_FRONT_MATTER.exam!.structureRows), 100);
});
