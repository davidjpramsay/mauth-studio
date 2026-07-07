import type { MauthAgentFileState } from "@mauth-studio/shared";

export interface BuildMauthAgentFileStateInput {
  projectId?: string | null;
  projectName?: string | null;
  activePath?: string | null;
  activeRevision?: number | null;
  documentFingerprint: string;
  lastProjectSaveFingerprint?: string | null;
  fileOperationBusy?: boolean;
  hasRevisionIssue?: boolean;
  autosaveStatus?: string;
  autosaveMessage?: string;
}

export function buildMauthAgentFileState({
  projectId,
  projectName,
  activePath,
  activeRevision,
  documentFingerprint,
  lastProjectSaveFingerprint,
  fileOperationBusy = false,
  hasRevisionIssue = false,
  autosaveStatus,
  autosaveMessage,
}: BuildMauthAgentFileStateInput): MauthAgentFileState {
  const dirty = Boolean(activePath && lastProjectSaveFingerprint !== documentFingerprint);
  const saveStatus: MauthAgentFileState["saveStatus"] = fileOperationBusy
    ? "loading"
    : hasRevisionIssue
      ? "conflict"
      : activePath
        ? dirty
          ? "dirty"
          : "saved"
        : "draft";

  return {
    projectId,
    projectName,
    activePath,
    activeRevision,
    dirty,
    saveStatus,
    autosaveStatus,
    autosaveMessage,
  };
}
