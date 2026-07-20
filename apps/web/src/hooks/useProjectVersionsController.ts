import type { ProjectFileDocument, ProjectFileSummary, ProjectFileVersion, ProjectSummary } from "@mauth-studio/shared";

import type { ProjectFilesStatus } from "@/hooks/useProjectFilesController";
import { getDefaultProject, listProjectFiles, listProjectFileVersions, restoreProjectFileVersion } from "@/lib/api";
import type { ProjectFileTransitionIntent, ProjectFileTransitionOutcome } from "@/lib/projectFileBeforeOpenWorkflow";
import { restoreProjectFileVersionWithSession, type ProjectFileVersionRestoreOutcome } from "@/lib/projectFileVersionRestoreWorkflow";
import { testFileDisplayName, testPathBasename, testPathFromProjectPath } from "@/lib/projectFiles";

interface UseProjectVersionsControllerOptions {
  activeProject: ProjectSummary | null;
  activeProjectFilePath: string | null;
  prepareCurrentProjectFileTransition: (
    project: ProjectSummary,
    intent: ProjectFileTransitionIntent,
  ) => Promise<ProjectFileTransitionOutcome>;
  applyRestoredProjectDocument: (project: ProjectSummary, filePath: string, document: ProjectFileDocument) => void;
  setActiveProject: (project: ProjectSummary) => void;
  setProjectFiles: (files: ProjectFileSummary[]) => void;
  setProjectFilesStatus: (status: ProjectFilesStatus) => void;
  setProjectFilesMessage: (message: string) => void;
}

export function useProjectVersionsController({
  activeProject,
  activeProjectFilePath,
  prepareCurrentProjectFileTransition,
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

  async function restoreProjectFileFromVersion(
    filePath: string,
    versionId: string,
    revision: number,
  ): Promise<ProjectFileVersionRestoreOutcome> {
    const project = await currentProject();
    const fileName = testFileDisplayName(testPathBasename(testPathFromProjectPath(filePath) ?? filePath));
    return restoreProjectFileVersionWithSession({
      activeFile: activeProjectFilePath === filePath,
      prepareCurrentDocument: () =>
        prepareCurrentProjectFileTransition(project, {
          kind: "restore-version",
          targetLabel: fileName,
          revision,
        }),
      restoreVersion: async () => {
        setProjectFilesStatus("saving");
        setProjectFilesMessage("Restoring version");
        const restoredDocument = await restoreProjectFileVersion(project.id, filePath, versionId);
        const refreshedFiles = await listProjectFiles(project.id);
        setProjectFiles(refreshedFiles.files);

        if (activeProjectFilePath === filePath) {
          applyRestoredProjectDocument(project, filePath, restoredDocument);
        }

        setProjectFilesStatus("ready");
        setProjectFilesMessage(`Restored ${fileName}`);
      },
    });
  }

  return {
    loadProjectFileVersions,
    restoreProjectFileFromVersion,
  };
}
