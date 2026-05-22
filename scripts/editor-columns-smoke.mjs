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

    const columnOne = await page.getByText("COLUMN 1").evaluate(sectionRectForText);
    const columnTwo = await page.getByText("COLUMN 2").evaluate(sectionRectForText);
    const tableControls = page.locator(".table-editor-controls").first();
    await tableControls.waitFor();
    const controlBoxes = await tableControls.locator("input, select").evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, width: rect.width };
      }),
    );
    const gridColumns = await tableControls.evaluate((node) => getComputedStyle(node).gridTemplateColumns);

    assert.equal(await page.title(), "Mauth Studio");
    assert.equal(controlBoxes.length, 4, "table controls should render four controls");
    for (const [index, box] of controlBoxes.entries()) {
      assert(box.left >= columnOne.x - 1, `control ${index + 1} should not overflow left of column one`);
      assert(box.right <= columnOne.right + 1, `control ${index + 1} should not overflow past column one`);
      assert(box.right <= columnTwo.x - 8, `control ${index + 1} should leave a gap before column two`);
      assert(box.width >= 96, `control ${index + 1} should remain usable`);
    }
    assert.equal(consoleErrors.length, 0, `console errors:\n${consoleErrors.join("\n")}`);
    assert.equal(pageErrors.length, 0, `page errors:\n${pageErrors.join("\n")}`);

    const panelElement = await page.getByText("Part columns", { exact: false }).evaluateHandle((element) => element.closest("section"));
    const panelText = await panelElement.asElement().textContent();
    assert(!/\bLayout\b/.test(panelText ?? ""), "columns panel should not render the layout selector inline");

    await page.setViewportSize({ width: 1900, height: VIEWPORT.height });
    await page.getByText("Part columns", { exact: false }).click();
    const inspector = page.locator("aside").filter({ hasText: "Inspector" }).first();
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
    assert.equal(await page.locator("select[aria-label='Diagram 4 type']").count(), 1, "diagram type should only appear in inspector");
    assert.equal(
      await page.locator("select[aria-label='Diagram 4 position']").count(),
      1,
      "diagram position should only appear in inspector",
    );
    await inspector.locator("select[aria-label='Diagram 4 type']").selectOption("vector2d");
    await inspector.getByText("2 coordinate vectors").waitFor();

    const screenshotPath = path.join(outputDir, "columns-editor.png");
    await panelElement.asElement().screenshot({ path: screenshotPath });
    console.log(
      `Editor columns smoke passed. Grid columns: ${gridColumns}. Column one width: ${columnOne.width}px. Inspector updated columns to 3. Screenshot: ${screenshotPath}`,
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
