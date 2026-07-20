import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKBENCH_ROOT = path.resolve(ROOT, "workspace");
const OUTPUT_ROOT =
  process.env.MAUTH_CONTEXT_MENU_ACTIONS_SMOKE_OUTPUT ?? path.join(WORKBENCH_ROOT, "verification", "context-menu-actions-smoke");
const CURRENT_DRAFT_STORAGE_KEY = "mauth-studio.current-draft.v1";
const VIEWPORT = { width: 1484, height: 1264 };
const INTRO_ANCHOR = "q:q-context-1/b:intro";
const COLUMN_TEXT_ANCHOR = "q:q-context-1/p:p-context/b:cols/c:0/b:c1-text";
const CHOICE_ANCHOR = "q:q-choice/b:choices";
const TABLE_ANCHOR = "q:q-choice/b:answer-table";
const INTRO_TEXT = "Context menu intro prompt.";
const COLUMN_TEXT = "Nested context text.";

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

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
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(2500).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

function seededDraft() {
  return {
    frontMatter: { assessmentTitle: "Context menu actions smoke" },
    formattingConfig: {},
    questions: [
      {
        id: "q-context-1",
        section: "Context",
        marks: 6,
        contentBlocks: [
          { id: "intro", kind: "text", text: INTRO_TEXT },
          { id: "space", kind: "space", lines: 4, visibility: "student", studentOnly: true },
        ],
        parts: [
          {
            id: "p-context",
            label: "",
            text: "",
            marks: 2,
            contentBlocks: [
              {
                id: "cols",
                kind: "columns",
                columnCount: 2,
                columns: [
                  [
                    { id: "c1-text", kind: "text", text: COLUMN_TEXT },
                    { id: "c1-space", kind: "space", lines: 2, visibility: "student", studentOnly: true },
                  ],
                  [{ id: "c2-text", kind: "text", text: "Second column text." }],
                ],
              },
            ],
            subparts: [],
            itemOrder: [{ kind: "block", id: "cols" }],
          },
        ],
        itemOrder: [
          { kind: "block", id: "intro" },
          { kind: "block", id: "space" },
          { kind: "part", id: "p-context" },
        ],
        pageBreakAfter: false,
      },
      {
        id: "q-context-2",
        section: "Delete target",
        marks: 1,
        contentBlocks: [{ id: "delete-me", kind: "text", text: "Delete this question from the navigator context menu." }],
        parts: [],
        itemOrder: [{ kind: "block", id: "delete-me" }],
        pageBreakAfter: false,
      },
      {
        id: "q-choice",
        section: "Shared structured answers",
        marks: 3,
        contentBlocks: [
          {
            id: "choices",
            kind: "choices",
            choices: ["$2$", "$4$", "$6$"],
            numberingStyle: "upper-alpha",
            layout: "inline",
          },
          {
            id: "answer-table",
            kind: "table",
            headers: ["$x$", "$0$", "$1$"],
            rows: [["$y$", "", ""]],
            showHeader: true,
            tableAlign: "center",
            cellAlignment: "center",
          },
        ],
        parts: [],
        itemOrder: [
          { kind: "block", id: "choices" },
          { kind: "block", id: "answer-table" },
        ],
        pageBreakAfter: false,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

async function mockApi(page) {
  const now = new Date().toISOString();
  const project = {
    id: "local-project",
    name: "Overlay smoke",
    description: null,
    metadata: {},
    workspacePath: WORKBENCH_ROOT,
    documentsPath: WORKBENCH_ROOT,
    fileCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json",
  };

  await page.route("http://127.0.0.1:8000/api/storage/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
      return;
    }
    if (pathname === "/api/storage/tests") {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ tests: [] }) });
      return;
    }
    if (pathname === "/api/storage/projects/default") {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(project) });
      return;
    }
    if (pathname === "/api/storage/projects/local-project/files") {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ project, files: [] }) });
      return;
    }
    if (pathname === "/api/storage/tests/autosave") {
      const autosave = request.method() === "POST" ? JSON.parse(request.postData() ?? "null") : null;
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ autosave }) });
      return;
    }
    if (pathname === "/api/storage/logos") {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ logos: [] }) });
      return;
    }
    await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({}) });
  });

  await page.route("http://127.0.0.1:8000/api/agent/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
      return;
    }
    if (url.pathname.endsWith("/browser/register")) {
      const payload = JSON.parse(request.postData() ?? "{}");
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          sessionId: payload.sessionId,
          pollUrl: `/api/agent/current/browser/requests?sessionId=${payload.sessionId}`,
          respondUrl: "/api/agent/current/browser/respond",
        }),
      });
      return;
    }
    if (url.pathname.endsWith("/browser/requests")) {
      await delay(250);
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ request: null }) });
      return;
    }
    await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ success: true, removed: true }) });
  });

  await page.route("http://127.0.0.1:8000/api/system/status", async (route) => {
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        status: "ok",
        apiVersion: "overlay-smoke",
        startedAt: now,
        checkedAt: now,
        cwd: ROOT,
        root: ROOT,
        git: { branch: "smoke", commit: "isolated", dirty: false },
        workspace: {
          usesVisibleWorkspace: true,
          isExternalDocumentsFolder: false,
          baseWorkspacePath: WORKBENCH_ROOT,
          workspacePath: WORKBENCH_ROOT,
          documentsPath: WORKBENCH_ROOT,
          metadataPath: path.join(WORKBENCH_ROOT, ".mauth"),
          defaultDocumentsPath: WORKBENCH_ROOT,
          defaultProject: null,
        },
        bridge: {
          available: true,
          activeSessionCount: 1,
          pendingRequestCount: 0,
          sessions: [],
          routes: {
            browserRegister: "/api/agent/current/browser/register",
            browserUnregister: "/api/agent/current/browser/unregister",
            browserRequests: "/api/agent/current/browser/requests",
            browserRespond: "/api/agent/current/browser/respond",
          },
        },
        routes: {
          health: "/api/health",
          systemStatus: "/api/system/status",
          agentDiscovery: "/.well-known/mauth-agent.json",
        },
      }),
    });
  });
}

async function waitForDraft(page, predicate, message) {
  await page.waitForFunction(
    ([storageKey, predicateSource]) => {
      const snapshot = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
      return Function("snapshot", `return (${predicateSource})(snapshot);`)(snapshot);
    },
    [CURRENT_DRAFT_STORAGE_KEY, predicate.toString()],
    { timeout: 5000 },
  );
  const ok = await page.evaluate(
    ([storageKey, predicateSource]) => {
      const snapshot = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
      return Function("snapshot", `return (${predicateSource})(snapshot);`)(snapshot);
    },
    [CURRENT_DRAFT_STORAGE_KEY, predicate.toString()],
  );
  assert.equal(ok, true, message);
}

async function openContextMenu(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.click({ button: "right" });
  const menu = page.locator("[data-context-menu]");
  await menu.waitFor({ state: "visible" });
  return menu;
}

async function clickMenuItem(page, name) {
  await page.getByRole("menuitem", { name }).click();
  await page.locator("[data-context-menu]").waitFor({ state: "hidden" });
}

async function main() {
  const outputDir = path.join(OUTPUT_ROOT, timestampSlug());
  await fs.mkdir(outputDir, { recursive: true });

  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}`;
  const logs = [];
  const child = spawn("pnpm", ["--dir", "apps/web", "dev", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BROWSER: "none" },
  });
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  let browser;
  try {
    await waitForServer(url, child, logs);
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: VIEWPORT });
    const consoleMessages = [];
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) consoleMessages.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => consoleMessages.push(`pageerror: ${error.message}`));
    await mockApi(page);
    await page.addInitScript(
      ([storageKey, draft]) => {
        if (!window.localStorage.getItem(storageKey)) {
          window.localStorage.clear();
          window.localStorage.setItem(storageKey, JSON.stringify(draft));
        }
        window.localStorage.setItem("mauth-studio.theme.v1", "dark");
        window.print = () => {
          window.__mauthOverlaySmokePrintPreviewVisible = Boolean(document.querySelector(".print-preview-stage"));
        };
      },
      [CURRENT_DRAFT_STORAGE_KEY, seededDraft()],
    );

    await page.goto(url);
    await page.getByRole("button", { name: "Manual editor mode" }).click();
    await page.locator(`.editor-pane [data-scroll-anchor="${INTRO_ANCHOR}"]`).waitFor();
    await page.locator(`.preview-pane [data-preview-module-anchor="true"][data-scroll-anchor="${COLUMN_TEXT_ANCHOR}"]`).waitFor();

    assert.equal(await page.locator(".app-workspace").count(), 1, "the document should render one workspace");
    assert.equal(await page.locator(".editor-pane").count(), 1, "manual mode should render one editor pane");
    assert.equal(await page.locator(".preview-pane").count(), 1, "manual mode should render one preview pane");
    assert.equal(await page.locator(".selection-inspector-pane").count(), 1, "manual mode should render one inspector pane");

    const appHeader = page.locator("header.app-header");
    await appHeader.screenshot({ path: path.join(outputDir, "app-header-workspace.png") });

    await page.getByRole("button", { name: "Hide inspector" }).click();
    await page.locator(".selection-inspector-pane").waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Show inspector" }).click();
    await page.locator(".selection-inspector-pane").waitFor({ state: "visible" });
    await page.locator(".app-workspace").screenshot({ path: path.join(outputDir, "document-editor-workspace.png") });

    await page.getByRole("button", { name: "New document" }).first().click();
    const newDocumentDialog = page.getByRole("dialog", { name: "New document" });
    await newDocumentDialog.waitFor({ state: "visible" });
    await newDocumentDialog.getByRole("button", { name: "Close new document" }).click();
    await newDocumentDialog.waitFor({ state: "hidden" });

    await page.getByRole("button", { name: "Save current test" }).first().click();
    const saveDocumentDialog = page.getByRole("dialog", { name: "Save document" });
    await saveDocumentDialog.waitFor({ state: "visible" });
    await saveDocumentDialog.getByRole("button", { name: "Cancel" }).click();
    await saveDocumentDialog.waitFor({ state: "hidden" });

    await page.getByRole("button", { name: "Switch to light mode" }).click();
    await page.getByRole("button", { name: "Switch to dark mode" }).waitFor({ state: "visible" });
    assert.equal(
      await page.locator("html").evaluate((element) => element.classList.contains("dark")),
      false,
      "theme toggle should enter light mode",
    );
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await page.getByRole("button", { name: "Switch to light mode" }).waitFor({ state: "visible" });
    assert.equal(
      await page.locator("html").evaluate((element) => element.classList.contains("dark")),
      true,
      "theme toggle should restore dark mode",
    );

    const solutionsMode = page.getByRole("radio", { name: "Solutions" });
    await solutionsMode.click();
    await page.getByRole("button", { name: "Print mode: Solutions" }).waitFor({ state: "visible" });
    assert.equal(await solutionsMode.getAttribute("aria-checked"), "true", "Solutions should become the active authoring layer");

    const questionSolutionStatus = page.locator('[data-solution-scope-anchor="q:q-context-1"]');
    const partSolutionStatus = page.locator('[data-solution-scope-anchor="q:q-context-1/p:p-context"]');
    await questionSolutionStatus.waitFor({ state: "visible" });
    await partSolutionStatus.waitFor({ state: "visible" });
    assert.equal(await questionSolutionStatus.getAttribute("data-solution-scope-status"), "error");
    assert.match(await questionSolutionStatus.innerText(), /1 solution issue/);
    assert.match(await partSolutionStatus.innerText(), /Add solution/);
    await page.locator(".editor-pane").screenshot({ path: path.join(outputDir, "solution-scope-status-missing.png") });

    await partSolutionStatus.click();
    await page
      .locator('[data-solution-scope-anchor="q:q-context-1/p:p-context"][data-solution-scope-status="error"]')
      .getByText("Review solution", { exact: true })
      .waitFor({ state: "visible" });
    const solutionTextEditor = page.locator(
      '.editor-pane [data-scroll-anchor^="q:q-context-1/p:p-context/b:cols/c:0/b:solution-"] textarea',
    );
    await solutionTextEditor.waitFor({ state: "visible" });
    await solutionTextEditor.fill("$x = 4$ [[marks:1]]");
    const mismatchedPartStatus = page.locator(
      '[data-solution-scope-anchor="q:q-context-1/p:p-context"][data-solution-scope-status="warning"]',
    );
    await mismatchedPartStatus.getByText("Review solution", { exact: true }).waitFor({ state: "visible" });
    assert.match((await mismatchedPartStatus.getAttribute("title")) ?? "", /ticks total 1, but this item is worth 2 marks/);
    await page.locator(".editor-pane").screenshot({ path: path.join(outputDir, "solution-scope-status-mark-mismatch.png") });

    await solutionTextEditor.fill("$x = 4$ [[marks:2]]");
    await page
      .locator('[data-solution-scope-anchor="q:q-context-1/p:p-context"][data-solution-scope-status="ready"]')
      .waitFor({ state: "visible" });
    await page.locator('[data-solution-scope-anchor="q:q-context-1"][data-solution-scope-status="ready"]').waitFor({ state: "visible" });
    await page.locator(".editor-pane").screenshot({ path: path.join(outputDir, "solution-scope-status-ready.png") });

    const sharedChoicePreview = page
      .locator(`.preview-pane [data-preview-module-anchor="true"][data-scroll-anchor="${CHOICE_ANCHOR}"]`)
      .first();
    await sharedChoicePreview.click();
    const sharedChoiceEditor = page.locator(`.editor-pane [data-scroll-anchor="${CHOICE_ANCHOR}"]`).first();
    await sharedChoiceEditor.waitFor({ state: "attached" });
    await sharedChoiceEditor.scrollIntoViewIfNeeded();
    await sharedChoiceEditor.locator('[data-panel-region="header"]').click();
    const sharedChoiceAnswer = sharedChoiceEditor.getByRole("combobox", { name: "Choice list 1 circled answer" });
    await sharedChoiceAnswer.waitFor({ state: "visible" });
    await sharedChoiceAnswer.selectOption("1");
    await waitForDraft(
      page,
      (snapshot) =>
        snapshot?.questions?.find((question) => question.id === "q-choice")?.contentBlocks?.find((block) => block.id === "choices")
          ?.solutionAnswerIndex === 1,
      "Solutions mode should store the circled answer on the shared choice list",
    );

    const sharedChoiceTicks = page.locator('.selection-inspector-pane input[aria-label$="solution surface ticks"]');
    await sharedChoiceTicks.waitFor({ state: "visible" });
    await sharedChoiceTicks.fill("1");
    await waitForDraft(
      page,
      (snapshot) =>
        snapshot?.questions?.find((question) => question.id === "q-choice")?.contentBlocks?.find((block) => block.id === "choices")
          ?.markTicks === 1,
      "Solutions mode should store ticks on the answered shared choice list",
    );

    await sharedChoicePreview.locator('[data-solution-answer="true"]').waitFor({ state: "visible" });
    assert.equal(await sharedChoicePreview.locator('[data-solution-answer="true"]').count(), 1);
    assert.match(await sharedChoicePreview.locator('[data-solution-answer="true"]').innerText(), /B\./);
    await page.locator(".app-workspace").screenshot({ path: path.join(outputDir, "shared-choice-solution-answer.png") });

    const studentMode = page.getByRole("radio", { name: "Student" });
    await studentMode.click();
    await page.getByRole("button", { name: "Print mode: Student" }).waitFor({ state: "visible" });
    assert.equal(await studentMode.getAttribute("aria-checked"), "true", "Student should become the active authoring layer");
    assert.equal(await page.locator("[data-solution-scope-status]").count(), 0, "solution status controls should stay out of Student mode");
    assert.equal(
      await sharedChoiceEditor.getByRole("combobox", { name: "Choice list 1 circled answer" }).count(),
      0,
      "Student mode should hide the shared choice answer selector",
    );
    assert.equal(
      await sharedChoicePreview.locator('[data-solution-answer="true"]').count(),
      0,
      "Student preview should not reveal the stored solution answer",
    );
    assert.equal(
      await page.locator('.selection-inspector-pane input[aria-label$="solution surface ticks"]').count(),
      0,
      "Student mode should hide shared choice solution ticks",
    );
    await page.locator(".app-workspace").screenshot({ path: path.join(outputDir, "shared-choice-student-hidden.png") });

    const sharedTableEditor = page.locator(`.editor-pane [data-scroll-anchor="${TABLE_ANCHOR}"]`).first();
    const sharedTablePreview = page
      .locator(`.preview-pane [data-preview-module-anchor="true"][data-scroll-anchor="${TABLE_ANCHOR}"]`)
      .first();
    await sharedTableEditor.scrollIntoViewIfNeeded();
    await sharedTableEditor.getByRole("button", { name: "Complete in solutions" }).click();
    await page.getByRole("button", { name: "Print mode: Solutions" }).waitFor({ state: "visible" });
    assert.equal(await solutionsMode.getAttribute("aria-checked"), "true", "completing a table should switch to Solutions mode");

    const firstTableAnswer = sharedTableEditor.getByRole("textbox", { name: "Table cell row 2 column 2" });
    const secondTableAnswer = sharedTableEditor.getByRole("textbox", { name: "Table cell row 2 column 3" });
    if (!(await firstTableAnswer.isVisible().catch(() => false))) {
      await sharedTableEditor.locator('[data-panel-region="header"]').click();
    }
    await firstTableAnswer.waitFor({ state: "visible" });
    await firstTableAnswer.fill("$6$");
    await secondTableAnswer.fill("$4$");
    await waitForDraft(
      page,
      (snapshot) => {
        const blocks = snapshot?.questions?.find((question) => question.id === "q-choice")?.contentBlocks ?? [];
        const table = blocks.find((block) => block.id === "answer-table");
        return (
          blocks.filter((block) => block.kind === "table").length === 1 &&
          table?.visibility !== "student" &&
          table?.visibility !== "solution" &&
          table?.solutionEntries?.[0]?.[1] === "$6$" &&
          table?.solutionEntries?.[0]?.[2] === "$4$"
        );
      },
      "Solutions mode should store answers on one shared table without creating a duplicate",
    );

    assert.equal(await sharedTableEditor.locator('input[data-solution-entry="true"]').count(), 2);
    assert.equal(await sharedTableEditor.locator("input.table-editor-solution-entry").count(), 2);
    const sharedTableTicks = page.locator('.selection-inspector-pane input[aria-label$="solution surface ticks"]');
    await sharedTableTicks.fill("2");
    await waitForDraft(
      page,
      (snapshot) =>
        snapshot?.questions?.find((question) => question.id === "q-choice")?.contentBlocks?.find((block) => block.id === "answer-table")
          ?.markTicks === 2,
      "Solutions mode should store ticks on the answered shared table",
    );
    await sharedTablePreview.locator(".test-table-solution-entry-cell").first().waitFor({ state: "visible" });
    assert.equal(await sharedTablePreview.locator(".test-table-solution-entry-cell").count(), 2);
    assert.match(await sharedTablePreview.innerText(), /6/);
    assert.match(await sharedTablePreview.innerText(), /4/);
    await page.locator(".app-workspace").screenshot({ path: path.join(outputDir, "shared-table-solution-entries.png") });

    await studentMode.click();
    await page.getByRole("button", { name: "Print mode: Student" }).waitFor({ state: "visible" });
    assert.equal(await firstTableAnswer.inputValue(), "", "Student mode should hide the first stored table answer");
    assert.equal(await secondTableAnswer.inputValue(), "", "Student mode should hide the second stored table answer");
    assert.equal(await sharedTableEditor.locator('input[data-solution-entry="true"]').count(), 0);
    assert.equal(await sharedTablePreview.locator(".test-table-solution-entry-cell").count(), 0);
    await page.locator(".app-workspace").screenshot({ path: path.join(outputDir, "shared-table-student-hidden.png") });

    await page.getByRole("button", { name: "Open files" }).first().click();
    const filesDrawer = page.locator('aside[aria-label="Files"]');
    await filesDrawer.waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    if (await filesDrawer.isVisible().catch(() => false)) {
      await page
        .getByRole("button", { name: "Close files" })
        .click({ timeout: 5000 })
        .catch(async (error) => {
          if (await filesDrawer.isVisible().catch(() => false)) throw error;
        });
    }
    await filesDrawer.waitFor({ state: "hidden" });

    const systemStatusButton = page.locator('button[aria-label="System status"]:visible').first();
    await systemStatusButton.waitFor({ state: "visible", timeout: 5000 }).catch(async (error) => {
      const bodyText = (
        (await page
          .locator("body")
          .innerText()
          .catch(() => "")) ?? ""
      )
        .replace(/\s+/g, " ")
        .slice(0, 1000);
      throw new Error(
        `System status button disappeared after closing Files. URL: ${page.url()}. Body: ${bodyText}. Console: ${consoleMessages.join(" | ")}`,
        { cause: error },
      );
    });
    await systemStatusButton.click();
    const systemStatusDialog = page.getByRole("dialog", { name: "System status" });
    await systemStatusDialog.waitFor({ state: "visible" });
    const systemStatusText = await systemStatusDialog.innerText();
    assert.match(systemStatusText, /Current preview/);
    assert.match(systemStatusText, /Student/);
    assert.match(systemStatusText, /\d+ total · \d+ content · \d+ supplementary/);
    assert.match(systemStatusText, /No measured page overflow/);
    await systemStatusDialog.getByText("Current preview", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(outputDir, "app-overlays-system-status.png"), fullPage: false });
    await systemStatusDialog.getByRole("button", { name: "Close system status" }).click();
    await systemStatusDialog.waitFor({ state: "hidden" });

    await page.getByRole("button", { name: "Open solution validation" }).click();
    const solutionValidationPanel = page
      .getByText("Solution validation", { exact: true })
      .locator("..", { has: page.getByRole("button", { name: "Close solution validation" }) });
    await page.getByRole("button", { name: "Close solution validation" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Close solution validation" }).click();
    await solutionValidationPanel.waitFor({ state: "hidden" });

    await page.getByRole("button", { name: /^Print mode:/ }).click();
    await page.waitForFunction(() => window.__mauthOverlaySmokePrintPreviewVisible === true);
    assert.equal(await page.locator(".print-preview-stage").count(), 1, "print should mount exactly one hidden preview stage");
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await page.locator(".print-preview-stage").waitFor({ state: "detached" });

    await page.getByRole("button", { name: "Show document navigator" }).click();
    const expandedNavigator = page.getByRole("navigation", { name: "Document table of contents" });
    await expandedNavigator.waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(outputDir, "document-navigation-expanded.png"), fullPage: false });

    const railQuestion = page.locator('button[data-context-anchor="q:q-context-2"]').first();
    const railMenu = await openContextMenu(page, railQuestion);
    await assertVisibleMenu(railMenu, ["Copy agent reference", "Delete"]);
    await page.keyboard.press("Escape");
    await page.locator("[data-context-menu]").waitFor({ state: "hidden" });

    const expandedQuestion = expandedNavigator.locator('[data-context-anchor="q:q-context-2"]').first();
    const navigatorMenu = await openContextMenu(page, expandedQuestion);
    await assertVisibleMenu(navigatorMenu, ["Copy agent reference", "Delete"]);
    await clickMenuItem(page, "Delete");
    await waitForDraft(
      page,
      (snapshot) => snapshot?.questions?.length === 2 && !snapshot.questions.some((question) => question.id === "q-context-2"),
      "navigator delete should remove question 2",
    );
    await page.getByRole("button", { name: "Hide document navigator" }).click();
    await expandedNavigator.waitFor({ state: "hidden" });

    const previewIntro = page.locator(`.preview-pane [data-preview-module-anchor="true"][data-scroll-anchor="${INTRO_ANCHOR}"]`).first();
    const previewMenu = await openContextMenu(page, previewIntro);
    await assertVisibleMenu(previewMenu, ["Copy agent reference", "Delete"]);
    await clickMenuItem(page, "Copy agent reference");

    const previewSpace = page
      .locator('.preview-pane [data-preview-module-anchor="true"][data-scroll-anchor="q:q-context-1/b:space"]')
      .first();
    const previewDeleteMenu = await openContextMenu(page, previewSpace);
    await assertVisibleMenu(previewDeleteMenu, ["Delete"]);
    await clickMenuItem(page, "Delete");
    await waitForDraft(
      page,
      (snapshot) => {
        const question = snapshot?.questions?.find((current) => current.id === "q-context-1");
        return !(question?.contentBlocks ?? []).some((block) => block.id === "space");
      },
      "preview delete should remove the selected display module",
    );

    const editorIntroHeader = page.locator(`.editor-pane [data-scroll-anchor="${INTRO_ANCHOR}"] [data-panel-region="header"]`).first();
    const editorMenu = await openContextMenu(page, editorIntroHeader);
    await assertVisibleMenu(editorMenu, ["Duplicate", "Delete"]);
    await clickMenuItem(page, "Duplicate");
    await waitForDraft(
      page,
      (snapshot) => {
        const question = snapshot?.questions?.find((current) => current.id === "q-context-1");
        return (
          (question?.contentBlocks ?? []).filter((block) => block.kind === "text" && block.text === "Context menu intro prompt.").length ===
          2
        );
      },
      "editor duplicate should duplicate the selected text module",
    );

    const previewColumnText = page
      .locator(`.preview-pane [data-preview-module-anchor="true"][data-scroll-anchor="${COLUMN_TEXT_ANCHOR}"]`)
      .first();
    const columnPreviewMenu = await openContextMenu(page, previewColumnText);
    await assertVisibleMenu(columnPreviewMenu, ["Duplicate", "Delete"]);
    await clickMenuItem(page, "Duplicate");
    await waitForDraft(
      page,
      (snapshot) => {
        const question = snapshot?.questions?.find((current) => current.id === "q-context-1");
        const part = question?.parts?.find((current) => current.id === "p-context");
        const countText = (blocks) =>
          (blocks ?? []).reduce((count, block) => {
            if (block?.kind === "text" && block.text === "Nested context text.") return count + 1;
            if (block?.kind === "columns") return count + (block.columns ?? []).reduce((sum, column) => sum + countText(column), 0);
            return count;
          }, 0);
        return countText(part?.contentBlocks ?? []) === 2;
      },
      "preview duplicate should duplicate the nested column child module",
    );

    const editorColumnHeader = page
      .locator(`.editor-pane [data-scroll-anchor="${COLUMN_TEXT_ANCHOR}"] [data-panel-region="header"]`)
      .first();
    const columnEditorMenu = await openContextMenu(page, editorColumnHeader);
    await assertVisibleMenu(columnEditorMenu, ["Duplicate", "Delete"]);
    await clickMenuItem(page, "Delete");
    await waitForDraft(
      page,
      (snapshot) => {
        const question = snapshot?.questions?.find((current) => current.id === "q-context-1");
        const part = question?.parts?.find((current) => current.id === "p-context");
        const countText = (blocks) =>
          (blocks ?? []).reduce((count, block) => {
            if (block?.kind === "text" && block.text === "Nested context text.") return count + 1;
            if (block?.kind === "columns") return count + (block.columns ?? []).reduce((sum, column) => sum + countText(column), 0);
            return count;
          }, 0);
        const findBlock = (blocks, blockId) => {
          for (const block of blocks ?? []) {
            if (block?.id === blockId) return block;
            if (block?.kind === "columns") {
              for (const column of block.columns ?? []) {
                const found = findBlock(column, blockId);
                if (found) return found;
              }
            }
          }
          return null;
        };
        return !findBlock(part?.contentBlocks ?? [], "c1-text") && countText(part?.contentBlocks ?? []) === 1;
      },
      "editor delete should remove the targeted nested column child module",
    );

    const screenshotPath = path.join(outputDir, "context-menu-actions.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const relevantConsoleMessages = consoleMessages.filter(
      (message) =>
        !message.includes("Failed to load resource") &&
        !message.includes("JSXGraph: Error: Unknown element with id") &&
        !message.includes("No element found with id"),
    );
    assert.deepEqual(relevantConsoleMessages, [], `Unexpected browser console warnings/errors:\n${relevantConsoleMessages.join("\n")}`);

    console.log(`Context menu actions smoke passed: ${screenshotPath}`);
  } finally {
    if (browser) await browser.close();
    await stopProcess(child);
  }
}

async function assertVisibleMenu(menu, actionNames) {
  const label = await menu.getAttribute("aria-label");
  const menuText = await menu.innerText().catch(() => "");
  assert.equal(label, "Context actions", `Expected context actions menu, saw ${label ?? "no label"}:\n${menuText}`);
  for (const staleLabel of [
    "Navigator actions",
    "Display actions",
    "Editor actions",
    "Inspect",
    "Show in preview",
    "Set section",
    "Send to assistant",
    "Use in assistant",
    "Copy for assistant",
    "Copy assistant reference",
  ]) {
    assert(!menuText.includes(staleLabel), `Menu still contains stale label "${staleLabel}":\n${menuText}`);
  }
  for (const actionName of actionNames) {
    await menu.getByRole("menuitem", { name: actionName }).waitFor();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
