import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";

for (const width of [1440, 1100, 800]) {
  test(`Settings Content button returns to the selected block at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await loadFixture(page, assessment(1));
    await expect(page).toHaveTitle(/Mauth/);
    await page.getByRole("button", { name: /^Question 1\. Click/ }).dblclick();
    const contentTab = page.getByRole("tab", { name: "Content", exact: true });
    if (await contentTab.isVisible()) await contentTab.click();
    const header = page.locator('[data-panel-region="header"]').filter({ has: page.locator('[data-mauth-diagram-tool="graph2d"]') });
    await header.getByRole("button", { name: "Collapse panel", exact: true }).click();
    await expect(header.getByRole("button", { name: "Expand panel", exact: true })).toBeVisible();
    const settingsButton = header.getByRole("button", { name: /Edit Diagram block \d+ settings/ });
    await settingsButton.click();
    const inspector = page.locator("#mauth-inspector-pane");
    await expect(inspector).toBeVisible();
    // Wait for the imported fixture's initial normalisation to reach recovery
    // storage before comparing navigation-only changes against that baseline.
    await expect
      .poll(() =>
        page.evaluate(() => JSON.parse(localStorage.getItem("mauth-studio.current-draft.v1")).questions[0].contentBlocks[0].visibility),
      )
      .toBe("solution");
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("mauth-studio.current-draft.v1")));
    await inspector.getByRole("button", { name: "Content", exact: true }).click();
    await expect(inspector).toHaveCount(0);
    await expect(header).toBeInViewport();
    await expect(header.getByRole("button", { name: "Collapse panel", exact: true })).toBeVisible();
    await expect(page.locator("#mauth-editor-pane")).toBeFocused();
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem("mauth-studio.current-draft.v1")));
    expect(after.questions).toEqual(before.questions);
    // Reopening settings must remain available after returning to content.
    await settingsButton.click();
    await expect(inspector).toBeVisible();
    const back = inspector.getByRole("button", { name: "Content", exact: true });
    await back.focus();
    await page.keyboard.press("Enter");
    await expect(inspector).toHaveCount(0);
    await expect(page.locator("#mauth-editor-pane")).toBeFocused();
    await expect(header).toBeInViewport();
    await expect(header.getByRole("button", { name: "Collapse panel", exact: true })).toBeVisible();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    await header.screenshot({ path: info.outputPath(`return-header-${width}.png`) });
    await page.screenshot({ path: info.outputPath(`content-return-${width}.png`), fullPage: false });
    expect(errors).toEqual([]);
  });
}

test("Content return also closes empty Settings and focuses the editor", async ({ page }) => {
  await loadFixture(page, assessment(1));
  await page.getByRole("button", { name: /^Question 1\. Click/ }).dblclick();
  const inspector = page.locator("#mauth-inspector-pane");
  await expect(inspector).toContainText("Nothing selected");
  await inspector.getByRole("button", { name: "Content", exact: true }).click();
  await expect(inspector).toHaveCount(0);
  await expect(page.locator("#mauth-editor-pane")).toBeFocused();
});
