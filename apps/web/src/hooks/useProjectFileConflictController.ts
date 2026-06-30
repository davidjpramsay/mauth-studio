import type { MauthDialogActions } from "@/hooks/useMauthDialogController";
import type { ProjectSaveConflict } from "@/hooks/useProjectFilesController";

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
    if (!conflict || fileOperationBusy) return;
    await saveRecoveryCopy();
  }

  async function reloadConflictFileFromDisk() {
    if (!conflict || fileOperationBusy) return;
    const shouldReload = await dialogs.confirm({
      title: "Reload disk file?",
      description: `Reload "${currentProjectFileName}" from disk? Local unsaved changes in the editor will be discarded. Save a recovery copy first if you need to keep them.`,
      confirmLabel: "Reload from disk",
      destructive: true,
    });
    if (!shouldReload) return;
    await reloadFromDisk();
  }

  return {
    saveConflictRecoveryCopy,
    reloadConflictFileFromDisk,
  };
}
