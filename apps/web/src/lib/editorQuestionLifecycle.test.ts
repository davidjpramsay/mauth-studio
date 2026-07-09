import assert from "node:assert/strict";
import test from "node:test";

import type { EditorContentBlock, QuestionBlock } from "./editorDocumentNormalization.ts";
import {
  createBlankEditorPart,
  createBlankEditorSubpart,
  createQuestionForTemplate,
  fallbackQuestionForDelete,
  nextActiveQuestionAfterDelete,
  questionAddActionsForTemplate,
  questionHasPageBreak,
} from "./editorQuestionLifecycle.ts";

function question(id: string, overrides: Partial<QuestionBlock> = {}): QuestionBlock {
  return {
    id,
    section: "Algebra",
    text: "",
    marks: 0,
    contentBlocks: [],
    parts: [],
    itemOrder: [],
    ...overrides,
  };
}

const runtime = {
  createQuestion: () => question("test-question"),
  createNotesSection: () => question("notes-section", { section: "Notes", text: "Notes heading" }),
};

test("questionHasPageBreak accepts explicit and legacy question page breaks", () => {
  assert.equal(questionHasPageBreak(question("q1")), false);
  assert.equal(questionHasPageBreak(question("q2", { pageBreakAfter: true })), true);
  assert.equal(questionHasPageBreak(question("q3", { contentBlocks: [{ id: "pb", kind: "pageBreak" } as EditorContentBlock] })), true);
});

test("createQuestionForTemplate creates notes sections only for notes documents", () => {
  assert.equal(createQuestionForTemplate({ titlePageTemplate: "notes" }, runtime).id, "notes-section");
  assert.equal(createQuestionForTemplate({ titlePageTemplate: "exam" }, runtime).id, "test-question");
  assert.equal(createQuestionForTemplate({}, runtime).id, "test-question");
});

test("questionAddActionsForTemplate adds a page break before new exam questions", () => {
  assert.deepEqual(questionAddActionsForTemplate({ template: { titlePageTemplate: "exam" }, questions: [], question: question("q1") }), [
    { type: "question.add", question: question("q1") },
  ]);
  assert.deepEqual(
    questionAddActionsForTemplate({
      template: { titlePageTemplate: "exam" },
      questions: [question("existing")],
      question: question("q2"),
    }),
    [
      { type: "question.update", questionId: "existing", patch: { pageBreakAfter: true } },
      { type: "question.add", question: question("q2") },
    ],
  );
  assert.deepEqual(
    questionAddActionsForTemplate({
      template: { titlePageTemplate: "worksheet" },
      questions: [question("existing")],
      question: question("q3"),
    }),
    [{ type: "question.add", question: question("q3") }],
  );
});

test("fallbackQuestionForDelete only creates a replacement for the final question", () => {
  assert.equal(
    fallbackQuestionForDelete({ template: { titlePageTemplate: "exam" }, questions: [question("q1"), question("q2")], runtime }),
    undefined,
  );
  assert.equal(
    fallbackQuestionForDelete({ template: { titlePageTemplate: "notes" }, questions: [question("q1")], runtime })?.id,
    "notes-section",
  );
  assert.equal(
    fallbackQuestionForDelete({ template: { titlePageTemplate: "exam" }, questions: [question("q1")], runtime })?.id,
    "test-question",
  );
});

test("nextActiveQuestionAfterDelete keeps or moves active question predictably", () => {
  const nextQuestions = [question("q1"), question("q3")];
  assert.equal(
    nextActiveQuestionAfterDelete({ nextQuestions, removedQuestionId: "q2", removedIndex: 1, activeQuestionId: "q2" })?.id,
    "q3",
  );
  assert.equal(
    nextActiveQuestionAfterDelete({ nextQuestions, removedQuestionId: "q3", removedIndex: 2, activeQuestionId: "q3" })?.id,
    "q3",
  );
  assert.equal(
    nextActiveQuestionAfterDelete({ nextQuestions, removedQuestionId: "q2", removedIndex: 1, activeQuestionId: "q1" })?.id,
    "q1",
  );
  assert.equal(
    nextActiveQuestionAfterDelete({ nextQuestions, removedQuestionId: "q2", removedIndex: 1, activeQuestionId: "missing" })?.id,
    "q1",
  );
});

test("blank part and subpart factories preserve editor defaults", () => {
  const part = createBlankEditorPart((prefix) => `${prefix}-1`);
  assert.deepEqual(part, {
    id: "part-1",
    label: "",
    text: "",
    marks: 0,
    pageBreakBefore: false,
    contentBlocks: [],
    subparts: [],
    itemOrder: [],
  });

  const subpart = createBlankEditorSubpart((prefix) => `${prefix}-2`, 3);
  assert.deepEqual(subpart, {
    id: "subpart-2",
    label: "iv",
    text: "",
    marks: 0,
    pageBreakBefore: false,
    contentBlocks: [],
  });
});
