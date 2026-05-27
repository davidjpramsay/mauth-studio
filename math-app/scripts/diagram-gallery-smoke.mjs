import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const webUrl = process.env.MAUTH_WEB_URL ?? "http://127.0.0.1:5173";
const apiUrl = process.env.MAUTH_API_URL ?? "http://127.0.0.1:8000";
const projectId = process.env.MAUTH_PROJECT_ID ?? "local-project";
const galleryName = process.env.MAUTH_DIAGRAM_GALLERY_NAME ?? "DIAGRAM AUDIT GALLERY";
const outputRoot = process.env.MAUTH_DIAGRAM_GALLERY_OUTPUT ?? "tmp/verification/diagram-gallery";
const questionTargets = (process.env.MAUTH_DIAGRAM_GALLERY_QUESTIONS ?? "1,4,5,6,7,8,10,11,15,16,17")
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0);

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function closeFilesDrawer(page) {
  const closeButton = page.locator('button[aria-label="Close files"]').first();
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click({ timeout: 1500 }).catch(() => undefined);
    return;
  }
  await page.keyboard.press("Escape");
}

async function openFilesDrawer(page) {
  const filesButton = page.getByRole("button", { name: "Open files" }).filter({ hasText: "Files" }).first();
  if (await filesButton.isVisible().catch(() => false)) {
    await filesButton.click();
    return;
  }
  await page.locator('button[aria-label="Open files"]').filter({ hasText: "Files" }).first().click();
}

async function findGalleryTestPath() {
  const response = await fetch(`${apiUrl}/api/storage/projects/${projectId}/files`);
  if (!response.ok) return galleryName;
  const payload = await response.json();
  const files = Array.isArray(payload?.files) ? payload.files : [];
  const galleryFile = files.find((file) => file?.kind === "file" && file?.name === `${galleryName}.test.json`);
  const projectPath = typeof galleryFile?.path === "string" ? galleryFile.path : "";
  return projectPath.startsWith("tests/") ? projectPath.slice("tests/".length) : galleryName;
}

async function openGalleryFromFilesDrawer(page) {
  const testPath = await findGalleryTestPath();
  const pathParts = testPath.split("/").filter(Boolean);
  const fileName = pathParts.pop()?.replace(/\.test\.json$/i, "") || galleryName;

  const rootButton = page.locator('button[title="Open Tests"]').first();
  if (await rootButton.isVisible().catch(() => false)) await rootButton.click();

  for (const folderName of pathParts) {
    const folderRow = page.locator("button").filter({ hasText: folderName }).last();
    await folderRow.dblclick();
  }

  const fileRow = page.locator("button").filter({ hasText: fileName }).last();
  await fileRow.click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
}

async function ensureGalleryOpen(page) {
  await openFilesDrawer(page);
  await openGalleryFromFilesDrawer(page);
  await closeFilesDrawer(page);
  await page.waitForLoadState("networkidle");
}

async function ensureDisplayOnly(page) {
  const displayOnlyButton = page.getByRole("button", { name: "Display only" });
  if ((await displayOnlyButton.getAttribute("aria-pressed")) !== "true") {
    await displayOnlyButton.click({ force: true });
  }
}

async function visibleDocumentText(page) {
  return ((await page.locator("body").textContent()) ?? "").replace(/\s+/g, " ");
}

const outputDir = path.resolve(outputRoot, timestampSlug());
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1 });

const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("dialog", (dialog) => dialog.accept().catch(() => {}));

try {
  await page.goto(webUrl, { waitUntil: "networkidle" });
  await ensureGalleryOpen(page);
  await page.waitForTimeout(5000);
  await ensureDisplayOnly(page);
  await page.waitForTimeout(1500);

  for (const questionNumber of questionTargets) {
    const button = page.locator(`button[aria-label^="Question ${questionNumber}."]`).first();
    await button.click({ force: true });
    await page.waitForTimeout(questionNumber <= 8 ? 3000 : 1500);
    await page.screenshot({ path: path.join(outputDir, `question-${questionNumber}.png`), fullPage: false });
  }

  const text = await visibleDocumentText(page);
  const failurePatterns = [/diagram failed/i, /failed to render/i, /unable to render/i, /error rendering/i];
  const failures = failurePatterns.filter((pattern) => pattern.test(text)).map(String);

  if (failures.length || consoleErrors.length) {
    console.error(`Diagram gallery smoke completed with warnings. Screenshots: ${outputDir}`);
    if (failures.length) console.error(`Visible failure text matched: ${failures.join(", ")}`);
    if (consoleErrors.length) console.error(`Console errors:\n${consoleErrors.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`Diagram gallery smoke passed. Screenshots: ${outputDir}`);
  }
} finally {
  await browser.close();
}
