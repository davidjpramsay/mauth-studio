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
const outputDir = path.join(ROOT, "workspace/verification/document-tabs-smoke", new Date().toISOString().replace(/[:.]/g, "-"));
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
        else reject(new Error("Could not allocate a local port"));
      });
    });
  });
}

async function waitForServer(url, child, logs) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Process exited before serving ${url}\n${logs.join("")}`);
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // Local development services can take a moment to bind.
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

async function startApiServer(documentsRoot, stateRoot) {
  const port = await findFreePort();
  apiUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  const child = spawn("uv", ["run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: path.join(ROOT, "apps/api"),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      MAUTH_DOCUMENTS_ROOT: documentsRoot,
      MATH_APP_STORAGE_ROOT: stateRoot,
    },
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

function savedDocumentContent(index) {
  const title = `Tab ${index}`;
  const now = new Date().toISOString();
  return JSON.stringify(
    {
      format: "mauth-studio-document",
      schemaVersion: 1,
      id: `document-tabs-smoke-${index}`,
      name: title,
      frontMatter: {
        subjectTitle: "DOCUMENT TAB SMOKE",
        assessmentTitle: title,
        assessmentSubtitle: "Disposable browser verification",
      },
      questions: [
        {
          id: `question-${index}`,
          section: "Smoke",
          marks: 1,
          contentBlocks: [{ id: `text-${index}`, kind: "text", text: `${title} original wording` }],
          parts: [],
          itemOrder: [{ kind: "block", id: `text-${index}` }],
        },
      ],
      sectionHeadings: [],
      documentFlow: [{ kind: "question", id: `question-${index}` }],
      formattingConfig: { id: "high-school-mathematics-test" },
      createdAt: now,
      updatedAt: now,
    },
    null,
    2,
  );
}

async function seedDocuments() {
  const project = await requestJson("/api/storage/projects/default");
  for (let index = 1; index <= 8; index += 1) {
    const filePath = `tests/Tab ${index}.mauth`;
    await requestJson(`/api/storage/projects/${encodeURIComponent(project.id)}/files/${encodeProjectFilePath(filePath)}`, {
      method: "PUT",
      body: JSON.stringify({
        kind: "file",
        fileType: "test",
        metadata: { source: "document-tabs-smoke" },
        content: savedDocumentContent(index),
      }),
    });
  }
  const files = await requestJson(`/api/storage/projects/${encodeURIComponent(project.id)}/files`);
  assert.equal(files.files.filter((file) => file.kind === "file").length, 8);
  const graceImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  for (const logo of [
    { id: "grace-primary", name: "Grace", schoolName: "GRACE\nCHRISTIAN SCHOOL", src: graceImage },
    { id: "grace-logo-only-a", name: "Grace Logo Only", src: graceImage },
    { id: "grace-logo-only-b", name: "Grace Logo Only", src: graceImage },
  ]) {
    await requestJson("/api/storage/logos", { method: "POST", body: JSON.stringify(logo) });
  }
  return project;
}

async function waitForReconciledGraceLogos() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await requestJson("/api/storage/logos");
    const labels = response.logos.map((logo) => logo.name);
    if (labels.includes("Grace Christian College") && !labels.includes("Grace Logo Only") && !labels.includes("Grace")) return labels;
    await delay(100);
  }
  const response = await requestJson("/api/storage/logos");
  throw new Error(`Logo reconciliation did not settle: ${response.logos.map((logo) => `${logo.id}:${logo.name}`).join(", ")}`);
}

async function openFilesDrawer(page) {
  await page.getByRole("button", { name: "Open files" }).click();
  const drawer = page.locator('aside[aria-label="Files"]');
  await drawer.waitFor({ state: "visible", timeout: 8000 });
  return drawer;
}

async function openDocument(page, filePath) {
  const drawer = await openFilesDrawer(page);
  const drawerPath = filePath.replace(/^tests\//, "");
  const row = drawer.locator(`[data-mauth-file-path="${drawerPath}"]`).first();
  try {
    await row.waitFor({ state: "visible", timeout: 8000 });
  } catch (error) {
    const apiFiles = await requestJson("/api/storage/projects/local-project/files");
    const drawerText = ((await drawer.textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
    throw new Error(
      `Could not find ${filePath}. API paths: ${apiFiles.files.map((file) => file.path).join(", ")}. Drawer: ${drawerText.slice(0, 1000)}`,
      { cause: error },
    );
  }
  await row.click();
  await drawer.getByRole("button", { name: "Open", exact: true }).click();
  await drawer.waitFor({ state: "hidden", timeout: 8000 });
  await page
    .getByText(`${path.basename(filePath, ".mauth")} original wording`)
    .first()
    .waitFor({ state: "visible", timeout: 8000 });
}

function documentTab(page, title) {
  return page.locator('[role="tab"]').filter({ hasText: title }).first();
}

async function assertSystemStatusButtonContrast(page, theme) {
  await page.evaluate(() => window.__mauthDesktopSmoke.emitSystemStatus());
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });

  const controls = await dialog.locator("button:visible").evaluateAll((buttons) => {
    function parseRgb(value) {
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!match) return null;
      return {
        red: Number(match[1]),
        green: Number(match[2]),
        blue: Number(match[3]),
        alpha: match[4] === undefined ? 1 : Number(match[4]),
      };
    }

    function luminance({ red, green, blue }) {
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
    }

    function effectiveBackground(element) {
      let current = element;
      while (current) {
        const color = parseRgb(getComputedStyle(current).backgroundColor);
        if (color && color.alpha > 0.98) return color;
        current = current.parentElement;
      }
      return { red: 255, green: 255, blue: 255, alpha: 1 };
    }

    return buttons.map((button) => {
      const foreground = parseRgb(getComputedStyle(button).color);
      const background = effectiveBackground(button);
      const lighter = Math.max(luminance(foreground), luminance(background));
      const darker = Math.min(luminance(foreground), luminance(background));
      return {
        name: button.getAttribute("aria-label") || button.textContent?.trim() || "unnamed button",
        color: getComputedStyle(button).color,
        background: getComputedStyle(button).backgroundColor,
        contrast: (lighter + 0.05) / (darker + 0.05),
      };
    });
  });

  assert.ok(controls.length >= 2, `Expected System Status controls in ${theme} theme`);
  for (const control of controls) {
    assert.ok(
      control.contrast >= 4.5,
      `${control.name} has ${control.contrast.toFixed(2)}:1 contrast in ${theme} theme (${control.color} on ${control.background})`,
    );
  }

  await page.screenshot({ path: path.join(outputDir, `system-status-${theme}.png`), fullPage: false });
  await page.getByRole("button", { name: "Close system status" }).click();
  await dialog.waitFor({ state: "hidden" });
  return controls;
}

async function findTextarea(page, value) {
  const textareas = page.locator("textarea");
  for (let index = 0; index < (await textareas.count()); index += 1) {
    const textarea = textareas.nth(index);
    if ((await textarea.inputValue().catch(() => "")) === value) return textarea;
  }
  throw new Error(`Could not find textarea with value: ${value}`);
}

async function run() {
  await fs.mkdir(outputDir, { recursive: true });
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mauth-document-tabs-"));
  const documentsRoot = path.join(tempRoot, "Documents");
  const stateRoot = path.join(tempRoot, "state");
  await fs.mkdir(documentsRoot, { recursive: true });
  await fs.mkdir(stateRoot, { recursive: true });

  let apiProcess;
  let webProcess;
  let browser;
  try {
    apiProcess = await startApiServer(documentsRoot, stateRoot);
    webProcess = await startWebServer();
    await seedDocuments();

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1120, height: 820 }, deviceScaleFactor: 1 });
    await page.addInitScript(() => {
      const listeners = {
        agentSetup: new Set(),
        documentOpen: new Set(),
        systemStatus: new Set(),
        themeToggle: new Set(),
        solutionValidation: new Set(),
      };
      const subscribe = (set, listener) => {
        if (typeof listener !== "function") return () => {};
        set.add(listener);
        return () => set.delete(listener);
      };
      window.__mauthDesktopSmoke = {
        emitSystemStatus: () => listeners.systemStatus.forEach((listener) => listener()),
        emitThemeToggle: () => listeners.themeToggle.forEach((listener) => listener()),
        emitSolutionValidation: () => listeners.solutionValidation.forEach((listener) => listener()),
      };
      window.mauthDesktop = {
        getAgentConnectorInfo: async () => ({
          available: true,
          bundled: false,
          version: "smoke",
          connectorPath: null,
          launchCommand: "",
          launchArgs: [],
          codexSetupCommand: "",
          claudeCodeSetupCommand: "",
          claudeDesktopConfiguration: "",
          doctorCommand: "",
        }),
        onOpenAgentSetup: (listener) => subscribe(listeners.agentSetup, listener),
        onOpenDocument: (listener) => subscribe(listeners.documentOpen, listener),
        onOpenSystemStatus: (listener) => subscribe(listeners.systemStatus, listener),
        onOpenSolutionValidation: (listener) => subscribe(listeners.solutionValidation, listener),
        onToggleTheme: (listener) => subscribe(listeners.themeToggle, listener),
      };
    });
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto(webUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Open files" }).waitFor({ state: "visible", timeout: 10000 });
    assert.equal(await page.getByRole("button", { name: "System status" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: /Switch to (light|dark) mode/ }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Open solution validation" }).count(), 0);
    assert.equal(await page.locator("header svg.lucide-layers").count(), 0);
    assert.equal(await page.locator('header button[aria-label="Close current file"]:visible').count(), 0);

    const initiallyDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    const initialTheme = initiallyDark ? "dark" : "light";
    const alternateTheme = initiallyDark ? "light" : "dark";
    const initialStatusContrast = await assertSystemStatusButtonContrast(page, initialTheme);
    await page.evaluate(() => window.__mauthDesktopSmoke.emitThemeToggle());
    await page.waitForFunction((expected) => document.documentElement.classList.contains("dark") === expected, !initiallyDark);
    const alternateStatusContrast = await assertSystemStatusButtonContrast(page, alternateTheme);
    await page.evaluate(() => window.__mauthDesktopSmoke.emitThemeToggle());
    await page.waitForFunction((expected) => document.documentElement.classList.contains("dark") === expected, initiallyDark);

    await openDocument(page, "tests/Tab 1.mauth");
    await openDocument(page, "tests/Tab 2.mauth");
    assert.equal(await documentTab(page, "Tab 1").count(), 1);
    assert.equal(await documentTab(page, "Tab 2").count(), 1);
    const reconciledLogoLabels = await waitForReconciledGraceLogos();

    await documentTab(page, "Tab 1").getByRole("button", { name: "Open Tab 1" }).click();
    const manualEditorButton = page.getByRole("button", { name: /^(?:Manual editor mode|Hide editor)$/ });
    if ((await manualEditorButton.getAttribute("aria-pressed")) !== "true") await manualEditorButton.click();
    await page.getByRole("button", { name: /^Title Page\./ }).click();
    const frontMatterEditor = page.locator('div[data-scroll-anchor="front-matter"]');
    await frontMatterEditor.waitFor({ state: "visible", timeout: 8000 });
    const titleEditorPanel = frontMatterEditor.getByText("Title:", { exact: true }).locator("xpath=ancestor::section[1]");
    await titleEditorPanel.waitFor({ state: "visible", timeout: 8000 });
    const titleEditorButton = titleEditorPanel.getByRole("button", { name: /panel$/ });
    if ((await titleEditorButton.getAttribute("aria-expanded")) !== "true") await titleEditorButton.click();
    const logoOptionsLocator = titleEditorPanel.locator("select option");
    await logoOptionsLocator.first().waitFor({ state: "attached", timeout: 8000 });
    const logoOptions = await logoOptionsLocator.allTextContents();
    assert.ok(logoOptions.includes("Grace Christian College"), `Expected renamed Grace option, got ${logoOptions.join(", ")}`);
    assert.equal(logoOptions.includes("Grace"), false);
    assert.equal(logoOptions.includes("Grace Logo Only"), false);

    const headerMetrics = await page.evaluate(() => {
      const rect = (element) => {
        const bounds = element?.getBoundingClientRect();
        return bounds ? { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width } : null;
      };
      return {
        viewportWidth: window.innerWidth,
        pageScrollX: window.scrollX,
        pageScrollWidth: document.documentElement.scrollWidth,
        header: rect(document.querySelector("header")),
        rail: rect(document.querySelector(".document-tab-rail")),
        tabOne: rect(document.querySelector('[aria-label="Open Tab 1"]')),
        newDocument: rect(document.querySelector('[aria-label="New document"]')),
      };
    });
    await documentTab(page, "Tab 1").getByRole("button", { name: "Open Tab 1" }).click();
    await page.getByText("Tab 1 original wording").first().waitFor({ state: "visible", timeout: 8000 });
    await page.evaluate(() => window.__mauthDesktopSmoke.emitSolutionValidation());
    await page.getByRole("heading", { name: "Solution validation" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Close solution validation" }).click();
    await page.getByRole("heading", { name: "Solution validation" }).waitFor({ state: "hidden" });
    const solutionModeToggle = page.getByRole("button", { name: "Switch to Solutions mode" });
    await solutionModeToggle.click();
    const studentModeToggle = page.getByRole("button", { name: "Switch to Student mode" });
    await studentModeToggle.waitFor({ state: "visible" });
    assert.equal(await studentModeToggle.getAttribute("aria-pressed"), "true");
    await studentModeToggle.click();
    await solutionModeToggle.waitFor({ state: "visible" });
    assert.equal(await solutionModeToggle.getAttribute("aria-pressed"), "false");
    if ((await manualEditorButton.getAttribute("aria-pressed")) !== "true") await manualEditorButton.click();
    await page.getByRole("button", { name: /^Question 1\./ }).click();
    const tabOneText = await findTextarea(page, "Tab 1 original wording");
    await tabOneText.fill("Tab 1 edited wording");

    await documentTab(page, "Tab 2").getByRole("button", { name: "Open Tab 2" }).click();
    await page.getByText("Tab 2 original wording").first().waitFor({ state: "visible", timeout: 8000 });
    await documentTab(page, "Tab 1").getByRole("button", { name: "Open Tab 1" }).click();
    assert.equal(await (await findTextarea(page, "Tab 1 edited wording")).inputValue(), "Tab 1 edited wording");
    await (await findTextarea(page, "Tab 1 edited wording")).fill("Tab 1 original wording");

    for (let index = 3; index <= 8; index += 1) await openDocument(page, `tests/Tab ${index}.mauth`);

    const rail = page.locator(".document-tab-rail");
    const railSize = await rail.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    assert.ok(railSize.scrollWidth > railSize.clientWidth, `Expected a scrollable tab rail, got ${JSON.stringify(railSize)}`);
    await page.getByRole("button", { name: "Show open documents", exact: true }).click();
    const openDocumentMenu = page.locator(".absolute.right-0.top-10");
    await openDocumentMenu.waitFor({ state: "visible" });
    assert.ok((await openDocumentMenu.getByRole("button").count()) >= 8);
    await page.keyboard.press("Escape");
    await openDocumentMenu.waitFor({ state: "hidden" });

    await page.screenshot({ path: path.join(outputDir, "document-tabs.png"), fullPage: false });
    await delay(900);
    const beforeReloadCount = await page.locator('[role="tab"]').count();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("tablist", { name: "Open documents" }).waitFor({ state: "visible", timeout: 10000 });
    assert.equal(await page.locator('[role="tab"]').count(), beforeReloadCount);

    await documentTab(page, "Tab 2").getByRole("button", { name: "Close Tab 2" }).click();
    await documentTab(page, "Tab 2").waitFor({ state: "detached", timeout: 8000 });
    await page.getByText("Tab 3 original wording").first().waitFor({ state: "visible", timeout: 8000 });

    await delay(500);
    const persisted = await requestJson("/api/storage/editor-session");
    assert.equal(persisted.session.tabs.length, beforeReloadCount - 1);
    assert.deepEqual(consoleErrors, []);

    console.log(
      JSON.stringify(
        {
          success: true,
          tabCountBeforeClose: beforeReloadCount,
          headerMetrics,
          railSize,
          reconciledLogoLabels,
          systemStatusContrast: {
            [initialTheme]: initialStatusContrast,
            [alternateTheme]: alternateStatusContrast,
          },
          restoredAfterReload: true,
          backgroundCloseRestoredNextTab: true,
          screenshot: path.join(outputDir, "document-tabs.png"),
        },
        null,
        2,
      ),
    );
  } finally {
    await browser?.close().catch(() => undefined);
    await stopProcess(webProcess);
    await stopProcess(apiProcess);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

await run();
