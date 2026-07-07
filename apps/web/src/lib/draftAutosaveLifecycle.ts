import { fileChangedProjectSaveConflict, type ProjectSaveConflict } from "./projectSaveConflicts.ts";

export interface DraftAutosaveStartMessageState {
  activeProjectFilePath: string | null;
  editorDocumentOpen: boolean;
}

export type DraftAutosaveRevisionPlan =
  | { kind: "save" }
  | {
      kind: "reload-clean-file";
      conflict: ProjectSaveConflict;
      draftStatus: "ready";
      draftMessage: "File changed on disk; reloading";
    }
  | {
      kind: "block-dirty-file";
      conflict: ProjectSaveConflict;
      projectFilesStatus: "error";
      projectFilesMessage: "File changed on disk";
      draftStatus: "ready";
      draftMessage: "Draft not autosaved; file changed on disk";
    };

export interface DraftAutosaveRevisionState {
  activeProjectFilePath: string | null;
  activeProjectFileRevision: number | null;
  remoteRevision?: number;
  currentProjectFileClean: boolean;
}

export function draftAutosaveStartMessage({ activeProjectFilePath, editorDocumentOpen }: DraftAutosaveStartMessageState) {
  if (activeProjectFilePath) return "Autosaving file draft";
  if (editorDocumentOpen) return "Autosaving draft";
  return "Saving closed workspace state";
}

export function resolveDraftAutosaveRevisionPlan({
  activeProjectFilePath,
  activeProjectFileRevision,
  remoteRevision,
  currentProjectFileClean,
}: DraftAutosaveRevisionState): DraftAutosaveRevisionPlan {
  if (!activeProjectFilePath || typeof activeProjectFileRevision !== "number" || typeof remoteRevision !== "number") {
    return { kind: "save" };
  }

  if (remoteRevision <= activeProjectFileRevision) return { kind: "save" };

  const conflict = fileChangedProjectSaveConflict(activeProjectFilePath, activeProjectFileRevision, remoteRevision);
  if (currentProjectFileClean) {
    return {
      kind: "reload-clean-file",
      conflict,
      draftStatus: "ready",
      draftMessage: "File changed on disk; reloading",
    };
  }

  return {
    kind: "block-dirty-file",
    conflict,
    projectFilesStatus: "error",
    projectFilesMessage: "File changed on disk",
    draftStatus: "ready",
    draftMessage: "Draft not autosaved; file changed on disk",
  };
}

export function draftAutosaveSavedMessage(
  updatedAt: string | undefined,
  formatTime = (value: string) => new Date(value).toLocaleTimeString(),
) {
  return `Autosaved draft at ${updatedAt ? formatTime(updatedAt) : "now"}`;
}
