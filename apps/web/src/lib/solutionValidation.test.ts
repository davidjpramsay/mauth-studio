import assert from "node:assert/strict";
import test from "node:test";
import type { ContentBlock, ContentBlockVisibility, GraphConfig } from "@mauth-studio/shared";

import {
  solutionValidationSummary,
  validateSolutionCompleteness,
  type SolutionValidationPartLike,
  type SolutionValidationQuestionLike,
  type SolutionValidationRuntime,
  type SolutionValidationSubpartLike,
} from "./solutionValidation.ts";
import { solutionBlockVisibility, visibilityReplacementSlotAt } from "./solutionBlockVisibility.ts";

type TestSubpart = SolutionValidationSubpartLike;

interface TestPart extends SolutionValidationPartLike<TestSubpart> {
  subparts: TestSubpart[];
}

interface TestQuestion extends SolutionValidationQuestionLike<TestPart> {
  parts: TestPart[];
}

function textBlock(id: string, text: string, visibility?: ContentBlockVisibility): ContentBlock {
  return { id, kind: "text", text, ...(visibility ? { visibility } : {}) };
}

function spaceBlock(id: string, lines: number, visibility: ContentBlockVisibility = "student"): ContentBlock {
  return { id, kind: "space", lines, showLines: false, visibility };
}

function tableBlock(id: string, rows: string[][], visibility?: ContentBlockVisibility): ContentBlock {
  return {
    id,
    kind: "table",
    headers: ["x", "0", "1"],
    rows,
    showHeader: true,
    ...(visibility ? { visibility } : {}),
  };
}

function question(id: string, marks: number, contentBlocks: ContentBlock[]): TestQuestion {
  return {
    id,
    marks,
    contentBlocks,
    parts: [],
  };
}

const runtime: SolutionValidationRuntime<TestQuestion, TestPart, TestSubpart> = {
  alphaLabel: (index) => String.fromCharCode(97 + index),
  contentBlockVisibility: solutionBlockVisibility,
  defaultSolutionSlotLines: (marks) => Math.ceil(marks * 3 + 2),
  graphHeight: () => 260,
  normalizeChoiceItems: (value) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []),
  normalizeTableBlock: (block) => block,
  orderedPartItems: (part) => [
    ...part.contentBlocks.map((block) => ({ kind: "block" as const, block })),
    ...part.subparts.map((subpart) => ({ kind: "subpart" as const, subpart })),
  ],
  orderedQuestionItems: (testQuestion) => [
    ...testQuestion.contentBlocks.map((block) => ({ kind: "block" as const, block })),
    ...testQuestion.parts.map((part) => ({ kind: "part" as const, part })),
  ],
  partScrollAnchor: (questionId, partId) => `q:${questionId}/p:${partId}`,
  plainTableRows: (table) => {
    const block = table as Extract<ContentBlock, { kind: "table" }>;
    return block.showHeader ? [block.headers, ...block.rows] : block.rows;
  },
  questionDisplayNumber: (questionIndex) => questionIndex + 1,
  questionScrollAnchor: (questionId) => `q:${questionId}`,
  romanLabel: (index) => ["i", "ii", "iii", "iv"][index] ?? String(index + 1),
  spaceLines: (value) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 3),
  subpartScrollAnchor: (questionId, partId, subpartId) => `q:${questionId}/p:${partId}/s:${subpartId}`,
  visibilityReplacementSlotAt,
  withGraphDefaults: (graphConfig) => graphConfig ?? ({ type: "graph2d" } as GraphConfig),
};

test("validateSolutionCompleteness accepts a paired answer space and solution", () => {
  const result = validateSolutionCompleteness(
    [question("q1", 2, [spaceBlock("space-1", 8), textBlock("solution-1", "$x=4$", "solution")])],
    runtime,
  );

  assert.equal(result.checkedItems, 1);
  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
  assert.deepEqual(result.issues, []);
  assert.equal(solutionValidationSummary(result), "1 marked item checked · all have student space and solutions");
});

test("validateSolutionCompleteness reports missing solution content", () => {
  const result = validateSolutionCompleteness([question("q1", 1, [spaceBlock("space-1", 5)])], runtime);

  assert.equal(result.errorCount, 1);
  assert.equal(result.issues[0]?.id, "Question 1:1:missing-solution");
  assert.deepEqual(result.issues[0]?.fix, { kind: "add-solution", afterBlockId: "space-1" });
});

test("validateSolutionCompleteness treats blank student tables as response surfaces", () => {
  const result = validateSolutionCompleteness(
    [question("q1", 2, [tableBlock("table-1", [["y", "", ""]], "student"), tableBlock("solution-table-1", [["y", "2", "5"]], "solution")])],
    runtime,
  );

  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
});
