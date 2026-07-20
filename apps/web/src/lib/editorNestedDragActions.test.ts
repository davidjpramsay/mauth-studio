import assert from "node:assert/strict";
import test from "node:test";

import type { QuestionBlock } from "./editorDocumentNormalization.ts";
import {
  editorPageBreakCanMoveTo,
  editorPageBreakDestinationForContainer,
  editorPageBreakDestinationForOrderItem,
  editorPageBreakDestinationForTarget,
  editorPageBreakKeyboardDestination,
  editorPageBreakMoveActions,
  subsectionKeyboardMoveIntent,
  subsectionMoveAction,
} from "./editorNestedDragActions.ts";

function textBlock(id: string) {
  return { id, kind: "text", text: "" } as const;
}

function questions(): QuestionBlock[] {
  return [
    {
      id: "q1",
      marks: 0,
      text: "",
      section: "",
      contentBlocks: [textBlock("qb1"), textBlock("qb2")],
      parts: [
        {
          id: "p1",
          label: "a",
          marks: 0,
          contentBlocks: [textBlock("pb1")],
          subparts: [],
        },
        {
          id: "p2",
          label: "b",
          marks: 0,
          pageBreakBefore: true,
          contentBlocks: [],
          subparts: [
            { id: "s1", label: "i", marks: 0, pageBreakBefore: true, contentBlocks: [textBlock("sb1")], subparts: [] },
            { id: "s2", label: "ii", marks: 0, contentBlocks: [textBlock("sb2")], subparts: [] },
          ],
          itemOrder: [
            { kind: "subpart", id: "s1" },
            { kind: "subpart", id: "s2" },
          ],
        },
        { id: "p3", label: "c", marks: 0, contentBlocks: [], subparts: [] },
      ],
      itemOrder: [
        { kind: "block", id: "qb1" },
        { kind: "block", id: "qb2" },
        { kind: "part", id: "p1" },
        { kind: "part", id: "p2" },
        { kind: "part", id: "p3" },
      ],
    },
    {
      id: "q2",
      marks: 0,
      text: "",
      section: "",
      contentBlocks: [],
      parts: [{ id: "p4", label: "a", marks: 0, contentBlocks: [], subparts: [] }],
      itemOrder: [{ kind: "part", id: "p4" }],
    },
  ] as QuestionBlock[];
}

test("subsectionMoveAction builds module, part, and subpart moves", () => {
  assert.deepEqual(
    subsectionMoveAction(
      { kind: "question-block", questionId: "q1", id: "qb1" },
      { container: { kind: "part", questionId: "q1", partId: "p1" }, beforeItem: { kind: "block", id: "pb1" } },
    ),
    {
      type: "module.move",
      fromScope: { kind: "question", questionId: "q1" },
      toScope: { kind: "part", questionId: "q1", partId: "p1" },
      blockId: "qb1",
      placement: { item: { kind: "block", id: "pb1" }, position: "before" },
    },
  );
  assert.deepEqual(
    subsectionMoveAction({ kind: "part", questionId: "q1", id: "p1" }, { container: { kind: "question", questionId: "q2" } }),
    { type: "part.move", fromQuestionId: "q1", toQuestionId: "q2", partId: "p1" },
  );
  assert.deepEqual(
    subsectionMoveAction(
      { kind: "subpart", questionId: "q1", partId: "p2", id: "s1" },
      { container: { kind: "part", questionId: "q2", partId: "p4" } },
    ),
    {
      type: "subpart.move",
      from: { questionId: "q1", partId: "p2" },
      to: { questionId: "q2", partId: "p4" },
      subpartId: "s1",
    },
  );
});

test("subsectionKeyboardMoveIntent maps adjacent keyboard moves to stable insertion points", () => {
  const documentQuestions = questions();
  assert.deepEqual(subsectionKeyboardMoveIntent(documentQuestions, { kind: "question-block", questionId: "q1", id: "qb1" }, 1), {
    container: { kind: "question", questionId: "q1" },
    beforeItem: { kind: "part", id: "p1" },
  });
  assert.equal(subsectionKeyboardMoveIntent(documentQuestions, { kind: "question-block", questionId: "q1", id: "qb1" }, -1), null);
});

test("editor page-break destinations respect part and subpart hierarchy", () => {
  const documentQuestions = questions();
  const partSource = { kind: "part" as const, questionId: "q1", partId: "p2" };
  const subpartSource = { kind: "subpart" as const, questionId: "q1", partId: "p2", subpartId: "s1" };

  assert.deepEqual(
    editorPageBreakDestinationForTarget(documentQuestions, partSource, { kind: "part", questionId: "q1", id: "p1" }, "after"),
    partSource,
  );
  assert.deepEqual(
    editorPageBreakDestinationForTarget(
      documentQuestions,
      subpartSource,
      { kind: "subpart", questionId: "q1", partId: "p2", id: "s1" },
      "after",
    ),
    { kind: "subpart", questionId: "q1", partId: "p2", subpartId: "s2" },
  );
  assert.equal(
    editorPageBreakDestinationForTarget(documentQuestions, partSource, { kind: "part", questionId: "q2", id: "p4" }, "before"),
    null,
  );
});

test("editor page-break drop-zone destinations only accept matching order items", () => {
  const documentQuestions = questions();
  const source = { kind: "part" as const, questionId: "q1", partId: "p2" };
  assert.deepEqual(editorPageBreakDestinationForOrderItem(source, { kind: "question", questionId: "q1" }, { kind: "part", id: "p3" }), {
    kind: "part",
    questionId: "q1",
    partId: "p3",
  });
  assert.equal(editorPageBreakDestinationForOrderItem(source, { kind: "question", questionId: "q1" }, { kind: "block", id: "qb1" }), null);
  assert.equal(editorPageBreakDestinationForContainer(documentQuestions, source, { kind: "question", questionId: "q1" }, "end"), null);
  assert.equal(editorPageBreakDestinationForContainer(documentQuestions, source, { kind: "question", questionId: "q1" }, "start"), null);
});

test("editor page-break actions reject occupied destinations and move atomically", () => {
  const documentQuestions = questions();
  const source = { kind: "part" as const, questionId: "q1", partId: "p2" };
  const destination = { kind: "part" as const, questionId: "q1", partId: "p3" };
  assert.equal(editorPageBreakCanMoveTo(documentQuestions, source, { kind: "part", questionId: "q1", partId: "p2" }), false);
  assert.equal(editorPageBreakCanMoveTo(documentQuestions, source, { kind: "part", questionId: "q1", partId: "p1" }), true);
  assert.deepEqual(editorPageBreakMoveActions(documentQuestions, source, destination), [
    { type: "pageBreak.set", target: { kind: "part", questionId: "q1", partId: "p2" }, enabled: false },
    { type: "pageBreak.set", target: { kind: "part", questionId: "q1", partId: "p3" }, enabled: true },
  ]);
  assert.deepEqual(editorPageBreakKeyboardDestination(documentQuestions, source, 1), destination);
});
