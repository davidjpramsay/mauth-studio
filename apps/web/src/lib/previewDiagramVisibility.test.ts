import assert from "node:assert/strict";
import test from "node:test";
import type { GraphConfig, GraphFeature } from "@mauth-studio/shared";

import { geometry2dData } from "./diagramGeometry2d.ts";
import { normalizedGraph3DElements } from "./diagramGraph3d.ts";
import { vector2dMetadata } from "./diagramVector2d.ts";
import {
  previewGeometry2DConfigForSolutionVisibility,
  previewGraph3DConfigForSolutionVisibility,
  previewGraphConfigForSolutionVisibility,
  graphConfigWithPresentationPatch,
  graphConfigWithLabelPosition,
  previewStatsChartConfigForSolutionVisibility,
  previewVector2DConfigForSolutionVisibility,
} from "./previewDiagramVisibility.ts";

test("moving a shared geometry label preserves hidden answers and authored colours", () => {
  const answer = { id: "answer", points: ["A", "B", "C"] as [string, string, string], solutionOnly: true, color: "#123456" };
  const config: GraphConfig = {
    type: "geometry2d",
    data: { points: [{ id: "A", x: 0, y: 1 }], angles: [answer] },
  };
  const visible = previewGeometry2DConfigForSolutionVisibility(config, false);
  const changed = graphConfigWithLabelPosition(config, visible, { kind: "geometry2d", primitiveKind: "point", id: "A", x: 2, y: 3 });
  assert.deepEqual(geometry2dData(changed).angles, [answer]);
  assert.deepEqual(geometry2dData(changed).points[0], { id: "A", x: 0, y: 1, labelX: 2, labelY: 3 });
  assert.equal(geometry2dData(config).points[0].labelX, undefined);
});

test("label moves target the full function and feature lists across filtered Student views", () => {
  const hidden: GraphFeature = { kind: "point", x: 9, y: 9, solutionOnly: true };
  const shared: GraphFeature = { kind: "point", x: 1, y: 2, label: "A", color: "#123456" };
  const config: GraphConfig = {
    type: "graph2d",
    functions: [
      { expression: "x^2", label: "f" },
      { expression: "x", solutionOnly: true },
    ],
    features: [hidden, shared],
  };
  const visible = previewGraphConfigForSolutionVisibility(config, false, (feature) => feature.solutionOnly === true);
  const changed = graphConfigWithLabelPosition(config, visible, { kind: "feature", index: 0, x: 3, y: 4 });
  assert.equal(changed.features?.[0], hidden);
  assert.deepEqual(changed.features?.[1], { ...shared, labelX: 3, labelY: 4 });
  assert.equal(changed.functions, config.functions);
  const movedFunction = graphConfigWithLabelPosition(config, visible, { kind: "function", index: 0, x: -2, y: 5 });
  assert.equal(movedFunction.functions?.[1], config.functions?.[1]);
  assert.deepEqual(movedFunction.functions?.[0], { ...config.functions?.[0], labelX: -2, labelY: 5 });
  const movedFree = graphConfigWithLabelPosition(config, visible, { kind: "free-label", index: 0, x: 3, y: 4 });
  assert.deepEqual(movedFree.features?.[1], { ...shared, x: 3, y: 4 });
  assert.equal(graphConfigWithLabelPosition(config, visible, { kind: "feature", index: 4, x: 1, y: 1 }), config);
  assert.equal(graphConfigWithLabelPosition(config, visible, { kind: "function", index: 0, x: NaN, y: 1 }), config);
  const legacy: GraphConfig = { type: "graph2d", expression: "x^2" };
  assert.equal(graphConfigWithLabelPosition(legacy, legacy, { kind: "function", index: 0, x: 2, y: 3 }).functions?.[0].labelX, 2);
});

test("axis-label presentation patches preserve hidden solution content", () => {
  const solutionFunction = { id: "answer", expression: "x^2", solutionOnly: true };
  const config: GraphConfig = {
    type: "graph2d",
    functions: [solutionFunction],
    features: [{ kind: "point", x: 1, y: 1, solutionOnly: true }],
  };
  const result = graphConfigWithPresentationPatch(config, { xAxisLabelX: 4, xAxisLabelY: 0.25 });

  assert.equal(result.functions?.[0], solutionFunction);
  assert.equal(result.features, config.features);
  assert.equal(result.xAxisLabelX, 4);
  assert.equal(result.xAxisLabelY, 0.25);
});

test("vector label edits preserve raw metadata and hidden geometry across both authoring layers", () => {
  const answer = { id: "answer", name: "r", start: [0, 0], components: [3, 4], solutionOnly: true, color: "#123456" };
  const shared = { id: "a", name: "a", start: [0, 0], components: [4, 1], color: "#abcdef", custom: "preserve" };
  const config: GraphConfig = {
    type: "vector2d",
    metadata: {
      custom: "document",
      vector2d: {
        custom: "settings",
        vectors: [answer, shared],
        segmentLabels: [
          { vectorId: "a", label: "L", solutionOnly: true },
          { vectorId: "a", label: "M", custom: "segment" },
        ],
        angleMarkers: [
          { from: "a", to: "answer", solutionOnly: true },
          { from: "a", to: "answer", label: "theta", custom: "angle" },
        ],
      },
    },
  };
  for (const solutions of [false, true]) {
    const visible = previewVector2DConfigForSolutionVisibility(config, solutions, "#1d4ed8");
    const moved = graphConfigWithLabelPosition(config, visible, { kind: "vector2d", elementKind: "vector", id: "a", x: 2, y: 3 });
    const metadata = vector2dMetadata(moved);
    assert.deepEqual(metadata.vectors, [answer, { ...shared, labelX: 2, labelY: 3 }]);
    assert.equal(moved.metadata?.custom, "document");
    assert.equal(metadata.custom, "settings");
    for (const [kind, listKey, id, custom] of [
      ["segmentLabel", "segmentLabels", "segment-label-2", "segment"],
      ["angleMarker", "angleMarkers", "angle-marker-2", "angle"],
    ] as const) {
      const changed = graphConfigWithLabelPosition(config, visible, { kind: "vector2d", elementKind: kind, id, x: 2, y: 3 });
      const list = vector2dMetadata(changed)[listKey] as Record<string, unknown>[];
      assert.equal(list[1].custom, custom);
      assert.equal(list[1].labelX, 2);
      assert.equal(list[1].labelY, 3);
      assert.deepEqual(list[0], (vector2dMetadata(config)[listKey] as unknown[])[0]);
    }
    const movedAnswer = graphConfigWithLabelPosition(config, visible, {
      kind: "vector2d",
      elementKind: "vector",
      id: "answer",
      x: 2,
      y: 3,
    });
    assert.equal((vector2dMetadata(movedAnswer).vectors as Record<string, unknown>[])[0].color, "#123456");
  }
  assert.equal(
    graphConfigWithLabelPosition(config, config, { kind: "vector2d", elementKind: "vector", id: "missing", x: 2, y: 3 }),
    config,
  );
  assert.deepEqual(vector2dMetadata(config).vectors, [answer, shared]);
});

test("legacy vector ids are resolved before solution filtering and persist to the correct raw row", () => {
  const hidden = { start: [0, 0], components: [3, 4], solutionOnly: true, custom: "hidden" };
  const shared = { start: [0, 0], components: [4, 1], custom: "shared" };
  const config: GraphConfig = { type: "vector2d", metadata: { vectors: [hidden, shared] } };
  const visible = previewVector2DConfigForSolutionVisibility(config, false);
  const rendered = vector2dMetadata(visible).vectors as Record<string, unknown>[];
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].id, "b");
  const moved = graphConfigWithLabelPosition(config, visible, { kind: "vector2d", elementKind: "vector", id: "b", x: 2, y: 3 });
  assert.deepEqual(vector2dMetadata(moved).vectors, [hidden, { ...shared, labelX: 2, labelY: 3 }]);
  assert.deepEqual(config.metadata?.vectors, [hidden, shared]);
});

const visibleFeature: GraphFeature = { kind: "point", x: 0, y: 0, label: "A" };
const solutionOnlyFeature: GraphFeature = { kind: "point", x: 1, y: 1, label: "B", solutionOnly: true };

function isSolutionOnly(feature: GraphFeature) {
  return feature.solutionOnly === true;
}

test("previewGraphConfigForSolutionVisibility leaves solution features visible in solutions mode", () => {
  const config: GraphConfig = {
    type: "graph2d",
    features: [visibleFeature, solutionOnlyFeature],
  };

  assert.equal(previewGraphConfigForSolutionVisibility(config, true, isSolutionOnly), config);
});

test("previewGraphConfigForSolutionVisibility hides solution-only features in student mode", () => {
  const config: GraphConfig = {
    type: "graph2d",
    features: [visibleFeature, solutionOnlyFeature],
  };

  const result = previewGraphConfigForSolutionVisibility(config, false, isSolutionOnly);

  assert.notEqual(result, config);
  assert.deepEqual(result.features, [visibleFeature]);
});

test("previewGraphConfigForSolutionVisibility reuses the config when no solution-only features exist", () => {
  const config: GraphConfig = {
    type: "graph2d",
    features: [visibleFeature],
  };

  assert.equal(previewGraphConfigForSolutionVisibility(config, false, isSolutionOnly), config);
});

test("previewGraphConfigForSolutionVisibility hides solution functions without shifting dependent indexes", () => {
  const sharedFeature: GraphFeature = { kind: "point", x: 0, y: 0, label: "O" };
  const dependentFeature: GraphFeature = { kind: "tangent", functionIndex: 1, x: 0 };
  const config: GraphConfig = {
    type: "graph2d",
    functions: [
      { id: "shared", expression: "x^2" },
      { id: "answer", expression: "2*x+1", show: true, showLabel: true, solutionOnly: true },
    ],
    features: [sharedFeature, dependentFeature],
  };

  const student = previewGraphConfigForSolutionVisibility(config, false, isSolutionOnly);
  assert.equal(student.functions?.length, 2);
  assert.equal(student.functions?.[1]?.show, false);
  assert.equal(student.functions?.[1]?.showLabel, false);
  assert.deepEqual(student.features, [sharedFeature]);
  assert.equal(previewGraphConfigForSolutionVisibility(config, true, isSolutionOnly), config);
});

test("previewGeometry2DConfigForSolutionVisibility hides solution-only primitives from students", () => {
  const config: GraphConfig = {
    type: "geometry2d",
    data: {
      points: [
        { id: "A", x: 0, y: 0 },
        { id: "B", x: 1, y: 1, solutionOnly: true },
      ],
    },
  };

  const result = previewGeometry2DConfigForSolutionVisibility(config, false, "#1d4ed8");
  assert.deepEqual(
    geometry2dData(result).points?.map((point) => point.id),
    ["A"],
  );
});

test("previewGeometry2DConfigForSolutionVisibility colours solution-only primitives in solutions mode", () => {
  const config: GraphConfig = {
    type: "geometry2d",
    data: {
      points: [{ id: "B", x: 1, y: 1, color: "#cc0000", solutionOnly: true }],
    },
  };

  const result = previewGeometry2DConfigForSolutionVisibility(config, true, "#1d4ed8");
  assert.equal(geometry2dData(result).points?.[0]?.color, "#1d4ed8");
  assert.equal(geometry2dData(config).points?.[0]?.color, "#cc0000");
});

test("previewVector2DConfigForSolutionVisibility filters and colours structured vector elements", () => {
  const config: GraphConfig = {
    type: "vector2d",
    metadata: {
      vector2d: {
        vectors: [
          { id: "a", name: "a", label: "", start: [0, 0], components: [1, 0], color: "#111111", showComponents: false },
          {
            id: "b",
            name: "b",
            label: "",
            start: [0, 0],
            components: [0, 1],
            color: "#cc0000",
            showComponents: false,
            solutionOnly: true,
          },
        ],
      },
    },
  };
  assert.deepEqual(
    previewVector2DConfigForSolutionVisibility(config, false, "#1d4ed8").metadata?.vector2d?.vectors?.map((vector) => vector.id),
    ["a"],
  );
  assert.equal(previewVector2DConfigForSolutionVisibility(config, true, "#1d4ed8").metadata?.vector2d?.vectors?.[1]?.color, "#1d4ed8");
});

test("previewGraph3DConfigForSolutionVisibility hides and colours structured 3D elements", () => {
  const config: GraphConfig = {
    type: "graph3d",
    data: {
      points: [
        { id: "A", coords: [0, 0, 0], color: "#111111" },
        { id: "B", coords: [1, 1, 1], color: "#cc0000", solutionOnly: true },
      ],
      segments: [{ id: "answer", from: "A", to: "B", label: "AB", solutionOnly: true }],
    },
  };
  const student = previewGraph3DConfigForSolutionVisibility(config, false, "#1d4ed8");
  const solutions = previewGraph3DConfigForSolutionVisibility(config, true, "#1d4ed8");
  assert.equal(normalizedGraph3DElements(student, "point")[1]?.show, false);
  assert.deepEqual(normalizedGraph3DElements(student, "segment"), []);
  assert.equal(normalizedGraph3DElements(solutions, "point")[1]?.color, "#1d4ed8");
  assert.equal(normalizedGraph3DElements(solutions, "segment")[0]?.color, "#1d4ed8");
});

test("previewStatsChartConfigForSolutionVisibility hides and colours supplemental series", () => {
  const config: GraphConfig = {
    type: "statsChart",
    data: {
      chartType: "blankAxes",
      series: [
        { id: "shared", seriesType: "points", xValues: [0], yValues: [1], color: "#111111" },
        { id: "answer", seriesType: "line", xValues: [0, 1], yValues: [0, 1], color: "#cc0000", solutionOnly: true },
      ],
    },
  };
  const student = previewStatsChartConfigForSolutionVisibility(config, false, "#1d4ed8");
  const solutions = previewStatsChartConfigForSolutionVisibility(config, true, "#1d4ed8");
  assert.deepEqual(
    student.data?.series?.map((series) => series.id),
    ["shared"],
  );
  assert.equal(solutions.data?.series?.[1]?.color, "#1d4ed8");
});
