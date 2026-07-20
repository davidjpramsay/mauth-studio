import { useCallback, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { FormattingConfig, ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import { useActiveProjectFileStateController } from "@/hooks/useActiveProjectFileStateController";
import { useDraftAutosaveController } from "@/hooks/useDraftAutosaveController";
import { useEditorAutosaveSnapshotController } from "@/hooks/useEditorAutosaveSnapshotController";
import { useProjectFileStatus, type DraftAutosaveStatus } from "@/hooks/useProjectFileStatus";
import { type ProjectFilesStatus, type ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import { useUnsavedChangesBeforeUnloadController } from "@/hooks/useUnsavedChangesBeforeUnloadController";
import { getDefaultProject, listProjectFiles, saveStorageAutosave } from "@/lib/api";
import type { AutosavedEditorSnapshot } from "@/lib/editorAppPersistence";
import { editorDocumentFingerprint, persistCurrentDraft } from "@/lib/editorApplicationRuntime";
import type { DocumentFlowItem, DocumentSectionHeading, QuestionBlock } from "@/lib/editorDocumentNormalization";
import { editorDraftChangeKey } from "@/lib/editorSessionSnapshots";
import type { FrontMatterConfig } from "@/lib/frontMatterConfig";
import { selectedLogoForFrontMatter, type LogoAsset } from "@/lib/logoLibrary";

interface UseEditorProjectPersistenceControllerOptions {
  storageHydrated: boolean;
  draftAutosaveStatus: DraftAutosaveStatus;
  draftAutosaveMessage: string;
  setDraftAutosaveStatus: Dispatch<SetStateAction<DraftAutosaveStatus>>;
  setDraftAutosaveMessage: Dispatch<SetStateAction<string>>;
  editorDocumentOpen: boolean;
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  sectionHeadings: DocumentSectionHeading[];
  documentFlow: DocumentFlowItem[];
  formattingConfig: FormattingConfig;
  logos: LogoAsset[];
  frontMatterRef: MutableRefObject<FrontMatterConfig>;
  questionsRef: MutableRefObject<QuestionBlock[]>;
  sectionHeadingsRef: MutableRefObject<DocumentSectionHeading[]>;
  documentFlowRef: MutableRefObject<DocumentFlowItem[]>;
  formattingConfigRef: MutableRefObject<FormattingConfig>;
  logosRef: MutableRefObject<LogoAsset[]>;
  editorDocumentOpenRef: MutableRefObject<boolean>;
  cleanUnsavedDocumentFingerprint: string | null;
  activeProject: ProjectSummary | null;
  setActiveProject: Dispatch<SetStateAction<ProjectSummary | null>>;
  projectFiles: ProjectFileSummary[];
  setProjectFiles: Dispatch<SetStateAction<ProjectFileSummary[]>>;
  projectFilesStatus: ProjectFilesStatus;
  setProjectFilesStatus: Dispatch<SetStateAction<ProjectFilesStatus>>;
  projectFilesMessage: string;
  setProjectFilesMessage: Dispatch<SetStateAction<string>>;
  activeProjectFilePath: string | null;
  setActiveProjectFilePath: Dispatch<SetStateAction<string | null>>;
  activeProjectFileRevision: number | null;
  setActiveProjectFileRevision: Dispatch<SetStateAction<number | null>>;
  projectSaveConflict: ProjectSaveConflict | null;
  setProjectSaveConflict: Dispatch<SetStateAction<ProjectSaveConflict | null>>;
  reloadActiveProjectFileFromDisk: () => void;
  localDraftDebounceMs: number;
  diskAutosaveDebounceMs: number;
}

export function useEditorProjectPersistenceController({
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
  cleanUnsavedDocumentFingerprint,
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
  reloadActiveProjectFileFromDisk,
  localDraftDebounceMs,
  diskAutosaveDebounceMs,
}: UseEditorProjectPersistenceControllerOptions) {
  const [lastProjectSaveFingerprint, setLastProjectSaveFingerprint] = useState<string | null>(null);
  const lastProjectSaveFingerprintRef = useRef<string | null>(null);

  const updateLastProjectSaveFingerprint = useCallback((nextFingerprint: string | null) => {
    lastProjectSaveFingerprintRef.current = nextFingerprint;
    setLastProjectSaveFingerprint(nextFingerprint);
  }, []);

  const activeProjectFileStateController = useActiveProjectFileStateController({
    activeProjectFilePath,
    activeProjectFileRevision,
    setActiveProjectFilePath,
    setActiveProjectFileRevision,
    setProjectSaveConflict,
    updateLastProjectSaveFingerprint,
  });
  const { activeProjectFilePathRef, activeProjectFileRevisionRef } = activeProjectFileStateController;

  const currentDraftSnapshotForStorage = useEditorAutosaveSnapshotController({
    frontMatterRef,
    questionsRef,
    sectionHeadingsRef,
    documentFlowRef,
    formattingConfigRef,
    logosRef,
    activeProjectFilePathRef,
    activeProjectFileRevisionRef,
    editorDocumentOpenRef,
    selectLogo: selectedLogoForFrontMatter,
  });

  const currentDocumentFingerprint = useMemo(
    () =>
      editorDocumentFingerprint(
        frontMatter,
        questions,
        formattingConfig,
        selectedLogoForFrontMatter(logos, frontMatter),
        sectionHeadings,
        documentFlow,
      ),
    [documentFlow, formattingConfig, frontMatter, logos, questions, sectionHeadings],
  );
  const currentEditorDocumentFingerprint = useCallback(
    () =>
      editorDocumentFingerprint(
        frontMatterRef.current,
        questionsRef.current,
        formattingConfigRef.current,
        selectedLogoForFrontMatter(logosRef.current, frontMatterRef.current),
        sectionHeadingsRef.current,
        documentFlowRef.current,
      ),
    [documentFlowRef, formattingConfigRef, frontMatterRef, logosRef, questionsRef, sectionHeadingsRef],
  );
  const draftChangeKey = editorDraftChangeKey({
    documentOpen: editorDocumentOpen,
    activeProjectFilePath,
    activeProjectFileRevision,
    documentFingerprint: currentDocumentFingerprint,
  });

  useDraftAutosaveController<AutosavedEditorSnapshot>({
    storageHydrated,
    diskAutosaveAvailable: draftAutosaveStatus !== "unavailable",
    editorDocumentOpen,
    activeProjectFilePath,
    activeProjectFileRevision,
    draftChangeKey,
    createAutosaveSnapshot: currentDraftSnapshotForStorage,
    persistLocalDraft: persistCurrentDraft,
    saveDiskAutosave: async (snapshot) => {
      const autosaveResponse = await saveStorageAutosave<AutosavedEditorSnapshot>(snapshot);
      return autosaveResponse.autosave;
    },
    loadProjectFileSummary: async (filePath) => {
      const project = activeProject ?? (await getDefaultProject());
      const filesResponse = await listProjectFiles(project.id);
      setActiveProject(project);
      setProjectFiles(filesResponse.files);
      return filesResponse.files.find((file) => file.path === filePath && file.kind === "file");
    },
    isCurrentProjectFileClean: () => lastProjectSaveFingerprintRef.current === currentEditorDocumentFingerprint(),
    reloadActiveProjectFileFromDisk,
    setDraftAutosaveStatus,
    setDraftAutosaveMessage,
    setProjectSaveConflict,
    setProjectFilesStatus,
    setProjectFilesMessage,
    localDraftDebounceMs,
    diskAutosaveDebounceMs,
  });

  const projectFileStatusController = useProjectFileStatus({
    editorDocumentOpen,
    activeProjectFilePath,
    activeProjectFileRevision,
    projectSaveConflict,
    projectFiles,
    projectFilesStatus,
    projectFilesMessage,
    currentDocumentFingerprint,
    lastProjectSaveFingerprint,
    cleanUnsavedDocumentFingerprint,
    draftAutosaveStatus,
    draftAutosaveMessage,
  });
  useUnsavedChangesBeforeUnloadController({
    editorDocumentOpen,
    fileOperationBusy: projectFileStatusController.fileOperationBusy,
    hasUnsavedProjectChanges: projectFileStatusController.hasUnsavedProjectChanges,
    hasUnsavedDraftChanges: projectFileStatusController.hasUnsavedDraftChanges,
  });

  return {
    ...activeProjectFileStateController,
    currentDraftSnapshotForStorage,
    currentDocumentFingerprint,
    currentEditorDocumentFingerprint,
    lastProjectSaveFingerprint,
    lastProjectSaveFingerprintRef,
    updateLastProjectSaveFingerprint,
    projectFileStatusController,
  };
}
