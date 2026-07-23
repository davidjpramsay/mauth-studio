import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { developmentRuntimePlan } from "./development-runtime.mjs";

test("development runtime uses watched API and Vite services on separate dynamic ports", () => {
  const repoRoot = "/tmp/mauth";
  const plan = developmentRuntimePlan({ repoRoot, apiPort: 43123, webPort: 43124 });

  assert.equal(plan.apiUrl, "http://127.0.0.1:43123");
  assert.equal(plan.webUrl, "http://127.0.0.1:43124");
  assert.equal(plan.api.cwd, path.join(repoRoot, "apps", "api"));
  assert.deepEqual(plan.api.args.slice(0, 4), ["-m", "uvicorn", "app.main:app", "--reload"]);
  assert.equal(plan.web.executable, path.join(repoRoot, "apps", "web", "node_modules", ".bin", "vite"));
  assert.equal(plan.web.args.at(-1), "--strictPort");
  assert.deepEqual(plan.web.env, {
    VITE_API_URL: "",
    VITE_API_PROXY_TARGET: "http://127.0.0.1:43123",
  });
});
