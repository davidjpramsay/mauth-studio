import assert from "node:assert/strict";
import test from "node:test";

import { isRuntimeApiRequest } from "./local-api-auth.mjs";

test("runtime API auth remains scoped to API paths on the exact active origins", () => {
  const origins = new Set(["http://127.0.0.1:62161", "http://127.0.0.1:5173"]);

  assert.equal(isRuntimeApiRequest("http://127.0.0.1:62161/api/storage/tests", origins), true);
  assert.equal(isRuntimeApiRequest("http://127.0.0.1:5173/api/agent/current/browser/register", origins), true);
  assert.equal(isRuntimeApiRequest("http://127.0.0.1:62161/agent-docs", origins), false);
  assert.equal(isRuntimeApiRequest("http://127.0.0.1:7000/api/storage/tests", origins), false);
  assert.equal(isRuntimeApiRequest("https://example.com/api/storage/tests", origins), false);
});
