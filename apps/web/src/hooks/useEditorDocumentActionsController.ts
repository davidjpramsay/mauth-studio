import {
  applyMauthAction,
  applyMauthActions,
  applyMauthDocumentAction,
  applyMauthDocumentActions,
  previewMauthDocumentActions,
  type MauthAction,
  type MauthActionResult,
  type MauthDocumentAction,
  type MauthDocumentActionOptions,
  type MauthDocumentActionResult,
  type MauthDocumentLike,
  type MauthPartLike,
  type MauthQuestionLike,
} from "@/lib/mauthActions";

interface UseEditorDocumentActionsControllerOptions<
  Q extends MauthQuestionLike,
  F extends object,
  C extends object,
  D extends MauthDocumentLike<Q, F, C> = MauthDocumentLike<Q, F, C>,
> {
  currentQuestions: () => Q[];
  currentDocument: () => D;
  currentTitlePageTemplate: () => unknown;
  titlePageTemplateFromValue: (value: unknown) => unknown;
  normalizeQuestion: (question: Q) => Q;
  normalizePart: (part: MauthPartLike) => MauthPartLike;
  normalizeFrontMatter: (frontMatter: F) => F;
  normalizeFormattingConfig: (formattingConfig: C | undefined) => C;
  validateSolutions: (questions: Q[]) => unknown;
  validateDocument: (document: MauthDocumentLike<Q, F, C>) => unknown;
  setQuestionsWithHistory: (questions: Q[]) => void;
  setDocumentWithHistory: (document: MauthDocumentLike<Q, F, C>) => void;
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function useEditorDocumentActionsController<
  Q extends MauthQuestionLike,
  F extends object,
  C extends object,
  D extends MauthDocumentLike<Q, F, C> = MauthDocumentLike<Q, F, C>,
>({
  currentQuestions,
  currentDocument,
  currentTitlePageTemplate,
  titlePageTemplateFromValue,
  normalizeQuestion,
  normalizePart,
  normalizeFrontMatter,
  normalizeFormattingConfig,
  validateSolutions,
  validateDocument,
  setQuestionsWithHistory,
  setDocumentWithHistory,
}: UseEditorDocumentActionsControllerOptions<Q, F, C, D>) {
  function documentActionChangesTitlePageTemplate(action: MauthDocumentAction) {
    const currentTemplate = currentTitlePageTemplate();
    if (action.type === "frontMatter.update") {
      const patch = recordFromUnknown(action.patch);
      if (!patch || !Object.prototype.hasOwnProperty.call(patch, "titlePageTemplate")) return false;
      return titlePageTemplateFromValue(patch.titlePageTemplate) !== currentTemplate;
    }

    if (action.type === "frontMatter.replace") {
      const replacement = recordFromUnknown(action.frontMatter);
      if (!replacement || !Object.prototype.hasOwnProperty.call(replacement, "titlePageTemplate")) return currentTemplate !== "standard";
      return titlePageTemplateFromValue(replacement.titlePageTemplate) !== currentTemplate;
    }

    return false;
  }

  function templateLockedDocumentActionResult(
    actions: readonly MauthDocumentAction[],
    actionType: MauthDocumentAction | "batch",
  ): MauthDocumentActionResult<Q, F, C> | null {
    const blockedAction = actions.find(documentActionChangesTitlePageTemplate);
    if (!blockedAction) return null;

    const document = currentDocument();
    const message = "Document template cannot be changed after creation. Create a new document from the desired template instead.";
    return {
      ok: false,
      actionType: actionType === "batch" ? "batch" : actionType.type,
      document,
      questions: document.questions,
      changedIds: [],
      warnings: [{ code: "template-locked", message, targetId: "frontMatter.titlePageTemplate" }],
      error: message,
      appliedActionTypes: [blockedAction.type],
    };
  }

  function editorDocumentActionOptions(): Omit<MauthDocumentActionOptions<Q, F, C>, "dryRun"> {
    return {
      normalizeQuestion,
      normalizePart,
      normalizeFrontMatter,
      normalizeFormattingConfig,
      validateSolutions,
      validateDocument,
    };
  }

  function applyEditorAction(action: MauthAction): MauthActionResult<Q> {
    const result = applyMauthAction<Q>(currentQuestions(), action, {
      normalizeQuestion,
      normalizePart,
      validateSolutions,
    });
    if (result.ok && result.changedIds.length) {
      setQuestionsWithHistory(result.questions);
    }
    return result;
  }

  function applyEditorDocumentAction(action: MauthDocumentAction): MauthDocumentActionResult<Q, F, C> {
    const lockedResult = templateLockedDocumentActionResult([action], action);
    if (lockedResult) return lockedResult;

    const result = applyMauthDocumentAction<Q, F, C>(currentDocument(), action, editorDocumentActionOptions());
    if (result.ok && result.changedIds.length) {
      setDocumentWithHistory(result.document);
    }
    return result;
  }

  function previewEditorDocumentActions(actions: MauthDocumentAction[]): MauthDocumentActionResult<Q, F, C> {
    const lockedResult = templateLockedDocumentActionResult(actions, "batch");
    if (lockedResult) return lockedResult;

    return previewMauthDocumentActions<Q, F, C>(currentDocument(), actions, editorDocumentActionOptions());
  }

  function evaluateEditorDocumentActions(actions: MauthDocumentAction[]): MauthDocumentActionResult<Q, F, C> {
    const lockedResult = templateLockedDocumentActionResult(actions, "batch");
    if (lockedResult) return lockedResult;

    return applyMauthDocumentActions<Q, F, C>(currentDocument(), actions, editorDocumentActionOptions());
  }

  function applyEditorDocumentActions(actions: MauthDocumentAction[]): MauthDocumentActionResult<Q, F, C> {
    const result = evaluateEditorDocumentActions(actions);
    if (result.ok && result.changedIds.length) {
      setDocumentWithHistory(result.document);
    }
    return result;
  }

  function applyEditorActions(actions: MauthAction[]): MauthActionResult<Q> {
    const result = applyMauthActions<Q>(currentQuestions(), actions, {
      normalizeQuestion,
      normalizePart,
      validateSolutions,
    });
    if (result.ok && result.changedIds.length) {
      setQuestionsWithHistory(result.questions);
    }
    return result;
  }

  return {
    applyEditorAction,
    applyEditorActions,
    applyEditorDocumentAction,
    previewEditorDocumentActions,
    evaluateEditorDocumentActions,
    applyEditorDocumentActions,
  };
}
