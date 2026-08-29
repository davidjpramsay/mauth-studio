import type { ContentBlock } from "@mauth-studio/shared";

import type { SolutionValidationIssue, SolutionValidationResult } from "./solutionValidation.ts";

interface QuestionOrderItemLike {
  kind: string;
  id: string;
}

export interface QuestionWordingValidationQuestionLike {
  id: string;
  text?: string;
  contentBlocks: ContentBlock[];
  itemOrder?: QuestionOrderItemLike[];
}

export interface QuestionWordingValidationOptions {
  notesDocument?: boolean;
  startQuestionNumber?: number;
}

export interface EditorDocumentValidationResult extends SolutionValidationResult {
  checkedQuestions: number;
}

function firstOrderedQuestionBlock(question: QuestionWordingValidationQuestionLike) {
  const blocksById = new Map(question.contentBlocks.map((block) => [block.id, block]));
  if (question.itemOrder?.length) {
    for (const item of question.itemOrder) {
      if (item.kind === "part") return null;
      if (item.kind !== "block") continue;
      const block = blocksById.get(item.id);
      if (block) return block;
    }
  }
  return question.contentBlocks[0] ?? null;
}

function isOrdinarySharedStem(block: ContentBlock | null): block is Extract<ContentBlock, { kind: "text" }> {
  if (!block || block.kind !== "text") return false;
  if (block.visibility === "student" || block.visibility === "solution" || block.studentOnly || block.solutionOnly) return false;
  const text = block.text.trim();
  return Boolean(text) && text !== "**End of Test**";
}

export function validateQuestionWordingStructure(
  questions: QuestionWordingValidationQuestionLike[],
  options: QuestionWordingValidationOptions = {},
): SolutionValidationIssue[] {
  if (options.notesDocument) return [];
  const startQuestionNumber = Math.max(1, Math.floor(options.startQuestionNumber ?? 1));

  return questions.flatMap((question, index) => {
    if (question.text?.trim()) return [];
    const firstBlock = firstOrderedQuestionBlock(question);
    if (!isOrdinarySharedStem(firstBlock)) return [];
    const questionNumber = startQuestionNumber + index;
    const stemPreview = firstBlock.text.trim().replace(/\s+/g, " ");
    return [
      {
        id: `question:${question.id}:redundant-leading-text-stem`,
        severity: "warning" as const,
        label: `Question ${questionNumber}`,
        message: `The leading shared text block “${stemPreview.slice(0, 80)}${stemPreview.length > 80 ? "…" : ""}” is acting as the question stem. Move it to Question wording and delete the redundant text block.`,
        anchor: `q:${question.id}`,
      },
    ];
  });
}

export function editorDocumentValidationResult(
  solutionValidation: SolutionValidationResult,
  questions: QuestionWordingValidationQuestionLike[],
  options: QuestionWordingValidationOptions = {},
): EditorDocumentValidationResult {
  const wordingIssues = validateQuestionWordingStructure(questions, options);
  const issues = [...solutionValidation.issues, ...wordingIssues];
  return {
    ...solutionValidation,
    checkedQuestions: options.notesDocument ? 0 : questions.length,
    errorCount: issues.filter((issue) => issue.severity === "error").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
    issues,
  };
}
