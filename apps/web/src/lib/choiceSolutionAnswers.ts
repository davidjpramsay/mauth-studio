import type { ChoiceNumberingStyle, ContentBlock, ContentBlockVisibility } from "@mauth-studio/shared";

import { alphaLabel, romanLabel } from "./editorDocumentNormalization.ts";
import { normalizeChoiceNumberingStyle } from "./contentBlockNormalization.ts";

type ChoiceListBlock = Extract<ContentBlock, { kind: "choices" }>;

export function choiceListLabel(style: ChoiceNumberingStyle | undefined, index: number) {
  const normalizedStyle = normalizeChoiceNumberingStyle(style);
  if (normalizedStyle === "bullet") return "•";
  if (normalizedStyle === "decimal") return `${index + 1}.`;
  if (normalizedStyle === "upper-alpha") return `${alphaLabel(index).toUpperCase()}.`;
  if (normalizedStyle === "lower-alpha") return `${alphaLabel(index)}.`;
  return `${romanLabel(index)}.`;
}

export function normalizeChoiceSolutionAnswerIndex(value: unknown, choiceCount: number) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  const normalizedChoiceCount = Math.max(0, Math.floor(choiceCount));
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= normalizedChoiceCount) return undefined;
  return parsed;
}

export function choiceSolutionAnswerFields(value: unknown, visibility: ContentBlockVisibility | undefined, choiceCount: number) {
  if (visibility === "student") return {};
  const solutionAnswerIndex = normalizeChoiceSolutionAnswerIndex(value, choiceCount);
  return solutionAnswerIndex === undefined ? {} : { solutionAnswerIndex };
}

export function choiceBlockSolutionAnswerIndex(block: ChoiceListBlock) {
  return normalizeChoiceSolutionAnswerIndex(block.solutionAnswerIndex, block.choices.length);
}

export function choiceBlockHasSolutionAnswer(block: ContentBlock): block is ChoiceListBlock {
  return block.kind === "choices" && choiceBlockSolutionAnswerIndex(block) !== undefined;
}

export function choiceSolutionAnswerIndexForPreview(block: ChoiceListBlock, showSolutions: boolean) {
  return showSolutions ? choiceBlockSolutionAnswerIndex(block) : undefined;
}

export function choiceSolutionAnswerPatch(block: ChoiceListBlock, value: unknown): Partial<ChoiceListBlock> {
  return { solutionAnswerIndex: normalizeChoiceSolutionAnswerIndex(value, block.choices.length) };
}

export function withChoiceSolutionAnswer(block: ChoiceListBlock, value: unknown): ChoiceListBlock {
  const nextBlock = { ...block };
  delete nextBlock.solutionAnswerIndex;
  const solutionAnswerIndex = normalizeChoiceSolutionAnswerIndex(value, block.choices.length);
  if (solutionAnswerIndex !== undefined) nextBlock.solutionAnswerIndex = solutionAnswerIndex;
  return nextBlock;
}

export function choiceSolutionAnswerOptions(block: ChoiceListBlock) {
  return block.choices.map((_, index) => ({
    value: index,
    label:
      normalizeChoiceNumberingStyle(block.numberingStyle) === "bullet"
        ? `Choice ${index + 1}`
        : choiceListLabel(block.numberingStyle, index),
  }));
}
