import type { DocumentTocItem } from "./documentNavigation.ts";

export type EditorPaneMode = "split" | "preview";

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
          ? "minmax(17rem, 0.9fr) minmax(17rem, 19rem) minmax(0, 1.1fr)"
          : "minmax(0, 1fr) minmax(0, 1fr)",
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
