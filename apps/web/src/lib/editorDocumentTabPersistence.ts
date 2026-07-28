import type { ProjectSummary } from "@mauth-studio/shared";

import type { HeaderSaveStatus } from "@/hooks/useProjectFileStatus";
import type { EditorDocumentState } from "@/lib/editorApplicationRuntime";
import type { PersistedEditorDocumentTab, PersistedEditorDocumentTabsSession } from "@/lib/editorDocumentTabs";

export const EDITOR_DOCUMENT_TABS_STORAGE_KEY = "mauth-editor-open-documents-v1";

const SAVE_STATUSES = new Set<HeaderSaveStatus>([
  "loading",
  "ready",
  "saving",
  "saved",
  "unavailable",
  "error",
  "dirty",
  "draft",
  "conflict",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function projectSummary(value: unknown): ProjectSummary | null {
  const candidate = record(value);
  if (!candidate || typeof candidate.id !== "string" || typeof candidate.name !== "string") return null;
  return candidate as unknown as ProjectSummary;
}

function navigation(value: unknown) {
  const candidate = record(value);
  return {
    activeQuestionId: typeof candidate?.activeQuestionId === "string" ? candidate.activeQuestionId : "",
    activeTocItemId: typeof candidate?.activeTocItemId === "string" ? candidate.activeTocItemId : "front-matter",
    activeRailItemId: typeof candidate?.activeRailItemId === "string" ? candidate.activeRailItemId : "front-matter",
  };
}

function normalizedTab(
  value: unknown,
  normalizeDocument: (value: unknown) => EditorDocumentState | null,
): PersistedEditorDocumentTab | null {
  const candidate = record(value);
  if (!candidate || typeof candidate.id !== "string" || typeof candidate.title !== "string") return null;
  const document = normalizeDocument(candidate.document);
  if (!document) return null;
  const saveStatus =
    typeof candidate.saveStatus === "string" && SAVE_STATUSES.has(candidate.saveStatus as HeaderSaveStatus)
      ? (candidate.saveStatus as HeaderSaveStatus)
      : "ready";

  return {
    id: candidate.id,
    title: candidate.title,
    project: projectSummary(candidate.project),
    filePath: typeof candidate.filePath === "string" ? candidate.filePath : null,
    revision: typeof candidate.revision === "number" && Number.isInteger(candidate.revision) ? candidate.revision : null,
    document,
    navigation: navigation(candidate.navigation),
    lastSaveFingerprint: typeof candidate.lastSaveFingerprint === "string" ? candidate.lastSaveFingerprint : null,
    cleanUnsavedFingerprint: typeof candidate.cleanUnsavedFingerprint === "string" ? candidate.cleanUnsavedFingerprint : null,
    conflict: record(candidate.conflict) as PersistedEditorDocumentTab["conflict"],
    saveStatus,
    statusMessage: typeof candidate.statusMessage === "string" ? candidate.statusMessage : "Recovered document tab",
    statusTitle: typeof candidate.statusTitle === "string" ? candidate.statusTitle : candidate.title,
    dirty: candidate.dirty === true,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date(0).toISOString(),
  };
}

export function normalizePersistedEditorDocumentTabsSession(
  value: unknown,
  normalizeDocument: (value: unknown) => EditorDocumentState | null,
): PersistedEditorDocumentTabsSession | null {
  const candidate = record(value);
  if (!candidate || !Array.isArray(candidate.tabs)) return null;
  const tabs = candidate.tabs.flatMap((entry) => {
    const tab = normalizedTab(entry, normalizeDocument);
    return tab ? [tab] : [];
  });
  const activeTabId =
    typeof candidate.activeTabId === "string" && tabs.some((tab) => tab.id === candidate.activeTabId)
      ? candidate.activeTabId
      : (tabs[0]?.id ?? null);
  return {
    activeTabId,
    tabs,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : undefined,
  };
}

export function loadBrowserDocumentTabsSession(
  normalizeDocument: (value: unknown) => EditorDocumentState | null,
  storage: Storage | null = typeof window === "undefined" ? null : window.localStorage,
) {
  if (!storage) return null;
  try {
    return normalizePersistedEditorDocumentTabsSession(
      JSON.parse(storage.getItem(EDITOR_DOCUMENT_TABS_STORAGE_KEY) ?? "null"),
      normalizeDocument,
    );
  } catch {
    return null;
  }
}

export function saveBrowserDocumentTabsSession(
  session: PersistedEditorDocumentTabsSession,
  storage: Storage | null = typeof window === "undefined" ? null : window.localStorage,
) {
  storage?.setItem(EDITOR_DOCUMENT_TABS_STORAGE_KEY, JSON.stringify(session));
}
