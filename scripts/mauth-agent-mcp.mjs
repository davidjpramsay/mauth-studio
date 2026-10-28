#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

import { asStructuredBody, createMauthBridgeRequest } from "./mauth-agent-http.mjs";
import { actionSchema, actionCatalog, ACTION_CATALOG_URI, projectSnapshot } from "./mauth-action-contract.mjs";
import { DIAGRAM_FEATURES, DIAGRAM_PURPOSES, DIAGRAM_RELATIONSHIPS } from "../packages/shared/src/diagramCapabilities.ts";
import { DIAGRAM_TOOLS, DIAGRAM_TOOLS_URI, diagramToolGuide } from "../packages/shared/src/diagramTools.ts";

const CONNECTOR_VERSION = typeof __MAUTH_CONNECTOR_VERSION__ === "string" ? __MAUTH_CONNECTOR_VERSION__ : "development";

if (process.argv.includes("--version")) {
  console.log(`Mauth Agent Connector ${CONNECTOR_VERSION}`);
  process.exit(0);
}

const actionAuthoringDescription =
  "MauthDocumentAction array. Before adding/replacing diagrams, call mauth_diagram_tools with purpose and requirements for relationships, exact positions, teacher controls, label dragging and solution annotations; inspect support, alternatives, uncertainty and required verification. Inspect snapshot diagramWarnings in the dry run. For ordinary tests, exams, and worksheets, put the main stem in question.add.question.text or question.update.patch.text (Question wording); reserve text modules for deliberately ordered additional prose or special blocks such as End of Test.";
const bridgeOutputSchema = z
  .object({
    httpStatus: z.number(),
    success: z.boolean().optional(),
    code: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();
const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const nonDestructiveWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
const idempotentWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const reviewTargetSchema = z
  .object({
    kind: z.enum(["document", "question", "part", "subpart", "module", "textRange"]),
    questionId: z.string().optional(),
    partId: z.string().optional(),
    subpartId: z.string().optional(),
    blockId: z.string().optional(),
    start: z.number().int().nonnegative().optional(),
    end: z.number().int().nonnegative().optional(),
    label: z.string().optional(),
  })
  .optional();

const diagramRequirementsSchema = z
  .object({
    purpose: z.enum(DIAGRAM_PURPOSES).optional(),
    requiredFeatures: z.array(z.enum(DIAGRAM_FEATURES)).optional(),
    relationships: z.array(z.enum(DIAGRAM_RELATIONSHIPS)).optional(),
    relationshipMode: z
      .enum(["constrained", "fixed"])
      .optional()
      .describe("Constrained means native layout constraints; fixed means relationships verified from supplied coordinates."),
    exactPositioning: z.boolean().optional(),
    sourceFidelity: z.boolean().optional(),
    draggableLabels: z.boolean().optional(),
    teacherControls: z.enum(["structured", "advanced", "either"]).optional(),
    solutionAnnotations: z.enum(["elements", "paired", "either"]).optional(),
    otherRequirements: z
      .array(z.string())
      .optional()
      .describe("Requirements outside the known feature set. These remain unassessed and prevent certification."),
  })
  .strict()
  .optional();

const bridgeRequest = createMauthBridgeRequest();

function toolResult(output) {
  const text = JSON.stringify(output, null, 2);
  return {
    content: [{ type: "text", text }],
    structuredContent: output,
    ...(output.httpStatus === 0 || output.httpStatus >= 400 ? { isError: true } : {}),
  };
}

const server = new McpServer({
  name: "mauth-local-agent-bridge",
  version: CONNECTOR_VERSION,
});

server.registerResource(
  "mauth-action-catalog",
  ACTION_CATALOG_URI,
  {
    mimeType: "application/json",
    description: "Versioned Mauth action catalog, input schemas, authoring workflow and examples. Read before constructing an edit batch.",
  },
  async () => ({ contents: [{ uri: ACTION_CATALOG_URI, mimeType: "application/json", text: JSON.stringify(actionCatalog) }] }),
);

server.registerResource(
  "mauth-diagram-tools",
  DIAGRAM_TOOLS_URI,
  { mimeType: "application/json", description: "Diagram tool ids, engines, mathematical purposes and native graphConfig examples." },
  async () => ({ contents: [{ uri: DIAGRAM_TOOLS_URI, mimeType: "application/json", text: JSON.stringify(diagramToolGuide()) }] }),
);

server.registerTool(
  "mauth_diagram_tools",
  {
    title: "Choose Mauth Diagram Tool",
    description:
      "Read before creating or replacing a diagram. Assess mathematical relationships, exact positioning, teacher controls, draggable labels and solution annotations against Mauth capabilities. Return eligible alternatives, uncertainty, unsupported combinations, native examples and required construction/layout checks. Read-only; works offline.",
    inputSchema: z.object({
      intent: z
        .string()
        .default("")
        .describe("Describe this diagram's mathematical purpose or provide its question wording. Omit to list all tools."),
      renderer: z
        .enum(DIAGRAM_TOOLS.map((tool) => tool.id))
        .optional()
        .describe("Optional tool id to inspect; does not override the recommendation or change the document."),
      requirements: diagramRequirementsSchema,
      advancedSubstance: z
        .boolean()
        .default(false)
        .describe(
          "True when assessing an existing custom Penrose Substance construction; normal point/segment controls and element solutions cannot edit that source.",
        ),
      coordinateFidelity: z
        .boolean()
        .default(false)
        .describe("True only when a geometry source must retain exact coordinates/positions rather than automatic relationship layout."),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: readOnlyAnnotations,
  },
  async ({ intent, renderer, coordinateFidelity, requirements, advancedSubstance }) =>
    toolResult({
      httpStatus: 200,
      success: true,
      ...diagramToolGuide(intent, renderer, coordinateFidelity, requirements, advancedSubstance),
    }),
);

server.registerTool(
  "mauth_snapshot",
  {
    title: "Mauth Snapshot",
    description:
      "Read the live Mauth editor snapshot, including current diagram tools, recommendations and mismatch warnings. Optionally restrict question summaries while retaining the document-wide mutation base and tab state.",
    inputSchema: z.object({
      documentId: z.string().optional().describe("Open document id from a previous snapshot. Omit for the active tab."),
      questionId: z
        .string()
        .optional()
        .describe(
          "Return only this question summary; ids come from an unfiltered snapshot. Does not change the mutation base or activate another tab.",
        ),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: readOnlyAnnotations,
  },
  async ({ documentId, questionId }) =>
    toolResult(
      projectSnapshot(
        await bridgeRequest(`/api/agent/current/snapshot${documentId ? `?documentId=${encodeURIComponent(documentId)}` : ""}`),
        questionId,
      ),
    ),
);

server.registerTool(
  "mauth_actions_preview",
  {
    title: "Mauth Actions Preview",
    description: `Dry-run a batch of Mauth document actions against the live editor. Inspect returned snapshot diagramWarnings and recommendations before applying. For diagram construction, first call mauth_diagram_tools. Action reference: ${ACTION_CATALOG_URI}.`,
    inputSchema: z.object({
      documentId: z.string().optional().describe("Open document id to activate before previewing."),
      actions: actionSchema.describe(`${actionAuthoringDescription} This batch is dry-run only.`),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: readOnlyAnnotations,
  },
  async ({ documentId, actions }) =>
    toolResult(
      await bridgeRequest("/api/agent/current/actions/preview", {
        method: "POST",
        body: { documentId, actions },
      }),
    ),
);

server.registerTool(
  "mauth_actions_apply",
  {
    title: "Mauth Actions Apply",
    description: "Apply a validated Mauth document action batch to the live editor and active project file.",
    inputSchema: z.object({
      documentId: z.string().optional().describe("Open document id to activate before applying."),
      baseSnapshotId: z.string().describe("Snapshot id from mauth_snapshot or preview response."),
      actions: actionSchema.describe(`${actionAuthoringDescription} This batch is applied and revision-saved.`),
      idempotencyKey: z.string().optional().describe("Stable idempotency key for retrying the same apply request."),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: idempotentWriteAnnotations,
  },
  async ({ documentId, baseSnapshotId, actions, idempotencyKey }) => {
    const key = idempotencyKey || `mcp_apply_${randomUUID()}`;
    const response = await bridgeRequest("/api/agent/current/actions/apply", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: { documentId, baseSnapshotId, actions },
    });
    return toolResult(asStructuredBody(response.httpStatus, response, { idempotencyKey: key }));
  },
);

server.registerTool(
  "mauth_validation_run",
  {
    title: "Mauth Validation Run",
    description: "Run deterministic validation against the live Mauth editor document.",
    inputSchema: z.object({
      documentId: z.string().optional().describe("Open document id to activate before validating."),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: readOnlyAnnotations,
  },
  async ({ documentId }) =>
    toolResult(
      await bridgeRequest("/api/agent/current/validation/run", {
        method: "POST",
        body: { documentId },
      }),
    ),
);

server.registerTool(
  "mauth_diagrams_inspect",
  {
    title: "Inspect Mauth Diagrams",
    description:
      "Read-only checks on existing diagram blocks: native schema/semantic validation, requested capability support, and available current-preview render/label measurements. Reports missing renders and partial coverage explicitly. Run after edits and in both Student/Solutions copies; general mathematical correctness and visual page review remain required.",
    inputSchema: z.object({
      documentId: z.string().optional(),
      blockId: z.string().optional().describe("Omit to inspect all question diagrams, including nested blocks."),
      requirements: diagramRequirementsSchema,
    }),
    outputSchema: bridgeOutputSchema,
    annotations: readOnlyAnnotations,
  },
  async ({ documentId, blockId, requirements }) =>
    toolResult(
      await bridgeRequest("/api/agent/current/validation/run", {
        method: "POST",
        body: { documentId, inspectDiagrams: true, blockId, requirements },
      }),
    ),
);

server.registerTool(
  "mauth_documents_list",
  {
    title: "List Mauth Documents",
    description: "List saved Mauth documents in the teacher-selected documents folder, including open-tab and revision state.",
    inputSchema: z.object({
      folderPath: z.string().optional().describe("Optional folder relative to the selected Mauth documents folder."),
      recursive: z.boolean().default(true).describe("Include documents in nested folders."),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: readOnlyAnnotations,
  },
  async ({ folderPath, recursive }) => {
    const query = new URLSearchParams({ recursive: String(recursive) });
    if (folderPath) query.set("folderPath", folderPath);
    return toolResult(await bridgeRequest(`/api/agent/current/documents?${query.toString()}`));
  },
);

server.registerTool(
  "mauth_document_create",
  {
    title: "Create Mauth Document",
    description: "Create, revision-save, and open a blank Mauth document in the selected documents folder using a Mauth template.",
    inputSchema: z.object({
      title: z.string().min(1).describe("Document title and default file name."),
      template: z.enum(["standard", "exam", "worksheet", "notes", "investigation"]).default("standard"),
      folderPath: z.string().optional().describe("Optional folder relative to the selected Mauth documents folder."),
      onConflict: z.enum(["error", "unique"]).default("error").describe("Fail or choose a unique file name if the path exists."),
      idempotencyKey: z.string().optional().describe("Stable key for retrying the same create request."),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: nonDestructiveWriteAnnotations,
  },
  async ({ title, template, folderPath, onConflict, idempotencyKey }) => {
    const key = idempotencyKey || `mcp_create_${randomUUID()}`;
    const response = await bridgeRequest("/api/agent/current/documents/create", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: { title, template, folderPath, onConflict },
    });
    return toolResult(asStructuredBody(response.httpStatus, response, { idempotencyKey: key }));
  },
);

server.registerTool(
  "mauth_document_open",
  {
    title: "Open Mauth Document",
    description: "Open or activate a saved Mauth document tab by its path from mauth_documents_list.",
    inputSchema: z.object({
      path: z.string().min(1).describe("Document path relative to the selected Mauth documents folder."),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: idempotentWriteAnnotations,
  },
  async ({ path }) =>
    toolResult(
      await bridgeRequest("/api/agent/current/documents/open", {
        method: "POST",
        body: { path },
      }),
    ),
);

server.registerTool(
  "mauth_document_close",
  {
    title: "Close Mauth Document",
    description: "Close an open Mauth tab with an explicit non-interactive save policy. The default refuses to close dirty documents.",
    inputSchema: z.object({
      documentId: z.string().optional().describe("Open document id. Omit to target the active tab."),
      policy: z.enum(["require-clean", "save", "discard"]).default("require-clean"),
      idempotencyKey: z.string().optional().describe("Stable key for retrying the same close request."),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ documentId, policy, idempotencyKey }) => {
    const key = idempotencyKey || `mcp_close_${randomUUID()}`;
    const response = await bridgeRequest("/api/agent/current/documents/close", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: { documentId, policy },
    });
    return toolResult(asStructuredBody(response.httpStatus, response, { idempotencyKey: key }));
  },
);

server.registerTool(
  "mauth_presence_set",
  {
    title: "Mauth Presence Set",
    description: "Record local agent presence in the Mauth bridge event log.",
    inputSchema: z.object({
      agentId: z.string().optional(),
      name: z.string().optional(),
      status: z.string().default("active"),
      details: z.string().optional(),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: nonDestructiveWriteAnnotations,
  },
  async ({ agentId, name, status, details }) =>
    toolResult(
      await bridgeRequest("/api/agent/current/presence", {
        method: "POST",
        body: { agentId, name, status, details },
      }),
    ),
);

server.registerTool(
  "mauth_events_read",
  {
    title: "Mauth Events Read",
    description: "Read Mauth bridge events after an event id.",
    inputSchema: z.object({
      after: z.number().int().nonnegative().default(0),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: readOnlyAnnotations,
  },
  async ({ after }) => toolResult(await bridgeRequest(`/api/agent/current/events?after=${encodeURIComponent(String(after))}`)),
);

server.registerTool(
  "mauth_comments_read",
  {
    title: "Mauth Comments Read",
    description: "Read local agent review comments for the active Mauth document.",
    inputSchema: z.object({
      status: z.enum(["open", "resolved"]).optional(),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: readOnlyAnnotations,
  },
  async ({ status }) =>
    toolResult(await bridgeRequest(`/api/agent/current/comments${status ? `?status=${encodeURIComponent(status)}` : ""}`)),
);

server.registerTool(
  "mauth_comment_create",
  {
    title: "Mauth Comment Create",
    description: "Create a non-mutating review comment for the active Mauth document.",
    inputSchema: z.object({
      actor: z.string().optional(),
      body: z.string(),
      severity: z.enum(["note", "warning", "error"]).default("note"),
      target: reviewTargetSchema,
      snapshotId: z.string().optional(),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: nonDestructiveWriteAnnotations,
  },
  async ({ actor, body, severity, target, snapshotId }) =>
    toolResult(
      await bridgeRequest("/api/agent/current/comments", {
        method: "POST",
        body: { actor, body, severity, target, snapshotId },
      }),
    ),
);

server.registerTool(
  "mauth_comment_resolve",
  {
    title: "Mauth Comment Resolve",
    description: "Mark a local Mauth review comment as resolved.",
    inputSchema: z.object({
      commentId: z.string(),
      actor: z.string().optional(),
      details: z.string().optional(),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: idempotentWriteAnnotations,
  },
  async ({ commentId, actor, details }) =>
    toolResult(
      await bridgeRequest(`/api/agent/current/comments/${encodeURIComponent(commentId)}/resolve`, {
        method: "POST",
        body: { actor, details },
      }),
    ),
);

server.registerTool(
  "mauth_suggestions_read",
  {
    title: "Mauth Suggestions Read",
    description: "Read local agent suggestions for the active Mauth document.",
    inputSchema: z.object({
      status: z.enum(["proposed", "accepted", "rejected"]).optional(),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: readOnlyAnnotations,
  },
  async ({ status }) =>
    toolResult(await bridgeRequest(`/api/agent/current/suggestions${status ? `?status=${encodeURIComponent(status)}` : ""}`)),
);

server.registerTool(
  "mauth_suggestion_create",
  {
    title: "Mauth Suggestion Create",
    description: "Create a non-mutating suggestion for the active Mauth document.",
    inputSchema: z.object({
      actor: z.string().optional(),
      title: z.string().optional(),
      body: z.string(),
      target: reviewTargetSchema,
      actions: actionSchema.optional(),
      replacementText: z.string().optional(),
      snapshotId: z.string().optional(),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: nonDestructiveWriteAnnotations,
  },
  async ({ actor, title, body, target, actions, replacementText, snapshotId }) =>
    toolResult(
      await bridgeRequest("/api/agent/current/suggestions", {
        method: "POST",
        body: { actor, title, body, target, actions, replacementText, snapshotId },
      }),
    ),
);

server.registerTool(
  "mauth_suggestion_mark",
  {
    title: "Mauth Suggestion Mark",
    description: "Mark a local Mauth suggestion as accepted or rejected without applying its actions.",
    inputSchema: z.object({
      suggestionId: z.string(),
      status: z.enum(["accepted", "rejected"]),
      actor: z.string().optional(),
      details: z.string().optional(),
    }),
    outputSchema: bridgeOutputSchema,
    annotations: idempotentWriteAnnotations,
  },
  async ({ suggestionId, status, actor, details }) =>
    toolResult(
      await bridgeRequest(
        `/api/agent/current/suggestions/${encodeURIComponent(suggestionId)}/${status === "accepted" ? "accept" : "reject"}`,
        {
          method: "POST",
          body: { actor, details },
        },
      ),
    ),
);

if (process.argv.includes("--doctor")) {
  const result = await bridgeRequest("/api/system/status");
  if (result.httpStatus !== 200) {
    console.error(`Mauth Agent Connector could not reach Mauth Studio (${result.httpStatus || "not connected"}).`);
    process.exit(1);
  }
  console.log(`Mauth Agent Connector ${CONNECTOR_VERSION} is connected to ${runtime.source} at ${runtime.apiUrl}.`);
} else {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
