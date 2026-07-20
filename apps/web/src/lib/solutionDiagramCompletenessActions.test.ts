import assert from "node:assert/strict";
import test from "node:test";
import type { GraphConfig } from "@mauth-studio/shared";

import { diagramAnswerContentChanged, diagramConfigHasSolutionAnnotations } from "./solutionDiagramCompleteness.ts";

const annotatedConfigs: GraphConfig[] = [
  {
    type: "graph2d",
    functions: [{ expression: "x^2", solutionOnly: true }],
  },
  {
    type: "graph2d",
    features: [{ kind: "point", x: 1, y: 2, solutionOnly: true }],
  },
  {
    type: "geometry2d",
    data: { points: [{ id: "A", x: 1, y: 2, solutionOnly: true }] },
  },
  {
    type: "vector2d",
    metadata: {
      vector2d: {
        vectors: [
          {
            id: "v",
            name: "v",
            label: "v",
            start: [0, 0],
            components: [2, 3],
            color: "#111111",
            showComponents: true,
            solutionOnly: true,
          },
        ],
      },
    },
  },
  {
    type: "graph3d",
    data: { points: [{ id: "A", coords: [1, 2, 3], solutionOnly: true }] },
  },
  {
    type: "statsChart",
    data: {
      chartType: "blankAxes",
      series: [{ id: "answer", seriesType: "line", xValues: [0, 1], yValues: [0, 1], solutionOnly: true }],
    },
  },
  {
    type: "image",
    data: {
      src: "data:image/png;base64,abc",
      annotations: [
        {
          id: "answer",
          kind: "ellipse",
          xPercent: 50,
          yPercent: 50,
          widthPercent: 20,
          heightPercent: 15,
          solutionOnly: true,
        },
      ],
    },
  },
  {
    type: "geometricConstruction",
    data: { objects: [{ type: "point", name: "A", solutionOnly: true }], relationships: [] },
  },
  {
    type: "setDiagram",
    data: { regions: [{ id: "intersection", label: "5", solutionOnly: true }] },
  },
];

test("diagramConfigHasSolutionAnnotations recognizes every supported structured answer layer", () => {
  annotatedConfigs.forEach((config) => assert.equal(diagramConfigHasSolutionAnnotations(config), true, config.type));
  assert.equal(diagramConfigHasSolutionAnnotations({ type: "graph2d", features: [{ kind: "point", x: 1, y: 2 }] }), false);
});

test("diagramAnswerContentChanged ignores presentation-only edits", () => {
  const student: GraphConfig = {
    type: "graph2d",
    xMin: -5,
    xMax: 5,
    yMin: -4,
    yMax: 4,
    widthPx: 500,
    heightPx: 300,
    showGrid: true,
    functions: [{ id: "f", expression: "x^2", color: "#111111", strokeWidth: 2 }],
  };
  const presentationEdit: GraphConfig = {
    ...student,
    xMin: -10,
    xMax: 10,
    widthPx: 720,
    heightPx: 420,
    showGrid: false,
    functions: [{ id: "f", expression: "x^2", color: "#2563eb", strokeWidth: 4 }],
  };

  assert.equal(diagramAnswerContentChanged(student, presentationEdit), false);
});

test("diagramAnswerContentChanged detects mathematical content edits", () => {
  const student: GraphConfig = {
    type: "graph2d",
    functions: [{ id: "f", expression: "x^2" }],
    features: [{ id: "A", kind: "point", x: 1, y: 1, label: "A" }],
  };

  assert.equal(
    diagramAnswerContentChanged(student, {
      ...student,
      functions: [{ id: "f", expression: "(x-2)^2" }],
    }),
    true,
  );
  assert.equal(
    diagramAnswerContentChanged(student, {
      ...student,
      features: [...(student.features ?? []), { id: "B", kind: "point", x: 2, y: 4, label: "B", solutionOnly: true }],
    }),
    true,
  );
});

test("diagramAnswerContentChanged ignores graph3d camera ranges but detects geometry", () => {
  const student: GraphConfig = {
    type: "graph3d",
    data: { points: [{ id: "A", coords: [0, 0, 0] }], xRange: [-5, 5], yRange: [-5, 5], zRange: [-5, 5] },
  };
  assert.equal(
    diagramAnswerContentChanged(student, {
      ...student,
      data: { ...(student.data ?? {}), xRange: [-10, 10], yRange: [-10, 10], zRange: [-10, 10] },
    }),
    false,
  );
  assert.equal(
    diagramAnswerContentChanged(student, {
      ...student,
      data: { ...(student.data ?? {}), points: [{ id: "A", coords: [1, 0, 0] }] },
    }),
    true,
  );
});
