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
  process.env.MAUTH_ASSISTANT_SELECTED_SETTINGS_UI_OUTPUT ??
  path.join(WORKBENCH_ROOT, "verification", "assistant-selected-settings-ui-smoke");
const CURRENT_DRAFT_STORAGE_KEY = "mauth-studio.current-draft.v1";
const VIEWPORT = { width: 1484, height: 1264 };
const GRAPH_ANCHOR = "q:q-assistant-ui/b:q1-graph";
const PROMPT = "Make the selected graph wider and turn off the grid.";
const FAILURE_PROMPT = "Hide the selected graph axes.";
const REPAIR_PROMPT = "Add two overlapping labels to the selected graph.";
const REPAIR_LABEL_FEATURES = [
  {
    id: "repair-label-a",
    kind: "label",
    label: "A",
    labelMode: "name",
    color: "#be123c",
    show: true,
    x: 0,
    y: 0,
  },
  {
    id: "repair-label-b",
    kind: "label",
    label: "B",
    labelMode: "name",
    color: "#0f766e",
    show: true,
    x: 0,
    y: 0,
  },
];

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
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before serving ${url}\n${logs.join("")}`);
    }
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
    frontMatter: { assessmentTitle: "Assistant selected-settings smoke" },
    formattingConfig: {},
    questions: [
      {
        id: "q-assistant-ui",
        section: "Assistant",
        marks: 4,
        contentBlocks: [
          {
            id: "q1-text",
            kind: "text",
            text: "The graph of $y=x^2-4$ is shown. State its intercepts.",
          },
          {
            id: "q1-graph",
            kind: "diagram",
            diagramAlign: "center",
            graphConfig: {
              type: "graph2d",
              widthPx: 620,
              heightPx: 300,
              xMin: -5,
              xMax: 5,
              yMin: -5,
              yMax: 5,
              showAxes: true,
              showGrid: true,
              showMajorGrid: true,
              showMinorGrid: false,
              functions: [{ id: "f1", expression: "x^2 - 4", label: "y=x^2-4", show: true }],
              features: [],
              metadata: {},
            },
          },
        ],
        parts: [],
        itemOrder: [
          { kind: "block", id: "q1-text" },
          { kind: "block", id: "q1-graph" },
        ],
        pageBreakAfter: false,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

async function mockApi(page, chatRequests) {
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
      body: JSON.stringify({ configured: true, model: "mock-selected-settings", provider: "mock", missingSetting: null }),
    });
  });

  await page.route("http://127.0.0.1:8000/api/assistant/chat", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
      return;
    }

    const body = JSON.parse(request.postData() ?? "{}");
    chatRequests.push(body);
    if (Array.isArray(body.toolOutputs) && body.toolOutputs.length) {
      const responseId = body.previousResponseId ?? "mock-final";
      const failed = body.toolOutputs.some((toolOutput) => toolOutput?.output?.ok === false);
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          configured: true,
          model: "mock-selected-settings",
          message: failed ? "The graph settings are done." : "The selected graph settings were updated.",
          responseId: `${responseId}-final`,
          toolCalls: [],
          usage: null,
          error: null,
        }),
      });
      return;
    }

    const prompt = body.messages?.at(-1)?.content ?? "";
    const hiddenAxesRequest = prompt === FAILURE_PROMPT;
    const repairRequiredRequest = prompt === REPAIR_PROMPT;
    const mauthToolName = repairRequiredRequest ? "mauth.author.addDiagram" : "mauth.settings.apply";
    const mauthArguments = repairRequiredRequest
      ? {
          questionNumber: 1,
          diagramId: "q1-graph",
          diagramAlign: "center",
          diagram: {
            graphConfig: {
              type: "graph2d",
              widthPx: 800,
              heightPx: 300,
              xMin: -5,
              xMax: 5,
              yMin: -5,
              yMax: 5,
              showAxes: true,
              showGrid: false,
              showMajorGrid: true,
              showMinorGrid: false,
              functions: [{ id: "f1", expression: "x^2 - 4", label: "y=x^2-4", show: true }],
              features: REPAIR_LABEL_FEATURES,
              metadata: {},
            },
          },
        }
      : {
          target: { scope: "selection" },
          diagram: {
            renderer: "graph2d",
            ...(hiddenAxesRequest ? { showAxes: false } : {}),
            ...(!hiddenAxesRequest ? { widthPx: 800, showGrid: false } : {}),
          },
        };
    const toolCallName = repairRequiredRequest ? "mauth_author_add_diagram" : "mauth_update_selected_settings";
    const toolCallSlug = repairRequiredRequest ? "repair-diagram" : "selected-settings";
    const responseId = hiddenAxesRequest
      ? "mock-response-failure"
      : repairRequiredRequest
        ? "mock-response-repair"
        : "mock-response-success";
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        configured: true,
        model: "mock-selected-settings",
        message: "",
        responseId,
        toolCalls: [
          {
            id: `tool-${toolCallSlug}-${responseId}`,
            callId: `call-${toolCallSlug}-${responseId}`,
            name: toolCallName,
            arguments: mauthArguments,
            mauthToolName,
            mauthArguments,
          },
        ],
        usage: {
          model: "mock-selected-settings",
          inputTokens: 0,
          cachedInputTokens: 0,
          billableInputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          pricingSource: "mock",
        },
        error: null,
      }),
    });
  });
}

async function draftGraphConfig(page) {
  return page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
    const question = snapshot?.questions?.find((current) => current.id === "q-assistant-ui");
    return question?.contentBlocks?.find((block) => block.id === "q1-graph")?.graphConfig ?? null;
  }, CURRENT_DRAFT_STORAGE_KEY);
}

async function previewGraphMetrics(page) {
  return page.evaluate((anchor) => {
    const container = document.querySelector(`[data-scroll-anchor="${anchor}"]`);
    const graph = container?.querySelector("div[id^='jxg-']");
    const rect = graph?.getBoundingClientRect();
    return {
      present: Boolean(container && graph),
      widthStyle: graph?.style.width ?? "",
      heightStyle: graph?.style.height ?? "",
      renderedWidth: rect?.width ?? 0,
      renderedHeight: rect?.height ?? 0,
    };
  }, GRAPH_ANCHOR);
}

async function main() {
  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}`;
  const outputDir = path.join(OUTPUT_ROOT, timestampSlug());
  await fs.mkdir(outputDir, { recursive: true });

  const logs = [];
  const vite = spawn("pnpm", ["--dir", "apps/web", "exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  vite.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  vite.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await context.addInitScript(
    ({ draft, storageKey }) => {
      window.localStorage.clear();
      window.localStorage.setItem("mauth-studio.theme.v1", "dark");
      window.localStorage.setItem(storageKey, JSON.stringify(draft));
    },
    { draft: seededDraft(), storageKey: CURRENT_DRAFT_STORAGE_KEY },
  );

  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const chatRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  await mockApi(page, chatRequests);

  try {
    await waitForServer(url, vite, logs);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Manual editor mode" }).click();

    const editorGraph = page.locator(`.editor-pane [data-scroll-anchor="${GRAPH_ANCHOR}"]`);
    await editorGraph.waitFor({ state: "visible" });
    await editorGraph.dispatchEvent("pointerdown");
    await page.locator("aside").filter({ hasText: "Inspector" }).getByText("Diagram 2").waitFor();

    const beforeConfig = await draftGraphConfig(page);
    assert.equal(beforeConfig?.widthPx, 620, "seeded graph should start at width 620");
    assert.equal(beforeConfig?.showGrid, true, "seeded graph should start with grid enabled");

    await page.getByRole("button", { name: "Assistant mode" }).click();
    const promptBox = page.getByPlaceholder("Ask Mauth to inspect, edit, validate, save, or organise this document.");
    await promptBox.fill(PROMPT);
    await page.getByRole("button", { name: "Ask" }).click();

    await page.getByText("The selected graph settings were updated.").waitFor({ timeout: 10_000 });
    assert(chatRequests.length >= 1 && chatRequests.length <= 2, "selected-settings prompt should use at most one tool continuation");
    const chatRequest = chatRequests[0];
    const continuationRequest = chatRequests.find((request) => request.previousResponseId === "mock-response-success");
    assert.equal(chatRequest.messages?.at(-1)?.content, PROMPT, "provider request should contain the teacher prompt");
    const summaryModule = chatRequest.documentSummary?.questions?.[0]?.modules?.find((module) => module.id === "q1-graph");
    assert.equal(summaryModule?.kind, "diagram", "document summary should include the selected graph module");
    assert(continuationRequest, "selected-settings tool call should be continued with local tool output");
    const toolOutput = continuationRequest.toolOutputs?.[0]?.output;
    assert.equal(toolOutput?.ok, true, `settings tool output should be successful: ${toolOutput?.error ?? "unknown error"}`);
    assert.equal(toolOutput?.toolName, "mauth.settings.apply", "tool continuation should report the settings tool");
    assert(toolOutput?.changedIds?.includes("q1-graph"), "settings output should report the selected graph as changed");
    await page.waitForFunction(
      () =>
        document.body.innerText.includes("Tool result:") &&
        document.body.innerText.includes("mauth.settings.apply committed changes and requested review"),
      null,
      { timeout: 10_000 },
    );

    await page.waitForFunction(
      (storageKey) => {
        const snapshot = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
        const question = snapshot?.questions?.find((current) => current.id === "q-assistant-ui");
        const graphConfig = question?.contentBlocks?.find((block) => block.id === "q1-graph")?.graphConfig;
        return graphConfig?.widthPx === 800 && graphConfig?.showGrid === false;
      },
      CURRENT_DRAFT_STORAGE_KEY,
      { timeout: 10_000 },
    );

    const afterConfig = await draftGraphConfig(page);
    assert.equal(afterConfig?.widthPx, 800, "assistant tool should update graph width through editor state");
    assert.equal(afterConfig?.showGrid, false, "assistant tool should turn the graph grid off through editor state");
    assert.deepEqual(afterConfig?.functions, beforeConfig?.functions, "assistant settings update should preserve graph functions");

    const previewMetrics = await previewGraphMetrics(page);
    assert.equal(previewMetrics.present, true, "preview should still render the selected graph");
    assert.equal(previewMetrics.widthStyle, "800px", "preview graph should use the updated configured width");
    assert(previewMetrics.renderedWidth > 0, "preview graph should have a rendered width");

    await page.getByRole("button", { name: "Manual editor mode" }).click();
    await editorGraph.waitFor({ state: "visible" });
    await editorGraph.dispatchEvent("pointerdown");
    const inspector = page.locator("aside").filter({ hasText: "Inspector" }).first();
    await inspector.getByText("Diagram 2").waitFor();
    await inspector.getByText("Graph settings").waitFor();
    assert.equal(await inspector.getByLabel("Width").inputValue(), "800", "inspector should expose the updated graph width");

    await page.getByRole("button", { name: "Assistant mode" }).click();
    await promptBox.fill(FAILURE_PROMPT);
    await page.getByRole("button", { name: "Ask" }).click();
    await page.getByText("The graph settings are done.").waitFor({ timeout: 10_000 });
    await page.waitForFunction(
      () =>
        document.body.innerText.includes("Tool result:") &&
        document.body.innerText.includes("mauth.settings.apply did not commit changes") &&
        document.body.innerText.includes("Assistant diagram preflight failed"),
      null,
      { timeout: 10_000 },
    );

    const failedContinuationRequest = chatRequests.find((request) => request.previousResponseId === "mock-response-failure");
    const failedToolOutput = failedContinuationRequest?.toolOutputs?.[0]?.output;
    assert.equal(failedToolOutput?.ok, false, "hidden-axes settings tool output should fail preflight");
    assert.equal(failedToolOutput?.committedDocument, false, "failed hidden-axes tool output should not commit");

    const afterFailedConfig = await draftGraphConfig(page);
    assert.equal(afterFailedConfig?.showAxes, true, "failed hidden-axes settings update should leave graph axes enabled");

    await promptBox.fill(REPAIR_PROMPT);
    await page.getByRole("button", { name: "Ask" }).click();
    await page.getByText("The graph settings are done.").last().waitFor({ timeout: 10_000 });
    await page.waitForFunction(
      () =>
        document.body.innerText.includes("Tool result:") &&
        document.body.innerText.includes("mauth.author.addDiagram committed changes, but needs repair") &&
        document.body.innerText.includes("Assistant post-edit inspection found repairable preview warnings"),
      null,
      { timeout: 10_000 },
    );

    const repairContinuationRequest = chatRequests.find((request) => request.previousResponseId === "mock-response-repair");
    const repairToolOutput = repairContinuationRequest?.toolOutputs?.[0]?.output;
    assert.equal(repairToolOutput?.ok, false, "colliding-label diagram output should request repair after commit");
    assert.equal(repairToolOutput?.committedDocument, true, "colliding-label diagram output should commit before repair is requested");
    assert.equal(repairToolOutput?.toolName, "mauth.author.addDiagram", "repair output should report the authoring tool");
    assert(repairToolOutput?.changedIds?.includes("q-assistant-ui"), "repair output should report the edited question as changed");
    assert.match(repairToolOutput?.error ?? "", /post-edit inspection/i, "repair output should explain post-edit inspection failed");
    assert(
      repairToolOutput?.postEditInspection?.repairWarnings?.some(
        (warning) => warning.code === "rendered-diagram-label-collision" && warning.targetId === "q1-graph",
      ),
      "repair output should identify the selected graph label collision",
    );

    const afterRepairConfig = await draftGraphConfig(page);
    assert.deepEqual(
      afterRepairConfig?.features?.map((feature) => ({
        id: feature.id,
        kind: feature.kind,
        label: feature.label,
        x: feature.x,
        y: feature.y,
      })),
      REPAIR_LABEL_FEATURES.map((feature) => ({ id: feature.id, kind: feature.kind, label: feature.label, x: feature.x, y: feature.y })),
      "repair-required diagram update should still commit the overlapping labels",
    );

    const screenshotPath = path.join(outputDir, "selected-settings-assistant.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });

    assert.equal(consoleErrors.length, 0, `console errors:\n${consoleErrors.join("\n")}`);
    assert.equal(pageErrors.length, 0, `page errors:\n${pageErrors.join("\n")}`);

    console.log(
      `Assistant selected-settings UI smoke passed. Prompt "${PROMPT}" selected ${GRAPH_ANCHOR}, applied mauth.settings.apply, preserved functions, updated width to ${afterConfig.widthPx}, disabled showGrid, visibly reported the rejected hidden-axes tool result, and visibly reported a committed repair-required mauth.author.addDiagram label collision. Screenshot: ${screenshotPath}`,
    );
  } catch (error) {
    const bodyText = (
      (await page
        .locator("body")
        .textContent()
        .catch(() => "")) ?? ""
    ).trim();
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nConsole errors:\n${consoleErrors.join("\n")}\nPage errors:\n${pageErrors.join(
        "\n",
      )}\nChat requests:\n${JSON.stringify(chatRequests, null, 2)}\nVite logs:\n${logs.join("")}\nBody text:\n${bodyText}`,
    );
  } finally {
    await browser.close();
    await stopProcess(vite);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
