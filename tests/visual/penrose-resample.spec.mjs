import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { assessment, loadFixture } from "./fixtures.mjs";
import { renderGeometricConstructionDiagram } from "../../packages/diagram-penrose/src/index.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../../packages/diagram-penrose/fixtures/diameter-circle.json", import.meta.url)));
const diagramFor = (page) => page.locator(".preview-pane .a4-page .penrose-diagram").filter({ visible: true }).first();
const configFor = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("mauth-studio.current-draft.v1")).questions[0].contentBlocks[0].graphConfig);
async function verifyCircle(diagram) {
  await expect(diagram).toHaveAttribute("data-mauth-print-render-state", "ready");
  const geometry = await diagram
    .locator("circle")
    .evaluateAll((nodes) =>
      Object.fromEntries(
        nodes.map((node) => [node.querySelector("title")?.textContent, [Number(node.getAttribute("cx")), Number(node.getAttribute("cy"))]]),
      ),
    );
  const [A, B, C, O] = ["A", "B", "C", "O"].map((id) => geometry[`\`${id}\`.dot`]);
  const distance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const radius = distance(A, O);
  expect(radius).toBeGreaterThan(1);
  expect(distance(O, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]) / radius).toBeLessThan(0.001);
  expect(Math.abs(distance(B, O) - radius) / radius).toBeLessThan(0.001);
  expect(Math.abs(distance(C, O) - radius) / radius).toBeLessThan(0.001);
  expect(Math.abs(distance(A, C) - distance(B, C)) / radius).toBeLessThan(0.001);
  expect(Math.abs(A[1] - B[1]) / radius).toBeLessThan(0.001);
  expect(C[1]).toBeLessThan(O[1]);
  expect(A[0]).toBeLessThan(B[0]);
  return geometry;
}

async function setup(page, draft, responses = []) {
  await loadFixture(page, draft);
  await page.route("**/api/diagram/penrose", async (route) => {
    try {
      const spec = route.request().postDataJSON();
      const result = await renderGeometricConstructionDiagram(spec);
      responses.push({ spec, result });
      await route.fulfill({ json: result });
    } catch (error) {
      await route.fulfill({ status: 500, json: { detail: error.message } });
    }
  });
  await page.reload();
  await expect(page).toHaveTitle(/Mauth/);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
}

for (const width of [1440, 900]) {
  test(`Resample preserves circle relationships, teacher offsets and history at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const draft = assessment(1);
    draft.questions[0].text = "AB is a diameter with centre O. C lies on the circle and AC=BC. AB=8 cm.";
    const config = structuredClone(fixture.student);
    config.options.labelOffsets = { "O.labelText": [6, -3], "diameter.text": [0, 7] };
    draft.questions[0].contentBlocks = [
      { id: "circle", kind: "diagram", visibility: "student", graphConfig: config },
      { id: "circle-answer", kind: "diagram", visibility: "solution", graphConfig: fixture.solution },
    ];
    const responses = [];
    await setup(page, draft, responses);
    const original = await verifyCircle(diagramFor(page));
    await page.getByRole("button", { name: /^Question 1\. Click/ }).dblclick();
    const contentTab = page.getByRole("tab", { name: "Content", exact: true });
    if (await contentTab.isVisible()) await contentTab.click();
    const header = page
      .locator('[data-panel-region="header"]')
      .filter({ has: page.locator("[data-mauth-diagram-tool]") })
      .first();
    await header.getByRole("button", { name: "Edit Diagram block 1 settings", exact: true }).click();
    const inspector = page.locator("#mauth-inspector-pane");
    // Exercise the real control with a repeatable seed known to violate circle
    // membership in the previous renderer. No request or construction is replaced.
    await page.evaluate(() => {
      window.__resampleOriginalClock = Date.now;
      window.__resampleOriginalRandom = Math.random;
      Date.now = () => 1793158949000;
      Math.random = () => 0.25;
    });
    await inspector.getByRole("button", { name: "Resample", exact: true }).click();
    await page.evaluate(() => {
      Date.now = window.__resampleOriginalClock;
      Math.random = window.__resampleOriginalRandom;
    });
    await expect.poll(async () => (await configFor(page)).options.variation).toBe("penrose-layout-1793158949000-9");
    const resampled = await verifyCircle(diagramFor(page));
    expect(resampled).not.toEqual(original);
    const accepted = responses.find(({ spec }) => spec.options.variation === "penrose-layout-1793158949000-9");
    expect(accepted.result.metadata.constraintValidation.attempts).toBeGreaterThan(1);
    const saved = await configFor(page);
    expect(saved.options.substanceSource).toBe(config.options.substanceSource);
    expect(saved.options.labelOffsets).toEqual(config.options.labelOffsets);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(async () => (await configFor(page)).options.variation).toBe(config.options.variation);
    expect(await verifyCircle(diagramFor(page))).toEqual(original);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect.poll(async () => (await configFor(page)).options.variation).toBe(saved.options.variation);
    expect(await verifyCircle(diagramFor(page))).toEqual(resampled);
    await inspector.getByRole("button", { name: "Content", exact: true }).click();
    await page.getByRole("button", { name: /^Question 1\. Click/ }).dblclick();
    await diagramFor(page).screenshot({ path: info.outputPath(`resampled-student-${width}.png`) });
    await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
    await verifyCircle(diagramFor(page));
    await page.evaluate(() => {
      window.__resamplePrinted = false;
      window.print = () => {
        window.__resamplePrinted = true;
      };
    });
    await page.getByRole("button", { name: /^Print mode/ }).click();
    await page.waitForFunction(() => window.__resamplePrinted);
    await verifyCircle(page.locator(".print-preview-stage .penrose-diagram").first());
    await page.emulateMedia({ media: "print" });
    await page.pdf({ path: info.outputPath("resampled-solutions.pdf"), preferCSSPageSize: true });
    expect(errors).toEqual([]);
  });
}

test("an impossible construction shows an actionable error and never becomes print-ready", async ({ page }) => {
  const draft = assessment(1);
  draft.questions[0].contentBlocks = [
    {
      id: "impossible",
      kind: "diagram",
      graphConfig: {
        type: "geometricConstruction",
        options: { substanceSource: "Point A, B\nHorizontal(A, B)\nHorizontal(B, A)", variation: "contradictory" },
      },
    },
  ];
  await setup(page, draft);
  await expect(page.locator('.preview-pane [data-mauth-print-render-state="error"]')).toContainText("No valid geometry layout was found");
  await expect(page.locator('.preview-pane .penrose-diagram[data-mauth-print-render-state="ready"]')).toHaveCount(0);
  await page.evaluate(() => {
    window.__invalidPrinted = false;
    window.print = () => {
      window.__invalidPrinted = true;
    };
  });
  await page.getByRole("button", { name: /^Print mode/ }).click();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__invalidPrinted)).toBe(false);
});
