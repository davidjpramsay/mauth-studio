import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKBENCH_ROOT = path.resolve(ROOT, "workspace");
const OUTPUT_ROOT = process.env.MAUTH_EDITOR_COLUMNS_SMOKE_OUTPUT ?? path.join(WORKBENCH_ROOT, "verification", "editor-columns-smoke");
const VIEWPORT = { width: 1484, height: 1264 };
const BASIC_BLOCKS_ONLY = process.argv.includes("--basic-blocks-only");

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
            text: "Editable part wording.",
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
          {
            id: "p-second-ui",
            label: "",
            text: "Second editable part.",
            marks: 1,
            contentBlocks: [{ id: "p-second-space", kind: "space", lines: 2, visibility: "student", studentOnly: true }],
            subparts: [],
            itemOrder: [{ kind: "block", id: "p-second-space" }],
          },
        ],
        itemOrder: [
          { kind: "block", id: "q-intro" },
          { kind: "block", id: "q-choices" },
          { kind: "block", id: "q-table" },
          { kind: "block", id: "q-diagram" },
          { kind: "block", id: "q-space" },
          { kind: "part", id: "p-columns-ui" },
          { kind: "part", id: "p-second-ui" },
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
    const toolDock = element.closest(".workspace-tool-dock");
    const toolDockRect = toolDock?.getBoundingClientRect();
    const workspace = element.closest(".app-workspace");
    const workspaceRect = workspace?.getBoundingClientRect();
    return {
      placement: element.getAttribute("data-inspector-placement"),
      responsiveMode: workspace?.getAttribute("data-responsive-mode"),
      activeTool: toolDock?.getAttribute("data-active-tool"),
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
      toolDock: toolDockRect
        ? {
            left: toolDockRect.left,
            top: toolDockRect.top,
            right: toolDockRect.right,
            bottom: toolDockRect.bottom,
            width: toolDockRect.width,
            height: toolDockRect.height,
          }
        : null,
      workspace: workspaceRect
        ? {
            left: workspaceRect.left,
            top: workspaceRect.top,
            right: workspaceRect.right,
            bottom: workspaceRect.bottom,
            width: workspaceRect.width,
            height: workspaceRect.height,
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

function assertInspectorInCompactToolDock(metrics, label) {
  assert.equal(metrics.responsiveMode, "compact", `${label}: expected compact workspace mode`);
  assert.equal(metrics.activeTool, "settings", `${label}: settings should be the active compact tool`);
  assert(metrics.toolDock, `${label}: expected a shared tool dock`);
  assert(metrics.preview, `${label}: expected a preview pane`);
  assert(metrics.editor, `${label}: expected the retained editor pane`);
  assert(metrics.editor.width === 0, `${label}: inactive editor should not consume horizontal space`);
  assert(metrics.inspector.width > 0, `${label}: inspector should have positive width`);
  assert(metrics.inspector.left >= metrics.toolDock.left - 1, `${label}: inspector should stay inside the tool dock`);
  assert(metrics.inspector.right <= metrics.toolDock.right + 1, `${label}: inspector should stay inside the tool dock`);
  assert(metrics.toolDock.right <= metrics.preview.left + 1, `${label}: tool dock should not overlap the preview`);
}

function assertInspectorInOverlayToolDock(metrics, label) {
  assert.equal(metrics.responsiveMode, "overlay", `${label}: expected overlay workspace mode`);
  assert.equal(metrics.activeTool, "settings", `${label}: settings should be the active overlay tool`);
  assert(metrics.toolDock, `${label}: expected a shared tool dock`);
  assert(metrics.workspace, `${label}: expected workspace bounds`);
  assert(metrics.editor, `${label}: expected the retained editor pane`);
  assert(metrics.editor.width === 0, `${label}: inactive editor should not consume horizontal space`);
  assert(metrics.inspector.width > 0, `${label}: inspector should have positive width`);
  assert(metrics.toolDock.left >= metrics.workspace.left - 1, `${label}: overlay should start inside the workspace`);
  assert(metrics.toolDock.right <= metrics.workspace.right + 1, `${label}: overlay should stay inside the workspace`);
  assert(metrics.toolDock.width <= metrics.workspace.width, `${label}: overlay should not be wider than the workspace`);
}

async function showCompactTool(page, name) {
  const button = page.getByRole("tab", { name });
  await button.waitFor({ state: "visible" });
  await button.click();
  assert.equal(await button.getAttribute("aria-selected"), "true", `${name} should become the active compact tool`);
}

async function assertVisibleInspectorControlsFit(inspector, label) {
  const clipped = await inspector.evaluate((element) => {
    const scroller = element.querySelector(".overflow-y-auto");
    if (!scroller) return ["missing inspector scroller"];
    const scrollerRect = scroller.getBoundingClientRect();
    const controls = [...element.querySelectorAll("input, select, textarea, button")];
    return controls
      .map((control) => {
        if (control.classList.contains("sr-only")) return null;
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

async function assertVisibleEditorControlsFit(editor, label) {
  const clipped = await editor.evaluate((element) => {
    const surfaceRect = element.getBoundingClientRect();
    const controls = [...element.querySelectorAll("input, select, textarea, button")];
    return controls
      .map((control) => {
        if (control.classList.contains("sr-only")) return null;
        const rect = control.getBoundingClientRect();
        const verticallyVisible = rect.bottom > surfaceRect.top + 1 && rect.top < surfaceRect.bottom - 1;
        if (!verticallyVisible || rect.width === 0 || rect.height === 0) return null;
        if (rect.left < surfaceRect.left - 1 || rect.right > surfaceRect.right + 1) {
          const identity = [
            control.tagName,
            control.getAttribute("type"),
            control.getAttribute("aria-label"),
            control.getAttribute("name"),
            control.className,
          ]
            .filter(Boolean)
            .join(" ");
          return `${identity || control.textContent?.trim() || control.tagName} ${Math.round(rect.left)}-${Math.round(rect.right)} outside ${Math.round(
            surfaceRect.left,
          )}-${Math.round(surfaceRect.right)}`;
        }
        return null;
      })
      .filter(Boolean);
  });
  assert.equal(clipped.length, 0, `${label}: visible editor controls should not be horizontally clipped:\n${clipped.join("\n")}`);
}

async function assertQuestionSurfacePresentation(page) {
  const questionSurface = page.locator('.editor-pane article[data-scroll-anchor="q:q-columns-ui"]');
  await questionSurface.waitFor({ state: "visible" });
  const presentation = await questionSurface.evaluate((element) => {
    const style = getComputedStyle(element);
    const wording = element.querySelector('textarea[aria-label="Question wording"]');
    return {
      backgroundColor: style.backgroundColor,
      borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
      boxShadow: style.boxShadow,
      wordingFontSize: wording ? Number.parseFloat(getComputedStyle(wording).fontSize) : 0,
    };
  });

  assert.deepEqual(presentation.borderWidths, ["0px", "0px", "0px", "0px"], "question surface should not add an outer border");
  assert.equal(presentation.boxShadow, "none", "question surface should not add an outer card shadow");
  assert.equal(presentation.backgroundColor, "rgba(0, 0, 0, 0)", "question surface should use the editor pane background");
  assert(presentation.wordingFontSize >= 14, "question wording should retain the normal editor control type size");
}

async function assertInspectorControlTypography(control, label) {
  const fontSize = await control.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  assert(fontSize >= 14, `${label}: inspector control text should remain at least 14px, got ${fontSize}px`);
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

async function openInspectorDetails(inspector, summaryText) {
  const details = inspector.locator("details").filter({ hasText: summaryText }).first();
  await details.waitFor();
  if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
}

async function selectDiagramType(page, inspector, label, type, expectedHeading) {
  await openInspectorDetails(inspector, "Change diagram type");
  const typeSelect = inspector.locator(`select[aria-label='${label} new type']`);
  if ((await typeSelect.inputValue()) !== type) {
    await typeSelect.selectOption(type);
    const confirmButton = page.getByRole("button", { name: "Change diagram type", exact: true });
    await confirmButton.waitFor({ state: "visible" });
    await confirmButton.click();
  }
  assert.equal(await typeSelect.inputValue(), type, `${label}: diagram type should change to ${type}`);
  const heading = inspector.getByText(expectedHeading, { exact: true });
  if ((await heading.count()) > 0) await heading.waitFor();
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

async function assertGeometry2DRenderedPrimitives(page, label) {
  await page.locator('.preview-pane [data-mauth-geometry2d-primitive="true"]').first().waitFor({ state: "attached" });
  const metrics = await page.locator(".preview-pane").evaluate((pane) => {
    const elements = Array.from(pane.querySelectorAll('[data-mauth-geometry2d-primitive="true"]'));
    const renderedByKind = new Map();
    const labelsByKind = new Map();
    for (const element of elements) {
      const kind = element.getAttribute("data-mauth-geometry2d-kind") ?? "unknown";
      const isLabel = Boolean(element.getAttribute("data-mauth-label-role"));
      const target = isLabel ? labelsByKind : renderedByKind;
      target.set(kind, (target.get(kind) ?? 0) + 1);
    }
    return {
      rendered: Object.fromEntries(renderedByKind),
      labels: Object.fromEntries(labelsByKind),
      draggableLabelCount: pane.querySelectorAll('[data-mauth-draggable-geometry2d-label="true"]').length,
    };
  });

  assert((metrics.rendered.point ?? 0) >= 4, `${label}: geometry2d should render named points`);
  assert((metrics.rendered.segment ?? 0) >= 4, `${label}: geometry2d should render straight segments`);
  assert((metrics.rendered.arc ?? 0) >= 1, `${label}: geometry2d should render circular arcs`);
  assert((metrics.rendered.angle ?? 0) >= 1, `${label}: geometry2d should render angle primitives as visible arcs`);
  assert((metrics.rendered.decoration ?? 0) >= 2, `${label}: geometry2d should render semantic decorations`);
  assert((metrics.labels.angle ?? 0) >= 1, `${label}: geometry2d should render angle labels separately from angle arcs`);
  assert(metrics.draggableLabelCount >= 7, `${label}: geometry2d point, segment, and angle labels should be independently draggable`);
}

async function exerciseDiagramInspectorCycle(page, inspector, diagramPanelElement, label, mode, outputDir) {
  await selectDiagramType(page, inspector, label, "graph2d", "Axes");
  if (mode === "wide") {
    await assertTextOrder(
      page.locator(".editor-pane"),
      ["Functions", "Graph objects", "Points", "Segments and tangents", "Annotations", "Shading"],
      `${mode}: graph editor groups`,
    );
  }
  const viewXMaximum = inspector.getByRole("spinbutton", { name: `${label} view x maximum` });
  await viewXMaximum.fill(mode === "wide" ? "8" : "9");
  assert.equal(await viewXMaximum.inputValue(), mode === "wide" ? "8" : "9", `${mode}: graph view settings should edit in inspector`);
  await openInspectorDetails(inspector, "Scale and grid");
  const minorGridToggle = inspector.getByRole("checkbox", { name: "Minor grid", exact: true });
  await minorGridToggle.check();
  assert.equal(await minorGridToggle.isChecked(), true, `${mode}: graph minor grid toggle should edit in inspector`);
  const xMinor = inspector.getByRole("spinbutton", { name: `${label} x minor grid step` });
  const yMinor = inspector.getByRole("spinbutton", { name: `${label} y minor grid step` });
  await xMinor.fill(mode === "wide" ? "0.25" : "0.2");
  await yMinor.fill(mode === "wide" ? "0.5" : "0.4");
  assert.equal(await xMinor.inputValue(), mode === "wide" ? "0.25" : "0.2", `${mode}: graph x minor interval should edit in inspector`);
  assert.equal(await yMinor.inputValue(), mode === "wide" ? "0.5" : "0.4", `${mode}: graph y minor interval should edit in inspector`);
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
      await inspector.getByText("Axes", { exact: true }).count(),
      0,
      `${mode}: function selection should hide graph canvas settings`,
    );
    const functionLabel = inspector.locator(`input[aria-label='${label} function 2 label']`);
    await functionLabel.fill("g");
    assert.equal(await functionLabel.inputValue(), "g", `${mode}: graph function display settings should edit in inspector`);
    await page.locator(".editor-pane").getByText("Point 1:", { exact: false }).click();
    await inspector.getByText("Feature display", { exact: true }).waitFor();
    assert.equal(
      await inspector.getByText("Axes", { exact: true }).count(),
      0,
      `${mode}: feature selection should hide graph canvas settings`,
    );
    const solutionVisibilityToggle = inspector.locator(`input[aria-label='${label} feature 1 show in solutions only']`);
    await solutionVisibilityToggle.check();
    assert.equal(await solutionVisibilityToggle.isChecked(), true, `${mode}: graph feature solution visibility should edit in inspector`);
    const featureX = inspector.locator(`input[aria-label='${label} feature 1 x']`);
    await featureX.fill("");
    await delay(50);
    assert.equal(await featureX.inputValue(), "", `${mode}: graph coordinate input should remain empty while replacing its value`);
    await featureX.fill("pi + 3");
    assert.equal(await featureX.inputValue(), "pi + 3", `${mode}: graph coordinate input should retain an exact expression while editing`);
    const featureY = inspector.locator(`input[aria-label='${label} feature 1 y']`);
    await featureY.fill("sqrt(2)");
    await inspector.screenshot({ path: path.join(outputDir, "numeric-expression-input.png") });
    await featureX.blur();
    assert(
      Math.abs(Number(await featureX.inputValue()) - (Math.PI + 3)) < 1e-12,
      `${mode}: graph x expression should commit as a finite number`,
    );
    await featureY.blur();
    assert(
      Math.abs(Number(await featureY.inputValue()) - Math.sqrt(2)) < 1e-12,
      `${mode}: graph y expression should commit as a finite number`,
    );
    await featureX.fill("4.1");
    await inspector.getByRole("button", { name: `${label} feature 1 x increase` }).click();
    assert.equal(await featureX.inputValue(), "5", `${mode}: graph coordinate stepper should advance to the next integer`);
    await page.locator(".editor-pane").getByText("Angle marker 4:", { exact: false }).click();
    await inspector.getByText("Feature display", { exact: true }).waitFor();
    const angleRadius = inspector.locator(`input[aria-label='${label} feature 4 radius']`);
    await angleRadius.fill("0.6");
    assert.equal(await angleRadius.inputValue(), "0.6", `${mode}: angle marker radius should edit in inspector`);
    const rightAngleToggle = inspector.locator(`input[aria-label='${label} feature 4 right angle']`);
    await rightAngleToggle.check();
    assert.equal(await rightAngleToggle.isChecked(), true, `${mode}: angle marker right-angle option should edit in inspector`);
    await diagramPanelElement.asElement().dispatchEvent("pointerdown");
    await inspector.getByText("Axes", { exact: true }).waitFor();
  }
  const graphPanelText = await diagramPanelElement.asElement().textContent();
  assert(!/\banglemarker\b/i.test(graphPanelText ?? ""), `${mode}: generated graph function labels should not leak into panel titles`);
  await assertPanelLacks(
    diagramPanelElement,
    [/\bAxes and grid\b/i, /\bFunction Arrows\b/i, /\bShow in solutions only\b/i, /\bGraph label\b/i, /\bLine style\b/i, /\bColour\b/i],
    `${mode} graph2d`,
  );
  assert.equal(await page.locator("select[aria-label='Diagram 4 new type']").count(), 1, `${mode}: diagram type should only appear once`);
  assert.equal(
    await page.locator("select[aria-label='Diagram 4 position']").count(),
    1,
    `${mode}: diagram position should only appear once`,
  );
  await assertVisibleInspectorControlsFit(inspector, `${mode} graph2d`);

  await selectDiagramType(page, inspector, label, "geometry2d", "2D diagram settings");
  if (mode === "wide") {
    await assertTextOrder(
      page.locator(".editor-pane"),
      ["Points", "Segments", "Arcs", "Angles", "Annotations"],
      `${mode}: geometry2d editor primitive groups`,
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
  await assertGeometry2DRenderedPrimitives(page, `${mode}: default geometry2d preview`);
  if (mode === "wide") {
    await page.locator(".preview-pane").evaluate((pane) => {
      pane.scrollTop = pane.scrollHeight;
    });
    await page.getByRole("button", { name: /^Point 1:/ }).click();
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

    await inspector.getByRole("button", { name: "2D diagram" }).click();
    await page.getByRole("button", { name: /^Segment 1:/ }).click();
    await inspector.getByText("Segment", { exact: true }).waitFor();
    const segmentLabelX = inspector.locator(`input[aria-label='${label} segment 1 label x']`);
    const labelXBeforeDrag = Number(await segmentLabelX.inputValue());
    const draggableSegmentLabel = page
      .locator(
        '.preview-pane [data-mauth-draggable-geometry2d-label="true"][data-mauth-geometry2d-kind="segment"][data-mauth-geometry2d-id="OA"]',
      )
      .first();
    const draggableSegmentLabelBox = await draggableSegmentLabel.boundingBox();
    assert(draggableSegmentLabelBox, `${mode}: geometry2d segment label should expose a drag target`);
    await page.mouse.move(
      draggableSegmentLabelBox.x + draggableSegmentLabelBox.width / 2,
      draggableSegmentLabelBox.y + draggableSegmentLabelBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      draggableSegmentLabelBox.x + draggableSegmentLabelBox.width / 2 + 30,
      draggableSegmentLabelBox.y + draggableSegmentLabelBox.height / 2 - 18,
      { steps: 4 },
    );
    await page.mouse.up();
    let labelXAfterDrag = Number(await segmentLabelX.inputValue());
    for (let attempt = 0; attempt < 20 && Math.abs(labelXAfterDrag - labelXBeforeDrag) < 0.01; attempt += 1) {
      await delay(50);
      labelXAfterDrag = Number(await segmentLabelX.inputValue());
    }
    assert(
      Math.abs(labelXAfterDrag - labelXBeforeDrag) >= 0.01,
      `${mode}: dragging a geometry2d segment label should persist its independent label coordinates`,
    );
    await segmentLabelX.fill("0.95");
    assert.equal(await segmentLabelX.inputValue(), "0.95", `${mode}: geometry2d segment label location should edit in inspector`);
    await inspector.locator(`input[aria-label='${label} segment 1 colour']`).fill("#111111");
    assert.equal(
      await inspector.locator(`input[aria-label='${label} segment 1 colour']`).inputValue(),
      "#111111",
      `${mode}: geometry2d segment colour should edit in inspector`,
    );

    await inspector.getByRole("button", { name: "2D diagram" }).click();
    await page.getByRole("button", { name: "Add arc", exact: true }).click();
    await page.getByRole("button", { name: /^Arc 1:/ }).click();
    await inspector.getByText("Arc", { exact: true }).waitFor();
    const arcLabel = inspector.locator(`input[aria-label='${label} arc 1 label']`);
    await arcLabel.fill("$\\widehat{BD}$");
    assert.equal(await arcLabel.inputValue(), "$\\widehat{BD}$", `${mode}: geometry2d arc settings should edit in inspector`);
    await inspector.locator(`select[aria-label='${label} arc 1 line style']`).selectOption("dashed");
    assert.equal(
      await inspector.locator(`select[aria-label='${label} arc 1 line style']`).inputValue(),
      "dashed",
      `${mode}: geometry2d arc line style should edit in inspector`,
    );

    await inspector.getByRole("button", { name: "2D diagram" }).click();
    await page.getByRole("button", { name: /^Angle 1:/ }).click();
    await inspector.getByText("Angle", { exact: true }).waitFor();
    const angleCount = inspector.locator(`input[aria-label='${label} angle 1 count']`);
    await angleCount.fill("2");
    assert.equal(await angleCount.inputValue(), "2", `${mode}: geometry2d angle arc count should edit in inspector`);
    await inspector.locator(`select[aria-label='${label} angle 1 line style']`).selectOption("dashed");
    assert.equal(
      await inspector.locator(`select[aria-label='${label} angle 1 line style']`).inputValue(),
      "dashed",
      `${mode}: geometry2d angle line style should edit in inspector`,
    );

    await inspector.getByRole("button", { name: "2D diagram" }).click();
    await page.getByRole("button", { name: /^Equal length 1/ }).click();
    await inspector.getByText("Annotation", { exact: true }).waitFor();
    const annotationCount = inspector.locator(`input[aria-label='${label} annotation 1 count']`);
    await annotationCount.fill("2");
    assert.equal(await annotationCount.inputValue(), "2", `${mode}: geometry2d equal-length annotation count should edit in Settings`);
    await inspector.getByRole("button", { name: "2D diagram" }).click();
    await page.getByRole("button", { name: /^Right angle 2/ }).click();
    await inspector.getByText("Annotation", { exact: true }).waitFor();
    const annotationSize = inspector.locator(`input[aria-label='${label} annotation 2 size']`);
    await annotationSize.fill("0.4");
    assert.equal(await annotationSize.inputValue(), "0.4", `${mode}: geometry2d right-angle annotation settings should edit in Settings`);
    await inspector.locator(`input[aria-label='${label} annotation 2 colour']`).fill("#222222");
    assert.equal(
      await inspector.locator(`input[aria-label='${label} annotation 2 colour']`).inputValue(),
      "#222222",
      `${mode}: geometry2d annotation colour should edit in Settings`,
    );
    await diagramPanelElement.asElement().dispatchEvent("pointerdown");
    await inspector.getByText("2D diagram settings", { exact: true }).waitFor();
  }
  await assertVisibleInspectorControlsFit(inspector, `${mode} geometry2d`);

  await selectDiagramType(page, inspector, label, "vector2d", "Vector settings");
  await inspector.locator(`select[aria-label='${label} vector label style']`).selectOption("custom");
  assert.equal(await inspector.locator(`select[aria-label='${label} vector label style']`).inputValue(), "custom");
  await inspector.getByRole("checkbox", { name: `${label} vector grid` }).uncheck();
  await assertPanelLacks(diagramPanelElement, [/\bx min\b/i, /\bLabel style\b/i], `${mode} vector2d`);
  await assertVisibleInspectorControlsFit(inspector, `${mode} vector2d`);

  await selectDiagramType(page, inspector, label, "graph3d", "3D settings");
  await inspector.locator(`input[aria-label='${label} 3D azimuth']`).fill(mode === "wide" ? "1.25" : "1.35");
  assert.equal(await inspector.locator(`input[aria-label='${label} 3D azimuth']`).inputValue(), mode === "wide" ? "1.25" : "1.35");
  await inspector.locator(`input[aria-label='${label} 3D frame width']`).fill(mode === "wide" ? "460" : "480");
  if (await page.getByRole("tab", { name: "Content" }).isVisible()) await showCompactTool(page, "Content");
  const addDimensionButton = page.locator(".editor-pane button").filter({ hasText: "Add dimension" }).first();
  assert.equal(await addDimensionButton.isDisabled(), false, `${mode}: Add dimension should be enabled for the default 3D points`);
  await addDimensionButton.evaluate((button) => button.click());
  await addDimensionButton.evaluate((button) => button.click());
  const perpendicularSelectors = page.locator("[data-graph3d-perpendicular-select]");
  assert.equal(await perpendicularSelectors.count(), 2, `${mode}: each 3D dimension should expose a perpendicular relationship control`);
  await page.locator("[data-graph3d-annotations]").getByText("Annotations", { exact: true }).waitFor();
  await perpendicularSelectors.first().selectOption("dimension-2");
  assert.equal(
    await perpendicularSelectors.first().inputValue(),
    "dimension-2",
    `${mode}: the connected 3D dimension should be selectable as a perpendicular partner`,
  );
  if (mode === "wide") {
    await perpendicularSelectors.first().scrollIntoViewIfNeeded();
    await page.locator(".editor-pane").screenshot({ path: path.join(outputDir, "graph3d-perpendicular-content-control.png") });
    await page.getByRole("button", { name: "Edit dimension 1 settings" }).click();
    assert(
      !/\bPerpendicular to\b/i.test((await inspector.textContent()) ?? ""),
      `${mode}: 3D dimension Settings should not duplicate Content`,
    );
    await inspector.screenshot({ path: path.join(outputDir, "graph3d-perpendicular-settings.png") });
    await inspector.getByRole("button", { name: "Diagram settings" }).click();
    await inspector.getByText("3D settings", { exact: true }).waitFor();
  }
  if (await page.getByRole("tab", { name: "Settings" }).isVisible()) await showCompactTool(page, "Settings");
  await assertPanelLacks(diagramPanelElement, [/\bDiagram width\b/i, /\bAzimuth\b/i], `${mode} graph3d`);
  await assertVisibleInspectorControlsFit(inspector, `${mode} graph3d`);

  await selectDiagramType(page, inspector, label, "statsChart", "Chart settings");
  await inspector.locator(`select[aria-label='${label} chart type']`).selectOption("normal");
  await inspector.getByText("Normal: mean", { exact: false }).waitFor();
  await inspector.locator(`input[aria-label='${label} chart width']`).fill(mode === "wide" ? "500" : "520");
  assert.equal(await inspector.locator(`input[aria-label='${label} chart width']`).inputValue(), mode === "wide" ? "500" : "520");
  await inspector.getByLabel("Gridlines").uncheck();
  await assertPanelLacks(diagramPanelElement, [/\bChart type\b/i, /\bGridlines\b/i, /\bFill colour\b/i], `${mode} statsChart`);
  await assertVisibleInspectorControlsFit(inspector, `${mode} statsChart`);

  await selectDiagramType(page, inspector, label, "geometricConstruction", "Penrose settings");
  await inspector.locator(`input[aria-label='${label} Penrose scale']`).fill(mode === "wide" ? "110" : "115");
  assert.equal(await inspector.locator(`input[aria-label='${label} Penrose scale']`).inputValue(), mode === "wide" ? "110" : "115");
  await inspector.getByRole("button", { name: "Resample" }).click();
  await assertPanelLacks(diagramPanelElement, [/\bDiagram scale\b/i, /\bOriginal\b/i, /\bResample\b/i], `${mode} geometric`);
  await assertVisibleInspectorControlsFit(inspector, `${mode} geometric`);

  await selectDiagramType(page, inspector, label, "network", "Network settings");
  await inspector.locator(`input[aria-label='${label} Penrose scale']`).fill(mode === "wide" ? "105" : "95");
  await inspector.getByRole("button", { name: "Network preset" }).click();
  await inspector.locator(`input[aria-label='${label} show node dots']`).uncheck();
  await inspector.locator(`input[aria-label='${label} show node labels']`).uncheck();
  await assertPanelLacks(diagramPanelElement, [/\bDiagram scale\b/i, /\bNetwork preset\b/i, /\bShow node dots\b/i], `${mode} network`);
  await assertVisibleInspectorControlsFit(inspector, `${mode} network`);

  await selectDiagramType(page, inspector, label, "setDiagram", "Venn diagram settings");
  await inspector.locator(`input[aria-label='${label} Penrose scale']`).fill(mode === "wide" ? "120" : "90");
  await inspector.getByRole("button", { name: "Set notation" }).click();
  await inspector.getByRole("button", { name: "Counts + totals" }).click();
  await inspector.getByRole("button", { name: "Outside" }).click();
  await assertPanelLacks(diagramPanelElement, [/\bDiagram scale\b/i, /\bSet notation\b/i, /\bCounts \+ totals\b/i], `${mode} set diagram`);
  await assertVisibleInspectorControlsFit(inspector, `${mode} setDiagram`);

  await selectDiagramType(page, inspector, label, "image", "Image settings");
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

  await page.route("http://127.0.0.1:8000/api/system/status", async (route) => {
    await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({}) });
  });

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

  await page.route("http://127.0.0.1:8000/api/agent/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
      return;
    }
    if (url.pathname.endsWith("/browser/register")) {
      const payload = JSON.parse(request.postData() ?? "{}");
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          sessionId: payload.sessionId,
          pollUrl: `/api/agent/current/browser/requests?sessionId=${payload.sessionId}`,
          respondUrl: "/api/agent/current/browser/respond",
        }),
      });
      return;
    }
    if (url.pathname.endsWith("/browser/requests")) {
      await delay(250);
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ request: null }) });
      return;
    }
    await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ success: true, removed: true }) });
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
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Manual editor mode" }).waitFor();
    const partColumnsAnchor = "q:q-columns-ui/p:p-columns-ui/b:cols-ui";
    const secondPartAnchor = "q:q-columns-ui/p:p-second-ui";
    const diagramAnchor = "q:q-columns-ui/b:q-diagram";
    const nestedTableAnchor = `${partColumnsAnchor}/c:0/b:c1-table`;
    await page.getByRole("button", { name: "Manual editor mode" }).click();
    await assertQuestionSurfacePresentation(page);
    const inspector = page.locator("aside").filter({ hasText: "Settings" }).first();
    await page.getByRole("button", { name: "Switch to Solutions mode" }).click();
    await page.getByText("Answer space 5", { exact: false }).waitFor();
    await page.locator(`.preview-pane [data-preview-module-anchor="true"][data-scroll-anchor="q:q-columns-ui/b:q-space"]`).waitFor();
    await page.getByRole("button", { name: "Switch to Student mode" }).click();
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
    const partWording = page.getByLabel("Part wording");
    await partWording.fill("Updated part wording with $x=2$.");
    assert.equal(await partWording.inputValue(), "Updated part wording with $x=2$.", "part wording should be directly editable");
    await page.locator(".preview-pane").getByText("Updated part wording with", { exact: false }).first().waitFor();

    const secondPartNode = page.locator(`.editor-pane [data-scroll-anchor="${secondPartAnchor}"]`).first();
    const secondPartPanel = secondPartNode.locator(":scope > div > section");
    await secondPartNode.getByRole("button", { name: "Expand panel" }).click();
    assert(
      (await secondPartPanel.getAttribute("class"))?.includes("border-primary/70"),
      "clicking the Part (b) panel should select its container",
    );
    await page
      .locator(
        `.preview-pane [data-preview-structure-anchor="true"][data-scroll-anchor="${secondPartAnchor}"][data-preview-selected="true"]`,
      )
      .waitFor();
    await secondPartNode.getByLabel("Part wording").fill("Updated second part wording.");
    assert.equal(
      await secondPartNode.getByLabel("Part wording").inputValue(),
      "Updated second part wording.",
      "Part (b) wording should be directly editable after selecting the panel",
    );

    const nestedTableNode = page.locator(`.editor-pane [data-scroll-anchor="${nestedTableAnchor}"]`).first();
    const initialPartColumnTracks = await page.getByText("COLUMN 1").evaluate((element) => {
      const columnSection = element.closest("section");
      const grid = columnSection?.parentElement;
      return grid ? getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length : 0;
    });
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
    if (initialPartColumnTracks === 2) {
      assert(columnOne.right <= columnTwo.x - 8, "column one should leave a visible gap before column two");
    }
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

    await page.getByRole("button", { name: "Hide settings" }).click();
    await page.locator(".selection-inspector-pane").waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Show settings" }).click();
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
    assert.equal(
      await page.locator("select[aria-label='Diagram 4 new type']").count(),
      0,
      "text selection should not show diagram controls",
    );
    await assertVisibleInspectorControlsFit(inspector, "wide text");

    await page.getByText("Answer space 5", { exact: false }).click();
    await inspector.getByText("Space 5").waitFor();
    const spacePanelElement = await page
      .getByText("Answer space 5", { exact: false })
      .evaluateHandle((element) => element.closest("section"));
    await assertPanelLacksCollapseButton(spacePanelElement, "wide space");
    await assertPanelLacks(spacePanelElement, [/\bLines\b/], "wide space");
    await inspector.locator("input[aria-label='Space 5 lines']").fill("6");
    await assertInspectorControlTypography(inspector.locator("input[aria-label='Space 5 lines']"), "wide space");
    await inspector.getByText("6 lines").waitFor();
    assert.equal(await page.locator("select[aria-label='Choices 2 labels']").count(), 0, "space selection should not show choice controls");
    await assertVisibleInspectorControlsFit(inspector, "wide space");

    const inspectorScreenshotPath = path.join(outputDir, "inline-inspector.png");
    const screenshotPath = path.join(outputDir, "columns-editor.png");
    let diagramPanelElement = null;
    if (!BASIC_BLOCKS_ONLY) {
      await page.getByText("Diagram block 4", { exact: false }).dispatchEvent("pointerdown");
      await inspector.getByText("Diagram 4").waitFor();
      diagramPanelElement = await page
        .getByText("Diagram block 4", { exact: false })
        .evaluateHandle((element) => element.closest("section"));
      await exerciseDiagramInspectorCycle(page, inspector, diagramPanelElement, "Diagram 4", "wide", outputDir);
    }
    await inspector.screenshot({ path: inspectorScreenshotPath });
    await panelElement.asElement().screenshot({ path: screenshotPath });

    await page.setViewportSize({ width: 1180, height: 500 });
    await showCompactTool(page, "Content");
    const editorPane = page.locator(".editor-pane");
    await assertVisibleEditorControlsFit(editorPane, "compact editor");
    const compactColumnTracks = await page.getByText("COLUMN 1").evaluate((element) => {
      const columnSection = element.closest("section");
      const grid = columnSection?.parentElement;
      return grid ? getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length : 0;
    });
    assert.equal(compactColumnTracks, 1, "compact editor should stack authored columns for readable editing");
    const compactEditorScreenshotPath = path.join(outputDir, "compact-editor-workspace.png");
    await page.screenshot({ path: compactEditorScreenshotPath, fullPage: false });
    const resizeHandle = page.getByRole("separator", { name: "Resize authoring tools" });
    const resizeHandleBox = await resizeHandle.boundingBox();
    assert(resizeHandleBox, "compact workspace should expose a tool-dock resize handle");
    const dockWidthBeforeDrag = (await page.locator(".workspace-tool-dock").boundingBox())?.width ?? 0;
    await page.mouse.move(resizeHandleBox.x + resizeHandleBox.width / 2, resizeHandleBox.y + 80);
    await page.mouse.down();
    await page.mouse.move(resizeHandleBox.x + resizeHandleBox.width / 2 + 32, resizeHandleBox.y + 80);
    await page.mouse.up();
    const dockWidthAfterDrag = (await page.locator(".workspace-tool-dock").boundingBox())?.width ?? 0;
    assert(dockWidthAfterDrag > dockWidthBeforeDrag, "dragging the compact separator should widen the authoring dock");
    await resizeHandle.focus();
    await resizeHandle.press("ArrowLeft");
    const dockWidthAfterKeyboard = (await page.locator(".workspace-tool-dock").boundingBox())?.width ?? 0;
    assert(dockWidthAfterKeyboard < dockWidthAfterDrag, "ArrowLeft should narrow the focused authoring dock");
    await page.getByText("Text block 1", { exact: false }).click();
    await showCompactTool(page, "Settings");
    await inspector.getByText("Text 1").waitFor();
    await assertVisibleInspectorControlsFit(inspector, "compact text");

    await showCompactTool(page, "Content");
    await page.getByText("Answer space 5", { exact: false }).click();
    await showCompactTool(page, "Settings");
    await inspector.getByText("Space 5").waitFor();
    await inspector.locator("input[aria-label='Space 5 lines']").fill("7");
    await inspector.getByText("7 lines").waitFor();
    await assertVisibleInspectorControlsFit(inspector, "compact space");

    await showCompactTool(page, "Content");
    await page.getByText("Choice list 2", { exact: false }).click();
    await showCompactTool(page, "Settings");
    await inspector.getByText("Choices 2").waitFor();
    await inspector.locator("select[aria-label='Choices 2 labels']").selectOption("lower-alpha");
    await inspector.getByText("3 a, b, c choices", { exact: false }).waitFor();
    await assertVisibleInspectorControlsFit(inspector, "compact choices");

    await showCompactTool(page, "Content");
    await page.getByText("Table block 3", { exact: false }).click();
    await showCompactTool(page, "Settings");
    await inspector.getByText("Table 3").waitFor();
    await inspector.locator("input[aria-label='Table 3 rows']").fill("4");
    await inspector.getByText("4 rows, 2 columns").waitFor();
    await assertVisibleInspectorControlsFit(inspector, "compact table");

    await showCompactTool(page, "Content");
    await partColumnsNode.dispatchEvent("pointerdown");
    await showCompactTool(page, "Settings");
    await inspector.getByText("Part columns 1").waitFor();
    await inspector.locator("select[aria-label='Part columns 1 layout']").selectOption("2");
    await inspector.getByText("2 columns, 3 modules").waitFor();
    await assertVisibleInspectorControlsFit(inspector, "compact columns");
    assertInspectorInCompactToolDock(await inspectorMetrics(inspector), "compact inspector dock");

    const compactInspectorScreenshotPath = path.join(outputDir, "compact-inspector.png");
    if (!BASIC_BLOCKS_ONLY && diagramPanelElement) {
      await showCompactTool(page, "Content");
      await page.getByText("Diagram block 4", { exact: false }).dispatchEvent("pointerdown");
      await showCompactTool(page, "Settings");
      await inspector.getByText("Diagram 4").waitFor();
      const compactInspectorMetrics = await inspectorMetrics(inspector);
      assert.equal(compactInspectorMetrics.placement, "inline", "compact editor should keep inline inspector placement");
      assertInspectorInCompactToolDock(compactInspectorMetrics, "compact inspector dock");
      await exerciseDiagramInspectorCycle(page, inspector, diagramPanelElement, "Diagram 4", "compact", outputDir);
      await selectDiagramType(page, inspector, "Diagram 4", "statsChart", "Chart settings");
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
    }
    await inspector.screenshot({ path: compactInspectorScreenshotPath });
    const compactWorkspaceScreenshotPath = path.join(outputDir, "compact-workspace.png");
    await page.screenshot({ path: compactWorkspaceScreenshotPath, fullPage: false });

    await page.setViewportSize({ width: 760, height: 640 });
    await showCompactTool(page, "Settings");
    assertInspectorInOverlayToolDock(await inspectorMetrics(inspector), "narrow inspector overlay");
    await assertVisibleInspectorControlsFit(inspector, "narrow inspector overlay");
    const overlayWorkspaceScreenshotPath = path.join(outputDir, "overlay-workspace.png");
    await page.screenshot({ path: overlayWorkspaceScreenshotPath, fullPage: false });

    await showCompactTool(page, "Content");
    await nestedTableNode.dispatchEvent("pointerdown");
    await showCompactTool(page, "Settings");
    await inspector.getByText("Part Column 1 table 2").waitFor();
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })));
    await nestedTableNode.waitFor({ state: "detached" });
    await inspector.getByText("Part columns 1").waitFor();
    assert.equal(
      await page.locator(`.editor-pane [data-scroll-anchor="${nestedTableAnchor}"]`).count(),
      0,
      "Delete should remove nested table",
    );

    const coverage = BASIC_BLOCKS_ONLY
      ? "text, space, columns, choices, and tables"
      : "text, space, columns, choices, tables, and every diagram type";
    console.log(
      `Content and Settings workspace smoke passed. Grid columns: ${gridColumns}. Column one width: ${columnOne.width}px. Settings covered ${coverage} in wide, compact, and overlay layouts, then deleted a nested table. Screenshot: ${screenshotPath}. Settings screenshot: ${inspectorScreenshotPath}. Compact content: ${compactEditorScreenshotPath}. Compact workspace: ${compactWorkspaceScreenshotPath}. Overlay workspace: ${overlayWorkspaceScreenshotPath}`,
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
      { cause: error },
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
