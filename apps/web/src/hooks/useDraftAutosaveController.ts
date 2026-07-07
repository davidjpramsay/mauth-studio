import { useEffect, useRef } from "react";
import type { ProjectFileSummary } from "@mauth-studio/shared";

import type { DraftAutosaveStatus } from "@/hooks/useProjectFileStatus";
import type { ProjectFilesStatus, ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import { draftAutosaveSavedMessage, draftAutosaveStartMessage, resolveDraftAutosaveRevisionPlan } from "@/lib/draftAutosaveLifecycle";

interface AutosaveSnapshotLike {
  activeProjectFilePath?: string;
  activeProjectFileRevision?: number;
  updatedAt?: string;
}

interface UseDraftAutosaveControllerOptions<TAutosave extends AutosaveSnapshotLike> {
  storageHydrated: boolean;
  diskAutosaveAvailable: boolean;
  editorDocumentOpen: boolean;
  activeProjectFilePath: string | null;
  activeProjectFileRevision: number | null;
  draftChangeKey: string;
  createAutosaveSnapshot: () => TAutosave;
  persistLocalDraft: (snapshot: TAutosave) => void;
  saveDiskAutosave: (snapshot: TAutosave) => Promise<TAutosave>;
  loadProjectFileSummary: (filePath: string) => Promise<ProjectFileSummary | undefined>;
  isCurrentProjectFileClean: () => boolean;
  reloadActiveProjectFileFromDisk: () => void;
  setDraftAutosaveStatus: (status: DraftAutosaveStatus) => void;
  setDraftAutosaveMessage: (message: string) => void;
  setProjectSaveConflict: (conflict: ProjectSaveConflict | null) => void;
  setProjectFilesStatus: (status: ProjectFilesStatus) => void;
  setProjectFilesMessage: (message: string) => void;
  localDraftDebounceMs: number;
  diskAutosaveDebounceMs: number;
}

export function useDraftAutosaveController<TAutosave extends AutosaveSnapshotLike>(options: UseDraftAutosaveControllerOptions<TAutosave>) {
  const { storageHydrated, diskAutosaveAvailable, editorDocumentOpen, activeProjectFilePath, activeProjectFileRevision, draftChangeKey } =
    options;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const autosaveSequenceRef = useRef(0);

  useEffect(() => {
    if (!storageHydrated) return;
    const timeoutId = window.setTimeout(() => {
      const { createAutosaveSnapshot, persistLocalDraft } = optionsRef.current;
      persistLocalDraft(createAutosaveSnapshot());
    }, optionsRef.current.localDraftDebounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [draftChangeKey, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;

    const persistLatestDraft = () => {
      const { createAutosaveSnapshot, persistLocalDraft } = optionsRef.current;
      persistLocalDraft(createAutosaveSnapshot());
    };

    window.addEventListener("pagehide", persistLatestDraft);
    return () => window.removeEventListener("pagehide", persistLatestDraft);
  }, [storageHydrated]);

  useEffect(() => {
    if (!storageHydrated || !diskAutosaveAvailable) return;

    const autosaveSequence = autosaveSequenceRef.current + 1;
    autosaveSequenceRef.current = autosaveSequence;
    const { setDraftAutosaveStatus, setDraftAutosaveMessage, activeProjectFilePath, editorDocumentOpen, diskAutosaveDebounceMs } =
      optionsRef.current;
    setDraftAutosaveStatus("saving");
    setDraftAutosaveMessage(draftAutosaveStartMessage({ activeProjectFilePath, editorDocumentOpen }));

    const timeoutId = window.setTimeout(() => {
      async function saveDraftIfProjectRevisionIsCurrent() {
        const {
          activeProjectFilePath,
          activeProjectFileRevision,
          createAutosaveSnapshot,
          loadProjectFileSummary,
          isCurrentProjectFileClean,
          reloadActiveProjectFileFromDisk,
          saveDiskAutosave,
          setDraftAutosaveStatus,
          setDraftAutosaveMessage,
          setProjectSaveConflict,
          setProjectFilesStatus,
          setProjectFilesMessage,
        } = optionsRef.current;
        const autosaveSnapshot = createAutosaveSnapshot();

        try {
          if (activeProjectFilePath && typeof activeProjectFileRevision === "number") {
            const summary = await loadProjectFileSummary(activeProjectFilePath);
            const revisionPlan = resolveDraftAutosaveRevisionPlan({
              activeProjectFilePath,
              activeProjectFileRevision,
              remoteRevision: summary?.revision,
              currentProjectFileClean: isCurrentProjectFileClean(),
            });
            if (revisionPlan.kind === "reload-clean-file") {
              setDraftAutosaveStatus(revisionPlan.draftStatus);
              setDraftAutosaveMessage(revisionPlan.draftMessage);
              reloadActiveProjectFileFromDisk();
              return;
            }
            if (revisionPlan.kind === "block-dirty-file") {
              setProjectSaveConflict(revisionPlan.conflict);
              setProjectFilesStatus(revisionPlan.projectFilesStatus);
              setProjectFilesMessage(revisionPlan.projectFilesMessage);
              setDraftAutosaveStatus(revisionPlan.draftStatus);
              setDraftAutosaveMessage(revisionPlan.draftMessage);
              return;
            }
          }

          const autosaveResponse = await saveDiskAutosave(autosaveSnapshot);
          if (autosaveSequenceRef.current !== autosaveSequence) return;
          setDraftAutosaveStatus("saved");
          setDraftAutosaveMessage(draftAutosaveSavedMessage(autosaveResponse.updatedAt));
        } catch {
          if (autosaveSequenceRef.current !== autosaveSequence) return;
          setDraftAutosaveStatus("unavailable");
          setDraftAutosaveMessage("Disk autosave failed: using browser backup only");
        }
      }

      void saveDraftIfProjectRevisionIsCurrent();
    }, diskAutosaveDebounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [activeProjectFilePath, activeProjectFileRevision, diskAutosaveAvailable, draftChangeKey, editorDocumentOpen, storageHydrated]);
}
