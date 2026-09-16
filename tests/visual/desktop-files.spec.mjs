import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";

test("native Open and Save As preserve tabs and folder ownership", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const noop = () => () => {};
    window.__nextSave = null;
    window.__pickerCount = 0;
    window.__remembered = [];
    window.mauthDesktop = {
      onOpenDocument: (listener) => {
        window.__open = listener;
        return () => {};
      },
      onFileCommand: (listener) => {
        window.__command = listener;
        return () => {};
      },
      onOpenAgentSetup: noop,
      onOpenSystemStatus: noop,
      onOpenSolutionValidation: noop,
      onCloseActiveDocument: noop,
      onToggleTheme: noop,
      openDocuments: async () => {
        window.__pickerCount++;
        return true;
      },
      chooseDocumentSavePath: async () => window.__nextSave,
      rememberDocument: async (path) => window.__remembered.push(path),
    };
  });
  await loadFixture(page, assessment(0));
  const writes = [];
  const project = (folder) => ({ id: "default", name: folder, documentsPath: folder, workspacePath: folder, fileCount: 1 });
  const files = new Map();
  await page.route("**/api/storage/projects/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.method() === "GET" ? null : request.postDataJSON();
    if (url.pathname.endsWith("open-document")) {
      const folder = body.path.slice(0, body.path.lastIndexOf("/"));
      const name = body.path.split("/").at(-1);
      const content = JSON.stringify({
        ...assessment(0),
        id: name,
        name,
        frontMatter: { titlePageTemplate: "worksheet", assessmentTitle: name },
      });
      const document = { path: `tests/${name}`, revision: 1, content, kind: "file", fileType: "test" };
      files.set(body.path, document);
      return route.fulfill({ json: { project: project(folder), document } });
    }
    if (url.pathname.endsWith("document-save-target")) {
      return route.fulfill({ json: { project: project("/Destination"), path: "tests/Copy.mauth", revision: null, contentHash: null } });
    }
    if (request.method() === "PUT" && url.pathname.includes("/files/")) {
      writes.push({ folder: url.searchParams.get("documentsPath"), path: decodeURIComponent(url.pathname.split("/files/")[1]), body });
      return route.fulfill({
        json: { path: writes.at(-1).path, revision: writes.length + 1, content: body.content, kind: "file", fileType: "test" },
      });
    }
    if (url.pathname.endsWith("file-summary")) {
      return route.fulfill({ json: { path: url.searchParams.get("path"), revision: 1, kind: "file" } });
    }
    return route.fallback();
  });
  await page.getByRole("button", { name: "Open files", exact: true }).first().click();
  expect(await page.evaluate(() => window.__pickerCount)).toBe(1);
  await expect(page.getByRole("heading", { name: "Files", exact: true })).toHaveCount(0);
  await page.evaluate(() => window.__open("/SchoolA/First.mauth"));
  await expect(page.locator("[data-document-tab-id]")).toHaveCount(2);
  await page.evaluate(() => window.__open("/SchoolB/Second.mauth"));
  await expect(page.locator("[data-document-tab-id]")).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => window.__remembered.length)).toBe(2);
  await page.evaluate(() => window.__command("save-as"));
  await page.waitForTimeout(100);
  expect(writes).toHaveLength(0);
  await page.evaluate(() => {
    window.__nextSave = "/SchoolA/First.mauth";
    window.__command("save-as");
  });
  await expect(page.getByRole("dialog", { name: "Document could not be saved" })).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByRole("dialog").getByRole("button", { name: "OK" }).click();
  await page.evaluate(() => {
    window.__nextSave = "/Destination/Copy.mauth";
    window.__command("save-as");
  });
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].folder).toBe("/Destination");
  expect(writes[0].body.baseRevision).toBeNull();
  expect(writes[0].body.expectedContentHash).toBeNull();
  await expect(page.locator("[data-document-tab-id]")).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => window.__remembered.at(-1))).toBe("/Destination/Copy.mauth");
  await page.evaluate(() => window.__command("save"));
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].folder).toBe("/Destination");
  expect(writes[1].body.baseRevision).toBe(2);
  await page.locator("[data-document-tab-id]").filter({ hasText: "First" }).click();
  await page.evaluate(() => window.__command("save"));
  await expect.poll(() => writes.length).toBe(3);
  expect(writes[2].folder).toBe("/SchoolA");
  expect(writes[2].path).toBe("tests/First.mauth");
  expect(errors).toEqual([]);
});
