import { useEffect, useMemo } from "react";

interface UseEditorSelectionControllerOptions<
  TQuestion extends { id: string },
  TSectionHeading extends { id: string },
  TFlowItem,
  TSelected,
> {
  questions: TQuestion[];
  sectionHeadings: TSectionHeading[];
  documentFlow: TFlowItem[];
  activeQuestionId: string;
  setActiveQuestionId: (questionId: string) => void;
  activeTocItemId: string;
  setActiveTocItemId: (anchor: string) => void;
  setActiveRailItemId: (anchor: string) => void;
  showInspectorPane: boolean;
  frontMatterAnchor: string;
  questionScrollAnchor: (questionId: string) => string;
  sectionHeadingIdFromScrollAnchor: (anchor: string) => string;
  pageBreakQuestionIdFromScrollAnchor: (anchor: string) => string;
  selectedEditorBlockFromAnchor: (questions: TQuestion[], anchor: string) => TSelected | null;
  questionHasPageBreak: (question: TQuestion) => boolean;
  existingOrFirstQuestionId: (questions: TQuestion[], preferredQuestionId: string) => string;
  normalizeDocumentFlow: (flow: TFlowItem[], questions: TQuestion[], sectionHeadings: TSectionHeading[]) => TFlowItem[];
  firstDocumentFlowAnchor: (flow: TFlowItem[], questions: TQuestion[]) => string;
}

export function useEditorSelectionController<
  TQuestion extends { id: string },
  TSectionHeading extends { id: string },
  TFlowItem,
  TSelected,
>({
  questions,
  sectionHeadings,
  documentFlow,
  activeQuestionId,
  setActiveQuestionId,
  activeTocItemId,
  setActiveTocItemId,
  setActiveRailItemId,
  showInspectorPane,
  frontMatterAnchor,
  questionScrollAnchor,
  sectionHeadingIdFromScrollAnchor,
  pageBreakQuestionIdFromScrollAnchor,
  selectedEditorBlockFromAnchor,
  questionHasPageBreak,
  existingOrFirstQuestionId,
  normalizeDocumentFlow,
  firstDocumentFlowAnchor,
}: UseEditorSelectionControllerOptions<TQuestion, TSectionHeading, TFlowItem, TSelected>) {
  const activeQuestion = questions.find((question) => question.id === activeQuestionId) ?? null;
  const activeSectionHeadingId = sectionHeadingIdFromScrollAnchor(activeTocItemId);
  const activeSectionHeading = sectionHeadings.find((heading) => heading.id === activeSectionHeadingId) ?? null;
  const editingSectionHeading = Boolean(activeSectionHeading);
  const editingFrontMatter = activeTocItemId === frontMatterAnchor;
  const pageBreakQuestionIds = useMemo(
    () => new Set(questions.filter(questionHasPageBreak).map((question) => question.id)),
    [questionHasPageBreak, questions],
  );
  const activePageBreakQuestionId = pageBreakQuestionIdFromScrollAnchor(activeTocItemId);
  const activePageBreakQuestion = questions.find((question) => question.id === activePageBreakQuestionId) ?? null;
  const editingPageBreak = Boolean(activePageBreakQuestion && questionHasPageBreak(activePageBreakQuestion));
  const selectedEditorBlock = useMemo(
    () => selectedEditorBlockFromAnchor(questions, activeTocItemId),
    [activeTocItemId, questions, selectedEditorBlockFromAnchor],
  );
  const selectionInspectorVisible =
    showInspectorPane && !editingFrontMatter && !editingPageBreak && !editingSectionHeading && Boolean(selectedEditorBlock);

  useEffect(() => {
    if (!questions.length) {
      setActiveQuestionId("");
      setActiveTocItemId(frontMatterAnchor);
      setActiveRailItemId(frontMatterAnchor);
      return;
    }

    if (activeSectionHeadingId) {
      if (sectionHeadings.some((heading) => heading.id === activeSectionHeadingId)) return;
      const fallbackAnchor = firstDocumentFlowAnchor(normalizeDocumentFlow(documentFlow, questions, sectionHeadings), questions);
      setActiveTocItemId(fallbackAnchor);
      setActiveRailItemId(fallbackAnchor);
      return;
    }

    if (activePageBreakQuestionId) {
      const fallbackQuestion = questions.find((question) => question.id === activePageBreakQuestionId) ?? questions[0];
      const fallbackAnchor = questionScrollAnchor(fallbackQuestion.id);
      setActiveQuestionId(fallbackQuestion.id);
      setActiveTocItemId(fallbackAnchor);
      return;
    }

    const nextActiveQuestionId = existingOrFirstQuestionId(questions, activeQuestionId);
    if (nextActiveQuestionId !== activeQuestionId) {
      const nextAnchor = questionScrollAnchor(nextActiveQuestionId);
      setActiveQuestionId(nextActiveQuestionId);
      setActiveTocItemId(nextAnchor);
      setActiveRailItemId(nextAnchor);
    }
  }, [
    activePageBreakQuestionId,
    activeQuestionId,
    activeSectionHeadingId,
    documentFlow,
    existingOrFirstQuestionId,
    firstDocumentFlowAnchor,
    frontMatterAnchor,
    normalizeDocumentFlow,
    questionScrollAnchor,
    questions,
    sectionHeadings,
    setActiveQuestionId,
    setActiveRailItemId,
    setActiveTocItemId,
  ]);

  return {
    activeQuestion,
    activeSectionHeadingId,
    activeSectionHeading,
    editingSectionHeading,
    editingFrontMatter,
    pageBreakQuestionIds,
    activePageBreakQuestionId,
    activePageBreakQuestion,
    editingPageBreak,
    selectedEditorBlock,
    selectionInspectorVisible,
  };
}
