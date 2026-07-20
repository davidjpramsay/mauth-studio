import type { AutosavedEditorSnapshot, SavedTest } from "./editorAppPersistence.ts";
import { appendMissingLogoAssets, type LogoAsset } from "./logoLibrary.ts";

export function mergedEditorStorageLogos({
  diskLogos,
  localLogos,
  starterLogos,
  legacySavedTestLogos,
}: {
  diskLogos: LogoAsset[];
  localLogos: LogoAsset[];
  starterLogos: LogoAsset[];
  legacySavedTestLogos: Array<LogoAsset | null | undefined>;
}) {
  const persistedLogos = diskLogos.length ? diskLogos : localLogos;
  return appendMissingLogoAssets(
    appendMissingLogoAssets(appendMissingLogoAssets(persistedLogos, starterLogos), localLogos),
    legacySavedTestLogos,
  );
}

export function autosaveSnapshotFromSavedTest(savedTest: SavedTest, filePath: string, revision: number | null): AutosavedEditorSnapshot {
  return {
    frontMatter: savedTest.frontMatter,
    questions: savedTest.questions,
    sectionHeadings: savedTest.sectionHeadings,
    documentFlow: savedTest.documentFlow,
    formattingConfig: savedTest.formattingConfig,
    logo: savedTest.logo,
    activeProjectFilePath: filePath,
    activeProjectFileRevision: revision ?? undefined,
    updatedAt: savedTest.updatedAt,
  };
}

export function autosaveWithoutProjectFile(snapshot: AutosavedEditorSnapshot): AutosavedEditorSnapshot {
  return {
    ...snapshot,
    activeProjectFilePath: undefined,
    activeProjectFileRevision: undefined,
  };
}

export function autosaveProjectFileIdentity(snapshot: AutosavedEditorSnapshot) {
  return {
    filePath: snapshot.activeProjectFilePath,
    revision: snapshot.activeProjectFileRevision,
  };
}
