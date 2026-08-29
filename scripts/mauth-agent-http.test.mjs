import assert from "node:assert/strict";
import test from "node:test";

import { createMauthBridgeRequest } from "./mauth-agent-http.mjs";

function jsonResponse(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

test("bridge resolves the packaged runtime again for every MCP request", async () => {
  const runtimes = [
    { apiUrl: "http://127.0.0.1:41001", agentToken: "a".repeat(32) },
    { apiUrl: "http://127.0.0.1:41002", agentToken: "b".repeat(32) },
  ];
  const requests = [];
  const bridgeRequest = createMauthBridgeRequest({
    resolveRuntime: () => runtimes.shift(),
    fetchImpl: async (url, options) => {
      requests.push({ url, authorization: options.headers.Authorization });
      return jsonResponse(200, { success: true });
    },
  });

  await bridgeRequest("/api/agent/current/snapshot");
  await bridgeRequest("/api/agent/current/snapshot");

  assert.deepEqual(requests, [
    { url: "http://127.0.0.1:41001/api/agent/current/snapshot", authorization: `Bearer ${"a".repeat(32)}` },
    { url: "http://127.0.0.1:41002/api/agent/current/snapshot", authorization: `Bearer ${"b".repeat(32)}` },
  ]);
});

test("bridge retries once when the app relaunches during a request", async () => {
  const oldRuntime = { apiUrl: "http://127.0.0.1:41001", agentToken: "a".repeat(32) };
  const newRuntime = { apiUrl: "http://127.0.0.1:41002", agentToken: "b".repeat(32) };
  let runtimeRead = 0;
  const requests = [];
  const bridgeRequest = createMauthBridgeRequest({
    resolveRuntime: () => (runtimeRead++ === 0 ? oldRuntime : newRuntime),
    fetchImpl: async (url) => {
      requests.push(url);
      if (url.startsWith(oldRuntime.apiUrl)) throw new TypeError("fetch failed");
      return jsonResponse(200, { success: true, snapshotId: "snap_new" });
    },
  });

  const response = await bridgeRequest("/api/agent/current/snapshot");

  assert.equal(response.httpStatus, 200);
  assert.equal(response.snapshotId, "snap_new");
  assert.deepEqual(requests, ["http://127.0.0.1:41001/api/agent/current/snapshot", "http://127.0.0.1:41002/api/agent/current/snapshot"]);
});

test("bridge retries authentication when the per-launch token rotates", async () => {
  const oldRuntime = { apiUrl: "http://127.0.0.1:41001", agentToken: "a".repeat(32) };
  const newRuntime = { apiUrl: "http://127.0.0.1:41001", agentToken: "b".repeat(32) };
  let runtimeRead = 0;
  const authorizations = [];
  const bridgeRequest = createMauthBridgeRequest({
    resolveRuntime: () => (runtimeRead++ === 0 ? oldRuntime : newRuntime),
    fetchImpl: async (_url, options) => {
      authorizations.push(options.headers.Authorization);
      return authorizations.length === 1 ? jsonResponse(401, { code: "AGENT_AUTH_REQUIRED" }) : jsonResponse(200, { success: true });
    },
  });

  const response = await bridgeRequest("/api/agent/current/snapshot");

  assert.equal(response.httpStatus, 200);
  assert.deepEqual(authorizations, [`Bearer ${"a".repeat(32)}`, `Bearer ${"b".repeat(32)}`]);
});
