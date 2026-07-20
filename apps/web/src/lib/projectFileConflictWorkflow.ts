import type { ProjectSaveConflict } from "./projectSaveConflicts.ts";

interface ProjectFileConflictWorkflowState {
  conflict: ProjectSaveConflict | null;
  fileOperationBusy: boolean;
}

interface SaveProjectConflictRecoveryCopyOptions extends ProjectFileConflictWorkflowState {
  saveRecoveryCopy: () => Promise<unknown>;
}

interface ReloadProjectConflictFileOptions extends ProjectFileConflictWorkflowState {
  confirmReload: () => Promise<boolean>;
  reloadFromDisk: () => Promise<unknown>;
}

export type ProjectFileConflictWorkflowResult = "ignored" | "cancelled" | "completed";

export async function saveProjectConflictRecoveryCopy({
  conflict,
  fileOperationBusy,
  saveRecoveryCopy,
}: SaveProjectConflictRecoveryCopyOptions): Promise<ProjectFileConflictWorkflowResult> {
  if (!conflict || fileOperationBusy) return "ignored";
  await saveRecoveryCopy();
  return "completed";
}

export async function reloadProjectConflictFile({
  conflict,
  fileOperationBusy,
  confirmReload,
  reloadFromDisk,
}: ReloadProjectConflictFileOptions): Promise<ProjectFileConflictWorkflowResult> {
  if (!conflict || fileOperationBusy) return "ignored";
  if (!(await confirmReload())) return "cancelled";
  await reloadFromDisk();
  return "completed";
}
