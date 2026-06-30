import { useCallback, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject } from "react";

import type { ContextMenuAction, ContextMenuState } from "@/components/ui/context-menu";

export type EditorContextMenuSurface = "miniToc" | "preview" | "editor";

interface ContextAnchorDescriptor {
  editorAnchor: string;
}

interface UseEditorContextMenuControllerOptions<TDescriptor extends ContextAnchorDescriptor> {
  previewPaneRef: MutableRefObject<HTMLElement | null>;
  contextDescriptorForAnchor: (anchor: string) => TDescriptor;
  selectContextAnchor: (anchor: string, options?: { previewOnly?: boolean }) => void;
  contextActionsForAnchor: (anchor: string) => ContextMenuAction[];
  previewAnchorFromEventTarget: (target: EventTarget | null, previewPane: HTMLElement | null) => string | null;
}

export function useEditorContextMenuController<TDescriptor extends ContextAnchorDescriptor>({
  previewPaneRef,
  contextDescriptorForAnchor,
  selectContextAnchor,
  contextActionsForAnchor,
  previewAnchorFromEventTarget,
}: UseEditorContextMenuControllerOptions<TDescriptor>) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  function openContextMenu(event: ReactMouseEvent<HTMLElement>, anchor: string, surface: EditorContextMenuSurface) {
    event.preventDefault();
    event.stopPropagation();
    const item = contextDescriptorForAnchor(anchor);
    const editorAnchor = item.editorAnchor;
    selectContextAnchor(editorAnchor, { previewOnly: surface === "preview" });
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      actions: contextActionsForAnchor(editorAnchor),
    });
  }

  function handlePreviewContextMenu(event: ReactMouseEvent<HTMLElement>) {
    const anchor = previewAnchorFromEventTarget(event.target, previewPaneRef.current);
    if (!anchor) return;
    openContextMenu(event, anchor, "preview");
  }

  function handleEditorHeaderContextMenu(event: ReactMouseEvent<HTMLElement>, anchor: string) {
    const header = event.target instanceof Element ? event.target.closest("[data-panel-region='header']") : null;
    if (!header || !event.currentTarget.contains(header)) return;
    openContextMenu(event, anchor, "editor");
  }

  return {
    contextMenu,
    closeContextMenu,
    openContextMenu,
    handlePreviewContextMenu,
    handleEditorHeaderContextMenu,
  };
}
