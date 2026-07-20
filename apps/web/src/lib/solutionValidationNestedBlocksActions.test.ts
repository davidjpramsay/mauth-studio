import assert from "node:assert/strict";
import test from "node:test";
import type { ContentBlock } from "@mauth-studio/shared";

import { insertBesideNestedContentBlock, nestedColumnsMutationPatch, updateNestedContentBlock } from "./solutionValidationNestedBlocks.ts";

function text(id: string, value: string): ContentBlock {
  return { id, kind: "text", text: value };
}

function columns(id: string, children: ContentBlock[][]): ContentBlock {
  return { id, kind: "columns", columnCount: children.length as 2 | 3 | 4, columns: children };
}

test("insertBesideNestedContentBlock inserts beside a deeply nested target without changing siblings", () => {
  const root = columns("root", [[text("left", "Left"), columns("nested", [[text("target", "Target")], []])], [text("right", "Right")]]);
  const inserted = text("solution", "Answer");
  const result = insertBesideNestedContentBlock([root], "target", inserted, "after");

  assert(result);
  assert.equal(result.targetBlock.id, "target");
  assert.deepEqual(
    result.rootBlock.columns[0][1]?.kind === "columns" ? result.rootBlock.columns[0][1].columns[0].map((block) => block.id) : [],
    ["target", "solution"],
  );
  assert.equal(result.rootBlock.columns[1][0]?.id, "right");
  assert.deepEqual(nestedColumnsMutationPatch(result).columnCount, 2);
});

test("updateNestedContentBlock updates the target while preserving the root identity", () => {
  const root = columns("root", [[{ id: "space", kind: "space", lines: 3, showLines: false }], []]);
  const result = updateNestedContentBlock([root], "space", (block) => (block.kind === "space" ? { ...block, lines: 8 } : null));

  assert(result);
  assert.equal(result.rootBlock.id, "root");
  assert.equal(result.rootBlock.columns[0][0]?.kind === "space" ? result.rootBlock.columns[0][0].lines : undefined, 8);
});

test("nested mutations reject top-level and missing targets", () => {
  const blocks = [text("top", "Top"), columns("root", [[text("child", "Child")], []])];

  assert.equal(insertBesideNestedContentBlock(blocks, "top", text("solution", "Answer"), "after"), null);
  assert.equal(
    updateNestedContentBlock(blocks, "missing", (block) => block),
    null,
  );
  assert.equal(
    updateNestedContentBlock(blocks, "child", () => null),
    null,
  );
});
