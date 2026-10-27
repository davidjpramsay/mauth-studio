import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";

function pyramid(az = Math.PI / 4, hiddenEdges = "auto") {
  const p = { A: [-3, -3, 0], B: [3, -3, 0], C: [3, 3, 0], D: [-3, 3, 0], T: [0, 0, 4], O: [0, 0, 0] };
  return {
    type: "graph3d",
    widthPx: 480,
    heightPx: 360,
    showAxes: false,
    showAxisLabels: false,
    metadata: { view3d: { az, el: 0.5, bank: 0, zoom: 1.15 } },
    data: {
      hiddenEdges,
      points: Object.entries(p).map(([id, coords]) => ({ id, coords, show: false })),
      faces: [
        ["A", "B", "C", "D"],
        ["A", "B", "T"],
        ["B", "C", "T"],
        ["C", "D", "T"],
        ["D", "A", "T"],
      ].map((points, i) => ({ id: "face" + i, points, fillColor: "#d9d3f0", fillOpacity: 0.18 })),
      segments: [
        ["A", "B"],
        ["B", "C"],
        ["C", "D"],
        ["D", "A"],
        ["A", "T"],
        ["B", "T"],
        ["C", "T"],
        ["D", "T"],
      ].map(([from, to], i) => ({ id: "edge" + i, from, to, strokeStyle: i < 4 ? "dashed" : "solid" })),
      dimensions: [{ id: "height", from: "O", to: "T", label: "$4\\text{ m}$", display: "guide" }],
      xRange: [-4, 4],
      yRange: [-4, 4],
      zRange: [-1, 5],
    },
  };
}
const edgeAB = "-3,-3,0:3,-3,0";
const edgeCD = "-3,3,0:3,3,0";
const styles = async (graph) =>
  graph
    .locator("[data-mauth-graph3d-auto-edge]")
    .evaluateAll((nodes) =>
      Object.fromEntries(nodes.map((n) => [n.dataset.mauthGraph3dAutoEdge, n.getAttribute("stroke-dasharray") || "none"])),
    );
const dashed = (value) => value !== "none" && value !== "";

for (const [name, az, abHidden] of [
  ["initial", Math.PI / 4, true],
  ["half-turn", (5 * Math.PI) / 4, false],
]) {
  test(`automatic pyramid edges follow the ${name} camera in preview and print`, async ({ page }, info) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const draft = assessment(1);
    draft.questions[0].contentBlocks = [{ id: "pyramid", kind: "diagram", graphConfig: pyramid(az) }];
    await loadFixture(page, draft);
    const graph = page.locator('.preview-pane [data-mauth-diagram-type="graph3d"]').first();
    const fallback = page.locator('[data-mauth-diagram-type="graph3d"]').first();
    const target = (await graph.count()) ? graph : fallback;
    await target.scrollIntoViewIfNeeded();
    await expect(target.locator("[data-mauth-graph3d-auto-edge]")).toHaveCount(8);
    await expect
      .poll(() =>
        target
          .locator("[data-mauth-graph3d-auto-edge]")
          .evaluateAll((nodes) => nodes.every((n) => getComputedStyle(n).visibility === "visible" && n.getAttribute("d") !== "M 0 0")),
      )
      .toBe(true);
    const initial = await styles(target);
    expect(dashed(initial[edgeAB])).toBe(abHidden);
    expect(dashed(initial[edgeCD])).toBe(!abHidden);
    await expect(target.locator('[data-mauth-graph3d-dimension-line="height"]')).toHaveAttribute("stroke-dasharray", /.+/);
    await target.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(target).toHaveScreenshot("hidden-edges-" + name + ".png", { animations: "disabled" });
    await page.evaluate(() => {
      window.__hiddenEdgesPrinted = false;
      window.print = () => (window.__hiddenEdgesPrinted = true);
    });
    await page.getByRole("button", { name: /^Print mode/ }).click();
    await page.waitForFunction(() => window.__hiddenEdgesPrinted);
    await page.emulateMedia({ media: "print" });
    const printed = page.locator('.print-preview-stage [data-mauth-diagram-type="graph3d"]');
    const printStyles = await styles(printed);
    expect(dashed(printStyles[edgeAB])).toBe(abHidden);
    expect(dashed(printStyles[edgeCD])).toBe(!abHidden);
    await page.pdf({ path: info.outputPath(name + ".pdf"), preferCSSPageSize: true, printBackground: true });
    expect(errors).toEqual([]);
  });
}

test("automatic edges update during an actual pointer rotation", async ({ page }, info) => {
  const draft = assessment(1);
  draft.questions[0].contentBlocks = [{ id: "pyramid", kind: "diagram", graphConfig: pyramid() }];
  await loadFixture(page, draft);
  const graph = page.locator('.preview-pane .a4-page [data-mauth-diagram-type="graph3d"]').first();
  await expect(graph.locator("[data-mauth-graph3d-auto-edge]")).toHaveCount(8);
  await graph.click({ position: { x: 220, y: 180 } });
  const before = await styles(graph);
  await graph.scrollIntoViewIfNeeded();
  const box = await graph.boundingBox();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.55, { steps: 24 });
  await expect.poll(() => styles(graph)).not.toEqual(before);
  await expect(graph.locator('[data-mauth-graph3d-dimension-line="height"]')).toHaveAttribute("stroke-dasharray", /.+/);
  await page.mouse.up();
  await graph.screenshot({ path: info.outputPath("pointer-rotated.png") });
});

test("manual mode retains fixed dashed segment styles", async ({ page }) => {
  const draft = assessment(1);
  draft.questions[0].contentBlocks = [{ id: "pyramid", kind: "diagram", graphConfig: pyramid(Math.PI / 4, "manual") }];
  await loadFixture(page, draft);
  const graph = page.locator('.preview-pane .a4-page [data-mauth-diagram-type="graph3d"]').first();
  await expect(graph.locator('[data-mauth-graph3d-dimension-line="height"]')).toHaveCount(1);
  await expect(graph.locator("[data-mauth-graph3d-auto-edge]")).toHaveCount(0);
  const countDashed = () =>
    graph
      .locator("svg path[stroke-dasharray]")
      .evaluateAll((nodes) => nodes.filter((n) => n.getAttribute("stroke-dasharray") !== "none").length);
  expect(await countDashed()).toBe(5);
  await graph.click({ position: { x: 220, y: 180 } });
  const box = await graph.boundingBox();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.55, { steps: 24 });
  await page.mouse.up();
  expect(await countDashed()).toBe(5);
});
