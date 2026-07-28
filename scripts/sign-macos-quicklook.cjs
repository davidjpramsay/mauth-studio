#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const quickLookEntitlements = path.join(ROOT, "build", "entitlements.quicklook.plist");
const appEntitlements = path.join(ROOT, "build", "entitlements.mac.plist");

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.status !== 0) {
    if (capture) process.stderr.write(`${result.stdout || ""}${result.stderr || ""}`);
    process.exit(result.status ?? 1);
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function discoveredIdentity(appBundle) {
  const signing = run("/usr/bin/codesign", ["--display", "--verbose=4", appBundle], { capture: true });
  return signing.match(/^Authority=(Developer ID Application: .+)$/m)?.[1] || "-";
}

function signQuickLookExtensions(appBundle, requestedIdentity = "", timestampOverride) {
  const plugins = path.join(appBundle, "Contents", "PlugIns");
  const extensions = fs.existsSync(plugins)
    ? fs
        .readdirSync(plugins)
        .filter((name) => name.endsWith(".appex"))
        .map((name) => path.join(plugins, name))
    : [];
  if (extensions.length !== 2) {
    console.error(`Expected two Quick Look extensions in ${plugins}, found ${extensions.length}.`);
    process.exit(1);
  }

  const identity = requestedIdentity || discoveredIdentity(appBundle);
  const timestamp = timestampOverride ?? identity !== "-";
  const timestampArgument = timestamp ? "--timestamp" : "--timestamp=none";

  for (const extension of extensions) {
    run("/usr/bin/codesign", [
      "--force",
      "--options",
      "runtime",
      "--entitlements",
      quickLookEntitlements,
      "--sign",
      identity,
      timestampArgument,
      extension,
    ]);
    run("/usr/bin/codesign", ["--verify", "--strict", "--verbose=2", extension]);
  }

  run("/usr/bin/codesign", [
    "--force",
    "--options",
    "runtime",
    "--entitlements",
    appEntitlements,
    "--sign",
    identity,
    timestampArgument,
    appBundle,
  ]);
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", appBundle]);
}

module.exports = { signQuickLookExtensions };

if (require.main === module) {
  const appBundle = process.argv[2];
  if (!appBundle) {
    console.error("Usage: sign-macos-quicklook.cjs <app bundle> [identity] [--timestamp|--timestamp=none]");
    process.exit(1);
  }
  const identity = process.argv[3] || "";
  const timestampArgument = process.argv[4];
  signQuickLookExtensions(
    appBundle,
    identity,
    timestampArgument === "--timestamp" ? true : timestampArgument === "--timestamp=none" ? false : undefined,
  );
}
