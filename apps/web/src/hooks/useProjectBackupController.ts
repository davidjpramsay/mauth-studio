import type { ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import type { MauthDialogActions } from "@/hooks/useMauthDialogController";
import type { ProjectFilesStatus } from "@/hooks/useProjectFilesController";
import { downloadProjectBackup, getDefaultProject, importProjectBackup, listProjectFiles } from "@/lib/api";
import { TEST_FILE_ROOT_LABEL } from "@/lib/projectFiles";

interface UseProjectBackupControllerOptions {
  activeProject: ProjectSummary | null;
  activeProjectFilePath: string | null;
  hasUnsavedProjectChanges: boolean;
  currentProjectFileName: string;
  writeCurrentTestProjectFile: (filePath: string, testName: string) => Promise<void>;
  saveCurrentTestToProjectFile: (folderPath?: string) => Promise<void>;
  refreshLogoLibraryFromDisk: () => Promise<void>;
  setActiveProject: (project: ProjectSummary) => void;
  setProjectFiles: (files: ProjectFileSummary[]) => void;
  setProjectFilesStatus: (status: ProjectFilesStatus) => void;
  setProjectFilesMessage: (message: string) => void;
  dialogs: MauthDialogActions;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function useProjectBackupController({
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
}: UseProjectBackupControllerOptions) {
  async function currentProject() {
    return activeProject ?? (await getDefaultProject());
  }

  async function refreshProjectFiles(project: ProjectSummary) {
    const refreshedFiles = await listProjectFiles(project.id);
    setActiveProject(project);
    setProjectFiles(refreshedFiles.files);
  }

  async function exportCurrentProjectBackup() {
    try {
      setProjectFilesStatus("saving");
      setProjectFilesMessage("Preparing backup");

      if (activeProjectFilePath && hasUnsavedProjectChanges) {
        await writeCurrentTestProjectFile(activeProjectFilePath, currentProjectFileName);
      } else if (!activeProjectFilePath) {
        const shouldSaveDraft = await dialogs.confirm({
          title: "Save before backup",
          description: `This test is not saved as a file yet. Save it into ${TEST_FILE_ROOT_LABEL} before creating the backup?`,
          confirmLabel: "Save and backup",
        });
        if (shouldSaveDraft) {
          await saveCurrentTestToProjectFile("");
        }
      }

      const project = await currentProject();
      const backup = await downloadProjectBackup(project.id);
      downloadBlob(backup.blob, backup.fileName);
      await refreshProjectFiles(project);
      setProjectFilesStatus("ready");
      setProjectFilesMessage(`Created backup ${backup.fileName}`);
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Backup failed");
    }
  }

  async function importProjectBackupFile(file: File) {
    const shouldImport = await dialogs.confirm({
      title: "Import backup",
      description: `Import "${file.name}"? Existing files will not be overwritten; matching file names are imported with a new name.`,
      confirmLabel: "Import",
    });
    if (!shouldImport) return;

    try {
      setProjectFilesStatus("saving");
      setProjectFilesMessage("Importing backup");
      const project = await currentProject();
      const result = await importProjectBackup(project.id, file);
      await refreshProjectFiles(project);
      await refreshLogoLibraryFromDisk();
      setProjectFilesStatus("ready");
      setProjectFilesMessage(
        `Imported ${result.importedFiles} file${result.importedFiles === 1 ? "" : "s"}, ${result.importedFolders} folder${
          result.importedFolders === 1 ? "" : "s"
        }, ${result.importedLogos} logo${result.importedLogos === 1 ? "" : "s"}`,
      );
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Import failed");
    }
  }

  return {
    exportCurrentProjectBackup,
    importProjectBackupFile,
  };
}
