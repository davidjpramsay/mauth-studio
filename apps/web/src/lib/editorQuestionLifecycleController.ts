import type { QuestionBlock } from "./editorDocumentNormalization.ts";
import {
  createQuestionForTemplate,
  fallbackQuestionForDelete,
  nextActiveQuestionAfterDelete,
  questionAddActionsForTemplate,
  questionHasPageBreak,
  type QuestionFactoryRuntime,
  type QuestionLifecycleTemplate,
} from "./editorQuestionLifecycle.ts";
import type { MauthAction } from "./mauthActions.ts";
import { pageBreakScrollAnchor, questionScrollAnchor } from "./scrollAnchors.ts";

interface ActionResult {
  ok: boolean;
  questions: QuestionBlock[];
}

interface ActionBatchResult {
  ok: boolean;
}

interface CurrentValueRef<T> {
  current: T;
}

interface CreateEditorQuestionLifecycleControllerOptions {
  questions: QuestionBlock[];
  activeQuestionId: string;
  activeTocItemId: string;
  activeRailItemId: string;
  frontMatterRef: CurrentValueRef<QuestionLifecycleTemplate>;
  questionFactory: QuestionFactoryRuntime;
  applyAction: (action: MauthAction) => ActionResult;
  applyActions: (actions: MauthAction[]) => ActionBatchResult;
  selectQuestion: (questionId: string) => void;
  setActiveTocItem: (anchor: string) => void;
  setActiveRailItem: (anchor: string) => void;
  queueDocumentJump: (editorAnchor: string, previewAnchor: string) => void;
  clearPendingDocumentJumps: () => void;
}

export function createEditorQuestionLifecycleController({
  questions,
  activeQuestionId,
  activeTocItemId,
  activeRailItemId,
  frontMatterRef,
  questionFactory,
  applyAction,
  applyActions,
  selectQuestion,
  setActiveTocItem,
  setActiveRailItem,
  queueDocumentJump,
  clearPendingDocumentJumps,
}: CreateEditorQuestionLifecycleControllerOptions) {
  function focusQuestion(questionId: string, jump = false) {
    const anchor = questionScrollAnchor(questionId);
    selectQuestion(questionId);
    setActiveTocItem(anchor);
    setActiveRailItem(anchor);
    if (jump) queueDocumentJump(anchor, anchor);
  }

  function addQuestion() {
    const question = createQuestionForTemplate(frontMatterRef.current, questionFactory);
    const actions = questionAddActionsForTemplate({ template: frontMatterRef.current, questions, question });
    const result = applyActions(actions);
    if (!result.ok) return;
    focusQuestion(question.id, true);
  }

  function addPageBreakAfterQuestion(questionId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question || questionHasPageBreak(question)) return;
    const anchor = pageBreakScrollAnchor(question.id);
    applyAction({ type: "pageBreak.set", target: { kind: "question", questionId: question.id }, enabled: true });
    setActiveRailItem(anchor);
    clearPendingDocumentJumps();
  }

  function removePageBreakAfterQuestion(questionId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    const pageBreakAnchor = pageBreakScrollAnchor(question.id);
    const wasActivePageBreak = activeTocItemId === pageBreakAnchor;
    const wasActiveRailPageBreak = activeRailItemId === pageBreakAnchor;
    applyAction({ type: "pageBreak.set", target: { kind: "question", questionId: question.id }, enabled: false });
    if (wasActiveRailPageBreak) setActiveRailItem(questionScrollAnchor(question.id));
    if (wasActivePageBreak) focusQuestion(question.id, true);
  }

  function removeQuestion(questionId: string) {
    const removedIndex = questions.findIndex((question) => question.id === questionId);
    const fallbackQuestion = fallbackQuestionForDelete({
      template: frontMatterRef.current,
      questions,
      runtime: questionFactory,
    });
    const result = applyAction({ type: "question.delete", questionId, fallbackQuestion });
    if (!result.ok) return;
    const nextActiveQuestion = nextActiveQuestionAfterDelete({
      nextQuestions: result.questions,
      removedQuestionId: questionId,
      removedIndex,
      activeQuestionId,
    });
    if (nextActiveQuestion) focusQuestion(nextActiveQuestion.id);
  }

  return {
    addQuestion,
    addPageBreakAfterQuestion,
    removePageBreakAfterQuestion,
    removeQuestion,
  };
}
