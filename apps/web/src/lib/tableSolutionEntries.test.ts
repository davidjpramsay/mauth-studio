import test from "node:test";
import assert from "node:assert/strict";
import type { ContentBlock } from "@mauth-studio/shared";

import { fallbackSolutionTableEntryMask, tableSolutionEntryMask, tableSolutionEntryMasksForBlocks } from "./tableSolutionEntries.ts";

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
