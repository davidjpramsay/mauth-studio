import { useRef, type MutableRefObject } from "react";
import type { ProjectFileDocument, ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import type { MauthDialogActions } from "@/hooks/useMauthDialogController";
import type { ProjectFilesStatus, ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import { getDefaultProject, listProjectFiles, saveProjectFile } from "@/lib/api";
import {
  ensureTestFileName,
  joinTestPath,
  projectPathForTestPath,
  safeProjectFileName,
  testFileDisplayName,
  testPathBasename,
  testPathFromProjectPath,
} from "@/lib/projectFiles";
import {
  projectFileTransitionCopy,
  resolveProjectFileTransition,
  type ProjectFileTransitionChoice,
  type ProjectFileTransitionIntent,
  type ProjectFileTransitionOutcome,
} from "@/lib/projectFileBeforeOpenWorkflow";
import { runSingleFlight } from "@/lib/singleFlight";

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

interface UseProjectDocumentPersistenceControllerOptions<TDocument> {
  activeProject: ProjectSummary | null;
  projectFiles: ProjectFileSummary[];
  activeProjectFilePath: string | null;
  activeProjectFilePathRef: MutableRefObject<string | null>;
  activeProjectFileRevisionRef: MutableRefObject<number | null>;
  hasUnsavedProjectChanges: boolean;
  currentProjectFileName: string;
  revisionMissingErrorMessage: string;
  currentDocument: () => TDocument;
  defaultProjectFileName: () => string;
  serializeProjectDocument: (args: SerializeProjectDocumentArgs<TDocument>) => SerializedProjectDocument;
  projectFileConflictFromError: (error: unknown, filePath: string, localRevision: number | null) => ProjectSaveConflict | null;
  missingProjectRevisionConflict: (filePath: string) => ProjectSaveConflict;
  setActiveProject: (project: ProjectSummary) => void;
  setProjectFiles: (files: ProjectFileSummary[]) => void;
  setActiveProjectFileState: (filePath: string | null, revision: number | null) => void;
  setProjectSaveConflict: (conflict: ProjectSaveConflict | null) => void;
  updateLastProjectSaveFingerprint: (fingerprint: string | null) => void;
  setProjectFilesStatus: (status: ProjectFilesStatus) => void;
  setProjectFilesMessage: (message: string) => void;
  refreshProjectFiles: () => Promise<void>;
  dialogs: MauthDialogActions;
}

export function useProjectDocumentPersistenceController<TDocument>({
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
}: UseProjectDocumentPersistenceControllerOptions<TDocument>) {
  const saveCurrentTestInFlightRef = useRef<Promise<boolean> | null>(null);

  async function writeEditorDocumentToProjectFile(filePath: string, testName: string, document: TDocument) {
    setProjectFilesStatus("saving");
    setProjectFilesMessage("Saving");

    const project = activeProject ?? (await getDefaultProject());
    const loadedFilePath = activeProjectFilePathRef.current;
    const loadedRevision = loadedFilePath === filePath ? activeProjectFileRevisionRef.current : undefined;
    if (loadedFilePath === filePath && loadedRevision === null) {
      const conflict = missingProjectRevisionConflict(filePath);
      setProjectSaveConflict(conflict);
      setProjectFilesStatus("error");
      setProjectFilesMessage("Reload file before saving");
      throw new Error(revisionMissingErrorMessage);
    }

    const existingFile =
      loadedFilePath === filePath ? undefined : projectFiles.find((file) => file.kind === "file" && file.path === filePath);
    const serializedDocument = serializeProjectDocument({ filePath, testName, document });

    let savedDocument: ProjectFileDocument;
    const baseRevision = loadedRevision ?? existingFile?.revision ?? null;
    try {
      savedDocument = await saveProjectFile(project.id, filePath, {
        content: serializedDocument.content,
        kind: "file",
        fileType: serializedDocument.fileType,
        metadata: {
          format: "mauth-document",
          source: "mauth-studio",
        },
        baseRevision,
      });
    } catch (error) {
      const conflict = projectFileConflictFromError(error, filePath, baseRevision ?? null);
      if (conflict) {
        setProjectSaveConflict(conflict);
        setProjectFilesStatus("error");
        setProjectFilesMessage("File changed on disk");
        void refreshProjectFiles();
      }
      throw error;
    }

    const refreshedFiles = await listProjectFiles(project.id);
    setActiveProject(project);
    setProjectFiles(refreshedFiles.files);
    setActiveProjectFileState(filePath, savedDocument.revision);
    setProjectSaveConflict(null);
    updateLastProjectSaveFingerprint(serializedDocument.fingerprint);
    setProjectFilesStatus("ready");
    setProjectFilesMessage(`Saved ${testFileDisplayName(testPathBasename(testPathFromProjectPath(filePath) ?? filePath))}`);
  }

  async function writeCurrentTestProjectFile(filePath: string, testName: string) {
    await writeEditorDocumentToProjectFile(filePath, testName, currentDocument());
  }

  async function saveCurrentEditorRecoveryCopy(project: ProjectSummary, sourcePath: string) {
    setProjectFilesStatus("saving");
    setProjectFilesMessage("Saving recovery copy");

    const document = currentDocument();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const suffix = Math.random().toString(36).slice(2, 6);
    const recoveryName = `${safeProjectFileName(currentProjectFileName)} recovery ${timestamp}-${suffix}`;
    const recoveryPath = projectPathForTestPath(joinTestPath("Recovery", ensureTestFileName(recoveryName)));
    const serializedDocument = serializeProjectDocument({ filePath: recoveryPath, testName: recoveryName, document });

    const savedDocument = await saveProjectFile(project.id, recoveryPath, {
      content: serializedDocument.content,
      kind: "file",
      fileType: serializedDocument.fileType,
      metadata: {
        format: "mauth-document",
        source: "mauth-studio",
        recoveryFor: sourcePath,
        recoveryReason: "open-project-file-save-conflict",
      },
      baseRevision: null,
    });
    const refreshedFiles = await listProjectFiles(project.id);
    setActiveProject(project);
    setProjectFiles(refreshedFiles.files);
    return savedDocument;
  }

  async function saveActiveFileRecoveryCopy() {
    if (!activeProjectFilePath) return false;

    try {
      const project = activeProject ?? (await getDefaultProject());
      await saveCurrentEditorRecoveryCopy(project, activeProjectFilePath);
      setProjectFilesStatus("ready");
      setProjectFilesMessage("Saved recovery copy");
      return true;
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Recovery copy failed");
      return false;
    }
  }

  async function prepareCurrentProjectFileTransition(
    project: ProjectSummary,
    intent: ProjectFileTransitionIntent,
  ): Promise<ProjectFileTransitionOutcome> {
    const sourcePath = activeProjectFilePath;
    const copy = projectFileTransitionCopy(currentProjectFileName, intent);
    const outcome = await resolveProjectFileTransition({
      shouldSave: Boolean(hasUnsavedProjectChanges && sourcePath),
      saveCurrentFile: async () => {
        if (sourcePath) await writeCurrentTestProjectFile(sourcePath, currentProjectFileName);
      },
      isRecoverableSaveConflict: (error) =>
        Boolean(sourcePath && projectFileConflictFromError(error, sourcePath, activeProjectFileRevisionRef.current)) ||
        (error instanceof Error && error.message === revisionMissingErrorMessage),
      chooseConflictAction: async () => {
        const choice = await dialogs.choose({
          title: "File changed on disk",
          description: copy.conflictDescription,
          options: [
            { value: "save-recovery", label: copy.recoveryLabel },
            { value: "open-without-saving", label: copy.discardLabel, destructive: true },
          ],
          cancelLabel: "Cancel",
        });
        return choice === "save-recovery" || choice === "open-without-saving" ? (choice satisfies ProjectFileTransitionChoice) : null;
      },
      saveRecoveryCopy: async () => {
        if (sourcePath) await saveCurrentEditorRecoveryCopy(project, sourcePath);
      },
    });

    if (outcome === "cancelled") {
      setProjectFilesStatus("error");
      setProjectFilesMessage(copy.cancelledMessage);
    } else if (outcome === "recovery-failed") {
      setProjectFilesStatus("error");
      setProjectFilesMessage(copy.recoveryFailedMessage);
    } else if (outcome === "recovery-saved") {
      setProjectFilesStatus("ready");
      setProjectFilesMessage(copy.recoverySavedMessage);
    } else if (outcome === "open-without-saving") {
      setProjectFilesStatus("ready");
      setProjectFilesMessage(copy.discardMessage);
    }

    return outcome;
  }

  async function performSaveCurrentTestToProjectFile(folderPath: string) {
    let saveTargetPath = activeProjectFilePath;
    try {
      const defaultName = defaultProjectFileName();
      let filePath = activeProjectFilePath;
      let testName = defaultName;

      if (!filePath) {
        const requestedName = await dialogs.prompt({
          title: "Save document",
          label: "File name",
          defaultValue: defaultName,
          confirmLabel: "Save",
          requireValue: true,
        });
        if (requestedName === null) return false;
        testName = safeProjectFileName(requestedName);
        filePath = projectPathForTestPath(joinTestPath(folderPath, ensureTestFileName(testName)));
      }

      saveTargetPath = filePath;
      await writeCurrentTestProjectFile(filePath, testName);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === revisionMissingErrorMessage) return false;
      const conflict = saveTargetPath ? projectFileConflictFromError(error, saveTargetPath, activeProjectFileRevisionRef.current) : null;
      if (conflict) {
        setProjectSaveConflict(conflict);
        setProjectFilesStatus("error");
        setProjectFilesMessage("File changed on disk");
        void refreshProjectFiles();
        return false;
      }
      setProjectFilesStatus("error");
      setProjectFilesMessage("Save failed");
      return false;
    }
  }

  function saveCurrentTestToProjectFile(folderPath = "") {
    return runSingleFlight(saveCurrentTestInFlightRef, () => performSaveCurrentTestToProjectFile(folderPath));
  }

  return {
    writeEditorDocumentToProjectFile,
    writeCurrentTestProjectFile,
    saveCurrentEditorRecoveryCopy,
    saveActiveFileRecoveryCopy,
    prepareCurrentProjectFileTransition,
    saveCurrentTestToProjectFile,
  };
}
