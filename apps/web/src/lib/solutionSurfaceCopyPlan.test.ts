import assert from "node:assert/strict";
import test from "node:test";
import type { ContentBlock } from "@mauth-studio/shared";

import type { SelectedEditorBlock } from "./editorBlockSelection.ts";
import { studentSurfaceBlockPatch } from "./editorDocumentDuplication.ts";
import type { QuestionBlock } from "./editorDocumentNormalization.ts";
import { solutionSurfaceCopyPlan } from "./solutionSurfaceCopyPlan.ts";

function textBlock(id: string, visibility?: ContentBlock["visibility"]): ContentBlock {
  return { id, kind: "text", text: "Working", ...(visibility ? { visibility } : {}) };
}

function columnsBlock(id: string, columns: ContentBlock[][]): ContentBlock {
  return { id, kind: "columns", columnCount: columns.length, columns };
}

function tableBlock(id: string, visibility?: ContentBlock["visibility"]): ContentBlock {
  return { id, kind: "table", headers: ["x", "0"], rows: [["y", ""]], ...(visibility ? { visibility } : {}) };
}

function question(contentBlocks: ContentBlock[]): QuestionBlock {
  return {
    id: "q1",
    text: "",
    marks: 1,
    contentBlocks,
    parts: [],
    itemOrder: contentBlocks.map((block) => ({ kind: "block", id: block.id })),
  };
}

test("solutionSurfaceCopyPlan creates paired actions for a selected question block", () => {
  const studentBlock = textBlock("student-text");
  const solutionBlock = textBlock("solution-text", "solution");
  const selection: SelectedEditorBlock = {
    scope: { kind: "question", questionId: "q1" },
    block: studentBlock,
    label: "Text block 1",
    summary: "Working",
  };

  const plan = solutionSurfaceCopyPlan({
    questions: [question([studentBlock])],
    selection,
    solutionSurfaceContentBlock: () => solutionBlock,
    solutionSurfaceColumnBlockCopyAtPath: () => null,
  });

  assert.deepEqual(plan, {
    actions: [
      {
        type: "module.update",
        scope: { kind: "question", questionId: "q1" },
        blockId: "student-text",
        patch: studentSurfaceBlockPatch(),
      },
      {
        type: "module.add",
        scope: { kind: "question", questionId: "q1" },
        blocks: [solutionBlock],
        placement: { blockId: "student-text", position: "after" },
      },
    ],
    selectAnchor: "q:q1/b:solution-text",
  });
});

test("solutionSurfaceCopyPlan reopens an existing paired solution instead of duplicating it", () => {
  const studentBlock = textBlock("student-text", "student");
  const solutionBlock = textBlock("solution-text", "solution");
  const selection: SelectedEditorBlock = {
    scope: { kind: "question", questionId: "q1" },
    block: studentBlock,
    label: "Text block 1",
    summary: "Working",
  };

  const plan = solutionSurfaceCopyPlan({
    questions: [question([studentBlock, solutionBlock])],
    selection,
    solutionSurfaceContentBlock: () => {
      throw new Error("An existing solution must be reused.");
    },
    solutionSurfaceColumnBlockCopyAtPath: () => null,
  });

  assert.deepEqual(plan, {
    actions: [],
    selectAnchor: "q:q1/b:solution-text",
  });
});

test("solutionSurfaceCopyPlan opens a shared table in place instead of duplicating it", () => {
  const table = tableBlock("shared-table");
  const selection: SelectedEditorBlock = {
    scope: { kind: "question", questionId: "q1" },
    block: table,
    label: "Table block 1",
    summary: "Table",
  };

  const plan = solutionSurfaceCopyPlan({
    questions: [question([table])],
    selection,
    solutionSurfaceContentBlock: () => {
      throw new Error("A shared table must not be duplicated.");
    },
    solutionSurfaceColumnBlockCopyAtPath: () => null,
  });

  assert.deepEqual(plan, { actions: [], selectAnchor: "q:q1/b:shared-table" });
});

test("solutionSurfaceCopyPlan updates nested columns and selects the new solution child", () => {
  const studentBlock = textBlock("student-text");
  const solutionBlock = textBlock("solution-text", "solution");
  const rootBlock = columnsBlock("columns", [[studentBlock]]);
  const nextRootBlock = columnsBlock("columns", [[{ ...studentBlock, visibility: "student" }, solutionBlock]]);
  const selection: SelectedEditorBlock = {
    scope: {
      kind: "column",
      rootScope: { kind: "question", questionId: "q1" },
      rootBlockId: "columns",
      path: [{ columnIndex: 0, blockId: "student-text" }],
    },
    block: studentBlock,
    label: "Column 1 text block 1",
    summary: "Working",
  };

  const plan = solutionSurfaceCopyPlan({
    questions: [question([rootBlock])],
    selection,
    solutionSurfaceContentBlock: () => null,
    solutionSurfaceColumnBlockCopyAtPath: () => ({
      rootBlock: nextRootBlock,
      solutionPath: [{ columnIndex: 0, blockId: "solution-text" }],
    }),
  });

  assert.deepEqual(plan, {
    actions: [
      {
        type: "module.update",
        scope: { kind: "question", questionId: "q1" },
        blockId: "columns",
        patch: {
          columnCount: 1,
          columns: nextRootBlock.columns,
          visibility: "always",
          solutionOnly: false,
          studentOnly: false,
          markTicks: undefined,
        },
      },
    ],
    selectAnchor: "q:q1/b:columns/c:0/b:solution-text",
  });
});

test("solutionSurfaceCopyPlan reopens an existing solution inside columns", () => {
  const studentBlock = textBlock("student-text", "student");
  const solutionBlock = textBlock("solution-text", "solution");
  const rootBlock = columnsBlock("columns", [[studentBlock, solutionBlock]]);
  const selection: SelectedEditorBlock = {
    scope: {
      kind: "column",
      rootScope: { kind: "question", questionId: "q1" },
      rootBlockId: "columns",
      path: [{ columnIndex: 0, blockId: "student-text" }],
    },
    block: studentBlock,
    label: "Column 1 text block 1",
    summary: "Working",
  };

  const plan = solutionSurfaceCopyPlan({
    questions: [question([rootBlock])],
    selection,
    solutionSurfaceContentBlock: () => null,
    solutionSurfaceColumnBlockCopyAtPath: () => {
      throw new Error("An existing nested solution must be reused.");
    },
  });

  assert.deepEqual(plan, {
    actions: [],
    selectAnchor: "q:q1/b:columns/c:0/b:solution-text",
  });
});

test("solutionSurfaceCopyPlan opens a shared nested table at the same column path", () => {
  const table = tableBlock("shared-table");
  const rootBlock = columnsBlock("columns", [[table]]);
  const selection: SelectedEditorBlock = {
    scope: {
      kind: "column",
      rootScope: { kind: "question", questionId: "q1" },
      rootBlockId: "columns",
      path: [{ columnIndex: 0, blockId: "shared-table" }],
    },
    block: table,
    label: "Column 1 table 1",
    summary: "Table",
  };

  const plan = solutionSurfaceCopyPlan({
    questions: [question([rootBlock])],
    selection,
    solutionSurfaceContentBlock: () => null,
    solutionSurfaceColumnBlockCopyAtPath: () => {
      throw new Error("A shared nested table must not be duplicated.");
    },
  });

  assert.deepEqual(plan, { actions: [], selectAnchor: "q:q1/b:columns/c:0/b:shared-table" });
});

test("solutionSurfaceCopyPlan ignores blocks that are already solution-only", () => {
  const solutionBlock = textBlock("solution-text", "solution");
  const selection: SelectedEditorBlock = {
    scope: { kind: "question", questionId: "q1" },
    block: solutionBlock,
    label: "Text block 1",
    summary: "Working",
  };

  const plan = solutionSurfaceCopyPlan({
    questions: [question([solutionBlock])],
    selection,
    solutionSurfaceContentBlock: () => textBlock("new-solution", "solution"),
    solutionSurfaceColumnBlockCopyAtPath: () => null,
  });

  assert.equal(plan, null);
});
