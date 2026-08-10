import type { MauthAgentOpenDocument, ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import {
  isProjectTestFile,
  isStructuredMauthDocumentPath,
  normalizeTestFolderPath,
  parentTestPath,
  projectPathForTestPath,
  testFileDisplayName,
  testPathBasename,
  testPathFromProjectPath,
  visibleTestFiles,
} from "./projectFiles.ts";

export interface MauthAgentSavedDocumentSummary {
  path: string;
  title: string;
  revision: number;
  sizeBytes: number;
  updatedAt: string;
  open: boolean;
  documentId?: string;
  active?: boolean;
  dirty?: boolean;
  saveStatus?: MauthAgentOpenDocument["saveStatus"];
}

function hasUnsafePathSegment(value: string) {
  return value.split(/[\\/]+/).some((segment) => segment === "." || segment === "..");
}

export function normalizeMauthAgentFolderPath(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.startsWith("/") || value.includes("\\") || hasUnsafePathSegment(value)) return null;
  return normalizeTestFolderPath(value);
}

export function mauthAgentProjectFilePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^tests\//, "");
  if (!trimmed || trimmed.startsWith("/") || trimmed.includes("\\") || hasUnsafePathSegment(trimmed)) return null;
  const relativePath = normalizeTestFolderPath(trimmed);
  if (!isStructuredMauthDocumentPath(relativePath)) return null;
  return projectPathForTestPath(relativePath);
}

export function mauthAgentRelativeDocumentPath(projectFilePath: string) {
  return testPathFromProjectPath(projectFilePath);
}

export function listMauthAgentDocuments({
  project,
  files,
  openDocuments,
  folderPath,
  recursive,
}: {
  project: ProjectSummary;
  files: ProjectFileSummary[];
  openDocuments: MauthAgentOpenDocument[];
  folderPath: string;
  recursive: boolean;
}) {
  const openByPath = new Map(openDocuments.filter((document) => document.path).map((document) => [document.path as string, document]));
  const documents = visibleTestFiles(files)
    .filter(({ file, testPath }) => {
      if (!isProjectTestFile(file)) return false;
      if (!folderPath) return true;
      return recursive ? testPath.startsWith(`${folderPath}/`) : parentTestPath(testPath) === folderPath;
    })
    .map(({ file, testPath }): MauthAgentSavedDocumentSummary => {
      const openDocument = openByPath.get(file.path);
      return {
        path: testPath,
        title: testFileDisplayName(testPathBasename(testPath)),
        revision: file.revision,
        sizeBytes: file.sizeBytes,
        updatedAt: file.updatedAt,
        open: Boolean(openDocument),
        ...(openDocument
          ? {
              documentId: openDocument.id,
              active: openDocument.active,
              dirty: openDocument.dirty,
              saveStatus: openDocument.saveStatus,
            }
          : {}),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    success: true as const,
    project: {
      id: project.id,
      name: project.name,
      documentsPath: project.documentsPath ?? null,
    },
    folderPath,
    recursive,
    documentCount: documents.length,
    documents,
  };
}
