import type { MutableRefObject } from "react";
import type { ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import type { ProjectFilesStatus, ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import { getDefaultProject, getProjectFile, listProjectFiles } from "@/lib/api";
import { activeProjectFileSyncPlan, type ActiveProjectFileSyncOutcome } from "@/lib/projectActiveFileSync";
import { isProjectTestFile, testFileDisplayName, testPathBasename, testPathFromProjectPath } from "@/lib/projectFiles";
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
  currentEditorDocumentFingerprint: () => string;
  projectFileConflictFromError: (error: unknown, filePath: string, localRevision: number | null) => ProjectSaveConflict | null;
  setActiveProject: (project: ProjectSummary) => void;
  setProjectFiles: (files: ProjectFileSummary[]) => void;
  setProjectSaveConflict: (conflict: ProjectSaveConflict | null) => void;
  setProjectFilesStatus: (status: ProjectFilesStatus) => void;
  setProjectFilesMessage: (message: string) => void;
  refreshProjectFiles: () => Promise<void>;
  onOpened?: () => void;
  api?: {
    getDefaultProject: typeof getDefaultProject;
    getProjectFile: typeof getProjectFile;
    listProjectFiles: typeof listProjectFiles;
  };
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
  currentEditorDocumentFingerprint,
  projectFileConflictFromError,
  setActiveProject,
  setProjectFiles,
  setProjectSaveConflict,
  setProjectFilesStatus,
  setProjectFilesMessage,
  refreshProjectFiles,
  onOpened,
  api = { getDefaultProject, getProjectFile, listProjectFiles },
}: UseProjectDocumentOpenControllerOptions<TSavedDocument>) {
  async function reloadProjectFileFromDisk(filePath: string) {
    const project = activeProject ?? (await api.getDefaultProject());
    const fileName = projectFileDisplayName(filePath);
    setProjectFilesStatus("loading");
    setProjectFilesMessage(`Reloading ${fileName}`);

    const [document, filesResponse] = await Promise.all([api.getProjectFile(project.id, filePath), api.listProjectFiles(project.id)]);
    const savedDocument = parseSavedDocument(document.content);
    if (!savedDocument) throw new Error("Unsupported project file");

    setActiveProject(project);
    setProjectFiles(filesResponse.files);
    applySavedProjectDocument(project, filePath, savedDocument, document.revision);
    setProjectSaveConflict(null);
    setProjectFilesStatus("ready");
    setProjectFilesMessage(`Reloaded ${fileName} from disk`);
  }

  async function openProjectFile(filePath: string) {
    try {
      const project = activeProject ?? (await api.getDefaultProject());
      const summary = projectFiles.find((file) => file.path === filePath);
      if (summary && !isProjectTestFile(summary)) {
        setProjectFilesMessage("Only test files can be opened");
        return;
      }
      if (!summary && !filePath.endsWith(".test.json")) {
        setProjectFilesMessage("Only test files can be opened");
        return;
      }

      const fileName = projectFileDisplayName(filePath);
      const beforeOpen = await prepareCurrentProjectFileTransition(project, { kind: "open-file", targetLabel: fileName });
      if (!projectFileTransitionCanProceed(beforeOpen)) return;

      setProjectFilesStatus("loading");
      setProjectFilesMessage(`Opening ${fileName}`);
      const document = await api.getProjectFile(project.id, filePath);
      const savedDocument = parseSavedDocument(document.content);
      if (!savedDocument) throw new Error("Unsupported project file");

      applySavedProjectDocument(project, filePath, savedDocument, document.revision);
      setProjectFilesStatus("ready");
      setProjectFilesMessage(`Opened ${fileName}`);
      onOpened?.();
    } catch (error) {
      if (error instanceof Error && error.message === revisionMissingErrorMessage) return;
      if (isProjectFilesUnavailableError(error)) {
        setProjectFilesStatus("error");
        setProjectFilesMessage(projectFilesUnavailableMessage(error));
        return;
      }
      const conflictTarget = activeProjectFilePath ?? filePath;
      const conflict = projectFileConflictFromError(error, conflictTarget, activeProjectFileRevisionRef.current);
      if (conflict) {
        setProjectSaveConflict(conflict);
        setProjectFilesStatus("error");
        setProjectFilesMessage("File changed on disk");
        void refreshProjectFiles();
        return;
      }
      setProjectFilesStatus("error");
      setProjectFilesMessage("Open failed");
    }
  }

  async function syncActiveProjectFileFromDisk(): Promise<ActiveProjectFileSyncOutcome> {
    if (fileOperationBusy) return "skipped";
    const filePath = activeProjectFilePathRef.current;
    if (!filePath) return "skipped";

    let project: ProjectSummary;
    let filesResponse: Awaited<ReturnType<typeof listProjectFiles>>;
    try {
      project = activeProject ?? (await api.getDefaultProject());
      filesResponse = await api.listProjectFiles(project.id);
    } catch (error) {
      setProjectFilesStatus("error");
      setProjectFilesMessage(projectFilesUnavailableMessage(error));
      return "unavailable";
    }
    setActiveProject(project);
    setProjectFiles(filesResponse.files);

    const summary = filesResponse.files.find((file) => file.path === filePath);
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
      await reloadProjectFileFromDisk(filePath);
      return "reloaded";
    } catch (error) {
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
      await reloadProjectFileFromDisk(filePath);
      return true;
    } catch (error) {
      setProjectFilesStatus("error");
      setProjectFilesMessage(isProjectFilesUnavailableError(error) ? projectFilesUnavailableMessage(error) : "Reload failed");
      return false;
    }
  }

  return {
    openProjectFile,
    syncActiveProjectFileFromDisk,
    reloadActiveProjectFileFromDisk,
  };
}
