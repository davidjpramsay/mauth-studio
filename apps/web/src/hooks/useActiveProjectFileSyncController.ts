import { useEffect, useRef } from "react";

import { runActiveProjectFileSyncAttempt, type ActiveProjectFileSyncOutcome } from "@/lib/projectActiveFileSync";

interface UseActiveProjectFileSyncControllerOptions {
  storageHydrated: boolean;
  activeProjectFilePath: string | null;
  fileOperationBusy: boolean;
  intervalMs: number;
  syncActiveProjectFileFromDisk: () => ActiveProjectFileSyncOutcome | Promise<ActiveProjectFileSyncOutcome>;
  onUnexpectedSyncError: (error: unknown) => void;
  onSyncRecovered: () => void;
}

export function useActiveProjectFileSyncController({
  storageHydrated,
  activeProjectFilePath,
  fileOperationBusy,
  intervalMs,
  syncActiveProjectFileFromDisk,
  onUnexpectedSyncError,
  onSyncRecovered,
}: UseActiveProjectFileSyncControllerOptions) {
  const optionsRef = useRef({ fileOperationBusy, syncActiveProjectFileFromDisk, onUnexpectedSyncError, onSyncRecovered });
  const syncInFlightRef = useRef(false);
  const syncUnavailableRef = useRef(false);

  optionsRef.current = { fileOperationBusy, syncActiveProjectFileFromDisk, onUnexpectedSyncError, onSyncRecovered };

  useEffect(() => {
    if (!storageHydrated || !activeProjectFilePath) return;

    let cancelled = false;
    const runSync = () => {
      const { fileOperationBusy, syncActiveProjectFileFromDisk, onUnexpectedSyncError, onSyncRecovered } = optionsRef.current;
      if (cancelled || fileOperationBusy || document.visibilityState === "hidden" || syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      void runActiveProjectFileSyncAttempt({
        wasUnavailable: syncUnavailableRef.current,
        sync: syncActiveProjectFileFromDisk,
      })
        .then((attempt) => {
          if (cancelled) return;
          syncUnavailableRef.current = attempt.unavailable;
          if (attempt.becameUnavailable && attempt.error) onUnexpectedSyncError(attempt.error);
          if (attempt.recovered) onSyncRecovered();
        })
        .catch((error) => {
          if (!cancelled) onUnexpectedSyncError(error);
        })
        .finally(() => {
          syncInFlightRef.current = false;
        });
    };

    runSync();
    const intervalId = window.setInterval(runSync, intervalMs);
    window.addEventListener("focus", runSync);
    document.addEventListener("visibilitychange", runSync);

    return () => {
      cancelled = true;
      syncUnavailableRef.current = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", runSync);
      document.removeEventListener("visibilitychange", runSync);
    };
  }, [activeProjectFilePath, intervalMs, storageHydrated]);
}
