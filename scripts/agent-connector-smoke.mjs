#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const connectorArgumentIndex = process.argv.indexOf("--connector");
const connectorPath = connectorArgumentIndex >= 0 ? process.argv[connectorArgumentIndex + 1] : null;
if (connectorArgumentIndex >= 0 && !connectorPath) throw new Error("--connector requires an executable path.");

const transport = new StdioClientTransport(
  connectorPath
    ? { command: connectorPath, args: [], stderr: "pipe" }
    : {
        command: process.execPath,
        args: [path.join(ROOT, "tmp", "macos", "mauth-agent", "mauth-agent-mcp.mjs")],
        stderr: "pipe",
      },
);
const client = new Client({ name: "mauth-agent-connector-smoke", version: "1.0.0" });

try {
  await client.connect(transport);
  const tools = await client.listTools(undefined, { signal: AbortSignal.timeout(10_000) });
  const toolNames = new Set(tools.tools.map((tool) => tool.name));
  for (const expected of [
    "mauth_snapshot",
    "mauth_actions_preview",
    "mauth_actions_apply",
    "mauth_validation_run",
    "mauth_documents_list",
    "mauth_document_create",
    "mauth_document_open",
    "mauth_document_close",
  ]) {
    assert.equal(toolNames.has(expected), true, `Missing MCP tool: ${expected}`);
  }
  for (const tool of tools.tools) {
    assert.equal(tool.outputSchema?.type, "object", `Missing MCP output schema: ${tool.name}`);
    assert.equal(tool.annotations?.openWorldHint, false, `MCP tool must remain local-only: ${tool.name}`);
  }

  const snapshot = await client.callTool({ name: "mauth_snapshot", arguments: {} }, undefined, {
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(snapshot.structuredContent?.httpStatus, 200, JSON.stringify(snapshot.structuredContent));
  assert.equal(snapshot.structuredContent?.success, true, JSON.stringify(snapshot.structuredContent));
  const documents = await client.callTool({ name: "mauth_documents_list", arguments: {} }, undefined, {
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(documents.structuredContent?.httpStatus, 200, JSON.stringify(documents.structuredContent));
  assert.equal(documents.structuredContent?.success, true, JSON.stringify(documents.structuredContent));
  console.log(`Mauth Agent Connector MCP smoke passed (${tools.tools.length} tools; live snapshot connected).`);
} finally {
  await client.close();
}
