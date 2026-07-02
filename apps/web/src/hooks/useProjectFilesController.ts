import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import { getDefaultProject, listProjectFiles, saveProjectFile, updateProject } from "@/lib/api";
import {
  LEGACY_SAVED_TESTS_IMPORTED_KEY,
  LEGACY_SAVED_TESTS_MIGRATED_AT_KEY,
  type LegacySavedTestImport,
  type LegacySavedTestLike,
  planLegacySavedTestMigration,
} from "@/lib/projectLegacyMigration";
import type { ProjectSaveConflict } from "@/lib/projectSaveConflicts";

export type { ProjectSaveConflict } from "@/lib/projectSaveConflicts";

export type ProjectFilesStatus = "idle" | "loading" | "ready" | "saving" | "error";

interface UseProjectFilesControllerOptions<TLegacySavedTest extends LegacySavedTestLike> {
  initialActiveProjectFilePath?: string | null;
  initialActiveProjectFileRevision?: number | null;
  legacySavedTests: TLegacySavedTest[];
  storageHydrated: boolean;
  buildLegacySavedTestImport: (savedTest: TLegacySavedTest, filesForImport: ProjectFileSummary[]) => LegacySavedTestImport;
  isVisibleProjectFile?: (file: ProjectFileSummary) => boolean;
}

export function useProjectFilesController<TLegacySavedTest extends LegacySavedTestLike>({
  initialActiveProjectFilePath,
  initialActiveProjectFileRevision,
  legacySavedTests,
  storageHydrated,
  buildLegacySavedTestImport,
  isVisibleProjectFile,
}: UseProjectFilesControllerOptions<TLegacySavedTest>) {
  const [fileManagerOpen, setFileManagerOpen] = useState(false);
  const [activeProject, setActiveProject] = useState<ProjectSummary | null>(null);
  const [projectFiles, setProjectFiles] = useState<ProjectFileSummary[]>([]);
  const [projectFilesStatus, setProjectFilesStatus] = useState<ProjectFilesStatus>("idle");
  const [projectFilesMessage, setProjectFilesMessage] = useState("");
  const [activeProjectFilePath, setActiveProjectFilePath] = useState<string | null>(initialActiveProjectFilePath ?? null);
  const [activeProjectFileRevision, setActiveProjectFileRevision] = useState<number | null>(initialActiveProjectFileRevision ?? null);
  const [projectSaveConflict, setProjectSaveConflict] = useState<ProjectSaveConflict | null>(null);
  const emptyFileRefreshAttemptedRef = useRef(false);

  const refreshProjectFiles = useCallback(async () => {
    setProjectFilesStatus("loading");
    setProjectFilesMessage("Loading files");
    try {
      let project = await getDefaultProject();
      let filesResponse = await listProjectFiles(project.id);
      const migrationPlan = planLegacySavedTestMigration(project, legacySavedTests, filesResponse.files, buildLegacySavedTestImport);

      if (migrationPlan.shouldMarkMigrated) {
        for (const legacyImport of migrationPlan.imports) {
          await saveProjectFile(project.id, legacyImport.path, {
            content: legacyImport.content,
            kind: "file",
            fileType: "test",
            metadata: {
              format: "saved-test-json",
              source: "legacy-saved-tests-migration",
              legacySavedTestId: legacyImport.savedTest.id,
              ...legacyImport.metadata,
            },
          });
        }

        project = await updateProject(project.id, {
          metadata: {
            ...project.metadata,
            [LEGACY_SAVED_TESTS_MIGRATED_AT_KEY]: new Date().toISOString(),
            [LEGACY_SAVED_TESTS_IMPORTED_KEY]: migrationPlan.imports.length,
          },
        });
        filesResponse = await listProjectFiles(project.id);
        setProjectFilesMessage(migrationPlan.imports.length ? `Imported ${migrationPlan.imports.length} existing tests` : "");
      } else {
        setProjectFilesMessage("");
      }

      setActiveProject(project);
      setProjectFiles(filesResponse.files);
      setProjectFilesStatus("ready");
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Files unavailable");
    }
  }, [buildLegacySavedTestImport, legacySavedTests]);

  useEffect(() => {
    if (!fileManagerOpen) {
      emptyFileRefreshAttemptedRef.current = false;
      return;
    }
    if (!storageHydrated) {
      setProjectFilesStatus("loading");
      setProjectFilesMessage("Loading files");
      return;
    }
    void refreshProjectFiles();
  }, [storageHydrated, fileManagerOpen, refreshProjectFiles]);

  useEffect(() => {
    if (!fileManagerOpen || !storageHydrated || projectFilesStatus !== "ready") return;
    if (projectFiles.some((file) => file.kind === "file" && (isVisibleProjectFile?.(file) ?? true))) return;
    if (emptyFileRefreshAttemptedRef.current) return;

    emptyFileRefreshAttemptedRef.current = true;
    const timeoutId = window.setTimeout(() => {
      void refreshProjectFiles();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [storageHydrated, fileManagerOpen, isVisibleProjectFile, projectFiles, projectFilesStatus, refreshProjectFiles]);

  const openFileManager = useCallback(() => {
    setFileManagerOpen(true);
    if (!storageHydrated) {
      setProjectFilesStatus("loading");
      setProjectFilesMessage("Loading files");
      return;
    }
    void refreshProjectFiles();
  }, [refreshProjectFiles, storageHydrated]);

  const ensureProject = useCallback(async () => {
    const project = activeProject ?? (await getDefaultProject());
    setActiveProject(project);
    return project;
  }, [activeProject]);

  return {
    fileManagerOpen,
    setFileManagerOpen,
    openFileManager,
    activeProject,
    setActiveProject,
    ensureProject,
    projectFiles,
    setProjectFiles,
    projectFilesStatus,
    setProjectFilesStatus,
    projectFilesMessage,
    setProjectFilesMessage,
    activeProjectFilePath,
    setActiveProjectFilePath,
    activeProjectFileRevision,
    setActiveProjectFileRevision,
    projectSaveConflict,
    setProjectSaveConflict,
    refreshProjectFiles,
  };
}
