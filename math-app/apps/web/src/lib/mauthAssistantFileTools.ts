import type {
  MauthProjectFileType,
  ProjectFileDocument,
  ProjectFileSaveRequest,
  ProjectFileSummary,
  ProjectFileVersion,
} from "@mauth-studio/shared";

import { formatMauthFileToolValidationIssues, validateMauthFileToolPayload } from "./mauthFileToolValidation.ts";

const TEST_FILE_ROOT = "tests";
const USER_FILE_ROOT_PATTERN = /^(Tests|Documents)\//i;

export const MAUTH_ASSISTANT_FILE_TOOL_NAMES = [
  "mauth.files.describe",
  "mauth.files.list",
  "mauth.files.open",
  "mauth.files.save",
  "mauth.files.saveAs",
  "mauth.files.createFolder",
  "mauth.files.duplicate",
  "mauth.files.rename",
  "mauth.files.move",
  "mauth.files.delete",
  "mauth.files.versions.list",
  "mauth.files.versions.restore",
] as const;

export type MauthAssistantFileToolName = (typeof MAUTH_ASSISTANT_FILE_TOOL_NAMES)[number];

export interface MauthAssistantFileToolCall {
  name: MauthAssistantFileToolName;
  arguments?: unknown;
}

export interface MauthAssistantFileToolResult {
  ok: boolean;
  toolName: MauthAssistantFileToolName;
  data?: unknown;
  files?: ProjectFileSummary[];
  changedPaths: string[];
  error?: string;
}

export interface MauthProjectFileDriver {
  listFiles: (projectId: string) => Promise<ProjectFileSummary[]>;
  getFile: (projectId: string, path: string) => Promise<ProjectFileDocument>;
  saveFile: (projectId: string, path: string, file: ProjectFileSaveRequest) => Promise<ProjectFileDocument>;
  deleteFile: (projectId: string, path: string, baseRevision?: number) => Promise<void>;
  listVersions?: (projectId: string, path: string) => Promise<ProjectFileVersion[]>;
  restoreVersion?: (projectId: string, path: string, versionId: string) => Promise<ProjectFileDocument>;
}

export interface MauthAssistantFileToolContext {
  projectId: string;
  activeFilePath?: string | null;
  activeFileRevision?: number | null;
}

export interface MauthAssistantFileToolDescription {
  tools: Array<{
    name: MauthAssistantFileToolName;
    description: string;
  }>;
  workflow: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringArg(args: unknown, name: string) {
  return isRecord(args) && typeof args[name] === "string" ? args[name] : undefined;
}

function booleanArg(args: unknown, name: string) {
  return isRecord(args) && typeof args[name] === "boolean" ? args[name] : undefined;
}

function numberArg(args: unknown, name: string) {
  return isRecord(args) && typeof args[name] === "number" && Number.isFinite(args[name]) ? args[name] : undefined;
}

function stringArrayArg(args: unknown, name: string) {
  if (!isRecord(args)) return undefined;
  const value = args[name];
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function recordArg(args: unknown, name: string) {
  return isRecord(args) && isRecord(args[name]) ? args[name] : undefined;
}

function failFileTool(toolName: MauthAssistantFileToolName, error: string, data?: unknown): MauthAssistantFileToolResult {
  return {
    ok: false,
    toolName,
    data,
    changedPaths: [],
    error,
  };
}

function safeProjectFileName(value: string) {
  const safeName = value
    .replace(/[<>:"/\\|?*]+/g, " ")
    .split("")
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return (safeName || "Untitled test").slice(0, 120);
}

function normalizeTestPath(path: string) {
  return path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => safeProjectFileName(part))
    .filter(Boolean)
    .join("/");
}

function testPathFromProjectPath(path: string) {
  if (path === TEST_FILE_ROOT) return "";
  if (!path.startsWith(`${TEST_FILE_ROOT}/`)) return null;
  return path.slice(TEST_FILE_ROOT.length + 1);
}

function assistantPathToProjectPath(path: string, kind: "file" | "folder" = "file") {
  const rawPath = path.trim();
  const withoutRoot = testPathFromProjectPath(rawPath) ?? rawPath.replace(USER_FILE_ROOT_PATTERN, "");
  const normalized = normalizeTestPath(withoutRoot);
  if (!normalized) throw new Error("File path is required.");
  const withExtension = kind === "file" ? ensureTestFileName(normalized) : normalized;
  return `${TEST_FILE_ROOT}/${withExtension}`;
}

function assistantPathCandidates(path: string) {
  const rawPath = path.trim();
  const withoutRoot = testPathFromProjectPath(rawPath) ?? rawPath.replace(USER_FILE_ROOT_PATTERN, "");
  const normalized = normalizeTestPath(withoutRoot);
  if (!normalized) throw new Error("File path is required.");
  return [...new Set([`${TEST_FILE_ROOT}/${normalized}`, `${TEST_FILE_ROOT}/${ensureTestFileName(normalized)}`])];
}

function resolveExistingProjectPath(files: ProjectFileSummary[], path: string) {
  const candidates = assistantPathCandidates(path);
  const found = candidates
    .map((candidate) => files.find((file) => file.path.toLowerCase() === candidate.toLowerCase())?.path)
    .find((candidate): candidate is string => typeof candidate === "string");
  return found ?? candidates[0];
}

function assistantFolderToProjectPath(path: string) {
  const rawPath = path.trim();
  if (!rawPath) return TEST_FILE_ROOT;
  const withoutRoot = testPathFromProjectPath(rawPath) ?? rawPath.replace(USER_FILE_ROOT_PATTERN, "");
  const normalized = normalizeTestPath(withoutRoot);
  return normalized ? `${TEST_FILE_ROOT}/${normalized}` : TEST_FILE_ROOT;
}

function testPathBasename(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function parentPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).join("/");
}

function ensureTestFileName(path: string) {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop() ?? "Untitled test";
  const safeName = safeProjectFileName(fileName.replace(/\.test\.json$/i, "").replace(/\.json$/i, ""));
  return [...parts, `${safeName}.test.json`].join("/");
}

function testFileDisplayName(name: string) {
  return name.replace(/\.test\.json$/i, "");
}

function isProjectTestFile(file: Pick<ProjectFileSummary, "kind" | "fileType" | "path">) {
  return file.kind === "file" && (file.fileType === "test" || file.path.endsWith(".test.json"));
}

function visibleTestFiles(files: ProjectFileSummary[]) {
  return files
    .filter((file) => file.path === TEST_FILE_ROOT || file.path.startsWith(`${TEST_FILE_ROOT}/`))
    .filter((file) => {
      if (file.path === TEST_FILE_ROOT) return false;
      return file.kind === "folder" || isProjectTestFile(file);
    });
}

function childFiles(files: ProjectFileSummary[], folderPath: string) {
  const folder = assistantFolderToProjectPath(folderPath);
  return visibleTestFiles(files)
    .filter((file) => parentPath(file.path) === folder)
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
}

function topLevelProjectPaths(filePaths: string[]) {
  const uniquePaths = [...new Set(filePaths)].sort((left, right) => left.localeCompare(right));
  return uniquePaths.filter((path) => !uniquePaths.some((candidate) => candidate !== path && path.startsWith(`${candidate}/`)));
}

function projectPathContains(containerPath: string, candidatePath: string) {
  return candidatePath === containerPath || candidatePath.startsWith(`${containerPath}/`);
}

function uniqueProjectPath(files: ProjectFileSummary[], parentProjectPath: string, baseName: string, kind: "file" | "folder") {
  const existing = new Set(visibleTestFiles(files).map((file) => file.path.toLowerCase()));
  const cleanBaseName =
    kind === "file" ? safeProjectFileName(baseName.replace(/\.test\.json$/i, "").replace(/\.json$/i, "")) : safeProjectFileName(baseName);
  const extension = kind === "file" ? ".test.json" : "";
  let suffix = "";
  let counter = 2;

  while (true) {
    const candidateName = `${cleanBaseName}${suffix}${extension}`;
    const candidatePath = [parentProjectPath, candidateName].filter(Boolean).join("/");
    if (!existing.has(candidatePath.toLowerCase())) return candidatePath;
    suffix = ` copy${counter === 2 ? "" : ` ${counter}`}`;
    counter += 1;
  }
}

function fileTypeForPath(path: string, kind: "file" | "folder", requested?: string): MauthProjectFileType {
  if (kind === "folder") return "folder";
  if (requested) return requested;
  if (path.endsWith(".test.json")) return "test";
  if (path.endsWith(".diagram.json")) return "diagram";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  return "text";
}

async function copyProjectItem(
  driver: MauthProjectFileDriver,
  projectId: string,
  sourcePath: string,
  targetPath: string,
  files: ProjectFileSummary[],
) {
  const source = files.find((file) => file.path === sourcePath);
  if (!source) throw new Error(`File not found: ${sourcePath}`);

  if (source.kind === "folder") {
    await driver.saveFile(projectId, targetPath, { kind: "folder", fileType: "folder", metadata: source.metadata });
    const descendants = files
      .filter((file) => file.path.startsWith(`${sourcePath}/`))
      .sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
        return left.path.localeCompare(right.path);
      });
    for (const descendant of descendants) {
      const descendantTargetPath = `${targetPath}${descendant.path.slice(sourcePath.length)}`;
      if (descendant.kind === "folder") {
        await driver.saveFile(projectId, descendantTargetPath, {
          kind: "folder",
          fileType: "folder",
          metadata: descendant.metadata,
        });
      } else {
        const document = await driver.getFile(projectId, descendant.path);
        await driver.saveFile(projectId, descendantTargetPath, {
          content: document.content ?? "",
          kind: "file",
          fileType: document.fileType ?? fileTypeForPath(descendantTargetPath, "file"),
          metadata: document.metadata,
        });
      }
    }
    return;
  }

  const document = await driver.getFile(projectId, sourcePath);
  await driver.saveFile(projectId, targetPath, {
    content: document.content ?? "",
    kind: "file",
    fileType: document.fileType ?? fileTypeForPath(targetPath, "file"),
    metadata: document.metadata,
  });
}

export function describeMauthAssistantFileTools(): MauthAssistantFileToolDescription {
  return {
    tools: [
      { name: "mauth.files.describe", description: "List supported file assistant tools." },
      { name: "mauth.files.list", description: "List test files and folders in the project file tree." },
      { name: "mauth.files.open", description: "Open a test file and return its document content." },
      { name: "mauth.files.save", description: "Save content to an existing or explicit project file path." },
      { name: "mauth.files.saveAs", description: "Save content as a new test file, choosing a unique name unless overwrite is true." },
      { name: "mauth.files.createFolder", description: "Create a folder in the Documents file area." },
      { name: "mauth.files.duplicate", description: "Duplicate one or more files or folders." },
      { name: "mauth.files.rename", description: "Rename a file or folder by copying it to the new path and deleting the old path." },
      { name: "mauth.files.move", description: "Move one or more files or folders into another folder." },
      { name: "mauth.files.delete", description: "Delete one or more files or folders using current revision checks." },
      { name: "mauth.files.versions.list", description: "List version snapshots for a file." },
      { name: "mauth.files.versions.restore", description: "Restore a file version snapshot as the new current revision." },
    ],
    workflow: [
      "List files before opening, moving, renaming, or deleting.",
      "Use saveAs for new tests and save for an explicit existing file path.",
      "Use duplicate/rename/move/delete through the project-file driver so metadata, revisions, and version snapshots remain consistent.",
      "After a file tool changes the tree, refresh the file list before making dependent file operations.",
      "The caller still owns active editor state, unsaved-current-document handling, and autosave draft updates.",
    ],
  };
}

export async function runMauthAssistantFileTool(
  driver: MauthProjectFileDriver,
  context: MauthAssistantFileToolContext,
  call: MauthAssistantFileToolCall,
): Promise<MauthAssistantFileToolResult> {
  if (!MAUTH_ASSISTANT_FILE_TOOL_NAMES.includes(call.name)) {
    return failFileTool(call.name, `Unsupported assistant file tool: ${call.name}`);
  }

  const validation = validateMauthFileToolPayload(call.name, call.arguments);
  if (!validation.ok) {
    return failFileTool(call.name, formatMauthFileToolValidationIssues(validation.issues), { validationIssues: validation.issues });
  }

  try {
    if (call.name === "mauth.files.describe") {
      return { ok: true, toolName: call.name, data: describeMauthAssistantFileTools(), changedPaths: [] };
    }

    if (call.name === "mauth.files.list") {
      const files = await driver.listFiles(context.projectId);
      const folderPath = stringArg(call.arguments, "folderPath");
      const listedFiles = typeof folderPath === "string" ? childFiles(files, folderPath) : visibleTestFiles(files);
      return { ok: true, toolName: call.name, data: { files: listedFiles }, files: listedFiles, changedPaths: [] };
    }

    if (call.name === "mauth.files.open") {
      const path = stringArg(call.arguments, "path");
      if (!path) return failFileTool(call.name, "File path is required.");
      const projectPath = assistantPathToProjectPath(path, "file");
      const document = await driver.getFile(context.projectId, projectPath);
      return { ok: true, toolName: call.name, data: { document }, changedPaths: [] };
    }

    if (call.name === "mauth.files.save" || call.name === "mauth.files.saveAs") {
      const rawPath =
        stringArg(call.arguments, "path") ??
        stringArg(call.arguments, "name") ??
        (call.name === "mauth.files.save" ? (context.activeFilePath ?? undefined) : undefined);
      if (!rawPath) return failFileTool(call.name, "This test has not been saved yet. Use save as with a file name first.");
      const content = stringArg(call.arguments, "content");
      if (typeof content !== "string") return failFileTool(call.name, "File content is required.");
      const files = await driver.listFiles(context.projectId);
      const requestedPath = assistantPathToProjectPath(rawPath, "file");
      const overwrite = call.name === "mauth.files.save" || booleanArg(call.arguments, "overwrite") === true;
      const filePath =
        overwrite || !files.some((file) => file.path.toLowerCase() === requestedPath.toLowerCase())
          ? requestedPath
          : uniqueProjectPath(files, parentPath(requestedPath), testFileDisplayName(testPathBasename(requestedPath)), "file");
      const existing = files.find((file) => file.path === filePath);
      const savingActiveFile = call.name === "mauth.files.save" && filePath === context.activeFilePath;
      if (savingActiveFile && typeof context.activeFileRevision !== "number") {
        return failFileTool(call.name, "The active file must be reloaded before it can be saved.");
      }
      const baseRevision =
        numberArg(call.arguments, "baseRevision") ?? (savingActiveFile ? context.activeFileRevision : existing ? existing.revision : null);
      const saved = await driver.saveFile(context.projectId, filePath, {
        content,
        kind: "file",
        fileType: fileTypeForPath(filePath, "file", stringArg(call.arguments, "fileType")),
        metadata: recordArg(call.arguments, "metadata") ?? { format: "saved-test-json", source: "mauth-assistant" },
        sortOrder: numberArg(call.arguments, "sortOrder"),
        baseRevision,
      });
      const refreshed = await driver.listFiles(context.projectId);
      return { ok: true, toolName: call.name, data: { document: saved }, files: refreshed, changedPaths: [filePath] };
    }

    if (call.name === "mauth.files.createFolder") {
      const rawPath = stringArg(call.arguments, "path") ?? stringArg(call.arguments, "name");
      if (!rawPath) return failFileTool(call.name, "Folder path or name is required.");
      const folderPath = assistantFolderToProjectPath(rawPath);
      const files = await driver.listFiles(context.projectId);
      if (files.some((file) => file.path.toLowerCase() === folderPath.toLowerCase())) {
        return failFileTool(call.name, "A file or folder with that path already exists.");
      }
      const folder = await driver.saveFile(context.projectId, folderPath, {
        kind: "folder",
        fileType: "folder",
        metadata: recordArg(call.arguments, "metadata") ?? {},
      });
      const refreshed = await driver.listFiles(context.projectId);
      return { ok: true, toolName: call.name, data: { folder }, files: refreshed, changedPaths: [folderPath] };
    }

    if (call.name === "mauth.files.duplicate") {
      const paths =
        stringArrayArg(call.arguments, "paths") ?? (stringArg(call.arguments, "path") ? [stringArg(call.arguments, "path") as string] : []);
      if (!paths.length) return failFileTool(call.name, "At least one file path is required.");
      let files = await driver.listFiles(context.projectId);
      const sourcePaths = topLevelProjectPaths(paths.map((path) => resolveExistingProjectPath(files, path)));
      const changedPaths: string[] = [];

      for (const sourcePath of sourcePaths) {
        const source = files.find((file) => file.path === sourcePath);
        if (!source) throw new Error(`File not found: ${sourcePath}`);
        const targetFolderPath = stringArg(call.arguments, "targetFolderPath");
        const targetParent = targetFolderPath ? assistantFolderToProjectPath(targetFolderPath) : parentPath(sourcePath);
        const baseName = source.kind === "folder" ? `${source.name} copy` : `${testFileDisplayName(source.name)} copy`;
        const targetPath = uniqueProjectPath(files, targetParent, baseName, source.kind);
        await copyProjectItem(driver, context.projectId, sourcePath, targetPath, files);
        changedPaths.push(targetPath);
        files = await driver.listFiles(context.projectId);
      }

      return { ok: true, toolName: call.name, data: { duplicatedPaths: changedPaths }, files, changedPaths };
    }

    if (call.name === "mauth.files.rename") {
      const path = stringArg(call.arguments, "path");
      const newName = stringArg(call.arguments, "newName");
      if (!path || !newName) return failFileTool(call.name, "File path and newName are required.");
      const files = await driver.listFiles(context.projectId);
      const sourcePath = resolveExistingProjectPath(files, path);
      const source = files.find((file) => file.path === sourcePath);
      if (!source) return failFileTool(call.name, `File not found: ${sourcePath}`);
      const cleanName = source.kind === "folder" ? safeProjectFileName(newName) : ensureTestFileName(newName);
      const targetPath = [parentPath(sourcePath), cleanName].filter(Boolean).join("/");
      if (files.some((file) => file.path.toLowerCase() === targetPath.toLowerCase())) {
        return failFileTool(call.name, "A file or folder with that name already exists.");
      }
      await copyProjectItem(driver, context.projectId, sourcePath, targetPath, files);
      await driver.deleteFile(context.projectId, sourcePath, source.revision);
      const refreshed = await driver.listFiles(context.projectId);
      return {
        ok: true,
        toolName: call.name,
        data: { from: sourcePath, to: targetPath },
        files: refreshed,
        changedPaths: [sourcePath, targetPath],
      };
    }

    if (call.name === "mauth.files.move") {
      const paths =
        stringArrayArg(call.arguments, "paths") ?? (stringArg(call.arguments, "path") ? [stringArg(call.arguments, "path") as string] : []);
      const targetFolderPath = stringArg(call.arguments, "targetFolderPath") ?? "";
      if (!paths.length) return failFileTool(call.name, "At least one file path is required.");
      const files = await driver.listFiles(context.projectId);
      const sourcePaths = topLevelProjectPaths(paths.map((path) => resolveExistingProjectPath(files, path)));
      const targetFolder = assistantFolderToProjectPath(targetFolderPath);
      const existingPaths = new Set(files.map((file) => file.path.toLowerCase()));
      const plannedTargets = new Set<string>();
      const plannedMoves: Array<{ source: ProjectFileSummary; sourcePath: string; targetPath: string }> = [];

      for (const sourcePath of sourcePaths) {
        const source = files.find((file) => file.path === sourcePath);
        if (!source) throw new Error(`File not found: ${sourcePath}`);
        if (source.kind === "folder" && projectPathContains(sourcePath, targetFolder)) {
          return failFileTool(call.name, "A folder cannot be moved inside itself.");
        }
        const targetPath = [targetFolder, testPathBasename(sourcePath)].filter(Boolean).join("/");
        if (targetPath === sourcePath) continue;
        const targetKey = targetPath.toLowerCase();
        if (existingPaths.has(targetKey) || plannedTargets.has(targetKey)) {
          return failFileTool(call.name, "A file or folder with that name already exists in the target folder.");
        }
        plannedTargets.add(targetKey);
        plannedMoves.push({ source, sourcePath, targetPath });
      }

      for (const move of plannedMoves) {
        await copyProjectItem(driver, context.projectId, move.sourcePath, move.targetPath, files);
      }
      for (const move of plannedMoves) {
        await driver.deleteFile(context.projectId, move.sourcePath, move.source.revision);
      }
      const refreshed = await driver.listFiles(context.projectId);
      return {
        ok: true,
        toolName: call.name,
        data: { moved: plannedMoves.map((move) => ({ from: move.sourcePath, to: move.targetPath })) },
        files: refreshed,
        changedPaths: plannedMoves.flatMap((move) => [move.sourcePath, move.targetPath]),
      };
    }

    if (call.name === "mauth.files.delete") {
      const paths =
        stringArrayArg(call.arguments, "paths") ?? (stringArg(call.arguments, "path") ? [stringArg(call.arguments, "path") as string] : []);
      if (!paths.length) return failFileTool(call.name, "At least one file path is required.");
      const files = await driver.listFiles(context.projectId);
      const sourcePaths = topLevelProjectPaths(paths.map((path) => resolveExistingProjectPath(files, path)));
      const deletedPaths: string[] = [];
      for (const sourcePath of sourcePaths) {
        const source = files.find((file) => file.path === sourcePath);
        if (!source) throw new Error(`File not found: ${sourcePath}`);
        await driver.deleteFile(context.projectId, sourcePath, source.revision);
        deletedPaths.push(sourcePath);
      }
      const refreshed = await driver.listFiles(context.projectId);
      return { ok: true, toolName: call.name, data: { deletedPaths }, files: refreshed, changedPaths: deletedPaths };
    }

    if (call.name === "mauth.files.versions.list") {
      if (!driver.listVersions) return failFileTool(call.name, "Version listing is not configured.");
      const path = stringArg(call.arguments, "path");
      if (!path) return failFileTool(call.name, "File path is required.");
      const filePath = assistantPathToProjectPath(path, "file");
      const versions = await driver.listVersions(context.projectId, filePath);
      return { ok: true, toolName: call.name, data: { versions }, changedPaths: [] };
    }

    if (call.name === "mauth.files.versions.restore") {
      if (!driver.restoreVersion) return failFileTool(call.name, "Version restore is not configured.");
      const path = stringArg(call.arguments, "path");
      const versionId = stringArg(call.arguments, "versionId");
      if (!path || !versionId) return failFileTool(call.name, "File path and versionId are required.");
      const filePath = assistantPathToProjectPath(path, "file");
      const document = await driver.restoreVersion(context.projectId, filePath, versionId);
      const refreshed = await driver.listFiles(context.projectId);
      return { ok: true, toolName: call.name, data: { document }, files: refreshed, changedPaths: [filePath] };
    }

    return failFileTool(call.name, `Unsupported assistant file tool: ${call.name}`);
  } catch (error) {
    return failFileTool(call.name, error instanceof Error ? error.message : "File tool failed.");
  }
}
