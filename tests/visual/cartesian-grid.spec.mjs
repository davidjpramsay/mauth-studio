import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";

function fixture() {
  const draft = assessment(5);
  const base = {
    type: "graph2d",
    xMin: -1,
    xMax: 7,
    yMin: -1,
    yMax: 11,
    widthPx: 560,
    heightPx: 340,
    gridMajorStepX: 1,
    gridMajorStepY: 2,
    showGrid: true,
    showAxes: true,
    showAxisLabels: true,
    showAxisNumbers: true,
    functions: [
      {
        id: "h",
        kind: "expression",
        expression: "6*x-x^2",
        domainMode: "manual",
        domainMin: 0,
        domainMax: 6,
        label: "h",
        latex: "6x-x^2",
        labelX: 4.5,
        labelY: 8.8,
        color: "#7855d8",
        show: true,
        showLabel: true,
      },
    ],
    features: [{ id: "answer", kind: "point", x: 3, y: 9, label: "V", solutionOnly: true }],
  };
  const configs = [
    base,
    {
      ...base,
      type: "vector2d",
      functions: [],
      features: [],
      xMin: -2.3,
      xMax: 5.7,
      yMin: -1.2,
      yMax: 4.3,
      showMinorGrid: true,
      gridMinorStepX: 0.5,
      gridMinorStepY: 1,
      metadata: { vector2d: { vectors: [{ id: "a", name: "a", start: [0, 0], components: [4, 1], labelX: 3, labelY: 1.3 }] } },
    },
    {
      ...base,
      type: "geometry2d",
      functions: [],
      features: [],
      data: { points: [], segments: [], angles: [], arcs: [] },
      equalScale: false,
      showAxes: false,
      showMajorGrid: false,
      showMinorGrid: true,
    },
    { ...base, showGrid: false },
    { ...base, xMin: -0.2, xMax: 7, functions: [], features: [] },
  ];
  draft.questions.forEach((q, i) => {
    q.text = [
      "A clean Cartesian grid",
      "Fractional bounds and minor grid",
      "Minor-only coordinate geometry grid",
      "Grid hidden",
      "Numbers clear the left frame",
    ][i];
    q.contentBlocks = [{ id: `grid-${i}`, kind: "diagram", graphConfig: configs[i] }];
  });
  return draft;
}

// Inspect the actual SVG endpoints, independently of the grid generator's coordinates.
async function expectClosedGrid(graph, visible = true) {
  const lines = graph.locator("[data-mauth-grid-line]");
  if (!visible) return expect(lines).toHaveCount(0);
  await expect(graph.locator('[data-mauth-grid-line="boundary"]')).toHaveCount(4);
  const geometry = await lines.evaluateAll((nodes) =>
    nodes.map((node) => {
      const a = node.getPointAtLength(0),
        b = node.getPointAtLength(node.getTotalLength());
      return {
        a: { x: a.x, y: a.y },
        b: { x: b.x, y: b.y },
        kind: node.dataset.mauthGridLine,
        color: node.getAttribute("stroke"),
        width: node.getAttribute("stroke-width"),
        dash: node.getAttribute("stroke-dasharray"),
      };
    }),
  );
  const edges = geometry.filter(({ kind }) => kind === "boundary");
  const points = edges.flatMap(({ a, b }) => [a, b]);
  const left = Math.min(...points.map((p) => p.x)),
    right = Math.max(...points.map((p) => p.x));
  const top = Math.min(...points.map((p) => p.y)),
    bottom = Math.max(...points.map((p) => p.y));
  expect(right - left).toBeGreaterThan(100);
  expect(bottom - top).toBeGreaterThan(100);
  for (const { a, b } of geometry)
    for (const p of [a, b]) {
      expect(p.x).toBeGreaterThanOrEqual(left - 0.01);
      expect(p.x).toBeLessThanOrEqual(right + 0.01);
      expect(p.y).toBeGreaterThanOrEqual(top - 0.01);
      expect(p.y).toBeLessThanOrEqual(bottom + 0.01);
      expect(Math.min(Math.abs(p.x - left), Math.abs(p.x - right), Math.abs(p.y - top), Math.abs(p.y - bottom))).toBeLessThan(0.01);
    }
  const keys = geometry.map(({ a, b }) => [a.x, a.y, b.x, b.y].map((v) => v.toFixed(2)).join(","));
  expect(new Set(keys).size).toBe(keys.length);
  expect(new Set(edges.map(({ color, width, dash }) => JSON.stringify({ color, width, dash }))).size).toBe(1);
  expect(edges[0].dash ?? "none").toMatch(/^(none|0|)$/);
  const graphBox = await graph.boundingBox();
  expect(left).toBeGreaterThan(0);
  expect(top).toBeGreaterThan(0);
  // SVG user coordinates use the unscaled authored diagram size.
  expect(graphBox.width).toBeGreaterThan(100);
  const labelIssues = await graph.evaluate((node) => {
    const frame = node.getBoundingClientRect();
    const edges = [...node.querySelectorAll('[data-mauth-grid-line="boundary"]')].map((edge) => {
      const m = edge.getScreenCTM();
      return [edge.getPointAtLength(0).matrixTransform(m), edge.getPointAtLength(edge.getTotalLength()).matrixTransform(m)];
    });
    return [...node.querySelectorAll("[data-mauth-axis-number]")].flatMap((label) => {
      const box = label.getBoundingClientRect();
      const clipped = box.left < frame.left || box.right > frame.right || box.top < frame.top || box.bottom > frame.bottom;
      const crossing = edges.some(
        ([a, b]) =>
          box.left < Math.max(a.x, b.x) + 1 &&
          box.right > Math.min(a.x, b.x) - 1 &&
          box.top < Math.max(a.y, b.y) + 1 &&
          box.bottom > Math.min(a.y, b.y) - 1,
      );
      return clipped || crossing ? [{ label: label.dataset.mauthLabelText, clipped, crossing }] : [];
    });
  });
  expect(labelIssues).toEqual([]);
  return geometry;
}

for (const width of [1440, 900]) {
  test(`Cartesian grid edges close in preview and both printed copies at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    const draft = fixture();
    await loadFixture(page, draft);
    await expect(page).toHaveTitle(/Mauth/);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    const graphs = page.locator('.preview-pane .a4-page div.overflow-hidden[id^="jxg-"]');
    await expect(graphs).toHaveCount(5);
    for (let i = 0; i < 5; i++) await expectClosedGrid(graphs.nth(i), i !== 3);
    await graphs.first().screenshot({ path: info.outputPath("clean-function-grid.png") });
    await graphs.nth(1).screenshot({ path: info.outputPath("fractional-vector-grid.png") });
    await graphs.nth(2).screenshot({ path: info.outputPath("minor-only-grid.png") });
    const readConfigs = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("mauth-studio.current-draft.v1")).questions.map((q) => q.contentBlocks[0].graphConfig),
      );
    const before = await readConfigs();
    const previewGeometry = await expectClosedGrid(graphs.first());
    for (const copy of ["Student", "Solutions"]) {
      if (copy === "Solutions") await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
      await expect.poll(async () => await expectClosedGrid(graphs.first())).toEqual(previewGeometry);
      await page.evaluate(() => {
        window.__gridPrinted = false;
        window.print = () => (window.__gridPrinted = true);
      });
      await page.getByRole("button", { name: /^Print mode/ }).click();
      await page.waitForFunction(() => window.__gridPrinted);
      await page.emulateMedia({ media: "print" });
      const printed = page.locator('.print-preview-stage div.overflow-hidden[id^="jxg-"]');
      await expect(printed).toHaveCount(5);
      for (let i = 0; i < 5; i++) await expectClosedGrid(printed.nth(i), i !== 3);
      await printed.first().screenshot({ path: info.outputPath(`${copy.toLowerCase()}-print.png`) });
      await page.pdf({ path: info.outputPath(`${copy.toLowerCase()}.pdf`), preferCSSPageSize: true });
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    }
    expect(await readConfigs()).toEqual(before);
    expect(before[0]).toMatchObject(draft.questions[0].contentBlocks[0].graphConfig);
    expect(errors).toEqual([]);
  });
}
