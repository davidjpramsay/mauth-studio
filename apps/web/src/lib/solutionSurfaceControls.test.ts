import assert from "node:assert/strict";
import test from "node:test";
import type { ContentBlock } from "@mauth-studio/shared";

import {
  SOLUTION_SURFACE_COPY_DISABLED_TITLE,
  SOLUTION_SURFACE_COPY_ENABLED_TITLE,
  SOLUTION_TABLE_EDIT_ENABLED_TITLE,
  solutionSurfaceControlState,
} from "./solutionSurfaceControls.ts";
import {
  choiceListLabel,
  choiceSolutionAnswerIndexForPreview,
  choiceSolutionAnswerOptions,
  normalizeChoiceSolutionAnswerIndex,
  withChoiceSolutionAnswer,
} from "./choiceSolutionAnswers.ts";
import { contentBlockVisibilityPatch } from "./moduleSettingsPatches.ts";

function textBlock(id: string, visibility?: ContentBlock["visibility"]): ContentBlock {
  return { id, kind: "text", text: "Work", ...(visibility ? { visibility } : {}) };
}

function tableBlock(id: string, visibility?: ContentBlock["visibility"], markTicks?: number): ContentBlock {
  return {
    id,
    kind: "table",
    headers: ["x", "0"],
    rows: [["y", ""]],
    showHeader: true,
    ...(visibility ? { visibility } : {}),
    ...(markTicks !== undefined ? { markTicks } : {}),
  };
}

function diagramBlock(id: string, visibility?: ContentBlock["visibility"], solutionAnnotation = false, markTicks?: number): ContentBlock {
  return {
    id,
    kind: "diagram",
    graphConfig: {
      type: "graph2d",
      features: [{ kind: "point", x: 1, y: 1, ...(solutionAnnotation ? { solutionOnly: true } : {}) }],
    },
    ...(visibility ? { visibility } : {}),
    ...(markTicks !== undefined ? { markTicks } : {}),
  };
}

test("solutionSurfaceControlState enables solution copies for student editable surfaces", () => {
  const state = solutionSurfaceControlState(tableBlock("table-1"));

  assert.equal(state.visibility, "always");
  assert.equal(state.canCreateSolutionCopy, true);
  assert.equal(state.copyTitle, SOLUTION_TABLE_EDIT_ENABLED_TITLE);
  assert.equal(state.supportsSurfaceTicks, true);
  assert.equal(state.tickLabel, "Surface ticks");
});

test("solutionSurfaceControlState enables editable solution copies for diagrams", () => {
  const state = solutionSurfaceControlState(diagramBlock("diagram-1"));

  assert.equal(state.visibility, "always");
  assert.equal(state.canCreateSolutionCopy, true);
  assert.equal(state.copyTitle, SOLUTION_SURFACE_COPY_ENABLED_TITLE);
  assert.equal(state.supportsSurfaceTicks, true);
  assert.equal(state.showSurfaceTicks, false);
});

test("solutionSurfaceControlState exposes ticks for shared diagrams with solution annotations", () => {
  const state = solutionSurfaceControlState(diagramBlock("diagram-1", undefined, true, 2), true);

  assert.equal(state.visibility, "always");
  assert.equal(state.showSurfaceTicks, true);
  assert.equal(state.markTicks, 2);
});

test("solutionSurfaceControlState disables solution copies once a block is solution-only", () => {
  const state = solutionSurfaceControlState(tableBlock("solution-table-1", "solution", 3), true);

  assert.equal(state.visibility, "solution");
  assert.equal(state.canCreateSolutionCopy, false);
  assert.equal(state.copyTitle, SOLUTION_SURFACE_COPY_DISABLED_TITLE);
  assert.equal(state.markTicks, 3);
  assert.equal(state.showSurfaceTicks, true);
});

test("solutionSurfaceControlState keeps worked text ticks line-based by default", () => {
  const state = solutionSurfaceControlState(textBlock("solution-text-1", "solution"));

  assert.equal(state.supportsSurfaceTicks, false);
  assert.equal(state.tickLabel, "Block ticks");
  assert.match(state.tickHelp, /\[\[marks:1\]\]/);
});

test("choice solution helpers normalize, label, set, and clear circled answers", () => {
  const block: Extract<ContentBlock, { kind: "choices" }> = {
    id: "solution-choices",
    kind: "choices",
    choices: ["A", "B", "C"],
    numberingStyle: "upper-alpha",
    visibility: "solution",
  };

  assert.equal(choiceListLabel(block.numberingStyle, 1), "B.");
  assert.deepEqual(choiceSolutionAnswerOptions(block), [
    { value: 0, label: "A." },
    { value: 1, label: "B." },
    { value: 2, label: "C." },
  ]);
  assert.equal(normalizeChoiceSolutionAnswerIndex("2", block.choices.length), 2);
  assert.equal(normalizeChoiceSolutionAnswerIndex(3, block.choices.length), undefined);
  assert.equal(withChoiceSolutionAnswer(block, 1).solutionAnswerIndex, 1);
  assert.equal(withChoiceSolutionAnswer({ ...block, solutionAnswerIndex: 1 }, null).solutionAnswerIndex, undefined);
  assert.equal(choiceSolutionAnswerIndexForPreview({ ...block, solutionAnswerIndex: 1 }, false), undefined);
  assert.equal(choiceSolutionAnswerIndexForPreview({ ...block, solutionAnswerIndex: 1 }, true), 1);
});

test("shared choice answers keep their ticks except on the student-only layer", () => {
  const block: Extract<ContentBlock, { kind: "choices" }> = {
    id: "solution-choices",
    kind: "choices",
    choices: ["A", "B"],
    visibility: "solution",
    solutionAnswerIndex: 1,
    markTicks: 1,
  };

  assert.deepEqual(contentBlockVisibilityPatch(block, "always"), {
    visibility: "always",
    solutionOnly: false,
    studentOnly: false,
  });
  assert.deepEqual(contentBlockVisibilityPatch(block, "student"), {
    visibility: "student",
    solutionOnly: false,
    studentOnly: true,
    markTicks: undefined,
    solutionAnswerIndex: undefined,
  });
});

test("shared choice answers expose manual solution controls only in Solutions mode", () => {
  const block: Extract<ContentBlock, { kind: "choices" }> = {
    id: "choices",
    kind: "choices",
    choices: ["A", "B"],
    solutionAnswerIndex: 1,
    markTicks: 1,
  };

  const studentState = solutionSurfaceControlState(block, false);
  assert.equal(studentState.canCreateSolutionCopy, false);
  assert.equal(studentState.showSurfaceTicks, false);

  const solutionState = solutionSurfaceControlState(block, true);
  assert.equal(solutionState.canCreateSolutionCopy, false);
  assert.equal(solutionState.showSurfaceTicks, true);
  assert.equal(solutionState.markTicks, 1);
});

test("shared table answers expose ticks in Solutions mode and clear on the student-only layer", () => {
  const block = {
    ...tableBlock("table", undefined, 2),
    solutionEntries: [["", "6"]],
  } as Extract<ContentBlock, { kind: "table" }>;

  assert.equal(solutionSurfaceControlState(block, false).showSurfaceTicks, false);
  assert.equal(solutionSurfaceControlState(block, true).showSurfaceTicks, true);
  assert.deepEqual(contentBlockVisibilityPatch(block, "always"), {
    visibility: "always",
    solutionOnly: false,
    studentOnly: false,
  });
  assert.deepEqual(contentBlockVisibilityPatch(block, "student"), {
    visibility: "student",
    solutionOnly: false,
    studentOnly: true,
    markTicks: undefined,
    solutionEntries: undefined,
  });
});

test("shared diagram ticks survive the shared layer and clear on the student-only layer", () => {
  const block = diagramBlock("diagram-1", undefined, true, 2);

  assert.deepEqual(contentBlockVisibilityPatch(block, "always"), {
    visibility: "always",
    solutionOnly: false,
    studentOnly: false,
  });
  assert.deepEqual(contentBlockVisibilityPatch(block, "student"), {
    visibility: "student",
    solutionOnly: false,
    studentOnly: true,
    markTicks: undefined,
  });
});
