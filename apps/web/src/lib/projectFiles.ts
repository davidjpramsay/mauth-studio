import type { ProjectFileSummary } from "@mauth-studio/shared";

export const TEST_FILE_ROOT = "tests";
export const TEST_FILE_ROOT_LABEL = "Documents";

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

export function ensureTestFileName(name: string) {
  const safeName = safeProjectFileName(name.replace(/\.test\.json$/i, "").replace(/\.json$/i, ""));
  return `${safeName}.test.json`;
}

export function testFileDisplayName(name: string) {
  return name.replace(/\.test\.json$/i, "");
}

export function formatProjectFileSize(size: unknown) {
  const bytes = typeof size === "number" && Number.isFinite(size) ? size : 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isProjectTestFile(file: Pick<ProjectFileSummary, "kind" | "fileType" | "path">) {
  return file.kind === "file" && (file.fileType === "test" || file.path.endsWith(".test.json"));
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

export function uniqueTestPath(files: ProjectFileSummary[], folderPath: string, baseName: string, kind: "file" | "folder") {
  const cleanFolder = normalizeTestFolderPath(folderPath);
  const existing = new Set(visibleTestFiles(files).map(({ testPath }) => testPath.toLowerCase()));
  const cleanBaseName =
    kind === "file" ? safeProjectFileName(baseName.replace(/\.test\.json$/i, "").replace(/\.json$/i, "")) : safeProjectFileName(baseName);
  const extension = kind === "file" ? ".test.json" : "";

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
