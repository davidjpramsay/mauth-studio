import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";
import { renderGeometricConstructionDiagram } from "../../packages/diagram-penrose/src/index.mjs";

for (const width of [1440, 900]) {
  test(`diagram tool stays visible when collapsed and after a guarded type change at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const draft = assessment(1);
    draft.questions[0].contentBlocks = [draft.questions[0].contentBlocks.find((block) => block.kind === "diagram")];
    await loadFixture(page, draft);
    await page.getByRole("button", { name: /^Question 1\. Click/ }).dblclick();
    await page.route("**/api/diagram/penrose", async (route) =>
      route.fulfill({ json: await renderGeometricConstructionDiagram(route.request().postDataJSON()) }),
    );
    const contentTab = page.getByRole("tab", { name: "Content", exact: true });
    if (await contentTab.isVisible()) await contentTab.click();
    const header = page.locator('[data-panel-region="header"]').filter({ has: page.locator("[data-mauth-diagram-tool]") });
    await expect(header.locator("[data-mauth-diagram-tool]")).toHaveText("Tool: 2D graph (JSXGraph)");
    await header.getByRole("button", { name: "Collapse panel", exact: true }).click();
    await expect(header.locator("[data-mauth-diagram-tool]")).toBeVisible();
    await expect(header.getByRole("button", { name: "Expand panel", exact: true })).toBeVisible();
    await header.getByRole("button", { name: "Edit Diagram block 1 settings", exact: true }).click();
    const inspector = page.locator("aside").filter({ has: page.locator('select[aria-label="Diagram 1 position"]') });
    await expect(inspector.locator("[data-mauth-diagram-tool]")).toHaveText("Tool: 2D graph (JSXGraph)");
    await inspector.getByText("Change diagram type", { exact: true }).click();
    const select = inspector.getByRole("combobox", { name: "Diagram 1 new type", exact: true });
    await expect(select.locator('option[value="geometricConstruction"]')).toHaveText("Geometric (Penrose)");
    await expect(select.locator('option[value="statsChart"]')).toHaveText("Statistics chart (Plotly)");
    await select.selectOption("geometricConstruction");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("2D graph (JSXGraph)");
    await expect(dialog).toContainText("Geometric (Penrose)");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(select).toHaveValue("graph2d");
    await select.selectOption("geometricConstruction");
    await dialog.getByRole("button", { name: "Change diagram type", exact: true }).click();
    await expect(inspector.locator("[data-mauth-diagram-tool]")).toHaveText("Tool: Geometric (Penrose)");
    if (await contentTab.isVisible()) await contentTab.click();
    await expect(header.locator("[data-mauth-diagram-tool]")).toHaveText("Tool: Geometric (Penrose)");
    await expect(header.locator("[data-mauth-diagram-tool]")).toBeVisible();
    await expect(page.locator(".preview-pane")).not.toContainText("Tool:");
    await page.screenshot({ path: info.outputPath(`diagram-tool-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}
