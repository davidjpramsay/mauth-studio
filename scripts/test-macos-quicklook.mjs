#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") {
  console.log("Skipping native Quick Look tests outside macOS.");
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  "/usr/bin/xcodebuild",
  [
    "-project",
    path.join(root, "native", "MauthQuickLook", "MauthQuickLook.xcodeproj"),
    "-scheme",
    "MauthQuickLook",
    "-configuration",
    "Debug",
    "-derivedDataPath",
    path.join(root, "tmp", "macos", "quicklook-tests"),
    "CODE_SIGNING_ALLOWED=NO",
    "test",
  ],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
