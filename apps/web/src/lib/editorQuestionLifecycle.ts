import type { EditorPart, EditorSubpart, QuestionBlock } from "./editorDocumentNormalization.ts";
import { romanLabel } from "./editorDocumentNormalization.ts";
import type { MauthAction } from "./mauthActions.ts";

export interface QuestionLifecycleTemplate {
  titlePageTemplate?: string;
}

export interface QuestionFactoryRuntime {
  createQuestion: () => QuestionBlock;
  createNotesSection: () => QuestionBlock;
}

export function questionHasPageBreak(question: QuestionBlock) {
  return question.pageBreakAfter || question.contentBlocks.some((block) => block.kind === "pageBreak");
}

export function createQuestionForTemplate(template: QuestionLifecycleTemplate, runtime: QuestionFactoryRuntime) {
  return template.titlePageTemplate === "notes" ? runtime.createNotesSection() : runtime.createQuestion();
}

export function questionAddActionsForTemplate({
  template,
  questions,
  question,
}: {
  template: QuestionLifecycleTemplate;
  questions: QuestionBlock[];
  question: QuestionBlock;
}): MauthAction[] {
  if (template.titlePageTemplate === "exam" && questions.length) {
    return [
      { type: "question.update", questionId: questions[questions.length - 1].id, patch: { pageBreakAfter: true } },
      { type: "question.add", question },
    ];
  }

  return [{ type: "question.add", question }];
}

export function fallbackQuestionForDelete({
  template,
  questions,
  runtime,
}: {
  template: QuestionLifecycleTemplate;
  questions: QuestionBlock[];
  runtime: QuestionFactoryRuntime;
}) {
  return questions.length <= 1 ? createQuestionForTemplate(template, runtime) : undefined;
}

export function nextActiveQuestionAfterDelete({
  nextQuestions,
  removedQuestionId,
  removedIndex,
  activeQuestionId,
}: {
  nextQuestions: QuestionBlock[];
  removedQuestionId: string;
  removedIndex: number;
  activeQuestionId: string;
}) {
  if (removedQuestionId === activeQuestionId) {
    return nextQuestions[Math.min(Math.max(removedIndex, 0), nextQuestions.length - 1)] ?? nextQuestions[0];
  }

  return nextQuestions.find((question) => question.id === activeQuestionId) ?? nextQuestions[0];
}

export function createBlankEditorPart(id: (prefix: string) => string): EditorPart {
  return {
    id: id("part"),
    label: "",
    text: "",
    marks: 0,
    pageBreakBefore: false,
    contentBlocks: [],
    subparts: [],
    itemOrder: [],
  };
}

export function createBlankEditorSubpart(id: (prefix: string) => string, subpartIndex: number): EditorSubpart {
  return {
    id: id("subpart"),
    label: romanLabel(subpartIndex),
    text: "",
    marks: 0,
    pageBreakBefore: false,
    contentBlocks: [],
  };
}
