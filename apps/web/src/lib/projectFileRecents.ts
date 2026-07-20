import type { ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import type { BrowserStorageLike } from "./browserStorage.ts";
import { testPathFromProjectPath } from "./projectFiles.ts";

export const RECENT_PROJECT_FILES_KEY = "mauth.recentProjectFiles.v1";
export const RECENT_PROJECT_FILES_LIMIT = 10;

export interface ProjectFileRecentReference {
  filePath: string;
  projectId?: string;
  documentsPath?: string;
  openedAt?: string;
}

type ProjectFileRecentProject = Pick<ProjectSummary, "id" | "documentsPath" | "workspacePath">;

export function projectDocumentsPath(project: ProjectFileRecentProject | null | undefined) {
  return project?.documentsPath ?? project?.workspacePath ?? "";
}

export function projectUsesExternalDocumentsFolder(project: Pick<ProjectSummary, "documentsPath" | "workspacePath"> | null | undefined) {
  return Boolean(project?.documentsPath && project?.workspacePath && project.documentsPath === project.workspacePath);
}

export function readRecentProjectFileReferences(storage?: BrowserStorageLike | null): ProjectFileRecentReference[] {
  const targetStorage = storage ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!targetStorage) return [];

  try {
    const raw = targetStorage.getItem(RECENT_PROJECT_FILES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeRecentReference).filter((reference): reference is ProjectFileRecentReference => Boolean(reference));
  } catch {
    return [];
  }
}

export function writeRecentProjectFileReferences(references: ProjectFileRecentReference[], storage?: BrowserStorageLike | null) {
  const targetStorage = storage ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!targetStorage) return;

  try {
    targetStorage.setItem(RECENT_PROJECT_FILES_KEY, JSON.stringify(references.slice(0, RECENT_PROJECT_FILES_LIMIT)));
  } catch {
    // Recents are convenience UI only; storage failures should not block file work.
  }
}

export function recentProjectFileReferencesForProject(
  references: ProjectFileRecentReference[],
  project: ProjectFileRecentProject | null | undefined,
) {
  return references.filter((reference) => recentReferenceMatchesProject(reference, project)).slice(0, RECENT_PROJECT_FILES_LIMIT);
}

export function nextRecentProjectFileReferences(
  current: ProjectFileRecentReference[],
  project: ProjectFileRecentProject,
  filePath: string,
  openedAt = new Date().toISOString(),
) {
  const documentsPath = projectDocumentsPath(project);
  const nextReference: ProjectFileRecentReference = {
    filePath,
    projectId: project.id,
    documentsPath,
    openedAt,
  };
  return [
    nextReference,
    ...current.filter(
      (reference) =>
        !(
          reference.filePath === filePath &&
          (reference.projectId ?? "") === project.id &&
          (reference.documentsPath ?? "") === documentsPath
        ),
    ),
  ].slice(0, RECENT_PROJECT_FILES_LIMIT);
}

export function recentProjectFileEntries(
  references: ProjectFileRecentReference[],
  project: ProjectFileRecentProject | null | undefined,
  files: ProjectFileSummary[],
) {
  return recentProjectFileReferencesForProject(references, project)
    .map((reference) => {
      const file = files.find((candidate) => candidate.path === reference.filePath && candidate.kind === "file");
      const testPath = file ? testPathFromProjectPath(file.path) : null;
      return file && testPath ? { file, testPath } : null;
    })
    .filter((entry): entry is { file: ProjectFileSummary; testPath: string } => Boolean(entry));
}

function normalizeRecentReference(value: unknown): ProjectFileRecentReference | null {
  if (typeof value === "string" && value.trim()) return { filePath: value.trim() };
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const filePath = typeof record.filePath === "string" ? record.filePath.trim() : "";
  if (!filePath) return null;
  return {
    filePath,
    projectId: typeof record.projectId === "string" && record.projectId.trim() ? record.projectId.trim() : undefined,
    documentsPath: typeof record.documentsPath === "string" && record.documentsPath.trim() ? record.documentsPath.trim() : undefined,
    openedAt: typeof record.openedAt === "string" && record.openedAt.trim() ? record.openedAt.trim() : undefined,
  };
}

function recentReferenceMatchesProject(reference: ProjectFileRecentReference, project: ProjectFileRecentProject | null | undefined) {
  if (!project) return false;
  const hasScopedIdentity = Boolean(reference.projectId || reference.documentsPath);
  if (!hasScopedIdentity) return !projectUsesExternalDocumentsFolder(project);
  if (reference.projectId && reference.projectId !== project.id) return false;
  const activeDocumentsPath = projectDocumentsPath(project);
  if (reference.documentsPath && activeDocumentsPath && reference.documentsPath !== activeDocumentsPath) return false;
  if (reference.documentsPath && !activeDocumentsPath) return false;
  return true;
}
