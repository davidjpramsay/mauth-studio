import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";
import { expectLabelDragFeedback, expectLabelDragFinished } from "./label-drag-feedback.mjs";

function fixture() {
  const draft = assessment(1);
  draft.questions[0].contentBlocks = [
    {
      id: "vectors",
      kind: "diagram",
      graphConfig: {
        type: "vector2d",
        functions: [],
        features: [],
        xMin: -2,
        xMax: 6,
        yMin: -1,
        yMax: 5,
        widthPx: 450,
        heightPx: 340,
        equalScale: false,
        showGrid: true,
        showAxes: true,
        showAxisLabels: true,
        showAxisNumbers: true,
        xAxisLabel: "\\mathbf{i}",
        yAxisLabel: "\\mathbf{j}",
        metadata: {
          retained: "document metadata",
          vector2d: {
            labelStyle: "boldLower",
            retained: "vector settings",
            vectors: [
              {
                id: "a",
                name: "a",
                label: "a",
                start: [0, 0],
                components: [4, 1],
                color: "#20283f",
                labelX: 2.7,
                labelY: 0.25,
                retained: "vector metadata",
              },
              { id: "b", name: "b", label: "b", start: [0, 0], components: [-1, 3], color: "#7855d8", labelX: -1.2, labelY: 2 },
              {
                id: "b-shift",
                name: "b",
                label: "b",
                start: [4, 1],
                components: [-1, 3],
                color: "#0d9488",
                labelX: 4.3,
                labelY: 2.8,
                solutionOnly: true,
              },
              {
                id: "resultant",
                name: "r",
                label: "r",
                start: [0, 0],
                components: [3, 4],
                color: "#0d9488",
                labelX: 1.6,
                labelY: 3.2,
                solutionOnly: true,
              },
            ],
            segmentLabels: [],
            angleMarkers: [],
          },
        },
      },
    },
  ];
  return draft;
}

test("vector annotation labels and answer labels retain stable targets and authored metadata", async ({ page }) => {
  const draft = fixture();
  const config = draft.questions[0].contentBlocks[0].graphConfig;
  const data = config.metadata.vector2d;
  data.vectors.unshift(data.vectors.pop());
  data.segmentLabels = [
    { id: "answer-length", vectorId: "resultant", label: "answer", solutionOnly: true, color: "#123456" },
    { vectorId: "a", label: "L", labelX: 1, labelY: -0.5, custom: "segment" },
  ];
  data.angleMarkers = [
    { id: "answer-angle", from: "a", to: "resultant", label: "answer", solutionOnly: true, color: "#123456" },
    { from: "a", to: "b", label: "\\theta", labelX: 0.5, labelY: 1.2, custom: "angle" },
  ];
  await loadFixture(page, draft);
  const graph = graphFor(page);
  for (const [listKey, selector, initial] of [
    ["segmentLabels", '[data-mauth-label-role="segment-label"][data-mauth-segment-label-id="segment-label-2"]', 1],
    ["angleMarkers", '[data-mauth-label-role="angle-label"][data-mauth-angle-marker-id="angle-marker-2"]', 0.5],
  ]) {
    const label = graph.locator(selector);
    await expect(label).toHaveCount(1);
    await drag(page, label, 15, 8);
    await expect.poll(async () => (await readConfig(page)).metadata.vector2d[listKey][1].labelX).not.toBe(initial);
    expect((await readConfig(page)).metadata.vector2d[listKey][0]).toMatchObject(data[listKey][0]);
    expect((await readConfig(page)).metadata.vector2d[listKey][1].custom).toBe(data[listKey][1].custom);
  }
  await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
  const answer = graph.locator('[data-mauth-label-role="vector"][data-mauth-vector-id="resultant"]');
  await expect(answer).toHaveCount(1);
  await drag(page, answer, 16, 8);
  await expect.poll(async () => (await readConfig(page)).metadata.vector2d.vectors[0].labelX).not.toBe(1.6);
  const changed = (await readConfig(page)).metadata.vector2d.vectors[0];
  expect(changed.color).toBe("#0d9488");
  expect(changed.solutionOnly).toBe(true);
  expect(changed.start).toEqual([0, 0]);
  expect(changed.components).toEqual([3, 4]);
});
const readDraft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mauth-studio.current-draft.v1")));
const readConfig = async (page) => (await readDraft(page)).questions[0].contentBlocks[0].graphConfig;
const graphFor = (page) => page.locator('.preview-pane .a4-page [id^="jxg-vector-"]').first();
async function drag(page, label, dx, dy) {
  await label.scrollIntoViewIfNeeded();
  const before = await label.boundingBox();
  const frame = await graphFor(page).boundingBox();
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + dx, before.y + before.height / 2 + dy, { steps: 12 });
  await expectLabelDragFeedback(page, label);
  await page.mouse.up();
  await expectLabelDragFinished(page, label);
  // Print feedback checks can scroll the preview; measure within the diagram.
  return { ...before, x: before.x - frame.x, y: before.y - frame.y };
}

for (const width of [1440, 900]) {
  test(`a, b, i and j drag, persist and print with hidden answer vectors at ${width}px`, async ({ page, browser }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const draft = fixture();
    const original = draft.questions[0].contentBlocks[0].graphConfig;
    await loadFixture(page, draft);
    await expect(page).toHaveTitle(/Mauth/);
    const graph = graphFor(page);
    await expect(graph.locator('[data-mauth-label-role="vector"]')).toHaveCount(2);
    for (const id of ["a", "b"]) {
      const label = graph.locator(`[data-mauth-label-role="vector"][data-mauth-vector-id="${id}"]`);
      const initialX = original.metadata.vector2d.vectors.find((entry) => entry.id === id).labelX;
      const before = await drag(page, label, 18, 10);
      await expect
        .poll(async () => (await readConfig(page)).metadata.vector2d.vectors.find((entry) => entry.id === id).labelX)
        .not.toBe(initialX);
      const moved = await label.boundingBox();
      const frame = await graph.boundingBox();
      const after = { x: moved.x - frame.x, y: moved.y - frame.y };
      expect(after.x - before.x).toBeCloseTo(18, 0);
      expect(after.y - before.y).toBeCloseTo(10, 0);
    }
    for (const axis of ["x", "y"]) {
      const label = graph.locator(`[data-mauth-axis-label="${axis}"]`);
      for (let repeat = 0; repeat < 2; repeat++) {
        const initialX = (await readConfig(page))[`${axis}AxisLabelX`];
        const before = await drag(page, label, axis === "x" ? -12 : 12, 10);
        await expect.poll(async () => (await readConfig(page))[`${axis}AxisLabelX`]).not.toBe(initialX);
        const moved = await label.boundingBox();
        const frame = await graph.boundingBox();
        const after = { x: moved.x - frame.x, y: moved.y - frame.y };
        expect(after.x - before.x).toBeCloseTo(axis === "x" ? -12 : 12, 0);
        expect(after.y - before.y).toBeCloseTo(10, 0);
      }
    }
    const saved = await readConfig(page);
    const cancelLabel = graph.locator('[data-mauth-label-role="vector"][data-mauth-vector-id="a"]');
    const cancelBox = await cancelLabel.boundingBox();
    await page.mouse.move(cancelBox.x + 3, cancelBox.y + 3);
    await page.mouse.down();
    await page.mouse.move(cancelBox.x + 20, cancelBox.y + 12);
    const dragging = page.locator('[data-mauth-label-dragging="true"]');
    await expect(dragging).toHaveCount(1);
    await dragging.evaluate((node) => node.releasePointerCapture(1));
    await page.mouse.up();
    await expectLabelDragFinished(page, cancelLabel);
    expect(await readConfig(page)).toEqual(saved);
    expect(saved.metadata.vector2d.vectors.slice(2)).toMatchObject(original.metadata.vector2d.vectors.slice(2));
    expect(saved.metadata.vector2d.vectors.map(({ id, start, components, color }) => ({ id, start, components, color }))).toEqual(
      original.metadata.vector2d.vectors.map(({ id, start, components, color }) => ({ id, start, components, color })),
    );
    expect(saved.metadata.retained).toBe("document metadata");
    expect(saved.metadata.vector2d.retained).toBe("vector settings");
    expect(saved.metadata.vector2d.vectors[0].retained).toBe("vector metadata");
    const finalY = saved.yAxisLabelY;
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(async () => (await readConfig(page)).yAxisLabelY).not.toBe(finalY);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect.poll(async () => (await readConfig(page)).yAxisLabelY).toBe(finalY);
    await graph.screenshot({ path: info.outputPath("labels-moved.png") });
    // Rehydrate the actual persisted JSON in an independent editor session.
    const reopenedContext = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: { width, height: 1000 } });
    const reopened = await reopenedContext.newPage();
    await loadFixture(reopened, await readDraft(page));
    const reopenedGraph = graphFor(reopened);
    await expect(reopenedGraph.locator('[data-mauth-vector-id="a"][data-mauth-label-role="vector"]')).toBeVisible();
    expect((await readConfig(reopened)).metadata.vector2d.vectors).toEqual(saved.metadata.vector2d.vectors);
    await reopened.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
    await expect(reopenedGraph.locator('[data-mauth-label-role="vector"]')).toHaveCount(4);
    await reopened.evaluate(() => {
      window.__vectorsPrinted = false;
      window.print = () => (window.__vectorsPrinted = true);
    });
    await reopened.getByRole("button", { name: /^Print mode/ }).click();
    await reopened.waitForFunction(() => window.__vectorsPrinted);
    await reopened.emulateMedia({ media: "print" });
    const printed = reopened.locator('.print-preview-stage [id^="jxg-vector-"]').first();
    await expect(printed.locator('[data-mauth-label-role="vector"]')).toHaveCount(4);
    await expect(printed.locator("[data-mauth-axis-label]")).toHaveCount(2);
    await reopened.pdf({ path: info.outputPath("moved-labels.pdf"), preferCSSPageSize: true });
    await reopenedContext.close();
    expect(errors).toEqual([]);
  });
}
