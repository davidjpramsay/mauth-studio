import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_FRONT_MATTER, DEFAULT_NOTES_FRONT_MATTER } from "./frontMatterConfig.ts";
import {
  buildDocumentToc,
  isOrderedBlockVisible,
  markLabel,
  partMarks,
  questionMarks,
  visibilityReplacementSlotAtOrderedItems,
} from "./editorDocumentToc.ts";
import {
  orderedQuestionItems,
  type DocumentFlowItem,
  type DocumentSectionHeading,
  type QuestionBlock,
} from "./editorDocumentNormalization.ts";

const normalizeDocumentFlow = (
  value: unknown,
  questions: QuestionBlock[],
  sectionHeadings: DocumentSectionHeading[],
): DocumentFlowItem[] => {
  const flow = Array.isArray(value) ? (value as DocumentFlowItem[]) : [];
  return flow.length
    ? flow
    : [
        ...sectionHeadings.map((heading) => ({ kind: "sectionHeading" as const, id: heading.id })),
        ...questions.map((question) => ({ kind: "question" as const, id: question.id })),
      ];
};

const tocBlockSummary = (block: QuestionBlock["contentBlocks"][number]) => {
  if (block.kind === "text") return block.text;
  if (block.kind === "space") return `${block.lines} lines`;
  return block.kind;
};

function baseQuestion(overrides: Partial<QuestionBlock> = {}): QuestionBlock {
  return {
    id: "q1",
    section: "Algebra",
    text: "",
    marks: 3,
    contentBlocks: [{ id: "prompt", kind: "text", text: "  Simplify   the expression. " }],
    parts: [],
    itemOrder: [{ kind: "block", id: "prompt" }],
    ...overrides,
  };
}

test("mark helpers calculate question, part, and total labels", () => {
  const question = baseQuestion({
    marks: 9,
    parts: [
      {
        id: "part-a",
        label: "a",
        marks: 2,
        contentBlocks: [],
        subparts: [
          { id: "sub-i", label: "i", marks: 1, contentBlocks: [] },
          { id: "sub-ii", label: "ii", marks: 3, contentBlocks: [] },
        ],
        itemOrder: [],
      },
      { id: "part-b", label: "b", marks: 4, contentBlocks: [], subparts: [], itemOrder: [] },
    ],
  });

  assert.equal(partMarks(question.parts[0]), 4);
  assert.equal(questionMarks(question), 8);
  assert.equal(markLabel(1), "(1 mark)");
  assert.equal(markLabel(8), "(8 marks)");
});

test("buildDocumentToc includes title, section, question, part, subpart, and module entries", () => {
  const sectionHeadings = [{ id: "section-1", title: "Short answer" }];
  const question = baseQuestion({
    id: "q1",
    parts: [
      {
        id: "part-a",
        label: "a",
        marks: 2,
        contentBlocks: [{ id: "part-text", kind: "text", text: "State the gradient." }],
        subparts: [
          {
            id: "sub-i",
            label: "i",
            marks: 1,
            contentBlocks: [{ id: "sub-space", kind: "space", lines: 2 }],
          },
        ],
        itemOrder: [
          { kind: "block", id: "part-text" },
          { kind: "subpart", id: "sub-i" },
        ],
      },
    ],
    itemOrder: [
      { kind: "block", id: "prompt" },
      { kind: "part", id: "part-a" },
    ],
  });

  const items = buildDocumentToc({
    frontMatter: { ...DEFAULT_FRONT_MATTER, assessmentTitle: "Linear Test", subjectTitle: "Mathematics", startQuestionNumber: 4 },
    questions: [question],
    sectionHeadings,
    documentFlow: [
      { kind: "sectionHeading", id: "section-1" },
      { kind: "question", id: "q1" },
    ],
    showSolutions: false,
    normalizeDocumentFlow,
    tocBlockSummary,
  });

  assert.deepEqual(
    items.map((item) => [item.label, item.kind, item.depth]),
    [
      ["Title Page", "title", 0],
      ["Short answer", "sectionHeading", 0],
      ["Question 4", "question", 0],
      ["Text 1", "text", 1],
      ["Part (a)", "part", 1],
      ["Text 1", "text", 2],
      ["Subpart (i)", "subpart", 2],
      ["Space 1", "space", 3],
    ],
  );
  assert.equal(items.find((item) => item.label === "Question 4")?.summary, "Simplify the expression.");
});

test("notes TOC uses note heading labels and question titles", () => {
  const question = baseQuestion({ text: "Finance revision" });
  const items = buildDocumentToc({
    frontMatter: { ...DEFAULT_NOTES_FRONT_MATTER, assessmentTitle: "Math Notes", subjectTitle: "Mathematics" },
    questions: [question],
    sectionHeadings: [{ id: "section-1", title: "" }],
    documentFlow: [
      { kind: "sectionHeading", id: "section-1" },
      { kind: "question", id: "q1" },
    ],
    showSolutions: false,
    normalizeDocumentFlow,
    tocBlockSummary,
  });

  assert.equal(items[0].label, "Notes heading");
  assert.equal(items[1].label, "Section heading");
  assert.equal(items[1].summary, "Notes section");
  assert.equal(items[2].label, "Finance revision");
});

test("ordered visibility hides student replacement surfaces in solution mode", () => {
  const question = baseQuestion({
    contentBlocks: [
      { id: "student-table", kind: "table", headers: ["x"], rows: [[""]], visibility: "student" },
      { id: "solution-table", kind: "table", headers: ["x"], rows: [["2"]], visibility: "solution" },
      { id: "separator", kind: "text", text: "Continue." },
      { id: "student-space", kind: "space", lines: 3, visibility: "student" },
    ],
    itemOrder: [
      { kind: "block", id: "student-table" },
      { kind: "block", id: "solution-table" },
      { kind: "block", id: "separator" },
      { kind: "block", id: "student-space" },
    ],
  });
  const items = orderedQuestionItems(question);

  const replacementSlot = visibilityReplacementSlotAtOrderedItems(items, 0);
  assert.deepEqual(
    replacementSlot?.blocks.map((block) => block.id),
    ["student-table", "solution-table"],
  );
  assert.equal(isOrderedBlockVisible(items, 0, true), false);
  assert.equal(isOrderedBlockVisible(items, 1, true), true);
  assert.equal(isOrderedBlockVisible(items, 3, true), true);
});
