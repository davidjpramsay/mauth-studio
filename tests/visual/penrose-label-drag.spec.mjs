import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { assessment, investigation, loadFixture } from "./fixtures.mjs";
import { renderGeometricConstructionDiagram } from "../../packages/diagram-penrose/src/index.mjs";
import { expectLabelDragFeedback, expectLabelDragFinished } from "./label-drag-feedback.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../../packages/diagram-penrose/fixtures/diameter-circle.json", import.meta.url)));
const readDraft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mauth-studio.current-draft.v1")));
const configs = async (page) =>
  (await readDraft(page)).questions[0].contentBlocks.filter((b) => b.kind === "diagram").map((b) => b.graphConfig);
const diagramFor = (page) => page.locator(".preview-pane .a4-page .penrose-diagram").filter({ visible: true }).first();
const labelFor = (diagram, id) => diagram.locator(`[data-mauth-penrose-label="${id}"]`);
async function setup(page, draft) {
  await loadFixture(page, draft);
  const requests = [];
  await page.route("**/api/diagram/penrose", async (route) => {
    const spec = route.request().postDataJSON();
    requests.push(spec);
    await route.fulfill({ json: await renderGeometricConstructionDiagram(spec) });
  });
  await page.reload();
  await expect(page).toHaveTitle(/Mauth/);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await expect(diagramFor(page)).toHaveAttribute("data-mauth-print-render-state", "ready");
  return requests;
}
async function drag(page, label, dx, dy) {
  await label.scrollIntoViewIfNeeded();
  const box = await label.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
  await expectLabelDragFeedback(page, label);
  await page.mouse.up();
  await expectLabelDragFinished(page, label);
  return box;
}
const geometry = (diagram) => diagram.locator("circle, line, polygon").evaluateAll((nodes) => nodes.map((node) => node.outerHTML));

for (const width of [1440, 900]) {
  test(`automatic Penrose geometry labels drag, undo, reopen and print at ${width}px`, async ({ page, browser }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (["warning", "error"].includes(message.type())) errors.push(message.text());
    });
    const draft = assessment(1);
    draft.questions[0].text = "AB is a diameter of a circle with centre O. C lies on the circle and AC=BC.";
    draft.questions[0].contentBlocks = [
      { id: "circle", kind: "diagram", visibility: "student", graphConfig: fixture.student },
      { id: "circle-answer", kind: "diagram", visibility: "solution", graphConfig: fixture.solution },
    ];
    const requests = await setup(page, draft);
    const diagram = diagramFor(page);
    await expect(labelFor(diagram, "C.labelText")).toHaveAttribute("role", "button");
    const originalGeometry = await geometry(diagram);
    const count = requests.length;
    for (const [id, dx, dy] of [
      ["C.labelText", 22, -6],
      ["C.labelText", -6, 0],
      ["diameter.text", 18, 10],
    ]) {
      const label = labelFor(diagram, id);
      const initialOffset = (await configs(page))[0].options.labelOffsets?.[id];
      const before = await drag(page, label, dx, dy);
      await expect.poll(async () => (await configs(page))[0].options.labelOffsets?.[id]).not.toEqual(initialOffset);
      const after = await label.boundingBox();
      expect(after.x - before.x).toBeCloseTo(dx, 0);
      expect(after.y - before.y).toBeCloseTo(dy, 0);
      expect(await geometry(diagram)).toEqual(originalGeometry);
    }
    expect(requests.length).toBe(count); // Label-only moves must not rerun the solver.
    const saved = (await configs(page))[0];
    expect({ ...saved, options: { ...saved.options, labelOffsets: undefined } }).toMatchObject(fixture.student);
    const offset = saved.options.labelOffsets["diameter.text"];
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(async () => (await configs(page))[0].options.labelOffsets?.["diameter.text"]).toBeUndefined();
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect.poll(async () => (await configs(page))[0].options.labelOffsets?.["diameter.text"]).toEqual(offset);
    // Cancelled drags do not create an undo entry or change saved positions.
    const beforeCancel = await labelFor(diagram, "C.labelText").boundingBox();
    await page.mouse.move(beforeCancel.x + 3, beforeCancel.y + 3);
    await page.mouse.down();
    await page.mouse.move(beforeCancel.x + 30, beforeCancel.y + 20);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expectLabelDragFinished(page, labelFor(diagram, "C.labelText"));
    expect((await configs(page))[0].options.labelOffsets).toEqual(saved.options.labelOffsets);
    await diagram.screenshot({ path: info.outputPath(`student-labels-${width}.png`) });
    const reopenedContext = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: { width, height: 1000 } });
    const reopened = await reopenedContext.newPage();
    await setup(reopened, await readDraft(page));
    const reopenedDiagram = diagramFor(reopened);
    await expect(labelFor(reopenedDiagram, "C.labelText")).toHaveAttribute(
      "data-label-offset-x",
      String(saved.options.labelOffsets["C.labelText"][0]),
    );
    const printedOffset = await labelFor(reopenedDiagram, "diameter.text").getAttribute("transform");
    await reopened.evaluate(() => {
      window.__penrosePrinted = false;
      window.print = () => (window.__penrosePrinted = true);
    });
    await reopened.getByRole("button", { name: /^Print mode/ }).click();
    await reopened.waitForFunction(() => window.__penrosePrinted);
    const printed = reopened.locator(".print-preview-stage .penrose-diagram").first();
    await expect(labelFor(printed, "diameter.text")).toHaveAttribute("transform", printedOffset);
    await reopened.emulateMedia({ media: "print" });
    await reopened.pdf({ path: info.outputPath("moved-student-labels.pdf"), preferCSSPageSize: true });
    await reopenedContext.close();
    await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
    await expect(labelFor(diagram, "answerAngle.text")).toHaveAttribute("role", "button");
    await drag(page, labelFor(diagram, "answerAngle.text"), 12, 6);
    await expect.poll(async () => (await configs(page))[1].options.labelOffsets?.["answerAngle.text"]).toBeTruthy();
    expect((await configs(page))[0]).toEqual(saved);
    await diagram.screenshot({ path: info.outputPath(`solution-labels-${width}.png`) });
    const solutionOffset = await labelFor(diagram, "answerAngle.text").getAttribute("transform");
    await page.evaluate(() => {
      window.__penrosePrinted = false;
      window.print = () => (window.__penrosePrinted = true);
    });
    await page.getByRole("button", { name: /^Print mode/ }).click();
    await page.waitForFunction(() => window.__penrosePrinted);
    await expect(
      labelFor(
        page
          .locator(".print-preview-stage .penrose-diagram")
          .filter({ has: page.locator('[data-mauth-penrose-label="answerAngle.text"]') })
          .first(),
        "answerAngle.text",
      ),
    ).toHaveAttribute("transform", solutionOffset);
    await page.emulateMedia({ media: "print" });
    await page.pdf({ path: info.outputPath("moved-solution-labels.pdf"), preferCSSPageSize: true });
    expect(errors).toEqual([]);
  });
}

test("structured Penrose labels retain hidden answers and support keyboard and reset controls", async ({ page }) => {
  const draft = assessment(1);
  const config = {
    type: "geometricConstruction",
    options: { variation: "label-drag-structured", custom: "keep" },
    data: {
      objects: [
        { type: "point", name: "A" },
        { type: "point", name: "B" },
        { type: "point", name: "C" },
        { type: "point", name: "D", solutionOnly: true },
      ],
      relationships: [
        { type: "triangle", points: ["A", "B", "C"] },
        { type: "labelLength", id: "answer", between: ["B", "D"], value: "7", solutionOnly: true },
        { type: "labelLength", id: "shared", between: ["A", "B"], value: "5" },
        { type: "segment", points: ["C", "D"], solutionOnly: true },
      ],
    },
  };
  draft.questions[0].contentBlocks = [{ id: "geo", kind: "diagram", graphConfig: config }];
  await setup(page, draft);
  const diagram = diagramFor(page);
  await expect(labelFor(diagram, "D.labelText")).toHaveCount(0);
  await drag(page, labelFor(diagram, "A.labelText"), 12, 8);
  await expect.poll(async () => (await configs(page))[0].options.labelOffsets?.["A.labelText"]).toBeTruthy();
  expect((await configs(page))[0].data).toEqual(config.data);
  await drag(page, labelFor(diagram, "relationship_shared.text"), 10, 8);
  await expect.poll(async () => (await configs(page))[0].options.labelOffsets?.["relationship_shared.text"]).toBeTruthy();
  const sharedOffset = (await configs(page))[0].options.labelOffsets["relationship_shared.text"];
  await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
  await expect(labelFor(diagram, "relationship_shared.text")).toHaveAttribute("data-label-offset-x", String(sharedOffset[0]));
  await expect(labelFor(diagram, "relationship_answer.text")).toHaveAttribute("data-label-offset-x", "0");
  await page.getByRole("button", { name: "Switch to Student mode", exact: true }).click();
  await expect(diagram).toHaveAttribute("data-mauth-print-render-state", "ready");
  const label = labelFor(diagram, "A.labelText");
  await label.focus();
  const offset = (await configs(page))[0].options.labelOffsets["A.labelText"];
  // A can already be at the right frame boundary after the pointer move.
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await configs(page))[0].options.labelOffsets["A.labelText"][0]).toBeLessThan(offset[0]);
  await expect(label).toBeFocused();
  await expect(page.locator(".diagram-label-feedback")).toHaveCSS("outline-style", "dashed");
  await page.keyboard.press("Home");
  await expect.poll(async () => (await configs(page))[0].options.labelOffsets["A.labelText"]).toEqual([0, 0]);
  await drag(page, label, 2000, -2000);
  await expect(diagram.locator(":scope > svg")).toBeVisible();
  const frame = await diagram.locator(":scope > svg").boundingBox();
  const bounded = await label.boundingBox();
  expect(bounded.x + bounded.width).toBeLessThanOrEqual(frame.x + frame.width);
  expect(bounded.y).toBeGreaterThanOrEqual(frame.y);
  await page.getByRole("button", { name: /^Question 1\. Click/ }).dblclick();
  const header = page
    .locator('[data-panel-region="header"]')
    .filter({ has: page.locator("[data-mauth-diagram-tool]") })
    .first();
  await header.getByRole("button", { name: "Edit Diagram block 1 settings", exact: true }).click();
  await page.getByRole("button", { name: "Reset label positions", exact: true }).click();
  await expect.poll(async () => (await configs(page))[0].options.labelOffsets).toBeUndefined();
  expect((await configs(page))[0].data).toEqual(config.data);
  await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
  await expect(labelFor(diagram, "D.labelText")).toHaveCount(1);
});

test("investigation Penrose labels use the existing document history and preserve page ownership", async ({ page }) => {
  const draft = investigation();
  const pageId = draft.frontMatter.investigation.studentPages[0].id;
  draft.frontMatter.investigation.diagrams = [
    {
      id: "circle",
      title: "Circle geometry",
      caption: "Given relationships",
      pageId,
      page: 1,
      alignment: "center",
      graphConfig: fixture.student,
    },
  ];
  await setup(page, draft);
  const get = async () => (await readDraft(page)).frontMatter.investigation.diagrams[0];
  const diagram = diagramFor(page);
  await drag(page, labelFor(diagram, "C.labelText"), 15, -5);
  await expect.poll(async () => (await get()).graphConfig.options.labelOffsets?.["C.labelText"]).toBeTruthy();
  expect(await get()).toMatchObject({ pageId, title: "Circle geometry", caption: "Given relationships", alignment: "center" });
  expect((await get()).graphConfig.options.substanceSource).toBe(fixture.student.options.substanceSource);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await get()).graphConfig.options.labelOffsets).toBeUndefined();
});
