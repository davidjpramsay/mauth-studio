#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { macReleaseArtifactNames, macReleaseTag, macShipPreflightProblems, remoteReleaseAssetProblems } from "./macos-ship-plan.mjs";

const REPOSITORY = "davidjpramsay/mauth-studio";
const preflightOnly = process.argv.includes("--preflight");

function execute(command, args, { allowFailure = false, capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? "pipe" : "inherit",
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
  return result;
}

function output(command, args) {
  return execute(command, args, { capture: true }).stdout.trim();
}

function optionalJson(command, args) {
  const result = execute(command, args, { allowFailure: true, capture: true });
  if (result.status !== 0) {
    const detail = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    if (/release not found/i.test(detail)) return null;
    throw new Error(`${command} ${args.join(" ")} failed:\n${detail || "unknown error"}`);
  }
  return JSON.parse(result.stdout);
}

function remoteTagCommit(tag) {
  const lines = output("git", ["ls-remote", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`])
    .split("\n")
    .filter(Boolean);
  const dereferenced = lines.find((line) => line.endsWith(`refs/tags/${tag}^{}`));
  const direct = lines.find((line) => line.endsWith(`refs/tags/${tag}`));
  const resolved = dereferenced || direct;
  return resolved ? resolved.split(/\s+/)[0] : null;
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function releaseAssets(releaseDirectory, version) {
  const names = macReleaseArtifactNames(version);
  const required = [names.dmg, names.zip, names.metadata];
  const generated = fs.readdirSync(releaseDirectory).filter((name) => name.endsWith(".blockmap"));
  const files = [...required, ...generated].map((name) => path.join(releaseDirectory, name));
  const missing = files.filter((file) => !fs.existsSync(file));
  if (missing.length) throw new Error(`Missing release artifacts:\n${missing.join("\n")}`);
  return files.map((file) => ({
    file,
    name: path.basename(file),
    size: fs.statSync(file).size,
    sha256: sha256(file),
  }));
}

function retryUpload(tag, files) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = execute("gh", ["release", "upload", tag, ...files, "--clobber", "--repo", REPOSITORY], {
      allowFailure: true,
    });
    if (result.status === 0) return;
    if (attempt === 3) throw new Error(`GitHub asset upload failed after ${attempt} attempts; the release remains a draft.`);
    console.warn(`GitHub asset upload attempt ${attempt} failed; retrying in ${attempt * 10} seconds.`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 10_000);
  }
}

function assertRemoteAssets(tag, localAssets) {
  const release = JSON.parse(output("gh", ["api", `repos/${REPOSITORY}/releases/tags/${tag}`]));
  const problems = remoteReleaseAssetProblems(localAssets, release.assets || []);
  if (problems.length) throw new Error(`Remote release verification failed:\n- ${problems.join("\n- ")}`);
}

function main() {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  const version = packageJson.version;
  const tag = macReleaseTag(version);
  const notesFile = path.resolve("docs", "releases", `${tag}.md`);

  execute("git", ["fetch", "origin", "main", "--quiet"]);
  const head = output("git", ["rev-parse", "HEAD"]);
  const existingRelease = optionalJson("gh", ["release", "view", tag, "--repo", REPOSITORY, "--json", "isDraft,targetCommitish,url"]);
  const problems = macShipPreflightProblems({
    version,
    branch: output("git", ["branch", "--show-current"]),
    clean: output("git", ["status", "--porcelain"]) === "",
    head,
    originMain: output("git", ["rev-parse", "origin/main"]),
    notesExist: fs.existsSync(notesFile),
    existingRelease,
    remoteTagCommit: remoteTagCommit(tag),
  });
  if (problems.length) throw new Error(`Mauth Studio cannot ship ${tag}:\n- ${problems.join("\n- ")}`);

  execute("gh", ["auth", "status"]);
  execute("node", ["scripts/build-macos-release.mjs", "--preflight-only"]);
  console.log(`Release preflight passed for ${tag} at ${head}.`);
  if (preflightOnly) return;

  execute("pnpm", ["check"]);
  execute("pnpm", ["macos:release"]);
  const assets = releaseAssets(path.resolve("release"), version);

  if (!existingRelease) {
    execute("gh", [
      "release",
      "create",
      tag,
      "--target",
      head,
      "--title",
      `Mauth Studio ${version} Alpha`,
      "--notes-file",
      notesFile,
      "--draft",
      "--prerelease",
      "--repo",
      REPOSITORY,
    ]);
  }

  retryUpload(
    tag,
    assets.map(({ file }) => file),
  );
  assertRemoteAssets(tag, assets);
  execute("gh", ["release", "edit", tag, "--notes-file", notesFile, "--draft=false", "--prerelease", "--repo", REPOSITORY]);

  const published = JSON.parse(
    output("gh", ["release", "view", tag, "--repo", REPOSITORY, "--json", "isDraft,isPrerelease,url,targetCommitish"]),
  );
  if (published.isDraft || !published.isPrerelease || published.targetCommitish !== head) {
    throw new Error(`Published release state for ${tag} did not match the verified draft.`);
  }
  console.log(`Mauth Studio ${version} was published and verified: ${published.url}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
