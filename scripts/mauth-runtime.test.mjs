import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { agentAuthorizationHeaders, defaultDesktopRuntimeFile, resolveMauthRuntime } from "./mauth-runtime.mjs";

test("runtime resolution prefers explicit environment URLs", () => {
  assert.deepEqual(resolveMauthRuntime({ MAUTH_AGENT_API_URL: "http://127.0.0.1:9010", MAUTH_WEB_URL: "http://localhost:9010" }), {
    apiUrl: "http://127.0.0.1:9010",
    webUrl: "http://localhost:9010",
    source: "environment",
    runtimeFile: null,
    agentToken: null,
  });
});

test("runtime resolution discovers a live packaged desktop app", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mauth-runtime-home-"));
  const runtimeFile = defaultDesktopRuntimeFile(home);
  fs.mkdirSync(path.dirname(runtimeFile), { recursive: true });
  fs.writeFileSync(
    runtimeFile,
    JSON.stringify({
      schemaVersion: 2,
      runtimeKind: "desktop-packaged",
      appPid: process.pid,
      apiPid: process.pid,
      apiUrl: "http://127.0.0.1:43123",
      webUrl: "http://127.0.0.1:43123",
      agentToken: "packaged-agent-token-that-is-at-least-32-characters",
    }),
  );

  assert.deepEqual(resolveMauthRuntime({}, home), {
    apiUrl: "http://127.0.0.1:43123",
    webUrl: "http://127.0.0.1:43123",
    source: "desktop-packaged",
    runtimeFile,
    agentToken: "packaged-agent-token-that-is-at-least-32-characters",
  });
  assert.deepEqual(agentAuthorizationHeaders(resolveMauthRuntime({}, home)), {
    Authorization: "Bearer packaged-agent-token-that-is-at-least-32-characters",
  });
});

test("runtime resolution ignores stale and non-local manifests", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mauth-runtime-stale-"));
  const runtimeFile = defaultDesktopRuntimeFile(home);
  fs.mkdirSync(path.dirname(runtimeFile), { recursive: true });
  fs.writeFileSync(
    runtimeFile,
    JSON.stringify({
      schemaVersion: 1,
      runtimeKind: "desktop-packaged",
      appPid: 999_999_999,
      apiUrl: "https://example.com",
      webUrl: "https://example.com",
    }),
  );

  assert.equal(resolveMauthRuntime({}, home).source, "development-default");
});

test("runtime resolution accepts an explicit bridge token", () => {
  const runtime = resolveMauthRuntime({
    MAUTH_AGENT_API_URL: "http://127.0.0.1:9010",
    MAUTH_AGENT_TOKEN: "explicit-agent-token-that-is-at-least-32-characters",
  });
  assert.equal(runtime.agentToken, "explicit-agent-token-that-is-at-least-32-characters");
  assert.deepEqual(agentAuthorizationHeaders(runtime), {
    Authorization: "Bearer explicit-agent-token-that-is-at-least-32-characters",
  });
});
