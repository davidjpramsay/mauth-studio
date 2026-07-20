#!/usr/bin/env node

import { agentAuthorizationHeaders, resolveMauthRuntime } from "./mauth-runtime.mjs";

const runtime = resolveMauthRuntime();
const API_BASE = runtime.apiUrl;
const AGENT_HEADERS = agentAuthorizationHeaders(runtime);
const args = new Set(process.argv.slice(2));
const mutateContent = args.has("--mutate-content");
const reviewState = args.has("--review");

function usage() {
  console.log(`Usage: pnpm smoke:agent-bridge [--mutate-content] [--review]

Checks the live Mauth local agent bridge:
  1. snapshot
  2. actions.preview
  3. actions.apply
  4. validation.run

Default mode applies document.validation.run, which does not mutate the document.
--mutate-content adds a visible text block after the first question-level module.
--review creates and reads a non-mutating comment and suggestion.`);
}

if (args.has("--help") || args.has("-h")) {
  usage();
  process.exit(0);
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...AGENT_HEADERS, ...options.headers },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

function fail(step, status, body) {
  console.error(`${step} failed with HTTP ${status}`);
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

function findQuestionModuleTarget(snapshot) {
  for (const question of snapshot.questions ?? []) {
    const module = (question.modules ?? []).find((candidate) => typeof candidate.id === "string");
    if (module) {
      return {
        scope: { kind: "question", questionId: question.id },
        placement: { blockId: module.id, position: "after" },
      };
    }
  }
  return null;
}

function smokeActions(snapshot) {
  if (!mutateContent) return [{ type: "document.validation.run" }];

  const target = findQuestionModuleTarget(snapshot);
  const blockId = `bridge-smoke-${Date.now()}`;
  const block = {
    id: blockId,
    kind: "text",
    text: `Bridge smoke content edit ${new Date().toISOString()}`,
    visibility: "always",
  };

  return [
    {
      type: "module.add",
      scope: target?.scope ?? { kind: "question", questionId: snapshot.questions?.[0]?.id },
      blocks: [block],
      ...(target?.placement ? { placement: target.placement } : {}),
    },
  ];
}

const snapshot = await request("/api/agent/current/snapshot");
if (!snapshot.response.ok) fail("snapshot", snapshot.response.status, snapshot.body);

const actions = smokeActions(snapshot.body);
const preview = await request("/api/agent/current/actions/preview", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ actions }),
});
if (!preview.response.ok || preview.body?.success !== true || preview.body?.result?.preview?.valid !== true) {
  fail("actions.preview", preview.response.status, preview.body);
}

const apply = await request("/api/agent/current/actions/apply", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": `agent-bridge-smoke-${Date.now()}`,
  },
  body: JSON.stringify({
    baseSnapshotId: snapshot.body.snapshotId,
    actions,
  }),
});
if (!apply.response.ok || apply.body?.success !== true) fail("actions.apply", apply.response.status, apply.body);

const validation = await request("/api/agent/current/validation/run", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
if (!validation.response.ok || validation.body?.success !== true) fail("validation.run", validation.response.status, validation.body);

let review = null;
if (reviewState) {
  const firstQuestion = snapshot.body.questions?.[0];
  const target = firstQuestion ? { kind: "question", questionId: firstQuestion.id } : { kind: "document" };
  const snapshotId = validation.body.snapshot?.snapshotId ?? snapshot.body.snapshotId;
  const comment = await request("/api/agent/current/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actor: "agent-bridge-smoke",
      body: `Bridge smoke review comment ${new Date().toISOString()}`,
      severity: "note",
      target,
      snapshotId,
    }),
  });
  if (!comment.response.ok || comment.body?.success !== true) fail("comments", comment.response.status, comment.body);

  const suggestion = await request("/api/agent/current/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actor: "agent-bridge-smoke",
      title: "Bridge smoke suggestion",
      body: "Review state smoke suggestion; no document mutation is applied.",
      target,
      snapshotId,
    }),
  });
  if (!suggestion.response.ok || suggestion.body?.success !== true) fail("suggestions", suggestion.response.status, suggestion.body);

  const comments = await request("/api/agent/current/comments?status=open");
  if (!comments.response.ok || comments.body?.success !== true) fail("comments.read", comments.response.status, comments.body);

  const suggestions = await request("/api/agent/current/suggestions?status=proposed");
  if (!suggestions.response.ok || suggestions.body?.success !== true) {
    fail("suggestions.read", suggestions.response.status, suggestions.body);
  }

  review = {
    commentId: comment.body.comment.id,
    suggestionId: suggestion.body.suggestion.id,
    openComments: comments.body.comments.length,
    proposedSuggestions: suggestions.body.suggestions.length,
  };
}

console.log(
  JSON.stringify(
    {
      success: true,
      apiBase: API_BASE,
      mutated: mutateContent,
      reviewState,
      baseSnapshotId: snapshot.body.snapshotId,
      nextSnapshotId: apply.body.snapshot?.snapshotId,
      questionCount: snapshot.body.questionCount,
      actionTypes: actions.map((action) => action.type),
      changedIds: apply.body.result?.changedIds ?? [],
      previewValid: preview.body.result.preview.valid,
      validationSnapshotId: validation.body.snapshot?.snapshotId,
      review,
    },
    null,
    2,
  ),
);
