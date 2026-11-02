import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";
import { renderGeometricConstructionDiagram } from "../../packages/diagram-penrose/src/index.mjs";

const readDraft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mauth-studio.current-draft.v1")));
async function setup(page, draft) {
  await loadFixture(page, draft);
  await page.route("**/api/diagram/penrose", async (route) =>
    route.fulfill({ json: await renderGeometricConstructionDiagram(route.request().postDataJSON()) }),
  );
  await page.reload();
  await expect(page).toHaveTitle(/Mauth/);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await expect(page.locator(".preview-pane .penrose-diagram")).toHaveAttribute("data-mauth-print-render-state", "ready");
}

for (const width of [1440, 900]) {
  test(`attached diagram titles and captions edit, persist and print at ${width}px`, async ({ page, browser }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const draft = assessment(4);
    const plots = ["A", "B"].map((name, i) => ({
      id: `plot-${name}`,
      kind: "diagram",
      graphConfig: {
        type: "statsChart",
        title: `Plot ${name}`,
        caption: `Figure $${i + 1}$`,
        data: {
          chartType: "blankAxes",
          title: "Legacy title must not duplicate",
          range: [0, 5],
          yRange: [0, 10],
          xLabel: "Age (years)",
          yLabel: "Value",
          series: [
            { id: "observations", seriesType: "points", xValues: [1, 2, 3], yValues: [8, 6, 4] },
            { id: "answer", seriesType: "line", xValues: [0, 4], yValues: [10, 2], solutionOnly: true },
          ],
        },
        options: { widthPx: 300, heightPx: 220, interactive: false },
      },
    }));
    draft.questions[0].contentBlocks = [{ id: "paired", kind: "columns", columns: plots.map((plot) => [plot]) }];
    const graph = structuredClone(draft.questions[1].contentBlocks.find((b) => b.kind === "diagram"));
    graph.graphConfig.title =
      "A longer centred title that wraps naturally within the width of this coordinate graph rather than stretching the drawing";
    graph.graphConfig.caption = "Diagram $\\frac{1}{2}$: <literal text>";
    graph.graphConfig.widthPx = 320;
    draft.questions[1].contentBlocks = [graph];
    draft.questions[2].contentBlocks = [
      {
        id: "sets",
        kind: "diagram",
        graphConfig: {
          type: "setDiagram",
          title: "Two sets",
          caption: "Diagram $(c)$",
          data: { setCount: 2, sets: [{ name: "A" }, { name: "B" }], regions: [] },
          options: { scalePercent: 70 },
        },
      },
    ];
    draft.questions[3].contentBlocks = [draft.questions[3].contentBlocks.find((b) => b.kind === "diagram")];
    await setup(page, draft);
    const preview = page.locator(".preview-pane .a4-preview-stack");
    await expect(preview.locator(".test-diagram-figure")).toHaveCount(4);
    // Pagination placeholders need an intrinsic width too; a percentage-only
    // child collapses a shrink-wrapped figure and makes its title wrap vertically.
    const measuredWidths = await page
      .locator(".preview-pane .a4-measure .test-diagram-figure")
      .evaluateAll((nodes) => nodes.slice(0, 2).map((node) => node.clientWidth));
    expect(measuredWidths).toEqual([300, 300]);
    await expect(preview).not.toContainText("Legacy title must not duplicate");
    const originalData = await readDraft(page).then((d) => d.questions[0].contentBlocks[0].columns[0][0].graphConfig.data);
    await page.getByRole("button", { name: /^Question 1\. Click/ }).dblclick();
    const content = page.getByRole("tab", { name: "Content", exact: true });
    if (await content.isVisible()) await content.click();
    await expect(page.getByText("Data values", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Plotted series", { exact: true })).toHaveCount(2);
    const title = page.getByRole("textbox", { name: "Column 1 diagram 1 title above", exact: true });
    const caption = page.getByRole("textbox", { name: "Column 1 diagram 1 caption below", exact: true });
    await title.fill("Plot A: revised $x$");
    await caption.fill("Figure $\\alpha$");
    await expect
      .poll(async () => (await readDraft(page)).questions[0].contentBlocks[0].columns[0][0].graphConfig.caption)
      .toBe("Figure $\\alpha$");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(caption).toHaveValue("Figure $1$");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(caption).toHaveValue("Figure $\\alpha$");
    await title.fill("");
    await expect(preview.locator(".test-diagram-figure").first().locator(".test-diagram-title")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(title).toHaveValue("Plot A: revised $x$");
    const saved = await readDraft(page);
    expect(saved.questions[0].contentBlocks[0].columns[0][0].graphConfig.data).toMatchObject({ ...originalData, title: "" });
    async function checkFigures(root) {
      const figures = root.locator(".test-diagram-figure");
      await expect(figures).toHaveCount(4);
      await expect(figures.locator(".test-diagram-title")).toHaveCount(4);
      await expect(figures.locator(".test-diagram-caption")).toHaveCount(4);
      const measurements = await figures.evaluateAll((nodes) =>
        nodes.map((figure) => {
          const title = figure.querySelector(".test-diagram-title");
          const caption = figure.querySelector(".test-diagram-caption");
          const drawing = [...figure.children].find((child) => child !== title && child !== caption);
          const box = (element) => {
            const r = element.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom };
          };
          return {
            figure: box(figure),
            title: box(title),
            caption: box(caption),
            drawing: box(drawing),
            align: getComputedStyle(title).textAlign,
          };
        }),
      );
      for (const item of measurements) {
        expect(item.align).toBe("center");
        expect(item.title.bottom).toBeLessThanOrEqual(item.drawing.y + 1);
        expect(item.caption.y).toBeGreaterThanOrEqual(item.drawing.bottom - 1);
        expect(Math.abs(item.figure.x + item.figure.width / 2 - item.drawing.x - item.drawing.width / 2)).toBeLessThan(1);
        expect(item.title.width).toBeLessThanOrEqual(item.figure.width + 1);
      }
      expect(measurements[2].title.height).toBeGreaterThan(measurements[0].title.height);
      for (const key of ["y", "height", "bottom"])
        expect(Math.abs(measurements[0].drawing[key] - measurements[1].drawing[key])).toBeLessThan(1);
      await expect(figures.nth(2).locator(".test-diagram-caption mjx-container svg")).toHaveCount(1);
      await expect(figures.nth(2).locator(".test-diagram-caption")).toContainText("<literal text>");
    }
    await checkFigures(preview);
    await page.evaluate(() => {
      window.print = () => (window.__figurePrinted = true);
    });
    for (const copy of ["student", "solutions"]) {
      if (copy === "solutions") await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
      await page.evaluate(() => (window.__figurePrinted = false));
      await page.getByRole("button", { name: /^Print mode/ }).click();
      await page.waitForFunction(() => window.__figurePrinted);
      await page.emulateMedia({ media: "print" });
      const stage = page.locator(".print-preview-stage .a4-preview-stack");
      await checkFigures(stage);
      await stage
        .locator(".a4-page")
        .first()
        .screenshot({ path: info.outputPath(`${copy}-titles.png`) });
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    }
    const context = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: { width, height: 1000 } });
    const reopened = await context.newPage();
    await setup(reopened, saved);
    await expect(reopened.locator(".preview-pane .a4-preview-stack .test-diagram-title").first()).toContainText("Plot A: revised");
    expect((await readDraft(reopened)).questions).toEqual(saved.questions);
    await context.close();
    expect(errors).toEqual([]);
  });
}
