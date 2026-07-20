import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(ROOT, "workspace/verification/document-session-conflict-smoke", new Date().toISOString().replace(/[:.]/g, "-"));
const alphaPath = "tests/Alpha.test.json";
const betaPath = "tests/Beta.test.json";
let apiUrl = "";
let webUrl = "";

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not allocate a free local port"));
      });
    });
  });
}

async function waitForServer(url, child, logs) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child?.exitCode !== null && child?.exitCode !== undefined)
      throw new Error(`Process exited before serving ${url}\n${logs.join("")}`);
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // Local servers can take a moment to bind and pre-bundle.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}\n${logs.join("")}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(2500).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

async function startApiServer(workspaceRoot) {
  const port = await findFreePort();
  apiUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  const env = {
    ...process.env,
    MAUTH_DOCUMENTS_ROOT: workspaceRoot,
    MATH_APP_STORAGE_ROOT: path.join(path.dirname(workspaceRoot), "legacy-storage"),
  };
  const child = spawn("uv", ["run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: path.join(ROOT, "apps/api"),
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
  await waitForServer(`${apiUrl}/api/system/status`, child, logs);
  return child;
}

async function startWebServer() {
  const port = await findFreePort();
  webUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  const child = spawn("pnpm", ["--dir", "apps/web", "dev", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BROWSER: "none", VITE_API_URL: apiUrl },
  });
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
  await waitForServer(webUrl, child, logs);
  return child;
}

function encodeProjectFilePath(filePath) {
  return filePath
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${apiUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${pathname} failed with ${response.status}: ${await response.text()}`);
  return response.json();
}

async function saveProjectFile(projectId, filePath, content, baseRevision = null) {
  return requestJson(`/api/storage/projects/${encodeURIComponent(projectId)}/files/${encodeProjectFilePath(filePath)}`, {
    method: "PUT",
    body: JSON.stringify({
      kind: "file",
      fileType: "test",
      metadata: { format: "saved-test-json", source: "document-session-conflict-smoke" },
      content,
      baseRevision,
    }),
  });
}

async function listProjectFiles(projectId) {
  return (await requestJson(`/api/storage/projects/${encodeURIComponent(projectId)}/files`)).files;
}

function savedTestContent(name, prompt) {
  const now = new Date().toISOString();
  return JSON.stringify(
    {
      id: `document-session-conflict-smoke:${name}`,
      name,
      frontMatter: {
        subjectTitle: "DOCUMENT SESSION SMOKE",
        assessmentTitle: name,
        assessmentSubtitle: "Disposable conflict workflow",
      },
      questions: [
        {
          id: `question-${name.toLowerCase()}`,
          section: "Smoke",
          marks: 1,
          contentBlocks: [{ id: `text-${name.toLowerCase()}`, kind: "text", text: prompt }],
          parts: [],
          itemOrder: [{ kind: "block", id: `text-${name.toLowerCase()}` }],
        },
      ],
      sectionHeadings: [],
      documentFlow: [{ kind: "question", id: `question-${name.toLowerCase()}` }],
      formattingConfig: { id: "high-school-mathematics-test" },
      createdAt: now,
      updatedAt: now,
    },
    null,
    2,
  );
}

function fileRow(drawer, testPath) {
  return drawer.locator(`[data-mauth-file-path="${testPath}"]`).first();
}

async function openFilesDrawer(page) {
  await page.getByRole("button", { name: "Open files" }).click();
  const drawer = page.locator('aside[aria-label="Files"]');
  await drawer.waitFor({ state: "visible", timeout: 8000 });
  return drawer;
}

async function openFileFromDrawer(page, testPath) {
  const drawer = await openFilesDrawer(page);
  await fileRow(drawer, testPath).click();
  await drawer.getByRole("button", { name: "Open", exact: true }).click();
}

async function waitForDocumentText(page, text) {
  await page.locator('aside[aria-label="Files"]').waitFor({ state: "hidden", timeout: 8000 });
  try {
    await page.getByText(text).first().waitFor({ state: "visible", timeout: 8000 });
  } catch (error) {
    const headerText = (
      (await page
        .locator("header")
        .textContent()
        .catch(() => "")) ?? ""
    )
      .replace(/\s+/g, " ")
      .trim();
    const bodyText = (
      (await page
        .locator("body")
        .textContent()
        .catch(() => "")) ?? ""
    )
      .replace(/\s+/g, " ")
      .slice(0, 1000);
    throw new Error(`Could not verify opened document text "${text}". Header: ${headerText}. Body: ${bodyText}`, { cause: error });
  }
}

async function findTextareaWithValue(page, expectedValue) {
  const textareas = page.locator("textarea");
  const count = await textareas.count();
  for (let index = 0; index < count; index += 1) {
    const textarea = textareas.nth(index);
    if ((await textarea.inputValue().catch(() => "")).includes(expectedValue)) return textarea;
  }
  throw new Error(`Could not find textarea containing "${expectedValue}"`);
}

async function makeLocalEdit(page, currentText, nextText) {
  const editorButton = page.getByRole("button", { name: "Manual editor mode" });
  if ((await editorButton.count()) > 0 && (await editorButton.getAttribute("aria-pressed")) !== "true") await editorButton.click();
  const textarea = await findTextareaWithValue(page, currentText);
  await textarea.waitFor({ state: "visible", timeout: 8000 });
  await textarea.fill(nextText);
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mauth-document-session-conflict-"));
const workspaceRoot = path.join(tempRoot, "workspace");
let apiServer = null;
let webServer = null;
let browser = null;

try {
  await fs.mkdir(outputDir, { recursive: true });
  apiServer = await startApiServer(workspaceRoot);
  const project = await requestJson("/api/storage/projects/default");
  const alphaRevision = await saveProjectFile(project.id, alphaPath, savedTestContent("Alpha", "Alpha original"));
  const betaRevision = await saveProjectFile(project.id, betaPath, savedTestContent("Beta", "Beta original"));

  webServer = await startWebServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const consoleMessages = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") consoleMessages.push(`${message.type()}: ${message.text()}`);
  });
  await page.goto(webUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Open files" }).waitFor({ state: "visible", timeout: 15000 });

  await openFileFromDrawer(page, "Alpha.test.json");
  await waitForDocumentText(page, "Alpha original");
  await makeLocalEdit(page, "Alpha original", "Alpha edited locally");

  await saveProjectFile(project.id, alphaPath, savedTestContent("Alpha", "Alpha changed on disk"), alphaRevision.revision);

  await openFileFromDrawer(page, "Beta.test.json");
  const conflictDialog = page.getByRole("dialog", { name: "File changed on disk" });
  await conflictDialog.waitFor({ state: "visible", timeout: 8000 });
  await conflictDialog.getByRole("button", { name: "Save recovery copy and open", exact: true }).waitFor();
  await conflictDialog.getByRole("button", { name: "Open without saving", exact: true }).waitFor();
  await conflictDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByText("Alpha edited locally", { exact: true }).first().waitFor({ state: "visible", timeout: 8000 });
  assert.equal(
    (await listProjectFiles(project.id)).some((file) => file.path.startsWith("tests/Recovery/")),
    false,
  );

  const drawer = await openFilesDrawer(page);
  await fileRow(drawer, "Beta.test.json").click();
  await drawer.getByRole("button", { name: "Open", exact: true }).click();
  await conflictDialog.waitFor({ state: "visible", timeout: 8000 });
  await page.screenshot({ path: path.join(outputDir, "conflict-choice.png"), fullPage: true });
  await conflictDialog.getByRole("button", { name: "Save recovery copy and open", exact: true }).click();
  await waitForDocumentText(page, "Beta original");

  const files = await listProjectFiles(project.id);
  assert(
    files.some((file) => file.path.startsWith("tests/Recovery/") && file.path.endsWith(".test.json")),
    "Recovery copy was not created",
  );
  assert(
    consoleMessages.some((message) => message.includes("409 (Conflict)")),
    "The stale revision did not produce a conflict response",
  );
  assert.deepEqual(
    consoleMessages.filter((message) => !message.includes("409 (Conflict)")),
    [],
  );

  await makeLocalEdit(page, "Beta original", "Beta edited locally");
  await saveProjectFile(project.id, betaPath, savedTestContent("Beta", "Beta changed on disk"), betaRevision.revision);

  const versionsDrawer = await openFilesDrawer(page);
  await fileRow(versionsDrawer, "Beta.test.json").click();
  await versionsDrawer.getByRole("button", { name: "Versions", exact: true }).click();
  await versionsDrawer.getByText("Revision 1", { exact: true }).waitFor({ state: "visible", timeout: 8000 });
  await versionsDrawer.getByRole("button", { name: "Restore", exact: true }).first().click();
  const restoreDialog = page.getByRole("dialog", { name: "Restore version" });
  await restoreDialog.waitFor({ state: "visible", timeout: 8000 });
  await restoreDialog.getByRole("button", { name: "Restore", exact: true }).click();

  await conflictDialog.waitFor({ state: "visible", timeout: 8000 });
  await conflictDialog.getByRole("button", { name: "Save recovery copy and restore", exact: true }).waitFor();
  await conflictDialog.getByRole("button", { name: "Restore without saving", exact: true }).waitFor();
  await page.screenshot({ path: path.join(outputDir, "version-restore-conflict.png"), fullPage: true });
  await conflictDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await versionsDrawer
    .getByText("Restore cancelled; local changes kept", { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 8000 });
  assert.match(await (await findTextareaWithValue(page, "Beta edited locally")).inputValue(), /Beta edited locally/);
  const betaAfterCancelledRestore = await requestJson(
    `/api/storage/projects/${encodeURIComponent(project.id)}/files/${encodeProjectFilePath(betaPath)}`,
  );
  assert.match(betaAfterCancelledRestore.content, /Beta changed on disk/);

  await versionsDrawer.getByRole("button", { name: "Restore", exact: true }).first().click();
  await restoreDialog.waitFor({ state: "visible", timeout: 8000 });
  await restoreDialog.getByRole("button", { name: "Restore", exact: true }).click();
  await conflictDialog.waitFor({ state: "visible", timeout: 8000 });
  await conflictDialog.getByRole("button", { name: "Save recovery copy and restore", exact: true }).click();
  await versionsDrawer.getByText("Restored revision 1", { exact: true }).waitFor({ state: "visible", timeout: 8000 });
  await versionsDrawer.getByRole("button", { name: "Close files" }).click();
  await waitForDocumentText(page, "Beta original");

  const filesAfterRestore = await listProjectFiles(project.id);
  assert(
    filesAfterRestore.filter((file) => file.path.startsWith("tests/Recovery/") && file.path.endsWith(".test.json")).length >= 2,
    "Version restore did not preserve the edited active document as a recovery copy",
  );
  const betaAfterRestore = await requestJson(
    `/api/storage/projects/${encodeURIComponent(project.id)}/files/${encodeProjectFilePath(betaPath)}`,
  );
  assert.match(betaAfterRestore.content, /Beta original/);

  console.log(`Document session conflict smoke passed: ${outputDir}`);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  await stopProcess(webServer);
  await stopProcess(apiServer);
  await fs.rm(tempRoot, { recursive: true, force: true });
}
