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
import { cn } from "@/lib/utils";

const RECENT_PROJECT_FILES_KEY = "mauth.recentProjectFiles.v1";
const RECENT_PROJECT_FILES_LIMIT = 10;

export interface ProjectFileVersionPreviewSummary {
  kind: "test" | "raw";
  title: string;
  subtitle: string;
  details: string[];
  questions: string[];
  rawPreview: string;
}

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

function readRecentProjectFilePaths() {
  try {
    const raw = window.localStorage.getItem(RECENT_PROJECT_FILES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string").slice(0, RECENT_PROJECT_FILES_LIMIT)
      : [];
  } catch {
    return [];
  }
}

function writeRecentProjectFilePaths(filePaths: string[]) {
  try {
    window.localStorage.setItem(RECENT_PROJECT_FILES_KEY, JSON.stringify(filePaths.slice(0, RECENT_PROJECT_FILES_LIMIT)));
  } catch {
    // Recents are convenience UI only; storage failures should not block file work.
  }
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
  const [recentProjectFilePaths, setRecentProjectFilePaths] = useState<string[]>(() => readRecentProjectFilePaths());
  const backupImportInputRef = useRef<HTMLInputElement>(null);
  const documentsPath = activeProject?.documentsPath ?? activeProject?.workspacePath ?? "";
  const visibleEntries = useMemo(() => visibleTestFiles(files), [files]);
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
    return recentProjectFilePaths
      .map((filePath) => {
        const file = files.find((candidate) => candidate.path === filePath && candidate.kind === "file");
        const testPath = file ? testPathFromProjectPath(file.path) : null;
        return file && testPath ? { file, testPath } : null;
      })
      .filter((entry): entry is { file: ProjectFileSummary; testPath: string } => Boolean(entry));
  }, [files, recentProjectFilePaths]);
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
    setRecentProjectFilePaths((current) => {
      const next = [activeProjectFilePath, ...current.filter((filePath) => filePath !== activeProjectFilePath)].slice(
        0,
        RECENT_PROJECT_FILES_LIMIT,
      );
      if (next.length === current.length && next.every((filePath, index) => filePath === current[index])) return current;
      writeRecentProjectFilePaths(next);
      return next;
    });
  }, [activeProjectFilePath, files]);

  function navigateToFolder(folderPath: string) {
    setCurrentFolderPath(normalizeTestFolderPath(folderPath));
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
    setDropTargetFolderPath(null);
  }

  function requestOpenDocumentsFolder() {
    const folderPath = window.prompt(
      "Paste the full local folder path to open. Mauth will create/use a hidden .mauth folder there for versions and metadata.",
      documentsPath,
    );
    if (!folderPath?.trim()) return;
    onOpenDocumentsFolder(folderPath);
    setCurrentFolderPath("");
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
  }

  function requestResetDocumentsFolder() {
    const shouldReset = window.confirm("Return to the default Mauth documents folder?");
    if (!shouldReset) return;
    onResetDocumentsFolder();
    setCurrentFolderPath("");
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
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
    const filePath = projectPathForTestPath(versionsTestPath);
    const fileName = testFileDisplayName(testPathBasename(versionsTestPath));
    const shouldRestore = window.confirm(`Restore "${fileName}" to revision ${version.revision}? This creates a new current version.`);
    if (!shouldRestore) return;
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
    <section className="flex min-h-0 flex-1 flex-col gap-3" tabIndex={0} onKeyDown={handleFileManagerKeyDown}>
      {documentsPath ? (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/35 px-3 py-2 text-sm">
          <div className="min-w-0">
            <div className="font-medium text-foreground">Local documents folder</div>
            <div className="truncate font-mono text-xs text-muted-foreground">{documentsPath}</div>
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
            <Button type="button" variant="outline" size="sm" onClick={requestOpenDocumentsFolder} disabled={busy}>
              <FolderOpen className="mr-2 size-4" />
              Open folder
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
              <p className="truncate text-xs text-muted-foreground">Quick access to the last opened local files</p>
            </div>
          </div>
          <div className="max-h-44 overflow-y-auto">
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
          "min-h-0 flex-1 overflow-hidden rounded-lg border bg-background transition-colors",
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
        className="ml-auto flex max-h-[calc(100vh-6rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
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
