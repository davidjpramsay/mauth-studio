import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_3D_VIEW_STATE } from "./diagram3d.ts";
import { graph3dInspectorSelection } from "./graph3dInspectorSelection.ts";
import { graph3dResetViewPatch, graph3dViewPatch } from "./moduleSettingsPatches.ts";

test("graph3d inspector selection normalizes dimensions and camera state", () => {
  assert.deepEqual(graph3dInspectorSelection({ type: "graph3d" }), {
    title: "3D settings",
    widthPx: 420,
    heightPx: 320,
    view: DEFAULT_3D_VIEW_STATE,
  });

  assert.deepEqual(
    graph3dInspectorSelection({
      type: "graph3d",
      widthPx: 500,
      heightPx: 360,
      metadata: { view3d: { az: 2, el: 0.5, bank: -0.25 } },
    }),
    {
      title: "3D settings",
      widthPx: 500,
      heightPx: 360,
      view: { az: 2, el: 0.5, bank: -0.25 },
    },
  );
});

test("graph3d camera patches preserve sibling metadata and reset only the view", () => {
  const config = { type: "graph3d", metadata: { keep: true, view3d: { az: 1, el: 0.3, bank: 0 } } };
  assert.deepEqual(graph3dViewPatch(config, { az: 2 }), {
    metadata: { keep: true, view3d: { az: 2, el: 0.3, bank: 0 } },
  });
  assert.deepEqual(graph3dResetViewPatch(config), {
    metadata: { keep: true, view3d: DEFAULT_3D_VIEW_STATE },
  });
});
