import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = await mkdtemp(path.join(os.tmpdir(), "mauth-opening-smoke-"));
const children = [];
const logs = [];
let browser;
let apiUrl;
let webUrl;

async function port() {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const value = server.address().port;
      server.close(() => resolve(value));
    });
  });
}
async function launch(command, args, cwd, env, url) {
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  child.stdout.on("data", (data) => logs.push(String(data)));
  child.stderr.on("data", (data) => logs.push(String(data)));
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(logs.join(""));
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      /* Starting */
    }
    await delay(250);
  }
  throw new Error(`Service did not start: ${url}`);
}
async function api(route, body, method = "POST") {
  const response = await fetch(
    apiUrl + route,
    body === undefined
      ? {}
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  assert.equal(response.ok, true, `${route}: ${await response.clone().text()}`);
  return await response.json();
}
function savedDocument(title, wording) {
  const now = new Date().toISOString();
  return {
    format: "mauth-studio-document",
    schemaVersion: 1,
    id: title,
    name: title,
    frontMatter: { titlePageTemplate: "worksheet", subjectTitle: "MATHEMATICS", assessmentTitle: title },
    formattingConfig: { id: "worksheet" },
    questions: [{ id: "q1", text: wording, section: "Algebra", marks: 1, contentBlocks: [], parts: [], itemOrder: [] }],
    createdAt: now,
    updatedAt: now,
  };
}
async function seedRecovery(bound) {
  const project = await api("/api/storage/projects/default");
  const filePath = "tests/Recovered Work.mauth";
  await api("/api/storage/tests/autosave", {
    ...savedDocument("Recovered Work", "Unsaved recovery must survive"),
    documentOpen: true,
    ...(bound ? { activeProjectFilePath: filePath, activeProjectFileRevision: 1 } : {}),
  });
  await api(
    "/api/storage/editor-session",
    bound
      ? {
          activeTabId: "recovered-tab",
          tabs: [
            {
              id: "recovered-tab",
              title: "Recovered Work",
              project,
              filePath,
              revision: 1,
              dirty: true,
              saveStatus: "dirty",
              document: savedDocument("Recovered Work", "OLDER recovery must not win"),
              navigation: {},
            },
          ],
        }
      : { activeTabId: null, tabs: [] },
  );
}
async function expectTabs(page, count) {
  await page.waitForFunction((expected) => document.querySelectorAll("[data-document-tab-id]").length === expected, count);
}

try {
  const apiPort = await port();
  const webPort = await port();
  apiUrl = `http://127.0.0.1:${apiPort}`;
  webUrl = `http://127.0.0.1:${webPort}`;
  const env = { ...process.env, MAUTH_DOCUMENTS_ROOT: path.join(output, "Home"), MAUTH_WORKSPACE_STATE_ROOT: path.join(output, "State") };
  delete env.MATH_APP_STORAGE_ROOT;
  await launch(
    "uv",
    ["run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(apiPort)],
    path.join(root, "apps/api"),
    env,
    apiUrl + "/api/health",
  );
  await launch(
    "pnpm",
    ["--dir", "apps/web", "dev", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
    root,
    { ...env, VITE_API_URL: apiUrl, MAUTH_VITE_CACHE_DIR: path.join(output, "vite-cache") },
    webUrl,
  );
  await api("/api/storage/projects/default");
  const cloudFolder = path.join(output, "Google Drive test folder");
  await mkdir(cloudFolder, { recursive: true });
  const requestedPath = path.join(cloudFolder, "Year 11 Test 3.mauth");
  const requestedYear12Path = path.join(cloudFolder, "Year 12 Test 4.mauth");
  await writeFile(requestedPath, JSON.stringify(savedDocument("Year 11 Test 3", "Requested Year 11 assessment")));
  await writeFile(requestedYear12Path, JSON.stringify(savedDocument("Year 12 Test 4", "Requested Year 12 assessment")));
  browser = await chromium.launch({ headless: true });

  for (const coldStart of [true, false]) {
    await api("/api/storage/projects/default/documents-folder/reset", {});
    await seedRecovery(coldStart);
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(
      ({ coldStart, requestedPath }) => {
        const pending = coldStart ? [requestedPath] : [];
        let listener;
        window.__mauthOpen = (value) => (listener ? listener(value) : pending.push(value));
        const noop = () => () => {};
        window.mauthDesktop = {
          onOpenDocument(callback) {
            listener = callback;
            pending.splice(0).forEach(callback);
            return () => {
              listener = undefined;
            };
          },
          onOpenAgentSetup: noop,
          onOpenSystemStatus: noop,
          onToggleTheme: noop,
          onOpenSolutionValidation: noop,
          onCloseActiveDocument: noop,
          getAgentConnectorInfo: async () => ({ available: false }),
          chooseDocumentsFolder: async () => ({ cancelled: true }),
          requestWindowClose: async () => {},
        };
      },
      { coldStart, requestedPath },
    );
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let unavailable = true;
    let failedBackups = 0;
    let backupRecovered = false;
    let blockedStartupFolderReads = 0;
    await page.route("**/api/storage/projects/default", async (route) => {
      if (!coldStart || !unavailable) return route.continue();
      blockedStartupFolderReads++;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          detail: {
            code: "STORAGE_UNAVAILABLE",
            reason: "PROJECT_INDEX_ONLINE_ONLY",
            message: "The remembered folder index is online-only. Make the folder available offline, then retry.",
          },
        }),
      });
    });
    await page.route("**/api/storage/projects/default/documents-folder", async (route) => {
      if (!coldStart || !unavailable) return route.continue();
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          detail: {
            code: "STORAGE_UNAVAILABLE",
            message: "The remembered folder is still unavailable.",
          },
        }),
      });
    });
    await page.route("**/api/storage/projects/default/open-document", async (route) => {
      if (!unavailable) return route.continue();
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          detail: {
            code: "STORAGE_UNAVAILABLE",
            reason: "PROJECT_INDEX_ONLINE_ONLY",
            retryable: true,
            message:
              "The hidden folder index (.mauth/project.json) is online-only. Make the folder available offline in Google Drive, then choose Retry.",
          },
        }),
      });
    });
    await page.route("**/api/storage/tests/autosave", async (route) => {
      if (route.request().method() === "POST") {
        if (failedBackups++ === 0) return route.fulfill({ status: 503, body: "Temporary backup failure" });
        backupRecovered = true;
      }
      return route.continue();
    });
    await page.goto(webUrl);
    if (!coldStart) {
      await expectTabs(page, 1);
      await page.evaluate((file) => window.__mauthOpen(file), requestedPath);
    }
    const failure = page.getByRole("dialog", { name: "Document not opened" });
    await failure.waitFor();
    await expectTabs(page, 1);
    if (coldStart) assert(blockedStartupFolderReads > 0, "Cold startup must exercise an unavailable remembered folder");
    assert.match(await failure.innerText(), /project.json/);
    assert.match(await failure.innerText(), /previous document/);
    assert.match(await page.locator("[data-document-tab-id]").innerText(), /Recovered Work/);
    await page.screenshot({ path: path.join(output, `${coldStart ? "cold" : "running"}-blocked.png`) });
    unavailable = false;
    await failure.getByRole("button", { name: "Retry", exact: true }).click();
    await failure.waitFor({ state: "hidden" });
    await expectTabs(page, 2);
    await page.evaluate((file) => window.__mauthOpen(file), requestedYear12Path);
    await expectTabs(page, 3);
    await page.getByRole("button", { name: /Open .*Recovered Work/ }).click();
    await page.getByText("Unsaved recovery must survive", { exact: true }).first().waitFor();
    // Opening an already-open file must not replace its in-memory tab.
    await page.evaluate((file) => window.__mauthOpen(file), requestedPath);
    await page.getByRole("tab", { selected: true }).filter({ hasText: "Year 11 Test 3" }).waitFor();
    await expectTabs(page, 3);
    await page.getByRole("button", { name: /Open .*Recovered Work/ }).click();
    await page.getByText("Unsaved recovery must survive", { exact: true }).first().waitFor();
    await page.waitForResponse(
      (response) => response.url().endsWith("/tests/autosave") && response.request().method() === "POST" && response.ok(),
    );
    assert.equal(backupRecovered, true);
    await delay(500);
    const session = await api("/api/storage/editor-session");
    assert.equal(session.session.tabs.length, 3);
    assert.equal(
      session.session.tabs.find((tab) => tab.title.includes("Recovered Work")).document.questions[0].text,
      "Unsaved recovery must survive",
    );
    await page.screenshot({ path: path.join(output, `${coldStart ? "cold" : "running"}-recovered.png`) });
    assert.deepEqual(errors, []);
    await context.close();
  }

  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto(webUrl);
  await page.getByRole("button", { name: "New document", exact: true }).first().click();
  const modal = page.getByRole("dialog", { name: "New document" });
  await modal.waitFor();
  const rect = await modal.boundingBox();
  assert(rect.y >= 0 && rect.y + rect.height <= 600);
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press("Tab");
    assert(await modal.evaluate((element) => element.contains(document.activeElement)));
  }
  await page.screenshot({ path: path.join(output, "new-document-800.png") });
  await page.keyboard.press("Escape");
  await modal.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Open files", exact: true }).first().click();
  const files = page.getByRole("dialog", { name: "Files", exact: true });
  await files.waitFor();
  await page.keyboard.press("Escape");
  await files.waitFor({ state: "hidden" });
  console.log(
    `PASS: cold/running Finder opens, cloud retry, dirty recovery, three tabs, disk-backup retry, keyboard and compact dialogs. Evidence: ${output}`,
  );
} catch (error) {
  if (browser)
    for (const context of browser.contexts())
      for (const page of context.pages()) await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  for (const child of children.reverse()) {
    if (child.exitCode !== null) continue;
    child.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(2500)]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  await writeFile(path.join(output, "services.log"), logs.join(""));
}
