import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";
import { renderGeometricConstructionDiagram } from "../../packages/diagram-penrose/src/index.mjs";

for (const totalsSolutionOnly of [false, true]) {
  test(`three-set Venn uses clear curved total tabs with ${totalsSolutionOnly ? "answer" : "given"} totals`, async ({ page }, info) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const fixture = assessment(1);
    fixture.questions[0].contentBlocks = [
      {
        id: "venn",
        kind: "diagram",
        graphConfig: {
          type: "setDiagram",
          scalePercent: 115,
          data: {
            setCount: 3,
            totalsSolutionOnly,
            universe: { name: "U", label: "U", countLabel: "40" },
            sets: [
              { name: "M", label: "M", countLabel: "22" },
              { name: "A", label: "A", countLabel: "20" },
              { name: "C", label: "C", countLabel: "18" },
            ],
            regions: [
              { name: "onlyA", label: "8", solutionOnly: true },
              { name: "onlyB", label: "5", solutionOnly: true },
              { name: "onlyC", label: "5", solutionOnly: true },
              { name: "onlyAB", label: "6" },
              { name: "onlyAC", label: "4" },
              { name: "onlyBC", label: "5" },
              { name: "intersection", label: "4" },
              { name: "outside", label: "3", solutionOnly: true },
            ],
          },
        },
      },
    ];
    await loadFixture(page, fixture);
    await page.route("**/api/diagram/penrose", async (route) =>
      route.fulfill({ json: await renderGeometricConstructionDiagram(route.request().postDataJSON()) }),
    );
    await page.reload();
    await expect(page).toHaveTitle(/Mauth/);
    for (const solutions of [false, true]) {
      if (solutions) await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
      const diagram = page.locator(".preview-pane .a4-page .penrose-diagram").first();
      await expect(diagram).toHaveAttribute("data-mauth-print-render-state", "ready");
      await expect(diagram.locator('[data-badge-kind="box"]')).toHaveCount(1);
      await expect(diagram.locator('[data-role="set-count-badge"] path')).toHaveCount(3);
      const expected = totalsSolutionOnly && !solutions ? ["", "", "", ""] : ["40", "22", "20", "18"];
      await expect(diagram.locator('[data-role="set-count-badge"] text')).toHaveText(expected);
      // Every label stays inside the canvas and clear of all other labels and
      // count-tab borders, including the formerly obscured lower-set C.
      const layout = await diagram.locator("svg").evaluate((svg) => {
        const frame = svg.getBoundingClientRect();
        const labels = [...svg.querySelectorAll("text")]
          .filter((node) => node.textContent.trim())
          .map((node) => ({ text: node.textContent, box: node.getBoundingClientRect() }));
        const clipped = labels
          .filter(({ box }) => box.left < frame.left || box.top < frame.top || box.right > frame.right || box.bottom > frame.bottom)
          .map(({ text }) => text);
        const overlaps = [];
        for (let a = 0; a < labels.length; a++)
          for (let b = a + 1; b < labels.length; b++) {
            const first = labels[a].box,
              second = labels[b].box;
            if (first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top)
              overlaps.push([labels[a].text, labels[b].text]);
          }
        const c = labels.find(({ text }) => text === "C").box;
        const cap = svg.querySelector('[data-badge-kind="bottom-tab"] path').getBoundingClientRect();
        return { clipped, overlaps, cClearOfCap: c.left > cap.right + 3 };
      });
      expect(layout).toEqual({ clipped: [], overlaps: [], cClearOfCap: true });
      if (!totalsSolutionOnly)
        await expect(diagram).toHaveScreenshot(`venn-three-curved-totals-${solutions ? "solutions" : "student"}.png`);
      await page.evaluate(() => {
        window.__vennPrinted = false;
        window.print = () => (window.__vennPrinted = true);
      });
      await page.getByRole("button", { name: /^Print mode/ }).click();
      await page.waitForFunction(() => window.__vennPrinted);
      await page.emulateMedia({ media: "print" });
      const printed = page.locator(".print-preview-stage .penrose-diagram");
      await expect(printed.locator('[data-role="set-count-badge"] path')).toHaveCount(3);
      await expect(printed.locator('[data-role="set-count-badge"] text')).toHaveText(expected);
      await page.pdf({
        path: info.outputPath(`${solutions ? "solutions" : "student"}.pdf`),
        preferCSSPageSize: true,
        printBackground: true,
      });
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    }
    expect(errors).toEqual([]);
  });
}
