import type { ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import type { MauthDialogActions } from "@/hooks/useMauthDialogController";
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
  dialogs: MauthDialogActions;
}

export function useProjectFolderController({
  activeProject,
  projectFiles,
  setActiveProject,
  setProjectFiles,
  setProjectFilesStatus,
  setProjectFilesMessage,
  dialogs,
}: UseProjectFolderControllerOptions) {
  async function createProjectFolder(folderPath: string) {
    const requestedName = await dialogs.prompt({
      title: "New folder",
      label: "Folder name",
      defaultValue: "New folder",
      confirmLabel: "Create folder",
      requireValue: true,
    });
    if (requestedName === null) return;
    const folderName = safeProjectFileName(requestedName);
    if (!folderName) return;
    const testPath = joinTestPath(folderPath, folderName);
    const filePath = projectPathForTestPath(testPath);
    if (projectFiles.some((file) => file.path.toLowerCase() === filePath.toLowerCase())) {
      await dialogs.alert({
        title: "Name already exists",
        description: "A file or folder with that name already exists.",
      });
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
