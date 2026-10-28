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
    assert.equal(tools.size, 18);
    assert.ok(resources.resources.some((resource) => resource.uri === DIAGRAM_TOOLS_URI));
    const guideResource = await client.readResource({ uri: DIAGRAM_TOOLS_URI });
    assert.equal(JSON.parse(guideResource.contents[0].text).tools.length, 9);
    assert.equal(tools.get("mauth_diagram_tools")?.annotations?.readOnlyHint, true);
    assert.equal(tools.get("mauth_diagrams_inspect")?.annotations?.readOnlyHint, true);
    assert.equal(tools.get("mauth_diagram_tools")?.inputSchema?.properties?.requirements?.additionalProperties, false);
    const guide = await client.callTool({
      name: "mauth_diagram_tools",
      arguments: { intent: "AB is a diameter. C lies on the circle. Prove angle ACB is a right angle." },
    });
    const conflict = await client.callTool({
      name: "mauth_diagram_tools",
      arguments: { requirements: { purpose: "geometry", relationships: ["parallel"], draggableLabels: true, exactPositioning: true } },
    });
    assert.equal(conflict.structuredContent.assessment.status, "unsupported");
    assert.equal(guide.isError, undefined);
    assert.equal(guide.structuredContent.recommendation.id, "geometricConstruction");
    assert.equal(guide.structuredContent.recommendation.engine, "Penrose");
    assert.equal(guide.structuredContent.recommendation.authoringMode, "advancedSubstance");
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

test("capability policy respects explicit requirements, conflicts, alternatives and uncertainty", () => {
  const cases = [
    [{ purpose: "geometry", relationships: ["parallel", "midpoint"] }, "geometricConstruction"],
    [
      { purpose: "geometry", relationships: ["circleMembership"], draggableLabels: true, solutionAnnotations: "paired" },
      "geometricConstruction",
    ],
    [{ purpose: "geometry", exactPositioning: true, draggableLabels: true, teacherControls: "structured" }, "geometry2d"],
    [{ purpose: "coordinates", requiredFeatures: ["functions", "implicitRelations"] }, "graph2d"],
    [{ purpose: "vectors", draggableLabels: true }, "vector2d"],
    [{ purpose: "spatial", requiredFeatures: ["rotation3d", "dimensions"] }, "graph3d"],
    [{ purpose: "sets", solutionAnnotations: "elements" }, "setDiagram"],
    [{ purpose: "network", teacherControls: "structured" }, "network"],
    [{ purpose: "statistics", requiredFeatures: ["densityShading"], solutionAnnotations: "elements" }, "statsChart"],
    [{ purpose: "image", requiredFeatures: ["imageAnnotations"] }, "image"],
  ];
  for (const [requirements, expected] of cases) {
    const guide = diagramToolGuide("", undefined, false, requirements);
    assert.equal(guide.recommendation?.id, expected, JSON.stringify(requirements));
    assert.equal(guide.assessment.verification.construction, "notRun");
    assert.equal(guide.assessment.verification.renderedLayout, "notRun");
  }
  for (const requirements of [
    { purpose: "geometry", relationships: ["parallel"], draggableLabels: true, exactPositioning: true },
    { purpose: "geometry", relationships: ["circleMembership"], teacherControls: "structured" },
    { purpose: "geometry", relationships: ["midpoint"], solutionAnnotations: "elements" },
    { purpose: "network", exactPositioning: true },
    { purpose: "statistics", draggableLabels: true },
    { purpose: "geometry", otherRequirements: ["animate the construction step by step"] },
  ]) {
    const guide = diagramToolGuide("", undefined, false, requirements);
    assert.equal(guide.assessment.status, "unsupported", JSON.stringify(requirements));
    assert.equal(guide.recommendation, null);
    assert.ok(guide.assessment.uncertainty.length);
  }
  const ambiguous = diagramToolGuide("", undefined, false, { requiredFeatures: ["draggableLabels"] });
  assert.equal(ambiguous.assessment.status, "ambiguous");
  assert.equal(ambiguous.recommendation, null);
  const override = diagramToolGuide("Circle theorem", "geometricConstruction", false, {
    purpose: "geometry",
    sourceFidelity: true,
    draggableLabels: true,
  });
  assert.equal(override.recommendation.id, "geometry2d");
  assert.equal(override.assessment.selectedToolAssessment.eligible, false);
  assert.ok(override.assessment.selectedToolAssessment.missingFeatures.includes("fixedCoordinates"));
  assert.equal(override.exampleGraphConfig, undefined);
  const advanced = diagramToolGuide("Circle theorem", "geometricConstruction", false, { teacherControls: "structured" }, true);
  assert.equal(advanced.assessment.selectedToolAssessment.eligible, false);
  assert.match(advanced.assessment.selectedToolAssessment.limitations.join(" "), /dragged within/);
});

test("Penrose diameter construction satisfies givens and preserves answer-only geometry", async () => {
  const { renderGeometricConstructionDiagram } = await import("../packages/diagram-penrose/src/index.mjs");
  const fixture = JSON.parse(readFileSync(path.join(ROOT, "packages/diagram-penrose/fixtures/diameter-circle.json"), "utf8"));
  for (const [copy, config] of Object.entries(fixture)) {
    const result = await renderGeometricConstructionDiagram(config);
    const svg = new DOMParser().parseFromString(result.svg, "image/svg+xml");
    const circles = [...svg.querySelectorAll("circle")];
    const point = (name) => {
      const element = circles.find((node) => node.querySelector("title")?.textContent === `\`${name}\`.dot`);
      assert.ok(element, name);
      return [+element.getAttribute("cx"), +element.getAttribute("cy")];
    };
    const A = point("A"),
      B = point("B"),
      C = point("C"),
      O = point("O");
    const length = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    const radius = length(A, O);
    assert.ok(length(O, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]) < radius * 0.001);
    assert.ok(Math.abs(length(B, O) - radius) < radius * 0.001);
    assert.ok(Math.abs(length(C, O) - radius) < radius * 0.001);
    assert.ok(Math.abs(length(A, C) - length(B, C)) < radius * 0.001);
    const cosine = ((A[0] - C[0]) * (B[0] - C[0]) + (A[1] - C[1]) * (B[1] - C[1])) / (length(A, C) * length(B, C));
    assert.ok(Math.abs(cosine) < 0.001, "angle ACB is 90 degrees");
    assert.ok(Math.abs(A[1] - B[1]) < radius * 0.001);
    assert.ok(C[1] < O[1], "apex is above the diameter");
    const dashed = svg.querySelector("[stroke-dasharray]");
    assert.deepEqual(
      dashed
        .getAttribute("stroke-dasharray")
        .split(" ")
        .map((n) => (Number(n) * config.options.scalePercent) / 100),
      [6, 5],
    );
    const titles = [...svg.querySelectorAll("title")].map((node) => node.textContent);
    assert.equal(
      titles.some((title) => title.includes("rightAngleMark")),
      copy === "solution",
    );
    assert.equal(
      titles.some((title) => title.includes("answerAngle")),
      copy === "solution",
    );
    if (copy === "solution") assert.match(result.svg, /#1d4ed8/i);
    assert.ok(result.metadata.labelIds.includes("C.labelText"));
    assert.ok(result.metadata.labelIds.includes("diameter.text"));
    assert.ok(!result.metadata.labelIds.includes("omega.labelText"), "invisible helper labels are not draggable");
    const moved = await renderGeometricConstructionDiagram({
      ...config,
      options: { ...config.options, labelOffsets: { "C.labelText": [11, -4], "diameter.text": [0, 8] } },
    });
    const movedSvg = new DOMParser().parseFromString(moved.svg, "image/svg+xml");
    assert.equal(movedSvg.querySelector('[data-mauth-penrose-label="C.labelText"]').getAttribute("transform"), "translate(11, -4)");
    assert.equal(movedSvg.documentElement.getAttribute("viewBox"), svg.documentElement.getAttribute("viewBox"));
    assert.deepEqual(
      [...movedSvg.querySelectorAll("circle, line, polygon")].map((node) => node.outerHTML),
      [...svg.querySelectorAll("circle, line, polygon")].map((node) => node.outerHTML),
      "label offsets leave optimized geometry unchanged",
    );
  }
});

test("Penrose scale preserves paper stroke, dash and dot sizes without moving geometry", async () => {
  const { renderGeometricConstructionDiagram } = await import("../packages/diagram-penrose/src/index.mjs");
  const fixture = JSON.parse(readFileSync(path.join(ROOT, "packages/diagram-penrose/fixtures/diameter-circle.json"), "utf8"));
  let originalGeometry;
  for (const scalePercent of [50, 100, 160, 200]) {
    const result = await renderGeometricConstructionDiagram({
      ...fixture.solution,
      options: { ...fixture.solution.options, scalePercent },
    });
    const svg = new DOMParser().parseFromString(result.svg, "image/svg+xml");
    const shape = (title) => {
      const parent = [...svg.querySelectorAll("title")].find((node) => node.textContent === title).parentElement;
      return parent.matches("circle, line, path, polygon") ? parent : parent.querySelector("circle, line, path, polygon");
    };
    const scale = scalePercent / 100;
    assert.ok(Math.abs(+shape("`AB`.segmentLine").getAttribute("stroke-width") * scale - 2) < 0.002);
    assert.ok(Math.abs(+shape("`omega`.shape").getAttribute("stroke-width") * scale - 2) < 0.002);
    assert.ok(Math.abs(+shape("`C`.dot").getAttribute("r") * scale - 3) < 0.002);
    const geometry = [...svg.querySelectorAll("circle, line, polygon")].map((node) =>
      [...node.attributes]
        .filter(
          (attribute) =>
            !["stroke-width", "stroke-dasharray", ...(/\.dot$/.test(node.querySelector("title")?.textContent ?? "") ? ["r"] : [])].includes(
              attribute.name,
            ),
        )
        .map((a) => [a.name, a.value]),
    );
    if (originalGeometry) assert.deepEqual(geometry, originalGeometry);
    originalGeometry = geometry;
    const answerTitle = [...svg.querySelectorAll("title")].find((node) => node.textContent.includes("rightAngleMark")).textContent;
    const answerMark = shape(answerTitle);
    assert.ok(Math.abs(+answerMark.getAttribute("stroke-width") * scale - 1.7) < 0.002);
  }
});
