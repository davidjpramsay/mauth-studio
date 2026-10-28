import { expect, test } from "@playwright/test";

export async function expectLabelDragFeedback(page, label) {
  const active = page.locator('[data-mauth-label-dragging="true"]');
  await expect(active).toHaveCount(1);
  expect(await label.evaluate((node) => Boolean(node.closest('[data-mauth-label-dragging="true"]')))).toBe(true);
  await expect(active).toHaveCSS("outline-style", "dashed");
  // Chromium rounds thin outlines to a screen pixel at compact preview zoom.
  const screenWidth = await active.evaluate((node) => parseFloat(getComputedStyle(node).outlineWidth) * (node.currentCSSZoom || 1));
  expect(screenWidth).toBeCloseTo(1, 1);
  await expect(active).toHaveCSS("outline-color", "rgb(37, 99, 235)");
  const gap = await active.evaluate((node) => parseFloat(getComputedStyle(node).outlineOffset) * (node.currentCSSZoom || 1));
  expect(gap).toBeGreaterThan(0);
  expect(gap).toBeLessThanOrEqual(3);
  const diagram = label.locator(
    'xpath=ancestor::*[(starts-with(@id,"jxg-") and not(contains(@id,"_"))) or @data-mauth-diagram-type="graph3d" or contains(@class,"penrose-diagram")][1]',
  );
  await diagram.screenshot({ path: test.info().outputPath("active-label-outline.png") });
  // A print initiated during a drag must never include editing feedback.
  await page.emulateMedia({ media: "print" });
  await expect(active).toHaveCSS("outline-style", "none");
  await page.emulateMedia({ media: "screen" });
  await expect(active).toHaveCSS("outline-style", "dashed");
}

export async function expectLabelDragFinished(page, label) {
  await expect(page.locator('[data-mauth-label-dragging="true"]')).toHaveCount(0);
  await expect(label).toHaveCSS("outline-style", "none");
}
