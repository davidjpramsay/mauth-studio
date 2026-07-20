import type { ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

export const LEGACY_SAVED_TESTS_MIGRATED_AT_KEY = "legacySavedTestsMigratedAt";
export const LEGACY_SAVED_TESTS_IMPORTED_KEY = "legacySavedTestsImported";

export interface LegacySavedTestLike {
  id: string;
  name: string;
}

export interface LegacySavedTestImport {
  path: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface PlannedLegacySavedTestImport<TLegacySavedTest extends LegacySavedTestLike> extends LegacySavedTestImport {
  savedTest: TLegacySavedTest;
}

export interface LegacySavedTestMigrationPlan<TLegacySavedTest extends LegacySavedTestLike> {
  imports: PlannedLegacySavedTestImport<TLegacySavedTest>[];
  shouldMarkMigrated: boolean;
  skippedExternalFolder: boolean;
}

type MigrationProject = Pick<ProjectSummary, "documentsPath" | "workspacePath" | "metadata">;

export function isExternalDocumentsFolder(project: Pick<ProjectSummary, "documentsPath" | "workspacePath">) {
  return Boolean(project.documentsPath && project.workspacePath && project.documentsPath === project.workspacePath);
}

export function hasLegacySavedTestsMigration(project: Pick<ProjectSummary, "metadata">) {
  return typeof project.metadata?.[LEGACY_SAVED_TESTS_MIGRATED_AT_KEY] === "string";
}

export function planLegacySavedTestMigration<TLegacySavedTest extends LegacySavedTestLike>(
  project: MigrationProject,
  legacySavedTests: TLegacySavedTest[],
  files: ProjectFileSummary[],
  buildLegacySavedTestImport: (savedTest: TLegacySavedTest, filesForImport: ProjectFileSummary[]) => LegacySavedTestImport,
): LegacySavedTestMigrationPlan<TLegacySavedTest> {
  if (hasLegacySavedTestsMigration(project)) {
    return { imports: [], shouldMarkMigrated: false, skippedExternalFolder: false };
  }
  if (isExternalDocumentsFolder(project)) {
    return { imports: [], shouldMarkMigrated: false, skippedExternalFolder: true };
  }

  let projectFilesForImport = files;
  const imports: PlannedLegacySavedTestImport<TLegacySavedTest>[] = [];
  for (const savedTest of legacySavedTests) {
    const alreadyImported = projectFilesForImport.some((file) => file.kind === "file" && file.metadata?.legacySavedTestId === savedTest.id);
    if (alreadyImported) continue;

    const legacyImport = buildLegacySavedTestImport(savedTest, projectFilesForImport);
    imports.push({ savedTest, ...legacyImport });
    projectFilesForImport = [...projectFilesForImport, projectFileSummaryForPlannedImport(savedTest, legacyImport)];
  }

  return { imports, shouldMarkMigrated: true, skippedExternalFolder: false };
}

function projectFileSummaryForPlannedImport(savedTest: LegacySavedTestLike, legacyImport: LegacySavedTestImport): ProjectFileSummary {
  const now = new Date(0).toISOString();
  return {
    id: `planned-${savedTest.id}`,
    projectId: "planned",
    parentId: null,
    parentPath: parentPathForProjectPath(legacyImport.path),
    path: legacyImport.path,
    name: legacyImport.path.split("/").filter(Boolean).at(-1) ?? legacyImport.path,
    kind: "file",
    fileType: "test",
    metadata: {
      legacySavedTestId: savedTest.id,
      ...legacyImport.metadata,
    },
    sortOrder: 0,
    revision: 1,
    sizeBytes: legacyImport.content.length,
    createdAt: now,
    updatedAt: now,
  };
}

function parentPathForProjectPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  const parent = parts.slice(0, -1).join("/");
  return parent || null;
}
