#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { parse as parseYaml } from "yaml";
import { macUpdateMetadataProblems } from "./macos-ship-plan.mjs";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function signingIdentities() {
  const result = spawnSync("/usr/bin/security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" });
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function notarizationCredentialArgs() {
  if (process.env.APPLE_KEYCHAIN_PROFILE) {
    return ["--keychain-profile", process.env.APPLE_KEYCHAIN_PROFILE];
  }
  if (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) {
    return [
      "--apple-id",
      process.env.APPLE_ID,
      "--password",
      process.env.APPLE_APP_SPECIFIC_PASSWORD,
      "--team-id",
      process.env.APPLE_TEAM_ID,
    ];
  }
  return ["--key", process.env.APPLE_API_KEY, "--key-id", process.env.APPLE_API_KEY_ID, "--issuer", process.env.APPLE_API_ISSUER];
}

function validateNotarizationCredentials() {
  const result = spawnSync("/usr/bin/xcrun", ["notarytool", "history", "--output-format", "json", ...notarizationCredentialArgs()], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const detail = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    console.error(`Apple notarization credential validation failed:\n${detail || "Unknown notarytool error."}`);
    process.exit(result.status ?? 1);
  }
  console.log("Apple notarization credentials are valid.");
}

function singleDmgArtifact() {
  const releaseDir = path.resolve("release");
  const artifacts = fs.readdirSync(releaseDir).filter((name) => name.endsWith(".dmg"));
  if (artifacts.length !== 1) {
    console.error(`Expected one DMG release artifact, found ${artifacts.length}.`);
    process.exit(1);
  }
  return path.join(releaseDir, artifacts[0]);
}

function singleZipArtifact() {
  const releaseDir = path.resolve("release");
  const artifacts = fs.readdirSync(releaseDir).filter((name) => name.endsWith(".zip"));
  if (artifacts.length !== 1) {
    console.error(`Expected one ZIP release artifact, found ${artifacts.length}.`);
    process.exit(1);
  }
  return path.join(releaseDir, artifacts[0]);
}

function prepareReleaseDirectory() {
  const releaseDir = path.resolve("release");
  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });
}

function sha512(file) {
  return createHash("sha512").update(fs.readFileSync(file)).digest("base64");
}

function validateUpdateMetadata(zipArtifact) {
  const metadataPath = path.resolve("release", "latest-mac.yml");
  if (!fs.existsSync(metadataPath)) {
    console.error("Expected release/latest-mac.yml for in-app updates.");
    process.exit(1);
  }
  const metadata = parseYaml(fs.readFileSync(metadataPath, "utf8"));
  const problems = macUpdateMetadataProblems(metadata, {
    name: path.basename(zipArtifact),
    sha512: sha512(zipArtifact),
    size: fs.statSync(zipArtifact).size,
  });
  if (problems.length) {
    console.error(`Update metadata validation failed:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
}

const identities = signingIdentities();
const configuredIdentity = process.env.MAUTH_CODESIGN_IDENTITY?.trim();
const discoveredIdentity = identities.match(/"(Developer ID Application: [^"]+)"/)?.[1];
const identity = configuredIdentity || discoveredIdentity;
const electronBuilderIdentity = identity?.replace(/^Developer ID Application:\s*/, "");
const hasNotaryCredentials = Boolean(
  process.env.APPLE_KEYCHAIN_PROFILE ||
  (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) ||
  (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER),
);

if (!identity || !identities.includes(`"${identity}"`)) {
  console.error(
    "A Developer ID Application certificate is required. Install it in Keychain Access or set MAUTH_CODESIGN_IDENTITY to an installed Developer ID identity.",
  );
  process.exit(1);
}
if (!hasNotaryCredentials) {
  console.error(
    "Apple notarization credentials are required. Set APPLE_KEYCHAIN_PROFILE, or the documented Apple ID/API-key environment variables.",
  );
  process.exit(1);
}

validateNotarizationCredentials();

if (process.argv.includes("--preflight-only")) {
  console.log(`Release prerequisites are available for ${identity}.`);
  process.exit(0);
}

prepareReleaseDirectory();
run("pnpm", ["build:web"]);
run("pnpm", ["macos:build:sidecar"]);
run("pnpm", ["macos:build:penrose"]);
run(
  "pnpm",
  [
    "exec",
    "electron-builder",
    "--config",
    "electron-builder.yml",
    "--mac",
    "dmg",
    "zip",
    "--arm64",
    "--publish",
    "never",
    `--config.mac.identity=${electronBuilderIdentity}`,
    "--config.mac.notarize=true",
    "--config.mac.gatekeeperAssess=true",
  ],
  {
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: "true",
      CSC_NAME: electronBuilderIdentity,
    },
  },
);
const dmgArtifact = singleDmgArtifact();
const zipArtifact = singleZipArtifact();
run("/usr/bin/codesign", ["--force", "--sign", identity, "--timestamp", dmgArtifact]);
run("/usr/bin/xcrun", ["notarytool", "submit", dmgArtifact, "--wait", ...notarizationCredentialArgs()]);
run("/usr/bin/xcrun", ["stapler", "staple", dmgArtifact]);
run("/usr/bin/xcrun", ["stapler", "validate", dmgArtifact]);
run("/usr/sbin/spctl", ["-a", "-vvv", "-t", "install", dmgArtifact]);
validateUpdateMetadata(zipArtifact);
run("node", ["scripts/verify-macos-app.mjs", "--distribution"]);

console.log("Mauth Studio release artifacts were signed, notarized, and written to release/.");
