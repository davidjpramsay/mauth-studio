#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appBundle = path.resolve(process.argv[2] ?? path.join(ROOT, "release", "mac-arm64", "Mauth Studio.app"));
const entitlements = path.join(ROOT, "build", "entitlements.mac.plist");
const identity = process.env.MAUTH_CODESIGN_IDENTITY?.trim() || "-";

if (!fs.existsSync(appBundle)) {
  console.error(`Mauth Studio app bundle was not found: ${appBundle}`);
  process.exit(1);
}

function run(args) {
  const result = spawnSync("/usr/bin/codesign", args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run([
  "--force",
  "--deep",
  "--options",
  "runtime",
  "--entitlements",
  entitlements,
  "--sign",
  identity,
  identity === "-" ? "--timestamp=none" : "--timestamp",
  appBundle,
]);
run(["--verify", "--deep", "--strict", "--verbose=2", appBundle]);
console.log(`${identity === "-" ? "Hardened ad-hoc" : "Developer ID"} signed Mauth Studio: ${appBundle}`);
