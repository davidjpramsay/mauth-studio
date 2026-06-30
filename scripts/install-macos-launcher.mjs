#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const defaultTarget = path.join(os.homedir(), "Applications", "Mauth Studio.app");
const defaultIconSource = path.join(ROOT, "apps", "web", "public", "brand", "mauth_icon.png");
const iconFileName = "mauth-studio.icns";

function usage() {
  console.log(`Usage: pnpm macos:install-launcher [--target /path/to/Mauth Studio.app] [--repo /path/to/Mauth] [--icon /path/to/icon.png]

Creates a local macOS .app entry point that opens Terminal, runs pnpm dev:launch
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
const iconSource = path.resolve(optionValue("--icon", defaultIconSource));
const appName = path.basename(targetApp, ".app") || "Mauth Studio";
const contentsDir = path.join(targetApp, "Contents");
const macosDir = path.join(contentsDir, "MacOS");
const resourcesDir = path.join(contentsDir, "Resources");
const executableName = "mauth-studio";

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
  const terminalCommand = [
    "clear",
    'printf "\\\\033]0;Mauth Studio\\\\007"',
    `cd ${shellSingleQuote(repoRoot)}`,
    'echo "Starting Mauth Studio..."',
    'echo "This window owns any API/web processes started by the launcher."',
    'echo "Press Ctrl+C here to stop them."',
    "pnpm dev:launch",
  ].join(" && ");

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
  <key>CFBundleIconFile</key>
  <string>${iconFileName}</string>
  <key>CFBundleIdentifier</key>
  <string>au.edu.acc.mauth.studio.local</string>
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
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.education</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
}

function commandExists(command) {
  return spawnSync("/bin/zsh", ["-lc", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: "utf8" });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(stderr || `${command} ${commandArgs.join(" ")} failed`);
  }
}

async function createIconSet(sourcePng, iconsetDir) {
  const sizes = [
    { file: "icon_16x16.png", pixels: 16 },
    { file: "icon_16x16@2x.png", pixels: 32 },
    { file: "icon_32x32.png", pixels: 32 },
    { file: "icon_32x32@2x.png", pixels: 64 },
    { file: "icon_128x128.png", pixels: 128 },
    { file: "icon_128x128@2x.png", pixels: 256 },
    { file: "icon_256x256.png", pixels: 256 },
    { file: "icon_256x256@2x.png", pixels: 512 },
    { file: "icon_512x512.png", pixels: 512 },
  ];

  await fs.mkdir(iconsetDir, { recursive: true });
  for (const size of sizes) {
    run("sips", ["-z", String(size.pixels), String(size.pixels), sourcePng, "--out", path.join(iconsetDir, size.file)]);
  }
}

async function installAppIcon() {
  await fs.access(iconSource);
  if (!commandExists("sips") || !commandExists("iconutil")) {
    await fs.copyFile(iconSource, path.join(resourcesDir, "mauth-studio-icon.png"));
    return false;
  }

  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "mauth-studio-icon-"));
  const iconsetDir = path.join(temporaryDir, "MauthStudio.iconset");
  try {
    await createIconSet(iconSource, iconsetDir);
    run("iconutil", ["-c", "icns", iconsetDir, "-o", path.join(resourcesDir, iconFileName)]);
    return true;
  } finally {
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
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
const installedIcon = await installAppIcon();
await fs.writeFile(
  path.join(resourcesDir, "README.txt"),
  `Mauth Studio\n\nRuns pnpm dev:launch from:\n${repoRoot}\n\nThis app is a local development launcher. Leave the Terminal window open while using Mauth Studio. Press Ctrl+C in that Terminal window to stop any API/web processes started by the launcher.\n\nFrom the repo root, run pnpm dev:status to inspect local Mauth servers, pnpm dev:stop to stop Mauth-owned local servers, or pnpm dev:launch:replace for a deliberate clean restart.\n`,
  "utf8",
);

console.log(`Installed ${appName}`);
console.log(targetApp);
console.log(
  installedIcon ? "Installed app icon from Mauth brand assets." : "Installed without .icns icon because sips/iconutil was unavailable.",
);
console.log("Double-click it in Finder to start Mauth Studio through pnpm dev:launch.");
