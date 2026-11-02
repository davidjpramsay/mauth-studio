import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";

for (const environment of ["aligned", "align", "align*"]) {
  test(`${environment} solution ticks follow actual row baselines on screen and in print`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const fixture = assessment(1);
    fixture.questions[0].marks = 4;
    fixture.questions[0].contentBlocks = [
      { id: "working", kind: "space", lines: 12, visibility: "student" },
      {
        id: "answer",
        kind: "text",
        visibility: "solution",
        text: String.raw`$$\begin{aligned}
f(x)&=6x^{-2}\\[3pt]
f'(x)&=-12x^{-3} [[marks:1]]\\[3pt]
&=-\dfrac{12}{x^3} [[marks:2]]
\end{aligned}$$
Existing tick style [[marks:1]]`.replaceAll("{aligned}", `{${environment}}`),
      },
    ];
    await loadFixture(page, fixture);
    await expect(page).toHaveTitle(/Mauth/);
    await expect(page.locator(".solution-row-marks").filter({ visible: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
    const visibleAnswer = page.locator(".test-visibility-slot-copy:not(.test-visibility-slot-copy-hidden) .mathjax-aligned-marks").first();
    await expect(visibleAnswer).toBeVisible();
    async function checkRows(scope) {
      const aligned = scope.locator(".mathjax-aligned-marks").first();
      await expect(aligned.locator(".solution-row-marks text")).toHaveCount(3);
      await expect(aligned.locator('mjx-container g[data-mml-node="mtable"]')).toHaveCount(1);
      await expect(aligned.locator('.solution-row-marks [data-solution-row="0"]')).toHaveCount(0);
      const tickFonts = await scope.first().evaluate((element) => {
        const ordinary = getComputedStyle(element.querySelector(".solution-mark-ticks"));
        const aligned = getComputedStyle(element.querySelector(".solution-row-marks text"));
        return {
          ordinary: { family: ordinary.fontFamily, weight: ordinary.fontWeight },
          aligned: { family: aligned.fontFamily, weight: aligned.fontWeight },
        };
      });
      expect(tickFonts.aligned).toEqual(tickFonts.ordinary);
      const offsets = await aligned.evaluate((element) => {
        const rows = [...element.querySelector('mjx-container g[data-mml-node="mtable"]').children];
        return [...element.querySelectorAll(".solution-row-marks [data-solution-row]")].map((group) => {
          const row = rows[Number(group.dataset.solutionRow)];
          const rowOrigin = new DOMPoint(0, 0).matrixTransform(row.getScreenCTM());
          const tick = group.querySelector("text:last-child");
          const tickOrigin = new DOMPoint(Number(tick.getAttribute("x")), Number(tick.getAttribute("y"))).matrixTransform(
            tick.getScreenCTM(),
          );
          return { dy: Math.abs(rowOrigin.y - tickOrigin.y), right: tickOrigin.x, edge: element.getBoundingClientRect().right };
        });
      });
      for (const offset of offsets) {
        expect(offset.dy).toBeLessThan(0.25);
        expect(Math.abs(offset.right - offset.edge)).toBeLessThan(1);
      }
      await expect(scope.locator('[data-mml-node="merror"],.mathjax-error')).toHaveCount(0);
    }
    await checkRows(page.locator(".test-visibility-slot-copy:not(.test-visibility-slot-copy-hidden)"));
    await page.setViewportSize({ width: 1000, height: 900 });
    await checkRows(page.locator(".test-visibility-slot-copy:not(.test-visibility-slot-copy-hidden)"));
    await page.evaluate(() => {
      window.print = () => {
        window.__printed = true;
      };
    });
    await page.getByRole("button", { name: /^Print mode/ }).click();
    await page.waitForFunction(() => window.__printed);
    await page.emulateMedia({ media: "print" });
    await checkRows(page.locator(".print-preview-stage"));
    await page.pdf({ path: testInfo.outputPath("aligned-marks.pdf"), preferCSSPageSize: true, printBackground: true });
    await page.screenshot({ path: testInfo.outputPath("aligned-marks.png"), fullPage: true });
    expect(errors).toEqual([]);
  });
}
