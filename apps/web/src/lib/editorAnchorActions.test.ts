import assert from "node:assert/strict";
import test from "node:test";

import type { DocumentFlowItem, DocumentSectionHeading, EditorPart, QuestionBlock } from "./editorDocumentNormalization.ts";
import { canDeleteAnchorTarget, canMoveAnchorTarget, subsectionTargetFromAnchor } from "./editorAnchorActions.ts";
import {
  partBlockScrollAnchor,
  partScrollAnchor,
  questionBlockScrollAnchor,
  questionScrollAnchor,
  sectionHeadingScrollAnchor,
} from "./scrollAnchors.ts";

function part(id: string, overrides: Partial<EditorPart> = {}): EditorPart {
  return {
    id,
    label: "",
    text: "",
    marks: 0,
    contentBlocks: [],
    subparts: [],
    itemOrder: [],
    ...overrides,
  };
}

function question(id: string, parts: EditorPart[] = [], itemOrder: QuestionBlock["itemOrder"] = []): QuestionBlock {
  return {
    id,
    section: "Algebra",
    text: "",
    marks: 0,
    contentBlocks: [
      { id: "q-text", kind: "text", text: "Prompt" },
      { id: "q-space", kind: "space", lines: 3 },
    ],
    parts,
    itemOrder,
  };
}

const normalizeDocumentFlow = (
  value: unknown,
  questions: QuestionBlock[],
  sectionHeadings: DocumentSectionHeading[],
): DocumentFlowItem[] => {
  const flow = Array.isArray(value) ? (value as DocumentFlowItem[]) : [];
  const validHeadingIds = new Set(sectionHeadings.map((heading) => heading.id));
  const validQuestionIds = new Set(questions.map((current) => current.id));
  return flow.filter((item) =>
    item.kind === "sectionHeading" ? validHeadingIds.has(item.id) : item.kind === "question" && validQuestionIds.has(item.id),
  );
};

test("subsectionTargetFromAnchor maps content anchors to drag targets", () => {
  assert.deepEqual(subsectionTargetFromAnchor(questionBlockScrollAnchor("q1", "b1")), {
    kind: "question-block",
    questionId: "q1",
    id: "b1",
  });
  assert.deepEqual(subsectionTargetFromAnchor(partScrollAnchor("q1", "p1")), { kind: "part", questionId: "q1", id: "p1" });
  assert.deepEqual(subsectionTargetFromAnchor(partBlockScrollAnchor("q1", "p1", "b2")), {
    kind: "part-block",
    questionId: "q1",
    partId: "p1",
    id: "b2",
  });
  assert.deepEqual(subsectionTargetFromAnchor("q:q1/p:p1/s:s1"), {
    kind: "subpart",
    questionId: "q1",
    partId: "p1",
    id: "s1",
  });
  assert.deepEqual(subsectionTargetFromAnchor("q:q1/p:p1/s:s1/b:b3"), {
    kind: "subpart-block",
    questionId: "q1",
    partId: "p1",
    subpartId: "s1",
    id: "b3",
  });
});

test("canDeleteAnchorTarget excludes only front matter and unknown anchors", () => {
  assert.equal(canDeleteAnchorTarget("front-matter"), false);
  assert.equal(canDeleteAnchorTarget("garbage"), false);
  assert.equal(canDeleteAnchorTarget(questionScrollAnchor("q1")), true);
  assert.equal(canDeleteAnchorTarget(sectionHeadingScrollAnchor("heading-1")), true);
});

test("canMoveAnchorTarget handles section headings and questions", () => {
  const headings = [{ id: "h1", title: "Section" }];
  const questions = [question("q1"), question("q2")];
  const documentFlow: DocumentFlowItem[] = [
    { kind: "sectionHeading", id: "h1" },
    { kind: "question", id: "q1" },
    { kind: "question", id: "q2" },
  ];

  assert.equal(
    canMoveAnchorTarget({
      anchor: sectionHeadingScrollAnchor("h1"),
      direction: -1,
      questions,
      documentFlow,
      sectionHeadings: headings,
      normalizeDocumentFlow,
    }),
    false,
  );
  assert.equal(
    canMoveAnchorTarget({
      anchor: sectionHeadingScrollAnchor("h1"),
      direction: 1,
      questions,
      documentFlow,
      sectionHeadings: headings,
      normalizeDocumentFlow,
    }),
    true,
  );
  assert.equal(
    canMoveAnchorTarget({
      anchor: questionScrollAnchor("q2"),
      direction: 1,
      questions,
      documentFlow,
      sectionHeadings: headings,
      normalizeDocumentFlow,
    }),
    false,
  );
});

test("canMoveAnchorTarget handles blocks and parts inside ordered containers", () => {
  const p1 = part("p1");
  const p2 = part("p2");
  const questions = [
    question(
      "q1",
      [p1, p2],
      [
        { kind: "block", id: "q-text" },
        { kind: "part", id: "p1" },
        { kind: "block", id: "q-space" },
        { kind: "part", id: "p2" },
      ],
    ),
  ];

  assert.equal(
    canMoveAnchorTarget({
      anchor: questionBlockScrollAnchor("q1", "q-text"),
      direction: -1,
      questions,
      documentFlow: [{ kind: "question", id: "q1" }],
      sectionHeadings: [],
      normalizeDocumentFlow,
    }),
    false,
  );
  assert.equal(
    canMoveAnchorTarget({
      anchor: partScrollAnchor("q1", "p1"),
      direction: -1,
      questions,
      documentFlow: [{ kind: "question", id: "q1" }],
      sectionHeadings: [],
      normalizeDocumentFlow,
    }),
    true,
  );
  assert.equal(
    canMoveAnchorTarget({
      anchor: partScrollAnchor("q1", "p2"),
      direction: 1,
      questions,
      documentFlow: [{ kind: "question", id: "q1" }],
      sectionHeadings: [],
      normalizeDocumentFlow,
    }),
    false,
  );
});
