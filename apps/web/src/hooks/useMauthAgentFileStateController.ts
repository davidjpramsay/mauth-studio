import type { MutableRefObject } from "react";
import type { ProjectSummary } from "@mauth-studio/shared";

import type { DraftAutosaveStatus } from "@/hooks/useProjectFileStatus";
import { buildMauthAgentFileStateForDocument, type BuildMauthAgentFileStateForDocumentInput } from "@/lib/mauthAgentFileState";
import type { MauthDocumentLike, MauthQuestionLike } from "@/lib/mauthActions";

interface UseMauthAgentFileStateControllerOptions<Q extends MauthQuestionLike, F extends object, C extends object, TLogo> {
  activeProject: ProjectSummary | null;
  activeProjectFilePathRef: MutableRefObject<string | null>;
  activeProjectFileRevisionRef: MutableRefObject<number | null>;
  lastProjectSaveFingerprintRef: MutableRefObject<string | null>;
  logosRef: MutableRefObject<TLogo[]>;
  fileOperationBusy: boolean;
  hasRevisionIssue: boolean;
  autosaveStatus: DraftAutosaveStatus;
  autosaveMessage: string;
  normalizeFormattingConfig: BuildMauthAgentFileStateForDocumentInput<Q, F, C, TLogo>["normalizeFormattingConfig"];
  normalizeSectionHeadings: BuildMauthAgentFileStateForDocumentInput<Q, F, C, TLogo>["normalizeSectionHeadings"];
  normalizeDocumentFlow: BuildMauthAgentFileStateForDocumentInput<Q, F, C, TLogo>["normalizeDocumentFlow"];
  selectedLogoForFrontMatter: BuildMauthAgentFileStateForDocumentInput<Q, F, C, TLogo>["selectedLogoForFrontMatter"];
  editorDocumentFingerprint: BuildMauthAgentFileStateForDocumentInput<Q, F, C, TLogo>["editorDocumentFingerprint"];
}

export function useMauthAgentFileStateController<Q extends MauthQuestionLike, F extends object, C extends object, TLogo>({
  activeProject,
  activeProjectFilePathRef,
  activeProjectFileRevisionRef,
  lastProjectSaveFingerprintRef,
  logosRef,
  fileOperationBusy,
  hasRevisionIssue,
  autosaveStatus,
  autosaveMessage,
  normalizeFormattingConfig,
  normalizeSectionHeadings,
  normalizeDocumentFlow,
  selectedLogoForFrontMatter,
  editorDocumentFingerprint,
}: UseMauthAgentFileStateControllerOptions<Q, F, C, TLogo>) {
  function agentFileState(document: MauthDocumentLike<Q, F, C>) {
    return buildMauthAgentFileStateForDocument({
      activeProject,
      activePath: activeProjectFilePathRef.current,
      activeRevision: activeProjectFileRevisionRef.current,
      document,
      logos: logosRef.current,
      lastProjectSaveFingerprint: lastProjectSaveFingerprintRef.current,
      fileOperationBusy,
      hasRevisionIssue,
      autosaveStatus,
      autosaveMessage,
      normalizeFormattingConfig,
      normalizeSectionHeadings,
      normalizeDocumentFlow,
      selectedLogoForFrontMatter,
      editorDocumentFingerprint,
    });
  }

  return { agentFileState };
}
