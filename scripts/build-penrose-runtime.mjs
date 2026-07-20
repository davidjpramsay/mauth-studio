#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "tmp", "macos", "penrose-runtime");
const SOURCE = path.join(ROOT, "packages", "diagram-penrose");

fs.rmSync(TARGET, { recursive: true, force: true });
fs.mkdirSync(path.join(TARGET, "src"), { recursive: true });
fs.cpSync(path.join(SOURCE, "domain"), path.join(TARGET, "domain"), { recursive: true });
fs.cpSync(path.join(SOURCE, "style"), path.join(TARGET, "style"), { recursive: true });
fs.mkdirSync(path.join(TARGET, "browser"), { recursive: true });
fs.copyFileSync(
  path.join(SOURCE, "node_modules", "jsdom", "lib", "jsdom", "browser", "default-stylesheet.css"),
  path.join(TARGET, "browser", "default-stylesheet.css"),
);
fs.copyFileSync(
  path.join(SOURCE, "node_modules", "jsdom", "lib", "jsdom", "living", "xhr", "xhr-sync-worker.js"),
  path.join(TARGET, "src", "xhr-sync-worker.js"),
);

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "esbuild",
    path.join(SOURCE, "src", "cli.mjs"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node24",
    '--banner:js=import { createRequire } from "node:module"; import { dirname as __pathDirname, resolve as __pathResolve } from "node:path"; import { fileURLToPath as __fileURLToPath } from "node:url"; const require = createRequire(import.meta.url); const __filename = __fileURLToPath(import.meta.url); const __dirname = __pathResolve(__pathDirname(__filename), "helpers");',
    `--outfile=${path.join(TARGET, "src", "cli.mjs")}`,
  ],
  { cwd: ROOT, stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Built self-contained Penrose runtime: ${TARGET}`);
