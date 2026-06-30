import type { MutableRefObject } from "react";
import type { ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import type { ProjectFilesStatus, ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import { getDefaultProject, getProjectFile, listProjectFiles } from "@/lib/api";
import { isProjectTestFile, testFileDisplayName, testPathBasename, testPathFromProjectPath } from "@/lib/projectFiles";

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
  saveCurrentProjectFileBeforeOpening: (project: ProjectSummary) => Promise<void>;
  currentEditorDocumentFingerprint: () => string;
  projectFileConflictFromError: (error: unknown, filePath: string, localRevision: number | null) => ProjectSaveConflict | null;
  setActiveProject: (project: ProjectSummary) => void;
  setProjectFiles: (files: ProjectFileSummary[]) => void;
  setProjectSaveConflict: (conflict: ProjectSaveConflict | null) => void;
  setProjectFilesStatus: (status: ProjectFilesStatus) => void;
  setProjectFilesMessage: (message: string) => void;
  refreshProjectFiles: () => Promise<void>;
  onOpened?: () => void;
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
  saveCurrentProjectFileBeforeOpening,
  currentEditorDocumentFingerprint,
  projectFileConflictFromError,
  setActiveProject,
  setProjectFiles,
  setProjectSaveConflict,
  setProjectFilesStatus,
  setProjectFilesMessage,
  refreshProjectFiles,
  onOpened,
}: UseProjectDocumentOpenControllerOptions<TSavedDocument>) {
  async function reloadProjectFileFromDisk(filePath: string) {
    const project = activeProject ?? (await getDefaultProject());
    const fileName = projectFileDisplayName(filePath);
    setProjectFilesStatus("loading");
    setProjectFilesMessage(`Reloading ${fileName}`);

    const [document, filesResponse] = await Promise.all([getProjectFile(project.id, filePath), listProjectFiles(project.id)]);
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
      const project = activeProject ?? (await getDefaultProject());
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
      await saveCurrentProjectFileBeforeOpening(project);

      setProjectFilesStatus("loading");
      setProjectFilesMessage(`Opening ${fileName}`);
      const document = await getProjectFile(project.id, filePath);
      const savedDocument = parseSavedDocument(document.content);
      if (!savedDocument) throw new Error("Unsupported project file");

      applySavedProjectDocument(project, filePath, savedDocument, document.revision);
      setProjectFilesStatus("ready");
      setProjectFilesMessage(`Opened ${fileName}`);
      onOpened?.();
    } catch (error) {
      if (error instanceof Error && error.message === revisionMissingErrorMessage) return;
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

  async function syncActiveProjectFileFromDisk() {
    if (fileOperationBusy) return;
    const filePath = activeProjectFilePathRef.current;
    if (!filePath) return;

    const project = activeProject ?? (await getDefaultProject());
    const filesResponse = await listProjectFiles(project.id);
    setActiveProject(project);
    setProjectFiles(filesResponse.files);

    const summary = filesResponse.files.find((file) => file.path === filePath);
    if (!summary || summary.kind !== "file") return;

    const localRevision = activeProjectFileRevisionRef.current;
    if (typeof localRevision === "number" && summary.revision <= localRevision) return;

    const conflict = {
      filePath,
      message: "File changed on disk. Reload it before saving, or use Save as to keep this draft as a copy.",
      localRevision,
      currentRevision: summary.revision,
    };

    if (lastProjectSaveFingerprintRef.current !== currentEditorDocumentFingerprint()) {
      setProjectSaveConflict(conflict);
      setProjectFilesStatus("error");
      setProjectFilesMessage("File changed on disk");
      return;
    }

    try {
      await reloadProjectFileFromDisk(filePath);
    } catch {
      setProjectSaveConflict(conflict);
      setProjectFilesStatus("error");
      setProjectFilesMessage("Reload failed");
    }
  }

  async function reloadActiveProjectFileFromDisk() {
    const filePath = activeProjectFilePathRef.current;
    if (!filePath || fileOperationBusy) return false;

    try {
      await reloadProjectFileFromDisk(filePath);
      return true;
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Reload failed");
      return false;
    }
  }

  return {
    openProjectFile,
    syncActiveProjectFileFromDisk,
    reloadActiveProjectFileFromDisk,
  };
}
