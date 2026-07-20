import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_ROOT =
  process.env.MAUTH_DIAGRAM_SOLUTION_SMOKE_OUTPUT ?? path.join(ROOT, "workspace", "verification", "diagram-solution-authoring-smoke");
const CURRENT_DRAFT_STORAGE_KEY = "mauth-studio.current-draft.v1";
const ROOT_DIAGRAM_ANCHOR = "q:q-diagram/b:diagram-root";
const NESTED_DIAGRAM_ANCHOR = "q:q-diagram/b:columns/c:0/b:diagram-nested";
const GRAPH_2D_DIAGRAM_ANCHOR = "q:q-diagram/b:diagram-graph2d";
const GEOMETRY_DIAGRAM_ANCHOR = "q:q-diagram/b:diagram-geometry";
const VECTOR_DIAGRAM_ANCHOR = "q:q-diagram/b:diagram-vector";
const GRAPH_3D_DIAGRAM_ANCHOR = "q:q-diagram/b:diagram-3d";
const STATS_DIAGRAM_ANCHOR = "q:q-diagram/b:diagram-stats";
const IMAGE_DIAGRAM_ANCHOR = "q:q-diagram/b:diagram-image";
const PENROSE_GEOMETRY_ANCHOR = "q:q-diagram/b:diagram-penrose-geometry";
const PENROSE_NETWORK_ANCHOR = "q:q-diagram/b:diagram-penrose-network";
const SMOKE_IMAGE_SRC =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#f8fafc"/><path d="M20 70 L80 20 L140 70 Z" fill="none" stroke="#2563eb" stroke-width="5"/></svg>',
  );

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not allocate a free local port"));
      });
    });
  });
}

async function waitForServer(url, child, logs) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Process exited before serving ${url}\n${logs.join("")}`);
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // Local dev servers can take a moment to bind and pre-bundle.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}\n${logs.join("")}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(2500).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

function seededDraft() {
  return {
    frontMatter: {
      subjectTitle: "MATHEMATICS",
      assessmentTitle: "Diagram solution authoring smoke",
      titlePageTemplate: "worksheet",
    },
    formattingConfig: {},
    questions: [
      {
        id: "q-diagram",
        section: "Diagram solutions",
        marks: 4,
        contentBlocks: [
          {
            id: "diagram-root",
            kind: "diagram",
            graphConfig: {
              type: "setDiagram",
              data: {
                setCount: 2,
                sets: [
                  { id: "A", label: "A" },
                  { id: "B", label: "B" },
                ],
              },
            },
          },
          {
            id: "columns",
            kind: "columns",
            columnCount: 1,
            columns: [
              [
                {
                  id: "diagram-nested",
                  kind: "diagram",
                  graphConfig: {
                    type: "statsChart",
                    data: { values: [1, 1, 2, 3], barType: "discrete" },
                  },
                },
              ],
            ],
          },
          {
            id: "diagram-graph2d",
            kind: "diagram",
            markTicks: 4,
            graphConfig: {
              type: "graph2d",
              functions: [{ expression: "x^2", label: "f", color: "#111827" }],
              features: [{ kind: "point", x: 1, y: 1, label: "P", solutionOnly: true }],
              xMin: -2,
              xMax: 3,
              yMin: -2,
              yMax: 4,
              widthPx: 360,
              heightPx: 280,
              showGrid: true,
              showAxes: true,
            },
          },
          {
            id: "diagram-geometry",
            kind: "diagram",
            graphConfig: {
              type: "geometry2d",
              data: {
                points: [{ id: "A", x: 0, y: 0, label: "$A$" }],
              },
              xMin: -2,
              xMax: 3,
              yMin: -2,
              yMax: 3,
              widthPx: 360,
              heightPx: 280,
              showGrid: false,
              showAxes: false,
            },
          },
          {
            id: "diagram-vector",
            kind: "diagram",
            graphConfig: {
              type: "vector2d",
              metadata: {
                vector2d: {
                  labelStyle: "boldLower",
                  vectors: [
                    {
                      id: "a",
                      name: "a",
                      label: "",
                      start: [0, 0],
                      components: [2, 1],
                      color: "#0f766e",
                      showComponents: false,
                    },
                  ],
                },
              },
              xMin: -1,
              xMax: 4,
              yMin: -1,
              yMax: 4,
              widthPx: 360,
              heightPx: 280,
              showGrid: true,
              showAxes: true,
            },
          },
          {
            id: "diagram-3d",
            kind: "diagram",
            graphConfig: {
              type: "graph3d",
              data: {
                points: [{ id: "A", label: "A", coords: [-1, 0, 0], color: "#111827" }],
                xRange: [-2, 3],
                yRange: [-2, 3],
                zRange: [-2, 3],
              },
              widthPx: 420,
              heightPx: 320,
              metadata: { view3d: { az: 1, el: 0.3, bank: 0 } },
            },
          },
          {
            id: "diagram-stats",
            kind: "diagram",
            graphConfig: {
              type: "statsChart",
              data: {
                chartType: "blankAxes",
                range: [0, 2],
                yRange: [0, 2],
                xLabel: "x",
                yLabel: "Frequency",
              },
              options: { widthPx: 420, heightPx: 280, showGrid: true },
            },
          },
          {
            id: "diagram-image",
            kind: "diagram",
            graphConfig: {
              type: "image",
              data: {
                src: SMOKE_IMAGE_SRC,
                name: "Triangle",
                alt: "An outlined triangle",
                mimeType: "image/svg+xml",
                naturalWidth: 160,
                naturalHeight: 90,
              },
              widthPx: 360,
              heightPx: 200,
              functions: [],
              features: [],
            },
          },
          {
            id: "diagram-penrose-geometry",
            kind: "diagram",
            graphConfig: {
              type: "geometricConstruction",
              data: {
                objects: [
                  { type: "point", name: "A", label: "A" },
                  { type: "point", name: "B", label: "B" },
                ],
                relationships: [{ type: "segment", name: "AB", points: ["A", "B"], label: "" }],
              },
              options: { variation: "penrose-geometry-smoke" },
            },
          },
          {
            id: "diagram-penrose-network",
            kind: "diagram",
            graphConfig: {
              type: "network",
              data: {
                hidePoints: false,
                hidePointLabels: false,
                objects: [
                  { type: "point", name: "A", label: "A" },
                  { type: "point", name: "B", label: "B" },
                ],
                relationships: [{ type: "vectorSegment", name: "AB", points: ["A", "B"], label: "" }],
              },
              options: { variation: "penrose-network-smoke" },
            },
          },
        ],
        parts: [],
        itemOrder: [
          { kind: "block", id: "diagram-root" },
          { kind: "block", id: "columns" },
          { kind: "block", id: "diagram-graph2d" },
          { kind: "block", id: "diagram-geometry" },
          { kind: "block", id: "diagram-vector" },
          { kind: "block", id: "diagram-3d" },
          { kind: "block", id: "diagram-stats" },
          { kind: "block", id: "diagram-image" },
          { kind: "block", id: "diagram-penrose-geometry" },
          { kind: "block", id: "diagram-penrose-network" },
        ],
        pageBreakAfter: false,
      },
    ],
    sectionHeadings: [],
    documentFlow: [{ kind: "question", id: "q-diagram" }],
    updatedAt: new Date().toISOString(),
  };
}

function rootDiagrams(snapshot) {
  const question = snapshot?.questions?.find((candidate) => candidate.id === "q-diagram");
  return (question?.contentBlocks ?? []).filter((block) => block.kind === "diagram" && block.graphConfig?.type === "setDiagram");
}

function nestedDiagrams(snapshot) {
  const question = snapshot?.questions?.find((candidate) => candidate.id === "q-diagram");
  const columns = (question?.contentBlocks ?? []).find((block) => block.id === "columns" && block.kind === "columns");
  return (columns?.columns?.[0] ?? []).filter((block) => block.kind === "diagram");
}

function geometryDiagram(snapshot) {
  const question = snapshot?.questions?.find((candidate) => candidate.id === "q-diagram");
  return (question?.contentBlocks ?? []).find((block) => block.id === "diagram-geometry" && block.kind === "diagram");
}

function graph2dDiagram(snapshot) {
  const question = snapshot?.questions?.find((candidate) => candidate.id === "q-diagram");
  return (question?.contentBlocks ?? []).find((block) => block.id === "diagram-graph2d" && block.kind === "diagram");
}

function vectorDiagram(snapshot) {
  const question = snapshot?.questions?.find((candidate) => candidate.id === "q-diagram");
  return (question?.contentBlocks ?? []).find((block) => block.id === "diagram-vector" && block.kind === "diagram");
}

function graph3dDiagram(snapshot) {
  const question = snapshot?.questions?.find((candidate) => candidate.id === "q-diagram");
  return (question?.contentBlocks ?? []).find((block) => block.id === "diagram-3d" && block.kind === "diagram");
}

function statsDiagram(snapshot) {
  const question = snapshot?.questions?.find((candidate) => candidate.id === "q-diagram");
  return (question?.contentBlocks ?? []).find((block) => block.id === "diagram-stats" && block.kind === "diagram");
}

function imageDiagram(snapshot) {
  const question = snapshot?.questions?.find((candidate) => candidate.id === "q-diagram");
  return (question?.contentBlocks ?? []).find((block) => block.id === "diagram-image" && block.kind === "diagram");
}

function penroseGeometryDiagram(snapshot) {
  const question = snapshot?.questions?.find((candidate) => candidate.id === "q-diagram");
  return (question?.contentBlocks ?? []).find((block) => block.id === "diagram-penrose-geometry" && block.kind === "diagram");
}

function penroseNetworkDiagram(snapshot) {
  const question = snapshot?.questions?.find((candidate) => candidate.id === "q-diagram");
  return (question?.contentBlocks ?? []).find((block) => block.id === "diagram-penrose-network" && block.kind === "diagram");
}

async function waitForDraft(page, predicate, message) {
  for (let attempt = 0; attempt < 70; attempt += 1) {
    const snapshot = await page.evaluate(
      (storageKey) => JSON.parse(window.localStorage.getItem(storageKey) ?? "null"),
      CURRENT_DRAFT_STORAGE_KEY,
    );
    if (predicate(snapshot)) return snapshot;
    await delay(100);
  }
  assert.fail(message);
}

async function main() {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mauth-diagram-solution-smoke-"));
  const outputDir = path.join(OUTPUT_ROOT, timestampSlug());
  await fs.mkdir(outputDir, { recursive: true });

  const apiPort = await findFreePort();
  const webPort = await findFreePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;
  const apiLogs = [];
  const webLogs = [];
  const api = spawn("uv", ["run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(apiPort)], {
    cwd: path.join(ROOT, "apps/api"),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, MAUTH_DOCUMENTS_ROOT: workspaceRoot },
  });
  api.stdout.on("data", (chunk) => apiLogs.push(chunk.toString()));
  api.stderr.on("data", (chunk) => apiLogs.push(chunk.toString()));

  let web;
  let browser;
  try {
    await waitForServer(`${apiUrl}/api/system/status`, api, apiLogs);
    web = spawn("pnpm", ["--dir", "apps/web", "dev", "--host", "127.0.0.1", "--port", String(webPort)], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "none", VITE_API_URL: apiUrl },
    });
    web.stdout.on("data", (chunk) => webLogs.push(chunk.toString()));
    web.stderr.on("data", (chunk) => webLogs.push(chunk.toString()));
    await waitForServer(webUrl, web, webLogs);

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1540, height: 1180 } });
    const consoleMessages = [];
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) consoleMessages.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => consoleMessages.push(`pageerror: ${error.message}`));
    await page.addInitScript(
      ([storageKey, draft]) => {
        window.localStorage.clear();
        window.localStorage.setItem(storageKey, JSON.stringify(draft));
        window.localStorage.setItem("mauth-studio.theme.v1", "dark");
      },
      [CURRENT_DRAFT_STORAGE_KEY, seededDraft()],
    );

    await page.goto(webUrl);
    await page.getByRole("button", { name: "Manual editor mode" }).click();

    await page.getByRole("radio", { name: "Solutions" }).click();
    const questionSolutionStatus = page.locator('[data-solution-scope-anchor="q:q-diagram"]').first();
    await questionSolutionStatus.waitFor();
    assert.equal(
      await questionSolutionStatus.getAttribute("data-solution-scope-status"),
      "ready",
      "A marked shared diagram with a structured solution annotation should validate as ready.",
    );
    await page.locator(`.preview-pane [data-scroll-anchor="${GRAPH_2D_DIAGRAM_ANCHOR}"]`).getByLabel("4 solution marks").waitFor();
    assert.equal(
      await page.locator(`.preview-pane [data-scroll-anchor="${GRAPH_2D_DIAGRAM_ANCHOR}"] .test-solution-surface`).count(),
      0,
      "Element-level diagram answers should not recolour the entire shared diagram.",
    );
    await page.screenshot({ path: path.join(outputDir, "shared-diagram-solution-ready.png"), fullPage: false });
    await page.getByRole("radio", { name: "Student" }).click();

    const rootPanel = page.locator(`.editor-pane [data-scroll-anchor="${ROOT_DIAGRAM_ANCHOR}"]`).first();
    await rootPanel.waitFor();
    const rootComplete = rootPanel.getByRole("button", { name: "Complete in solutions" });
    await rootComplete.waitFor();
    await rootComplete.click();

    let snapshot = await waitForDraft(
      page,
      (draft) => rootDiagrams(draft).length === 2 && rootDiagrams(draft).some((block) => block.visibility === "solution"),
      "Root diagram should gain one editable solution copy.",
    );
    assert.equal(rootDiagrams(snapshot).filter((block) => block.visibility === "student").length, 1);
    assert.equal(rootDiagrams(snapshot).filter((block) => block.visibility === "solution").length, 1);
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-solution-scope-anchor="q:q-diagram"]');
      return status?.getAttribute("data-solution-scope-status") === "warning" && status.getAttribute("title")?.includes("still matches");
    });
    await page.getByRole("radio", { name: "Student" }).click();
    await rootPanel.getByRole("button", { name: "Complete in solutions" }).click();
    snapshot = await waitForDraft(
      page,
      (draft) => rootDiagrams(draft).length === 2,
      "Reopening a root solution diagram must not create a duplicate.",
    );
    assert.equal(rootDiagrams(snapshot).length, 2);
    await page.getByRole("radio", { name: "Student" }).click();

    const nestedPanel = page.locator(`.editor-pane [data-scroll-anchor="${NESTED_DIAGRAM_ANCHOR}"]`).first();
    await nestedPanel.waitFor();
    await nestedPanel.getByRole("button", { name: "Complete in solutions" }).click();
    snapshot = await waitForDraft(
      page,
      (draft) => nestedDiagrams(draft).length === 2 && nestedDiagrams(draft).some((block) => block.visibility === "solution"),
      "Nested diagram should gain one editable solution copy.",
    );
    assert.equal(nestedDiagrams(snapshot).filter((block) => block.visibility === "student").length, 1);
    assert.equal(nestedDiagrams(snapshot).filter((block) => block.visibility === "solution").length, 1);
    const nestedSolution = nestedDiagrams(snapshot).find((block) => block.visibility === "solution");
    assert.ok(nestedSolution, "Nested solution diagram should remain addressable after creation.");
    const nestedSolutionPanel = page
      .locator(`.editor-pane [data-scroll-anchor="q:q-diagram/b:columns/c:0/b:${nestedSolution.id}"]`)
      .first();
    await nestedSolutionPanel.waitFor();
    await nestedSolutionPanel.locator('[data-panel-region="body"]').waitFor({ state: "visible" });
    assert.equal(
      await page.locator('.editor-pane [data-scroll-anchor^="q:q-diagram/b:columns/c:0/b:"]').count(),
      1,
      "Solutions mode should render only the active nested diagram layer.",
    );

    const graph2dPanel = page.locator(`.editor-pane [data-scroll-anchor="${GRAPH_2D_DIAGRAM_ANCHOR}"]`).first();
    await graph2dPanel.waitFor();
    const graphFunctionAnchor = page.locator(`.editor-pane [data-scroll-anchor="${GRAPH_2D_DIAGRAM_ANCHOR}/gf:0"]`).first();
    await graphFunctionAnchor.waitFor();
    await graphFunctionAnchor.dispatchEvent("pointerdown");
    const graphInspector = page.locator(".selection-inspector-pane");
    await graphInspector.getByText("Function display settings", { exact: true }).waitFor();
    await graphInspector.getByRole("textbox", { name: /function 1 label/i }).fill("g");
    snapshot = await waitForDraft(
      page,
      (draft) => graph2dDiagram(draft)?.graphConfig?.functions?.[0]?.label === "g",
      "The extracted graph function inspector should update the selected function.",
    );

    await graph2dPanel.getByRole("button", { name: "Add solution function" }).click();
    snapshot = await waitForDraft(
      page,
      (draft) => graph2dDiagram(draft)?.graphConfig?.functions?.length === 2,
      "Solutions mode should add a second graph function.",
    );
    assert.equal(
      graph2dDiagram(snapshot)?.graphConfig?.functions?.[1]?.solutionOnly,
      true,
      "New graph functions should default to the active Solutions layer.",
    );
    const solutionFunctionAnchor = page.locator(`.editor-pane [data-scroll-anchor="${GRAPH_2D_DIAGRAM_ANCHOR}/gf:1"]`).first();
    await solutionFunctionAnchor.waitFor();
    await solutionFunctionAnchor.getByText("Solution", { exact: true }).waitFor();
    const solutionExpression = solutionFunctionAnchor.locator('input[placeholder="x^2 - 5*x + 6"]').first();
    await solutionExpression.fill("(x-1)^2-1");
    snapshot = await waitForDraft(
      page,
      (draft) => graph2dDiagram(draft)?.graphConfig?.functions?.[1]?.expression === "(x-1)^2-1",
      "The solution function should remain directly editable.",
    );
    const solutionCurve = page.locator('.preview-pane [data-mauth-graph-function-index="1"]').first();
    await solutionCurve.waitFor();
    const solutionCurveStroke = await solutionCurve.evaluate((element) =>
      (element.getAttribute("stroke") || getComputedStyle(element).stroke || "").toLowerCase(),
    );
    assert.ok(
      solutionCurveStroke.includes("29, 78, 216") || solutionCurveStroke.includes("#1d4ed8"),
      `Solution function should render blue, received ${solutionCurveStroke}.`,
    );
    await solutionFunctionAnchor.dispatchEvent("pointerdown");
    await graphInspector.getByText("Function display settings", { exact: true }).waitFor();
    const graphFunctionSolutionToggle = graphInspector.getByRole("checkbox", {
      name: /function 2 show in solutions only/i,
    });
    assert.equal(await graphFunctionSolutionToggle.isChecked(), true);
    await graphFunctionSolutionToggle.uncheck();
    snapshot = await waitForDraft(
      page,
      (draft) => graph2dDiagram(draft)?.graphConfig?.functions?.[1]?.solutionOnly !== true,
      "The graph function inspector should return an answer curve to the shared layer.",
    );
    await graphFunctionSolutionToggle.check();
    snapshot = await waitForDraft(
      page,
      (draft) => graph2dDiagram(draft)?.graphConfig?.functions?.[1]?.solutionOnly === true,
      "The graph function inspector should return an answer curve to the Solutions layer.",
    );
    await page.screenshot({ path: path.join(outputDir, "graph2d-solution-function.png"), fullPage: false });
    await page.getByRole("radio", { name: "Student" }).click();
    await page.waitForFunction(
      (anchor) =>
        !document.querySelector(`.editor-pane [data-scroll-anchor="${anchor}/gf:1"]`) &&
        !document.querySelector('.preview-pane [data-mauth-graph-function-index="1"]'),
      GRAPH_2D_DIAGRAM_ANCHOR,
    );
    await page.getByRole("radio", { name: "Solutions" }).click();
    await solutionFunctionAnchor.waitFor();
    await solutionCurve.waitFor();

    const graphFeatureAnchor = page.locator(`.editor-pane [data-scroll-anchor="${GRAPH_2D_DIAGRAM_ANCHOR}/gfeat:0"]`).first();
    await graphFeatureAnchor.waitFor();
    await graphFeatureAnchor.dispatchEvent("pointerdown");
    await graphInspector.getByText("Feature display settings", { exact: true }).waitFor();
    const graphFeatureSolutionToggle = graphInspector.getByRole("checkbox", { name: /feature 1 show in solutions only/i });
    assert.equal(await graphFeatureSolutionToggle.isChecked(), true);
    await graphFeatureSolutionToggle.uncheck();
    snapshot = await waitForDraft(
      page,
      (draft) => graph2dDiagram(draft)?.graphConfig?.features?.[0]?.solutionOnly !== true,
      "The graph feature inspector should return an answer point to the shared layer.",
    );
    await graphFeatureSolutionToggle.check();
    snapshot = await waitForDraft(
      page,
      (draft) => graph2dDiagram(draft)?.graphConfig?.features?.[0]?.solutionOnly === true,
      "The graph feature inspector should return an answer point to the Solutions layer.",
    );
    await page.getByRole("radio", { name: "Student" }).click();
    await page.waitForFunction(
      (anchor) => !document.querySelector(`.editor-pane [data-scroll-anchor="${anchor}/gfeat:0"]`),
      GRAPH_2D_DIAGRAM_ANCHOR,
    );
    await page.getByRole("radio", { name: "Solutions" }).click();
    await graphFeatureAnchor.waitFor();

    const vectorPanel = page.locator(`.editor-pane [data-scroll-anchor="${VECTOR_DIAGRAM_ANCHOR}"]`).first();
    await vectorPanel.waitFor();
    await vectorPanel.dispatchEvent("pointerdown");
    await graphInspector.getByText("Vector settings", { exact: true }).waitFor();
    const vectorMajorStep = graphInspector.getByRole("spinbutton", { name: /vector i major/i });
    await vectorMajorStep.fill("");
    await vectorMajorStep.fill("2");
    snapshot = await waitForDraft(
      page,
      (draft) => {
        const config = vectorDiagram(draft)?.graphConfig;
        return config?.gridMajorStepX === 2 && config?.axisLabelStepX === 2 && config?.widthPx === 360 && config?.heightPx === 280;
      },
      "The extracted vector inspector should change the major interval without resizing the graph.",
    );
    const vectorMinorGrid = graphInspector.getByRole("checkbox", { name: /vector minor grid/i });
    await vectorMinorGrid.check();
    snapshot = await waitForDraft(
      page,
      (draft) => {
        const config = vectorDiagram(draft)?.graphConfig;
        return config?.showMinorGrid === true && config?.showGrid === true;
      },
      "The extracted vector inspector should enable the existing minor-grid layer.",
    );
    await page.screenshot({ path: path.join(outputDir, "vector2d-selection-inspector.png"), fullPage: false });
    await vectorPanel.getByRole("button", { name: "Add vector" }).click();
    snapshot = await waitForDraft(
      page,
      (draft) => vectorDiagram(draft)?.graphConfig?.metadata?.vector2d?.vectors?.length === 2,
      "Solutions mode should add a second coordinate vector.",
    );
    const solutionVector = vectorDiagram(snapshot)?.graphConfig?.metadata?.vector2d?.vectors?.[1];
    assert.equal(solutionVector?.solutionOnly, true, "New vectors should default to the active Solutions layer.");
    assert.ok(solutionVector?.id, "Solution vector should retain a stable id.");
    await vectorPanel
      .locator('[data-vector2d-item-kind="vector"][data-solution-only="true"]')
      .getByText("Solution", { exact: true })
      .waitFor();
    const vectorSolutionToggle = vectorPanel.getByRole("checkbox", { name: /vector .* show in solutions only/i }).last();
    assert.equal(await vectorSolutionToggle.isChecked(), true);

    const solutionVectorPreview = page
      .locator(`.preview-pane [data-mauth-vector-arrow="true"][data-mauth-vector-id="${solutionVector.id}"]`)
      .first();
    await solutionVectorPreview.waitFor();
    const solutionVectorColor = await solutionVectorPreview.evaluate(
      (element) => element.getAttribute("stroke") ?? element.getAttribute("fill") ?? getComputedStyle(element).stroke,
    );
    assert.match(solutionVectorColor.toLowerCase(), /#1d4ed8|rgb\(29,\s*78,\s*216\)/, "Solution vector should render in solution blue.");

    await page.getByRole("radio", { name: "Student" }).click();
    await page.waitForFunction(
      ([anchor, vectorId]) => {
        const editorPanel = document.querySelector(`.editor-pane [data-scroll-anchor="${anchor}"]`);
        const editorVector = editorPanel?.querySelector(`[data-vector2d-item-id="${vectorId}"]`);
        const previewVector = document.querySelector(`.preview-pane [data-mauth-vector-arrow="true"][data-mauth-vector-id="${vectorId}"]`);
        return !editorVector && !previewVector;
      },
      [VECTOR_DIAGRAM_ANCHOR, solutionVector.id],
    );
    await page.getByRole("radio", { name: "Solutions" }).click();
    await solutionVectorPreview.waitFor();

    const geometryPanel = page.locator(`.editor-pane [data-scroll-anchor="${GEOMETRY_DIAGRAM_ANCHOR}"]`).first();
    await geometryPanel.waitFor();
    await geometryPanel.getByRole("button", { name: "Add point" }).click();
    snapshot = await waitForDraft(
      page,
      (draft) => geometryDiagram(draft)?.graphConfig?.data?.points?.length === 2,
      "Solutions mode should add a second geometry point.",
    );
    let solutionPoint = geometryDiagram(snapshot)?.graphConfig?.data?.points?.[1];
    assert.equal(solutionPoint?.solutionOnly, true, "New geometry primitives should default to the active Solutions layer.");
    await geometryPanel.getByText("Solution", { exact: true }).waitFor();
    await geometryPanel.getByText(/Point 2:/).click();

    const geometrySolutionToggle = page.locator(".selection-inspector-pane").getByRole("checkbox", { name: /point solutions only/i });
    await geometrySolutionToggle.waitFor();
    assert.equal(await geometrySolutionToggle.isChecked(), true);
    await geometrySolutionToggle.uncheck();
    snapshot = await waitForDraft(
      page,
      (draft) => geometryDiagram(draft)?.graphConfig?.data?.points?.[1]?.solutionOnly !== true,
      "Inspector should return a geometry point to the shared layer.",
    );
    await geometrySolutionToggle.check();
    snapshot = await waitForDraft(
      page,
      (draft) => geometryDiagram(draft)?.graphConfig?.data?.points?.[1]?.solutionOnly === true,
      "Inspector should return a geometry point to the Solutions layer.",
    );
    solutionPoint = geometryDiagram(snapshot)?.graphConfig?.data?.points?.[1];
    assert.ok(solutionPoint?.id, "Solution geometry point should retain a stable id.");

    const solutionPointPreview = page.locator(
      `.preview-pane [data-mauth-geometry2d-kind="point"][data-mauth-geometry2d-id="${solutionPoint.id}"]`,
    );
    await solutionPointPreview.waitFor();
    const solutionStroke = await solutionPointPreview.evaluate(
      (element) => element.getAttribute("stroke") ?? getComputedStyle(element).stroke,
    );
    assert.match(solutionStroke.toLowerCase(), /#1d4ed8|rgb\(29,\s*78,\s*216\)/, "Solution geometry point should render in solution blue.");

    await page.getByRole("radio", { name: "Student" }).click();
    await page.waitForFunction(
      ([anchor, pointId]) => {
        const editorPanel = document.querySelector(`.editor-pane [data-scroll-anchor="${anchor}"]`);
        const previewPoint = document.querySelector(
          `.preview-pane [data-mauth-geometry2d-kind="point"][data-mauth-geometry2d-id="${pointId}"]`,
        );
        return !editorPanel?.textContent?.includes("Solution") && !previewPoint;
      },
      [GEOMETRY_DIAGRAM_ANCHOR, solutionPoint.id],
    );
    await page.getByRole("radio", { name: "Solutions" }).click();
    await solutionPointPreview.waitFor();

    const graph3dPanel = page.locator(`.editor-pane [data-scroll-anchor="${GRAPH_3D_DIAGRAM_ANCHOR}"]`).first();
    await graph3dPanel.waitFor();
    await graph3dPanel.dispatchEvent("pointerdown");
    await graphInspector.getByText("3D settings", { exact: true }).waitFor();
    await graphInspector.getByRole("spinbutton", { name: /3D azimuth/i }).fill("2");
    snapshot = await waitForDraft(
      page,
      (draft) => {
        const config = graph3dDiagram(draft)?.graphConfig;
        return config?.metadata?.view3d?.az === 2 && config?.widthPx === 420 && config?.heightPx === 320;
      },
      "The extracted 3D inspector should update the camera without resizing the graph.",
    );
    await graphInspector.getByRole("button", { name: "Reset view" }).click();
    snapshot = await waitForDraft(
      page,
      (draft) => {
        const view = graph3dDiagram(draft)?.graphConfig?.metadata?.view3d;
        return view?.az === 1 && view?.el === 0.3 && view?.bank === 0;
      },
      "The extracted 3D inspector should restore the default camera view.",
    );
    await page.screenshot({ path: path.join(outputDir, "graph3d-selection-inspector.png"), fullPage: false });
    await graph3dPanel.getByRole("button", { name: "Add point" }).click();
    snapshot = await waitForDraft(
      page,
      (draft) => graph3dDiagram(draft)?.graphConfig?.data?.points?.length === 2,
      "Solutions mode should add a second 3D point.",
    );
    let solution3dPoint = graph3dDiagram(snapshot)?.graphConfig?.data?.points?.[1];
    assert.equal(solution3dPoint?.solutionOnly, true, "New 3D points should default to the active Solutions layer.");
    assert.ok(solution3dPoint?.id, "Solution 3D point should retain a stable id.");
    const solution3dRow = graph3dPanel.locator('[data-graph3d-item-kind="point"][data-solution-only="true"]').first();
    await solution3dRow.getByText("Solution", { exact: true }).waitFor();
    const graph3dSolutionToggle = solution3dRow.getByRole("checkbox", { name: /point .* show in solutions only/i });
    assert.equal(await graph3dSolutionToggle.isChecked(), true);
    await solution3dRow.getByLabel("x", { exact: true }).fill("2");
    await solution3dRow.getByLabel("y", { exact: true }).fill("1");
    await solution3dRow.getByLabel("z", { exact: true }).fill("1");
    snapshot = await waitForDraft(
      page,
      (draft) => graph3dDiagram(draft)?.graphConfig?.data?.points?.[1]?.coords?.join(",") === "2,1,1",
      "The solution 3D point should keep its edited coordinates.",
    );
    solution3dPoint = graph3dDiagram(snapshot)?.graphConfig?.data?.points?.[1];
    await graph3dPanel.getByRole("button", { name: "Add segment" }).click();
    await graph3dPanel.getByRole("button", { name: "Add dimension" }).click();
    snapshot = await waitForDraft(
      page,
      (draft) =>
        graph3dDiagram(draft)?.graphConfig?.data?.segments?.length === 1 &&
        graph3dDiagram(draft)?.graphConfig?.data?.dimensions?.length === 1,
      "Solutions mode should add one 3D segment and dimension.",
    );
    const solution3dSegment = graph3dDiagram(snapshot)?.graphConfig?.data?.segments?.[0];
    const solution3dDimension = graph3dDiagram(snapshot)?.graphConfig?.data?.dimensions?.[0];
    assert.equal(solution3dSegment?.solutionOnly, true, "New 3D segments should default to the active Solutions layer.");
    assert.equal(solution3dDimension?.solutionOnly, true, "New 3D dimensions should default to the active Solutions layer.");
    const solution3dSegmentRow = graph3dPanel.locator('[data-graph3d-item-kind="segment"][data-solution-only="true"]').first();
    const solution3dDimensionRow = graph3dPanel.locator('[data-graph3d-item-kind="dimension"][data-solution-only="true"]').first();
    await solution3dSegmentRow.getByText("Solution", { exact: true }).waitFor();
    await solution3dDimensionRow.getByText("Solution", { exact: true }).waitFor();
    await solution3dSegmentRow.getByRole("textbox", { name: "Label" }).fill("AB");
    await solution3dDimensionRow.getByRole("textbox", { name: "Label" }).fill("d");
    snapshot = await waitForDraft(
      page,
      (draft) =>
        graph3dDiagram(draft)?.graphConfig?.data?.segments?.[0]?.label === "AB" &&
        graph3dDiagram(draft)?.graphConfig?.data?.dimensions?.[0]?.label === "d",
      "The 3D solution segment and dimension should keep their labels.",
    );
    const solution3dLabel = page
      .locator(`.preview-pane [data-mauth-label-role="graph3d-point-label"][data-mauth-point-id="${solution3dPoint.id}"]`)
      .first();
    const solution3dSegmentLabel = page
      .locator(`.preview-pane [data-mauth-label-role="graph3d-segment-label"][data-mauth-graph3d-element-id="${solution3dSegment.id}"]`)
      .first();
    const solution3dDimensionLabel = page
      .locator(`.preview-pane [data-mauth-label-role="graph3d-dimension-label"][data-mauth-graph3d-element-id="${solution3dDimension.id}"]`)
      .first();
    const shared3dLabel = page.locator('.preview-pane [data-mauth-label-role="graph3d-point-label"][data-mauth-point-id="A"]').first();
    await solution3dLabel.waitFor();
    await solution3dSegmentLabel.waitFor();
    await solution3dDimensionLabel.waitFor();
    await shared3dLabel.waitFor();
    const solution3dColor = await solution3dLabel.evaluate((element) => getComputedStyle(element).color);
    const solution3dSegmentColor = await solution3dSegmentLabel.evaluate((element) => getComputedStyle(element).color);
    const solution3dDimensionColor = await solution3dDimensionLabel.evaluate((element) => getComputedStyle(element).color);
    assert.match(solution3dColor.toLowerCase(), /#1d4ed8|rgb\(29,\s*78,\s*216\)/, "Solution 3D labels should render in solution blue.");
    assert.match(
      solution3dSegmentColor.toLowerCase(),
      /#1d4ed8|rgb\(29,\s*78,\s*216\)/,
      "Solution 3D segment labels should render in solution blue.",
    );
    assert.match(
      solution3dDimensionColor.toLowerCase(),
      /#1d4ed8|rgb\(29,\s*78,\s*216\)/,
      "Solution 3D dimension labels should render in solution blue.",
    );
    const shared3dSolutionsBox = await shared3dLabel.boundingBox();
    assert.ok(shared3dSolutionsBox, "Shared 3D point should render in Solutions mode.");

    await page.getByRole("radio", { name: "Student" }).click();
    await page.waitForFunction(
      ([anchor, pointId]) => {
        const editorPanel = document.querySelector(`.editor-pane [data-scroll-anchor="${anchor}"]`);
        const editorPoint = editorPanel?.querySelector(`[data-graph3d-item-id="${pointId}"]`);
        const previewPoint = document.querySelector(
          `.preview-pane [data-mauth-label-role="graph3d-point-label"][data-mauth-point-id="${pointId}"]`,
        );
        const solutionRows = editorPanel?.querySelectorAll('[data-graph3d-item-kind][data-solution-only="true"]');
        const previewLineAnswer = document.querySelector(
          '.preview-pane [data-mauth-label-role="graph3d-segment-label"][data-mauth-graph3d-element-id], .preview-pane [data-mauth-label-role="graph3d-dimension-label"][data-mauth-graph3d-element-id]',
        );
        return !editorPoint && !solutionRows?.length && !previewPoint && !previewLineAnswer;
      },
      [GRAPH_3D_DIAGRAM_ANCHOR, solution3dPoint.id],
    );
    await shared3dLabel.waitFor();
    const shared3dStudentBox = await shared3dLabel.boundingBox();
    assert.ok(shared3dStudentBox, "Shared 3D point should remain visible in Student mode.");
    assert.ok(
      Math.abs(shared3dStudentBox.x - shared3dSolutionsBox.x) < 1 && Math.abs(shared3dStudentBox.y - shared3dSolutionsBox.y) < 1,
      "Hiding a solution 3D point should not reframe the shared diagram.",
    );
    await page.getByRole("radio", { name: "Solutions" }).click();
    await solution3dLabel.waitFor();

    const statsPanel = page.locator(`.editor-pane [data-scroll-anchor="${STATS_DIAGRAM_ANCHOR}"]`).first();
    await statsPanel.waitFor();
    await statsPanel.dispatchEvent("pointerdown");
    await graphInspector.getByText("Chart settings", { exact: true }).waitFor();
    await graphInspector.getByRole("spinbutton", { name: /chart width/i }).fill("460");
    snapshot = await waitForDraft(
      page,
      (draft) => {
        const config = statsDiagram(draft)?.graphConfig;
        return config?.options?.widthPx === 460 && config?.widthPx === 460 && config?.options?.heightPx === 280;
      },
      "The extracted statistics inspector should mirror chart dimensions into the shared graph config.",
    );
    const chartGridlines = graphInspector.getByRole("checkbox", { name: /chart gridlines/i });
    await chartGridlines.uncheck();
    snapshot = await waitForDraft(
      page,
      (draft) => statsDiagram(draft)?.graphConfig?.options?.showGrid === false,
      "The extracted statistics inspector should hide gridlines.",
    );
    await chartGridlines.check();
    snapshot = await waitForDraft(
      page,
      (draft) => statsDiagram(draft)?.graphConfig?.options?.showGrid === true,
      "The extracted statistics inspector should restore gridlines.",
    );
    await graphInspector.getByRole("spinbutton", { name: /fill opacity/i }).fill("0.4");
    snapshot = await waitForDraft(
      page,
      (draft) => statsDiagram(draft)?.graphConfig?.options?.fillOpacity === 0.4,
      "The extracted statistics inspector should preserve a valid fill opacity.",
    );
    await page.screenshot({ path: path.join(outputDir, "stats-chart-selection-inspector.png"), fullPage: false });

    const imagePanel = page.locator(`.editor-pane [data-scroll-anchor="${IMAGE_DIAGRAM_ANCHOR}"]`).first();
    await imagePanel.waitFor();
    await imagePanel.scrollIntoViewIfNeeded();
    await imagePanel.dispatchEvent("pointerdown");
    await graphInspector.getByText("Image settings", { exact: true }).waitFor();
    await graphInspector.getByRole("textbox", { name: /image name/i }).fill("Updated triangle");
    await graphInspector.getByRole("textbox", { name: /image alt text/i }).fill("A blue outlined triangle");
    await graphInspector.getByRole("spinbutton", { name: /image width/i }).fill("480");
    await graphInspector.getByRole("spinbutton", { name: /image height/i }).fill("300");
    snapshot = await waitForDraft(
      page,
      (draft) => {
        const config = imageDiagram(draft)?.graphConfig;
        return (
          config?.data?.src === SMOKE_IMAGE_SRC &&
          config?.data?.name === "Updated triangle" &&
          config?.data?.alt === "A blue outlined triangle" &&
          config?.data?.mimeType === "image/svg+xml" &&
          config?.data?.naturalWidth === 160 &&
          config?.data?.naturalHeight === 90 &&
          config?.widthPx === 480 &&
          config?.heightPx === 300
        );
      },
      "The extracted image inspector should update labels and dimensions without dropping the embedded image payload.",
    );
    await page.screenshot({ path: path.join(outputDir, "image-selection-inspector.png"), fullPage: false });

    await imagePanel.getByRole("button", { name: "Add solution ellipse" }).click();
    snapshot = await waitForDraft(
      page,
      (draft) => imageDiagram(draft)?.graphConfig?.data?.annotations?.length === 1,
      "Solutions mode should add one image annotation.",
    );
    const solutionImageAnnotation = imageDiagram(snapshot)?.graphConfig?.data?.annotations?.[0];
    assert.equal(solutionImageAnnotation?.kind, "ellipse");
    assert.equal(solutionImageAnnotation?.solutionOnly, true, "New image annotations should default to the active Solutions layer.");
    assert.ok(solutionImageAnnotation?.id, "Solution image annotation should retain a stable id.");
    const imageAnnotationRow = imagePanel.locator(
      `[data-image-annotation-editor-id="${solutionImageAnnotation.id}"][data-solution-only="true"]`,
    );
    await imageAnnotationRow.getByText("Solution", { exact: true }).waitFor();
    const imageAnnotationPreview = page
      .locator(`.preview-pane [data-scroll-anchor="${IMAGE_DIAGRAM_ANCHOR}"] [data-image-annotation-id="${solutionImageAnnotation.id}"]`)
      .first();
    await imageAnnotationPreview.waitFor();
    const imageAnnotationColor = await imageAnnotationPreview.evaluate(
      (element) => element.getAttribute("stroke") ?? getComputedStyle(element).stroke,
    );
    assert.match(
      imageAnnotationColor.toLowerCase(),
      /#1d4ed8|rgb\(29,\s*78,\s*216\)/,
      "Solution image annotations should render in solution blue.",
    );
    await imageAnnotationRow.getByRole("spinbutton", { name: "X position (%)" }).fill("65");
    snapshot = await waitForDraft(
      page,
      (draft) => imageDiagram(draft)?.graphConfig?.data?.annotations?.[0]?.xPercent === 65,
      "Image annotation position controls should update the structured annotation in place.",
    );
    assert.equal(
      imageDiagram(snapshot)?.graphConfig?.data?.src,
      SMOKE_IMAGE_SRC,
      "Image annotation edits must preserve the bitmap payload.",
    );
    await page.screenshot({ path: path.join(outputDir, "image-solution-annotation.png"), fullPage: false });

    await page.getByRole("radio", { name: "Student" }).click();
    await page.waitForFunction(
      ([anchor, annotationId]) => {
        const editorPanel = document.querySelector(`.editor-pane [data-scroll-anchor="${anchor}"]`);
        const editorAnnotation = editorPanel?.querySelector(`[data-image-annotation-editor-id="${annotationId}"]`);
        const previewAnnotation = document.querySelector(
          `.preview-pane [data-scroll-anchor="${anchor}"] [data-image-annotation-id="${annotationId}"]`,
        );
        return !editorAnnotation && !previewAnnotation;
      },
      [IMAGE_DIAGRAM_ANCHOR, solutionImageAnnotation.id],
    );
    await page.getByRole("radio", { name: "Solutions" }).click();
    await imageAnnotationPreview.waitFor();

    await statsPanel.scrollIntoViewIfNeeded();
    await statsPanel.dispatchEvent("pointerdown");
    await graphInspector.getByText("Chart settings", { exact: true }).waitFor();
    await statsPanel.getByRole("button", { name: "Add solution series" }).click();
    snapshot = await waitForDraft(
      page,
      (draft) => statsDiagram(draft)?.graphConfig?.data?.series?.length === 1,
      "Solutions mode should add one statistics chart series.",
    );
    const solutionSeries = statsDiagram(snapshot)?.graphConfig?.data?.series?.[0];
    assert.equal(solutionSeries?.solutionOnly, true, "New statistics series should default to the active Solutions layer.");
    assert.ok(solutionSeries?.id, "Solution statistics series should retain a stable id.");
    const solutionSeriesRow = statsPanel.locator(`[data-stats-series-id="${solutionSeries.id}"][data-solution-only="true"]`).first();
    await solutionSeriesRow.getByText("Solution", { exact: true }).waitFor();
    assert.equal(await solutionSeriesRow.getByRole("checkbox", { name: /show in solutions only/i }).isChecked(), true);

    const statsPreview = page.locator(`.preview-pane [data-scroll-anchor="${STATS_DIAGRAM_ANCHOR}"] .stats-chart-diagram`).first();
    const solutionSeriesLine = statsPreview.locator(".scatterlayer .trace .js-line").first();
    await solutionSeriesLine.waitFor();
    const solutionSeriesColor = await solutionSeriesLine.evaluate(
      (element) => element.getAttribute("stroke") ?? getComputedStyle(element).stroke ?? getComputedStyle(element).color,
    );
    assert.match(
      solutionSeriesColor.toLowerCase(),
      /#1d4ed8|rgb\(29,\s*78,\s*216\)/,
      "Solution statistics series should render in solution blue.",
    );

    await page.getByRole("radio", { name: "Student" }).click();
    await page.waitForFunction(
      ([anchor, seriesId]) => {
        const editorPanel = document.querySelector(`.editor-pane [data-scroll-anchor="${anchor}"]`);
        const editorSeries = editorPanel?.querySelector(`[data-stats-series-id="${seriesId}"]`);
        const previewTrace = document.querySelector(
          `.preview-pane [data-scroll-anchor="${anchor}"] .stats-chart-diagram .scatterlayer .trace`,
        );
        return !editorSeries && !previewTrace;
      },
      [STATS_DIAGRAM_ANCHOR, solutionSeries.id],
    );
    await page.getByRole("radio", { name: "Solutions" }).click();
    await solutionSeriesLine.waitFor();

    const penroseGeometryPanel = page.locator(`.editor-pane [data-scroll-anchor="${PENROSE_GEOMETRY_ANCHOR}"]`).first();
    await penroseGeometryPanel.waitFor();
    await penroseGeometryPanel.getByRole("button", { name: "Add solution point" }).click();
    await penroseGeometryPanel.getByRole("button", { name: "Add solution segment" }).click();
    snapshot = await waitForDraft(
      page,
      (draft) =>
        penroseGeometryDiagram(draft)?.graphConfig?.data?.objects?.filter((object) => object.solutionOnly === true).length === 1 &&
        penroseGeometryDiagram(draft)?.graphConfig?.data?.relationships?.filter((relationship) => relationship.solutionOnly === true)
          .length === 1,
      "Solutions mode should add one Penrose geometry point and segment.",
    );
    const penroseSolutionPoint = penroseGeometryDiagram(snapshot)?.graphConfig?.data?.objects?.find(
      (object) => object.solutionOnly === true,
    );
    const penroseSolutionSegment = penroseGeometryDiagram(snapshot)?.graphConfig?.data?.relationships?.find(
      (relationship) => relationship.solutionOnly === true,
    );
    assert.ok(penroseSolutionPoint?.name, "Penrose solution point should retain a stable name.");
    assert.ok(penroseSolutionSegment?.name, "Penrose solution segment should retain a stable name.");
    await penroseGeometryPanel
      .locator('[data-penrose-item-kind="object"][data-solution-only="true"]')
      .getByText("Solution", { exact: true })
      .waitFor();
    await penroseGeometryPanel
      .locator('[data-penrose-item-kind="relationship"][data-solution-only="true"]')
      .getByText("Solution", { exact: true })
      .waitFor();
    const penroseGeometryPreview = page.locator(`.preview-pane [data-scroll-anchor="${PENROSE_GEOMETRY_ANCHOR}"] .penrose-diagram`);
    await penroseGeometryPreview.locator('[stroke="#1d4ed8"], [fill="#1d4ed8"]').first().waitFor();

    const penroseNetworkPanel = page.locator(`.editor-pane [data-scroll-anchor="${PENROSE_NETWORK_ANCHOR}"]`).first();
    await penroseNetworkPanel.waitFor();
    await penroseNetworkPanel.dispatchEvent("pointerdown");
    await graphInspector.getByText("Network settings", { exact: true }).waitFor();
    const showNodeDots = graphInspector.getByRole("checkbox", { name: /show node dots/i });
    assert.equal(await showNodeDots.isChecked(), true);
    await showNodeDots.uncheck();
    snapshot = await waitForDraft(
      page,
      (draft) => penroseNetworkDiagram(draft)?.graphConfig?.data?.hidePoints === true,
      "The extracted Penrose inspector should hide network node dots.",
    );
    await showNodeDots.check();
    snapshot = await waitForDraft(
      page,
      (draft) => penroseNetworkDiagram(draft)?.graphConfig?.data?.hidePoints === false,
      "The extracted Penrose inspector should restore network node dots.",
    );
    await penroseNetworkPanel.getByRole("button", { name: "Add solution node" }).click();
    await penroseNetworkPanel.getByRole("button", { name: "Add solution link" }).click();
    snapshot = await waitForDraft(
      page,
      (draft) =>
        penroseNetworkDiagram(draft)?.graphConfig?.data?.objects?.filter((object) => object.solutionOnly === true).length === 1 &&
        penroseNetworkDiagram(draft)?.graphConfig?.data?.relationships?.filter((relationship) => relationship.solutionOnly === true)
          .length === 1,
      "Solutions mode should add one Penrose network node and link.",
    );
    const penroseNetworkNode = penroseNetworkDiagram(snapshot)?.graphConfig?.data?.objects?.find((object) => object.solutionOnly === true);
    const penroseNetworkLink = penroseNetworkDiagram(snapshot)?.graphConfig?.data?.relationships?.find(
      (relationship) => relationship.solutionOnly === true,
    );
    assert.ok(penroseNetworkNode?.name, "Penrose network answer node should retain a stable name.");
    assert.ok(penroseNetworkLink?.name, "Penrose network answer link should retain a stable name.");
    await penroseNetworkPanel
      .locator('[data-penrose-item-kind="object"][data-solution-only="true"]')
      .getByText("Solution", { exact: true })
      .waitFor();
    await penroseNetworkPanel
      .locator('[data-penrose-item-kind="relationship"][data-solution-only="true"]')
      .getByText("Solution", { exact: true })
      .waitFor();
    await page
      .locator(
        `.preview-pane [data-scroll-anchor="${PENROSE_NETWORK_ANCHOR}"] .penrose-diagram [stroke="#1d4ed8"], .preview-pane [data-scroll-anchor="${PENROSE_NETWORK_ANCHOR}"] .penrose-diagram [fill="#1d4ed8"]`,
      )
      .first()
      .waitFor();

    await page.getByRole("radio", { name: "Student" }).click();
    await page.waitForFunction(
      ([geometryAnchor, networkAnchor]) => {
        const geometryPanel = document.querySelector(`.editor-pane [data-scroll-anchor="${geometryAnchor}"]`);
        const networkPanel = document.querySelector(`.editor-pane [data-scroll-anchor="${networkAnchor}"]`);
        const geometryAnswer = geometryPanel?.querySelector('[data-penrose-item-kind][data-solution-only="true"]');
        const networkAnswer = networkPanel?.querySelector('[data-penrose-item-kind][data-solution-only="true"]');
        const previewAnswers = document.querySelectorAll(
          `.preview-pane [data-scroll-anchor="${geometryAnchor}"] .penrose-diagram [stroke="#1d4ed8"], .preview-pane [data-scroll-anchor="${geometryAnchor}"] .penrose-diagram [fill="#1d4ed8"], .preview-pane [data-scroll-anchor="${networkAnchor}"] .penrose-diagram [stroke="#1d4ed8"], .preview-pane [data-scroll-anchor="${networkAnchor}"] .penrose-diagram [fill="#1d4ed8"]`,
        );
        return !geometryAnswer && !networkAnswer && previewAnswers.length === 0;
      },
      [PENROSE_GEOMETRY_ANCHOR, PENROSE_NETWORK_ANCHOR],
    );
    await page.getByRole("radio", { name: "Solutions" }).click();
    await penroseGeometryPreview.locator('[stroke="#1d4ed8"], [fill="#1d4ed8"]').first().waitFor();

    const screenshotPath = path.join(outputDir, "diagram-solution-authoring.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const relevantConsoleMessages = consoleMessages.filter(
      (message) =>
        !message.includes("Failed to load resource") &&
        !message.includes("JSXGraph: Error: Unknown element with id") &&
        !message.includes("No element found with id"),
    );
    assert.deepEqual(relevantConsoleMessages, [], `Unexpected browser console warnings/errors:\n${relevantConsoleMessages.join("\n")}`);

    console.log(`Diagram solution authoring smoke passed: ${screenshotPath}`);
  } finally {
    if (browser) await browser.close();
    await stopProcess(web);
    await stopProcess(api);
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
