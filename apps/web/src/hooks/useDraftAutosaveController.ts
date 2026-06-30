import { useEffect, useRef } from "react";
import type { ProjectFileSummary } from "@mauth-studio/shared";

import type { DraftAutosaveStatus } from "@/hooks/useProjectFileStatus";
import type { ProjectFilesStatus, ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import { fileChangedProjectSaveConflict } from "@/lib/projectSaveConflicts";

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
    setDraftAutosaveMessage(
      activeProjectFilePath ? "Autosaving file draft" : editorDocumentOpen ? "Autosaving draft" : "Saving closed workspace state",
    );

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
            if (summary && summary.revision > activeProjectFileRevision) {
              const conflict = fileChangedProjectSaveConflict(activeProjectFilePath, activeProjectFileRevision, summary.revision);
              if (isCurrentProjectFileClean()) {
                setDraftAutosaveStatus("ready");
                setDraftAutosaveMessage("File changed on disk; reloading");
                reloadActiveProjectFileFromDisk();
                return;
              }
              setProjectSaveConflict(conflict);
              setProjectFilesStatus("error");
              setProjectFilesMessage("File changed on disk");
              setDraftAutosaveStatus("ready");
              setDraftAutosaveMessage("Draft not autosaved; file changed on disk");
              return;
            }
          }

          const autosaveResponse = await saveDiskAutosave(autosaveSnapshot);
          if (autosaveSequenceRef.current !== autosaveSequence) return;
          setDraftAutosaveStatus("saved");
          const updatedAt = autosaveResponse.updatedAt ? new Date(autosaveResponse.updatedAt).toLocaleTimeString() : "now";
          setDraftAutosaveMessage(`Autosaved draft at ${updatedAt}`);
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
