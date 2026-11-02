import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";

test("disposed 2D, vector and 3D boards stop handling print-media changes", async ({ page }, info) => {
  await page.addInitScript(() => {
    const matchMedia = window.matchMedia.bind(window);
    window.__printQueries = [];
    window.matchMedia = (query) => {
      const result = matchMedia(query);
      // Keep real media-query objects alive across board disposal, as can happen
      // while the browser queues print events. Deliver those events below.
      if (query === "print" || query === "screen") window.__printQueries.push(result);
      return result;
    };
  });
  const draft = assessment(1);
  const common = { widthPx: 380, heightPx: 180, xMin: -2, xMax: 6, yMin: -2, yMax: 6, showAxes: false, showGrid: false };
  draft.questions[0].contentBlocks = [
    {
      id: "function",
      kind: "diagram",
      graphConfig: {
        ...common,
        type: "graph2d",
        functions: [{ expression: "x", show: true }],
        features: [{ id: "answer", kind: "point", x: 2, y: 3, label: "P", solutionOnly: true }],
      },
    },
    {
      id: "vector",
      kind: "diagram",
      graphConfig: {
        ...common,
        type: "vector2d",
        metadata: {
          vector2d: {
            vectors: [
              { id: "a", name: "a", start: [0, 0], components: [3, 2] },
              { id: "b", name: "b", start: [0, 0], components: [1, -1], solutionOnly: true },
            ],
          },
        },
      },
    },
    {
      id: "spatial",
      kind: "diagram",
      graphConfig: {
        ...common,
        type: "graph3d",
        data: {
          points: [
            { id: "A", coords: [0, 0, 0] },
            { id: "B", coords: [2, 0, 1] },
            { id: "C", coords: [1, 2, 0], solutionOnly: true },
          ],
          segments: [{ from: "A", to: "B" }],
        },
      },
    },
  ];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loadFixture(page, draft);
  await expect(page.locator('.preview-pane div.overflow-hidden[id^="jxg-"]')).toHaveCount(3);
  await page.evaluate(() => {
    window.print = () => {
      window.__lifecyclePrintReady = true;
    };
  });
  for (let cycle = 0; cycle < 5; cycle += 1) {
    const solutions = cycle % 2 === 0;
    await page.getByRole("button", { name: solutions ? "Switch to Solutions mode" : "Switch to Student mode", exact: true }).click();
    await page.getByRole("button", { name: solutions ? "Print mode: Solutions" : "Print mode: Student", exact: true }).waitFor();
    await page.evaluate(() => {
      window.__lifecyclePrintReady = false;
    });
    await page.getByRole("button", { name: /^Print mode/ }).click();
    await page.waitForFunction(() => window.__lifecyclePrintReady);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator('.print-preview-stage div.overflow-hidden[id^="jxg-"]')).toHaveCount(3);
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => {
      // A changed print/page width must resize live boards without calling
      // callbacks retained from the previous Student/Solutions board.
      for (const board of document.querySelectorAll('div.overflow-hidden[id^="jxg-"]')) {
        board.style.width = `${board.offsetWidth + 1}px`;
      }
      for (const query of window.__printQueries) {
        query.dispatchEvent(new MediaQueryListEvent("change", { media: query.media, matches: true }));
      }
      window.dispatchEvent(new Event("afterprint"));
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  await page.screenshot({ path: info.outputPath("repeated-copy-and-print.png") });
  expect(errors).toEqual([]);
});
