import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";

for (const width of [1440, 900]) {
  test(`End of Test is a page footer during editing and in both printed copies at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const draft = assessment(2);
    draft.frontMatter.titlePageTemplate = "standard";
    draft.formattingConfig.id = "high-school-mathematics-test";
    draft.questions.forEach((question, index) => {
      question.text = "Calculate each value and explain your reasoning.";
      question.parts = [0, 1].map((partIndex) => ({
        id: `p${index}-${partIndex}`,
        text: `Find $${partIndex + 2}^2$.`,
        marks: 1,
        subparts: [],
        contentBlocks: [
          { id: `space-${index}-${partIndex}`, kind: "space", lines: 7 },
          {
            id: `answer-${index}-${partIndex}`,
            kind: "text",
            text: `$${partIndex + 2}^2=${(partIndex + 2) ** 2}$ [[marks:1]]`,
            solutionOnly: true,
          },
        ],
      }));
      question.contentBlocks = index === 1 ? [{ id: "end-marker", kind: "text", text: "**End of Test**" }] : [];
      question.itemOrder = [
        ...question.parts.map((part) => ({ kind: "part", id: part.id })),
        ...(index === 1 ? [{ kind: "block", id: "end-marker" }] : []),
      ];
    });
    await loadFixture(page, draft);
    await expect(page).toHaveTitle("Mauth Studio");
    await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
    const preview = page.locator(".preview-pane .a4-preview-stack");

    async function checkBottom(root) {
      const pages = root.locator(".a4-page");
      await expect(pages).toHaveCount(3);
      const marker = pages.last().locator(".test-end-of-test-segment");
      await expect(marker).toHaveCount(1);
      const content = await pages.last().locator(".a4-page-content").boundingBox();
      const box = await marker.boundingBox();
      expect(Math.abs(content.y + content.height - box.y - box.height)).toBeLessThan(1);
      expect(Math.abs(content.x + content.width / 2 - box.x - box.width / 2)).toBeLessThan(1);
    }
    await checkBottom(preview);
    await page.getByRole("button", { name: /^Question 2\. Click/ }).dblclick();
    await expect(page.locator(".preview-pane")).toHaveClass(/preview-pane-edit-sync/);
    await checkBottom(preview);
    await expect(preview.locator(".a4-page-content > footer.test-end-of-test-footer")).toHaveCount(1);
    await expect(preview.locator(".test-preview-question-group .test-end-of-test-segment")).toHaveCount(0);
    await preview.locator(".test-end-of-test-segment").click();
    await checkBottom(preview);
    await preview
      .locator(".a4-page")
      .last()
      .screenshot({ path: info.outputPath("editing-footer.png") });
    await page.evaluate(() => {
      window.print = () => {
        window.__footerPrinted = true;
      };
    });
    for (const solutions of [false, true]) {
      if (solutions) await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
      await page.evaluate(() => {
        window.__footerPrinted = false;
      });
      await page.getByRole("button", { name: /^Print mode/ }).click();
      await page.waitForFunction(() => window.__footerPrinted);
      await page.emulateMedia({ media: "print" });
      const print = page.locator(".print-preview-stage .a4-preview-stack");
      await checkBottom(print);
      await expect(print.locator("footer.test-end-of-test-footer")).toHaveCount(1);
      await print
        .locator(".a4-page")
        .last()
        .screenshot({ path: info.outputPath(`${solutions ? "solutions" : "student"}-footer.png`) });
      await page.pdf({
        path: info.outputPath(`${solutions ? "solutions" : "student"}-footer.pdf`),
        preferCSSPageSize: true,
        printBackground: true,
      });
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    }
    const withoutMarker = structuredClone(draft);
    withoutMarker.questions[1].contentBlocks = [];
    withoutMarker.questions[1].itemOrder = withoutMarker.questions[1].itemOrder.filter((item) => item.id !== "end-marker");
    await page.evaluate(() => localStorage.clear());
    await loadFixture(page, withoutMarker);
    await expect(page.locator(".preview-pane footer.test-end-of-test-footer")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
