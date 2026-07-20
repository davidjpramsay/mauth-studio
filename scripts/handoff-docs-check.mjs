import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const verifyLiveCheckpoint = process.argv.includes("--live");

const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "docs/current-state.md",
  "docs/architecture.md",
  "docs/storage.md",
  "docs/local-ai-workflow.md",
  "docs/agent-local-setup.md",
  "docs/agent-bridge.md",
  "docs/agent-docs.md",
  "docs/macos-release.md",
  "docs/mauth-actions.md",
  "docs/mauthdown.md",
  "docs/ai-brains.md",
  "docs/app-scan-and-direction.md",
  "docs/todo.md",
  "configs/ai-brains/index.json",
  "configs/ai-brains/question.json",
  "configs/ai-brains/formatting.json",
  "configs/ai-brains/diagram.json",
  "configs/ai-brains/solutions.json",
  "chats/Development.md",
  "chats/Authoring.md",
];

for (const relativePath of requiredFiles) {
  assert.ok(fs.existsSync(path.join(root, relativePath)), `Missing handoff document: ${relativePath}`);
}

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const currentState = read("docs/current-state.md");

const requiredCurrentStateHeadings = [
  "## Start Here",
  "### Documentation Ownership",
  "### Project Snapshot At A Glance",
  "## Immediate Worktree Checkpoint",
  "### Model Transition Readiness",
  "### Active Development Goal",
  "### Exact Resume Point",
  "### New Model Safety Check",
  "## Product Direction",
  "## Runtime Model",
  "## Storage Model",
  "## Agent Editing Contract",
  "## Manual Solutions Direction",
  "## Current Verification Baseline",
  "## Near-Term Work Queue",
  "## First Commands For A New Model",
];

for (const heading of requiredCurrentStateHeadings) {
  assert.ok(currentState.includes(heading), `docs/current-state.md is missing ${heading}`);
}

for (const entrypoint of ["AGENTS.md", "CLAUDE.md", "README.md"]) {
  const content = read(entrypoint);
  assert.ok(content.includes("docs/current-state.md"), `${entrypoint} must point new models at docs/current-state.md`);
  assert.ok(content.includes("docs/architecture.md"), `${entrypoint} must identify docs/architecture.md`);
}

const packageJson = JSON.parse(read("package.json"));
for (const relativePath of requiredFiles.filter((candidate) => candidate.endsWith(".json"))) {
  JSON.parse(read(relativePath));
}
const requiredScripts = [
  "macos:dev",
  "macos:build",
  "macos:install",
  "macos:verify",
  "macos:release",
  "dev:launch:desktop",
  "dev:status",
  "dev:stop",
  "agent:mcp",
  "agent:doctor",
  "smoke:external-folder-autosave",
  "smoke:document-session-conflict",
  "smoke:diagram-solution-authoring",
  "test:api",
  "test:web-actions",
  "test:plotly",
  "test:launcher",
  "check:handoff",
  "check:handoff:live",
  "check",
];

for (const script of requiredScripts) {
  assert.ok(packageJson.scripts?.[script], `package.json is missing the documented script ${script}`);
}

const markdownFiles = requiredFiles.filter((relativePath) => relativePath.endsWith(".md"));
const missingLinks = [];
for (const relativePath of markdownFiles) {
  const content = read(relativePath);
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of content.matchAll(linkPattern)) {
    const target = match[1].split("#", 1)[0];
    if (!target || target.includes("://") || target.startsWith("mailto:")) continue;
    const resolved = path.resolve(root, path.dirname(relativePath), target);
    if (!fs.existsSync(resolved)) missingLinks.push(`${relativePath} -> ${target}`);
  }
}

assert.deepEqual(missingLinks, [], `Broken local documentation links:\n${missingLinks.join("\n")}`);

const assertConsistentCount = (label, pattern) => {
  const values = [...currentState.matchAll(pattern)].map((match) => Number(match[1]));
  assert.ok(values.length > 0, `docs/current-state.md is missing the ${label} verification count`);
  assert.equal(new Set(values).size, 1, `docs/current-state.md contains inconsistent ${label} verification counts: ${values.join(", ")}`);
};

assertConsistentCount("API", /\bAPI:?\s+(\d+)\s+passed\b/g);
assertConsistentCount("web/actions", /\bweb\/actions:?\s+(\d+)\s+passed\b/g);
assertConsistentCount("Plotly", /\bPlotly:?\s+(\d+)\s+passed\b/g);
assertConsistentCount("launcher", /\blauncher:?\s+(\d+)\s+passed\b/g);

const requiredMatch = (pattern, description) => {
  const match = currentState.match(pattern);
  assert.ok(match, `docs/current-state.md is missing its ${description}`);
  return match;
};

if (verifyLiveCheckpoint) {
  const run = (command, args) => execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim();
  const branch = run("git", ["branch", "--show-current"]);
  const head = run("git", ["rev-parse", "--short", "HEAD"]);
  const status = run("git", ["status", "--short"]);
  const statusRows = status ? status.split(/\r?\n/) : [];
  const modifiedCount = statusRows.filter((row) => !row.startsWith("?? ")).length;
  const untrackedCount = statusRows.filter((row) => row.startsWith("?? ")).length;
  const lineCount = (relativePath) => read(relativePath).split(/\r?\n/).length - 1;

  const documentedBranch = requiredMatch(/^branch: (.+)$/m, "checkpoint branch")[1];
  const documentedHead = requiredMatch(/^baseline commit: ([0-9a-f]+|HEAD)(?: .*)?$/m, "baseline commit")[1];
  const documentedAppLines = Number(requiredMatch(/^App\.tsx: (\d+) lines$/m, "App.tsx line count")[1]);
  const documentedInspectorLines = Number(
    requiredMatch(/^SelectionInspector\.tsx: (\d+) lines(?: .*)?$/m, "SelectionInspector.tsx line count")[1],
  );
  const documentedDirtyWorktree = currentState.match(
    /^worktree: intentionally dirty \((\d+) modified files and (\d+) untracked files at this checkpoint\);/m,
  );
  const documentedCleanWorktree = /^worktree: clean at this checkpoint;/m.test(currentState);

  assert.ok(documentedDirtyWorktree || documentedCleanWorktree, "docs/current-state.md is missing its clean or dirty worktree checkpoint");

  if (documentedBranch !== "CURRENT") {
    assert.equal(documentedBranch, branch, "The handoff branch does not match Git");
  }
  if (documentedHead !== "HEAD") {
    assert.equal(documentedHead, head, "The handoff baseline commit does not match HEAD");
  }
  assert.equal(documentedAppLines, lineCount("apps/web/src/App.tsx"), "The handoff App.tsx line count is stale");
  assert.equal(
    documentedInspectorLines,
    lineCount("apps/web/src/components/editor/SelectionInspector.tsx"),
    "The handoff SelectionInspector.tsx line count is stale",
  );
  if (documentedCleanWorktree) {
    assert.equal(modifiedCount, 0, "The handoff says the worktree is clean but modified files are present");
    assert.equal(untrackedCount, 0, "The handoff says the worktree is clean but untracked files are present");
  } else {
    assert.equal(Number(documentedDirtyWorktree[1]), modifiedCount, "The handoff modified-file count is stale");
    assert.equal(Number(documentedDirtyWorktree[2]), untrackedCount, "The handoff untracked-file count is stale");
  }

  console.log(
    `Live checkpoint matches Git: ${branch} at ${head}, ${modifiedCount} modified, ${untrackedCount} untracked, App.tsx ${documentedAppLines} lines, SelectionInspector.tsx ${documentedInspectorLines} lines.`,
  );
}

console.log(
  `Handoff documentation is complete: ${requiredFiles.length} required files and ${requiredCurrentStateHeadings.length} checkpoint sections verified.`,
);
