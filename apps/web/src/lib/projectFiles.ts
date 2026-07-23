import type { ProjectFileSummary } from "@mauth-studio/shared";

export const TEST_FILE_ROOT = "tests";
export const TEST_FILE_ROOT_LABEL = "Documents";
export const MAUTH_DOCUMENT_EXTENSION = ".mauth";
export const LEGACY_TEST_DOCUMENT_EXTENSION = ".test.json";

export type StructuredMauthDocumentExtension = typeof MAUTH_DOCUMENT_EXTENSION | typeof LEGACY_TEST_DOCUMENT_EXTENSION;

const STRUCTURED_MAUTH_DOCUMENT_EXTENSIONS: StructuredMauthDocumentExtension[] = [LEGACY_TEST_DOCUMENT_EXTENSION, MAUTH_DOCUMENT_EXTENSION];

export function safeProjectFileName(value: string) {
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

export function normalizeTestFolderPath(path: string) {
  return path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => safeProjectFileName(part))
    .filter(Boolean)
    .join("/");
}

export function joinTestPath(folderPath: string, name: string) {
  const cleanFolder = normalizeTestFolderPath(folderPath);
  const cleanName = safeProjectFileName(name);
  return [cleanFolder, cleanName].filter(Boolean).join("/");
}

export function projectPathForTestPath(relativePath: string) {
  const cleanPath = normalizeTestFolderPath(relativePath);
  return [TEST_FILE_ROOT, cleanPath].filter(Boolean).join("/");
}

export function absoluteMauthDocumentTarget(filePath: string, currentDocumentsPath?: string | null) {
  const normalizedFilePath = filePath.trim().replace(/\/+$/g, "");
  if (!normalizedFilePath.startsWith("/") || !isStructuredMauthDocumentPath(normalizedFilePath)) return null;

  const normalizedDocumentsPath = currentDocumentsPath?.trim().replace(/\/+$/g, "") ?? "";
  if (normalizedDocumentsPath && normalizedFilePath.startsWith(`${normalizedDocumentsPath}/`)) {
    return {
      documentsPath: normalizedDocumentsPath,
      projectFilePath: projectPathForTestPath(normalizedFilePath.slice(normalizedDocumentsPath.length + 1)),
    };
  }

  const separatorIndex = normalizedFilePath.lastIndexOf("/");
  if (separatorIndex <= 0) return null;
  return {
    documentsPath: normalizedFilePath.slice(0, separatorIndex),
    projectFilePath: projectPathForTestPath(normalizedFilePath.slice(separatorIndex + 1)),
  };
}

export function testPathFromProjectPath(path: string) {
  if (path === TEST_FILE_ROOT) return "";
  if (!path.startsWith(`${TEST_FILE_ROOT}/`)) return null;
  return path.slice(TEST_FILE_ROOT.length + 1);
}

export function parentTestPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).join("/");
}

export function topLevelProjectPaths(filePaths: string[]) {
  const uniquePaths = [...new Set(filePaths)].sort((left, right) => left.localeCompare(right));
  return uniquePaths.filter((path) => !uniquePaths.some((candidate) => candidate !== path && path.startsWith(`${candidate}/`)));
}

export function projectPathContains(containerPath: string, candidatePath: string) {
  return candidatePath === containerPath || candidatePath.startsWith(`${containerPath}/`);
}

export function testPathBasename(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

export function structuredMauthDocumentExtension(name: string): StructuredMauthDocumentExtension | null {
  const lowerName = name.toLowerCase();
  return STRUCTURED_MAUTH_DOCUMENT_EXTENSIONS.find((extension) => lowerName.endsWith(extension)) ?? null;
}

export function isStructuredMauthDocumentPath(path: string) {
  return structuredMauthDocumentExtension(path) !== null;
}

export function stripStructuredMauthDocumentExtension(name: string) {
  const extension = structuredMauthDocumentExtension(name);
  return extension ? name.slice(0, -extension.length) : name.replace(/\.json$/i, "");
}

export function ensureTestFileName(name: string, extension: StructuredMauthDocumentExtension = MAUTH_DOCUMENT_EXTENSION) {
  const safeName = safeProjectFileName(stripStructuredMauthDocumentExtension(name));
  return `${safeName}${extension}`;
}

export function testFileDisplayName(name: string) {
  return stripStructuredMauthDocumentExtension(name);
}

export function formatProjectFileSize(size: unknown) {
  const bytes = typeof size === "number" && Number.isFinite(size) ? size : 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isProjectTestFile(file: Pick<ProjectFileSummary, "kind" | "fileType" | "path">) {
  return (
    file.kind === "file" &&
    (file.fileType === "test" || file.fileType === "worksheet" || file.fileType === "notes" || isStructuredMauthDocumentPath(file.path))
  );
}

export function testFilePathKey(file: ProjectFileSummary) {
  return testPathFromProjectPath(file.path);
}

export function visibleTestFiles(files: ProjectFileSummary[]) {
  return files
    .map((file) => {
      const testPath = testFilePathKey(file);
      return testPath === null ? null : { file, testPath };
    })
    .filter((entry): entry is { file: ProjectFileSummary; testPath: string } => {
      if (!entry) return false;
      if (entry.testPath === "") return false;
      return entry.file.kind === "folder" || isProjectTestFile(entry.file);
    });
}

export function childTestFiles(files: ProjectFileSummary[], folderPath: string) {
  const cleanFolder = normalizeTestFolderPath(folderPath);
  return visibleTestFiles(files)
    .filter(({ testPath }) => parentTestPath(testPath) === cleanFolder)
    .sort((left, right) => {
      if (left.file.kind !== right.file.kind) return left.file.kind === "folder" ? -1 : 1;
      return testFileDisplayName(testPathBasename(left.testPath)).localeCompare(testFileDisplayName(testPathBasename(right.testPath)));
    });
}

export function testFolderOptions(files: ProjectFileSummary[]) {
  const folders = visibleTestFiles(files)
    .filter(({ file }) => file.kind === "folder")
    .map(({ testPath }) => testPath)
    .sort((left, right) => left.localeCompare(right));
  return ["", ...folders];
}

export function uniqueTestPath(
  files: ProjectFileSummary[],
  folderPath: string,
  baseName: string,
  kind: "file" | "folder",
  fileExtension: StructuredMauthDocumentExtension = MAUTH_DOCUMENT_EXTENSION,
) {
  const cleanFolder = normalizeTestFolderPath(folderPath);
  const existing = new Set(visibleTestFiles(files).map(({ testPath }) => testPath.toLowerCase()));
  const cleanBaseName =
    kind === "file" ? safeProjectFileName(stripStructuredMauthDocumentExtension(baseName)) : safeProjectFileName(baseName);
  const extension = kind === "file" ? fileExtension : "";

  let suffix = "";
  let counter = 2;
  while (true) {
    const candidateName = `${cleanBaseName}${suffix}${extension}`;
    const candidatePath = [cleanFolder, candidateName].filter(Boolean).join("/");
    if (!existing.has(candidatePath.toLowerCase())) return candidatePath;
    suffix = ` copy${counter === 2 ? "" : ` ${counter}`}`;
    counter += 1;
  }
}
