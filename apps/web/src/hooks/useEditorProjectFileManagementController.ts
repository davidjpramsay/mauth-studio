import type { ProjectFileDocument, ProjectSummary } from "@mauth-studio/shared";

import { useDocumentsFolderController } from "@/hooks/useDocumentsFolderController";
import { useProjectBackupController } from "@/hooks/useProjectBackupController";
import { useProjectFileOperationsController } from "@/hooks/useProjectFileOperationsController";
import { useProjectFolderController } from "@/hooks/useProjectFolderController";
import { useProjectVersionsController } from "@/hooks/useProjectVersionsController";
import { saveProjectFile } from "@/lib/api";
import { PROJECT_FILE_REVISION_MISSING_ERROR, type SavedTest } from "@/lib/editorAppPersistence";
import {
  createSavedTestSnapshot,
  editorDocumentFingerprint,
  normalizeSavedTest,
  type EditorDocumentState,
} from "@/lib/editorApplicationRuntime";
import { createEditorProjectFileDuplicatePlan } from "@/lib/editorProjectFileDuplicate";
import type { LogoAsset } from "@/lib/logoLibrary";
import { parseProjectSavedDocument } from "@/lib/projectDocumentSerialization";

type DocumentsFolderOptions = Parameters<typeof useDocumentsFolderController>[0];
type ProjectVersionsOptions = Parameters<typeof useProjectVersionsController>[0];
type ProjectFolderOptions = Parameters<typeof useProjectFolderController>[0];
type ProjectBackupOptions = Parameters<typeof useProjectBackupController>[0];
type ProjectFileOperationsOptions = Parameters<typeof useProjectFileOperationsController>[0];

type UseEditorProjectFileManagementControllerOptions = Omit<DocumentsFolderOptions, "isProjectRevisionMissingError"> &
  Omit<ProjectVersionsOptions, "applyRestoredProjectDocument"> &
  ProjectFolderOptions &
  ProjectBackupOptions &
  Omit<ProjectFileOperationsOptions, "duplicateActiveProjectFile"> & {
    currentEditorDocument: () => EditorDocumentState;
    currentLogos: () => LogoAsset[];
    applySavedProjectDocument: (project: ProjectSummary, filePath: string, savedTest: SavedTest, revision: number | null) => void;
  };

export function useEditorProjectFileManagementController({
  activeProject,
  projectFiles,
  activeProjectFilePath,
  fileOperationBusy,
  hasUnsavedProjectChanges,
  currentProjectFileName,
  currentEditorDocument,
  currentLogos,
  prepareCurrentProjectFileTransition,
  applySavedProjectDocument,
  clearActiveProjectFile,
  writeCurrentTestProjectFile,
  saveCurrentTestToProjectFile,
  refreshLogoLibraryFromDisk,
  setActiveProjectFileState,
  setActiveProject,
  setProjectFiles,
  setProjectFilesStatus,
  setProjectFilesMessage,
  setProjectSaveConflict,
  updateLastProjectSaveFingerprint,
  dialogs,
}: UseEditorProjectFileManagementControllerOptions) {
  const documentsFolderController = useDocumentsFolderController({
    activeProject,
    fileOperationBusy,
    prepareCurrentProjectFileTransition,
    clearActiveProjectFile,
    setActiveProject,
    setProjectFiles,
    setProjectFilesStatus,
    setProjectFilesMessage,
    setProjectSaveConflict,
    isProjectRevisionMissingError: (error) => error instanceof Error && error.message === PROJECT_FILE_REVISION_MISSING_ERROR,
  });

  const projectVersionsController = useProjectVersionsController({
    activeProject,
    activeProjectFilePath,
    prepareCurrentProjectFileTransition,
    applyRestoredProjectDocument: (project: ProjectSummary, filePath: string, restoredDocument: ProjectFileDocument) => {
      const savedTest = parseProjectSavedDocument(restoredDocument.content, normalizeSavedTest);
      if (!savedTest) throw new Error("Unsupported project file");
      applySavedProjectDocument(project, filePath, savedTest, restoredDocument.revision);
    },
    setActiveProject,
    setProjectFiles,
    setProjectFilesStatus,
    setProjectFilesMessage,
  });

  const projectFolderController = useProjectFolderController({
    activeProject,
    projectFiles,
    setActiveProject,
    setProjectFiles,
    setProjectFilesStatus,
    setProjectFilesMessage,
    dialogs,
  });

  const projectBackupController = useProjectBackupController({
    activeProject,
    activeProjectFilePath,
    hasUnsavedProjectChanges,
    currentProjectFileName,
    writeCurrentTestProjectFile,
    saveCurrentTestToProjectFile,
    refreshLogoLibraryFromDisk,
    setActiveProject,
    setProjectFiles,
    setProjectFilesStatus,
    setProjectFilesMessage,
    dialogs,
  });

  const projectFileOperationsController = useProjectFileOperationsController({
    activeProject,
    projectFiles,
    activeProjectFilePath,
    hasUnsavedProjectChanges,
    currentProjectFileName,
    writeCurrentTestProjectFile,
    duplicateActiveProjectFile: async (project, targetFilePath, targetTestPath) => {
      const duplicatePlan = createEditorProjectFileDuplicatePlan({
        targetFilePath,
        targetTestPath,
        document: currentEditorDocument(),
        logos: currentLogos(),
        runtime: { createSavedTestSnapshot, editorDocumentFingerprint },
      });
      const duplicatedDocument = await saveProjectFile(project.id, duplicatePlan.filePath, duplicatePlan.request);
      return {
        revision: duplicatedDocument.revision,
        fingerprint: duplicatePlan.fingerprint,
      };
    },
    setActiveProjectFileState,
    setActiveProject,
    setProjectFiles,
    setProjectFilesStatus,
    setProjectFilesMessage,
    setProjectSaveConflict,
    updateLastProjectSaveFingerprint,
    dialogs,
  });

  return {
    ...documentsFolderController,
    ...projectVersionsController,
    ...projectFolderController,
    ...projectBackupController,
    ...projectFileOperationsController,
  };
}
