import { useRef, useState } from "react";

import {
  documentTabIdentity,
  draftDocumentTabId,
  nextActiveDocumentTabId,
  savedDocumentTabId,
  upsertDocumentTab,
  type EditorDocumentTab,
  type PersistedEditorDocumentTabsSession,
} from "@/lib/editorDocumentTabs";

interface UseEditorDocumentTabsControllerOptions {
  initialTab?: EditorDocumentTab | null;
  captureCurrentTab: (existing?: EditorDocumentTab | null, forcedId?: string) => EditorDocumentTab;
  restoreTab: (tab: EditorDocumentTab) => void | Promise<void>;
}

export function useEditorDocumentTabsController({ initialTab, captureCurrentTab, restoreTab }: UseEditorDocumentTabsControllerOptions) {
  const [tabs, setTabsState] = useState<EditorDocumentTab[]>(() => (initialTab ? [initialTab] : []));
  const tabsRef = useRef(tabs);
  const [activeTabId, setActiveTabIdState] = useState<string | null>(() => initialTab?.id ?? null);
  const activeTabIdRef = useRef(activeTabId);
  const operationRef = useRef<Promise<void>>(Promise.resolve());
  const captureCurrentTabRef = useRef(captureCurrentTab);
  const restoreTabRef = useRef(restoreTab);
  captureCurrentTabRef.current = captureCurrentTab;
  restoreTabRef.current = restoreTab;

  function setTabs(next: EditorDocumentTab[]) {
    tabsRef.current = next;
    setTabsState(next);
  }

  function setActiveTabId(next: string | null) {
    activeTabIdRef.current = next;
    setActiveTabIdState(next);
  }

  function captureActiveTab() {
    const currentId = activeTabIdRef.current;
    if (!currentId) return null;
    const existing = tabsRef.current.find((tab) => tab.id === currentId) ?? null;
    const captured = captureCurrentTabRef.current(existing, currentId);
    setTabs(upsertDocumentTab(tabsRef.current, captured));
    return captured;
  }

  function captureCurrentDocument(forcedId?: string) {
    return captureCurrentTabRef.current(null, forcedId ?? draftDocumentTabId());
  }

  function currentTabsSnapshot() {
    const currentId = activeTabIdRef.current;
    if (!currentId) return tabsRef.current;
    const existing = tabsRef.current.find((tab) => tab.id === currentId) ?? null;
    const captured = captureCurrentTabRef.current(existing, currentId);
    return upsertDocumentTab(tabsRef.current, captured);
  }

  function addCurrentDocumentAsTab(preferredId?: string, overrides: Partial<EditorDocumentTab> = {}) {
    const probe = captureCurrentTabRef.current(null, preferredId ?? draftDocumentTabId());
    const id =
      preferredId ?? (probe.filePath ? savedDocumentTabId(probe.project?.documentsPath ?? probe.project?.id, probe.filePath) : probe.id);
    const captured = { ...(id === probe.id ? probe : captureCurrentTabRef.current(null, id)), ...overrides, id };
    const matchingIdentity = documentTabIdentity(captured);
    const existing = matchingIdentity ? tabsRef.current.find((tab) => documentTabIdentity(tab) === matchingIdentity) : undefined;
    const nextTab = existing ? { ...captured, id: existing.id } : captured;
    setTabs(upsertDocumentTab(tabsRef.current, nextTab));
    setActiveTabId(nextTab.id);
    return nextTab;
  }

  function tabForFile(project: EditorDocumentTab["project"], filePath: string) {
    const identity = savedDocumentTabId(project?.documentsPath ?? project?.id, filePath);
    return tabsRef.current.find((tab) => tab.id === identity || documentTabIdentity(tab) === identity) ?? null;
  }

  function queueOperation(operation: () => void | Promise<void>) {
    const run = operationRef.current.then(operation, operation);
    operationRef.current = run.catch(() => undefined);
    return run;
  }

  function activateTab(tabId: string) {
    return queueOperation(async () => {
      if (tabId === activeTabIdRef.current) return;
      captureActiveTab();
      const target = tabsRef.current.find((tab) => tab.id === tabId);
      if (!target) return;
      await restoreTabRef.current(target);
      setActiveTabId(target.id);
    });
  }

  function removeTab(tabId: string) {
    const closingActiveTab = activeTabIdRef.current === tabId;
    const nextActiveId = closingActiveTab ? nextActiveDocumentTabId(tabsRef.current, tabId) : activeTabIdRef.current;
    setTabs(tabsRef.current.filter((tab) => tab.id !== tabId));
    if (closingActiveTab) setActiveTabId(null);
    return nextActiveId;
  }

  function replaceTabsFromPersistence(session: PersistedEditorDocumentTabsSession, currentTab?: EditorDocumentTab | null) {
    const restoredTabs = session.tabs.map((tab) => ({ ...tab, history: { undo: [], redo: [] } }));
    const currentIdentity = currentTab ? documentTabIdentity(currentTab) : null;
    const mergedTabs = currentTab
      ? upsertDocumentTab(
          restoredTabs.filter((tab) => !currentIdentity || documentTabIdentity(tab) !== currentIdentity),
          currentTab,
        )
      : restoredTabs;
    const requestedActiveId = currentTab?.id ?? session.activeTabId;
    const nextActiveId = mergedTabs.some((tab) => tab.id === requestedActiveId) ? requestedActiveId : (mergedTabs[0]?.id ?? null);
    setTabs(mergedTabs);
    setActiveTabId(nextActiveId);
  }

  function clearTabs() {
    setTabs([]);
    setActiveTabId(null);
  }

  return {
    tabs,
    tabsRef,
    activeTabId,
    activeTabIdRef,
    captureActiveTab,
    captureCurrentDocument,
    currentTabsSnapshot,
    addCurrentDocumentAsTab,
    tabForFile,
    activateTab,
    removeTab,
    replaceTabsFromPersistence,
    clearTabs,
  };
}
