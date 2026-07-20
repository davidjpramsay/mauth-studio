import type { ProjectSummary } from "@mauth-studio/shared";

import { useInitialStorageHydrationController } from "@/hooks/useInitialStorageHydrationController";
import { useProjectAutosaveResolutionController, type ProjectAutosaveResolution } from "@/hooks/useProjectAutosaveResolutionController";
import type { DraftAutosaveStatus } from "@/hooks/useProjectFileStatus";
import { getStorageAutosave, listStoredLogos, listStoredTests, saveStoredLogo } from "@/lib/api";
import type { AutosavedEditorSnapshot, createEditorAppPersistence, SavedTest } from "@/lib/editorAppPersistence";
import {
  autosaveProjectFileIdentity,
  autosaveSnapshotFromSavedTest,
  autosaveWithoutProjectFile,
  mergedEditorStorageLogos,
} from "@/lib/editorStorageHydration";
import { STARTER_LOGOS, markStarterLogosSeeded, normalizeLogoAssets, shouldSeedStarterLogos, type LogoAsset } from "@/lib/logoLibrary";
import { fingerprintProjectDocument, parseProjectSavedDocumentSafely } from "@/lib/projectDocumentSerialization";

type EditorAppPersistence = ReturnType<typeof createEditorAppPersistence>;

interface UseEditorStorageHydrationControllerOptions {
  activeProject: ProjectSummary | null;
  legacySavedTests: SavedTest[];
  logosRef: { current: LogoAsset[] };
  persistence: Pick<
    EditorAppPersistence,
    | "normalizeSavedTests"
    | "normalizeEditorSnapshot"
    | "normalizeSavedTest"
    | "mergeLegacySavedTests"
    | "persistLegacySavedTests"
    | "loadCurrentDraft"
    | "newerAutosave"
    | "editorDocumentFingerprint"
  >;
  setLegacySavedTests: (tests: SavedTest[]) => void;
  replaceLogoLibrary: (logos: LogoAsset[]) => LogoAsset[];
  restoreAutosave: (resolution: ProjectAutosaveResolution<AutosavedEditorSnapshot>) => void;
  setStorageHydrated: (hydrated: boolean) => void;
  setDraftAutosaveStatus: (status: DraftAutosaveStatus) => void;
  setDraftAutosaveMessage: (message: string) => void;
}

export function useEditorStorageHydrationController({
  activeProject,
  legacySavedTests,
  logosRef,
  persistence,
  setLegacySavedTests,
  replaceLogoLibrary,
  restoreAutosave,
  setStorageHydrated,
  setDraftAutosaveStatus,
  setDraftAutosaveMessage,
}: UseEditorStorageHydrationControllerOptions) {
  const { resolveAutosaveAgainstProjectFile } = useProjectAutosaveResolutionController<AutosavedEditorSnapshot, SavedTest>({
    activeProject,
    parseSavedDocument: (content) => parseProjectSavedDocumentSafely(content, persistence.normalizeSavedTest),
    savedDocumentFingerprint: (savedTest) =>
      fingerprintProjectDocument({
        document: savedTest,
        logos: logosRef.current,
        runtime: { editorDocumentFingerprint: persistence.editorDocumentFingerprint },
      }),
    autosaveSnapshotFingerprint: (snapshot) =>
      fingerprintProjectDocument({
        document: snapshot,
        logos: logosRef.current,
        runtime: { editorDocumentFingerprint: persistence.editorDocumentFingerprint },
      }),
    savedDocumentToAutosaveSnapshot: autosaveSnapshotFromSavedTest,
  });

  useInitialStorageHydrationController<SavedTest, LogoAsset, AutosavedEditorSnapshot>({
    loadDiskStorage: async () => {
      const [testsResponse, autosaveResponse, logosResponse] = await Promise.all([
        listStoredTests<unknown>(),
        getStorageAutosave<unknown>(),
        listStoredLogos<unknown>(),
      ]);
      return {
        legacySavedTests: persistence.normalizeSavedTests(testsResponse.tests),
        autosave: persistence.normalizeEditorSnapshot(autosaveResponse.autosave),
        logos: normalizeLogoAssets(logosResponse.logos),
      };
    },
    fallbackLegacySavedTests: legacySavedTests,
    currentLogos: () => logosRef.current,
    starterLogos: STARTER_LOGOS,
    legacySavedTestLogo: (test) => test.logo,
    shouldSeedStarterLogos,
    mergeLegacySavedTests: persistence.mergeLegacySavedTests,
    buildMergedLogos: mergedEditorStorageLogos,
    persistMergedStorage: (mergedLegacySavedTests, mergedLogos) => {
      setLegacySavedTests(mergedLegacySavedTests);
      replaceLogoLibrary(mergedLogos);
      markStarterLogosSeeded();
      persistence.persistLegacySavedTests(mergedLegacySavedTests);
    },
    saveLogoToDisk: (logo) => saveStoredLogo<LogoAsset>(logo),
    loadBrowserAutosave: persistence.loadCurrentDraft,
    newerAutosave: persistence.newerAutosave,
    isClosedAutosave: (autosave) => autosave.documentOpen === false,
    clearAutosaveProjectFile: autosaveWithoutProjectFile,
    autosaveProjectFileRevision: autosaveProjectFileIdentity,
    resolveAutosaveAgainstProjectFile,
    restoreAutosave: ({ autosave, project, cleanFingerprint, conflict }) =>
      restoreAutosave({ snapshot: autosave, project, cleanFingerprint, conflict }),
    setStorageHydrated,
    setDraftAutosaveStatus,
    setDraftAutosaveMessage,
  });
}
