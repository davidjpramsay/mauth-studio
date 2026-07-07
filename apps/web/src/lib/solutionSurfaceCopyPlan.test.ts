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
