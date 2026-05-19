import assert from "node:assert/strict";
import test from "node:test";

import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import type { MauthDocumentLike, MauthQuestionLike } from "./mauthActions.ts";
import {
  validateAssistantDiagramPreservationBeforeCommit,
  validateAssistantDiagramSemanticsBeforeCommit,
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

function solutionTableBlock(id: string, markTicks: number): ContentBlock {
  return {
    id,
    kind: "table",
    headers: ["$x$", "1"],
    rows: [["$P(X=x)$", "$1$"]],
    visibility: "solution",
    markTicks,
  };
}

function penroseDiagramBlock(id: string, substanceSource: string): ContentBlock {
  return {
    id,
    kind: "diagram",
    graphConfig: {
      type: "geometricConstruction",
      data: {},
      options: { substanceSource },
    },
  };
}

function vector2dDiagramBlock(id: string, graphConfig: GraphConfig): ContentBlock {
  return {
    id,
    kind: "diagram",
    graphConfig,
  };
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

test("assistant solution preflight accepts table surface ticks that match item marks", () => {
  const document = documentFixture(
    question("q1", [textBlock("t1", "Complete the table."), spaceBlock("s1"), solutionTableBlock("table-solution", 2)], 2),
  );

  const result = validateAssistantSolutionMarkingBeforeCommit(document, { toolName: "mauth.author.replaceQuestion", reason: "test" }, [
    "table-solution",
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

test("assistant semantic preflight rejects changed Penrose circle diagrams that do not match the prompt", () => {
  const document = documentFixture(
    question(
      "q1",
      [
        textBlock(
          "t1",
          "A, B and C are points on a circle. The tangent to the circle at A is parallel to the chord BC. Prove that AB = AC.",
        ),
        penroseDiagramBlock(
          "d1",
          [
            "Point O, A, B, C",
            "Circle omega",
            "Line drawnLine",
            "NamedSegment AB, AC",
            "Label O $O$",
            "Label A $A$",
            "Label B $B$",
            "Label C $C$",
            "CircleThrough(omega, O, A)",
            "OnCircle(B, omega)",
            "Segment(AB, A, B)",
            "Segment(AC, A, C)",
          ].join("\n"),
        ),
        spaceBlock("s1"),
      ],
      5,
    ),
  );

  const result = validateAssistantDiagramSemanticsBeforeCommit(document, { toolName: "mauth.author.addDiagram", reason: "test" }, ["d1"]);
  const messages = (result.validationIssues ?? []).map((issue) => issue.message).join("\n");

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /diagram preflight failed/i);
  assert.match(messages, /Tangent/);
  assert.match(messages, /ParallelToSegment/);
  assert.match(messages, /Segment/);
});

test("assistant diagram preflight rejects scalar-product Penrose diagrams in favour of vector2d source rays", () => {
  const document = documentFixture(
    question(
      "q1",
      [
        textBlock("t1", "Evaluate the scalar products $\\mathbf{a}\\cdot\\mathbf{b}$ and $\\mathbf{c}\\cdot\\mathbf{d}$ exactly."),
        penroseDiagramBlock(
          "d1",
          [
            "Point O, A, B, C, D",
            "NamedSegment OA, OB, OC, OD",
            "Segment(OA, O, A)",
            "Segment(OB, O, B)",
            "Segment(OC, O, C)",
            "Segment(OD, O, D)",
            "Label A $\\mathbf{a}$",
            "Label B $\\mathbf{b}$",
          ].join("\n"),
        ),
        spaceBlock("s1"),
      ],
      5,
    ),
  );

  const result = validateAssistantDiagramSemanticsBeforeCommit(document, { toolName: "mauth.author.addDiagram", reason: "test" }, ["d1"]);

  assert.equal(result.ok, false);
  assert(result.validationIssues?.some((issue) => issue.message.includes("$\\mathbf{c}$")));
  assert(result.validationIssues?.some((issue) => issue.path.endsWith("graphConfig.options.substanceSource")));
});

test("assistant diagram preflight accepts source-faithful scalar-product vector2d diagrams", () => {
  const document = documentFixture(
    question(
      "q1",
      [
        textBlock(
          "t1",
          "Evaluate the following scalar products exactly: $\\mathbf{a}\\cdot\\mathbf{b}$, $\\mathbf{a}\\cdot\\mathbf{d}$ and $\\mathbf{c}\\cdot\\mathbf{d}$.",
        ),
        vector2dDiagramBlock("d1", {
          type: "vector2d",
          widthPx: 520,
          heightPx: 340,
          xMin: -2.6,
          xMax: 2.6,
          yMin: -2.1,
          yMax: 3.4,
          showAxes: false,
          showGrid: false,
          showAxisLabels: false,
          showAxisNumbers: false,
          metadata: {
            vector2d: {
              labelStyle: "custom",
              vectors: [
                { id: "a", name: "a", label: "\\mathbf{a}", start: [0, 0], components: [-1.65, -1.4] },
                { id: "b", name: "b", label: "\\mathbf{b}", start: [0, 0], components: [-1.29, 1.53] },
                { id: "c", name: "c", label: "\\mathbf{c}", start: [0, 0], components: [0.25, 2.9] },
                { id: "d", name: "d", label: "\\mathbf{d}", start: [0, 0], components: [1.65, 1.4] },
              ],
              segmentLabels: [
                { vectorId: "a", label: "2\\ \\text{units}" },
                { vectorId: "b", label: "2\\ \\text{units}" },
                { vectorId: "c", label: "3\\ \\text{units}" },
                { vectorId: "d", label: "2\\ \\text{units}" },
              ],
              angleMarkers: [
                { from: "b", to: "d", rightAngle: true, radius: 0.35 },
                { from: "c", to: "d", label: "45^\\circ", radius: 0.55 },
              ],
            },
          },
        }),
        spaceBlock("s1"),
      ],
      5,
    ),
  );

  const result = validateAssistantDiagramSemanticsBeforeCommit(document, { toolName: "mauth.author.addDiagram", reason: "test" }, ["d1"]);

  assert.equal(result.ok, true);
});

test("assistant diagram preflight gives scalar-product raw-label repair hints", () => {
  const document = documentFixture(
    question(
      "q1",
      [
        textBlock("t1", "Evaluate $\\mathbf{c}\\cdot\\mathbf{d}$ from the scalar product diagram."),
        vector2dDiagramBlock("d1", {
          type: "vector2d",
          showAxes: false,
          showGrid: false,
          metadata: {
            vector2d: {
              labelStyle: "custom",
              vectors: [
                { id: "c", name: "c", label: "\\mathbf{c}", start: [0, 0], components: [0.52, 2.95] },
                { id: "d", name: "d", label: "\\mathbf{d}", start: [0, 0], components: [1.638, 1.147] },
              ],
              segmentLabels: [{ vectorId: "d", label: "2 units" }],
              angleMarkers: [{ from: "c", to: "d", label: "45°" }],
            },
          },
        }),
        spaceBlock("s1"),
      ],
      2,
    ),
  );

  const result = validateAssistantDiagramSemanticsBeforeCommit(document, { toolName: "mauth.author.addDiagram", reason: "test" }, ["d1"]);
  const expectedText = (result.validationIssues ?? []).map((issue) => issue.expected ?? "").join("\n");

  assert.equal(result.ok, false);
  assert.match(expectedText, /2\\ \\text\{units\}/);
  assert.match(expectedText, /45\^\\circ/);
});

test("assistant semantic preflight accepts changed Penrose circle diagrams that match the prompt", () => {
  const document = documentFixture(
    question(
      "q1",
      [
        textBlock(
          "t1",
          "A, B and C are points on a circle. The tangent to the circle at A is parallel to the chord BC. Prove that AB = AC.",
        ),
        penroseDiagramBlock(
          "d1",
          [
            "Point O, A, B, C",
            "Circle omega",
            "Line tangentA",
            "NamedSegment AB, AC, BC",
            "Label O $\\,$",
            "Label A $A$",
            "Label B $B$",
            "Label C $C$",
            "HidePoint(O)",
            "CircleThrough(omega, O, A)",
            "OnCircle(B, omega)",
            "OnCircle(C, omega)",
            "Tangent(tangentA, omega, A)",
            "ParallelToSegment(tangentA, B, C)",
            "Segment(AB, A, B)",
            "Segment(AC, A, C)",
            "Segment(BC, B, C)",
          ].join("\n"),
        ),
        spaceBlock("s1"),
      ],
      5,
    ),
  );

  const result = validateAssistantDiagramSemanticsBeforeCommit(document, { toolName: "mauth.author.addDiagram", reason: "test" }, ["d1"]);

  assert.equal(result.ok, true);
});
