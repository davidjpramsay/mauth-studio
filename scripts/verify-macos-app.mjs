#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distribution = process.argv.includes("--distribution");
const appArgument = process.argv.slice(2).find((argument) => argument !== "--distribution");
const appBundle = path.resolve(appArgument ?? path.join(ROOT, "release", "mac-arm64", "Mauth Studio.app"));

function run(command, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (!allowFailure && result.status !== 0) process.exit(result.status ?? 1);
  return `${result.stdout || ""}${result.stderr || ""}`;
}

if (!fs.existsSync(appBundle)) {
  console.error(`Mauth Studio app bundle was not found: ${appBundle}`);
  process.exit(1);
}

run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", appBundle]);
const signing = run("/usr/bin/codesign", ["--display", "--verbose=4", appBundle], { capture: true });
if (!/flags=.*\bruntime\b/.test(signing)) {
  console.error("The app signature does not enable Hardened Runtime.");
  process.exit(1);
}

const architectures = run("/usr/bin/lipo", ["-archs", path.join(appBundle, "Contents", "MacOS", "Mauth Studio")], {
  capture: true,
}).trim();
if (!architectures.split(/\s+/).includes("arm64")) {
  console.error(`The app does not contain the required Apple Silicon architecture: ${architectures}`);
  process.exit(1);
}

if (distribution) {
  if (!/Authority=Developer ID Application:/.test(signing) || /TeamIdentifier=not set/.test(signing)) {
    console.error("Distribution verification requires a Developer ID Application signature with a Team ID.");
    process.exit(1);
  }
  run("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", appBundle]);
}

console.log(`${distribution ? "Distribution" : "Local hardened"} verification passed for ${appBundle} (${architectures}).`);
