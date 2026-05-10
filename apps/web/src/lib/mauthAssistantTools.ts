import type { ContentBlock, ContentBlockVisibility, GraphConfig } from "@mauth-studio/shared";

import {
  applyMauthDocumentActions,
  MAUTH_CONTENT_ACTION_TYPES,
  MAUTH_DOCUMENT_ACTION_TYPES,
  MAUTH_DOCUMENT_ONLY_ACTION_TYPES,
  previewMauthDocumentActions,
  type MauthActionWarning,
  type MauthDocumentAction,
  type MauthDocumentActionOptions,
  type MauthDocumentActionResult,
  type MauthDocumentLike,
  type MauthPartLike,
  type MauthQuestionLike,
  type MauthSubpartLike,
} from "./mauthActions.ts";
import {
  formatMauthActionValidationIssues,
  typedMauthDocumentActions,
  validateMauthDocumentActionPayloads,
  type MauthActionValidationIssue,
} from "./mauthActionValidation.ts";

export const MAUTH_ASSISTANT_TOOL_NAMES = [
  "mauth.tools.describe",
  "mauth.document.inspect",
  "mauth.validation.run",
  "mauth.actions.preview",
  "mauth.actions.apply",
  "mauth.author.replaceQuestion",
  "mauth.author.addDiagram",
  "mauth.author.ensureSolutions",
] as const;

export type MauthAssistantToolName = (typeof MAUTH_ASSISTANT_TOOL_NAMES)[number];
export type MauthAssistantValidationMode = "document" | "solutions" | "both";

export interface MauthAssistantToolCall {
  name: MauthAssistantToolName;
  arguments?: unknown;
}

export interface MauthAssistantToolResult<
  Q extends MauthQuestionLike = MauthQuestionLike,
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
> {
  ok: boolean;
  toolName: MauthAssistantToolName;
  data?: unknown;
  document?: MauthDocumentLike<Q, F, C>;
  changedIds: string[];
  warnings: MauthActionWarning[];
  error?: string;
}

export interface MauthAssistantActionValidationFailure {
  error: string;
  issues: MauthActionValidationIssue[];
}

export interface MauthAuthorReplaceQuestionValidationFailure {
  error: string;
  issues: MauthActionValidationIssue[];
}

export interface MauthAuthorDiagramValidationFailure {
  error: string;
  issues: MauthActionValidationIssue[];
}

export interface MauthAuthorSolutionsValidationFailure {
  error: string;
  issues: MauthActionValidationIssue[];
}

export interface MauthBlockInspection {
  id: string;
  kind: ContentBlock["kind"];
  visibility: ContentBlockVisibility;
  textPreview?: string;
  choiceCount?: number;
  tableRows?: number;
  tableColumns?: number;
  diagramType?: string;
  diagramAlign?: string;
  lines?: number;
}

export interface MauthSubpartInspection {
  id: string;
  label?: string;
  marks: number;
  pageBreakBefore: boolean;
  textPreview?: string;
  modules: MauthBlockInspection[];
}

export interface MauthPartInspection {
  id: string;
  label?: string;
  marks: number;
  pageBreakBefore: boolean;
  textPreview?: string;
  modules: MauthBlockInspection[];
  subparts: MauthSubpartInspection[];
}

export interface MauthQuestionInspection {
  id: string;
  index: number;
  marks: number;
  pageBreakAfter: boolean;
  modules: MauthBlockInspection[];
  parts: MauthPartInspection[];
  studentSpaceLines: number;
  solutionModuleCount: number;
}

export interface MauthDocumentInspection {
  frontMatter: unknown;
  frontMatterFields: string[];
  formattingConfig: unknown;
  formattingConfigFields: string[];
  counts: {
    questions: number;
    parts: number;
    subparts: number;
    marksTotal: number;
    modules: number;
    textModules: number;
    choiceModules: number;
    tableModules: number;
    diagramModules: number;
    spaceModules: number;
    pageBreakModules: number;
    studentOnlyModules: number;
    solutionOnlyModules: number;
    likelySolutionTextModules: number;
    studentSpaceLines: number;
  };
  questions: MauthQuestionInspection[];
}

export interface MauthAssistantToolDescription {
  tools: Array<{
    name: MauthAssistantToolName;
    description: string;
  }>;
  actionTypes: {
    content: readonly MauthActionTypeName[];
    documentOnly: readonly MauthActionTypeName[];
    all: readonly MauthActionTypeName[];
  };
  documentRecipes: Array<{
    id: string;
    description: string;
    actions: Array<Record<string, unknown>>;
    notes?: string[];
  }>;
  workflow: string[];
}

type MauthActionTypeName = (typeof MAUTH_DOCUMENT_ACTION_TYPES)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function compactText(value: string, maxLength = 140) {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length <= maxLength ? compacted : `${compacted.slice(0, maxLength - 1)}...`;
}

function slugPart(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "item";
}

function blockOrder(blocks: readonly ContentBlock[]) {
  return blocks.map((block) => ({ kind: "block" as const, id: block.id }));
}

function questionOrder(blocks: readonly ContentBlock[], parts: readonly MauthPartLike[]) {
  return [...blockOrder(blocks), ...parts.map((part) => ({ kind: "part" as const, id: part.id }))];
}

function positiveInteger(value: unknown, fallback: number, min = 1, max = 40) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function objectFields(value: unknown) {
  return isRecord(value) ? Object.keys(value).sort() : [];
}

function blockVisibility(block: ContentBlock): ContentBlockVisibility {
  if (block.visibility === "student" || block.studentOnly) return "student";
  if (block.visibility === "solution" || block.solutionOnly) return "solution";
  return "always";
}

function isLikelySolutionText(block: ContentBlock) {
  return block.kind === "text" && /^\s*(?:\*\*)?Solution\.?/i.test(block.text);
}

function inspectBlock(block: ContentBlock): MauthBlockInspection {
  const visibility = blockVisibility(block);
  if (block.kind === "text") {
    return {
      id: block.id,
      kind: block.kind,
      visibility,
      textPreview: compactText(block.text),
    };
  }
  if (block.kind === "choices") {
    return {
      id: block.id,
      kind: block.kind,
      visibility,
      choiceCount: block.choices.length,
    };
  }
  if (block.kind === "table") {
    return {
      id: block.id,
      kind: block.kind,
      visibility,
      tableRows: block.rows.length,
      tableColumns: Math.max(block.headers.length, ...block.rows.map((row) => row.length), 0),
    };
  }
  if (block.kind === "diagram") {
    return {
      id: block.id,
      kind: block.kind,
      visibility,
      diagramType: block.graphConfig.type,
      diagramAlign: block.diagramAlign,
    };
  }
  if (block.kind === "space") {
    return {
      id: block.id,
      kind: block.kind,
      visibility,
      lines: block.lines,
    };
  }
  return { id: block.id, kind: block.kind, visibility };
}

function inspectSubpart(subpart: MauthSubpartLike): MauthSubpartInspection {
  return {
    id: subpart.id,
    label: subpart.label,
    marks: subpart.marks,
    pageBreakBefore: !!subpart.pageBreakBefore,
    textPreview: subpart.text ? compactText(subpart.text) : undefined,
    modules: subpart.contentBlocks.map(inspectBlock),
  };
}

function inspectPart(part: MauthPartLike): MauthPartInspection {
  return {
    id: part.id,
    label: part.label,
    marks: part.marks,
    pageBreakBefore: !!part.pageBreakBefore,
    textPreview: part.text ? compactText(part.text) : undefined,
    modules: part.contentBlocks.map(inspectBlock),
    subparts: (part.subparts ?? []).map(inspectSubpart),
  };
}

function allQuestionBlocks(question: MauthQuestionLike) {
  const blocks: ContentBlock[] = [...question.contentBlocks];
  for (const part of question.parts ?? []) {
    blocks.push(...part.contentBlocks);
    for (const subpart of part.subparts ?? []) {
      blocks.push(...subpart.contentBlocks);
    }
  }
  return blocks;
}

function sumQuestionMarks(question: MauthQuestionLike) {
  const partMarks = (question.parts ?? []).reduce((sum, part) => {
    const subpartMarks = (part.subparts ?? []).reduce((subSum, subpart) => subSum + subpart.marks, 0);
    return sum + part.marks + subpartMarks;
  }, 0);
  return question.marks + partMarks;
}

function countBlock(block: ContentBlock, counts: MauthDocumentInspection["counts"]) {
  counts.modules += 1;
  const visibility = blockVisibility(block);
  if (visibility === "student") counts.studentOnlyModules += 1;
  if (visibility === "solution") counts.solutionOnlyModules += 1;
  if (isLikelySolutionText(block)) counts.likelySolutionTextModules += 1;

  if (block.kind === "text") counts.textModules += 1;
  if (block.kind === "choices") counts.choiceModules += 1;
  if (block.kind === "table") counts.tableModules += 1;
  if (block.kind === "diagram") counts.diagramModules += 1;
  if (block.kind === "space") {
    counts.spaceModules += 1;
    counts.studentSpaceLines += block.lines;
  }
  if (block.kind === "pageBreak") counts.pageBreakModules += 1;
}

export function inspectMauthDocument<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  document: MauthDocumentLike<Q, F, C>,
): MauthDocumentInspection {
  const counts: MauthDocumentInspection["counts"] = {
    questions: document.questions.length,
    parts: 0,
    subparts: 0,
    marksTotal: 0,
    modules: 0,
    textModules: 0,
    choiceModules: 0,
    tableModules: 0,
    diagramModules: 0,
    spaceModules: 0,
    pageBreakModules: 0,
    studentOnlyModules: 0,
    solutionOnlyModules: 0,
    likelySolutionTextModules: 0,
    studentSpaceLines: 0,
  };

  const questions = document.questions.map((question, index) => {
    const blocks = allQuestionBlocks(question);
    const studentSpaceLines = blocks.reduce((sum, block) => (block.kind === "space" ? sum + block.lines : sum), 0);
    const solutionModuleCount = blocks.filter((block) => blockVisibility(block) === "solution").length;
    counts.parts += question.parts?.length ?? 0;
    counts.subparts += (question.parts ?? []).reduce((sum, part) => sum + (part.subparts?.length ?? 0), 0);
    counts.marksTotal += sumQuestionMarks(question);
    for (const block of blocks) countBlock(block, counts);

    return {
      id: question.id,
      index,
      marks: question.marks,
      pageBreakAfter: !!question.pageBreakAfter,
      modules: question.contentBlocks.map(inspectBlock),
      parts: (question.parts ?? []).map(inspectPart),
      studentSpaceLines,
      solutionModuleCount,
    };
  });

  return {
    frontMatter: document.frontMatter,
    frontMatterFields: objectFields(document.frontMatter),
    formattingConfig: document.formattingConfig,
    formattingConfigFields: objectFields(document.formattingConfig),
    counts,
    questions,
  };
}

export function describeMauthAssistantTools(): MauthAssistantToolDescription {
  return {
    tools: [
      {
        name: "mauth.tools.describe",
        description: "List supported assistant tools and Mauth document action types.",
      },
      {
        name: "mauth.document.inspect",
        description: "Return a compact structural summary of the currently open Mauth document.",
      },
      {
        name: "mauth.validation.run",
        description: "Run document validation, solution validation, or both without changing the document.",
      },
      {
        name: "mauth.actions.preview",
        description: "Dry-run one or more Mauth document actions and return the proposed result plus preview summary.",
      },
      {
        name: "mauth.actions.apply",
        description: "Apply one or more Mauth document actions. The caller must commit the returned document through editor history.",
      },
      {
        name: "mauth.author.replaceQuestion",
        description:
          "Replace one existing question from a compact authoring payload. The tool builds the Mauth modules, student-only answer space, solution-only solution text, validates the generated action batch, and applies it.",
      },
      {
        name: "mauth.author.addDiagram",
        description:
          "Add a diagram to one existing question from a real Mauth graphConfig. Choose graphConfig.type first: geometricConstruction for Penrose geometry, graph2d for coordinate/function graphs, vector2d for coordinate vectors, statsChart for statistics, setDiagram for Venn diagrams, graph3d for 3D, or image for uploads.",
      },
      {
        name: "mauth.author.ensureSolutions",
        description:
          "Add or replace solution-only worked solutions and ensure matching student-only answer spaces for existing questions or parts.",
      },
    ],
    actionTypes: {
      content: MAUTH_CONTENT_ACTION_TYPES,
      documentOnly: MAUTH_DOCUMENT_ONLY_ACTION_TYPES,
      all: MAUTH_DOCUMENT_ACTION_TYPES,
    },
    documentRecipes: [
      {
        id: "school-exam-front-matter",
        description:
          "Switch an existing paper to the school exam booklet template with a school-logo cover, running headers, structure table, and supplementary pages.",
        actions: [
          {
            type: "frontMatter.update",
            patch: {
              titlePageTemplate: "exam",
              showAssessmentSubtitle: true,
              showDeclaration: false,
              showInstructions: false,
              exam: {
                sectionPreset: "section-one-calculator-free",
                examHeading: "Semester One Examination, 2021",
                bookletTitle: "Question/Answer booklet",
                courseHeader: "METHODS UNIT 3",
                sectionHeader: "CALCULATOR-FREE",
                readingTime: "five minutes",
                workingTime: "fifty minutes",
                supervisorMaterials: "This Question/Answer booklet\nFormula sheet",
                specialItems: "nil",
                structureRows: [
                  {
                    id: "section-one",
                    section: "Section One:\nCalculator-free",
                    useCurrentDocument: true,
                    questionsAvailable: 9,
                    questionsToBeAnswered: 9,
                    workingTimeMinutes: 50,
                    marksAvailable: 53,
                    percentage: 35,
                  },
                  {
                    id: "section-two",
                    section: "Section Two:\nCalculator-assumed",
                    useCurrentDocument: false,
                    questionsAvailable: 12,
                    questionsToBeAnswered: 12,
                    workingTimeMinutes: 100,
                    marksAvailable: 97,
                    percentage: 65,
                  },
                ],
                footerText: "See next page",
                endOfQuestionsFooterText: "End of questions",
                supplementaryPageTitle: "Supplementary page",
                supplementaryQuestionNumberLabel: "Question number:",
                supplementaryPageCount: 0,
              },
            },
          },
          {
            type: "formatting.update",
            patch: { id: "exam-booklet" },
          },
        ],
        notes: [
          'Use frontMatter.titlePageTemplate: "exam" for school exam booklets. This is the only active exam style.',
          'Use frontMatter.exam.sectionPreset: "section-one-calculator-free" or "section-two-calculator-assumed" to select the current exam section.',
          "Use the selected frontMatter.logoId from the logo bank for the school logo and school name.",
          "Put all exam cover, structure, header/footer, cut-off strip, and supplementary-page fields under frontMatter.exam rather than fake question modules.",
          "Set useCurrentDocument: true on the structure row that represents the open paper.",
          "For Section Two: Calculator-assumed, use CALCULATOR-ASSUMED, ten minutes reading time, one hundred minutes working time, formula sheet retained from Section One, and calculator/CAS special items.",
        ],
      },
    ],
    workflow: [
      "Inspect the current document before proposing edits.",
      "For focused one-question writing or replacement requests, prefer mauth.author.replaceQuestion.",
      "For focused diagram follow-ups, prefer mauth.author.addDiagram with a renderer-specific graphConfig.",
      "For solution-key passes, prefer mauth.author.ensureSolutions when the supplied question text is enough.",
      "Preview generated actions with mauth.actions.preview.",
      "Run validation for solution or whole-document passes.",
      "Apply the same validated action batch with mauth.actions.apply.",
      "Commit the returned document through the editor history/autosave path, not by mutating state directly.",
    ],
  };
}

function failTool(toolName: MauthAssistantToolName, error: string, data?: unknown): MauthAssistantToolResult {
  return {
    ok: false,
    toolName,
    data,
    changedIds: [],
    warnings: [{ code: "assistant-tool-not-applied", message: error }],
    error,
  };
}

function knownActionType(type: string): type is MauthActionTypeName {
  return (MAUTH_DOCUMENT_ACTION_TYPES as readonly string[]).includes(type);
}

function parseJsonValue(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function actionInputFromValue(value: unknown): unknown {
  const parsedValue = typeof value === "string" ? parseJsonValue(value) : value;
  if (!isRecord(parsedValue)) return parsedValue;

  const nestedArguments = parsedValue.arguments ?? parsedValue.args ?? parsedValue.mauthArguments;
  const toolName = typeof parsedValue.name === "string" ? parsedValue.name : typeof parsedValue.tool === "string" ? parsedValue.tool : "";
  if (isRecord(nestedArguments) && (!toolName || toolName.startsWith("mauth.actions."))) {
    return actionInputFromValue(nestedArguments);
  }

  const nestedCall = parsedValue.call ?? parsedValue.toolCall;
  if (nestedCall !== undefined) return actionInputFromValue(nestedCall);

  return parsedValue;
}

function actionValuesFromInput(value: unknown): unknown[] | string {
  const input = actionInputFromValue(value);
  if (isRecord(input) && "actions" in input) {
    const actions = actionInputFromValue(input.actions);
    if (Array.isArray(actions)) return actions.flatMap((action) => actionValuesFromInput(action));
    return actionValuesFromInput(actions);
  }
  if (isRecord(input) && "action" in input) {
    return actionValuesFromInput(input.action);
  }
  if (Array.isArray(input)) {
    return input.flatMap((action) => actionValuesFromInput(action));
  }
  return input === undefined ? "Expected an action object or an actions array." : [input];
}

function parseActionList(value: unknown): MauthDocumentAction[] | MauthAssistantActionValidationFailure {
  const actionValues = actionValuesFromInput(value);
  if (typeof actionValues === "string") return { error: actionValues, issues: [] };
  if (!actionValues.length) return { error: "Expected an action object or an actions array.", issues: [] };

  for (const action of actionValues) {
    if (!isRecord(action) || typeof action.type !== "string") {
      return {
        error: "Every Mauth action must be an object with a string type.",
        issues: [{ path: "actions", message: "must contain only objects with a string type", expected: "MauthDocumentAction[]" }],
      };
    }
    if (!knownActionType(action.type)) {
      return {
        error: `Unsupported Mauth action type: ${action.type}`,
        issues: [{ path: "actions[].type", message: `unsupported action type: ${action.type}`, expected: "MauthDocumentAction.type" }],
      };
    }
  }

  const validation = validateMauthDocumentActionPayloads(actionValues);
  if (!validation.ok) {
    return {
      error: formatMauthActionValidationIssues(validation.issues),
      issues: validation.issues,
    };
  }

  return typedMauthDocumentActions(actionValues);
}

function validationMode(args: unknown): MauthAssistantValidationMode {
  if (!isRecord(args) || typeof args.mode !== "string") return "both";
  return args.mode === "document" || args.mode === "solutions" || args.mode === "both" ? args.mode : "both";
}

function replaceQuestionTarget<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  args: Record<string, unknown>,
  issues: MauthActionValidationIssue[],
) {
  if (typeof args.questionId === "string" && args.questionId.trim()) {
    const question = questions.find((item) => item.id === args.questionId);
    if (!question) issues.push({ path: "arguments.questionId", message: "must reference an existing question", expected: "question id" });
    return question;
  }

  const questionNumber = typeof args.questionNumber === "number" ? args.questionNumber : Number(args.questionNumber ?? 1);
  if (!Number.isInteger(questionNumber) || questionNumber < 1) {
    issues.push({ path: "arguments.questionNumber", message: "must be a positive integer", expected: "1-based question number" });
    return undefined;
  }

  const question = questions[questionNumber - 1];
  if (!question) {
    issues.push({ path: "arguments.questionNumber", message: "must reference an existing question", expected: `1 to ${questions.length}` });
  }
  return question;
}

function textFromArgs(args: Record<string, unknown>) {
  const value = args.questionText ?? args.text ?? args.prompt;
  return typeof value === "string" ? value.trim() : "";
}

function optionalTextArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function authorBlockId(questionId: string, suffix: string) {
  return `${questionId}-${slugPart(suffix)}`;
}

const MARK_TICK_ANNOTATION_PATTERN = /\[\[\s*marks\s*:\s*(\d+)\s*\]\]/gi;
const TRAILING_VISIBLE_MARK_NOTE_PATTERN = /\s*(?:\[(\d+)\s*marks?(?:[^\]]*)\]|\((\d+)\s*marks?(?:[^)]*)\))\s*$/i;
const SOLUTION_HEADING_PATTERN = /^\s*(?:\*\*)?Solution(?:\s*\(\s*\d+\s*marks?\s*\))?\.?(?:\*\*)?\s*/i;

function normalizeSolutionMarkAnnotations(value: string) {
  return value
    .replace(MARK_TICK_ANNOTATION_PATTERN, (_, count: string) => `[[marks:${count}]]`)
    .split("\n")
    .map((line) =>
      line.replace(TRAILING_VISIBLE_MARK_NOTE_PATTERN, (_match, squareCount: string | undefined, roundCount: string | undefined) => {
        const count = squareCount ?? roundCount;
        return count ? ` [[marks:${count}]]` : "";
      }),
    )
    .join("\n");
}

function solutionBlockText(value: string) {
  const normalized = normalizeSolutionMarkAnnotations(value.trim());
  if (!SOLUTION_HEADING_PATTERN.test(normalized)) return `**Solution.**\n\n${normalized}`;
  const body = normalized.replace(SOLUTION_HEADING_PATTERN, "").trimStart();
  return body ? `**Solution.**\n\n${body}` : "**Solution.**\n\n";
}

function diagramBlocksFromArgs(args: Record<string, unknown>, questionId: string, issues: MauthActionValidationIssue[]) {
  const rawDiagrams = Array.isArray(args.diagrams) ? args.diagrams : args.diagram ? [args.diagram] : [];
  const blocks: ContentBlock[] = [];
  const defaultDiagramAlign =
    args.diagramAlign === "left" || args.diagramAlign === "center" || args.diagramAlign === "right" ? args.diagramAlign : undefined;

  rawDiagrams.forEach((entry, index) => {
    const entryPath = rawDiagrams.length === 1 && args.diagram ? "arguments.diagram" : `arguments.diagrams[${index}]`;
    if (!isRecord(entry)) {
      issues.push({ path: entryPath, message: "must be a diagram object", expected: "{ graphConfig, diagramAlign? }" });
      return;
    }
    const graphConfig = isRecord(entry.graphConfig) ? entry.graphConfig : isRecord(entry.config) ? entry.config : entry;
    if (!isRecord(graphConfig) || typeof graphConfig.type !== "string") {
      issues.push({
        path: `${entryPath}.graphConfig`,
        message: "must contain a graphConfig with a supported type",
        expected: "GraphConfig",
      });
      return;
    }
    const diagramAlign =
      entry.diagramAlign === "left" || entry.diagramAlign === "center" || entry.diagramAlign === "right"
        ? entry.diagramAlign
        : defaultDiagramAlign;
    const diagramTextSide =
      entry.diagramTextSide === "none" || entry.diagramTextSide === "left" || entry.diagramTextSide === "right"
        ? entry.diagramTextSide
        : undefined;
    blocks.push({
      id: String(entry.id ?? authorBlockId(questionId, `diagram-${index + 1}`)),
      kind: "diagram",
      graphConfig: graphConfig as unknown as GraphConfig,
      ...(diagramAlign ? { diagramAlign } : {}),
      ...(diagramTextSide ? { diagramTextSide } : {}),
    } as ContentBlock);
  });

  return blocks;
}

function contentBlocksForAuthorQuestion(args: Record<string, unknown>, questionId: string, issues: MauthActionValidationIssue[]) {
  const text = textFromArgs(args);
  const solutionText = optionalTextArg(args, "solutionText") || optionalTextArg(args, "solution");
  const includeSolution = args.includeSolution !== false && Boolean(solutionText);
  const hasParts = Array.isArray(args.parts) && args.parts.length > 0;
  const studentSpaceLines = positiveInteger(args.studentSpaceLines ?? args.answerLines ?? args.lines, 10, 1, 40);
  const blocks: ContentBlock[] = [
    {
      id: authorBlockId(questionId, "question-text"),
      kind: "text",
      text,
    },
    ...diagramBlocksFromArgs(args, questionId, issues),
  ];

  if (!hasParts) {
    blocks.push({
      id: authorBlockId(questionId, "student-space"),
      kind: "space",
      lines: studentSpaceLines,
      visibility: "student",
    });
  }

  if (includeSolution && !hasParts) {
    blocks.push({
      id: authorBlockId(questionId, "solution"),
      kind: "text",
      text: solutionBlockText(solutionText),
      visibility: "solution",
    });
  }

  return blocks;
}

function authorPartLabel(index: number, value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim().replace(/[().]/g, "");
  return String.fromCharCode(97 + index);
}

function partTextFromArgs(args: Record<string, unknown>) {
  const value = args.text ?? args.partText ?? args.questionText ?? args.prompt;
  return typeof value === "string" ? value.trim() : "";
}

function contentBlocksForAuthorPart(args: Record<string, unknown>, partId: string, issues: MauthActionValidationIssue[]) {
  const solutionText = optionalTextArg(args, "solutionText") || optionalTextArg(args, "solution");
  const includeSolution = args.includeSolution !== false && Boolean(solutionText);
  const studentSpaceLines = positiveInteger(args.studentSpaceLines ?? args.answerLines ?? args.lines, 6, 1, 40);
  const blocks: ContentBlock[] = [
    ...diagramBlocksFromArgs(args, partId, issues),
    {
      id: authorBlockId(partId, "student-space"),
      kind: "space",
      lines: studentSpaceLines,
      visibility: "student",
    },
  ];

  if (includeSolution) {
    blocks.push({
      id: authorBlockId(partId, "solution"),
      kind: "text",
      text: solutionBlockText(solutionText),
      visibility: "solution",
    });
  }

  return blocks;
}

function authorPartsFromArgs(args: Record<string, unknown>, questionId: string, issues: MauthActionValidationIssue[]) {
  const rawParts = Array.isArray(args.parts) ? args.parts : [];
  const parts: MauthPartLike[] = [];

  rawParts.forEach((entry, index) => {
    const path = `arguments.parts[${index}]`;
    if (!isRecord(entry)) {
      issues.push({ path, message: "must be a part object", expected: "{ text, marks, studentSpaceLines, solutionText }" });
      return;
    }
    const text = partTextFromArgs(entry);
    if (!text) issues.push({ path: `${path}.text`, message: "must be a non-empty string", expected: "part prompt text" });
    const partId = String(entry.id ?? authorBlockId(questionId, `part-${index + 1}`));
    const contentBlocks = contentBlocksForAuthorPart(entry, partId, issues);
    parts.push({
      id: partId,
      label: authorPartLabel(index, entry.label),
      marks: positiveInteger(entry.marks, 1, 0, 100),
      text,
      contentBlocks,
      subparts: [],
      itemOrder: blockOrder(contentBlocks),
      pageBreakBefore: entry.pageBreakBefore === true,
    });
  });

  return parts;
}

function parseAuthorReplaceQuestionActions<Q extends MauthQuestionLike, F extends object, C extends object>(
  document: MauthDocumentLike<Q, F, C>,
  args: unknown,
): MauthDocumentAction[] | MauthAuthorReplaceQuestionValidationFailure {
  const issues: MauthActionValidationIssue[] = [];
  if (!isRecord(args)) {
    return {
      error: "mauth.author.replaceQuestion arguments must be an object.",
      issues: [{ path: "arguments", message: "must be an object", expected: "replace-question payload" }],
    };
  }

  const question = replaceQuestionTarget(document.questions, args, issues);
  const text = textFromArgs(args);
  if (!text) issues.push({ path: "arguments.questionText", message: "must be a non-empty string", expected: "question text" });

  if (issues.length || !question) {
    return {
      error: formatMauthActionValidationIssues(issues),
      issues,
    };
  }

  const marks = positiveInteger(args.marks, question.marks || 1, 0, 100);
  const contentBlocks = contentBlocksForAuthorQuestion(args, question.id, issues);
  const parts = authorPartsFromArgs(args, question.id, issues);
  if (issues.length) {
    return {
      error: formatMauthActionValidationIssues(issues),
      issues,
    };
  }

  const generatedQuestion = {
    ...question,
    marks: parts.length ? positiveInteger(args.questionMarks, 0, 0, 100) : marks,
    contentBlocks,
    parts,
    itemOrder: questionOrder(contentBlocks, parts),
  };
  const generatedQuestionValidation = validateMauthDocumentActionPayloads([
    {
      type: "question.add",
      question: generatedQuestion,
    },
  ]);
  if (!generatedQuestionValidation.ok) {
    return {
      error: formatMauthActionValidationIssues(generatedQuestionValidation.issues),
      issues: generatedQuestionValidation.issues,
    };
  }

  const actions: MauthDocumentAction[] = [
    {
      type: "question.update",
      questionId: question.id,
      patch: {
        marks: generatedQuestion.marks,
        contentBlocks,
        parts,
        itemOrder: generatedQuestion.itemOrder,
      },
    },
  ];
  const validation = validateMauthDocumentActionPayloads(actions);
  if (!validation.ok) {
    return {
      error: formatMauthActionValidationIssues(validation.issues),
      issues: validation.issues,
    };
  }

  return actions;
}

function diagramInsertionIndex(blocks: readonly ContentBlock[], placement: unknown) {
  if (placement === "afterQuestionText") {
    const textIndex = blocks.findIndex((block) => block.kind === "text" && block.visibility !== "solution");
    return textIndex >= 0 ? textIndex + 1 : 0;
  }
  if (placement === "end") {
    const firstSolutionIndex = blocks.findIndex((block) => block.visibility === "solution");
    return firstSolutionIndex >= 0 ? firstSolutionIndex : blocks.length;
  }
  const studentSpaceIndex = blocks.findIndex((block) => block.kind === "space" && block.visibility === "student");
  if (studentSpaceIndex >= 0) return studentSpaceIndex;
  const firstSolutionIndex = blocks.findIndex((block) => block.visibility === "solution");
  if (firstSolutionIndex >= 0) return firstSolutionIndex;
  const textIndex = blocks.findIndex((block) => block.kind === "text" && block.visibility !== "solution");
  return textIndex >= 0 ? textIndex + 1 : blocks.length;
}

function parseAuthorAddDiagramActions<Q extends MauthQuestionLike, F extends object, C extends object>(
  document: MauthDocumentLike<Q, F, C>,
  args: unknown,
): MauthDocumentAction[] | MauthAuthorDiagramValidationFailure {
  const issues: MauthActionValidationIssue[] = [];
  if (!isRecord(args)) {
    return {
      error: "mauth.author.addDiagram arguments must be an object.",
      issues: [{ path: "arguments", message: "must be an object", expected: "diagram payload" }],
    };
  }

  const question = replaceQuestionTarget(document.questions, args, issues);
  if (issues.length || !question) {
    return {
      error: formatMauthActionValidationIssues(issues),
      issues,
    };
  }

  const customBlocks = diagramBlocksFromArgs(args, question.id, issues);
  const diagramBlock = customBlocks[0];
  if (!diagramBlock) {
    issues.push({
      path: "arguments.diagram",
      message: "must provide a custom diagram graphConfig",
      expected: "{ graphConfig }",
    });
  }
  if (issues.length || !diagramBlock) {
    return {
      error: formatMauthActionValidationIssues(issues),
      issues,
    };
  }
  if (diagramBlock.kind !== "diagram") {
    return {
      error: "Generated diagram block was not a diagram.",
      issues: [{ path: "arguments.diagram", message: "must resolve to a diagram block", expected: "diagram block" }],
    };
  }

  const sourceBlocks = [...question.contentBlocks];
  const insertIndex = diagramInsertionIndex(sourceBlocks, args.placement);
  const contentBlocks = [...sourceBlocks.slice(0, insertIndex), diagramBlock, ...sourceBlocks.slice(insertIndex)];
  const parts = question.parts ?? [];
  const generatedQuestion = {
    ...question,
    contentBlocks,
    itemOrder: questionOrder(contentBlocks, parts),
  };
  const generatedQuestionValidation = validateMauthDocumentActionPayloads([
    {
      type: "question.add",
      question: generatedQuestion,
    },
  ]);
  if (!generatedQuestionValidation.ok) {
    return {
      error: formatMauthActionValidationIssues(generatedQuestionValidation.issues),
      issues: generatedQuestionValidation.issues,
    };
  }

  return [
    {
      type: "question.update",
      questionId: question.id,
      patch: {
        contentBlocks,
        itemOrder: generatedQuestion.itemOrder,
      },
    },
  ];
}

function blocksWithEnsuredSolution(scopeId: string, blocks: readonly ContentBlock[], solutionText: string, requestedLines: unknown) {
  const lines = positiveInteger(requestedLines, 8, 1, 60);
  const withoutSolutions = blocks.filter((block) => block.visibility !== "solution");
  const existingSpaceIndex = withoutSolutions.findIndex((block) => block.kind === "space" && block.visibility === "student");
  const withSpace =
    existingSpaceIndex >= 0
      ? withoutSolutions.map((block, index) =>
          index === existingSpaceIndex && block.kind === "space" ? { ...block, lines: Math.max(block.lines, lines) } : block,
        )
      : [
          ...withoutSolutions,
          {
            id: authorBlockId(scopeId, "student-space"),
            kind: "space" as const,
            lines,
            visibility: "student" as const,
          },
        ];
  return [
    ...withSpace,
    {
      id: authorBlockId(scopeId, "solution"),
      kind: "text" as const,
      text: solutionBlockText(solutionText),
      visibility: "solution" as const,
    },
  ];
}

function partSolutionTarget(part: MauthPartLike, entry: Record<string, unknown>, index: number) {
  if (typeof entry.partId === "string" && entry.partId.trim()) return part.id === entry.partId;
  if (typeof entry.label === "string" && entry.label.trim()) return (part.label ?? "").toLowerCase() === entry.label.trim().toLowerCase();
  return index === 0;
}

function parseAuthorEnsureSolutionsActions<Q extends MauthQuestionLike, F extends object, C extends object>(
  document: MauthDocumentLike<Q, F, C>,
  args: unknown,
): MauthDocumentAction[] | MauthAuthorSolutionsValidationFailure {
  const issues: MauthActionValidationIssue[] = [];
  if (!isRecord(args) || !Array.isArray(args.questions)) {
    return {
      error: "mauth.author.ensureSolutions arguments must contain a questions array.",
      issues: [{ path: "arguments.questions", message: "must be an array", expected: "solution payload[]" }],
    };
  }

  const actions: MauthDocumentAction[] = [];
  args.questions.forEach((entry, questionIndex) => {
    const path = `arguments.questions[${questionIndex}]`;
    if (!isRecord(entry)) {
      issues.push({ path, message: "must be a question solution object", expected: "{ questionNumber, solutionText }" });
      return;
    }
    const question = replaceQuestionTarget(document.questions, entry, issues);
    const solutionText = optionalTextArg(entry, "solutionText") || optionalTextArg(entry, "solution");
    if (!solutionText) issues.push({ path: `${path}.solutionText`, message: "must be a non-empty string", expected: "solution text" });
    if (!question || !solutionText) return;

    const partPayloads = Array.isArray(entry.parts) ? entry.parts.filter(isRecord) : [];
    if (partPayloads.length && question.parts?.length) {
      const parts = question.parts.map((part) => {
        const partPayload = partPayloads.find((candidate, candidateIndex) => partSolutionTarget(part, candidate, candidateIndex));
        if (!partPayload) return part;
        const partSolutionText = optionalTextArg(partPayload, "solutionText") || optionalTextArg(partPayload, "solution");
        if (!partSolutionText) {
          issues.push({
            path: `${path}.parts[${partPayloads.indexOf(partPayload)}].solutionText`,
            message: "must be a non-empty string",
            expected: "solution text",
          });
          return part;
        }
        const contentBlocks = blocksWithEnsuredSolution(part.id, part.contentBlocks, partSolutionText, partPayload.studentSpaceLines);
        return {
          ...part,
          contentBlocks,
          itemOrder: blockOrder(contentBlocks),
        };
      });
      actions.push({
        type: "question.update",
        questionId: question.id,
        patch: {
          parts,
          itemOrder: questionOrder(question.contentBlocks, parts),
        },
      });
      return;
    }

    const contentBlocks = blocksWithEnsuredSolution(question.id, question.contentBlocks, solutionText, entry.studentSpaceLines);
    actions.push({
      type: "question.update",
      questionId: question.id,
      patch: {
        contentBlocks,
        itemOrder: questionOrder(contentBlocks, question.parts ?? []),
      },
    });
  });

  if (issues.length) {
    return {
      error: formatMauthActionValidationIssues(issues),
      issues,
    };
  }
  const validation = validateMauthDocumentActionPayloads(actions);
  if (!validation.ok) {
    return {
      error: formatMauthActionValidationIssues(validation.issues),
      issues: validation.issues,
    };
  }
  return actions;
}

function resultTool<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  toolName: MauthAssistantToolName,
  result: MauthDocumentActionResult<Q, F, C>,
): MauthAssistantToolResult<Q, F, C> {
  return {
    ok: result.ok,
    toolName,
    data: result,
    document: result.document,
    changedIds: result.changedIds,
    warnings: result.warnings,
    error: result.error,
  };
}

function validationToolResult<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  document: MauthDocumentLike<Q, F, C>,
  mode: MauthAssistantValidationMode,
  options: MauthDocumentActionOptions<Q, F, C>,
): MauthAssistantToolResult<Q, F, C> {
  const warnings: MauthActionWarning[] = [];
  const data: { document?: unknown; solutions?: unknown } = {};
  let ok = true;
  let error: string | undefined;

  if (mode === "document" || mode === "both") {
    const result = applyMauthDocumentActions(document, [{ type: "document.validation.run" }], { ...options, dryRun: true });
    ok = ok && result.ok;
    warnings.push(...result.warnings);
    data.document = result.validation;
    error = error ?? result.error;
  }

  if (mode === "solutions" || mode === "both") {
    const result = applyMauthDocumentActions(document, [{ type: "validation.solution.run" }], { ...options, dryRun: true });
    ok = ok && result.ok;
    warnings.push(...result.warnings);
    data.solutions = result.validation;
    error = error ?? result.error;
  }

  return {
    ok,
    toolName: "mauth.validation.run",
    data,
    document,
    changedIds: [],
    warnings,
    error,
  };
}

export function runMauthAssistantTool<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  document: MauthDocumentLike<Q, F, C>,
  call: MauthAssistantToolCall,
  options: MauthDocumentActionOptions<Q, F, C> = {},
): MauthAssistantToolResult<Q, F, C> {
  if (!MAUTH_ASSISTANT_TOOL_NAMES.includes(call.name)) {
    return failTool(call.name, `Unsupported assistant tool: ${call.name}`) as MauthAssistantToolResult<Q, F, C>;
  }

  if (call.name === "mauth.tools.describe") {
    return {
      ok: true,
      toolName: call.name,
      data: describeMauthAssistantTools(),
      document,
      changedIds: [],
      warnings: [],
    };
  }

  if (call.name === "mauth.document.inspect") {
    return {
      ok: true,
      toolName: call.name,
      data: inspectMauthDocument(document),
      document,
      changedIds: [],
      warnings: [],
    };
  }

  if (call.name === "mauth.validation.run") {
    return validationToolResult(document, validationMode(call.arguments), options);
  }

  if (call.name === "mauth.author.replaceQuestion") {
    const actions = parseAuthorReplaceQuestionActions(document, call.arguments);
    if (!Array.isArray(actions)) {
      return failTool(call.name, actions.error, { validationIssues: actions.issues }) as MauthAssistantToolResult<Q, F, C>;
    }
    return resultTool(call.name, applyMauthDocumentActions(document, actions, options));
  }

  if (call.name === "mauth.author.addDiagram") {
    const actions = parseAuthorAddDiagramActions(document, call.arguments);
    if (!Array.isArray(actions)) {
      return failTool(call.name, actions.error, { validationIssues: actions.issues }) as MauthAssistantToolResult<Q, F, C>;
    }
    return resultTool(call.name, applyMauthDocumentActions(document, actions, options));
  }

  if (call.name === "mauth.author.ensureSolutions") {
    const actions = parseAuthorEnsureSolutionsActions(document, call.arguments);
    if (!Array.isArray(actions)) {
      return failTool(call.name, actions.error, { validationIssues: actions.issues }) as MauthAssistantToolResult<Q, F, C>;
    }
    return resultTool(call.name, applyMauthDocumentActions(document, actions, options));
  }

  const actions = parseActionList(call.arguments);
  if (!Array.isArray(actions)) {
    return failTool(call.name, actions.error, { validationIssues: actions.issues }) as MauthAssistantToolResult<Q, F, C>;
  }

  if (call.name === "mauth.actions.preview") {
    return resultTool(call.name, previewMauthDocumentActions(document, actions, options));
  }

  if (call.name === "mauth.actions.apply") {
    return resultTool(call.name, applyMauthDocumentActions(document, actions, options));
  }

  return failTool(call.name, `Unsupported assistant tool: ${call.name}`) as MauthAssistantToolResult<Q, F, C>;
}
