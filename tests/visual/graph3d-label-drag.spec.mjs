import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";

function pyramid() {
  const points = { A: [-3, -3, 0], B: [3, -3, 0], C: [3, 3, 0], D: [-3, 3, 0], T: [0, 0, 4], O: [0, 0, 0], M: [0, -3, 0] };
  return {
    type: "graph3d",
    widthPx: 470,
    heightPx: 315,
    showAxes: false,
    metadata: { view3d: { az: 5.65, el: 0.49, bank: 0, zoom: 1.18 }, custom: "retained" },
    data: {
      hiddenEdges: "auto",
      custom: "retained",
      points: Object.entries(points).map(([id, coords]) => ({ id, coords, show: false })),
      faces: [
        ["A", "B", "C", "D"],
        ["A", "B", "T"],
        ["B", "C", "T"],
        ["C", "D", "T"],
        ["D", "A", "T"],
      ].map((points, i) => ({ id: `face${i}`, points, fillOpacity: 0.2, fillColor: "#d0c5f3" })),
      dimensions: [
        { id: "answer", from: "M", to: "T", label: "$5\\text{ m}$", solutionOnly: true, color: "#123456", custom: "answer" },
        { id: "side", from: "A", to: "B", label: "$6\\text{ m}$", display: "label", labelOffsetPx: 16 },
        {
          id: "height",
          from: "O",
          to: "T",
          label: "$4\\text{ m}$",
          display: "guide",
          rightAngleWith: "face:face0",
          labelOffsetPx: 18,
          labelScreenOffsetPx: [-32, 0],
        },
      ],
      xRange: [-4, 4],
      yRange: [-4, 4],
      zRange: [-1, 5],
    },
  };
}
const readDraft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mauth-studio.current-draft.v1")));
const configFor = async (page) => (await readDraft(page)).questions[0].contentBlocks[0].graphConfig;
const graphFor = (page) => page.locator('.preview-pane .a4-page [data-mauth-diagram-type="graph3d"]').first();
const labelFor = (graph, kind, id) => graph.locator(`[data-mauth-graph3d-label-kind="${kind}"][data-mauth-graph3d-element-id="${id}"]`);
async function drag(page, label, dx, dy) {
  await label.scrollIntoViewIfNeeded();
  const before = await label.boundingBox();
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + dx, before.y + before.height / 2 + dy, { steps: 12 });
  await page.mouse.up();
  return before;
}

for (const width of [1440, 900]) {
  test(`3D Student dimension labels drag and persist with hidden answers at ${width}px`, async ({ page, browser }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const draft = assessment(1);
    const original = pyramid();
    draft.questions[0].contentBlocks = [{ id: "pyramid", kind: "diagram", graphConfig: original }];
    await loadFixture(page, draft);
    await expect(page).toHaveTitle(/Mauth/);
    const graph = graphFor(page);
    await expect(labelFor(graph, "dimension", "answer")).toHaveCount(0);
    const camera = (await configFor(page)).metadata.view3d;
    for (const id of ["height", "side"]) {
      const label = labelFor(graph, "dimension", id);
      await expect(label).toHaveAttribute("data-mauth-draggable-graph3d-label", "true");
      const initial = (await configFor(page)).data.dimensions.find((d) => d.id === id).labelScreenOffsetPx;
      const before = await drag(page, label, 18, 10);
      await expect
        .poll(async () => (await configFor(page)).data.dimensions.find((d) => d.id === id).labelScreenOffsetPx)
        .not.toEqual(initial);
      const after = await label.boundingBox();
      expect(after.x - before.x).toBeCloseTo(18, 0);
      expect(after.y - before.y).toBeCloseTo(10, 0);
    }
    const saved = await configFor(page);
    expect(saved.data.dimensions[0]).toEqual(original.data.dimensions[0]);
    expect(saved.data.points).toEqual(original.data.points);
    expect(saved.data.faces).toEqual(original.data.faces);
    expect(saved.data.hiddenEdges).toBe("auto");
    expect(saved.metadata).toEqual({ ...original.metadata, view3d: camera });
    expect(saved.data.custom).toBe("retained");
    const sideOffset = saved.data.dimensions.find((d) => d.id === "side").labelScreenOffsetPx;
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(async () => (await configFor(page)).data.dimensions.find((d) => d.id === "side").labelScreenOffsetPx).toBeUndefined();
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect
      .poll(async () => (await configFor(page)).data.dimensions.find((d) => d.id === "side").labelScreenOffsetPx)
      .toEqual(sideOffset);
    await graph.screenshot({ path: info.outputPath("student-labels.png") });
    const context = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: { width, height: 1000 } });
    const reopened = await context.newPage();
    await loadFixture(reopened, await readDraft(page));
    expect((await configFor(reopened)).data.dimensions).toEqual(saved.data.dimensions);
    await reopened.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
    const answer = labelFor(graphFor(reopened), "dimension", "answer");
    await expect(answer).toHaveAttribute("data-mauth-draggable-graph3d-label", "true");
    await drag(reopened, answer, 12, 7);
    await expect.poll(async () => (await configFor(reopened)).data.dimensions[0].labelScreenOffsetPx).toBeTruthy();
    expect((await configFor(reopened)).data.dimensions[0]).toMatchObject(original.data.dimensions[0]);
    await reopened.evaluate(() => {
      window.__graph3dPrinted = false;
      window.print = () => (window.__graph3dPrinted = true);
    });
    await reopened.getByRole("button", { name: /^Print mode/ }).click();
    await reopened.waitForFunction(() => window.__graph3dPrinted);
    const printed = reopened.locator('.print-preview-stage [data-mauth-diagram-type="graph3d"]').first();
    await expect(labelFor(printed, "dimension", "side")).toHaveAttribute("data-mauth-label-screen-offset-x", String(sideOffset[0]));
    await reopened.emulateMedia({ media: "print" });
    await reopened.pdf({ path: info.outputPath("solutions-labels.pdf"), preferCSSPageSize: true });
    await context.close();
    expect(errors).toEqual([]);
  });
}

test("3D point, segment, face and legacy dimension labels keep stable targets after rotation", async ({ page }) => {
  const draft = assessment(1);
  const config = pyramid();
  config.data.points[0].show = true;
  config.data.faces.unshift({ ...config.data.faces[0], id: "answer-face", solutionOnly: true, label: "answer", fillColor: "#123456" });
  delete config.data.faces[1].id;
  config.data.faces[1].label = "$F$";
  config.data.edges = [
    { from: "B", to: "T", label: "answer", solutionOnly: true, color: "#123456" },
    { from: "A", to: "B", label: "$L$", labelScreenOffsetPx: [0, 45], custom: "edge" },
  ];
  config.data.dimensionLines = config.data.dimensions.map((d) => {
    const next = { ...d };
    delete next.id;
    return next;
  });
  delete config.data.dimensions;
  config.data.dimensionLines[2].rightAngleWith = "face:face-2";
  draft.questions[0].contentBlocks = [{ id: "scene", kind: "diagram", graphConfig: config }];
  await loadFixture(page, draft);
  const graph = graphFor(page);
  const beforeCamera = (await configFor(page)).metadata.view3d;
  await expect(labelFor(graph, "point", "A")).toHaveAttribute("data-mauth-draggable-graph3d-label", "true");
  await graph.scrollIntoViewIfNeeded();
  const box = await graph.boundingBox();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.65, { steps: 18 });
  await page.mouse.up();
  await expect.poll(async () => (await configFor(page)).metadata.view3d).not.toEqual(beforeCamera);
  const camera = (await configFor(page)).metadata.view3d;
  for (const [kind, id, listKey, index] of [
    ["point", "A", "points", 0],
    ["segment", "segment-A-B-2", "edges", 1],
    ["face", "face-2", "faces", 1],
    ["dimension", "dimension-2", "dimensionLines", 1],
  ]) {
    const label = labelFor(graph, kind, id);
    await expect(label).toHaveAttribute("data-mauth-draggable-graph3d-label", "true");
    const initial = (await configFor(page)).data[listKey][index].labelScreenOffsetPx;
    await drag(page, label, 10, 6);
    await expect
      .poll(async () => (await configFor(page)).data[listKey][index].labelScreenOffsetPx, {
        message: `${kind} ${id} position should persist`,
      })
      .not.toEqual(initial);
  }
  const moved = await configFor(page);
  expect(moved.metadata.view3d).toEqual(camera);
  expect(moved.data.edges[0]).toMatchObject(config.data.edges[0]);
  expect(moved.data.dimensionLines[0]).toMatchObject(config.data.dimensionLines[0]);
  expect(moved.data.faces[0]).toMatchObject(config.data.faces[0]);
  const label = labelFor(graph, "dimension", "dimension-2");
  const at = await label.boundingBox();
  await page.mouse.move(at.x + 3, at.y + 3);
  await page.mouse.down();
  await page.mouse.move(at.x + 25, at.y + 20);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 })));
  await page.mouse.up();
  expect((await configFor(page)).data.dimensionLines[1].labelScreenOffsetPx).toEqual(moved.data.dimensionLines[1].labelScreenOffsetPx);
  await label.dblclick();
  await expect.poll(async () => (await configFor(page)).data.dimensionLines[1].labelScreenOffsetPx).toBeUndefined();
});
