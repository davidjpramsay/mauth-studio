import { useMemo } from "react";
import type { DragEvent, MouseEvent as ReactMouseEvent } from "react";
import { ListTree, Plus, SeparatorHorizontal } from "lucide-react";

import { SectionSymbolIcon } from "@/components/navigation/DocumentNavigator";
import { Button } from "@/components/ui/button";
import type { DocumentTocItem, MoveDirection, PageBreakDropPreview, QuestionDropPreview } from "@/lib/documentNavigation";
import { documentNavigationRailItems } from "@/lib/documentNavigation";
import { keyboardDeleteRequested, keyboardMoveDirection } from "@/lib/editorKeyboardShortcuts";
import {
  pageBreakQuestionIdFromScrollAnchor,
  pageBreakScrollAnchor,
  questionIdFromScrollAnchor,
  sectionHeadingIdFromScrollAnchor,
} from "@/lib/scrollAnchors";
import { cn } from "@/lib/utils";

function tocRailPageBreakItem(questionItem: DocumentTocItem, questionId: string): DocumentTocItem {
  const pageBreakAnchor = pageBreakScrollAnchor(questionId);
  return {
    id: pageBreakAnchor,
    label: `Page break after ${questionItem.label}`,
    summary: "Page break",
    kind: "pageBreak",
    depth: 0,
    editorAnchor: pageBreakAnchor,
    previewAnchor: questionItem.previewAnchor,
  };
}

function tocRailLabel(item: DocumentTocItem, sectionItemPresentation: "section" | "titlePage") {
  if (item.kind === "title") return "T";
  if (item.kind === "sectionHeading") return sectionItemPresentation === "titlePage" ? "T" : "§";
  if (item.kind === "pageBreak") return "";
  if (!/^Question\s+/i.test(item.label)) return "H";
  return item.label.replace(/^Question\s+/i, "");
}

function activeTocRailItemId(items: DocumentTocItem[], railItems: DocumentTocItem[], activeItemId: string) {
  const activeIndex = items.findIndex((item) => item.id === activeItemId);
  if (activeIndex === -1) return activeItemId;

  for (let index = activeIndex; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind === "title" || item.kind === "sectionHeading" || (item.kind === "question" && item.depth === 0)) {
      if (railItems.some((railItem) => railItem.id === item.id)) return item.id;
      return railItems.find((railItem) => railItem.previewAnchor === item.previewAnchor)?.id ?? item.id;
    }
  }

  return activeItemId;
}

export function DocumentNavigatorRail({
  open,
  items,
  activeItemId,
  draggedQuestionId,
  dragOverQuestion,
  draggedPageBreakQuestionId,
  dragOverPageBreak,
  pageBreakQuestionIds,
  onToggle,
  onJump,
  onPreviewJump,
  onContextMenu,
  onSelectPageBreak,
  onToggleEditorAtItem,
  onAddSectionHeading,
  onAddQuestion,
  questionItemLabel = "question",
  sectionItemPresentation = "section",
  showStructureControls = true,
  onAddPageBreakAfterQuestion,
  onMoveQuestion,
  onMoveSectionHeading,
  onMovePageBreak,
  onDeleteQuestion,
  onDeleteSectionHeading,
  onDeletePageBreak,
  onQuestionDragStart,
  onQuestionDragOver,
  onQuestionDragLeave,
  onQuestionDrop,
  onQuestionDragOverPageBreak,
  onQuestionDragLeavePageBreak,
  onQuestionDropPageBreak,
  onQuestionDragEnd,
  onPageBreakDragStart,
  onPageBreakDragOver,
  onPageBreakDragLeave,
  onPageBreakDrop,
  onPageBreakDragEnd,
}: {
  open: boolean;
  items: DocumentTocItem[];
  activeItemId: string;
  draggedQuestionId: string | null;
  dragOverQuestion: QuestionDropPreview | null;
  draggedPageBreakQuestionId: string | null;
  dragOverPageBreak: PageBreakDropPreview | null;
  pageBreakQuestionIds: Set<string>;
  onToggle: () => void;
  onJump: (item: DocumentTocItem) => void;
  onPreviewJump: (item: DocumentTocItem) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>, item: DocumentTocItem) => void;
  onSelectPageBreak: (item: DocumentTocItem) => void;
  onToggleEditorAtItem: (item: DocumentTocItem) => void;
  onAddSectionHeading: () => void;
  onAddQuestion: () => void;
  questionItemLabel?: string;
  sectionItemPresentation?: "section" | "titlePage";
  showStructureControls?: boolean;
  onAddPageBreakAfterQuestion: (questionId: string) => void;
  onMoveQuestion: (questionId: string, direction: MoveDirection) => void;
  onMoveSectionHeading: (sectionHeadingId: string, direction: MoveDirection) => void;
  onMovePageBreak: (questionId: string, direction: MoveDirection) => void;
  onDeleteQuestion: (questionId: string) => void;
  onDeleteSectionHeading: (sectionHeadingId: string) => void;
  onDeletePageBreak: (questionId: string) => void;
  onQuestionDragStart: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onQuestionDragOver: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onQuestionDragLeave: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onQuestionDrop: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onQuestionDragOverPageBreak: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onQuestionDragLeavePageBreak: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onQuestionDropPageBreak: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onQuestionDragEnd: () => void;
  onPageBreakDragStart: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onPageBreakDragOver: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onPageBreakDragLeave: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onPageBreakDrop: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onPageBreakDragEnd: () => void;
}) {
  const railItems = useMemo(
    () =>
      documentNavigationRailItems(items, sectionItemPresentation).flatMap((item) => {
        const questionId = questionIdFromScrollAnchor(item.editorAnchor);
        if (!questionId || !pageBreakQuestionIds.has(questionId)) return [item];
        return [item, tocRailPageBreakItem(item, questionId)];
      }),
    [items, pageBreakQuestionIds, sectionItemPresentation],
  );
  const activeRailItemId = useMemo(() => activeTocRailItemId(items, railItems, activeItemId), [activeItemId, items, railItems]);
  const selectedQuestionId = questionIdFromScrollAnchor(activeRailItemId);
  const canAddPageBreak = Boolean(selectedQuestionId && !pageBreakQuestionIds.has(selectedQuestionId));

  return (
    <aside className="flex min-h-0 w-[3.25rem] flex-col border-r bg-card/95 shadow-panel">
      <div className="flex h-14 items-center justify-center border-b">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title={open ? "Hide document navigator" : "Show document navigator"}
          aria-label={open ? "Hide document navigator" : "Show document navigator"}
          aria-pressed={open}
          onClick={onToggle}
          className={cn("size-9", open && "bg-primary/10 text-primary")}
        >
          <ListTree />
        </Button>
      </div>
      <nav
        className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto overscroll-contain px-1.5 py-3"
        aria-label="Document quick navigation"
      >
        {railItems.map((item) => {
          if (item.kind === "pageBreak") {
            const questionId = pageBreakQuestionIdFromScrollAnchor(item.editorAnchor);
            const active = item.id === activeRailItemId;
            const dragging = draggedPageBreakQuestionId === questionId;
            const questionDropTarget =
              draggedQuestionId &&
              dragOverQuestion?.surface === "pageBreakBoundary" &&
              dragOverQuestion.questionId === questionId &&
              draggedQuestionId !== questionId;
            return (
              <button
                key={item.id}
                type="button"
                draggable
                data-drag-preview
                data-context-anchor={item.editorAnchor}
                title={`${item.label}. Click selects it in the mini TOC. Alt+Up/Alt+Down moves it. Delete removes it.`}
                aria-label={`${item.label}. Click selects it in the mini TOC. Press Alt+Up or Alt+Down to move it. Press Delete to remove it.`}
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Delete Backspace"
                aria-current={active ? "location" : undefined}
                onClick={() => onSelectPageBreak(item)}
                onContextMenu={(event) => onContextMenu(event, item)}
                onKeyDown={(event) => {
                  if (keyboardDeleteRequested(event)) {
                    event.preventDefault();
                    event.stopPropagation();
                    onDeletePageBreak(questionId);
                    return;
                  }
                  const direction = keyboardMoveDirection(event);
                  if (!direction) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onMovePageBreak(questionId, direction);
                }}
                onDragStart={(event) => onPageBreakDragStart(event, questionId)}
                onDragOver={(event) => {
                  onQuestionDragOverPageBreak(event, questionId);
                  onPageBreakDragOver(event, questionId);
                }}
                onDragLeave={(event) => {
                  onQuestionDragLeavePageBreak(event, questionId);
                  onPageBreakDragLeave(event, questionId);
                }}
                onDrop={(event) => {
                  onQuestionDropPageBreak(event, questionId);
                  onPageBreakDrop(event, questionId);
                }}
                onDragEnd={onPageBreakDragEnd}
                className={cn(
                  "relative flex h-6 w-8 shrink-0 cursor-grab touch-manipulation items-center justify-center rounded-sm border border-primary/60 bg-primary/15 text-primary transition-colors hover:bg-primary/20 active:cursor-grabbing",
                  active && "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary",
                  dragging && "scale-95 opacity-60 shadow-lg",
                  questionDropTarget &&
                    "before:absolute before:-top-1.5 before:left-0 before:right-0 before:z-20 before:h-1 before:rounded-full before:bg-primary before:shadow-[0_0_0_3px_hsl(var(--primary)/0.16)] before:content-['']",
                )}
              >
                <SeparatorHorizontal className="size-4" aria-hidden="true" />
              </button>
            );
          }

          const active = item.id === activeRailItemId;
          const questionId = questionIdFromScrollAnchor(item.editorAnchor);
          const sectionHeadingId = sectionHeadingIdFromScrollAnchor(item.editorAnchor);
          const movableItemId = questionId || sectionHeadingId;
          const togglesEditor = item.kind === "title" || item.kind === "sectionHeading" || Boolean(questionId);
          const draggable = Boolean(questionId);
          const dragging = draggedQuestionId === questionId;
          const dropPlacement =
            questionId &&
            dragOverQuestion?.questionId === questionId &&
            dragOverQuestion.surface !== "pageBreakBoundary" &&
            draggedQuestionId !== questionId
              ? dragOverQuestion.placement
              : null;
          const pageBreakDropPlacement =
            questionId && dragOverPageBreak?.questionId === questionId && draggedPageBreakQuestionId ? dragOverPageBreak.placement : null;
          return (
            <button
              key={item.id}
              type="button"
              draggable={draggable}
              data-drag-preview={draggable ? true : undefined}
              data-context-anchor={item.editorAnchor}
              title={
                movableItemId
                  ? `${item.label}. Click selects it and jumps the display. Double-click opens or closes the editor. Alt+Up/Alt+Down moves it. Delete removes it.`
                  : `${item.label}. Click selects it and jumps the display. Double-click opens or closes the editor.`
              }
              aria-label={
                movableItemId
                  ? `${item.label}. Click selects it and jumps the display. Double-click opens or closes the editor. Press Alt+Up or Alt+Down to move it. Press Delete to remove it.`
                  : `${item.label}. Click selects it and jumps the display. Double-click opens or closes the editor.`
              }
              aria-current={active ? "location" : undefined}
              aria-keyshortcuts={movableItemId ? "Alt+ArrowUp Alt+ArrowDown Delete Backspace" : undefined}
              onClick={() => (item.kind === "title" || item.kind === "sectionHeading" || questionId ? onPreviewJump(item) : onJump(item))}
              onContextMenu={(event) => onContextMenu(event, item)}
              onDoubleClick={togglesEditor ? () => onToggleEditorAtItem(item) : undefined}
              onKeyDown={
                movableItemId
                  ? (event) => {
                      if (keyboardDeleteRequested(event)) {
                        event.preventDefault();
                        event.stopPropagation();
                        if (sectionHeadingId) {
                          onDeleteSectionHeading(sectionHeadingId);
                        } else {
                          onDeleteQuestion(questionId);
                        }
                        return;
                      }
                      const direction = keyboardMoveDirection(event);
                      if (!direction) return;
                      event.preventDefault();
                      event.stopPropagation();
                      if (sectionHeadingId) {
                        onMoveSectionHeading(sectionHeadingId, direction);
                      } else {
                        onMoveQuestion(questionId, direction);
                      }
                    }
                  : undefined
              }
              onDragStart={questionId ? (event) => onQuestionDragStart(event, questionId) : undefined}
              onDragOver={
                questionId
                  ? (event) => {
                      onPageBreakDragOver(event, questionId);
                      onQuestionDragOver(event, questionId);
                    }
                  : undefined
              }
              onDragLeave={
                questionId
                  ? (event) => {
                      onPageBreakDragLeave(event, questionId);
                      onQuestionDragLeave(event, questionId);
                    }
                  : undefined
              }
              onDrop={
                questionId
                  ? (event) => {
                      onPageBreakDrop(event, questionId);
                      onQuestionDrop(event, questionId);
                    }
                  : undefined
              }
              onDragEnd={draggable ? onQuestionDragEnd : undefined}
              className={cn(
                "relative flex size-8 shrink-0 touch-manipulation items-center justify-center rounded-md border text-sm font-semibold transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent hover:text-accent-foreground",
                draggable && "cursor-grab active:cursor-grabbing",
                dragging && "scale-95 opacity-60 shadow-lg",
                dropPlacement === "before" &&
                  "before:absolute before:-top-1.5 before:left-0 before:right-0 before:z-20 before:h-1 before:rounded-full before:bg-primary before:shadow-[0_0_0_3px_hsl(var(--primary)/0.16)] before:content-['']",
                dropPlacement === "after" &&
                  "after:absolute after:-bottom-1.5 after:left-0 after:right-0 after:z-20 after:h-1 after:rounded-full after:bg-primary after:shadow-[0_0_0_3px_hsl(var(--primary)/0.16)] after:content-['']",
                pageBreakDropPlacement === "before" &&
                  "before:absolute before:-top-1.5 before:left-0 before:right-0 before:z-20 before:h-1 before:rounded-full before:bg-primary before:shadow-[0_0_0_3px_hsl(var(--primary)/0.16)] before:content-['']",
                pageBreakDropPlacement === "after" &&
                  "after:absolute after:-bottom-1.5 after:left-0 after:right-0 after:z-20 after:h-1 after:rounded-full after:bg-primary after:shadow-[0_0_0_3px_hsl(var(--primary)/0.16)] after:content-['']",
              )}
            >
              {tocRailLabel(item, sectionItemPresentation)}
            </button>
          );
        })}
      </nav>
      {showStructureControls ? (
        <div className="flex h-28 shrink-0 flex-col items-center justify-center gap-1 border-t">
          <button
            type="button"
            title={sectionItemPresentation === "titlePage" ? "Add section title page" : "Add section"}
            aria-label={sectionItemPresentation === "titlePage" ? "Add section title page" : "Add section"}
            onClick={onAddSectionHeading}
            className="flex size-8 shrink-0 touch-manipulation items-center justify-center rounded-md border border-dashed border-border bg-background text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/60 hover:bg-accent hover:text-primary"
          >
            {sectionItemPresentation === "titlePage" ? "T" : <SectionSymbolIcon className="size-4 text-base" />}
          </button>
          <button
            type="button"
            title={`Add ${questionItemLabel}`}
            aria-label={`Add ${questionItemLabel}`}
            onClick={onAddQuestion}
            className="flex size-8 shrink-0 touch-manipulation items-center justify-center rounded-md border border-dashed border-border bg-background text-muted-foreground transition-colors hover:border-primary/60 hover:bg-accent hover:text-primary"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            title={
              selectedQuestionId
                ? canAddPageBreak
                  ? `Add page break after selected ${questionItemLabel}`
                  : `Selected ${questionItemLabel} already has a page break`
                : `Select a ${questionItemLabel} to add a page break`
            }
            aria-label={`Add page break after selected ${questionItemLabel}`}
            disabled={!canAddPageBreak}
            onClick={() => {
              if (selectedQuestionId) onAddPageBreakAfterQuestion(selectedQuestionId);
            }}
            className="flex size-8 shrink-0 touch-manipulation items-center justify-center rounded-md border border-dashed border-border bg-background text-muted-foreground transition-colors hover:border-primary/60 hover:bg-accent hover:text-primary disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-border disabled:hover:bg-background disabled:hover:text-muted-foreground"
          >
            <SeparatorHorizontal className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </aside>
  );
}
