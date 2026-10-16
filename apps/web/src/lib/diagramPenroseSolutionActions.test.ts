import assert from "node:assert/strict";
import test from "node:test";

import type { GraphConfig } from "@mauth-studio/shared";

import {
  createPenroseSolutionPoint,
  createPenroseSolutionSegment,
  penroseConfigHasSolutionOnly,
  previewPenroseConfigForSolutionVisibility,
  updatePenroseElement,
} from "./diagramPenroseSolution.ts";

test("Penrose points and segments follow the active solution layer", () => {
  const objects = [{ type: "point", name: "A", label: "A" }];
  const point = createPenroseSolutionPoint(objects, true);
  const segment = createPenroseSolutionSegment([...objects, point], [], true);
  assert.equal(point.solutionOnly, true);
  assert.equal(segment.solutionOnly, true);
  assert.deepEqual(segment.points, ["A", point.name]);
});

test("student Penrose visibility removes answer geometry and dependent relationships", () => {
  const config: GraphConfig = {
    type: "geometricConstruction",
    data: {
      objects: [
        { type: "point", name: "A" },
        { type: "point", name: "B", solutionOnly: true },
      ],
      relationships: [
        { type: "segment", name: "AB", points: ["A", "B"], solutionOnly: true },
        { type: "labelLength", between: ["A", "B"], value: "5" },
      ],
    },
  };
  assert.equal(penroseConfigHasSolutionOnly(config), true);
  const student = previewPenroseConfigForSolutionVisibility(config, false);
  const data = student.data as { objects: Array<{ name: string }>; relationships: unknown[] };
  assert.deepEqual(
    data.objects.map((object) => object.name),
    ["A"],
  );
  assert.deepEqual(data.relationships, []);
  assert.equal(previewPenroseConfigForSolutionVisibility(config, true), config);
});

test("student Venn visibility preserves the region slot but blanks its answer", () => {
  const config: GraphConfig = {
    type: "setDiagram",
    data: {
      universe: { name: "U", label: "U" },
      sets: [
        { name: "A", label: "A" },
        { name: "B", label: "B" },
      ],
      regions: [
        { name: "onlyA", label: "7", shaded: true, solutionOnly: true },
        { name: "intersection", label: "2" },
      ],
    },
  };
  const student = previewPenroseConfigForSolutionVisibility(config, false);
  const regions = (student.data as { regions: Array<Record<string, unknown>> }).regions;
  assert.equal(regions[0].label, "");
  assert.equal(regions[0].shaded, false);
  assert.equal(regions[1].label, "2");
});

test("solution-only Venn totals retain blank badge geometry for students", () => {
  const config: GraphConfig = {
    type: "setDiagram",
    data: {
      totalsSolutionOnly: true,
      universe: { name: "U", countLabel: "90" },
      sets: [
        { name: "M", countLabel: "50" },
        { name: "D", countLabel: "36" },
      ],
      regions: [{ name: "onlyA", label: "32", solutionOnly: true }],
    },
  };
  assert.equal(penroseConfigHasSolutionOnly(config), true);
  const student = previewPenroseConfigForSolutionVisibility(config, false);
  const data = student.data as {
    universe: { countBlank: boolean };
    sets: Array<{ countBlank: boolean }>;
    regions: Array<{ label: string }>;
  };
  assert.equal(data.universe.countBlank, true);
  assert.ok(data.sets.every((set) => set.countBlank));
  assert.equal(data.regions[0].label, "");
  assert.equal(previewPenroseConfigForSolutionVisibility(config, true), config);
  assert.equal((config.data as Record<string, unknown>).countBlank, undefined);
});

test("Penrose element updates preserve sibling records and clear stale Substance", () => {
  const config: GraphConfig = {
    type: "network",
    data: {
      hidePoints: false,
      objects: [
        { type: "point", name: "A", label: "A" },
        { type: "point", name: "B", label: "B" },
      ],
      relationships: [{ type: "segment", name: "AB", points: ["A", "B"], label: "shared" }],
    },
    options: { variation: "fixed", substanceSource: "Point A, B" },
  };
  const patch = updatePenroseElement(config, { kind: "relationship", id: "AB" }, { label: "answer", solutionOnly: true });
  assert.ok(patch);
  const data = patch.data as { objects: unknown[]; relationships: Array<Record<string, unknown>> };
  assert.equal(data.objects.length, 2);
  assert.equal(data.relationships[0].label, "answer");
  assert.equal(data.relationships[0].solutionOnly, true);
  assert.equal(patch.options?.variation, "fixed");
  assert.equal(patch.options?.substanceSource, undefined);
});
