import type { ProjectSummary } from "@mauth-studio/shared";

import type { EditorHistoryState } from "@/hooks/useEditorHistoryController";
import type { HeaderSaveStatus } from "@/hooks/useProjectFileStatus";
import type { ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import type { EditorDocumentState, EditorHistorySnapshot } from "@/lib/editorApplicationRuntime";

export interface EditorDocumentTabNavigation {
  activeQuestionId: string;
  activeTocItemId: string;
  activeRailItemId: string;
}

export interface EditorDocumentTab {
  id: string;
  title: string;
  project: ProjectSummary | null;
  filePath: string | null;
  revision: number | null;
  document: EditorDocumentState;
  history: EditorHistoryState<EditorHistorySnapshot>;
  navigation: EditorDocumentTabNavigation;
  lastSaveFingerprint: string | null;
  cleanUnsavedFingerprint: string | null;
  conflict: ProjectSaveConflict | null;
  saveStatus: HeaderSaveStatus;
  statusMessage: string;
  statusTitle: string;
  dirty: boolean;
  updatedAt: string;
}

export type PersistedEditorDocumentTab = Omit<EditorDocumentTab, "history">;

export interface PersistedEditorDocumentTabsSession {
  activeTabId: string | null;
  tabs: PersistedEditorDocumentTab[];
  updatedAt?: string;
}

export type DocumentTabDropPlacement = "before" | "after";

export function savedDocumentTabId(projectId: string | null | undefined, filePath: string) {
  return `file:${projectId ?? "default"}:${filePath}`;
}

export function draftDocumentTabId(createId: () => string = () => crypto.randomUUID()) {
  return `draft:${createId()}`;
}

export function documentTabIdentity(tab: Pick<EditorDocumentTab, "project" | "filePath">) {
  return tab.filePath ? savedDocumentTabId(tab.project?.documentsPath ?? tab.project?.id, tab.filePath) : null;
}

export function nextActiveDocumentTabId(tabs: readonly EditorDocumentTab[], closingTabId: string) {
  const closingIndex = tabs.findIndex((tab) => tab.id === closingTabId);
  if (closingIndex < 0 || tabs.length <= 1) return null;
  return tabs[closingIndex + 1]?.id ?? tabs[closingIndex - 1]?.id ?? null;
}

export function documentTabDropPlacement(rect: Pick<DOMRect, "left" | "width">, clientX: number): DocumentTabDropPlacement {
  if (rect.width <= 0) return "after";
  return clientX < rect.left + rect.width / 2 ? "before" : "after";
}

export function reorderDocumentTabs(
  tabs: EditorDocumentTab[],
  draggedTabId: string,
  targetTabId: string,
  placement: DocumentTabDropPlacement,
) {
  if (draggedTabId === targetTabId) return tabs;
  const draggedIndex = tabs.findIndex((tab) => tab.id === draggedTabId);
  const targetIndex = tabs.findIndex((tab) => tab.id === targetTabId);
  if (draggedIndex < 0 || targetIndex < 0) return tabs;

  const draggedTab = tabs[draggedIndex];
  if (!draggedTab) return tabs;
  const next = tabs.filter((tab) => tab.id !== draggedTabId);
  const remainingTargetIndex = next.findIndex((tab) => tab.id === targetTabId);
  const insertionIndex = remainingTargetIndex + (placement === "after" ? 1 : 0);
  next.splice(insertionIndex, 0, draggedTab);

  return next.every((tab, index) => tab === tabs[index]) ? tabs : next;
}

export function upsertDocumentTab(tabs: readonly EditorDocumentTab[], tab: EditorDocumentTab) {
  const matchingIndex = tabs.findIndex(
    (candidate) => candidate.id === tab.id || (tab.filePath && documentTabIdentity(candidate) === documentTabIdentity(tab)),
  );
  if (matchingIndex < 0) return [...tabs, tab];
  return tabs.map((candidate, index) => (index === matchingIndex ? tab : candidate));
}

export function persistedDocumentTabsSession(
  tabs: readonly EditorDocumentTab[],
  activeTabId: string | null,
): PersistedEditorDocumentTabsSession {
  return {
    activeTabId,
    tabs: tabs.map(({ history: _history, ...tab }) => tab),
  };
}
