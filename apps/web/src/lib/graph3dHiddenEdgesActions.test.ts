import assert from "node:assert/strict";
import test from "node:test";
import { graph3dEdgeIsHidden, graph3dEdgeKey } from "./graph3dHiddenEdges.ts";
import { applyMauthAction } from "./mauthActions.ts";
import { validateMauthDocumentActionPayloads } from "./mauthActionValidation.ts";
import { DEFAULT_3D_GRAPH } from "./diagram3d.ts";
import { withGraphDefaults } from "./editorDiagramConfig.ts";

type Point = [number, number, number];
const A: Point = [-3, -3, 0],
  B: Point = [3, -3, 0],
  C: Point = [3, 3, 0],
  D: Point = [-3, 3, 0],
  T: Point = [0, 0, 4];
const faces = [
  [A, B, C, D],
  [A, B, T],
  [B, C, T],
  [C, D, T],
  [D, A, T],
];

test("new 3D diagrams default to automatic edges without migrating existing manual data", () => {
  assert.equal(DEFAULT_3D_GRAPH.data?.hiddenEdges, "auto");
  const existing = { type: "graph3d", data: { segments: [{ id: "AB", from: A, to: B, strokeStyle: "dashed" }] } };
  assert.equal(withGraphDefaults(existing).data?.hiddenEdges, undefined);
  assert.equal(withGraphDefaults({ ...existing, data: { ...existing.data, hiddenEdges: "manual" } }).data?.hiddenEdges, "manual");
});

test("pyramid front and rear edges exchange visibility after a half turn", () => {
  for (const [from, to, hidden] of [
    [A, B, true],
    [B, C, false],
    [C, D, false],
    [D, A, true],
    [A, T, true],
    [C, T, false],
  ] as const) {
    assert.equal(graph3dEdgeIsHidden(from, to, faces, [-1, -1, -1]), hidden);
    assert.equal(graph3dEdgeIsHidden(from, to, faces, [1, 1, -1]), !hidden);
  }
});

test("visibility is independent of face winding and world translation", () => {
  const shift = (p: Point): Point => [p[0] + 120, p[1] - 95, p[2] + 40];
  assert.equal(
    graph3dEdgeIsHidden(
      shift(A),
      shift(B),
      faces.map((f) => f.map(shift).reverse()),
      [-1, -1, -1],
    ),
    true,
  );
  assert.equal(
    graph3dEdgeIsHidden(
      shift(C),
      shift(D),
      faces.map((f) => f.map(shift).reverse()),
      [-1, -1, -1],
    ),
    false,
  );
  assert.equal(graph3dEdgeKey(A, B), graph3dEdgeKey(B, A));
});

test("base seen from below occludes apex edges without hiding its own boundary", () => {
  assert.equal(graph3dEdgeIsHidden(A, B, faces, [0, 0, 1]), false);
  assert.equal(graph3dEdgeIsHidden(A, T, faces, [0, 0, 1]), true);
  assert.equal(graph3dEdgeIsHidden(A, B, [], [0, 0, 1]), false);
});

test("automatic hidden-edge settings preserve geometry, guides, and camera state", () => {
  const config = {
    type: "graph3d",
    data: { points: [{ id: "A", coords: A }], dimensions: [{ id: "height", from: A, to: T, display: "guide" }], hiddenEdges: "manual" },
    metadata: { view3d: { az: 1, el: 0.5, bank: 0.2 } },
  };
  const question = { id: "q", marks: 0, contentBlocks: [{ id: "d", kind: "diagram" as const, graphConfig: config }], parts: [] };
  const action = {
    type: "diagram.settings.update" as const,
    scope: { kind: "question" as const, questionId: "q" },
    blockId: "d",
    settings: { renderer: "graph3d" as const, hiddenEdges: "auto" as const },
  };
  assert.equal(validateMauthDocumentActionPayloads([action]).ok, true);
  const result = applyMauthAction([question], action);
  assert.equal(result.ok, true);
  const updated = result.questions[0].contentBlocks[0].graphConfig;
  assert.deepEqual(updated.data, { ...config.data, hiddenEdges: "auto" });
  assert.deepEqual(updated.metadata, config.metadata);
  assert.equal(config.data.hiddenEdges, "manual");
  for (const element of [
    { kind: "point", id: "A", patch: { coords: B } },
    { kind: "point", index: 0, patch: { id: "B", coords: B } },
  ] as const) {
    const combined = applyMauthAction([question], { ...action, settings: { ...action.settings, element } });
    assert.equal(combined.ok, true);
    const combinedConfig = combined.questions[0].contentBlocks[0].graphConfig;
    assert.equal(combinedConfig.data.hiddenEdges, "auto");
    assert.deepEqual(combinedConfig.data.points[0].coords, B);
    assert.equal(combinedConfig.data.points[0].id, "index" in element ? "B" : "A");
    assert.deepEqual(combinedConfig.metadata, config.metadata);
  }
  assert.equal(validateMauthDocumentActionPayloads([{ ...action, settings: { ...action.settings, hiddenEdges: "sometimes" } }]).ok, false);
  assert.equal(
    validateMauthDocumentActionPayloads([
      { type: "diagram.update", scope: action.scope, blockId: "d", graphConfig: { ...config, data: { hiddenEdges: "sometimes" } } },
    ]).ok,
    false,
  );
});
