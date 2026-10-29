import { expect, test } from "@playwright/test";

export async function expectLabelDragFeedback(page, label) {
  const active = page.locator('[data-mauth-label-dragging="true"]');
  await expect(active).toHaveCount(1);
  expect(await label.evaluate((node) => Boolean(node.closest('[data-mauth-label-dragging="true"]')))).toBe(true);
  const feedback = page.locator("body > .diagram-label-feedback");
  await expect(feedback).toHaveCount(1);
  await expect(active).toHaveCSS("outline-style", "none");
  await expect(feedback).toHaveCSS("outline-style", "dashed");
  await expect(feedback).toHaveCSS("outline-width", "1px");
  await expect(feedback).toHaveCSS("outline-color", "rgb(37, 99, 235)");
  await expect(feedback).toHaveCSS("outline-offset", "3px");
  // Check the actual screen-space rectangle, including SVG transforms and
  // preview zoom. The previous CSS-only check missed Penrose's viewBox scale.
  expect(await feedback.evaluate((node) => node.currentCSSZoom || 1)).toBe(1);
  await expect
    .poll(async () => {
      const target = await active.boundingBox();
      const box = await feedback.boundingBox();
      return Math.max(...["x", "y", "width", "height"].map((key) => Math.abs(box[key] - target[key])));
    })
    .toBeLessThan(0.1);
  const diagram = label.locator(
    'xpath=ancestor::*[(starts-with(@id,"jxg-") and not(contains(@id,"_"))) or @data-mauth-diagram-type="graph3d" or contains(@class,"penrose-diagram")][1]',
  );
  await diagram.screenshot({ path: test.info().outputPath("active-label-outline.png") });
  // A print initiated during a drag must never include editing feedback.
  await page.emulateMedia({ media: "print" });
  await expect(feedback).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await expect(feedback).toBeVisible();
}

export async function expectLabelDragFinished(page, label) {
  await expect(page.locator('[data-mauth-label-dragging="true"]')).toHaveCount(0);
  await expect(label).toHaveCSS("outline-style", "none");
  await expect(page.locator(".diagram-label-feedback")).toHaveCount(0);
}
