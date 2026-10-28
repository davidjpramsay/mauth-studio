import assert from "node:assert/strict";
import test from "node:test";
import { inspectDocumentDiagrams } from "./mauthDocumentDiagramInspection.ts";
import { diagramRequirementIssues } from "../../../../packages/shared/src/diagramCapabilities.ts";

test("diagram inspection validates nested content and reports unmeasured layout honestly", () => {
  const document = {
    questions: [
      {
        id: "q",
        marks: 1,
        text: "A circle theorem",
        contentBlocks: [
          {
            id: "cols",
            kind: "columns" as const,
            columns: [
              [
                {
                  id: "circle",
                  kind: "diagram" as const,
                  graphConfig: { type: "geometricConstruction", widthPx: undefined, options: { substanceSource: "Point A" } },
                },
              ],
            ],
          },
        ],
      },
    ],
  };
  const before = structuredClone(document);
  const result = inspectDocumentDiagrams(document, { blockId: "circle", requirements: { purpose: "geometry", draggableLabels: true } });
  assert.equal(result.length, 1);
  assert.equal(result[0].tool.selectedToolAssessment?.eligible, false);
  assert.equal(result[0].construction.schemaValid, true);
  assert.equal(result[0].construction.proofStatus, "notCertified");
  assert.deepEqual(result[0].renderedLayout, { status: "notMeasured", note: "No rendered preview was inspected." });
  assert.deepEqual(document, before);
  assert.deepEqual(inspectDocumentDiagrams(document, { blockId: "missing" }), []);
});

test("requirement validation rejects malformed/unknown requests instead of dropping them", () => {
  assert.deepEqual(diagramRequirementIssues({ purpose: "geometry", draggableLabels: false, requiredFeatures: ["angleMarks"] }), []);
  for (const value of [
    null,
    [],
    { exactPositioning: "yes" },
    { relationships: "parallel" },
    { purpose: "unknown" },
    { magicFeature: true },
  ])
    assert.ok(diagramRequirementIssues(value).length);
});

test("mathematical segment and angle notation identifies its named points", () => {
  const config = {
    type: "geometricConstruction",
    data: {},
    options: {
      substanceSource:
        "Point O, A, B, C\nCircle omega\nCircleThrough(omega,O,A)\nOnCircle(B,omega)\nOnCircle(C,omega)\nLabel O $O$\nLabel A $A$\nLabel B $B$\nLabel C $C$",
    },
  };
  const doc = {
    questions: [
      {
        id: "q",
        marks: 0,
        text: "$AB$ is a diameter with centre $O$. Point $C$ lies on the circle and $AC=BC$.",
        contentBlocks: [{ id: "d", kind: "diagram" as const, graphConfig: config }],
      },
    ],
  };
  assert.equal(
    inspectDocumentDiagrams(doc)[0].construction.semantic.warnings.some((w) => w.code === "penrose-visible-auxiliary-label"),
    false,
  );
});
