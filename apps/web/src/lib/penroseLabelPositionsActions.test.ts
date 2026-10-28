import assert from "node:assert/strict";
import test from "node:test";
import { applyMauthAction } from "./mauthActions.ts";
import { validateMauthDocumentActionPayloads } from "./mauthActionValidation.ts";
import { penroseLabelPositionPatch } from "./diagramPenrose.ts";
import { previewPenroseConfigForSolutionVisibility } from "./diagramPenroseSolution.ts";
import { penroseRelationshipsWithLabelIds } from "../../../../packages/shared/src/penroseLabels.ts";

for (const renderer of ["geometricConstruction", "network"] as const) {
  const config = {
    type: renderer,
    options: { variation: "keep-layout", substanceSource: "Point A, B\nLabel A $A$\nLabel B $B$", custom: "retained" },
    data: { objects: [{ name: "A" }, { name: "B", solutionOnly: true }], relationships: [] },
    metadata: { teacher: "retained" },
  };
  const document = {
    questions: [{ id: "q", marks: 1, text: "Geometry", contentBlocks: [{ id: "d", kind: "diagram" as const, graphConfig: config }] }],
  };
  const scope = { kind: "question" as const, questionId: "q" };

  test(`${renderer} label actions preserve source, geometry, hidden answers and unrelated offsets`, () => {
    const move = {
      type: "diagram.settings.update" as const,
      scope,
      blockId: "d",
      settings: { renderer, labelOffset: { id: "A.labelText", offset: [12, -6] as [number, number] } },
    };
    assert.equal(validateMauthDocumentActionPayloads([move]).ok, true);
    const result = applyMauthAction(document.questions, move);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const changed = result.questions[0].contentBlocks[0].graphConfig;
    assert.deepEqual(changed, { ...config, options: { ...config.options, labelOffsets: { "A.labelText": [12, -6] } } });
    const visible = previewPenroseConfigForSolutionVisibility(changed, false);
    assert.equal(visible.options?.substanceSource, config.options.substanceSource);
    const next = { ...changed, ...penroseLabelPositionPatch(changed, "diameter.text", [0, 8]) };
    assert.deepEqual(next.options?.labelOffsets, { "A.labelText": [12, -6], "diameter.text": [0, 8] });
    const resetOne = { ...next, ...penroseLabelPositionPatch(next, "A.labelText", null) };
    assert.deepEqual(resetOne.options?.labelOffsets, { "diameter.text": [0, 8] });
    const reset = applyMauthAction(result.questions, { ...move, settings: { renderer, resetLabelPositions: true } });
    assert.equal(reset.ok, true);
    if (reset.ok) assert.deepEqual(reset.questions[0].contentBlocks[0].graphConfig, config);
  });

  test(`${renderer} label positions reject malformed input at the action boundary`, () => {
    for (const labelOffset of [
      { id: "A", offset: [1, 2] },
      { id: "A.labelText", offset: [1] },
      { id: "A.labelText", offset: [1, Infinity] },
      { id: "A.labelText", offset: "move" },
    ]) {
      assert.equal(
        validateMauthDocumentActionPayloads([{ type: "diagram.settings.update", scope, blockId: "d", settings: { renderer, labelOffset } }])
          .ok,
        false,
      );
    }
    for (const offsets of [{ "A.labelText": [1, 2, 3] }, { "A.labelText": [NaN, 0] }, { "A.dot": [1, 2] }, []]) {
      assert.equal(
        validateMauthDocumentActionPayloads([
          {
            type: "diagram.update",
            scope,
            blockId: "d",
            graphConfig: { ...config, options: { ...config.options, labelOffsets: offsets } },
          },
        ]).ok,
        false,
      );
    }
  });
}

test("structured label identities survive filtering, reorder and label-text edits", () => {
  const relationships = [
    { type: "labelLength", id: "answer", between: ["B", "C"], value: "7", solutionOnly: true },
    { type: "labelLength", between: ["A", "B"], value: "5" },
  ];
  const identified = penroseRelationshipsWithLabelIds(relationships);
  const filtered = penroseRelationshipsWithLabelIds(identified.filter((r) => !r.solutionOnly));
  assert.equal(filtered[0]._mauthLabelId, identified[1]._mauthLabelId);
  const reordered = penroseRelationshipsWithLabelIds([relationships[1], relationships[0]]);
  assert.equal(reordered[0]._mauthLabelId, identified[1]._mauthLabelId);
  assert.equal(penroseRelationshipsWithLabelIds([{ ...relationships[1], value: "8" }])[0]._mauthLabelId, identified[1]._mauthLabelId);
  assert.equal(relationships[1]._mauthLabelId, undefined, "authored data is not mutated");
});
