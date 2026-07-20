import assert from "node:assert/strict";
import test from "node:test";

import type { ContentBlock } from "@mauth-studio/shared";

import { moduleAnchorForScope, moduleDeletionAction, moduleInsertionPlan } from "./editorModuleLifecycle.ts";
import type { MauthContentScope } from "./mauthActions.ts";

function textBlock(id: string): ContentBlock {
  return { id, kind: "text", text: "Prompt" };
}

test("moduleAnchorForScope creates anchors for question, part, and subpart scopes", () => {
  assert.equal(moduleAnchorForScope({ kind: "question", questionId: "q1" }, "b1"), "q:q1/b:b1");
  assert.equal(moduleAnchorForScope({ kind: "part", questionId: "q1", partId: "p1" }, "b2"), "q:q1/p:p1/b:b2");
  assert.equal(moduleAnchorForScope({ kind: "subpart", questionId: "q1", partId: "p1", subpartId: "s1" }, "b3"), "q:q1/p:p1/s:s1/b:b3");
});

test("moduleInsertionPlan returns a module add action and focus anchor", () => {
  const scope: MauthContentScope = { kind: "part", questionId: "q1", partId: "p1" };
  const block = textBlock("text-1");

  assert.deepEqual(moduleInsertionPlan(scope, block), {
    action: { type: "module.add", scope, blocks: [block] },
    anchor: "q:q1/p:p1/b:text-1",
  });
});

test("moduleDeletionAction returns a module delete action for the scope", () => {
  const scope: MauthContentScope = { kind: "subpart", questionId: "q1", partId: "p1", subpartId: "s1" };

  assert.deepEqual(moduleDeletionAction(scope, "diagram-1"), {
    type: "module.delete",
    scope,
    blockId: "diagram-1",
  });
});
