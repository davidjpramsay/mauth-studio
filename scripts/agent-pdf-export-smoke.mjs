#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
};
const connector = option("--connector");
const output = option("--output");
const match = option("--title-contains");
const client = new Client({ name: "mauth-native-pdf-smoke", version: "1.0.0" });
const transport = new StdioClientTransport(
  connector
    ? { command: connector, args: [], stderr: "pipe" }
    : { command: process.execPath, args: [path.join(root, "scripts/mauth-agent-mcp.mjs")], stderr: "pipe" },
);
const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
  assert.equal(result.isError, undefined, JSON.stringify(result.structuredContent));
  assert.equal(result.structuredContent?.success, true, JSON.stringify(result.structuredContent));
  return result;
};
try {
  await client.connect(transport);
  const before = (await call("mauth_snapshot", {})).structuredContent;
  const tabs = before.openDocuments.filter((tab) => (match ? tab.title.includes(match) : tab.id === before.activeDocumentId));
  assert.ok(tabs.length, "No matching open documents.");
  const results = [];
  for (const tab of tabs)
    for (const copy of ["student", "solutions"]) {
      const args = {
        documentId: tab.id,
        copy,
        idempotencyKey: `smoke-pdf-${randomUUID()}`,
        ...(tab.id === before.activeDocumentId ? { baseSnapshotId: before.snapshotId } : {}),
      };
      const exported = (await call("mauth_pdf_export", args)).structuredContent;
      const repeated = (await call("mauth_pdf_export", args)).structuredContent;
      assert.equal(repeated.artifact.id, exported.artifact.id);
      const read = await call("mauth_pdf_read", { id: exported.artifact.id });
      const pdf = Buffer.from(read.content.find((item) => item.type === "resource").resource.blob, "base64");
      assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
      assert.equal(pdf.length, exported.artifact.bytes);
      assert.equal(createHash("sha256").update(pdf).digest("hex"), exported.artifact.sha256);
      const resource = await client.readResource({ uri: exported.artifact.uri });
      assert.equal(resource.contents[0].blob, pdf.toString("base64"));
      if (output) {
        await fs.mkdir(output, { recursive: true });
        await fs.writeFile(path.join(output, exported.artifact.filename), pdf);
      }
      results.push(exported);
      console.log(
        `PASS ${tab.title}: ${copy}, ${exported.artifact.pages} pages, ${pdf.length} bytes, revision ${exported.source.revision}`,
      );
    }
  const after = (await call("mauth_snapshot", {})).structuredContent;
  assert.equal(after.snapshotId, before.snapshotId);
  assert.equal(after.activeDocumentId, before.activeDocumentId);
  assert.deepEqual(after.openDocuments, before.openDocuments);
  if (output) await fs.writeFile(path.join(output, "mcp-export-evidence.json"), JSON.stringify({ before, results, after }, null, 2));
  console.log(`PASS ${results.length} native PDF exports and MCP resource reads; document state unchanged.`);
} finally {
  await client.close();
}
