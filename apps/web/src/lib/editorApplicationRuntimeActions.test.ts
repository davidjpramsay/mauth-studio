import assert from "node:assert/strict";
import test from "node:test";

import {
  EDITOR_HISTORY_LIMIT,
  contentBlockForKind,
  createNotesSection,
  createQuestion,
  duplicatedQuestion,
  normalizeDocumentFlow,
  normalizeQuestionBlocks,
  selectedEditorBlockFromAnchor,
  solutionSlotBlocks,
  tocBlockSummary,
} from "./editorApplicationRuntime.ts";
import { questionBlockScrollAnchor } from "./scrollAnchors.ts";

test("editor application runtime exposes one configured question and solution factory", () => {
  const question = createQuestion();
  const notesSection = createNotesSection();
  const solutionBlocks = solutionSlotBlocks(5);

  assert.equal(EDITOR_HISTORY_LIMIT, 80);
  assert.equal(question.text, "");
  assert.equal(question.contentBlocks.length, 0);
  assert.equal(notesSection.section, "Introduction");
  assert.equal(notesSection.contentBlocks[0]?.kind, "text");
  assert.deepEqual(
    solutionBlocks.map((block) => block.visibility),
    ["student", "solution"],
  );
  assert.equal(contentBlockForKind("diagram", "solution").visibility, "solution");
});

test("editor application runtime shares normalization, summaries, selection, and duplication", () => {
  const question = createQuestion();
  const textBlock = contentBlockForKind("text");
  const normalizedQuestions = normalizeQuestionBlocks([
    {
      ...question,
      contentBlocks: [textBlock],
      itemOrder: [{ kind: "block", id: textBlock.id }],
    },
  ]);
  const normalizedQuestion = normalizedQuestions[0];

  assert.ok(normalizedQuestion);
  assert.deepEqual(normalizeDocumentFlow(undefined, normalizedQuestions, []), [{ kind: "question", id: normalizedQuestion.id }]);
  assert.equal(tocBlockSummary(textBlock), "Empty text block");
  assert.equal(
    selectedEditorBlockFromAnchor(normalizedQuestions, questionBlockScrollAnchor(normalizedQuestion.id, textBlock.id))?.scope.kind,
    "question",
  );

  const duplicate = duplicatedQuestion(normalizedQuestion);
  assert.notEqual(duplicate.id, normalizedQuestion.id);
  assert.notEqual(duplicate.contentBlocks[0]?.id, normalizedQuestion.contentBlocks[0]?.id);
});
