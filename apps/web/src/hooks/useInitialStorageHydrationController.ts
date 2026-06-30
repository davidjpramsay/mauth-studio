import { useEffect, useRef } from "react";
import type { ProjectSummary } from "@mauth-studio/shared";

import type { DraftAutosaveStatus } from "@/hooks/useProjectFileStatus";
import type { ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import type { ProjectAutosaveResolution } from "@/hooks/useProjectAutosaveResolutionController";

interface DiskStoragePayload<TLegacySavedTest, TLogo, TAutosave> {
  legacySavedTests: TLegacySavedTest[];
  logos: TLogo[];
  autosave: TAutosave | null;
}

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

    async function hydrateDiskStorage() {
      const {
        loadDiskStorage,
        fallbackLegacySavedTests,
        currentLogos,
        starterLogos,
        legacySavedTestLogo,
        shouldSeedStarterLogos,
        mergeLegacySavedTests,
        buildMergedLogos,
        persistMergedStorage,
        saveLogoToDisk,
        loadBrowserAutosave,
        newerAutosave,
        isClosedAutosave,
        clearAutosaveProjectFile,
        autosaveProjectFileRevision,
        resolveAutosaveAgainstProjectFile,
        restoreAutosave,
        setStorageHydrated,
        setDraftAutosaveStatus,
        setDraftAutosaveMessage,
      } = optionsRef.current;

      try {
        const diskStorage = await loadDiskStorage();
        if (cancelled) return;

        const mergedLegacySavedTests = mergeLegacySavedTests(diskStorage.legacySavedTests, fallbackLegacySavedTests);
        const localLogos = currentLogos().length ? currentLogos() : starterLogos;
        const legacySavedTestLogos = mergedLegacySavedTests.map(legacySavedTestLogo);
        const mergedLogos = buildMergedLogos({
          diskLogos: diskStorage.logos,
          localLogos,
          starterLogos: shouldSeedStarterLogos() ? starterLogos : [],
          legacySavedTestLogos,
        });
        persistMergedStorage(mergedLegacySavedTests, mergedLogos);
        Promise.allSettled(mergedLogos.map((logo) => saveLogoToDisk(logo))).catch(() => undefined);

        let autosave = newerAutosave(loadBrowserAutosave(), diskStorage.autosave);
        let autosaveProject: ProjectSummary | null = null;
        let autosaveCleanFingerprint: string | null = null;
        let autosaveConflict: ProjectSaveConflict | null = null;
        if (autosave && isClosedAutosave(autosave)) {
          autosave = clearAutosaveProjectFile(autosave);
        } else if (autosave) {
          const autosaveRevision = autosaveProjectFileRevision(autosave);
          if (autosaveRevision.filePath && typeof autosaveRevision.revision === "number") {
            const resolvedAutosave = await resolveAutosaveAgainstProjectFile(autosave);
            if (cancelled) return;
            autosave = resolvedAutosave.snapshot;
            autosaveProject = resolvedAutosave.project;
            autosaveCleanFingerprint = resolvedAutosave.cleanFingerprint;
            autosaveConflict = resolvedAutosave.conflict;
          }
        }

        if (autosave) {
          restoreAutosave({
            autosave,
            project: autosaveProject,
            cleanFingerprint: autosaveCleanFingerprint,
            conflict: autosaveConflict,
          });
        }

        setDraftAutosaveStatus("ready");
        setDraftAutosaveMessage("Draft autosave ready");
      } catch {
        setDraftAutosaveStatus("unavailable");
        setDraftAutosaveMessage("API unavailable: using browser backup only");
      } finally {
        if (!cancelled) setStorageHydrated(true);
      }
    }

    void hydrateDiskStorage();
    return () => {
      cancelled = true;
    };
  }, []);
}
