import { projectFileConflictFromError } from "./projectSaveConflicts.ts";

export const AGENT_BRIDGE_SAVE_CONFLICT_FALLBACK = "Project file save failed; live editor state was not mutated.";

export function editorAgentBridgeSaveConflictMessage(error: unknown, filePath: string, localRevision: number | null): string {
  return projectFileConflictFromError(error, filePath, localRevision)?.message ?? AGENT_BRIDGE_SAVE_CONFLICT_FALLBACK;
}
