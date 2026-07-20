import { useEffect, useRef } from "react";

export interface BeforeUnloadEditorState {
  editorDocumentOpen: boolean;
  fileOperationBusy: boolean;
  hasUnsavedProjectChanges: boolean;
  hasUnsavedDraftChanges: boolean;
}

export function shouldBlockEditorBeforeUnload({
  editorDocumentOpen,
  fileOperationBusy,
  hasUnsavedProjectChanges,
  hasUnsavedDraftChanges,
}: BeforeUnloadEditorState) {
  return Boolean(editorDocumentOpen && (fileOperationBusy || hasUnsavedProjectChanges || hasUnsavedDraftChanges));
}

export function useUnsavedChangesBeforeUnloadController(state: BeforeUnloadEditorState) {
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!shouldBlockEditorBeforeUnload(stateRef.current)) return;

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);
}
