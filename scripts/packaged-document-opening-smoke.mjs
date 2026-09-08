import { _electron as electron } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { assessment } from "../tests/visual/fixtures.mjs";

const bundle = path.resolve(process.env.MAUTH_PACKAGED_APP ?? "release/mac-arm64/Mauth Studio.app");
const output = await mkdtemp(path.join(os.tmpdir(), "mauth-packaged-opening-"));
const profile = path.join(output, "Profile");
const documents = path.join(output, "Documents");
const env = { ...process.env, MAUTH_DESKTOP_USER_DATA: profile, MAUTH_DOCUMENTS_ROOT: path.join(output, "Home") };
delete env.MAUTH_AGENT_API_URL;
delete env.MAUTH_AGENT_TOKEN;
delete env.MAUTH_WORKSPACE_STATE_ROOT;
delete env.MATH_APP_STORAGE_ROOT;
const executablePath = path.join(bundle, "Contents/MacOS/Mauth Studio");
let app;
let client;
async function documentFile(name) {
  const draft = assessment(1);
  draft.frontMatter.assessmentTitle = name;
  const filename = path.join(documents, `${name}.mauth`);
  await writeFile(filename, JSON.stringify({ format: "mauth-studio-document", schemaVersion: 1, id: name, name, ...draft }));
  return filename;
}

try {
  await mkdir(path.join(profile, "storage/autosave"), { recursive: true });
  await mkdir(documents, { recursive: true });
  const recovery = assessment(1);
  recovery.frontMatter.assessmentTitle = "Unsaved recovery";
  recovery.questions[0].text = "RECOVERY CONTENT MUST SURVIVE";
  await writeFile(path.join(profile, "storage/autosave/current-test.json"), JSON.stringify(recovery));
  const first = await documentFile("Cold start assessment");
  const second = await documentFile("Finder assessment");
  const third = await documentFile("Unavailable assessment");
  app = await electron.launch({ executablePath, args: [first], env, timeout: 60000 });
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 0;
  });
  console.log("Packaged process started with isolated recovery");
  console.log(
    "Startup file argument present:",
    await app.evaluate(() => process.argv.some((arg) => arg.endsWith("Cold start assessment.mauth"))),
  );
  const page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/);
  try {
    await page.waitForFunction(() => document.querySelectorAll("[data-document-tab-id]").length === 2);
  } catch (error) {
    console.error((await page.locator("body").innerText()).slice(0, 6000));
    console.error(
      "Window state:",
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((window) => ({
          url: window.webContents.getURL(),
          loading: window.webContents.isLoadingMainFrame(),
        })),
      ),
    );
    throw error;
  }
  console.log("Cold opening retained two tabs");
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
  assert.equal(await app.evaluate(({ app }) => app.getPath("userData")), profile);

  const transport = new StdioClientTransport({
    command: path.join(bundle, "Contents/Resources/agent/mauth-agent-mcp"),
    env,
    stderr: "pipe",
  });
  client = new Client({ name: "packaged-opening-smoke", version: "1.0.0" });
  await client.connect(transport);
  async function snapshot(args = {}) {
    const result = await client.callTool({ name: "mauth_snapshot", arguments: args });
    assert.equal(result.isError, undefined);
    return result.structuredContent;
  }
  const initial = await snapshot();
  const recovered = initial.openDocuments.find((entry) => /Unsaved recovery/.test(entry.title));
  assert.ok(recovered?.dirty, "Cold opening must retain the dirty recovered tab");
  assert.match(JSON.stringify(initial.frontMatter), /Cold start assessment/);
  assert.equal((await client.listResources()).resources.length > 0, true);
  assert.equal((await snapshot({ questionId: initial.questions[0].id })).questions.length, 1);

  // Launch Services sends a genuine macOS open-file event to the running app.
  execFileSync("/usr/bin/open", ["-a", bundle, second], { env });
  await page.waitForFunction(() => document.querySelectorAll("[data-document-tab-id]").length === 3);
  assert.match(JSON.stringify((await snapshot()).frontMatter), /Finder assessment/);
  let unavailable = true;
  await page.route("**/api/storage/projects/default/open-document", async (route) => {
    if (!unavailable) return route.continue();
    await route.fulfill({
      status: 503,
      json: {
        detail: {
          code: "STORAGE_UNAVAILABLE",
          reason: "PROJECT_INDEX_ONLINE_ONLY",
          message: "The folder index is online-only. Make the folder available offline, then retry.",
          retryable: true,
        },
      },
    });
  });
  execFileSync("/usr/bin/open", ["-a", bundle, third], { env });
  await page
    .getByRole("dialog")
    .filter({ hasText: /not opened/ })
    .waitFor();
  assert.equal(await page.locator("[data-document-tab-id]").count(), 3);
  await page.screenshot({ path: path.join(output, "packaged-open-error.png") });
  unavailable = false;
  await page.getByRole("button", { name: /Retry/, exact: false }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-document-tab-id]").length === 4);
  const recoveredSnapshot = await snapshot({ documentId: recovered.id });
  assert.match(JSON.stringify(recoveredSnapshot.questions), /RECOVERY CONTENT MUST SURVIVE/);
  assert.ok(recoveredSnapshot.file.dirty);
  assert.equal(recoveredSnapshot.file.saveStatus, "draft");
  assert.ok(recoveredSnapshot.openDocuments.find((tab) => tab.id === recovered.id).dirty);
  await page.screenshot({ path: path.join(output, "packaged-recovery.png") });
  await client.close();
  client = null;
  let session;
  for (let attempt = 0; attempt < 100; attempt++) {
    session = JSON.parse(await readFile(path.join(profile, "storage/autosave/open-documents.json"), "utf8"));
    if (session.tabs.length === 4) break;
    await delay(100);
  }
  assert.equal(session.tabs.length, 4);
  assert.ok(session.tabs.some((tab) => tab.dirty && /RECOVERY CONTENT MUST SURVIVE/.test(JSON.stringify(tab.document))));
  console.log(`PASS: packaged startup, native Finder open, cloud-error/retry, bundled MCP and dirty recovery. Evidence: ${output}`);
  console.log("Cloud failure was simulated; this does not certify Google Drive hydration or a public update.");
} finally {
  if (client) await client.close();
  if (app) {
    // Only dispose this generated fixture process. Force-closing its windows
    // avoids Electron/Playwright's native beforeunload-dialog protocol race.
    await app
      .evaluate(({ BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows()) window.destroy();
      })
      .catch(() => {});
    await app.close().catch(() => {});
  }
}
