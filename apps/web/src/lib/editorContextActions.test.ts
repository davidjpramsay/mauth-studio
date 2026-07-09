import assert from "node:assert/strict";
import test from "node:test";

import { editorContextActionDescriptors } from "./editorContextActions.ts";

test("editorContextActionDescriptors always includes copy reference first", () => {
  assert.deepEqual(
    editorContextActionDescriptors({
      canMoveUp: false,
      canMoveDown: false,
      canDuplicate: false,
      canCreateSolutionCopy: false,
      canDelete: false,
    }),
    [{ id: "copy-reference", label: "Copy agent reference" }],
  );
});

test("editorContextActionDescriptors orders editor actions predictably", () => {
  assert.deepEqual(
    editorContextActionDescriptors({
      canMoveUp: true,
      canMoveDown: true,
      canDuplicate: true,
      canCreateSolutionCopy: true,
      canDelete: true,
    }),
    [
      { id: "copy-reference", label: "Copy agent reference" },
      { id: "move-up", label: "Move up" },
      { id: "move-down", label: "Move down" },
      { id: "duplicate", label: "Duplicate" },
      { id: "copy-to-solutions", label: "Copy to solutions" },
      { id: "delete", label: "Delete", destructive: true },
    ],
  );
});

test("editorContextActionDescriptors only exposes enabled actions", () => {
  assert.deepEqual(
    editorContextActionDescriptors({
      canMoveUp: false,
      canMoveDown: true,
      canDuplicate: false,
      canCreateSolutionCopy: true,
      canDelete: false,
    }).map((action) => action.id),
    ["copy-reference", "move-down", "copy-to-solutions"],
  );
});
