import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_VECTOR_2D_GRAPH } from "./diagramVector2d.ts";
import {
  vector2dAxesVisibilityPatch,
  vector2dGridVisibilityPatch,
  vector2dInspectorSelection,
  vector2dMajorGridStepPatch,
  vector2dMinorGridStepPatch,
} from "./vector2dInspectorSelection.ts";

test("vector2d inspector selection normalizes renderer defaults", () => {
  assert.deepEqual(vector2dInspectorSelection({ type: "vector2d" }), {
    title: "Vector settings",
    labelStyle: "boldLower",
    showAxes: true,
    showGrid: true,
    showMinorGrid: false,
    equalScale: false,
  });

  assert.deepEqual(
    vector2dInspectorSelection({
      ...DEFAULT_VECTOR_2D_GRAPH,
      showAxes: false,
      showGrid: false,
      showMinorGrid: true,
      equalScale: true,
      metadata: { vector2d: { labelStyle: "arrow" } },
    }),
    {
      title: "Vector settings",
      labelStyle: "arrow",
      showAxes: false,
      showGrid: false,
      showMinorGrid: true,
      equalScale: true,
    },
  );
});

test("vector2d inspector patches preserve existing visibility behavior", () => {
  assert.deepEqual(vector2dAxesVisibilityPatch({ type: "vector2d", showArrows: true }, false), {
    showAxes: false,
    showArrows: false,
  });
  assert.deepEqual(vector2dAxesVisibilityPatch({ type: "vector2d", showArrows: false }, true), {
    showAxes: true,
    showArrows: false,
  });
  assert.deepEqual(vector2dGridVisibilityPatch(false), { showGrid: false, showMajorGrid: false });
  assert.deepEqual(vector2dGridVisibilityPatch(true), { showGrid: true, showMajorGrid: true });
});

test("vector2d grid-step patches keep axis labels attached to major steps", () => {
  assert.deepEqual(vector2dMajorGridStepPatch("x", 2), { gridMajorStepX: 2, axisLabelStepX: 2 });
  assert.deepEqual(vector2dMajorGridStepPatch("y", undefined), { gridMajorStepY: undefined, axisLabelStepY: undefined });
  assert.deepEqual(vector2dMinorGridStepPatch("x", 0.5), { gridMinorStepX: 0.5 });
  assert.deepEqual(vector2dMinorGridStepPatch("y", 0.25), { gridMinorStepY: 0.25 });
});
