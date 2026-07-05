import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import type { ProjectFileSummary, ProjectFileVersion, ProjectSummary } from "@mauth-studio/shared";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Pencil,
  PlusCircle,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MauthDialog } from "@/components/ui/mauth-dialog";
import type { ProjectFilesStatus } from "@/hooks/useProjectFilesController";
import {
  TEST_FILE_ROOT_LABEL,
  childTestFiles,
  formatProjectFileSize,
  normalizeTestFolderPath,
  parentTestPath,
  projectPathForTestPath,
  testFileDisplayName,
  testFolderOptions,
  testPathBasename,
  testPathFromProjectPath,
  visibleTestFiles,
} from "@/lib/projectFiles";
import {
  nextRecentProjectFileReferences,
  projectDocumentsPath,
  projectUsesExternalDocumentsFolder,
  readRecentProjectFileReferences,
  recentProjectFileEntries,
  writeRecentProjectFileReferences,
} from "@/lib/projectFileRecents";
import type { ProjectFileVersionPreviewSummary } from "@/lib/projectFileVersionPreview";
import { cn } from "@/lib/utils";

interface TestFileManagerProps {
  activeProject: ProjectSummary | null;
  files: ProjectFileSummary[];
  status: ProjectFilesStatus;
  message: string;
  activeProjectFilePath: string | null;
  buildVersionPreview: (version: ProjectFileVersion) => ProjectFileVersionPreviewSummary;
  onNewTest: () => void;
  onOpenFile: (filePath: string) => void;
  onCreateFolder: (folderPath: string) => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onChooseDocumentsFolder: () => void;
  onOpenDocumentsFolder: (folderPath: string) => void;
  onResetDocumentsFolder: () => void;
  onRefreshFiles: () => void;
  onRenameItem: (filePath: string) => void;
  onDuplicateItems: (filePaths: string[]) => void;
  onMoveItems: (filePaths: string[], targetFolderPath: string) => void;
  onDeleteItems: (filePaths: string[]) => void;
  onListVersions: (filePath: string) => Promise<ProjectFileVersion[]>;
  onRestoreVersion: (filePath: string, versionId: string) => Promise<void>;
}

function TestFileManager({
  activeProject,
  files,
  status,
  message,
  activeProjectFilePath,
  buildVersionPreview,
  onNewTest,
  onOpenFile,
  onCreateFolder,
  onExportBackup,
  onImportBackup,
  onChooseDocumentsFolder,
  onOpenDocumentsFolder,
  onResetDocumentsFolder,
  onRefreshFiles,
  onRenameItem,
  onDuplicateItems,
  onMoveItems,
  onDeleteItems,
  onListVersions,
  onRestoreVersion,
}: TestFileManagerProps) {
  const [currentFolderPath, setCurrentFolderPath] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
  const [draggedPaths, setDraggedPaths] = useState<string[]>([]);
  const [dropTargetFolderPath, setDropTargetFolderPath] = useState<string | null>(null);
  const [versionsTestPath, setVersionsTestPath] = useState<string | null>(null);
  const [versions, setVersions] = useState<ProjectFileVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [versionStatus, setVersionStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [versionMessage, setVersionMessage] = useState("");
  const [pathCopied, setPathCopied] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [pasteFolderDialogOpen, setPasteFolderDialogOpen] = useState(false);
  const [pasteFolderDraft, setPasteFolderDraft] = useState("");
  const [resetFolderDialogOpen, setResetFolderDialogOpen] = useState(false);
  const [restoreVersionToConfirm, setRestoreVersionToConfirm] = useState<ProjectFileVersion | null>(null);
  const [recentProjectFileReferences, setRecentProjectFileReferences] = useState(() => readRecentProjectFileReferences());
  const backupImportInputRef = useRef<HTMLInputElement>(null);
  const documentsPath = activeProject?.documentsPath ?? activeProject?.workspacePath ?? "";
  const isExternalDocumentsFolder = projectUsesExternalDocumentsFolder(activeProject);
  const visibleEntries = useMemo(() => visibleTestFiles(files), [files]);
  const visibleDocumentCount = useMemo(() => visibleEntries.filter(({ file }) => file.kind === "file").length, [visibleEntries]);
  const folderOptions = useMemo(() => testFolderOptions(files), [files]);
  const rawCurrentItems = useMemo(() => childTestFiles(files, currentFolderPath), [currentFolderPath, files]);
  const cleanFileSearchQuery = fileSearchQuery.trim().toLowerCase();
  const fileSearchTerms = useMemo(() => cleanFileSearchQuery.split(/\s+/).filter(Boolean), [cleanFileSearchQuery]);
  const currentItems = useMemo(() => {
    if (!fileSearchTerms.length) return rawCurrentItems;
    return visibleEntries
      .filter(({ testPath }) => {
        const displayName = testFileDisplayName(testPathBasename(testPath));
        const haystack = `${testPath} ${displayName}`.toLowerCase();
        return fileSearchTerms.every((term) => haystack.includes(term));
      })
      .sort((left, right) => {
        if (left.file.kind !== right.file.kind) return left.file.kind === "folder" ? -1 : 1;
        return testFileDisplayName(testPathBasename(left.testPath)).localeCompare(testFileDisplayName(testPathBasename(right.testPath)));
      });
  }, [fileSearchTerms, rawCurrentItems, visibleEntries]);
  const currentItemPaths = useMemo(() => currentItems.map((item) => item.testPath), [currentItems]);
  const selectedEntries = useMemo(
    () => visibleEntries.filter(({ testPath }) => selectedPaths.has(testPath)),
    [selectedPaths, visibleEntries],
  );
  const selectedEntry = selectedEntries.length === 1 ? selectedEntries[0] : null;
  const selectedProjectPaths = selectedEntries.map(({ testPath }) => projectPathForTestPath(testPath));
  const selectedCount = selectedEntries.length;
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? versions[0] ?? null;
  const selectedVersionPreview = selectedVersion ? buildVersionPreview(selectedVersion) : null;
  const activeRelativePath = activeProjectFilePath ? testPathFromProjectPath(activeProjectFilePath) : null;
  const recentEntries = useMemo(() => {
    return recentProjectFileEntries(recentProjectFileReferences, activeProject, files);
  }, [activeProject, files, recentProjectFileReferences]);
  const busy = status === "loading" || status === "saving";
  const breadcrumbTargets = useMemo(() => {
    const parts = currentFolderPath.split("/").filter(Boolean);
    return [
      { label: TEST_FILE_ROOT_LABEL, path: "" },
      ...parts.map((part, index) => ({
        label: part,
        path: parts.slice(0, index + 1).join("/"),
      })),
    ];
  }, [currentFolderPath]);

  useEffect(() => {
    if (currentFolderPath && !folderOptions.includes(currentFolderPath)) {
      setCurrentFolderPath("");
      setSelectedPaths(new Set());
      setLastSelectedPath(null);
    }
  }, [currentFolderPath, folderOptions]);

  useEffect(() => {
    const availablePaths = new Set(visibleEntries.map(({ testPath }) => testPath));
    setSelectedPaths((current) => {
      const next = new Set([...current].filter((testPath) => availablePaths.has(testPath)));
      return next.size === current.size ? current : next;
    });
    if (lastSelectedPath && !availablePaths.has(lastSelectedPath)) {
      setLastSelectedPath(null);
    }
    if (versionsTestPath && !availablePaths.has(versionsTestPath)) {
      setVersionsTestPath(null);
      setVersions([]);
      setSelectedVersionId(null);
      setVersionStatus("idle");
      setVersionMessage("");
    }
  }, [lastSelectedPath, versionsTestPath, visibleEntries]);

  useEffect(() => {
    if (!activeProjectFilePath) return;
    const activeFile = files.find((file) => file.path === activeProjectFilePath && file.kind === "file");
    if (!activeFile) return;
    if (!activeProject) return;
    setRecentProjectFileReferences((current) => {
      const currentDocumentsPath = projectDocumentsPath(activeProject);
      const currentReference = current[0];
      if (
        currentReference?.filePath === activeProjectFilePath &&
        currentReference.projectId === activeProject.id &&
        currentReference.documentsPath === currentDocumentsPath
      ) {
        return current;
      }
      const next = nextRecentProjectFileReferences(current, activeProject, activeProjectFilePath);
      writeRecentProjectFileReferences(next);
      return next;
    });
  }, [activeProject, activeProjectFilePath, files]);

  function navigateToFolder(folderPath: string) {
    setCurrentFolderPath(normalizeTestFolderPath(folderPath));
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
    setDropTargetFolderPath(null);
  }

  function requestPasteDocumentsFolder() {
    setPasteFolderDraft(documentsPath ?? "");
    setPasteFolderDialogOpen(true);
  }

  function confirmPasteDocumentsFolder() {
    const folderPath = pasteFolderDraft.trim();
    if (!folderPath) return;
    onOpenDocumentsFolder(folderPath);
    setCurrentFolderPath("");
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
    setPasteFolderDialogOpen(false);
  }

  function requestResetDocumentsFolder() {
    setResetFolderDialogOpen(true);
  }

  function confirmResetDocumentsFolder() {
    onResetDocumentsFolder();
    setCurrentFolderPath("");
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
    setResetFolderDialogOpen(false);
  }

  function clearFileSelection() {
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
    setVersionsTestPath(null);
    setVersions([]);
    setSelectedVersionId(null);
    setVersionStatus("idle");
    setVersionMessage("");
  }

  function editableFileManagerTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }

  function handleFileManagerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (busy || editableFileManagerTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === "a") {
      event.preventDefault();
      setSelectedPaths(new Set(currentItemPaths));
      setLastSelectedPath(currentItemPaths.at(-1) ?? null);
      return;
    }
    if (event.key === "Escape") {
      if (!selectedCount && !versionsTestPath) return;
      event.preventDefault();
      clearFileSelection();
      return;
    }
    if (event.key === "Enter") {
      if (!selectedEntry) return;
      event.preventDefault();
      openSelected();
      return;
    }
    if ((event.key === "Backspace" || event.key === "Delete") && selectedCount) {
      event.preventDefault();
      onDeleteItems(selectedProjectPaths);
    }
  }

  function handleItemClick(event: ReactMouseEvent<HTMLButtonElement>, testPath: string) {
    if (event.shiftKey && lastSelectedPath) {
      const itemPaths = currentItems.map((item) => item.testPath);
      const startIndex = itemPaths.indexOf(lastSelectedPath);
      const endIndex = itemPaths.indexOf(testPath);
      if (startIndex !== -1 && endIndex !== -1) {
        const [start, end] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        setSelectedPaths(new Set(itemPaths.slice(start, end + 1)));
      } else {
        setSelectedPaths(new Set([testPath]));
      }
    } else if (event.metaKey || event.ctrlKey) {
      setSelectedPaths((current) => {
        const next = new Set(current);
        if (next.has(testPath)) {
          next.delete(testPath);
        } else {
          next.add(testPath);
        }
        return next;
      });
    } else {
      setSelectedPaths(new Set([testPath]));
    }
    setLastSelectedPath(testPath);
  }

  function canMoveTestPathsToFolder(testPaths: string[], targetFolderPath: string) {
    const cleanTargetFolder = normalizeTestFolderPath(targetFolderPath);
    if (busy || !testPaths.length) return false;

    return testPaths.every((testPath) => {
      const entry = visibleEntries.find((candidate) => candidate.testPath === testPath);
      if (!entry) return false;
      if (parentTestPath(testPath) === cleanTargetFolder) return false;
      if (entry.file.kind === "folder" && (cleanTargetFolder === testPath || cleanTargetFolder.startsWith(`${testPath}/`))) return false;
      return true;
    });
  }

  function dragPathsFromEvent(event: DragEvent<HTMLElement>) {
    const raw = event.dataTransfer.getData("application/x-mauth-test-paths");
    if (!raw) return draggedPaths;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : draggedPaths;
    } catch {
      return draggedPaths;
    }
  }

  function handleItemDragStart(event: DragEvent<HTMLElement>, testPath: string) {
    const testPaths = selectedPaths.has(testPath) ? [...selectedPaths] : [testPath];
    setSelectedPaths(new Set(testPaths));
    setLastSelectedPath(testPath);
    setDraggedPaths(testPaths);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-mauth-test-paths", JSON.stringify(testPaths));
    event.dataTransfer.setData("text/plain", testPaths.join("\n"));
  }

  function handleDragEnd() {
    setDraggedPaths([]);
    setDropTargetFolderPath(null);
  }

  function handleDragOverFolder(event: DragEvent<HTMLElement>, targetFolderPath: string) {
    const testPaths = dragPathsFromEvent(event);
    if (!canMoveTestPathsToFolder(testPaths, targetFolderPath)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropTargetFolderPath(normalizeTestFolderPath(targetFolderPath));
  }

  function handleDragLeaveFolder(event: DragEvent<HTMLElement>, targetFolderPath: string) {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
    const cleanTargetFolder = normalizeTestFolderPath(targetFolderPath);
    setDropTargetFolderPath((current) => (current === cleanTargetFolder ? null : current));
  }

  function handleDropOnFolder(event: DragEvent<HTMLElement>, targetFolderPath: string) {
    event.preventDefault();
    event.stopPropagation();
    const testPaths = dragPathsFromEvent(event);
    setDraggedPaths([]);
    setDropTargetFolderPath(null);
    if (!canMoveTestPathsToFolder(testPaths, targetFolderPath)) return;
    onMoveItems(
      testPaths.map((testPath) => projectPathForTestPath(testPath)),
      targetFolderPath,
    );
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
  }

  function dropTargetClass(targetFolderPath: string) {
    return dropTargetFolderPath === normalizeTestFolderPath(targetFolderPath)
      ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/25"
      : "";
  }

  function openSelected() {
    if (!selectedEntry) return;
    if (selectedEntry.file.kind === "folder") {
      navigateToFolder(selectedEntry.testPath);
      return;
    }
    onOpenFile(projectPathForTestPath(selectedEntry.testPath));
  }

  function openRecentFile(filePath: string) {
    onOpenFile(filePath);
  }

  async function openVersionHistory() {
    if (!selectedEntry || selectedEntry.file.kind === "folder") return;
    const testPath = selectedEntry.testPath;
    const filePath = projectPathForTestPath(testPath);
    setVersionsTestPath(testPath);
    setVersionStatus("loading");
    setVersionMessage("Loading versions");
    try {
      const nextVersions = await onListVersions(filePath);
      setVersions(nextVersions);
      setSelectedVersionId(nextVersions[0]?.id ?? null);
      setVersionStatus("ready");
      setVersionMessage(
        nextVersions.length ? `${nextVersions.length} previous version${nextVersions.length === 1 ? "" : "s"}` : "No previous versions yet",
      );
    } catch {
      setVersions([]);
      setSelectedVersionId(null);
      setVersionStatus("error");
      setVersionMessage("Versions unavailable");
    }
  }

  async function restoreVersion(version: ProjectFileVersion) {
    if (!versionsTestPath) return;
    setRestoreVersionToConfirm(version);
  }

  async function confirmRestoreVersion() {
    if (!versionsTestPath || !restoreVersionToConfirm) return;
    const filePath = projectPathForTestPath(versionsTestPath);
    const version = restoreVersionToConfirm;
    setRestoreVersionToConfirm(null);
    setVersionStatus("loading");
    setVersionMessage("Restoring version");
    try {
      await onRestoreVersion(filePath, version.id);
      const nextVersions = await onListVersions(filePath);
      setVersions(nextVersions);
      setSelectedVersionId(nextVersions[0]?.id ?? null);
      setVersionStatus("ready");
      setVersionMessage(`Restored revision ${version.revision}`);
    } catch {
      setVersionStatus("error");
      setVersionMessage("Restore failed");
    }
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1"
      data-mauth-file-manager-scroll
      tabIndex={0}
      onKeyDown={handleFileManagerKeyDown}
    >
      {documentsPath ? (
        <div className="grid gap-3 rounded-md border bg-muted/35 px-3 py-2 text-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-medium text-foreground">
              <span>{isExternalDocumentsFolder ? "External documents folder" : "Local documents folder"}</span>
              <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {visibleDocumentCount} document{visibleDocumentCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="break-all font-mono text-xs text-muted-foreground">{documentsPath}</div>
            {isExternalDocumentsFolder ? (
              <div className="text-xs text-muted-foreground">
                Mauth indexes files already in this folder. It does not copy other documents here; versions and metadata stay in the hidden
                .mauth folder.
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(documentsPath).then(() => {
                  setPathCopied(true);
                  window.setTimeout(() => setPathCopied(false), 1500);
                });
              }}
            >
              <Copy className="mr-2 size-4" />
              {pathCopied ? "Copied" : "Copy path"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onChooseDocumentsFolder} disabled={busy}>
              <FolderOpen className="mr-2 size-4" />
              Open folder
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={requestPasteDocumentsFolder} disabled={busy}>
              Paste path
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={requestResetDocumentsFolder} disabled={busy}>
              Default
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onNewTest} disabled={busy}>
          <PlusCircle data-icon="inline-start" />
          New document
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onCreateFolder(currentFolderPath)} disabled={busy}>
          <PlusCircle data-icon="inline-start" />
          New folder
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onExportBackup} disabled={busy}>
          <Download data-icon="inline-start" />
          Backup ZIP
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => backupImportInputRef.current?.click()} disabled={busy}>
          <Upload data-icon="inline-start" />
          Import ZIP
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onRefreshFiles} disabled={busy}>
          <RefreshCw data-icon="inline-start" />
          Refresh
        </Button>
        <input
          ref={backupImportInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) onImportBackup(file);
          }}
        />
      </div>

      <label className="relative block text-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={fileSearchQuery}
          onChange={(event) => setFileSearchQuery(event.currentTarget.value)}
          placeholder="Search files"
          className="h-9 w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
      </label>

      {!cleanFileSearchQuery && recentEntries.length ? (
        <section className="rounded-lg border bg-background">
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">Recent documents</h3>
              <p className="truncate text-xs text-muted-foreground">Quick access to recently opened files in this documents folder</p>
            </div>
          </div>
          <div className="max-h-32 overflow-y-auto">
            {recentEntries.map(({ file, testPath }) => {
              const active = activeRelativePath === testPath;
              const name = testFileDisplayName(testPathBasename(testPath));
              const folder = parentTestPath(testPath);
              return (
                <button
                  key={file.path}
                  type="button"
                  className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent/60"
                  onClick={() => openRecentFile(file.path)}
                >
                  <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{name}</span>
                      {active ? (
                        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                          Open
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {folder || TEST_FILE_ROOT_LABEL} - {new Date(file.updatedAt).toLocaleString()}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="flex min-h-9 items-center gap-2 rounded-md border bg-background px-2 text-sm">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!currentFolderPath}
          title="Back"
          aria-label="Back"
          data-mauth-folder-back={parentTestPath(currentFolderPath)}
          onClick={() => navigateToFolder(parentTestPath(currentFolderPath))}
          onDragOver={(event) => {
            if (currentFolderPath) handleDragOverFolder(event, parentTestPath(currentFolderPath));
          }}
          onDragLeave={(event) => {
            if (currentFolderPath) handleDragLeaveFolder(event, parentTestPath(currentFolderPath));
          }}
          onDrop={(event) => {
            if (currentFolderPath) handleDropOnFolder(event, parentTestPath(currentFolderPath));
          }}
          className={cn("size-7", currentFolderPath && dropTargetClass(parentTestPath(currentFolderPath)))}
        >
          <ChevronLeft />
        </Button>
        <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {breadcrumbTargets.map((target, index) => (
            <Fragment key={target.path || "root"}>
              {index ? <span className="text-muted-foreground">/</span> : null}
              <button
                type="button"
                title={`Open ${target.path || TEST_FILE_ROOT_LABEL}`}
                data-mauth-folder-breadcrumb={target.path}
                onClick={() => navigateToFolder(target.path)}
                onDragOver={(event) => handleDragOverFolder(event, target.path)}
                onDragLeave={(event) => handleDragLeaveFolder(event, target.path)}
                onDrop={(event) => handleDropOnFolder(event, target.path)}
                className={cn(
                  "min-w-0 truncate rounded px-2 py-1 font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  target.path === currentFolderPath && "text-foreground",
                  target.path !== currentFolderPath && "text-muted-foreground",
                  dropTargetClass(target.path),
                )}
              >
                {target.label}
              </button>
            </Fragment>
          ))}
        </span>
      </div>

      <div
        data-mauth-folder-pane={currentFolderPath}
        className={cn(
          "min-h-48 flex-[1_1_18rem] overflow-hidden rounded-lg border bg-background transition-colors",
          dropTargetClass(currentFolderPath),
        )}
        onDragOver={(event) => handleDragOverFolder(event, currentFolderPath)}
        onDragLeave={(event) => handleDragLeaveFolder(event, currentFolderPath)}
        onDrop={(event) => handleDropOnFolder(event, currentFolderPath)}
      >
        <div className="h-full min-h-0 overflow-y-auto">
          {currentItems.length ? (
            currentItems.map(({ file, testPath }) => {
              const active = activeRelativePath === testPath;
              const selected = selectedPaths.has(testPath);
              const name = file.kind === "folder" ? testPathBasename(testPath) : testFileDisplayName(testPathBasename(testPath));
              return (
                <button
                  key={file.path}
                  type="button"
                  data-mauth-file-path={testPath}
                  draggable={!busy}
                  aria-selected={selected}
                  onClick={(event) => handleItemClick(event, testPath)}
                  onDoubleClick={() => {
                    if (file.kind === "folder") {
                      navigateToFolder(testPath);
                    } else {
                      onOpenFile(file.path);
                    }
                  }}
                  onDragStart={(event) => handleItemDragStart(event, testPath)}
                  onDragEnd={handleDragEnd}
                  onDragOver={file.kind === "folder" ? (event) => handleDragOverFolder(event, testPath) : undefined}
                  onDragLeave={file.kind === "folder" ? (event) => handleDragLeaveFolder(event, testPath) : undefined}
                  onDrop={file.kind === "folder" ? (event) => handleDropOnFolder(event, testPath) : undefined}
                  className={cn(
                    "grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent/60",
                    selected && "bg-primary/10 hover:bg-primary/10",
                    file.kind === "folder" && dropTargetClass(testPath),
                  )}
                >
                  {file.kind === "folder" ? (
                    <FolderOpen className="size-4 text-primary" aria-hidden="true" />
                  ) : (
                    <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{name}</span>
                      {active ? (
                        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                          Open
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {file.kind === "folder"
                        ? cleanFileSearchQuery && parentTestPath(testPath)
                          ? `Folder - ${parentTestPath(testPath)}`
                          : "Folder"
                        : `${formatProjectFileSize(file.sizeBytes)} - ${new Date(file.updatedAt).toLocaleString()}${
                            cleanFileSearchQuery && parentTestPath(testPath) ? ` - ${parentTestPath(testPath)}` : ""
                          }`}
                    </span>
                  </span>
                  <ChevronRight className={cn("size-4 text-muted-foreground", file.kind !== "folder" && "opacity-0")} aria-hidden="true" />
                </button>
              );
            })
          ) : (
            <div className="px-3 py-12 text-center text-sm text-muted-foreground">
              {status === "loading"
                ? "Loading files..."
                : status === "error"
                  ? message || "Files unavailable."
                  : cleanFileSearchQuery
                    ? "No matching files."
                    : "No files here yet."}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Button type="button" variant="outline" size="sm" disabled={!selectedEntry || busy} onClick={openSelected}>
          Open
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!selectedEntry || busy}
          onClick={() => selectedEntry && onRenameItem(projectPathForTestPath(selectedEntry.testPath))}
        >
          <Pencil data-icon="inline-start" />
          Rename
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!selectedCount || busy}
          onClick={() => onDuplicateItems(selectedProjectPaths)}
        >
          <Copy data-icon="inline-start" />
          Duplicate
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!selectedEntry || selectedEntry.file.kind === "folder" || busy}
          onClick={() => void openVersionHistory()}
        >
          Versions
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!selectedCount || busy}
          onClick={() => onDeleteItems(selectedProjectPaths)}
        >
          <Trash2 data-icon="inline-start" />
          Delete
        </Button>
      </div>

      {versionsTestPath ? (
        <div className="rounded-lg border bg-background p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">Versions: {testFileDisplayName(testPathBasename(versionsTestPath))}</h3>
              <p className="truncate text-xs text-muted-foreground">{versionMessage}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setVersionsTestPath(null);
                setVersions([]);
                setSelectedVersionId(null);
                setVersionStatus("idle");
                setVersionMessage("");
              }}
            >
              Close
            </Button>
          </div>
          {versionStatus === "loading" ? (
            <p className="py-3 text-sm text-muted-foreground">Loading versions...</p>
          ) : versions.length ? (
            <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="max-h-80 overflow-y-auto rounded-md border">
                {versions.map((version) => {
                  const selected = selectedVersion?.id === version.id;
                  return (
                    <div
                      key={version.id}
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0",
                        selected && "bg-primary/10",
                      )}
                    >
                      <button type="button" className="min-w-0 text-left" onClick={() => setSelectedVersionId(version.id)}>
                        <p className="truncate font-medium">Revision {version.revision}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {new Date(version.createdAt).toLocaleString()}
                          {version.reason ? ` - ${version.reason}` : ""}
                        </p>
                      </button>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedVersionId(version.id)}>
                          Preview
                        </Button>
                        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void restoreVersion(version)}>
                          Restore
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedVersion && selectedVersionPreview ? (
                <div className="min-w-0 rounded-md border bg-muted/20 p-3">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold">{selectedVersionPreview.title}</h4>
                      <p className="truncate text-xs text-muted-foreground">{selectedVersionPreview.subtitle}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      r{selectedVersion.revision}
                    </Badge>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {selectedVersionPreview.details.map((detail) => (
                      <span key={detail} className="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                        {detail}
                      </span>
                    ))}
                  </div>
                  {selectedVersionPreview.questions.length ? (
                    <ul className="mb-3 max-h-28 overflow-y-auto rounded border bg-background p-2 text-xs">
                      {selectedVersionPreview.questions.map((question) => (
                        <li key={question} className="truncate py-0.5">
                          {question}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <details className="group">
                    <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground group-open:mb-2">
                      Raw snapshot
                    </summary>
                    <pre className="max-h-44 overflow-auto rounded border bg-background p-2 text-[10px] leading-snug text-muted-foreground">
                      {selectedVersionPreview.rawPreview}
                    </pre>
                  </details>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="py-3 text-sm text-muted-foreground">
              {versionStatus === "error" ? versionMessage || "Versions unavailable." : "No previous versions yet."}
            </p>
          )}
        </div>
      ) : null}

      <p className="min-h-4 truncate text-xs text-muted-foreground">
        {message ||
          (selectedCount
            ? `${selectedCount} selected. Drag onto a folder, breadcrumb, or empty folder pane to move.`
            : "Shift-click or Cmd/Ctrl-click to select. Drag onto folders or breadcrumbs to move.")}
      </p>

      {pasteFolderDialogOpen ? (
        <MauthDialog
          title="Open local folder"
          description="Mauth will use the files already in this folder and keep versions and metadata in a hidden .mauth folder."
          onClose={() => setPasteFolderDialogOpen(false)}
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setPasteFolderDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="paste-folder-form" disabled={!pasteFolderDraft.trim() || busy}>
                Open folder
              </Button>
            </>
          }
        >
          <form
            id="paste-folder-form"
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              confirmPasteDocumentsFolder();
            }}
          >
            <label className="block text-sm font-medium" htmlFor="paste-folder-path">
              Folder path
            </label>
            <input
              id="paste-folder-path"
              value={pasteFolderDraft}
              onChange={(event) => setPasteFolderDraft(event.currentTarget.value)}
              className="h-10 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
              autoFocus
            />
          </form>
        </MauthDialog>
      ) : null}

      {resetFolderDialogOpen ? (
        <MauthDialog
          title="Open default folder"
          description="Return to the default Mauth documents folder. Your current external folder files stay where they are."
          onClose={() => setResetFolderDialogOpen(false)}
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setResetFolderDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={confirmResetDocumentsFolder} disabled={busy}>
                Open default folder
              </Button>
            </>
          }
        />
      ) : null}

      {restoreVersionToConfirm && versionsTestPath ? (
        <MauthDialog
          title="Restore version"
          description={`Restore ${testFileDisplayName(testPathBasename(versionsTestPath))} to revision ${
            restoreVersionToConfirm.revision
          }. This creates a new current version.`}
          onClose={() => setRestoreVersionToConfirm(null)}
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setRestoreVersionToConfirm(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void confirmRestoreVersion()} disabled={busy}>
                Restore
              </Button>
            </>
          }
        />
      ) : null}
    </section>
  );
}

export function FileManagementDrawer({
  open,
  activeProject,
  projectFiles,
  projectFilesStatus,
  projectFilesMessage,
  activeProjectFilePath,
  buildVersionPreview,
  onClose,
  onNewTest,
  onOpenProjectFile,
  onCreateProjectFolder,
  onExportProjectBackup,
  onImportProjectBackup,
  onChooseDocumentsFolder,
  onOpenDocumentsFolder,
  onResetDocumentsFolder,
  onRefreshProjectFiles,
  onRenameProjectFile,
  onDuplicateProjectFiles,
  onMoveProjectFiles,
  onDeleteProjectFiles,
  onListProjectFileVersions,
  onRestoreProjectFileVersion,
}: {
  open: boolean;
  activeProject: ProjectSummary | null;
  projectFiles: ProjectFileSummary[];
  projectFilesStatus: ProjectFilesStatus;
  projectFilesMessage: string;
  activeProjectFilePath: string | null;
  buildVersionPreview: (version: ProjectFileVersion) => ProjectFileVersionPreviewSummary;
  onClose: () => void;
  onNewTest: () => void;
  onOpenProjectFile: (filePath: string) => void;
  onCreateProjectFolder: (folderPath: string) => void;
  onExportProjectBackup: () => void;
  onImportProjectBackup: (file: File) => void;
  onChooseDocumentsFolder: () => void;
  onOpenDocumentsFolder: (folderPath: string) => void;
  onResetDocumentsFolder: () => void;
  onRefreshProjectFiles: () => void;
  onRenameProjectFile: (filePath: string) => void;
  onDuplicateProjectFiles: (filePaths: string[]) => void;
  onMoveProjectFiles: (filePaths: string[], targetFolderPath: string) => void;
  onDeleteProjectFiles: (filePaths: string[]) => void;
  onListProjectFileVersions: (filePath: string) => Promise<ProjectFileVersion[]>;
  onRestoreProjectFileVersion: (filePath: string, versionId: string) => Promise<void>;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/35 p-4 pt-20" onMouseDown={onClose}>
      <aside
        className="ml-auto flex h-[calc(100vh-6rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
        aria-label="Files"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <div className="flex min-w-0 items-center gap-2">
            <FolderOpen className="size-5 text-primary" aria-hidden="true" />
            <h2 className="truncate text-base font-semibold">Files</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" title="Close files" aria-label="Close files" onClick={onClose}>
            <X />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          <TestFileManager
            activeProject={activeProject}
            files={projectFiles}
            status={projectFilesStatus}
            message={projectFilesMessage}
            activeProjectFilePath={activeProjectFilePath}
            buildVersionPreview={buildVersionPreview}
            onNewTest={onNewTest}
            onOpenFile={(filePath) => {
              onOpenProjectFile(filePath);
              onClose();
            }}
            onCreateFolder={onCreateProjectFolder}
            onExportBackup={onExportProjectBackup}
            onImportBackup={onImportProjectBackup}
            onChooseDocumentsFolder={onChooseDocumentsFolder}
            onOpenDocumentsFolder={onOpenDocumentsFolder}
            onResetDocumentsFolder={onResetDocumentsFolder}
            onRefreshFiles={onRefreshProjectFiles}
            onRenameItem={onRenameProjectFile}
            onDuplicateItems={onDuplicateProjectFiles}
            onMoveItems={onMoveProjectFiles}
            onDeleteItems={onDeleteProjectFiles}
            onListVersions={onListProjectFileVersions}
            onRestoreVersion={onRestoreProjectFileVersion}
          />
        </div>
      </aside>
    </div>
  );
}
