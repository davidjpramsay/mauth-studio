import assert from "node:assert/strict";
import test from "node:test";

import type { GraphConfig } from "@mauth-studio/shared";

import { generatedPenroseSubstance, penroseSubstanceSource } from "./diagramPenroseSubstance.ts";

test("generatedPenroseSubstance builds default geometry substance", () => {
  const substance = generatedPenroseSubstance({ type: "geometricConstruction" } as GraphConfig);

  assert.match(substance, /^Point A, B, C/m);
  assert.match(substance, /^Triangle\(A, B, C\)/m);
  assert.match(substance, /^RightAngle\(A, B, C\)/m);
  assert.match(substance, /^LabelsSegment\(sideLabel1, A, B\)/m);
});

test("generatedPenroseSubstance preserves named segments and tick counts", () => {
  const substance = generatedPenroseSubstance({
    type: "geometricConstruction",
    data: {
      objects: [
        { type: "point", name: "A" },
        { type: "point", name: "B" },
        { type: "point", name: "C" },
        { type: "point", name: "D" },
      ],
      relationships: [
        { type: "segment", name: "AB", points: ["A", "B"], label: "x" },
        { type: "segment", name: "CD", points: ["C", "D"], label: "x" },
        { type: "equalLength", segmentNames: ["AB", "CD"], markCount: 2 },
      ],
    },
  } as GraphConfig);

  assert.match(substance, /^NamedSegment AB, CD/m);
  assert.match(substance, /^Segment\(AB, A, B\)/m);
  assert.match(substance, /^EqualLength2\(AB, CD\)/m);
  assert.match(substance, /^LabelsSegment\(segmentLabel1, A, B\)/m);
});

test("generatedPenroseSubstance tags structured solution points, segments, and labels", () => {
  const substance = generatedPenroseSubstance({
    type: "network",
    data: {
      objects: [
        { type: "point", name: "A" },
        { type: "point", name: "B", solutionOnly: true },
      ],
      relationships: [{ type: "segment", name: "AB", points: ["A", "B"], label: "5", solutionOnly: true }],
    },
  } as GraphConfig);

  assert.match(substance, /^SolutionPoint\(B\)/m);
  assert.match(substance, /^SolutionSegment\(AB\)/m);
  assert.match(substance, /^SolutionLengthLabel\(segmentLabel1\)/m);
});

test("penroseSubstanceSource respects manual substance overrides", () => {
  assert.equal(
    penroseSubstanceSource({
      type: "geometricConstruction",
      options: { substanceSource: "Point P\nLabel P $P$\n" },
    } as GraphConfig),
    "Point P\nLabel P $P$\n",
  );
});

test("generatedPenroseSubstance delegates set diagrams to set substance", () => {
  const substance = generatedPenroseSubstance({ type: "setDiagram" } as GraphConfig);

  assert.match(substance, /^Universe U/m);
  assert.match(substance, /^Set A, B/m);
  assert.match(substance, /^RegionLabel onlyA, intersection, onlyB, outside/m);
});
