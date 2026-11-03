import { test, expect } from "@playwright/test";
import { assessment, investigation, loadFixture } from "./fixtures.mjs";

// Browser plugin not available. This isolated renderer test mocks only native IPC;
// installed acceptance uses MCP and Electron's actual printToPDF.
async function setup(page, fixture, desktop = true) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loadFixture(page, fixture);
  const pending = [],
    responses = [];
  await page.route("**/api/agent/current/browser/requests?**", async (route) => {
    if (!pending.length) await new Promise((resolve) => setTimeout(resolve, 30));
    await route.fulfill({ json: { request: pending.shift() ?? null } });
  });
  await page.route("**/api/agent/current/browser/respond", async (route) => {
    responses.push(route.request().postDataJSON());
    await route.fulfill({ json: { success: true } });
  });
  await page.reload();
  await expect(page.locator("[data-document-tab-id]").first()).toBeVisible();
  if (desktop)
    await page.evaluate(() => {
      window.__exports = [];
      window.mauthDesktop = {
        exportPdf: async (payload) => {
          // Electron can emit these events: they must not replace the captured copy.
          window.dispatchEvent(new Event("beforeprint"));
          const stage = document.querySelector(".print-preview-stage").cloneNode(true);
          stage.querySelectorAll(".test-visibility-slot-copy-hidden").forEach((node) => node.remove());
          window.__exports.push({ payload, text: stage.textContent });
          window.dispatchEvent(new Event("afterprint"));
          return {
            id: "36138019-6e3e-4843-9840-c134411b99f8",
            filename: "proof.pdf",
            path: "/isolated/proof.pdf",
            bytes: 32,
            sha256: "a".repeat(64),
            mimeType: "application/pdf",
          };
        },
        readPdf: async () => ({ blob: "JVBERg==", mimeType: "application/pdf" }),
      };
    });
  let counter = 0;
  async function request(kind, payload = {}) {
    const requestId = `pdf-${counter++}`;
    pending.push({ requestId, kind, payload });
    await expect.poll(() => responses.find((item) => item.requestId === requestId), { timeout: 25000 }).toBeTruthy();
    return responses.find((item) => item.requestId === requestId);
  }
  return { request, errors };
}

test("MCP export captures either copy and preserves the active document, mode and dirty state", async ({ page }) => {
  const fixture = assessment(2);
  fixture.questions[0].contentBlocks[0].text = "Worked answer for PDF verification\n$105^\\circ$";
  const { request, errors } = await setup(page, fixture);
  const before = (await request("snapshot")).body;
  const student = await request("pdf.export", { copy: "student", baseSnapshotId: before.snapshotId });
  expect(student.status, JSON.stringify(student)).toBe(200);
  expect(student.body.artifact.pages).toBe(2);
  const solutions = await request("pdf.export", { copy: "solutions" });
  expect(solutions.status).toBe(200);
  const output = await page.evaluate(() => window.__exports);
  expect(output[0].text).not.toContain("Worked answer for PDF verification");
  expect(output[1].text).toContain("Worked answer for PDF verification");
  expect(output[0].payload.title).toMatch(/Student$/);
  expect(output[1].payload.title).toMatch(/Solutions$/);
  const after = (await request("snapshot")).body;
  expect(after.snapshotId).toBe(before.snapshotId);
  expect(after.file).toEqual(before.file);
  expect(after.openDocuments).toEqual(before.openDocuments);
  expect(await page.locator(".print-preview-stage").count()).toBe(0);
  expect((await request("pdf.export", { baseSnapshotId: "stale" })).status).toBe(409);
  expect((await request("pdf.export", { documentId: "missing" })).status).toBe(404);
  expect(errors).toEqual([]);
});

test("investigation Teacher PDF includes rubric without changing Student view", async ({ page }) => {
  const { request, errors } = await setup(page, investigation());
  expect((await request("pdf.export", { copy: "student" })).body.artifact.pages).toBe(1);
  expect((await request("pdf.export", { copy: "teacher" })).body.artifact.pages).toBe(2);
  expect((await page.evaluate(() => window.__exports))[1].text).toContain("Planning and mathematical formulation");
  expect(errors).toEqual([]);
});

test("MCP export fails clearly in browser-only editor", async ({ page }) => {
  const { request } = await setup(page, assessment(1), false);
  expect((await request("pdf.export")).body.code).toBe("DESKTOP_REQUIRED");
});

test("PDF export blocks an oversized question block and cleans up the print stage", async ({ page }) => {
  const fixture = assessment(1);
  fixture.questions[0].contentBlocks = [{ id: "too-tall", kind: "text", text: "A line of content\n".repeat(200) }];
  const { request } = await setup(page, fixture);
  expect((await request("pdf.export")).body.code).toBe("PRINT_LAYOUT_OVERFLOW");
  expect(await page.locator(".print-preview-stage").count()).toBe(0);
  expect((await page.evaluate(() => window.__exports)).length).toBe(0);
});

test("PDF export blocks failed diagram rendering", async ({ page }) => {
  const fixture = assessment(1);
  fixture.questions[0].contentBlocks = [
    { id: "failed", kind: "diagram", graphConfig: { type: "network", data: { nodes: [{ id: "a", label: "A" }], edges: [] } } },
  ];
  const { request } = await setup(page, fixture);
  const response = await request("pdf.export");
  expect(response.body.code, JSON.stringify(response)).toBe("PRINT_NOT_READY");
  expect((await page.evaluate(() => window.__exports)).length).toBe(0);
});

test("Math Notes exports the single notes copy", async ({ page }) => {
  const fixture = assessment(1);
  fixture.frontMatter.titlePageTemplate = "notes";
  fixture.formattingConfig.id = "notes";
  const { request } = await setup(page, fixture);
  expect((await request("pdf.export", { copy: "solutions" })).status).toBe(400);
  expect((await request("pdf.export", { copy: "student" })).status).toBe(200);
});

test("dark app theme prints white paper without changing the screen theme", async ({ page }, info) => {
  const { request } = await setup(page, assessment(1), false);
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
    window.__printed = false;
    window.print = () => {
      window.__printed = true;
    };
  });
  await page.getByRole("button", { name: /^Print mode/ }).click();
  await page.waitForFunction(() => window.__printed);
  await page.emulateMedia({ media: "print" });
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");
  await page.pdf({ path: info.outputPath("dark-theme-white-paper.pdf"), preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: "screen" });
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  expect((await request("snapshot")).body.success).toBe(true);
});
