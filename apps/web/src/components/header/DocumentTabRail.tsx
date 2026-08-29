import { ChevronDown, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { documentTabDropPlacement, type DocumentTabDropPlacement, type EditorDocumentTab } from "@/lib/editorDocumentTabs";
import { cn } from "@/lib/utils";

interface DocumentTabRailProps {
  tabs: EditorDocumentTab[];
  activeTabId: string | null;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onReorderTab: (tabId: string, targetTabId: string, placement: DocumentTabDropPlacement) => void;
}

function tabStatusTone(tab: EditorDocumentTab) {
  if (tab.saveStatus === "conflict" || tab.saveStatus === "error") return "bg-red-400";
  if (tab.dirty || tab.saveStatus === "dirty" || tab.saveStatus === "draft") return "bg-amber-300";
  if (tab.saveStatus === "loading" || tab.saveStatus === "saving") return "bg-sky-300";
  return "bg-emerald-400";
}

export function DocumentTabRail({ tabs, activeTabId, onActivateTab, onCloseTab, onReorderTab }: DocumentTabRailProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const dropTargetRef = useRef<{ tabId: string; placement: DocumentTabDropPlacement } | null>(null);
  const pointerDragRef = useRef<{ pointerId: number; startX: number; tabId: string; dragging: boolean } | null>(null);
  const suppressActivationRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ tabId: string; placement: DocumentTabDropPlacement } | null>(null);

  const clearTabDrag = useCallback(() => {
    dropTargetRef.current = null;
    pointerDragRef.current = null;
    setDraggedTabId(null);
    setDropTarget(null);
  }, []);

  const updateDropTarget = useCallback((clientX: number, sourceTabId: string) => {
    const tabElements = Array.from(railRef.current?.querySelectorAll<HTMLElement>("[data-document-tab-id]") ?? []);
    const targetElement = tabElements.find((element) => clientX <= element.getBoundingClientRect().right) ?? tabElements.at(-1);
    const targetTabId = targetElement?.dataset.documentTabId;
    if (!targetElement || !targetTabId || targetTabId === sourceTabId) {
      dropTargetRef.current = null;
      setDropTarget(null);
      return;
    }
    const nextTarget = {
      tabId: targetTabId,
      placement: documentTabDropPlacement(targetElement.getBoundingClientRect(), clientX),
    };
    dropTargetRef.current = nextTarget;
    setDropTarget(nextTarget);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    const active = rail?.querySelector<HTMLElement>(`[data-document-tab-id="${CSS.escape(activeTabId ?? "")}"]`);
    if (!rail || !active) return;
    const activeLeft = active.offsetLeft;
    const activeRight = activeLeft + active.offsetWidth;
    if (activeLeft < rail.scrollLeft) rail.scrollLeft = activeLeft;
    else if (activeRight > rail.scrollLeft + rail.clientWidth) rail.scrollLeft = activeRight - rail.clientWidth;
  }, [activeTabId]);

  useEffect(() => {
    if (!menuOpen) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const pointerDrag = pointerDragRef.current;
      if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
      if (!pointerDrag.dragging) {
        if (Math.abs(event.clientX - pointerDrag.startX) < 5) return;
        pointerDrag.dragging = true;
        setDraggedTabId(pointerDrag.tabId);
        setMenuOpen(false);
      }
      event.preventDefault();
      updateDropTarget(event.clientX, pointerDrag.tabId);
    }

    function handlePointerEnd(event: PointerEvent) {
      const pointerDrag = pointerDragRef.current;
      if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
      const completedDrag = pointerDrag.dragging;
      const target = dropTargetRef.current;
      clearTabDrag();
      if (!completedDrag) return;
      suppressActivationRef.current = true;
      window.setTimeout(() => {
        suppressActivationRef.current = false;
      }, 0);
      event.preventDefault();
      if (target && target.tabId !== pointerDrag.tabId) {
        onReorderTab(pointerDrag.tabId, target.tabId, target.placement);
      }
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerEnd, { passive: false });
    window.addEventListener("pointercancel", handlePointerEnd, { passive: false });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [clearTabDrag, onReorderTab, updateDropTarget]);

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-1 items-center gap-1">
      <div
        ref={railRef}
        role="tablist"
        aria-label="Open documents"
        className="document-tab-rail flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              data-document-tab-id={tab.id}
              className={cn(
                "group relative flex h-8 min-w-[7.5rem] max-w-[14rem] flex-[1_1_13rem] cursor-grab items-center gap-1 rounded-[5px] border px-1.5 text-sm transition-colors active:cursor-grabbing",
                active
                  ? "border-white/15 bg-white/[0.075] text-white"
                  : "border-transparent bg-transparent text-blue-100/65 hover:border-white/10 hover:bg-white/[0.045] hover:text-blue-50",
                draggedTabId === tab.id && "opacity-45",
                dropTarget?.tabId === tab.id &&
                  (dropTarget.placement === "before" ? "document-tab-drop-before" : "document-tab-drop-after"),
              )}
              title={`${tab.title}\n${tab.statusTitle}\nDrag to reorder`}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 touch-none select-none items-center gap-1.5 text-left focus-visible:outline-none"
                onClick={(event) => {
                  if (suppressActivationRef.current) {
                    suppressActivationRef.current = false;
                    event.preventDefault();
                    return;
                  }
                  onActivateTab(tab.id);
                }}
                aria-label={`Open ${tab.title}`}
                onPointerDown={(event) => {
                  if (tabs.length < 2 || event.button !== 0) return;
                  pointerDragRef.current = { pointerId: event.pointerId, startX: event.clientX, tabId: tab.id, dragging: false };
                }}
                onDragStart={(event) => event.preventDefault()}
              >
                <img src="/brand/mauth_icon.png" alt="" className="size-4 shrink-0 object-contain" aria-hidden="true" draggable={false} />
                <span className="truncate font-medium">{tab.title}</span>
                <span className={cn("size-1.5 shrink-0 rounded-full", tabStatusTone(tab))} aria-label={tab.statusMessage} />
              </button>
              <button
                type="button"
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded text-blue-100/60 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-300",
                  active ? "opacity-100" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
                )}
                title={`Close ${tab.title}`}
                aria-label={`Close ${tab.title}`}
                onClick={() => onCloseTab(tab.id)}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      {tabs.length > 1 ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-blue-100 hover:bg-blue-500/15 hover:text-white"
          title="Show open documents"
          aria-label="Show open documents"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
      {menuOpen ? (
        <div className="absolute right-0 top-10 z-50 min-w-64 max-w-96 rounded-md border border-blue-300/20 bg-[#071022] p-1 shadow-2xl">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-blue-100 hover:bg-blue-500/15 hover:text-white",
                tab.id === activeTabId && "bg-blue-500/20 text-white",
              )}
              onClick={() => {
                setMenuOpen(false);
                onActivateTab(tab.id);
              }}
            >
              <span className={cn("size-1.5 shrink-0 rounded-full", tabStatusTone(tab))} aria-hidden="true" />
              <span className="truncate">{tab.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
