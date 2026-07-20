import assert from "node:assert/strict";
import test from "node:test";
import type { GraphConfig } from "@mauth-studio/shared";

import { penroseInspectorSelection } from "./penroseInspectorSelection.ts";

test("Penrose inspector selection distinguishes geometry, network, and Venn families", () => {
  const geometry = penroseInspectorSelection({ type: "geometricConstruction", data: {} });
  assert.equal(geometry.title, "Penrose settings");
  assert.equal(geometry.networkData, null);
  assert.equal(geometry.setData, null);

  const networkConfig: GraphConfig = {
    type: "network",
    data: { hidePoints: true, hidePointLabels: false, objects: [], relationships: [] },
  };
  const network = penroseInspectorSelection(networkConfig);
  assert.equal(network.title, "Network settings");
  assert.equal(network.networkData?.hidePoints, true);
  assert.equal(network.networkData?.hidePointLabels, false);
  assert.equal(network.setData, null);

  const setConfig: GraphConfig = { type: "setDiagram", data: { setCount: 3 } };
  const setDiagram = penroseInspectorSelection(setConfig);
  assert.equal(setDiagram.title, "Venn diagram settings");
  assert.equal(setDiagram.setData?.setCount, 3);
  assert.equal(setDiagram.networkData, null);
});
