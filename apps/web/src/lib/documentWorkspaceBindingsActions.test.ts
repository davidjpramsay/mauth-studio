import assert from "node:assert/strict";
import test from "node:test";

import { documentWorkspaceSolutionCopyHandler, documentWorkspaceVoidAction } from "./documentWorkspaceBindings.ts";

test("workspace solution-copy bindings are present only for supported document types", () => {
  const handler = (anchor: string) => anchor;

  assert.equal(documentWorkspaceSolutionCopyHandler(true, handler), handler);
  assert.equal(documentWorkspaceSolutionCopyHandler(false, handler), undefined);
});

test("workspace void actions preserve the owning async controller command", async () => {
  const events: string[] = [];
  let releaseAction: (() => void) | undefined;
  const actionComplete = new Promise<void>((resolve) => {
    releaseAction = resolve;
  });
  const handler = documentWorkspaceVoidAction(async () => {
    events.push("started");
    await actionComplete;
    events.push("completed");
  });

  assert.equal(handler(), undefined);
  assert.deepEqual(events, ["started"]);

  releaseAction?.();
  await actionComplete;
  await Promise.resolve();
  assert.deepEqual(events, ["started", "completed"]);
});
