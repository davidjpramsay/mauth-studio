import type { ContentBlock, ContentBlockVisibility, GraphConfig } from "@mauth-studio/shared";
import type { SolutionVisibilityReplacementSlotGroup } from "./solutionBlockVisibility.ts";

type EditorContentBlock = ContentBlock;
type TableBlock = Extract<EditorContentBlock, { kind: "table" }>;
export type { SolutionVisibilityReplacementSlotGroup } from "./solutionBlockVisibility.ts";

export interface SolutionValidationSubpartLike {
  id: string;
  marks?: number;
  contentBlocks: EditorContentBlock[];
}

export interface SolutionValidationPartLike<TSubpart extends SolutionValidationSubpartLike = SolutionValidationSubpartLike> {
  id: string;
  marks?: number;
  contentBlocks: EditorContentBlock[];
  subparts?: TSubpart[];
}

export interface SolutionValidationQuestionLike<TPart extends SolutionValidationPartLike = SolutionValidationPartLike> {
  id: string;
  marks?: number;
  contentBlocks: EditorContentBlock[];
  parts: TPart[];
}

export type SolutionValidationSeverity = "error" | "warning";

export type SolutionValidationFix =
  | { kind: "add-slot"; lines: number }
  | { kind: "add-solution"; afterBlockId: string }
  | { kind: "add-student-space"; beforeBlockId: string; lines: number }
  | { kind: "increase-space"; blockId: string; lines: number };

export interface SolutionValidationIssue {
  id: string;
  severity: SolutionValidationSeverity;
  label: string;
  message: string;
  anchor: string;
  fix?: SolutionValidationFix;
}

export interface SolutionValidationResult {
  checkedItems: number;
  errorCount: number;
  warningCount: number;
  issues: SolutionValidationIssue[];
}

export type SolutionOrderedQuestionItem<TPart extends SolutionValidationPartLike> =
  | { kind: "block"; block: EditorContentBlock }
  | { kind: "part"; part: TPart };

export type SolutionOrderedPartItem<TSubpart extends SolutionValidationSubpartLike> =
  | { kind: "block"; block: EditorContentBlock }
  | { kind: "subpart"; subpart: TSubpart };

export interface SolutionValidationRuntime<
  TQuestion extends SolutionValidationQuestionLike<TPart>,
  TPart extends SolutionValidationPartLike<TSubpart>,
  TSubpart extends SolutionValidationSubpartLike,
> {
  alphaLabel: (index: number) => string;
  contentBlockVisibility: (block: EditorContentBlock) => ContentBlockVisibility;
  defaultSolutionSlotLines: (marks: number) => number;
  graphHeight: (graphConfig?: GraphConfig | null) => number;
  normalizeChoiceItems: (value: unknown) => string[];
  normalizeTableBlock: (block: TableBlock) => unknown;
  orderedPartItems: (part: TPart) => SolutionOrderedPartItem<TSubpart>[];
  orderedQuestionItems: (question: TQuestion) => SolutionOrderedQuestionItem<TPart>[];
  partScrollAnchor: (questionId: string, partId: string) => string;
  plainTableRows: (table: unknown) => string[][];
  questionDisplayNumber: (questionIndex: number) => number;
  questionScrollAnchor: (questionId: string) => string;
  romanLabel: (index: number) => string;
  spaceLines: (value: unknown) => number;
  subpartScrollAnchor: (questionId: string, partId: string, subpartId: string) => string;
  visibilityReplacementSlotAt: (blocks: EditorContentBlock[], startIndex: number) => SolutionVisibilityReplacementSlotGroup | null;
  withGraphDefaults: (graphConfig?: GraphConfig | null) => GraphConfig;
}

const SOLUTION_SLOT_OVERFLOW_MIN_TOLERANCE_LINES = 2;
const SOLUTION_SLOT_OVERFLOW_MAX_TOLERANCE_LINES = 5;
const SOLUTION_SLOT_OVERFLOW_DEFAULT_TOLERANCE_LINES = 3;

export function measuredLineHeightPx(element: HTMLElement) {
  const styles = window.getComputedStyle(element);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  if (Number.isFinite(lineHeight)) return lineHeight;

  const fontSize = Number.parseFloat(styles.fontSize);
  return Number.isFinite(fontSize) ? fontSize * 1.55 : 20;
}

export function solutionSlotToleranceLines(
  studentBlock: EditorContentBlock,
  runtime: Pick<
    SolutionValidationRuntime<SolutionValidationQuestionLike, SolutionValidationPartLike, SolutionValidationSubpartLike>,
    "spaceLines"
  >,
) {
  if (studentBlock.kind !== "space") return SOLUTION_SLOT_OVERFLOW_DEFAULT_TOLERANCE_LINES;

  return Math.min(
    SOLUTION_SLOT_OVERFLOW_MAX_TOLERANCE_LINES,
    Math.max(SOLUTION_SLOT_OVERFLOW_MIN_TOLERANCE_LINES, Math.floor(runtime.spaceLines(studentBlock.lines) / 2)),
  );
}

function tableHasBlankResponseCells<
  TQuestion extends SolutionValidationQuestionLike<TPart>,
  TPart extends SolutionValidationPartLike<TSubpart>,
  TSubpart extends SolutionValidationSubpartLike,
>(block: TableBlock, runtime: SolutionValidationRuntime<TQuestion, TPart, TSubpart>) {
  const table = runtime.normalizeTableBlock(block);
  return runtime.plainTableRows(table).some((row) => row.some((cell) => !cell.trim()));
}

function isStudentResponseSurfaceBlock<
  TQuestion extends SolutionValidationQuestionLike<TPart>,
  TPart extends SolutionValidationPartLike<TSubpart>,
  TSubpart extends SolutionValidationSubpartLike,
>(block: EditorContentBlock, runtime: SolutionValidationRuntime<TQuestion, TPart, TSubpart>) {
  const visibility = runtime.contentBlockVisibility(block);
  if (visibility === "solution") return false;
  if (visibility === "student") return true;
  if (block.kind === "choices") return runtime.normalizeChoiceItems(block.choices).length > 0;
  if (block.kind === "table") return tableHasBlankResponseCells(block, runtime);
  return false;
}

function solutionTextLineEstimate(text: string) {
  const visibleText = text.replace(/\[\[marks:\s*\d+\s*\]\]/gi, "");
  const lines = visibleText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const displayMathCount = (visibleText.match(/\$\$[\s\S]*?\$\$/g) ?? []).length;
  const alignedBreakCount = (visibleText.match(/\\\\/g) ?? []).length;
  return Math.max(1, lines.length + displayMathCount + alignedBreakCount);
}

function solutionBlockLineEstimate<
  TQuestion extends SolutionValidationQuestionLike<TPart>,
  TPart extends SolutionValidationPartLike<TSubpart>,
  TSubpart extends SolutionValidationSubpartLike,
>(block: EditorContentBlock, runtime: SolutionValidationRuntime<TQuestion, TPart, TSubpart>) {
  if (block.kind === "text") return solutionTextLineEstimate(block.text ?? "");
  if (block.kind === "diagram") return Math.max(4, Math.ceil(runtime.graphHeight(runtime.withGraphDefaults(block.graphConfig)) / 26));
  if (block.kind === "table") return Math.max(2, runtime.plainTableRows(runtime.normalizeTableBlock(block)).length + 1);
  if (block.kind === "choices") return Math.max(1, runtime.normalizeChoiceItems(block.choices).length);
  if (block.kind === "space") return runtime.spaceLines(block.lines);
  return 1;
}

function replacementSlotLineCapacity<
  TQuestion extends SolutionValidationQuestionLike<TPart>,
  TPart extends SolutionValidationPartLike<TSubpart>,
  TSubpart extends SolutionValidationSubpartLike,
>(studentBlock: EditorContentBlock, runtime: SolutionValidationRuntime<TQuestion, TPart, TSubpart>) {
  if (studentBlock.kind === "space") return runtime.spaceLines(studentBlock.lines);
  if (studentBlock.kind === "diagram")
    return Math.max(4, Math.ceil(runtime.graphHeight(runtime.withGraphDefaults(studentBlock.graphConfig)) / 26));
  if (studentBlock.kind === "table") return Math.max(2, runtime.plainTableRows(runtime.normalizeTableBlock(studentBlock)).length + 1);
  if (studentBlock.kind === "choices") return Math.max(1, runtime.normalizeChoiceItems(studentBlock.choices).length);
  return 0;
}

export function solutionValidationFixLabel(fix?: SolutionValidationFix) {
  if (!fix) return "";
  if (fix.kind === "add-slot") return "Add solution slot";
  if (fix.kind === "add-solution") return "Add solution";
  if (fix.kind === "add-student-space") return "Add answer space";
  if (fix.kind === "increase-space") return `Set space to ${fix.lines} lines`;
  return "";
}

function isStudentReplacementBlock<
  TQuestion extends SolutionValidationQuestionLike<TPart>,
  TPart extends SolutionValidationPartLike<TSubpart>,
  TSubpart extends SolutionValidationSubpartLike,
>(block: EditorContentBlock, runtime: SolutionValidationRuntime<TQuestion, TPart, TSubpart>) {
  return runtime.contentBlockVisibility(block) === "student";
}

function isSolutionReplacementBlock<
  TQuestion extends SolutionValidationQuestionLike<TPart>,
  TPart extends SolutionValidationPartLike<TSubpart>,
  TSubpart extends SolutionValidationSubpartLike,
>(block: EditorContentBlock, runtime: SolutionValidationRuntime<TQuestion, TPart, TSubpart>) {
  return runtime.contentBlockVisibility(block) === "solution";
}

function collectReplacementSlotAnalysis<
  TQuestion extends SolutionValidationQuestionLike<TPart>,
  TPart extends SolutionValidationPartLike<TSubpart>,
  TSubpart extends SolutionValidationSubpartLike,
>(blocks: EditorContentBlock[], runtime: SolutionValidationRuntime<TQuestion, TPart, TSubpart>) {
  const slots: SolutionVisibilityReplacementSlotGroup[] = [];
  const pairedBlockIds = new Set<string>();
  for (let index = 0; index < blocks.length; index += 1) {
    const slot = runtime.visibilityReplacementSlotAt(blocks, index);
    if (!slot) continue;
    slots.push(slot);
    slot.blocks.forEach((block) => pairedBlockIds.add(block.id));
    index = slot.endIndex;
  }

  const studentBlocks = blocks.filter((block) => isStudentReplacementBlock(block, runtime));
  const solutionBlocks = blocks.filter((block) => isSolutionReplacementBlock(block, runtime));
  return {
    slots,
    studentBlocks,
    solutionBlocks,
    unpairedStudentBlocks: studentBlocks.filter((block) => !pairedBlockIds.has(block.id)),
    unpairedSolutionBlocks: solutionBlocks.filter((block) => !pairedBlockIds.has(block.id)),
  };
}

function orderedBlocksFromQuestion<
  TQuestion extends SolutionValidationQuestionLike<TPart>,
  TPart extends SolutionValidationPartLike<TSubpart>,
  TSubpart extends SolutionValidationSubpartLike,
>(question: TQuestion, runtime: SolutionValidationRuntime<TQuestion, TPart, TSubpart>) {
  return runtime
    .orderedQuestionItems(question)
    .filter((item): item is Extract<SolutionOrderedQuestionItem<TPart>, { kind: "block" }> => item.kind === "block")
    .map((item) => item.block)
    .filter((block) => block.kind !== "pageBreak");
}

function orderedBlocksFromPart<
  TQuestion extends SolutionValidationQuestionLike<TPart>,
  TPart extends SolutionValidationPartLike<TSubpart>,
  TSubpart extends SolutionValidationSubpartLike,
>(part: TPart, runtime: SolutionValidationRuntime<TQuestion, TPart, TSubpart>) {
  return runtime
    .orderedPartItems(part)
    .filter((item): item is Extract<SolutionOrderedPartItem<TSubpart>, { kind: "block" }> => item.kind === "block")
    .map((item) => item.block)
    .filter((block) => block.kind !== "pageBreak");
}

function orderedBlocksFromSubpart(subpart: SolutionValidationSubpartLike) {
  return subpart.contentBlocks.filter((block) => block.kind !== "pageBreak");
}

function validateMarkedSolutionContainer<
  TQuestion extends SolutionValidationQuestionLike<TPart>,
  TPart extends SolutionValidationPartLike<TSubpart>,
  TSubpart extends SolutionValidationSubpartLike,
>({
  issues,
  label,
  marks,
  blocks,
  anchor,
  runtime,
}: {
  issues: SolutionValidationIssue[];
  label: string;
  marks: number;
  blocks: EditorContentBlock[];
  anchor: string;
  runtime: SolutionValidationRuntime<TQuestion, TPart, TSubpart>;
}) {
  if (marks <= 0) return 0;

  const analysis = collectReplacementSlotAnalysis(blocks, runtime);
  const hasResponseSurface = blocks.some((block) => isStudentResponseSurfaceBlock(block, runtime));
  const hasSolutionContent = analysis.solutionBlocks.length > 0;
  const issuePrefix = `${label}:${marks}`;
  const defaultLines = runtime.defaultSolutionSlotLines(marks);
  const firstStudentBlock = analysis.studentBlocks[0];
  const firstUnpairedStudentBlock = analysis.unpairedStudentBlocks[0];
  const firstUnpairedSolutionBlock = analysis.unpairedSolutionBlocks[0];

  if (!hasResponseSurface) {
    issues.push({
      id: `${issuePrefix}:missing-response`,
      severity: "error",
      label,
      message: `${marks} mark${marks === 1 ? "" : "s"} but no student response surface was found.`,
      anchor,
      fix: firstUnpairedSolutionBlock
        ? { kind: "add-student-space", beforeBlockId: firstUnpairedSolutionBlock.id, lines: defaultLines }
        : { kind: "add-slot", lines: defaultLines },
    });
  }

  if (!hasSolutionContent) {
    issues.push({
      id: `${issuePrefix}:missing-solution`,
      severity: "error",
      label,
      message: "No solution module was found for this marked item.",
      anchor,
      fix: firstStudentBlock ? { kind: "add-solution", afterBlockId: firstStudentBlock.id } : { kind: "add-slot", lines: defaultLines },
    });
  } else if (!analysis.slots.length) {
    issues.push({
      id: `${issuePrefix}:unpaired-solution`,
      severity: "warning",
      label,
      message: "A solution module exists, but it is not paired with a student answer space/table.",
      anchor,
      fix: firstUnpairedSolutionBlock
        ? { kind: "add-student-space", beforeBlockId: firstUnpairedSolutionBlock.id, lines: defaultLines }
        : undefined,
    });
  }

  if (analysis.unpairedStudentBlocks.length && hasSolutionContent) {
    issues.push({
      id: `${issuePrefix}:unpaired-student`,
      severity: "warning",
      label,
      message: "A student-only response block is not adjacent to a solution module.",
      anchor,
      fix: firstUnpairedStudentBlock ? { kind: "add-solution", afterBlockId: firstUnpairedStudentBlock.id } : undefined,
    });
  }

  if (analysis.unpairedSolutionBlocks.length && analysis.slots.length) {
    issues.push({
      id: `${issuePrefix}:floating-solution`,
      severity: "warning",
      label,
      message: "One or more solution modules are outside the matched replacement slot.",
      anchor,
    });
  }

  for (const [slotIndex, slot] of analysis.slots.entries()) {
    const capacity = replacementSlotLineCapacity(slot.studentBlock, runtime);
    if (!capacity) continue;
    const estimate = slot.solutionBlocks.reduce((sum, block) => sum + solutionBlockLineEstimate(block, runtime), 0);
    const tolerance = solutionSlotToleranceLines(slot.studentBlock, runtime);
    if (estimate > capacity + tolerance) {
      const overflowLines = Math.max(1, Math.ceil(estimate - capacity));
      issues.push({
        id: `${issuePrefix}:fit-${slotIndex}`,
        severity: "warning",
        label,
        message: `The paired solution may need about ${overflowLines} more line${overflowLines === 1 ? "" : "s"} than the reserved student space.`,
        anchor,
        fix:
          slot.studentBlock.kind === "space"
            ? { kind: "increase-space", blockId: slot.studentBlock.id, lines: Math.ceil(capacity + overflowLines) }
            : undefined,
      });
    }
  }

  return 1;
}

export function validateSolutionCompleteness<
  TQuestion extends SolutionValidationQuestionLike<TPart>,
  TPart extends SolutionValidationPartLike<TSubpart>,
  TSubpart extends SolutionValidationSubpartLike,
>(questions: TQuestion[], runtime: SolutionValidationRuntime<TQuestion, TPart, TSubpart>): SolutionValidationResult {
  const issues: SolutionValidationIssue[] = [];
  let checkedItems = 0;

  questions.forEach((question, questionIndex) => {
    const questionLabel = `Question ${runtime.questionDisplayNumber(questionIndex)}`;
    if (!question.parts.length) {
      checkedItems += validateMarkedSolutionContainer({
        issues,
        label: questionLabel,
        marks: Math.max(0, Number(question.marks) || 0),
        blocks: orderedBlocksFromQuestion(question, runtime),
        anchor: runtime.questionScrollAnchor(question.id),
        runtime,
      });
      return;
    }

    question.parts.forEach((part, partIndex) => {
      const partLabel = `${questionLabel}(${runtime.alphaLabel(partIndex)})`;
      if (!part.subparts?.length) {
        checkedItems += validateMarkedSolutionContainer({
          issues,
          label: partLabel,
          marks: Math.max(0, Number(part.marks) || 0),
          blocks: orderedBlocksFromPart(part, runtime),
          anchor: runtime.partScrollAnchor(question.id, part.id),
          runtime,
        });
        return;
      }

      part.subparts.forEach((subpart, subpartIndex) => {
        checkedItems += validateMarkedSolutionContainer({
          issues,
          label: `${partLabel}(${runtime.romanLabel(subpartIndex)})`,
          marks: Math.max(0, Number(subpart.marks) || 0),
          blocks: orderedBlocksFromSubpart(subpart),
          anchor: runtime.subpartScrollAnchor(question.id, part.id, subpart.id),
          runtime,
        });
      });
    });
  });

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;
  return { checkedItems, errorCount, warningCount, issues };
}

export function solutionValidationSummary(result: SolutionValidationResult) {
  if (!result.checkedItems) return "No marked items to validate";
  if (!result.issues.length) {
    return `${result.checkedItems} marked item${result.checkedItems === 1 ? "" : "s"} checked · all have student space and solutions`;
  }
  const parts = [];
  if (result.errorCount) parts.push(`${result.errorCount} error${result.errorCount === 1 ? "" : "s"}`);
  if (result.warningCount) parts.push(`${result.warningCount} warning${result.warningCount === 1 ? "" : "s"}`);
  return `${result.checkedItems} marked item${result.checkedItems === 1 ? "" : "s"} checked · ${parts.join(", ")}`;
}
