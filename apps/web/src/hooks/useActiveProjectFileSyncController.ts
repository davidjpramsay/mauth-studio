import { useEffect, useRef } from "react";

interface UseActiveProjectFileSyncControllerOptions {
  storageHydrated: boolean;
  activeProjectFilePath: string | null;
  fileOperationBusy: boolean;
  intervalMs: number;
  syncActiveProjectFileFromDisk: () => void | Promise<void>;
}

export function useActiveProjectFileSyncController({
  storageHydrated,
  activeProjectFilePath,
  fileOperationBusy,
  intervalMs,
  syncActiveProjectFileFromDisk,
}: UseActiveProjectFileSyncControllerOptions) {
  const optionsRef = useRef({ fileOperationBusy, syncActiveProjectFileFromDisk });
  const syncInFlightRef = useRef(false);

  optionsRef.current = { fileOperationBusy, syncActiveProjectFileFromDisk };

  useEffect(() => {
    if (!storageHydrated || !activeProjectFilePath) return;

    let cancelled = false;
    const runSync = () => {
      const { fileOperationBusy, syncActiveProjectFileFromDisk } = optionsRef.current;
      if (cancelled || fileOperationBusy || document.visibilityState === "hidden" || syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      void Promise.resolve(syncActiveProjectFileFromDisk()).finally(() => {
        syncInFlightRef.current = false;
      });
    };

    runSync();
    const intervalId = window.setInterval(runSync, intervalMs);
    window.addEventListener("focus", runSync);
    document.addEventListener("visibilitychange", runSync);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", runSync);
      document.removeEventListener("visibilitychange", runSync);
    };
  }, [activeProjectFilePath, intervalMs, storageHydrated]);
}
