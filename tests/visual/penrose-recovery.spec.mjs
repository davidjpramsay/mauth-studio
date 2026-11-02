import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { assessment, loadFixture } from "./fixtures.mjs";
import { renderGeometricConstructionDiagram } from "../../packages/diagram-penrose/src/index.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../../packages/diagram-penrose/fixtures/diameter-circle.json", import.meta.url)));
const rendered = await renderGeometricConstructionDiagram(fixture.student);
const diagramFor = (page) => page.locator(".preview-pane .penrose-diagram").first();
const alertFor = (page) => page.locator('.preview-pane [data-mauth-print-render-state="error"]');
const configFor = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("mauth-studio.current-draft.v1")).questions[0].contentBlocks[0].graphConfig);

async function setup(page, handler) {
  const draft = assessment(1);
  draft.questions[0].text = "AB is a diameter with centre O. C lies on the circle and AC=BC. AB=8 cm.";
  const config = structuredClone(fixture.student);
  config.options.labelOffsets = { "O.labelText": [6, -3], "diameter.text": [0, 7] };
  draft.questions[0].contentBlocks = [{ id: "circle", kind: "diagram", graphConfig: config }];
  await loadFixture(page, draft);
  await page.route("**/api/diagram/penrose", handler);
  await page.reload();
  await expect(page).toHaveTitle(/Mauth/);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  return config;
}

for (const width of [1440, 900]) {
  test(`timeout recovery retries the same circle and preserves labels at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const requests = [];
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const config = await setup(page, async (route) => {
      requests.push(route.request().postDataJSON());
      if (requests.length <= 2) {
        await route.fulfill({
          status: 504,
          json: {
            detail: { code: "PENROSE_RENDER_TIMEOUT", message: "Geometry rendering timed out. Retry to render the same construction." },
          },
        });
      } else await route.fulfill({ json: rendered });
    });
    await expect(alertFor(page)).toContainText("Geometry rendering timed out");
    expect(requests).toHaveLength(2);
    await expect(diagramFor(page)).toHaveCount(0);
    await alertFor(page).getByRole("button", { name: "Retry diagram", exact: true }).click();
    await expect(diagramFor(page)).toHaveAttribute("data-mauth-print-render-state", "ready");
    expect(requests).toHaveLength(3);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[2]).toEqual(requests[0]);
    const saved = await configFor(page);
    expect(saved.options).toEqual(config.options);
    expect(saved.data).toEqual(config.data);
    await expect(diagramFor(page).getByRole("button", { name: "Move label C", exact: true })).toBeVisible();
    const points = await diagramFor(page)
      .locator("circle")
      .evaluateAll((nodes) =>
        Object.fromEntries(
          nodes.map((node) => [
            node.querySelector("title")?.textContent,
            [Number(node.getAttribute("cx")), Number(node.getAttribute("cy"))],
          ]),
        ),
      );
    const [A, B, C, O] = ["A", "B", "C", "O"].map((id) => points[`\`${id}\`.dot`]);
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    expect(Math.abs(distance(A, O) - distance(C, O))).toBeLessThan(0.001);
    expect(Math.abs(distance(A, C) - distance(B, C))).toBeLessThan(0.001);
    expect(C[1]).toBeLessThan(O[1]);
    await diagramFor(page).screenshot({ path: info.outputPath(`recovered-circle-${width}.png`) });
    await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
    await expect(diagramFor(page)).toHaveAttribute("data-mauth-print-render-state", "ready");
    await page.evaluate(() => {
      window.__recoveryPrinted = false;
      window.print = () => {
        window.__recoveryPrinted = true;
      };
    });
    await page.getByRole("button", { name: /^Print mode/ }).click();
    await page.waitForFunction(() => window.__recoveryPrinted);
    await expect(page.locator(".print-preview-stage .penrose-diagram").first()).toHaveAttribute("data-mauth-print-render-state", "ready");
    expect(errors).toEqual([]);
  });
}

test("a temporary network failure recovers automatically without document edits", async ({ page }) => {
  const requests = [];
  const config = await setup(page, async (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) await route.abort("failed");
    else await route.fulfill({ json: rendered });
  });
  await expect(diagramFor(page)).toHaveAttribute("data-mauth-print-render-state", "ready");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect((await configFor(page)).options).toEqual(config.options);
});

test("constraint failures are not automatically retried and remain blocked from printing", async ({ page }) => {
  let calls = 0;
  await setup(page, async (route) => {
    calls++;
    await route.fulfill({ status: 500, json: { detail: "No layout satisfying the geometry constraints could be found." } });
  });
  await expect(alertFor(page)).toContainText("No valid geometry layout was found");
  await page.waitForTimeout(900);
  expect(calls).toBe(1);
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

test("changing construction cancels a pending automatic retry", async ({ page }) => {
  let fail = false;
  const requests = [];
  await setup(page, async (route) => {
    requests.push(route.request().postDataJSON());
    if (fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        json: { detail: { code: "PENROSE_RENDER_BUSY", message: "The diagram renderer is busy. Retry shortly." } },
      });
    } else await route.fulfill({ json: rendered });
  });
  await expect(diagramFor(page)).toHaveAttribute("data-mauth-print-render-state", "ready");
  await page.getByRole("button", { name: /^Question 1\. Click/ }).dblclick();
  await page.getByRole("button", { name: "Edit Diagram block 1 settings", exact: true }).click();
  const resample = page.locator("#mauth-inspector-pane").getByRole("button", { name: "Resample", exact: true });
  fail = true;
  await resample.click();
  await expect.poll(() => requests.length).toBe(2);
  await resample.click();
  await expect(diagramFor(page)).toHaveAttribute("data-mauth-print-render-state", "ready");
  await page.waitForTimeout(900);
  expect(requests).toHaveLength(3);
  expect(requests[2].options.variation).not.toBe(requests[1].options.variation);
  expect((await configFor(page)).options.variation).toBe(requests[2].options.variation);
});
