import assert from "node:assert/strict";
import test from "node:test";

import {
  assistantContinuingToolStatusMessages,
  assistantFinalToolStateMessage,
  assistantTerminalToolStatusMessage,
  type MauthAssistantToolStatusMessage,
} from "./mauthAssistantToolResults.ts";

function messageText(message: MauthAssistantToolStatusMessage | null) {
  assert(message);
  return message.content;
}

test("assistant terminal tool status reports committed settings edits", () => {
  const message = assistantTerminalToolStatusMessage({
    callId: "call-1",
    name: "mauth_update_selected_settings",
    output: {
      ok: true,
      toolName: "mauth.settings.apply",
      message: "Updated the selected settings.",
      changedIds: ["d1"],
      committedDocument: true,
      postEditInspection: {
        target: { questionNumber: 1, blockId: "d1" },
        question: {
          questionNumber: 1,
          modules: [{ id: "d1", kind: "diagram", diagramType: "graph2d" }],
        },
      },
    },
  });

  assert.equal(message?.tone, "tool-success");
  assert.equal(message?.summary.state, "committed");
  assert.equal(message?.summary.committedDocument, true);
  assert.equal(message?.summary.commitLabel, "Yes");
  assert.equal(message?.summary.targetLabel, "Question 1 · Diagram · graph2d");
  assert.match(messageText(message), /`mauth\.settings\.apply` committed changes/);
  assert.match(messageText(message), /Updated the selected settings/);
});

test("assistant terminal tool status reports selected geometry primitive targets", () => {
  const message = assistantTerminalToolStatusMessage({
    callId: "call-1",
    name: "mauth_update_selected_settings",
    output: {
      ok: true,
      toolName: "mauth.settings.apply",
      message: "Updated the selected settings.",
      changedIds: ["g1"],
      committedDocument: true,
      postEditInspection: {
        target: { anchor: "q:q1/b:g1/gang:0", questionNumber: 1, blockId: "g1" },
        question: {
          questionNumber: 1,
          modules: [{ id: "g1", kind: "diagram", diagramType: "geometry2d" }],
          diagrams: [
            {
              id: "g1",
              anchor: "q:q1/b:g1",
              graphType: "geometry2d",
              summary: {
                renderer: "geometry2d",
                data: {
                  angles: [{ id: "AOB", points: ["A", "O", "B"], label: "$45^\\circ$" }],
                },
              },
            },
          ],
        },
      },
    },
  });

  assert.equal(message?.tone, "tool-success");
  assert.equal(message?.summary.targetLabel, "Question 1 · 2D diagram · Angle 1: AOB");
  assert.equal(message?.summary.state, "committed");
});

test("assistant terminal tool status prefers explicit target labels from local tools", () => {
  const message = assistantTerminalToolStatusMessage({
    callId: "call-1",
    name: "mauth_update_selected_settings",
    output: {
      ok: true,
      toolName: "mauth.settings.apply",
      message: "Updated the selected settings.",
      changedIds: ["g1"],
      committedDocument: true,
      targetLabel: "Question 2 · 2D diagram · Segment 1: OA",
    },
  });

  assert.equal(message?.summary.targetLabel, "Question 2 · 2D diagram · Segment 1: OA");
});

test("assistant continuing tool status reports failed preflight without a commit", () => {
  const [message] = assistantContinuingToolStatusMessages([
    {
      callId: "call-1",
      name: "mauth_update_selected_settings",
      output: {
        ok: false,
        toolName: "mauth.settings.apply",
        error: "Assistant diagram preflight failed.",
        changedIds: ["d1"],
        committedDocument: false,
      },
    },
  ]);

  assert.equal(message?.tone, "tool-error");
  assert.equal(message?.summary.state, "preflight-failed");
  assert.equal(message?.summary.committedDocument, false);
  assert.equal(message?.summary.commitLabel, "No");
  assert.match(message.content, /did not commit changes/);
  assert.match(message.content, /Assistant diagram preflight failed/);
});

test("assistant continuing tool status reports committed edits that need repair", () => {
  const [message] = assistantContinuingToolStatusMessages([
    {
      callId: "call-1",
      name: "mauth.author.addDiagram",
      output: {
        ok: false,
        toolName: "mauth.author.addDiagram",
        error: "Assistant post-edit inspection failed.",
        changedIds: ["d1"],
        committedDocument: true,
      },
    },
  ]);

  assert.equal(message?.tone, "tool-warning");
  assert.equal(message?.summary.state, "needs-repair");
  assert.equal(message?.summary.committedDocument, true);
  assert.equal(message?.summary.commitLabel, "Yes");
  assert.match(message.content, /committed changes, but needs repair/);
  assert.match(message.content, /post-edit inspection failed/i);
});

test("assistant continuing tool status reports semantic review requests", () => {
  const [message] = assistantContinuingToolStatusMessages([
    {
      callId: "call-1",
      name: "mauth.question.upsert",
      output: {
        ok: true,
        toolName: "mauth.question.upsert",
        message: "Updated the question.",
        changedIds: ["q1"],
        committedDocument: true,
        semanticReview: {
          required: true,
          checklist: ["Check graph2d functions against the source equation."],
        },
      },
    },
  ]);

  assert.equal(message?.tone, "tool-warning");
  assert.equal(message?.summary.state, "needs-review");
  assert.equal(message?.summary.committedDocument, true);
  assert.equal(message?.summary.commitLabel, "Yes");
  assert.match(message.content, /committed changes and requested review/);
  assert.match(message.content, /graph2d functions/);
});

test("assistant final tool state blocks provider completion after failed preflight", () => {
  const message = assistantFinalToolStateMessage([
    {
      callId: "call-1",
      name: "mauth_update_selected_settings",
      output: {
        ok: false,
        toolName: "mauth.settings.apply",
        error: "Assistant diagram preflight failed.",
        changedIds: ["d1"],
        committedDocument: false,
      },
    },
  ]);

  assert.equal(message?.tone, "tool-error");
  assert.equal(message?.summary.state, "preflight-failed");
  assert.equal(message?.summary.committedDocument, false);
  assert.match(messageText(message), /Final status/);
  assert.match(messageText(message), /did not apply that edit/);
  assert.match(messageText(message), /Assistant diagram preflight failed/);
});

test("assistant final tool state blocks provider completion after repair-required commit", () => {
  const message = assistantFinalToolStateMessage([
    {
      callId: "call-1",
      name: "mauth.author.addDiagram",
      output: {
        ok: false,
        toolName: "mauth.author.addDiagram",
        error: "Assistant post-edit inspection found repairable preview warnings.",
        changedIds: ["q1"],
        committedDocument: true,
      },
    },
  ]);

  assert.equal(message?.tone, "tool-warning");
  assert.equal(message?.summary.state, "needs-repair");
  assert.equal(message?.summary.committedDocument, true);
  assert.match(messageText(message), /Final status/);
  assert.match(messageText(message), /applied changes/);
  assert.match(messageText(message), /need repair/);
});

test("assistant final tool state blocks provider completion after semantic review request", () => {
  const message = assistantFinalToolStateMessage([
    {
      callId: "call-1",
      name: "mauth.question.upsert",
      output: {
        ok: true,
        toolName: "mauth.question.upsert",
        message: "Updated the question.",
        changedIds: ["q1"],
        committedDocument: true,
        semanticReview: {
          required: true,
          checklist: ["Check graph2d functions against the source equation."],
        },
      },
    },
  ]);

  assert.equal(message?.tone, "tool-warning");
  assert.equal(message?.summary.state, "needs-review");
  assert.equal(message?.summary.committedDocument, true);
  assert.match(messageText(message), /Final status/);
  assert.match(messageText(message), /need review/);
  assert.match(messageText(message), /source equation/);
});

test("assistant final tool state allows provider text when local outputs are complete", () => {
  const message = assistantFinalToolStateMessage([
    {
      callId: "call-1",
      name: "mauth_update_selected_settings",
      output: {
        ok: true,
        toolName: "mauth.settings.apply",
        message: "Updated the selected settings.",
        changedIds: ["d1"],
        committedDocument: true,
      },
    },
  ]);

  assert.equal(message, null);
});
