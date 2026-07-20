export type EditorContextActionId = "copy-reference" | "move-up" | "move-down" | "duplicate" | "copy-to-solutions" | "delete";

export interface EditorContextActionDescriptor {
  id: EditorContextActionId;
  label: string;
  destructive?: boolean;
}

interface EditorContextActionDescriptorOptions {
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDuplicate: boolean;
  canCreateSolutionCopy: boolean;
  canDelete: boolean;
}

export function editorContextActionDescriptors({
  canMoveUp,
  canMoveDown,
  canDuplicate,
  canCreateSolutionCopy,
  canDelete,
}: EditorContextActionDescriptorOptions): EditorContextActionDescriptor[] {
  const actions: EditorContextActionDescriptor[] = [{ id: "copy-reference", label: "Copy agent reference" }];

  if (canMoveUp) actions.push({ id: "move-up", label: "Move up" });
  if (canMoveDown) actions.push({ id: "move-down", label: "Move down" });
  if (canDuplicate) actions.push({ id: "duplicate", label: "Duplicate" });
  if (canCreateSolutionCopy) actions.push({ id: "copy-to-solutions", label: "Complete in solutions" });
  if (canDelete) actions.push({ id: "delete", label: "Delete", destructive: true });

  return actions;
}
