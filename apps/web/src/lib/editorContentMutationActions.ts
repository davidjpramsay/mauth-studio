import type { ContentBlockVisibility } from "@mauth-studio/shared";

import type { SelectedEditorBlock } from "./editorBlockSelection.ts";
import type { EditorContentBlock, EditorPart, EditorSubpart, QuestionBlock } from "./editorDocumentNormalization.ts";
import { moduleDeletionAction, moduleInsertionPlan } from "./editorModuleLifecycle.ts";
import { partPageBreakInsertTarget, subpartPageBreakInsertTarget } from "./editorPageBreakLifecycle.ts";
import { createBlankEditorPart, createBlankEditorSubpart } from "./editorQuestionLifecycle.ts";
import type { MauthAction, MauthActionResult, MauthContentScope } from "./mauthActions.ts";
import type { PreviewGraphConfigChange } from "./editorPreviewSegments.ts";
import { partScrollAnchor, subpartScrollAnchor } from "./scrollAnchors.ts";
import type { SolutionInsertionBlockKind } from "./solutionBlockVisibility.ts";
import type { EditorPageBreakTarget } from "./editorSubsectionDrag.ts";

interface EditorContentMutationRuntime {
  questions: QuestionBlock[];
  activeAnchor: string;
  createId: (prefix: string) => string;
  insertedBlockVisibilityForKind: (kind: SolutionInsertionBlockKind) => ContentBlockVisibility | undefined;
  contentBlockForKind: (kind: SolutionInsertionBlockKind, visibility?: ContentBlockVisibility) => EditorContentBlock;
  diagramBlockForType: (type: string, visibility?: ContentBlockVisibility) => EditorContentBlock;
  applyAction: (action: MauthAction) => Pick<MauthActionResult<QuestionBlock>, "ok">;
  activateAnchor: (anchor: string) => void;
  revealAnchor: (anchor: string) => void;
  editorPageBreakDestinationHasBreak: (target: EditorPageBreakTarget) => boolean;
  setEditorPageBreak: (target: EditorPageBreakTarget, enabled: boolean) => void;
}

export function createEditorContentMutationActions({
  questions,
  activeAnchor,
  createId,
  insertedBlockVisibilityForKind,
  contentBlockForKind,
  diagramBlockForType,
  applyAction,
  activateAnchor,
  revealAnchor,
  editorPageBreakDestinationHasBreak,
  setEditorPageBreak,
}: EditorContentMutationRuntime) {
  function updateQuestion(questionId: string, patch: Partial<QuestionBlock>) {
    applyAction({ type: "question.update", questionId, patch: patch as Record<string, unknown> });
  }

  function updateContentBlock(questionId: string, blockId: string, patch: Partial<EditorContentBlock>) {
    applyAction({
      type: "module.update",
      scope: { kind: "question", questionId },
      blockId,
      patch: patch as Record<string, unknown>,
    });
  }

  function updatePart(questionId: string, partId: string, patch: Partial<EditorPart>) {
    applyAction({
      type: "part.update",
      questionId,
      partId,
      patch: patch as Record<string, unknown>,
    });
  }

  function updatePartContentBlock(questionId: string, partId: string, blockId: string, patch: Partial<EditorContentBlock>) {
    applyAction({
      type: "module.update",
      scope: { kind: "part", questionId, partId },
      blockId,
      patch: patch as Record<string, unknown>,
    });
  }

  function updateSubpart(questionId: string, partId: string, subpartId: string, patch: Partial<EditorSubpart>) {
    applyAction({
      type: "subpart.update",
      questionId,
      partId,
      subpartId,
      patch: patch as Record<string, unknown>,
    });
  }

  function updateSubpartContentBlock(
    questionId: string,
    partId: string,
    subpartId: string,
    blockId: string,
    patch: Partial<EditorContentBlock>,
  ) {
    applyAction({
      type: "module.update",
      scope: { kind: "subpart", questionId, partId, subpartId },
      blockId,
      patch: patch as Record<string, unknown>,
    });
  }

  function updateSelectedBlock(selection: SelectedEditorBlock, patch: Partial<EditorContentBlock>) {
    const scope = selection.scope.kind === "column" ? selection.scope.rootScope : selection.scope;
    applyAction({
      type: "module.update",
      scope,
      blockId: selection.block.id,
      patch: patch as Record<string, unknown>,
    });
  }

  function updatePreviewGraphConfig(change: PreviewGraphConfigChange) {
    if (change.partId && change.subpartId) {
      updateSubpartContentBlock(change.questionId, change.partId, change.subpartId, change.blockId, {
        graphConfig: change.graphConfig,
      });
      return;
    }

    if (change.partId) {
      updatePartContentBlock(change.questionId, change.partId, change.blockId, { graphConfig: change.graphConfig });
      return;
    }

    updateContentBlock(change.questionId, change.blockId, { graphConfig: change.graphConfig });
  }

  function insertEditorModule(scope: MauthContentScope, block: EditorContentBlock) {
    const plan = moduleInsertionPlan(scope, block);
    const result = applyAction(plan.action);
    if (!result.ok) return;
    activateAnchor(plan.anchor);
    revealAnchor(plan.anchor);
  }

  function addQuestionBlock(questionId: string, kind: SolutionInsertionBlockKind, visibility = insertedBlockVisibilityForKind(kind)) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    insertEditorModule({ kind: "question", questionId: question.id }, contentBlockForKind(kind, visibility));
  }

  function addQuestionDiagramBlock(questionId: string, type: string, visibility = insertedBlockVisibilityForKind("diagram")) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    insertEditorModule({ kind: "question", questionId: question.id }, diagramBlockForType(type, visibility));
  }

  function removeQuestionBlock(questionId: string, blockId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    applyAction(moduleDeletionAction({ kind: "question", questionId: question.id }, blockId));
  }

  function addPart(questionId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    applyAction({ type: "part.add", questionId: question.id, part: createBlankEditorPart(createId) });
  }

  function addPartPageBreak(questionId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    const target = partPageBreakInsertTarget({
      question,
      activeAnchor,
      hasBreak: editorPageBreakDestinationHasBreak,
    });
    if (!target) return;
    setEditorPageBreak(target, true);
    revealAnchor(partScrollAnchor(question.id, target.partId));
  }

  function removePart(questionId: string, partId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    applyAction({ type: "part.delete", questionId: question.id, partId });
  }

  function addSubpart(questionId: string, part: EditorPart) {
    const subpart = createBlankEditorSubpart(createId, part.subparts.length);
    applyAction({ type: "subpart.add", questionId, partId: part.id, subpart });
  }

  function addSubpartPageBreak(questionId: string, part: EditorPart) {
    const target = subpartPageBreakInsertTarget({
      questionId,
      part,
      activeAnchor,
      hasBreak: editorPageBreakDestinationHasBreak,
    });
    if (!target) return;
    setEditorPageBreak(target, true);
    revealAnchor(subpartScrollAnchor(questionId, part.id, target.subpartId));
  }

  function removeSubpart(questionId: string, part: EditorPart, subpartId: string) {
    applyAction({ type: "subpart.delete", questionId, partId: part.id, subpartId });
  }

  function addPartBlock(
    questionId: string,
    part: EditorPart,
    kind: SolutionInsertionBlockKind,
    visibility = insertedBlockVisibilityForKind(kind),
  ) {
    insertEditorModule({ kind: "part", questionId, partId: part.id }, contentBlockForKind(kind, visibility));
  }

  function addPartDiagramBlock(questionId: string, part: EditorPart, type: string, visibility = insertedBlockVisibilityForKind("diagram")) {
    insertEditorModule({ kind: "part", questionId, partId: part.id }, diagramBlockForType(type, visibility));
  }

  function removePartBlock(questionId: string, part: EditorPart, blockId: string) {
    applyAction(moduleDeletionAction({ kind: "part", questionId, partId: part.id }, blockId));
  }

  function addSubpartBlock(
    questionId: string,
    part: EditorPart,
    subpart: EditorSubpart,
    kind: SolutionInsertionBlockKind,
    visibility = insertedBlockVisibilityForKind(kind),
  ) {
    insertEditorModule({ kind: "subpart", questionId, partId: part.id, subpartId: subpart.id }, contentBlockForKind(kind, visibility));
  }

  function addSubpartDiagramBlock(
    questionId: string,
    part: EditorPart,
    subpart: EditorSubpart,
    type: string,
    visibility = insertedBlockVisibilityForKind("diagram"),
  ) {
    insertEditorModule({ kind: "subpart", questionId, partId: part.id, subpartId: subpart.id }, diagramBlockForType(type, visibility));
  }

  function removeSubpartBlock(questionId: string, part: EditorPart, subpart: EditorSubpart, blockId: string) {
    applyAction(moduleDeletionAction({ kind: "subpart", questionId, partId: part.id, subpartId: subpart.id }, blockId));
  }

  return {
    updateQuestion,
    updateContentBlock,
    updatePart,
    updatePartContentBlock,
    updateSubpart,
    updateSubpartContentBlock,
    updateSelectedBlock,
    updatePreviewGraphConfig,
    addQuestionBlock,
    addQuestionDiagramBlock,
    removeQuestionBlock,
    addPart,
    addPartPageBreak,
    removePart,
    addSubpart,
    addSubpartPageBreak,
    removeSubpart,
    addPartBlock,
    addPartDiagramBlock,
    removePartBlock,
    addSubpartBlock,
    addSubpartDiagramBlock,
    removeSubpartBlock,
  };
}
