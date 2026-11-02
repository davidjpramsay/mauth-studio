import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";

const readDraft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mauth-studio.current-draft.v1")));

for (const width of [1440, 900]) {
  test(`axis labels change direction, persist, and fit both printed copies at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const draft = assessment(4);
    const examples = [
      { xLabel: "Age (years)", yLabel: "Value ($1000)" },
      { xLabel: "t", yLabel: "\\frac{1}{2}f(t)" },
      { xLabel: "$\\frac{n}{2}$", yLabel: "$P(X=n)$", xLabelOrientation: "vertical", yLabelOrientation: "horizontal" },
      { xLabel: "Distance (km)", yLabel: "Time (min)", yLabelOrientation: "horizontal" },
    ];
    draft.questions.forEach((question, index) => {
      question.contentBlocks = [
        {
          id: `chart-${index}`,
          kind: "diagram",
          graphConfig: {
            type: "statsChart",
            widthPx: 300,
            heightPx: 240,
            data: {
              chartType: "blankAxes",
              range: [0, 8],
              yRange: [0, 25],
              ...examples[index],
              series: [
                { id: "given", seriesType: "points", xValues: [1, 2, 3], yValues: [22, 19, 16] },
                { id: "answer", seriesType: "line", xValues: [0, 8], yValues: [25, 1], solutionOnly: true },
              ],
            },
          },
        },
      ];
    });
    await loadFixture(page, draft);
    await expect(page).toHaveTitle("Mauth Studio");
    await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
    const preview = page.locator(".preview-pane .a4-preview-stack");
    await expect(preview.locator('.stats-chart-diagram[data-mauth-print-render-state="ready"]')).toHaveCount(4);
    await page.getByRole("button", { name: /^Question 1\. Click/ }).dblclick();
    const content = page.getByRole("tab", { name: "Content", exact: true });
    if (await content.isVisible()) await content.click();
    await page.getByRole("button", { name: "Edit Diagram block 1 settings", exact: true }).click();
    const xControl = page.getByRole("combobox", { name: "Diagram 1 x-axis label orientation", exact: true });
    const yControl = page.getByRole("combobox", { name: "Diagram 1 y-axis label orientation", exact: true });
    await expect(xControl).toHaveValue("horizontal");
    await expect(yControl).toHaveValue("vertical");
    await xControl.selectOption("vertical");
    await yControl.selectOption("horizontal");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(yControl).toHaveValue("vertical");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(yControl).toHaveValue("horizontal");
    await expect
      .poll(async () => (await readDraft(page)).questions[0].contentBlocks[0].graphConfig.data.yLabelOrientation)
      .toBe("horizontal");
    const saved = await readDraft(page);
    const editedData = saved.questions[0].contentBlocks[0].graphConfig.data;
    expect(editedData.series).toMatchObject(draft.questions[0].contentBlocks[0].graphConfig.data.series);
    expect(editedData.range).toEqual([0, 8]);
    expect(editedData.yRange).toEqual([0, 25]);

    async function checkCharts(root, solutions = false) {
      const charts = root.locator('.stats-chart-diagram[data-mauth-print-render-state="ready"]');
      await expect(charts).toHaveCount(4);
      await expect(charts.first().locator('[data-mauth-axis-label="x"][data-mauth-label-orientation="vertical"]')).toHaveCount(1);
      await expect(charts.first().locator('[data-mauth-axis-label="y"][data-mauth-label-orientation="horizontal"]')).toHaveCount(1);
      await expect(charts.nth(1).locator('[data-mauth-axis-label="y"][data-mauth-label-orientation="vertical"] mjx-container')).toHaveCount(
        1,
      );
      await expect(charts.nth(2).locator('[data-mauth-axis-label="x"][data-mauth-label-orientation="vertical"] mjx-container')).toHaveCount(
        1,
      );
      for (const chart of await charts.all()) {
        await expect(chart.locator(".scatterlayer .trace")).toHaveCount(solutions ? 2 : 1);
        const frame = await chart.boundingBox();
        for (const label of await chart.locator("[data-mauth-axis-label]").all()) {
          const glyph = label.locator("span").first();
          const box = await glyph.boundingBox();
          expect(box.x).toBeGreaterThanOrEqual(frame.x - 1);
          expect(box.y).toBeGreaterThanOrEqual(frame.y - 1);
          expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
          expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
          const ticks = await chart.locator(".xtick text, .ytick text").evaluateAll((nodes) =>
            nodes.map((node) => {
              const r = node.getBoundingClientRect();
              return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
            }),
          );
          for (const tick of ticks) {
            const overlap =
              Math.min(box.x + box.width, tick.right) - Math.max(box.x, tick.x) > 1 &&
              Math.min(box.y + box.height, tick.bottom) - Math.max(box.y, tick.y) > 1;
            expect(overlap, JSON.stringify({ source: await label.getAttribute("data-mauth-label-text"), box, tick })).toBe(false);
          }
        }
      }
    }
    for (const [i, chart] of (await preview.locator(".stats-chart-diagram").all()).entries()) {
      await chart.screenshot({ path: info.outputPath(`preview-chart-${i}.png`) });
    }
    await checkCharts(preview);
    await preview
      .locator(".a4-page")
      .first()
      .screenshot({ path: info.outputPath("axis-labels-preview.png") });
    await page.evaluate(() => {
      window.print = () => {
        window.__axisPrinted = true;
      };
    });
    for (const solutions of [false, true]) {
      if (solutions) await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
      await page.evaluate(() => {
        window.__axisPrinted = false;
      });
      await page.getByRole("button", { name: /^Print mode/ }).click();
      await page.waitForFunction(() => window.__axisPrinted);
      await page.emulateMedia({ media: "print" });
      const stage = page.locator(".print-preview-stage .a4-preview-stack");
      await checkCharts(stage, solutions);
      await stage
        .locator(".a4-page")
        .first()
        .screenshot({ path: info.outputPath(`${solutions ? "solutions" : "student"}-axis-labels.png`) });
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    }
    await loadFixture(page, saved);
    await checkCharts(page.locator(".preview-pane .a4-preview-stack"));
    expect(errors).toEqual([]);
  });
}
