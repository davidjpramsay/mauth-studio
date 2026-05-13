import type { ContentBlock, ContentBlockVisibility, GraphConfig, TextContentBlock } from "@mauth-studio/shared";

import {
  applyMauthDocumentActions,
  MAUTH_CONTENT_ACTION_TYPES,
  MAUTH_DOCUMENT_ACTION_TYPES,
  MAUTH_DOCUMENT_ONLY_ACTION_TYPES,
  previewMauthDocumentActions,
  type MauthActionWarning,
  type MauthContentScope,
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
import { inspectDiagramSemantics } from "./mauthDiagramSemanticInspection.ts";

export const MAUTH_ASSISTANT_TOOL_NAMES = [
  "mauth.tools.describe",
  "mauth.document.inspect",
  "mauth.preview.inspect",
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

export interface MauthRenderedPreviewRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface MauthRenderedPreviewPageMetrics {
  pageIndex: number;
  pageNumber: number;
  usedHeightPx: number;
  totalHeightPx: number;
  remainingHeightPx: number;
  usedPercent: number;
  anchorCount: number;
  overflow: boolean;
}

export interface MauthRenderedPreviewAnchorMetrics {
  anchor: string;
  kind: MauthPreviewTargetInspection["kind"];
  role: "module" | "structure" | "unknown";
  pageIndex: number | null;
  pageNumber?: number;
  selected: boolean;
  viewportRect: MauthRenderedPreviewRect;
  pageRelativeRect?: MauthRenderedPreviewRect;
  textPreview?: string;
  diagram?: {
    found: boolean;
    rendered: boolean;
    errorText?: string;
    viewportRect?: MauthRenderedPreviewRect;
  };
  solutionSlot?: {
    found: boolean;
    studentHeightPx: number;
    solutionHeightPx: number;
    solutionFitsStudentSpace: boolean;
    warningText?: string;
  };
  responseSpace?: {
    found: boolean;
    outlineAvailable: boolean;
    slotRect: MauthRenderedPreviewRect;
    diagramRect?: MauthRenderedPreviewRect;
    spaceRect?: MauthRenderedPreviewRect;
  };
  warnings: MauthPreviewInspectionWarning[];
}

export interface MauthRenderedPreviewMetricsAvailable {
  available: true;
  source: "browser-preview";
  activeAnchor?: string | null;
  pageCount: number;
  pages: MauthRenderedPreviewPageMetrics[];
  anchors: MauthRenderedPreviewAnchorMetrics[];
  warnings: MauthPreviewInspectionWarning[];
}

export type MauthPreviewRenderedMetrics =
  | MauthRenderedPreviewMetricsAvailable
  | {
      available: false;
      reason: string;
    };

export interface MauthAssistantToolContext {
  activeAnchor?: string | null;
  renderedMetrics?: MauthPreviewRenderedMetrics | null;
}

export interface MauthAssistantToolOptions<
  Q extends MauthQuestionLike = MauthQuestionLike,
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
> extends MauthDocumentActionOptions<Q, F, C> {
  assistantContext?: MauthAssistantToolContext;
}

export interface MauthPreviewInspectionWarning {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  anchor?: string;
  targetId?: string;
  path?: string;
}

export interface MauthPreviewTargetInspection {
  kind: "frontMatter" | "pageBreak" | "question" | "questionBlock" | "part" | "partBlock" | "subpart" | "subpartBlock" | "unknown";
  anchor?: string;
  questionId?: string;
  questionNumber?: number;
  partId?: string;
  subpartId?: string;
  blockId?: string;
}

export interface MauthSolutionScopeInspection {
  kind: "question" | "part" | "subpart";
  anchor: string;
  label: string;
  marks: number;
  studentSpaceLines: number;
  solutionModuleCount: number;
  hiddenMarkTotal: number;
  visibleMarkNoteCount: number;
}

export interface MauthPreviewDiagramInspection {
  id: string;
  anchor: string;
  graphType: string;
  align?: string;
  textSide?: string;
  visibility: ContentBlockVisibility;
  semanticChecks: string[];
  semanticWarnings: MauthPreviewInspectionWarning[];
  besideCandidate?: {
    blockId: string;
    anchor: string;
    kind: ContentBlock["kind"];
    expectedSide: "left" | "right";
    replacementSlot: boolean;
  };
}

export interface MauthPreviewQuestionInspection extends MauthQuestionInspection {
  questionNumber: number;
  totalMarks: number;
  selectedBlock?: MauthBlockInspection & { anchor: string; owner: string };
  allModules: Array<MauthBlockInspection & { anchor: string; owner: string }>;
  diagrams: MauthPreviewDiagramInspection[];
  solutionScopes: MauthSolutionScopeInspection[];
  warnings: MauthPreviewInspectionWarning[];
}

export interface MauthPreviewInspection {
  scope: "selection" | "question" | "document";
  activeAnchor?: string | null;
  target: MauthPreviewTargetInspection;
  question?: MauthPreviewQuestionInspection;
  questions?: Array<
    Pick<MauthPreviewQuestionInspection, "id" | "questionNumber" | "totalMarks" | "studentSpaceLines" | "solutionModuleCount" | "warnings">
  >;
  warnings: MauthPreviewInspectionWarning[];
  renderedMetrics: MauthPreviewRenderedMetrics;
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

const ASSISTANT_FRONT_MATTER_ANCHOR = "front-matter";

function questionAnchor(questionId: string) {
  return `q:${questionId}`;
}

function questionBlockAnchor(questionId: string, blockId: string) {
  return `${questionAnchor(questionId)}/b:${blockId}`;
}

function partAnchor(questionId: string, partId: string) {
  return `${questionAnchor(questionId)}/p:${partId}`;
}

function partBlockAnchor(questionId: string, partId: string, blockId: string) {
  return `${partAnchor(questionId, partId)}/b:${blockId}`;
}

function subpartAnchor(questionId: string, partId: string, subpartId: string) {
  return `${partAnchor(questionId, partId)}/s:${subpartId}`;
}

function subpartBlockAnchor(questionId: string, partId: string, subpartId: string, blockId: string) {
  return `${subpartAnchor(questionId, partId, subpartId)}/b:${blockId}`;
}

function parseAssistantAnchor(anchor: string | null | undefined): MauthPreviewTargetInspection {
  if (!anchor) return { kind: "unknown" };
  if (anchor === ASSISTANT_FRONT_MATTER_ANCHOR) return { kind: "frontMatter", anchor };
  if (anchor.startsWith("pb:")) return { kind: "pageBreak", anchor, questionId: anchor.slice(3) };

  const [questionSegment, ...segments] = anchor.split("/");
  if (!questionSegment?.startsWith("q:")) return { kind: "unknown", anchor };
  const target: MauthPreviewTargetInspection = { kind: "question", anchor, questionId: questionSegment.slice(2) };

  for (const segment of segments) {
    if (segment.startsWith("p:")) target.partId = segment.slice(2);
    if (segment.startsWith("s:")) target.subpartId = segment.slice(2);
    if (segment.startsWith("b:")) target.blockId = segment.slice(2);
  }

  if (target.partId && target.subpartId && target.blockId) return { ...target, kind: "subpartBlock" };
  if (target.partId && target.subpartId) return { ...target, kind: "subpart" };
  if (target.partId && target.blockId) return { ...target, kind: "partBlock" };
  if (target.partId) return { ...target, kind: "part" };
  if (target.blockId) return { ...target, kind: "questionBlock" };
  return target;
}

interface PreviewBlockEntry {
  block: ContentBlock;
  anchor: string;
  owner: string;
  ownerKind: "question" | "part" | "subpart";
  questionId: string;
  partId?: string;
  subpartId?: string;
}

function previewBlockEntries(question: MauthQuestionLike): PreviewBlockEntry[] {
  const entries: PreviewBlockEntry[] = question.contentBlocks.map((block) => ({
    block,
    anchor: questionBlockAnchor(question.id, block.id),
    owner: "question",
    ownerKind: "question",
    questionId: question.id,
  }));

  for (const part of question.parts ?? []) {
    entries.push(
      ...part.contentBlocks.map((block) => ({
        block,
        anchor: partBlockAnchor(question.id, part.id, block.id),
        owner: `part:${part.id}`,
        ownerKind: "part" as const,
        questionId: question.id,
        partId: part.id,
      })),
    );
    for (const subpart of part.subparts ?? []) {
      entries.push(
        ...subpart.contentBlocks.map((block) => ({
          block,
          anchor: subpartBlockAnchor(question.id, part.id, subpart.id, block.id),
          owner: `subpart:${subpart.id}`,
          ownerKind: "subpart" as const,
          questionId: question.id,
          partId: part.id,
          subpartId: subpart.id,
        })),
      );
    }
  }

  return entries;
}

function previewTargetFromArgs<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  document: MauthDocumentLike<Q, F, C>,
  args: unknown,
  activeAnchor?: string | null,
) {
  const record = isRecord(args) ? args : {};
  const explicitAnchor = typeof record.anchor === "string" ? record.anchor : "";
  const scope: MauthPreviewInspection["scope"] =
    record.scope === "document" || record.scope === "question" || record.scope === "selection" ? record.scope : "selection";
  const parsedAnchor = parseAssistantAnchor(explicitAnchor || (scope === "selection" ? activeAnchor : null));
  const questionNumberValue = record.questionNumber ?? record.question;
  const questionNumber = Number(questionNumberValue);
  const requestedQuestion =
    typeof record.questionId === "string"
      ? document.questions.find((question) => question.id === record.questionId)
      : Number.isInteger(questionNumber) && questionNumber > 0
        ? document.questions[questionNumber - 1]
        : undefined;
  const questionFromAnchor = parsedAnchor.questionId
    ? document.questions.find((question) => question.id === parsedAnchor.questionId)
    : undefined;
  const questionFromModule =
    typeof record.moduleId === "string"
      ? document.questions.find((question) => previewBlockEntries(question).some((entry) => entry.block.id === record.moduleId))
      : undefined;
  const question =
    requestedQuestion ?? questionFromAnchor ?? questionFromModule ?? (scope === "document" ? undefined : document.questions[0]);
  const questionIndex = question ? document.questions.findIndex((item) => item.id === question.id) : -1;
  const target: MauthPreviewTargetInspection = {
    ...parsedAnchor,
    ...(question ? { questionId: question.id, questionNumber: questionIndex + 1 } : {}),
    ...(typeof record.moduleId === "string" ? { blockId: record.moduleId } : {}),
  };
  return { scope, target, question, questionIndex };
}

function compactBlockInspectionWithAnchor(entry: PreviewBlockEntry): MauthBlockInspection & { anchor: string; owner: string } {
  return {
    ...inspectBlock(entry.block),
    anchor: entry.anchor,
    owner: entry.owner,
  };
}

function textBlocks(blocks: readonly ContentBlock[]) {
  return blocks.filter((block): block is TextContentBlock => block.kind === "text");
}

function hiddenMarksInBlocks(blocks: readonly ContentBlock[]) {
  return textBlocks(blocks)
    .filter((block) => blockVisibility(block) === "solution" || isLikelySolutionText(block))
    .reduce((sum, block) => sum + markAnnotationTotal(block.text), 0);
}

function visibleMarkNotesInBlocks(blocks: readonly ContentBlock[]) {
  return textBlocks(blocks).filter(
    (block) => (blockVisibility(block) === "solution" || isLikelySolutionText(block)) && hasVisibleMarkNote(block.text),
  ).length;
}

function studentSpaceLinesInBlocks(blocks: readonly ContentBlock[]) {
  return blocks.reduce((sum, block) => (block.kind === "space" && blockVisibility(block) === "student" ? sum + block.lines : sum), 0);
}

function solutionModulesInBlocks(blocks: readonly ContentBlock[]) {
  return blocks.filter((block) => blockVisibility(block) === "solution" || isLikelySolutionText(block));
}

function nonSolutionTextPresent(blocks: readonly ContentBlock[]) {
  return textBlocks(blocks).some((block) => blockVisibility(block) !== "solution" && block.text.trim());
}

function solutionScopeInspection(
  kind: MauthSolutionScopeInspection["kind"],
  anchor: string,
  label: string,
  marks: number,
  blocks: readonly ContentBlock[],
) {
  return {
    kind,
    anchor,
    label,
    marks,
    studentSpaceLines: studentSpaceLinesInBlocks(blocks),
    solutionModuleCount: solutionModulesInBlocks(blocks).length,
    hiddenMarkTotal: hiddenMarksInBlocks(blocks),
    visibleMarkNoteCount: visibleMarkNotesInBlocks(blocks),
  };
}

function addSolutionScopeWarnings(scope: MauthSolutionScopeInspection, warnings: MauthPreviewInspectionWarning[]) {
  if (scope.marks > 0 && scope.solutionModuleCount === 0) {
    warnings.push({
      code: "solution-missing",
      severity: "info",
      anchor: scope.anchor,
      message: `${scope.label} has ${scope.marks} mark${scope.marks === 1 ? "" : "s"} but no solution-only module yet.`,
    });
  }
  if (scope.solutionModuleCount > 0 && scope.studentSpaceLines === 0) {
    warnings.push({
      code: "student-space-missing",
      severity: "warning",
      anchor: scope.anchor,
      message: `${scope.label} has a solution but no student-only answer space to preserve pagination.`,
    });
  }
  if (scope.solutionModuleCount > 0 && scope.marks > 0 && scope.hiddenMarkTotal !== scope.marks) {
    warnings.push({
      code: "solution-hidden-mark-total-mismatch",
      severity: "warning",
      anchor: scope.anchor,
      message: `${scope.label} solution has ${scope.hiddenMarkTotal} hidden tick mark${scope.hiddenMarkTotal === 1 ? "" : "s"} for ${scope.marks} mark${scope.marks === 1 ? "" : "s"}.`,
    });
  }
  if (scope.visibleMarkNoteCount > 0) {
    warnings.push({
      code: "solution-visible-mark-note",
      severity: "warning",
      anchor: scope.anchor,
      message: `${scope.label} contains visible mark notes. Use hidden [[marks:n]] annotations so the preview renders ticks.`,
    });
  }
}

function questionSolutionScopes(question: MauthQuestionLike, questionIndex: number) {
  const scopes: MauthSolutionScopeInspection[] = [];
  const questionDirectScope = solutionScopeInspection(
    "question",
    questionAnchor(question.id),
    `Question ${questionIndex + 1}`,
    question.marks,
    question.contentBlocks,
  );
  if (questionDirectScope.marks > 0 || questionDirectScope.studentSpaceLines > 0 || questionDirectScope.solutionModuleCount > 0) {
    scopes.push(questionDirectScope);
  }

  for (const [partIndex, part] of (question.parts ?? []).entries()) {
    const partDirectScope = solutionScopeInspection(
      "part",
      partAnchor(question.id, part.id),
      `Question ${questionIndex + 1} part ${part.label ?? String.fromCharCode(97 + partIndex)}`,
      part.marks,
      part.contentBlocks,
    );
    if (partDirectScope.marks > 0 || partDirectScope.studentSpaceLines > 0 || partDirectScope.solutionModuleCount > 0) {
      scopes.push(partDirectScope);
    }

    for (const [subpartIndex, subpart] of (part.subparts ?? []).entries()) {
      scopes.push(
        solutionScopeInspection(
          "subpart",
          subpartAnchor(question.id, part.id, subpart.id),
          `Question ${questionIndex + 1} part ${part.label ?? String.fromCharCode(97 + partIndex)} subpart ${
            subpart.label ?? subpartIndex + 1
          }`,
          subpart.marks,
          subpart.contentBlocks,
        ),
      );
    }
  }

  return scopes;
}

function nextBesideCandidate(entries: readonly PreviewBlockEntry[], index: number, diagram: Extract<ContentBlock, { kind: "diagram" }>) {
  if (diagram.diagramAlign !== "left" && diagram.diagramAlign !== "right") return undefined;
  const nextEntry = entries[index + 1];
  if (!nextEntry) return undefined;
  const nextVisibility = blockVisibility(nextEntry.block);
  if (nextVisibility === "solution") return undefined;
  if (nextEntry.block.kind !== "space" && nextEntry.block.kind !== "text") return undefined;
  const solutionAfterSpace =
    nextEntry.block.kind === "space" &&
    entries
      .slice(index + 2)
      .some(
        (entry) => entry.owner === nextEntry.owner && (blockVisibility(entry.block) === "solution" || isLikelySolutionText(entry.block)),
      );
  return {
    blockId: nextEntry.block.id,
    anchor: nextEntry.anchor,
    kind: nextEntry.block.kind,
    expectedSide: diagram.diagramAlign === "right" ? ("left" as const) : ("right" as const),
    replacementSlot: solutionAfterSpace,
  };
}

function diagramSemanticInspection(entry: PreviewBlockEntry, questionText: string) {
  if (entry.block.kind !== "diagram") return { checks: [] as string[], warnings: [] as MauthPreviewInspectionWarning[] };
  const semantic = inspectDiagramSemantics(entry.block.graphConfig, questionText);
  return {
    checks: semantic.checks,
    warnings: semantic.warnings.map((warning) => ({
      ...warning,
      anchor: entry.anchor,
      targetId: entry.block.id,
    })),
  };
}

function inspectPreviewDiagrams(entries: readonly PreviewBlockEntry[], questionText: string) {
  return entries
    .map((entry, index): MauthPreviewDiagramInspection | null => {
      if (entry.block.kind !== "diagram") return null;
      const semantic = diagramSemanticInspection(entry, questionText);
      return {
        id: entry.block.id,
        anchor: entry.anchor,
        graphType: entry.block.graphConfig.type,
        align: entry.block.diagramAlign,
        textSide: entry.block.diagramTextSide,
        visibility: blockVisibility(entry.block),
        semanticChecks: semantic.checks,
        semanticWarnings: semantic.warnings,
        besideCandidate: nextBesideCandidate(entries, index, entry.block),
      };
    })
    .filter((entry): entry is MauthPreviewDiagramInspection => Boolean(entry));
}

function questionIntentText(question: MauthQuestionLike) {
  return rawAssistantTextFragmentsFromQuestion(question).join("\n");
}

function addQuestionPreviewWarnings(
  question: MauthQuestionLike,
  questionIndex: number,
  entries: readonly PreviewBlockEntry[],
  diagrams: readonly MauthPreviewDiagramInspection[],
  warnings: MauthPreviewInspectionWarning[],
) {
  for (const [partIndex, part] of (question.parts ?? []).entries()) {
    if (!part.text?.trim() && !nonSolutionTextPresent(part.contentBlocks)) {
      warnings.push({
        code: "part-prompt-missing",
        severity: "warning",
        anchor: partAnchor(question.id, part.id),
        targetId: part.id,
        message: `Question ${questionIndex + 1} part ${part.label ?? String.fromCharCode(97 + partIndex)} has marks/modules but no visible part prompt text.`,
      });
    }
    for (const [subpartIndex, subpart] of (part.subparts ?? []).entries()) {
      if (!subpart.text?.trim() && !nonSolutionTextPresent(subpart.contentBlocks)) {
        warnings.push({
          code: "subpart-prompt-missing",
          severity: "warning",
          anchor: subpartAnchor(question.id, part.id, subpart.id),
          targetId: subpart.id,
          message: `Question ${questionIndex + 1} subpart ${subpart.label ?? subpartIndex + 1} has no visible prompt text.`,
        });
      }
    }
  }

  const expectedIntent = diagramIntentFromText(questionIntentText(question));
  if (expectedIntent) {
    for (const diagram of diagrams) {
      if (diagram.graphType !== expectedIntent.expectedType) {
        warnings.push({
          code: "diagram-renderer-mismatch",
          severity: "warning",
          anchor: diagram.anchor,
          targetId: diagram.id,
          message: `${expectedIntent.label} appears to use ${diagram.graphType}; ${expectedIntent.reason}`,
        });
      }
    }
  }

  for (const diagram of diagrams) {
    warnings.push(...diagram.semanticWarnings);
  }

  for (const diagram of diagrams) {
    if ((diagram.align === "left" || diagram.align === "right") && !diagram.besideCandidate) {
      warnings.push({
        code: "diagram-beside-content-missing",
        severity: "info",
        anchor: diagram.anchor,
        targetId: diagram.id,
        message:
          "Left/right diagram has no immediate text or student-space block after it, so the preview cannot use adjacent answer space.",
      });
    }
  }

  for (const entry of entries) {
    if (entry.block.kind === "diagram" && entry.block.graphConfig.type === "image") {
      const data = isRecord(entry.block.graphConfig.data) ? entry.block.graphConfig.data : {};
      if (typeof data.src !== "string" || !data.src.trim()) {
        warnings.push({
          code: "image-diagram-missing-source",
          severity: "warning",
          anchor: entry.anchor,
          targetId: entry.block.id,
          message: "Image diagram has no uploaded image source.",
        });
      }
    }
  }
}

function inspectPreviewQuestion(question: MauthQuestionLike, questionIndex: number, target: MauthPreviewTargetInspection) {
  const entries = previewBlockEntries(question);
  const intentText = questionIntentText(question);
  const diagrams = inspectPreviewDiagrams(entries, intentText);
  const solutionScopes = questionSolutionScopes(question, questionIndex);
  const warnings: MauthPreviewInspectionWarning[] = [];

  for (const scope of solutionScopes) addSolutionScopeWarnings(scope, warnings);
  addQuestionPreviewWarnings(question, questionIndex, entries, diagrams, warnings);

  const selectedBlock = target.blockId
    ? entries.find((entry) => entry.block.id === target.blockId || entry.anchor === target.anchor)
    : undefined;

  return {
    ...inspectMauthDocument({ frontMatter: {}, formattingConfig: {}, questions: [question] }).questions[0],
    questionNumber: questionIndex + 1,
    totalMarks: sumQuestionMarks(question),
    selectedBlock: selectedBlock ? compactBlockInspectionWithAnchor(selectedBlock) : undefined,
    allModules: entries.map(compactBlockInspectionWithAnchor),
    diagrams,
    solutionScopes,
    warnings,
  };
}

function renderedAnchorCandidates(target: MauthPreviewTargetInspection) {
  const anchors = new Set<string>();
  if (target.anchor) anchors.add(target.anchor);
  if (target.questionId) anchors.add(questionAnchor(target.questionId));
  if (target.questionId && target.blockId) anchors.add(questionBlockAnchor(target.questionId, target.blockId));
  if (target.questionId && target.partId) anchors.add(partAnchor(target.questionId, target.partId));
  if (target.questionId && target.partId && target.blockId) {
    anchors.add(partBlockAnchor(target.questionId, target.partId, target.blockId));
  }
  if (target.questionId && target.partId && target.subpartId)
    anchors.add(subpartAnchor(target.questionId, target.partId, target.subpartId));
  if (target.questionId && target.partId && target.subpartId && target.blockId) {
    anchors.add(subpartBlockAnchor(target.questionId, target.partId, target.subpartId, target.blockId));
  }
  return Array.from(anchors);
}

function anchorRelatedToCandidates(anchor: string, candidates: readonly string[]) {
  return candidates.some((candidate) => anchor === candidate || anchor.startsWith(`${candidate}/`) || candidate.startsWith(`${anchor}/`));
}

function renderedMetricsForInspection(
  metrics: MauthPreviewRenderedMetrics | null | undefined,
  scope: MauthPreviewInspection["scope"],
  target: MauthPreviewTargetInspection,
  activeAnchor?: string | null,
): MauthPreviewRenderedMetrics {
  if (!metrics?.available) {
    return {
      available: false,
      reason:
        metrics?.available === false
          ? metrics.reason
          : "Browser-rendered preview metrics were not available, usually because the preview pane is closed or not mounted yet.",
    };
  }

  const candidates = new Set(renderedAnchorCandidates(target));
  if (activeAnchor) candidates.add(activeAnchor);
  const candidateList = Array.from(candidates);
  const anchors =
    scope === "document"
      ? metrics.anchors.filter((anchor) => anchor.kind === "question" || anchor.warnings.length > 0).slice(0, 80)
      : metrics.anchors.filter((anchor) => anchorRelatedToCandidates(anchor.anchor, candidateList)).slice(0, 30);
  const warnings = [...metrics.warnings, ...anchors.flatMap((anchor) => anchor.warnings)].filter(
    (warning, index, all) => all.findIndex((item) => item.code === warning.code && item.anchor === warning.anchor) === index,
  );

  return {
    ...metrics,
    anchors,
    warnings,
  };
}

export function inspectMauthPreview<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  document: MauthDocumentLike<Q, F, C>,
  args: unknown,
  context: MauthAssistantToolContext = {},
): MauthPreviewInspection {
  const { scope, target, question, questionIndex } = previewTargetFromArgs(document, args, context.activeAnchor);
  const warnings: MauthPreviewInspectionWarning[] = [];

  if (scope === "selection" && !context.activeAnchor && !isRecord(args)) {
    warnings.push({
      code: "selection-anchor-unavailable",
      severity: "info",
      message: "No active editor/preview selection was supplied, so the first question was inspected.",
    });
  }

  if (scope !== "document" && !question) {
    warnings.push({
      code: "preview-target-not-found",
      severity: "warning",
      message: "Requested preview target was not found in the current document.",
    });
  }

  const inspectedQuestion = question ? inspectPreviewQuestion(question, questionIndex, target) : undefined;
  const renderedMetrics = renderedMetricsForInspection(context.renderedMetrics, scope, target, context.activeAnchor);
  return {
    scope,
    activeAnchor: context.activeAnchor ?? null,
    target,
    question: inspectedQuestion,
    questions:
      scope === "document"
        ? document.questions.map((item, index) => {
            const questionInspection = inspectPreviewQuestion(item, index, {
              kind: "question",
              questionId: item.id,
              questionNumber: index + 1,
            });
            return {
              id: questionInspection.id,
              questionNumber: questionInspection.questionNumber,
              totalMarks: questionInspection.totalMarks,
              studentSpaceLines: questionInspection.studentSpaceLines,
              solutionModuleCount: questionInspection.solutionModuleCount,
              warnings: questionInspection.warnings,
            };
          })
        : undefined,
    warnings: [...warnings, ...(inspectedQuestion?.warnings ?? [])],
    renderedMetrics,
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
        name: "mauth.preview.inspect",
        description:
          "Return a focused preview-oriented inspection for the selected/current question or a requested question, including modules, diagrams, answer-space/solution pairing, hidden solution marks, rendered layout metrics, and diagram semantic warnings.",
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
          "Replace one existing question from a compact authoring payload. The tool builds the Mauth modules, student-only answer space, solution-only solution text, validates the generated action batch, and applies it. Omitted diagram fields preserve existing diagrams.",
      },
      {
        name: "mauth.author.addDiagram",
        description:
          "Add a diagram to one existing question from a real Mauth graphConfig wrapped as { graphConfig: { type: ... } }. Choose graphConfig.type first: geometricConstruction for Penrose geometry, graph2d for coordinate/function graphs, vector2d for coordinate vectors, statsChart for statistics, setDiagram for Venn diagrams, graph3d for 3D, or image for uploads.",
      },
      {
        name: "mauth.author.ensureSolutions",
        description:
          "Add or replace solution-only worked solutions, optionally update marks, and ensure matching student-only answer spaces for existing questions or parts while preserving shared question modules.",
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
      "Use mauth.preview.inspect instead of broad document inspection when you need the current/selected question, its diagrams, answer-space layout, or solution/tick status.",
      "For focused one-question writing or replacement requests, prefer mauth.author.replaceQuestion.",
      "For mark-allocation or solution-only edits, prefer mauth.author.ensureSolutions and do not replace the whole question.",
      "For focused diagram follow-ups, prefer mauth.author.addDiagram with a renderer-specific graphConfig.",
      "High-level diagram blocks must be shaped as { graphConfig: { type: ... }, diagramAlign?: ... }; do not use top-level type/data/options fields or a config alias.",
      "Choose diagram renderers by classroom intent: geometricConstruction for ruler-style geometry and scalar-product ray diagrams, graph2d for coordinate/function graphs, vector2d for component vectors on axes, statsChart for histograms/column/probability charts, setDiagram for Venn diagrams, vectorRelationship for networks, and graph3d for 3D.",
      "The authoring boundary rejects obvious renderer mismatches before applying edits; repair by switching graphConfig.type and using that renderer's native schema.",
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

function contentBlocksForScope<Q extends MauthQuestionLike, F extends object, C extends object>(
  document: MauthDocumentLike<Q, F, C>,
  scope: MauthContentScope,
) {
  const question = document.questions.find((item) => item.id === scope.questionId);
  if (!question) return [];
  if (scope.kind === "question") return question.contentBlocks;
  const part = question.parts?.find((item) => item.id === scope.partId);
  if (!part) return [];
  if (scope.kind === "part") return part.contentBlocks;
  return part.subparts?.find((item) => item.id === scope.subpartId)?.contentBlocks ?? [];
}

function existingBlockForAction<Q extends MauthQuestionLike, F extends object, C extends object>(
  document: MauthDocumentLike<Q, F, C>,
  action: Extract<MauthDocumentAction, { type: "module.update" }>,
) {
  return contentBlocksForScope(document, action.scope).find((block) => block.id === action.blockId);
}

function sanitizePatchContentBlocks(patch: Record<string, unknown>) {
  return Array.isArray(patch.contentBlocks)
    ? {
        ...patch,
        contentBlocks: sanitizeAssistantContentBlocks(patch.contentBlocks as ContentBlock[]),
      }
    : patch;
}

function sanitizePatchParts(patch: Record<string, unknown>) {
  return Array.isArray(patch.parts)
    ? {
        ...patch,
        parts: (patch.parts as MauthPartLike[]).map(sanitizeAssistantPart),
      }
    : patch;
}

function sanitizePatchSubparts(patch: Record<string, unknown>) {
  return Array.isArray(patch.subparts)
    ? {
        ...patch,
        subparts: (patch.subparts as MauthSubpartLike[]).map(sanitizeAssistantSubpart),
      }
    : patch;
}

function sanitizeContainerPatch(patch: Record<string, unknown>) {
  return sanitizePatchSubparts(sanitizePatchParts(sanitizePatchContentBlocks(patch)));
}

function sanitizeAssistantAction<Q extends MauthQuestionLike, F extends object, C extends object>(
  document: MauthDocumentLike<Q, F, C>,
  action: MauthDocumentAction,
): MauthDocumentAction {
  if (action.type === "question.add") {
    return { ...action, question: sanitizeAssistantQuestion(action.question) };
  }
  if (action.type === "question.update") {
    return { ...action, patch: sanitizeContainerPatch(action.patch) };
  }
  if (action.type === "part.add") {
    return { ...action, part: sanitizeAssistantPart(action.part) };
  }
  if (action.type === "part.update" || action.type === "subpart.update") {
    return { ...action, patch: sanitizeContainerPatch(action.patch) };
  }
  if (action.type === "subpart.add") {
    return { ...action, subpart: sanitizeAssistantSubpart(action.subpart) };
  }
  if (action.type === "module.add" || action.type === "solutionSlot.add") {
    return { ...action, blocks: sanitizeAssistantContentBlocks(action.blocks) };
  }
  if (action.type === "module.update" && typeof action.patch.text === "string") {
    const existingBlock = existingBlockForAction(document, action);
    const nextText = action.patch.text;
    const isSolutionPatch =
      (existingBlock && isSolutionTextBlock(existingBlock)) ||
      action.patch.visibility === "solution" ||
      action.patch.solutionOnly === true ||
      SOLUTION_HEADING_PATTERN.test(nextText);
    if (isSolutionPatch && (hasVisibleMarkNote(nextText) || hasMarkAnnotation(nextText))) {
      return { ...action, patch: { ...action.patch, text: solutionBlockText(nextText) } };
    }
  }
  return action;
}

function sanitizeAssistantActions<Q extends MauthQuestionLike, F extends object, C extends object>(
  document: MauthDocumentLike<Q, F, C>,
  actions: MauthDocumentAction[],
) {
  return actions.map((action) => sanitizeAssistantAction(document, action));
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
const VISIBLE_MARK_NOTE_PATTERN = /(?:\[(\d+)\s*marks?(?:[^\]]*)\]|\((\d+)\s*marks?(?:[^)]*)\))/i;
const VISIBLE_MARK_PROSE_PATTERN = /(?:^|\s)(\d+)\s*marks?(?:\s+for\b.*)?$/i;
const TRAILING_VISIBLE_MARK_NOTE_PATTERN =
  /\s*(?:\$\\qquad\$\s*)?(?:\\qquad\s*)?(?:\\text\s*\{\s*)?(?:\*\*)?(?:\[(\d+)\s*marks?(?:[^\]]*)\]|\((\d+)\s*marks?(?:[^)]*)\)|(\d+)\s*marks?(?:\s+for\b.*)?)(?:\*\*)?(?:\s*\})?\s*$/i;
const DISPLAY_VISIBLE_MARK_NOTE_PATTERN =
  /\s*(?:\\qquad\s*)?(?:\\text\s*\{\s*)?(?:\*\*)?(?:\[(\d+)\s*marks?(?:[^\]]*)\]|\((\d+)\s*marks?(?:[^)]*)\))(?:\*\*)?(?:\s*\})?/gi;
const SOLUTION_HEADING_PATTERN = /^\s*(?:\*\*)?Solution(?:\s*\(\s*\d+\s*marks?\s*\))?\.?(?:\*\*)?\s*/i;

function markCountFromNote(...counts: Array<string | undefined>) {
  return Math.max(0, Math.min(6, Math.round(Number(counts.find(Boolean)) || 0)));
}

function normalizeDisplayMathMarkAnnotations(value: string) {
  return value.replace(/\$\$([\s\S]+?)\$\$/g, (match, body: string) => {
    let marks = 0;
    const cleanedBody = body.replace(
      DISPLAY_VISIBLE_MARK_NOTE_PATTERN,
      (_note, squareCount: string | undefined, roundCount: string | undefined) => {
        marks += markCountFromNote(squareCount, roundCount);
        return "";
      },
    );
    const trimmedBody = cleanedBody.trimEnd();
    const formattedBody = trimmedBody.startsWith("\n") && !trimmedBody.endsWith("\n") ? `${trimmedBody}\n` : trimmedBody;
    return marks ? `$$${formattedBody}$$ [[marks:${marks}]]` : match;
  });
}

function normalizeSolutionMarkAnnotations(value: string) {
  const normalized = normalizeDisplayMathMarkAnnotations(value)
    .replace(MARK_TICK_ANNOTATION_PATTERN, (_, count: string) => `[[marks:${count}]]`)
    .split("\n")
    .map((line) =>
      line.replace(
        TRAILING_VISIBLE_MARK_NOTE_PATTERN,
        (_match, squareCount: string | undefined, roundCount: string | undefined, proseCount: string | undefined) => {
          const count = markCountFromNote(squareCount, roundCount, proseCount);
          return count ? ` [[marks:${count}]]` : "";
        },
      ),
    )
    .join("\n");
  return attachStandaloneMarkAnnotations(normalized);
}

function markAnnotationTotal(value: string) {
  const matches = [...value.matchAll(MARK_TICK_ANNOTATION_PATTERN)];
  return matches.reduce((sum, match) => sum + markCountFromNote(match[1]), 0);
}

function hasMarkAnnotation(value: string) {
  return /\[\[\s*marks\s*:\s*\d+\s*\]\]/i.test(value);
}

function appendMarkAnnotation(line: string, marks: number) {
  return marks > 0 ? `${line.replace(/\s+$/, "")} [[marks:${marks}]]` : line;
}

function isSolutionMarkCandidateLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (SOLUTION_HEADING_PATTERN.test(trimmed)) return false;
  if (/^\[\[marks:\s*\d+\]\]$/i.test(trimmed)) return false;
  if (trimmed === "$$") return false;
  return true;
}

function attachStandaloneMarkAnnotations(value: string) {
  const lines = value.split("\n");
  const nextLines: string[] = [];
  for (const line of lines) {
    const standaloneMark = line.trim().match(/^\[\[marks:\s*(\d+)\]\]$/i);
    if (!standaloneMark) {
      nextLines.push(line);
      continue;
    }
    const targetIndex = [...nextLines].reverse().findIndex(isSolutionMarkCandidateLine);
    if (targetIndex < 0) {
      nextLines.push(line.trim());
      continue;
    }
    const actualIndex = nextLines.length - 1 - targetIndex;
    nextLines[actualIndex] = appendMarkAnnotation(nextLines[actualIndex], markCountFromNote(standaloneMark[1]));
  }
  return nextLines.join("\n");
}

function compactSolutionText(value: string) {
  return value
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function addFallbackMarkAnnotations(value: string, expectedMarks = 0) {
  const marks = positiveInteger(expectedMarks, 0, 0, 20);
  if (!marks || markAnnotationTotal(value) >= marks) return value;

  const missingMarks = marks - markAnnotationTotal(value);
  const lines = value.split("\n");
  const candidateIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => isSolutionMarkCandidateLine(line))
    .map(({ index }) => index);
  if (!candidateIndexes.length) return appendMarkAnnotation(value, missingMarks);

  if (markAnnotationTotal(value) > 0) {
    const lastCandidateIndex = [...candidateIndexes].reverse().find((index) => !hasMarkAnnotation(lines[index]));
    const targetIndex = lastCandidateIndex ?? candidateIndexes[candidateIndexes.length - 1];
    lines[targetIndex] = appendMarkAnnotation(lines[targetIndex], missingMarks);
    return lines.join("\n");
  }

  let remaining = marks;
  const selectedIndexes = candidateIndexes.slice(0, Math.min(marks, candidateIndexes.length));
  for (const [selectedPosition, index] of selectedIndexes.entries()) {
    const isFinalSelectedLine = selectedPosition === selectedIndexes.length - 1;
    const marksForLine = isFinalSelectedLine ? remaining : 1;
    lines[index] = appendMarkAnnotation(lines[index], marksForLine);
    remaining -= marksForLine;
  }
  return lines.join("\n");
}

function solutionTextLineEstimate(value: string) {
  const visibleText = value.replace(MARK_TICK_ANNOTATION_PATTERN, "").replace(SOLUTION_HEADING_PATTERN, "").trim();
  const lines = visibleText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const displayMathCount = (visibleText.match(/\$\$[\s\S]*?\$\$/g) ?? []).length;
  const alignedBreakCount = (visibleText.match(/\\\\/g) ?? []).length;
  return Math.max(1, lines.length + displayMathCount + alignedBreakCount);
}

const MIN_AUTHOR_STUDENT_SPACE_LINES = 4;
const MAX_AUTHOR_STUDENT_SPACE_LINES = 60;

function defaultAuthorStudentSpaceLines(marks: unknown, fallback: number) {
  const safeMarks = positiveInteger(marks, 0, 0, 100);
  if (!safeMarks) return fallback;
  return Math.max(MIN_AUTHOR_STUDENT_SPACE_LINES, Math.min(18, Math.ceil(safeMarks * 3 + 2)));
}

function resolvedStudentSpaceLines(requestedLines: unknown, solutionText: string, expectedMarks: unknown, fallback: number, max = 40) {
  const defaultLines = defaultAuthorStudentSpaceLines(expectedMarks, fallback);
  const requested = positiveInteger(requestedLines, defaultLines, 1, max);
  if (!solutionText.trim()) return Math.max(requested, defaultLines);
  const solutionLines = solutionTextLineEstimate(solutionBlockText(solutionText, positiveInteger(expectedMarks, 0, 0, 100)));
  return Math.max(requested, defaultLines, Math.min(max, Math.max(MIN_AUTHOR_STUDENT_SPACE_LINES, solutionLines + 2)));
}

function solutionBlockText(value: string, expectedMarks = 0) {
  const normalized = normalizeSolutionMarkAnnotations(value.trim());
  const bodySource = SOLUTION_HEADING_PATTERN.test(normalized) ? normalized.replace(SOLUTION_HEADING_PATTERN, "").trimStart() : normalized;
  const body = compactSolutionText(addFallbackMarkAnnotations(bodySource, expectedMarks));
  return body ? `**Solution.**\n\n${body}` : "**Solution.**\n\n";
}

function isSolutionTextBlock(block: ContentBlock): block is TextContentBlock {
  return (
    block.kind === "text" && (block.visibility === "solution" || block.solutionOnly === true || SOLUTION_HEADING_PATTERN.test(block.text))
  );
}

function hasVisibleMarkNote(value: string) {
  return (
    VISIBLE_MARK_NOTE_PATTERN.test(value) || VISIBLE_MARK_PROSE_PATTERN.test(value) || /Solution\s*\(\s*\d+\s*marks?\s*\)/i.test(value)
  );
}

function sanitizeAssistantSolutionBlock(block: ContentBlock): ContentBlock {
  if (!isSolutionTextBlock(block) || (!hasVisibleMarkNote(block.text) && !hasMarkAnnotation(block.text))) return block;
  return { ...block, text: solutionBlockText(block.text) };
}

function sanitizeAssistantContentBlocks(blocks: readonly ContentBlock[]) {
  return blocks.map(sanitizeAssistantSolutionBlock);
}

function sanitizeAssistantSubpart<T extends MauthSubpartLike>(subpart: T): T {
  return { ...subpart, contentBlocks: sanitizeAssistantContentBlocks(subpart.contentBlocks) } as T;
}

function sanitizeAssistantPart<T extends MauthPartLike>(part: T): T {
  return {
    ...part,
    contentBlocks: sanitizeAssistantContentBlocks(part.contentBlocks),
    ...(part.subparts ? { subparts: part.subparts.map(sanitizeAssistantSubpart) } : {}),
  } as T;
}

function sanitizeAssistantQuestion<T extends MauthQuestionLike>(question: T): T {
  return {
    ...question,
    contentBlocks: sanitizeAssistantContentBlocks(question.contentBlocks),
    ...(question.parts ? { parts: question.parts.map(sanitizeAssistantPart) } : {}),
  } as T;
}

interface AssistantDiagramIntent {
  id: string;
  expectedType: string;
  label: string;
  reason: string;
}

function rawAssistantTextFragmentsFromBlocks(blocks: readonly ContentBlock[] | undefined) {
  return (blocks ?? [])
    .filter((block): block is TextContentBlock => block.kind === "text" && block.visibility !== "solution")
    .map((block) => block.text);
}

function rawAssistantTextFragmentsFromPart(part: MauthPartLike | MauthSubpartLike): string[] {
  const subparts = "subparts" in part && Array.isArray(part.subparts) ? part.subparts : [];
  return [
    typeof part.text === "string" ? part.text : "",
    ...rawAssistantTextFragmentsFromBlocks(part.contentBlocks),
    ...subparts.flatMap(rawAssistantTextFragmentsFromPart),
  ];
}

function rawAssistantTextFragmentsFromQuestion(question: MauthQuestionLike | undefined) {
  if (!question) return [];
  return [
    typeof question.text === "string" ? question.text : "",
    ...rawAssistantTextFragmentsFromBlocks(question.contentBlocks),
    ...(question.parts ?? []).flatMap(rawAssistantTextFragmentsFromPart),
  ];
}

function rawAssistantTextFragmentsFromAuthorArgs(args: Record<string, unknown>): string[] {
  const fragments = [textFromArgs(args)];
  if (Array.isArray(args.parts)) {
    for (const part of args.parts) {
      if (!isRecord(part)) continue;
      fragments.push(partTextFromArgs(part));
      if (Array.isArray(part.subparts)) {
        for (const subpart of part.subparts) {
          if (isRecord(subpart)) fragments.push(partTextFromArgs(subpart));
        }
      }
    }
  }
  return fragments;
}

function normalizedAssistantIntentText(value: string) {
  return value
    .toLowerCase()
    .replace(/\\mathbf\s*\{([a-z])\}/g, "$1")
    .replace(/\\vec\s*\{([a-z])\}/g, "$1")
    .replace(/\\overrightarrow\s*\{([^}]+)\}/g, "$1")
    .replace(/[{}$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function diagramIntentFromText(rawText: string): AssistantDiagramIntent | undefined {
  const text = normalizedAssistantIntentText(rawText);
  if (!text) return undefined;

  const hasSetLanguage =
    /\bvenn\b|\bset diagram\b|\buniversal set\b|\bset notation\b|\\cap|\\cup|∩|∪|a\s*['’]?\s*\\?\s*cap|a\s*['’]?\s*∩/i.test(rawText) ||
    /\bsets?\b.*\b(intersection|union|complement)\b/.test(text);
  if (hasSetLanguage) {
    return {
      id: "set-diagram",
      expectedType: "setDiagram",
      label: "Venn/set diagram",
      reason: "Venn and set-region diagrams should use the setDiagram Penrose renderer.",
    };
  }

  const hasStatsLanguage =
    /\bhistogram\b|\bcolumn graph\b|\bbar chart\b|\brelative frequenc(?:y|ies)\b|\bmanual probabilities\b|\bprobability mass\b|\bp\s*\(\s*x\s*=\s*x\s*\)|\bp\s*\(\s*x\s*\)/i.test(
      rawText,
    ) || /\bprobability graph\b|\bfrequency graph\b|\bpmf\b/.test(text);
  if (hasStatsLanguage) {
    return {
      id: "statistics-chart",
      expectedType: "statsChart",
      label: "statistics chart",
      reason: "histograms, column graphs, probability graphs, and relative-frequency charts should use statsChart.",
    };
  }

  const hasNetworkLanguage =
    /\bnetwork\b|\bnodes?\b|\bedges?\b|\bvertices\b|\badjacency\b|\bshortest path\b|\bcritical path\b|\bminimum spanning\b/i.test(rawText);
  if (hasNetworkLanguage) {
    return {
      id: "network",
      expectedType: "vectorRelationship",
      label: "network diagram",
      reason: "network diagrams should use vectorRelationship, which is the Penrose network renderer.",
    };
  }

  const hasSchematicGeometryLanguage =
    /\bpoints?\s+on\s+a\s+circle\b|\bchords?\b|\bcircle theorem\b|\bangle subtended\b|\bcircumference\b|\btangent\s+at\s+[a-z]\b|\bparallel\s+to\s+(?:the\s+)?chord\b/i.test(
      rawText,
    );
  if (hasSchematicGeometryLanguage) {
    return {
      id: "schematic-geometry",
      expectedType: "geometricConstruction",
      label: "schematic geometry diagram",
      reason: "circle, tangent, chord, and theorem-style geometry diagrams should use geometricConstruction.",
    };
  }

  const hasScalarProductLanguage =
    /\bscalar products?\b|\bdot products?\b|(?:\\mathbf\s*\{[a-z]\}|[a-z])\s*(?:\\cdot|·|•)\s*(?:\\mathbf\s*\{[a-z]\}|[a-z])/i.test(
      rawText,
    ) || /\b(?:a|b|c|d)\s*\.\s*(?:a|b|c|d)\b/.test(text);
  const hasCoordinateVectorLanguage =
    /\bcoordinate vectors?\b|\bcomponent vectors?\b|\bcomponents?\b|\bstarting at\b|\bfrom the origin\b|\bfrom origin\b|\bgrid\b|\baxes?\b|\\begin\s*\{\s*(?:pmatrix|bmatrix|matrix)\s*\}|\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)/i.test(
      rawText,
    ) || /\bvector\s+[a-z]\s*=\s*\(?\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)?/.test(text);
  if (hasCoordinateVectorLanguage) {
    return {
      id: "coordinate-vector",
      expectedType: "vector2d",
      label: "coordinate vector diagram",
      reason: "coordinate/component vectors on axes should use vector2d, not Penrose geometry or networks.",
    };
  }
  if (hasScalarProductLanguage) {
    return {
      id: "scalar-product-rays",
      expectedType: "geometricConstruction",
      label: "scalar-product ray diagram",
      reason: "scalar-product ray diagrams without coordinate axes should use geometricConstruction.",
    };
  }

  const hasFunctionGraphLanguage =
    /\bgraph of\b|\bsketch(?: the)? graph\b|\bfunction\b|\basymptote\b|\bx-axis\b|\by-axis\b|\bcoordinate plane\b|f\s*\(\s*x\s*\)|g\s*\(\s*x\s*\)/i.test(
      rawText,
    );
  if (hasFunctionGraphLanguage) {
    return {
      id: "function-graph",
      expectedType: "graph2d",
      label: "2D function/coordinate graph",
      reason: "coordinate-plane function graphs should use graph2d.",
    };
  }

  return undefined;
}

function validateAssistantDiagramIntent(
  graphConfig: Record<string, unknown>,
  entryPath: string,
  issues: MauthActionValidationIssue[],
  intentText: string,
) {
  const intent = diagramIntentFromText(intentText);
  if (!intent) return;
  const actualType = typeof graphConfig.type === "string" ? graphConfig.type : "";
  if (!actualType || actualType === intent.expectedType) return;
  issues.push({
    path: `${entryPath}.graphConfig.type`,
    message: `${intent.label} appears to be using ${actualType}; ${intent.reason}`,
    expected: intent.expectedType,
  });
}

function diagramBlocksFromArgs(args: Record<string, unknown>, questionId: string, issues: MauthActionValidationIssue[], intentText = "") {
  const rawDiagrams = Array.isArray(args.diagrams) ? args.diagrams : args.diagram ? [args.diagram] : [];
  const blocks: ContentBlock[] = [];
  const defaultDiagramAlign =
    args.diagramAlign === "left" || args.diagramAlign === "center" || args.diagramAlign === "right" ? args.diagramAlign : undefined;
  const rendererKeys = [
    "type",
    "data",
    "options",
    "metadata",
    "style",
    "functions",
    "features",
    "xMin",
    "xMax",
    "yMin",
    "yMax",
    "scalePercent",
    "width",
    "height",
    "widthPx",
    "heightPx",
  ];

  rawDiagrams.forEach((entry, index) => {
    const entryPath = rawDiagrams.length === 1 && args.diagram ? "arguments.diagram" : `arguments.diagrams[${index}]`;
    if (!isRecord(entry)) {
      issues.push({ path: entryPath, message: "must be a diagram object", expected: "{ graphConfig, diagramAlign? }" });
      return;
    }
    const misplacedRendererKey = rendererKeys.find((key) => Object.prototype.hasOwnProperty.call(entry, key));
    if (misplacedRendererKey) {
      issues.push({
        path: `${entryPath}.graphConfig`,
        message: `must wrap renderer field ${misplacedRendererKey} inside graphConfig instead of placing it directly on the diagram block`,
        expected: "{ graphConfig: { type: ... }, diagramAlign? }",
      });
      return;
    }
    if (isRecord(entry.config) && !isRecord(entry.graphConfig)) {
      issues.push({
        path: `${entryPath}.graphConfig`,
        message: "must be named graphConfig; config is not accepted for assistant-authored diagrams",
        expected: "{ graphConfig: { type: ... }, diagramAlign? }",
      });
      return;
    }
    const graphConfig = isRecord(entry.graphConfig) ? entry.graphConfig : undefined;
    if (!isRecord(graphConfig) || typeof graphConfig.type !== "string") {
      issues.push({
        path: `${entryPath}.graphConfig`,
        message: "must contain a graphConfig with a supported type",
        expected: "GraphConfig",
      });
      return;
    }
    validateAssistantDiagramIntent(graphConfig, entryPath, issues, intentText);
    if (issues.length) return;
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

function hasExplicitDiagramReplacement(args: Record<string, unknown>) {
  return (
    Object.prototype.hasOwnProperty.call(args, "diagram") ||
    Object.prototype.hasOwnProperty.call(args, "diagrams") ||
    args.preserveExistingDiagrams === false
  );
}

function preservedDiagramBlocks(existingQuestion: MauthQuestionLike | undefined) {
  return (existingQuestion?.contentBlocks ?? []).filter((block): block is ContentBlock => block.kind === "diagram");
}

function diagramBlocksForAuthorQuestion(
  args: Record<string, unknown>,
  questionId: string,
  issues: MauthActionValidationIssue[],
  existingQuestion?: MauthQuestionLike,
) {
  if (hasExplicitDiagramReplacement(args)) {
    const intentText = [...rawAssistantTextFragmentsFromAuthorArgs(args), ...rawAssistantTextFragmentsFromQuestion(existingQuestion)].join(
      "\n",
    );
    return diagramBlocksFromArgs(args, questionId, issues, intentText);
  }
  return preservedDiagramBlocks(existingQuestion);
}

function contentBlocksForAuthorQuestion(
  args: Record<string, unknown>,
  questionId: string,
  issues: MauthActionValidationIssue[],
  existingQuestion?: MauthQuestionLike,
) {
  const text = textFromArgs(args);
  const solutionText = optionalTextArg(args, "solutionText") || optionalTextArg(args, "solution");
  const includeSolution = args.includeSolution !== false && Boolean(solutionText);
  const hasParts = Array.isArray(args.parts) && args.parts.length > 0;
  const marks = positiveInteger(args.marks, 1, 0, 100);
  const studentSpaceLines = resolvedStudentSpaceLines(
    args.studentSpaceLines ?? args.answerLines ?? args.lines,
    solutionText,
    marks,
    10,
    40,
  );
  const blocks: ContentBlock[] = [
    {
      id: authorBlockId(questionId, "question-text"),
      kind: "text",
      text,
    },
    ...diagramBlocksForAuthorQuestion(args, questionId, issues, existingQuestion),
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
      text: solutionBlockText(solutionText, marks),
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

function isOnlyPartLabel(text: string) {
  return /^\(?\s*(?:[a-z]|[ivxlcdm]+)\s*\)?[).:]?\s*$/i.test(text);
}

function contentBlocksForAuthorPart(args: Record<string, unknown>, partId: string, partText: string, issues: MauthActionValidationIssue[]) {
  const solutionText = optionalTextArg(args, "solutionText") || optionalTextArg(args, "solution");
  const includeSolution = args.includeSolution !== false && Boolean(solutionText);
  const marks = positiveInteger(args.marks, 1, 0, 100);
  const studentSpaceLines = resolvedStudentSpaceLines(args.studentSpaceLines ?? args.answerLines ?? args.lines, solutionText, marks, 6, 40);
  const blocks: ContentBlock[] = [
    ...(partText
      ? [
          {
            id: authorBlockId(partId, "part-text"),
            kind: "text" as const,
            text: partText,
          },
        ]
      : []),
    ...diagramBlocksFromArgs(args, partId, issues, [partText, ...rawAssistantTextFragmentsFromAuthorArgs(args)].join("\n")),
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
      text: solutionBlockText(solutionText, marks),
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
    else if (isOnlyPartLabel(text)) {
      issues.push({
        path: `${path}.text`,
        message: "must include the actual part prompt, not only the visible part label",
        expected: "part prompt text such as $\\mathbf{a}\\cdot\\mathbf{b}$",
      });
    }
    const partId = String(entry.id ?? authorBlockId(questionId, `part-${index + 1}`));
    const contentBlocks = contentBlocksForAuthorPart(entry, partId, text, issues);
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
  const contentBlocks = contentBlocksForAuthorQuestion(args, question.id, issues, question);
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

  const customBlocks = diagramBlocksFromArgs(
    args,
    question.id,
    issues,
    [...rawAssistantTextFragmentsFromAuthorArgs(args), ...rawAssistantTextFragmentsFromQuestion(question)].join("\n"),
  );
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

function blocksWithEnsuredSolution(
  scopeId: string,
  blocks: readonly ContentBlock[],
  solutionText: string,
  requestedLines: unknown,
  expectedMarks: unknown,
) {
  const lines = resolvedStudentSpaceLines(requestedLines, solutionText, expectedMarks, 8, MAX_AUTHOR_STUDENT_SPACE_LINES);
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
      text: solutionBlockText(solutionText, positiveInteger(expectedMarks, 0, 0, 100)),
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
        const contentBlocks = blocksWithEnsuredSolution(
          part.id,
          part.contentBlocks,
          partSolutionText,
          partPayload.studentSpaceLines,
          positiveInteger(partPayload.marks, part.marks, 0, 100),
        );
        return {
          ...part,
          marks: positiveInteger(partPayload.marks, part.marks, 0, 100),
          contentBlocks,
          itemOrder: blockOrder(contentBlocks),
        };
      });
      const marks = positiveInteger(entry.questionMarks ?? entry.marks, question.marks, 0, 100);
      actions.push({
        type: "question.update",
        questionId: question.id,
        patch: {
          marks,
          parts,
          itemOrder: questionOrder(question.contentBlocks, parts),
        },
      });
      return;
    }

    const marks = positiveInteger(entry.marks ?? entry.questionMarks, question.marks, 0, 100);
    const contentBlocks = blocksWithEnsuredSolution(question.id, question.contentBlocks, solutionText, entry.studentSpaceLines, marks);
    actions.push({
      type: "question.update",
      questionId: question.id,
      patch: {
        marks,
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
  options: MauthAssistantToolOptions<Q, F, C>,
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
  options: MauthAssistantToolOptions<Q, F, C> = {},
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

  if (call.name === "mauth.preview.inspect") {
    return {
      ok: true,
      toolName: call.name,
      data: inspectMauthPreview(document, call.arguments, options.assistantContext),
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
  const sanitizedActions = sanitizeAssistantActions(document, actions);

  if (call.name === "mauth.actions.preview") {
    return resultTool(call.name, previewMauthDocumentActions(document, sanitizedActions, options));
  }

  if (call.name === "mauth.actions.apply") {
    return resultTool(call.name, applyMauthDocumentActions(document, sanitizedActions, options));
  }

  return failTool(call.name, `Unsupported assistant tool: ${call.name}`) as MauthAssistantToolResult<Q, F, C>;
}
