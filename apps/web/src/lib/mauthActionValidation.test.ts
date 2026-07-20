import assert from "node:assert/strict";
import test from "node:test";

import { validateMauthDocumentActionPayloads } from "./mauthActionValidation.ts";

test("graph2d line segment features accept grid span mode", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "diagram.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d1",
      graphConfig: {
        type: "graph2d",
        features: [{ kind: "line_segment", x1: -1, y1: -7, x2: -1, y2: 5, span: "grid" }],
      },
    },
  ]);

  assert.equal(result.ok, true);
});

test("graph2d line segment features reject invalid span mode", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "diagram.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d1",
      graphConfig: {
        type: "graph2d",
        features: [{ kind: "line_segment", x1: -1, y1: -7, x2: -1, y2: 5, span: "full" }],
      },
    },
  ]);

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.path === "actions[0].graphConfig.features[0].span"),
    true,
  );
});

test("section heading actions validate document flow targets", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "sectionHeading.add",
      heading: { id: "section-1", title: "Multiple choice" },
      beforeItem: { kind: "question", id: "q1" },
    },
    {
      type: "sectionHeading.reorder",
      sectionHeadingId: "section-1",
      targetItem: { kind: "question", id: "q2" },
      placement: "after",
    },
  ]);

  assert.equal(result.ok, true);
});

test("section heading actions reject ambiguous placement", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "sectionHeading.add",
      heading: { id: "section-1", title: "Multiple choice" },
      beforeItem: { kind: "question", id: "q1" },
      afterItem: { kind: "question", id: "q2" },
    },
  ]);

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.path === "actions[0]"),
    true,
  );
});

test("choice solution answer settings accept an index or explicit clear", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "module.add",
      scope: { kind: "question", questionId: "q1" },
      blocks: [
        {
          id: "shared-choices",
          kind: "choices",
          choices: ["A", "B", "C"],
          solutionAnswerIndex: 1,
        },
      ],
    },
    {
      type: "module.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "solution-choices",
      settings: { kind: "choices", solutionAnswerIndex: 2 },
    },
    {
      type: "module.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "solution-choices",
      settings: { kind: "choices", solutionAnswerIndex: null },
    },
  ]);

  assert.equal(result.ok, true);
});

test("choice solution answer payloads reject non-integer indexes and student visibility", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "module.add",
      scope: { kind: "question", questionId: "q1" },
      blocks: [
        {
          id: "choices",
          kind: "choices",
          choices: ["A", "B"],
          visibility: "student",
          solutionAnswerIndex: 1,
        },
      ],
    },
    {
      type: "module.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "solution-choices",
      settings: { kind: "choices", solutionAnswerIndex: 1.5 },
    },
  ]);

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.path.endsWith("solutionAnswerIndex")),
    true,
  );
});

test("shared table answer payloads accept sparse entries and focused cell updates", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "module.add",
      scope: { kind: "question", questionId: "q1" },
      blocks: [
        {
          id: "table",
          kind: "table",
          headers: ["x", "0", "1"],
          rows: [["y", "", ""]],
          solutionEntries: [["", "6", "4"]],
          markTicks: 2,
        },
      ],
    },
    {
      type: "module.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "table",
      settings: { kind: "table", solutionEntry: { row: 0, column: 1, value: "6" } },
    },
    {
      type: "module.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "table",
      settings: { kind: "table", solutionEntry: { row: 0, column: 1, value: null } },
    },
  ]);

  assert.equal(result.ok, true);
});

test("shared table answer payloads reject given cells, student-only storage, and malformed updates", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "module.add",
      scope: { kind: "question", questionId: "q1" },
      blocks: [
        {
          id: "student-table",
          kind: "table",
          headers: ["x", "0"],
          rows: [["y", "5"]],
          visibility: "student",
          solutionEntries: [["", "6"]],
        },
      ],
    },
    {
      type: "module.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "table",
      settings: { kind: "table", solutionEntry: { row: -1, column: 0, value: 6 } },
    },
  ]);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path.endsWith("solutionEntries")));
  assert.ok(result.issues.some((issue) => issue.path.endsWith("solutionEntries[0][1]")));
  assert.ok(result.issues.some((issue) => issue.path.endsWith("solutionEntry.row")));
  assert.ok(result.issues.some((issue) => issue.path.endsWith("solutionEntry.value")));
});

test("graph2d function settings accept structured solution-layer patches", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "diagram.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d1",
      settings: {
        renderer: "graph2d",
        function: { id: "answer", patch: { expression: "x^2", color: "#2563eb", solutionOnly: true } },
      },
    },
  ]);
  assert.equal(result.ok, true);
});

test("graph2d function settings reject missing targets and invalid solution-layer values", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "diagram.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d1",
      settings: {
        renderer: "graph2d",
        function: { patch: { solutionOnly: "yes", kind: "curve" } },
      },
    },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.function"));
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.function.patch.solutionOnly"));
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.function.patch.kind"));
});

test("vector2d element settings accept structured solution-layer patches", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "diagram.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d1",
      settings: {
        renderer: "vector2d",
        element: { kind: "angleMarker", id: "angle-ab", patch: { label: "45^\\circ", radius: 0.6, solutionOnly: true } },
      },
    },
  ]);
  assert.equal(result.ok, true);
});

test("vector2d element settings reject invalid targets and solution-layer values", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "diagram.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d1",
      settings: {
        renderer: "vector2d",
        element: { kind: "unknown", patch: { solutionOnly: "yes" } },
      },
    },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element.kind"));
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element"));
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element.patch.solutionOnly"));
});

test("graph3d element settings accept structured solution-layer patches", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "diagram.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d1",
      settings: {
        renderer: "graph3d",
        element: { kind: "dimension", id: "length", patch: { label: "d", from: "A", to: "B", solutionOnly: true } },
      },
    },
  ]);
  assert.equal(result.ok, true);
});

test("graph3d element settings reject invalid targets and solution-layer values", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "diagram.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d1",
      settings: {
        renderer: "graph3d",
        element: { kind: "unknown", patch: { coords: [1, 2], solutionOnly: "yes" } },
      },
    },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element.kind"));
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element"));
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element.patch.solutionOnly"));
});

test("statsChart series settings accept structured solution-layer patches", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "diagram.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d1",
      settings: {
        renderer: "statsChart",
        element: {
          kind: "series",
          id: "answer",
          patch: { seriesType: "linePoints", xValues: [0, 1], yValues: [1, 2], color: "#1d4ed8", solutionOnly: true },
        },
      },
    },
  ]);
  assert.equal(result.ok, true);
});

test("statsChart series settings reject invalid targets and values", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "diagram.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d1",
      settings: {
        renderer: "statsChart",
        element: { kind: "curve", patch: { seriesType: "spline", xValues: [0, "one"], solutionOnly: "yes" } },
      },
    },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element.kind"));
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element"));
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element.patch.seriesType"));
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element.patch.xValues[1]"));
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element.patch.solutionOnly"));
});

test("image annotation settings accept structured solution-layer patches", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "diagram.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d1",
      settings: {
        renderer: "image",
        element: {
          kind: "annotation",
          id: "answer",
          patch: { annotationKind: "ellipse", xPercent: 55, yPercent: 60, widthPercent: 20, solutionOnly: true },
        },
      },
    },
  ]);
  assert.equal(result.ok, true);
});

test("image annotation settings reject invalid targets and values", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "diagram.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d1",
      settings: {
        renderer: "image",
        element: { kind: "shape", patch: { annotationKind: "square", xPercent: "middle", solutionOnly: "yes" } },
      },
    },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element.kind"));
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element"));
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element.patch.annotationKind"));
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element.patch.xPercent"));
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element.patch.solutionOnly"));
});

test("Penrose element settings accept structured solution-layer patches", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "diagram.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d1",
      settings: {
        renderer: "network",
        element: { kind: "relationship", id: "AB", patch: { label: "5", points: ["A", "B"], solutionOnly: true } },
      },
    },
    {
      type: "diagram.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d2",
      settings: {
        renderer: "setDiagram",
        element: { kind: "region", id: "onlyA", patch: { label: "7", shaded: true, solutionOnly: true } },
      },
    },
  ]);
  assert.equal(result.ok, true);
});

test("Penrose element settings reject incompatible targets and solution values", () => {
  const result = validateMauthDocumentActionPayloads([
    {
      type: "diagram.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "d1",
      settings: { renderer: "setDiagram", element: { kind: "relationship", patch: { solutionOnly: "yes" } } },
    },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element.kind"));
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element"));
  assert.ok(result.issues.some((issue) => issue.path === "actions[0].settings.element.patch.solutionOnly"));
});
