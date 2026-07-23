import type { MutableRefObject } from "react";

import type { MoveDirection } from "@/lib/documentNavigation";
import type { DocumentFlowItem, DocumentSectionHeading, QuestionBlock } from "@/lib/editorDocumentNormalization";
import {
  type NormalizeDocumentFlow,
  plannedSectionHeadingAdd,
  plannedSectionHeadingMove,
  plannedSectionHeadingRemoval,
  updatedSectionHeadings,
} from "@/lib/editorSectionHeadings";

interface UseEditorSectionHeadingControllerOptions {
  activeRailItemId: string;
  activeTocItemId: string;
  questionsRef: MutableRefObject<QuestionBlock[]>;
  sectionHeadingsRef: MutableRefObject<DocumentSectionHeading[]>;
  documentFlowRef: MutableRefObject<DocumentFlowItem[]>;
  normalizeDocumentFlow: NormalizeDocumentFlow;
  createId: (prefix: string) => string;
  setSectionFlowWithHistory: (sectionHeadings: DocumentSectionHeading[], documentFlow: DocumentFlowItem[]) => void;
  setActiveTocItemId: (anchor: string) => void;
  setActiveRailItemId: (anchor: string) => void;
  setActiveQuestionId: (questionId: string) => void;
  revealEditorAnchor: (anchor: string) => void;
  queueDocumentJump: (editorAnchor: string, previewAnchor: string, options?: { preservePaneMode?: boolean }) => void;
}

export function useEditorSectionHeadingController({
  activeRailItemId,
  activeTocItemId,
  questionsRef,
  sectionHeadingsRef,
  documentFlowRef,
  normalizeDocumentFlow,
  createId,
  setSectionFlowWithHistory,
  setActiveTocItemId,
  setActiveRailItemId,
  setActiveQuestionId,
  revealEditorAnchor,
  queueDocumentJump,
}: UseEditorSectionHeadingControllerOptions) {
  function addSectionHeading() {
    const plan = plannedSectionHeadingAdd({
      headingId: createId("section"),
      anchor: activeRailItemId || activeTocItemId,
      documentFlow: documentFlowRef.current,
      questions: questionsRef.current,
      sectionHeadings: sectionHeadingsRef.current,
      normalizeDocumentFlow,
    });
    setSectionFlowWithHistory(plan.sectionHeadings, plan.documentFlow);
    setActiveTocItemId(plan.anchor);
    setActiveRailItemId(plan.anchor);
    revealEditorAnchor(plan.anchor);
    queueDocumentJump(plan.anchor, plan.anchor, { preservePaneMode: true });
  }

  function updateSectionHeading(sectionHeadingId: string, patch: string | Partial<DocumentSectionHeading>) {
    const nextHeadings = updatedSectionHeadings(sectionHeadingsRef.current, sectionHeadingId, patch);
    if (!nextHeadings) return;
    setSectionFlowWithHistory(nextHeadings, documentFlowRef.current);
  }

  function removeSectionHeading(sectionHeadingId: string) {
    const plan = plannedSectionHeadingRemoval({
      sectionHeadingId,
      documentFlow: documentFlowRef.current,
      questions: questionsRef.current,
      sectionHeadings: sectionHeadingsRef.current,
      normalizeDocumentFlow,
    });
    if (!plan) return;

    setSectionFlowWithHistory(plan.sectionHeadings, plan.documentFlow);
    setActiveTocItemId(plan.fallbackAnchor);
    setActiveRailItemId(plan.fallbackAnchor);
    if (plan.fallbackQuestionId) setActiveQuestionId(plan.fallbackQuestionId);
    queueDocumentJump(plan.fallbackAnchor, plan.fallbackAnchor, { preservePaneMode: true });
  }

  function moveSectionHeadingByKeyboard(sectionHeadingId: string, direction: MoveDirection) {
    const plan = plannedSectionHeadingMove({
      sectionHeadingId,
      direction,
      documentFlow: documentFlowRef.current,
      questions: questionsRef.current,
      sectionHeadings: sectionHeadingsRef.current,
      normalizeDocumentFlow,
    });
    if (!plan) return;

    setSectionFlowWithHistory(sectionHeadingsRef.current, plan.documentFlow);
    setActiveTocItemId(plan.anchor);
    setActiveRailItemId(plan.anchor);
    queueDocumentJump(plan.anchor, plan.anchor, { preservePaneMode: true });
  }

  return {
    addSectionHeading,
    updateSectionHeading,
    removeSectionHeading,
    moveSectionHeadingByKeyboard,
  };
}
