import type { ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import type { MauthDialogActions } from "@/hooks/useMauthDialogController";
import type { ProjectFilesStatus, ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import { deleteProjectFile, getDefaultProject, getProjectFile, listProjectFiles, saveProjectFile } from "@/lib/api";
import {
  ensureTestFileName,
  joinTestPath,
  normalizeTestFolderPath,
  parentTestPath,
  projectPathContains,
  projectPathForTestPath,
  safeProjectFileName,
  testFileDisplayName,
  testPathBasename,
  testPathFromProjectPath,
  topLevelProjectPaths,
  uniqueTestPath,
} from "@/lib/projectFiles";

interface DuplicateActiveProjectFileResult {
  revision: number | null;
  fingerprint: string | null;
}

interface UseProjectFileOperationsControllerOptions {
  activeProject: ProjectSummary | null;
  projectFiles: ProjectFileSummary[];
  activeProjectFilePath: string | null;
  hasUnsavedProjectChanges: boolean;
  currentProjectFileName: string;
  writeCurrentTestProjectFile: (filePath: string, testName: string) => Promise<void>;
  duplicateActiveProjectFile: (
    project: ProjectSummary,
    targetFilePath: string,
    targetTestPath: string,
  ) => Promise<DuplicateActiveProjectFileResult>;
  setActiveProjectFileState: (filePath: string | null, revision: number | null) => void;
  setActiveProject: (project: ProjectSummary) => void;
  setProjectFiles: (files: ProjectFileSummary[]) => void;
  setProjectFilesStatus: (status: ProjectFilesStatus) => void;
  setProjectFilesMessage: (message: string) => void;
  setProjectSaveConflict: (conflict: ProjectSaveConflict | null) => void;
  updateLastProjectSaveFingerprint: (fingerprint: string | null) => void;
  dialogs: MauthDialogActions;
}

async function copyProjectItem(projectId: string, sourcePath: string, targetPath: string, files: ProjectFileSummary[]) {
  const source = files.find((file) => file.path === sourcePath);
  if (!source) throw new Error("Missing source file");

  if (source.kind === "folder") {
    await saveProjectFile(projectId, targetPath, { kind: "folder", fileType: "folder", metadata: source.metadata });
    const descendants = files
      .filter((file) => file.path.startsWith(`${sourcePath}/`))
      .sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
        return left.path.localeCompare(right.path);
      });
    for (const descendant of descendants) {
      const descendantTargetPath = `${targetPath}${descendant.path.slice(sourcePath.length)}`;
      if (descendant.kind === "folder") {
        await saveProjectFile(projectId, descendantTargetPath, {
          kind: "folder",
          fileType: "folder",
          metadata: descendant.metadata,
        });
      } else {
        const document = await getProjectFile(projectId, descendant.path);
        await saveProjectFile(projectId, descendantTargetPath, {
          content: document.content ?? "",
          kind: "file",
          fileType: document.fileType ?? "test",
          metadata: document.metadata,
        });
      }
    }
    return;
  }

  const document = await getProjectFile(projectId, sourcePath);
  await saveProjectFile(projectId, targetPath, {
    content: document.content ?? "",
    kind: "file",
    fileType: document.fileType ?? "test",
    metadata: document.metadata,
  });
}

export function useProjectFileOperationsController({
  activeProject,
  projectFiles,
  activeProjectFilePath,
  hasUnsavedProjectChanges,
  currentProjectFileName,
  writeCurrentTestProjectFile,
  duplicateActiveProjectFile,
  setActiveProjectFileState,
  setActiveProject,
  setProjectFiles,
  setProjectFilesStatus,
  setProjectFilesMessage,
  setProjectSaveConflict,
  updateLastProjectSaveFingerprint,
  dialogs,
}: UseProjectFileOperationsControllerOptions) {
  async function currentProject() {
    const project = activeProject ?? (await getDefaultProject());
    setActiveProject(project);
    return project;
  }

  async function moveProjectFileToPath(filePath: string, targetFilePath: string) {
    try {
      setProjectFilesStatus("saving");
      setProjectFilesMessage("Moving");
      const project = await currentProject();
      if (activeProjectFilePath && hasUnsavedProjectChanges && projectPathContains(filePath, activeProjectFilePath)) {
        await writeCurrentTestProjectFile(activeProjectFilePath, currentProjectFileName);
      }
      const currentFiles = await listProjectFiles(project.id);
      const source = currentFiles.files.find((file) => file.path === filePath);
      if (!source) {
        setProjectFilesStatus("ready");
        setProjectFilesMessage("");
        return;
      }
      await copyProjectItem(project.id, filePath, targetFilePath, currentFiles.files);
      await deleteProjectFile(project.id, filePath, source.revision);
      const refreshedFiles = await listProjectFiles(project.id);
      setProjectFiles(refreshedFiles.files);
      const nextActiveFilePath = activeProjectFilePath
        ? activeProjectFilePath === filePath
          ? targetFilePath
          : source.kind === "folder" && activeProjectFilePath.startsWith(`${filePath}/`)
            ? `${targetFilePath}${activeProjectFilePath.slice(filePath.length)}`
            : activeProjectFilePath
        : null;
      if (nextActiveFilePath !== activeProjectFilePath) {
        const nextRevision = nextActiveFilePath
          ? (refreshedFiles.files.find((file) => file.path === nextActiveFilePath)?.revision ?? null)
          : null;
        setActiveProjectFileState(nextActiveFilePath, nextRevision);
        setProjectSaveConflict(null);
      }
      setProjectFilesStatus("ready");
      setProjectFilesMessage("Moved");
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Move failed");
    }
  }

  async function duplicateProjectFiles(filePaths: string[]) {
    const sourcePaths = topLevelProjectPaths(filePaths);
    if (!sourcePaths.length) return;

    try {
      setProjectFilesStatus("saving");
      setProjectFilesMessage(sourcePaths.length === 1 ? "Duplicating" : `Duplicating ${sourcePaths.length} items`);
      const project = await currentProject();
      if (
        activeProjectFilePath &&
        hasUnsavedProjectChanges &&
        sourcePaths.some((sourcePath) => projectPathContains(sourcePath, activeProjectFilePath))
      ) {
        await writeCurrentTestProjectFile(activeProjectFilePath, currentProjectFileName);
      }
      let currentFiles = (await listProjectFiles(project.id)).files;
      let duplicatedCount = 0;
      let openedDuplicatePath: string | null = null;
      let openedDuplicateFingerprint: string | null = null;
      let openedDuplicateRevision: number | null = null;

      for (const filePath of sourcePaths) {
        const source = currentFiles.find((file) => file.path === filePath);
        const sourceTestPath = testPathFromProjectPath(filePath);
        if (!source || sourceTestPath === null) continue;
        const parentPath = parentTestPath(sourceTestPath);
        const baseName =
          source.kind === "folder"
            ? `${testPathBasename(sourceTestPath)} copy`
            : `${testFileDisplayName(testPathBasename(sourceTestPath))} copy`;
        const targetTestPath = uniqueTestPath(currentFiles, parentPath, baseName, source.kind);
        const targetFilePath = projectPathForTestPath(targetTestPath);
        const duplicatingActiveEditor = sourcePaths.length === 1 && source.kind === "file" && filePath === activeProjectFilePath;
        if (duplicatingActiveEditor) {
          const duplicate = await duplicateActiveProjectFile(project, targetFilePath, targetTestPath);
          openedDuplicatePath = targetFilePath;
          openedDuplicateFingerprint = duplicate.fingerprint;
          openedDuplicateRevision = duplicate.revision;
        } else {
          await copyProjectItem(project.id, filePath, targetFilePath, currentFiles);
        }
        currentFiles = (await listProjectFiles(project.id)).files;
        duplicatedCount += 1;
      }

      const refreshedFiles = await listProjectFiles(project.id);
      setProjectFiles(refreshedFiles.files);
      if (openedDuplicatePath) {
        setActiveProjectFileState(openedDuplicatePath, openedDuplicateRevision);
        setProjectSaveConflict(null);
        updateLastProjectSaveFingerprint(openedDuplicateFingerprint);
      }
      setProjectFilesStatus("ready");
      setProjectFilesMessage(
        openedDuplicatePath
          ? `Duplicated and opened ${testFileDisplayName(testPathBasename(testPathFromProjectPath(openedDuplicatePath) ?? openedDuplicatePath))}`
          : duplicatedCount === 1
            ? "Duplicated 1 item"
            : `Duplicated ${duplicatedCount} items`,
      );
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Duplicate failed");
    }
  }

  async function renameProjectFile(filePath: string) {
    const source = projectFiles.find((file) => file.path === filePath);
    const sourceTestPath = testPathFromProjectPath(filePath);
    if (!source || sourceTestPath === null) return;
    const currentName = source.kind === "folder" ? testPathBasename(sourceTestPath) : testFileDisplayName(testPathBasename(sourceTestPath));
    const requestedName = await dialogs.prompt({
      title: "Rename",
      label: source.kind === "folder" ? "Folder name" : "File name",
      defaultValue: currentName,
      confirmLabel: "Rename",
      requireValue: true,
    });
    if (requestedName === null) return;
    const newName = source.kind === "folder" ? safeProjectFileName(requestedName) : ensureTestFileName(requestedName);
    if (!newName) return;
    const targetTestPath = joinTestPath(parentTestPath(sourceTestPath), newName);
    const targetFilePath = projectPathForTestPath(targetTestPath);
    if (targetFilePath === filePath) return;
    if (projectFiles.some((file) => file.path.toLowerCase() === targetFilePath.toLowerCase())) {
      await dialogs.alert({
        title: "Name already exists",
        description: "A file or folder with that name already exists.",
      });
      return;
    }
    await moveProjectFileToPath(filePath, targetFilePath);
  }

  async function moveProjectFiles(filePaths: string[], targetFolderPath: string) {
    const sourcePaths = topLevelProjectPaths(filePaths);
    if (!sourcePaths.length) return;
    const targetFolder = normalizeTestFolderPath(targetFolderPath);

    try {
      setProjectFilesStatus("saving");
      setProjectFilesMessage(sourcePaths.length === 1 ? "Moving" : `Moving ${sourcePaths.length} items`);
      const project = await currentProject();
      if (
        activeProjectFilePath &&
        hasUnsavedProjectChanges &&
        sourcePaths.some((sourcePath) => projectPathContains(sourcePath, activeProjectFilePath))
      ) {
        await writeCurrentTestProjectFile(activeProjectFilePath, currentProjectFileName);
      }
      const currentFiles = (await listProjectFiles(project.id)).files;
      const existingPaths = new Set(currentFiles.map((file) => file.path.toLowerCase()));
      const plannedTargets = new Set<string>();
      const plannedMoves: Array<{ source: ProjectFileSummary; sourcePath: string; targetPath: string }> = [];

      for (const filePath of sourcePaths) {
        const source = currentFiles.find((file) => file.path === filePath);
        const sourceTestPath = testPathFromProjectPath(filePath);
        if (!source || sourceTestPath === null) continue;
        if (source.kind === "folder" && (targetFolder === sourceTestPath || targetFolder.startsWith(`${sourceTestPath}/`))) {
          await dialogs.alert({
            title: "Cannot move folder",
            description: "A folder cannot be moved inside itself.",
          });
          setProjectFilesStatus("ready");
          setProjectFilesMessage("");
          return;
        }

        const targetTestPath = [targetFolder, testPathBasename(sourceTestPath)].filter(Boolean).join("/");
        const targetFilePath = projectPathForTestPath(targetTestPath);
        const targetKey = targetFilePath.toLowerCase();
        if (targetFilePath === filePath) continue;
        if (existingPaths.has(targetKey) || plannedTargets.has(targetKey)) {
          await dialogs.alert({
            title: "Name already exists",
            description: "A file or folder with that name already exists in that folder.",
          });
          setProjectFilesStatus("ready");
          setProjectFilesMessage("");
          return;
        }
        plannedTargets.add(targetKey);
        plannedMoves.push({ source, sourcePath: filePath, targetPath: targetFilePath });
      }

      if (!plannedMoves.length) {
        setProjectFilesStatus("ready");
        setProjectFilesMessage("");
        return;
      }

      for (const move of plannedMoves) {
        await copyProjectItem(project.id, move.sourcePath, move.targetPath, currentFiles);
      }
      for (const move of plannedMoves) {
        await deleteProjectFile(project.id, move.sourcePath, move.source.revision);
      }

      const refreshedFiles = await listProjectFiles(project.id);
      setProjectFiles(refreshedFiles.files);
      const nextActiveFilePath = activeProjectFilePath
        ? (() => {
            for (const move of plannedMoves) {
              if (activeProjectFilePath === move.sourcePath) return move.targetPath;
              if (move.source.kind === "folder" && activeProjectFilePath.startsWith(`${move.sourcePath}/`)) {
                return `${move.targetPath}${activeProjectFilePath.slice(move.sourcePath.length)}`;
              }
            }
            return activeProjectFilePath;
          })()
        : null;
      if (nextActiveFilePath !== activeProjectFilePath) {
        const nextRevision = nextActiveFilePath
          ? (refreshedFiles.files.find((file) => file.path === nextActiveFilePath)?.revision ?? null)
          : null;
        setActiveProjectFileState(nextActiveFilePath, nextRevision);
        setProjectSaveConflict(null);
      }
      setProjectFilesStatus("ready");
      setProjectFilesMessage(plannedMoves.length === 1 ? "Moved 1 item" : `Moved ${plannedMoves.length} items`);
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Move failed");
    }
  }

  async function removeProjectFiles(filePaths: string[]) {
    const sourcePaths = topLevelProjectPaths(filePaths);
    const sources = sourcePaths
      .map((filePath) => {
        const source = projectFiles.find((file) => file.path === filePath);
        const sourceTestPath = testPathFromProjectPath(filePath);
        return source && sourceTestPath !== null ? { source, sourceTestPath, filePath } : null;
      })
      .filter((entry): entry is { source: ProjectFileSummary; sourceTestPath: string; filePath: string } => Boolean(entry));
    if (!sources.length) return;
    const shouldDelete = await dialogs.confirm({
      title: sources.length === 1 ? "Delete item" : "Delete selected items",
      description:
        sources.length === 1
          ? `Delete "${
              sources[0].source.kind === "folder"
                ? testPathBasename(sources[0].sourceTestPath)
                : testFileDisplayName(testPathBasename(sources[0].sourceTestPath))
            }"?`
          : `Delete ${sources.length} selected items?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!shouldDelete) return;
    try {
      setProjectFilesStatus("saving");
      setProjectFilesMessage("Deleting");
      const project = await currentProject();
      const deletingActiveProjectFile = activeProjectFilePath
        ? sources.some(({ filePath }) => activeProjectFilePath === filePath || activeProjectFilePath.startsWith(`${filePath}/`))
        : false;
      for (const { filePath, source } of sources) {
        await deleteProjectFile(project.id, filePath, source.revision);
      }
      const refreshedFiles = await listProjectFiles(project.id);
      setProjectFiles(refreshedFiles.files);
      const nextActiveFilePath =
        activeProjectFilePath &&
        sources.some(({ filePath }) => activeProjectFilePath === filePath || activeProjectFilePath.startsWith(`${filePath}/`))
          ? null
          : activeProjectFilePath;
      if (nextActiveFilePath !== activeProjectFilePath) {
        setActiveProjectFileState(nextActiveFilePath, null);
      }
      if (deletingActiveProjectFile) {
        setProjectSaveConflict(null);
        updateLastProjectSaveFingerprint(null);
      }
      setProjectFilesStatus("ready");
      setProjectFilesMessage(sources.length === 1 ? "Deleted 1 item" : `Deleted ${sources.length} items`);
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Delete failed");
    }
  }

  return {
    duplicateProjectFiles,
    renameProjectFile,
    moveProjectFiles,
    removeProjectFiles,
  };
}
