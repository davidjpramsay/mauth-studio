import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormattingConfig, MauthAgentOpenDocument, ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import { tocSummaryText } from "@/components/navigation/DocumentNavigator";
import { DocumentNavigationWorkspace } from "@/components/navigation/DocumentNavigationWorkspace";
import { NEW_TEST_TEMPLATES } from "@/components/new-document/NewTestDialog";
import { AppHeaderWorkspace } from "@/components/shell/AppHeaderWorkspace";
import { DocumentEditorWorkspaceBindings } from "@/components/shell/DocumentEditorWorkspaceBindings";
import { AppOverlayWorkspace } from "@/components/shell/AppOverlayWorkspace";
import { EmptyDocumentStart } from "@/components/shell/EmptyDocumentStart";
import { useDocumentSessionController } from "@/hooks/useDocumentSessionController";
import { useDesktopDocumentOpenController } from "@/hooks/useDesktopDocumentOpenController";
import { useEditorAgentBridgeController } from "@/hooks/useEditorAgentBridgeController";
import { useEditorDocumentStateController } from "@/hooks/useEditorDocumentStateController";
import { useEditorDocumentTabsController } from "@/hooks/useEditorDocumentTabsController";
import { useEditorDocumentActionsController } from "@/hooks/useEditorDocumentActionsController";
import { useEditorProjectFileManagementController } from "@/hooks/useEditorProjectFileManagementController";
import { useEditorManualSolutionController } from "@/hooks/useEditorManualSolutionController";
import { useEditorStorageHydrationController } from "@/hooks/useEditorStorageHydrationController";
import { useEditorWorkspacePresentationController } from "@/hooks/useEditorWorkspacePresentationController";
import { useLogoLibraryController } from "@/hooks/useLogoLibraryController";
import { useNestedEditorDragController, useNestedEditorDragState } from "@/hooks/useNestedEditorDragController";
import { useNewDocumentController } from "@/hooks/useNewDocumentController";
import { useQuestionPageBreakDragController, useQuestionPageBreakDragState } from "@/hooks/useQuestionPageBreakDragController";
import { getEditorSession, listProjectFiles, openDefaultProjectDocumentsFolder, saveEditorSession, saveStorageAutosave } from "@/lib/api";
import { parseMauthDocumentActionProposal } from "@/lib/mauthActionProposal";
import { useEditorProjectPersistenceController } from "@/hooks/useEditorProjectPersistenceController";
import { useMauthDialogController } from "@/hooks/useMauthDialogController";
import type { DraftAutosaveStatus } from "@/hooks/useProjectFileStatus";
import { usePrintController } from "@/hooks/usePrintController";
import { usePreviewReadinessController } from "@/hooks/usePreviewReadinessController";
import { useEditorNavigationController } from "@/hooks/useEditorNavigationController";
import { useEditorContextActionsController } from "@/hooks/useEditorContextActionsController";
import { useEditorContextCommandController } from "@/hooks/useEditorContextCommandController";
import { useEditorContextMenuController } from "@/hooks/useEditorContextMenuController";
import { useEditorSectionHeadingController } from "@/hooks/useEditorSectionHeadingController";
import { useEditorSelectionController } from "@/hooks/useEditorSelectionController";
import { useMauthActionProposalController } from "@/hooks/useMauthActionProposalController";
import { useSolutionModeController } from "@/hooks/useSolutionModeController";
import { useSavedProjectDocumentApplier } from "@/hooks/useSavedProjectDocumentApplier";
import { useSystemStatusController } from "@/hooks/useSystemStatusController";
import { useThemeController } from "@/hooks/useThemeController";
import { useUnsavedChangesBeforeUnloadController } from "@/hooks/useUnsavedChangesBeforeUnloadController";
import { useProjectFilesController } from "@/hooks/useProjectFilesController";
import { useStableEvent } from "@/hooks/useStableEvent";
import { missingProjectRevisionConflict, projectFileConflictFromError } from "@/lib/projectSaveConflicts";
import {
  isProjectTestFile,
  projectPathForTestPath,
  testFileDisplayName,
  testFilePathKey,
  testPathBasename,
  testPathFromProjectPath,
  uniqueTestPath,
} from "@/lib/projectFiles";
import { defaultSavedTestName, printFileNameForDocument } from "@/lib/documentFileNaming";
import {
  loadBrowserDocumentTabsSession,
  normalizePersistedEditorDocumentTabsSession,
  saveBrowserDocumentTabsSession,
} from "@/lib/editorDocumentTabPersistence";
import {
  draftDocumentTabId,
  persistedDocumentTabsSession,
  savedDocumentTabId,
  type EditorDocumentTab,
  type PersistedEditorDocumentTabsSession,
} from "@/lib/editorDocumentTabs";
import {
  defaultProjectFileNameForDocument,
  MAUTH_DOCUMENT_FORMAT,
  MAUTH_DOCUMENT_SCHEMA_VERSION,
  parseProjectSavedDocument,
  serializeProjectDocumentSnapshot,
} from "@/lib/projectDocumentSerialization";
import { scrollToAnchorPosition } from "@/lib/editorDomNavigation";
import { createEditorContextDescriptorRuntime } from "@/lib/editorContextDescriptors";
import { PROJECT_FILE_REVISION_MISSING_ERROR, type AutosavedEditorSnapshot, type SavedTest } from "@/lib/editorAppPersistence";
import { dragPlacementFromEvent, setEditorDragImage } from "@/lib/editorDragDom";
import { createEditorContentMutationActions } from "@/lib/editorContentMutationActions";
import { createEditorBlockContextRuntime } from "@/lib/editorBlockContexts";
import { existingOrFirstQuestionId, firstDocumentFlowAnchor, firstQuestionId } from "@/lib/editorSectionHeadings";
import {
  withNormalizedPartOrder,
  withNormalizedQuestionOrder,
  type DocumentFlowItem,
  type DocumentSectionHeading,
  type EditorPart,
  type QuestionBlock,
} from "@/lib/editorDocumentNormalization";
import type { EditorPaneMode } from "@/lib/editorWorkspacePresentation";
import { questionHasPageBreak } from "@/lib/editorQuestionLifecycle";
import { createEditorQuestionLifecycleController } from "@/lib/editorQuestionLifecycleController";
import { DEFAULT_FORMATTING_CONFIG, normalizeFormattingConfig } from "@/lib/editorFormattingConfig";
import {
  DEFAULT_FRONT_MATTER,
  normalizeFrontMatter,
  titlePageTemplateFromValue,
  type FrontMatterConfig,
  type TitlePageTemplate,
} from "@/lib/frontMatterConfig";
import { createFrontMatterLogoActions } from "@/lib/frontMatterLogoActions";
import { selectedLogoForFrontMatter } from "@/lib/logoLibrary";
import { type DocumentTocItem } from "@/lib/documentNavigation";
import { diagramTypePatch, updateGraphConfig, withGraphDefaults } from "@/lib/editorDiagramConfig";
import { createTemplateEditorDocumentPlan } from "@/lib/editorStarterDocuments";
import { nativeKeyboardDeleteRequested } from "@/lib/editorKeyboardShortcuts";
import { validateSolutionCompleteness } from "@/lib/solutionValidation";
import {
  SCROLL_ANCHOR_FRONT_MATTER,
  graphChildParentScrollAnchor,
  pageBreakQuestionIdFromScrollAnchor,
  previewAnchorForEditorAnchor,
  previewAnchorFromEventTarget,
  questionIdFromScrollAnchor,
  questionScrollAnchor,
  scrollAnchorContains,
  scrollAnchorFallbacks,
  sectionHeadingIdFromScrollAnchor,
} from "@/lib/scrollAnchors";
import {
  EDITOR_HISTORY_LIMIT,
  contentBlockForKind,
  createNotesSection,
  createQuestion,
  createSavedTestSnapshot,
  diagramBlockForType,
  documentFlowFromQuestionChange,
  duplicateColumnBlockAtPath,
  duplicatedContentBlock,
  duplicatedPart,
  duplicatedQuestion,
  duplicatedSubpart,
  editorAppPersistence,
  editorDocumentFingerprint,
  keyboardTargetConsumesGlobalDelete,
  loadInitialEditorDraft,
  loadLegacySavedTests,
  normalizeDocumentFlow,
  normalizeQuestionBlocks,
  normalizeSavedTest,
  normalizeSectionHeadings,
  persistCurrentDraft,
  projectFileVersionPreview,
  selectedEditorBlockFromAnchor,
  solutionValidationRuntime,
  textBlock,
  tocBlockSummary,
  type EditorDocumentState,
  type EditorHistorySnapshot,
  type SelectedEditorBlock,
} from "@/lib/editorApplicationRuntime";

const PREVIEW_EDIT_CLICK_MOVE_TOLERANCE_PX = 6;
const AUTOSAVE_DEBOUNCE_MS = 900;
const LOCAL_DRAFT_DEBOUNCE_MS = 250;
const ACTIVE_PROJECT_FILE_SYNC_INTERVAL_MS = 4000;

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeDocumentTabDocument(value: unknown): EditorDocumentState | null {
  const snapshot = editorAppPersistence.normalizeEditorSnapshot(value);
  if (!snapshot) return null;
  return {
    frontMatter: snapshot.frontMatter,
    questions: snapshot.questions,
    sectionHeadings: snapshot.sectionHeadings,
    documentFlow: snapshot.documentFlow,
    formattingConfig: snapshot.formattingConfig,
  };
}

function agentDocumentTabSummary(tab: EditorDocumentTab, activeTabId: string | null): MauthAgentOpenDocument {
  const saveStatus: MauthAgentOpenDocument["saveStatus"] =
    tab.saveStatus === "saved"
      ? "saved"
      : tab.saveStatus === "dirty"
        ? "dirty"
        : tab.saveStatus === "draft"
          ? "draft"
          : tab.saveStatus === "conflict" || tab.saveStatus === "error"
            ? "conflict"
            : tab.saveStatus === "loading" || tab.saveStatus === "saving"
              ? "loading"
              : "unknown";
  return {
    id: tab.id,
    title: tab.title,
    active: tab.id === activeTabId,
    path: tab.filePath,
    revision: tab.revision,
    dirty: tab.dirty,
    saveStatus,
  };
}

export default function App() {
  const mauthDialogs = useMauthDialogController();
  const initialEditorDraft = loadInitialEditorDraft();
  const initialEditorDocumentOpen = initialEditorDraft?.documentOpen !== false;
  const initialQuestions = useMemo(() => initialEditorDraft?.questions ?? [], [initialEditorDraft]);
  const initialSectionHeadings = useMemo(() => initialEditorDraft?.sectionHeadings ?? [], [initialEditorDraft]);
  const initialDocumentFlow = useMemo(
    () => normalizeDocumentFlow(initialEditorDraft?.documentFlow, initialQuestions, initialSectionHeadings),
    [initialEditorDraft, initialQuestions, initialSectionHeadings],
  );
  const [draftAutosaveStatus, setDraftAutosaveStatus] = useState<DraftAutosaveStatus>("loading");
  const [draftAutosaveMessage, setDraftAutosaveMessage] = useState("Loading draft autosave");
  const [storageHydrated, setStorageHydrated] = useState(false);
  const questionPageBreakDragState = useQuestionPageBreakDragState();
  const {
    logos,
    logosRef,
    replaceLogoLibrary,
    refreshLogoLibraryFromDisk,
    writeLogoToDisk,
    importLogo,
    updateLogoAsset,
    appendLogoAsset,
    removeLogoAsset,
    deleteLogoFromDisk,
  } = useLogoLibraryController({
    draftAutosaveStatus,
    setDraftAutosaveStatus,
    setDraftAutosaveMessage,
  });
  const [legacySavedTests, setLegacySavedTests] = useState<SavedTest[]>(loadLegacySavedTests);
  const {
    draggedQuestionId,
    setDraggedQuestionId,
    dragOverQuestion,
    setDragOverQuestion,
    draggedPageBreakQuestionId,
    setDraggedPageBreakQuestionId,
    dragOverPageBreak,
    setDragOverPageBreak,
    clearQuestionPageBreakDrag,
  } = questionPageBreakDragState;
  const nestedEditorDragState = useNestedEditorDragState();
  const { clearNestedEditorDrag } = nestedEditorDragState;
  const [paneMode, setPaneMode] = useState<EditorPaneMode>("preview");
  const [tocOpen, setTocOpen] = useState(false);
  const [activeTocItemId, setActiveTocItemId] = useState(() => firstDocumentFlowAnchor(initialDocumentFlow, initialQuestions));
  const [activeRailItemId, setActiveRailItemId] = useState(() => firstDocumentFlowAnchor(initialDocumentFlow, initialQuestions));
  const [activeQuestionId, setActiveQuestionId] = useState(() => firstQuestionId(initialQuestions));
  function clearEditorTransientState() {
    clearQuestionPageBreakDrag();
    clearNestedEditorDrag();
  }

  const editorDocumentStateController = useEditorDocumentStateController<
    FrontMatterConfig,
    QuestionBlock,
    DocumentSectionHeading,
    DocumentFlowItem,
    FormattingConfig,
    EditorHistorySnapshot
  >({
    historyLimit: EDITOR_HISTORY_LIMIT,
    initialFrontMatter: initialEditorDraft?.frontMatter ?? DEFAULT_FRONT_MATTER,
    initialQuestions,
    initialSectionHeadings,
    initialDocumentFlow,
    initialFormattingConfig: initialEditorDraft?.formattingConfig ?? DEFAULT_FORMATTING_CONFIG,
    initialDocumentOpen: initialEditorDocumentOpen,
    normalizeQuestions: normalizeQuestionBlocks,
    normalizeSectionHeadings,
    normalizeDocumentFlow,
    normalizeFormattingConfig,
    documentFlowFromQuestionChange,
    getActiveQuestionId: () => activeQuestionId,
    getActiveTocItemId: () => activeTocItemId,
    existingOrFirstQuestionId,
    questionScrollAnchor,
    frontMatterAnchor: SCROLL_ANCHOR_FRONT_MATTER,
    firstDocumentFlowAnchor,
    sectionHeadingIdFromScrollAnchor,
    questionIdFromScrollAnchor,
    setActiveQuestionId,
    setActiveTocItemId,
    setActiveRailItemId,
    onRestoreSnapshotExtra: (snapshot) => {
      if ("logo" in snapshot) importLogo(snapshot.logo);
    },
    clearTransientEditorState: clearEditorTransientState,
  });
  const {
    frontMatter,
    formattingConfig,
    editorDocumentOpen,
    setEditorDocumentOpenState,
    questions,
    sectionHeadings,
    documentFlow,
    frontMatterRef,
    formattingConfigRef,
    questionsRef,
    sectionHeadingsRef,
    documentFlowRef,
    editorDocumentOpenRef,
    currentEditorDocument,
    restoreEditorSnapshot,
    setEditorDocument,
    setQuestionsWithHistory,
    setEditorDocumentWithHistory,
    setSectionFlowWithHistory,
  } = editorDocumentStateController;
  const cleanUnsavedDocumentFingerprintRef = useRef<string | null>(
    initialEditorDraft
      ? null
      : editorDocumentFingerprint(
          DEFAULT_FRONT_MATTER,
          initialQuestions,
          DEFAULT_FORMATTING_CONFIG,
          selectedLogoForFrontMatter(logos, DEFAULT_FRONT_MATTER),
          initialSectionHeadings,
          initialDocumentFlow,
        ),
  );
  const [newTestDialogOpen, setNewTestDialogOpen] = useState(false);
  const [systemStatusPanelOpen, setSystemStatusPanelOpen] = useState(false);
  useEffect(() => {
    const removeAgentSetupListener = window.mauthDesktop?.onOpenAgentSetup(() => setSystemStatusPanelOpen(true));
    const removeSystemStatusListener = window.mauthDesktop?.onOpenSystemStatus(() => setSystemStatusPanelOpen(true));
    return () => {
      removeAgentSetupListener?.();
      removeSystemStatusListener?.();
    };
  }, []);
  const solutionModeController = useSolutionModeController(frontMatter);
  const {
    setShowSolutions,
    showSolutionsRef,
    isNotesTemplate,
    supportsSolutionTools,
    supportsSolutionValidation,
    effectiveShowSolutions,
    previewShowSolutions,
    insertedBlockVisibilityForKind: solutionInsertedBlockVisibilityForKind,
  } = solutionModeController;
  const systemStatusController = useSystemStatusController();
  const buildLegacySavedTestImport = useCallback((savedTest: SavedTest, filesForImport: ProjectFileSummary[]) => {
    const testPath = uniqueTestPath(filesForImport, "", savedTest.name, "file");
    return {
      path: projectPathForTestPath(testPath),
      content: JSON.stringify({ format: MAUTH_DOCUMENT_FORMAT, schemaVersion: MAUTH_DOCUMENT_SCHEMA_VERSION, ...savedTest }, null, 2),
    };
  }, []);
  const isVisibleProjectTestFile = useCallback((file: ProjectFileSummary) => {
    const testPath = testFilePathKey(file);
    return testPath !== null && testPath !== "" && isProjectTestFile(file);
  }, []);
  const projectFilesController = useProjectFilesController({
    initialActiveProjectFilePath: initialEditorDocumentOpen ? (initialEditorDraft?.activeProjectFilePath ?? null) : null,
    initialActiveProjectFileRevision: initialEditorDocumentOpen ? (initialEditorDraft?.activeProjectFileRevision ?? null) : null,
    legacySavedTests,
    storageHydrated,
    buildLegacySavedTestImport,
    isVisibleProjectFile: isVisibleProjectTestFile,
  });
  const {
    fileManagerOpen,
    setFileManagerOpen,
    openFileManager,
    activeProject,
    setActiveProject,
    projectFiles,
    setProjectFiles,
    projectFilesStatus,
    setProjectFilesStatus,
    projectFilesMessage,
    setProjectFilesMessage,
    activeProjectFilePath,
    setActiveProjectFilePath,
    activeProjectFileRevision,
    setActiveProjectFileRevision,
    projectSaveConflict,
    setProjectSaveConflict,
    refreshProjectFiles,
  } = projectFilesController;
  const themeController = useThemeController();
  useEffect(() => window.mauthDesktop?.onToggleTheme(themeController.toggleTheme), [themeController.toggleTheme]);
  const [printPreviewMounted, setPrintPreviewMounted] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const editorPaneRef = useRef<HTMLElement>(null);
  const previewPaneRef = useRef<HTMLElement>(null);

  const editorProjectPersistenceController = useEditorProjectPersistenceController({
    storageHydrated,
    draftAutosaveStatus,
    draftAutosaveMessage,
    setDraftAutosaveStatus,
    setDraftAutosaveMessage,
    editorDocumentOpen,
    frontMatter,
    questions,
    sectionHeadings,
    documentFlow,
    formattingConfig,
    logos,
    frontMatterRef,
    questionsRef,
    sectionHeadingsRef,
    documentFlowRef,
    formattingConfigRef,
    logosRef,
    editorDocumentOpenRef,
    cleanUnsavedDocumentFingerprint: cleanUnsavedDocumentFingerprintRef.current,
    activeProject,
    setActiveProject,
    projectFiles,
    setProjectFiles,
    projectFilesStatus,
    setProjectFilesStatus,
    projectFilesMessage,
    setProjectFilesMessage,
    activeProjectFilePath,
    setActiveProjectFilePath,
    activeProjectFileRevision,
    setActiveProjectFileRevision,
    projectSaveConflict,
    setProjectSaveConflict,
    reloadActiveProjectFileFromDisk: () => {
      void syncActiveProjectFileFromDisk();
    },
    localDraftDebounceMs: LOCAL_DRAFT_DEBOUNCE_MS,
    diskAutosaveDebounceMs: AUTOSAVE_DEBOUNCE_MS,
  });
  const {
    activeProjectFilePathRef,
    activeProjectFileRevisionRef,
    setActiveProjectFileState,
    clearActiveProjectFileState,
    currentDraftSnapshotForStorage,
    currentDocumentFingerprint,
    currentEditorDocumentFingerprint,
    lastProjectSaveFingerprintRef,
    updateLastProjectSaveFingerprint,
    projectFileStatusController,
  } = editorProjectPersistenceController;
  const previewReadinessController = usePreviewReadinessController({
    documentKey: currentDocumentFingerprint,
    activeMode: previewShowSolutions ? "solutions" : "student",
  });

  const resolvePrintTitle = useCallback(() => {
    const activeFileName = activeProjectFilePathRef.current
      ? testFileDisplayName(testPathBasename(testPathFromProjectPath(activeProjectFilePathRef.current) ?? activeProjectFilePathRef.current))
      : defaultSavedTestName(frontMatterRef.current);
    return printFileNameForDocument(frontMatterRef.current, activeFileName, showSolutionsRef.current);
  }, [activeProjectFilePathRef, frontMatterRef, showSolutionsRef]);
  const printDocument = usePrintController({ resolvePrintTitle, setPrintPreviewMounted });

  useEditorStorageHydrationController({
    activeProject,
    legacySavedTests,
    logosRef,
    persistence: editorAppPersistence,
    setLegacySavedTests,
    replaceLogoLibrary,
    restoreAutosave: ({ snapshot, project, cleanFingerprint, conflict }) => {
      restoreEditorSnapshot(snapshot);
      if (project) setActiveProject(project);
      setActiveProjectFileState(snapshot.activeProjectFilePath ?? null, snapshot.activeProjectFileRevision ?? null);
      setProjectSaveConflict(conflict);
      updateLastProjectSaveFingerprint(cleanFingerprint);
      setEditorDocumentOpenState(snapshot.documentOpen !== false);
    },
    setStorageHydrated,
    setDraftAutosaveStatus,
    setDraftAutosaveMessage,
  });

  const {
    previewFrontMatter,
    previewQuestions,
    previewSectionHeadings,
    previewDocumentFlow,
    previewFormattingConfig,
    previewLogos,
    totalMarks,
    previewTotalMarks,
    showEditor,
    showPreview,
    showInspectorPane,
    previewFitScale,
    previewLayoutScale,
    resetPreviewZoom,
    workspaceStyle,
    appShellStyle,
    documentTocItems,
    activePreviewAnchor,
  } = useEditorWorkspacePresentationController({
    frontMatter,
    questions,
    sectionHeadings,
    documentFlow,
    formattingConfig,
    logos,
    paneMode,
    inspectorOpen,
    tocOpen,
    activeTocItemId,
    effectiveShowSolutions,
    previewPaneRef,
    normalizeDocumentFlow,
    tocBlockSummary,
  });
  const { contextDescriptorForAnchor, contextReferenceText } = useMemo(
    () =>
      createEditorContextDescriptorRuntime({
        documentTocItems,
        questions,
        selectedEditorBlockFromAnchor,
        summaryText: tocSummaryText,
      }),
    [documentTocItems, questions],
  );
  const { blockContextFromParsed, columnBlockContextFromParsed } = useMemo(() => createEditorBlockContextRuntime(questions), [questions]);
  const {
    hasUnsavedProjectChanges,
    activeProjectPathLabel,
    activeProjectRevisionIssue,
    currentProjectFileName,
    fileOperationBusy,
    headerStorageStatus,
    headerFileStatusMessage,
    headerFileStatusTitle,
    hasUnsavedDraftChanges,
  } = projectFileStatusController;
  const documentTabsController = useEditorDocumentTabsController({
    captureCurrentTab: (existing, forcedId) => {
      const filePath = activeProjectFilePathRef.current;
      const tabId =
        forcedId ??
        existing?.id ??
        (filePath
          ? savedDocumentTabId(activeProject?.documentsPath ?? activeProject?.id, filePath)
          : draftDocumentTabId(() => id("document")));
      return {
        id: tabId,
        title: filePath ? currentProjectFileName : defaultSavedTestName(frontMatterRef.current),
        project: activeProject,
        filePath,
        revision: activeProjectFileRevisionRef.current,
        document: currentEditorDocument(),
        history: editorDocumentStateController.captureEditorHistory(),
        navigation: { activeQuestionId, activeTocItemId, activeRailItemId },
        lastSaveFingerprint: lastProjectSaveFingerprintRef.current,
        cleanUnsavedFingerprint: cleanUnsavedDocumentFingerprintRef.current,
        conflict: activeProjectRevisionIssue ?? projectSaveConflict,
        saveStatus: headerStorageStatus,
        statusMessage: headerFileStatusMessage,
        statusTitle: headerFileStatusTitle,
        dirty: hasUnsavedProjectChanges || hasUnsavedDraftChanges,
        updatedAt: new Date().toISOString(),
      };
    },
    restoreTab: async (tab) => {
      const targetDocumentsPath = tab.project?.documentsPath?.replace(/\/+$/g, "");
      const currentDocumentsPath = activeProject?.documentsPath?.replace(/\/+$/g, "");
      if (tab.project && targetDocumentsPath && targetDocumentsPath !== currentDocumentsPath) {
        const project = await openDefaultProjectDocumentsFolder(targetDocumentsPath);
        const filesResponse = await listProjectFiles(project.id);
        setActiveProject(project);
        setProjectFiles(filesResponse.files);
      } else if (tab.project && tab.project.id !== activeProject?.id) {
        const filesResponse = await listProjectFiles(tab.project.id);
        setActiveProject(tab.project);
        setProjectFiles(filesResponse.files);
      } else if (tab.project) {
        setActiveProject(tab.project);
      }
      setEditorDocument(tab.document);
      setEditorDocumentOpenState(true);
      setActiveProjectFileState(tab.filePath, tab.revision);
      setProjectSaveConflict(tab.conflict);
      updateLastProjectSaveFingerprint(tab.lastSaveFingerprint);
      cleanUnsavedDocumentFingerprintRef.current = tab.cleanUnsavedFingerprint;
      editorDocumentStateController.restoreEditorHistory(tab.history);
      setActiveQuestionId(tab.navigation.activeQuestionId);
      setActiveTocItemId(tab.navigation.activeTocItemId);
      setActiveRailItemId(tab.navigation.activeRailItemId);
      clearEditorTransientState();
    },
  });
  const captureCurrentDocumentTab = useStableEvent(documentTabsController.captureCurrentDocument);
  const replaceDocumentTabsFromPersistence = useStableEvent(documentTabsController.replaceTabsFromPersistence);
  const currentDocumentTabsSnapshot = useStableEvent(documentTabsController.currentTabsSnapshot);
  const [documentTabsHydrated, setDocumentTabsHydrated] = useState(false);
  useEffect(() => {
    if (!storageHydrated || documentTabsHydrated) return;
    let cancelled = false;

    void getEditorSession<PersistedEditorDocumentTabsSession>()
      .then(
        (response) =>
          normalizePersistedEditorDocumentTabsSession(response.session, normalizeDocumentTabDocument) ??
          loadBrowserDocumentTabsSession(normalizeDocumentTabDocument),
      )
      .catch(() => loadBrowserDocumentTabsSession(normalizeDocumentTabDocument))
      .then((session) => {
        if (cancelled) return;
        const currentFilePath = activeProjectFilePathRef.current;
        const matchingTab = session?.tabs.find(
          (tab) =>
            tab.filePath === currentFilePath && (!tab.project?.documentsPath || tab.project.documentsPath === activeProject?.documentsPath),
        );
        const currentTabId =
          matchingTab?.id ??
          (!currentFilePath && session?.activeTabId ? session.activeTabId : null) ??
          (currentFilePath
            ? savedDocumentTabId(activeProject?.documentsPath ?? activeProject?.id, currentFilePath)
            : draftDocumentTabId(() => id("document")));
        const currentTab = editorDocumentOpenRef.current ? captureCurrentDocumentTab(currentTabId) : null;
        replaceDocumentTabsFromPersistence(session ?? { activeTabId: null, tabs: [] }, currentTab);
        setDocumentTabsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeProject?.documentsPath,
    activeProject?.id,
    activeProjectFilePathRef,
    captureCurrentDocumentTab,
    documentTabsHydrated,
    editorDocumentOpenRef,
    replaceDocumentTabsFromPersistence,
    storageHydrated,
  ]);

  useEffect(() => {
    if (!storageHydrated || !documentTabsHydrated) return;
    const timeout = window.setTimeout(() => {
      const currentTabs = editorDocumentOpenRef.current ? currentDocumentTabsSnapshot() : documentTabsController.tabsRef.current;
      const session = persistedDocumentTabsSession(currentTabs, documentTabsController.activeTabIdRef.current);
      saveBrowserDocumentTabsSession(session);
      void saveEditorSession(session).catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [
    activeProjectFileRevision,
    currentDocumentFingerprint,
    currentDocumentTabsSnapshot,
    documentTabsHydrated,
    documentTabsController.activeTabId,
    documentTabsController.activeTabIdRef,
    documentTabsController.tabs,
    documentTabsController.tabsRef,
    editorDocumentOpenRef,
    headerStorageStatus,
    storageHydrated,
  ]);
  const visibleDocumentTabs = useMemo(
    () =>
      documentTabsController.tabs.map((tab) =>
        tab.id === documentTabsController.activeTabId
          ? {
              ...tab,
              title: activeProjectFilePath ? currentProjectFileName : defaultSavedTestName(frontMatter),
              saveStatus: headerStorageStatus,
              statusMessage: headerFileStatusMessage,
              statusTitle: headerFileStatusTitle,
              dirty: hasUnsavedProjectChanges || hasUnsavedDraftChanges,
            }
          : tab,
      ),
    [
      activeProjectFilePath,
      currentProjectFileName,
      documentTabsController.activeTabId,
      documentTabsController.tabs,
      frontMatter,
      hasUnsavedDraftChanges,
      hasUnsavedProjectChanges,
      headerFileStatusMessage,
      headerFileStatusTitle,
      headerStorageStatus,
    ],
  );
  useUnsavedChangesBeforeUnloadController({
    editorDocumentOpen: visibleDocumentTabs.length > 0,
    fileOperationBusy,
    hasUnsavedProjectChanges: visibleDocumentTabs.some((tab) => tab.filePath !== null && tab.dirty),
    hasUnsavedDraftChanges: visibleDocumentTabs.some((tab) => tab.filePath === null && tab.dirty),
  });
  const editorSelectionController = useEditorSelectionController<
    QuestionBlock,
    DocumentSectionHeading,
    DocumentFlowItem,
    SelectedEditorBlock
  >({
    questions,
    sectionHeadings,
    documentFlow,
    activeQuestionId,
    setActiveQuestionId,
    activeTocItemId,
    setActiveTocItemId,
    setActiveRailItemId,
    showInspectorPane,
    frontMatterAnchor: SCROLL_ANCHOR_FRONT_MATTER,
    questionScrollAnchor,
    sectionHeadingIdFromScrollAnchor,
    pageBreakQuestionIdFromScrollAnchor,
    selectedEditorBlockFromAnchor,
    questionHasPageBreak,
    existingOrFirstQuestionId,
    normalizeDocumentFlow,
    firstDocumentFlowAnchor,
  });
  const { pageBreakQuestionIds } = editorSelectionController;

  const editorNavigationController = useEditorNavigationController<DocumentTocItem>({
    editorPaneRef,
    previewPaneRef,
    documentTocItems,
    showEditor,
    showPreview,
    paneMode,
    activeQuestionId,
    activeTocItemId,
    previewFitScale,
    documentLayoutKey: questions,
    previewEditClickMoveTolerancePx: PREVIEW_EDIT_CLICK_MOVE_TOLERANCE_PX,
    setPaneMode,
    setInspectorOpen,
    setActiveTocItemId,
    setActiveRailItemId,
    setActiveQuestionId,
    resetPreviewZoom,
    scrollToAnchorPosition,
    scrollAnchorFallbacks,
    graphChildParentScrollAnchor,
    previewAnchorForEditorAnchor,
    previewAnchorFromEventTarget,
    questionIdFromScrollAnchor,
    questionScrollAnchor,
    scrollAnchorContains,
  });
  const {
    selectQuestionInEditor,
    activateEditorAnchor,
    revealEditorAnchor,
    clearPendingDocumentJumps,
    queueDocumentJump,
    queuePreviewJump,
  } = editorNavigationController;

  const {
    applyEditorAction,
    applyEditorActions,
    applyEditorDocumentAction,
    previewEditorDocumentActions,
    evaluateEditorDocumentActions,
    applyEditorDocumentActions,
  } = useEditorDocumentActionsController<QuestionBlock, FrontMatterConfig, FormattingConfig, EditorDocumentState>({
    currentQuestions: () => questionsRef.current,
    currentDocument: currentEditorDocument,
    currentTitlePageTemplate: () => titlePageTemplateFromValue(frontMatterRef.current.titlePageTemplate),
    titlePageTemplateFromValue,
    normalizeQuestion: withNormalizedQuestionOrder,
    normalizePart: (part) => withNormalizedPartOrder(part as EditorPart),
    normalizeFrontMatter: (nextFrontMatter) => normalizeFrontMatter(nextFrontMatter) ?? DEFAULT_FRONT_MATTER,
    normalizeFormattingConfig: normalizeFormattingConfig,
    validateSolutions: (nextQuestions) => validateSolutionCompleteness(nextQuestions, solutionValidationRuntime(frontMatterRef.current)),
    validateDocument: (document) => validateSolutionCompleteness(document.questions, solutionValidationRuntime(document.frontMatter)),
    setQuestionsWithHistory,
    setDocumentWithHistory: setEditorDocumentWithHistory,
  });

  const questionLifecycleController = createEditorQuestionLifecycleController({
    questions,
    activeQuestionId,
    activeTocItemId,
    activeRailItemId,
    frontMatterRef,
    questionFactory: { createQuestion, createNotesSection },
    applyAction: applyEditorAction,
    applyActions: applyEditorActions,
    selectQuestion: selectQuestionInEditor,
    setActiveTocItem: setActiveTocItemId,
    setActiveRailItem: setActiveRailItemId,
    queueDocumentJump,
    clearPendingDocumentJumps,
  });
  const { removePageBreakAfterQuestion, removeQuestion } = questionLifecycleController;

  const {
    selectContextAnchor,
    duplicateAnchorTarget,
    moveAnchorTarget,
    canMoveAnchorTarget,
    canDeleteAnchorTarget,
    canDuplicateAnchorTarget,
    deleteEditorSelection,
  } = useEditorContextCommandController({
    questions,
    documentFlow,
    sectionHeadings,
    showEditor,
    contextDescriptorForAnchor,
    normalizeDocumentFlow,
    blockContextFromParsed,
    columnBlockContextFromParsed,
    duplicatedContentBlock,
    duplicatedSubpart,
    duplicatedPart,
    duplicatedQuestion,
    duplicateColumnBlockAtPath,
    applyAction: applyEditorAction,
    selectQuestion: selectQuestionInEditor,
    setActiveTocItem: setActiveTocItemId,
    setActiveRailItem: setActiveRailItemId,
    openInspector: () => setInspectorOpen(true),
    openEditor: () => setPaneMode("split"),
    revealEditorAnchor,
    queuePreviewJump,
    queueDocumentJump,
    moveSectionHeading: (sectionHeadingId, direction) => moveSectionHeadingByKeyboard(sectionHeadingId, direction),
    moveQuestion: (questionId, direction) => moveQuestionByKeyboard(questionId, direction),
    moveSubsection: (target, direction, anchor) => moveSubsectionByKeyboard(target, direction, anchor),
    removeSectionHeading: (sectionHeadingId) => removeSectionHeading(sectionHeadingId),
    removePageBreakAfterQuestion,
    removeQuestion,
    removeQuestionBlock: (questionId, blockId) => removeQuestionBlock(questionId, blockId),
    removePart: (questionId, partId) => removePart(questionId, partId),
    removePartBlock: (questionId, part, blockId) => removePartBlock(questionId, part, blockId),
    removeSubpart: (questionId, part, subpartId) => removeSubpart(questionId, part, subpartId),
    removeSubpartBlock: (questionId, part, subpart, blockId) => removeSubpartBlock(questionId, part, subpart, blockId),
    activateEditorAnchor,
    globalDeleteEnabled: true,
    fileManagerOpen,
    activeGlobalDeleteAnchor: activeRailItemId.startsWith("pb:") ? activeRailItemId : activeTocItemId,
    isDeleteEvent: nativeKeyboardDeleteRequested,
    targetConsumesDelete: keyboardTargetConsumesGlobalDelete,
  });

  const { solutionSurfaceCopyController, solutionValidationController, solutionSlotController } = useEditorManualSolutionController({
    frontMatter,
    frontMatterRef,
    questions,
    dialogs: mauthDialogs,
    showEditor,
    setShowSolutions,
    applyAction: applyEditorAction,
    applyActions: applyEditorActions,
    selectContextAnchor,
    ensureEditorVisible: () => {
      if (!showEditor) setPaneMode("split");
    },
    activateEditorAnchor,
    revealEditorAnchor,
    queueDocumentJump,
  });
  const { createSolutionCopyForSelectedBlock } = solutionSurfaceCopyController;
  const { setSolutionValidationOpen } = solutionValidationController;
  useEffect(
    () =>
      window.mauthDesktop?.onOpenSolutionValidation(() => {
        if (supportsSolutionValidation) setSolutionValidationOpen(true);
      }),
    [setSolutionValidationOpen, supportsSolutionValidation],
  );

  const { contextActionsForAnchor } = useEditorContextActionsController({
    questions,
    supportsSolutionTools,
    contextDescriptorForAnchor,
    contextReferenceText,
    canMoveAnchorTarget,
    moveAnchorTarget,
    canDuplicateAnchorTarget,
    duplicateAnchorTarget,
    canDeleteAnchorTarget,
    deleteEditorSelection,
    selectedEditorBlockFromAnchor,
    createSolutionCopyForSelectedBlock,
  });

  const contextMenuController = useEditorContextMenuController<DocumentTocItem>({
    previewPaneRef,
    contextDescriptorForAnchor,
    selectContextAnchor,
    contextActionsForAnchor,
    previewAnchorFromEventTarget,
  });
  const { closeContextMenu, openContextMenu } = contextMenuController;

  const actionProposalController = useMauthActionProposalController<QuestionBlock, FrontMatterConfig, FormattingConfig>({
    parseActions: parseMauthDocumentActionProposal,
    previewActions: previewEditorDocumentActions,
    applyActions: applyEditorDocumentActions,
  });
  const sectionHeadingLifecycleController = useEditorSectionHeadingController({
    activeRailItemId,
    activeTocItemId,
    questionsRef,
    sectionHeadingsRef,
    documentFlowRef,
    normalizeDocumentFlow,
    createId: id,
    setSectionFlowWithHistory,
    setActiveTocItemId,
    setActiveRailItemId,
    setActiveQuestionId,
    revealEditorAnchor,
    queueDocumentJump,
  });
  const { removeSectionHeading, moveSectionHeadingByKeyboard } = sectionHeadingLifecycleController;

  const frontMatterLogoActions = createFrontMatterLogoActions({
    logos: () => logosRef.current,
    frontMatter: () => frontMatterRef.current,
    createId: id,
    applyDocumentAction: applyEditorDocumentAction,
    updateLogoAsset,
    appendLogoAsset,
    removeLogoAsset,
    writeLogoToDisk,
    deleteLogoFromDisk,
  });

  const { createNewDocumentFromTemplate: createNewTestFromTemplate } = useNewDocumentController<TitlePageTemplate, EditorDocumentState>({
    createTemplateDocument: (template) => {
      return createTemplateEditorDocumentPlan({
        template,
        formatPresetId: NEW_TEST_TEMPLATES.find((item) => item.id === template)?.formatPresetId,
        id,
        logos: logosRef.current,
        currentFrontMatter: frontMatterRef.current,
        editorDocumentFingerprint,
      });
    },
    setDocument: setEditorDocument,
    setDocumentOpen: setEditorDocumentOpenState,
    setCleanUnsavedDocumentFingerprint: (fingerprint) => {
      cleanUnsavedDocumentFingerprintRef.current = fingerprint;
    },
    clearActiveProjectFileState,
    setActiveQuestionId,
    setActiveTocItemId,
    setActiveRailItemId,
    clearHistory: editorDocumentStateController.clearEditorHistory,
    clearTransientEditorState: clearEditorTransientState,
    closeNewDocumentDialog: () => setNewTestDialogOpen(false),
    closeFileManager: () => setFileManagerOpen(false),
    queueDocumentJump,
  });

  const { applySavedProjectDocument: applySavedProjectDocumentToEditor } = useSavedProjectDocumentApplier({
    logosRef,
    normalizeQuestionBlocks,
    normalizeSectionHeadings,
    normalizeDocumentFlow,
    editorDocumentFingerprint,
    clearEditorHistory: editorDocumentStateController.clearEditorHistory,
    setEditorDocument,
    setEditorDocumentOpenState,
    setActiveQuestionId,
    setActiveTocItemId,
    setActiveRailItemId,
    clearEditorTransientState,
    setActiveProject,
    setActiveProjectFileState,
    setProjectSaveConflict,
    updateLastProjectSaveFingerprint,
    importLogo,
  });

  function createNewTestFromTemplateInTab(template: TitlePageTemplate) {
    documentTabsController.captureActiveTab();
    createNewTestFromTemplate(template);
    documentTabsController.addCurrentDocumentAsTab(draftDocumentTabId(() => id("document")));
  }

  function applySavedProjectDocument(project: ProjectSummary, filePath: string, savedDocument: SavedTest, revision: number | null) {
    documentTabsController.captureActiveTab();
    applySavedProjectDocumentToEditor(project, filePath, savedDocument, revision);
    documentTabsController.addCurrentDocumentAsTab(savedDocumentTabId(project.documentsPath ?? project.id, filePath), {
      project,
      filePath,
      revision,
      title: testFileDisplayName(testPathBasename(testPathFromProjectPath(filePath) ?? filePath)),
    });
  }

  const documentSessionController = useDocumentSessionController<EditorDocumentState, SavedTest, AutosavedEditorSnapshot>({
    storageHydrated,
    activeProject,
    projectFiles,
    activeProjectFilePath,
    activeProjectFilePathRef,
    activeProjectFileRevisionRef,
    editorDocumentOpenRef,
    lastProjectSaveFingerprintRef,
    fileOperationBusy,
    projectSaveConflict: activeProjectRevisionIssue,
    hasUnsavedProjectChanges,
    hasUnsavedDraftChanges,
    currentProjectFileName,
    draftAutosaveStatus,
    revisionMissingErrorMessage: PROJECT_FILE_REVISION_MISSING_ERROR,
    activeFileSyncIntervalMs: ACTIVE_PROJECT_FILE_SYNC_INTERVAL_MS,
    currentDocument: currentEditorDocument,
    createClosedSnapshot: () => ({
      ...currentDraftSnapshotForStorage(),
      activeProjectFilePath: undefined,
      activeProjectFileRevision: undefined,
      documentOpen: false,
    }),
    persistLocalDraft: persistCurrentDraft,
    saveDiskAutosave: (snapshot) => saveStorageAutosave<AutosavedEditorSnapshot>(snapshot).then((response) => response.autosave),
    defaultProjectFileName: () => defaultProjectFileNameForDocument(activeProjectFilePath, frontMatter),
    serializeProjectDocument: ({ filePath, testName, document }) =>
      serializeProjectDocumentSnapshot({
        filePath,
        testName,
        document,
        logos: logosRef.current,
        runtime: { createSavedTestSnapshot, editorDocumentFingerprint },
      }),
    parseSavedDocument: (content) => parseProjectSavedDocument(content, normalizeSavedTest),
    applySavedProjectDocument,
    currentEditorDocumentFingerprint,
    projectFileConflictFromError,
    missingProjectRevisionConflict,
    setActiveProject,
    setProjectFiles,
    setActiveProjectFileState,
    clearActiveProjectFileState,
    setProjectSaveConflict,
    updateLastProjectSaveFingerprint,
    setEditorDocumentOpenState,
    setNewTestDialogOpen,
    setFileManagerOpen,
    closeContextMenu,
    setDraftAutosaveStatus,
    setDraftAutosaveMessage,
    setProjectFilesStatus,
    setProjectFilesMessage,
    refreshProjectFiles,
    prepareOpenProjectFileTransition: async () => {
      documentTabsController.captureActiveTab();
      return "unchanged";
    },
    dialogs: mauthDialogs,
    onOpened: () => setFileManagerOpen(false),
  });
  const {
    writeEditorDocumentToProjectFile,
    writeCurrentTestProjectFile,
    prepareCurrentProjectFileTransition,
    saveCurrentTestToProjectFile,
    startNewTest,
    openProjectFile,
    openExternalProjectDocument,
    syncActiveProjectFileFromDisk,
    closeEditorDocument,
    confirmCurrentDocumentClose,
  } = documentSessionController;
  useDesktopDocumentOpenController(useStableEvent(openExternalProjectDocument));

  const activateDocumentTab = useStableEvent(async (tabId: string) => {
    await documentTabsController.activateTab(tabId);
    setFileManagerOpen(false);
  });
  const confirmActiveDocumentTabClose = useStableEvent(confirmCurrentDocumentClose);

  async function openProjectFileInTab(filePath: string) {
    const openTab = documentTabsController.tabForFile(activeProject, filePath);
    if (openTab) {
      await activateDocumentTab(openTab.id);
      return;
    }
    await openProjectFile(filePath);
  }

  async function closeDocumentTab(tabId: string) {
    if (tabId !== documentTabsController.activeTabIdRef.current) {
      await activateDocumentTab(tabId);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
    }
    if (!(await confirmActiveDocumentTabClose())) return;

    const nextTabId = documentTabsController.removeTab(tabId);
    if (nextTabId) {
      await activateDocumentTab(nextTabId);
      return;
    }
    documentTabsController.clearTabs();
    closeEditorDocument();
  }

  function closeCurrentDocumentTab() {
    const activeTabId = documentTabsController.activeTabIdRef.current;
    if (!activeTabId) {
      closeEditorDocument();
      return;
    }
    void closeDocumentTab(activeTabId);
  }

  const projectFileManagementController = useEditorProjectFileManagementController({
    activeProject,
    projectFiles,
    activeProjectFilePath,
    fileOperationBusy,
    hasUnsavedProjectChanges,
    currentProjectFileName,
    currentEditorDocument,
    currentLogos: () => logosRef.current,
    prepareCurrentProjectFileTransition,
    applySavedProjectDocument,
    clearActiveProjectFile: clearActiveProjectFileState,
    writeCurrentTestProjectFile,
    saveCurrentTestToProjectFile,
    refreshLogoLibraryFromDisk,
    setActiveProjectFileState,
    setActiveProject,
    setProjectFiles,
    setProjectFilesStatus,
    setProjectFilesMessage,
    setProjectSaveConflict,
    updateLastProjectSaveFingerprint,
    dialogs: mauthDialogs,
  });

  useEditorAgentBridgeController({
    enabled: storageHydrated,
    activeProject,
    activeProjectFilePathRef,
    activeProjectFileRevisionRef,
    lastProjectSaveFingerprintRef,
    logosRef,
    questionsRef,
    frontMatterRef,
    fileOperationBusy,
    hasRevisionIssue: Boolean(activeProjectRevisionIssue),
    autosaveStatus: draftAutosaveStatus,
    autosaveMessage: draftAutosaveMessage,
    previewWarnings: previewReadinessController.warnings,
    currentDocument: currentEditorDocument,
    previewActions: previewEditorDocumentActions,
    applyActionsWithoutCommit: evaluateEditorDocumentActions,
    commitDocument: setEditorDocumentWithHistory,
    writeEditorDocumentToProjectFile,
    currentProjectFileName,
    activeDocumentId: () => documentTabsController.activeTabIdRef.current,
    openDocuments: () => {
      const activeTabId = documentTabsController.activeTabIdRef.current;
      return currentDocumentTabsSnapshot().map((tab) => agentDocumentTabSummary(tab, activeTabId));
    },
    activateDocument: async (documentId) => {
      if (!documentTabsController.tabsRef.current.some((tab) => tab.id === documentId)) return false;
      await activateDocumentTab(documentId);
      return true;
    },
  });

  function isActiveEditorAnchor(anchor: string) {
    return anchor === activeTocItemId;
  }

  const nestedEditorDragController = useNestedEditorDragController({
    questionsRef,
    editorPaneRef,
    isNotesTemplate,
    showEditor,
    ...nestedEditorDragState,
    clearQuestionPageBreakDrag,
    applyEditorAction,
    applyEditorActions,
    selectContextAnchor,
  });
  const { readSubsectionDrag, moveSubsectionByKeyboard, setEditorPageBreak, editorPageBreakDestinationHasBreak } =
    nestedEditorDragController;

  const contentMutationController = createEditorContentMutationActions({
    questions,
    activeAnchor: activeTocItemId,
    createId: id,
    insertedBlockVisibilityForKind: solutionInsertedBlockVisibilityForKind,
    contentBlockForKind,
    diagramBlockForType,
    applyAction: applyEditorAction,
    activateAnchor: activateEditorAnchor,
    revealAnchor: revealEditorAnchor,
    editorPageBreakDestinationHasBreak,
    setEditorPageBreak,
  });
  const { updatePreviewGraphConfig, removeQuestionBlock, removePart, removeSubpart, removePartBlock, removeSubpartBlock } =
    contentMutationController;
  const handlePreviewGraphConfigChange = useStableEvent(updatePreviewGraphConfig);

  const questionPageBreakDragController = useQuestionPageBreakDragController({
    questions,
    pageBreakQuestionIds,
    draggedQuestionId,
    setDraggedQuestionId,
    dragOverQuestion,
    setDragOverQuestion,
    draggedPageBreakQuestionId,
    setDraggedPageBreakQuestionId,
    dragOverPageBreak,
    setDragOverPageBreak,
    applyEditorAction,
    setQuestionsWithHistory,
    readSubsectionDrag,
    dragPlacementFromEvent,
    setModuleDragImage: setEditorDragImage,
    clearNestedEditorDrag,
    selectQuestionInEditor,
    setActiveTocItemId,
    setActiveRailItemId,
    queueDocumentJump,
    clearPendingDocumentJumps,
  });
  const { moveQuestionByKeyboard } = questionPageBreakDragController;

  return (
    <>
      <div className="app-shell min-h-screen bg-background text-foreground">
        <AppHeaderWorkspace
          pane={{ paneMode, showInspectorPane, ...editorNavigationController }}
          document={{
            editorDocumentOpen,
            ...projectFileStatusController,
            ...documentSessionController,
            ...projectFilesController,
            documentTabs: visibleDocumentTabs,
            activeDocumentTabId: documentTabsController.activeTabId,
            activateDocumentTab: (tabId) => void activateDocumentTab(tabId),
            closeDocumentTab: (tabId) => void closeDocumentTab(tabId),
            closeCurrentDocument: closeCurrentDocumentTab,
          }}
          systemStatus={{ ...systemStatusController, openPanel: () => setSystemStatusPanelOpen(true) }}
          theme={themeController}
          solutions={{ ...solutionModeController, ...solutionValidationController }}
          printDocument={printDocument}
          history={editorDocumentStateController}
        />

        <main className="app-main grid h-[calc(100vh-4rem)] min-h-0 bg-background" style={editorDocumentOpen ? appShellStyle : undefined}>
          {editorDocumentOpen ? (
            <>
              <DocumentNavigationWorkspace
                open={tocOpen}
                items={documentTocItems}
                activeRailItemId={activeRailItemId}
                activeTocItemId={activeTocItemId}
                pageBreakQuestionIds={pageBreakQuestionIds}
                isNotesTemplate={isNotesTemplate}
                isStandardTestTemplate={frontMatter.titlePageTemplate === "standard"}
                isInvestigationTemplate={frontMatter.titlePageTemplate === "investigation"}
                dragState={questionPageBreakDragState}
                navigation={editorNavigationController}
                questionLifecycle={questionLifecycleController}
                sectionHeadingLifecycle={sectionHeadingLifecycleController}
                questionPageBreakDrag={questionPageBreakDragController}
                onOpenChange={setTocOpen}
                onContextMenu={openContextMenu}
              />
              <DocumentEditorWorkspaceBindings
                layout={{
                  style: workspaceStyle,
                  paneMode,
                  showEditor,
                  showInspectorPane,
                  showPreview,
                  editorPaneRef,
                  previewPaneRef,
                }}
                document={{ frontMatter, questions, sectionHeadings, documentFlow, logos, totalMarks }}
                selection={{ ...editorSelectionController, activeTocItemId, activePreviewAnchor, isActiveEditorAnchor }}
                solutions={{ ...solutionModeController, ...solutionSurfaceCopyController, ...solutionSlotController }}
                solutionValidation={solutionValidationController}
                navigation={editorNavigationController}
                contextMenu={contextMenuController}
                drag={nestedEditorDragController}
                mutations={contentMutationController}
                questionLifecycle={questionLifecycleController}
                sectionHeadings={sectionHeadingLifecycleController}
                frontMatterActions={frontMatterLogoActions}
                conflict={{ ...projectFileStatusController, ...documentSessionController }}
                factories={{
                  contentBlockForKind,
                  diagramBlockForType,
                  createTextBlock: textBlock,
                  diagramTypePatch,
                  updateGraphConfig,
                  withGraphDefaults,
                }}
                previewDocument={{
                  frontMatter: previewFrontMatter,
                  logos: previewLogos,
                  totalMarks: previewTotalMarks,
                  questions: previewQuestions,
                  sectionHeadings: previewSectionHeadings,
                  documentFlow: previewDocumentFlow,
                  normalizeDocumentFlow,
                  formattingConfig: previewFormattingConfig,
                  scale: previewLayoutScale,
                  showSolutions: previewShowSolutions,
                  onGraphConfigChange: handlePreviewGraphConfigChange,
                  onPaginationReport: previewReadinessController.onPaginationReport,
                }}
              />
            </>
          ) : (
            <EmptyDocumentStart onNewDocument={startNewTest} onOpenFiles={openFileManager} />
          )}
        </main>
      </div>
      <AppOverlayWorkspace
        files={{
          ...projectFilesController,
          ...projectFileManagementController,
          startNewTest,
          openProjectFile: openProjectFileInTab,
          buildVersionPreview: projectFileVersionPreview,
        }}
        dialogNode={mauthDialogs.dialogNode}
        newDocument={{
          open: newTestDialogOpen,
          setOpen: setNewTestDialogOpen,
          create: createNewTestFromTemplateInTab,
        }}
        systemStatus={{
          ...systemStatusController,
          open: systemStatusPanelOpen,
          setOpen: setSystemStatusPanelOpen,
          activeProject,
          editorDocumentOpen,
          currentFileName: currentProjectFileName,
          activeProjectPathLabel,
          activeProjectFileRevision,
          headerStorageStatus,
          draftAutosaveStatus,
          draftAutosaveMessage,
          previewReadinessReport: previewReadinessController.activeReport,
          previewReadinessWarningCount: previewReadinessController.activeWarnings.length,
        }}
        solutionValidation={solutionValidationController}
        actionProposal={actionProposalController}
        contextMenu={contextMenuController}
        print={{
          mounted: printPreviewMounted,
          editorDocumentOpen,
          preview: {
            frontMatter,
            logos,
            totalMarks,
            questions,
            sectionHeadings,
            documentFlow,
            normalizeDocumentFlow,
            formattingConfig,
            scale: 1,
            showSolutions: effectiveShowSolutions,
          },
        }}
      />
    </>
  );
}
