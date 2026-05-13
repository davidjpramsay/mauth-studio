import type { ContentBlock } from "@mauth-studio/shared";

import type {
  MauthAssistantDocumentPreflightIssue,
  MauthAssistantDocumentPreflightResult,
  MauthAssistantToolCommitContext,
} from "./mauthAssistantAdapter.ts";
import type { MauthDocumentLike, MauthPartLike, MauthQuestionLike } from "./mauthActions.ts";
import { inspectMauthDiagram, isAssistantDiagramInspectionWarningBlocking } from "./mauthDiagramInspection.ts";

const MARK_TICK_ANNOTATION_PATTERN = /\[\[\s*marks\s*:\s*(\d+)\s*\]\]/gi;
const VISIBLE_MARK_NOTE_PATTERN =
  /(?:\[(\d+)\s*marks?(?:[^\]]*)\]|\((\d+)\s*marks?(?:[^)]*)\)|\b\d+\s*marks?\s+for\b|Solution\s*\(\s*\d+\s*marks?\s*\))/i;
const SOLUTION_HEADING_PATTERN = /^\s*(?:\*\*)?Solution\.?(?:\*\*)?/i;

function blockVisibility(block: ContentBlock) {
  if (block.visibility === "student" || block.studentOnly) return "student";
  if (block.visibility === "solution" || block.solutionOnly) return "solution";
  return "always";
}

function isSolutionTextBlock(block: ContentBlock): block is Extract<ContentBlock, { kind: "text" }> {
  return block.kind === "text" && (blockVisibility(block) === "solution" || SOLUTION_HEADING_PATTERN.test(block.text));
}

function markAnnotationTotal(text: string) {
  return [...text.matchAll(MARK_TICK_ANNOTATION_PATTERN)].reduce((sum, match) => sum + Math.max(0, Number(match[1]) || 0), 0);
}

function blockMarkTickTotal(block: ContentBlock) {
  const surfaceTicks =
    blockVisibility(block) === "solution" ? Math.max(0, Math.min(20, Math.round(Number(block.markTicks) || 0))) : 0;
  if (block.kind !== "text") return surfaceTicks;
  return surfaceTicks + markAnnotationTotal(block.text);
}

function isSolutionMarkedBlock(block: ContentBlock) {
  return blockVisibility(block) === "solution" || isSolutionTextBlock(block);
}

function hasVisibleMarkNote(text: string) {
  return VISIBLE_MARK_NOTE_PATTERN.test(text);
}

function changedSet(changedIds: readonly string[]) {
  return new Set(changedIds);
}

function blockChanged(blocks: readonly ContentBlock[], ids: Set<string>) {
  return blocks.some((block) => ids.has(block.id));
}

function shouldValidateContainer(containerId: string, blocks: readonly ContentBlock[], ids: Set<string>, inheritedChanged: boolean) {
  return ids.size === 0 || inheritedChanged || ids.has(containerId) || blockChanged(blocks, ids);
}

function solutionMarkingIssuesForContainer({
  label,
  marks,
  blocks,
  path,
}: {
  label: string;
  marks: number;
  blocks: readonly ContentBlock[];
  path: string;
}) {
  const issues: MauthAssistantDocumentPreflightIssue[] = [];
  const solutionBlocks = blocks.filter(isSolutionMarkedBlock);
  if (!solutionBlocks.length) return issues;

  let hiddenMarkTotal = 0;
  solutionBlocks.forEach((block, blockIndex) => {
    const blockPath = `${path}.contentBlocks[${blocks.indexOf(block)}]`;
    hiddenMarkTotal += blockMarkTickTotal(block);
    if (block.kind !== "text") return;

    const textPath = `${blockPath}.text`;
    if (!SOLUTION_HEADING_PATTERN.test(block.text)) {
      issues.push({
        path: textPath,
        message: `${label} has solution-only text without the standard Solution heading.`,
        expected: 'Begin solution modules with "**Solution.**" and keep them visibility: "solution".',
        targetId: block.id,
      });
    }
    if (hasVisibleMarkNote(block.text)) {
      issues.push({
        path: textPath,
        message: `${label} contains visible mark notes in the solution copy.`,
        expected: "Use hidden [[marks:n]] annotations only; never visible [1 mark], (1 mark), or '1 mark for...' prose.",
        targetId: block.id,
      });
    }
    if (blockIndex > 0 && !block.text.trim()) {
      issues.push({
        path: textPath,
        message: `${label} has an empty solution-only text block.`,
        expected: "Remove empty solution modules or write a concise worked solution.",
        targetId: block.id,
      });
    }
  });

  const safeMarks = Math.max(0, Number(marks) || 0);
  if (safeMarks > 0 && hiddenMarkTotal !== safeMarks) {
    issues.push({
      path,
      message: `${label} has ${hiddenMarkTotal} hidden solution mark tick${hiddenMarkTotal === 1 ? "" : "s"} for ${safeMarks} mark${safeMarks === 1 ? "" : "s"}.`,
      expected: `Make the total of hidden [[marks:n]] annotations equal ${safeMarks}.`,
    });
  }

  return issues;
}

function collectSolutionMarkingIssues<Q extends MauthQuestionLike>(questions: readonly Q[], changedIds: readonly string[]) {
  const ids = changedSet(changedIds);
  const issues: MauthAssistantDocumentPreflightIssue[] = [];

  questions.forEach((question, questionIndex) => {
    const questionChanged = ids.size === 0 || ids.has(question.id) || blockChanged(question.contentBlocks, ids);
    const questionPath = `questions[${questionIndex}]`;
    if (!question.parts?.length && shouldValidateContainer(question.id, question.contentBlocks, ids, questionChanged)) {
      issues.push(
        ...solutionMarkingIssuesForContainer({
          label: `Question ${questionIndex + 1}`,
          marks: question.marks,
          blocks: question.contentBlocks,
          path: questionPath,
        }),
      );
    }

    question.parts?.forEach((part, partIndex) => {
      const partChanged = questionChanged || ids.has(part.id) || blockChanged(part.contentBlocks, ids);
      const partPath = `${questionPath}.parts[${partIndex}]`;
      if (!part.subparts?.length && shouldValidateContainer(part.id, part.contentBlocks, ids, partChanged)) {
        issues.push(
          ...solutionMarkingIssuesForContainer({
            label: `Question ${questionIndex + 1}${part.label ? `(${part.label})` : ` part ${partIndex + 1}`}`,
            marks: part.marks,
            blocks: part.contentBlocks,
            path: partPath,
          }),
        );
      }

      part.subparts?.forEach((subpart, subpartIndex) => {
        const subpartChanged = partChanged || ids.has(subpart.id) || blockChanged(subpart.contentBlocks, ids);
        const subpartPath = `${partPath}.subparts[${subpartIndex}]`;
        if (!shouldValidateContainer(subpart.id, subpart.contentBlocks, ids, subpartChanged)) return;
        issues.push(
          ...solutionMarkingIssuesForContainer({
            label: `Question ${questionIndex + 1}${part.label ? `(${part.label})` : ` part ${partIndex + 1}`} subpart ${subpartIndex + 1}`,
            marks: subpart.marks,
            blocks: subpart.contentBlocks,
            path: subpartPath,
          }),
        );
      });
    });
  });

  return issues;
}

function diagramCountInBlocks(blocks: readonly ContentBlock[]) {
  return blocks.filter((block) => block.kind === "diagram").length;
}

function diagramCountInPart(part: MauthPartLike) {
  return (
    diagramCountInBlocks(part.contentBlocks) +
    (part.subparts ?? []).reduce((sum, subpart) => sum + diagramCountInBlocks(subpart.contentBlocks), 0)
  );
}

function diagramCountInQuestion(question: MauthQuestionLike) {
  return diagramCountInBlocks(question.contentBlocks) + (question.parts ?? []).reduce((sum, part) => sum + diagramCountInPart(part), 0);
}

function questionTouched(question: MauthQuestionLike, ids: Set<string>) {
  if (ids.size === 0 || ids.has(question.id) || blockChanged(question.contentBlocks, ids)) return true;
  return (question.parts ?? []).some(
    (part) =>
      ids.has(part.id) ||
      blockChanged(part.contentBlocks, ids) ||
      (part.subparts ?? []).some((subpart) => ids.has(subpart.id) || blockChanged(subpart.contentBlocks, ids)),
  );
}

function collectDiagramPreservationIssues<Q extends MauthQuestionLike>(
  previousQuestions: readonly Q[],
  nextQuestions: readonly Q[],
  changedIds: readonly string[],
  context: MauthAssistantToolCommitContext,
) {
  if (context.toolName === "mauth.author.replaceQuestion") return [];

  const ids = changedSet(changedIds);
  const issues: MauthAssistantDocumentPreflightIssue[] = [];
  nextQuestions.forEach((nextQuestion, questionIndex) => {
    if (!questionTouched(nextQuestion, ids)) return;
    const previousQuestion = previousQuestions.find((question) => question.id === nextQuestion.id);
    if (!previousQuestion) return;
    const previousCount = diagramCountInQuestion(previousQuestion);
    const nextCount = diagramCountInQuestion(nextQuestion);
    if (nextCount >= previousCount) return;
    issues.push({
      path: `questions[${questionIndex}].contentBlocks`,
      message: `Assistant edit removed ${previousCount - nextCount} existing diagram${previousCount - nextCount === 1 ? "" : "s"} from Question ${questionIndex + 1}.`,
      expected:
        "Solution, marking, and diagram-addition edits must preserve existing shared diagrams. Use mauth.author.replaceQuestion with an explicit empty diagrams list only when the teacher asks to remove diagrams.",
      targetId: nextQuestion.id,
    });
  });
  return issues;
}

function visibleTextFromBlocks(blocks: readonly ContentBlock[]) {
  return blocks
    .filter((block): block is Extract<ContentBlock, { kind: "text" }> => block.kind === "text" && blockVisibility(block) !== "solution")
    .map((block) => block.text);
}

function partTextFragments(part: MauthPartLike): string[] {
  return [
    typeof part.text === "string" ? part.text : "",
    ...visibleTextFromBlocks(part.contentBlocks),
    ...(part.subparts ?? []).flatMap((subpart) => [
      typeof subpart.text === "string" ? subpart.text : "",
      ...visibleTextFromBlocks(subpart.contentBlocks),
    ]),
  ];
}

function questionTextFragments(question: MauthQuestionLike) {
  return [
    typeof question.text === "string" ? question.text : "",
    ...visibleTextFromBlocks(question.contentBlocks),
    ...(question.parts ?? []).flatMap(partTextFragments),
  ];
}

function diagramInspectionExpected(code: string) {
  if (code === "diagram-renderer-mismatch") return "Use the renderer expected by the prompt and write that renderer's native graphConfig.";
  if (code === "image-diagram-missing-source") return "Attach an uploaded image source in graphConfig.data.src.";
  if (code === "scalar-product-vector-labels-missing") {
    return "Add visible vector labels in Penrose Substance, e.g. `Label A $\\mathbf{a}$`, for every vector named in the scalar products.";
  }
  return "A native diagram whose renderer choice, labels, and declared geometry match the question prompt.";
}

function collectDiagramInspectionIssues<Q extends MauthQuestionLike>(questions: readonly Q[], changedIds: readonly string[]) {
  const ids = changedSet(changedIds);
  const validateAll = ids.size === 0;
  const issues: MauthAssistantDocumentPreflightIssue[] = [];

  function collectBlocks(blocks: readonly ContentBlock[], pathPrefix: string, inheritedChanged: boolean, questionText: string) {
    blocks.forEach((block, blockIndex) => {
      const blockChanged = inheritedChanged || ids.has(block.id);
      if (block.kind !== "diagram" || !blockChanged) return;
      const inspection = inspectMauthDiagram(block.graphConfig, questionText);
      for (const warning of inspection.warnings.filter(isAssistantDiagramInspectionWarningBlocking)) {
        issues.push({
          path: `${pathPrefix}.contentBlocks[${blockIndex}].${warning.path ?? "graphConfig"}`,
          message: warning.message,
          expected: diagramInspectionExpected(warning.code),
          targetId: block.id,
        });
      }
    });
  }

  questions.forEach((question, questionIndex) => {
    const questionChanged = validateAll || ids.has(question.id);
    const questionPath = `questions[${questionIndex}]`;
    const questionText = questionTextFragments(question).join("\n");
    collectBlocks(question.contentBlocks, questionPath, questionChanged, questionText);

    question.parts?.forEach((part, partIndex) => {
      const partChanged = questionChanged || ids.has(part.id);
      const partPath = `${questionPath}.parts[${partIndex}]`;
      const partText = [questionText, ...partTextFragments(part)].join("\n");
      collectBlocks(part.contentBlocks, partPath, partChanged, partText);

      part.subparts?.forEach((subpart, subpartIndex) => {
        const subpartChanged = partChanged || ids.has(subpart.id);
        const subpartPath = `${partPath}.subparts[${subpartIndex}]`;
        const subpartText = [
          questionText,
          typeof part.text === "string" ? part.text : "",
          typeof subpart.text === "string" ? subpart.text : "",
          ...visibleTextFromBlocks(subpart.contentBlocks),
        ].join("\n");
        collectBlocks(subpart.contentBlocks, subpartPath, subpartChanged, subpartText);
      });
    });
  });

  return issues;
}

function failureResult(code: string, error: string, issues: MauthAssistantDocumentPreflightIssue[]): MauthAssistantDocumentPreflightResult {
  return {
    ok: false,
    error,
    warnings: issues.map((issue) => ({ code, message: issue.message, targetId: issue.targetId })),
    validationIssues: issues,
    data: { validationIssues: issues },
  };
}

export function validateAssistantSolutionMarkingBeforeCommit<
  Q extends MauthQuestionLike,
  F extends object,
  C extends object = Record<string, unknown>,
>(
  document: MauthDocumentLike<Q, F, C>,
  _context: MauthAssistantToolCommitContext,
  changedIds: readonly string[],
): MauthAssistantDocumentPreflightResult {
  const issues = collectSolutionMarkingIssues(document.questions, changedIds);
  if (!issues.length) return { ok: true };
  return failureResult(
    "assistant-solution-marking-invalid",
    "Assistant solution preflight failed. Repair the solution text, hidden mark ticks, or marks before applying.",
    issues,
  );
}

export function validateAssistantDiagramPreservationBeforeCommit<
  Q extends MauthQuestionLike,
  F extends object,
  C extends object = Record<string, unknown>,
>(
  previousDocument: MauthDocumentLike<Q, F, C>,
  document: MauthDocumentLike<Q, F, C>,
  context: MauthAssistantToolCommitContext,
  changedIds: readonly string[],
): MauthAssistantDocumentPreflightResult {
  const issues = collectDiagramPreservationIssues(previousDocument.questions, document.questions, changedIds, context);
  if (!issues.length) return { ok: true };
  return failureResult(
    "assistant-diagram-preservation-failed",
    "Assistant edit would remove existing diagrams outside an explicit question replacement.",
    issues,
  );
}

export function validateAssistantDiagramSemanticsBeforeCommit<
  Q extends MauthQuestionLike,
  F extends object,
  C extends object = Record<string, unknown>,
>(
  document: MauthDocumentLike<Q, F, C>,
  _context: MauthAssistantToolCommitContext,
  changedIds: readonly string[],
): MauthAssistantDocumentPreflightResult {
  const issues = collectDiagramInspectionIssues(document.questions, changedIds);
  if (!issues.length) return { ok: true };
  return failureResult(
    "assistant-diagram-inspection-invalid",
    "Assistant diagram preflight failed. Repair the diagram so its renderer, labels, and declared geometry match the question before applying.",
    issues,
  );
}
