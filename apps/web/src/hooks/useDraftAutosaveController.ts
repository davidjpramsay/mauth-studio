import { useEffect, useRef, useState } from "react";
import type { DraftAutosaveStatus } from "@/hooks/useProjectFileStatus";
import { draftAutosaveSavedMessage, draftAutosaveStartMessage } from "@/lib/draftAutosaveLifecycle";
import { recoveryRetryDelay } from "@/lib/recoveryWrites";

interface AutosaveSnapshotLike {
  updatedAt?: string;
}

interface UseDraftAutosaveControllerOptions<TAutosave extends AutosaveSnapshotLike> {
  storageHydrated: boolean;
  editorDocumentOpen: boolean;
  activeProjectFilePath: string | null;
  activeProjectFileRevision: number | null;
  draftChangeKey: string;
  createAutosaveSnapshot: () => TAutosave;
  persistLocalDraft: (snapshot: TAutosave) => void;
  saveDiskAutosave: (snapshot: TAutosave) => Promise<TAutosave>;
  setDraftAutosaveStatus: (status: DraftAutosaveStatus) => void;
  setDraftAutosaveMessage: (message: string) => void;
  localDraftDebounceMs: number;
  diskAutosaveDebounceMs: number;
}

export function useDraftAutosaveController<TAutosave extends AutosaveSnapshotLike>(options: UseDraftAutosaveControllerOptions<TAutosave>) {
  const { storageHydrated, editorDocumentOpen, activeProjectFilePath, activeProjectFileRevision, draftChangeKey } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const failuresRef = useRef(0);
  const retryAtRef = useRef(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!storageHydrated) return;
    const timeout = window.setTimeout(() => {
      const current = optionsRef.current;
      current.persistLocalDraft(current.createAutosaveSnapshot());
    }, optionsRef.current.localDraftDebounceMs);
    return () => window.clearTimeout(timeout);
  }, [draftChangeKey, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    const persist = () => {
      const current = optionsRef.current;
      current.persistLocalDraft(current.createAutosaveSnapshot());
    };
    const retryNow = () => {
      retryAtRef.current = 0;
      setRetry((value) => value + 1);
    };
    window.addEventListener("pagehide", persist);
    window.addEventListener("online", retryNow);
    return () => {
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("online", retryNow);
    };
  }, [storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    let cancelled = false;
    let retryTimer: number | undefined;
    const timeout = window.setTimeout(
      async () => {
        const current = optionsRef.current;
        current.setDraftAutosaveStatus("saving");
        current.setDraftAutosaveMessage(draftAutosaveStartMessage(current));
        try {
          // Recovery is local state, not a project-file save. A cloud index
          // outage or revision conflict must never prevent saving the draft.
          const response = await current.saveDiskAutosave(current.createAutosaveSnapshot());
          if (cancelled) return;
          failuresRef.current = 0;
          retryAtRef.current = 0;
          current.setDraftAutosaveStatus("saved");
          current.setDraftAutosaveMessage(draftAutosaveSavedMessage(response.updatedAt));
        } catch {
          if (cancelled) return;
          const delay = recoveryRetryDelay(++failuresRef.current);
          retryAtRef.current = Date.now() + delay;
          current.setDraftAutosaveStatus("unavailable");
          current.setDraftAutosaveMessage("Disk backup unavailable. Browser backup retained; retrying automatically.");
          retryTimer = window.setTimeout(() => setRetry((value) => value + 1), delay);
        }
      },
      Math.max(optionsRef.current.diskAutosaveDebounceMs, retryAtRef.current - Date.now()),
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      window.clearTimeout(retryTimer);
    };
  }, [activeProjectFilePath, activeProjectFileRevision, draftChangeKey, editorDocumentOpen, storageHydrated, retry]);
}
