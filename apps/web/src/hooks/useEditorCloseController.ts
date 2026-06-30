import type { MutableRefObject } from "react";

import type { MauthDialogActions } from "@/hooks/useMauthDialogController";
import type { DraftAutosaveStatus } from "@/hooks/useProjectFileStatus";
import type { ProjectFilesStatus } from "@/hooks/useProjectFilesController";

interface DiskAutosaveResult {
  updatedAt?: string;
}

interface UseEditorCloseControllerOptions<TAutosave> {
  editorDocumentOpenRef: MutableRefObject<boolean>;
  fileOperationBusy: boolean;
  activeProjectFilePath: string | null;
  hasUnsavedProjectChanges: boolean;
  hasUnsavedDraftChanges: boolean;
  currentProjectFileName: string;
  draftAutosaveStatus: DraftAutosaveStatus;
  createClosedSnapshot: () => TAutosave;
  persistLocalDraft: (snapshot: TAutosave) => void;
  saveDiskAutosave: (snapshot: TAutosave) => Promise<DiskAutosaveResult>;
  writeCurrentTestProjectFile: (filePath: string, testName: string) => Promise<void>;
  saveCurrentTestToProjectFile: (folderPath?: string) => Promise<void>;
  setEditorDocumentOpenState: (open: boolean) => void;
  clearActiveProjectFileState: () => void;
  setNewTestDialogOpen: (open: boolean) => void;
  setFileManagerOpen: (open: boolean) => void;
  closeContextMenu: () => void;
  setDraftAutosaveStatus: (status: DraftAutosaveStatus) => void;
  setDraftAutosaveMessage: (message: string) => void;
  setProjectFilesStatus: (status: ProjectFilesStatus) => void;
  setProjectFilesMessage: (message: string) => void;
  dialogs: MauthDialogActions;
}

export function useEditorCloseController<TAutosave>({
  editorDocumentOpenRef,
  fileOperationBusy,
  activeProjectFilePath,
  hasUnsavedProjectChanges,
  hasUnsavedDraftChanges,
  currentProjectFileName,
  draftAutosaveStatus,
  createClosedSnapshot,
  persistLocalDraft,
  saveDiskAutosave,
  writeCurrentTestProjectFile,
  saveCurrentTestToProjectFile,
  setEditorDocumentOpenState,
  clearActiveProjectFileState,
  setNewTestDialogOpen,
  setFileManagerOpen,
  closeContextMenu,
  setDraftAutosaveStatus,
  setDraftAutosaveMessage,
  setProjectFilesStatus,
  setProjectFilesMessage,
  dialogs,
}: UseEditorCloseControllerOptions<TAutosave>) {
  function saveCurrentTest() {
    if (!editorDocumentOpenRef.current) return;
    void saveCurrentTestToProjectFile("");
  }

  function startNewTest() {
    setNewTestDialogOpen(true);
  }

  function persistClosedEditorState() {
    const closedSnapshot = createClosedSnapshot();
    persistLocalDraft(closedSnapshot);
    if (draftAutosaveStatus !== "unavailable") {
      void saveDiskAutosave(closedSnapshot)
        .then((autosaveResponse) => {
          const updatedAt = autosaveResponse.updatedAt ? new Date(autosaveResponse.updatedAt).toLocaleTimeString() : "now";
          setDraftAutosaveStatus("saved");
          setDraftAutosaveMessage(`Closed workspace saved at ${updatedAt}`);
        })
        .catch(() => {
          setDraftAutosaveStatus("unavailable");
          setDraftAutosaveMessage("Disk autosave failed: using browser backup only");
        });
    }
  }

  function closeEditorDocument() {
    setEditorDocumentOpenState(false);
    clearActiveProjectFileState();
    setNewTestDialogOpen(false);
    setFileManagerOpen(false);
    closeContextMenu();
    persistClosedEditorState();
  }

  async function closeCurrentDocument() {
    if (!editorDocumentOpenRef.current || fileOperationBusy) return;

    if (activeProjectFilePath && hasUnsavedProjectChanges) {
      const shouldSave = await dialogs.confirm({
        title: "Save before closing",
        description: `Save changes to "${currentProjectFileName}" before closing?`,
        confirmLabel: "Save and close",
      });
      if (!shouldSave) return;
      try {
        await writeCurrentTestProjectFile(activeProjectFilePath, currentProjectFileName);
      } catch {
        setProjectFilesStatus("error");
        setProjectFilesMessage("Close cancelled; save failed");
        return;
      }
    } else if (hasUnsavedDraftChanges) {
      const shouldClose = await dialogs.confirm({
        title: "Close unsaved document",
        description: "This document has not been saved to a file. Close without saving it?",
        confirmLabel: "Close without saving",
        destructive: true,
      });
      if (!shouldClose) return;
    }

    closeEditorDocument();
  }

  return {
    saveCurrentTest,
    startNewTest,
    closeEditorDocument,
    closeCurrentDocument,
  };
}
