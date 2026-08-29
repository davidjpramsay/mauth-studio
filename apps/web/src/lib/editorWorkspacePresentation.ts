import type { DocumentTocItem } from "./documentNavigation.ts";

export type EditorPaneMode = "split" | "preview";
export type EditorWorkspaceResponsiveMode = "wide" | "compact" | "overlay";

export function editorWorkspaceResponsiveMode(width: number): EditorWorkspaceResponsiveMode {
  if (width < 840) return "overlay";
  if (width < 1240) return "compact";
  return "wide";
}

export function clampEditorWorkspaceToolDockWidth(requestedWidth: number, workspaceWidth: number) {
  const minimumDockWidth = 384;
  const minimumPreviewWidth = 360;
  const maximumDockWidth = Math.min(520, Math.max(minimumDockWidth, workspaceWidth - minimumPreviewWidth));
  return Math.min(maximumDockWidth, Math.max(minimumDockWidth, Math.round(requestedWidth)));
}

export function editorWorkspaceVisibility(paneMode: EditorPaneMode, inspectorOpen: boolean) {
  const showEditor = paneMode === "split";
  return {
    showEditor,
    showPreview: true,
    showInspectorPane: showEditor && inspectorOpen,
  };
}

export function editorWorkspaceGridStyle(paneMode: EditorPaneMode, showInspectorPane: boolean) {
  return {
    gridTemplateColumns:
      paneMode === "preview"
        ? "minmax(0, 1fr)"
        : showInspectorPane
          ? "minmax(22rem, 0.9fr) minmax(19rem, 21rem) minmax(0, 1.1fr)"
          : "minmax(0, 1fr) minmax(0, 1fr)",
  };
}

export function editorWorkspaceInspectorPresentation(inspectorOpen: boolean, hasSelection: boolean) {
  return {
    showPane: inspectorOpen,
    showSelection: inspectorOpen && hasSelection,
  };
}

export function editorAppShellGridStyle(tocOpen: boolean) {
  return {
    gridTemplateColumns: tocOpen ? "3.25rem minmax(15rem, 18rem) minmax(0, 1fr)" : "3.25rem minmax(0, 1fr)",
  };
}

export function activePreviewAnchorForTocItem(
  activeTocItemId: string,
  documentTocItems: DocumentTocItem[],
  previewAnchorForEditorAnchor: (anchor: string, items: DocumentTocItem[]) => string | undefined,
) {
  if (activeTocItemId.startsWith("pb:")) return undefined;
  return previewAnchorForEditorAnchor(activeTocItemId, documentTocItems);
}
