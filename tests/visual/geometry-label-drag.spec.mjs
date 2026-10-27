import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";

const circle = {
  type: "geometry2d",
  xMin: -5.2,
  xMax: 5.2,
  yMin: -4.5,
  yMax: 4.5,
  widthPx: 410,
  heightPx: 350,
  equalScale: true,
  showGrid: false,
  showAxes: false,
  showAxisLabels: false,
  showAxisNumbers: false,
  functions: [],
  features: [],
  data: {
    points: [
      { id: "A", x: -4, y: 0, label: "$A$", labelX: -4.5, labelY: -0.3 },
      { id: "B", x: 4, y: 0, label: "$B$", labelX: 4.45, labelY: -0.3 },
      { id: "C", x: 0, y: 4, label: "$C$", labelX: 0.1, labelY: 4.45 },
      { id: "O", x: 0, y: 0, label: "$O$", labelX: 0.25, labelY: -0.4 },
    ],
    segments: [
      { id: "diameter", from: "A", to: "B", label: "$8\\text{ cm}$", labelX: 0, labelY: -0.9 },
      { id: "AC", from: "A", to: "C" },
      { id: "BC", from: "B", to: "C" },
      { id: "radius", from: "O", to: "C", strokeStyle: "dashed" },
    ],
    arcs: [
      { id: "top", center: "O", from: "B", to: "A" },
      { id: "bottom", center: "O", from: "A", to: "B" },
    ],
    angles: [{ id: "answer", points: ["C", "A", "B"], label: "$45^\\circ$", radius: 0.8, labelX: -2.45, labelY: 0.65, solutionOnly: true }],
    decorations: [{ id: "right-C", kind: "rightAngle", points: ["A", "C", "B"], size: 0.5, solutionOnly: true }],
  },
};

const savedConfig = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("mauth-studio.current-draft.v1")).questions[0].contentBlocks[0].graphConfig);
async function dragLabel(page, label, dx = 20, dy = 8) {
  await label.scrollIntoViewIfNeeded();
  const box = await label.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 12 });
  await page.mouse.up();
}

for (const width of [1440, 900]) {
  test(`Student geometry labels drag without losing answers and fit the frame at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const draft = assessment(1);
    draft.questions[0].contentBlocks = [{ id: "circle", kind: "diagram", graphConfig: circle }];
    await loadFixture(page, draft);
    await expect(page).toHaveTitle(/Mauth/);
    const graph = page.locator('.preview-pane .a4-page [id^="jxg-"]').first();
    await expect(graph.locator('[data-mauth-draggable-geometry2d-label="true"]')).toHaveCount(5);
    const c = graph.locator('[data-mauth-label-role="geometry2d-point-label"][data-mauth-geometry2d-id="C"]');
    await graph.scrollIntoViewIfNeeded();
    const frame = await graph.boundingBox();
    const labelBounds = await c.boundingBox();
    const clearance = { top: labelBounds.y - frame.y, bottom: frame.y + frame.height - labelBounds.y - labelBounds.height };
    expect(clearance.top).toBeGreaterThan(5);
    expect(clearance.bottom).toBeGreaterThan(5);
    await graph.screenshot({ path: info.outputPath("circle-padded.png") });
    for (const [list, id] of [
      ["points", "A"],
      ["points", "B"],
      ["points", "C"],
      ["points", "O"],
      ["segments", "diameter"],
    ]) {
      const role = list === "points" ? "point" : "segment";
      const label = graph.locator(`[data-mauth-label-role="geometry2d-${role}-label"][data-mauth-geometry2d-id="${id}"]`);
      await dragLabel(page, label, id === "B" ? -15 : 15, 8);
      await expect
        .poll(async () => (await savedConfig(page)).data[list].find((item) => item.id === id).labelX)
        .not.toBe(circle.data[list].find((item) => item.id === id).labelX);
    }
    const saved = await savedConfig(page);
    expect(saved.data.angles).toMatchObject(circle.data.angles);
    expect(saved.data.decorations).toMatchObject(circle.data.decorations);
    expect(saved.data.points.map(({ id, x, y }) => ({ id, x, y }))).toEqual(circle.data.points.map(({ id, x, y }) => ({ id, x, y })));
    await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
    await expect(graph.locator('[data-mauth-label-role="geometry2d-angle-label"]')).toHaveCount(1);
    await page.evaluate(() => {
      window.__labelPrinted = false;
      window.print = () => (window.__labelPrinted = true);
    });
    await page.getByRole("button", { name: /^Print mode/ }).click();
    await page.waitForFunction(() => window.__labelPrinted);
    await page.emulateMedia({ media: "print" });
    const printed = page.locator('.print-preview-stage [id^="jxg-"]').first();
    await expect(printed.locator('[data-mauth-label-role="geometry2d-point-label"]')).toHaveCount(4);
    const printedC = printed.locator('[data-mauth-label-role="geometry2d-point-label"][data-mauth-geometry2d-id="C"]');
    const printFrame = await printed.boundingBox();
    const printLabel = await printedC.boundingBox();
    expect(printLabel.y - printFrame.y).toBeGreaterThan(5);
    await page.pdf({ path: info.outputPath("labels.pdf"), preferCSSPageSize: true });
    expect(errors).toEqual([]);
  });
}

test("the shared function label drags in Student mode and retains the hidden curve", async ({ page }) => {
  const draft = assessment(1);
  const graphConfig = draft.questions[0].contentBlocks.find((block) => block.kind === "diagram").graphConfig;
  graphConfig.functions = [
    { expression: "x^2", label: "f", labelMode: "name", showLabel: true, labelX: -1, labelY: 3 },
    { expression: "x", label: "g", labelMode: "name", showLabel: true, solutionOnly: true },
  ];
  draft.questions[0].contentBlocks = [{ id: "function", kind: "diagram", graphConfig }];
  await loadFixture(page, draft);
  const graph = page.locator('.preview-pane .a4-page [id^="jxg-"]').first();
  const label = graph.locator('[data-mauth-label-text="f"]');
  await expect(label).toHaveCount(1);
  await dragLabel(page, label);
  await expect.poll(async () => (await savedConfig(page)).functions[0].labelX).not.toBe(-1);
  expect((await savedConfig(page)).functions[1]).toMatchObject(graphConfig.functions[1]);
  await expect(graph.locator('[data-mauth-label-text="g"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
  await expect(graph.locator('[data-mauth-label-text="g"]')).toHaveCount(1);
});
