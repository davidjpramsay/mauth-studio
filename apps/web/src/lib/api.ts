import type {
  DiagramSpec,
  GeneratedTest,
  PenroseDiagramResponse,
  ProjectFileDocument,
  ProjectFileSaveRequest,
  ProjectFileSummary,
  ProjectFileVersion,
  ProjectSummary,
  Question,
} from "@mauth-studio/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function parseApiErrorBody(rawText: string): unknown {
  const text = rawText.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readableApiErrorText(rawText: string): string {
  const text = rawText.trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const detail = record.detail;
      if (typeof detail === "string") return readableApiErrorText(detail) || detail;
      if (detail && typeof detail === "object") {
        const detailRecord = detail as Record<string, unknown>;
        const error = detailRecord.error;
        const errorMessage = error && typeof error === "object" ? (error as Record<string, unknown>).message : undefined;
        const message = detailRecord.message ?? errorMessage ?? error;
        if (typeof message === "string") return message;
      }
      const error = record.error;
      const errorMessage = error && typeof error === "object" ? (error as Record<string, unknown>).message : undefined;
      const message = record.message ?? errorMessage ?? error;
      if (typeof message === "string") return message;
    }
  } catch {
    return text;
  }
  return text;
}

async function responseError(response: Response) {
  const rawText = await response.text();
  const message = readableApiErrorText(rawText) || `Request failed: ${response.status}`;
  return new ApiError(message, response.status, parseApiErrorBody(rawText));
}

async function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await responseError(response);
  }

  return response.json() as Promise<TResponse>;
}

async function postJsonWithSignal<TResponse>(path: string, body: unknown, signal?: AbortSignal): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw await responseError(response);
  }

  return response.json() as Promise<TResponse>;
}

async function putJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await responseError(response);
  }

  return response.json() as Promise<TResponse>;
}

async function getJson<TResponse>(path: string): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw await responseError(response);
  }

  return response.json() as Promise<TResponse>;
}

async function deleteRequest(path: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, { method: "DELETE" });

  if (!response.ok) {
    throw await responseError(response);
  }
}

async function postBinary<TResponse>(path: string, body: Blob, contentType: string): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });

  if (!response.ok) {
    throw await responseError(response);
  }

  return response.json() as Promise<TResponse>;
}

function encodeProjectFilePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function generateQuestion(type = "quadratic_factor", seed = 7) {
  return postJson<Question>("/api/questions/generate", { type, seed, formatting: "default", marking: "default" });
}

export function generateTest(seed = 20) {
  return postJson<GeneratedTest>("/api/tests/generate", {
    title: "High School Mathematics",
    questions: [
      { type: "quadratic_factor", count: 3 },
      { type: "differentiate_poly", count: 2 },
    ],
    formatting: "default",
    marking: "default",
    seed,
  });
}

// Legacy saved-test endpoints are retained for one-time migration into project files.
// New user-facing file saves should go through /api/storage/projects.
export function listStoredTests<TSavedTest>() {
  return getJson<{ tests: TSavedTest[] }>("/api/storage/tests");
}

export function getStorageAutosave<TAutosave>() {
  return getJson<{ autosave: TAutosave | null }>("/api/storage/tests/autosave");
}

export function saveStorageAutosave<TAutosave>(autosave: TAutosave) {
  return postJson<{ autosave: TAutosave }>("/api/storage/tests/autosave", autosave);
}

export function listStoredLogos<TLogo>() {
  return getJson<{ logos: TLogo[] }>("/api/storage/logos");
}

export function saveStoredLogo<TLogo extends { id?: string }>(logo: TLogo) {
  return logo.id ? putJson<TLogo>(`/api/storage/logos/${encodeURIComponent(logo.id)}`, logo) : postJson<TLogo>("/api/storage/logos", logo);
}

export function deleteStoredLogo(logoId: string) {
  return deleteRequest(`/api/storage/logos/${encodeURIComponent(logoId)}`);
}

export function listProjects() {
  return getJson<{ projects: ProjectSummary[] }>("/api/storage/projects");
}

export function getDefaultProject() {
  return getJson<ProjectSummary>("/api/storage/projects/default");
}

export function createProject(project: Partial<ProjectSummary> & { name: string }) {
  return postJson<ProjectSummary>("/api/storage/projects", project);
}

export function updateProject(projectId: string, project: Partial<ProjectSummary>) {
  return putJson<ProjectSummary>(`/api/storage/projects/${encodeURIComponent(projectId)}`, project);
}

export function deleteProject(projectId: string) {
  return deleteRequest(`/api/storage/projects/${encodeURIComponent(projectId)}`);
}

export function listProjectFiles(projectId: string) {
  return getJson<{ files: ProjectFileSummary[] }>(`/api/storage/projects/${encodeURIComponent(projectId)}/files`);
}

export async function downloadProjectBackup(projectId: string) {
  const response = await fetch(`${API_BASE}/api/storage/projects/${encodeURIComponent(projectId)}/backup`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw await responseError(response);
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const fileNameMatch = disposition.match(/filename="?([^"]+)"?/i);
  return {
    blob: await response.blob(),
    fileName: fileNameMatch?.[1] ?? "mauth-project-backup.zip",
  };
}

export interface ProjectBackupImportResult {
  importedFiles: number;
  importedFolders: number;
  importedVersions: number;
  importedLogos: number;
  skippedFiles: number;
}

export function importProjectBackup(projectId: string, file: File) {
  return postBinary<ProjectBackupImportResult>(
    `/api/storage/projects/${encodeURIComponent(projectId)}/backup/import`,
    file,
    file.type || "application/zip",
  );
}

export function getProjectFile(projectId: string, filePath: string) {
  return getJson<ProjectFileDocument>(`/api/storage/projects/${encodeURIComponent(projectId)}/files/${encodeProjectFilePath(filePath)}`);
}

export function saveProjectFile(projectId: string, filePath: string, file: ProjectFileSaveRequest) {
  return putJson<ProjectFileDocument>(
    `/api/storage/projects/${encodeURIComponent(projectId)}/files/${encodeProjectFilePath(filePath)}`,
    file,
  );
}

export function deleteProjectFile(projectId: string, filePath: string, baseRevision?: number) {
  const revisionQuery = typeof baseRevision === "number" ? `?baseRevision=${encodeURIComponent(baseRevision)}` : "";
  return deleteRequest(`/api/storage/projects/${encodeURIComponent(projectId)}/files/${encodeProjectFilePath(filePath)}${revisionQuery}`);
}

export function listProjectFileVersions(projectId: string, filePath: string) {
  return getJson<{ versions: ProjectFileVersion[] }>(
    `/api/storage/projects/${encodeURIComponent(projectId)}/versions?path=${encodeURIComponent(filePath)}`,
  );
}

export function restoreProjectFileVersion(projectId: string, filePath: string, versionId: string) {
  return postJson<ProjectFileDocument>(
    `/api/storage/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/restore?path=${encodeURIComponent(filePath)}`,
    {},
  );
}

export function renderPenroseDiagram(spec: DiagramSpec, signal?: AbortSignal) {
  return postJsonWithSignal<PenroseDiagramResponse>("/api/diagram/penrose", spec, signal);
}
