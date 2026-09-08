import { test, expect } from "@playwright/test";
import { assessment, investigation, loadFixture } from "./fixtures.mjs";
import { readFile } from "node:fs/promises";

test("large assessment performance", async ({ page }, testInfo) => {
  const started = performance.now();
  await loadFixture(page, assessment(30));
  await page.locator('[id^="jxg-"] svg').first().waitFor();
  const metrics = await page.evaluate(() => ({
    resources: performance
      .getEntriesByType("resource")
      .filter((item) => item.name.includes("/assets/"))
      .map((item) => ({ name: item.name.split("/").at(-1), bytes: item.decodedBodySize, durationMs: Math.round(item.duration) })),
    domNodes: document.querySelectorAll("*").length,
  }));
  metrics.firstGraphMs = Math.round(performance.now() - started);
  const switching = performance.now();
  await page.getByRole("button", { name: "Switch to Solutions mode", exact: true }).click();
  await page.getByRole("button", { name: "Switch to Student mode", exact: true }).waitFor();
  metrics.switchCopyMs = Math.round(performance.now() - switching);
  const editing = performance.now();
  await page.getByRole("button", { name: /^Question 1\. Click/ }).dblclick();
  const wording = page.getByRole("textbox").filter({ visible: true }).first();
  await wording.fill("Updated question wording for the performance check.");
  metrics.editMs = Math.round(performance.now() - editing);
  console.log("MAUTH_PERFORMANCE", JSON.stringify(metrics));
  await testInfo.attach("performance", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" });
});

test("blank documents do not download diagram engines", async ({ page }) => {
  await loadFixture(page, { ...assessment(0) });
  await page.evaluate(() => document.fonts.ready);
  const resources = await page.evaluate(() => performance.getEntriesByType("resource").map((item) => item.name));
  expect(resources.some((url) => /assets\/(jsxgraph|plotly|FunctionGraph|Basic3DGraph)-/.test(url))).toBe(false);
});

test("hidden solutions cannot widen or shrink Student print pages", async ({ page }) => {
  const fixture = assessment(1);
  fixture.questions[0].contentBlocks = [
    { id: "student-space", kind: "space", lines: 5, visibility: "student" },
    { id: "long-solution", kind: "text", solutionOnly: true, text: `$${Array(18).fill("\\dfrac{123}{456}").join("+")}$` },
  ];
  await loadFixture(page, fixture);
  await page.evaluate(() => {
    window.print = () => {
      window.__printed = true;
    };
  });
  await page.getByRole("button", { name: /^Print mode/ }).click();
  await page.waitForFunction(() => window.__printed);
  await page.emulateMedia({ media: "print" });
  const printedPage = page.locator(".print-preview-stage .a4-page:visible").first();
  const dimensions = await printedPage.evaluate((element) => {
    const hidden = element.querySelector(".test-visibility-slot-copy-hidden");
    const formula = hidden.querySelector("svg");
    return {
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      hiddenWidth: hidden.clientWidth,
      hiddenHeight: hidden.clientHeight,
      formulaWidth: formula.getBoundingClientRect().width,
    };
  });
  expect(dimensions.formulaWidth).toBeGreaterThan(dimensions.hiddenWidth);
  expect(dimensions.hiddenHeight).toBeGreaterThan(0);
  const controlWidths = await printedPage.evaluate((element) => {
    const hidden = element.querySelector(".test-visibility-slot-copy-hidden");
    hidden.style.display = "none";
    const withoutSolution = element.scrollWidth;
    hidden.style.removeProperty("display");
    hidden.style.overflow = "visible";
    const unclipped = element.scrollWidth;
    hidden.style.removeProperty("overflow");
    return { withoutSolution, unclipped };
  });
  expect(dimensions.scrollWidth).toBe(controlWidths.withoutSolution);
  expect(controlWidths.unclipped).toBeGreaterThan(dimensions.scrollWidth + 100);
});

test("print failure offers Cancel and Retry without printing incomplete content", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await loadFixture(page, assessment(1));
  const title = await page.title();
  await page.evaluate(() => {
    window.__printCount = 0;
    window.__failPrint = true;
    window.print = () => {
      window.__printCount++;
    };
    new MutationObserver(() => {
      const stage = document.querySelector(".print-preview-stage");
      if (!stage || !window.__failPrint || stage.querySelector("[data-fixture-failure]")) return;
      const marker = document.createElement("div");
      marker.setAttribute("data-mauth-print-render-state", "error");
      marker.setAttribute("data-fixture-failure", "true");
      stage.append(marker);
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole("button", { name: /^Print mode/ }).click();
  const dialog = page.getByRole("dialog", { name: "Print preview not ready" });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => window.__printCount)).toBe(0);
  await expect(dialog).toHaveScreenshot("print-failure-compact.png");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveTitle(title);
  await expect(page.locator(".print-preview-stage")).toHaveCount(0);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+p" : "Control+p");
  await expect(dialog).toBeVisible();
  await page.evaluate(() => {
    window.__failPrint = false;
  });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.waitForFunction(() => window.__printCount === 1);
});

for (const kind of ["geometricConstruction", "image"]) {
  test(`printing waits for asynchronous ${kind} and refuses render errors`, async ({ page }) => {
    const fixture = assessment(1);
    fixture.questions[0].contentBlocks = [
      {
        id: "async-diagram",
        kind: "diagram",
        graphConfig: { type: kind, data: { src: "/fixture-image.png" }, widthPx: 200, heightPx: 160 },
      },
    ];
    await loadFixture(page, fixture);
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    let failing = true;
    await page.route(kind === "image" ? "**/fixture-image.png" : "**/api/diagram/penrose", async (route) => {
      await pending;
      if (failing) return route.fulfill({ status: 503, body: "Unavailable" });
      if (kind === "image")
        return route.fulfill({
          contentType: "image/png",
          body: await readFile(new URL("./baselines/darwin/assessment-student-1.png", import.meta.url)),
        });
      return route.fulfill({
        json: {
          svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="160"><path d="M10 140 L100 10 L190 140 Z" fill="none" stroke="black"/></svg>',
          metadata: { displayWidth: 200, displayHeight: 160 },
        },
      });
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("[data-document-tab-id]").first().waitFor();
    await page.evaluate(() => {
      window.__printCount = 0;
      window.print = () => {
        window.__printCount++;
      };
    });
    await page.getByRole("button", { name: /^Print mode/ }).click();
    await expect(page.locator('.print-preview-stage [data-mauth-print-render-state="loading"]').first()).toBeAttached();
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__printCount)).toBe(0);
    release();
    await expect(page.getByRole("dialog", { name: "Print preview not ready" })).toBeVisible();
    expect(await page.evaluate(() => window.__printCount)).toBe(0);
    failing = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.waitForFunction(() => window.__printCount === 1);
  });
}

for (const [name, makeDocument] of [
  ["assessment", assessment],
  ["investigation", investigation],
]) {
  test(`${name} Student and Solutions print pages`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await loadFixture(page, makeDocument());
    await page.evaluate(() => {
      window.print = () => {
        window.__printed = true;
      };
    });
    for (const copy of ["student", "solutions"]) {
      if (copy === "solutions") await page.getByRole("button", { name: /Switch to (Solutions|Teacher) mode/, exact: false }).click();
      await page.getByRole("button", { name: /Print/, exact: false }).first().click();
      await page.waitForFunction(() => window.__printed === true);
      await page.emulateMedia({ media: "print" });
      const stage = page.locator(".print-preview-stage");
      const pages = stage.locator(".a4-page:visible");
      const count = await pages.count();
      expect(count).toBe(name === "assessment" || copy === "solutions" ? 2 : 1);
      for (let index = 0; index < count; index++) await expect(pages.nth(index)).toHaveScreenshot(`${name}-${copy}-${index + 1}.png`);
      const pdf = await page.pdf({ path: testInfo.outputPath(`${name}-${copy}.pdf`), preferCSSPageSize: true, printBackground: true });
      expect(pdf.length).toBeGreaterThan(1000);
      await testInfo.attach(`${name}-${copy}`, { body: pdf, contentType: "application/pdf" });
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => {
        window.__printed = false;
        window.dispatchEvent(new Event("afterprint"));
      });
    }
    expect(errors).toEqual([]);
  });
}
