import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { assessment, loadFixture } from "./fixtures.mjs";
import { renderGeometricConstructionDiagram } from "../../packages/diagram-penrose/src/index.mjs";
const fixture = JSON.parse(fs.readFileSync(new URL("../../packages/diagram-penrose/fixtures/diameter-circle.json", import.meta.url)));

for (const width of [1440, 900]) {
  test(`Penrose circle preserves given and solution layers and exposes inspection at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const draft = assessment(1);
    draft.questions[0].text = "AB is a diameter of a circle with centre O. C lies on the circle and AC=BC. AB=8 cm.";
    draft.questions[0].marks = 0;
    draft.questions[0].contentBlocks = [
      { id: "circle", kind: "diagram", visibility: "student", graphConfig: fixture.student },
      { id: "circle-answer", kind: "diagram", visibility: "solution", markTicks: 0, graphConfig: fixture.solution },
    ];
    await loadFixture(page, draft);
    await page.route("**/api/diagram/penrose", async (route) =>
      route.fulfill({ json: await renderGeometricConstructionDiagram(route.request().postDataJSON()) }),
    );
    const pending = [];
    const responses = [];
    await page.route("**/api/agent/current/browser/requests?**", (route) => route.fulfill({ json: { request: pending.shift() ?? null } }));
    await page.route("**/api/agent/current/browser/respond", async (route) => {
      responses.push(route.request().postDataJSON());
      await route.fulfill({ json: { success: true } });
    });
    await page.reload();
    await expect(page).toHaveTitle(/Mauth/);
    for (const solutions of [false, true]) {
      if (solutions) await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
      const diagram = page.locator(".preview-pane .a4-page .penrose-diagram").filter({ visible: true }).first();
      await expect(diagram).toHaveAttribute("data-mauth-print-render-state", "ready");
      await expect(diagram.locator("title").filter({ hasText: "rightAngleMark" })).toHaveCount(solutions ? 1 : 0);
      const id = solutions ? "circle-answer" : "circle";
      pending.push({
        requestId: `inspection-${solutions}`,
        kind: "validation.run",
        payload: {
          inspectDiagrams: true,
          blockId: id,
          requirements: {
            purpose: "geometry",
            relationships: ["circleMembership", "midpoint", "equalLength"],
            solutionAnnotations: "paired",
          },
        },
      });
      await expect.poll(() => responses.length).toBe(solutions ? 2 : 1);
      const inspection = responses.at(-1).body.diagramInspections[0];
      expect(inspection.construction.schemaIssues).toEqual([]);
      expect(inspection.construction.schemaValid).toBe(true);
      expect(inspection.tool.selectedToolAssessment.eligible).toBe(true);
      expect(inspection.renderedLayout.status).toBe("measured");
      expect(inspection.renderedLayout.issues).toEqual([]);
      expect(inspection.renderedLayout.labelCount).toBeGreaterThanOrEqual(5);
      await diagram.screenshot({ path: info.outputPath(`${solutions ? "solutions" : "student"}-circle-${width}.png`) });
    }
    expect(errors).toEqual([]);
  });
}
