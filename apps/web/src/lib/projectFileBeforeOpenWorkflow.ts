export type ProjectFileTransitionChoice = "save-recovery" | "open-without-saving";

export type ProjectFileTransitionIntent =
  | { kind: "open-file"; targetLabel?: string }
  | { kind: "switch-folder" }
  | { kind: "restore-version"; targetLabel: string; revision: number };

export interface ProjectFileTransitionCopy {
  conflictDescription: string;
  recoveryLabel: string;
  discardLabel: string;
  cancelledMessage: string;
  recoveryFailedMessage: string;
  recoverySavedMessage: string;
  discardMessage: string;
}

export type ProjectFileTransitionOutcome =
  | "unchanged"
  | "saved"
  | "recovery-saved"
  | "open-without-saving"
  | "cancelled"
  | "recovery-failed";

interface ResolveProjectFileTransitionOptions {
  shouldSave: boolean;
  saveCurrentFile: () => Promise<void>;
  isRecoverableSaveConflict: (error: unknown) => boolean;
  chooseConflictAction: () => Promise<ProjectFileTransitionChoice | null>;
  saveRecoveryCopy: () => Promise<void>;
}

export function projectFileTransitionCanProceed(outcome: ProjectFileTransitionOutcome) {
  return outcome === "unchanged" || outcome === "saved" || outcome === "recovery-saved" || outcome === "open-without-saving";
}

export function projectFileTransitionCopy(currentFileName: string, intent: ProjectFileTransitionIntent): ProjectFileTransitionCopy {
  const conflictStart = `Mauth could not save "${currentFileName}" because its file changed on disk.`;

  if (intent.kind === "restore-version") {
    return {
      conflictDescription: `${conflictStart} What should happen before restoring "${intent.targetLabel}" to revision ${intent.revision}?`,
      recoveryLabel: "Save recovery copy and restore",
      discardLabel: "Restore without saving",
      cancelledMessage: "Restore cancelled; local changes kept",
      recoveryFailedMessage: "Recovery copy failed; restore cancelled",
      recoverySavedMessage: "Saved recovery copy before restoring",
      discardMessage: "Restoring without saving local changes",
    };
  }

  if (intent.kind === "switch-folder") {
    return {
      conflictDescription: `${conflictStart} What should happen before changing the documents folder?`,
      recoveryLabel: "Save recovery copy and change folder",
      discardLabel: "Change folder without saving",
      cancelledMessage: "Folder change cancelled; local changes kept",
      recoveryFailedMessage: "Recovery copy failed; folder change cancelled",
      recoverySavedMessage: "Saved recovery copy before changing folder",
      discardMessage: "Changing folder without saving local changes",
    };
  }

  const target = intent.targetLabel ? ` "${intent.targetLabel}"` : " another file";
  return {
    conflictDescription: `${conflictStart} What should happen before opening${target}?`,
    recoveryLabel: "Save recovery copy and open",
    discardLabel: "Open without saving",
    cancelledMessage: "Open cancelled; local changes kept",
    recoveryFailedMessage: "Recovery copy failed; open cancelled",
    recoverySavedMessage: "Saved recovery copy before opening",
    discardMessage: "Opening without saving local changes",
  };
}

export async function resolveProjectFileTransition({
  shouldSave,
  saveCurrentFile,
  isRecoverableSaveConflict,
  chooseConflictAction,
  saveRecoveryCopy,
}: ResolveProjectFileTransitionOptions): Promise<ProjectFileTransitionOutcome> {
  if (!shouldSave) return "unchanged";

  try {
    await saveCurrentFile();
    return "saved";
  } catch (error) {
    if (!isRecoverableSaveConflict(error)) throw error;
  }

  const choice = await chooseConflictAction();
  if (choice === null) return "cancelled";
  if (choice === "open-without-saving") return "open-without-saving";

  try {
    await saveRecoveryCopy();
    return "recovery-saved";
  } catch {
    return "recovery-failed";
  }
}
