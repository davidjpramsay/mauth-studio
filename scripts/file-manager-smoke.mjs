import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configuredWebUrl = process.env.MAUTH_WEB_URL;
let webUrl = configuredWebUrl ?? "";
const apiUrl = process.env.MAUTH_API_URL ?? "http://127.0.0.1:8000";
const configuredProjectId = process.env.MAUTH_PROJECT_ID;
const smokeRoot = process.env.MAUTH_FILE_MANAGER_SMOKE_ROOT ?? `__file_manager_smoke_${Date.now()}`;
const modKey = process.platform === "darwin" ? "Meta" : "Control";

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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Vite exited before serving ${url}\n${logs.join("")}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite can take a moment to start and pre-bundle dependencies.
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

async function startWebServerIfNeeded() {
  if (configuredWebUrl) {
    webUrl = configuredWebUrl;
    return null;
  }
  const port = await findFreePort();
  webUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  const child = spawn("pnpm", ["--dir", "apps/web", "dev", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BROWSER: "none" },
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

function dataSelector(attribute, value) {
  return `[${attribute}="${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"]`;
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method ?? "GET"} ${path} failed with ${response.status}: ${body}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function defaultProjectId() {
  if (configuredProjectId) return configuredProjectId;
  const project = await requestJson("/api/storage/projects/default");
  return project.id;
}

async function listProjectFiles(projectId) {
  const payload = await requestJson(`/api/storage/projects/${encodeURIComponent(projectId)}/files`);
  return Array.isArray(payload.files) ? payload.files : [];
}

async function saveProjectFile(projectId, filePath, payload) {
  return requestJson(`/api/storage/projects/${encodeURIComponent(projectId)}/files/${encodeProjectFilePath(filePath)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

async function getProjectFile(projectId, filePath) {
  return requestJson(`/api/storage/projects/${encodeURIComponent(projectId)}/files/${encodeProjectFilePath(filePath)}`);
}

async function deleteProjectFile(projectId, filePath) {
  return requestJson(`/api/storage/projects/${encodeURIComponent(projectId)}/files/${encodeProjectFilePath(filePath)}`, {
    method: "DELETE",
  });
}

async function getAutosave() {
  const payload = await requestJson("/api/storage/tests/autosave");
  return payload.autosave ?? null;
}

async function saveAutosave(autosave) {
  if (!autosave) return;
  await requestJson("/api/storage/tests/autosave", {
    method: "POST",
    body: JSON.stringify(autosave),
  });
}

function savedTestContent(name, text) {
  const now = new Date().toISOString();
  return JSON.stringify(
    {
      id: `file-manager-smoke:${name}`,
      name,
      frontMatter: {
        subjectTitle: "FILE MANAGER SMOKE",
        assessmentTitle: name,
        assessmentSubtitle: "Automated file workflow check",
      },
      questions: [
        {
          id: "question-smoke-1",
          section: "Smoke",
          marks: 1,
          contentBlocks: [{ id: "text-smoke-1", kind: "text", text }],
          parts: [],
          itemOrder: [{ kind: "block", id: "text-smoke-1" }],
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    null,
    2,
  );
}

function hasPath(files, filePath) {
  return files.some((file) => file.path === filePath);
}

async function waitForFiles(projectId, predicate, label, timeoutMs = 8000) {
  const start = Date.now();
  let lastFiles = [];
  while (Date.now() - start < timeoutMs) {
    lastFiles = await listProjectFiles(projectId);
    if (predicate(lastFiles)) return lastFiles;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${label}. Current paths: ${lastFiles.map((file) => file.path).join(", ")}`);
}

async function cleanupSmokeRoot(projectId, root) {
  const rootPath = `tests/${root}`;
  const files = await listProjectFiles(projectId).catch(() => []);
  if (hasPath(files, rootPath)) {
    await deleteProjectFile(projectId, rootPath).catch(() => undefined);
  }
}

async function seedSmokeFiles(projectId, root) {
  await cleanupSmokeRoot(projectId, root);
  await saveProjectFile(projectId, `tests/${root}`, { kind: "folder", fileType: "folder" });
  await saveProjectFile(projectId, `tests/${root}/Folder A`, { kind: "folder", fileType: "folder" });
  await saveProjectFile(projectId, `tests/${root}/Folder B`, { kind: "folder", fileType: "folder" });
  await saveProjectFile(projectId, `tests/${root}/Alpha.test.json`, {
    kind: "file",
    fileType: "test",
    metadata: { format: "saved-test-json", source: "file-manager-smoke" },
    content: savedTestContent("Alpha", "Alpha original"),
  });
  await saveProjectFile(projectId, `tests/${root}/Beta.test.json`, {
    kind: "file",
    fileType: "test",
    metadata: { format: "saved-test-json", source: "file-manager-smoke" },
    content: savedTestContent("Beta", "Beta original"),
  });
}

function fileRow(drawer, testPath) {
  return drawer.locator(dataSelector("data-mauth-file-path", testPath)).first();
}

function breadcrumb(drawer, folderPath) {
  return drawer.locator(dataSelector("data-mauth-folder-breadcrumb", folderPath)).first();
}

async function openFilesDrawer(page) {
  await page.getByRole("button", { name: "Open files" }).click();
  const drawer = page.locator('aside[aria-label="Files"]');
  await drawer.waitFor({ state: "visible", timeout: 5000 });
  return drawer;
}

async function ensureSplitView(page) {
  const splitButton = page.getByRole("button", { name: "Manual editor mode" });
  if ((await splitButton.getAttribute("aria-pressed")) !== "true") {
    await splitButton.click();
  }
}

async function openSmokeRoot(drawer, root) {
  const testsCrumb = breadcrumb(drawer, "");
  if (await testsCrumb.isVisible().catch(() => false)) await testsCrumb.click();
  await fileRow(drawer, root).dblclick();
  await fileRow(drawer, `${root}/Alpha.test.json`).waitFor({ state: "visible", timeout: 5000 });
}

async function selectPaths(drawer, paths) {
  assert(paths.length > 0);
  await fileRow(drawer, paths[0]).click();
  for (const path of paths.slice(1)) {
    await fileRow(drawer, path).click({ modifiers: [modKey] });
  }
}

async function clickDrawerAction(drawer, name) {
  await drawer.getByRole("button", { name, exact: true }).click();
}

async function submitMauthPrompt(page, title, label, value, confirmLabel) {
  const dialog = page.getByRole("dialog", { name: title });
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  await dialog.getByLabel(label).fill(value);
  await dialog.getByRole("button", { name: confirmLabel, exact: true }).click();
  await dialog.waitFor({ state: "hidden", timeout: 5000 });
}

async function confirmMauthDialog(page, title, confirmLabel) {
  const dialog = page.getByRole("dialog", { name: title });
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  await dialog.getByRole("button", { name: confirmLabel, exact: true }).click();
  await dialog.waitFor({ state: "hidden", timeout: 5000 });
}

async function findTextareaWithValue(page, expectedValue) {
  const textareas = page.locator("textarea");
  const count = await textareas.count();
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const textarea = textareas.nth(index);
    const value = await textarea.inputValue().catch(() => "");
    values.push(value.slice(0, 80));
    if (value.includes(expectedValue)) return textarea;
  }
  const bodyText = (
    (await page
      .locator("body")
      .textContent()
      .catch(() => "")) ?? ""
  )
    .replace(/\s+/g, " ")
    .slice(0, 800);
  throw new Error(`Could not find textarea containing "${expectedValue}". Textareas: ${JSON.stringify(values)}. Body: ${bodyText}`);
}

async function waitForSelectedCount(drawer, expectedCount, label, timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = await drawer.locator('[data-mauth-file-path][aria-selected="true"]').count();
    if (count === expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const count = await drawer.locator('[data-mauth-file-path][aria-selected="true"]').count();
  throw new Error(`Timed out waiting for ${label}; expected ${expectedCount} selected, saw ${count}`);
}

async function parsedProjectFileContent(projectId, filePath) {
  const document = await getProjectFile(projectId, filePath);
  return JSON.parse(document.content || "{}");
}

const projectId = await defaultProjectId();
const originalAutosave = await getAutosave().catch(() => null);
await seedSmokeFiles(projectId, smokeRoot);

let webServer = null;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const nativeDialogs = [];
page.on("dialog", (dialog) => {
  nativeDialogs.push(`${dialog.type()}: ${dialog.message()}`);
  dialog.dismiss().catch(() => {});
});

try {
  webServer = await startWebServerIfNeeded();
  await page.goto(webUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Open files" }).waitFor({ state: "visible", timeout: 15000 });
  let drawer = await openFilesDrawer(page);
  await openSmokeRoot(drawer, smokeRoot);

  const alpha = `${smokeRoot}/Alpha.test.json`;
  const beta = `${smokeRoot}/Beta.test.json`;
  const folderA = `${smokeRoot}/Folder A`;
  const folderB = `${smokeRoot}/Folder B`;
  const alphaInA = `${folderA}/Alpha.test.json`;
  const betaInA = `${folderA}/Beta.test.json`;
  const betaInB = `${folderB}/Beta.test.json`;

  await selectPaths(drawer, [alpha, beta]);
  await fileRow(drawer, alpha).dragTo(fileRow(drawer, folderA));
  await waitForFiles(
    projectId,
    (files) => hasPath(files, `tests/${alphaInA}`) && hasPath(files, `tests/${betaInA}`) && !hasPath(files, `tests/${alpha}`),
    "multi-select drag into Folder A",
  );

  await fileRow(drawer, folderA).dblclick();
  await selectPaths(drawer, [alphaInA, betaInA]);
  await fileRow(drawer, alphaInA).dragTo(breadcrumb(drawer, smokeRoot));
  await waitForFiles(
    projectId,
    (files) => hasPath(files, `tests/${alpha}`) && hasPath(files, `tests/${beta}`) && !hasPath(files, `tests/${alphaInA}`),
    "breadcrumb drag back to parent",
  );

  await breadcrumb(drawer, smokeRoot).click();
  await selectPaths(drawer, [beta]);
  await fileRow(drawer, beta).dragTo(fileRow(drawer, folderB));
  await waitForFiles(projectId, (files) => hasPath(files, `tests/${betaInB}`), "single-file drag into Folder B");

  await fileRow(drawer, folderB).click();
  await clickDrawerAction(drawer, "Duplicate");
  const folderBCopy = `${smokeRoot}/Folder B copy`;
  await waitForFiles(projectId, (files) => hasPath(files, `tests/${folderBCopy}/Beta.test.json`), "folder duplicate with contents");

  const renamedFolder = `${smokeRoot}/Renamed Folder`;
  await fileRow(drawer, folderBCopy).click();
  await clickDrawerAction(drawer, "Rename");
  await submitMauthPrompt(page, "Rename", "Folder name", "Renamed Folder", "Rename");
  await waitForFiles(
    projectId,
    (files) => hasPath(files, `tests/${renamedFolder}/Beta.test.json`) && !hasPath(files, `tests/${folderBCopy}`),
    "folder rename with contents",
  );

  await fileRow(drawer, renamedFolder).click();
  await clickDrawerAction(drawer, "Delete");
  await confirmMauthDialog(page, "Delete item", "Delete");
  await waitForFiles(projectId, (files) => !hasPath(files, `tests/${renamedFolder}`), "folder delete with contents");

  await fileRow(drawer, alpha).click();
  await clickDrawerAction(drawer, "Open");
  await page.locator('aside[aria-label="Files"]').waitFor({ state: "hidden", timeout: 5000 });
  await page.getByText("Alpha original").first().waitFor({ state: "visible", timeout: 6000 });
  await ensureSplitView(page);

  const editedText = "Alpha edited by file manager smoke";
  const alphaTextArea = await findTextareaWithValue(page, "Alpha original");
  await alphaTextArea.fill(editedText);
  await page.getByText(/Unsaved file changes/i).waitFor({ state: "visible", timeout: 6000 });

  drawer = await openFilesDrawer(page);
  await openSmokeRoot(drawer, smokeRoot);
  await fileRow(drawer, alpha).click();
  await clickDrawerAction(drawer, "Duplicate");
  const alphaCopy = `${smokeRoot}/Alpha copy.test.json`;
  await waitForFiles(projectId, (files) => hasPath(files, `tests/${alphaCopy}`), "active dirty file duplicate");

  const alphaDocument = await parsedProjectFileContent(projectId, `tests/${alpha}`);
  const alphaCopyDocument = await parsedProjectFileContent(projectId, `tests/${alphaCopy}`);
  assert.equal(alphaDocument.questions?.[0]?.contentBlocks?.[0]?.text, editedText, "Original active file was not saved before duplicate");
  assert.equal(alphaCopyDocument.questions?.[0]?.contentBlocks?.[0]?.text, editedText, "Duplicate did not use edited active file content");

  await drawer.locator("section").first().focus();
  const currentRowCount = await drawer.locator("[data-mauth-file-path]").count();
  await page.keyboard.press("Control+A");
  await waitForSelectedCount(drawer, currentRowCount, "keyboard select all");
  await page.keyboard.press("Escape");
  await waitForSelectedCount(drawer, 0, "keyboard clear selection");
  assert.deepEqual(nativeDialogs, [], "File manager should use Mauth dialogs, not native browser dialogs");

  console.log(`File manager smoke passed using ${smokeRoot}`);
} finally {
  await browser.close();
  await stopProcess(webServer);
  await cleanupSmokeRoot(projectId, smokeRoot);
  await saveAutosave(originalAutosave).catch(() => undefined);
}
