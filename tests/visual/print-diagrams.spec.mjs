import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";
import { renderGeometricConstructionDiagram } from "../../packages/diagram-penrose/src/index.mjs";

test("print preserves solution Venn diagrams and hides graph construction points", async ({ page }, testInfo) => {
  const fixture = assessment(1);
  fixture.questions[0].contentBlocks = [
    { id: "working", kind: "space", lines: 10, visibility: "student" },
    {
      id: "venn",
      kind: "diagram",
      visibility: "solution",
      solutionOnly: true,
      graphConfig: {
        type: "setDiagram",
        data: {
          setCount: 2,
          universe: { name: "U", label: "U", countLabel: "90" },
          sets: [
            { name: "M", label: "M", countLabel: "50" },
            { name: "D", label: "D", countLabel: "36" },
          ],
          regions: [
            { name: "onlyA", label: "32" },
            { name: "intersection", label: "18" },
            { name: "onlyB", label: "18" },
            { name: "outside", label: "22" },
          ],
        },
      },
    },
    {
      id: "dots",
      kind: "diagram",
      graphConfig: {
        type: "graph2d",
        functions: [],
        xMin: 20,
        xMax: 30,
        yMin: -0.8,
        yMax: 2.3,
        widthPx: 600,
        heightPx: 180,
        showAxes: true,
        showAxisLabels: false,
        showAxisNumbers: true,
        showYAxisNumbers: false,
        showGrid: false,
        gridMajorStep: 1,
        features: [21, 22, 22, 23, 24, 24, 24, 25, 26, 29].map((x, i, a) => ({
          id: `dot-${i}`,
          kind: "point",
          x,
          y: 0.5 * (a.slice(0, i).filter((v) => v === x).length + 1),
          show: true,
          labelMode: "none",
          color: "#111111",
        })),
      },
    },
  ];
  await loadFixture(page, fixture);
  await page.route("**/api/diagram/penrose", async (route) => {
    const spec = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({ json: await renderGeometricConstructionDiagram(spec) });
  });
  await page.reload();
  await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
  await page.evaluate(() => {
    window.print = () => {
      window.__printed = true;
    };
  });
  await page.getByRole("button", { name: /^Print mode/ }).click();
  await page.waitForFunction(() => window.__printed);
  await page.emulateMedia({ media: "print" });
  const stage = page.locator(".print-preview-stage");
  await expect(stage.locator('.penrose-diagram[data-mauth-print-render-state="ready"] svg')).toBeVisible();
  const hidden = stage.locator('[id^="jxg-"] svg [visibility="hidden"], [id^="jxg-"] svg [style*="hidden"]');
  expect(await hidden.count()).toBeGreaterThan(0);
  expect(await hidden.evaluateAll((nodes) => nodes.every((n) => getComputedStyle(n).visibility === "hidden"))).toBe(true);
  expect(
    await stage
      .locator('[id^="jxg-"] > svg ellipse')
      .evaluateAll(
        (nodes) => nodes.filter((n) => getComputedStyle(n).display !== "none" && getComputedStyle(n).visibility !== "hidden").length,
      ),
  ).toBe(10);
  await page.pdf({ path: testInfo.outputPath("solutions.pdf"), preferCSSPageSize: true, printBackground: true });
});

test("shared Venn prints blank answer regions and total badges only in Student mode", async ({ page }) => {
  const fixture = assessment(1);
  fixture.questions[0].contentBlocks = [
    {
      id: "venn",
      kind: "diagram",
      graphConfig: {
        type: "setDiagram",
        data: {
          setCount: 2,
          totalsSolutionOnly: true,
          universe: { name: "U", label: "U", countLabel: "90" },
          sets: [
            { name: "M", label: "M", countLabel: "50" },
            { name: "D", label: "D", countLabel: "36" },
          ],
          regions: [
            { name: "onlyA", label: "32", solutionOnly: true },
            { name: "intersection", label: "18", solutionOnly: true },
            { name: "onlyB", label: "18", solutionOnly: true },
            { name: "outside", label: "22", solutionOnly: true },
          ],
        },
      },
    },
  ];
  await loadFixture(page, fixture);
  await page.route("**/api/diagram/penrose", async (route) =>
    route.fulfill({ json: await renderGeometricConstructionDiagram(route.request().postDataJSON()) }),
  );
  await page.reload();
  for (const solutions of [false, true]) {
    if (solutions) await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
    await page.evaluate(() => {
      window.__printed = false;
      window.print = () => {
        window.__printed = true;
      };
    });
    await page.getByRole("button", { name: /^Print mode/ }).click();
    await page.waitForFunction(() => window.__printed);
    await page.emulateMedia({ media: "print" });
    const diagram = page.locator(".print-preview-stage .penrose-diagram");
    await expect(diagram.locator('[data-role="set-count-badge"]')).toHaveCount(3);
    await expect(diagram.locator("svg > circle")).toHaveCount(2);
    const text = await diagram.textContent();
    if (!solutions) expect(await diagram.locator("svg > text").allTextContents()).toEqual(["U", "M", "D", "", "", "", ""]);
    for (const label of ["U", "M", "D"]) expect(text).toContain(label);
    for (const number of ["90", "50", "36", "32", "18", "22"]) expect(text.includes(number)).toBe(solutions);
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  }
});
