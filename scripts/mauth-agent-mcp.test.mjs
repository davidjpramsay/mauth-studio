import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { actionCatalog, actionSchema, actionTypes, ACTION_CATALOG_URI, projectSnapshot } from "./mauth-action-contract.mjs";

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
    const resources = await client.listResources();
    assert.ok(resources.resources.some((resource) => resource.uri === ACTION_CATALOG_URI));
    const catalog = await client.readResource({ uri: ACTION_CATALOG_URI });
    assert.equal(JSON.parse(catalog.contents[0].text).version, 1);
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
    assert.match(
      tools.get("mauth_actions_apply")?.inputSchema?.properties?.actions?.description ?? "",
      /main stem.*question\.update\.patch\.text.*Question wording/i,
    );
  } finally {
    await client.close();
  }
});

test("action envelopes track every live editor action and validate examples", () => {
  const source = readFileSync(path.join(ROOT, "apps/web/src/lib/mauthActions.ts"), "utf8");
  const start = source.indexOf("export const MAUTH_CONTENT_ACTION_TYPES");
  const end = source.indexOf("export const MAUTH_DOCUMENT_ACTION_TYPES", start);
  const names = [...source.slice(start, end).matchAll(/"([A-Za-z]+(?:\.[A-Za-z]+)+)"/g)].map((match) => match[1]);
  assert.deepEqual([...actionTypes].sort(), [...names].sort());
  for (const example of actionCatalog.examples) assert.equal(actionSchema.safeParse([example]).success, true);
  assert.equal(actionSchema.safeParse([{ type: "question.update", patch: {} }]).success, false);
  assert.equal(actionSchema.safeParse([{ type: "unknown.action" }]).success, false);
  assert.equal(actionSchema.safeParse([{ type: "marks.update", target: { kind: "part", questionId: "q" }, marks: 1 }]).success, false);
});

test("scoped snapshots preserve preconditions, tab state and storage errors", () => {
  const snapshot = {
    httpStatus: 200,
    snapshotId: "current",
    mutationBase: { snapshotId: "current" },
    activeDocumentId: "tab1",
    openDocuments: [{ id: "tab1", dirty: true }],
    questionCount: 2,
    questions: [{ id: "q1" }, { id: "q2" }],
  };
  const scoped = projectSnapshot(snapshot, "q2");
  assert.deepEqual(scoped.questions, [{ id: "q2" }]);
  assert.equal(scoped.mutationBase, snapshot.mutationBase);
  assert.equal(scoped.openDocuments, snapshot.openDocuments);
  assert.equal(projectSnapshot(snapshot, "missing").httpStatus, 404);
  const unavailable = { httpStatus: 503, code: "STORAGE_UNAVAILABLE" };
  assert.equal(projectSnapshot(unavailable, "q2"), unavailable);
});
