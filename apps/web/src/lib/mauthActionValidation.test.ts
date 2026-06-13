import assert from "node:assert/strict";
import test from "node:test";

import { validateMauthDocumentActionPayloads } from "./mauthActionValidation.ts";

test("graph2d line segment features accept grid span mode", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "diagram.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d1",
      graphConfig: {
        type: "graph2d",
        features: [{ kind: "line_segment", x1: -1, y1: -7, x2: -1, y2: 5, span: "grid" }],
      },
    },
  ]);

  assert.equal(result.ok, true);
});

test("graph2d line segment features reject invalid span mode", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "diagram.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d1",
      graphConfig: {
        type: "graph2d",
        features: [{ kind: "line_segment", x1: -1, y1: -7, x2: -1, y2: 5, span: "full" }],
      },
    },
  ]);

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.path === "actions[0].graphConfig.features[0].span"),
    true,
  );
});

test("section heading actions validate document flow targets", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "sectionHeading.add",
      heading: { id: "section-1", title: "Multiple choice" },
      beforeItem: { kind: "question", id: "q1" },
    },
    {
      type: "sectionHeading.reorder",
      sectionHeadingId: "section-1",
      targetItem: { kind: "question", id: "q2" },
      placement: "after",
    },
  ]);

  assert.equal(result.ok, true);
});

test("section heading actions reject ambiguous placement", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "sectionHeading.add",
      heading: { id: "section-1", title: "Multiple choice" },
      beforeItem: { kind: "question", id: "q1" },
      afterItem: { kind: "question", id: "q2" },
    },
  ]);

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.path === "actions[0]"),
    true,
  );
});
