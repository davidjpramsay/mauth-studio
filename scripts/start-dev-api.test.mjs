import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("fixed-port API refuses to launch without an explicit authentication configuration", () => {
  const env = { ...process.env };
  delete env.MAUTH_AGENT_TOKEN;
  delete env.MAUTH_UNSAFE_ALLOW_UNAUTHENTICATED;
  const result = spawnSync(process.execPath, ["scripts/start-dev-api.mjs"], { encoding: "utf8", env });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires an API token/);
});
