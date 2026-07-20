import type { MauthAgentFileState, ProjectSummary } from "@mauth-studio/shared";

import type { MauthDocumentFlowItem, MauthDocumentLike, MauthQuestionLike, MauthSectionHeadingLike } from "./mauthActions.ts";

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

export interface BuildMauthAgentFileStateForDocumentInput<Q extends MauthQuestionLike, F extends object, C extends object, TLogo> {
  activeProject?: Pick<ProjectSummary, "id" | "name"> | null;
  activePath?: string | null;
  activeRevision?: number | null;
  document: MauthDocumentLike<Q, F, C>;
  logos: TLogo[];
  lastProjectSaveFingerprint?: string | null;
  fileOperationBusy?: boolean;
  hasRevisionIssue?: boolean;
  autosaveStatus?: string;
  autosaveMessage?: string;
  normalizeFormattingConfig: (value: unknown) => C;
  normalizeSectionHeadings: (value: unknown) => MauthSectionHeadingLike[];
  normalizeDocumentFlow: (value: unknown, questions: Q[], sectionHeadings: MauthSectionHeadingLike[]) => MauthDocumentFlowItem[];
  selectedLogoForFrontMatter: (logos: TLogo[], frontMatter: F) => TLogo | null | undefined;
  editorDocumentFingerprint: (
    frontMatter: F,
    questions: Q[],
    formattingConfig: C,
    logo?: TLogo | null,
    sectionHeadings?: MauthSectionHeadingLike[],
    documentFlow?: MauthDocumentFlowItem[],
  ) => string;
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

export function buildMauthAgentFileStateForDocument<Q extends MauthQuestionLike, F extends object, C extends object, TLogo>({
  activeProject,
  activePath,
  activeRevision,
  document,
  logos,
  lastProjectSaveFingerprint,
  fileOperationBusy,
  hasRevisionIssue,
  autosaveStatus,
  autosaveMessage,
  normalizeFormattingConfig,
  normalizeSectionHeadings,
  normalizeDocumentFlow,
  selectedLogoForFrontMatter,
  editorDocumentFingerprint,
}: BuildMauthAgentFileStateForDocumentInput<Q, F, C, TLogo>): MauthAgentFileState {
  const normalizedFormattingConfig = normalizeFormattingConfig(document.formattingConfig);
  const normalizedSectionHeadings = normalizeSectionHeadings(document.sectionHeadings);
  const normalizedDocumentFlow = normalizeDocumentFlow(document.documentFlow, document.questions, normalizedSectionHeadings);
  const documentFingerprint = editorDocumentFingerprint(
    document.frontMatter,
    document.questions,
    normalizedFormattingConfig,
    selectedLogoForFrontMatter(logos, document.frontMatter),
    normalizedSectionHeadings,
    normalizedDocumentFlow,
  );

  return buildMauthAgentFileState({
    projectId: activeProject?.id ?? null,
    projectName: activeProject?.name ?? null,
    activePath,
    activeRevision,
    documentFingerprint,
    lastProjectSaveFingerprint,
    fileOperationBusy,
    hasRevisionIssue,
    autosaveStatus,
    autosaveMessage,
  });
}
