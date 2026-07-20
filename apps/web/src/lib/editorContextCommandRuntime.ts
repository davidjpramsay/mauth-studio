import type { MoveDirection } from "./documentNavigation.ts";
import {
  canDeleteAnchorTarget,
  canMoveAnchorTarget as canMoveEditorAnchorTarget,
  subsectionTargetFromParsed,
} from "./editorAnchorActions.ts";
import type { EditorColumnBlockContext, EditorRootBlockContext } from "./editorBlockContexts.ts";
import type { EditorColumnBlockPath } from "./editorDocumentDuplication.ts";
import type {
  DocumentFlowItem,
  DocumentSectionHeading,
  EditorContentBlock,
  EditorPart,
  EditorSubpart,
  QuestionBlock,
} from "./editorDocumentNormalization.ts";
import type { NormalizeDocumentFlow } from "./editorSectionHeadings.ts";
import type { MauthAction, MauthActionResult } from "./mauthActions.ts";
import {
  columnBlockParentScrollAnchor,
  columnPathScrollAnchor,
  parseScrollAnchor,
  partScrollAnchor,
  questionIdFromScrollAnchor,
  questionScrollAnchor,
  subpartScrollAnchor,
  type ParsedScrollAnchor,
} from "./scrollAnchors.ts";
import type { SubsectionDragTarget } from "./editorSubsectionDrag.ts";

export interface ContextAnchorSelectionOptions {
  openEditor?: boolean;
  openInspector?: boolean;
  previewOnly?: boolean;
}

interface ContextAnchorDescriptor {
  id: string;
  editorAnchor: string;
  previewAnchor: string;
}

export interface EditorContextCommandRuntimeOptions {
  questions: QuestionBlock[];
  documentFlow: DocumentFlowItem[];
  sectionHeadings: DocumentSectionHeading[];
  showEditor: boolean;
  contextDescriptorForAnchor: (anchor: string) => ContextAnchorDescriptor;
  normalizeDocumentFlow: NormalizeDocumentFlow;
  blockContextFromParsed: (parsed: ParsedScrollAnchor) => EditorRootBlockContext | null;
  columnBlockContextFromParsed: (parsed: ParsedScrollAnchor) => EditorColumnBlockContext | null;
  duplicatedContentBlock: (block: EditorContentBlock) => EditorContentBlock;
  duplicatedSubpart: (subpart: EditorSubpart) => EditorSubpart;
  duplicatedPart: (part: EditorPart) => EditorPart;
  duplicatedQuestion: (question: QuestionBlock) => QuestionBlock;
  duplicateColumnBlockAtPath: (
    rootBlock: Extract<EditorContentBlock, { kind: "columns" }>,
    path: EditorColumnBlockPath,
  ) => { rootBlock: Extract<EditorContentBlock, { kind: "columns" }>; duplicatedPath: EditorColumnBlockPath } | null;
  applyAction: (action: MauthAction) => Pick<MauthActionResult<QuestionBlock>, "ok">;
  selectQuestion: (questionId: string) => void;
  setActiveTocItem: (anchor: string) => void;
  setActiveRailItem: (anchor: string) => void;
  openInspector: () => void;
  openEditor: () => void;
  revealEditorAnchor: (anchor: string) => void;
  queuePreviewJump: (anchor: string) => void;
  queueDocumentJump: (editorAnchor: string, previewAnchor: string, options?: { preservePaneMode?: boolean }) => void;
  moveSectionHeading: (sectionHeadingId: string, direction: MoveDirection) => void;
  moveQuestion: (questionId: string, direction: MoveDirection) => void;
  moveSubsection: (target: SubsectionDragTarget, direction: MoveDirection, anchor: string) => boolean;
  removeSectionHeading: (sectionHeadingId: string) => void;
  removePageBreakAfterQuestion: (questionId: string) => void;
  removeQuestion: (questionId: string) => void;
  removeQuestionBlock: (questionId: string, blockId: string) => void;
  removePart: (questionId: string, partId: string) => void;
  removePartBlock: (questionId: string, part: EditorPart, blockId: string) => void;
  removeSubpart: (questionId: string, part: EditorPart, subpartId: string) => void;
  removeSubpartBlock: (questionId: string, part: EditorPart, subpart: EditorSubpart, blockId: string) => void;
  activateEditorAnchor: (anchor: string) => void;
}

export function createEditorContextCommandRuntime({
  questions,
  documentFlow,
  sectionHeadings,
  showEditor,
  contextDescriptorForAnchor,
  normalizeDocumentFlow,
  blockContextFromParsed,
  columnBlockContextFromParsed,
  duplicatedContentBlock,
  duplicatedSubpart,
  duplicatedPart,
  duplicatedQuestion,
  duplicateColumnBlockAtPath,
  applyAction,
  selectQuestion,
  setActiveTocItem,
  setActiveRailItem,
  openInspector,
  openEditor,
  revealEditorAnchor,
  queuePreviewJump,
  queueDocumentJump,
  moveSectionHeading,
  moveQuestion,
  moveSubsection,
  removeSectionHeading,
  removePageBreakAfterQuestion,
  removeQuestion,
  removeQuestionBlock,
  removePart,
  removePartBlock,
  removeSubpart,
  removeSubpartBlock,
  activateEditorAnchor,
}: EditorContextCommandRuntimeOptions) {
  function selectContextAnchor(anchor: string, options: ContextAnchorSelectionOptions = {}) {
    const item = contextDescriptorForAnchor(anchor);
    const questionId = questionIdFromScrollAnchor(item.editorAnchor);
    if (questionId) selectQuestion(questionId);
    setActiveTocItem(item.id);
    setActiveRailItem(item.id);

    if (options.openInspector) openInspector();
    if (options.openEditor && !showEditor) openEditor();

    revealEditorAnchor(item.editorAnchor);
    if (options.previewOnly) {
      queuePreviewJump(item.previewAnchor);
      return;
    }
    queueDocumentJump(item.editorAnchor, item.previewAnchor, { preservePaneMode: !options.openEditor });
  }

  function duplicateColumnBlockTarget(parsed: ParsedScrollAnchor) {
    const context = columnBlockContextFromParsed(parsed);
    if (!context || !parsed.columnPath?.length) return false;
    const duplicated = duplicateColumnBlockAtPath(context.rootBlock, parsed.columnPath);
    if (!duplicated) return false;
    const result = applyAction({
      type: "module.update",
      scope: context.scope,
      blockId: context.rootBlock.id,
      patch: { columnCount: duplicated.rootBlock.columnCount, columns: duplicated.rootBlock.columns },
    });
    if (!result.ok) return false;
    selectContextAnchor(columnPathScrollAnchor(context.rootAnchor, duplicated.duplicatedPath), { openEditor: showEditor });
    return true;
  }

  function duplicateAnchorTarget(anchor: string) {
    const parsed = parseScrollAnchor(anchor);
    if (!parsed.questionId) return false;
    const question = questions.find((current) => current.id === parsed.questionId);
    if (!question) return false;

    if (parsed.kind === "question") {
      const nextQuestion = duplicatedQuestion(question);
      const result = applyAction({ type: "question.add", question: nextQuestion, afterQuestionId: question.id });
      if (!result.ok) return false;
      selectContextAnchor(questionScrollAnchor(nextQuestion.id), { openEditor: showEditor });
      return true;
    }

    if (parsed.kind === "part" && parsed.partId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      if (!part) return false;
      const nextPart = duplicatedPart(part);
      const result = applyAction({
        type: "part.add",
        questionId: question.id,
        part: nextPart,
        placement: { partId: part.id, position: "after" },
      });
      if (!result.ok) return false;
      selectContextAnchor(partScrollAnchor(question.id, nextPart.id), { openEditor: showEditor });
      return true;
    }

    if (parsed.kind === "subpart" && parsed.partId && parsed.subpartId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      const subpart = part?.subparts.find((current) => current.id === parsed.subpartId);
      if (!part || !subpart) return false;
      const nextSubpart = duplicatedSubpart(subpart);
      const result = applyAction({
        type: "subpart.add",
        questionId: question.id,
        partId: part.id,
        subpart: nextSubpart,
        placement: { subpartId: subpart.id, position: "after" },
      });
      if (!result.ok) return false;
      selectContextAnchor(subpartScrollAnchor(question.id, part.id, nextSubpart.id), { openEditor: showEditor });
      return true;
    }

    if (parsed.kind === "columnBlock") return duplicateColumnBlockTarget(parsed);

    const blockContext = blockContextFromParsed(parsed);
    if (!blockContext?.block || !parsed.blockId) return false;
    const nextBlock = duplicatedContentBlock(blockContext.block);
    const result = applyAction({
      type: "module.add",
      scope: blockContext.scope,
      blocks: [nextBlock],
      placement: { blockId: parsed.blockId, position: "after" },
    });
    if (!result.ok) return false;
    selectContextAnchor(blockContext.anchorForBlock(nextBlock.id), { openEditor: showEditor });
    return true;
  }

  function moveAnchorTarget(anchor: string, direction: MoveDirection) {
    const parsed = parseScrollAnchor(anchor);
    if (parsed.kind === "sectionHeading" && parsed.sectionHeadingId) {
      moveSectionHeading(parsed.sectionHeadingId, direction);
      return true;
    }
    if (parsed.kind === "question" && parsed.questionId) {
      moveQuestion(parsed.questionId, direction);
      return true;
    }
    const target = subsectionTargetFromParsed(parsed);
    return target ? moveSubsection(target, direction, anchor) : false;
  }

  function canMoveAnchorTarget(anchor: string, direction: MoveDirection) {
    return canMoveEditorAnchorTarget({
      anchor,
      direction,
      questions,
      documentFlow,
      sectionHeadings,
      normalizeDocumentFlow,
    });
  }

  function canDuplicateAnchorTarget(anchor: string) {
    const parsed = parseScrollAnchor(anchor);
    if (parsed.kind === "sectionHeading") return false;
    if (parsed.kind === "columnBlock") return Boolean(columnBlockContextFromParsed(parsed)?.block);
    return (
      parsed.kind === "question" || parsed.kind === "part" || parsed.kind === "subpart" || Boolean(blockContextFromParsed(parsed)?.block)
    );
  }

  function deleteEditorSelection(anchor: string) {
    const parsed = parseScrollAnchor(anchor);
    if (parsed.kind === "sectionHeading" && parsed.sectionHeadingId) {
      removeSectionHeading(parsed.sectionHeadingId);
      return true;
    }
    if (!parsed.questionId) return false;

    const question = questions.find((current) => current.id === parsed.questionId);
    if (!question) return false;

    if (parsed.kind === "pageBreak") {
      removePageBreakAfterQuestion(parsed.questionId);
      return true;
    }
    if (parsed.kind === "question") {
      removeQuestion(parsed.questionId);
      return true;
    }
    if (parsed.kind === "questionBlock" && parsed.blockId) {
      removeQuestionBlock(parsed.questionId, parsed.blockId);
      activateEditorAnchor(questionScrollAnchor(parsed.questionId));
      return true;
    }
    if (parsed.kind === "columnBlock") {
      const context = columnBlockContextFromParsed(parsed);
      if (!context) return false;
      const result = applyAction({ type: "module.delete", scope: context.scope, blockId: context.block.id });
      if (!result.ok) return false;
      activateEditorAnchor(columnBlockParentScrollAnchor(anchor));
      return true;
    }
    if (parsed.kind === "part" && parsed.partId) {
      removePart(parsed.questionId, parsed.partId);
      activateEditorAnchor(questionScrollAnchor(parsed.questionId));
      return true;
    }
    if (parsed.kind === "partBlock" && parsed.partId && parsed.blockId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      if (!part) return false;
      removePartBlock(parsed.questionId, part, parsed.blockId);
      activateEditorAnchor(partScrollAnchor(parsed.questionId, parsed.partId));
      return true;
    }
    if (parsed.kind === "subpart" && parsed.partId && parsed.subpartId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      if (!part) return false;
      removeSubpart(parsed.questionId, part, parsed.subpartId);
      activateEditorAnchor(partScrollAnchor(parsed.questionId, parsed.partId));
      return true;
    }
    if (parsed.kind === "subpartBlock" && parsed.partId && parsed.subpartId && parsed.blockId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      const subpart = part?.subparts.find((current) => current.id === parsed.subpartId);
      if (!part || !subpart) return false;
      removeSubpartBlock(parsed.questionId, part, subpart, parsed.blockId);
      activateEditorAnchor(subpartScrollAnchor(parsed.questionId, parsed.partId, parsed.subpartId));
      return true;
    }
    return false;
  }

  return {
    selectContextAnchor,
    duplicateAnchorTarget,
    moveAnchorTarget,
    canMoveAnchorTarget,
    canDeleteAnchorTarget,
    canDuplicateAnchorTarget,
    deleteEditorSelection,
  };
}
