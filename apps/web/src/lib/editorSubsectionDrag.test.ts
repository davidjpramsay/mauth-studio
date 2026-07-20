import assert from "node:assert/strict";
import test from "node:test";

import type { QuestionBlock } from "./editorDocumentNormalization.ts";
import {
  EDITOR_PAGE_BREAK_DRAG_TEXT_PREFIX,
  PAGE_BREAK_DRAG_TEXT_PREFIX,
  SUBSECTION_DRAG_TEXT_PREFIX,
  containerDropKey,
  dropIntentForContainer,
  editorPageBreakKey,
  parseEditorPageBreakDrag,
  parsePageBreakDrag,
  parseSubsectionDrag,
  serializeEditorPageBreakDrag,
  serializeSubsectionDrag,
  subsectionContainerFromDataset,
  subsectionDropIntent,
  subsectionDropPreviewTargetKey,
  subsectionTargetFromDataset,
} from "./editorSubsectionDrag.ts";

function block(id: string) {
  return { id, kind: "text", text: "" };
}

function questions(): QuestionBlock[] {
  return [
    {
      id: "q1",
      marks: 0,
      text: "",
      section: "",
      contentBlocks: [block("b1"), block("b2")],
      parts: [
        {
          id: "p1",
          label: "a",
          marks: 0,
          contentBlocks: [block("pb1")],
          subparts: [
            {
              id: "s1",
              label: "i",
              marks: 0,
              contentBlocks: [block("sb1"), block("sb2")],
            },
          ],
          itemOrder: [
            { kind: "block", id: "pb1" },
            { kind: "subpart", id: "s1" },
          ],
        },
      ],
      itemOrder: [
        { kind: "block", id: "b1" },
        { kind: "block", id: "b2" },
        { kind: "part", id: "p1" },
      ],
    },
  ] as QuestionBlock[];
}

test("subsection drag payloads round-trip and reject invalid payloads", () => {
  const target = { kind: "part-block" as const, questionId: "q1", partId: "p1", id: "pb1" };
  assert.deepEqual(parseSubsectionDrag(serializeSubsectionDrag(target)), target);
  assert.deepEqual(parseSubsectionDrag(`${SUBSECTION_DRAG_TEXT_PREFIX}${serializeSubsectionDrag(target)}`), target);
  assert.equal(parseSubsectionDrag(`${SUBSECTION_DRAG_TEXT_PREFIX}{bad json`), null);
  assert.equal(parseSubsectionDrag(JSON.stringify({ kind: "unknown", questionId: "q1", id: "x" })), null);
});

test("dataset helpers require the right ids for nested subsection targets", () => {
  assert.deepEqual(
    subsectionTargetFromDataset({
      subsectionTargetKind: "subpart-block",
      subsectionTargetQuestionId: "q1",
      subsectionTargetPartId: "p1",
      subsectionTargetSubpartId: "s1",
      subsectionTargetId: "sb1",
    }),
    { kind: "subpart-block", questionId: "q1", partId: "p1", subpartId: "s1", id: "sb1" },
  );
  assert.equal(
    subsectionTargetFromDataset({
      subsectionTargetKind: "subpart-block",
      subsectionTargetQuestionId: "q1",
      subsectionTargetPartId: "p1",
      subsectionTargetId: "sb1",
    }),
    null,
  );
  assert.deepEqual(
    subsectionContainerFromDataset({
      subsectionContainerKind: "part",
      subsectionContainerQuestionId: "q1",
      subsectionContainerPartId: "p1",
    }),
    { kind: "part", questionId: "q1", partId: "p1" },
  );
});

test("subsectionDropIntent rejects no-op moves and returns the next meaningful insertion point", () => {
  const documentQuestions = questions();
  const active = { kind: "question-block" as const, questionId: "q1", id: "b1" };
  const secondBlock = { kind: "question-block" as const, questionId: "q1", id: "b2" };

  assert.equal(subsectionDropIntent(active, secondBlock, "before", documentQuestions), null);
  assert.deepEqual(subsectionDropIntent(active, secondBlock, "after", documentQuestions), {
    container: { kind: "question", questionId: "q1" },
    beforeItem: { kind: "part", id: "p1" },
  });
});

test("dropIntentForContainer enforces hierarchy and maps subpart drops to block ids", () => {
  const documentQuestions = questions();
  const partTarget = { kind: "part" as const, questionId: "q1", id: "p1" };
  const subpartTarget = { kind: "subpart" as const, questionId: "q1", partId: "p1", id: "s1" };
  const blockTarget = { kind: "question-block" as const, questionId: "q1", id: "b2" };

  assert.equal(dropIntentForContainer(partTarget, { kind: "part", questionId: "q1", partId: "p1" }, documentQuestions), null);
  assert.deepEqual(dropIntentForContainer(subpartTarget, { kind: "part", questionId: "q1", partId: "p1" }, documentQuestions, "start"), {
    container: { kind: "part", questionId: "q1", partId: "p1" },
    beforeItem: { kind: "block", id: "pb1" },
  });
  assert.deepEqual(
    dropIntentForContainer(blockTarget, { kind: "subpart", questionId: "q1", partId: "p1", subpartId: "s1" }, documentQuestions, "start"),
    {
      container: { kind: "subpart", questionId: "q1", partId: "p1", subpartId: "s1" },
      beforeBlockId: "sb1",
    },
  );
});

test("drop preview keys and page-break payloads are stable", () => {
  const target = { kind: "part" as const, questionId: "q1", id: "p1" };
  const intent = { container: { kind: "question" as const, questionId: "q1" }, beforeItem: { kind: "part" as const, id: "p1" } };
  assert.equal(subsectionDropPreviewTargetKey(target, { placement: "before", intent }), "container:question:q1:::before:part:p1");
  assert.equal(containerDropKey({ kind: "question", questionId: "q1" }, "end"), "container:question:q1:::end");

  assert.equal(parsePageBreakDrag(`${PAGE_BREAK_DRAG_TEXT_PREFIX}q1`), "q1");
  assert.equal(parsePageBreakDrag("q1"), "");
  assert.equal(parsePageBreakDrag("q1", true), "q1");

  const pageBreakTarget = { kind: "subpart" as const, questionId: "q1", partId: "p1", subpartId: "s1" };
  const serialized = serializeEditorPageBreakDrag(pageBreakTarget);
  assert.deepEqual(parseEditorPageBreakDrag(serialized), pageBreakTarget);
  assert.deepEqual(parseEditorPageBreakDrag(`${EDITOR_PAGE_BREAK_DRAG_TEXT_PREFIX}${serialized}`), pageBreakTarget);
  assert.equal(editorPageBreakKey(pageBreakTarget), "subpart:q1:p1:s1");
});
