import type { ProjectFileSummary } from "@mauth-studio/shared";

import type { ProjectFilesStatus, ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import { TEST_FILE_ROOT_LABEL, testFileDisplayName, testPathBasename, testPathFromProjectPath } from "@/lib/projectFiles";

export type DraftAutosaveStatus = "loading" | "ready" | "saving" | "saved" | "unavailable" | "error";
export type HeaderSaveStatus = DraftAutosaveStatus | "dirty" | "draft" | "conflict";

interface UseProjectFileStatusOptions {
  editorDocumentOpen: boolean;
  activeProjectFilePath: string | null;
  activeProjectFileRevision: number | null;
  projectSaveConflict: ProjectSaveConflict | null;
  projectFiles: ProjectFileSummary[];
  projectFilesStatus: ProjectFilesStatus;
  projectFilesMessage: string;
  currentDocumentFingerprint: string;
  lastProjectSaveFingerprint: string | null;
  cleanUnsavedDocumentFingerprint: string | null;
  draftAutosaveStatus: DraftAutosaveStatus;
  draftAutosaveMessage: string;
}

function formatShortDateTime(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function draftBackupStatusSummary(status: DraftAutosaveStatus, message: string) {
  if (status === "saving") return "backing up draft";
  if (status === "saved") return message.replace(/^Autosaved draft/, "draft backed up").replace(/^Autosaved/, "draft backed up");
  if (status === "unavailable") return "browser backup only";
  if (status === "loading") return "loading draft backup";
  if (status === "error") return "draft backup error";
  return message.replace(/^Draft autosave/, "Draft backup") || "draft backup ready";
}

export function missingProjectRevisionConflict(filePath: string): ProjectSaveConflict {
  return {
    filePath,
    message: "This draft was restored without a file revision. Reload the file before saving, or use Save as to keep it as a copy.",
    localRevision: null,
  };
}

export function useProjectFileStatus({
  editorDocumentOpen,
  activeProjectFilePath,
  activeProjectFileRevision,
  projectSaveConflict,
  projectFiles,
  projectFilesStatus,
  projectFilesMessage,
  currentDocumentFingerprint,
  lastProjectSaveFingerprint,
  cleanUnsavedDocumentFingerprint,
  draftAutosaveStatus,
  draftAutosaveMessage,
}: UseProjectFileStatusOptions) {
  const hasUnsavedProjectChanges = Boolean(activeProjectFilePath && lastProjectSaveFingerprint !== currentDocumentFingerprint);
  const activeProjectFileSummary = activeProjectFilePath ? projectFiles.find((file) => file.path === activeProjectFilePath) : undefined;
  const activeProjectTestPath = activeProjectFilePath ? testPathFromProjectPath(activeProjectFilePath) : null;
  const activeProjectPathLabel = activeProjectFilePath
    ? activeProjectTestPath
      ? `${TEST_FILE_ROOT_LABEL}/${activeProjectTestPath}`
      : activeProjectFilePath
    : "";
  const activeProjectRevisionIssue =
    activeProjectFilePath && projectSaveConflict?.filePath === activeProjectFilePath
      ? projectSaveConflict
      : activeProjectFilePath && activeProjectFileRevision === null
        ? missingProjectRevisionConflict(activeProjectFilePath)
        : null;
  const activeProjectSavedAt = formatShortDateTime(activeProjectFileSummary?.updatedAt);
  const draftBackupSummary = draftBackupStatusSummary(draftAutosaveStatus, draftAutosaveMessage);
  const currentProjectFileName = !editorDocumentOpen
    ? "No file open"
    : activeProjectFilePath
      ? testFileDisplayName(testPathBasename(testPathFromProjectPath(activeProjectFilePath) ?? activeProjectFilePath))
      : "Untitled test";
  const fileOperationBusy = projectFilesStatus === "saving" || projectFilesStatus === "loading";
  const headerFileStatusMessage = fileOperationBusy
    ? projectFilesMessage || "Working with files"
    : !editorDocumentOpen
      ? "Create a new Mauth document to begin"
      : activeProjectFilePath
        ? activeProjectRevisionIssue
          ? "File changed outside app · reload or Save as"
          : hasUnsavedProjectChanges
            ? `Unsaved file changes · ${draftBackupSummary}`
            : `Saved to file${activeProjectSavedAt ? ` · ${activeProjectSavedAt}` : ""}`
        : `New file not saved · ${draftBackupSummary}`;
  const headerFileStatusTitle = fileOperationBusy
    ? [projectFilesMessage || "Working with files", activeProjectPathLabel ? `Current file: ${activeProjectPathLabel}` : ""]
        .filter(Boolean)
        .join("\n")
    : !editorDocumentOpen
      ? "No file is open. Create a new Mauth document or open one from Files."
      : activeProjectFilePath
        ? [
            `File: ${currentProjectFileName}`,
            `Path: ${activeProjectPathLabel}`,
            activeProjectRevisionIssue
              ? [
                  `File save: ${activeProjectRevisionIssue.message}`,
                  typeof activeProjectRevisionIssue.localRevision === "number"
                    ? `Loaded revision: ${activeProjectRevisionIssue.localRevision}`
                    : "",
                  typeof activeProjectRevisionIssue.currentRevision === "number"
                    ? `Disk revision: ${activeProjectRevisionIssue.currentRevision}`
                    : "",
                ]
                  .filter(Boolean)
                  .join("\n")
              : hasUnsavedProjectChanges
                ? "File save: unsaved changes. Press Save to write the project file."
                : `File save: saved${activeProjectSavedAt ? ` ${activeProjectSavedAt}` : ""}`,
            `Draft backup: ${draftBackupSummary}`,
          ].join("\n")
        : [
            `File: ${currentProjectFileName}`,
            "File save: not saved yet. Press Save or Save as to create a project file.",
            `Draft backup: ${draftBackupSummary}`,
          ].join("\n");
  const headerStorageStatus: HeaderSaveStatus = fileOperationBusy
    ? "saving"
    : !editorDocumentOpen
      ? "ready"
      : activeProjectFilePath
        ? activeProjectRevisionIssue
          ? "conflict"
          : hasUnsavedProjectChanges
            ? "dirty"
            : "saved"
        : draftAutosaveStatus === "saved"
          ? "draft"
          : draftAutosaveStatus;
  const hasUnsavedDraftChanges = Boolean(
    editorDocumentOpen && !activeProjectFilePath && cleanUnsavedDocumentFingerprint !== currentDocumentFingerprint,
  );

  return {
    hasUnsavedProjectChanges,
    activeProjectFileSummary,
    activeProjectTestPath,
    activeProjectPathLabel,
    activeProjectRevisionIssue,
    activeProjectSavedAt,
    draftBackupSummary,
    currentProjectFileName,
    fileOperationBusy,
    headerFileStatusMessage,
    headerFileStatusTitle,
    headerStorageStatus,
    hasUnsavedDraftChanges,
  };
}
