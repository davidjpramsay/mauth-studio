import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKBENCH_ROOT = path.resolve(ROOT, "..", "mauth-workbench");
const OUTPUT_ROOT =
  process.env.MAUTH_CONTEXT_MENU_ACTIONS_SMOKE_OUTPUT ?? path.join(WORKBENCH_ROOT, "verification", "context-menu-actions-smoke");
const CURRENT_DRAFT_STORAGE_KEY = "mauth-studio.current-draft.v1";
const VIEWPORT = { width: 1484, height: 1264 };
const INTRO_ANCHOR = "q:q-context-1/b:intro";
const COLUMN_TEXT_ANCHOR = "q:q-context-1/p:p-context/b:cols/c:0/b:c1-text";
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
    ],
    updatedAt: new Date().toISOString(),
  };
}

async function mockApi(page) {
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

  await page.route("http://127.0.0.1:8000/api/assistant/status", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      body: JSON.stringify({ configured: true, model: "mock-context-menu", provider: "mock", missingSetting: null }),
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
    await mockApi(page);
    await page.addInitScript(
      ([storageKey, draft]) => {
        window.localStorage.clear();
        window.localStorage.setItem("mauth-studio.theme.v1", "dark");
        window.localStorage.setItem(storageKey, JSON.stringify(draft));
      },
      [CURRENT_DRAFT_STORAGE_KEY, seededDraft()],
    );

    await page.goto(url);
    await page.getByRole("button", { name: "Manual editor mode" }).click();
    await page.locator(`.editor-pane [data-scroll-anchor="${INTRO_ANCHOR}"]`).waitFor();
    await page.locator(`.preview-pane [data-preview-module-anchor="true"][data-scroll-anchor="${COLUMN_TEXT_ANCHOR}"]`).waitFor();

    const navigatorQuestion = page.locator('button[data-context-anchor="q:q-context-2"]').first();
    const navigatorMenu = await openContextMenu(page, navigatorQuestion);
    await assertVisibleMenu(navigatorMenu, "Navigator actions", ["Ask assistant about this", "Delete Question 2"]);
    await clickMenuItem(page, "Delete Question 2");
    await waitForDraft(
      page,
      (snapshot) => snapshot?.questions?.length === 1 && !snapshot.questions.some((question) => question.id === "q-context-2"),
      "navigator delete should remove question 2",
    );

    const previewIntro = page.locator(`.preview-pane [data-preview-module-anchor="true"][data-scroll-anchor="${INTRO_ANCHOR}"]`).first();
    const previewMenu = await openContextMenu(page, previewIntro);
    await assertVisibleMenu(previewMenu, "Display actions", ["Open in editor", "Ask assistant about this", "Delete Text 1"]);
    await clickMenuItem(page, "Ask assistant about this");
    const assistantInput = page.locator(".assistant-pane textarea");
    await assistantInput.waitFor();
    const assistantValue = await assistantInput.inputValue();
    assert(assistantValue.includes(`Editor anchor: ${INTRO_ANCHOR}`), "assistant context should include the editor anchor");
    assert(assistantValue.includes(`Preview anchor: ${INTRO_ANCHOR}`), "assistant context should include the preview anchor");
    assert(assistantValue.includes("Source: preview"), "assistant context should record the display source");

    await page.getByRole("button", { name: "Manual editor mode" }).click();
    const previewSpace = page
      .locator('.preview-pane [data-preview-module-anchor="true"][data-scroll-anchor="q:q-context-1/b:space"]')
      .first();
    const previewDeleteMenu = await openContextMenu(page, previewSpace);
    await assertVisibleMenu(previewDeleteMenu, "Display actions", ["Open in editor", "Delete Space 2"]);
    await clickMenuItem(page, "Delete Space 2");
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
    await assertVisibleMenu(editorMenu, "Editor actions", ["Inspect", "Duplicate", "Delete Text 1"]);
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
    await assertVisibleMenu(columnPreviewMenu, "Display actions", ["Open in editor", "Duplicate", "Delete Part Column 1 text 1"]);
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
    await assertVisibleMenu(columnEditorMenu, "Editor actions", ["Inspect", "Duplicate", "Delete Part Column 1 text 1"]);
    await clickMenuItem(page, "Delete Part Column 1 text 1");
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

async function assertVisibleMenu(menu, title, actionNames) {
  const label = await menu.getAttribute("aria-label");
  const menuText = await menu.innerText().catch(() => "");
  assert.equal(label, title, `Expected ${title} menu, saw ${label ?? "no label"}:\n${menuText}`);
  for (const actionName of actionNames) {
    await menu.getByRole("menuitem", { name: actionName }).waitFor();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
