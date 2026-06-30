import type { MutableRefObject } from "react";
import type { ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import { useActiveProjectFileSyncController } from "@/hooks/useActiveProjectFileSyncController";
import { useEditorCloseController } from "@/hooks/useEditorCloseController";
import type { MauthDialogActions } from "@/hooks/useMauthDialogController";
import type { DraftAutosaveStatus } from "@/hooks/useProjectFileStatus";
import { useProjectDocumentOpenController } from "@/hooks/useProjectDocumentOpenController";
import { useProjectDocumentPersistenceController } from "@/hooks/useProjectDocumentPersistenceController";
import type { ProjectFilesStatus, ProjectSaveConflict } from "@/hooks/useProjectFilesController";

interface DiskAutosaveResult {
  updatedAt?: string;
}

interface SerializedProjectDocument {
  content: string;
  fileType: string;
  fingerprint: string | null;
}

interface SerializeProjectDocumentArgs<TDocument> {
  filePath: string;
  testName: string;
  document: TDocument;
}

interface UseDocumentSessionControllerOptions<TDocument, TSavedDocument, TAutosave> {
  storageHydrated: boolean;
  activeProject: ProjectSummary | null;
  projectFiles: ProjectFileSummary[];
  activeProjectFilePath: string | null;
  activeProjectFilePathRef: MutableRefObject<string | null>;
  activeProjectFileRevisionRef: MutableRefObject<number | null>;
  editorDocumentOpenRef: MutableRefObject<boolean>;
  lastProjectSaveFingerprintRef: MutableRefObject<string | null>;
  fileOperationBusy: boolean;
  hasUnsavedProjectChanges: boolean;
  hasUnsavedDraftChanges: boolean;
  currentProjectFileName: string;
  draftAutosaveStatus: DraftAutosaveStatus;
  revisionMissingErrorMessage: string;
  activeFileSyncIntervalMs: number;
  currentDocument: () => TDocument;
  createClosedSnapshot: () => TAutosave;
  persistLocalDraft: (snapshot: TAutosave) => void;
  saveDiskAutosave: (snapshot: TAutosave) => Promise<DiskAutosaveResult>;
  defaultProjectFileName: () => string;
  serializeProjectDocument: (args: SerializeProjectDocumentArgs<TDocument>) => SerializedProjectDocument;
  parseSavedDocument: (content: string | null | undefined) => TSavedDocument | null;
  applySavedProjectDocument: (project: ProjectSummary, filePath: string, savedDocument: TSavedDocument, revision: number | null) => void;
  currentEditorDocumentFingerprint: () => string;
  projectFileConflictFromError: (error: unknown, filePath: string, localRevision: number | null) => ProjectSaveConflict | null;
  missingProjectRevisionConflict: (filePath: string) => ProjectSaveConflict;
  setActiveProject: (project: ProjectSummary) => void;
  setProjectFiles: (files: ProjectFileSummary[]) => void;
  setActiveProjectFileState: (filePath: string | null, revision: number | null) => void;
  clearActiveProjectFileState: () => void;
  setProjectSaveConflict: (conflict: ProjectSaveConflict | null) => void;
  updateLastProjectSaveFingerprint: (fingerprint: string | null) => void;
  setEditorDocumentOpenState: (open: boolean) => void;
  setNewTestDialogOpen: (open: boolean) => void;
  setFileManagerOpen: (open: boolean) => void;
  closeContextMenu: () => void;
  setDraftAutosaveStatus: (status: DraftAutosaveStatus) => void;
  setDraftAutosaveMessage: (message: string) => void;
  setProjectFilesStatus: (status: ProjectFilesStatus) => void;
  setProjectFilesMessage: (message: string) => void;
  refreshProjectFiles: () => Promise<void>;
  dialogs: MauthDialogActions;
  onOpened?: () => void;
}

export function useDocumentSessionController<TDocument, TSavedDocument, TAutosave>({
  storageHydrated,
  activeProject,
  projectFiles,
  activeProjectFilePath,
  activeProjectFilePathRef,
  activeProjectFileRevisionRef,
  editorDocumentOpenRef,
  lastProjectSaveFingerprintRef,
  fileOperationBusy,
  hasUnsavedProjectChanges,
  hasUnsavedDraftChanges,
  currentProjectFileName,
  draftAutosaveStatus,
  revisionMissingErrorMessage,
  activeFileSyncIntervalMs,
  currentDocument,
  createClosedSnapshot,
  persistLocalDraft,
  saveDiskAutosave,
  defaultProjectFileName,
  serializeProjectDocument,
  parseSavedDocument,
  applySavedProjectDocument,
  currentEditorDocumentFingerprint,
  projectFileConflictFromError,
  missingProjectRevisionConflict,
  setActiveProject,
  setProjectFiles,
  setActiveProjectFileState,
  clearActiveProjectFileState,
  setProjectSaveConflict,
  updateLastProjectSaveFingerprint,
  setEditorDocumentOpenState,
  setNewTestDialogOpen,
  setFileManagerOpen,
  closeContextMenu,
  setDraftAutosaveStatus,
  setDraftAutosaveMessage,
  setProjectFilesStatus,
  setProjectFilesMessage,
  refreshProjectFiles,
  dialogs,
  onOpened,
}: UseDocumentSessionControllerOptions<TDocument, TSavedDocument, TAutosave>) {
  const {
    writeEditorDocumentToProjectFile,
    writeCurrentTestProjectFile,
    saveCurrentProjectFileBeforeOpening,
    saveCurrentTestToProjectFile,
  } = useProjectDocumentPersistenceController<TDocument>({
    activeProject,
    projectFiles,
    activeProjectFilePath,
    activeProjectFilePathRef,
    activeProjectFileRevisionRef,
    hasUnsavedProjectChanges,
    currentProjectFileName,
    revisionMissingErrorMessage,
    currentDocument,
    defaultProjectFileName,
    serializeProjectDocument,
    projectFileConflictFromError,
    missingProjectRevisionConflict,
    setActiveProject,
    setProjectFiles,
    setActiveProjectFileState,
    setProjectSaveConflict,
    updateLastProjectSaveFingerprint,
    setProjectFilesStatus,
    setProjectFilesMessage,
    refreshProjectFiles,
    dialogs,
  });

  const { saveCurrentTest, startNewTest, closeEditorDocument, closeCurrentDocument } = useEditorCloseController<TAutosave>({
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
  });

  const { openProjectFile, syncActiveProjectFileFromDisk } = useProjectDocumentOpenController<TSavedDocument>({
    activeProject,
    projectFiles,
    activeProjectFilePath,
    activeProjectFilePathRef,
    activeProjectFileRevisionRef,
    lastProjectSaveFingerprintRef,
    fileOperationBusy,
    revisionMissingErrorMessage,
    parseSavedDocument,
    applySavedProjectDocument,
    saveCurrentProjectFileBeforeOpening,
    currentEditorDocumentFingerprint,
    projectFileConflictFromError,
    setActiveProject,
    setProjectFiles,
    setProjectSaveConflict,
    setProjectFilesStatus,
    setProjectFilesMessage,
    refreshProjectFiles,
    onOpened,
  });

  useActiveProjectFileSyncController({
    storageHydrated,
    activeProjectFilePath,
    fileOperationBusy,
    intervalMs: activeFileSyncIntervalMs,
    syncActiveProjectFileFromDisk,
  });

  return {
    writeEditorDocumentToProjectFile,
    writeCurrentTestProjectFile,
    saveCurrentProjectFileBeforeOpening,
    saveCurrentTestToProjectFile,
    saveCurrentTest,
    startNewTest,
    closeEditorDocument,
    closeCurrentDocument,
    openProjectFile,
    syncActiveProjectFileFromDisk,
  };
}
