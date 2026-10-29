import assert from "node:assert/strict";
import test from "node:test";
import { graph3dConfigForSolutionVisibility, graph3dConfigWithLabelScreenOffset } from "./diagramGraph3d.ts";

test("3D label edits resolve full-data ids and preserve hidden answers and source styling", () => {
  const config = {
    type: "graph3d",
    metadata: { custom: "retained", view3d: { az: 1, el: 0.4, bank: 0, zoom: 1 } },
    data: {
      points: [
        { id: "A", coords: [0, 0, 0] },
        { id: "B", coords: [1, 0, 0] },
      ],
      dimensionLines: [
        { from: "A", to: "B", label: "answer", solutionOnly: true, color: "#123456", custom: "answer" },
        { from: "A", to: "B", label: "given", custom: "given" },
      ],
    },
  };
  const visible = graph3dConfigForSolutionVisibility(config, false, "#1d4ed8");
  assert.equal(visible.data.dimensionLines[0].id, "dimension-2");
  const moved = graph3dConfigWithLabelScreenOffset(config, "dimension", "dimension-2", [12, -8]);
  assert.deepEqual(moved.data.dimensionLines[0], { ...config.data.dimensionLines[0], id: "dimension-1" });
  assert.deepEqual(moved.data.dimensionLines[1], { ...config.data.dimensionLines[1], id: "dimension-2", labelScreenOffsetPx: [12, -8] });
  assert.deepEqual(moved.metadata, config.metadata);
  assert.deepEqual(moved.data.points, config.data.points);
  const reset = graph3dConfigWithLabelScreenOffset(moved, "dimension", "dimension-2", undefined);
  assert.equal(reset.data.dimensionLines[1].labelScreenOffsetPx, undefined);
  assert.equal(reset.data.dimensionLines[0].color, "#123456");
  assert.equal(graph3dConfigWithLabelScreenOffset(config, "dimension", "missing", [1, 2]), config);
});
