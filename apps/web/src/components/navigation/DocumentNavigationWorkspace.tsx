import type { DragEvent, MouseEvent as ReactMouseEvent } from "react";

import { DocumentNavigator } from "@/components/navigation/DocumentNavigator";
import { DocumentNavigatorRail } from "@/components/navigation/DocumentNavigatorRail";
import type { DocumentTocItem, MoveDirection, PageBreakDropPreview, QuestionDropPreview } from "@/lib/documentNavigation";
import { documentNavigationPresentationPlan } from "@/lib/documentNavigation";

interface DocumentNavigationState {
  draggedQuestionId: string | null;
  dragOverQuestion: QuestionDropPreview | null;
  draggedPageBreakQuestionId: string | null;
  dragOverPageBreak: PageBreakDropPreview | null;
}

interface DocumentNavigationActions {
  jumpToTocItem: (item: DocumentTocItem) => void;
  jumpPreviewToTocItem: (item: DocumentTocItem) => void;
  selectPageBreakInRail: (item: DocumentTocItem) => void;
  toggleEditorAtTocItem: (item: DocumentTocItem) => void;
}

interface QuestionNavigationLifecycle {
  addQuestion: () => void;
  addPageBreakAfterQuestion: (questionId: string) => void;
  removePageBreakAfterQuestion: (questionId: string) => void;
  removeQuestion: (questionId: string) => void;
}

interface SectionHeadingNavigationLifecycle {
  addSectionHeading: () => void;
  moveSectionHeadingByKeyboard: (sectionHeadingId: string, direction: MoveDirection) => void;
  removeSectionHeading: (sectionHeadingId: string) => void;
}

interface QuestionPageBreakDragActions {
  moveQuestionByKeyboard: (questionId: string, direction: MoveDirection) => void;
  movePageBreakByKeyboard: (questionId: string, direction: MoveDirection) => void;
  handleQuestionDragStart: (event: DragEvent<HTMLElement>, questionId: string) => void;
  handleQuestionDragOver: (event: DragEvent<HTMLElement>, questionId: string) => void;
  handleQuestionDragLeave: (event: DragEvent<HTMLElement>, questionId: string) => void;
  handleQuestionDrop: (event: DragEvent<HTMLElement>, questionId: string) => void;
  handleQuestionDragOverPageBreak: (event: DragEvent<HTMLElement>, questionId: string) => void;
  handleQuestionDragLeavePageBreak: (event: DragEvent<HTMLElement>, questionId: string) => void;
  handleQuestionDropPageBreak: (event: DragEvent<HTMLElement>, questionId: string) => void;
  handleQuestionDragEnd: () => void;
  handlePageBreakDragStart: (event: DragEvent<HTMLElement>, questionId: string) => void;
  handlePageBreakDragOver: (event: DragEvent<HTMLElement>, questionId: string) => void;
  handlePageBreakDragLeave: (event: DragEvent<HTMLElement>, questionId: string) => void;
  handlePageBreakDrop: (event: DragEvent<HTMLElement>, questionId: string) => void;
  handlePageBreakDragEnd: () => void;
}

export interface DocumentNavigationWorkspaceProps {
  open: boolean;
  items: DocumentTocItem[];
  activeRailItemId: string;
  activeTocItemId: string;
  pageBreakQuestionIds: Set<string>;
  isNotesTemplate: boolean;
  dragState: DocumentNavigationState;
  navigation: DocumentNavigationActions;
  questionLifecycle: QuestionNavigationLifecycle;
  sectionHeadingLifecycle: SectionHeadingNavigationLifecycle;
  questionPageBreakDrag: QuestionPageBreakDragActions;
  onOpenChange: (open: boolean) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>, anchor: string, surface: "miniToc") => void;
}

export function DocumentNavigationWorkspace({
  open,
  items,
  activeRailItemId,
  activeTocItemId,
  pageBreakQuestionIds,
  isNotesTemplate,
  dragState,
  navigation,
  questionLifecycle,
  sectionHeadingLifecycle,
  questionPageBreakDrag,
  onOpenChange,
  onContextMenu,
}: DocumentNavigationWorkspaceProps) {
  const presentation = documentNavigationPresentationPlan({ open, isNotesTemplate });
  const handleContextMenu = (event: ReactMouseEvent<HTMLElement>, item: DocumentTocItem) =>
    onContextMenu(event, item.editorAnchor, presentation.contextMenuSurface);

  return (
    <>
      <DocumentNavigatorRail
        open={open}
        items={items}
        activeItemId={activeRailItemId}
        draggedQuestionId={dragState.draggedQuestionId}
        dragOverQuestion={dragState.dragOverQuestion}
        draggedPageBreakQuestionId={dragState.draggedPageBreakQuestionId}
        dragOverPageBreak={dragState.dragOverPageBreak}
        pageBreakQuestionIds={pageBreakQuestionIds}
        onToggle={() => onOpenChange(!open)}
        onJump={navigation.jumpToTocItem}
        onPreviewJump={navigation.jumpPreviewToTocItem}
        onContextMenu={handleContextMenu}
        onSelectPageBreak={navigation.selectPageBreakInRail}
        onToggleEditorAtItem={navigation.toggleEditorAtTocItem}
        onAddSectionHeading={sectionHeadingLifecycle.addSectionHeading}
        onAddQuestion={questionLifecycle.addQuestion}
        questionItemLabel={presentation.questionItemLabel}
        onAddPageBreakAfterQuestion={questionLifecycle.addPageBreakAfterQuestion}
        onMoveQuestion={questionPageBreakDrag.moveQuestionByKeyboard}
        onMoveSectionHeading={sectionHeadingLifecycle.moveSectionHeadingByKeyboard}
        onMovePageBreak={questionPageBreakDrag.movePageBreakByKeyboard}
        onDeleteQuestion={questionLifecycle.removeQuestion}
        onDeleteSectionHeading={sectionHeadingLifecycle.removeSectionHeading}
        onDeletePageBreak={questionLifecycle.removePageBreakAfterQuestion}
        onQuestionDragStart={questionPageBreakDrag.handleQuestionDragStart}
        onQuestionDragOver={questionPageBreakDrag.handleQuestionDragOver}
        onQuestionDragLeave={questionPageBreakDrag.handleQuestionDragLeave}
        onQuestionDrop={questionPageBreakDrag.handleQuestionDrop}
        onQuestionDragOverPageBreak={questionPageBreakDrag.handleQuestionDragOverPageBreak}
        onQuestionDragLeavePageBreak={questionPageBreakDrag.handleQuestionDragLeavePageBreak}
        onQuestionDropPageBreak={questionPageBreakDrag.handleQuestionDropPageBreak}
        onQuestionDragEnd={questionPageBreakDrag.handleQuestionDragEnd}
        onPageBreakDragStart={questionPageBreakDrag.handlePageBreakDragStart}
        onPageBreakDragOver={questionPageBreakDrag.handlePageBreakDragOver}
        onPageBreakDragLeave={questionPageBreakDrag.handlePageBreakDragLeave}
        onPageBreakDrop={questionPageBreakDrag.handlePageBreakDrop}
        onPageBreakDragEnd={questionPageBreakDrag.handlePageBreakDragEnd}
      />
      {presentation.showExpandedNavigator ? (
        <DocumentNavigator
          items={items}
          activeItemId={activeTocItemId}
          onJump={navigation.jumpToTocItem}
          onContextMenu={handleContextMenu}
        />
      ) : null}
    </>
  );
}
