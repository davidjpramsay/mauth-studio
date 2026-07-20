import type { ReactNode } from "react";

import { EditorNestedPartPanel, type EditorNestedPartPanelProps } from "@/components/editor/EditorNestedPartPanel";
import { EditorScopedContentBlockPanel, type EditorScopedContentBlockPanelProps } from "@/components/editor/EditorScopedContentBlockPanel";
import type {
  EditorContentBlock,
  EditorPart,
  EditorSubpart,
  OrderedPartItem,
  OrderedQuestionItem,
  QuestionBlock,
} from "@/lib/editorDocumentNormalization";
import { partBlockPanelRenderPlan, questionBlockPanelRenderPlan, subpartBlockPanelRenderPlan } from "@/lib/editorPanelRenderPlans";

type ScopedPanelSharedProps = Omit<
  EditorScopedContentBlockPanelProps,
  "block" | "scopeBlocks" | "context" | "target" | "anchor" | "openSignal" | "onChange" | "onRemove"
>;

type NestedPartPanelSharedProps = Omit<
  EditorNestedPartPanelProps,
  "question" | "part" | "renderPartContentBlock" | "renderSubpartContentBlock"
>;

interface CreateEditorPanelRenderersOptions {
  showSolutions: boolean;
  scopedPanelProps: ScopedPanelSharedProps;
  nestedPartPanelProps: NestedPartPanelSharedProps;
  updateQuestionContentBlock: (questionId: string, blockId: string, patch: Partial<EditorContentBlock>) => void;
  updatePartContentBlock: (questionId: string, partId: string, blockId: string, patch: Partial<EditorContentBlock>) => void;
  updateSubpartContentBlock: (
    questionId: string,
    partId: string,
    subpartId: string,
    blockId: string,
    patch: Partial<EditorContentBlock>,
  ) => void;
  removeQuestionContentBlock: (questionId: string, blockId: string) => void;
  removePartContentBlock: (questionId: string, part: EditorPart, blockId: string) => void;
  removeSubpartContentBlock: (questionId: string, part: EditorPart, subpart: EditorSubpart, blockId: string) => void;
}

export function createEditorPanelRenderers({
  showSolutions,
  scopedPanelProps,
  nestedPartPanelProps,
  updateQuestionContentBlock,
  updatePartContentBlock,
  updateSubpartContentBlock,
  removeQuestionContentBlock,
  removePartContentBlock,
  removeSubpartContentBlock,
}: CreateEditorPanelRenderersOptions) {
  function renderScopedContentBlock(
    block: EditorContentBlock,
    plan: NonNullable<ReturnType<typeof questionBlockPanelRenderPlan>>,
    onChange: (patch: Partial<EditorContentBlock>) => void,
    onRemove: () => void,
  ): ReactNode {
    return (
      <EditorScopedContentBlockPanel
        key={block.id}
        {...scopedPanelProps}
        {...plan}
        block={block}
        openSignal={scopedPanelProps.openSignalForAnchor(plan.anchor)}
        onChange={onChange}
        onRemove={onRemove}
      />
    );
  }

  function renderQuestionContentBlock(
    question: QuestionBlock,
    block: EditorContentBlock,
    itemIndex: number,
    _itemCount: number,
    questionItems: OrderedQuestionItem[],
  ) {
    const plan = questionBlockPanelRenderPlan({ question, block, itemIndex, questionItems, showSolutions });
    if (!plan) return null;
    return renderScopedContentBlock(
      block,
      plan,
      (patch) => updateQuestionContentBlock(question.id, block.id, patch),
      () => removeQuestionContentBlock(question.id, block.id),
    );
  }

  function renderPartContentBlock(
    question: QuestionBlock,
    part: EditorPart,
    block: EditorContentBlock,
    itemIndex: number,
    _itemCount: number,
    partItems: OrderedPartItem[],
  ) {
    const plan = partBlockPanelRenderPlan({ question, part, block, itemIndex, partItems, showSolutions });
    if (!plan) return null;
    return renderScopedContentBlock(
      block,
      plan,
      (patch) => updatePartContentBlock(question.id, part.id, block.id, patch),
      () => removePartContentBlock(question.id, part, block.id),
    );
  }

  function renderSubpartContentBlock(
    question: QuestionBlock,
    part: EditorPart,
    subpart: EditorSubpart,
    block: EditorContentBlock,
    blockIndex: number,
  ) {
    const plan = subpartBlockPanelRenderPlan({ question, part, subpart, block, blockIndex, showSolutions });
    if (!plan) return null;
    return renderScopedContentBlock(
      block,
      plan,
      (patch) => updateSubpartContentBlock(question.id, part.id, subpart.id, block.id, patch),
      () => removeSubpartContentBlock(question.id, part, subpart, block.id),
    );
  }

  function renderPartPanel(question: QuestionBlock, part: EditorPart) {
    return (
      <EditorNestedPartPanel
        key={part.id}
        {...nestedPartPanelProps}
        question={question}
        part={part}
        renderPartContentBlock={renderPartContentBlock}
        renderSubpartContentBlock={renderSubpartContentBlock}
      />
    );
  }

  return {
    renderQuestionContentBlock,
    renderPartContentBlock,
    renderSubpartContentBlock,
    renderPartPanel,
  };
}
