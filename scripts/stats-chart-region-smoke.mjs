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
const OUTPUT_ROOT = process.env.MAUTH_STATS_REGION_SMOKE_OUTPUT ?? path.join(os.tmpdir(), "mauth-stats-region-smoke");
const CURRENT_DRAFT_STORAGE_KEY = "mauth-studio.current-draft.v1";
const STATS_ANCHOR = "q:q-stats/b:normal-curve";

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
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Process exited before serving ${url}\n${logs.join("")}`);
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
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

async function mockPersistentApi(page) {
  const now = new Date().toISOString();
  const project = {
    id: "stats-region-smoke",
    name: "Statistics region smoke",
    description: null,
    metadata: {},
    workspacePath: "/tmp/mauth-stats-region-smoke",
    documentsPath: "/tmp/mauth-stats-region-smoke",
    fileCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "content-type": "application/json",
  };

  await page.route("**/api/storage/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers, body: "" });
      return;
    }
    if (pathname === "/api/storage/tests") {
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ tests: [] }) });
      return;
    }
    if (pathname === "/api/storage/tests/autosave") {
      const autosave = request.method() === "POST" ? JSON.parse(request.postData() ?? "null") : null;
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ autosave }) });
      return;
    }
    if (pathname === "/api/storage/logos") {
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ logos: [] }) });
      return;
    }
    if (pathname === "/api/storage/projects/default") {
      await route.fulfill({ status: 200, headers, body: JSON.stringify(project) });
      return;
    }
    if (pathname === `/api/storage/projects/${project.id}/files`) {
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ project, files: [] }) });
      return;
    }
    await route.fulfill({ status: 200, headers, body: JSON.stringify({}) });
  });

  await page.route("**/api/agent/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers, body: "" });
      return;
    }
    if (url.pathname.endsWith("/browser/register")) {
      const payload = JSON.parse(request.postData() ?? "{}");
      await route.fulfill({
        status: 200,
        headers,
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
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ request: null }) });
      return;
    }
    await route.fulfill({ status: 200, headers, body: JSON.stringify({ success: true }) });
  });
}

function seededDraft() {
  return {
    frontMatter: {
      subjectTitle: "MATHEMATICS METHODS",
      assessmentTitle: "Statistics region smoke",
      titlePageTemplate: "worksheet",
    },
    formattingConfig: {},
    questions: [
      {
        id: "q-stats",
        section: "Statistics",
        text: "Shade the region corresponding to $63<X<78$.",
        marks: 3,
        contentBlocks: [
          {
            id: "normal-curve",
            kind: "diagram",
            graphConfig: {
              type: "statsChart",
              data: {
                chartType: "normal",
                mean: 68,
                stdDev: 5,
                range: [52, 84],
                xLabel: "x",
                yLabel: "Density",
                regions: [],
              },
              options: { widthPx: 560, heightPx: 320, showGrid: false },
            },
          },
        ],
        parts: [],
        itemOrder: [{ kind: "block", id: "normal-curve" }],
        pageBreakAfter: false,
      },
    ],
    sectionHeadings: [],
    documentFlow: [{ kind: "question", id: "q-stats" }],
    updatedAt: new Date().toISOString(),
  };
}

async function waitForDraft(page, predicate, message) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const snapshot = await page.evaluate(
      (storageKey) => JSON.parse(window.localStorage.getItem(storageKey) ?? "null"),
      CURRENT_DRAFT_STORAGE_KEY,
    );
    if (predicate(snapshot)) return snapshot;
    await delay(100);
  }
  assert.fail(message);
}

function statsDiagram(snapshot) {
  const question = snapshot?.questions?.find((candidate) => candidate.id === "q-stats");
  return (question?.contentBlocks ?? []).find((block) => block.id === "normal-curve" && block.kind === "diagram");
}

async function setSolutionMode(page, showSolutions) {
  const targetLabel = showSolutions ? "Switch to Solutions mode" : "Switch to Student mode";
  const settledLabel = showSolutions ? "Switch to Student mode" : "Switch to Solutions mode";
  const target = page.getByRole("button", { name: targetLabel });
  if (await target.isVisible().catch(() => false)) await target.click();
  await page.getByRole("button", { name: settledLabel }).waitFor();
}

async function main() {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mauth-stats-region-workspace-"));
  const stateRoot = path.join(workspaceRoot, ".state");
  const outputDir = path.join(OUTPUT_ROOT, timestampSlug());
  await fs.mkdir(outputDir, { recursive: true });

  const apiPort = await findFreePort();
  const webPort = await findFreePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;
  const apiLogs = [];
  const webLogs = [];
  const api = spawn("uv", ["run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(apiPort)], {
    cwd: path.join(ROOT, "apps/api"),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, MAUTH_DOCUMENTS_ROOT: workspaceRoot, MAUTH_WORKSPACE_STATE_ROOT: stateRoot },
  });
  api.stdout.on("data", (chunk) => apiLogs.push(chunk.toString()));
  api.stderr.on("data", (chunk) => apiLogs.push(chunk.toString()));

  let web;
  let browser;
  let page;
  try {
    await waitForServer(`${apiUrl}/api/system/status`, api, apiLogs);
    web = spawn("pnpm", ["--dir", "apps/web", "dev", "--host", "127.0.0.1", "--port", String(webPort)], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "none", VITE_API_URL: apiUrl },
    });
    web.stdout.on("data", (chunk) => webLogs.push(chunk.toString()));
    web.stderr.on("data", (chunk) => webLogs.push(chunk.toString()));
    await waitForServer(webUrl, web, webLogs);

    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1540, height: 1100 } });
    const consoleMessages = [];
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) consoleMessages.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => consoleMessages.push(`pageerror: ${error.message}`));
    await mockPersistentApi(page);
    await page.addInitScript(
      ([storageKey, draft]) => {
        window.localStorage.clear();
        window.localStorage.setItem(storageKey, JSON.stringify(draft));
      },
      [CURRENT_DRAFT_STORAGE_KEY, seededDraft()],
    );

    await page.goto(webUrl, { waitUntil: "domcontentloaded" });
    assert.equal(page.url(), `${webUrl}/`);
    assert.match(await page.title(), /Mauth/i);
    assert.match((await page.locator("body").innerText()).replace(/\s+/g, " "), /Statistics region smoke/i);
    assert.equal(await page.locator("vite-error-overlay").count(), 0, "The page must not contain a Vite error overlay.");

    await page.getByRole("button", { name: "Manual editor mode" }).click();
    await setSolutionMode(page, true);

    const statsPanel = page.locator(`.editor-pane [data-scroll-anchor="${STATS_ANCHOR}"]`).first();
    await statsPanel.waitFor();
    await statsPanel.getByRole("button", { name: "Add solution region" }).dispatchEvent("click");
    let snapshot = await waitForDraft(
      page,
      (draft) => statsDiagram(draft)?.graphConfig?.data?.regions?.length === 1,
      "Solutions mode should create one statistics chart region.",
    );
    const region = statsDiagram(snapshot)?.graphConfig?.data?.regions?.[0];
    assert.equal(region?.solutionOnly, true);
    assert.equal(region?.mode, "between");
    assert.equal(region?.lower, 63);
    assert.equal(region?.upper, 73);
    assert.ok(region?.id);

    const regionRow = statsPanel.locator(`[data-stats-region-id="${region.id}"][data-solution-only="true"]`).first();
    await regionRow.getByRole("spinbutton", { name: `Region ${region.id} upper bound` }).fill("78");
    snapshot = await waitForDraft(
      page,
      (draft) => statsDiagram(draft)?.graphConfig?.data?.regions?.[0]?.upper === 78,
      "The region upper bound should update to 78.",
    );
    assert.deepEqual(statsDiagram(snapshot)?.graphConfig?.data?.range, [52, 84]);

    const statsPreview = page.locator(`.preview-pane [data-scroll-anchor="${STATS_ANCHOR}"] .stats-chart-diagram`).first();
    const fill = statsPreview.locator(".scatterlayer .trace .js-fill").first();
    await fill.waitFor();
    const fillColour = await fill.evaluate(
      (element) => element.getAttribute("fill") ?? getComputedStyle(element).fill ?? getComputedStyle(element).color,
    );
    assert.match(fillColour.toLowerCase(), /#1d4ed8|rgba?\(29,\s*78,\s*216/);

    const ticks = await statsPreview
      .locator(".xaxislayer-above .xtick text")
      .allTextContents()
      .then((values) => values.map((value) => value.trim()).filter(Boolean));
    assert.deepEqual(ticks, ["55", "60", "65", "70", "75", "80"]);

    const layoutEvidence = await statsPreview.evaluate((chart) => {
      const svg = chart.querySelector("svg.main-svg");
      const clip = [...chart.querySelectorAll(".clips clipPath rect")].find((candidate) => {
        if (!candidate.parentElement?.id.endsWith("xy")) return false;
        const width = Number(candidate.getAttribute("data-mauth-clip-width"));
        const height = Number(candidate.getAttribute("data-mauth-clip-height"));
        return width > 100 && height > 100;
      });
      const tickRects = [...chart.querySelectorAll(".xaxislayer-above .xtick text")].map((tick) => tick.getBoundingClientRect());
      if (!svg || !clip || !tickRects.length) return null;
      const svgRect = svg.getBoundingClientRect();
      const chartRect = chart.getBoundingClientRect();
      const baseY = Number(clip.getAttribute("data-mauth-clip-y"));
      const baseHeight = Number(clip.getAttribute("data-mauth-clip-height"));
      const baseWidth = Number(clip.getAttribute("data-mauth-clip-width"));
      const currentWidth = Number(clip.getAttribute("width"));
      const currentHeight = Number(clip.getAttribute("height"));
      const sourceSvgHeight = svg.viewBox.baseVal.height || Number(svg.getAttribute("height")) || svgRect.height;
      const plotScaleY = svgRect.height / sourceSvgHeight;
      const plotBottom = svgRect.top + (baseY + baseHeight) * plotScaleY;
      const axisPaths = [...chart.querySelectorAll(".xaxislayer-above path, .yaxislayer-above path")];
      const xTickMarks = axisPaths.filter((path) => path.classList.contains("xtick"));
      const yTickMarks = axisPaths.filter((path) => path.classList.contains("ytick"));
      return {
        horizontalClipExpansion: currentWidth - baseWidth,
        verticalClipExpansion: currentHeight - baseHeight,
        tickClearance: Math.min(...tickRects.map((rect) => rect.top - plotBottom)),
        firstTickInside: tickRects[0].left >= chartRect.left,
        lastTickInside: tickRects[tickRects.length - 1].right <= chartRect.right,
        xTickMarkCount: xTickMarks.length,
        yTickMarkCount: yTickMarks.length,
        xTickMarksAreFivePixels: xTickMarks.every((path) => /v5$/.test(path.getAttribute("d") ?? "")),
        yTickMarksAreFivePixels: yTickMarks.every((path) => /h-5$/.test(path.getAttribute("d") ?? "")),
      };
    });
    assert.ok(layoutEvidence, "The Plotly chart should expose measurable plot and tick geometry.");
    assert.ok(layoutEvidence.horizontalClipExpansion >= 15.5);
    assert.ok(layoutEvidence.verticalClipExpansion >= 15.5);
    assert.ok(layoutEvidence.tickClearance >= 1, `Expected x tick labels below the axis; evidence was ${JSON.stringify(layoutEvidence)}.`);
    assert.equal(layoutEvidence.firstTickInside, true);
    assert.equal(layoutEvidence.lastTickInside, true);
    assert.equal(layoutEvidence.xTickMarkCount, 6);
    assert.equal(layoutEvidence.yTickMarkCount, 6);
    assert.equal(layoutEvidence.xTickMarksAreFivePixels, true);
    assert.equal(layoutEvidence.yTickMarksAreFivePixels, true);

    const solutionScreenshot = path.join(outputDir, "solutions-region.png");
    await statsPreview.screenshot({ path: solutionScreenshot });

    await setSolutionMode(page, false);
    await page.waitForFunction(
      ([anchor, regionId]) => {
        const editorRegion = document.querySelector(`.editor-pane [data-scroll-anchor="${anchor}"] [data-stats-region-id="${regionId}"]`);
        const preview = document.querySelector(`.preview-pane [data-scroll-anchor="${anchor}"] .stats-chart-diagram`);
        return (
          !editorRegion &&
          !preview?.querySelector(".scatterlayer .trace .js-fill") &&
          preview?.querySelectorAll(".scatterlayer .trace").length === 1
        );
      },
      [STATS_ANCHOR, region.id],
    );
    const studentScreenshot = path.join(outputDir, "student-curve.png");
    await statsPreview.screenshot({ path: studentScreenshot });

    assert.deepEqual(consoleMessages, [], `Browser console should be clean:\n${consoleMessages.join("\n")}`);
    console.log(
      JSON.stringify({
        success: true,
        webUrl,
        viewport: "1540x1100",
        ticks,
        layoutEvidence,
        solutionScreenshot,
        studentScreenshot,
      }),
    );
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(outputDir, "failure.png"), fullPage: false }).catch(() => undefined);
    console.error(`Stats chart region smoke failed. Evidence: ${outputDir}`);
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await stopProcess(web);
    await stopProcess(api);
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

await main();
