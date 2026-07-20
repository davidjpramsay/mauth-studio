import type { MutableRefObject } from "react";
import type { FormattingConfig, MauthAgentSnapshot, ProjectSummary } from "@mauth-studio/shared";

import { useMauthAgentBridgeController } from "@/hooks/useMauthAgentBridgeController";
import { useMauthAgentFileStateController } from "@/hooks/useMauthAgentFileStateController";
import type { DraftAutosaveStatus } from "@/hooks/useProjectFileStatus";
import { editorAgentBridgeSaveConflictMessage } from "@/lib/editorAgentBridge";
import {
  editorDocumentFingerprint,
  normalizeDocumentFlow,
  normalizeSectionHeadings,
  solutionValidationRuntime,
  type EditorDocumentState,
} from "@/lib/editorApplicationRuntime";
import { normalizeFormattingConfig } from "@/lib/editorFormattingConfig";
import type { FrontMatterConfig } from "@/lib/frontMatterConfig";
import { selectedLogoForFrontMatter, type LogoAsset } from "@/lib/logoLibrary";
import type { MauthDocumentAction, MauthDocumentActionResult } from "@/lib/mauthActions";
import { validateSolutionCompleteness } from "@/lib/solutionValidation";
import type { QuestionBlock } from "@/lib/editorDocumentNormalization";

type EditorAgentActionEvaluator = (
  actions: MauthDocumentAction[],
) => MauthDocumentActionResult<QuestionBlock, FrontMatterConfig, FormattingConfig>;

interface UseEditorAgentBridgeControllerOptions {
  enabled: boolean;
  activeProject: ProjectSummary | null;
  activeProjectFilePathRef: MutableRefObject<string | null>;
  activeProjectFileRevisionRef: MutableRefObject<number | null>;
  lastProjectSaveFingerprintRef: MutableRefObject<string | null>;
  logosRef: MutableRefObject<LogoAsset[]>;
  questionsRef: MutableRefObject<QuestionBlock[]>;
  frontMatterRef: MutableRefObject<FrontMatterConfig>;
  fileOperationBusy: boolean;
  hasRevisionIssue: boolean;
  autosaveStatus: DraftAutosaveStatus;
  autosaveMessage: string;
  previewWarnings: MauthAgentSnapshot["warnings"];
  currentDocument: () => EditorDocumentState;
  previewActions: EditorAgentActionEvaluator;
  applyActionsWithoutCommit: EditorAgentActionEvaluator;
  commitDocument: (document: EditorDocumentState) => void;
  writeEditorDocumentToProjectFile: (filePath: string, testName: string, document: EditorDocumentState) => Promise<void>;
  currentProjectFileName: string;
}

export function useEditorAgentBridgeController({
  enabled,
  activeProject,
  activeProjectFilePathRef,
  activeProjectFileRevisionRef,
  lastProjectSaveFingerprintRef,
  logosRef,
  questionsRef,
  frontMatterRef,
  fileOperationBusy,
  hasRevisionIssue,
  autosaveStatus,
  autosaveMessage,
  previewWarnings,
  currentDocument,
  previewActions,
  applyActionsWithoutCommit,
  commitDocument,
  writeEditorDocumentToProjectFile,
  currentProjectFileName,
}: UseEditorAgentBridgeControllerOptions) {
  const { agentFileState } = useMauthAgentFileStateController<QuestionBlock, FrontMatterConfig, FormattingConfig, LogoAsset>({
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
  });

  useMauthAgentBridgeController<QuestionBlock, FrontMatterConfig, FormattingConfig>({
    enabled,
    currentDocument,
    fileState: agentFileState,
    validate: () => validateSolutionCompleteness(questionsRef.current, solutionValidationRuntime(frontMatterRef.current)),
    warnings: () => previewWarnings,
    previewActions,
    applyActionsWithoutCommit,
    commitDocument: (document) => commitDocument(document as EditorDocumentState),
    activeFilePath: () => activeProjectFilePathRef.current,
    saveAppliedDocument: (filePath, document) =>
      writeEditorDocumentToProjectFile(filePath, currentProjectFileName, document as EditorDocumentState),
    saveConflictMessage: (error, filePath) => editorAgentBridgeSaveConflictMessage(error, filePath, activeProjectFileRevisionRef.current),
  });
}
