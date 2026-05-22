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
const OUTPUT_ROOT = process.env.MAUTH_EDITOR_COLUMNS_SMOKE_OUTPUT ?? path.join(WORKBENCH_ROOT, "verification", "editor-columns-smoke");
const VIEWPORT = { width: 1484, height: 1264 };

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
    frontMatter: {},
    formattingConfig: {},
    questions: [
      {
        id: "q-columns-ui",
        section: "Layout",
        marks: 5,
        contentBlocks: [
          { id: "q-intro", kind: "text", text: "Column editor layout regression." },
          { id: "q-choices", kind: "choices", choices: ["Red", "Blue", "Green"], numberingStyle: "roman", layout: "vertical" },
          {
            id: "q-table",
            kind: "table",
            headers: ["", ""],
            rows: [
              ["$x$", "$1$"],
              ["$y$", "$2$"],
            ],
            showHeader: false,
            tableAlign: "center",
            cellAlignment: "center",
          },
          {
            id: "q-diagram",
            kind: "diagram",
            diagramAlign: "center",
            graphConfig: { type: "graph2d", functions: [], features: [], metadata: {} },
          },
        ],
        parts: [
          {
            id: "p-columns-ui",
            label: "",
            text: "",
            marks: 5,
            contentBlocks: [
              {
                id: "cols-ui",
                kind: "columns",
                columnCount: 2,
                columns: [
                  [
                    { id: "c1-text", kind: "text", text: "jsfa;ldfjas;l sdjfhlasjdhf" },
                    {
                      id: "c1-table",
                      kind: "table",
                      headers: ["", "", ""],
                      rows: [
                        ["$x$", "$0$", "$1$"],
                        ["$P(X=x)$", "$1-p$", "$p$"],
                      ],
                      showHeader: false,
                      tableAlign: "center",
                      cellAlignment: "center",
                    },
                  ],
                  [{ id: "c2-text", kind: "text", text: "dfjksljsdhf s;dajhfslajdfh" }],
                ],
              },
            ],
            subparts: [],
            itemOrder: [{ kind: "block", id: "cols-ui" }],
          },
        ],
        itemOrder: [
          { kind: "block", id: "q-intro" },
          { kind: "block", id: "q-choices" },
          { kind: "block", id: "q-table" },
          { kind: "block", id: "q-diagram" },
          { kind: "part", id: "p-columns-ui" },
        ],
        pageBreakAfter: false,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

function sectionRectForText(element) {
  const section = element.closest("section");
  if (!section) throw new Error("Expected text to be inside a section");
  const rect = section.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right };
}

async function mockStorageApi(page) {
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
  await context.addInitScript((draft) => {
    window.localStorage.clear();
    window.localStorage.setItem("mauth-studio.theme.v1", "dark");
    window.localStorage.setItem("mauth-studio.current-draft.v1", JSON.stringify(draft));
  }, seededDraft());
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  await mockStorageApi(page);

  try {
    await waitForServer(url, vite, logs);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Manual editor mode" }).click();
    await page.getByRole("button", { name: /Part \(a\)/ }).click();
    await page.getByText("Part columns", { exact: false }).waitFor({ timeout: 10_000 });
    await page.getByText("COLUMN 1").waitFor();
    await page.getByText("COLUMN 2").waitFor();

    const partColumnsAnchor = "q:q-columns-ui/p:p-columns-ui/b:cols-ui";
    const nestedTableAnchor = `${partColumnsAnchor}/c:0/b:c1-table`;
    const partColumnsNode = page.locator(`.editor-pane [data-scroll-anchor="${partColumnsAnchor}"]`).first();
    const nestedTableNode = page.locator(`.editor-pane [data-scroll-anchor="${nestedTableAnchor}"]`).first();
    const columnOne = await page.getByText("COLUMN 1").evaluate(sectionRectForText);
    const columnTwo = await page.getByText("COLUMN 2").evaluate(sectionRectForText);
    const nestedTablePanel = await nestedTableNode.evaluateHandle((element) => element.querySelector("section"));
    const nestedTableText = await nestedTablePanel.asElement().textContent();
    const gridColumns = await page.getByText("COLUMN 1").evaluate((element) => {
      const columnSection = element.closest("section");
      const grid = columnSection?.parentElement;
      return grid ? getComputedStyle(grid).gridTemplateColumns : "";
    });

    assert.equal(await page.title(), "Mauth Studio");
    assert(columnOne.right <= columnTwo.x - 8, "column one should leave a visible gap before column two");
    assert(!/\bPosition\b/.test(nestedTableText ?? ""), "nested table position should not render inline");
    assert(!/\bCell text\b/.test(nestedTableText ?? ""), "nested table cell-text setting should not render inline");
    assert.equal(consoleErrors.length, 0, `console errors:\n${consoleErrors.join("\n")}`);
    assert.equal(pageErrors.length, 0, `page errors:\n${pageErrors.join("\n")}`);

    const panelElement = await page.getByText("Part columns", { exact: false }).evaluateHandle((element) => element.closest("section"));
    const panelText = await panelElement.asElement().textContent();
    assert(!/\bLayout\b/.test(panelText ?? ""), "columns panel should not render the layout selector inline");

    await page.setViewportSize({ width: 1900, height: VIEWPORT.height });
    await partColumnsNode.dispatchEvent("pointerdown");
    const inspector = page.locator("aside").filter({ hasText: "Inspector" }).first();
    await inspector.getByText("Part columns 1").waitFor();

    await nestedTableNode.dispatchEvent("pointerdown");
    await inspector.getByText("Part Column 1 table 2").waitFor();
    assert.equal(
      await page.locator("select[aria-label='Part Column 1 table 2 position']").count(),
      1,
      "nested table position should only appear in inspector",
    );
    assert.equal(
      await page.locator("select[aria-label='Part Column 1 table 2 cell text']").count(),
      1,
      "nested table cell text should only appear in inspector",
    );
    await inspector.locator("input[aria-label='Part Column 1 table 2 rows']").fill("3");
    await inspector.getByText("3 rows, 3 columns").waitFor();

    await partColumnsNode.dispatchEvent("pointerdown");
    await inspector.getByText("Part columns 1").waitFor();
    const layoutSelect = inspector.locator("select[aria-label='Part columns 1 layout']");
    await layoutSelect.waitFor();
    assert.equal(await page.locator("select[aria-label$='layout']").count(), 1, "layout selector should only appear in inspector");
    await layoutSelect.selectOption("3");
    await inspector.getByText("3 columns, 4 modules").waitFor();

    await page.getByText("Choice list 2", { exact: false }).click();
    await inspector.getByText("Choices 2").waitFor();
    assert.equal(await page.locator("select[aria-label='Choices 2 labels']").count(), 1, "choice labels should only appear in inspector");
    assert.equal(await page.locator("select[aria-label='Choices 2 layout']").count(), 1, "choice layout should only appear in inspector");
    await inspector.locator("select[aria-label='Choices 2 labels']").selectOption("upper-alpha");
    await inspector.getByText("3 a, b, c choices", { exact: false }).waitFor();

    await page.getByText("Table block 3", { exact: false }).click();
    await inspector.getByText("Table 3").waitFor();
    assert.equal(await page.locator("select[aria-label='Table 3 position']").count(), 1, "table position should only appear in inspector");
    assert.equal(
      await page.locator("select[aria-label='Table 3 cell text']").count(),
      1,
      "table cell text should only appear in inspector",
    );
    await inspector.locator("input[aria-label='Table 3 rows']").fill("3");
    await inspector.getByText("3 rows, 2 columns").waitFor();

    await page.getByText("Diagram block 4", { exact: false }).click();
    await inspector.getByText("Diagram 4").waitFor();
    const diagramPanelElement = await page
      .getByText("Diagram block 4", { exact: false })
      .evaluateHandle((element) => element.closest("section"));
    const diagramPanelText = await diagramPanelElement.asElement().textContent();
    assert(!/\bAxes and grid\b/.test(diagramPanelText ?? ""), "graph2d axes settings should not render inline");
    assert(!/\bFunction Arrows\b/.test(diagramPanelText ?? ""), "graph2d function arrow setting should not render inline");
    assert.equal(await page.locator("select[aria-label='Diagram 4 type']").count(), 1, "diagram type should only appear in inspector");
    assert.equal(
      await page.locator("select[aria-label='Diagram 4 position']").count(),
      1,
      "diagram position should only appear in inspector",
    );
    await inspector.getByText("Graph settings").waitFor();
    await inspector.getByLabel("Domain max").fill("8");
    assert.equal(await inspector.getByLabel("Domain max").inputValue(), "8", "graph domain settings should edit in inspector");
    await inspector.locator("select[aria-label='Diagram 4 type']").selectOption("vector2d");
    await inspector.getByText("2 coordinate vectors").waitFor();
    await inspector.getByText("Vector settings").waitFor();
    assert.equal(
      await page.locator("select[aria-label='Diagram 4 vector label style']").count(),
      1,
      "vector label style should only appear in inspector",
    );
    await inspector.locator("select[aria-label='Diagram 4 vector label style']").selectOption("custom");
    assert.equal(
      await inspector.locator("select[aria-label='Diagram 4 vector label style']").inputValue(),
      "custom",
      "vector label style should edit in inspector",
    );
    await inspector.getByLabel("Grid").uncheck();
    const vectorDiagramPanelText = await diagramPanelElement.asElement().textContent();
    assert(!/\bx min\b/i.test(vectorDiagramPanelText ?? ""), "vector2d bounds should not render inline");
    assert(!/\bLabel style\b/i.test(vectorDiagramPanelText ?? ""), "vector2d label style should not render inline");
    await inspector.locator("select[aria-label='Diagram 4 type']").selectOption("graph3d");
    await inspector.getByText("3D settings").waitFor();
    assert.equal(await page.locator("input[aria-label='Diagram 4 3D azimuth']").count(), 1, "3D azimuth should only appear in inspector");
    await inspector.locator("input[aria-label='Diagram 4 3D azimuth']").fill("1.25");
    assert.equal(
      await inspector.locator("input[aria-label='Diagram 4 3D azimuth']").inputValue(),
      "1.25",
      "3D view should edit in inspector",
    );
    await inspector.locator("input[aria-label='Diagram 4 3D width']").fill("460");
    const graph3DPanelText = await diagramPanelElement.asElement().textContent();
    assert(!/\bDiagram width\b/i.test(graph3DPanelText ?? ""), "graph3d size should not render inline");
    assert(!/\bAzimuth\b/i.test(graph3DPanelText ?? ""), "graph3d view settings should not render inline");
    await inspector.locator("select[aria-label='Diagram 4 type']").selectOption("statsChart");
    await inspector.getByText("Chart settings").waitFor();
    assert.equal(
      await page.locator("select[aria-label='Diagram 4 chart type']").count(),
      1,
      "stats chart subtype should only appear in inspector",
    );
    await inspector.locator("select[aria-label='Diagram 4 chart type']").selectOption("normal");
    await inspector.getByText("Normal: mean", { exact: false }).waitFor();
    await inspector.locator("input[aria-label='Diagram 4 chart width']").fill("500");
    assert.equal(
      await inspector.locator("input[aria-label='Diagram 4 chart width']").inputValue(),
      "500",
      "stats chart size should edit in inspector",
    );
    await inspector.getByLabel("Gridlines").uncheck();
    const statsChartPanelText = await diagramPanelElement.asElement().textContent();
    assert(!/\bChart type\b/i.test(statsChartPanelText ?? ""), "stats chart subtype should not render inline");
    assert(!/\bGridlines\b/i.test(statsChartPanelText ?? ""), "stats chart display settings should not render inline");
    assert(!/\bFill colour\b/i.test(statsChartPanelText ?? ""), "stats chart styling should not render inline");

    const inspectorScreenshotPath = path.join(outputDir, "floating-inspector.png");
    await inspector.screenshot({ path: inspectorScreenshotPath });
    const screenshotPath = path.join(outputDir, "columns-editor.png");
    await panelElement.asElement().screenshot({ path: screenshotPath });

    await nestedTableNode.dispatchEvent("pointerdown");
    await inspector.getByText("Part Column 1 table 2").waitFor();
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })));
    await nestedTableNode.waitFor({ state: "detached" });
    await inspector.getByText("Part columns 1").waitFor();
    assert.equal(
      await page.locator(`.editor-pane [data-scroll-anchor="${nestedTableAnchor}"]`).count(),
      0,
      "Delete should remove nested table",
    );

    console.log(
      `Editor columns smoke passed. Grid columns: ${gridColumns}. Column one width: ${columnOne.width}px. Inspector updated columns to 3 and deleted a nested table. Screenshot: ${screenshotPath}. Inspector screenshot: ${inspectorScreenshotPath}`,
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
      )}\nVite logs:\n${logs.join("")}\nBody text:\n${bodyText}`,
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
