import type { ProjectFileDocument, ProjectFileSummary, ProjectFileVersion, ProjectSummary } from "@mauth-studio/shared";

import type { ProjectFilesStatus } from "@/hooks/useProjectFilesController";
import { getDefaultProject, listProjectFiles, listProjectFileVersions, restoreProjectFileVersion } from "@/lib/api";
import { testFileDisplayName, testPathBasename, testPathFromProjectPath } from "@/lib/projectFiles";

interface UseProjectVersionsControllerOptions {
  activeProject: ProjectSummary | null;
  activeProjectFilePath: string | null;
  applyRestoredProjectDocument: (project: ProjectSummary, filePath: string, document: ProjectFileDocument) => void;
  setActiveProject: (project: ProjectSummary) => void;
  setProjectFiles: (files: ProjectFileSummary[]) => void;
  setProjectFilesStatus: (status: ProjectFilesStatus) => void;
  setProjectFilesMessage: (message: string) => void;
}

export function useProjectVersionsController({
  activeProject,
  activeProjectFilePath,
  applyRestoredProjectDocument,
  setActiveProject,
  setProjectFiles,
  setProjectFilesStatus,
  setProjectFilesMessage,
}: UseProjectVersionsControllerOptions) {
  async function currentProject() {
    const project = activeProject ?? (await getDefaultProject());
    setActiveProject(project);
    return project;
  }

  async function loadProjectFileVersions(filePath: string): Promise<ProjectFileVersion[]> {
    const project = await currentProject();
    const response = await listProjectFileVersions(project.id, filePath);
    return response.versions;
  }

  async function restoreProjectFileFromVersion(filePath: string, versionId: string) {
    setProjectFilesStatus("saving");
    setProjectFilesMessage("Restoring version");
    const project = await currentProject();
    const restoredDocument = await restoreProjectFileVersion(project.id, filePath, versionId);
    const refreshedFiles = await listProjectFiles(project.id);
    setProjectFiles(refreshedFiles.files);

    if (activeProjectFilePath === filePath) {
      applyRestoredProjectDocument(project, filePath, restoredDocument);
    }

    setProjectFilesStatus("ready");
    setProjectFilesMessage(`Restored ${testFileDisplayName(testPathBasename(testPathFromProjectPath(filePath) ?? filePath))}`);
  }

  return {
    loadProjectFileVersions,
    restoreProjectFileFromVersion,
  };
}
