import assert from "node:assert/strict";
import test from "node:test";

import type { EditorContentBlock, QuestionBlock } from "./editorDocumentNormalization.ts";
import { columnBlockAtPath, createEditorBlockContextRuntime } from "./editorBlockContexts.ts";
import {
  columnPathScrollAnchor,
  parseScrollAnchor,
  partBlockScrollAnchor,
  questionBlockScrollAnchor,
  subpartBlockScrollAnchor,
} from "./scrollAnchors.ts";

function textBlock(id: string): EditorContentBlock {
  return { id, kind: "text", text: id };
}

const columnsBlock: Extract<EditorContentBlock, { kind: "columns" }> = {
  id: "columns-1",
  kind: "columns",
  columnCount: 2,
  columns: [
    [textBlock("left-text")],
    [
      {
        id: "inner-columns",
        kind: "columns",
        columnCount: 1,
        columns: [[textBlock("inner-text")]],
      },
    ],
  ],
};

const questions: QuestionBlock[] = [
  {
    id: "q1",
    section: "Algebra",
    text: "",
    marks: 0,
    contentBlocks: [textBlock("question-text"), columnsBlock],
    parts: [
      {
        id: "p1",
        label: "a",
        text: "",
        marks: 0,
        contentBlocks: [textBlock("part-text")],
        subparts: [
          {
            id: "s1",
            label: "i",
            text: "",
            marks: 0,
            contentBlocks: [textBlock("subpart-text")],
          },
        ],
        itemOrder: [],
      },
    ],
    itemOrder: [],
  },
];

const runtime = createEditorBlockContextRuntime(questions);

test("rootBlockContextFromParsed resolves question, part, and subpart scopes", () => {
  const questionContext = runtime.rootBlockContextFromParsed(parseScrollAnchor(questionBlockScrollAnchor("q1", "question-text")));
  assert.equal(questionContext?.block?.id, "question-text");
  assert.deepEqual(questionContext?.scope, { kind: "question", questionId: "q1" });
  assert.equal(questionContext?.anchorForBlock("next"), "q:q1/b:next");

  const partContext = runtime.rootBlockContextFromParsed(parseScrollAnchor(partBlockScrollAnchor("q1", "p1", "part-text")));
  assert.equal(partContext?.block?.id, "part-text");
  assert.deepEqual(partContext?.scope, { kind: "part", questionId: "q1", partId: "p1" });
  assert.equal(partContext?.anchorForBlock("next"), "q:q1/p:p1/b:next");

  const subpartContext = runtime.rootBlockContextFromParsed(parseScrollAnchor(subpartBlockScrollAnchor("q1", "p1", "s1", "subpart-text")));
  assert.equal(subpartContext?.block?.id, "subpart-text");
  assert.deepEqual(subpartContext?.scope, { kind: "subpart", questionId: "q1", partId: "p1", subpartId: "s1" });
  assert.equal(subpartContext?.anchorForBlock("next"), "q:q1/p:p1/s:s1/b:next");
});

test("blockContextFromParsed only accepts direct block anchors", () => {
  assert.equal(runtime.blockContextFromParsed(parseScrollAnchor("q:q1"))?.block, undefined);
  assert.equal(runtime.blockContextFromParsed(parseScrollAnchor("q:q1/p:p1"))?.block, undefined);
  assert.equal(runtime.blockContextFromParsed(parseScrollAnchor("q:q1/b:missing"))?.block, undefined);
  assert.equal(
    runtime.blockContextFromParsed(parseScrollAnchor(questionBlockScrollAnchor("q1", "question-text")))?.block?.id,
    "question-text",
  );
});

test("columnBlockContextFromParsed resolves nested column blocks and root anchors", () => {
  const anchor = columnPathScrollAnchor(questionBlockScrollAnchor("q1", "columns-1"), [
    { columnIndex: 1, blockId: "inner-columns" },
    { columnIndex: 0, blockId: "inner-text" },
  ]);
  const context = runtime.columnBlockContextFromParsed(parseScrollAnchor(anchor));

  assert.equal(context?.block.id, "inner-text");
  assert.equal(context?.rootBlock.id, "columns-1");
  assert.equal(context?.rootAnchor, "q:q1/b:columns-1");
  assert.deepEqual(context?.scope, { kind: "question", questionId: "q1" });
});

test("columnBlockAtPath rejects missing paths and non-column children", () => {
  assert.equal(columnBlockAtPath(columnsBlock, [{ columnIndex: 0, blockId: "left-text" }])?.id, "left-text");
  assert.equal(columnBlockAtPath(columnsBlock, [{ columnIndex: 2, blockId: "missing" }]), null);
  assert.equal(
    columnBlockAtPath(columnsBlock, [
      { columnIndex: 0, blockId: "left-text" },
      { columnIndex: 0, blockId: "missing" },
    ]),
    null,
  );
});
