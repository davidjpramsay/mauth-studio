import assert from "node:assert/strict";
import test from "node:test";

import type { QuestionBlock } from "./editorDocumentNormalization.ts";
import { createEditorQuestionLifecycleController } from "./editorQuestionLifecycleController.ts";
import type { MauthAction } from "./mauthActions.ts";

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

function controllerRuntime({
  questions = [question("q1")],
  activeQuestionId = "q1",
  activeTocItemId = "q:q1",
  activeRailItemId = "q:q1",
  batchOk = true,
  actionResultQuestions = questions,
}: {
  questions?: QuestionBlock[];
  activeQuestionId?: string;
  activeTocItemId?: string;
  activeRailItemId?: string;
  batchOk?: boolean;
  actionResultQuestions?: QuestionBlock[];
} = {}) {
  const actions: MauthAction[] = [];
  const actionBatches: MauthAction[][] = [];
  const selectedQuestions: string[] = [];
  const tocAnchors: string[] = [];
  const railAnchors: string[] = [];
  const jumps: Array<[string, string]> = [];
  let clearedJumps = 0;
  let nextQuestionIndex = 1;

  const controller = createEditorQuestionLifecycleController({
    questions,
    activeQuestionId,
    activeTocItemId,
    activeRailItemId,
    frontMatterRef: { current: { titlePageTemplate: "exam" } },
    questionFactory: {
      createQuestion: () => question(`new-${nextQuestionIndex++}`),
      createNotesSection: () => question("notes-section", { section: "Notes" }),
    },
    applyAction: (action) => {
      actions.push(action);
      return { ok: true, questions: actionResultQuestions };
    },
    applyActions: (batch) => {
      actionBatches.push(batch);
      return { ok: batchOk };
    },
    selectQuestion: (questionId) => selectedQuestions.push(questionId),
    setActiveTocItem: (anchor) => tocAnchors.push(anchor),
    setActiveRailItem: (anchor) => railAnchors.push(anchor),
    queueDocumentJump: (editorAnchor, previewAnchor) => jumps.push([editorAnchor, previewAnchor]),
    clearPendingDocumentJumps: () => {
      clearedJumps += 1;
    },
  });

  return {
    controller,
    actions,
    actionBatches,
    selectedQuestions,
    tocAnchors,
    railAnchors,
    jumps,
    clearedJumps: () => clearedJumps,
  };
}

test("question lifecycle adds an exam question and focuses it after the action batch succeeds", () => {
  const runtime = controllerRuntime({ questions: [question("q1")] });

  runtime.controller.addQuestion();

  assert.deepEqual(runtime.actionBatches[0], [
    { type: "question.update", questionId: "q1", patch: { pageBreakAfter: true } },
    { type: "question.add", question: question("new-1") },
  ]);
  assert.deepEqual(runtime.selectedQuestions, ["new-1"]);
  assert.deepEqual(runtime.tocAnchors, ["q:new-1"]);
  assert.deepEqual(runtime.railAnchors, ["q:new-1"]);
  assert.deepEqual(runtime.jumps, [["q:new-1", "q:new-1"]]);
});

test("question lifecycle leaves navigation unchanged when question creation fails", () => {
  const runtime = controllerRuntime({ batchOk: false });

  runtime.controller.addQuestion();

  assert.equal(runtime.actionBatches.length, 1);
  assert.deepEqual(runtime.selectedQuestions, []);
  assert.deepEqual(runtime.tocAnchors, []);
  assert.deepEqual(runtime.railAnchors, []);
  assert.deepEqual(runtime.jumps, []);
});

test("question lifecycle adds and removes an active question page break", () => {
  const runtime = controllerRuntime({ activeTocItemId: "pb:q1", activeRailItemId: "pb:q1" });

  runtime.controller.addPageBreakAfterQuestion("q1");
  runtime.controller.removePageBreakAfterQuestion("q1");

  assert.deepEqual(runtime.actions, [
    { type: "pageBreak.set", target: { kind: "question", questionId: "q1" }, enabled: true },
    { type: "pageBreak.set", target: { kind: "question", questionId: "q1" }, enabled: false },
  ]);
  assert.equal(runtime.clearedJumps(), 1);
  assert.deepEqual(runtime.selectedQuestions, ["q1"]);
  assert.deepEqual(runtime.tocAnchors, ["q:q1"]);
  assert.deepEqual(runtime.railAnchors, ["pb:q1", "q:q1", "q:q1"]);
  assert.deepEqual(runtime.jumps, [["q:q1", "q:q1"]]);
});

test("question lifecycle deletes a question and focuses the surviving active question", () => {
  const questions = [question("q1"), question("q2"), question("q3")];
  const runtime = controllerRuntime({
    questions,
    activeQuestionId: "q2",
    actionResultQuestions: [question("q1"), question("q3")],
  });

  runtime.controller.removeQuestion("q2");

  assert.deepEqual(runtime.actions, [{ type: "question.delete", questionId: "q2", fallbackQuestion: undefined }]);
  assert.deepEqual(runtime.selectedQuestions, ["q3"]);
  assert.deepEqual(runtime.tocAnchors, ["q:q3"]);
  assert.deepEqual(runtime.railAnchors, ["q:q3"]);
});
