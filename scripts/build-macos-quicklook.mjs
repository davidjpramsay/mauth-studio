#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = path.join(ROOT, "native", "MauthQuickLook", "MauthQuickLook.xcodeproj");
const derivedData = path.join(ROOT, "tmp", "macos", "quicklook-derived");
const output = path.join(ROOT, "tmp", "macos", "quicklook");
const entitlements = path.join(ROOT, "build", "entitlements.quicklook.plist");
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const identity = process.env.MAUTH_CODESIGN_IDENTITY?.trim() || "-";
const timestamp = identity === "-" ? "--timestamp=none" : "--timestamp";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!fs.existsSync(project)) {
  console.error(`The Quick Look Xcode project is missing: ${project}`);
  process.exit(1);
}

fs.rmSync(derivedData, { recursive: true, force: true });
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

run("/usr/bin/xcodebuild", [
  "-project",
  project,
  "-scheme",
  "MauthQuickLook",
  "-configuration",
  "Release",
  "-derivedDataPath",
  derivedData,
  `MARKETING_VERSION=${packageJson.version}`,
  `CURRENT_PROJECT_VERSION=${packageJson.version}`,
  "CODE_SIGNING_ALLOWED=NO",
  "build",
]);

const products = path.join(derivedData, "Build", "Products", "Release");
for (const bundleName of ["MauthQuickLookThumbnail.appex", "MauthQuickLookPreview.appex"]) {
  const source = path.join(products, bundleName);
  const destination = path.join(output, bundleName);
  if (!fs.existsSync(source)) {
    console.error(`Quick Look build did not produce ${source}`);
    process.exit(1);
  }
  fs.cpSync(source, destination, { recursive: true });
  run("/usr/bin/codesign", ["--force", "--options", "runtime", "--entitlements", entitlements, "--sign", identity, timestamp, destination]);
  run("/usr/bin/codesign", ["--verify", "--strict", "--verbose=2", destination]);
}

console.log(`Built and signed Quick Look extensions: ${output}`);
