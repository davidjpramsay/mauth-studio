#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

const API_BASE = (process.env.MAUTH_AGENT_API_URL || process.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

const actionSchema = z.array(z.record(z.string(), z.unknown()));
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

function parseResponseBody(text) {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function asStructuredBody(status, body, extra = {}) {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return { httpStatus: status, ...extra, ...body };
  }
  return { httpStatus: status, ...extra, body };
}

async function bridgeRequest(path, { method = "GET", body, headers = {} } = {}) {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json", ...headers } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const parsedBody = parseResponseBody(await response.text());
    return asStructuredBody(response.status, parsedBody);
  } catch (error) {
    return {
      httpStatus: 0,
      success: false,
      code: "APP_NOT_CONNECTED",
      error: error instanceof Error ? error.message : "Could not reach the Mauth API bridge.",
      setupLink: "/agent-docs",
    };
  }
}

function toolResult(output) {
  const text = JSON.stringify(output, null, 2);
  return {
    content: [{ type: "text", text }],
    structuredContent: output,
  };
}

const server = new McpServer({
  name: "mauth-local-agent-bridge",
  version: "0.1.0",
});

server.registerTool(
  "mauth_snapshot",
  {
    title: "Mauth Snapshot",
    description: "Read the live Mauth editor snapshot through the local HTTP bridge.",
    inputSchema: z.object({}),
  },
  async () => toolResult(await bridgeRequest("/api/agent/current/snapshot")),
);

server.registerTool(
  "mauth_actions_preview",
  {
    title: "Mauth Actions Preview",
    description: "Dry-run a batch of Mauth document actions against the live editor.",
    inputSchema: z.object({
      actions: actionSchema.describe("MauthDocumentAction array to dry-run."),
    }),
  },
  async ({ actions }) =>
    toolResult(
      await bridgeRequest("/api/agent/current/actions/preview", {
        method: "POST",
        body: { actions },
      }),
    ),
);

server.registerTool(
  "mauth_actions_apply",
  {
    title: "Mauth Actions Apply",
    description: "Apply a validated Mauth document action batch to the live editor and active project file.",
    inputSchema: z.object({
      baseSnapshotId: z.string().describe("Snapshot id from mauth_snapshot or preview response."),
      actions: actionSchema.describe("MauthDocumentAction array to apply."),
      idempotencyKey: z.string().optional().describe("Stable idempotency key for retrying the same apply request."),
    }),
  },
  async ({ baseSnapshotId, actions, idempotencyKey }) => {
    const key = idempotencyKey || `mcp_apply_${randomUUID()}`;
    const response = await bridgeRequest("/api/agent/current/actions/apply", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: { baseSnapshotId, actions },
    });
    return toolResult(asStructuredBody(response.httpStatus, response, { idempotencyKey: key }));
  },
);

server.registerTool(
  "mauth_validation_run",
  {
    title: "Mauth Validation Run",
    description: "Run deterministic validation against the live Mauth editor document.",
    inputSchema: z.object({}),
  },
  async () =>
    toolResult(
      await bridgeRequest("/api/agent/current/validation/run", {
        method: "POST",
        body: {},
      }),
    ),
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

const transport = new StdioServerTransport();
await server.connect(transport);
