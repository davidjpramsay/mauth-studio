import assert from "node:assert/strict";
import test from "node:test";
import type { ContentBlock, ContentBlockVisibility, GraphConfig } from "@mauth-studio/shared";

import {
  isContentBlockVisibleInScope,
  recoverMissingSolutionSurfaceTicks,
  solutionBlockVisibility,
  visibilityReplacementSlotAt,
} from "./solutionBlockVisibility.ts";

function textBlock(id: string, text = "Working", visibility?: ContentBlockVisibility): ContentBlock {
  return { id, kind: "text", text, ...(visibility ? { visibility } : {}) };
}

function spaceBlock(id: string, visibility: ContentBlockVisibility = "student"): ContentBlock {
  return { id, kind: "space", lines: 6, showLines: false, visibility };
}

function tableBlock(id: string, visibility?: ContentBlockVisibility, markTicks?: number): ContentBlock {
  return {
    id,
    kind: "table",
    headers: ["x", "0", "1"],
    rows: [["y", "", ""]],
    ...(visibility ? { visibility } : {}),
    ...(typeof markTicks === "number" ? { markTicks } : {}),
  };
}

function diagramBlock(id: string, visibility?: ContentBlockVisibility, markTicks?: number): ContentBlock {
  return {
    id,
    kind: "diagram",
    graphConfig: { type: "graph2d" } as GraphConfig,
    ...(visibility ? { visibility } : {}),
    ...(typeof markTicks === "number" ? { markTicks } : {}),
  };
}

test("solutionBlockVisibility preserves explicit and legacy solution visibility", () => {
  assert.equal(solutionBlockVisibility(textBlock("solution-legacy")), "solution");
  assert.equal(solutionBlockVisibility({ ...textBlock("solution-opt-out"), solutionOnly: false }), "always");
  assert.equal(solutionBlockVisibility(textBlock("student-text", "Answer here", "student")), "student");
  assert.equal(solutionBlockVisibility({ ...textBlock("legacy-student"), studentOnly: true }), "student");
});

test("visibilityReplacementSlotAt pairs student spaces with following solution blocks", () => {
  const blocks = [spaceBlock("student-space"), textBlock("solution-text", "$x=4$", "solution"), diagramBlock("solution-graph", "solution")];
  const slot = visibilityReplacementSlotAt(blocks, 0);

  assert.equal(slot?.studentBlock.id, "student-space");
  assert.deepEqual(
    slot?.solutionBlocks.map((block) => block.id),
    ["solution-text", "solution-graph"],
  );
  assert.equal(slot?.endIndex, 2);
});

test("visibilityReplacementSlotAt pairs solution-first surfaces with following student surface", () => {
  const blocks = [tableBlock("solution-table", "solution"), tableBlock("student-table", "student")];
  const slot = visibilityReplacementSlotAt(blocks, 0);

  assert.equal(slot?.studentBlock.id, "student-table");
  assert.deepEqual(
    slot?.solutionBlocks.map((block) => block.id),
    ["solution-table"],
  );
  assert.equal(slot?.endIndex, 1);
});

test("visibilityReplacementSlotAt rejects incompatible replacement surfaces", () => {
  const blocks = [textBlock("solution-text", "$x=4$", "solution"), tableBlock("student-table", "student")];

  assert.equal(visibilityReplacementSlotAt(blocks, 0), null);
});

test("isContentBlockVisibleInScope keeps unpaired student answer space visible in solution mode", () => {
  const blocks = [spaceBlock("student-space")];

  assert.equal(isContentBlockVisibleInScope(blocks, 0, true), true);
  assert.equal(isContentBlockVisibleInScope(blocks, 0, false), true);
});

test("recoverMissingSolutionSurfaceTicks fills exactly one solution surface from marks", () => {
  const blocks = [tableBlock("student-table", "student"), tableBlock("solution-table", "solution")];
  const result = recoverMissingSolutionSurfaceTicks(blocks, 3);

  assert.equal((result[1] as Extract<ContentBlock, { kind: "table" }>).markTicks, 3);
});

test("recoverMissingSolutionSurfaceTicks does not guess when text marks or multiple surfaces exist", () => {
  const textMarked = recoverMissingSolutionSurfaceTicks(
    [tableBlock("solution-table", "solution"), textBlock("solution-text", "Answer [[marks:1]]", "solution")],
    2,
  );
  assert.equal((textMarked[0] as Extract<ContentBlock, { kind: "table" }>).markTicks, undefined);

  const multipleSurfaces = recoverMissingSolutionSurfaceTicks(
    [tableBlock("solution-table", "solution"), diagramBlock("solution-diagram", "solution")],
    2,
  );
  assert.equal((multipleSurfaces[0] as Extract<ContentBlock, { kind: "table" }>).markTicks, undefined);
  assert.equal((multipleSurfaces[1] as Extract<ContentBlock, { kind: "diagram" }>).markTicks, undefined);
});
