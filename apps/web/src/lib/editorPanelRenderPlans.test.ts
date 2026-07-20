import assert from "node:assert/strict";
import test from "node:test";

import type {
  EditorContentBlock,
  EditorPart,
  EditorSubpart,
  OrderedPartItem,
  OrderedQuestionItem,
  QuestionBlock,
} from "./editorDocumentNormalization.ts";
import { partBlockPanelRenderPlan, questionBlockPanelRenderPlan, subpartBlockPanelRenderPlan } from "./editorPanelRenderPlans.ts";

const studentBlock: EditorContentBlock = { id: "student", kind: "text", text: "Prompt", visibility: "student" };
const solutionBlock: EditorContentBlock = { id: "solution", kind: "text", text: "Answer", visibility: "solution" };
const part: EditorPart = {
  id: "part-1",
  label: "",
  text: "",
  marks: 1,
  contentBlocks: [studentBlock, solutionBlock],
  subparts: [],
  itemOrder: [
    { kind: "block", id: studentBlock.id },
    { kind: "block", id: solutionBlock.id },
  ],
};
const subpart: EditorSubpart = {
  id: "subpart-1",
  label: "i",
  text: "",
  marks: 1,
  contentBlocks: [studentBlock, solutionBlock],
};
const question: QuestionBlock = {
  id: "question-1",
  text: "",
  marks: 1,
  contentBlocks: [studentBlock, solutionBlock],
  parts: [part],
  itemOrder: [
    { kind: "block", id: studentBlock.id },
    { kind: "block", id: solutionBlock.id },
    { kind: "part", id: part.id },
  ],
};

test("question render plans preserve visibility, target identity, and editor anchors", () => {
  const questionItems: OrderedQuestionItem[] = [
    { kind: "block", id: studentBlock.id, block: studentBlock },
    { kind: "block", id: solutionBlock.id, block: solutionBlock },
    { kind: "part", id: part.id, part },
  ];

  assert.equal(questionBlockPanelRenderPlan({ question, block: solutionBlock, itemIndex: 1, questionItems, showSolutions: false }), null);
  assert.deepEqual(questionBlockPanelRenderPlan({ question, block: solutionBlock, itemIndex: 1, questionItems, showSolutions: true }), {
    context: "question",
    scopeBlocks: question.contentBlocks,
    target: { kind: "question-block", questionId: "question-1", id: "solution" },
    anchor: "q:question-1/b:solution",
  });
});

test("part render plans preserve the containing part scope", () => {
  const partItems: OrderedPartItem[] = [
    { kind: "block", id: studentBlock.id, block: studentBlock },
    { kind: "block", id: solutionBlock.id, block: solutionBlock },
  ];

  assert.deepEqual(partBlockPanelRenderPlan({ question, part, block: studentBlock, itemIndex: 0, partItems, showSolutions: false }), {
    context: "part",
    scopeBlocks: part.contentBlocks,
    target: { kind: "part-block", questionId: "question-1", partId: "part-1", id: "student" },
    anchor: "q:question-1/p:part-1/b:student",
  });
});

test("subpart render plans use direct scope visibility and complete nested identity", () => {
  assert.equal(subpartBlockPanelRenderPlan({ question, part, subpart, block: studentBlock, blockIndex: 0, showSolutions: true }), null);
  assert.deepEqual(subpartBlockPanelRenderPlan({ question, part, subpart, block: solutionBlock, blockIndex: 1, showSolutions: true }), {
    context: "subpart",
    scopeBlocks: subpart.contentBlocks,
    target: {
      kind: "subpart-block",
      questionId: "question-1",
      partId: "part-1",
      subpartId: "subpart-1",
      id: "solution",
    },
    anchor: "q:question-1/p:part-1/s:subpart-1/b:solution",
  });
});
