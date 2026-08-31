import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { macosSidecarBuildPlan } from "./macos-sidecar-build-plan.mjs";

test("macOS sidecar uses a directory bundle with a nested executable", () => {
  const root = path.resolve("/repo/mauth");
  const plan = macosSidecarBuildPlan(root);

  assert.ok(plan.args.includes("--onedir"));
  assert.equal(plan.args.includes("--onefile"), false);
  assert.equal(plan.sidecarRoot, path.join(root, "tmp", "macos", "mauth-api"));
  assert.equal(plan.executable, path.join(plan.sidecarRoot, "mauth-api"));
  assert.equal(plan.cwd, path.join(root, "apps", "api"));
});
