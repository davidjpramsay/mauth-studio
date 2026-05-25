import assert from "node:assert/strict";
import test from "node:test";

import {
  documentSummaryWithMauthTargetReference,
  extractMauthTargetReferences,
  firstMauthTargetReference,
  isMauthTargetReferenceAnchor,
  mauthTargetReferenceModuleAnchor,
  mauthTargetReferenceParentAnchor,
} from "./mauthAssistantTargetReferences.ts";

test("extracts unique Mauth target reference anchors from assistant text", () => {
  const text = [
    "Mauth reference: @mauth[q:q1/b:d1]",
    "Make this wider.",
    "Duplicate @mauth[q:q1/b:d1] and another @mauth[q:q1/p:p1/s:s1/b:space-2].",
  ].join("\n");

  assert.deepEqual(extractMauthTargetReferences(text), ["q:q1/b:d1", "q:q1/p:p1/s:s1/b:space-2"]);
  assert.equal(firstMauthTargetReference(text), "q:q1/b:d1");
});

test("accepts document, question, column, and graph-child reference anchors", () => {
  assert.equal(isMauthTargetReferenceAnchor("front-matter"), true);
  assert.equal(isMauthTargetReferenceAnchor("pb:q1"), true);
  assert.equal(isMauthTargetReferenceAnchor("q:q1"), true);
  assert.equal(isMauthTargetReferenceAnchor("q:q1/b:columns-1/c:0/b:space-2"), true);
  assert.equal(isMauthTargetReferenceAnchor("q:q1/b:d1/gf:0"), true);
  assert.equal(isMauthTargetReferenceAnchor("q:q1/b:d1/gfeat:12"), true);
  assert.equal(isMauthTargetReferenceAnchor("q:q1/b:d1/gang:0"), true);
  assert.equal(isMauthTargetReferenceAnchor("q:q1/b:d1/gdec:2"), true);
});

test("rejects malformed, whitespace, and overlong reference tokens", () => {
  assert.equal(firstMauthTargetReference("@mauth[q:q1 /b:d1]"), null);
  assert.equal(firstMauthTargetReference("@mauth[https://example.com]"), null);
  assert.equal(firstMauthTargetReference(`@mauth[q:${"x".repeat(260)}]`), null);
  assert.deepEqual(extractMauthTargetReferences("@mauth[] @mauth[not an anchor] @mauth[../bad]"), []);
});

test("maps graph child anchors back to their parent module anchor", () => {
  assert.equal(mauthTargetReferenceParentAnchor("q:q1/b:d1/gf:0"), "q:q1/b:d1");
  assert.equal(mauthTargetReferenceParentAnchor("q:q1/b:d1/gfeat:2"), "q:q1/b:d1");
  assert.equal(mauthTargetReferenceParentAnchor("q:q1/b:d1"), null);
  assert.equal(mauthTargetReferenceModuleAnchor("q:q1/b:d1/gang:1"), "q:q1/b:d1");
  assert.equal(mauthTargetReferenceModuleAnchor("q:q1/b:d1"), "q:q1/b:d1");
});

test("adds compact selected-module context to document summaries", () => {
  const summary = documentSummaryWithMauthTargetReference({ questions: [{ id: "q1", index: 0 }] }, "q:q1/b:d1/gfeat:0", {
    target: { kind: "questionBlock", questionId: "q1", questionNumber: 1, blockId: "d1" },
    question: {
      id: "q1",
      questionNumber: 1,
      totalMarks: 4,
      selectedBlock: {
        id: "d1",
        kind: "diagram",
        anchor: "q:q1/b:d1",
        owner: "question:q1",
        visibility: "student",
        diagramType: "graph2d",
      },
      diagrams: [
        {
          id: "d1",
          anchor: "q:q1/b:d1",
          graphType: "graph2d",
          summary: { renderer: "graph2d", size: { widthPx: 320 } },
          warnings: [{ code: "rendered-diagram-too-small", severity: "warning", message: "Small diagram." }],
        },
      ],
    },
  });
  const reference = summary.assistantTargetReference as Record<string, unknown>;
  const selectedBlock = reference.selectedBlock as Record<string, unknown>;
  const selectedDiagram = reference.selectedDiagram as Record<string, unknown>;

  assert.equal(reference.activeAnchor, "q:q1/b:d1/gfeat:0");
  assert.equal(reference.moduleAnchor, "q:q1/b:d1");
  assert.equal(selectedBlock.id, "d1");
  assert.equal(selectedBlock.diagramType, "graph2d");
  assert.equal(selectedDiagram.graphType, "graph2d");
});

test("adds selected geometry2d primitive context to document summaries", () => {
  const summary = documentSummaryWithMauthTargetReference({ questions: [{ id: "q1", index: 0 }] }, "q:q1/b:g1/gang:0", {
    target: { kind: "questionBlock", questionId: "q1", questionNumber: 1, blockId: "g1" },
    question: {
      id: "q1",
      questionNumber: 1,
      selectedBlock: {
        id: "g1",
        kind: "diagram",
        anchor: "q:q1/b:g1",
        owner: "question:q1",
        visibility: "student",
        diagramType: "geometry2d",
      },
      diagrams: [
        {
          id: "g1",
          anchor: "q:q1/b:g1",
          graphType: "geometry2d",
          summary: {
            renderer: "geometry2d",
            data: {
              angles: [{ id: "AOB", points: ["A", "O", "B"], label: "$90^\\circ$" }],
            },
          },
          warnings: [],
        },
      ],
    },
  });
  const reference = summary.assistantTargetReference as Record<string, unknown>;
  const primitive = reference.selectedGeometryPrimitive as Record<string, unknown>;

  assert.equal(reference.activeAnchor, "q:q1/b:g1/gang:0");
  assert.equal(reference.moduleAnchor, "q:q1/b:g1");
  assert.equal(primitive.kind, "angle");
  assert.equal(primitive.index, 0);
  assert.equal(primitive.label, "Angle 1: AOB");
});
