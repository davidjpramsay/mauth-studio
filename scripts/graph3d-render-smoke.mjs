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
const WORKBENCH_ROOT = path.resolve(ROOT, "workspace");
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
  const pixels = Buffer.alloc(total * 4);

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
      const pixelIndex = (y * width + x) * 4;
      pixels[pixelIndex] = r;
      pixels[pixelIndex + 1] = g;
      pixels[pixelIndex + 2] = b;
      pixels[pixelIndex + 3] = a;
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
    pixels,
  };
}

function pngDifferenceRatio(leftBuffer, rightBuffer) {
  const left = pngPixelStats(leftBuffer);
  const right = pngPixelStats(rightBuffer);
  if (left.width !== right.width || left.height !== right.height) {
    throw new Error(`Cannot compare screenshots with sizes ${left.width}x${left.height} and ${right.width}x${right.height}`);
  }
  let changed = 0;
  const total = left.width * left.height;
  for (let index = 0; index < left.pixels.length; index += 4) {
    const difference =
      Math.abs(left.pixels[index] - right.pixels[index]) +
      Math.abs(left.pixels[index + 1] - right.pixels[index + 1]) +
      Math.abs(left.pixels[index + 2] - right.pixels[index + 2]) +
      Math.abs(left.pixels[index + 3] - right.pixels[index + 3]);
    if (difference > 40) changed += 1;
  }
  return changed / total;
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

const measurementPrism: GraphConfig = {
  type: "graph3d",
  showAxes: false,
  widthPx: 420,
  heightPx: 260,
  metadata: { view3d: { az: 0.88, el: 0.36, bank: 0 } },
  data: {
    points: [
      { id: "A", coords: [0, 0, 0], show: false },
      { id: "B", coords: [8, 0, 0], show: false },
      { id: "C", coords: [8, 5, 0], show: false },
      { id: "D", coords: [0, 5, 0], show: false },
      { id: "E", coords: [0, 0, 3], show: false },
      { id: "F", coords: [8, 0, 3], show: false },
      { id: "G", coords: [8, 5, 3], show: false },
      { id: "H", coords: [0, 5, 3], show: false }
    ],
    segments: [
      { from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "D" }, { from: "D", to: "A" },
      { from: "E", to: "F" }, { from: "F", to: "G" }, { from: "G", to: "H" }, { from: "H", to: "E" },
      { from: "A", to: "E" }, { from: "B", to: "F" }, { from: "C", to: "G" }, { from: "D", to: "H" }
    ],
    faces: [
      { points: ["E", "F", "G", "H"], fillColor: "#e2e8f0", fillOpacity: 0.12 },
      { points: ["A", "B", "F", "E"], fillColor: "#e2e8f0", fillOpacity: 0.08 },
      { points: ["B", "C", "G", "F"], fillColor: "#e2e8f0", fillOpacity: 0.08 }
    ],
    dimensions: [
      {
        from: "A",
        to: "B",
        label: "$8\\text{ cm}$",
        display: "label",
        labelOffsetPx: 14,
        color: "#000000",
        strokeWidth: 1.4
      },
      {
        from: "B",
        to: "C",
        label: "$5\\text{ cm}$",
        display: "label",
        labelOffsetPx: 14,
        color: "#000000",
        strokeWidth: 1.4
      },
      {
        from: "D",
        to: "H",
        label: "$3\\text{ cm}$",
        display: "label",
        labelOffsetPx: 14,
        color: "#000000",
        strokeWidth: 1.4
      }
    ],
    xRange: [-1.5, 9.5], yRange: [-1.5, 6.5], zRange: [-1, 4]
  }
};

const measurementCylinder: GraphConfig = {
  type: "graph3d",
  showAxes: false,
  widthPx: 360,
  heightPx: 260,
  metadata: { view3d: { az: 0.12, el: 0.28, bank: 0 } },
  data: {
    solids: [
      { kind: "cylinder", baseCenter: [0, 0, 0], topCenter: [0, 0, 2.5], radius: 0.9, renderStyle: "outline" }
    ],
    dimensions: [
      {
        id: "diameter",
        from: [-0.9, 0, 2.5],
        to: [0.9, 0, 2.5],
        label: "$1.8\\text{ m}$",
        display: "guide",
        labelOffsetPx: 12,
        color: "#000000",
        strokeWidth: 1.4
      },
      {
        id: "height",
        from: [0, 0, 0],
        to: [0, 0, 2.5],
        label: "$2.5\\text{ m}$",
        display: "label",
        labelOffsetPx: 70,
        color: "#000000",
        strokeWidth: 1.4
      }
    ],
    xRange: [-1.6, 1.6], yRange: [-1.6, 1.6], zRange: [-0.3, 2.9]
  }
};

const measurementPrismRotated: GraphConfig = {
  ...measurementPrism,
  metadata: { view3d: { az: 1.7, el: 0.62, bank: 0.28 } }
};

const measurementCylinderRotated: GraphConfig = {
  ...measurementCylinder,
  metadata: { view3d: { az: 1.35, el: 0.52, bank: -0.24 } }
};

const measurementSphere: GraphConfig = {
  type: "graph3d",
  showAxes: false,
  widthPx: 300,
  heightPx: 260,
  metadata: { view3d: { az: 0.97, el: 1.14, bank: 0 } },
  data: {
    solids: [{ kind: "sphere", center: [0, 0, 0], radius: 4, renderStyle: "outline" }],
    dimensions: [
      {
        from: [0, 0, 0],
        to: [4, 0, 0],
        label: "$4\\text{ cm}$",
        display: "guide",
        labelOffsetPx: 12,
        color: "#000000",
        strokeWidth: 1.4
      }
    ],
    xRange: [-6.5, 6.5], yRange: [-6.5, 6.5], zRange: [-6.5, 6.5]
  }
};

const measurementSphereSurface: GraphConfig = {
  ...measurementSphere,
  data: {
    ...measurementSphere.data,
    solids: [
      {
        kind: "sphere",
        center: [0, 0, 0],
        radius: 4,
        renderStyle: "surface",
        fillColor: "#e2e8f0",
        fillOpacity: 0.08,
        stepsU: 8,
        stepsV: 4
      }
    ]
  }
};

const joinedConeHemisphere: GraphConfig = {
  type: "graph3d",
  showAxes: false,
  widthPx: 300,
  heightPx: 300,
  metadata: { view3d: { az: 5.810564, el: 0.482683, bank: 0, zoom: 1.3 } },
  data: {
    solids: [
      {
        kind: "cone",
        baseCenter: [0, 0, 0],
        apex: [0, 0, 8],
        radius: 3,
        renderStyle: "surface",
        fillColor: "#dbeafe",
        fillOpacity: 0.9
      },
      {
        kind: "sphereCap",
        center: [0, 0, 0],
        radius: 3,
        height: 3,
        axis: [0, 0, -1],
        renderStyle: "surface",
        fillColor: "#dcfce7",
        fillOpacity: 0.9
      }
    ],
    dimensions: [
      { id: "radius", from: [0, 0, 0], to: [3, 0, 0], label: "$3\\text{ cm}$", display: "guide", labelOffsetPx: 12 },
      {
        id: "height",
        from: [0, 0, 0],
        to: [0, 0, 8],
        label: "$8\\text{ cm}$",
        display: "guide",
        labelOffsetPx: 20,
        rightAngleWith: "radius"
      }
    ],
    xRange: [-4, 4], yRange: [-4, 4], zRange: [-5, 10]
  }
};

const joinedConeHemisphereRotated: GraphConfig = {
  ...joinedConeHemisphere,
  metadata: { view3d: { az: 5.42399, el: 0.53504, bank: 0, zoom: 1.3 } }
};

const joinedConeHemisphereSteep: GraphConfig = {
  ...joinedConeHemisphere,
  metadata: { view3d: { az: 5.786398, el: 1.032462, bank: 0, zoom: 1.3 } }
};

const measurementPyramidFace: GraphConfig = {
  type: "graph3d",
  showAxes: false,
  widthPx: 360,
  heightPx: 320,
  metadata: { view3d: { az: 5.7, el: 0.55, bank: 0, zoom: 1.3 } },
  data: {
    points: [
      { id: "A", coords: [-3, -3, 0], show: false },
      { id: "B", coords: [3, -3, 0], show: false },
      { id: "C", coords: [3, 3, 0], show: false },
      { id: "D", coords: [-3, 3, 0], show: false },
      { id: "T", coords: [0, 0, 10], show: false },
      { id: "H", coords: [3, -3, 10], show: false }
    ],
    segments: [
      { from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "D" }, { from: "D", to: "A" },
      { from: "A", to: "T" }, { from: "B", to: "T" }, { from: "C", to: "T" }, { from: "D", to: "T" }
    ],
    faces: [{ id: "base", points: ["A", "B", "C", "D"], fillColor: "#e5e7eb", fillOpacity: 0.35 }],
    dimensions: [
      {
        id: "height",
        from: "B",
        to: "H",
        label: "$10\\text{ cm}$",
        display: "guide",
        rightAngleWith: "face:base"
      }
    ],
    xRange: [-4, 4], yRange: [-4, 4], zRange: [-1, 11]
  }
};

const measurementPyramidFaceRotated: GraphConfig = {
  ...measurementPyramidFace,
  metadata: { view3d: { az: 4.95, el: 0.82, bank: 0.18, zoom: 1.3 } }
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

function InteractiveSmokeCase({ name, initialConfig }: { name: string; initialConfig: GraphConfig }) {
  const [config, setConfig] = React.useState(initialConfig);
  const firstDimension = Array.isArray(config.data?.dimensions) ? config.data.dimensions[0] : undefined;
  const rotateObject = () =>
    setConfig((current) => ({
      ...current,
      metadata: {
        ...current.metadata,
        view3d: {
          ...current.metadata?.view3d,
          az: (current.metadata?.view3d?.az ?? 0) + 0.55,
          el: (current.metadata?.view3d?.el ?? 0) + 0.12,
        },
      },
    }));
  return (
    <section
      data-case={name}
      data-view-state={JSON.stringify(config.metadata?.view3d ?? null)}
      data-label-offset={JSON.stringify(firstDimension?.labelScreenOffsetPx ?? null)}
      style={{ display: "inline-block", margin: 16, verticalAlign: "top" }}
    >
      {name === "interactive-pyramid-face" || name === "interactive-joined-cone-hemisphere" ? (
        <button type="button" data-testid={"rotate-" + name} onClick={rotateObject}>
          Rotate {name === "interactive-pyramid-face" ? "pyramid" : "composite solid"}
        </button>
      ) : null}
      <div data-graph-frame={name} style={{ background: "white", border: "1px solid #d1d5db", padding: 8 }}>
        <Basic3DGraph graphConfig={config} onGraphConfigChange={setConfig} />
      </div>
    </section>
  );
}

function App() {
  return (
    <main style={{ background: "#f8fafc", minHeight: "100vh", padding: 24 }}>
      <SmokeCase name="faces" config={prismFaces} />
      <SmokeCase name="curved-solids" config={curvedSolids} />
      <SmokeCase name="measurement-prism" config={measurementPrism} />
      <SmokeCase name="measurement-cylinder" config={measurementCylinder} />
      <SmokeCase name="measurement-prism-rotated" config={measurementPrismRotated} />
      <SmokeCase name="measurement-cylinder-rotated" config={measurementCylinderRotated} />
      <SmokeCase name="measurement-sphere" config={measurementSphere} />
      <SmokeCase name="measurement-sphere-surface" config={measurementSphereSurface} />
      <SmokeCase name="joined-cone-hemisphere" config={joinedConeHemisphere} />
      <SmokeCase name="joined-cone-hemisphere-rotated" config={joinedConeHemisphereRotated} />
      <SmokeCase name="joined-cone-hemisphere-steep" config={joinedConeHemisphereSteep} />
      <SmokeCase name="measurement-pyramid-face" config={measurementPyramidFace} />
      <SmokeCase name="measurement-pyramid-face-rotated" config={measurementPyramidFaceRotated} />
      <InteractiveSmokeCase name="interactive-faces" initialConfig={prismFaces} />
      <InteractiveSmokeCase name="interactive-cylinder" initialConfig={measurementCylinder} />
      <InteractiveSmokeCase name="interactive-sphere" initialConfig={measurementSphere} />
      <InteractiveSmokeCase name="interactive-pyramid-face" initialConfig={measurementPyramidFace} />
      <InteractiveSmokeCase name="interactive-joined-cone-hemisphere" initialConfig={joinedConeHemisphere} />
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

  if (process.argv.includes("--serve")) {
    try {
      const url = `http://127.0.0.1:${port}`;
      await waitForServer(url, vite, logs);
      console.log(`Graph3D render fixture ready: ${url}`);
      await new Promise((resolve) => {
        process.once("SIGINT", resolve);
        process.once("SIGTERM", resolve);
      });
    } finally {
      await stopProcess(vite);
      await fs.rm(TEMP_ROOT, { recursive: true, force: true });
    }
    return;
  }

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
      for (const name of [
        "faces",
        "curved-solids",
        "measurement-prism",
        "measurement-cylinder",
        "measurement-prism-rotated",
        "measurement-cylinder-rotated",
        "measurement-sphere",
        "measurement-sphere-surface",
        "joined-cone-hemisphere",
        "joined-cone-hemisphere-steep",
        "measurement-pyramid-face",
        "measurement-pyramid-face-rotated",
        "interactive-faces",
        "interactive-cylinder",
        "interactive-sphere",
        "interactive-pyramid-face",
        "interactive-joined-cone-hemisphere",
      ]) {
        await page.waitForSelector(`[data-graph-frame="${name}"] svg`, { state: "attached", timeout: 20_000 });
      }
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

    const interactiveCase = page.locator('[data-case="interactive-cylinder"]');
    const interactiveFrame = page.locator('[data-graph-frame="interactive-cylinder"]');
    const interactiveGraph = interactiveFrame.locator('[data-mauth-diagram-type="graph3d"]');
    await interactiveGraph.scrollIntoViewIfNeeded();
    const graphBox = await interactiveGraph.boundingBox();
    if (!graphBox) throw new Error("Interactive cylinder did not expose a draggable graph box");
    const initialViewState = await interactiveCase.getAttribute("data-view-state");
    const draggableDimensionLabel = interactiveGraph
      .locator('[data-mauth-draggable-graph3d-label="true"][data-mauth-graph3d-label-kind="dimension"]')
      .first();
    const labelBox = await draggableDimensionLabel.boundingBox();
    if (!labelBox) throw new Error("Interactive cylinder did not expose a draggable dimension label");
    const initialLabelOffset = await interactiveCase.getAttribute("data-label-offset");
    await page.mouse.move(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(labelBox.x + labelBox.width / 2 + 36, labelBox.y + labelBox.height / 2 - 22, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(
      ({ initial }) => document.querySelector('[data-case="interactive-cylinder"]')?.getAttribute("data-label-offset") !== initial,
      { initial: initialLabelOffset },
      { timeout: 5000 },
    );
    const draggedLabelOffset = JSON.parse((await interactiveCase.getAttribute("data-label-offset")) ?? "null");
    if (!Array.isArray(draggedLabelOffset) || Math.abs(draggedLabelOffset[0] - 36) > 1 || Math.abs(draggedLabelOffset[1] + 22) > 1) {
      throw new Error(`Dimension label drag saved an unexpected screen offset: ${JSON.stringify(draggedLabelOffset)}`);
    }
    if ((await interactiveCase.getAttribute("data-view-state")) !== initialViewState) {
      throw new Error("Dragging a 3D label unexpectedly changed the camera view state");
    }
    await interactiveFrame.screenshot({ path: path.join(outputDir, "interactive-cylinder-label-dragged.png") });

    await page.mouse.move(graphBox.x + graphBox.width * 0.9, graphBox.y + graphBox.height * 0.88);
    await page.mouse.down();
    await page.mouse.move(graphBox.x + graphBox.width * 0.55, graphBox.y + graphBox.height * 0.72, { steps: 12 });
    await page.waitForTimeout(120);
    const draggingScreenshot = await interactiveFrame.screenshot({
      path: path.join(outputDir, "interactive-cylinder-dragging.png"),
    });
    await page.mouse.up();
    await page.waitForFunction(
      ({ initial }) => document.querySelector('[data-case="interactive-cylinder"]')?.getAttribute("data-view-state") !== initial,
      { initial: initialViewState },
      { timeout: 5000 },
    );
    await page.waitForTimeout(250);
    const labelOffsetAfterRotation = JSON.parse((await interactiveCase.getAttribute("data-label-offset")) ?? "null");
    if (JSON.stringify(labelOffsetAfterRotation) !== JSON.stringify(draggedLabelOffset)) {
      throw new Error(
        `Dimension label screen offset changed during camera rotation: ${JSON.stringify(draggedLabelOffset)} -> ${JSON.stringify(labelOffsetAfterRotation)}`,
      );
    }
    const releasedScreenshot = await interactiveFrame.screenshot({
      path: path.join(outputDir, "interactive-cylinder-released.png"),
    });
    const releaseDifferenceRatio = pngDifferenceRatio(draggingScreenshot, releasedScreenshot);

    const interactiveFacesCase = page.locator('[data-case="interactive-faces"]');
    const interactiveFacesFrame = page.locator('[data-graph-frame="interactive-faces"]');
    const interactiveFacesGraph = interactiveFacesFrame.locator('[data-mauth-diagram-type="graph3d"]');
    await interactiveFacesGraph.scrollIntoViewIfNeeded();
    const staticFace = interactiveFacesGraph.locator('[data-mauth-static-graph3d-face="true"]').first();
    const staticFaceBox = await staticFace.boundingBox();
    if (!staticFaceBox) throw new Error("Interactive faces did not expose a fixed face surface");
    const initialFacesViewState = await interactiveFacesCase.getAttribute("data-view-state");
    await page.mouse.move(staticFaceBox.x + staticFaceBox.width / 2, staticFaceBox.y + staticFaceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(staticFaceBox.x + staticFaceBox.width / 2 - 52, staticFaceBox.y + staticFaceBox.height / 2 + 34, {
      steps: 12,
    });
    await page.waitForTimeout(120);
    const facesDraggingScreenshot = await interactiveFacesFrame.screenshot({
      path: path.join(outputDir, "interactive-faces-dragging.png"),
    });
    await page.mouse.up();
    await page.waitForFunction(
      ({ initial }) => document.querySelector('[data-case="interactive-faces"]')?.getAttribute("data-view-state") !== initial,
      { initial: initialFacesViewState },
      { timeout: 5000 },
    );
    await page.waitForTimeout(250);
    const facesReleasedScreenshot = await interactiveFacesFrame.screenshot({
      path: path.join(outputDir, "interactive-faces-released.png"),
    });
    const facesReleaseDifferenceRatio = pngDifferenceRatio(facesDraggingScreenshot, facesReleasedScreenshot);

    const interactiveSphereCase = page.locator('[data-case="interactive-sphere"]');
    const interactiveSphereFrame = page.locator('[data-graph-frame="interactive-sphere"]');
    const interactiveSphereGraph = interactiveSphereFrame.locator('[data-mauth-diagram-type="graph3d"]');
    await interactiveSphereGraph.scrollIntoViewIfNeeded();
    const sphereGraphBox = await interactiveSphereGraph.boundingBox();
    if (!sphereGraphBox) throw new Error("Interactive sphere did not expose a draggable graph box");
    const initialSphereViewState = await interactiveSphereCase.getAttribute("data-view-state");
    await page.mouse.move(sphereGraphBox.x + sphereGraphBox.width * 0.72, sphereGraphBox.y + sphereGraphBox.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(sphereGraphBox.x + sphereGraphBox.width * 0.42, sphereGraphBox.y + sphereGraphBox.height * 0.68, {
      steps: 12,
    });
    await page.waitForTimeout(120);
    const sphereDraggingScreenshot = await interactiveSphereFrame.screenshot({
      path: path.join(outputDir, "interactive-sphere-dragging.png"),
    });
    await page.mouse.up();
    await page.waitForFunction(
      ({ initial }) => document.querySelector('[data-case="interactive-sphere"]')?.getAttribute("data-view-state") !== initial,
      { initial: initialSphereViewState },
      { timeout: 5000 },
    );
    await page.waitForTimeout(250);
    const sphereReleasedScreenshot = await interactiveSphereFrame.screenshot({
      path: path.join(outputDir, "interactive-sphere-released.png"),
    });
    const sphereReleaseDifferenceRatio = pngDifferenceRatio(sphereDraggingScreenshot, sphereReleasedScreenshot);

    const interactivePyramidCase = page.locator('[data-case="interactive-pyramid-face"]');
    const interactivePyramidFrame = page.locator('[data-graph-frame="interactive-pyramid-face"]');
    const interactivePyramidGraph = interactivePyramidFrame.locator('[data-mauth-diagram-type="graph3d"]');
    await interactivePyramidGraph.scrollIntoViewIfNeeded();
    const pyramidGraphBox = await interactivePyramidGraph.boundingBox();
    if (!pyramidGraphBox) throw new Error("Interactive pyramid did not expose a draggable graph box");
    const initialPyramidViewState = await interactivePyramidCase.getAttribute("data-view-state");
    const initialPyramidMarkerCount = await interactivePyramidGraph.locator("[data-mauth-graph3d-right-angle]").count();
    if (initialPyramidMarkerCount !== 3) {
      throw new Error(`Interactive pyramid began with ${initialPyramidMarkerCount} line-to-face marker sides instead of 3`);
    }
    await page.mouse.move(pyramidGraphBox.x + pyramidGraphBox.width * 0.86, pyramidGraphBox.y + pyramidGraphBox.height * 0.78);
    await page.mouse.down();
    await page.mouse.move(pyramidGraphBox.x + pyramidGraphBox.width * 0.56, pyramidGraphBox.y + pyramidGraphBox.height * 0.62, {
      steps: 12,
    });
    await page.mouse.up();
    await page.waitForFunction(
      ({ initial }) => document.querySelector('[data-case="interactive-pyramid-face"]')?.getAttribute("data-view-state") !== initial,
      { initial: initialPyramidViewState },
      { timeout: 5000 },
    );
    const rotatedPyramidMarkerCount = await interactivePyramidGraph.locator("[data-mauth-graph3d-right-angle]").count();
    if (rotatedPyramidMarkerCount !== 3) {
      throw new Error(`Interactive pyramid retained ${rotatedPyramidMarkerCount} line-to-face marker sides after rotation instead of 3`);
    }
    await interactivePyramidFrame.screenshot({ path: path.join(outputDir, "interactive-pyramid-face-rotated.png") });

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
        const graph = frame.querySelector('[data-mauth-diagram-type="graph3d"]');
        return {
          name,
          width: box.width,
          height: box.height,
          primitiveCount: primitives.length,
          labelCount: labels,
          axesVisible: graph?.getAttribute("data-mauth-graph3d-axes-visible"),
          axisLabelCount: frame.querySelectorAll('[data-mauth-label-role="axis-label"]').length,
          pointLabelCount: frame.querySelectorAll('[data-mauth-label-role="graph3d-point-label"]').length,
          dimensionLabelColors: Array.from(frame.querySelectorAll('[data-mauth-label-role="graph3d-dimension-label"]')).map(
            (element) => window.getComputedStyle(element).color,
          ),
          dimensionDisplays: Array.from(frame.querySelectorAll('[data-mauth-label-role="graph3d-dimension-label"]')).map((element) =>
            element.getAttribute("data-mauth-graph3d-dimension-display"),
          ),
          draggableLabelCount: frame.querySelectorAll('[data-mauth-draggable-graph3d-label="true"]').length,
          staticFaceCount: frame.querySelectorAll('[data-mauth-static-graph3d-face="true"]').length,
          surfaceFaceCount: frame.querySelectorAll('[data-mauth-graph3d-surface-face="true"]').length,
          surfaceGroupCount: new Set(
            Array.from(frame.querySelectorAll("[data-mauth-graph3d-surface-group]")).map((element) =>
              element.getAttribute("data-mauth-graph3d-surface-group"),
            ),
          ).size,
          compositeSilhouetteCount: frame.querySelectorAll("[data-mauth-graph3d-composite-silhouette='true']").length,
          sharedSeamCount: frame.querySelectorAll("[data-mauth-graph3d-shared-seam='true']").length,
          sharedSeamDashed: Array.from(frame.querySelectorAll("[data-mauth-graph3d-shared-seam='true']")).every((element) => {
            const dashArray = window.getComputedStyle(element).strokeDasharray;
            return dashArray !== "none" && dashArray !== "";
          }),
          sharedSeamGapPx: Math.max(
            0,
            ...Array.from(frame.querySelectorAll("[data-mauth-graph3d-shared-seam='true']")).map((element) => {
              if (!(element instanceof SVGPathElement)) return Number.POSITIVE_INFINITY;
              const length = element.getTotalLength();
              const end = element.getPointAtLength(length);
              return Math.min(
                ...Array.from({ length: 51 }, (_, index) => {
                  const earlyPoint = element.getPointAtLength(length * 0.05 * (index / 50));
                  return Math.hypot(earlyPoint.x - end.x, earlyPoint.y - end.y);
                }),
              );
            }),
          ),
          rightAngleMarkerCount: frame.querySelectorAll("[data-mauth-graph3d-right-angle]").length,
          screenScaleRatio: Number(graph?.getAttribute("data-mauth-graph3d-screen-scale-ratio")),
          rangeSpanRatio: Number(graph?.getAttribute("data-mauth-graph3d-range-span-ratio")),
        };
      }),
    );

    const failures = [];
    for (const metric of browserMetrics) {
      const minimumWidth = metric.name.includes("sphere") || metric.name.includes("joined-cone-hemisphere") ? 290 : 340;
      if (metric.width < minimumWidth || metric.height < 250) failures.push(`${metric.name} rendered at ${metric.width}x${metric.height}`);
      const minimumPrimitives = metric.name.includes("joined-cone-hemisphere")
        ? 6
        : metric.name === "curved-solids"
          ? 11
          : metric.name.includes("sphere")
            ? 2
            : metric.name.includes("cylinder")
              ? 5
              : metric.name.startsWith("measurement-") || metric.name.includes("pyramid-face")
                ? 8
                : 14;
      if (metric.primitiveCount < minimumPrimitives) failures.push(`${metric.name} rendered only ${metric.primitiveCount} SVG primitives`);
      if (metric.name.startsWith("measurement-") && metric.axesVisible !== "false") failures.push(`${metric.name} unexpectedly shows axes`);
      if (metric.name.startsWith("measurement-") && metric.axisLabelCount !== 0) failures.push(`${metric.name} rendered axis labels`);
      if (metric.name.startsWith("measurement-") && metric.pointLabelCount !== 0)
        failures.push(`${metric.name} rendered helper point labels`);
      if (metric.name.startsWith("measurement-") && metric.dimensionLabelColors.some((color) => color !== "rgb(0, 0, 0)"))
        failures.push(`${metric.name} rendered a non-black dimension label: ${metric.dimensionLabelColors.join(", ")}`);
      if (metric.name.startsWith("measurement-") && metric.dimensionDisplays.some((display) => display === "bracket" || !display))
        failures.push(`${metric.name} rendered a legacy dimension bracket: ${metric.dimensionDisplays.join(", ")}`);
      if (metric.name.startsWith("interactive-") && metric.draggableLabelCount < 1)
        failures.push(`${metric.name} did not expose independently draggable labels`);
      if (metric.name.includes("joined-cone-hemisphere") && metric.rightAngleMarkerCount !== 2)
        failures.push(`${metric.name} rendered ${metric.rightAngleMarkerCount} right-angle marker sides instead of 2`);
      if (metric.name.includes("pyramid-face") && metric.rightAngleMarkerCount !== 3)
        failures.push(`${metric.name} rendered ${metric.rightAngleMarkerCount} line-to-face marker sides instead of 3`);
      if (metric.name.includes("joined-cone-hemisphere") && metric.surfaceFaceCount < 100)
        failures.push(`${metric.name} rendered only ${metric.surfaceFaceCount} true 3D surface faces`);
      if (metric.name.includes("joined-cone-hemisphere") && metric.surfaceGroupCount !== 1)
        failures.push(`${metric.name} rendered ${metric.surfaceGroupCount} independently layered surface groups instead of 1`);
      if (metric.name.includes("joined-cone-hemisphere") && metric.compositeSilhouetteCount !== 1)
        failures.push(`${metric.name} rendered ${metric.compositeSilhouetteCount} composite silhouettes instead of 1`);
      if (metric.name.includes("joined-cone-hemisphere") && metric.sharedSeamCount !== 1)
        failures.push(`${metric.name} rendered ${metric.sharedSeamCount} shared seams instead of 1`);
      if (metric.name.includes("joined-cone-hemisphere") && !metric.sharedSeamDashed)
        failures.push(`${metric.name} rendered its hidden shared seam as a solid line`);
      if (metric.name.includes("joined-cone-hemisphere") && metric.sharedSeamGapPx > 0.75)
        failures.push(`${metric.name} left a ${metric.sharedSeamGapPx.toFixed(2)} px gap in its shared seam`);
      const expectedStaticFaceCount =
        metric.name === "faces" || metric.name === "interactive-faces"
          ? 2
          : metric.name.includes("prism")
            ? 3
            : metric.name.includes("pyramid-face")
              ? 1
              : 0;
      if (metric.staticFaceCount !== expectedStaticFaceCount)
        failures.push(`${metric.name} locked ${metric.staticFaceCount} faces instead of ${expectedStaticFaceCount}`);
      if (Math.abs(metric.screenScaleRatio - 1) > 0.000001)
        failures.push(`${metric.name} rendered with unequal x/y screen scale: ${metric.screenScaleRatio}`);
      if (Math.abs(metric.rangeSpanRatio - 1) > 0.000001)
        failures.push(`${metric.name} rendered with unequal x/y/z range spans: ${metric.rangeSpanRatio}`);
    }
    for (const name of [
      "faces",
      "curved-solids",
      "measurement-prism",
      "measurement-cylinder",
      "measurement-prism-rotated",
      "measurement-cylinder-rotated",
      "measurement-sphere",
      "measurement-sphere-surface",
      "joined-cone-hemisphere",
      "joined-cone-hemisphere-rotated",
      "joined-cone-hemisphere-steep",
      "measurement-pyramid-face",
      "measurement-pyramid-face-rotated",
      "interactive-pyramid-face",
      "interactive-joined-cone-hemisphere",
    ]) {
      const screenshot = await page.locator(`[data-graph-frame="${name}"]`).screenshot({
        path: path.join(outputDir, `${name}.png`),
      });
      const stats = pngPixelStats(screenshot);
      if (stats.nonWhiteRatio < 0.01) failures.push(`${name} screenshot appears blank: ${JSON.stringify(stats)}`);
      if (stats.darkRatio < 0.00005) failures.push(`${name} screenshot has too few dark graph strokes: ${JSON.stringify(stats)}`);
    }
    if (releaseDifferenceRatio > 0.008) {
      failures.push(
        `interactive cylinder visibly snapped after pointer release (${(releaseDifferenceRatio * 100).toFixed(3)}% changed pixels)`,
      );
    }
    if (sphereReleaseDifferenceRatio > 0.008) {
      failures.push(
        `interactive sphere visibly snapped after pointer release (${(sphereReleaseDifferenceRatio * 100).toFixed(3)}% changed pixels)`,
      );
    }
    if (facesReleaseDifferenceRatio > 0.008) {
      failures.push(
        `interactive faces visibly snapped after pointer release (${(facesReleaseDifferenceRatio * 100).toFixed(3)}% changed pixels)`,
      );
    }
    if (consoleErrors.length) failures.push(`console errors:\n${consoleErrors.join("\n")}`);
    if (pageErrors.length) failures.push(`page errors:\n${pageErrors.join("\n")}`);
    if (failures.length) {
      throw new Error(`Graph3D render smoke failed. Screenshots: ${outputDir}\n${failures.join("\n")}`);
    }
    console.log(
      `Graph3D render smoke passed (label offset ${JSON.stringify(draggedLabelOffset)}, faces ${(facesReleaseDifferenceRatio * 100).toFixed(3)}%, cylinder ${(releaseDifferenceRatio * 100).toFixed(3)}%, sphere ${(sphereReleaseDifferenceRatio * 100).toFixed(3)}% drag-to-release pixel change). Screenshots: ${outputDir}`,
    );
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
