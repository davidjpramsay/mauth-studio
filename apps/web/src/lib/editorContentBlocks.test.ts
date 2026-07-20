import test from "node:test";
import assert from "node:assert/strict";
import type { GraphConfig } from "@mauth-studio/shared";

import { createEditorContentBlockFactory, contentBlockVisibilityFields } from "./editorContentBlocks.ts";
import { DEFAULT_SOLUTION_SLOT_TEXT, DEFAULT_SOLUTION_SPACE_SHOW_LINES } from "./solutionSlotDefaults.ts";

function testFactory() {
  let count = 0;
  const defaultGraphConfig: GraphConfig = { type: "graph2d", functions: [], features: [], metadata: {} };
  return createEditorContentBlockFactory({
    id: (prefix) => `${prefix}-${++count}`,
    defaultGraphConfig,
    withGraphDefaults: (graphConfig = defaultGraphConfig) => ({
      ...graphConfig,
      metadata: { ...(graphConfig.metadata ?? {}), defaulted: true },
    }),
    updateGraphConfig: (graphConfig, patch) => ({ ...graphConfig, ...patch }),
    diagramTypePatch: (type) => ({ type }),
  });
}

test("contentBlockVisibilityFields writes explicit visibility compatibility fields", () => {
  assert.deepEqual(contentBlockVisibilityFields(), {});
  assert.deepEqual(contentBlockVisibilityFields("solution"), { visibility: "solution", solutionOnly: true });
  assert.deepEqual(contentBlockVisibilityFields("student"), { visibility: "student", studentOnly: true });
  assert.deepEqual(contentBlockVisibilityFields("always"), { visibility: "always" });
});

test("editor content block factory creates student and solution blocks with stable prefixes", () => {
  const factory = testFactory();

  assert.deepEqual(factory.textBlock("Work", "solution"), {
    id: "solution-1",
    kind: "text",
    text: "Work",
    visibility: "solution",
    solutionOnly: true,
  });
  assert.equal(factory.tableBlock("solution").id, "solution-table-2");
  assert.equal(factory.spaceBlock(undefined, "student").studentOnly, true);
});

test("editor content block factory creates paired solution slots without ruled lines by default", () => {
  const factory = testFactory();
  const [studentSpace, solutionText] = factory.solutionSlotBlocks(7);

  assert.equal(studentSpace.kind, "space");
  assert.equal(studentSpace.kind === "space" ? studentSpace.lines : undefined, 7);
  assert.equal(studentSpace.kind === "space" ? studentSpace.showLines : undefined, DEFAULT_SOLUTION_SPACE_SHOW_LINES);
  assert.equal(studentSpace.visibility, "student");
  assert.equal(solutionText.kind, "text");
  assert.equal(solutionText.kind === "text" ? solutionText.text : undefined, DEFAULT_SOLUTION_SLOT_TEXT);
  assert.equal(solutionText.visibility, "solution");
});

test("editor content block factory applies graph defaults when changing diagram type", () => {
  const factory = testFactory();
  const diagram = factory.diagramBlockForType("statsChart", "solution");

  assert.equal(diagram.kind, "diagram");
  assert.equal(diagram.kind === "diagram" ? diagram.graphConfig.type : undefined, "statsChart");
  assert.equal(diagram.kind === "diagram" ? diagram.graphConfig.metadata?.defaulted : undefined, true);
  assert.equal(diagram.visibility, "solution");
});

test("contentBlockForKind respects solution-mode defaults", () => {
  const factory = testFactory();

  assert.equal(factory.contentBlockForKind("choices", "solution").visibility, "solution");
  assert.equal(factory.contentBlockForKind("space").visibility, "student");
  assert.equal(factory.contentBlockForKind("columns", "solution").id, "solution-columns-3");
});
