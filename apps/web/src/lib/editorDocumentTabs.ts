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

interface HydratedDocumentTabIdOptions {
  filePath: string | null;
  projectId?: string | null;
  documentsPath?: string | null;
  createDraftId?: () => string;
}

export interface DocumentTabsPersistencePlan {
  tabs: EditorDocumentTab[];
  activeTabId: string | null;
  restoreActiveTab: boolean;
}

export function savedDocumentTabId(projectId: string | null | undefined, filePath: string) {
  return `file:${projectId ?? "default"}:${filePath}`;
}

export function draftDocumentTabId(createId: () => string = () => crypto.randomUUID()) {
  return `draft:${createId()}`;
}

export function documentTabIdentity(tab: Pick<EditorDocumentTab, "project" | "filePath">) {
  return tab.filePath ? savedDocumentTabId(tab.project?.documentsPath ?? tab.project?.id, tab.filePath) : null;
}

export function hydratedDocumentTabId(
  session: PersistedEditorDocumentTabsSession | null,
  { filePath, projectId, documentsPath, createDraftId = () => crypto.randomUUID() }: HydratedDocumentTabIdOptions,
) {
  const activeTab = session?.tabs.find((tab) => tab.id === session.activeTabId);
  if (filePath && !documentsPath && activeTab?.filePath === filePath) return activeTab.id;
  const matchingTab = filePath
    ? session?.tabs.find(
        (tab) =>
          tab.filePath === filePath && (!tab.project?.documentsPath || !documentsPath || tab.project.documentsPath === documentsPath),
      )
    : null;
  if (matchingTab) return matchingTab.id;

  if (!filePath) {
    const persistedActiveTab = session?.tabs.find((tab) => tab.id === session.activeTabId);
    if (persistedActiveTab?.filePath === null) return persistedActiveTab.id;
    return draftDocumentTabId(createDraftId);
  }

  return savedDocumentTabId(documentsPath ?? projectId, filePath);
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

export function documentTabsPersistencePlan(
  restoredTabs: EditorDocumentTab[],
  sessionActiveTabId: string | null,
  currentTab?: EditorDocumentTab | null,
): DocumentTabsPersistencePlan {
  // The current draft is authoritative even when its cloud project lookup
  // failed. Recover only the owning folder from the matching saved session.
  const initialCurrentTab = currentTab;
  const persistedOwner =
    initialCurrentTab?.filePath && !initialCurrentTab.project
      ? restoredTabs.find((tab) => tab.id === initialCurrentTab.id && tab.filePath === initialCurrentTab.filePath)
      : null;
  const resolvedCurrentTab = persistedOwner?.project && currentTab ? { ...currentTab, project: persistedOwner.project } : currentTab;
  const recoveredProject = resolvedCurrentTab !== currentTab;
  currentTab = resolvedCurrentTab;
  const idCollision = currentTab
    ? restoredTabs.some(
        (tab) =>
          tab.id === currentTab.id &&
          (tab.filePath !== currentTab.filePath || documentTabIdentity(tab) !== documentTabIdentity(currentTab)),
      )
    : false;
  const safeCurrentTab = idCollision ? null : currentTab;
  const currentIdentity = safeCurrentTab ? documentTabIdentity(safeCurrentTab) : null;
  const tabs = safeCurrentTab
    ? upsertDocumentTab(
        restoredTabs.filter((tab) => !currentIdentity || documentTabIdentity(tab) !== currentIdentity),
        safeCurrentTab,
      )
    : restoredTabs;
  const requestedActiveId = safeCurrentTab?.id ?? sessionActiveTabId;
  const activeTabId = tabs.some((tab) => tab.id === requestedActiveId) ? requestedActiveId : (tabs[0]?.id ?? null);
  return { tabs, activeTabId, restoreActiveTab: (!safeCurrentTab || recoveredProject) && activeTabId !== null };
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
