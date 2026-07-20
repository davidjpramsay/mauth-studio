import type {
  EditorContentBlock,
  EditorPart,
  EditorSubpart,
  OrderedPartItem,
  OrderedQuestionItem,
  QuestionBlock,
} from "./editorDocumentNormalization.ts";
import { isOrderedBlockVisible } from "./editorDocumentToc.ts";
import type { SubsectionDragTarget } from "./editorSubsectionDrag.ts";
import { partBlockScrollAnchor, questionBlockScrollAnchor, subpartBlockScrollAnchor } from "./scrollAnchors.ts";
import { isContentBlockVisibleInScope } from "./solutionBlockVisibility.ts";

export interface EditorScopedPanelRenderPlan {
  context: "question" | "part" | "subpart";
  scopeBlocks: EditorContentBlock[];
  target: SubsectionDragTarget;
  anchor: string;
}

export function questionBlockPanelRenderPlan({
  question,
  block,
  itemIndex,
  questionItems,
  showSolutions,
}: {
  question: QuestionBlock;
  block: EditorContentBlock;
  itemIndex: number;
  questionItems: OrderedQuestionItem[];
  showSolutions: boolean;
}): EditorScopedPanelRenderPlan | null {
  if (!isOrderedBlockVisible(questionItems, itemIndex, showSolutions)) return null;
  return {
    context: "question",
    scopeBlocks: question.contentBlocks,
    target: { kind: "question-block", questionId: question.id, id: block.id },
    anchor: questionBlockScrollAnchor(question.id, block.id),
  };
}

export function partBlockPanelRenderPlan({
  question,
  part,
  block,
  itemIndex,
  partItems,
  showSolutions,
}: {
  question: QuestionBlock;
  part: EditorPart;
  block: EditorContentBlock;
  itemIndex: number;
  partItems: OrderedPartItem[];
  showSolutions: boolean;
}): EditorScopedPanelRenderPlan | null {
  if (!isOrderedBlockVisible(partItems, itemIndex, showSolutions)) return null;
  return {
    context: "part",
    scopeBlocks: part.contentBlocks,
    target: { kind: "part-block", questionId: question.id, partId: part.id, id: block.id },
    anchor: partBlockScrollAnchor(question.id, part.id, block.id),
  };
}

export function subpartBlockPanelRenderPlan({
  question,
  part,
  subpart,
  block,
  blockIndex,
  showSolutions,
}: {
  question: QuestionBlock;
  part: EditorPart;
  subpart: EditorSubpart;
  block: EditorContentBlock;
  blockIndex: number;
  showSolutions: boolean;
}): EditorScopedPanelRenderPlan | null {
  if (!isContentBlockVisibleInScope(subpart.contentBlocks, blockIndex, showSolutions)) return null;
  return {
    context: "subpart",
    scopeBlocks: subpart.contentBlocks,
    target: {
      kind: "subpart-block",
      questionId: question.id,
      partId: part.id,
      subpartId: subpart.id,
      id: block.id,
    },
    anchor: subpartBlockScrollAnchor(question.id, part.id, subpart.id, block.id),
  };
}
