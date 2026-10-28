import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";

for (const width of [1440, 900]) {
  test(`chart headings clear axis numbers in preview and both print copies at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const draft = assessment(2);
    draft.questions.forEach((question, index) => {
      question.contentBlocks = [
        {
          id: `chart-${index}`,
          kind: "diagram",
          graphConfig: {
            type: "statsChart",
            widthPx: 460,
            heightPx: 300,
            data: {
              chartType: "histogram",
              dataMode: "manualProbabilities",
              xValues: [1, 2, 3],
              probabilities: [0.2, 0.5, 0.3],
              yMax: 0.6,
              xLabel: "$X$",
              yLabel: "$P(X=x)$",
              yLabelOrientation: "horizontal",
              ...(index === 0 ? { title: "Probability distribution" } : {}),
            },
          },
        },
      ];
    });
    await loadFixture(page, draft);
    async function checkCharts(root) {
      const charts = root.locator('.stats-chart-diagram[data-mauth-print-render-state="ready"]').filter({ visible: true });
      await expect(charts).toHaveCount(2);
      for (const chart of await charts.all()) {
        const frame = await chart.boundingBox();
        const label = await chart.locator('[data-mauth-label-text="$P(X=x)$"] svg').first().boundingBox();
        const ticks = await chart.locator(".ytick text").evaluateAll((nodes) =>
          nodes.map((node) => {
            const b = node.getBoundingClientRect();
            return { x: b.x, y: b.y, width: b.width, height: b.height };
          }),
        );
        expect(ticks.length).toBeGreaterThan(0);
        expect(label.x).toBeGreaterThanOrEqual(frame.x);
        expect(label.y).toBeGreaterThanOrEqual(frame.y);
        expect(label.y + label.height).toBeLessThan(Math.min(...ticks.map((tick) => tick.y)));
      }
    }
    await checkCharts(page.locator(".preview-pane"));
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
      const stage = page.locator(".print-preview-stage");
      await checkCharts(stage);
      await stage
        .locator(".a4-page")
        .filter({ visible: true })
        .first()
        .screenshot({ path: info.outputPath(`${solutions ? "solutions" : "student"}-chart.png`) });
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    }
  });
}
