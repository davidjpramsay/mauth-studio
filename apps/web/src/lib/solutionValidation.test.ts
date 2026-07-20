import assert from "node:assert/strict";
import test from "node:test";
import type { ContentBlock, ContentBlockVisibility, GraphConfig } from "@mauth-studio/shared";

import {
  solutionMarkAllocationForBlocks,
  solutionScopeValidationStatus,
  solutionTextMarkTotal,
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

function tableBlock(id: string, rows: string[][], visibility?: ContentBlockVisibility, markTicks?: number): ContentBlock {
  return {
    id,
    kind: "table",
    headers: ["x", "0", "1"],
    rows,
    showHeader: true,
    ...(visibility ? { visibility } : {}),
    ...(markTicks !== undefined ? { markTicks } : {}),
  };
}

function choicesBlock(id: string, visibility?: ContentBlockVisibility, solutionAnswerIndex?: number, markTicks?: number): ContentBlock {
  return {
    id,
    kind: "choices",
    choices: ["A", "B", "C"],
    visibility,
    ...(solutionAnswerIndex !== undefined ? { solutionAnswerIndex } : {}),
    ...(markTicks !== undefined ? { markTicks } : {}),
  };
}

function diagramBlock(id: string, graphConfig: GraphConfig, visibility?: ContentBlockVisibility, markTicks?: number): ContentBlock {
  return {
    id,
    kind: "diagram",
    graphConfig,
    ...(visibility ? { visibility } : {}),
    ...(markTicks !== undefined ? { markTicks } : {}),
  };
}

function columnsBlock(id: string, columns: ContentBlock[][], visibility?: ContentBlockVisibility): ContentBlock {
  return { id, kind: "columns", columnCount: columns.length as 2 | 3 | 4, columns, ...(visibility ? { visibility } : {}) };
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
    [question("q1", 2, [spaceBlock("space-1", 8), textBlock("solution-1", "$x=4$ [[marks:2]]", "solution")])],
    runtime,
  );

  assert.equal(result.checkedItems, 1);
  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
  assert.deepEqual(result.issues, []);
  assert.equal(solutionValidationSummary(result), "1 marked item checked · all have student space, solutions, and matching ticks");
});

test("validateSolutionCompleteness reports missing solution content", () => {
  const result = validateSolutionCompleteness([question("q1", 1, [spaceBlock("space-1", 5)])], runtime);

  assert.equal(result.errorCount, 1);
  assert.equal(result.issues[0]?.id, "Question 1:1:missing-solution");
  assert.deepEqual(result.issues[0]?.fix, { kind: "add-solution", afterBlockId: "space-1" });
});

test("validateSolutionCompleteness keeps an empty worked-solution slot unfinished", () => {
  const result = validateSolutionCompleteness(
    [question("q1", 1, [spaceBlock("space-1", 5), textBlock("solution-1", "\n", "solution")])],
    runtime,
  );

  assert.equal(result.errorCount, 1);
  assert.equal(result.issues[0]?.id, "Question 1:1:blank-solution-text-0");
  assert.match(result.issues[0]?.message ?? "", /still blank/);
});

test("validateSolutionCompleteness treats blank student tables as response surfaces", () => {
  const result = validateSolutionCompleteness(
    [
      question("q1", 2, [
        tableBlock("table-1", [["y", "", ""]], "student"),
        tableBlock("solution-table-1", [["y", "2", "5"]], "solution", 2),
      ]),
    ],
    runtime,
  );

  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
});

test("validateSolutionCompleteness warns when answer cells remain blank in the solution table", () => {
  const result = validateSolutionCompleteness(
    [
      question("q1", 2, [
        tableBlock("table-1", [["y", "", ""]], "student"),
        tableBlock("solution-table-1", [["y", "2", ""]], "solution", 2),
      ]),
    ],
    runtime,
  );

  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 1);
  assert.equal(result.issues[0]?.id, "Question 1:2:blank-solution-table-0-0");
});

test("shared tables use in-place solution entries without a duplicate block", () => {
  const completeBlock = {
    ...tableBlock("table", [["y", "", ""]], undefined, 2),
    solutionEntries: [["", "2", "5"]],
  } as Extract<ContentBlock, { kind: "table" }>;
  const complete = validateSolutionCompleteness([question("q1", 2, [completeBlock])], runtime);
  assert.equal(complete.errorCount, 0);
  assert.equal(complete.warningCount, 0);
  assert.deepEqual(solutionMarkAllocationForBlocks([completeBlock], runtime), {
    textTicks: 0,
    surfaceTicks: 2,
    total: 2,
  });

  const partialBlock = {
    ...completeBlock,
    solutionEntries: [["", "2", ""]],
  };
  const partial = validateSolutionCompleteness([question("q1", 2, [partialBlock])], runtime);
  assert.equal(partial.errorCount, 0);
  assert.equal(partial.warningCount, 1);
  assert.equal(partial.issues[0]?.id, "Question 1:2:blank-shared-solution-table-0");

  const unanswered = validateSolutionCompleteness([question("q1", 2, [tableBlock("table", [["y", "", ""]])])], runtime);
  assert.equal(unanswered.errorCount, 1);
  assert.equal(unanswered.issues[0]?.id, "Question 1:2:missing-solution");
});

test("validateSolutionCompleteness warns when a solution choice surface has no circled answer", () => {
  const result = validateSolutionCompleteness(
    [question("q1", 1, [choicesBlock("student-choices", "student"), choicesBlock("solution-choices", "solution")])],
    runtime,
  );

  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 1);
  assert.equal(result.issues[0]?.id, "Question 1:1:choice-answer-0");

  const answered = validateSolutionCompleteness(
    [question("q1", 1, [choicesBlock("student-choices", "student"), choicesBlock("solution-choices", "solution", 1, 1)])],
    runtime,
  );
  assert.equal(answered.warningCount, 0);
});

test("shared choice lists use an in-place solution answer without a duplicate block", () => {
  const unanswered = validateSolutionCompleteness([question("q1", 1, [choicesBlock("choices")])], runtime);

  assert.equal(unanswered.errorCount, 0);
  assert.equal(unanswered.warningCount, 1);
  assert.equal(unanswered.issues[0]?.id, "Question 1:1:choice-answer-0");
  assert.match(unanswered.issues[0]?.message ?? "", /no circled solution answer/);

  const blocks = [choicesBlock("choices", undefined, 1, 1)];
  const answered = validateSolutionCompleteness([question("q1", 1, blocks)], runtime);
  assert.equal(answered.errorCount, 0);
  assert.equal(answered.warningCount, 0);
  assert.deepEqual(solutionMarkAllocationForBlocks(blocks, runtime), {
    textTicks: 0,
    surfaceTicks: 1,
    total: 1,
  });
});

test("shared choice ticks do not count until a valid solution answer is selected", () => {
  const blocks = [choicesBlock("choices", undefined, undefined, 1)];

  assert.deepEqual(solutionMarkAllocationForBlocks(blocks, runtime), {
    textTicks: 0,
    surfaceTicks: 0,
    total: 0,
  });
});

test("solutionScopeValidationStatus reports leaf fixes and parent aggregates", () => {
  const result = validateSolutionCompleteness(
    [
      {
        ...question("q1", 0, []),
        parts: [
          {
            id: "p1",
            marks: 2,
            contentBlocks: [spaceBlock("space-1", 5)],
            subparts: [],
          },
        ],
      },
    ],
    runtime,
  );

  const leaf = solutionScopeValidationStatus({ result, anchor: "q:q1/p:p1", marked: true });
  assert.equal(leaf?.tone, "error");
  assert.equal(leaf?.issueCount, 1);
  assert.deepEqual(leaf?.primaryIssue?.fix, { kind: "add-solution", afterBlockId: "space-1" });

  const parent = solutionScopeValidationStatus({
    result,
    anchor: "q:q1",
    marked: true,
    includeDescendants: true,
  });
  assert.equal(parent?.tone, "error");
  assert.equal(parent?.primaryIssue?.anchor, "q:q1/p:p1");
});

test("solutionScopeValidationStatus distinguishes ready and unmarked scopes", () => {
  const result = validateSolutionCompleteness(
    [question("q1", 2, [spaceBlock("space-1", 8), textBlock("solution-1", "$x=4$ [[marks:2]]", "solution")])],
    runtime,
  );

  assert.deepEqual(solutionScopeValidationStatus({ result, anchor: "q:q1", marked: true }), {
    tone: "ready",
    issueCount: 0,
    errorCount: 0,
    warningCount: 0,
  });
  assert.equal(solutionScopeValidationStatus({ result, anchor: "q:q1", marked: false }), null);
});

test("solutionTextMarkTotal sums every hidden mark annotation", () => {
  assert.equal(solutionTextMarkTotal("First [[marks:1]]\nSecond [[marks:2]]"), 3);
  assert.equal(solutionTextMarkTotal("No marks"), 0);
});

test("solutionMarkAllocationForBlocks counts text and surface ticks recursively", () => {
  const blocks = [
    columnsBlock("columns-1", [
      [spaceBlock("space-1", 5), textBlock("solution-text", "Working [[marks:1]]", "solution")],
      [tableBlock("student-table", [["y", "", ""]], "student"), tableBlock("solution-table", [["y", "2", "5"]], "solution", 2)],
    ]),
  ];

  assert.deepEqual(solutionMarkAllocationForBlocks(blocks, runtime), {
    textTicks: 1,
    surfaceTicks: 2,
    total: 3,
  });
});

test("validateSolutionCompleteness reports a scoped solution mark mismatch", () => {
  const result = validateSolutionCompleteness(
    [question("q1", 2, [spaceBlock("space-1", 8), textBlock("solution-1", "$x=4$ [[marks:1]]", "solution")])],
    runtime,
  );

  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 1);
  assert.equal(result.issues[0]?.id, "Question 1:2:mark-total");
  assert.match(result.issues[0]?.message ?? "", /ticks total 1/);
});

test("validateSolutionCompleteness accepts paired solution content inside shared columns", () => {
  const result = validateSolutionCompleteness(
    [
      question("q1", 1, [
        columnsBlock("columns-1", [[spaceBlock("space-1", 5), textBlock("solution-1", "$x=4$ [[marks:1]]", "solution")], []]),
      ]),
    ],
    runtime,
  );

  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
});

test("solution mark allocation inherits a solution-only columns layer", () => {
  const blocks = [columnsBlock("solution-columns", [[textBlock("answer-1", "Answer [[marks:2]]")], []], "solution")];

  assert.deepEqual(solutionMarkAllocationForBlocks(blocks, runtime), {
    textTicks: 2,
    surfaceTicks: 0,
    total: 2,
  });
});

test("paired solution-only columns do not report nested solution children as floating", () => {
  const result = validateSolutionCompleteness(
    [
      question("q1", 1, [
        columnsBlock("student-columns", [[spaceBlock("space-1", 4)], []], "student"),
        columnsBlock("solution-columns", [[textBlock("solution-1", "Answer [[marks:1]]", "solution")], []], "solution"),
      ]),
    ],
    runtime,
  );

  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
});

test("shared solution-only graph annotations count as a response, solution, and marked surface", () => {
  const blocks = [
    diagramBlock(
      "graph-1",
      {
        type: "graph2d",
        functions: [{ id: "f", expression: "x^2" }],
        features: [{ id: "answer", kind: "point", x: 2, y: 4, label: "(2,4)", solutionOnly: true }],
      },
      undefined,
      2,
    ),
  ];
  const result = validateSolutionCompleteness([question("q1", 2, blocks)], runtime);

  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
  assert.deepEqual(solutionMarkAllocationForBlocks(blocks, runtime), { textTicks: 0, surfaceTicks: 2, total: 2 });
});

test("an untouched paired solution diagram remains incomplete", () => {
  const graphConfig: GraphConfig = {
    type: "graph2d",
    widthPx: 500,
    heightPx: 300,
    functions: [{ id: "f", expression: "x^2" }],
  };
  const result = validateSolutionCompleteness(
    [
      question("q1", 2, [
        diagramBlock("student-graph", graphConfig, "student"),
        diagramBlock("solution-graph", { ...graphConfig, widthPx: 700, showGrid: false }, "solution", 2),
      ]),
    ],
    runtime,
  );

  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 1);
  assert.equal(result.issues[0]?.id, "Question 1:2:unchanged-solution-diagram-0-0");
  assert.match(result.issues[0]?.message ?? "", /still matches the student diagram/);
});

test("a mathematically completed paired solution diagram validates", () => {
  const studentConfig: GraphConfig = { type: "graph2d", functions: [], features: [] };
  const result = validateSolutionCompleteness(
    [
      question("q1", 2, [
        diagramBlock("student-graph", studentConfig, "student"),
        diagramBlock(
          "solution-graph",
          {
            ...studentConfig,
            functions: [{ id: "answer", expression: "(x-2)^2-1" }],
            features: [{ id: "vertex", kind: "point", x: 2, y: -1, solutionOnly: true }],
          },
          "solution",
          2,
        ),
      ]),
    ],
    runtime,
  );

  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
});
