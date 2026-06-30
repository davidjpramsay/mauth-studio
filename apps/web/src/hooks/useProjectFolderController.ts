import type { ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import type { ProjectFilesStatus } from "@/hooks/useProjectFilesController";
import { getDefaultProject, listProjectFiles, saveProjectFile } from "@/lib/api";
import { joinTestPath, projectPathForTestPath, safeProjectFileName } from "@/lib/projectFiles";

interface UseProjectFolderControllerOptions {
  activeProject: ProjectSummary | null;
  projectFiles: ProjectFileSummary[];
  setActiveProject: (project: ProjectSummary) => void;
  setProjectFiles: (files: ProjectFileSummary[]) => void;
  setProjectFilesStatus: (status: ProjectFilesStatus) => void;
  setProjectFilesMessage: (message: string) => void;
}

export function useProjectFolderController({
  activeProject,
  projectFiles,
  setActiveProject,
  setProjectFiles,
  setProjectFilesStatus,
  setProjectFilesMessage,
}: UseProjectFolderControllerOptions) {
  async function createProjectFolder(folderPath: string) {
    const requestedName = window.prompt("Folder name", "New folder");
    if (requestedName === null) return;
    const folderName = safeProjectFileName(requestedName);
    if (!folderName) return;
    const testPath = joinTestPath(folderPath, folderName);
    const filePath = projectPathForTestPath(testPath);
    if (projectFiles.some((file) => file.path.toLowerCase() === filePath.toLowerCase())) {
      window.alert("A file or folder with that name already exists.");
      return;
    }

    try {
      setProjectFilesStatus("saving");
      setProjectFilesMessage("Creating folder");
      const project = activeProject ?? (await getDefaultProject());
      await saveProjectFile(project.id, filePath, { kind: "folder", fileType: "folder" });
      const refreshedFiles = await listProjectFiles(project.id);
      setActiveProject(project);
      setProjectFiles(refreshedFiles.files);
      setProjectFilesStatus("ready");
      setProjectFilesMessage(`Created ${folderName}`);
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Folder create failed");
    }
  }

  return { createProjectFolder };
}
