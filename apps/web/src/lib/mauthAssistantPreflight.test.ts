import assert from "node:assert/strict";
import test from "node:test";

import type { ContentBlock } from "@mauth-studio/shared";

import type { MauthDocumentLike, MauthQuestionLike } from "./mauthActions.ts";
import {
  validateAssistantDiagramPreservationBeforeCommit,
  validateAssistantSolutionMarkingBeforeCommit,
} from "./mauthAssistantPreflight.ts";

function textBlock(id: string, text: string, visibility?: ContentBlock["visibility"]): ContentBlock {
  return { id, kind: "text", text, ...(visibility ? { visibility } : {}) };
}

function spaceBlock(id: string, lines = 8): ContentBlock {
  return { id, kind: "space", lines, visibility: "student" };
}

function diagramBlock(id: string): ContentBlock {
  return { id, kind: "diagram", graphConfig: { type: "statsChart", data: { chartType: "histogram" } } };
}

function question(id: string, blocks: ContentBlock[], marks = 2): MauthQuestionLike {
  return {
    id,
    marks,
    contentBlocks: blocks,
    parts: [],
    itemOrder: blocks.map((block) => ({ kind: "block", id: block.id })),
  };
}

function documentFixture(questionBlock: MauthQuestionLike): MauthDocumentLike<MauthQuestionLike> {
  return {
    frontMatter: {},
    questions: [questionBlock],
  };
}

test("assistant solution preflight accepts hidden ticks that match item marks", () => {
  const document = documentFixture(
    question("q1", [
      textBlock("t1", "Prove the result."),
      spaceBlock("s1"),
      textBlock("sol1", "**Solution.**\n\nFirst step. [[marks:1]]\nConclusion. [[marks:1]]", "solution"),
    ]),
  );

  const result = validateAssistantSolutionMarkingBeforeCommit(document, { toolName: "mauth.author.ensureSolutions", reason: "test" }, [
    "q1",
  ]);

  assert.equal(result.ok, true);
});

test("assistant solution preflight rejects visible mark notes and hidden tick mismatches", () => {
  const document = documentFixture(
    question("q1", [
      textBlock("t1", "Prove the result."),
      spaceBlock("s1"),
      textBlock("sol1", "**Solution (2 marks).**\n\nFirst step. [1 mark]\nConclusion.", "solution"),
    ]),
  );

  const result = validateAssistantSolutionMarkingBeforeCommit(document, { toolName: "mauth.actions.apply", reason: "test" }, ["sol1"]);

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /solution preflight failed/i);
  assert(result.validationIssues?.some((issue) => issue.message.includes("visible mark notes")));
  assert(result.validationIssues?.some((issue) => issue.message.includes("hidden solution mark")));
});

test("assistant preflight blocks accidental diagram deletion outside explicit question replacement", () => {
  const previousDocument = documentFixture(question("q1", [textBlock("t1", "Question."), diagramBlock("d1"), spaceBlock("s1")]));
  const nextDocument = documentFixture(question("q1", [textBlock("t1", "Question."), spaceBlock("s1")]));

  const result = validateAssistantDiagramPreservationBeforeCommit(
    previousDocument,
    nextDocument,
    { toolName: "mauth.author.ensureSolutions", reason: "test" },
    ["q1"],
  );

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /remove existing diagrams/i);
});

test("assistant preflight allows explicit question replacement to remove diagrams", () => {
  const previousDocument = documentFixture(question("q1", [textBlock("t1", "Question."), diagramBlock("d1"), spaceBlock("s1")]));
  const nextDocument = documentFixture(question("q1", [textBlock("t1", "Question."), spaceBlock("s1")]));

  const result = validateAssistantDiagramPreservationBeforeCommit(
    previousDocument,
    nextDocument,
    { toolName: "mauth.author.replaceQuestion", reason: "test" },
    ["q1"],
  );

  assert.equal(result.ok, true);
});
