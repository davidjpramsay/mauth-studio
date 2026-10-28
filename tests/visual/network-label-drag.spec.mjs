import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { assessment, loadFixture } from "./fixtures.mjs";
import { expectLabelDragFeedback, expectLabelDragFinished } from "./label-drag-feedback.mjs";
import { renderGeometricConstructionDiagram } from "../../packages/diagram-penrose/src/index.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../../packages/diagram-penrose/fixtures/weighted-network.json", import.meta.url)));
const readDraft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mauth-studio.current-draft.v1")));
const configFor = async (page) => (await readDraft(page)).questions[0].contentBlocks[0].graphConfig;
const diagramFor = (page) => page.locator(".preview-pane .a4-page .penrose-diagram").filter({ visible: true }).first();
const labelFor = (diagram, id) => diagram.locator(`[data-mauth-penrose-label="${id}"]`);

async function setup(page, draft) {
  await loadFixture(page, draft);
  const requests = [];
  const pending = [];
  const responses = [];
  await page.route("**/api/diagram/penrose", async (route) => {
    const spec = route.request().postDataJSON();
    requests.push(spec);
    await route.fulfill({ json: await renderGeometricConstructionDiagram(spec) });
  });
  await page.route("**/api/agent/current/browser/requests?**", (route) => route.fulfill({ json: { request: pending.shift() ?? null } }));
  await page.route("**/api/agent/current/browser/respond", async (route) => {
    responses.push(route.request().postDataJSON());
    await route.fulfill({ json: { success: true } });
  });
  await page.reload();
  await expect(page).toHaveTitle(/Mauth/);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await expect(diagramFor(page)).toHaveAttribute("data-mauth-print-render-state", "ready");
  return { requests, pending, responses };
}

async function dragInward(page, diagram, id) {
  const label = labelFor(diagram, id);
  const previous = (await configFor(page)).options.labelOffsets?.[id];
  await expect(label).toHaveAttribute("role", "button");
  await label.scrollIntoViewIfNeeded();
  const box = await label.boundingBox();
  const frame = await diagram.boundingBox();
  const dx = box.x + box.width / 2 < frame.x + frame.width / 2 ? 9 : -9;
  const dy = box.y + box.height / 2 < frame.y + frame.height / 2 ? 6 : -6;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
  await expectLabelDragFeedback(page, label);
  await page.mouse.up();
  await expectLabelDragFinished(page, label);
  await expect.poll(async () => (await configFor(page)).options.labelOffsets?.[id]).not.toEqual(previous);
  const moved = await label.boundingBox();
  expect(moved.x - box.x).toBeCloseTo(dx, 0);
  expect(moved.y - box.y).toBeCloseTo(dy, 0);
}

for (const width of [1440, 900]) {
  test(`network node, edge and loop labels drag independently and persist at ${width}px`, async ({ page, browser }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const original = { ...fixture, metadata: { custom: "retained" } };
    const draft = assessment(1);
    draft.questions[0].text = "Find the shortest route in this weighted network.";
    draft.questions[0].contentBlocks = [{ id: "network", kind: "diagram", graphConfig: original }];
    const { requests, pending, responses } = await setup(page, draft);
    const diagram = diagramFor(page);
    await expect(labelFor(diagram, "D.labelText")).toHaveCount(0);
    await expect(labelFor(diagram, "relationship_AD.text")).toHaveCount(0);
    const geometry = () => diagram.locator("circle, line, polygon, path").evaluateAll((nodes) => nodes.map((node) => node.outerHTML));
    const beforeGeometry = await geometry();
    const renderCount = requests.length;
    for (const id of ["A.labelText", "relationship_AB.text", "relationship_AA.text", "relationship_AB.text"])
      await dragInward(page, diagram, id);
    const moved = await configFor(page);
    expect(moved.data).toEqual(original.data);
    expect(moved.metadata).toEqual(original.metadata);
    expect(moved.options.variation).toBe(original.options.variation);
    expect(requests.length).toBe(renderCount);
    expect(await geometry()).toEqual(beforeGeometry);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(async () => (await configFor(page)).options.labelOffsets).not.toEqual(moved.options.labelOffsets);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect.poll(async () => (await configFor(page)).options.labelOffsets).toEqual(moved.options.labelOffsets);
    const label = labelFor(diagram, "relationship_AB.text");
    const at = await label.boundingBox();
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + at.width / 2 + 10, at.y + at.height / 2 + 7);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expectLabelDragFinished(page, label);
    expect(await configFor(page)).toEqual(moved);
    pending.push({
      requestId: "network-inspection",
      kind: "validation.run",
      payload: {
        inspectDiagrams: true,
        blockId: "network",
        requirements: { purpose: "network", draggableLabels: true },
      },
    });
    await expect.poll(() => responses.length).toBe(1);
    const inspection = responses[0].body.diagramInspections[0];
    expect(inspection.construction.schemaValid).toBe(true);
    expect(inspection.tool.selectedToolAssessment.eligible).toBe(true);
    expect(inspection.renderedLayout.labels.map((entry) => entry.id)).toContain("relationship_AB.text");
    await diagram.screenshot({ path: info.outputPath(`student-network-${width}.png`) });

    const context = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: { width, height: 1000 } });
    const reopened = await context.newPage();
    await setup(reopened, await readDraft(page));
    expect((await configFor(reopened)).options.labelOffsets).toEqual(moved.options.labelOffsets);
    await reopened.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
    const solution = diagramFor(reopened);
    await expect(labelFor(solution, "D.labelText")).toHaveAttribute("role", "button");
    await expect(labelFor(solution, "relationship_AB.text")).toHaveAttribute(
      "data-label-offset-x",
      String(moved.options.labelOffsets["relationship_AB.text"][0]),
    );
    await dragInward(reopened, solution, "relationship_AD.text");
    expect((await configFor(reopened)).data).toEqual(original.data);
    await solution.screenshot({ path: info.outputPath(`solutions-network-${width}.png`) });
    const transform = await labelFor(solution, "relationship_AD.text").getAttribute("transform");
    await reopened.evaluate(() => {
      window.__networkPrinted = false;
      window.print = () => (window.__networkPrinted = true);
    });
    await reopened.getByRole("button", { name: /^Print mode/ }).click();
    await reopened.waitForFunction(() => window.__networkPrinted);
    await expect(labelFor(reopened.locator(".print-preview-stage .penrose-diagram").first(), "relationship_AD.text")).toHaveAttribute(
      "transform",
      transform,
    );
    await reopened.emulateMedia({ media: "print" });
    await reopened.pdf({ path: info.outputPath("network-solutions.pdf"), preferCSSPageSize: true });
    await context.close();
    expect(errors).toEqual([]);
  });
}

test("Advanced network labels support keyboard movement and the shared reset control", async ({ page }) => {
  const draft = assessment(1);
  draft.questions[0].contentBlocks = [
    {
      id: "network",
      kind: "diagram",
      graphConfig: {
        type: "network",
        options: {
          variation: "advanced-network-labels",
          substanceSource:
            "Point A, B\nNamedSegment AB\nLengthLabel weight\nSegment(AB, A, B)\nLabel A $A$\nLabel B $B$\nLabel weight $4$\nLabelsSegment(weight, A, B)",
        },
      },
    },
  ];
  await setup(page, draft);
  const diagram = diagramFor(page);
  await dragInward(page, diagram, "weight.text");
  const label = labelFor(diagram, "weight.text");
  await label.focus();
  const before = (await configFor(page)).options.labelOffsets["weight.text"];
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await configFor(page)).options.labelOffsets["weight.text"][1]).toBeLessThan(before[1]);
  await expect(label).toHaveCSS("outline-style", "dashed");
  await page.keyboard.press("Home");
  await expect.poll(async () => (await configFor(page)).options.labelOffsets["weight.text"]).toEqual([0, 0]);
  await page.getByRole("button", { name: /^Question 1\. Click/ }).dblclick();
  const header = page
    .locator('[data-panel-region="header"]')
    .filter({ has: page.locator('[data-mauth-diagram-tool="network"]') })
    .first();
  await header.getByRole("button", { name: "Edit Diagram block 1 settings", exact: true }).click();
  await page.getByRole("button", { name: "Reset label positions", exact: true }).click();
  await expect.poll(async () => (await configFor(page)).options.labelOffsets).toBeUndefined();
  expect((await configFor(page)).options.substanceSource).toBe(draft.questions[0].contentBlocks[0].graphConfig.options.substanceSource);
});
