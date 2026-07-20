import test from "node:test";
import assert from "node:assert/strict";
import type { ContentBlock } from "@mauth-studio/shared";

import {
  fallbackSolutionTableEntryMask,
  normalizeTableSolutionEntries,
  sharedTableHasBlankAnswerCells,
  sharedTableSolutionPresentation,
  tableBlockHasSharedSolutionEntries,
  tableSolutionEntryMask,
  tableSolutionEntryMasksForBlocks,
  tableSolutionEntryPatch,
} from "./tableSolutionEntries.ts";

function tableBlock(id: string, rows: string[][], visibility?: "always" | "student" | "solution"): ContentBlock {
  return {
    id,
    kind: "table",
    headers: [],
    rows,
    showHeader: false,
    ...(visibility ? { visibility } : {}),
    ...(visibility === "student" ? { studentOnly: true } : {}),
    ...(visibility === "solution" ? { solutionOnly: true } : {}),
  };
}

test("tableSolutionEntryMask marks filled solution cells where the student table is blank", () => {
  const student = tableBlock("student-table", [
    ["x", "0", "1"],
    ["y", "", ""],
  ]);
  const solution = tableBlock("solution-table", [
    ["x", "0", "1"],
    ["y", "6", "4"],
  ]);

  assert.deepEqual(tableSolutionEntryMask(student, solution), [
    [false, false, false],
    [false, true, true],
  ]);
});

test("fallbackSolutionTableEntryMask marks non-heading answer cells on standalone solution tables", () => {
  const solution = tableBlock(
    "solution-table",
    [
      ["x", "0", "1"],
      ["y", "6", "4"],
    ],
    "solution",
  );

  assert.deepEqual(fallbackSolutionTableEntryMask(solution as Extract<ContentBlock, { kind: "table" }>), [
    [false, true, true],
    [false, true, true],
  ]);
});

test("tableSolutionEntryMasksForBlocks follows student-solution replacement slots", () => {
  const blocks = [
    tableBlock(
      "student-table",
      [
        ["x", "0", "1"],
        ["y", "", ""],
      ],
      "student",
    ),
    tableBlock(
      "solution-table",
      [
        ["x", "0", "1"],
        ["y", "6", "4"],
      ],
      "solution",
    ),
  ];

  assert.deepEqual(tableSolutionEntryMasksForBlocks(blocks), {
    "solution-table": [
      [false, false, false],
      [false, true, true],
    ],
  });
});

test("shared table solution entries are sparse, body-only, and never replace given cells", () => {
  assert.deepEqual(
    normalizeTableSolutionEntries(
      [
        ["answer over given", "6", "4"],
        ["", "9"],
      ],
      [
        ["y", "", ""],
        ["z", "", "3"],
      ],
    ),
    [
      ["", "6", "4"],
      ["", "9", ""],
    ],
  );
});

test("shared table presentation hides answers from students and substitutes only answer cells in solutions", () => {
  const block = {
    ...tableBlock("shared-table", [
      ["y", "", ""],
      ["z", "", "3"],
    ]),
    solutionEntries: [
      ["", "6", "4"],
      ["", "9", "ignored"],
    ],
  } as Extract<ContentBlock, { kind: "table" }>;

  const student = sharedTableSolutionPresentation(block, false);
  assert.deepEqual(student.rows, [
    ["y", "", ""],
    ["z", "", "3"],
  ]);
  assert.deepEqual(student.solutionEntryMask, [
    [false, false, false],
    [false, false, false],
  ]);
  const solutions = sharedTableSolutionPresentation(block, true);
  assert.deepEqual(solutions.rows, [
    ["y", "6", "4"],
    ["z", "9", "3"],
  ]);
  assert.deepEqual(solutions.solutionEntryMask, [
    [false, true, true],
    [false, true, false],
  ]);
  assert.equal(tableBlockHasSharedSolutionEntries(block), true);
  assert.equal(sharedTableHasBlankAnswerCells(block), false);
});

test("tableSolutionEntryPatch sets and clears a shared answer and removes stale ticks with the final answer", () => {
  const block = {
    ...tableBlock("shared-table", [["y", ""]]),
    markTicks: 1,
  } as Extract<ContentBlock, { kind: "table" }>;
  const answerPatch = tableSolutionEntryPatch(block, 0, 1, "6");
  assert.deepEqual(answerPatch, { solutionEntries: [["", "6"]] });

  const answered = { ...block, ...answerPatch };
  assert.deepEqual(tableSolutionEntryPatch(answered, 0, 1, null), {
    solutionEntries: undefined,
    markTicks: undefined,
  });
  assert.deepEqual(tableSolutionEntryPatch(block, 0, 0, "not allowed"), {});
});
