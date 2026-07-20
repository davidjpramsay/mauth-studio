import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  desktopRuntimeFile,
  isAllowedAppNavigation,
  removeOwnedRuntimeManifest,
  runtimeManifestRecord,
  writeRuntimeManifest,
} from "./runtime.mjs";

test("runtime manifest is private and removed only by its owning app", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mauth-desktop-runtime-"));
  const runtimePath = desktopRuntimeFile(root);
  const record = runtimeManifestRecord({
    appVersion: "0.1.0",
    appPid: 101,
    apiPid: 202,
    apiUrl: "http://127.0.0.1:43123",
    webUrl: "http://127.0.0.1:43123",
    executablePath: "/Applications/Mauth Studio.app/Contents/MacOS/Mauth Studio",
    packaged: true,
    agentToken: "test-agent-token-that-is-at-least-32-characters",
  });

  writeRuntimeManifest(runtimePath, record);
  assert.equal(fs.statSync(runtimePath).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(runtimePath, "utf8")).runtimeKind, "desktop-packaged");
  assert.equal(JSON.parse(fs.readFileSync(runtimePath, "utf8")).schemaVersion, 2);
  assert.equal(JSON.parse(fs.readFileSync(runtimePath, "utf8")).agentToken.length >= 32, true);

  removeOwnedRuntimeManifest(runtimePath, 999);
  assert.equal(fs.existsSync(runtimePath), true);
  removeOwnedRuntimeManifest(runtimePath, 101);
  assert.equal(fs.existsSync(runtimePath), false);
});

test("desktop navigation stays on the local app origin", () => {
  assert.equal(isAllowedAppNavigation("http://127.0.0.1:43123/agent-docs", "http://127.0.0.1:43123"), true);
  assert.equal(isAllowedAppNavigation("https://example.com", "http://127.0.0.1:43123"), false);
  assert.equal(isAllowedAppNavigation("not a URL", "http://127.0.0.1:43123"), false);
});
