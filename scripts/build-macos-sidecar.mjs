#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { macosSidecarBuildPlan } from "./macos-sidecar-build-plan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plan = macosSidecarBuildPlan(ROOT);

fs.mkdirSync(plan.outputRoot, { recursive: true });
fs.rmSync(plan.workRoot, { recursive: true, force: true });
fs.rmSync(plan.specRoot, { recursive: true, force: true });
fs.rmSync(plan.sidecarRoot, { recursive: true, force: true });

const result = spawnSync("uv", plan.args, { cwd: plan.cwd, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);

fs.chmodSync(plan.executable, 0o755);
console.log(`Built FastAPI sidecar directory: ${plan.sidecarRoot}`);
