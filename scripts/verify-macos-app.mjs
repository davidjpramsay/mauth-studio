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
const connector = path.join(appBundle, "Contents", "Resources", "agent", "mauth-agent-mcp");
const documentIcon = path.join(appBundle, "Contents", "Resources", "mauth-document.icns");
const quickLookExtensions = [
  {
    path: path.join(appBundle, "Contents", "PlugIns", "MauthQuickLookThumbnail.appex"),
    extensionPoint: "com.apple.quicklook.thumbnail",
  },
  {
    path: path.join(appBundle, "Contents", "PlugIns", "MauthQuickLookPreview.appex"),
    extensionPoint: "com.apple.quicklook.preview",
    principalClass: "MauthQuickLookPreview.PreviewViewController",
    dataBasedPreview: "false",
  },
];

function run(command, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (!allowFailure && result.status !== 0) process.exit(result.status ?? 1);
  return `${result.stdout || ""}${result.stderr || ""}`;
}

if (!fs.existsSync(appBundle)) {
  console.error(`Mauth Studio app bundle was not found: ${appBundle}`);
  process.exit(1);
}

if (!fs.existsSync(connector) || !(fs.statSync(connector).mode & 0o111)) {
  console.error(`The executable Mauth Agent Connector is missing from the app bundle: ${connector}`);
  process.exit(1);
}
if (!fs.existsSync(documentIcon)) {
  console.error(`The dedicated Mauth document icon is missing from the app bundle: ${documentIcon}`);
  process.exit(1);
}

function plistValue(plist, keyPath) {
  return run("/usr/bin/plutil", ["-extract", keyPath, "raw", "-o", "-", plist], { capture: true }).trim();
}

const appInfo = path.join(appBundle, "Contents", "Info.plist");
if (plistValue(appInfo, "UTExportedTypeDeclarations.0.UTTypeIdentifier") !== "au.edu.acc.mauth-studio.document") {
  console.error("The app does not export the canonical Mauth document UTI.");
  process.exit(1);
}
if (plistValue(appInfo, "CFBundleDocumentTypes.0.CFBundleTypeIconFile") !== "mauth-document.icns") {
  console.error("The .mauth association does not use the dedicated document icon.");
  process.exit(1);
}
if (plistValue(appInfo, "CFBundleDocumentTypes.0.LSItemContentTypes.0") !== "au.edu.acc.mauth-studio.document") {
  console.error("The .mauth association does not declare the canonical Mauth document UTI.");
  process.exit(1);
}

for (const extension of quickLookExtensions) {
  if (!fs.existsSync(extension.path)) {
    console.error(`A required Quick Look extension is missing: ${extension.path}`);
    process.exit(1);
  }
  run("/usr/bin/codesign", ["--verify", "--strict", "--verbose=2", extension.path]);
  const extensionInfo = path.join(extension.path, "Contents", "Info.plist");
  if (plistValue(extensionInfo, "NSExtension.NSExtensionPointIdentifier") !== extension.extensionPoint) {
    console.error(`Quick Look extension point is incorrect: ${extension.path}`);
    process.exit(1);
  }
  if (plistValue(extensionInfo, "NSExtension.NSExtensionAttributes.QLSupportedContentTypes.0") !== "au.edu.acc.mauth-studio.document") {
    console.error(`Quick Look extension does not support the canonical Mauth UTI: ${extension.path}`);
    process.exit(1);
  }
  if (extension.principalClass && plistValue(extensionInfo, "NSExtension.NSExtensionPrincipalClass") !== extension.principalClass) {
    console.error(`Quick Look preview extension does not declare its view controller: ${extension.path}`);
    process.exit(1);
  }
  if (
    extension.dataBasedPreview &&
    plistValue(extensionInfo, "NSExtension.NSExtensionAttributes.QLIsDataBasedPreview") !== extension.dataBasedPreview
  ) {
    console.error(`Quick Look preview extension does not declare its preview mode: ${extension.path}`);
    process.exit(1);
  }
  const extensionEntitlements = run("/usr/bin/codesign", ["--display", "--entitlements", ":-", extension.path], {
    capture: true,
  });
  if (!extensionEntitlements.includes("com.apple.security.app-sandbox")) {
    console.error(`Quick Look extension is missing its sandbox entitlement: ${extension.path}`);
    process.exit(1);
  }
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

const connectorVersion = run(connector, ["--version"], { capture: true }).trim();
if (!/^Mauth Agent Connector \d+\.\d+\.\d+/.test(connectorVersion)) {
  console.error(`The bundled Mauth Agent Connector did not start correctly: ${connectorVersion || "no output"}`);
  process.exit(1);
}

if (distribution) {
  if (!/Authority=Developer ID Application:/.test(signing) || /TeamIdentifier=not set/.test(signing)) {
    console.error("Distribution verification requires a Developer ID Application signature with a Team ID.");
    process.exit(1);
  }
  run("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", appBundle]);
}

console.log(
  `${distribution ? "Distribution" : "Local hardened"} verification passed for ${appBundle} (${architectures}; ${connectorVersion}).`,
);
