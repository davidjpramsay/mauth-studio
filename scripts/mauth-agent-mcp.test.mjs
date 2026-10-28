import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { actionCatalog, actionSchema, actionTypes, ACTION_CATALOG_URI, projectSnapshot } from "./mauth-action-contract.mjs";
import { DIAGRAM_TOOLS_URI, DIAGRAM_TOOLS, DIAGRAM_TOOL_EXAMPLES, diagramToolGuide } from "../packages/shared/src/diagramTools.ts";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("MCP connector publishes the complete local document and authoring contract", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(ROOT, "scripts", "mauth-agent-mcp.mjs")],
    env: { ...process.env, MAUTH_AGENT_API_URL: "http://127.0.0.1:9" },
    stderr: "pipe",
  });
  const client = new Client({ name: "mauth-agent-contract-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const result = await client.listTools();
    const resources = await client.listResources();
    assert.ok(resources.resources.some((resource) => resource.uri === ACTION_CATALOG_URI));
    const catalog = await client.readResource({ uri: ACTION_CATALOG_URI });
    assert.equal(JSON.parse(catalog.contents[0].text).version, 1);
    const tools = new Map(result.tools.map((tool) => [tool.name, tool]));
    assert.equal(tools.size, 17);
    assert.ok(resources.resources.some((resource) => resource.uri === DIAGRAM_TOOLS_URI));
    const guideResource = await client.readResource({ uri: DIAGRAM_TOOLS_URI });
    assert.equal(JSON.parse(guideResource.contents[0].text).tools.length, 9);
    assert.equal(tools.get("mauth_diagram_tools")?.annotations?.readOnlyHint, true);
    const guide = await client.callTool({
      name: "mauth_diagram_tools",
      arguments: { intent: "AB is a diameter. C lies on the circle. Prove angle ACB is a right angle." },
    });
    assert.equal(guide.isError, undefined);
    assert.equal(guide.structuredContent.recommendation.id, "geometricConstruction");
    assert.equal(guide.structuredContent.recommendation.engine, "Penrose");
    assert.equal(guide.structuredContent.exampleGraphConfig.type, "geometricConstruction");
    assert.deepEqual(JSON.parse(guide.content[0].text), guide.structuredContent);
    for (const name of [
      "mauth_documents_list",
      "mauth_document_create",
      "mauth_document_open",
      "mauth_document_close",
      "mauth_snapshot",
      "mauth_actions_preview",
      "mauth_actions_apply",
      "mauth_validation_run",
    ]) {
      assert.equal(tools.has(name), true, `Missing tool ${name}`);
    }
    for (const [name, tool] of tools) {
      assert.equal(tool.outputSchema?.type, "object", `${name} must declare an object output schema`);
      assert.equal(tool.annotations?.openWorldHint, false, `${name} must remain local-only`);
    }
    assert.equal(tools.get("mauth_documents_list")?.annotations?.readOnlyHint, true);
    assert.equal(tools.get("mauth_document_create")?.annotations?.destructiveHint, false);
    assert.equal(tools.get("mauth_document_close")?.annotations?.destructiveHint, true);
    assert.match(
      tools.get("mauth_actions_apply")?.inputSchema?.properties?.actions?.description ?? "",
      /main stem.*question\.update\.patch\.text.*Question wording/i,
    );
  } finally {
    await client.close();
  }
});

test("diagram routing distinguishes theorem geometry, coordinate fidelity and other mathematical purposes", () => {
  const cases = [
    ["C lies on the circle with diameter AB; AC = BC.", "geometricConstruction"],
    ["Construct a tangent to the circle at A", "geometricConstruction"],
    ["Plot the circle with equation x^2+y^2=9 on coordinate axes", "graph2d"],
    ["A triangle has vertices A, B, C and equal-length edges", "geometry2d"],
    ["Use Dijkstra's algorithm to find the shortest route", "network"],
    ["Draw the rectangular prism with named vertices", "graph3d"],
    ["Sketch a normal distribution", "statsChart"],
    ["Shade the intersection in a Venn diagram", "setDiagram"],
    ["Draw coordinate vectors with components (4,1)", "vector2d"],
  ];
  for (const [intent, expected] of cases) assert.equal(diagramToolGuide(intent).recommendation?.id, expected, intent);
  assert.equal(diagramToolGuide("Circle theorem with a chord", undefined, true).recommendation.id, "geometry2d");
  assert.equal(diagramToolGuide("Circle the correct answer").recommendation, null);
  assert.equal(diagramToolGuide("Unspecified drawing").recommendation, null);
  for (const tool of DIAGRAM_TOOLS) {
    const guide = diagramToolGuide("", tool.id);
    assert.equal(guide.selectedTool.id, tool.id);
    assert.equal(guide.exampleGraphConfig.type, tool.id);
    assert.equal(
      actionSchema.safeParse([
        { type: "diagram.update", scope: { kind: "question", questionId: "q1" }, blockId: "d1", graphConfig: guide.exampleGraphConfig },
      ]).success,
      true,
    );
  }
});

test("the recommended Penrose circle example compiles and renders through the native engine", async () => {
  const { renderGeometricConstructionDiagram } = await import("../packages/diagram-penrose/src/index.mjs");
  const rendered = await renderGeometricConstructionDiagram(DIAGRAM_TOOL_EXAMPLES.geometricConstruction);
  assert.match(rendered.svg, /<svg/);
  assert.ok(rendered.svg.length > 1000);
});

test("action envelopes track every live editor action and validate examples", () => {
  const source = readFileSync(path.join(ROOT, "apps/web/src/lib/mauthActions.ts"), "utf8");
  const start = source.indexOf("export const MAUTH_CONTENT_ACTION_TYPES");
  const end = source.indexOf("export const MAUTH_DOCUMENT_ACTION_TYPES", start);
  const names = [...source.slice(start, end).matchAll(/"([A-Za-z]+(?:\.[A-Za-z]+)+)"/g)].map((match) => match[1]);
  assert.deepEqual([...actionTypes].sort(), [...names].sort());
  for (const example of actionCatalog.examples) assert.equal(actionSchema.safeParse([example]).success, true);
  assert.equal(actionSchema.safeParse([{ type: "question.update", patch: {} }]).success, false);
  assert.equal(actionSchema.safeParse([{ type: "unknown.action" }]).success, false);
  assert.equal(actionSchema.safeParse([{ type: "marks.update", target: { kind: "part", questionId: "q" }, marks: 1 }]).success, false);
});

test("scoped snapshots preserve preconditions, tab state and storage errors", () => {
  const snapshot = {
    httpStatus: 200,
    snapshotId: "current",
    mutationBase: { snapshotId: "current" },
    activeDocumentId: "tab1",
    openDocuments: [{ id: "tab1", dirty: true }],
    questionCount: 2,
    questions: [{ id: "q1" }, { id: "q2" }],
  };
  const scoped = projectSnapshot(snapshot, "q2");
  assert.deepEqual(scoped.questions, [{ id: "q2" }]);
  assert.equal(scoped.mutationBase, snapshot.mutationBase);
  assert.equal(scoped.openDocuments, snapshot.openDocuments);
  assert.equal(projectSnapshot(snapshot, "missing").httpStatus, 404);
  const unavailable = { httpStatus: 503, code: "STORAGE_UNAVAILABLE" };
  assert.equal(projectSnapshot(unavailable, "q2"), unavailable);
});
