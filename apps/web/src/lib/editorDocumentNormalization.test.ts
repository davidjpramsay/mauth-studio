import test from "node:test";
import assert from "node:assert/strict";

import {
  alphaLabel,
  createEditorDocumentNormalizer,
  defaultDocumentFlow,
  normalizeItemOrder,
  orderedPartItems,
  orderedQuestionItems,
  partAllowedOrderItems,
  questionAllowedOrderItems,
  romanLabel,
  safeMarkValue,
  withNormalizedPartOrder,
  withNormalizedQuestionOrder,
  type EditorContentBlock,
  type EditorPart,
  type QuestionBlock,
} from "./editorDocumentNormalization.ts";

function testDocumentNormalizer() {
  let count = 0;
  return createEditorDocumentNormalizer({
    id: (prefix) => `${prefix}-${++count}`,
    normalizeContentBlocks: (value) => (Array.isArray(value) ? (value as EditorContentBlock[]) : []),
  });
}

function textBlock(id: string): EditorContentBlock {
  return { id, kind: "text", text: id };
}

test("editor document labels and marks normalize predictably", () => {
  assert.equal(alphaLabel(0), "a");
  assert.equal(alphaLabel(27), "ab");
  assert.equal(romanLabel(0), "i");
  assert.equal(romanLabel(8), "ix");
  assert.equal(safeMarkValue("3"), 3);
  assert.equal(safeMarkValue(-2), 0);
  assert.equal(safeMarkValue("bad"), 0);
});

test("normalizeItemOrder filters invalid entries, removes duplicates, and appends missing items", () => {
  const blockA = textBlock("block-a");
  const blockB = textBlock("block-b");
  const part: EditorPart = { id: "part-a", label: "", text: "", marks: 1, contentBlocks: [], subparts: [], itemOrder: [] };
  const allowedItems = questionAllowedOrderItems([blockA, blockB], [part]);

  assert.deepEqual(
    normalizeItemOrder(
      [
        { kind: "part", id: "part-a" },
        { kind: "block", id: "missing" },
        { kind: "part", id: "part-a" },
        { kind: "block", id: "block-b" },
      ],
      allowedItems,
    ),
    [
      { kind: "part", id: "part-a" },
      { kind: "block", id: "block-b" },
      { kind: "block", id: "block-a" },
    ],
  );
});

test("ordered item helpers follow normalized question and part order", () => {
  const subpartA = { id: "subpart-a", label: "", text: "", marks: 1, contentBlocks: [textBlock("subpart-block-a")] };
  const subpartB = { id: "subpart-b", label: "", text: "", marks: 1, contentBlocks: [] };
  const part = withNormalizedPartOrder({
    id: "part-a",
    label: "",
    text: "",
    marks: 2,
    contentBlocks: [textBlock("part-block-a")],
    subparts: [subpartA, subpartB],
    itemOrder: [
      { kind: "subpart", id: "subpart-b" },
      { kind: "block", id: "part-block-a" },
      { kind: "subpart", id: "subpart-a" },
    ],
  });
  const question = withNormalizedQuestionOrder({
    id: "question-a",
    section: "Algebra",
    text: "",
    marks: 2,
    contentBlocks: [textBlock("question-block-a")],
    parts: [part],
    itemOrder: [
      { kind: "part", id: "part-a" },
      { kind: "block", id: "question-block-a" },
    ],
  });

  assert.deepEqual(
    orderedPartItems(part).map((item) => `${item.kind}:${item.id}`),
    ["subpart:subpart-b", "block:part-block-a", "subpart:subpart-a"],
  );
  assert.deepEqual(
    orderedQuestionItems(question).map((item) => `${item.kind}:${item.id}`),
    ["part:part-a", "block:question-block-a"],
  );
});

test("editor document normalizer restores solution surface ticks and legacy page breaks", () => {
  const normalizer = testDocumentNormalizer();
  const [question] = normalizer.normalizeQuestionBlocks([
    {
      id: "question-a",
      section: "Number",
      text: "Complete the table.",
      marks: "2",
      contentBlocks: [
        { id: "solution-table", kind: "table", headers: [], rows: [["x"]], visibility: "solution" },
        { id: "legacy-break", kind: "pageBreak" },
      ],
      parts: [
        { id: "part-b", text: "Second", marks: 1, contentBlocks: [], subparts: [], itemOrder: [] },
        { id: "part-a", text: "First", marks: 1, contentBlocks: [], subparts: [], itemOrder: [] },
      ],
      itemOrder: [
        { kind: "part", id: "part-a" },
        { kind: "block", id: "solution-table" },
        { kind: "part", id: "part-b" },
      ],
    },
  ]);

  assert.equal(question.pageBreakAfter, true);
  assert.deepEqual(
    question.contentBlocks.map((block) => block.id),
    ["solution-table"],
  );
  assert.equal(question.contentBlocks[0].kind === "table" ? question.contentBlocks[0].markTicks : undefined, 2);
  assert.deepEqual(
    question.parts.map((part) => `${part.label}:${part.id}`),
    ["a:part-a", "b:part-b"],
  );
  assert.deepEqual(question.itemOrder, [
    { kind: "part", id: "part-a" },
    { kind: "block", id: "solution-table" },
    { kind: "part", id: "part-b" },
  ]);
});

test("editor document normalizer repairs headings and document flow", () => {
  const normalizer = testDocumentNormalizer();
  const questions: QuestionBlock[] = [
    {
      id: "question-a",
      section: "Algebra",
      text: "",
      marks: 0,
      contentBlocks: [],
      parts: [],
      itemOrder: [],
    },
  ];
  const headings = normalizer.normalizeSectionHeadings([
    { id: "heading-a", title: "Multiple choice" },
    { id: "heading-a", title: "Duplicate" },
    { title: "Generated id" },
  ]);

  assert.equal(headings.length, 2);
  assert.deepEqual(defaultDocumentFlow(questions), [{ kind: "question", id: "question-a" }]);
  assert.deepEqual(
    normalizer.normalizeDocumentFlow(
      [
        { kind: "question", id: "missing" },
        { kind: "sectionHeading", id: "heading-a" },
        { kind: "sectionHeading", id: "heading-a" },
      ],
      questions,
      headings,
    ),
    [
      { kind: "sectionHeading", id: "heading-a" },
      { kind: "sectionHeading", id: headings[1].id },
      { kind: "question", id: "question-a" },
    ],
  );
});

test("partAllowedOrderItems excludes legacy page-break modules", () => {
  const items = partAllowedOrderItems(
    [textBlock("visible"), { id: "break", kind: "pageBreak" }],
    [{ id: "subpart-a", label: "", text: "", marks: 1, contentBlocks: [] }],
  );

  assert.deepEqual(items, [
    { kind: "block", id: "visible" },
    { kind: "subpart", id: "subpart-a" },
  ]);
});
