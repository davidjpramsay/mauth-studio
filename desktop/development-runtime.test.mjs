import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { developmentRuntimePlan } from "./development-runtime.mjs";

test("development runtime uses watched API and Vite services on separate dynamic ports", () => {
  const repoRoot = "/tmp/mauth";
  const plan = developmentRuntimePlan({
    repoRoot,
    apiPort: 43123,
    webPort: 43124,
    platform: "darwin",
    nodeExecutable: "/Applications/Electron.app/Contents/MacOS/Electron",
  });

  assert.equal(plan.apiUrl, "http://127.0.0.1:43123");
  assert.equal(plan.webUrl, "http://127.0.0.1:43124");
  assert.equal(plan.api.cwd, path.join(repoRoot, "apps", "api"));
  assert.equal(plan.api.executable, path.join(repoRoot, "apps", "api", ".venv", "bin", "python"));
  assert.deepEqual(plan.api.args.slice(0, 4), ["-m", "uvicorn", "app.main:app", "--reload"]);
  assert.equal(plan.web.executable, "/Applications/Electron.app/Contents/MacOS/Electron");
  assert.equal(plan.web.args[0], path.join(repoRoot, "apps", "web", "node_modules", "vite", "bin", "vite.js"));
  assert.equal(plan.web.args.at(-1), "--strictPort");
  assert.deepEqual(plan.web.env, {
    ELECTRON_RUN_AS_NODE: "1",
    VITE_API_URL: "",
    VITE_API_PROXY_TARGET: "http://127.0.0.1:43123",
  });
});

test("development runtime uses Windows virtual-environment executables without shell shims", () => {
  const plan = developmentRuntimePlan({
    repoRoot: "C:\\mauth",
    apiPort: 43123,
    webPort: 43124,
    platform: "win32",
    nodeExecutable: "C:\\mauth\\node_modules\\electron\\dist\\electron.exe",
  });

  assert.equal(plan.api.executable, path.join("C:\\mauth", "apps", "api", ".venv", "Scripts", "python.exe"));
  assert.equal(plan.web.executable, "C:\\mauth\\node_modules\\electron\\dist\\electron.exe");
  assert.equal(plan.web.env.ELECTRON_RUN_AS_NODE, "1");
});
