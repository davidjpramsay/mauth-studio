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
import { inspectMauthDiagram } from "./mauthDiagramInspection.ts";
import { diagramIntentFromText } from "./mauthDiagramIntent.ts";
import { buildVector2DSourceDiagramConfig, type Vector2DSourceDiagramInput } from "./diagramVector2d.ts";

export const MAUTH_ASSISTANT_TOOL_NAMES = [
  "mauth.tools.describe",
  "mauth.document.inspect",
  "mauth.preview.inspect",
  "mauth.validation.run",
  "mauth.actions.preview",
  "mauth.actions.apply",
  "mauth.question.upsert",
  "mauth.author.replaceQuestion",
  "mauth.author.addDiagram",
  "mauth.author.ensureSolutions",
  "mauth.solutions.writeAll",
  "mauth.author.adjustResponseSpaces",
  "mauth.format.apply",
  "mauth.layout.check",
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

export interface MauthAuthorResponseSpaceValidationFailure {
  error: string;
  issues: MauthActionValidationIssue[];
}

export interface MauthFormatApplyValidationFailure {
  error: string;
  issues: MauthActionValidationIssue[];
}

export interface MauthSolutionsWriteAllValidationFailure {
  error: string;
  issues: MauthActionValidationIssue[];
}

export interface MauthBlockInspection {
  id: string;
  kind: ContentBlock["kind"];
  visibility: ContentBlockVisibility;
  markTicks?: number;
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
    clipped?: boolean;
    labelCollisionCount?: number;
    tooSmall?: boolean;
    tooLarge?: boolean;
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
  studentAnswerSurfaceCount: number;
  solutionModuleCount: number;
  hiddenMarkTotal: number;
  visibleMarkNoteCount: number;
}

export interface MauthPreviewDiagramInspection {
  id: string;
  anchor: string;
  graphType: string;
  summary: MauthPreviewDiagramSummary;
  align?: string;
  textSide?: string;
  visibility: ContentBlockVisibility;
  expectedIntent?: {
    id: string;
    expectedType: string;
    label: string;
    reason: string;
  };
  semanticChecks: string[];
  semanticWarnings: MauthPreviewInspectionWarning[];
  warnings: MauthPreviewInspectionWarning[];
  rendered?: {
    available: boolean;
    rendered?: boolean;
    errorText?: string;
    pageNumber?: number;
    viewportRect?: MauthRenderedPreviewRect;
    warnings: MauthPreviewInspectionWarning[];
  };
  besideCandidate?: {
    blockId: string;
    anchor: string;
    kind: ContentBlock["kind"];
    expectedSide: "left" | "right";
    replacementSlot: boolean;
  };
}

export interface MauthPreviewDiagramSummary {
  renderer: string;
  size?: {
    widthPx?: number;
    heightPx?: number;
    scalePercent?: number;
  };
  axes?: {
    xMin?: number;
    xMax?: number;
    yMin?: number;
    yMax?: number;
    showAxes?: boolean;
    showGrid?: boolean;
  };
  functions?: Array<{
    expression?: string;
    latex?: string;
    label?: string;
    kind?: string;
    show?: boolean;
  }>;
  features?: Array<{
    kind?: string;
    label?: string;
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    show?: boolean;
  }>;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  substancePreview?: string;
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

export type MauthLayoutCheckMode = "student" | "solutions" | "both";

export interface MauthLayoutCheckIssue extends MauthPreviewInspectionWarning {
  source: "document" | "preview" | "rendered";
  expected?: string;
}

export interface MauthLayoutCheck {
  mode: MauthLayoutCheckMode;
  ok: boolean;
  summary: {
    questions: number;
    marksTotal: number;
    pages?: number;
    issueCount: number;
    warningCount: number;
    errorCount: number;
    missingAnswerSurfaceCount: number;
    missingSolutionCount: number;
    solutionMismatchCount: number;
    diagramIssueCount: number;
    printRiskCount: number;
  };
  issues: MauthLayoutCheckIssue[];
  preview: Pick<MauthPreviewInspection, "scope" | "target" | "warnings" | "renderedMetrics" | "questions">;
  document: MauthDocumentInspection;
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

function compactMultilineText(value: string, maxLength = 1600) {
  const compacted = value
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
  return compacted.length <= maxLength ? compacted : `${compacted.slice(0, maxLength - 1)}...`;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanField(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function stringField(value: unknown, maxLength = 180) {
  return typeof value === "string" && value.trim() ? compactText(value, maxLength) : undefined;
}

function compactPlainRecord(value: unknown, keys: readonly string[], maxArrayItems = 10) {
  if (!isRecord(value)) return undefined;
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    const item = value[key];
    if (typeof item === "string") output[key] = compactText(item, 220);
    else if (typeof item === "number" && Number.isFinite(item)) output[key] = item;
    else if (typeof item === "boolean") output[key] = item;
    else if (Array.isArray(item)) output[key] = item.slice(0, maxArrayItems);
  }
  return Object.keys(output).length ? output : undefined;
}

function compactVector2dMetadata(metadata: unknown) {
  if (!isRecord(metadata) || !isRecord(metadata.vector2d)) return undefined;
  const vector2d = metadata.vector2d;
  const vectors = recordArray(vector2d.vectors)
    .slice(0, 8)
    .map((entry) => ({
      id: stringField(entry.id, 40),
      name: stringField(entry.name, 40),
      label: stringField(entry.label, 80),
      start: Array.isArray(entry.start) ? entry.start.slice(0, 2) : undefined,
      components: Array.isArray(entry.components) ? entry.components.slice(0, 2) : undefined,
      showComponents: booleanField(entry.showComponents),
    }));
  const angleMarkers = recordArray(vector2d.angleMarkers)
    .slice(0, 8)
    .map((entry) => ({
      from: stringField(entry.from, 40),
      to: stringField(entry.to, 40),
      label: stringField(entry.label, 80),
      rightAngle: booleanField(entry.rightAngle),
      radius: numberField(entry.radius),
      labelX: numberField(entry.labelX),
      labelY: numberField(entry.labelY),
    }));
  const segmentLabels = recordArray(vector2d.segmentLabels)
    .slice(0, 8)
    .map((entry) => ({
      vectorId: stringField(entry.vectorId, 40),
      label: stringField(entry.label, 80),
      position: numberField(entry.position),
      offsetPx: numberField(entry.offsetPx ?? entry.offset),
      labelX: numberField(entry.labelX),
      labelY: numberField(entry.labelY),
    }));
  return {
    labelStyle: stringField(vector2d.labelStyle, 40),
    ...(vectors.length ? { vectors } : {}),
    ...(angleMarkers.length ? { angleMarkers } : {}),
    ...(segmentLabels.length ? { segmentLabels } : {}),
  };
}

function compactDiagramSummary(config: GraphConfig): MauthPreviewDiagramSummary {
  const summary: MauthPreviewDiagramSummary = {
    renderer: config.type,
  };
  const size = {
    widthPx: numberField(config.widthPx),
    heightPx: numberField(config.heightPx),
    scalePercent: numberField(config.scalePercent),
  };
  if (Object.values(size).some((value) => value !== undefined)) summary.size = size;

  if (config.type === "graph2d") {
    summary.axes = {
      xMin: numberField(config.xMin),
      xMax: numberField(config.xMax),
      yMin: numberField(config.yMin),
      yMax: numberField(config.yMax),
      showAxes: booleanField(config.showAxes),
      showGrid: booleanField(config.showGrid),
    };
    const functions = recordArray(config.functions)
      .slice(0, 8)
      .map((entry) => ({
        expression: stringField(entry.expression),
        latex: stringField(entry.latex),
        label: stringField(entry.label, 80),
        kind: stringField(entry.kind, 60),
        show: entry.show === undefined ? undefined : booleanField(entry.show),
      }));
    if (functions.length) summary.functions = functions;
    else if (typeof config.expression === "string" && config.expression.trim()) {
      summary.functions = [{ expression: compactText(config.expression) }];
    }
    const features = recordArray(config.features)
      .slice(0, 12)
      .map((entry) => ({
        kind: stringField(entry.kind, 80),
        label: stringField(entry.label, 100),
        x: numberField(entry.x),
        y: numberField(entry.y),
        x1: numberField(entry.x1),
        y1: numberField(entry.y1),
        x2: numberField(entry.x2),
        y2: numberField(entry.y2),
        show: entry.show === undefined ? undefined : booleanField(entry.show),
      }));
    if (features.length) summary.features = features;
    return summary;
  }

  if (config.type === "geometricConstruction") {
    const source = isRecord(config.options) && typeof config.options.substanceSource === "string" ? config.options.substanceSource : "";
    if (source.trim()) summary.substancePreview = compactMultilineText(source);
    summary.data = compactPlainRecord(config.data, ["objects", "relationships", "style"]);
    return summary;
  }

  if (config.type === "statsChart") {
    summary.data = compactPlainRecord(config.data, [
      "chartType",
      "dataMode",
      "yAxisMode",
      "title",
      "xAxisLabel",
      "yAxisLabel",
      "dataValues",
      "xValues",
      "probabilities",
      "bins",
      "binSize",
    ]);
    return summary;
  }

  if (config.type === "vector2d") {
    summary.axes = {
      xMin: numberField(config.xMin),
      xMax: numberField(config.xMax),
      yMin: numberField(config.yMin),
      yMax: numberField(config.yMax),
      showAxes: booleanField(config.showAxes),
      showGrid: booleanField(config.showGrid),
    };
    const vector2d = compactVector2dMetadata(config.metadata);
    if (vector2d) summary.metadata = { vector2d };
    return summary;
  }

  if (config.type === "setDiagram" || config.type === "graph3d" || config.type === "image" || config.type === "network") {
    summary.data = compactPlainRecord(config.data, ["sets", "regions", "nodes", "edges", "src", "caption", "objects", "relationships"]);
    summary.metadata = compactPlainRecord(config.metadata, ["vectors", "labels", "view"]);
  }

  return summary;
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

function partOrder(blocks: readonly ContentBlock[], subparts: readonly MauthSubpartLike[]) {
  return [...blockOrder(blocks), ...subparts.map((subpart) => ({ kind: "subpart" as const, id: subpart.id }))];
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

function blockMarkTicks(block: ContentBlock) {
  if (blockVisibility(block) !== "solution") return 0;
  return positiveInteger(block.markTicks, 0, 0, 20);
}

function isLikelySolutionText(block: ContentBlock) {
  return block.kind === "text" && /^\s*(?:\*\*)?Solution\.?/i.test(block.text);
}

function inspectBlock(block: ContentBlock): MauthBlockInspection {
  const visibility = blockVisibility(block);
  const markTicks = blockMarkTicks(block);
  const base = markTicks ? { markTicks } : {};
  if (block.kind === "text") {
    return {
      ...base,
      id: block.id,
      kind: block.kind,
      visibility,
      textPreview: compactText(block.text),
    };
  }
  if (block.kind === "choices") {
    return {
      ...base,
      id: block.id,
      kind: block.kind,
      visibility,
      choiceCount: block.choices.length,
    };
  }
  if (block.kind === "table") {
    return {
      ...base,
      id: block.id,
      kind: block.kind,
      visibility,
      tableRows: block.rows.length,
      tableColumns: Math.max(block.headers.length, ...block.rows.map((row) => row.length), 0),
    };
  }
  if (block.kind === "diagram") {
    return {
      ...base,
      id: block.id,
      kind: block.kind,
      visibility,
      diagramType: block.graphConfig.type,
      diagramAlign: block.diagramAlign,
    };
  }
  if (block.kind === "space") {
    return {
      ...base,
      id: block.id,
      kind: block.kind,
      visibility,
      lines: block.lines,
    };
  }
  return { ...base, id: block.id, kind: block.kind, visibility };
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
  return blocks.reduce((sum, block) => {
    const surfaceTicks = blockMarkTicks(block);
    if (block.kind !== "text") return sum + surfaceTicks;
    if (blockVisibility(block) !== "solution" && !isLikelySolutionText(block)) return sum;
    return sum + surfaceTicks + markAnnotationTotal(block.text);
  }, 0);
}

function visibleMarkNotesInBlocks(blocks: readonly ContentBlock[]) {
  return textBlocks(blocks).filter(
    (block) => (blockVisibility(block) === "solution" || isLikelySolutionText(block)) && hasVisibleMarkNote(block.text),
  ).length;
}

function studentSpaceLinesInBlocks(blocks: readonly ContentBlock[]) {
  return blocks.reduce((sum, block) => (block.kind === "space" && blockVisibility(block) === "student" ? sum + block.lines : sum), 0);
}

function studentAnswerSurfaceCountInBlocks(blocks: readonly ContentBlock[]) {
  return blocks.filter(
    (block) => blockVisibility(block) === "student" && (block.kind === "space" || block.kind === "table" || block.kind === "diagram"),
  ).length;
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
    studentAnswerSurfaceCount: studentAnswerSurfaceCountInBlocks(blocks),
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
  if (scope.solutionModuleCount > 0 && scope.studentAnswerSurfaceCount === 0) {
    warnings.push({
      code: "student-space-missing",
      severity: "warning",
      anchor: scope.anchor,
      message: `${scope.label} has a solution but no student-only answer surface to preserve pagination.`,
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

function renderedDiagramInspection(anchor: string, renderedMetrics?: MauthPreviewRenderedMetrics) {
  if (!renderedMetrics?.available) return undefined;
  const renderedAnchor = renderedMetrics.anchors.find((item) => item.anchor === anchor);
  if (!renderedAnchor?.diagram) return undefined;
  const warnings = renderedAnchor.warnings.filter((warning) => warning.code.startsWith("rendered-diagram-"));
  return {
    available: true,
    rendered: renderedAnchor.diagram.rendered,
    ...(renderedAnchor.diagram.errorText ? { errorText: renderedAnchor.diagram.errorText } : {}),
    ...(renderedAnchor.pageNumber ? { pageNumber: renderedAnchor.pageNumber } : {}),
    ...(renderedAnchor.diagram.viewportRect ? { viewportRect: renderedAnchor.diagram.viewportRect } : {}),
    warnings,
  };
}

function diagramInspection(entry: PreviewBlockEntry, questionText: string, renderedMetrics?: MauthPreviewRenderedMetrics) {
  if (entry.block.kind !== "diagram") {
    return {
      checks: [] as string[],
      semanticChecks: [] as string[],
      semanticWarnings: [] as MauthPreviewInspectionWarning[],
      warnings: [] as MauthPreviewInspectionWarning[],
    };
  }
  const inspection = inspectMauthDiagram(entry.block.graphConfig, questionText);
  const rendered = renderedDiagramInspection(entry.anchor, renderedMetrics);
  const structuralWarnings = inspection.warnings.map((warning) => ({
    ...warning,
    anchor: entry.anchor,
    targetId: entry.block.id,
  }));
  const renderedWarnings =
    rendered?.warnings.map((warning) => ({
      ...warning,
      anchor: entry.anchor,
      targetId: entry.block.id,
    })) ?? [];
  return {
    checks: inspection.checks,
    expectedIntent: inspection.expectedIntent,
    semanticChecks: inspection.semanticChecks,
    semanticWarnings: inspection.semanticWarnings.map((warning) => ({
      ...warning,
      anchor: entry.anchor,
      targetId: entry.block.id,
    })),
    warnings: [...structuralWarnings, ...renderedWarnings],
    rendered,
  };
}

function inspectPreviewDiagrams(
  entries: readonly PreviewBlockEntry[],
  questionText: string,
  renderedMetrics?: MauthPreviewRenderedMetrics,
) {
  return entries
    .map((entry, index): MauthPreviewDiagramInspection | null => {
      if (entry.block.kind !== "diagram") return null;
      const inspection = diagramInspection(entry, questionText, renderedMetrics);
      return {
        id: entry.block.id,
        anchor: entry.anchor,
        graphType: entry.block.graphConfig.type,
        summary: compactDiagramSummary(entry.block.graphConfig),
        align: entry.block.diagramAlign,
        textSide: entry.block.diagramTextSide,
        visibility: blockVisibility(entry.block),
        ...(inspection.expectedIntent ? { expectedIntent: inspection.expectedIntent } : {}),
        semanticChecks: inspection.semanticChecks,
        semanticWarnings: inspection.semanticWarnings,
        warnings: inspection.warnings,
        ...(inspection.rendered ? { rendered: inspection.rendered } : {}),
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

  for (const diagram of diagrams) {
    warnings.push(...diagram.warnings);
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
}

function inspectPreviewQuestion(
  question: MauthQuestionLike,
  questionIndex: number,
  target: MauthPreviewTargetInspection,
  renderedMetrics?: MauthPreviewRenderedMetrics,
) {
  const entries = previewBlockEntries(question);
  const intentText = questionIntentText(question);
  const diagrams = inspectPreviewDiagrams(entries, intentText, renderedMetrics);
  const solutionScopes = questionSolutionScopes(question, questionIndex);
  const warnings: MauthPreviewInspectionWarning[] = [];

  for (const scope of solutionScopes) addSolutionScopeWarnings(scope, warnings);
  addQuestionPreviewWarnings(question, questionIndex, diagrams, warnings);

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

function dedupePreviewInspectionWarnings(warnings: readonly MauthPreviewInspectionWarning[]) {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.anchor ?? ""}:${warning.targetId ?? ""}:${warning.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

  const renderedMetrics = renderedMetricsForInspection(context.renderedMetrics, scope, target, context.activeAnchor);
  const inspectedQuestion = question ? inspectPreviewQuestion(question, questionIndex, target, renderedMetrics) : undefined;
  const inspectionWarnings = dedupePreviewInspectionWarnings([
    ...warnings,
    ...(inspectedQuestion?.warnings ?? []),
    ...(renderedMetrics.available ? renderedMetrics.warnings : []),
  ]);
  return {
    scope,
    activeAnchor: context.activeAnchor ?? null,
    target,
    question: inspectedQuestion,
    questions:
      scope === "document"
        ? document.questions.map((item, index) => {
            const questionInspection = inspectPreviewQuestion(
              item,
              index,
              {
                kind: "question",
                questionId: item.id,
                questionNumber: index + 1,
              },
              renderedMetrics,
            );
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
    warnings: inspectionWarnings,
    renderedMetrics,
  };
}

function layoutCheckMode(args: unknown): MauthLayoutCheckMode {
  if (!isRecord(args) || typeof args.mode !== "string") return "both";
  return args.mode === "student" || args.mode === "solutions" || args.mode === "both" ? args.mode : "both";
}

function layoutIssueKey(issue: Pick<MauthLayoutCheckIssue, "code" | "anchor" | "targetId" | "message">) {
  return `${issue.code}:${issue.anchor ?? ""}:${issue.targetId ?? ""}:${issue.message}`;
}

function layoutIssueFromPreview(warning: MauthPreviewInspectionWarning): MauthLayoutCheckIssue {
  const source: MauthLayoutCheckIssue["source"] = warning.code.startsWith("rendered-") ? "rendered" : "preview";
  return { ...warning, source };
}

function layoutPrintRiskCode(code: string) {
  return (
    code.includes("overflow") ||
    code.includes("clipped") ||
    code.includes("blank-page") ||
    code.includes("too-large") ||
    code === "final-page-break"
  );
}

function numericGraphSizeValue(config: GraphConfig, key: "widthPx" | "heightPx" | "width" | "height") {
  const directValue = (config as unknown as Record<string, unknown>)[key];
  if (typeof directValue === "number" && Number.isFinite(directValue)) return directValue;
  const options = isRecord(config.options) ? config.options : undefined;
  const optionValue = options?.[key];
  return typeof optionValue === "number" && Number.isFinite(optionValue) ? optionValue : undefined;
}

function addOversizedDiagramIssues(
  blocks: readonly ContentBlock[],
  anchorForBlock: (blockId: string) => string,
  issues: MauthLayoutCheckIssue[],
) {
  for (const block of blocks) {
    if (block.kind !== "diagram") continue;
    const width = numericGraphSizeValue(block.graphConfig, "widthPx") ?? numericGraphSizeValue(block.graphConfig, "width");
    const height = numericGraphSizeValue(block.graphConfig, "heightPx") ?? numericGraphSizeValue(block.graphConfig, "height");
    if ((width !== undefined && width > 760) || (height !== undefined && height > 680)) {
      issues.push({
        code: "diagram-oversized-print-risk",
        severity: "warning",
        source: "document",
        anchor: anchorForBlock(block.id),
        targetId: block.id,
        message: `Diagram ${block.id} is large enough to risk clipping or awkward pagination.`,
        expected: "Keep diagrams within the printable page area, or use left/right layout with matching answer space.",
      });
    }
  }
}

function addStructuralLayoutIssues<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  mode: MauthLayoutCheckMode,
  issues: MauthLayoutCheckIssue[],
) {
  questions.forEach((question, questionIndex) => {
    const questionNumber = questionIndex + 1;
    const questionDirect = solutionScopeInspection(
      "question",
      questionAnchor(question.id),
      `Question ${questionNumber}`,
      question.marks,
      question.contentBlocks,
    );
    const shouldCheckQuestionDirect = !question.parts?.length && questionDirect.marks > 0;
    if (shouldCheckQuestionDirect && mode !== "solutions" && questionDirect.studentAnswerSurfaceCount === 0) {
      issues.push({
        code: "student-answer-surface-missing",
        severity: "warning",
        source: "document",
        anchor: questionAnchor(question.id),
        targetId: question.id,
        message: `Question ${questionNumber} has marks but no student-only answer surface.`,
        expected: "Add a student-only answer space, table, or diagram answer surface unless the answer is entirely multiple choice.",
      });
    }
    if (shouldCheckQuestionDirect && mode !== "student" && questionDirect.solutionModuleCount === 0) {
      issues.push({
        code: "solution-missing",
        severity: "warning",
        source: "document",
        anchor: questionAnchor(question.id),
        targetId: question.id,
        message: `Question ${questionNumber} has marks but no solution-only module yet.`,
        expected: "Add a solution-only text/table/diagram answer surface with hidden [[marks:n]] ticks.",
      });
    }

    addOversizedDiagramIssues(question.contentBlocks, (blockId) => questionBlockAnchor(question.id, blockId), issues);
    question.parts?.forEach((part, partIndex) => {
      const partLabel = part.label ?? String.fromCharCode(97 + partIndex);
      const partScope = solutionScopeInspection(
        "part",
        partAnchor(question.id, part.id),
        `Question ${questionNumber} part ${partLabel}`,
        part.marks,
        part.contentBlocks,
      );
      if (!part.subparts?.length && partScope.marks > 0 && mode !== "solutions" && partScope.studentAnswerSurfaceCount === 0) {
        issues.push({
          code: "student-answer-surface-missing",
          severity: "warning",
          source: "document",
          anchor: partAnchor(question.id, part.id),
          targetId: part.id,
          message: `Question ${questionNumber} part ${partLabel} has marks but no student-only answer surface.`,
          expected: "Add a student-only answer surface unless the part answer is the visible table/diagram itself.",
        });
      }
      if (!part.subparts?.length && partScope.marks > 0 && mode !== "student" && partScope.solutionModuleCount === 0) {
        issues.push({
          code: "solution-missing",
          severity: "warning",
          source: "document",
          anchor: partAnchor(question.id, part.id),
          targetId: part.id,
          message: `Question ${questionNumber} part ${partLabel} has marks but no solution-only module yet.`,
          expected: "Add a solution-only text/table/diagram answer surface with hidden [[marks:n]] ticks.",
        });
      }
      addOversizedDiagramIssues(part.contentBlocks, (blockId) => partBlockAnchor(question.id, part.id, blockId), issues);
      part.subparts?.forEach((subpart, subpartIndex) => {
        const subpartLabel = subpart.label ?? String(subpartIndex + 1);
        const subpartScope = solutionScopeInspection(
          "subpart",
          subpartAnchor(question.id, part.id, subpart.id),
          `Question ${questionNumber} part ${partLabel} subpart ${subpartLabel}`,
          subpart.marks,
          subpart.contentBlocks,
        );
        if (subpartScope.marks > 0 && mode !== "solutions" && subpartScope.studentAnswerSurfaceCount === 0) {
          issues.push({
            code: "student-answer-surface-missing",
            severity: "warning",
            source: "document",
            anchor: subpartAnchor(question.id, part.id, subpart.id),
            targetId: subpart.id,
            message: `Question ${questionNumber} part ${partLabel} subpart ${subpartLabel} has marks but no student-only answer surface.`,
            expected: "Add a student-only answer surface unless the subpart answer is the visible table/diagram itself.",
          });
        }
        if (subpartScope.marks > 0 && mode !== "student" && subpartScope.solutionModuleCount === 0) {
          issues.push({
            code: "solution-missing",
            severity: "warning",
            source: "document",
            anchor: subpartAnchor(question.id, part.id, subpart.id),
            targetId: subpart.id,
            message: `Question ${questionNumber} part ${partLabel} subpart ${subpartLabel} has marks but no solution-only module yet.`,
            expected: "Add a solution-only text/table/diagram answer surface with hidden [[marks:n]] ticks.",
          });
        }
        addOversizedDiagramIssues(
          subpart.contentBlocks,
          (blockId) => subpartBlockAnchor(question.id, part.id, subpart.id, blockId),
          issues,
        );
      });
    });

    if (questionIndex === questions.length - 1 && question.pageBreakAfter) {
      issues.push({
        code: "final-page-break",
        severity: "warning",
        source: "document",
        anchor: questionAnchor(question.id),
        targetId: question.id,
        message: `Question ${questionNumber} has a page break after the final question, which can create a blank final page.`,
        expected: "Remove the final page break unless an intentional supplementary/blank page is required.",
      });
    }
  });
}

export function inspectMauthLayout<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  document: MauthDocumentLike<Q, F, C>,
  args: unknown = {},
  options: MauthAssistantToolOptions<Q, F, C> = {},
): MauthLayoutCheck {
  const mode = layoutCheckMode(args);
  const documentInspection = inspectMauthDocument(document);
  const preview = inspectMauthPreview(document, { scope: "document" }, options.assistantContext);
  const issues: MauthLayoutCheckIssue[] = [];

  addStructuralLayoutIssues(document.questions, mode, issues);
  for (const warning of preview.warnings) {
    if (mode === "student" && warning.code.startsWith("solution-")) continue;
    if (mode === "solutions" && warning.code === "solution-missing") continue;
    if (mode === "solutions" && warning.code === "student-answer-surface-missing") continue;
    issues.push(layoutIssueFromPreview(warning));
  }

  const dedupedIssues = issues.filter(
    (issue, index, all) => all.findIndex((item) => layoutIssueKey(item) === layoutIssueKey(issue)) === index,
  );
  const errorCount = dedupedIssues.filter((issue) => issue.severity === "error").length;
  const warningCount = dedupedIssues.filter((issue) => issue.severity === "warning").length;
  return {
    mode,
    ok: errorCount === 0 && warningCount === 0,
    summary: {
      questions: documentInspection.counts.questions,
      marksTotal: documentInspection.counts.marksTotal,
      ...(preview.renderedMetrics.available ? { pages: preview.renderedMetrics.pageCount } : {}),
      issueCount: dedupedIssues.length,
      warningCount,
      errorCount,
      missingAnswerSurfaceCount: dedupedIssues.filter(
        (issue) => issue.code === "student-space-missing" || issue.code === "student-answer-surface-missing",
      ).length,
      missingSolutionCount: dedupedIssues.filter((issue) => issue.code === "solution-missing").length,
      solutionMismatchCount: dedupedIssues.filter(
        (issue) => issue.code === "solution-hidden-mark-total-mismatch" || issue.code === "solution-visible-mark-note",
      ).length,
      diagramIssueCount: dedupedIssues.filter((issue) => issue.code.includes("diagram") || issue.code.startsWith("graph2d-")).length,
      printRiskCount: dedupedIssues.filter((issue) => layoutPrintRiskCode(issue.code)).length,
    },
    issues: dedupedIssues,
    preview: {
      scope: preview.scope,
      target: preview.target,
      warnings: preview.warnings,
      renderedMetrics: preview.renderedMetrics,
      questions: preview.questions,
    },
    document: documentInspection,
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
        name: "mauth.question.upsert",
        description:
          "Create the requested question when it is the next missing question, or replace it when it already exists, from a compact authoring payload. This is the preferred high-level question authoring tool. Omitted diagram fields preserve existing diagrams; answerSurface diagram/table supports sketch, label, shade, and completion-table answer surfaces.",
      },
      {
        name: "mauth.author.replaceQuestion",
        description:
          "Legacy alias for mauth.question.upsert. Replace one existing question, or append the next missing question, from a compact authoring payload. Omitted diagram fields preserve existing diagrams.",
      },
      {
        name: "mauth.author.addDiagram",
        description:
          "Add or replace a top-level diagram in one existing question from a real Mauth graphConfig wrapped as { graphConfig: { type: ... } }, or from vectorRayDiagram for source-faithful scalar-product ray diagrams. Use diagramId when repairing/replacing an existing diagram. Choose graphConfig.type first: geometricConstruction for Penrose theorem geometry, graph2d for coordinate/function graphs, vector2d for coordinate vectors and source-faithful no-axis vector/ray diagrams, statsChart for statistics, setDiagram for Venn diagrams, graph3d for 3D, or image for uploads.",
      },
      {
        name: "mauth.author.ensureSolutions",
        description:
          "Add or replace solution-only worked solutions, optionally update marks, and ensure matching student-only answer spaces for existing questions or parts while preserving shared question modules.",
      },
      {
        name: "mauth.solutions.writeAll",
        description:
          "Write or replace a full solution key for every marked question, part, and subpart in the current test. Requires coverage for all marked scopes, preserves diagrams, adds hidden [[marks:n]] ticks, sizes student spaces, and validates solution layout before commit.",
      },
      {
        name: "mauth.author.adjustResponseSpaces",
        description:
          "Resize or add student-only answer spaces for existing questions, parts, or subparts without rewriting question content, solutions, or diagrams.",
      },
      {
        name: "mauth.format.apply",
        description:
          "Apply safe high-level formatting operations such as page breaks before parts/subparts, diagram alignment, response-space sizing, module moves, solution-fit spacing, and tidy spacing without rewriting question content.",
      },
      {
        name: "mauth.layout.check",
        description:
          "Run a document-wide structural and rendered-layout check for page overflow, missing answer surfaces, solution-space mismatch, blank-page risks, oversized diagrams, diagram warnings, and print-risk items.",
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
      "For focused one-question writing or replacement requests, prefer mauth.question.upsert.",
      'For sketch/label/shade/draw-on-diagram or completion-table answers, use mauth.question.upsert with answerSurface: "diagram" or "table" plus a matching solutionDiagram/solutionTable instead of adding a separate answer-space block.',
      "For mark-allocation or solution-only edits, prefer mauth.author.ensureSolutions and do not replace the whole question.",
      "For focused diagram follow-ups, prefer mauth.author.addDiagram with a renderer-specific graphConfig.",
      "For focused response-space/layout fixes that do not need a worked-solution rewrite, prefer mauth.author.adjustResponseSpaces.",
      "For focused formatting requests such as page breaks before a part/subpart, diagram alignment, moving one module, fitting a solution to its student space, or tidying excess spacing, prefer mauth.format.apply.",
      "For whole-test solution-key passes, prefer mauth.solutions.writeAll. It must include solution payloads for every marked question, part, and subpart, preserve diagrams, use hidden [[marks:n]] ticks, and validate totals/layout before commit.",
      "For broad layout/print checks, use mauth.layout.check. Repair any warning it returns with the focused high-level tool that owns that issue.",
      "High-level diagram blocks must be shaped as { graphConfig: { type: ... }, diagramAlign?: ... }; source scalar-product ray diagrams may instead use { vectorRayDiagram: { vectors, segmentLabels?, angleMarkers? }, diagramAlign?: ... }. Do not use top-level type/data/options fields or a config alias.",
      "Choose diagram renderers by classroom intent: geometricConstruction for ruler-style theorem geometry, graph2d for coordinate/function graphs, vector2d for component vectors on axes and source-faithful no-axis scalar-product ray diagrams, statsChart for histograms/column/probability charts, setDiagram for Venn diagrams, network for networks, and graph3d for 3D.",
      "The authoring boundary rejects obvious renderer mismatches before applying edits; repair by switching graphConfig.type and using that renderer's native schema.",
      "For focused solution-key passes, prefer mauth.author.ensureSolutions when the supplied question text is enough.",
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
    const nextQuestionNumber = questions.length + 1;
    const expected =
      questionNumber === nextQuestionNumber
        ? `Question ${questionNumber} does not exist yet. mauth.author.addDiagram only edits diagrams in existing questions 1 to ${questions.length}. If the teacher is adding a new/source question, switch to mauth.question.upsert or mauth_convert_source_question and create Question ${questionNumber} with the diagram in the same payload.`
        : `existing question 1 to ${questions.length}. For a new/source question, use mauth.question.upsert instead of mauth.author.addDiagram.`;
    issues.push({ path: "arguments.questionNumber", message: "must reference an existing question", expected });
  }
  return question;
}

interface AuthorReplaceQuestionTarget {
  question: MauthQuestionLike;
  mode: "replace" | "append";
  afterQuestionId?: string;
}

function collectQuestionIds(questions: readonly MauthQuestionLike[]) {
  return new Set(questions.map((question) => question.id));
}

function uniqueQuestionId(questions: readonly MauthQuestionLike[], questionNumber: number) {
  const existingIds = collectQuestionIds(questions);
  const base = `assistant-question-${questionNumber}`;
  if (!existingIds.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function replaceOrAppendQuestionTarget<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  args: Record<string, unknown>,
  issues: MauthActionValidationIssue[],
): AuthorReplaceQuestionTarget | undefined {
  if (typeof args.questionId === "string" && args.questionId.trim()) {
    const question = questions.find((item) => item.id === args.questionId);
    if (!question) {
      issues.push({ path: "arguments.questionId", message: "must reference an existing question", expected: "question id" });
      return undefined;
    }
    return { question, mode: "replace" };
  }

  const questionNumber = typeof args.questionNumber === "number" ? args.questionNumber : Number(args.questionNumber ?? 1);
  if (!Number.isInteger(questionNumber) || questionNumber < 1) {
    issues.push({ path: "arguments.questionNumber", message: "must be a positive integer", expected: "1-based question number" });
    return undefined;
  }

  const existingQuestion = questions[questionNumber - 1];
  if (existingQuestion) return { question: existingQuestion, mode: "replace" };

  const nextQuestionNumber = questions.length + 1;
  if (questionNumber === nextQuestionNumber) {
    return {
      question: {
        id: uniqueQuestionId(questions, questionNumber),
        marks: 0,
        contentBlocks: [],
        parts: [],
        itemOrder: [],
      },
      mode: "append",
      afterQuestionId: questions[questions.length - 1]?.id,
    };
  }

  issues.push({
    path: "arguments.questionNumber",
    message: "must reference an existing question or the next question to append",
    expected: questions.length ? `1 to ${nextQuestionNumber}` : "1",
  });
  return undefined;
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
type AuthorAnswerSurface = "space" | "diagram" | "table" | "none";

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

function solutionBlockTextWithoutMarkAnnotations(value: string) {
  const normalized = normalizeSolutionMarkAnnotations(value.trim()).replace(MARK_TICK_ANNOTATION_PATTERN, "");
  const bodySource = SOLUTION_HEADING_PATTERN.test(normalized) ? normalized.replace(SOLUTION_HEADING_PATTERN, "").trimStart() : normalized;
  const body = compactSolutionText(bodySource);
  return body ? `**Solution.**\n\n${body}` : "**Solution.**\n\n";
}

function hasOwn(args: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(args, key);
}

function hasAuthorDiagramArgs(args: Record<string, unknown>, diagramKey = "diagram", diagramsKey = "diagrams") {
  return hasOwn(args, diagramKey) || hasOwn(args, diagramsKey);
}

function hasAuthorTableArgs(args: Record<string, unknown>, tableKey = "table", tablesKey = "tables") {
  return hasOwn(args, tableKey) || hasOwn(args, tablesKey);
}

const ARTIFACT_TABLE_ANSWER_PATTERN =
  /\b(?:complete|fill(?:\s+in)?|enter|write|find)\b[\s\S]{0,90}\b(?:table|missing values?|values?)\b|\btable of values\b/i;
const ARTIFACT_DIAGRAM_ANSWER_PATTERN =
  /\b(?:sketch|draw|plot|label|shade|complete)\b[\s\S]{0,110}\b(?:graph|grid|diagram|region|axes|intercepts?)\b|\bon the (?:grid|diagram|axes)\b|\bidentify all intercepts\b/i;

function inferredAnswerSurfaceFromArgs(args: Record<string, unknown>): AuthorAnswerSurface {
  const intentText = rawAssistantTextFragmentsFromAuthorArgs(args).join("\n");
  if (hasAuthorTableArgs(args) && ARTIFACT_TABLE_ANSWER_PATTERN.test(intentText)) return "table";
  if (hasAuthorDiagramArgs(args) && ARTIFACT_DIAGRAM_ANSWER_PATTERN.test(intentText)) return "diagram";
  return "space";
}

function answerSurfaceFromArgs(args: Record<string, unknown>): AuthorAnswerSurface {
  const rawValue = args.answerSurface ?? args.responseSurface ?? args.responseMode;
  if (rawValue === "space" || rawValue === "freeResponse" || rawValue === "free-response" || rawValue === "written") return "space";
  if (rawValue === "diagram" || rawValue === "graph" || rawValue === "sketch") return "diagram";
  if (rawValue === "table" || rawValue === "completionTable" || rawValue === "completion-table") return "table";
  if (rawValue === "none" || rawValue === "noSpace" || rawValue === "no-space") return "none";
  if (rawValue === "artifact" || rawValue === "answerSurface") {
    if (hasAuthorTableArgs(args) || hasAuthorTableArgs(args, "solutionTable", "solutionTables")) return "table";
    if (hasAuthorDiagramArgs(args) || hasAuthorDiagramArgs(args, "solutionDiagram", "solutionDiagrams")) return "diagram";
    return "none";
  }
  if (hasAuthorTableArgs(args, "solutionTable", "solutionTables")) return "table";
  if (hasAuthorDiagramArgs(args, "solutionDiagram", "solutionDiagrams")) return "diagram";
  return inferredAnswerSurfaceFromArgs(args);
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

function sourceVectorDiagramInputFromEntry(entry: Record<string, unknown>, entryPath: string, issues: MauthActionValidationIssue[]) {
  const rawInput = entry.vectorRayDiagram ?? entry.sourceVectorDiagram ?? entry.vector2dSource;
  if (rawInput === undefined) return undefined;
  const issueCountBefore = issues.length;
  if (!isRecord(rawInput)) {
    issues.push({
      path: `${entryPath}.vectorRayDiagram`,
      message: "must be an object when using the compact source-vector diagram builder",
      expected: "{ vectors, segmentLabels?, angleMarkers? }",
    });
    return undefined;
  }
  const rawVectors = rawInput.vectors;
  if (!Array.isArray(rawVectors) || rawVectors.length === 0) {
    issues.push({
      path: `${entryPath}.vectorRayDiagram.vectors`,
      message: "must contain at least one source vector",
      expected: "array of vectors with id plus length+angleDeg, components, or end",
    });
    return undefined;
  }

  const vectorIds = new Set<string>();
  rawVectors.forEach((vector, vectorIndex) => {
    const vectorPath = `${entryPath}.vectorRayDiagram.vectors[${vectorIndex}]`;
    if (!isRecord(vector)) {
      issues.push({ path: vectorPath, message: "must be an object", expected: "{ id, length, angleDeg }" });
      return;
    }
    const id = typeof vector.id === "string" ? vector.id.trim() : "";
    if (!id) {
      issues.push({ path: `${vectorPath}.id`, message: "must be a non-empty string", expected: "string" });
    } else {
      vectorIds.add(id);
    }

    const hasLengthAngle = Number.isFinite(Number(vector.length)) && Number.isFinite(Number(vector.angleDeg));
    const hasComponents =
      Array.isArray(vector.components) &&
      vector.components.length >= 2 &&
      Number.isFinite(Number(vector.components[0])) &&
      Number.isFinite(Number(vector.components[1]));
    const hasEnd =
      Array.isArray(vector.end) &&
      vector.end.length >= 2 &&
      Number.isFinite(Number(vector.end[0])) &&
      Number.isFinite(Number(vector.end[1]));
    if (!hasLengthAngle && !hasComponents && !hasEnd) {
      issues.push({
        path: `${vectorPath}.length`,
        message: "must define the vector direction and length",
        expected: "length+angleDeg, components:[dx,dy], or end:[x,y]",
      });
    }
  });

  const rawAngleMarkers = rawInput.angleMarkers;
  if (Array.isArray(rawAngleMarkers)) {
    rawAngleMarkers.forEach((marker, markerIndex) => {
      const markerPath = `${entryPath}.vectorRayDiagram.angleMarkers[${markerIndex}]`;
      if (!isRecord(marker)) {
        issues.push({ path: markerPath, message: "must be an object", expected: "{ from, to, label? }" });
        return;
      }
      const from = typeof marker.from === "string" ? marker.from.trim() : "";
      const to = typeof marker.to === "string" ? marker.to.trim() : "";
      if (!from || !vectorIds.has(from)) {
        issues.push({
          path: `${markerPath}.from`,
          message: "must reference a vector id in vectorRayDiagram.vectors",
          expected: "vector id",
        });
      }
      if (!to || !vectorIds.has(to)) {
        issues.push({ path: `${markerPath}.to`, message: "must reference a vector id in vectorRayDiagram.vectors", expected: "vector id" });
      }
    });
  }

  const rawSegmentLabels = rawInput.segmentLabels;
  if (Array.isArray(rawSegmentLabels)) {
    rawSegmentLabels.forEach((label, labelIndex) => {
      const labelPath = `${entryPath}.vectorRayDiagram.segmentLabels[${labelIndex}]`;
      if (!isRecord(label)) {
        issues.push({ path: labelPath, message: "must be an object", expected: "{ vectorId, label }" });
        return;
      }
      const vectorId = typeof label.vectorId === "string" ? label.vectorId.trim() : "";
      if (!vectorId || !vectorIds.has(vectorId)) {
        issues.push({
          path: `${labelPath}.vectorId`,
          message: "must reference a vector id in vectorRayDiagram.vectors",
          expected: "vector id",
        });
      }
    });
  }

  if (issues.length > issueCountBefore) return undefined;
  return rawInput as Vector2DSourceDiagramInput;
}

function graphConfigFromAssistantDiagramEntry(entry: Record<string, unknown>, entryPath: string, issues: MauthActionValidationIssue[]) {
  const sourceVectorInput = sourceVectorDiagramInputFromEntry(entry, entryPath, issues);
  if (sourceVectorInput) return buildVector2DSourceDiagramConfig(sourceVectorInput);
  return isRecord(entry.graphConfig) ? (entry.graphConfig as unknown as GraphConfig) : undefined;
}

interface DiagramBlocksFromArgsOptions {
  diagramKey?: string;
  diagramsKey?: string;
  idSuffix?: string;
  visibility?: ContentBlockVisibility;
}

function diagramBlocksFromArgs(
  args: Record<string, unknown>,
  questionId: string,
  issues: MauthActionValidationIssue[],
  intentText = "",
  options: DiagramBlocksFromArgsOptions = {},
) {
  const diagramKey = options.diagramKey ?? "diagram";
  const diagramsKey = options.diagramsKey ?? "diagrams";
  const idSuffix = options.idSuffix ?? "diagram";
  const singleDiagram = args[diagramKey];
  const rawDiagrams = Array.isArray(args[diagramsKey]) ? args[diagramsKey] : singleDiagram ? [singleDiagram] : [];
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
    const entryPath = rawDiagrams.length === 1 && singleDiagram ? `arguments.${diagramKey}` : `arguments.${diagramsKey}[${index}]`;
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
    const issueCountBeforeGraphConfig = issues.length;
    const graphConfig = graphConfigFromAssistantDiagramEntry(entry, entryPath, issues);
    if (issues.length > issueCountBeforeGraphConfig) return;
    if (!isRecord(graphConfig) || typeof graphConfig.type !== "string") {
      issues.push({
        path: `${entryPath}.graphConfig`,
        message: "must contain a graphConfig with a supported type",
        expected: "GraphConfig or vectorRayDiagram",
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
      id: String(entry.id ?? authorBlockId(questionId, `${idSuffix}-${index + 1}`)),
      kind: "diagram",
      graphConfig: graphConfig as unknown as GraphConfig,
      ...(diagramAlign ? { diagramAlign } : {}),
      ...(diagramTextSide ? { diagramTextSide } : {}),
      ...(options.visibility ? { visibility: options.visibility } : {}),
    } as ContentBlock);
  });

  return blocks;
}

function hasExplicitDiagramReplacement(args: Record<string, unknown>) {
  return hasOwn(args, "diagram") || hasOwn(args, "diagrams") || args.preserveExistingDiagrams === false;
}

function preservedDiagramBlocks(existingQuestion: MauthQuestionLike | undefined) {
  return (existingQuestion?.contentBlocks ?? []).filter((block): block is ContentBlock => block.kind === "diagram");
}

interface TableBlocksFromArgsOptions {
  tableKey?: string;
  tablesKey?: string;
  idSuffix?: string;
  visibility?: ContentBlockVisibility;
}

function stringArrayFromUnknown(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (entry === null || entry === undefined ? "" : String(entry)));
}

function tableRowsFromUnknown(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => (Array.isArray(row) ? row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))) : []));
}

function tableBlocksFromArgs(
  args: Record<string, unknown>,
  questionId: string,
  issues: MauthActionValidationIssue[],
  options: TableBlocksFromArgsOptions = {},
) {
  const tableKey = options.tableKey ?? "table";
  const tablesKey = options.tablesKey ?? "tables";
  const idSuffix = options.idSuffix ?? "table";
  const singleTable = args[tableKey];
  const rawTables = Array.isArray(args[tablesKey]) ? args[tablesKey] : singleTable ? [singleTable] : [];
  const blocks: ContentBlock[] = [];

  rawTables.forEach((entry, index) => {
    const entryPath = rawTables.length === 1 && singleTable ? `arguments.${tableKey}` : `arguments.${tablesKey}[${index}]`;
    if (!isRecord(entry)) {
      issues.push({ path: entryPath, message: "must be a table object", expected: "{ headers?, rows }" });
      return;
    }

    const rows = tableRowsFromUnknown(entry.rows);
    if (!rows.length) {
      issues.push({ path: `${entryPath}.rows`, message: "must contain at least one table row", expected: "string[][]" });
      return;
    }

    const headers = stringArrayFromUnknown(entry.headers ?? entry.columns);
    const tableAlign =
      entry.tableAlign === "left" || entry.tableAlign === "center" || entry.tableAlign === "right" ? entry.tableAlign : undefined;
    const cellAlignment =
      entry.cellAlignment === "left" || entry.cellAlignment === "center" || entry.cellAlignment === "right"
        ? entry.cellAlignment
        : undefined;

    blocks.push({
      id: String(entry.id ?? authorBlockId(questionId, `${idSuffix}-${index + 1}`)),
      kind: "table",
      headers,
      rows,
      ...(typeof entry.showHeader === "boolean" ? { showHeader: entry.showHeader } : {}),
      ...(tableAlign ? { tableAlign } : {}),
      ...(cellAlignment ? { cellAlignment } : {}),
      ...(options.visibility ? { visibility: options.visibility } : {}),
    } as ContentBlock);
  });

  return blocks;
}

function hasExplicitTableReplacement(args: Record<string, unknown>) {
  return hasOwn(args, "table") || hasOwn(args, "tables");
}

function tableBlocksForAuthorQuestion(args: Record<string, unknown>, questionId: string, issues: MauthActionValidationIssue[]) {
  if (!hasExplicitTableReplacement(args)) return [];
  return tableBlocksFromArgs(args, questionId, issues);
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

function withBlockVisibility(block: ContentBlock, visibility: ContentBlockVisibility): ContentBlock {
  return { ...block, visibility } as ContentBlock;
}

function withSolutionSurfaceMarkTicks(blocks: ContentBlock[], marks: number) {
  const markTicks = positiveInteger(marks, 0, 0, 20);
  if (!markTicks) return blocks;

  let applied = false;
  return blocks.map((block) => {
    if (applied || (block.kind !== "diagram" && block.kind !== "table")) return block;
    applied = true;
    return { ...block, markTicks } as ContentBlock;
  });
}

function appendAnswerSurfaceReplacementSlot(
  blocks: ContentBlock[],
  studentBlocks: ContentBlock[],
  solutionBlocks: ContentBlock[],
  issues: MauthActionValidationIssue[],
  path: string,
) {
  if (!solutionBlocks.length) {
    blocks.push(...studentBlocks);
    return;
  }

  if (!studentBlocks.length) {
    issues.push({
      path,
      message: "needs a student answer surface to pair with the solution answer surface",
      expected: "student diagram/table plus solution diagram/table/text",
    });
    blocks.push(...solutionBlocks.map((block) => withBlockVisibility(block, "solution")));
    return;
  }

  const [firstStudentBlock, ...remainingStudentBlocks] = studentBlocks;
  blocks.push(withBlockVisibility(firstStudentBlock, "student"));
  blocks.push(...solutionBlocks.map((block) => withBlockVisibility(block, "solution")));
  blocks.push(...remainingStudentBlocks.map((block) => withBlockVisibility(block, "student")));
}

function solutionTextContentBlock(
  scopeId: string,
  solutionText: string,
  marks: number,
  options: { stripMarkAnnotations?: boolean } = {},
): ContentBlock {
  return {
    id: authorBlockId(scopeId, "solution"),
    kind: "text",
    text: options.stripMarkAnnotations ? solutionBlockTextWithoutMarkAnnotations(solutionText) : solutionBlockText(solutionText, marks),
    visibility: "solution",
  };
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
  const answerSurface = answerSurfaceFromArgs(args);
  const studentSpaceLines = resolvedStudentSpaceLines(
    args.studentSpaceLines ?? args.answerLines ?? args.lines,
    solutionText,
    marks,
    10,
    40,
  );
  const questionDiagrams = diagramBlocksForAuthorQuestion(args, questionId, issues, existingQuestion);
  const questionTables = tableBlocksForAuthorQuestion(args, questionId, issues);
  const solutionDiagrams = diagramBlocksFromArgs(args, questionId, issues, "", {
    diagramKey: "solutionDiagram",
    diagramsKey: "solutionDiagrams",
    idSuffix: "solution-diagram",
    visibility: "solution",
  });
  const solutionTables = tableBlocksFromArgs(args, questionId, issues, {
    tableKey: "solutionTable",
    tablesKey: "solutionTables",
    idSuffix: "solution-table",
    visibility: "solution",
  });
  const hasSolutionAnswerSurface =
    (answerSurface === "diagram" && solutionDiagrams.length > 0) || (answerSurface === "table" && solutionTables.length > 0);
  const solutionTextBlock = includeSolution
    ? solutionTextContentBlock(questionId, solutionText, hasSolutionAnswerSurface ? 0 : marks, {
        stripMarkAnnotations: hasSolutionAnswerSurface,
      })
    : null;
  const blocks: ContentBlock[] = [
    {
      id: authorBlockId(questionId, "question-text"),
      kind: "text",
      text,
    },
  ];

  if (answerSurface === "diagram") {
    appendAnswerSurfaceReplacementSlot(
      blocks,
      questionDiagrams,
      [...withSolutionSurfaceMarkTicks(solutionDiagrams, marks), ...(solutionTextBlock ? [solutionTextBlock] : [])],
      issues,
      "arguments.solutionDiagram",
    );
    blocks.push(...questionTables);
  } else {
    blocks.push(...questionDiagrams);
  }

  if (answerSurface === "table") {
    appendAnswerSurfaceReplacementSlot(
      blocks,
      questionTables,
      [...withSolutionSurfaceMarkTicks(solutionTables, marks), ...(solutionTextBlock ? [solutionTextBlock] : [])],
      issues,
      "arguments.solutionTable",
    );
  } else if (answerSurface !== "diagram") {
    blocks.push(...questionTables);
  }

  if (!hasParts && answerSurface === "space") {
    blocks.push({
      id: authorBlockId(questionId, "student-space"),
      kind: "space",
      lines: studentSpaceLines,
      visibility: "student",
    });
  }

  if (solutionTextBlock && !hasParts && answerSurface === "space") {
    blocks.push(solutionTextBlock);
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
  const answerSurface = answerSurfaceFromArgs(args);
  const studentSpaceLines = resolvedStudentSpaceLines(args.studentSpaceLines ?? args.answerLines ?? args.lines, solutionText, marks, 6, 40);
  const partDiagrams = diagramBlocksFromArgs(args, partId, issues, [partText, ...rawAssistantTextFragmentsFromAuthorArgs(args)].join("\n"));
  const partTables = tableBlocksFromArgs(args, partId, issues);
  const solutionDiagrams = diagramBlocksFromArgs(
    args,
    partId,
    issues,
    [partText, ...rawAssistantTextFragmentsFromAuthorArgs(args)].join("\n"),
    {
      diagramKey: "solutionDiagram",
      diagramsKey: "solutionDiagrams",
      idSuffix: "solution-diagram",
      visibility: "solution",
    },
  );
  const solutionTables = tableBlocksFromArgs(args, partId, issues, {
    tableKey: "solutionTable",
    tablesKey: "solutionTables",
    idSuffix: "solution-table",
    visibility: "solution",
  });
  const hasSolutionAnswerSurface =
    (answerSurface === "diagram" && solutionDiagrams.length > 0) || (answerSurface === "table" && solutionTables.length > 0);
  const solutionTextBlock = includeSolution
    ? solutionTextContentBlock(partId, solutionText, hasSolutionAnswerSurface ? 0 : marks, {
        stripMarkAnnotations: hasSolutionAnswerSurface,
      })
    : null;
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
  ];

  if (answerSurface === "diagram") {
    appendAnswerSurfaceReplacementSlot(
      blocks,
      partDiagrams,
      [...withSolutionSurfaceMarkTicks(solutionDiagrams, marks), ...(solutionTextBlock ? [solutionTextBlock] : [])],
      issues,
      "arguments.parts[].solutionDiagram",
    );
    blocks.push(...partTables);
  } else {
    blocks.push(...partDiagrams);
  }

  if (answerSurface === "table") {
    appendAnswerSurfaceReplacementSlot(
      blocks,
      partTables,
      [...withSolutionSurfaceMarkTicks(solutionTables, marks), ...(solutionTextBlock ? [solutionTextBlock] : [])],
      issues,
      "arguments.parts[].solutionTable",
    );
  } else if (answerSurface !== "diagram") {
    blocks.push(...partTables);
  }

  if (answerSurface === "space") {
    blocks.push({
      id: authorBlockId(partId, "student-space"),
      kind: "space",
      lines: studentSpaceLines,
      visibility: "student",
    });
  }

  if (solutionTextBlock && answerSurface === "space") {
    blocks.push(solutionTextBlock);
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
  toolLabel = "mauth.author.replaceQuestion",
): MauthDocumentAction[] | MauthAuthorReplaceQuestionValidationFailure {
  const issues: MauthActionValidationIssue[] = [];
  if (!isRecord(args)) {
    return {
      error: `${toolLabel} arguments must be an object.`,
      issues: [{ path: "arguments", message: "must be an object", expected: "replace-question payload" }],
    };
  }

  const target = replaceOrAppendQuestionTarget(document.questions, args, issues);
  const text = textFromArgs(args);
  if (!text) issues.push({ path: "arguments.questionText", message: "must be a non-empty string", expected: "question text" });

  if (issues.length || !target) {
    return {
      error: formatMauthActionValidationIssues(issues),
      issues,
    };
  }

  const { question } = target;
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

  const actions: MauthDocumentAction[] =
    target.mode === "append"
      ? [
          {
            type: "question.add",
            question: generatedQuestion,
            ...(target.afterQuestionId ? { afterQuestionId: target.afterQuestionId } : {}),
          },
        ]
      : [
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

function diagramReplacementIdFromArgs(args: Record<string, unknown>) {
  const value = args.diagramId ?? args.blockId ?? args.moduleId ?? args.replaceDiagramId;
  return typeof value === "string" && value.trim() ? value.trim() : "";
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
  const replacementDiagramId = diagramReplacementIdFromArgs(args);
  const replacementIndex = replacementDiagramId
    ? sourceBlocks.findIndex((block) => block.kind === "diagram" && block.id === replacementDiagramId)
    : -1;
  if (replacementDiagramId && replacementIndex === -1) {
    return {
      error: "mauth.author.addDiagram could not find the diagram to replace.",
      issues: [
        {
          path: "arguments.diagramId",
          message: "must reference an existing top-level diagram in the target question",
          expected: "existing diagram block id",
        },
      ],
    };
  }
  const insertIndex = diagramInsertionIndex(sourceBlocks, args.placement);
  const contentBlocks =
    replacementIndex >= 0
      ? sourceBlocks.map((block, index) =>
          index === replacementIndex && block.kind === "diagram"
            ? ({
                ...block,
                ...diagramBlock,
                id: replacementDiagramId,
                diagramAlign: diagramBlock.diagramAlign ?? block.diagramAlign,
                diagramTextSide: diagramBlock.diagramTextSide ?? block.diagramTextSide,
              } as ContentBlock)
            : block,
        )
      : [...sourceBlocks.slice(0, insertIndex), diagramBlock, ...sourceBlocks.slice(insertIndex)];
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

function subpartSolutionTarget(subpart: MauthSubpartLike, entry: Record<string, unknown>, index: number) {
  if (typeof entry.subpartId === "string" && entry.subpartId.trim()) return subpart.id === entry.subpartId;
  if (typeof entry.label === "string" && entry.label.trim())
    return (subpart.label ?? "").toLowerCase() === entry.label.trim().toLowerCase();
  return index === 0;
}

function questionSolutionPayloadTarget<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  entry: Record<string, unknown>,
): Q | undefined {
  if (typeof entry.questionId === "string" && entry.questionId.trim())
    return questions.find((question) => question.id === entry.questionId);
  const questionNumber = typeof entry.questionNumber === "number" ? entry.questionNumber : Number(entry.questionNumber ?? 1);
  return Number.isInteger(questionNumber) && questionNumber > 0 ? questions[questionNumber - 1] : undefined;
}

function solutionTargetKey(kind: "question" | "part" | "subpart", id: string) {
  return `${kind}:${id}`;
}

function collectMarkedSolutionTargets<Q extends MauthQuestionLike>(questions: readonly Q[]) {
  const targets: Array<{ key: string; label: string; path: string }> = [];
  questions.forEach((question, questionIndex) => {
    const questionPath = `questions[${questionIndex}]`;
    if (question.marks > 0 && !question.parts?.length) {
      targets.push({ key: solutionTargetKey("question", question.id), label: `Question ${questionIndex + 1}`, path: questionPath });
    }
    if (question.marks > 0 && question.parts?.length) {
      targets.push({
        key: solutionTargetKey("question", question.id),
        label: `Question ${questionIndex + 1} direct marks`,
        path: questionPath,
      });
    }
    question.parts?.forEach((part, partIndex) => {
      const partLabel = part.label ?? String.fromCharCode(97 + partIndex);
      const partPath = `${questionPath}.parts[${partIndex}]`;
      if (part.marks > 0) {
        targets.push({
          key: solutionTargetKey("part", part.id),
          label: `Question ${questionIndex + 1} part ${partLabel}`,
          path: partPath,
        });
      }
      part.subparts?.forEach((subpart, subpartIndex) => {
        if (subpart.marks <= 0) return;
        targets.push({
          key: solutionTargetKey("subpart", subpart.id),
          label: `Question ${questionIndex + 1} part ${partLabel} subpart ${subpart.label ?? subpartIndex + 1}`,
          path: `${partPath}.subparts[${subpartIndex}]`,
        });
      });
    });
  });
  return targets;
}

function collectSolutionPayloadCoverage<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  payloads: readonly Record<string, unknown>[],
) {
  const covered = new Set<string>();
  payloads.forEach((entry) => {
    const question = questionSolutionPayloadTarget(questions, entry);
    if (!question) return;
    const solutionText = optionalTextArg(entry, "solutionText") || optionalTextArg(entry, "solution");
    if (solutionText) covered.add(solutionTargetKey("question", question.id));
    const partPayloads = Array.isArray(entry.parts) ? entry.parts.filter(isRecord) : [];
    partPayloads.forEach((partPayload, partPayloadIndex) => {
      const part = question.parts?.find((candidate) => partSolutionTarget(candidate, partPayload, partPayloadIndex));
      if (!part) return;
      const partSolutionText = optionalTextArg(partPayload, "solutionText") || optionalTextArg(partPayload, "solution");
      if (partSolutionText) covered.add(solutionTargetKey("part", part.id));
      const subpartPayloads = Array.isArray(partPayload.subparts) ? partPayload.subparts.filter(isRecord) : [];
      subpartPayloads.forEach((subpartPayload, subpartPayloadIndex) => {
        const subpart = part.subparts?.find((candidate) => subpartSolutionTarget(candidate, subpartPayload, subpartPayloadIndex));
        if (!subpart) return;
        const subpartSolutionText = optionalTextArg(subpartPayload, "solutionText") || optionalTextArg(subpartPayload, "solution");
        if (subpartSolutionText) covered.add(solutionTargetKey("subpart", subpart.id));
      });
    });
  });
  return covered;
}

function parseSolutionsWriteAllActions<Q extends MauthQuestionLike, F extends object, C extends object>(
  document: MauthDocumentLike<Q, F, C>,
  args: unknown,
): MauthDocumentAction[] | MauthSolutionsWriteAllValidationFailure {
  if (!isRecord(args) || !Array.isArray(args.questions)) {
    return {
      error: "mauth.solutions.writeAll arguments must contain a questions array.",
      issues: [{ path: "arguments.questions", message: "must be an array", expected: "solution payload for every marked scope" }],
    };
  }
  const payloads = args.questions.filter(isRecord);
  const expectedTargets = collectMarkedSolutionTargets(document.questions);
  const coverage = collectSolutionPayloadCoverage(document.questions, payloads);
  const missingTargets = expectedTargets.filter((target) => !coverage.has(target.key));
  if (missingTargets.length) {
    return {
      error: "mauth.solutions.writeAll must include solution payloads for every marked question, part, and subpart.",
      issues: missingTargets.map((target) => ({
        path: target.path,
        message: `${target.label} is missing from the whole-test solution payload.`,
        expected: "Add a matching question/part/subpart solutionText with hidden [[marks:n]] ticks.",
      })),
    };
  }
  const actions = parseAuthorEnsureSolutionsActions(document, args);
  return actions;
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
    const partPayloads = Array.isArray(entry.parts) ? entry.parts.filter(isRecord) : [];
    if (!solutionText && !partPayloads.length) {
      issues.push({ path: `${path}.solutionText`, message: "must be a non-empty string", expected: "solution text" });
    }
    if (!question || (!solutionText && !partPayloads.length)) return;

    if (partPayloads.length && question.parts?.length) {
      const parts = question.parts.map((part) => {
        const partPayload = partPayloads.find((candidate, candidateIndex) => partSolutionTarget(part, candidate, candidateIndex));
        if (!partPayload) return part;
        const partSolutionText = optionalTextArg(partPayload, "solutionText") || optionalTextArg(partPayload, "solution");
        const subpartPayloads = Array.isArray(partPayload.subparts) ? partPayload.subparts.filter(isRecord) : [];
        if (subpartPayloads.length && part.subparts?.length) {
          let contentBlocks = part.contentBlocks;
          if (partSolutionText) {
            contentBlocks = blocksWithEnsuredSolution(
              part.id,
              part.contentBlocks,
              partSolutionText,
              partPayload.studentSpaceLines,
              positiveInteger(partPayload.marks, part.marks, 0, 100),
            );
          }
          const subparts = part.subparts.map((subpart) => {
            const subpartPayload = subpartPayloads.find((candidate, candidateIndex) =>
              subpartSolutionTarget(subpart, candidate, candidateIndex),
            );
            if (!subpartPayload) return subpart;
            const subpartSolutionText = optionalTextArg(subpartPayload, "solutionText") || optionalTextArg(subpartPayload, "solution");
            if (!subpartSolutionText) {
              issues.push({
                path: `${path}.parts[${partPayloads.indexOf(partPayload)}].subparts[${subpartPayloads.indexOf(subpartPayload)}].solutionText`,
                message: "must be a non-empty string",
                expected: "solution text",
              });
              return subpart;
            }
            const subpartContentBlocks = blocksWithEnsuredSolution(
              subpart.id,
              subpart.contentBlocks,
              subpartSolutionText,
              subpartPayload.studentSpaceLines,
              positiveInteger(subpartPayload.marks, subpart.marks, 0, 100),
            );
            return {
              ...subpart,
              marks: positiveInteger(subpartPayload.marks, subpart.marks, 0, 100),
              contentBlocks: subpartContentBlocks,
              itemOrder: blockOrder(subpartContentBlocks),
            };
          });
          return {
            ...part,
            marks: positiveInteger(partPayload.marks, part.marks, 0, 100),
            contentBlocks,
            subparts,
            itemOrder: partOrder(contentBlocks, subparts),
          };
        }
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

function normalizedTargetLabel(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/[().]/g, "").toLowerCase() : "";
}

function questionTargetAtPath<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  entry: Record<string, unknown>,
  path: string,
  issues: MauthActionValidationIssue[],
) {
  if (typeof entry.questionId === "string" && entry.questionId.trim()) {
    const question = questions.find((item) => item.id === entry.questionId);
    if (!question) issues.push({ path: `${path}.questionId`, message: "must reference an existing question", expected: "question id" });
    return question;
  }

  const questionNumber = typeof entry.questionNumber === "number" ? entry.questionNumber : Number(entry.questionNumber ?? 1);
  if (!Number.isInteger(questionNumber) || questionNumber < 1) {
    issues.push({ path: `${path}.questionNumber`, message: "must be a positive integer", expected: "1-based question number" });
    return undefined;
  }

  const question = questions[questionNumber - 1];
  if (!question) {
    issues.push({
      path: `${path}.questionNumber`,
      message: "must reference an existing question",
      expected: `1 to ${questions.length}`,
    });
  }
  return question;
}

function partTargetAtPath(question: MauthQuestionLike, entry: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  const parts = question.parts ?? [];
  if (typeof entry.partId === "string" && entry.partId.trim()) {
    const part = parts.find((item) => item.id === entry.partId);
    if (!part) issues.push({ path: `${path}.partId`, message: "must reference an existing part", expected: "part id" });
    return part;
  }

  const label = normalizedTargetLabel(entry.partLabel ?? entry.label);
  if (label) {
    const part = parts.find((item) => normalizedTargetLabel(item.label) === label);
    if (!part) issues.push({ path: `${path}.partLabel`, message: "must reference an existing part label", expected: "part label" });
    return part;
  }

  const partNumberValue = entry.partNumber ?? entry.partIndex;
  if (partNumberValue !== undefined) {
    const partNumber = typeof partNumberValue === "number" ? partNumberValue : Number(partNumberValue);
    if (!Number.isInteger(partNumber) || partNumber < 1) {
      issues.push({ path: `${path}.partNumber`, message: "must be a positive integer", expected: "1-based part number" });
      return undefined;
    }
    const part = parts[partNumber - 1];
    if (!part) issues.push({ path: `${path}.partNumber`, message: "must reference an existing part", expected: `1 to ${parts.length}` });
    return part;
  }

  return undefined;
}

function subpartTargetAtPath(part: MauthPartLike, entry: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  const subparts = part.subparts ?? [];
  if (typeof entry.subpartId === "string" && entry.subpartId.trim()) {
    const subpart = subparts.find((item) => item.id === entry.subpartId);
    if (!subpart) issues.push({ path: `${path}.subpartId`, message: "must reference an existing subpart", expected: "subpart id" });
    return subpart;
  }

  const label = normalizedTargetLabel(entry.subpartLabel);
  if (label) {
    const subpart = subparts.find((item) => normalizedTargetLabel(item.label) === label);
    if (!subpart) {
      issues.push({ path: `${path}.subpartLabel`, message: "must reference an existing subpart label", expected: "subpart label" });
    }
    return subpart;
  }

  const subpartNumberValue = entry.subpartNumber ?? entry.subpartIndex;
  if (subpartNumberValue !== undefined) {
    const subpartNumber = typeof subpartNumberValue === "number" ? subpartNumberValue : Number(subpartNumberValue);
    if (!Number.isInteger(subpartNumber) || subpartNumber < 1) {
      issues.push({ path: `${path}.subpartNumber`, message: "must be a positive integer", expected: "1-based subpart number" });
      return undefined;
    }
    const subpart = subparts[subpartNumber - 1];
    if (!subpart) {
      issues.push({
        path: `${path}.subpartNumber`,
        message: "must reference an existing subpart",
        expected: `1 to ${subparts.length}`,
      });
    }
    return subpart;
  }

  return undefined;
}

function responseSpaceLinesAtPath(entry: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  const value = entry.lines ?? entry.studentSpaceLines ?? entry.answerLines;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > MAX_AUTHOR_STUDENT_SPACE_LINES) {
    issues.push({
      path: `${path}.lines`,
      message: `must be an integer from 1 to ${MAX_AUTHOR_STUDENT_SPACE_LINES}`,
      expected: "student answer-space line count",
    });
    return undefined;
  }
  return number;
}

function responseSpaceMode(entry: Record<string, unknown>) {
  return entry.mode === "atLeast" || entry.mode === "minimum" ? "atLeast" : "set";
}

function contentBlocksWithAdjustedResponseSpace(scopeId: string, blocks: readonly ContentBlock[], lines: number, mode: "set" | "atLeast") {
  const existingIndex = blocks.findIndex((block) => block.kind === "space" && blockVisibility(block) === "student");
  if (existingIndex >= 0) {
    return blocks.map((block, index) =>
      index === existingIndex && block.kind === "space"
        ? { ...block, lines: mode === "atLeast" ? Math.max(block.lines, lines) : lines }
        : block,
    );
  }

  const insertIndex = blocks.findIndex((block) => blockVisibility(block) === "solution");
  const spaceBlock: ContentBlock = {
    id: authorBlockId(scopeId, "student-space"),
    kind: "space",
    lines,
    visibility: "student",
  };
  return insertIndex >= 0 ? [...blocks.slice(0, insertIndex), spaceBlock, ...blocks.slice(insertIndex)] : [...blocks, spaceBlock];
}

function parseAuthorAdjustResponseSpacesActions<Q extends MauthQuestionLike, F extends object, C extends object>(
  document: MauthDocumentLike<Q, F, C>,
  args: unknown,
): MauthDocumentAction[] | MauthAuthorResponseSpaceValidationFailure {
  const issues: MauthActionValidationIssue[] = [];
  if (!isRecord(args)) {
    return {
      error: "mauth.author.adjustResponseSpaces arguments must be an object.",
      issues: [{ path: "arguments", message: "must be an object", expected: "response-space payload" }],
    };
  }

  const targetEntries = Array.isArray(args.targets) ? args.targets : [args];
  if (!targetEntries.length) {
    return {
      error: "mauth.author.adjustResponseSpaces arguments must include at least one target.",
      issues: [{ path: "arguments.targets", message: "must not be empty", expected: "response-space target[]" }],
    };
  }

  const patchedQuestions = new Map<string, MauthQuestionLike>();
  for (const [index, rawEntry] of targetEntries.entries()) {
    const path = Array.isArray(args.targets) ? `arguments.targets[${index}]` : "arguments";
    if (!isRecord(rawEntry)) {
      issues.push({ path, message: "must be a response-space target object", expected: "{ questionNumber, lines }" });
      continue;
    }
    const issueCountBeforeTarget = issues.length;

    const lines = responseSpaceLinesAtPath(rawEntry, path, issues);
    const question = questionTargetAtPath(document.questions, rawEntry, path, issues);
    if (!question || !lines) continue;

    const currentQuestion = patchedQuestions.get(question.id) ?? question;
    const part = partTargetAtPath(currentQuestion, rawEntry, path, issues);
    const wantsSubpart =
      rawEntry.subpartId !== undefined ||
      rawEntry.subpartLabel !== undefined ||
      rawEntry.subpartNumber !== undefined ||
      rawEntry.subpartIndex !== undefined;
    const subpart = part && wantsSubpart ? subpartTargetAtPath(part, rawEntry, path, issues) : undefined;
    if (wantsSubpart && !part) {
      issues.push({
        path: `${path}.partId`,
        message: "must identify a part before targeting a subpart",
        expected: "partId, partLabel, or partNumber",
      });
      continue;
    }
    if (issues.length > issueCountBeforeTarget) continue;

    const mode = responseSpaceMode(rawEntry);
    if (part && subpart) {
      const parts = (currentQuestion.parts ?? []).map((candidatePart) =>
        candidatePart.id === part.id
          ? {
              ...candidatePart,
              subparts: (candidatePart.subparts ?? []).map((candidateSubpart) => {
                if (candidateSubpart.id !== subpart.id) return candidateSubpart;
                const contentBlocks = contentBlocksWithAdjustedResponseSpace(
                  candidateSubpart.id,
                  candidateSubpart.contentBlocks,
                  lines,
                  mode,
                );
                return { ...candidateSubpart, contentBlocks };
              }),
            }
          : candidatePart,
      );
      patchedQuestions.set(currentQuestion.id, { ...currentQuestion, parts });
      continue;
    }

    if (part) {
      const parts = (currentQuestion.parts ?? []).map((candidatePart) => {
        if (candidatePart.id !== part.id) return candidatePart;
        const contentBlocks = contentBlocksWithAdjustedResponseSpace(candidatePart.id, candidatePart.contentBlocks, lines, mode);
        return { ...candidatePart, contentBlocks, itemOrder: blockOrder(contentBlocks) };
      });
      patchedQuestions.set(currentQuestion.id, {
        ...currentQuestion,
        parts,
        itemOrder: questionOrder(currentQuestion.contentBlocks, parts),
      });
      continue;
    }

    const contentBlocks = contentBlocksWithAdjustedResponseSpace(currentQuestion.id, currentQuestion.contentBlocks, lines, mode);
    patchedQuestions.set(currentQuestion.id, {
      ...currentQuestion,
      contentBlocks,
      itemOrder: questionOrder(contentBlocks, currentQuestion.parts ?? []),
    });
  }

  if (issues.length) {
    return {
      error: formatMauthActionValidationIssues(issues),
      issues,
    };
  }

  const actions = [...patchedQuestions.values()].map(
    (question): MauthDocumentAction => ({
      type: "question.update",
      questionId: question.id,
      patch: {
        contentBlocks: question.contentBlocks,
        parts: question.parts ?? [],
        itemOrder: question.itemOrder,
      },
    }),
  );
  const validation = validateMauthDocumentActionPayloads(actions);
  if (!validation.ok) {
    return {
      error: formatMauthActionValidationIssues(validation.issues),
      issues: validation.issues,
    };
  }
  return actions;
}

type FormatTargetKind = "question" | "part" | "subpart";

interface ResolvedFormatTarget {
  question: MauthQuestionLike;
  questionIndex: number;
  previousQuestion?: MauthQuestionLike;
  kind: FormatTargetKind;
  part?: MauthPartLike;
  partIndex?: number;
  subpart?: MauthSubpartLike;
  subpartIndex?: number;
  scope: MauthContentScope;
}

function formatOperationType(entry: Record<string, unknown>) {
  const value = entry.type ?? entry.operation ?? entry.action;
  return typeof value === "string" ? value : "";
}

function formatOperationEntries(args: Record<string, unknown>) {
  if (Array.isArray(args.operations)) return args.operations;
  if (Array.isArray(args.edits)) return args.edits;
  return [args];
}

function formatTargetRecord(entry: Record<string, unknown>) {
  return isRecord(entry.target) ? entry.target : entry;
}

function resolvedFormatTargetAtPath<Q extends MauthQuestionLike>(
  questions: readonly Q[],
  entry: Record<string, unknown>,
  path: string,
  issues: MauthActionValidationIssue[],
): ResolvedFormatTarget | undefined {
  const targetRecord = formatTargetRecord(entry);
  const question = questionTargetAtPath(questions, targetRecord, path, issues);
  if (!question) return undefined;
  const questionIndex = questions.findIndex((item) => item.id === question.id);
  const part = partTargetAtPath(question, targetRecord, path, issues);
  const wantsSubpart =
    targetRecord.subpartId !== undefined ||
    targetRecord.subpartLabel !== undefined ||
    targetRecord.subpartNumber !== undefined ||
    targetRecord.subpartIndex !== undefined;
  if (wantsSubpart && !part) {
    issues.push({
      path: `${path}.target.partId`,
      message: "must identify a part before targeting a subpart",
      expected: "partId, partLabel, or partNumber",
    });
    return undefined;
  }
  const subpart = part && wantsSubpart ? subpartTargetAtPath(part, targetRecord, path, issues) : undefined;
  const partIndex = part ? (question.parts ?? []).findIndex((item) => item.id === part.id) : -1;
  const subpartIndex = part && subpart ? (part.subparts ?? []).findIndex((item) => item.id === subpart.id) : -1;

  if (wantsSubpart && !subpart) return undefined;
  if (subpart && part) {
    return {
      question,
      questionIndex,
      previousQuestion: questionIndex > 0 ? questions[questionIndex - 1] : undefined,
      kind: "subpart",
      part,
      partIndex,
      subpart,
      subpartIndex,
      scope: { kind: "subpart", questionId: question.id, partId: part.id, subpartId: subpart.id },
    };
  }
  if (part) {
    return {
      question,
      questionIndex,
      previousQuestion: questionIndex > 0 ? questions[questionIndex - 1] : undefined,
      kind: "part",
      part,
      partIndex,
      scope: { kind: "part", questionId: question.id, partId: part.id },
    };
  }
  return {
    question,
    questionIndex,
    previousQuestion: questionIndex > 0 ? questions[questionIndex - 1] : undefined,
    kind: "question",
    scope: { kind: "question", questionId: question.id },
  };
}

function pageBreakTargetForFormatTarget(
  target: ResolvedFormatTarget,
  path: string,
  issues: MauthActionValidationIssue[],
  enabled: boolean,
): MauthDocumentAction | undefined {
  if (target.kind === "part" && target.part) {
    return {
      type: "pageBreak.set",
      target: { kind: "part", questionId: target.question.id, partId: target.part.id },
      enabled,
    };
  }
  if (target.kind === "subpart" && target.part && target.subpart) {
    return {
      type: "pageBreak.set",
      target: { kind: "subpart", questionId: target.question.id, partId: target.part.id, subpartId: target.subpart.id },
      enabled,
    };
  }
  if (target.kind === "question") {
    if (target.questionIndex <= 0) {
      issues.push({
        path: `${path}.target.questionNumber`,
        message: "cannot put a page break before the first question with this tool",
        expected: "questionNumber greater than 1, or target a part/subpart",
      });
      return undefined;
    }
    const previousQuestion = target.previousQuestion;
    return {
      type: "pageBreak.set",
      target: { kind: "question", questionId: previousQuestion?.id ?? target.question.id },
      enabled,
    };
  }
  return undefined;
}

function contentBlocksForFormatTarget(target: ResolvedFormatTarget) {
  if (target.kind === "subpart") return target.subpart?.contentBlocks ?? [];
  if (target.kind === "part") return target.part?.contentBlocks ?? [];
  return target.question.contentBlocks;
}

function blockIdFromFormatEntry(entry: Record<string, unknown>) {
  const target = formatTargetRecord(entry);
  const value = entry.blockId ?? entry.moduleId ?? entry.diagramId ?? target.blockId ?? target.moduleId ?? target.diagramId;
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function firstStudentSpaceBlock(blocks: readonly ContentBlock[]) {
  return blocks.find((block) => block.kind === "space" && blockVisibility(block) === "student");
}

function uniqueScopedBlockId(scopeId: string, blocks: readonly ContentBlock[], suffix: string) {
  const existing = new Set(blocks.map((block) => block.id));
  const base = authorBlockId(scopeId, suffix);
  if (!existing.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function scopeIdForFormatTarget(target: ResolvedFormatTarget) {
  return target.subpart?.id ?? target.part?.id ?? target.question.id;
}

function formatLinesFromEntry(entry: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[], fallback?: number) {
  const rawValue = entry.lines ?? entry.studentSpaceLines ?? entry.answerLines ?? entry.responseSpaceLines;
  if (rawValue === undefined && fallback !== undefined) return fallback;
  const number = typeof rawValue === "number" ? rawValue : Number(rawValue);
  if (!Number.isInteger(number) || number < 1 || number > MAX_AUTHOR_STUDENT_SPACE_LINES) {
    issues.push({
      path: `${path}.lines`,
      message: `must be an integer from 1 to ${MAX_AUTHOR_STUDENT_SPACE_LINES}`,
      expected: "student answer-space line count",
    });
    return undefined;
  }
  return number;
}

function responseSpaceAdjustmentAction(
  target: ResolvedFormatTarget,
  entry: Record<string, unknown>,
  path: string,
  issues: MauthActionValidationIssue[],
): MauthDocumentAction | undefined {
  const blocks = contentBlocksForFormatTarget(target);
  const existingSpace = firstStudentSpaceBlock(blocks);
  const rawMode = entry.mode;
  const mode = rawMode === "atLeast" || rawMode === "minimum" ? "atLeast" : rawMode === "add" || rawMode === "delta" ? "add" : "set";
  const rawDelta = entry.deltaLines ?? entry.addLines;
  const delta = typeof rawDelta === "number" ? rawDelta : Number(rawDelta);
  const requestedLines = formatLinesFromEntry(
    entry,
    path,
    issues,
    mode === "add" && Number.isFinite(delta) ? Math.max(1, Math.min(MAX_AUTHOR_STUDENT_SPACE_LINES, delta)) : undefined,
  );
  if (!requestedLines) return undefined;
  const currentLines = existingSpace?.kind === "space" ? existingSpace.lines : 0;
  const nextLines =
    mode === "atLeast"
      ? Math.max(currentLines, requestedLines)
      : mode === "add"
        ? Math.max(1, Math.min(MAX_AUTHOR_STUDENT_SPACE_LINES, currentLines + requestedLines))
        : requestedLines;

  if (existingSpace?.kind === "space") {
    return {
      type: "module.update",
      scope: target.scope,
      blockId: existingSpace.id,
      patch: { lines: nextLines },
    };
  }

  const insertBeforeSolution = blocks.find((block) => blockVisibility(block) === "solution");
  return {
    type: "module.add",
    scope: target.scope,
    blocks: [
      {
        id: uniqueScopedBlockId(scopeIdForFormatTarget(target), blocks, "student-space"),
        kind: "space",
        lines: nextLines,
        visibility: "student",
      },
    ],
    ...(insertBeforeSolution ? { placement: { blockId: insertBeforeSolution.id, position: "before" as const } } : {}),
  };
}

function findBlockEntryInDocument(
  document: MauthDocumentLike<MauthQuestionLike, object, object>,
  blockId: string,
): { question: MauthQuestionLike; scope: MauthContentScope; block: ContentBlock } | undefined {
  for (const question of document.questions) {
    const questionBlock = question.contentBlocks.find((block) => block.id === blockId);
    if (questionBlock) return { question, scope: { kind: "question", questionId: question.id }, block: questionBlock };
    for (const part of question.parts ?? []) {
      const partBlock = part.contentBlocks.find((block) => block.id === blockId);
      if (partBlock) return { question, scope: { kind: "part", questionId: question.id, partId: part.id }, block: partBlock };
      for (const subpart of part.subparts ?? []) {
        const subpartBlock = subpart.contentBlocks.find((block) => block.id === blockId);
        if (subpartBlock) {
          return {
            question,
            scope: { kind: "subpart", questionId: question.id, partId: part.id, subpartId: subpart.id },
            block: subpartBlock,
          };
        }
      }
    }
  }
  return undefined;
}

function diagramAlignmentAction(
  target: ResolvedFormatTarget,
  entry: Record<string, unknown>,
  path: string,
  issues: MauthActionValidationIssue[],
): MauthDocumentAction | undefined {
  const diagramAlign = entry.diagramAlign ?? entry.align ?? entry.alignment;
  if (diagramAlign !== "left" && diagramAlign !== "center" && diagramAlign !== "right") {
    issues.push({ path: `${path}.diagramAlign`, message: "must be left, center, or right", expected: "diagram alignment" });
    return undefined;
  }
  const blocks = contentBlocksForFormatTarget(target);
  const explicitBlockId = blockIdFromFormatEntry(entry);
  const diagramIndex = positiveInteger(entry.diagramIndex ?? entry.index, 1, 1, 100) - 1;
  const diagram =
    (explicitBlockId ? blocks.find((block) => block.id === explicitBlockId) : undefined) ??
    blocks.filter((block) => block.kind === "diagram")[diagramIndex];
  if (!diagram) {
    issues.push({
      path: explicitBlockId ? `${path}.diagramId` : `${path}.diagramIndex`,
      message: "must reference an existing diagram in the target scope",
      expected: "existing diagram module",
    });
    return undefined;
  }
  if (diagram.kind !== "diagram") {
    issues.push({ path: `${path}.diagramId`, message: "must reference a diagram module", expected: "diagram module id" });
    return undefined;
  }
  const diagramTextSide =
    entry.diagramTextSide === "none" || entry.diagramTextSide === "left" || entry.diagramTextSide === "right"
      ? entry.diagramTextSide
      : undefined;
  return {
    type: "module.update",
    scope: target.scope,
    blockId: diagram.id,
    patch: {
      diagramAlign,
      ...(diagramTextSide ? { diagramTextSide } : {}),
    },
  };
}

function moveModuleAction<Q extends MauthQuestionLike, F extends object, C extends object>(
  document: MauthDocumentLike<Q, F, C>,
  entry: Record<string, unknown>,
  path: string,
  issues: MauthActionValidationIssue[],
): MauthDocumentAction | undefined {
  const blockId = blockIdFromFormatEntry(entry);
  if (!blockId) {
    issues.push({ path: `${path}.blockId`, message: "must provide the module/block id to move", expected: "existing module id" });
    return undefined;
  }
  const source = findBlockEntryInDocument(document as unknown as MauthDocumentLike<MauthQuestionLike, object, object>, blockId);
  if (!source) {
    issues.push({ path: `${path}.blockId`, message: "must reference an existing module", expected: "existing module id" });
    return undefined;
  }
  const toRecord = isRecord(entry.to) ? entry.to : isRecord(entry.destination) ? entry.destination : entry;
  const destination = resolvedFormatTargetAtPath(document.questions, toRecord, `${path}.to`, issues);
  if (!destination) return undefined;
  const placementRecord = isRecord(entry.placement) ? entry.placement : {};
  const placementBlockId = entry.beforeBlockId ?? placementRecord.beforeBlockId;
  const afterBlockId = entry.afterBlockId ?? placementRecord.afterBlockId;
  const placement =
    typeof placementBlockId === "string" && placementBlockId.trim()
      ? { blockId: placementBlockId.trim(), position: "before" as const }
      : typeof afterBlockId === "string" && afterBlockId.trim()
        ? { blockId: afterBlockId.trim(), position: "after" as const }
        : undefined;
  return {
    type: "module.move",
    fromScope: source.scope,
    toScope: destination.scope,
    blockId,
    ...(placement ? { placement } : {}),
  };
}

function fitSolutionToSpaceAction(
  target: ResolvedFormatTarget,
  entry: Record<string, unknown>,
  path: string,
  issues: MauthActionValidationIssue[],
): MauthDocumentAction | undefined {
  const blocks = contentBlocksForFormatTarget(target);
  const solutionText = solutionModulesInBlocks(blocks)
    .map((block) => (block.kind === "text" ? block.text : ""))
    .join("\n");
  if (!solutionText.trim()) {
    issues.push({ path, message: "target has no solution module to fit", expected: "target with a solution-only module" });
    return undefined;
  }
  const extraLines = positiveInteger(entry.extraLines ?? entry.minimumExtraLines, 2, 0, 10);
  const lines = Math.min(
    MAX_AUTHOR_STUDENT_SPACE_LINES,
    Math.max(MIN_AUTHOR_STUDENT_SPACE_LINES, solutionTextLineEstimate(solutionText) + extraLines),
  );
  return responseSpaceAdjustmentAction(target, { ...entry, lines, mode: "atLeast" }, path, issues);
}

function mergeAdjacentStudentSpaces(blocks: readonly ContentBlock[]): ContentBlock[] | undefined {
  const nextBlocks: ContentBlock[] = [];
  let changed = false;
  for (const block of blocks) {
    if (block.kind === "text" && blockVisibility(block) !== "solution" && !block.text.trim()) {
      changed = true;
      continue;
    }
    const previous = nextBlocks[nextBlocks.length - 1];
    if (
      previous?.kind === "space" &&
      block.kind === "space" &&
      blockVisibility(previous) === "student" &&
      blockVisibility(block) === "student"
    ) {
      nextBlocks[nextBlocks.length - 1] = {
        ...previous,
        lines: Math.min(MAX_AUTHOR_STUDENT_SPACE_LINES, previous.lines + block.lines),
      };
      changed = true;
      continue;
    }
    nextBlocks.push(block);
  }
  return changed ? nextBlocks : undefined;
}

function tidyQuestionSpacingAction(target: ResolvedFormatTarget): MauthDocumentAction | undefined {
  const question = target.question;
  let changed = false;
  const mergedContentBlocks = mergeAdjacentStudentSpaces(question.contentBlocks);
  const contentBlocks = mergedContentBlocks ?? question.contentBlocks;
  if (mergedContentBlocks) changed = true;
  const parts = (question.parts ?? []).map((part) => {
    const mergedPartBlocks = mergeAdjacentStudentSpaces(part.contentBlocks);
    const partBlocks = mergedPartBlocks ?? part.contentBlocks;
    let partChanged = Boolean(mergedPartBlocks);
    const subparts = (part.subparts ?? []).map((subpart) => {
      const subpartBlocks = mergeAdjacentStudentSpaces(subpart.contentBlocks);
      if (!subpartBlocks) return subpart;
      partChanged = true;
      return { ...subpart, contentBlocks: subpartBlocks, itemOrder: blockOrder(subpartBlocks) };
    });
    if (!partChanged) return part;
    changed = true;
    return { ...part, contentBlocks: partBlocks, subparts, itemOrder: partOrder(partBlocks, subparts) };
  });
  if (!changed) return undefined;
  return {
    type: "question.update",
    questionId: question.id,
    patch: {
      contentBlocks,
      parts,
      itemOrder: questionOrder(contentBlocks, parts),
    },
  };
}

function parseFormatApplyActions<Q extends MauthQuestionLike, F extends object, C extends object>(
  document: MauthDocumentLike<Q, F, C>,
  args: unknown,
): MauthDocumentAction[] | MauthFormatApplyValidationFailure {
  const issues: MauthActionValidationIssue[] = [];
  if (!isRecord(args)) {
    return {
      error: "mauth.format.apply arguments must be an object.",
      issues: [{ path: "arguments", message: "must be an object", expected: "formatting payload" }],
    };
  }

  const rawOperations = formatOperationEntries(args);
  const actions: MauthDocumentAction[] = [];
  rawOperations.forEach((rawEntry, index) => {
    const path = Array.isArray(args.operations) ? `arguments.operations[${index}]` : "arguments";
    if (!isRecord(rawEntry)) {
      issues.push({ path, message: "must be a formatting operation object", expected: "{ type, target, ... }" });
      return;
    }
    const type = formatOperationType(rawEntry);
    if (!type) {
      issues.push({ path: `${path}.type`, message: "must be a supported formatting operation", expected: "format operation type" });
      return;
    }

    if (type === "moveModule") {
      const action = moveModuleAction(document, rawEntry, path, issues);
      if (action) actions.push(action);
      return;
    }

    const target = resolvedFormatTargetAtPath(document.questions, rawEntry, path, issues);
    if (!target) return;
    if (type === "setPageBreakBefore" || type === "startOnNewPage") {
      const action = pageBreakTargetForFormatTarget(target, path, issues, true);
      if (action) actions.push(action);
      return;
    }
    if (type === "removePageBreakBefore" || type === "clearPageBreakBefore") {
      const action = pageBreakTargetForFormatTarget(target, path, issues, false);
      if (action) actions.push(action);
      return;
    }
    if (type === "setDiagramAlignment") {
      const action = diagramAlignmentAction(target, rawEntry, path, issues);
      if (action) actions.push(action);
      return;
    }
    if (type === "adjustAnswerSpace" || type === "adjustResponseSpace") {
      const action = responseSpaceAdjustmentAction(target, rawEntry, path, issues);
      if (action) actions.push(action);
      return;
    }
    if (type === "fitSolutionToSpace") {
      const action = fitSolutionToSpaceAction(target, rawEntry, path, issues);
      if (action) actions.push(action);
      return;
    }
    if (type === "tidyQuestionSpacing") {
      const action = tidyQuestionSpacingAction(target);
      if (action) actions.push(action);
      return;
    }

    issues.push({
      path: `${path}.type`,
      message: `unsupported formatting operation: ${type}`,
      expected:
        "setPageBreakBefore, removePageBreakBefore, setDiagramAlignment, adjustAnswerSpace, moveModule, fitSolutionToSpace, or tidyQuestionSpacing",
    });
  });

  if (issues.length) {
    return {
      error: formatMauthActionValidationIssues(issues),
      issues,
    };
  }
  if (!actions.length) {
    return {
      error: "mauth.format.apply did not produce any formatting changes.",
      issues: [{ path: "arguments.operations", message: "must contain at least one changing operation", expected: "format operations" }],
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

function issueWarning(issue: MauthLayoutCheckIssue): MauthActionWarning {
  return {
    code: issue.code,
    message: issue.message,
    ...(issue.targetId ? { targetId: issue.targetId } : {}),
  };
}

function writeAllSolutionBlockingIssues(layout: MauthLayoutCheck) {
  const blockingCodes = new Set([
    "student-space-missing",
    "solution-hidden-mark-total-mismatch",
    "solution-visible-mark-note",
    "rendered-solution-space-overflow",
    "rendered-response-space-outline-missing",
  ]);
  return layout.issues.filter((issue) => blockingCodes.has(issue.code));
}

function writeAllSolutionsToolResult<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  document: MauthDocumentLike<Q, F, C>,
  args: unknown,
  options: MauthAssistantToolOptions<Q, F, C>,
): MauthAssistantToolResult<Q, F, C> {
  const actions = parseSolutionsWriteAllActions(document, args);
  if (!Array.isArray(actions)) {
    return failTool("mauth.solutions.writeAll", actions.error, { validationIssues: actions.issues }) as MauthAssistantToolResult<Q, F, C>;
  }
  const result = applyMauthDocumentActions(document, actions, options);
  if (!result.ok || !result.document) return resultTool("mauth.solutions.writeAll", result);

  const layout = inspectMauthLayout(result.document, { mode: "solutions" }, options);
  const blockingIssues = writeAllSolutionBlockingIssues(layout);
  if (blockingIssues.length) {
    const error = "mauth.solutions.writeAll produced solution layout or hidden-mark issues.";
    return {
      ok: false,
      toolName: "mauth.solutions.writeAll",
      data: { layout, validationIssues: blockingIssues },
      changedIds: [],
      warnings: blockingIssues.map(issueWarning),
      error,
    };
  }

  return {
    ...resultTool("mauth.solutions.writeAll", result),
    data: { actionResult: result, layout },
  };
}

function layoutCheckToolResult<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  document: MauthDocumentLike<Q, F, C>,
  args: unknown,
  options: MauthAssistantToolOptions<Q, F, C>,
): MauthAssistantToolResult<Q, F, C> {
  const layout = inspectMauthLayout(document, args, options);
  return {
    ok: true,
    toolName: "mauth.layout.check",
    data: layout,
    document,
    changedIds: [],
    warnings: layout.issues.map(issueWarning),
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

  if (call.name === "mauth.question.upsert" || call.name === "mauth.author.replaceQuestion") {
    const actions = parseAuthorReplaceQuestionActions(document, call.arguments, call.name);
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

  if (call.name === "mauth.solutions.writeAll") {
    return writeAllSolutionsToolResult(document, call.arguments, options);
  }

  if (call.name === "mauth.author.adjustResponseSpaces") {
    const actions = parseAuthorAdjustResponseSpacesActions(document, call.arguments);
    if (!Array.isArray(actions)) {
      return failTool(call.name, actions.error, { validationIssues: actions.issues }) as MauthAssistantToolResult<Q, F, C>;
    }
    return resultTool(call.name, applyMauthDocumentActions(document, actions, options));
  }

  if (call.name === "mauth.format.apply") {
    const actions = parseFormatApplyActions(document, call.arguments);
    if (!Array.isArray(actions)) {
      return failTool(call.name, actions.error, { validationIssues: actions.issues }) as MauthAssistantToolResult<Q, F, C>;
    }
    return resultTool(call.name, applyMauthDocumentActions(document, actions, options));
  }

  if (call.name === "mauth.layout.check") {
    return layoutCheckToolResult(document, call.arguments, options);
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
