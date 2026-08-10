import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("MCP connector publishes the complete local document and authoring contract", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(ROOT, "scripts", "mauth-agent-mcp.mjs")],
    env: { ...process.env, MAUTH_AGENT_API_URL: "http://127.0.0.1:9" },
    stderr: "pipe",
  });
  const client = new Client({ name: "mauth-agent-contract-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const result = await client.listTools();
    const tools = new Map(result.tools.map((tool) => [tool.name, tool]));
    assert.equal(tools.size, 16);
    for (const name of [
      "mauth_documents_list",
      "mauth_document_create",
      "mauth_document_open",
      "mauth_document_close",
      "mauth_snapshot",
      "mauth_actions_preview",
      "mauth_actions_apply",
      "mauth_validation_run",
    ]) {
      assert.equal(tools.has(name), true, `Missing tool ${name}`);
    }
    for (const [name, tool] of tools) {
      assert.equal(tool.outputSchema?.type, "object", `${name} must declare an object output schema`);
      assert.equal(tool.annotations?.openWorldHint, false, `${name} must remain local-only`);
    }
    assert.equal(tools.get("mauth_documents_list")?.annotations?.readOnlyHint, true);
    assert.equal(tools.get("mauth_document_create")?.annotations?.destructiveHint, false);
    assert.equal(tools.get("mauth_document_close")?.annotations?.destructiveHint, true);
  } finally {
    await client.close();
  }
});
