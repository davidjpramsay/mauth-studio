import type { MauthDialogActions } from "@/hooks/useMauthDialogController";
import type { ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import { reloadProjectConflictFile, saveProjectConflictRecoveryCopy } from "@/lib/projectFileConflictWorkflow";

interface UseProjectFileConflictControllerOptions {
  conflict: ProjectSaveConflict | null;
  fileOperationBusy: boolean;
  currentProjectFileName: string;
  dialogs: MauthDialogActions;
  saveRecoveryCopy: () => Promise<unknown>;
  reloadFromDisk: () => Promise<unknown>;
}

export function useProjectFileConflictController({
  conflict,
  fileOperationBusy,
  currentProjectFileName,
  dialogs,
  saveRecoveryCopy,
  reloadFromDisk,
}: UseProjectFileConflictControllerOptions) {
  async function saveConflictRecoveryCopy() {
    await saveProjectConflictRecoveryCopy({ conflict, fileOperationBusy, saveRecoveryCopy });
  }

  async function reloadConflictFileFromDisk() {
    await reloadProjectConflictFile({
      conflict,
      fileOperationBusy,
      confirmReload: () =>
        dialogs.confirm({
          title: "Reload disk file?",
          description: `Reload "${currentProjectFileName}" from disk? Local unsaved changes in the editor will be discarded. Save a recovery copy first if you need to keep them.`,
          confirmLabel: "Reload from disk",
          destructive: true,
        }),
      reloadFromDisk,
    });
  }

  return {
    saveConflictRecoveryCopy,
    reloadConflictFileFromDisk,
  };
}
