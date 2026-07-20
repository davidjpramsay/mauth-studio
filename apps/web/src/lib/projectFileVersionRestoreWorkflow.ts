import { projectFileTransitionCanProceed, type ProjectFileTransitionOutcome } from "./projectFileBeforeOpenWorkflow.ts";

export type ProjectFileVersionRestoreOutcome = "restored" | "cancelled" | "blocked";

interface RestoreProjectFileVersionWithSessionOptions {
  activeFile: boolean;
  prepareCurrentDocument: () => Promise<ProjectFileTransitionOutcome>;
  restoreVersion: () => Promise<void>;
}

export async function restoreProjectFileVersionWithSession({
  activeFile,
  prepareCurrentDocument,
  restoreVersion,
}: RestoreProjectFileVersionWithSessionOptions): Promise<ProjectFileVersionRestoreOutcome> {
  if (activeFile) {
    const outcome = await prepareCurrentDocument();
    if (!projectFileTransitionCanProceed(outcome)) {
      return outcome === "cancelled" ? "cancelled" : "blocked";
    }
  }

  await restoreVersion();
  return "restored";
}
