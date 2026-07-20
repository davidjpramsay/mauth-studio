import type { ProjectFileSummary } from "@mauth-studio/shared";

export interface ProjectSaveConflict {
  filePath: string;
  message: string;
  localRevision: number | null;
  currentRevision?: number;
}

export const FILE_CHANGED_ON_DISK_MESSAGE = "File changed on disk. Reload it before saving, or use Save as to keep this draft as a copy.";
export const MISSING_PROJECT_REVISION_MESSAGE =
  "This draft was restored without a file revision. Reload the file before saving, or use Save as to keep it as a copy.";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function apiErrorLike(value: unknown): { status: number; detail?: unknown } | null {
  if (!(value instanceof Error)) return null;
  const record = value as Error & { status?: unknown; detail?: unknown };
  return typeof record.status === "number" ? { status: record.status, detail: record.detail } : null;
}

export function fileChangedProjectSaveConflict(
  filePath: string,
  localRevision: number | null,
  currentRevision?: number,
): ProjectSaveConflict {
  return {
    filePath,
    message: FILE_CHANGED_ON_DISK_MESSAGE,
    localRevision,
    currentRevision,
  };
}

export function missingProjectRevisionConflict(filePath: string): ProjectSaveConflict {
  return {
    filePath,
    message: MISSING_PROJECT_REVISION_MESSAGE,
    localRevision: null,
  };
}

export function projectFileSummaryFromApiError(error: unknown): ProjectFileSummary | null {
  const apiError = apiErrorLike(error);
  if (!apiError) return null;
  const body = asRecord(apiError.detail);
  const detail = asRecord(body?.detail) ?? body;
  const current = asRecord(detail?.current);
  if (!current || typeof current.path !== "string" || typeof current.revision !== "number") return null;
  return current as unknown as ProjectFileSummary;
}

export function projectFileConflictFromError(error: unknown, filePath: string, localRevision: number | null): ProjectSaveConflict | null {
  const apiError = apiErrorLike(error);
  if (!apiError || apiError.status !== 409) return null;
  const current = projectFileSummaryFromApiError(error);
  return fileChangedProjectSaveConflict(filePath, localRevision, current?.revision);
}
