import type { ProjectSummary } from "@mauth-studio/shared";

export interface DiskStoragePayload<TLegacySavedTest, TLogo, TAutosave> {
  legacySavedTests: TLegacySavedTest[];
  logos: TLogo[];
  autosave: TAutosave | null;
}

export type InitialStorageHydrationDraftStatus = "ready" | "unavailable";
export type InitialStorageHydrationConflict = Record<string, unknown>;

export interface InitialStorageAutosaveResolution<TAutosave, TConflict = InitialStorageHydrationConflict> {
  snapshot: TAutosave;
  project: ProjectSummary | null;
  cleanFingerprint: string | null;
  conflict: TConflict | null;
}

export interface InitialStorageHydrationRuntime<TLegacySavedTest, TLogo, TAutosave, TConflict = InitialStorageHydrationConflict> {
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
  resolveAutosaveAgainstProjectFile: (autosave: TAutosave) => Promise<InitialStorageAutosaveResolution<TAutosave, TConflict>>;
  restoreAutosave: (args: {
    autosave: TAutosave;
    project: ProjectSummary | null;
    cleanFingerprint: string | null;
    conflict: TConflict | null;
  }) => void;
  setStorageHydrated: (hydrated: boolean) => void;
  setDraftAutosaveStatus: (status: InitialStorageHydrationDraftStatus) => void;
  setDraftAutosaveMessage: (message: string) => void;
  isCancelled?: () => boolean;
}

function cancelled(runtime: Pick<InitialStorageHydrationRuntime<unknown, unknown, unknown, unknown>, "isCancelled">) {
  return runtime.isCancelled?.() === true;
}

export async function hydrateInitialStorage<TLegacySavedTest, TLogo, TAutosave, TConflict = InitialStorageHydrationConflict>(
  runtime: InitialStorageHydrationRuntime<TLegacySavedTest, TLogo, TAutosave, TConflict>,
) {
  try {
    const diskStorage = await runtime.loadDiskStorage();
    if (cancelled(runtime)) return;

    const mergedLegacySavedTests = runtime.mergeLegacySavedTests(diskStorage.legacySavedTests, runtime.fallbackLegacySavedTests);
    const localLogos = runtime.currentLogos().length ? runtime.currentLogos() : runtime.starterLogos;
    const legacySavedTestLogos = mergedLegacySavedTests.map(runtime.legacySavedTestLogo);
    const mergedLogos = runtime.buildMergedLogos({
      diskLogos: diskStorage.logos,
      localLogos,
      starterLogos: runtime.shouldSeedStarterLogos() ? runtime.starterLogos : [],
      legacySavedTestLogos,
    });
    runtime.persistMergedStorage(mergedLegacySavedTests, mergedLogos);
    void Promise.allSettled(mergedLogos.map((logo) => runtime.saveLogoToDisk(logo))).catch(() => undefined);

    let autosave = runtime.newerAutosave(runtime.loadBrowserAutosave(), diskStorage.autosave);
    let autosaveProject: ProjectSummary | null = null;
    let autosaveCleanFingerprint: string | null = null;
    let autosaveConflict: TConflict | null = null;
    if (autosave && runtime.isClosedAutosave(autosave)) {
      autosave = runtime.clearAutosaveProjectFile(autosave);
    } else if (autosave) {
      const autosaveRevision = runtime.autosaveProjectFileRevision(autosave);
      if (autosaveRevision.filePath && typeof autosaveRevision.revision === "number") {
        const resolvedAutosave = await runtime.resolveAutosaveAgainstProjectFile(autosave);
        if (cancelled(runtime)) return;
        autosave = resolvedAutosave.snapshot;
        autosaveProject = resolvedAutosave.project;
        autosaveCleanFingerprint = resolvedAutosave.cleanFingerprint;
        autosaveConflict = resolvedAutosave.conflict;
      }
    }

    if (autosave) {
      runtime.restoreAutosave({
        autosave,
        project: autosaveProject,
        cleanFingerprint: autosaveCleanFingerprint,
        conflict: autosaveConflict,
      });
    }

    runtime.setDraftAutosaveStatus("ready");
    runtime.setDraftAutosaveMessage("Draft autosave ready");
  } catch {
    runtime.setDraftAutosaveStatus("unavailable");
    runtime.setDraftAutosaveMessage("API unavailable: using browser backup only");
  } finally {
    if (!cancelled(runtime)) runtime.setStorageHydrated(true);
  }
}
