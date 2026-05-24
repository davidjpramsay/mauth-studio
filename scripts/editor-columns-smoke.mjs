import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKBENCH_ROOT = path.resolve(ROOT, "..", "mauth-workbench");
const OUTPUT_ROOT = process.env.MAUTH_EDITOR_COLUMNS_SMOKE_OUTPUT ?? path.join(WORKBENCH_ROOT, "verification", "editor-columns-smoke");
const VIEWPORT = { width: 1484, height: 1264 };

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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before serving ${url}\n${logs.join("")}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite can take a moment to start and pre-bundle dependencies.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}\n${logs.join("")}`);
}

async function stopProcess(child) {
  if (child.exitCode !== null) return;
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
    frontMatter: {},
    formattingConfig: {},
    questions: [
      {
        id: "q-columns-ui",
        section: "Layout",
        marks: 5,
        contentBlocks: [
          { id: "q-intro", kind: "text", text: "Column editor layout regression." },
          { id: "q-choices", kind: "choices", choices: ["Red", "Blue", "Green"], numberingStyle: "roman", layout: "vertical" },
          {
            id: "q-table",
            kind: "table",
            headers: ["", ""],
            rows: [
              ["$x$", "$1$"],
              ["$y$", "$2$"],
            ],
            showHeader: false,
            tableAlign: "center",
            cellAlignment: "center",
          },
          {
            id: "q-diagram",
            kind: "diagram",
            diagramAlign: "center",
            graphConfig: {
              type: "graph2d",
              functions: [
                { id: "q-function-f", kind: "expression", expression: "x", label: "f", show: true },
                { id: "q-function-g", kind: "expression", expression: "x^2", label: "g", show: true },
              ],
              features: [
                { id: "q-point-a", kind: "point", label: "A", x: 1, y: 2, show: true },
                { id: "q-line-ab", kind: "line_segment", label: "AB", x1: -2, y1: -1, x2: 2, y2: 3, show: true },
                { id: "q-tangent-t", kind: "tangent", label: "T", functionIndex: 0, x: 1, show: true },
                {
                  id: "q-angle-marker",
                  kind: "angle_marker",
                  label: "45^\\circ",
                  x: 0,
                  y: 0,
                  x1: 1,
                  y1: 0,
                  x2: 0.7,
                  y2: 0.7,
                  size: 0.45,
                  show: true,
                },
                { id: "q-region", kind: "region_between_curves", label: "R", functionAIndex: 0, functionBIndex: 1, xMin: 0, xMax: 2 },
                { id: "q-label", kind: "label", label: "$A$", x: 2, y: 2.5, show: true },
              ],
              metadata: {},
            },
          },
          { id: "q-space", kind: "space", lines: 4, visibility: "student", studentOnly: true },
        ],
        parts: [
          {
            id: "p-columns-ui",
            label: "",
            text: "",
            marks: 5,
            contentBlocks: [
              {
                id: "cols-ui",
                kind: "columns",
                columnCount: 2,
                columns: [
                  [
                    { id: "c1-text", kind: "text", text: "jsfa;ldfjas;l sdjfhlasjdhf" },
                    {
                      id: "c1-table",
                      kind: "table",
                      headers: ["", "", ""],
                      rows: [
                        ["$x$", "$0$", "$1$"],
                        ["$P(X=x)$", "$1-p$", "$p$"],
                      ],
                      showHeader: false,
                      tableAlign: "center",
                      cellAlignment: "center",
                    },
                  ],
                  [{ id: "c2-text", kind: "text", text: "dfjksljsdhf s;dajhfslajdfh" }],
                ],
              },
            ],
            subparts: [],
            itemOrder: [{ kind: "block", id: "cols-ui" }],
          },
        ],
        itemOrder: [
          { kind: "block", id: "q-intro" },
          { kind: "block", id: "q-choices" },
          { kind: "block", id: "q-table" },
          { kind: "block", id: "q-diagram" },
          { kind: "block", id: "q-space" },
          { kind: "part", id: "p-columns-ui" },
        ],
        pageBreakAfter: false,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

function sectionRectForText(element) {
  const section = element.closest("section");
  if (!section) throw new Error("Expected text to be inside a section");
  const rect = section.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right };
}

async function inspectorMetrics(inspector) {
  return inspector.evaluate((element) => {
    const inspectorRect = element.getBoundingClientRect();
    const scroller = element.querySelector(".overflow-y-auto");
    const scrollerRect = scroller?.getBoundingClientRect();
    const editorPane = document.querySelector(".editor-pane");
    const editorRect = editorPane?.getBoundingClientRect();
    const previewPane = document.querySelector(".preview-pane");
    const previewRect = previewPane?.getBoundingClientRect();
    return {
      placement: element.getAttribute("data-inspector-placement"),
      inspector: {
        left: inspectorRect.left,
        top: inspectorRect.top,
        right: inspectorRect.right,
        bottom: inspectorRect.bottom,
        width: inspectorRect.width,
        height: inspectorRect.height,
      },
      scroller: scroller
        ? {
            left: scrollerRect?.left ?? 0,
            top: scrollerRect?.top ?? 0,
            right: scrollerRect?.right ?? 0,
            bottom: scrollerRect?.bottom ?? 0,
            width: scrollerRect?.width ?? 0,
            height: scrollerRect?.height ?? 0,
            clientHeight: scroller.clientHeight,
            scrollHeight: scroller.scrollHeight,
            scrollTop: scroller.scrollTop,
          }
        : null,
      editor: editorRect
        ? {
            left: editorRect.left,
            top: editorRect.top,
            right: editorRect.right,
            bottom: editorRect.bottom,
            width: editorRect.width,
            height: editorRect.height,
          }
        : null,
      preview: previewRect
        ? {
            left: previewRect.left,
            top: previewRect.top,
            right: previewRect.right,
            bottom: previewRect.bottom,
            width: previewRect.width,
            height: previewRect.height,
          }
        : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

function assertInspectorBetweenEditorAndPreview(metrics, label) {
  assert(metrics.editor, `${label}: expected an editor pane`);
  assert(metrics.preview, `${label}: expected a preview pane`);
  assert(metrics.scroller, `${label}: expected an inspector scroll panel`);
  assert(metrics.inspector.width > 0, `${label}: inspector should have positive width`);
  assert(metrics.inspector.height > 0, `${label}: inspector should have positive height`);
  assert(metrics.inspector.left >= metrics.editor.right - 1, `${label}: inspector should sit after the editor pane`);
  assert(metrics.inspector.right <= metrics.preview.left + 1, `${label}: inspector should sit before the preview pane`);
  assert(
    metrics.inspector.top >= Math.min(metrics.editor.top, metrics.preview.top) - 1,
    `${label}: inspector should align with workspace top`,
  );
  assert(
    metrics.inspector.bottom <= Math.max(metrics.editor.bottom, metrics.preview.bottom) + 1,
    `${label}: inspector should align with workspace bottom`,
  );
  assert(metrics.scroller.clientHeight <= metrics.scroller.scrollHeight, `${label}: scroll metrics should be coherent`);
  assert(metrics.scroller.height <= metrics.inspector.height + 1, `${label}: scroll panel should stay inside inspector pane`);
}

async function assertVisibleInspectorControlsFit(inspector, label) {
  const clipped = await inspector.evaluate((element) => {
    const scroller = element.querySelector(".overflow-y-auto");
    if (!scroller) return ["missing inspector scroller"];
    const scrollerRect = scroller.getBoundingClientRect();
    const controls = [...element.querySelectorAll("input, select, textarea, button")];
    return controls
      .map((control) => {
        const rect = control.getBoundingClientRect();
        const verticallyVisible = rect.bottom > scrollerRect.top + 1 && rect.top < scrollerRect.bottom - 1;
        if (!verticallyVisible || rect.width === 0 || rect.height === 0) return null;
        if (rect.left < scrollerRect.left - 1 || rect.right > scrollerRect.right + 1) {
          return `${control.getAttribute("aria-label") || control.textContent?.trim() || control.tagName} ${Math.round(rect.left)}-${Math.round(
            rect.right,
          )} outside ${Math.round(scrollerRect.left)}-${Math.round(scrollerRect.right)}`;
        }
        return null;
      })
      .filter(Boolean);
  });
  assert.equal(clipped.length, 0, `${label}: visible inspector controls should not be horizontally clipped:\n${clipped.join("\n")}`);
}

async function assertPanelLacks(panelHandle, patterns, label) {
  const text = await panelHandle.asElement().textContent();
  for (const pattern of patterns) {
    assert(!pattern.test(text ?? ""), `${label}: panel should not render inline setting ${pattern}`);
  }
}

async function assertTextOrder(container, labels, label) {
  const positions = [];
  for (const text of labels) {
    const locator = container.getByText(text, { exact: true }).first();
    await locator.waitFor();
    const box = await locator.boundingBox();
    assert(box, `${label}: expected ${text} to be visible`);
    positions.push({ text, y: box.y });
  }
  for (let index = 1; index < positions.length; index += 1) {
    const previous = positions[index - 1];
    const current = positions[index];
    assert(previous.y < current.y, `${label}: expected ${previous.text} above ${current.text}, got ${previous.y} and ${current.y}`);
  }
}

async function assertPanelLacksCollapseButton(panelHandle, label) {
  const collapseButtonCount = await panelHandle
    .asElement()
    .evaluate((element) => element.querySelectorAll('[data-panel-region="header"] button[aria-expanded]').length);
  assert.equal(collapseButtonCount, 0, `${label}: answer-space panels should not render collapse buttons`);
}

async function panelBodyVisible(panelHandle) {
  return panelHandle.asElement().evaluate((element) => {
    const body = element.querySelector('[data-panel-region="body"]');
    if (!body) return false;
    const style = window.getComputedStyle(body);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

async function assertPanelBodyVisible(panelHandle, label) {
  assert.equal(await panelBodyVisible(panelHandle), true, `${label}: panel body should stay visible`);
}

async function assertPanelBodyHidden(panelHandle, label) {
  assert.equal(await panelBodyVisible(panelHandle), false, `${label}: panel body should be hidden`);
}

async function clickPanelCollapseToggle(panelHandle, label) {
  const toggle = await panelHandle.asElement().$('button[aria-label="Collapse panel"], button[aria-label="Expand panel"]');
  assert(toggle, `${label}: expected a collapse icon button`);
  await toggle.click();
}

async function selectDiagramType(inspector, label, type, expectedHeading) {
  const typeSelect = inspector.locator(`select[aria-label='${label} type']`);
  if ((await typeSelect.inputValue()) !== type) await typeSelect.selectOption(type);
  await inspector.getByText(expectedHeading).waitFor();
}

async function assertPreviewAnchorSelectedAndVisible(page, anchor, label) {
  let state = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    state = await page.locator(".preview-pane").evaluate((pane, targetAnchor) => {
      const element = Array.from(pane.querySelectorAll("[data-scroll-anchor]")).find(
        (candidate) => candidate.getAttribute("data-scroll-anchor") === targetAnchor,
      );
      if (!(element instanceof HTMLElement)) return { found: false, selected: false, visible: false };

      const paneRect = pane.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      return {
        found: true,
        selected: element.getAttribute("data-preview-selected") === "true",
        visible: rect.bottom > paneRect.top && rect.top < paneRect.bottom,
        top: rect.top,
        bottom: rect.bottom,
        paneTop: paneRect.top,
        paneBottom: paneRect.bottom,
      };
    }, anchor);
    if (state.found && state.selected && state.visible) return;
    await delay(50);
  }

  assert.deepEqual(state, { found: true, selected: true, visible: true }, `${label}: preview should select and show ${anchor}`);
}

async function exerciseDiagramInspectorCycle(page, inspector, diagramPanelElement, label, mode) {
  await selectDiagramType(inspector, label, "graph2d", "Graph settings");
  if (mode === "wide") {
    await assertTextOrder(
      page.locator(".editor-pane"),
      ["Functions", "Graph objects", "Points", "Segments and tangents", "Markers", "Shading", "Labels"],
      `${mode}: graph editor groups`,
    );
  }
  await inspector.getByLabel("Domain max").fill(mode === "wide" ? "8" : "9");
  assert.equal(
    await inspector.getByLabel("Domain max").inputValue(),
    mode === "wide" ? "8" : "9",
    `${mode}: graph domain settings should edit in inspector`,
  );
  if (mode === "wide") {
    await page.locator(".preview-pane").evaluate((pane) => {
      pane.scrollTop = pane.scrollHeight;
    });
    await page.locator(".editor-pane").getByText("Function 2:", { exact: false }).click();
    await inspector.getByText("Function display", { exact: true }).waitFor();
    await assertPreviewAnchorSelectedAndVisible(
      page,
      "q:q-columns-ui/b:q-diagram",
      `${mode}: graph child selection should sync parent diagram preview`,
    );
    assert.equal(
      await inspector.getByText("Graph settings", { exact: true }).count(),
      0,
      `${mode}: function selection should hide graph settings`,
    );
    const functionLabel = inspector.locator(`input[aria-label='${label} function 2 label']`);
    await functionLabel.fill("g");
    assert.equal(await functionLabel.inputValue(), "g", `${mode}: graph function display settings should edit in inspector`);
    await page.locator(".editor-pane").getByText("Point 1:", { exact: false }).click();
    await inspector.getByText("Feature display", { exact: true }).waitFor();
    assert.equal(
      await inspector.getByText("Graph settings", { exact: true }).count(),
      0,
      `${mode}: feature selection should hide graph settings`,
    );
    const solutionVisibilityToggle = inspector.locator(`input[aria-label='${label} feature 1 show in solutions only']`);
    await solutionVisibilityToggle.check();
    assert.equal(await solutionVisibilityToggle.isChecked(), true, `${mode}: graph feature solution visibility should edit in inspector`);
    const featureX = inspector.locator(`input[aria-label='${label} feature 1 x']`);
    await featureX.fill("2.5");
    assert.equal(await featureX.inputValue(), "2.5", `${mode}: graph feature x location should edit in inspector`);
    const featureY = inspector.locator(`input[aria-label='${label} feature 1 y']`);
    await featureY.fill("-1.5");
    assert.equal(await featureY.inputValue(), "-1.5", `${mode}: graph feature y location should edit in inspector`);
    await page.locator(".editor-pane").getByText("Angle marker 4:", { exact: false }).click();
    await inspector.getByText("Feature display", { exact: true }).waitFor();
    const angleRadius = inspector.locator(`input[aria-label='${label} feature 4 radius']`);
    await angleRadius.fill("0.6");
    assert.equal(await angleRadius.inputValue(), "0.6", `${mode}: angle marker radius should edit in inspector`);
    const rightAngleToggle = inspector.locator(`input[aria-label='${label} feature 4 right angle']`);
    await rightAngleToggle.check();
    assert.equal(await rightAngleToggle.isChecked(), true, `${mode}: angle marker right-angle option should edit in inspector`);
    await diagramPanelElement.asElement().dispatchEvent("pointerdown");
    await inspector.getByText("Graph settings", { exact: true }).waitFor();
  }
  const graphPanelText = await diagramPanelElement.asElement().textContent();
  assert(!/\banglemarker\b/i.test(graphPanelText ?? ""), `${mode}: generated graph function labels should not leak into panel titles`);
  await assertPanelLacks(
    diagramPanelElement,
    [/\bAxes and grid\b/i, /\bFunction Arrows\b/i, /\bShow in solutions only\b/i, /\bGraph label\b/i, /\bLine style\b/i, /\bColour\b/i],
    `${mode} graph2d`,
  );
  assert.equal(await page.locator("select[aria-label='Diagram 4 type']").count(), 1, `${mode}: diagram type should only appear once`);
  assert.equal(
    await page.locator("select[aria-label='Diagram 4 position']").count(),
    1,
    `${mode}: diagram position should only appear once`,
  );
  await assertVisibleInspectorControlsFit(inspector, `${mode} graph2d`);

  await selectDiagramType(inspector, label, "geometry2d", "2D diagram settings");
  if (mode === "wide") {
    await assertTextOrder(
      page.locator(".editor-pane"),
      ["Points", "Segments", "Arcs", "Angles", "Markers"],
      `${mode}: geometry2d editor groups`,
    );
  }
  await inspector.locator(`input[aria-label='${label} 2D diagram width']`).fill(mode === "wide" ? "440" : "420");
  assert.equal(
    await inspector.locator(`input[aria-label='${label} 2D diagram width']`).inputValue(),
    mode === "wide" ? "440" : "420",
    `${mode}: geometry2d diagram settings should edit in inspector`,
  );
  await assertPanelLacks(
    diagramPanelElement,
    [/\b2D diagram settings\b/i, /\bx min\b/i, /\bGuide grid\b/i, /\bVisible\b/i, /\bLine style\b/i],
    `${mode} geometry2d`,
  );
  if (mode === "wide") {
    await page.locator(".preview-pane").evaluate((pane) => {
      pane.scrollTop = pane.scrollHeight;
    });
    await page.locator(".editor-pane").getByText("Point 1:", { exact: false }).click();
    await inspector.getByText("Point", { exact: true }).waitFor();
    await assertPreviewAnchorSelectedAndVisible(
      page,
      "q:q-columns-ui/b:q-diagram",
      `${mode}: geometry2d child selection should sync parent diagram preview`,
    );
    assert.equal(
      await inspector.getByText("2D diagram settings", { exact: true }).count(),
      0,
      `${mode}: point selection should hide geometry2d canvas settings`,
    );
    const pointX = inspector.locator(`input[aria-label='${label} point 1 x']`);
    await pointX.fill("-2.25");
    assert.equal(await pointX.inputValue(), "-2.25", `${mode}: geometry2d point location should edit in inspector`);

    await page.locator(".editor-pane").getByRole("button", { name: "Add" }).nth(2).click();
    await page.locator(".editor-pane").getByText("Arc 1:", { exact: false }).click();
    await inspector.getByText("Arc", { exact: true }).waitFor();
    const arcLabel = inspector.locator(`input[aria-label='${label} arc 1 label']`);
    await arcLabel.fill("$\\widehat{BD}$");
    assert.equal(await arcLabel.inputValue(), "$\\widehat{BD}$", `${mode}: geometry2d arc settings should edit in inspector`);

    await page.locator(".editor-pane").getByText("Marker 1:", { exact: false }).click();
    await inspector.getByText("Marker", { exact: true }).waitFor();
    const markerSize = inspector.locator(`input[aria-label='${label} marker 1 size']`);
    await markerSize.fill("0.4");
    assert.equal(await markerSize.inputValue(), "0.4", `${mode}: geometry2d marker settings should edit in inspector`);
    await diagramPanelElement.asElement().dispatchEvent("pointerdown");
    await inspector.getByText("2D diagram settings", { exact: true }).waitFor();
  }
  await assertVisibleInspectorControlsFit(inspector, `${mode} geometry2d`);

  await selectDiagramType(inspector, label, "vector2d", "Vector settings");
  await inspector.locator(`select[aria-label='${label} vector label style']`).selectOption("custom");
  assert.equal(await inspector.locator(`select[aria-label='${label} vector label style']`).inputValue(), "custom");
  await inspector.getByLabel("Grid").uncheck();
  await assertPanelLacks(diagramPanelElement, [/\bx min\b/i, /\bLabel style\b/i], `${mode} vector2d`);
  await assertVisibleInspectorControlsFit(inspector, `${mode} vector2d`);

  await selectDiagramType(inspector, label, "graph3d", "3D settings");
  await inspector.locator(`input[aria-label='${label} 3D azimuth']`).fill(mode === "wide" ? "1.25" : "1.35");
  assert.equal(await inspector.locator(`input[aria-label='${label} 3D azimuth']`).inputValue(), mode === "wide" ? "1.25" : "1.35");
  await inspector.locator(`input[aria-label='${label} 3D width']`).fill(mode === "wide" ? "460" : "480");
  await assertPanelLacks(diagramPanelElement, [/\bDiagram width\b/i, /\bAzimuth\b/i], `${mode} graph3d`);
  await assertVisibleInspectorControlsFit(inspector, `${mode} graph3d`);

  await selectDiagramType(inspector, label, "statsChart", "Chart settings");
  await inspector.locator(`select[aria-label='${label} chart type']`).selectOption("normal");
  await inspector.getByText("Normal: mean", { exact: false }).waitFor();
  await inspector.locator(`input[aria-label='${label} chart width']`).fill(mode === "wide" ? "500" : "520");
  assert.equal(await inspector.locator(`input[aria-label='${label} chart width']`).inputValue(), mode === "wide" ? "500" : "520");
  await inspector.getByLabel("Gridlines").uncheck();
  await assertPanelLacks(diagramPanelElement, [/\bChart type\b/i, /\bGridlines\b/i, /\bFill colour\b/i], `${mode} statsChart`);
  await assertVisibleInspectorControlsFit(inspector, `${mode} statsChart`);

  await selectDiagramType(inspector, label, "geometricConstruction", "Penrose settings");
  await inspector.locator(`input[aria-label='${label} Penrose scale']`).fill(mode === "wide" ? "110" : "115");
  assert.equal(await inspector.locator(`input[aria-label='${label} Penrose scale']`).inputValue(), mode === "wide" ? "110" : "115");
  await inspector.getByRole("button", { name: "Resample" }).click();
  await assertPanelLacks(diagramPanelElement, [/\bDiagram scale\b/i, /\bOriginal\b/i, /\bResample\b/i], `${mode} geometric`);
  await assertVisibleInspectorControlsFit(inspector, `${mode} geometric`);

  await selectDiagramType(inspector, label, "network", "Network settings");
  await inspector.locator(`input[aria-label='${label} Penrose scale']`).fill(mode === "wide" ? "105" : "95");
  await inspector.getByRole("button", { name: "Network preset" }).click();
  await inspector.locator(`input[aria-label='${label} show node dots']`).uncheck();
  await inspector.locator(`input[aria-label='${label} show node labels']`).uncheck();
  await assertPanelLacks(diagramPanelElement, [/\bDiagram scale\b/i, /\bNetwork preset\b/i, /\bShow node dots\b/i], `${mode} network`);
  await assertVisibleInspectorControlsFit(inspector, `${mode} network`);

  await selectDiagramType(inspector, label, "setDiagram", "Set diagram settings");
  await inspector.locator(`input[aria-label='${label} Penrose scale']`).fill(mode === "wide" ? "120" : "90");
  await inspector.getByRole("button", { name: "Set notation" }).click();
  await inspector.getByRole("button", { name: "Counts + totals" }).click();
  await inspector.getByRole("button", { name: "Outside" }).click();
  await assertPanelLacks(diagramPanelElement, [/\bDiagram scale\b/i, /\bSet notation\b/i, /\bCounts \+ totals\b/i], `${mode} set diagram`);
  await assertVisibleInspectorControlsFit(inspector, `${mode} setDiagram`);

  await selectDiagramType(inspector, label, "image", "Image settings");
  await inspector.locator(`input[aria-label='${label} image name']`).fill(`${mode} image`);
  await inspector.locator(`input[aria-label='${label} image alt text']`).fill(`${mode} image alt`);
  await inspector.locator(`input[aria-label='${label} image width']`).fill(mode === "wide" ? "360" : "340");
  await inspector.locator(`input[aria-label='${label} image height']`).fill(mode === "wide" ? "220" : "210");
  assert.equal(await inspector.locator(`input[aria-label='${label} image width']`).inputValue(), mode === "wide" ? "360" : "340");
  await assertPanelLacks(diagramPanelElement, [/\bImage settings\b/i, /\bAlt text\b/i, /\bImage width\b/i], `${mode} image`);
  await assertVisibleInspectorControlsFit(inspector, `${mode} image`);
}

async function mockStorageApi(page) {
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json",
  };

  await page.route("http://127.0.0.1:8000/api/storage/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
      return;
    }
    if (pathname === "/api/storage/tests") {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ tests: [] }) });
      return;
    }
    if (pathname === "/api/storage/tests/autosave") {
      const autosave = request.method() === "POST" ? JSON.parse(request.postData() ?? "null") : null;
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ autosave }) });
      return;
    }
    if (pathname === "/api/storage/logos") {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ logos: [] }) });
      return;
    }
    await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({}) });
  });

  await page.route("http://127.0.0.1:8000/api/diagram/penrose", async (route) => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="300" viewBox="0 0 420 300"><rect width="420" height="300" fill="white"/><circle cx="120" cy="160" r="54" fill="none" stroke="#111827" stroke-width="3"/><circle cx="230" cy="160" r="54" fill="none" stroke="#111827" stroke-width="3"/><text x="210" y="60" text-anchor="middle" font-size="18" fill="#111827">Penrose smoke</text></svg>';
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      body: JSON.stringify({ svg, metadata: { displayWidth: 420, displayHeight: 300 } }),
    });
  });
}

async function main() {
  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}`;
  const outputDir = path.join(OUTPUT_ROOT, timestampSlug());
  await fs.mkdir(outputDir, { recursive: true });

  const logs = [];
  const vite = spawn("pnpm", ["--dir", "apps/web", "exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  vite.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  vite.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await context.addInitScript((draft) => {
    window.localStorage.clear();
    window.localStorage.setItem("mauth-studio.theme.v1", "dark");
    window.localStorage.setItem("mauth-studio.current-draft.v1", JSON.stringify(draft));
  }, seededDraft());
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  await mockStorageApi(page);

  try {
    await waitForServer(url, vite, logs);
    await page.goto(url, { waitUntil: "networkidle" });
    const partColumnsAnchor = "q:q-columns-ui/p:p-columns-ui/b:cols-ui";
    const diagramAnchor = "q:q-columns-ui/b:q-diagram";
    const nestedTableAnchor = `${partColumnsAnchor}/c:0/b:c1-table`;
    await page.getByRole("button", { name: "Manual editor mode" }).click();
    const inspector = page.locator("aside").filter({ hasText: "Inspector" }).first();
    await page.getByRole("button", { name: "Show solutions" }).click();
    await page.getByText("Answer space 5", { exact: false }).waitFor();
    await page.locator(`.preview-pane [data-preview-module-anchor="true"][data-scroll-anchor="q:q-columns-ui/b:q-space"]`).waitFor();
    await page.getByRole("button", { name: "Hide solutions" }).click();
    const previewPartColumnsNode = page
      .locator(`.preview-pane [data-preview-module-anchor="true"][data-scroll-anchor="${partColumnsAnchor}"]`)
      .first();
    await previewPartColumnsNode.scrollIntoViewIfNeeded();
    await previewPartColumnsNode.click();
    const partColumnsNode = page.locator(`.editor-pane [data-scroll-anchor="${partColumnsAnchor}"]`).first();
    await partColumnsNode.waitFor({ state: "visible" });
    await partColumnsNode.getByText("Part columns", { exact: false }).waitFor({ timeout: 10_000 });
    await page.getByText("COLUMN 1").waitFor();
    await page.getByText("COLUMN 2").waitFor();

    const nestedTableNode = page.locator(`.editor-pane [data-scroll-anchor="${nestedTableAnchor}"]`).first();
    const columnOne = await page.getByText("COLUMN 1").evaluate(sectionRectForText);
    const columnTwo = await page.getByText("COLUMN 2").evaluate(sectionRectForText);
    const nestedTablePanel = await nestedTableNode.evaluateHandle((element) => element.querySelector("section"));
    const nestedTableText = await nestedTablePanel.asElement().textContent();
    const gridColumns = await page.getByText("COLUMN 1").evaluate((element) => {
      const columnSection = element.closest("section");
      const grid = columnSection?.parentElement;
      return grid ? getComputedStyle(grid).gridTemplateColumns : "";
    });

    assert.equal(await page.title(), "Mauth Studio");
    assert(columnOne.right <= columnTwo.x - 8, "column one should leave a visible gap before column two");
    assert(!/\bPosition\b/.test(nestedTableText ?? ""), "nested table position should not render inline");
    assert(!/\bCell text\b/.test(nestedTableText ?? ""), "nested table cell-text setting should not render inline");
    assert.equal(consoleErrors.length, 0, `console errors:\n${consoleErrors.join("\n")}`);
    assert.equal(pageErrors.length, 0, `page errors:\n${pageErrors.join("\n")}`);

    const panelElement = await partColumnsNode
      .getByText("Part columns", { exact: false })
      .evaluateHandle((element) => element.closest("section"));
    const panelText = await panelElement.asElement().textContent();
    assert(!/\bLayout\b/.test(panelText ?? ""), "columns panel should not render the layout selector inline");

    const previewDiagramNode = page
      .locator(`.preview-pane [data-preview-module-anchor="true"][data-scroll-anchor="${diagramAnchor}"]`)
      .first();
    await previewDiagramNode.scrollIntoViewIfNeeded();
    const previewDiagramSurface = previewDiagramNode.locator(".jxgbox, svg, canvas").first();
    await previewDiagramSurface.waitFor({ state: "visible" });
    await previewDiagramSurface.click({ position: { x: 40, y: 40 } });
    const diagramNode = page.locator(`.editor-pane [data-scroll-anchor="${diagramAnchor}"]`).first();
    await diagramNode.waitFor({ state: "visible" });
    await inspector.getByText("Diagram 4").waitFor();
    await diagramNode.getByText("Diagram block 4", { exact: false }).waitFor();

    await page.setViewportSize({ width: 2400, height: VIEWPORT.height });
    await partColumnsNode.dispatchEvent("pointerdown");
    await inspector.getByText("Part columns 1").waitFor();
    const desktopInspectorMetrics = await inspectorMetrics(inspector);
    assert.equal(desktopInspectorMetrics.placement, "inline", "wide editor should use inline inspector placement");
    assertInspectorBetweenEditorAndPreview(desktopInspectorMetrics, "wide inline inspector");

    await page.getByRole("button", { name: "Hide inspector" }).click();
    await page.locator(".selection-inspector-pane").waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Show inspector" }).click();
    await inspector.getByText("Part columns 1").waitFor();

    await nestedTableNode.dispatchEvent("pointerdown");
    await inspector.getByText("Part Column 1 table 2").waitFor();
    assert.equal(
      await page.locator("select[aria-label='Part Column 1 table 2 position']").count(),
      1,
      "nested table position should only appear in inspector",
    );
    assert.equal(
      await page.locator("select[aria-label='Part Column 1 table 2 cell text']").count(),
      1,
      "nested table cell text should only appear in inspector",
    );
    await inspector.locator("input[aria-label='Part Column 1 table 2 rows']").fill("3");
    await inspector.getByText("3 rows, 3 columns").waitFor();

    await partColumnsNode.dispatchEvent("pointerdown");
    await inspector.getByText("Part columns 1").waitFor();
    const layoutSelect = inspector.locator("select[aria-label='Part columns 1 layout']");
    await layoutSelect.waitFor();
    assert.equal(await page.locator("select[aria-label$='layout']").count(), 1, "layout selector should only appear in inspector");
    await layoutSelect.selectOption("3");
    await inspector.getByText("3 columns, 4 modules").waitFor();

    await page.getByText("Choice list 2", { exact: false }).click();
    await inspector.getByText("Choices 2").waitFor();
    assert.equal(await page.locator("select[aria-label='Choices 2 labels']").count(), 1, "choice labels should only appear in inspector");
    assert.equal(await page.locator("select[aria-label='Choices 2 layout']").count(), 1, "choice layout should only appear in inspector");
    await inspector.locator("select[aria-label='Choices 2 labels']").selectOption("upper-alpha");
    await inspector.getByText("3 a, b, c choices", { exact: false }).waitFor();

    await page.getByText("Table block 3", { exact: false }).click();
    await inspector.getByText("Table 3").waitFor();
    const tablePanelElement = await page
      .getByText("Table block 3", { exact: false })
      .evaluateHandle((element) => element.closest("section"));
    await assertPanelBodyVisible(tablePanelElement, "wide table after header select");
    await page.getByText("Table block 3", { exact: false }).click();
    await assertPanelBodyVisible(tablePanelElement, "wide table after second header select");
    await clickPanelCollapseToggle(tablePanelElement, "wide table");
    await assertPanelBodyHidden(tablePanelElement, "wide table after collapse icon");
    await clickPanelCollapseToggle(tablePanelElement, "wide table");
    await assertPanelBodyVisible(tablePanelElement, "wide table after expand icon");
    assert.equal(await page.locator("select[aria-label='Table 3 position']").count(), 1, "table position should only appear in inspector");
    assert.equal(
      await page.locator("select[aria-label='Table 3 cell text']").count(),
      1,
      "table cell text should only appear in inspector",
    );
    await inspector.locator("input[aria-label='Table 3 rows']").fill("3");
    await inspector.getByText("3 rows, 2 columns").waitFor();

    await page.getByText("Text block 1", { exact: false }).click();
    await inspector.getByText("Text 1").waitFor();
    await inspector.getByText("No settings").waitFor();
    assert.equal(await page.locator("select[aria-label='Diagram 4 type']").count(), 0, "text selection should not show diagram controls");
    await assertVisibleInspectorControlsFit(inspector, "wide text");

    await page.getByText("Answer space 5", { exact: false }).click();
    await inspector.getByText("Space 5").waitFor();
    const spacePanelElement = await page
      .getByText("Answer space 5", { exact: false })
      .evaluateHandle((element) => element.closest("section"));
    await assertPanelLacksCollapseButton(spacePanelElement, "wide space");
    await assertPanelLacks(spacePanelElement, [/\bLines\b/], "wide space");
    await inspector.locator("input[aria-label='Space 5 lines']").fill("6");
    await inspector.getByText("6 lines").waitFor();
    assert.equal(await page.locator("select[aria-label='Choices 2 labels']").count(), 0, "space selection should not show choice controls");
    await assertVisibleInspectorControlsFit(inspector, "wide space");

    await page.getByText("Diagram block 4", { exact: false }).dispatchEvent("pointerdown");
    await inspector.getByText("Diagram 4").waitFor();
    const diagramPanelElement = await page
      .getByText("Diagram block 4", { exact: false })
      .evaluateHandle((element) => element.closest("section"));
    await exerciseDiagramInspectorCycle(page, inspector, diagramPanelElement, "Diagram 4", "wide");
    const inspectorScreenshotPath = path.join(outputDir, "inline-inspector.png");
    await inspector.screenshot({ path: inspectorScreenshotPath });
    const screenshotPath = path.join(outputDir, "columns-editor.png");
    await panelElement.asElement().screenshot({ path: screenshotPath });

    await page.setViewportSize({ width: 1180, height: 500 });
    await page.getByText("Text block 1", { exact: false }).click();
    await inspector.getByText("Text 1").waitFor();
    await inspector.getByText("No settings").waitFor();
    await assertVisibleInspectorControlsFit(inspector, "compact text");

    await page.getByText("Answer space 5", { exact: false }).click();
    await inspector.getByText("Space 5").waitFor();
    await inspector.locator("input[aria-label='Space 5 lines']").fill("7");
    await inspector.getByText("7 lines").waitFor();
    await assertVisibleInspectorControlsFit(inspector, "compact space");

    await page.getByText("Choice list 2", { exact: false }).click();
    await inspector.getByText("Choices 2").waitFor();
    await inspector.locator("select[aria-label='Choices 2 labels']").selectOption("lower-alpha");
    await inspector.getByText("3 a, b, c choices", { exact: false }).waitFor();
    await assertVisibleInspectorControlsFit(inspector, "compact choices");

    await page.getByText("Table block 3", { exact: false }).click();
    await inspector.getByText("Table 3").waitFor();
    await inspector.locator("input[aria-label='Table 3 rows']").fill("4");
    await inspector.getByText("4 rows, 2 columns").waitFor();
    await assertVisibleInspectorControlsFit(inspector, "compact table");

    await partColumnsNode.dispatchEvent("pointerdown");
    await inspector.getByText("Part columns 1").waitFor();
    await inspector.locator("select[aria-label='Part columns 1 layout']").selectOption("2");
    await inspector.getByText("2 columns, 3 modules").waitFor();
    await assertVisibleInspectorControlsFit(inspector, "compact columns");

    await page.getByText("Diagram block 4", { exact: false }).dispatchEvent("pointerdown");
    await inspector.getByText("Diagram 4").waitFor();
    const compactInspectorMetrics = await inspectorMetrics(inspector);
    assert.equal(compactInspectorMetrics.placement, "inline", "compact editor should keep inline inspector placement");
    assertInspectorBetweenEditorAndPreview(compactInspectorMetrics, "compact inline inspector");
    await exerciseDiagramInspectorCycle(page, inspector, diagramPanelElement, "Diagram 4", "compact");
    await selectDiagramType(inspector, "Diagram 4", "statsChart", "Chart settings");
    await inspector.locator("select[aria-label='Diagram 4 chart type']").selectOption("normal");
    await inspector.getByText("Normal: mean", { exact: false }).waitFor();
    const compactStatsInspectorMetrics = await inspectorMetrics(inspector);
    assert(
      compactStatsInspectorMetrics.scroller.scrollHeight > compactStatsInspectorMetrics.scroller.clientHeight + 8,
      "compact inline inspector should become internally scrollable for tall settings",
    );
    await inspector.evaluate((element) => {
      const scroller = element.querySelector(".overflow-y-auto");
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
    const compactScrolledMetrics = await inspectorMetrics(inspector);
    assert(compactScrolledMetrics.scroller.scrollTop > 0, "compact inline inspector should allow scrolling to lower controls");
    await inspector.locator("input[aria-label='Diagram 4 fill opacity']").fill("0.6");
    assert.equal(
      await inspector.locator("input[aria-label='Diagram 4 fill opacity']").inputValue(),
      "0.6",
      "inline inspector lower controls should remain editable after scrolling",
    );

    const compactInspectorScreenshotPath = path.join(outputDir, "compact-inspector.png");
    await inspector.screenshot({ path: compactInspectorScreenshotPath });

    await nestedTableNode.dispatchEvent("pointerdown");
    await inspector.getByText("Part Column 1 table 2").waitFor();
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })));
    await nestedTableNode.waitFor({ state: "detached" });
    await inspector.getByText("Part columns 1").waitFor();
    assert.equal(
      await page.locator(`.editor-pane [data-scroll-anchor="${nestedTableAnchor}"]`).count(),
      0,
      "Delete should remove nested table",
    );

    console.log(
      `Editor inspector smoke passed. Grid columns: ${gridColumns}. Column one width: ${columnOne.width}px. Inspector covered text, space, columns, choices, tables, and every diagram type in wide and compact layouts, then deleted a nested table. Screenshot: ${screenshotPath}. Inspector screenshot: ${inspectorScreenshotPath}. Compact inspector screenshot: ${compactInspectorScreenshotPath}`,
    );
  } catch (error) {
    const bodyText = (
      (await page
        .locator("body")
        .textContent()
        .catch(() => "")) ?? ""
    ).trim();
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nConsole errors:\n${consoleErrors.join("\n")}\nPage errors:\n${pageErrors.join(
        "\n",
      )}\nVite logs:\n${logs.join("")}\nBody text:\n${bodyText}`,
    );
  } finally {
    await browser.close();
    await stopProcess(vite);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
