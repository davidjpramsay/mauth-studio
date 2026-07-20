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
let apiUrl = "";
let webUrl = "";

const browserDraftKey = "mauth-studio.current-draft.v1";
const legacySavedTestsKey = "mauth-studio.saved-tests.v1";
const externalFileName = "External Smoke.test.json";
const externalProjectPath = `tests/${externalFileName}`;
const unwantedLegacyFileName = "Legacy Should Not Import.test.json";
const unwantedLegacyProjectPath = `tests/${unwantedLegacyFileName}`;

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

async function waitForServer(url, child, logs, predicate = (response) => response.ok) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`Process exited before serving ${url}\n${logs.join("")}`);
    }
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (predicate(response)) return response;
    } catch {
      // Local dev servers can take a moment to bind and pre-bundle.
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
  const apiEnv = { ...process.env, MAUTH_DOCUMENTS_ROOT: workspaceRoot };
  delete apiEnv.MATH_APP_STORAGE_ROOT;
  const child = spawn("uv", ["run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: path.join(ROOT, "apps/api"),
    stdio: ["ignore", "pipe", "pipe"],
    env: apiEnv,
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

function dataSelector(attribute, value) {
  return `[${attribute}="${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"]`;
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${apiUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method ?? "GET"} ${pathname} failed with ${response.status}: ${body}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function openDocumentsFolder(folderPath) {
  return requestJson("/api/storage/projects/default/documents-folder", {
    method: "POST",
    body: JSON.stringify({ path: folderPath }),
  });
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

function savedTest(name, text) {
  const now = new Date().toISOString();
  return {
    id: `external-folder-smoke:${name}`,
    name,
    frontMatter: {
      subjectTitle: "EXTERNAL FOLDER SMOKE",
      assessmentTitle: name,
      assessmentSubtitle: "Automated external folder and autosave check",
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
    sectionHeadings: [],
    documentFlow: [{ kind: "question", id: "question-smoke-1" }],
    formattingConfig: { id: "high-school-mathematics-test" },
    createdAt: now,
    updatedAt: now,
  };
}

function savedTestContent(name, text) {
  return JSON.stringify(savedTest(name, text), null, 2);
}

function autosaveSnapshot(name, text, activeRevision) {
  const snapshot = savedTest(name, text);
  return {
    frontMatter: snapshot.frontMatter,
    questions: snapshot.questions,
    sectionHeadings: snapshot.sectionHeadings,
    documentFlow: snapshot.documentFlow,
    formattingConfig: snapshot.formattingConfig,
    activeProjectFilePath: externalProjectPath,
    activeProjectFileRevision: activeRevision,
    documentOpen: true,
    updatedAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

function legacySavedTestsPayload() {
  return [
    {
      ...savedTest("Legacy Should Not Import", "This legacy browser file must not be imported into the external folder."),
      id: "legacy-should-not-import",
    },
  ];
}

function fileRow(drawer, testPath) {
  return drawer.locator(dataSelector("data-mauth-file-path", testPath)).first();
}

function corsHeaders(request, methods) {
  return {
    "access-control-allow-origin": request.headers().origin ?? "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": methods,
  };
}

async function openFilesDrawer(page) {
  await page.getByRole("button", { name: "Open files" }).click();
  const drawer = page.locator('aside[aria-label="Files"]');
  await drawer.waitFor({ state: "visible", timeout: 8000 });
  return drawer;
}

async function seedExternalFolder(externalDocuments) {
  await fs.mkdir(externalDocuments, { recursive: true });
  await fs.writeFile(path.join(externalDocuments, "Ignore.pdf"), "not a mauth file\n", "utf8");
  await fs.writeFile(path.join(externalDocuments, "readme.txt"), "not a mauth file\n", "utf8");
}

async function assertProjectFilePaths(projectId, expectedPaths) {
  const files = await listProjectFiles(projectId);
  const paths = files.map((file) => file.path);
  assert.deepEqual(paths, expectedPaths);
  return files;
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mauth-external-folder-smoke-"));
const workspaceRoot = path.join(tempRoot, "workspace");
const externalDocuments = path.join(tempRoot, "Test 4 - Exam");

let apiServer = null;
let webServer = null;
let browser = null;

try {
  await seedExternalFolder(externalDocuments);
  const externalDocumentsPath = await fs.realpath(externalDocuments);
  apiServer = await startApiServer(workspaceRoot);

  const project = await openDocumentsFolder(externalDocumentsPath);
  assert.equal(project.documentsPath, externalDocumentsPath);
  assert.equal(project.workspacePath, externalDocumentsPath);

  let files = await assertProjectFilePaths(project.id, []);
  assert(!files.some((file) => file.path.endsWith(".pdf") || file.path.endsWith(".txt")), "Non-Mauth files should not be indexed");

  const firstSave = await saveProjectFile(project.id, externalProjectPath, {
    kind: "file",
    fileType: "test",
    metadata: { format: "saved-test-json", source: "external-folder-autosave-smoke" },
    content: savedTestContent("External Smoke", "Disk base"),
    baseRevision: null,
  });
  assert.equal(firstSave.revision, 1);

  const secondSave = await saveProjectFile(project.id, externalProjectPath, {
    kind: "file",
    fileType: "test",
    metadata: { format: "saved-test-json", source: "external-folder-autosave-smoke" },
    content: savedTestContent("External Smoke", "Disk fresh"),
    baseRevision: firstSave.revision,
  });
  assert.equal(secondSave.revision, 2);

  await assertProjectFilePaths(project.id, ["tests", externalProjectPath]);

  webServer = await startWebServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await context.addInitScript(
    ({ draftKey, legacyKey, draft, legacySavedTests }) => {
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
      window.localStorage.setItem(legacyKey, JSON.stringify(legacySavedTests));
    },
    {
      draftKey: browserDraftKey,
      legacyKey: legacySavedTestsKey,
      draft: autosaveSnapshot("External Smoke", "Browser stale draft", firstSave.revision),
      legacySavedTests: legacySavedTestsPayload(),
    },
  );

  const page = await context.newPage();
  const consoleMessages = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") consoleMessages.push(`${message.type()}: ${message.text()}`);
  });
  await page.route("**/api/storage/tests", async (route, request) => {
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: corsHeaders(request, "GET,OPTIONS"),
      });
      return;
    }
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        ...corsHeaders(request, "GET,OPTIONS"),
        "content-type": "application/json",
      },
      body: JSON.stringify({ tests: [] }),
    });
  });
  await page.route("**/api/storage/tests/autosave", async (route, request) => {
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: corsHeaders(request, "GET,POST,OPTIONS"),
      });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        headers: {
          ...corsHeaders(request, "GET,POST,OPTIONS"),
          "content-type": "application/json",
        },
        body: JSON.stringify({ autosave: null }),
      });
      return;
    }
    if (request.method() !== "POST") {
      await route.continue();
      return;
    }
    const autosave = JSON.parse(request.postData() ?? "{}");
    await route.fulfill({
      status: 200,
      headers: {
        ...corsHeaders(request, "GET,POST,OPTIONS"),
        "content-type": "application/json",
      },
      body: JSON.stringify({ autosave: { ...autosave, updatedAt: new Date().toISOString() } }),
    });
  });
  await page.route("**/api/storage/logos**", async (route, request) => {
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: corsHeaders(request, "GET,POST,PUT,OPTIONS"),
      });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        headers: {
          ...corsHeaders(request, "GET,POST,PUT,OPTIONS"),
          "content-type": "application/json",
        },
        body: JSON.stringify({ logos: [] }),
      });
      return;
    }
    if (request.method() === "POST" || request.method() === "PUT") {
      await route.fulfill({
        status: 200,
        headers: {
          ...corsHeaders(request, "GET,POST,PUT,OPTIONS"),
          "content-type": "application/json",
        },
        body: request.postData() ?? "{}",
      });
      return;
    }
    await route.continue();
  });

  await page.goto(webUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Open files" }).waitFor({ state: "visible", timeout: 15000 });
  await page.getByText("Browser stale draft").first().waitFor({ state: "visible", timeout: 10000 });
  await page.getByText("File changed outside app").first().waitFor({ state: "visible", timeout: 10000 });

  const drawer = await openFilesDrawer(page);
  await fileRow(drawer, externalFileName).waitFor({ state: "visible", timeout: 8000 });
  assert.equal(await fileRow(drawer, unwantedLegacyFileName).count(), 0, "Legacy browser file was imported into external folder");

  files = await listProjectFiles(project.id);
  assert(
    files.some((file) => file.path === externalProjectPath),
    "External document was not listed",
  );
  assert(!files.some((file) => file.path === unwantedLegacyProjectPath), "Legacy file was imported through the project API");
  assert(!files.some((file) => file.path.endsWith(".pdf") || file.path.endsWith(".txt")), "Non-Mauth files were indexed");

  const diskDocument = await getProjectFile(project.id, externalProjectPath);
  assert.equal(diskDocument.revision, 2);
  assert.match(diskDocument.content ?? "", /Disk fresh/);
  assert.doesNotMatch(diskDocument.content ?? "", /Browser stale draft/);

  assert.deepEqual(consoleMessages, []);
  console.log(`External folder/autosave smoke passed using ${externalDocumentsPath}`);
} finally {
  if (browser) await browser.close();
  await stopProcess(webServer);
  await stopProcess(apiServer);
  await fs.rm(tempRoot, { recursive: true, force: true });
}
