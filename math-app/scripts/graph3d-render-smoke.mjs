import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB_ROOT = path.join(ROOT, "apps", "web");
const TEMP_ROOT = path.join(WEB_ROOT, ".tmp", `graph3d-render-smoke-${process.pid}`);
const WORKBENCH_ROOT = path.resolve(ROOT, "..", "mauth-workbench");
const OUTPUT_ROOT = process.env.MAUTH_GRAPH3D_SMOKE_OUTPUT ?? path.join(WORKBENCH_ROOT, "verification", "graph3d-render-smoke");

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
      // Keep polling until Vite finishes dependency pre-bundling.
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

function paethPredictor(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function pngPixelStats(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error("Screenshot is not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth}`);
  const channelsByColorType = new Map([
    [0, 1],
    [2, 3],
    [4, 2],
    [6, 4],
  ]);
  const channels = channelsByColorType.get(colorType);
  if (!channels) throw new Error(`Unsupported PNG color type ${colorType}`);
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  let sourceOffset = 0;
  let previous = Buffer.alloc(stride);
  let nonWhite = 0;
  let dark = 0;
  let transparent = 0;
  const total = width * height;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const raw = inflated.subarray(sourceOffset, sourceOffset + stride);
    sourceOffset += stride;
    const row = Buffer.alloc(stride);
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? row[index - channels] : 0;
      const above = previous[index] ?? 0;
      const upperLeft = index >= channels ? previous[index - channels] : 0;
      const value = raw[index];
      if (filter === 0) row[index] = value;
      else if (filter === 1) row[index] = (value + left) & 0xff;
      else if (filter === 2) row[index] = (value + above) & 0xff;
      else if (filter === 3) row[index] = (value + Math.floor((left + above) / 2)) & 0xff;
      else if (filter === 4) row[index] = (value + paethPredictor(left, above, upperLeft)) & 0xff;
      else throw new Error(`Unsupported PNG filter ${filter}`);
    }
    for (let x = 0; x < width; x += 1) {
      const index = x * channels;
      const r = row[index];
      const g = colorType === 0 || colorType === 4 ? row[index] : row[index + 1];
      const b = colorType === 0 || colorType === 4 ? row[index] : row[index + 2];
      const a = colorType === 4 ? row[index + 1] : colorType === 6 ? row[index + 3] : 255;
      if (a <= 16) {
        transparent += 1;
        continue;
      }
      if (r < 245 || g < 245 || b < 245) nonWhite += 1;
      if (r < 80 && g < 80 && b < 80) dark += 1;
    }
    previous = row;
  }

  return {
    width,
    height,
    nonWhite,
    dark,
    transparent,
    nonWhiteRatio: nonWhite / total,
    darkRatio: dark / total,
  };
}

async function writeFixture(port) {
  await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  await fs.mkdir(path.join(TEMP_ROOT, "src"), { recursive: true });
  await fs.writeFile(
    path.join(TEMP_ROOT, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8" /><title>graph3d smoke</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`,
  );
  await fs.writeFile(
    path.join(TEMP_ROOT, "vite.config.mjs"),
    `import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: ${JSON.stringify(TEMP_ROOT)},
  plugins: [react()],
  resolve: {
    alias: {
      "@": ${JSON.stringify(path.join(WEB_ROOT, "src"))},
      "@mauth-studio/shared": ${JSON.stringify(path.join(ROOT, "packages", "shared", "src", "index.ts"))},
      "@mauth-studio/diagram-plotly": ${JSON.stringify(path.join(ROOT, "packages", "diagram-plotly", "src", "index.ts"))}
    }
  },
  server: {
    host: "127.0.0.1",
    port: ${port},
    strictPort: true,
    fs: { allow: [${JSON.stringify(ROOT)}, ${JSON.stringify(WEB_ROOT)}] }
  }
});
`,
  );
  await fs.writeFile(
    path.join(TEMP_ROOT, "src", "main.tsx"),
    String.raw`import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import { Basic3DGraph } from "@/components/graphs/Basic3DGraph";
import type { GraphConfig } from "@mauth-studio/shared";

const prismFaces: GraphConfig = {
  type: "graph3d",
  widthPx: 520,
  heightPx: 360,
  metadata: { view3d: { az: 1.18, el: 0.34, bank: 0 } },
  data: {
    points: [
      { id: "O", label: "$O$", coords: [0, 0, 0] },
      { id: "A", label: "$A$", coords: [3, 0, 0] },
      { id: "B", label: "$B$", coords: [3, 2, 0] },
      { id: "C", label: "$C$", coords: [0, 2, 0] },
      { id: "T", label: "$T$", coords: [0, 0, 2] },
      { id: "D", label: "$D$", coords: [3, 0, 2] },
      { id: "E", label: "$E$", coords: [3, 2, 2] },
      { id: "F", label: "$F$", coords: [0, 2, 2] }
    ],
    segments: [
      { from: "O", to: "A" },
      { from: "A", to: "B" },
      { from: "B", to: "C" },
      { from: "O", to: "C", strokeStyle: "dashed" },
      { from: "O", to: "T", strokeStyle: "dashed" },
      { from: "A", to: "D" },
      { from: "B", to: "E" },
      { from: "C", to: "F" },
      { from: "T", to: "D" },
      { from: "D", to: "E" },
      { from: "E", to: "F" },
      { from: "T", to: "F" },
      { from: "B", to: "T", label: "$BT$" }
    ],
    faces: [
      { points: ["A", "B", "E", "D"], fillColor: "#bfdbfe", fillOpacity: 0.22 },
      { points: ["T", "D", "E", "F"], fillColor: "#fde68a", fillOpacity: 0.18 }
    ],
    xRange: [-0.5, 3.5],
    yRange: [-0.5, 2.8],
    zRange: [-0.5, 2.8]
  }
};

const curvedSolids: GraphConfig = {
  type: "graph3d",
  widthPx: 520,
  heightPx: 360,
  metadata: { view3d: { az: 1.35, el: 0.42, bank: 0 } },
  data: {
    solids: [
      { kind: "cone", baseCenter: [-3, 0, 0], apex: [-3, 0, 3], radius: 1.1, fillColor: "#bfdbfe", fillOpacity: 0.18 },
      { kind: "cylinder", baseCenter: [0, 0, 0], topCenter: [0, 0, 2.8], radius: 0.85, fillColor: "#bbf7d0", fillOpacity: 0.16 },
      { kind: "sphereCap", center: [3.1, 0, 0], radius: 1.5, height: 0.75, axis: [1, 0, 0], fillColor: "#fecaca", fillOpacity: 0.2 }
    ],
    xRange: [-4.8, 5.2],
    yRange: [-2.2, 2.2],
    zRange: [-1.2, 4.0]
  }
};

function SmokeCase({ name, config }: { name: string; config: GraphConfig }) {
  return (
    <section data-case={name} style={{ display: "inline-block", margin: 16, verticalAlign: "top" }}>
      <div data-graph-frame={name} style={{ background: "white", border: "1px solid #d1d5db", padding: 8 }}>
        <Basic3DGraph graphConfig={config} />
      </div>
    </section>
  );
}

function App() {
  return (
    <main style={{ background: "#f8fafc", minHeight: "100vh", padding: 24 }}>
      <SmokeCase name="faces" config={prismFaces} />
      <SmokeCase name="curved-solids" config={curvedSolids} />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
`,
  );
}

async function main() {
  const port = await findFreePort();
  const outputDir = path.join(OUTPUT_ROOT, timestampSlug());
  await fs.mkdir(outputDir, { recursive: true });
  await writeFixture(port);

  const logs = [];
  const vite = spawn("pnpm", ["--dir", "apps/web", "exec", "vite", "--config", path.join(TEMP_ROOT, "vite.config.mjs")], {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  vite.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  vite.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));

  try {
    const url = `http://127.0.0.1:${port}`;
    await waitForServer(url, vite, logs);
    await page.goto(url, { waitUntil: "networkidle" });
    try {
      await page.waitForSelector('[data-graph-frame="faces"] svg', { state: "attached", timeout: 20_000 });
      await page.waitForSelector('[data-graph-frame="curved-solids"] svg', { state: "attached", timeout: 20_000 });
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
    }
    await page.waitForTimeout(1500);

    const browserMetrics = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-graph-frame]")).map((frame) => {
        const name = frame.getAttribute("data-graph-frame") ?? "";
        const svg = frame.querySelector("svg");
        const primitives = Array.from(svg?.querySelectorAll("path,line,polygon,ellipse,circle") ?? []).filter((element) => {
          const box = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return box.width + box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        });
        const labels = frame.querySelectorAll(".jxg-latex-label, foreignObject, text").length;
        const box = frame.getBoundingClientRect();
        return { name, width: box.width, height: box.height, primitiveCount: primitives.length, labelCount: labels };
      }),
    );

    const failures = [];
    for (const metric of browserMetrics) {
      if (metric.width < 400 || metric.height < 280) failures.push(`${metric.name} rendered at ${metric.width}x${metric.height}`);
      if (metric.primitiveCount < 18) failures.push(`${metric.name} rendered only ${metric.primitiveCount} SVG primitives`);
    }
    for (const name of ["faces", "curved-solids"]) {
      const screenshot = await page.locator(`[data-graph-frame="${name}"]`).screenshot({
        path: path.join(outputDir, `${name}.png`),
      });
      const stats = pngPixelStats(screenshot);
      if (stats.nonWhiteRatio < 0.01) failures.push(`${name} screenshot appears blank: ${JSON.stringify(stats)}`);
      if (stats.darkRatio < 0.0005) failures.push(`${name} screenshot has too few dark graph strokes: ${JSON.stringify(stats)}`);
    }
    if (consoleErrors.length) failures.push(`console errors:\n${consoleErrors.join("\n")}`);
    if (pageErrors.length) failures.push(`page errors:\n${pageErrors.join("\n")}`);
    if (failures.length) {
      throw new Error(`Graph3D render smoke failed. Screenshots: ${outputDir}\n${failures.join("\n")}`);
    }
    console.log(`Graph3D render smoke passed. Screenshots: ${outputDir}`);
  } finally {
    await browser.close();
    await stopProcess(vite);
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
