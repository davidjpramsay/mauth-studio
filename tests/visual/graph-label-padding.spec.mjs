import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";

function fixture() {
  const draft = assessment(1);
  const base = {
    type: "graph2d",
    xMin: 0,
    xMax: 6,
    yMin: 0,
    yMax: 110,
    widthPx: 520,
    heightPx: 220,
    showAxes: true,
    showAxisLabels: false,
    showAxisNumbers: false,
    showGrid: false,
    functions: [],
    features: [],
  };
  const configs = [
    {
      ...base,
      features: [
        { id: "heading", kind: "label", x: 0.05, y: 105, label: "\\text{Students (\\%)}", color: "#111111" },
        { id: "bar", kind: "line_segment", x1: 1, y1: 0, x2: 1, y2: 100 },
      ],
    },
    {
      ...base,
      showAxes: false,
      functions: [{ id: "f", expression: "x", show: true, showLabel: true, label: "f", labelX: 0.2, labelY: 110 }],
    },
    {
      ...base,
      type: "vector2d",
      showAxes: false,
      metadata: {
        vector2d: {
          labelStyle: "custom",
          vectors: [{ id: "a", name: "a", label: "a", start: [1, 20], components: [2, 30], labelX: 1, labelY: 110 }],
        },
      },
    },
  ];
  draft.questions[0].text = "Graph labels retain clearance when axis names and numbers are hidden.";
  draft.questions[0].contentBlocks = configs.map((graphConfig, index) => ({ id: `padding-${index}`, kind: "diagram", graphConfig }));
  return draft;
}

async function clippedLabels(graphs) {
  return graphs.evaluateAll((nodes) =>
    nodes.flatMap((node, graphIndex) => {
      const frame = node.getBoundingClientRect();
      return [...node.querySelectorAll("[data-mauth-label-text]")].flatMap((label) => {
        const box = (label.querySelector("svg") ?? label).getBoundingClientRect();
        const clearance = Math.min(box.left - frame.left, frame.right - box.right, box.top - frame.top, frame.bottom - box.bottom);
        return clearance < 1 ? [{ graphIndex, text: label.dataset.mauthLabelText, clearance }] : [];
      });
    }),
  );
}

for (const width of [1440, 900]) {
  test(`hidden-axis graph labels fit in preview and both printed copies at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await loadFixture(page, fixture());
    const graphs = page.locator('.preview-pane div.overflow-hidden[id^="jxg-"]');
    await expect(graphs).toHaveCount(3);
    await expect(graphs.first().locator("[data-mauth-label-text]")).toHaveCount(1);
    await expect.poll(() => clippedLabels(graphs)).toEqual([]);
    const before = await page.evaluate(() => localStorage.getItem("mauth-studio.current-draft.v1"));
    await graphs.first().screenshot({ path: info.outputPath("free-heading.png") });

    await page.evaluate(() => {
      window.print = () => (window.__paddingPrinted = true);
    });
    for (const copy of ["Student", "Solutions"]) {
      if (copy === "Solutions") await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
      await expect.poll(() => clippedLabels(graphs)).toEqual([]);
      await page.evaluate(() => (window.__paddingPrinted = false));
      await page.getByRole("button", { name: /^Print mode/ }).click();
      await page.waitForFunction(() => window.__paddingPrinted);
      await page.emulateMedia({ media: "print" });
      const printed = page.locator('.print-preview-stage div.overflow-hidden[id^="jxg-"]');
      await expect(printed).toHaveCount(3);
      await expect.poll(() => clippedLabels(printed)).toEqual([]);
      await page.pdf({ path: info.outputPath(`${copy.toLowerCase()}.pdf`), preferCSSPageSize: true });
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    }
    expect(await page.evaluate(() => localStorage.getItem("mauth-studio.current-draft.v1"))).toBe(before);
    expect(errors).toEqual([]);
  });
}
