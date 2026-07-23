import assert from "node:assert/strict";
import test from "node:test";

import type { DocumentFlowItem, DocumentSectionHeading, QuestionBlock } from "./editorDocumentNormalization.ts";
import {
  firstDocumentFlowAnchor,
  firstQuestionAnchor,
  plannedSectionHeadingAdd,
  plannedSectionHeadingMove,
  plannedSectionHeadingRemoval,
  topLevelFlowInsertIndex,
  updatedSectionHeadings,
} from "./editorSectionHeadings.ts";

const questions = [
  { id: "q1", section: "", marks: 1, contentBlocks: [], parts: [], itemOrder: [] },
  { id: "q2", section: "", marks: 1, contentBlocks: [], parts: [], itemOrder: [] },
] satisfies QuestionBlock[];

const headings = [
  { id: "h1", title: "First" },
  { id: "h2", title: "Second" },
] satisfies DocumentSectionHeading[];

function normalizeDocumentFlow(value: unknown, currentQuestions: QuestionBlock[], currentHeadings: DocumentSectionHeading[]) {
  const flow = Array.isArray(value) ? (value as DocumentFlowItem[]) : [];
  const questionIds = new Set(currentQuestions.map((question) => question.id));
  const headingIds = new Set(currentHeadings.map((heading) => heading.id));
  const normalized = flow.filter((item) =>
    item.kind === "question" ? questionIds.has(item.id) : item.kind === "sectionHeading" && headingIds.has(item.id),
  );
  for (const heading of currentHeadings) {
    if (!normalized.some((item) => item.kind === "sectionHeading" && item.id === heading.id)) {
      normalized.push({ kind: "sectionHeading", id: heading.id });
    }
  }
  for (const question of currentQuestions) {
    if (!normalized.some((item) => item.kind === "question" && item.id === question.id)) {
      normalized.push({ kind: "question", id: question.id });
    }
  }
  return normalized;
}

test("question and document flow anchors fall back predictably", () => {
  assert.equal(firstQuestionAnchor(questions), "q:q1");
  assert.equal(firstQuestionAnchor([]), "front-matter");
  assert.equal(firstDocumentFlowAnchor([{ kind: "sectionHeading", id: "h1" }], questions), "sh:h1");
  assert.equal(firstDocumentFlowAnchor([], questions), "q:q1");
});

test("topLevelFlowInsertIndex inserts after headings and before selected questions", () => {
  const flow = [
    { kind: "sectionHeading", id: "h1" },
    { kind: "question", id: "q1" },
    { kind: "question", id: "q2" },
  ] satisfies DocumentFlowItem[];

  assert.equal(topLevelFlowInsertIndex("sh:h1", flow), 1);
  assert.equal(topLevelFlowInsertIndex("q:q2", flow), 2);
  assert.equal(topLevelFlowInsertIndex("front-matter", flow), 3);
});

test("plannedSectionHeadingAdd inserts a new heading at the active flow position", () => {
  const plan = plannedSectionHeadingAdd({
    headingId: "h3",
    anchor: "q:q2",
    documentFlow: [
      { kind: "sectionHeading", id: "h1" },
      { kind: "question", id: "q1" },
      { kind: "question", id: "q2" },
    ],
    questions,
    sectionHeadings: [headings[0]],
    normalizeDocumentFlow,
  });

  assert.deepEqual(plan.heading, { id: "h3", title: "Section heading" });
  assert.equal(plan.anchor, "sh:h3");
  assert.deepEqual(
    plan.sectionHeadings.map((heading) => heading.id),
    ["h1", "h3"],
  );
  assert.deepEqual(plan.documentFlow, [
    { kind: "sectionHeading", id: "h1" },
    { kind: "question", id: "q1" },
    { kind: "sectionHeading", id: "h3" },
    { kind: "question", id: "q2" },
  ]);
});

test("updatedSectionHeadings only returns a new list for real title changes", () => {
  assert.equal(updatedSectionHeadings(headings, "missing", "Other"), null);
  assert.equal(updatedSectionHeadings(headings, "h1", "First"), null);
  assert.deepEqual(updatedSectionHeadings(headings, "h1", "Renamed"), [
    { id: "h1", title: "Renamed" },
    { id: "h2", title: "Second" },
  ]);
  assert.deepEqual(updatedSectionHeadings(headings, "h1", { titlePage: { instructionsBody: "No calculator." } }), [
    { id: "h1", title: "First", titlePage: { instructionsBody: "No calculator." } },
    { id: "h2", title: "Second" },
  ]);
});

test("plannedSectionHeadingRemoval removes the heading and selects a nearby fallback", () => {
  const plan = plannedSectionHeadingRemoval({
    sectionHeadingId: "h1",
    documentFlow: [
      { kind: "sectionHeading", id: "h1" },
      { kind: "question", id: "q1" },
      { kind: "sectionHeading", id: "h2" },
      { kind: "question", id: "q2" },
    ],
    questions,
    sectionHeadings: headings,
    normalizeDocumentFlow,
  });

  assert.ok(plan);
  assert.deepEqual(
    plan.sectionHeadings.map((heading) => heading.id),
    ["h2"],
  );
  assert.deepEqual(plan.documentFlow, [
    { kind: "question", id: "q1" },
    { kind: "sectionHeading", id: "h2" },
    { kind: "question", id: "q2" },
  ]);
  assert.equal(plan.fallbackAnchor, "q:q1");
  assert.equal(plan.fallbackQuestionId, "q1");
});

test("plannedSectionHeadingMove reorders headings inside normalized document flow", () => {
  const plan = plannedSectionHeadingMove({
    sectionHeadingId: "h2",
    direction: -1,
    documentFlow: [
      { kind: "sectionHeading", id: "h1" },
      { kind: "sectionHeading", id: "h2" },
      { kind: "question", id: "q1" },
      { kind: "question", id: "q2" },
    ],
    questions,
    sectionHeadings: headings,
    normalizeDocumentFlow,
  });

  assert.ok(plan);
  assert.equal(plan.anchor, "sh:h2");
  assert.deepEqual(plan.documentFlow, [
    { kind: "sectionHeading", id: "h2" },
    { kind: "sectionHeading", id: "h1" },
    { kind: "question", id: "q1" },
    { kind: "question", id: "q2" },
  ]);
});

test("plannedSectionHeadingMove returns null for invalid moves", () => {
  assert.equal(
    plannedSectionHeadingMove({
      sectionHeadingId: "h1",
      direction: -1,
      documentFlow: [
        { kind: "sectionHeading", id: "h1" },
        { kind: "question", id: "q1" },
      ],
      questions,
      sectionHeadings: [headings[0]],
      normalizeDocumentFlow,
    }),
    null,
  );
});
