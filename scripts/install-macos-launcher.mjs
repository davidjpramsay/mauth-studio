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
  console.log(`Usage: pnpm macos:install-launcher [--target /path/to/Mauth Studio.app] [--repo /path/to/Mauth] [--icon /path/to/icon.png] [--desktop-shortcut] [--desktop-shortcut-path /path/to/Mauth Studio.app] [--reveal] [--launch]

Creates a local macOS .app entry point that opens Terminal, runs
pnpm dev:launch:desktop from the Mauth repo, checks /api/system/status, cleans
up stale duplicate local listeners when needed, and opens Mauth Studio in the
browser.

Options:
  --desktop-shortcut
              Add a Desktop shortcut symlink to the installed app.
  --desktop-shortcut-path
              Choose where the shortcut symlink is created.
  --reveal    Reveal the installed app in Finder after installation.
  --launch    Launch the installed app after installation.`);
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
const createDesktopShortcut = args.includes("--desktop-shortcut") || args.includes("--desktop-shortcut-path");
const desktopShortcutPath = path.resolve(optionValue("--desktop-shortcut-path", path.join(os.homedir(), "Desktop", `${appName}.app`)));
const revealAfterInstall = args.includes("--reveal");
const launchAfterInstall = args.includes("--launch");
const contentsDir = path.join(targetApp, "Contents");
const macosDir = path.join(contentsDir, "MacOS");
const resourcesDir = path.join(contentsDir, "Resources");
const executableName = "mauth-studio";
const pnpmCommand = commandPath("pnpm") || "pnpm";

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function shellSingleQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function commandPath(command) {
  const result = spawnSync("/bin/zsh", ["-lc", `command -v ${command}`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim().split("\n")[0] : "";
}

function launcherScript() {
  return `#!/bin/zsh
set -euo pipefail

if ! command -v osascript >/dev/null 2>&1; then
  echo "osascript is required to launch Mauth Studio from Finder." >&2
  exit 1
fi

readonly REPO_ROOT=${shellSingleQuote(repoRoot)}
readonly STORED_PNPM_COMMAND=${shellSingleQuote(pnpmCommand)}

show_error() {
  /usr/bin/osascript \\
    -e 'on run argv' \\
    -e 'display dialog (item 1 of argv) buttons {"OK"} default button "OK" with icon stop with title "Mauth Studio"' \\
    -e 'end run' \\
    "$1" >/dev/null
}

quote_arg() {
  printf "%q" "$1"
}

resolve_pnpm_command() {
  if [[ -n "$STORED_PNPM_COMMAND" ]]; then
    if [[ "$STORED_PNPM_COMMAND" == */* && -x "$STORED_PNPM_COMMAND" ]]; then
      printf "%s" "$STORED_PNPM_COMMAND"
      return 0
    fi
    if [[ "$STORED_PNPM_COMMAND" != */* ]] && command -v "$STORED_PNPM_COMMAND" >/dev/null 2>&1; then
      command -v "$STORED_PNPM_COMMAND"
      return 0
    fi
  fi

  if command -v pnpm >/dev/null 2>&1; then
    command -v pnpm
    return 0
  fi

  local candidate
  for candidate in "$HOME/Library/pnpm/pnpm" "/opt/homebrew/bin/pnpm" "/usr/local/bin/pnpm"; do
    if [[ -x "$candidate" ]]; then
      printf "%s" "$candidate"
      return 0
    fi
  done

  return 1
}

if [[ ! -f "$REPO_ROOT/package.json" || ! -f "$REPO_ROOT/scripts/mauth-launch.mjs" ]]; then
  show_error "The Mauth Studio project folder could not be found at:

$REPO_ROOT

Move it back there, or reinstall the launcher from the current repo with:

pnpm macos:install-launcher --reveal"
  exit 1
fi

readonly RESOLVED_PNPM_COMMAND="$(resolve_pnpm_command || true)"
if [[ -z "$RESOLVED_PNPM_COMMAND" ]]; then
  show_error "The pnpm command is not available to the launcher.

Install pnpm again, or reinstall the launcher from the Mauth repo with:

pnpm macos:install-launcher --reveal"
  exit 1
fi

TERMINAL_COMMAND="clear"
TERMINAL_COMMAND="$TERMINAL_COMMAND && printf '\\\\033]0;Mauth Studio\\\\007'"
TERMINAL_COMMAND="$TERMINAL_COMMAND && cd $(quote_arg "$REPO_ROOT")"
TERMINAL_COMMAND="$TERMINAL_COMMAND && echo 'Starting Mauth Studio...'"
TERMINAL_COMMAND="$TERMINAL_COMMAND && printf 'Using pnpm: %s\\\\n' $(quote_arg "$RESOLVED_PNPM_COMMAND")"
TERMINAL_COMMAND="$TERMINAL_COMMAND && echo 'This window owns any API/web processes started by the launcher.'"
TERMINAL_COMMAND="$TERMINAL_COMMAND && echo 'Desktop mode restarts stale or partial Mauth sessions before opening the browser.'"
TERMINAL_COMMAND="$TERMINAL_COMMAND && echo 'Press Ctrl+C here to stop them.'"
TERMINAL_COMMAND="$TERMINAL_COMMAND && $(quote_arg "$RESOLVED_PNPM_COMMAND") dev:launch:desktop"

/usr/bin/osascript \\
  -e 'on run argv' \\
  -e 'tell application "Terminal"' \\
  -e 'activate' \\
  -e 'do script (item 1 of argv)' \\
  -e 'end tell' \\
  -e 'end run' \\
  "$TERMINAL_COMMAND"
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

async function installDesktopShortcut(target, shortcutPath) {
  if (target === shortcutPath) return false;
  const existing = await fs.lstat(shortcutPath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });

  if (existing) {
    if (!existing.isSymbolicLink()) {
      throw new Error(`Desktop shortcut path already exists and is not a symlink: ${shortcutPath}`);
    }
    await fs.rm(shortcutPath);
  }

  await fs.mkdir(path.dirname(shortcutPath), { recursive: true });
  const relativeTarget = path.relative(path.dirname(shortcutPath), target);
  await fs.symlink(relativeTarget || target, shortcutPath);
  return true;
}

function openInstalledApp(argsToOpen, failureLabel) {
  const result = spawnSync("open", argsToOpen, { encoding: "utf8" });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    console.error(`${failureLabel}: ${stderr || "open command failed"}`);
    return false;
  }
  return true;
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
  `Mauth Studio\n\nRuns pnpm dev:launch:desktop from:\n${repoRoot}\n\nStored pnpm command:\n${pnpmCommand}\n\nAt launch time the app uses the stored pnpm command when it still exists, then falls back to pnpm on PATH and common Homebrew/Corepack locations.\n\nThis app is a local development launcher. Desktop mode restarts stale or partial Mauth-owned runtime sessions before opening the browser, including the common case where the web server is still running but the API has stopped.\n\nLeave the Terminal window open while using Mauth Studio. Press Ctrl+C in that Terminal window to stop any API/web processes started by the launcher.\n\nFrom the repo root, run pnpm dev:status to inspect local Mauth servers, pnpm dev:stop to stop Mauth-owned local servers, or pnpm dev:launch:replace for a deliberate clean restart.\n`,
  "utf8",
);

let installedDesktopShortcut = false;
if (createDesktopShortcut) {
  installedDesktopShortcut = await installDesktopShortcut(targetApp, desktopShortcutPath);
}

console.log(`Installed ${appName}`);
console.log(targetApp);
console.log(
  installedIcon ? "Installed app icon from Mauth brand assets." : "Installed without .icns icon because sips/iconutil was unavailable.",
);
if (installedDesktopShortcut) {
  console.log(`Installed Desktop shortcut: ${desktopShortcutPath}`);
}
console.log("Double-click it in Finder to start Mauth Studio through pnpm dev:launch:desktop.");

if (revealAfterInstall && openInstalledApp(["-R", targetApp], "Could not reveal installed app")) {
  console.log("Revealed installed app in Finder.");
}

if (launchAfterInstall && openInstalledApp([targetApp], "Could not launch installed app")) {
  console.log("Launched Mauth Studio.");
}
