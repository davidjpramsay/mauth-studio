import type { MutableRefObject } from "react";
import type { ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import type { ProjectFilesStatus, ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import { getDefaultProject, getProjectFile, getProjectFileSummary, listProjectFiles, openExternalProjectDocumentFile } from "@/lib/api";
import { activeProjectFileSyncPlan, type ActiveProjectFileSyncOutcome } from "@/lib/projectActiveFileSync";
import {
  isProjectTestFile,
  isStructuredMauthDocumentPath,
  testFileDisplayName,
  testPathBasename,
  testPathFromProjectPath,
} from "@/lib/projectFiles";
import { isProjectFilesUnavailableError, projectFilesUnavailableMessage } from "@/lib/projectFilesActions";
import { fileChangedProjectSaveConflict } from "@/lib/projectSaveConflicts";
import {
  projectFileTransitionCanProceed,
  type ProjectFileTransitionIntent,
  type ProjectFileTransitionOutcome,
} from "@/lib/projectFileBeforeOpenWorkflow";

interface UseProjectDocumentOpenControllerOptions<TSavedDocument> {
  activeProject: ProjectSummary | null;
  projectFiles: ProjectFileSummary[];
  activeProjectFilePath: string | null;
  activeProjectFilePathRef: MutableRefObject<string | null>;
  activeProjectFileRevisionRef: MutableRefObject<number | null>;
  lastProjectSaveFingerprintRef: MutableRefObject<string | null>;
  fileOperationBusy: boolean;
  revisionMissingErrorMessage: string;
  parseSavedDocument: (content: string | null | undefined) => TSavedDocument | null;
  applySavedProjectDocument: (project: ProjectSummary, filePath: string, savedDocument: TSavedDocument, revision: number | null) => void;
  prepareCurrentProjectFileTransition: (
    project: ProjectSummary,
    intent: ProjectFileTransitionIntent,
  ) => Promise<ProjectFileTransitionOutcome>;
  prepareOpenProjectFileTransition?: (
    project: ProjectSummary,
    intent: ProjectFileTransitionIntent,
  ) => Promise<ProjectFileTransitionOutcome>;
  currentEditorDocumentFingerprint: () => string;
  currentDocumentIdentity?: () => string | null;
  applyOpenedProjectDocument?: (
    project: ProjectSummary,
    filePath: string,
    savedDocument: TSavedDocument,
    revision: number | null,
  ) => void | Promise<void>;
  onOpenFailed?: (request: { path: string; external: boolean; message: string }) => void;
  projectFileConflictFromError: (error: unknown, filePath: string, localRevision: number | null) => ProjectSaveConflict | null;
  setActiveProject: (project: ProjectSummary) => void;
  setProjectFiles: (files: ProjectFileSummary[]) => void;
  setProjectSaveConflict: (conflict: ProjectSaveConflict | null) => void;
  setProjectFilesStatus: (status: ProjectFilesStatus) => void;
  setProjectFilesMessage: (message: string) => void;
  refreshProjectFiles: () => Promise<void>;
  onOpened?: () => void;
  api?: Partial<{
    getDefaultProject: typeof getDefaultProject;
    getProjectFile: typeof getProjectFile;
    listProjectFiles: typeof listProjectFiles;
    getProjectFileSummary: typeof getProjectFileSummary;
    openExternalProjectDocumentFile: typeof openExternalProjectDocumentFile;
  }>;
}

function projectFileDisplayName(filePath: string) {
  return testFileDisplayName(testPathBasename(testPathFromProjectPath(filePath) ?? filePath));
}

export function useProjectDocumentOpenController<TSavedDocument>({
  activeProject,
  projectFiles,
  activeProjectFilePath,
  activeProjectFilePathRef,
  activeProjectFileRevisionRef,
  lastProjectSaveFingerprintRef,
  fileOperationBusy,
  revisionMissingErrorMessage,
  parseSavedDocument,
  applySavedProjectDocument,
  prepareCurrentProjectFileTransition,
  prepareOpenProjectFileTransition,
  currentEditorDocumentFingerprint,
  currentDocumentIdentity,
  applyOpenedProjectDocument,
  onOpenFailed,
  projectFileConflictFromError,
  setActiveProject,
  setProjectFiles,
  setProjectSaveConflict,
  setProjectFilesStatus,
  setProjectFilesMessage,
  refreshProjectFiles,
  onOpened,
  api,
}: UseProjectDocumentOpenControllerOptions<TSavedDocument>) {
  const runtimeApi = {
    getDefaultProject,
    getProjectFile,
    listProjectFiles,
    getProjectFileSummary,
    openExternalProjectDocumentFile,
    ...api,
  };

  function captureReadGuard() {
    const identity = currentDocumentIdentity?.();
    const path = activeProjectFilePathRef.current;
    const revision = activeProjectFileRevisionRef.current;
    const fingerprint = currentEditorDocumentFingerprint();
    return () =>
      identity === currentDocumentIdentity?.() &&
      path === activeProjectFilePathRef.current &&
      revision === activeProjectFileRevisionRef.current &&
      fingerprint === currentEditorDocumentFingerprint();
  }

  function reportOpenFailure(path: string, external: boolean, error: unknown) {
    const message = isProjectFilesUnavailableError(error)
      ? projectFilesUnavailableMessage(error)
      : error instanceof Error
        ? error.message
        : "The document could not be opened.";
    setProjectFilesStatus("error");
    setProjectFilesMessage(message);
    onOpenFailed?.({ path, external, message });
  }

  async function reloadProjectFileFromDisk(filePath: string) {
    const isCurrent = captureReadGuard();
    const project = activeProject ?? (await runtimeApi.getDefaultProject());
    const fileName = projectFileDisplayName(filePath);
    const document = await runtimeApi.getProjectFile(project, filePath);
    if (!isCurrent()) return false;
    const savedDocument = parseSavedDocument(document.content);
    if (!savedDocument) throw new Error("Unsupported project file");

    setActiveProject(project);
    setProjectFiles(projectFiles.map((file) => (file.path === filePath ? document : file)));
    applySavedProjectDocument(project, filePath, savedDocument, document.revision);
    setProjectSaveConflict(null);
    setProjectFilesStatus("ready");
    setProjectFilesMessage(`Reloaded ${fileName} from disk`);
    return true;
  }

  async function openProjectFile(filePath: string, options: { throwErrors?: boolean } = {}) {
    try {
      const project = activeProject ?? (await runtimeApi.getDefaultProject());
      const summary = projectFiles.find((file) => file.path === filePath);
      if (summary && !isProjectTestFile(summary)) {
        setProjectFilesMessage("Only test files can be opened");
        return false;
      }
      if (!summary && !isStructuredMauthDocumentPath(filePath)) {
        setProjectFilesMessage("Only test files can be opened");
        return false;
      }

      const fileName = projectFileDisplayName(filePath);
      const beforeOpen = await (prepareOpenProjectFileTransition ?? prepareCurrentProjectFileTransition)(project, {
        kind: "open-file",
        targetLabel: fileName,
      });
      if (!projectFileTransitionCanProceed(beforeOpen)) return false;

      setProjectFilesStatus("loading");
      setProjectFilesMessage(`Opening ${fileName}`);
      const document = await runtimeApi.getProjectFile(project, filePath);
      const savedDocument = parseSavedDocument(document.content);
      if (!savedDocument) throw new Error("Unsupported project file");

      await (applyOpenedProjectDocument ?? applySavedProjectDocument)(project, filePath, savedDocument, document.revision);
      setProjectFilesStatus("ready");
      setProjectFilesMessage(`Opened ${fileName}`);
      onOpened?.();
      return true;
    } catch (error) {
      if (options.throwErrors) {
        setProjectFilesStatus("error");
        setProjectFilesMessage(error instanceof Error ? error.message : "Document open failed");
        throw error;
      }
      if (error instanceof Error && error.message === revisionMissingErrorMessage) return false;
      if (isProjectFilesUnavailableError(error)) {
        reportOpenFailure(filePath, false, error);
        return false;
      }
      const conflictTarget = activeProjectFilePath ?? filePath;
      const conflict = projectFileConflictFromError(error, conflictTarget, activeProjectFileRevisionRef.current);
      if (conflict) {
        setProjectSaveConflict(conflict);
        setProjectFilesStatus("error");
        setProjectFilesMessage("File changed on disk");
        void refreshProjectFiles();
        return false;
      }
      reportOpenFailure(filePath, false, error);
      return false;
    }
  }

  async function openExternalProjectDocument(absoluteFilePath: string) {
    try {
      const fileName = projectFileDisplayName(absoluteFilePath);
      setProjectFilesStatus("loading");
      setProjectFilesMessage(`Opening ${fileName}`);
      const { project, document } = await runtimeApi.openExternalProjectDocumentFile(absoluteFilePath);
      const savedDocument = parseSavedDocument(document.content);
      if (!savedDocument) throw new Error("Unsupported project file");
      await (applyOpenedProjectDocument ?? applySavedProjectDocument)(project, document.path, savedDocument, document.revision);
      setProjectFiles([document]);
      setProjectFilesStatus("ready");
      setProjectFilesMessage(`Opened ${fileName}`);
      if (typeof window !== "undefined") void window.mauthDesktop?.rememberDocument?.(absoluteFilePath).catch(() => {});
      onOpened?.();
      return true;
    } catch (error) {
      reportOpenFailure(absoluteFilePath, true, error);
      return false;
    }
  }

  async function syncActiveProjectFileFromDisk(): Promise<ActiveProjectFileSyncOutcome> {
    if (fileOperationBusy) return "skipped";
    const filePath = activeProjectFilePathRef.current;
    if (!filePath) return "skipped";
    const isCurrent = captureReadGuard();

    let project: ProjectSummary;
    let summary: ProjectFileSummary | undefined;
    try {
      project = activeProject ?? (await runtimeApi.getDefaultProject());
      summary = await runtimeApi.getProjectFileSummary(project, filePath);
    } catch (error) {
      if (!isCurrent()) return "skipped";
      if (error instanceof Error && "status" in error && error.status === 404) {
        setProjectFilesStatus("error");
        setProjectFilesMessage("Active file is no longer in its documents folder");
        return "missing";
      }
      setProjectFilesStatus("error");
      setProjectFilesMessage(projectFilesUnavailableMessage(error));
      return "unavailable";
    }
    if (!isCurrent()) return "skipped";
    const localRevision = activeProjectFileRevisionRef.current;
    const plan = activeProjectFileSyncPlan({
      summary,
      localRevision,
      dirty: lastProjectSaveFingerprintRef.current !== currentEditorDocumentFingerprint(),
    });

    if (plan.kind === "missing") {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Active file is no longer in the selected documents folder");
      return "missing";
    }
    if (plan.kind === "current") return "current";

    const conflict = fileChangedProjectSaveConflict(filePath, localRevision, plan.remoteRevision);

    if (plan.kind === "conflict") {
      setProjectSaveConflict(conflict);
      setProjectFilesStatus("error");
      setProjectFilesMessage("File changed on disk");
      return "conflict";
    }

    try {
      return (await reloadProjectFileFromDisk(filePath)) ? "reloaded" : "skipped";
    } catch (error) {
      if (!isCurrent()) return "skipped";
      if (isProjectFilesUnavailableError(error)) {
        setProjectFilesStatus("error");
        setProjectFilesMessage(projectFilesUnavailableMessage(error));
        return "unavailable";
      }
      setProjectSaveConflict(conflict);
      setProjectFilesStatus("error");
      setProjectFilesMessage("Reload failed");
      return "reload-failed";
    }
  }

  async function reloadActiveProjectFileFromDisk() {
    const filePath = activeProjectFilePathRef.current;
    if (!filePath || fileOperationBusy) return false;

    try {
      return await reloadProjectFileFromDisk(filePath);
    } catch (error) {
      setProjectFilesStatus("error");
      setProjectFilesMessage(isProjectFilesUnavailableError(error) ? projectFilesUnavailableMessage(error) : "Reload failed");
      return false;
    }
  }

  return {
    openProjectFile,
    openExternalProjectDocument,
    syncActiveProjectFileFromDisk,
    reloadActiveProjectFileFromDisk,
  };
}
