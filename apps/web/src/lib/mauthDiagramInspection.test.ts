import assert from "node:assert/strict";
import test from "node:test";

import type { GraphConfig } from "@mauth-studio/shared";

import { inspectMauthDiagram, isAgentDiagramInspectionWarningBlocking } from "./mauthDiagramInspection.ts";

function graph2d(functionEntry: Record<string, unknown>): GraphConfig {
  return {
    type: "graph2d",
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10,
    functions: [functionEntry],
  };
}

function vector2d(): GraphConfig {
  return {
    type: "vector2d",
    showMinorGrid: true,
    metadata: {
      vector2d: {
        vectors: [{ id: "a", name: "a", start: [0, 0], components: [2, 3] }],
      },
    },
  };
}

test("inspectMauthDiagram warns when a logarithm function domain crosses its natural boundary", () => {
  const inspection = inspectMauthDiagram(
    graph2d({
      kind: "expression",
      expression: "log(x+1)/log(10)",
      domainMin: -1.46,
      domainMax: 10,
      show: true,
    }),
    "The graph is the graph of $y=\\log_{10}x$ shifted left by 1 unit.",
  );

  const warning = inspection.warnings.find((item) => item.code === "graph2d-natural-domain-crossed");
  assert.ok(warning);
  assert.equal(warning.path, "graphConfig.functions[0].domainMin");
  assert.match(warning.message, /natural domain is x > -1/);
  assert.equal(isAgentDiagramInspectionWarningBlocking(warning), true);
});

test("inspectMauthDiagram warns when a log10 function domain crosses its natural boundary", () => {
  const inspection = inspectMauthDiagram(
    graph2d({
      kind: "expression",
      expression: "log10(x+1)",
      domainMin: -1,
      domainMax: 10,
      show: true,
    }),
    "The graph is the graph of $y=\\log_{10}x$ shifted left by 1 unit.",
  );

  const warning = inspection.warnings.find((item) => item.code === "graph2d-natural-domain-crossed");
  assert.ok(warning);
  assert.equal(warning.path, "graphConfig.functions[0].domainMin");
  assert.match(warning.message, /log10\(x\+1\)/);
});

test("inspectMauthDiagram accepts a logarithm function domain inside its natural boundary", () => {
  const inspection = inspectMauthDiagram(
    graph2d({
      kind: "expression",
      expression: "log(x+1)/log(10)",
      domainMin: -0.96,
      domainMax: 10,
      show: true,
    }),
    "The graph is the graph of $y=\\log_{10}x$ shifted left by 1 unit.",
  );

  assert.equal(
    inspection.warnings.some((item) => item.code === "graph2d-natural-domain-crossed"),
    false,
  );
});

test("inspectMauthDiagram warns when copied graph2d enables minor grid without source evidence", () => {
  const inspection = inspectMauthDiagram(
    {
      ...graph2d({ kind: "expression", expression: "x^2", show: true }),
      showMinorGrid: true,
    },
    "Copy the coordinate graph of y = x^2.",
  );

  const warning = inspection.warnings.find((item) => item.code === "graph2d-unnecessary-minor-grid");
  assert.ok(warning);
  assert.equal(warning.path, "graphConfig.showMinorGrid");
  assert.equal(isAgentDiagramInspectionWarningBlocking(warning), false);
});

test("inspectMauthDiagram accepts minor grid when the copied source uses it", () => {
  const inspection = inspectMauthDiagram(
    {
      ...graph2d({ kind: "expression", expression: "x^2", show: true }),
      showMinorGrid: true,
    },
    "Copy the coordinate graph. The source uses small squares with 0.5 unit grid spacing.",
  );

  assert.equal(
    inspection.warnings.some((item) => item.code === "graph2d-unnecessary-minor-grid"),
    false,
  );
});

test("inspectMauthDiagram warns when copied vector2d enables minor grid without source evidence", () => {
  const inspection = inspectMauthDiagram(vector2d(), "Copy the vector diagram showing vector a = (2, 3).");

  const warning = inspection.warnings.find((item) => item.code === "vector2d-unnecessary-minor-grid");
  assert.ok(warning);
  assert.equal(warning.path, "graphConfig.showMinorGrid");
});
