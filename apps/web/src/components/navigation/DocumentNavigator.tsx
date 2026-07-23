import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  Columns3,
  FileText,
  GitBranch,
  ImagePlus,
  ListOrdered,
  SeparatorHorizontal,
  Table2,
  Type,
} from "lucide-react";

import { parseMixedMath } from "@/components/MathText";
import type { DocumentTocItem, TocItemKind } from "@/lib/documentNavigation";
import { scrollAnchorContains } from "@/lib/scrollAnchors";
import { cn } from "@/lib/utils";

function isTocBranchItem(item: DocumentTocItem, items: DocumentTocItem[]) {
  if (item.kind !== "question" && item.kind !== "part" && item.kind !== "subpart") return false;
  const index = items.findIndex((candidate) => candidate.id === item.id);
  return index >= 0 && (items[index + 1]?.depth ?? -1) > item.depth;
}

function tocBranchIdSet(items: DocumentTocItem[]) {
  return new Set(items.filter((item) => isTocBranchItem(item, items)).map((item) => item.id));
}

function visibleTocItems(items: DocumentTocItem[], collapsedItemIds: Set<string>) {
  const visibleItems: DocumentTocItem[] = [];
  let hiddenBelowDepth: number | null = null;

  items.forEach((item) => {
    if (hiddenBelowDepth !== null) {
      if (item.depth > hiddenBelowDepth) return;
      hiddenBelowDepth = null;
    }

    visibleItems.push(item);
    if (collapsedItemIds.has(item.id)) {
      hiddenBelowDepth = item.depth;
    }
  });

  return visibleItems;
}

export function tocSummaryText(source: string) {
  return parseMixedMath(source)
    .map((segment) => segment.content)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function TocItemIcon({ kind, sectionItemPresentation }: { kind: TocItemKind; sectionItemPresentation: "section" | "titlePage" }) {
  if (kind === "title") return <FileText className="size-4" aria-hidden="true" />;
  if (kind === "sectionHeading") {
    return sectionItemPresentation === "titlePage" ? (
      <FileText className="size-4" aria-hidden="true" />
    ) : (
      <SectionSymbolIcon className="size-4 text-base" />
    );
  }
  if (kind === "question") return null;
  if (kind === "pageBreak") return <SeparatorHorizontal className="size-4" aria-hidden="true" />;
  if (kind === "part" || kind === "subpart") return <GitBranch className="size-4" aria-hidden="true" />;
  if (kind === "diagram") return <ImagePlus className="size-4" aria-hidden="true" />;
  if (kind === "table") return <Table2 className="size-4" aria-hidden="true" />;
  if (kind === "choices") return <ListOrdered className="size-4" aria-hidden="true" />;
  if (kind === "columns") return <Columns3 className="size-4" aria-hidden="true" />;
  if (kind === "space") return <SeparatorHorizontal className="size-4" aria-hidden="true" />;
  return <Type className="size-4" aria-hidden="true" />;
}

export function SectionSymbolIcon({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center font-semibold leading-none", className)} aria-hidden="true">
      §
    </span>
  );
}

export function DocumentNavigator({
  items,
  activeItemId,
  sectionItemPresentation = "section",
  onJump,
  onContextMenu,
}: {
  items: DocumentTocItem[];
  activeItemId: string;
  sectionItemPresentation?: "section" | "titlePage";
  onJump: (item: DocumentTocItem) => void;
  onContextMenu: (event: MouseEvent<HTMLElement>, item: DocumentTocItem) => void;
}) {
  const [collapsedItemIds, setCollapsedItemIds] = useState<Set<string>>(() => tocBranchIdSet(items));
  const knownBranchItemIdsRef = useRef<Set<string>>(tocBranchIdSet(items));
  const branchItemIds = useMemo(() => tocBranchIdSet(items), [items]);
  const displayedItems = useMemo(() => visibleTocItems(items, collapsedItemIds), [items, collapsedItemIds]);

  useEffect(() => {
    const knownBranchItemIds = knownBranchItemIdsRef.current;
    const branchIds = tocBranchIdSet(items);
    setCollapsedItemIds((current) => {
      const next = new Set<string>();
      current.forEach((id) => {
        if (branchIds.has(id)) next.add(id);
      });
      branchIds.forEach((id) => {
        if (!knownBranchItemIds.has(id)) next.add(id);
      });
      return next;
    });
    knownBranchItemIdsRef.current = branchIds;
  }, [items]);

  function toggleItem(itemId: string) {
    setCollapsedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  return (
    <aside className="flex min-h-0 flex-col border-r bg-card/95 shadow-panel">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-14 shrink-0 items-center border-b px-3">
          <h2 className="truncate text-sm font-semibold">Document</h2>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Document table of contents">
          <div className="flex flex-col gap-1">
            {displayedItems.map((item) => {
              const active = item.id === activeItemId;
              const relatedActive = !active && scrollAnchorContains(item.id, activeItemId);
              const isBranch = branchItemIds.has(item.id);
              const branchCollapsed = collapsedItemIds.has(item.id);
              const summaryText = item.summary ? tocSummaryText(item.summary) : "";
              const icon = TocItemIcon({ kind: item.kind, sectionItemPresentation });
              return (
                <div
                  key={item.id}
                  className={cn(
                    "group flex min-w-0 items-start gap-1 rounded-md px-2 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : relatedActive
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                  style={{ paddingLeft: `${0.55 + item.depth * 0.85}rem` }}
                  onContextMenu={(event) => onContextMenu(event, item)}
                  data-context-anchor={item.editorAnchor}
                >
                  {isBranch ? (
                    <button
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-background/20"
                      aria-label={branchCollapsed ? `Expand ${item.label}` : `Collapse ${item.label}`}
                      aria-expanded={!branchCollapsed}
                    >
                      {branchCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>
                  ) : (
                    <span className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  )}
                  <button type="button" onClick={() => onJump(item)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                    {icon ? (
                      <span
                        className={cn(
                          "mt-0.5 shrink-0",
                          active
                            ? "text-primary-foreground"
                            : relatedActive
                              ? "text-primary"
                              : "text-muted-foreground group-hover:text-current",
                        )}
                      >
                        {icon}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.label}</span>
                      {summaryText ? (
                        <span
                          className={cn(
                            "block truncate text-xs",
                            active ? "text-primary-foreground/80" : relatedActive ? "text-primary/80" : "text-muted-foreground",
                          )}
                          title={item.summary}
                        >
                          {summaryText}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </nav>
      </div>
    </aside>
  );
}
