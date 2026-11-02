import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";

for (const width of [1440, 900]) {
  test(`truncated columns stop at the axis in preview and both print copies at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const draft = assessment(1);
    draft.questions[0].contentBlocks = [
      { lower: 60, upper: 110, values: [80, 100] },
      { lower: 100, upper: 160, values: [120, 150] },
    ].map(({ lower, upper, values }, index) => ({
      id: `columns-${index}`,
      kind: "diagram",
      graphConfig: {
        type: "statsChart",
        data: {
          chartType: "blankAxes",
          range: [0, 3],
          yRange: [lower, upper],
          xLabel: "Group",
          yLabel: "Count",
          series: [{ id: "counts", seriesType: "bars", xValues: [1, 2], yValues: values, barWidth: 0.6, color: "#444444" }],
        },
        options: { widthPx: 380, heightPx: 190, showGrid: true, interactive: false },
      },
    }));
    await loadFixture(page, draft);

    async function checkColumns(root, phase) {
      const charts = root.locator('.a4-preview-stack .stats-chart-diagram[data-mauth-print-render-state="ready"]');
      await expect(charts).toHaveCount(2);
      for (const [index, chart] of (await charts.all()).entries()) {
        const probe = await chart.evaluate((element) => {
          const graph = element.querySelector(".js-plotly-plot");
          const layout = graph._fullLayout;
          const frame = element.getBoundingClientRect();
          const box = graph.getBoundingClientRect();
          const scale = box.width / layout.width;
          return {
            width: frame.width,
            height: frame.height,
            x: box.x - frame.x + (layout._size.l + layout.xaxis.l2p(1)) * scale,
            y: box.y - frame.y + (layout._size.t + layout._size.h) * scale,
            values: Array.from(graph.data[0].y),
            lower: layout.yaxis.range[0],
          };
        });
        expect(probe.values).toEqual(index === 0 ? [80, 100] : [120, 150]);
        expect(probe.lower).toBe(index === 0 ? 60 : 100);
        const png = await chart.screenshot({ path: info.outputPath(`${phase}-${index}.png`) });
        const pixels = await page.evaluate(
          async ({ src, probe }) => {
            const image = new Image();
            image.src = src;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(image, 0, 0);
            const scaleX = image.width / probe.width;
            const scaleY = image.height / probe.height;
            function greyPixels(top, rows) {
              const left = Math.round((probe.x - 8) * scaleX);
              const y = Math.round((probe.y + top) * scaleY);
              const rgba = ctx.getImageData(left, y, Math.round(17 * scaleX), Math.round(rows * scaleY)).data;
              let count = 0;
              for (let i = 0; i < rgba.length; i += 4) {
                if ([rgba[i], rgba[i + 1], rgba[i + 2]].every((channel) => channel >= 66 && channel <= 70)) count += 1;
              }
              return count;
            }
            return { above: greyPixels(-6, 2), below: greyPixels(3, 5) };
          },
          { src: `data:image/png;base64,${png.toString("base64")}`, probe },
        );
        expect(pixels.above, `${phase}: a visible column must reach the baseline`).toBeGreaterThan(12);
        expect(pixels.below, `${phase}: column fill must not extend below the baseline`).toBeLessThan(8);
      }
    }

    await checkColumns(page.locator(".preview-pane"), "preview");
    await page.evaluate(() => {
      window.print = () => (window.__barsPrinted = true);
    });
    for (const copy of ["student", "solutions"]) {
      if (copy === "solutions") await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
      await page.evaluate(() => (window.__barsPrinted = false));
      await page.getByRole("button", { name: /^Print mode/ }).click();
      await page.waitForFunction(() => window.__barsPrinted);
      await page.emulateMedia({ media: "print" });
      await checkColumns(page.locator(".print-preview-stage"), copy);
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    }
    expect(errors).toEqual([]);
  });
}
