import assert from "node:assert/strict";
import test from "node:test";

import type { QuestionBlock } from "./editorDocumentNormalization.ts";
import { pageBreakDropBoundaryQuestionId, questionDropIsNoop, questionsWithMovedPageBreak } from "./editorQuestionPageBreakDrag.ts";

function question(id: string, pageBreakAfter = false, legacyPageBreak = false): QuestionBlock {
  return {
    id,
    section: "",
    text: "",
    marks: 0,
    pageBreakAfter,
    contentBlocks: legacyPageBreak ? [{ id: `${id}-break`, kind: "pageBreak" }] : [],
    parts: [],
    itemOrder: [],
  };
}

const questions = [question("q1"), question("q2"), question("q3")];

test("questionDropIsNoop rejects self, missing, and already-adjacent placements", () => {
  assert.equal(questionDropIsNoop(questions, "q1", "q1", "before"), true);
  assert.equal(questionDropIsNoop(questions, "missing", "q2", "before"), true);
  assert.equal(questionDropIsNoop(questions, "q1", "q2", "before"), true);
  assert.equal(questionDropIsNoop(questions, "q2", "q1", "after"), true);
  assert.equal(questionDropIsNoop(questions, "q1", "q3", "before"), false);
});

test("pageBreakDropBoundaryQuestionId resolves before and after question boundaries", () => {
  assert.equal(pageBreakDropBoundaryQuestionId(questions, "q2", "after"), "q2");
  assert.equal(pageBreakDropBoundaryQuestionId(questions, "q2", "before"), "q1");
  assert.equal(pageBreakDropBoundaryQuestionId(questions, "q1", "before"), "");
  assert.equal(pageBreakDropBoundaryQuestionId(questions, "missing", "before"), "");
});

test("questionsWithMovedPageBreak clears source forms and sets the target", () => {
  const source = [question("q1", true, true), question("q2")];
  const moved = questionsWithMovedPageBreak(source, "q1", "q2");

  assert.equal(moved[0].pageBreakAfter, false);
  assert.deepEqual(moved[0].contentBlocks, []);
  assert.equal(moved[1].pageBreakAfter, true);
  assert.equal(source[0].pageBreakAfter, true);
});

test("questionsWithMovedPageBreak leaves invalid moves structurally unchanged", () => {
  const source = [question("q1", true), question("q2")];
  assert.deepEqual(questionsWithMovedPageBreak(source, "q1", "q1"), source);
  assert.notEqual(questionsWithMovedPageBreak(source, "q1", "q1"), source);
});
