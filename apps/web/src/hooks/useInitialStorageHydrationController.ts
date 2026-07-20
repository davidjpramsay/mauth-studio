import { useEffect, useRef } from "react";
import type { ProjectSummary } from "@mauth-studio/shared";

import type { DraftAutosaveStatus } from "@/hooks/useProjectFileStatus";
import type { ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import type { ProjectAutosaveResolution } from "@/hooks/useProjectAutosaveResolutionController";
import { hydrateInitialStorage, type DiskStoragePayload } from "@/lib/initialStorageHydration";

interface UseInitialStorageHydrationControllerOptions<TLegacySavedTest, TLogo, TAutosave> {
  loadDiskStorage: () => Promise<DiskStoragePayload<TLegacySavedTest, TLogo, TAutosave>>;
  fallbackLegacySavedTests: TLegacySavedTest[];
  currentLogos: () => TLogo[];
  starterLogos: TLogo[];
  legacySavedTestLogo: (savedTest: TLegacySavedTest) => TLogo | null | undefined;
  shouldSeedStarterLogos: () => boolean;
  mergeLegacySavedTests: (diskLegacySavedTests: TLegacySavedTest[], fallbackLegacySavedTests: TLegacySavedTest[]) => TLegacySavedTest[];
  buildMergedLogos: (args: {
    diskLogos: TLogo[];
    localLogos: TLogo[];
    starterLogos: TLogo[];
    legacySavedTestLogos: Array<TLogo | null | undefined>;
  }) => TLogo[];
  persistMergedStorage: (legacySavedTests: TLegacySavedTest[], logos: TLogo[]) => void;
  saveLogoToDisk: (logo: TLogo) => Promise<unknown>;
  loadBrowserAutosave: () => TAutosave | null;
  newerAutosave: (browserAutosave: TAutosave | null, diskAutosave: TAutosave | null) => TAutosave | null;
  isClosedAutosave: (autosave: TAutosave) => boolean;
  clearAutosaveProjectFile: (autosave: TAutosave) => TAutosave;
  autosaveProjectFileRevision: (autosave: TAutosave) => { filePath?: string; revision?: number };
  resolveAutosaveAgainstProjectFile: (autosave: TAutosave) => Promise<ProjectAutosaveResolution<TAutosave>>;
  restoreAutosave: (args: {
    autosave: TAutosave;
    project: ProjectSummary | null;
    cleanFingerprint: string | null;
    conflict: ProjectSaveConflict | null;
  }) => void;
  setStorageHydrated: (hydrated: boolean) => void;
  setDraftAutosaveStatus: (status: DraftAutosaveStatus) => void;
  setDraftAutosaveMessage: (message: string) => void;
}

export function useInitialStorageHydrationController<TLegacySavedTest, TLogo, TAutosave>(
  options: UseInitialStorageHydrationControllerOptions<TLegacySavedTest, TLogo, TAutosave>,
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let cancelled = false;
    void hydrateInitialStorage({ ...optionsRef.current, isCancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, []);
}
