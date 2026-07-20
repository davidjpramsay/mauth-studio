import type { ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import type { ProjectFilesStatus, ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import {
  chooseDefaultProjectDocumentsFolder,
  getDefaultProject,
  listProjectFiles,
  openDefaultProjectDocumentsFolder,
  resetDefaultProjectDocumentsFolder,
} from "@/lib/api";
import {
  projectFileTransitionCanProceed,
  type ProjectFileTransitionIntent,
  type ProjectFileTransitionOutcome,
} from "@/lib/projectFileBeforeOpenWorkflow";

interface UseDocumentsFolderControllerOptions {
  activeProject: ProjectSummary | null;
  fileOperationBusy: boolean;
  prepareCurrentProjectFileTransition: (
    project: ProjectSummary,
    intent: ProjectFileTransitionIntent,
  ) => Promise<ProjectFileTransitionOutcome>;
  clearActiveProjectFile: () => void;
  setActiveProject: (project: ProjectSummary) => void;
  setProjectFiles: (files: ProjectFileSummary[]) => void;
  setProjectFilesStatus: (status: ProjectFilesStatus) => void;
  setProjectFilesMessage: (message: string) => void;
  setProjectSaveConflict: (conflict: ProjectSaveConflict | null) => void;
  isProjectRevisionMissingError: (error: unknown) => boolean;
}

export function useDocumentsFolderController({
  activeProject,
  fileOperationBusy,
  prepareCurrentProjectFileTransition,
  clearActiveProjectFile,
  setActiveProject,
  setProjectFiles,
  setProjectFilesStatus,
  setProjectFilesMessage,
  setProjectSaveConflict,
  isProjectRevisionMissingError,
}: UseDocumentsFolderControllerOptions) {
  async function projectBeforeFolderSwitch() {
    const project = activeProject ?? (await getDefaultProject());
    const outcome = await prepareCurrentProjectFileTransition(project, { kind: "switch-folder" });
    return projectFileTransitionCanProceed(outcome);
  }

  async function loadProjectFolder(project: ProjectSummary, readyMessage: string) {
    const refreshedFiles = await listProjectFiles(project.id);
    setActiveProject(project);
    setProjectFiles(refreshedFiles.files);
    clearActiveProjectFile();
    setProjectSaveConflict(null);
    setProjectFilesStatus("ready");
    setProjectFilesMessage(readyMessage);
  }

  async function openDocumentsFolder(folderPath: string) {
    const cleanPath = folderPath.trim();
    if (!cleanPath || fileOperationBusy) return;

    try {
      if (!(await projectBeforeFolderSwitch())) return;
      setProjectFilesStatus("loading");
      setProjectFilesMessage("Opening folder");
      const nextProject = await openDefaultProjectDocumentsFolder(cleanPath);
      await loadProjectFolder(nextProject, `Opened folder ${nextProject.documentsPath ?? cleanPath}`);
    } catch (error) {
      if (isProjectRevisionMissingError(error)) return;
      setProjectFilesStatus("error");
      setProjectFilesMessage(error instanceof Error ? error.message : "Open folder failed");
    }
  }

  async function chooseDocumentsFolder() {
    if (fileOperationBusy) return;

    try {
      if (!(await projectBeforeFolderSwitch())) return;
      setProjectFilesStatus("loading");
      setProjectFilesMessage("Choose a folder");
      const result = await chooseDefaultProjectDocumentsFolder();
      if (result.cancelled) {
        setProjectFilesStatus("ready");
        setProjectFilesMessage("Folder selection cancelled");
        return;
      }
      const nextProject = result.project;
      if (!nextProject) throw new Error("Folder picker did not return a project");
      await loadProjectFolder(nextProject, `Opened folder ${nextProject.documentsPath ?? result.path ?? ""}`);
    } catch (error) {
      if (isProjectRevisionMissingError(error)) return;
      setProjectFilesStatus("error");
      setProjectFilesMessage(error instanceof Error ? error.message : "Choose folder failed");
    }
  }

  async function resetDocumentsFolder() {
    if (fileOperationBusy) return;

    try {
      if (!(await projectBeforeFolderSwitch())) return;
      setProjectFilesStatus("loading");
      setProjectFilesMessage("Opening default folder");
      const nextProject = await resetDefaultProjectDocumentsFolder();
      await loadProjectFolder(nextProject, "Opened default folder");
    } catch (error) {
      if (isProjectRevisionMissingError(error)) return;
      setProjectFilesStatus("error");
      setProjectFilesMessage(error instanceof Error ? error.message : "Default folder failed");
    }
  }

  return {
    openDocumentsFolder,
    chooseDocumentsFolder,
    resetDocumentsFolder,
  };
}
