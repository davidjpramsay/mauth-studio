#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(ROOT, "build", "mauth-document.png");
const output = path.join(ROOT, "build", "mauth-document.icns");
const iconset = path.join(ROOT, "tmp", "macos", "mauth-document.iconset");

if (!fs.existsSync(source)) {
  console.error(`The document icon source is missing: ${source}`);
  process.exit(1);
}

fs.rmSync(iconset, { recursive: true, force: true });
fs.mkdirSync(iconset, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

for (const size of [16, 32, 128, 256, 512]) {
  run("/usr/bin/sips", ["-z", String(size), String(size), source, "--out", path.join(iconset, `icon_${size}x${size}.png`)]);
  const retina = size * 2;
  run("/usr/bin/sips", ["-z", String(retina), String(retina), source, "--out", path.join(iconset, `icon_${size}x${size}@2x.png`)]);
}

run("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", output]);
console.log(`Built Mauth document icon: ${output}`);
