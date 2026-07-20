import { useCallback, useRef, useState } from "react";

import type { DraftAutosaveStatus } from "@/hooks/useProjectFileStatus";
import { deleteStoredLogo, listStoredLogos, saveStoredLogo } from "@/lib/api";
import {
  appendedLogoLibraryAsset,
  loadLogoLibrary,
  mergeLogoAssets,
  normalizeLogoAsset,
  normalizeLogoAssets,
  persistLogoLibrary,
  removedLogoLibraryAsset,
  updatedLogoLibraryAsset,
  type LogoAsset,
} from "@/lib/logoLibrary";

interface UseLogoLibraryControllerOptions {
  draftAutosaveStatus: DraftAutosaveStatus;
  setDraftAutosaveStatus: (status: DraftAutosaveStatus) => void;
  setDraftAutosaveMessage: (message: string) => void;
}

export function useLogoLibraryController({
  draftAutosaveStatus,
  setDraftAutosaveStatus,
  setDraftAutosaveMessage,
}: UseLogoLibraryControllerOptions) {
  const [logos, setLogos] = useState<LogoAsset[]>(loadLogoLibrary);
  const logosRef = useRef(logos);

  const replaceLogoLibrary = useCallback((nextLogos: LogoAsset[]) => {
    logosRef.current = nextLogos;
    setLogos(nextLogos);
    persistLogoLibrary(nextLogos);
    return nextLogos;
  }, []);

  const mergeLogosIntoLibrary = useCallback(
    (assets: Array<LogoAsset | null | undefined>) => {
      const nextLogos = mergeLogoAssets(logosRef.current, assets);
      if (nextLogos !== logosRef.current) replaceLogoLibrary(nextLogos);
      return nextLogos;
    },
    [replaceLogoLibrary],
  );

  const refreshLogoLibraryFromDisk = useCallback(async () => {
    const logosResponse = await listStoredLogos<unknown>();
    mergeLogosIntoLibrary(normalizeLogoAssets(logosResponse.logos));
  }, [mergeLogosIntoLibrary]);

  const writeLogoToDisk = useCallback(
    (logo: LogoAsset) => {
      if (draftAutosaveStatus === "unavailable") return;
      saveStoredLogo<LogoAsset>(logo)
        .then((savedLogo) => {
          const normalizedLogo = normalizeLogoAsset(savedLogo);
          if (normalizedLogo) mergeLogosIntoLibrary([normalizedLogo]);
        })
        .catch(() => {
          setDraftAutosaveStatus("unavailable");
          setDraftAutosaveMessage("Logo save failed: using browser backup only");
        });
    },
    [draftAutosaveStatus, mergeLogosIntoLibrary, setDraftAutosaveMessage, setDraftAutosaveStatus],
  );

  const importLogo = useCallback(
    (value: unknown) => {
      const logo = normalizeLogoAsset(value);
      if (!logo) return undefined;
      mergeLogosIntoLibrary([logo]);
      writeLogoToDisk(logo);
      return logo;
    },
    [mergeLogosIntoLibrary, writeLogoToDisk],
  );

  const updateLogoAsset = useCallback(
    (logoId: string, patch: { name: string; schoolName: string }) => {
      const updated = updatedLogoLibraryAsset(logosRef.current, logoId, patch);
      if (!updated) return null;
      replaceLogoLibrary(updated.logos);
      return updated.logo;
    },
    [replaceLogoLibrary],
  );

  const appendLogoAsset = useCallback(
    (logo: LogoAsset) => {
      replaceLogoLibrary(appendedLogoLibraryAsset(logosRef.current, logo));
      return logo;
    },
    [replaceLogoLibrary],
  );

  const removeLogoAsset = useCallback(
    (logoId: string) => {
      const nextLogos = removedLogoLibraryAsset(logosRef.current, logoId);
      if (!nextLogos) return null;
      replaceLogoLibrary(nextLogos);
      return nextLogos;
    },
    [replaceLogoLibrary],
  );

  const deleteLogoFromDisk = useCallback(
    (logoId: string) => {
      deleteStoredLogo(logoId).catch(() => {
        setDraftAutosaveStatus("unavailable");
        setDraftAutosaveMessage("Logo delete failed: using browser backup only");
      });
    },
    [setDraftAutosaveMessage, setDraftAutosaveStatus],
  );

  return {
    logos,
    logosRef,
    replaceLogoLibrary,
    refreshLogoLibraryFromDisk,
    writeLogoToDisk,
    importLogo,
    updateLogoAsset,
    appendLogoAsset,
    removeLogoAsset,
    deleteLogoFromDisk,
  };
}
