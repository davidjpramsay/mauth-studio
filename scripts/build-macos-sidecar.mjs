#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_ROOT = path.join(ROOT, "tmp", "macos");
const WORK_ROOT = path.join(OUTPUT_ROOT, "pyinstaller-work");
const SPEC_ROOT = path.join(OUTPUT_ROOT, "pyinstaller-spec");

fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
fs.rmSync(WORK_ROOT, { recursive: true, force: true });
fs.rmSync(SPEC_ROOT, { recursive: true, force: true });

const args = [
  "run",
  "pyinstaller",
  "--noconfirm",
  "--clean",
  "--onefile",
  "--name",
  "mauth-api",
  "--distpath",
  OUTPUT_ROOT,
  "--workpath",
  WORK_ROOT,
  "--specpath",
  SPEC_ROOT,
  "--paths",
  path.join(ROOT, "apps", "api"),
  "--paths",
  path.join(ROOT, "packages", "question-engine"),
  "--paths",
  path.join(ROOT, "packages", "formatting-engine"),
  "--paths",
  path.join(ROOT, "packages", "marking-engine"),
  "--collect-submodules",
  "uvicorn",
  path.join(ROOT, "apps", "api", "app", "standalone.py"),
];

const result = spawnSync("uv", args, { cwd: path.join(ROOT, "apps", "api"), stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);

const executable = path.join(OUTPUT_ROOT, "mauth-api");
fs.chmodSync(executable, 0o755);
console.log(`Built FastAPI sidecar: ${executable}`);
