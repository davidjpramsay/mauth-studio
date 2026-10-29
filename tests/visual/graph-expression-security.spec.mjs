import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";

test("imported graph expressions cannot execute code during preview", async ({ page }) => {
  const draft = assessment(4);
  const payload = "globalThis.__graphSecurityProbe++";
  const configs = [
    { functions: [{ expression: "x^2", color: "#b21f45", show: true }] },
    { functions: [{ expression: payload, show: true }] },
    { functions: [{ kind: "relation", expression: payload, show: true }] },
    { functions: [], data: { slopeField: { expression: payload, show: true } } },
  ];
  for (const [index, question] of draft.questions.entries()) {
    const graph = question.contentBlocks.find((block) => block.kind === "diagram");
    Object.assign(graph.graphConfig, configs[index]);
    question.contentBlocks = [graph];
  }
  await page.addInitScript(() => {
    globalThis.__graphSecurityProbe = 0;
  });
  await loadFixture(page, draft);
  const graphs = page.locator('.preview-pane .a4-page div.overflow-hidden[id^="jxg-"]');
  await expect(graphs).toHaveCount(4);
  await expect.poll(() => page.evaluate(() => globalThis.__graphSecurityProbe)).toBe(0);
  await expect(graphs.first().locator('svg path[stroke="#b21f45"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
  await expect(graphs).toHaveCount(4);
  expect(await page.evaluate(() => globalThis.__graphSecurityProbe)).toBe(0);
});

test("hostile slope field ranges and lists cannot stall preview", async ({ page }) => {
  const draft = assessment(2);
  const fields = [
    { expression: "x+y", xRange: [1e20, 1e20 + 1e8], xStep: 0.001, yRange: [-2, 2], yStep: 1 },
    { expression: "x+y", xValues: Array.from({ length: 421 }, (_, index) => index), yValues: [0, 1] },
  ];
  for (const [index, question] of draft.questions.entries()) {
    const graph = question.contentBlocks.find((block) => block.kind === "diagram");
    graph.graphConfig.functions = [];
    graph.graphConfig.data = { slopeField: fields[index] };
    question.contentBlocks = [graph];
  }
  await loadFixture(page, draft);
  await expect(page.locator('.preview-pane .a4-page div.overflow-hidden[id^="jxg-"]')).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Switch to Solutions mode", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
  await expect(page.getByRole("button", { name: "Switch to Student mode", exact: true })).toBeEnabled();
});
