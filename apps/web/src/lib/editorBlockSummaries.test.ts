import assert from "node:assert/strict";
import test from "node:test";
import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import {
  createEditorBlockSummaryRuntime,
  columnsBlockSummary,
  spaceBlockSummary,
  tableBlockSummary,
  textBlockSummary,
} from "./editorBlockSummaries.ts";

const runtime = createEditorBlockSummaryRuntime({
  withGraphDefaults: (graphConfig?: GraphConfig | null) => ({
    type: graphConfig?.type ?? "graph2d",
    functions: graphConfig?.functions ?? [],
    features: graphConfig?.features ?? [],
    metadata: graphConfig?.metadata ?? {},
    ...(graphConfig ?? {}),
  }),
  normalizeDiagramType: (type?: string | null) => type || "graph2d",
  diagramTypes: [{ value: "customDiagram", label: "Custom diagram" }],
  choiceNumberingStyles: [{ value: "upper-alpha", label: "A, B, C" }],
});

test("text and space summaries are compact and stable", () => {
  assert.equal(textBlockSummary("  First   line\nsecond line  "), "First line second line");
  assert.equal(textBlockSummary("   "), "Empty text block");
  assert.equal(spaceBlockSummary(1), "1 line");
  assert.equal(spaceBlockSummary(4), "4 lines");
});

test("choice, table, and columns summaries describe editable surfaces", () => {
  assert.equal(
    runtime.choiceListSummary({ id: "choices-1", kind: "choices", choices: ["A", "", "C"], numberingStyle: "upper-alpha" }),
    "2 a, b, c choices",
  );
  assert.equal(
    tableBlockSummary({
      id: "table-1",
      kind: "table",
      headers: ["x", "y"],
      rows: [
        ["1", "2"],
        ["3", "4"],
      ],
      showHeader: true,
    }),
    "3 rows, 2 columns",
  );
  assert.equal(
    columnsBlockSummary({
      id: "columns-1",
      kind: "columns",
      columnCount: 2,
      columns: [[{ id: "text-1", kind: "text", text: "A" }], [{ id: "space-1", kind: "space", lines: 2 }]],
    }),
    "2 columns, 2 modules",
  );
});

test("diagram and toc summaries use the supplied graph defaults", () => {
  const diagramBlock: ContentBlock = {
    id: "diagram-1",
    kind: "diagram",
    graphConfig: {
      type: "graph2d",
      functions: [{ id: "f", kind: "expression", expression: "x", show: true }],
      features: [{ id: "point-1", kind: "point", x: 1, y: 2, show: true }],
      metadata: {},
    },
  };

  assert.equal(runtime.diagramBlockSummary(diagramBlock), "1 function, 1 feature");
  assert.equal(runtime.tocBlockSummary(diagramBlock), "1 function, 1 feature");
});

test("toc block summary falls back to diagram type labels", () => {
  assert.equal(runtime.diagramConfigSummary({ type: "customDiagram", functions: [], features: [], metadata: {} }), "Custom diagram");
});
