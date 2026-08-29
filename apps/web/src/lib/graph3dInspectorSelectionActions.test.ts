import assert from "node:assert/strict";
import test from "node:test";
import type { GraphConfig } from "@mauth-studio/shared";

import { DEFAULT_3D_VIEW_STATE } from "./diagram3d.ts";
import {
  graph3dChildScrollAnchor,
  graph3dElementInspectorSelection,
  graph3dInspectorSelection,
  selectedGraph3dChildFromAnchor,
} from "./graph3dInspectorSelection.ts";
import { graph3dResetViewPatch, graph3dViewPatch } from "./moduleSettingsPatches.ts";

test("graph3d inspector selection normalizes frame dimensions and camera state", () => {
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
      metadata: { view3d: { az: 2, el: 0.5, bank: -0.25, zoom: 1.4 } },
    }),
    {
      title: "3D settings",
      widthPx: 500,
      heightPx: 360,
      view: { az: 2, el: 0.5, bank: -0.25, zoom: 1.4 },
    },
  );
});

test("graph3d camera patches preserve sibling metadata and reset only the view", () => {
  const config = { type: "graph3d", metadata: { keep: true, view3d: { az: 1, el: 0.3, bank: 0, zoom: 1.25 } } };
  assert.deepEqual(graph3dViewPatch(config, { az: 2 }), {
    metadata: { keep: true, view3d: { az: 2, el: 0.3, bank: 0, zoom: 1.25 } },
  });
  assert.deepEqual(graph3dResetViewPatch(config), {
    metadata: { keep: true, view3d: DEFAULT_3D_VIEW_STATE },
  });
});

test("graph3d object size defaults and clamps to a usable zoom range", () => {
  assert.equal(DEFAULT_3D_VIEW_STATE.zoom, 1.3);
  assert.equal(graph3dInspectorSelection({ type: "graph3d" }).view.zoom, DEFAULT_3D_VIEW_STATE.zoom);
  assert.equal(graph3dInspectorSelection({ type: "graph3d", metadata: { view3d: { zoom: 5 } } }).view.zoom, 3);
  assert.equal(graph3dInspectorSelection({ type: "graph3d", metadata: { view3d: { zoom: 0.1 } } }).view.zoom, 0.5);
});

test("graph3d child anchors select element display settings", () => {
  const config = {
    type: "graph3d",
    data: {
      points: [{ id: "A", label: "A", coords: [0, 0, 0] }],
      segments: [{ id: "AB", from: "A", to: "B", color: "#123456" }],
    },
  } satisfies GraphConfig;

  assert.equal(graph3dChildScrollAnchor("q:q1/b:d1", "segment", 0), "q:q1/b:d1/g3seg:0");
  assert.deepEqual(selectedGraph3dChildFromAnchor("q:q1/b:d1/g3pt:0"), { kind: "point", index: 0 });
  assert.equal(selectedGraph3dChildFromAnchor("q:q1/b:d1/g3solid:-1"), null);
  assert.deepEqual(graph3dElementInspectorSelection(config, "q:q1/b:d1/g3seg:0"), {
    target: { kind: "segment", listKey: "segments", index: 0 },
    element: { id: "AB", from: "A", to: "B", color: "#123456" },
    title: "Segment 1: AB",
    summary: "Segment display settings",
  });
  assert.equal(graph3dElementInspectorSelection(config, "q:q1/b:d1/g3face:9"), null);
});
