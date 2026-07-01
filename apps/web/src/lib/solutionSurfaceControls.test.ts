import assert from "node:assert/strict";
import test from "node:test";
import type { ContentBlock } from "@mauth-studio/shared";

import {
  SOLUTION_SURFACE_COPY_DISABLED_TITLE,
  SOLUTION_SURFACE_COPY_ENABLED_TITLE,
  solutionSurfaceControlState,
} from "./solutionSurfaceControls.ts";

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

test("solutionSurfaceControlState enables solution copies for student editable surfaces", () => {
  const state = solutionSurfaceControlState(tableBlock("table-1"));

  assert.equal(state.visibility, "always");
  assert.equal(state.canCreateSolutionCopy, true);
  assert.equal(state.copyTitle, SOLUTION_SURFACE_COPY_ENABLED_TITLE);
  assert.equal(state.supportsSurfaceTicks, true);
  assert.equal(state.tickLabel, "Surface ticks");
});

test("solutionSurfaceControlState disables solution copies once a block is solution-only", () => {
  const state = solutionSurfaceControlState(tableBlock("solution-table-1", "solution", 3));

  assert.equal(state.visibility, "solution");
  assert.equal(state.canCreateSolutionCopy, false);
  assert.equal(state.copyTitle, SOLUTION_SURFACE_COPY_DISABLED_TITLE);
  assert.equal(state.markTicks, 3);
});

test("solutionSurfaceControlState keeps worked text ticks line-based by default", () => {
  const state = solutionSurfaceControlState(textBlock("solution-text-1", "solution"));

  assert.equal(state.supportsSurfaceTicks, false);
  assert.equal(state.tickLabel, "Block ticks");
  assert.match(state.tickHelp, /\[\[marks:1\]\]/);
});
