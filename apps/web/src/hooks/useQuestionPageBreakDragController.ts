import { useState, type Dispatch, type DragEvent, type SetStateAction } from "react";

import type { PageBreakDropPreview, QuestionDropPreview, MoveDirection } from "@/lib/documentNavigation";
import type { QuestionBlock } from "@/lib/editorDocumentNormalization";
import { pageBreakDropBoundaryQuestionId, questionDropIsNoop, questionsWithMovedPageBreak } from "@/lib/editorQuestionPageBreakDrag";
import type { MauthAction } from "@/lib/mauthActions";
import {
  PAGE_BREAK_DRAG_MIME,
  PAGE_BREAK_DRAG_TEXT_PREFIX,
  parsePageBreakDrag,
  type SubsectionDragTarget,
} from "@/lib/editorSubsectionDrag";
import { pageBreakScrollAnchor, questionScrollAnchor } from "@/lib/scrollAnchors";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type QuestionPlacement = QuestionDropPreview["placement"];

export function useQuestionPageBreakDragState() {
  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);
  const [dragOverQuestion, setDragOverQuestion] = useState<QuestionDropPreview | null>(null);
  const [draggedPageBreakQuestionId, setDraggedPageBreakQuestionId] = useState<string | null>(null);
  const [dragOverPageBreak, setDragOverPageBreak] = useState<PageBreakDropPreview | null>(null);

  function clearQuestionPageBreakDrag() {
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
  }

  return {
    draggedQuestionId,
    setDraggedQuestionId,
    dragOverQuestion,
    setDragOverQuestion,
    draggedPageBreakQuestionId,
    setDraggedPageBreakQuestionId,
    dragOverPageBreak,
    setDragOverPageBreak,
    clearQuestionPageBreakDrag,
  };
}

interface UseQuestionPageBreakDragControllerOptions {
  questions: QuestionBlock[];
  pageBreakQuestionIds: Set<string>;
  draggedQuestionId: string | null;
  setDraggedQuestionId: StateSetter<string | null>;
  dragOverQuestion: QuestionDropPreview | null;
  setDragOverQuestion: StateSetter<QuestionDropPreview | null>;
  draggedPageBreakQuestionId: string | null;
  setDraggedPageBreakQuestionId: StateSetter<string | null>;
  dragOverPageBreak: PageBreakDropPreview | null;
  setDragOverPageBreak: StateSetter<PageBreakDropPreview | null>;
  applyEditorAction: (action: MauthAction) => void;
  setQuestionsWithHistory: (updater: QuestionBlock[] | ((current: QuestionBlock[]) => QuestionBlock[])) => void;
  readSubsectionDrag: (event: DragEvent<HTMLElement>) => SubsectionDragTarget | null;
  dragPlacementFromEvent: (event: DragEvent<HTMLElement>) => QuestionPlacement;
  setModuleDragImage: (event: DragEvent<HTMLElement>) => void;
  clearNestedEditorDrag: () => void;
  selectQuestionInEditor: (questionId: string) => void;
  setActiveTocItemId: (anchor: string) => void;
  setActiveRailItemId: (anchor: string) => void;
  queueDocumentJump: (editorAnchor: string, previewAnchor: string, options?: { preservePaneMode?: boolean }) => void;
  clearPendingDocumentJumps: () => void;
}

export function useQuestionPageBreakDragController({
  questions,
  pageBreakQuestionIds,
  draggedQuestionId,
  setDraggedQuestionId,
  dragOverQuestion,
  setDragOverQuestion,
  draggedPageBreakQuestionId,
  setDraggedPageBreakQuestionId,
  dragOverPageBreak,
  setDragOverPageBreak,
  applyEditorAction,
  setQuestionsWithHistory,
  readSubsectionDrag,
  dragPlacementFromEvent,
  setModuleDragImage,
  clearNestedEditorDrag,
  selectQuestionInEditor,
  setActiveTocItemId,
  setActiveRailItemId,
  queueDocumentJump,
  clearPendingDocumentJumps,
}: UseQuestionPageBreakDragControllerOptions) {
  function reorderQuestion(draggedId: string, targetId: string, placement: QuestionPlacement) {
    if (draggedId === targetId) return;
    applyEditorAction({ type: "question.reorder", questionId: draggedId, targetQuestionId: targetId, placement });
  }

  function focusMovedQuestion(questionId: string) {
    const anchor = questionScrollAnchor(questionId);
    selectQuestionInEditor(questionId);
    setActiveTocItemId(anchor);
    setActiveRailItemId(anchor);
    queueDocumentJump(anchor, anchor, { preservePaneMode: true });
  }

  function moveQuestionByKeyboard(questionId: string, direction: MoveDirection) {
    const sourceIndex = questions.findIndex((question) => question.id === questionId);
    const targetQuestion = questions[sourceIndex + direction];
    if (sourceIndex === -1 || !targetQuestion) return;
    reorderQuestion(questionId, targetQuestion.id, direction < 0 ? "before" : "after");
    focusMovedQuestion(questionId);
  }

  function movePageBreakAfterQuestion(sourceQuestionId: string, targetQuestionId: string) {
    if (!sourceQuestionId || !targetQuestionId || sourceQuestionId === targetQuestionId) return;
    setQuestionsWithHistory((current) => questionsWithMovedPageBreak(current, sourceQuestionId, targetQuestionId));
  }

  function focusMovedPageBreak(targetQuestionId: string) {
    setActiveRailItemId(pageBreakScrollAnchor(targetQuestionId));
    clearPendingDocumentJumps();
  }

  function movePageBreakByKeyboard(questionId: string, direction: MoveDirection) {
    if (!pageBreakQuestionIds.has(questionId)) return;
    const sourceIndex = questions.findIndex((question) => question.id === questionId);
    const targetQuestion = questions[sourceIndex + direction];
    if (sourceIndex === -1 || !targetQuestion || pageBreakQuestionIds.has(targetQuestion.id)) return;
    movePageBreakAfterQuestion(questionId, targetQuestion.id);
    focusMovedPageBreak(targetQuestion.id);
  }

  function readPageBreakDrag(event: DragEvent<HTMLElement>) {
    return (
      draggedPageBreakQuestionId ||
      parsePageBreakDrag(event.dataTransfer.getData(PAGE_BREAK_DRAG_MIME), true) ||
      parsePageBreakDrag(event.dataTransfer.getData("text/plain"))
    );
  }

  function clearQuestionDragState() {
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
  }

  function handleQuestionDragStart(event: DragEvent<HTMLElement>, questionId: string) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", questionId);
    setModuleDragImage(event);
    clearQuestionDragState();
    clearNestedEditorDrag();
    setDraggedQuestionId(questionId);
  }

  function handleQuestionDragOver(event: DragEvent<HTMLElement>, questionId: string) {
    if (readSubsectionDrag(event) || readPageBreakDrag(event)) return;
    const activeQuestionId = draggedQuestionId || event.dataTransfer.getData("text/plain");
    const placement = dragPlacementFromEvent(event);
    if (!activeQuestionId || questionDropIsNoop(questions, activeQuestionId, questionId, placement)) {
      setDragOverQuestion((current) => (current?.questionId === questionId ? null : current));
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverQuestion({ questionId, placement, surface: "question" });
  }

  function handleQuestionDragLeave(event: DragEvent<HTMLElement>, questionId: string) {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragOverQuestion((current) => (current?.questionId === questionId ? null : current));
  }

  function handleQuestionDrop(event: DragEvent<HTMLElement>, questionId: string) {
    if (readSubsectionDrag(event) || readPageBreakDrag(event)) return;
    event.preventDefault();
    const activeQuestionId = draggedQuestionId || event.dataTransfer.getData("text/plain");
    const placement = dragOverQuestion?.questionId === questionId ? dragOverQuestion.placement : dragPlacementFromEvent(event);
    clearQuestionDragState();
    if (!activeQuestionId || !questions.some((question) => question.id === activeQuestionId)) return;
    if (questionDropIsNoop(questions, activeQuestionId, questionId, placement)) return;
    reorderQuestion(activeQuestionId, questionId, placement);
    focusMovedQuestion(activeQuestionId);
  }

  function handleQuestionDragOverPageBreak(event: DragEvent<HTMLElement>, questionId: string) {
    if (readSubsectionDrag(event) || readPageBreakDrag(event)) return;
    const activeQuestionId = draggedQuestionId || event.dataTransfer.getData("text/plain");
    if (!activeQuestionId || activeQuestionId === questionId || !questions.some((question) => question.id === activeQuestionId)) {
      setDragOverQuestion((current) => (current?.questionId === questionId && current.surface === "pageBreakBoundary" ? null : current));
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverQuestion({ questionId, placement: "after", surface: "pageBreakBoundary" });
  }

  function handleQuestionDragLeavePageBreak(event: DragEvent<HTMLElement>, questionId: string) {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragOverQuestion((current) => (current?.questionId === questionId && current.surface === "pageBreakBoundary" ? null : current));
  }

  function handleQuestionDropPageBreak(event: DragEvent<HTMLElement>, questionId: string) {
    if (readSubsectionDrag(event) || readPageBreakDrag(event)) return;
    const activeQuestionId = draggedQuestionId || event.dataTransfer.getData("text/plain");
    if (!activeQuestionId || activeQuestionId === questionId || !questions.some((question) => question.id === activeQuestionId)) return;
    event.preventDefault();
    clearQuestionDragState();
    reorderQuestion(activeQuestionId, questionId, "after");
    movePageBreakAfterQuestion(questionId, activeQuestionId);
    focusMovedQuestion(activeQuestionId);
  }

  function handleQuestionDragEnd() {
    clearQuestionDragState();
    clearNestedEditorDrag();
  }

  function handlePageBreakDragStart(event: DragEvent<HTMLElement>, questionId: string) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${PAGE_BREAK_DRAG_TEXT_PREFIX}${questionId}`);
    try {
      event.dataTransfer.setData(PAGE_BREAK_DRAG_MIME, questionId);
    } catch {
      // The prefixed text/plain payload above is the cross-browser fallback.
    }
    setModuleDragImage(event);
    clearQuestionDragState();
    clearNestedEditorDrag();
    setDraggedPageBreakQuestionId(questionId);
  }

  function handlePageBreakDragOver(event: DragEvent<HTMLElement>, questionId: string) {
    const sourceQuestionId = readPageBreakDrag(event);
    if (!sourceQuestionId) return;
    const placement = dragPlacementFromEvent(event);
    const targetQuestionId = pageBreakDropBoundaryQuestionId(questions, questionId, placement);
    if (!targetQuestionId || targetQuestionId === sourceQuestionId || pageBreakQuestionIds.has(targetQuestionId)) {
      setDragOverPageBreak((current) => (current?.questionId === questionId ? null : current));
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverPageBreak({ questionId, placement });
  }

  function handlePageBreakDragLeave(event: DragEvent<HTMLElement>, questionId: string) {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragOverPageBreak((current) => (current?.questionId === questionId ? null : current));
  }

  function handlePageBreakDrop(event: DragEvent<HTMLElement>, questionId: string) {
    const sourceQuestionId = readPageBreakDrag(event);
    if (!sourceQuestionId) return;
    event.preventDefault();
    const placement = dragOverPageBreak?.questionId === questionId ? dragOverPageBreak.placement : dragPlacementFromEvent(event);
    const targetQuestionId = pageBreakDropBoundaryQuestionId(questions, questionId, placement);
    clearQuestionDragState();
    clearNestedEditorDrag();
    if (!targetQuestionId || targetQuestionId === sourceQuestionId || pageBreakQuestionIds.has(targetQuestionId)) return;
    movePageBreakAfterQuestion(sourceQuestionId, targetQuestionId);
    focusMovedPageBreak(targetQuestionId);
  }

  function handlePageBreakDragEnd() {
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    clearNestedEditorDrag();
  }

  return {
    moveQuestionByKeyboard,
    movePageBreakByKeyboard,
    handleQuestionDragStart,
    handleQuestionDragOver,
    handleQuestionDragLeave,
    handleQuestionDrop,
    handleQuestionDragOverPageBreak,
    handleQuestionDragLeavePageBreak,
    handleQuestionDropPageBreak,
    handleQuestionDragEnd,
    handlePageBreakDragStart,
    handlePageBreakDragOver,
    handlePageBreakDragLeave,
    handlePageBreakDrop,
    handlePageBreakDragEnd,
  };
}
