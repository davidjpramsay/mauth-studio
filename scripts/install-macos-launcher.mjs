#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const defaultTarget = path.join(os.homedir(), "Applications", "Mauth Studio Launcher.app");

function usage() {
  console.log(`Usage: pnpm macos:install-launcher [--target /path/to/Mauth Studio Launcher.app] [--repo /path/to/Mauth]

Creates a local macOS .app launcher that opens Terminal, runs pnpm dev:launch
from the Mauth repo, checks /api/system/status, starts the web/API servers when
needed, and opens Mauth Studio in the browser.`);
}

function optionValue(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Missing value for ${name}`);
    process.exit(1);
  }
  return value;
}

if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

if (process.platform !== "darwin") {
  console.error("macOS launcher installation is only available on macOS.");
  process.exit(1);
}

const targetApp = path.resolve(optionValue("--target", defaultTarget));
const repoRoot = path.resolve(optionValue("--repo", ROOT));
const appName = path.basename(targetApp, ".app") || "Mauth Studio Launcher";
const contentsDir = path.join(targetApp, "Contents");
const macosDir = path.join(contentsDir, "MacOS");
const resourcesDir = path.join(contentsDir, "Resources");
const executableName = "mauth-studio-launcher";

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function shellSingleQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function appleScriptString(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function launcherScript() {
  const terminalCommand = ["clear", `cd ${shellSingleQuote(repoRoot)}`, 'echo "Starting Mauth Studio..."', "pnpm dev:launch"].join(" && ");

  return `#!/bin/zsh
set -euo pipefail

if ! command -v osascript >/dev/null 2>&1; then
  echo "osascript is required to launch Mauth Studio from Finder." >&2
  exit 1
fi

osascript <<'APPLESCRIPT'
tell application "Terminal"
  activate
  do script ${appleScriptString(terminalCommand)}
end tell
APPLESCRIPT
`;
}

function infoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>${escapeXml(appName)}</string>
  <key>CFBundleExecutable</key>
  <string>${executableName}</string>
  <key>CFBundleIdentifier</key>
  <string>au.edu.acc.mauth.launcher</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${escapeXml(appName)}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
}

await fs.access(path.join(repoRoot, "package.json")).catch(() => {
  console.error(`Repo path does not look like Mauth: ${repoRoot}`);
  process.exit(1);
});

await fs.rm(targetApp, { recursive: true, force: true });
await fs.mkdir(macosDir, { recursive: true });
await fs.mkdir(resourcesDir, { recursive: true });
await fs.writeFile(path.join(contentsDir, "Info.plist"), infoPlist(), "utf8");
await fs.writeFile(path.join(macosDir, executableName), launcherScript(), { encoding: "utf8", mode: 0o755 });
await fs.writeFile(path.join(resourcesDir, "README.txt"), `Mauth Studio Launcher\n\nRuns pnpm dev:launch from:\n${repoRoot}\n`, "utf8");

console.log(`Installed ${appName}`);
console.log(targetApp);
console.log("Double-click it in Finder to start Mauth Studio through pnpm dev:launch.");
