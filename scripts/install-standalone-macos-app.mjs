#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(ROOT, "release", "mac-arm64", "Mauth Studio.app");
const applicationsDirectory = path.join(os.homedir(), "Applications");
const target = path.join(applicationsDirectory, "Mauth Studio.app");
const backupDirectory = path.join(os.homedir(), "Library", "Application Support", "Mauth Studio", "Launcher Backups");
const backup = path.join(backupDirectory, "Previous Mauth Studio.app");
const staging = path.join(applicationsDirectory, `.Mauth Studio.installing-${process.pid}.app`);
const legacyMetadata = path.join(os.homedir(), "Documents", "Mauth", ".mauth");
const standaloneMetadata = path.join(os.homedir(), "Library", "Application Support", "Mauth Studio", "storage");

function ditto(from, to) {
  const result = spawnSync("/usr/bin/ditto", [from, to], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!fs.existsSync(source)) {
  console.error(`Standalone app is not built: ${source}\nRun pnpm macos:build first.`);
  process.exit(1);
}

fs.mkdirSync(applicationsDirectory, { recursive: true });
fs.rmSync(staging, { recursive: true, force: true });
ditto(source, staging);

if (fs.existsSync(target)) {
  fs.mkdirSync(backupDirectory, { recursive: true });
  fs.rmSync(backup, { recursive: true, force: true });
  ditto(target, backup);
  fs.rmSync(target, { recursive: true, force: true });
}

fs.renameSync(staging, target);

if (fs.existsSync(legacyMetadata) && !fs.existsSync(path.join(standaloneMetadata, "workspace.json"))) {
  fs.mkdirSync(path.dirname(standaloneMetadata), { recursive: true });
  ditto(legacyMetadata, standaloneMetadata);
  console.log(`Copied existing Mauth metadata to: ${standaloneMetadata}`);
}

console.log(`Installed Mauth Studio: ${target}`);
if (fs.existsSync(backup)) console.log(`Previous app preserved at: ${backup}`);
