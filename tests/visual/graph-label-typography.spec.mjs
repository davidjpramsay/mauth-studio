import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";

function fixture() {
  const draft = assessment(1);
  draft.questions[0].text =
    "Document prose reference. Ordinary graph labels use the same typeface; equations retain mathematical notation.";
  const graph = {
    type: "graph2d",
    xMin: 0,
    xMax: 10,
    yMin: 0,
    yMax: 10,
    widthPx: 520,
    heightPx: 220,
    showAxes: false,
    showGrid: false,
    showAxisLabels: false,
    showAxisNumbers: false,
    functions: [],
    features: [
      { id: "heading", kind: "label", label: "\\text{Students (\\%)}", x: 0.3, y: 9, color: "#111111" },
      { id: "other", kind: "label", label: "Other", x: 0.3, y: 6, color: "#111111" },
      { id: "fruit", kind: "label", label: "Fruit 60%", x: 4, y: 6, color: "#111111" },
      { id: "formula", kind: "label", label: "\\frac{1}{2}", x: 7, y: 6, color: "#111111" },
      { id: "explicit-number", kind: "label", label: "$12$", x: 4, y: 3, color: "#111111" },
      { id: "explicit-name", kind: "label", label: "$AB$", x: 7, y: 3, color: "#111111" },
    ],
  };
  const vector = {
    ...graph,
    type: "vector2d",
    features: [],
    metadata: {
      vector2d: {
        labelStyle: "custom",
        vectors: [
          { id: "prose", name: "p", label: "Other", start: [1, 1], components: [2, 2], labelX: 1, labelY: 6 },
          { id: "math", name: "m", label: "\\frac{1}{2}", start: [5, 1], components: [2, 2], labelX: 6, labelY: 6 },
          {
            id: "matrix",
            name: "v",
            label: "\\begin{pmatrix}\\text{speed}\\\\2\\end{pmatrix}",
            start: [8, 1],
            components: [0, 1],
            labelX: 8,
            labelY: 3,
          },
        ],
      },
    },
  };
  const spatial = {
    type: "graph3d",
    widthPx: 520,
    heightPx: 220,
    showAxes: false,
    metadata: { view3d: { az: 0.6, el: 0.4, bank: 0, zoom: 0.9 } },
    data: {
      points: [
        { id: "P", coords: [0, 0, 0], label: "Other" },
        { id: "Q", coords: [2, 0, 1], label: "$\\theta$" },
      ],
      segments: [{ id: "PQ", from: "P", to: "Q" }],
      dimensions: [{ id: "length", from: "P", to: "Q", label: "Length: $\\frac{1}{2}$", labelOffsetPx: 30 }],
      xRange: [-2, 3],
      yRange: [-2, 2],
      zRange: [-2, 3],
    },
  };
  draft.questions[0].contentBlocks = [graph, vector, spatial].map((graphConfig, i) => ({ id: `font-${i}`, kind: "diagram", graphConfig }));
  return draft;
}

async function fontCheck(root) {
  const prose = root.locator(".graph-label-prose");
  await expect(prose).toHaveCount(6);
  expect((await prose.allTextContents()).sort()).toEqual(["Students (%)", "Other", "Fruit 60%", "Other", "Other", "Length: "].sort());
  const fonts = await prose.evaluateAll((nodes) =>
    nodes.map((node) => {
      const css = getComputedStyle(node);
      return { family: css.fontFamily, weight: css.fontWeight, style: css.fontStyle };
    }),
  );
  for (const font of fonts) {
    expect(font.family.split(",")[0].replaceAll('"', "")).toBe("Inter");
    expect(font.weight).toBe("400");
    expect(font.style).toBe("normal");
  }
  await expect(prose.locator("svg")).toHaveCount(0);
  await expect(root.locator('[data-mauth-label-text="12"] svg')).toHaveCount(1);
  await expect(root.locator('[data-mauth-label-text="AB"] svg')).toHaveCount(1);
  expect(await root.locator('mjx-container [data-mml-node="mfrac"]').count()).toBeGreaterThanOrEqual(3);
  await expect(root.locator('mjx-container [data-mml-node="merror"]')).toHaveCount(0);
}

for (const width of [1440, 900]) {
  test(`prose graph labels match document typography in preview and print at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (entry) => {
      if (entry.type() === "error") errors.push(entry.text());
    });
    await loadFixture(page, fixture());
    await expect(page).toHaveTitle(/Mauth/);
    await expect(page.getByText(/Document prose reference/).first()).toBeVisible();
    const preview = page.locator(".preview-pane");
    await fontCheck(preview);
    const original = await page.evaluate(() => localStorage.getItem("mauth-studio.current-draft.v1"));
    await preview
      .locator('div.overflow-hidden[id^="jxg-"]')
      .first()
      .screenshot({ path: info.outputPath("document-font-labels.png") });
    await page.evaluate(() => {
      window.print = () => {
        window.__fontPrintReady = true;
      };
    });
    for (const copy of ["Student", "Solutions"]) {
      if (copy === "Solutions") await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
      await fontCheck(preview);
      await page.evaluate(() => {
        window.__fontPrintReady = false;
      });
      await page.getByRole("button", { name: /^Print mode/ }).click();
      await page.waitForFunction(() => window.__fontPrintReady);
      await page.emulateMedia({ media: "print" });
      await fontCheck(page.locator(".print-preview-stage"));
      await page.pdf({ path: info.outputPath(`${copy.toLowerCase()}.pdf`), preferCSSPageSize: true });
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    }
    expect(await page.evaluate(() => localStorage.getItem("mauth-studio.current-draft.v1"))).toBe(original);
    expect(errors).toEqual([]);
  });
}

test("ordinary label text cannot create HTML elements", async ({ page }) => {
  const draft = fixture();
  const label = '<img src=x onerror="alert(1)">';
  draft.questions[0].contentBlocks = [draft.questions[0].contentBlocks[0]];
  draft.questions[0].contentBlocks[0].graphConfig.features = [{ id: "literal", kind: "label", label, x: 1, y: 5 }];
  await loadFixture(page, draft);
  const prose = page.locator(".preview-pane .graph-label-prose");
  await expect(prose).toHaveText(label);
  await expect(prose.locator("img, script")).toHaveCount(0);
});
