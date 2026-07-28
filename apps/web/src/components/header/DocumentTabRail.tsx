import { ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { EditorDocumentTab } from "@/lib/editorDocumentTabs";
import { cn } from "@/lib/utils";

interface DocumentTabRailProps {
  tabs: EditorDocumentTab[];
  activeTabId: string | null;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

function tabStatusTone(tab: EditorDocumentTab) {
  if (tab.saveStatus === "conflict" || tab.saveStatus === "error") return "bg-red-400";
  if (tab.dirty || tab.saveStatus === "dirty" || tab.saveStatus === "draft") return "bg-amber-300";
  if (tab.saveStatus === "loading" || tab.saveStatus === "saving") return "bg-sky-300";
  return "bg-emerald-400";
}

export function DocumentTabRail({ tabs, activeTabId, onActivateTab, onCloseTab }: DocumentTabRailProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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
                "group flex h-8 min-w-[7.5rem] max-w-[14rem] flex-[1_1_13rem] items-center gap-1 rounded-md border px-1.5 text-sm transition-colors",
                active
                  ? "border-blue-400/70 bg-blue-500/15 text-white shadow-[inset_0_-2px_0_rgba(96,165,250,0.8)]"
                  : "border-blue-300/15 bg-[#050b1d] text-blue-100/80 hover:border-blue-300/35 hover:bg-blue-500/10 hover:text-white",
              )}
              title={`${tab.title}\n${tab.statusTitle}`}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none"
                onClick={() => onActivateTab(tab.id)}
                aria-label={`Open ${tab.title}`}
              >
                <img src="/brand/mauth_icon.png" alt="" className="size-4 shrink-0 object-contain" aria-hidden="true" />
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
