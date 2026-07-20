import type { GraphConfig } from "@mauth-studio/shared";

import { normalizeChoiceItems, normalizeTableBlock, plainTableRows } from "./contentBlockNormalization.ts";
import { spaceLines } from "./editorContentBlockNormalization.ts";
import {
  alphaLabel,
  orderedPartItems,
  orderedQuestionItems,
  romanLabel,
  type EditorPart,
  type EditorSubpart,
  type QuestionBlock,
} from "./editorDocumentNormalization.ts";
import { partScrollAnchor, questionScrollAnchor, subpartScrollAnchor } from "./scrollAnchors.ts";
import { solutionBlockVisibility, visibilityReplacementSlotAt } from "./solutionBlockVisibility.ts";
import { defaultSolutionSlotLines } from "./solutionSlotDefaults.ts";
import type { SolutionValidationRuntime } from "./solutionValidation.ts";

export interface SolutionValidationFrontMatterLike {
  startQuestionNumber?: number | null;
}

export function normalizedStartQuestionNumber(frontMatter: SolutionValidationFrontMatterLike) {
  return Math.max(1, Math.floor(frontMatter.startQuestionNumber || 1));
}

export function questionDisplayNumber(frontMatter: SolutionValidationFrontMatterLike, questionIndex: number) {
  return normalizedStartQuestionNumber(frontMatter) + questionIndex;
}

export interface EditorSolutionValidationRuntimeDependencies {
  graphHeight: (graphConfig?: GraphConfig | null) => number;
  withGraphDefaults: (graphConfig?: GraphConfig | null) => GraphConfig;
}

export function createEditorSolutionValidationRuntime({
  graphHeight,
  withGraphDefaults,
}: EditorSolutionValidationRuntimeDependencies): (
  frontMatter: SolutionValidationFrontMatterLike,
) => SolutionValidationRuntime<QuestionBlock, EditorPart, EditorSubpart> {
  return (frontMatter) => ({
    alphaLabel,
    contentBlockVisibility: solutionBlockVisibility,
    defaultSolutionSlotLines,
    graphHeight,
    normalizeChoiceItems,
    normalizeTableBlock,
    orderedPartItems,
    orderedQuestionItems,
    partScrollAnchor,
    plainTableRows: (table) => plainTableRows(table as ReturnType<typeof normalizeTableBlock>),
    questionDisplayNumber: (questionIndex) => questionDisplayNumber(frontMatter, questionIndex),
    questionScrollAnchor,
    romanLabel,
    spaceLines,
    subpartScrollAnchor,
    visibilityReplacementSlotAt,
    withGraphDefaults,
  });
}
