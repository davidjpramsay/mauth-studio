import type { DragEvent } from "react";

type VerticalRect = Pick<DOMRect, "height" | "top">;

export function dragPlacementFromRect(rect: VerticalRect, clientY: number) {
  if (rect.height <= 0) return "after" as const;
  return clientY < rect.top + rect.height / 2 ? ("before" as const) : ("after" as const);
}

export function dragPlacementFromEvent(event: DragEvent<HTMLElement>) {
  return dragPlacementFromRect(event.currentTarget.getBoundingClientRect(), event.clientY);
}

export function setEditorDragImage(event: DragEvent<HTMLElement>) {
  const preview = event.currentTarget.closest("[data-drag-preview]");
  if (!(preview instanceof HTMLElement)) return;
  const rect = preview.getBoundingClientRect();
  try {
    event.dataTransfer.setDragImage(preview, Math.min(48, rect.width / 2), 28);
  } catch {
    // Some browsers reject element drag images in edge cases; the drag itself should still proceed.
  }
}
