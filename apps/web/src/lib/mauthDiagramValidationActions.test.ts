import assert from "node:assert/strict";
import test from "node:test";

import { validateMauthDiagramConfig } from "./mauthDiagramValidation.ts";

test("graph2d validation accepts boolean solution-layer state on functions", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    { type: "graph2d", functions: [{ id: "answer", expression: "x^2", solutionOnly: true }], features: [] },
    "diagram",
    issues,
  );
  assert.deepEqual(issues, []);
});

test("graph2d validation rejects non-boolean function solution-layer state", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    { type: "graph2d", functions: [{ id: "answer", expression: "x^2", solutionOnly: "yes" }], features: [] },
    "diagram",
    issues,
  );
  assert.ok(issues.some((issue) => issue.path === "diagram.functions[0].solutionOnly"));
});

test("coordinate graph validation accepts independent axis-number visibility", () => {
  for (const type of ["graph2d", "vector2d"] as const) {
    const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
    validateMauthDiagramConfig(
      {
        type,
        showAxisNumbers: false,
        showXAxisNumbers: false,
        showYAxisNumbers: true,
        functions: [],
        features: [],
      },
      "diagram",
      issues,
    );
    assert.deepEqual(issues, []);
  }
});

test("coordinate graph validation rejects non-boolean per-axis number visibility", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    {
      type: "graph2d",
      showXAxisNumbers: "no",
      showYAxisNumbers: 1,
      functions: [],
      features: [],
    },
    "diagram",
    issues,
  );
  assert.ok(issues.some((issue) => issue.path === "diagram.showXAxisNumbers"));
  assert.ok(issues.some((issue) => issue.path === "diagram.showYAxisNumbers"));
});

test("graph2d validation accepts angle markers attached to connected line segments", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    {
      type: "graph2d",
      functions: [],
      features: [
        { id: "AB", kind: "line_segment", x1: 0, y1: 0, x2: 3, y2: 0 },
        { id: "AC", kind: "line_segment", x1: 0, y1: 0, x2: 2, y2: 4 },
        { id: "angle-A", kind: "angle_marker", firstSegmentId: "AB", secondSegmentId: "AC", size: 0.35 },
      ],
    },
    "diagram",
    issues,
  );
  assert.deepEqual(issues, []);
});

test("graph2d validation rejects angle-marker segments without a shared endpoint", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    {
      type: "graph2d",
      functions: [],
      features: [
        { id: "AB", kind: "line_segment", x1: 0, y1: 0, x2: 3, y2: 0 },
        { id: "CD", kind: "line_segment", x1: 4, y1: 1, x2: 5, y2: 2 },
        { id: "angle-A", kind: "angle_marker", firstSegmentId: "AB", secondSegmentId: "CD", size: 0.35 },
      ],
    },
    "diagram",
    issues,
  );
  assert.ok(issues.some((issue) => issue.path === "diagram.features[2].secondSegmentId"));
});

function geometryConfig(solutionOnly: unknown) {
  return {
    type: "geometry2d",
    data: {
      points: [{ id: "A", x: 0, y: 0, solutionOnly }],
      segments: [],
      arcs: [],
      angles: [],
      decorations: [],
    },
    functions: [],
    features: [],
  };
}

test("geometry2d validation accepts boolean solution-layer state on primitives", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(geometryConfig(true), "diagram", issues);
  assert.deepEqual(issues, []);
});

test("geometry2d validation rejects non-boolean solution-layer state", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(geometryConfig("yes"), "diagram", issues);
  assert.ok(issues.some((issue) => issue.path === "diagram.data.points[0].solutionOnly"));
});

test("vector2d validation accepts boolean solution-layer state on structured elements", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    {
      type: "vector2d",
      metadata: {
        vector2d: {
          vectors: [
            {
              id: "a",
              name: "a",
              label: "",
              start: [0, 0],
              components: [1, 1],
              color: "#111111",
              showComponents: false,
              solutionOnly: true,
            },
          ],
        },
      },
      functions: [],
      features: [],
    },
    "diagram",
    issues,
  );
  assert.deepEqual(issues, []);
});

test("vector2d validation rejects non-boolean solution-layer state", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    {
      type: "vector2d",
      metadata: {
        vector2d: {
          vectors: [
            {
              id: "a",
              name: "a",
              label: "",
              start: [0, 0],
              components: [1, 1],
              color: "#111111",
              showComponents: false,
              solutionOnly: "yes",
            },
          ],
        },
      },
      functions: [],
      features: [],
    },
    "diagram",
    issues,
  );
  assert.ok(issues.some((issue) => issue.path === "diagram.metadata.vector2d.vectors[0].solutionOnly"));
});

test("graph3d validation accepts boolean solution-layer state on structured elements", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    {
      type: "graph3d",
      data: {
        points: [
          { id: "A", coords: [0, 0, 0] },
          { id: "B", coords: [1, 1, 1], labelScreenOffsetPx: [18, -9], solutionOnly: true },
        ],
        segments: [{ id: "answer", from: "A", to: "B", labelScreenOffsetPx: [4, 7], solutionOnly: true }],
        dimensions: [
          {
            id: "length",
            from: "A",
            to: "B",
            label: "d",
            display: "guide",
            labelOffsetPx: 14,
            labelScreenOffsetPx: [-6, 11],
            rightAngleWith: "radius",
            rightAngleSize: 0.4,
            solutionOnly: true,
          },
          { id: "radius", from: "A", to: [1, 0, 0], label: "r", display: "guide" },
        ],
      },
    },
    "diagram",
    issues,
  );
  assert.deepEqual(issues, []);
});

test("graph3d validation accepts a namespaced face perpendicular target", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    {
      type: "graph3d",
      data: {
        dimensions: [{ id: "height", from: [0, 0, 0], to: [0, 0, 10], rightAngleWith: "face:base" }],
        faces: [
          {
            id: "base",
            points: [
              [0, 0, 0],
              [6, 0, 0],
              [6, 6, 0],
              [0, 6, 0],
            ],
          },
        ],
      },
    },
    "diagram",
    issues,
  );
  assert.deepEqual(issues, []);
});

test("graph3d validation rejects unsupported dimension display styles", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    {
      type: "graph3d",
      data: {
        dimensions: [
          {
            id: "length",
            from: [0, 0, 0],
            to: [1, 0, 0],
            label: "d",
            display: "floating",
            labelOffsetPx: -1,
            labelScreenOffsetPx: [10, 20, 30],
            rightAngleWith: "missing",
            rightAngleSize: -1,
          },
        ],
      },
    },
    "diagram",
    issues,
  );
  assert.ok(issues.some((issue) => issue.path === "diagram.data.dimensions[0].display"));
  assert.ok(issues.some((issue) => issue.path === "diagram.data.dimensions[0].labelOffsetPx"));
  assert.ok(issues.some((issue) => issue.path === "diagram.data.dimensions[0].labelScreenOffsetPx"));
  assert.ok(issues.some((issue) => issue.path === "diagram.data.dimensions[0].rightAngleWith"));
  assert.ok(issues.some((issue) => issue.path === "diagram.data.dimensions[0].rightAngleSize"));
});

test("graph3d validation rejects non-boolean solution-layer state", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    {
      type: "graph3d",
      data: { points: [{ id: "A", coords: [0, 0, 0], solutionOnly: "yes" }] },
    },
    "diagram",
    issues,
  );
  assert.ok(issues.some((issue) => issue.path === "diagram.data.points[0].solutionOnly"));
});

test("statsChart validation accepts structured solution series", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    {
      type: "statsChart",
      data: {
        chartType: "blankAxes",
        series: [
          {
            id: "answer",
            seriesType: "linePoints",
            xValues: [0, 1, 2],
            yValues: [0, 1, 0],
            color: "#1d4ed8",
            solutionOnly: true,
          },
        ],
      },
    },
    "diagram",
    issues,
  );
  assert.deepEqual(issues, []);
});

test("statsChart validation rejects malformed solution series", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    {
      type: "statsChart",
      data: {
        chartType: "blankAxes",
        series: [{ id: "answer", seriesType: "curve", xValues: [0, 1], yValues: [1], solutionOnly: "yes" }],
      },
    },
    "diagram",
    issues,
  );
  assert.ok(issues.some((issue) => issue.path === "diagram.data.series[0].seriesType"));
  assert.ok(issues.some((issue) => issue.path === "diagram.data.series[0].yValues"));
  assert.ok(issues.some((issue) => issue.path === "diagram.data.series[0].solutionOnly"));
});

test("image validation accepts structured solution annotations", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    {
      type: "image",
      data: {
        src: "data:image/png;base64,abc",
        annotations: [
          { id: "label", kind: "label", xPercent: 25, yPercent: 30, text: "$A$" },
          {
            id: "answer",
            kind: "ellipse",
            xPercent: 60,
            yPercent: 70,
            widthPercent: 20,
            heightPercent: 15,
            solutionOnly: true,
          },
          { id: "arrow", kind: "arrow", xPercent: 20, yPercent: 80, endXPercent: 70, endYPercent: 30 },
        ],
      },
    },
    "diagram",
    issues,
  );
  assert.deepEqual(issues, []);
});

test("image validation rejects malformed solution annotations", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    {
      type: "image",
      data: {
        src: "data:image/png;base64,abc",
        annotations: [
          { id: "answer", kind: "label", xPercent: -5, yPercent: 30, text: "", solutionOnly: "yes" },
          { id: "answer", kind: "arrow", xPercent: 20, yPercent: 80 },
        ],
      },
    },
    "diagram",
    issues,
  );
  assert.ok(issues.some((issue) => issue.path === "diagram.data.annotations[0].xPercent"));
  assert.ok(issues.some((issue) => issue.path === "diagram.data.annotations[0].text"));
  assert.ok(issues.some((issue) => issue.path === "diagram.data.annotations[0].solutionOnly"));
  assert.ok(issues.some((issue) => issue.path === "diagram.data.annotations[1].id"));
  assert.ok(issues.some((issue) => issue.path === "diagram.data.annotations[1].endXPercent"));
  assert.ok(issues.some((issue) => issue.path === "diagram.data.annotations[1].endYPercent"));
});

test("Penrose validation accepts supported solution points, segments, and Venn regions", () => {
  const geometryIssues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    {
      type: "geometricConstruction",
      data: {
        objects: [
          { type: "point", name: "A" },
          { type: "point", name: "P", solutionOnly: true },
        ],
        relationships: [{ type: "segment", name: "AP", points: ["A", "P"], solutionOnly: true }],
      },
    },
    "diagram",
    geometryIssues,
  );
  assert.deepEqual(geometryIssues, []);

  const setIssues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    {
      type: "setDiagram",
      data: {
        universe: { name: "U", label: "U" },
        sets: [
          { name: "A", label: "A" },
          { name: "B", label: "B" },
        ],
        regions: [
          { name: "onlyA", label: "7", solutionOnly: true },
          { name: "intersection", label: "2" },
          { name: "onlyB", label: "3" },
          { name: "outside", label: "1" },
        ],
      },
    },
    "diagram",
    setIssues,
  );
  assert.deepEqual(setIssues, []);
});

test("Penrose validation rejects unsupported solution relationships and all-answer point sets", () => {
  const issues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
  validateMauthDiagramConfig(
    {
      type: "geometricConstruction",
      data: {
        objects: [
          { type: "point", name: "A", solutionOnly: true },
          { type: "point", name: "B", solutionOnly: true },
          { type: "point", name: "C", solutionOnly: true },
        ],
        relationships: [{ type: "rightAngle", points: ["A", "B", "C"], solutionOnly: true }],
      },
    },
    "diagram",
    issues,
  );
  assert.ok(issues.some((issue) => issue.path === "diagram.data.objects"));
  assert.ok(issues.some((issue) => issue.path === "diagram.data.relationships[0].solutionOnly"));
});
