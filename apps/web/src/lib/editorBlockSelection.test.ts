import assert from "node:assert/strict";
import test from "node:test";

import { createEditorBlockSelectionRuntime } from "./editorBlockSelection.ts";
import type { EditorContentBlock, QuestionBlock } from "./editorDocumentNormalization.ts";
import { columnPathScrollAnchor, partBlockScrollAnchor, questionBlockScrollAnchor, subpartBlockScrollAnchor } from "./scrollAnchors.ts";

const runtime = createEditorBlockSelectionRuntime({
  tocBlockSummary: (block: EditorContentBlock) => {
    if (block.kind === "text") return block.text ?? "";
    if (block.kind === "space") return `${block.lines} lines`;
    return block.kind;
  },
});

const questions: QuestionBlock[] = [
  {
    id: "q1",
    section: "",
    marks: 4,
    contentBlocks: [
      { id: "break-1", kind: "pageBreak" },
      { id: "text-1", kind: "text", text: "Question prompt" },
      {
        id: "columns-1",
        kind: "columns",
        columnCount: 2,
        columns: [[{ id: "left-text", kind: "text", text: "Left column prompt" }], [{ id: "right-space", kind: "space", lines: 3 }]],
      },
    ],
    parts: [
      {
        id: "part-1",
        label: "a",
        marks: 2,
        contentBlocks: [{ id: "part-text", kind: "text", text: "Part prompt" }],
        subparts: [
          {
            id: "subpart-1",
            label: "i",
            marks: 1,
            contentBlocks: [{ id: "subpart-space", kind: "space", lines: 2 }],
          },
        ],
        itemOrder: [
          { kind: "block", id: "part-text" },
          { kind: "subpart", id: "subpart-1" },
        ],
      },
    ],
    itemOrder: [
      { kind: "block", id: "text-1" },
      { kind: "block", id: "columns-1" },
      { kind: "part", id: "part-1" },
    ],
  },
];

test("selects question-level blocks from scroll anchors", () => {
  const selection = runtime.selectedEditorBlockFromAnchor(questions, questionBlockScrollAnchor("q1", "text-1"));

  assert.equal(selection?.label, "Text 1");
  assert.equal(selection?.summary, "Question prompt");
  assert.deepEqual(selection?.scope, { kind: "question", questionId: "q1" });
});

test("selects part and subpart blocks with prefixed labels", () => {
  const partSelection = runtime.selectedEditorBlockFromAnchor(questions, partBlockScrollAnchor("q1", "part-1", "part-text"));
  const subpartSelection = runtime.selectedEditorBlockFromAnchor(
    questions,
    subpartBlockScrollAnchor("q1", "part-1", "subpart-1", "subpart-space"),
  );

  assert.equal(partSelection?.label, "Part text 1");
  assert.deepEqual(partSelection?.scope, { kind: "part", questionId: "q1", partId: "part-1" });
  assert.equal(subpartSelection?.label, "Subpart space 1");
  assert.deepEqual(subpartSelection?.scope, { kind: "subpart", questionId: "q1", partId: "part-1", subpartId: "subpart-1" });
});

test("selects blocks nested inside columns", () => {
  const anchor = columnPathScrollAnchor(questionBlockScrollAnchor("q1", "columns-1"), [{ columnIndex: 1, blockId: "right-space" }]);
  const selection = runtime.selectedEditorBlockFromAnchor(questions, anchor);

  assert.equal(selection?.label, "Column 2 space 1");
  assert.equal(selection?.summary, "3 lines");
  assert.deepEqual(selection?.scope, {
    kind: "column",
    rootScope: { kind: "question", questionId: "q1" },
    rootBlockId: "columns-1",
    path: [{ columnIndex: 1, blockId: "right-space" }],
  });
});

test("returns null for anchors that do not resolve to editable content blocks", () => {
  assert.equal(runtime.selectedEditorBlockFromAnchor(questions, "front-matter"), null);
  assert.equal(runtime.selectedEditorBlockFromAnchor(questions, questionBlockScrollAnchor("missing", "text-1")), null);
  assert.equal(runtime.selectedEditorBlockFromAnchor(questions, questionBlockScrollAnchor("q1", "missing")), null);
});
