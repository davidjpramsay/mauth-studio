import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const workflow = parse(readFileSync(new URL("../.github/workflows/check.yml", import.meta.url), "utf8"));

test("CI cancels only superseded checks and retains the complete local gate", () => {
  assert.deepEqual(workflow.on.push.branches, ["main"]);
  assert.ok(workflow.on.pull_request.types.includes("synchronize"));
  assert.equal(workflow.concurrency.group, "${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}");
  assert.equal(workflow.concurrency["cancel-in-progress"], true);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  const job = workflow.jobs.check;
  assert.equal(job["runs-on"], "ubuntu-latest");
  assert.equal(job["timeout-minutes"], 15);
  const checks = job.steps.find((step) => step.name === "Run checks");
  assert.equal(checks.run, "pnpm check");
  assert.equal(checks.if, undefined);
});

test("CI caches locked dependencies without building or publishing installers", () => {
  const steps = workflow.jobs.check.steps;
  const uv = steps.find((step) => step.uses?.startsWith("astral-sh/setup-uv@"));
  assert.equal(uv.with["enable-cache"], true);
  assert.equal(uv.with["cache-dependency-glob"], "apps/api/uv.lock");
  assert.equal(steps.find((step) => step.name === "Install API dependencies").run, "uv sync --locked");
  assert.equal(steps.find((step) => step.name === "Install web dependencies").run, "pnpm install --frozen-lockfile");
  assert.ok(steps.some((step) => step.with?.cache === "pnpm"));
  assert.ok(steps.every((step) => !/macos:|electron-builder|publish|release/.test(step.run ?? "")));
});
