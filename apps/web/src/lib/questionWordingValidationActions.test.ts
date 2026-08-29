import assert from "node:assert/strict";
import test from "node:test";

import type { ContentBlock } from "@mauth-studio/shared";

import { editorDocumentValidationResult, validateQuestionWordingStructure } from "./questionWordingValidation.ts";

const sharedText = (id: string, text: string): ContentBlock => ({ id, kind: "text", text, visibility: "always" });

test("leading shared text is redundant when Question wording is blank", () => {
  const issues = validateQuestionWordingStructure(
    [
      {
        id: "q1",
        text: "",
        contentBlocks: [sharedText("intro", "Calculate the volume of each solid.")],
        itemOrder: [{ kind: "block", id: "intro" }],
      },
    ],
    { startQuestionNumber: 4 },
  );

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.label, "Question 4");
  assert.match(issues[0]?.message ?? "", /Move it to Question wording/);
  assert.equal(issues[0]?.anchor, "q:q1");
});

test("question wording and deliberately ordered or special text blocks are preserved", () => {
  const questions = [
    {
      id: "worded",
      text: "Calculate the volume.",
      contentBlocks: [sharedText("extra", "Use $\\pi=3.14$.")],
      itemOrder: [{ kind: "block" as const, id: "extra" }],
    },
    {
      id: "after-part",
      text: "",
      contentBlocks: [sharedText("follow-up", "Now explain your result.")],
      itemOrder: [
        { kind: "part" as const, id: "part-a" },
        { kind: "block" as const, id: "follow-up" },
      ],
    },
    {
      id: "end",
      text: "",
      contentBlocks: [sharedText("end-marker", "**End of Test**")],
      itemOrder: [{ kind: "block" as const, id: "end-marker" }],
    },
  ];

  assert.deepEqual(validateQuestionWordingStructure(questions), []);
  assert.deepEqual(validateQuestionWordingStructure([questions[1]!], { notesDocument: true }), []);
});

test("document validation merges wording warnings without changing solution check totals", () => {
  const result = editorDocumentValidationResult({ checkedItems: 3, errorCount: 0, warningCount: 0, issues: [] }, [
    { id: "q1", text: "", contentBlocks: [sharedText("intro", "Shared prompt")], itemOrder: [] },
  ]);

  assert.equal(result.checkedItems, 3);
  assert.equal(result.checkedQuestions, 1);
  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 1);
});
