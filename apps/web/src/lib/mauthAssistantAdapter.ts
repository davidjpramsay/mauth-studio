import type { ProjectFileDocument, ProjectFileSummary } from "@mauth-studio/shared";

import type { MauthActionWarning, MauthDocumentActionOptions, MauthDocumentLike, MauthQuestionLike } from "./mauthActions.ts";
import {
  MAUTH_ASSISTANT_TOOL_NAMES,
  runMauthAssistantTool,
  type MauthAssistantToolCall,
  type MauthAssistantToolName,
  type MauthAssistantToolOptions,
  type MauthAssistantToolResult,
  type MauthPreviewInspection,
  type MauthPreviewInspectionWarning,
  type MauthPreviewRenderedMetrics,
} from "./mauthAssistantTools.ts";
import {
  MAUTH_ASSISTANT_FILE_TOOL_NAMES,
  runMauthAssistantFileTool,
  type MauthAssistantFileToolCall,
  type MauthAssistantFileToolName,
  type MauthAssistantFileToolResult,
  type MauthProjectFileDriver,
} from "./mauthAssistantFileTools.ts";

export type MauthAssistantAdapterToolName = MauthAssistantToolName | MauthAssistantFileToolName;
export type MauthAssistantAdapterToolKind = "document" | "file";
export type MauthAssistantAdapterToolCall = MauthAssistantToolCall | MauthAssistantFileToolCall;

export interface MauthAssistantToolCommitContext {
  toolName: MauthAssistantAdapterToolName;
  reason: string;
  data?: unknown;
}

export interface MauthAssistantDocumentPreflightIssue {
  path: string;
  message: string;
  expected?: string;
  targetId?: string;
}

export interface MauthAssistantDocumentPreflightResult {
  ok: boolean;
  error?: string;
  warnings?: MauthActionWarning[];
  validationIssues?: MauthAssistantDocumentPreflightIssue[];
  data?: unknown;
}

export interface MauthAssistantAdapterResult<
  Q extends MauthQuestionLike = MauthQuestionLike,
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
> {
  ok: boolean;
  toolName: MauthAssistantAdapterToolName;
  kind: MauthAssistantAdapterToolKind;
  data?: unknown;
  document?: MauthDocumentLike<Q, F, C>;
  files?: ProjectFileSummary[];
  changedIds: string[];
  changedPaths: string[];
  warnings: MauthActionWarning[];
  error?: string;
  committedDocument: boolean;
  activeFilePath?: string | null;
}

export interface MauthAssistantAdapterHost<
  Q extends MauthQuestionLike = MauthQuestionLike,
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
> {
  getDocument: () => MauthDocumentLike<Q, F, C>;
  commitDocument: (document: MauthDocumentLike<Q, F, C>, context: MauthAssistantToolCommitContext) => void | Promise<void>;
  documentOptions?: MauthDocumentActionOptions<Q, F, C> | (() => MauthDocumentActionOptions<Q, F, C>);
  fileDriver?: MauthProjectFileDriver;
  getProjectId?: () => string | null | Promise<string | null>;
  getActiveFilePath?: () => string | null;
  getActiveFileRevision?: () => number | null;
  getActiveAnchor?: () => string | null;
  getRenderedPreviewMetrics?: () => MauthPreviewRenderedMetrics | null;
  waitForRenderedPreviewMetrics?: (context: MauthAssistantToolCommitContext) => Promise<MauthPreviewRenderedMetrics | null>;
  validateDocumentBeforeCommit?: (
    document: MauthDocumentLike<Q, F, C>,
    context: MauthAssistantToolCommitContext,
    changedIds: string[],
    previousDocument: MauthDocumentLike<Q, F, C>,
  ) => MauthAssistantDocumentPreflightResult | Promise<MauthAssistantDocumentPreflightResult>;
  setActiveFilePath?: (path: string | null, context: MauthAssistantToolCommitContext) => void | Promise<void>;
  serializeDocument?: (document: MauthDocumentLike<Q, F, C>, context: MauthAssistantToolCommitContext) => string | Promise<string>;
  parseProjectFileDocument?: (
    document: ProjectFileDocument,
    context: MauthAssistantToolCommitContext,
  ) => MauthDocumentLike<Q, F, C> | Promise<MauthDocumentLike<Q, F, C>>;
  onFilesChanged?: (files: ProjectFileSummary[], context: MauthAssistantToolCommitContext) => void | Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function documentToolName(name: string): name is MauthAssistantToolName {
  return (MAUTH_ASSISTANT_TOOL_NAMES as readonly string[]).includes(name);
}

function fileToolName(name: string): name is MauthAssistantFileToolName {
  return (MAUTH_ASSISTANT_FILE_TOOL_NAMES as readonly string[]).includes(name);
}

function failAdapterTool(toolName: string, kind: MauthAssistantAdapterToolKind, error: string): MauthAssistantAdapterResult {
  return {
    ok: false,
    toolName: toolName as MauthAssistantAdapterToolName,
    kind,
    changedIds: [],
    changedPaths: [],
    warnings: [{ code: "assistant-adapter-not-applied", message: error }],
    error,
    committedDocument: false,
  };
}

function documentToolResult<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  result: MauthAssistantToolResult<Q, F, C>,
  committedDocument: boolean,
  dataOverride?: unknown,
): MauthAssistantAdapterResult<Q, F, C> {
  return {
    ok: result.ok,
    toolName: result.toolName,
    kind: "document",
    data: dataOverride ?? result.data,
    document: result.document,
    changedIds: result.changedIds,
    changedPaths: [],
    warnings: result.warnings,
    error: result.error,
    committedDocument,
  };
}

function preflightFailureData(resultData: unknown, preflight: MauthAssistantDocumentPreflightResult) {
  const resultRecord = isRecord(resultData) ? resultData : {};
  const preflightRecord = isRecord(preflight.data) ? preflight.data : {};
  const validationIssues =
    preflight.validationIssues ?? (Array.isArray(preflightRecord.validationIssues) ? preflightRecord.validationIssues : []);
  return {
    ...resultRecord,
    ...preflightRecord,
    validationIssues,
  };
}

function documentPreflightFailureResult<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  result: MauthAssistantToolResult<Q, F, C>,
  preflight: MauthAssistantDocumentPreflightResult,
): MauthAssistantAdapterResult<Q, F, C> {
  const error = preflight.error ?? "Assistant document preflight failed.";
  return {
    ok: false,
    toolName: result.toolName,
    kind: "document",
    data: preflightFailureData(result.data, preflight),
    document: result.document,
    changedIds: result.changedIds,
    changedPaths: [],
    warnings: [...result.warnings, ...(preflight.warnings ?? [{ code: "assistant-document-preflight-failed", message: error }])],
    error,
    committedDocument: false,
  };
}

function containsDiagramPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (isRecord(value.diagram)) return true;
  if (Array.isArray(value.diagrams) && value.diagrams.some(isRecord)) return true;
  return Object.values(value).some((item) => {
    if (Array.isArray(item)) return item.some(containsDiagramPayload);
    return isRecord(item) && containsDiagramPayload(item);
  });
}

type PostEditInspectionMode = "diagram" | "solutionLayout" | "formatLayout";

interface PostEditInspectionPlan {
  args: Record<string, unknown>;
  modes: PostEditInspectionMode[];
}

function containsSolutionPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.solutionText === "string" || typeof value.solution === "string" || value.includeSolution === true) return true;
  return Object.values(value).some((item) => {
    if (Array.isArray(item)) return item.some(containsSolutionPayload);
    return isRecord(item) && containsSolutionPayload(item);
  });
}

function containsResponseSpacePayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    value.lines !== undefined ||
    value.studentSpaceLines !== undefined ||
    value.answerLines !== undefined ||
    value.responseSpaceLines !== undefined
  ) {
    return true;
  }
  return Object.values(value).some((item) => {
    if (Array.isArray(item)) return item.some(containsResponseSpacePayload);
    return isRecord(item) && containsResponseSpacePayload(item);
  });
}

function firstRecordFromArray(value: unknown) {
  return Array.isArray(value) ? value.find(isRecord) : undefined;
}

function postEditQuestionInspectionArgs(call: MauthAssistantAdapterToolCall): Record<string, unknown> {
  if (!isRecord(call.arguments)) return { scope: "question" };
  const operation = firstRecordFromArray(call.arguments.operations) ?? firstRecordFromArray(call.arguments.edits);
  const operationTarget = isRecord(operation?.target) ? operation.target : operation;
  const source =
    firstRecordFromArray(call.arguments.questions) ?? firstRecordFromArray(call.arguments.targets) ?? operationTarget ?? call.arguments;
  return { ...source, scope: "question" };
}

function postEditInspectionPlan(call: MauthAssistantAdapterToolCall): PostEditInspectionPlan | null {
  if (call.name === "mauth.author.addDiagram") {
    return { args: postEditQuestionInspectionArgs(call), modes: ["diagram", "solutionLayout"] };
  }
  if (call.name === "mauth.question.upsert" || call.name === "mauth.author.replaceQuestion") {
    const modes: PostEditInspectionMode[] = [];
    if (containsDiagramPayload(call.arguments)) modes.push("diagram");
    if (containsSolutionPayload(call.arguments) || containsResponseSpacePayload(call.arguments)) modes.push("solutionLayout");
    return modes.length ? { args: postEditQuestionInspectionArgs(call), modes } : null;
  }
  if (
    call.name === "mauth.author.ensureSolutions" ||
    call.name === "mauth.solutions.writeAll" ||
    call.name === "mauth.author.adjustResponseSpaces"
  ) {
    const targetArray = isRecord(call.arguments)
      ? Array.isArray(call.arguments.questions)
        ? call.arguments.questions
        : Array.isArray(call.arguments.targets)
          ? call.arguments.targets
          : undefined
      : undefined;
    const targetCount = targetArray?.filter(isRecord).length ?? 1;
    return {
      args: targetCount > 1 ? { scope: "document" } : postEditQuestionInspectionArgs(call),
      modes: ["solutionLayout"],
    };
  }
  if (call.name === "mauth.format.apply") {
    return { args: postEditQuestionInspectionArgs(call), modes: ["formatLayout", "solutionLayout"] };
  }
  if (call.name === "mauth.settings.apply") {
    return { args: { ...postEditQuestionInspectionArgs(call), scope: "selection" }, modes: ["diagram", "formatLayout", "solutionLayout"] };
  }
  return null;
}

function repairablePostEditWarnings(
  inspection: MauthPreviewInspection,
  modes: readonly PostEditInspectionMode[],
): MauthPreviewInspectionWarning[] {
  const modeSet = new Set(modes);
  const solutionWarningCodes = new Set([
    "student-space-missing",
    "solution-hidden-mark-total-mismatch",
    "solution-visible-mark-note",
    "rendered-solution-space-overflow",
    "rendered-response-space-outline-missing",
    "rendered-page-overflow",
  ]);
  const questionWarnings = modeSet.has("solutionLayout")
    ? [...(inspection.question?.warnings ?? []), ...(inspection.questions?.flatMap((question) => question.warnings) ?? [])].filter(
        (warning) => solutionWarningCodes.has(warning.code),
      )
    : [];
  const diagramWarnings = modeSet.has("diagram")
    ? (inspection.question?.diagrams.flatMap((diagram) =>
        diagram.warnings
          .filter((warning) => warning.severity === "warning" || warning.severity === "error")
          .map((warning) => ({
            ...warning,
            anchor: warning.anchor ?? diagram.anchor,
            targetId: warning.targetId ?? diagram.id,
          })),
      ) ?? [])
    : [];
  const renderedWarnings =
    inspection.renderedMetrics.available === true
      ? inspection.renderedMetrics.warnings
          .filter((warning) => {
            if (modeSet.has("diagram") && warning.code.startsWith("rendered-diagram-")) return true;
            if (modeSet.has("formatLayout")) {
              return (
                warning.code === "rendered-page-overflow" ||
                warning.code === "rendered-response-space-outline-missing" ||
                warning.code === "rendered-diagram-clipped" ||
                warning.code === "rendered-diagram-clipped-by-page" ||
                warning.code === "rendered-diagram-too-large" ||
                warning.code === "rendered-diagram-too-small"
              );
            }
            return modeSet.has("solutionLayout") && solutionWarningCodes.has(warning.code);
          })
          .filter((warning) => warning.severity === "warning" || warning.severity === "error")
          .map((warning) => ({
            ...warning,
            targetId: warning.targetId ?? blockIdFromAnchor(warning.anchor),
          }))
      : [];

  const seen = new Set<string>();
  return [...questionWarnings, ...diagramWarnings, ...renderedWarnings].filter((warning) => {
    if (warning.severity !== "warning" && warning.severity !== "error") return false;
    const key = `${warning.code}:${warning.anchor ?? ""}:${warning.targetId ?? ""}:${warning.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function blockIdFromAnchor(anchor?: string) {
  const match = anchor?.match(/\/b:([^/]+)/);
  return match?.[1];
}

function postEditInspectionExpected(warning: MauthPreviewInspectionWarning, repairTarget?: PostEditRepairTarget) {
  const targetInstruction = repairTarget
    ? ` Repair the already-committed Question ${repairTarget.questionNumber ?? "target"}${
        repairTarget.questionId ? ` (questionId: "${repairTarget.questionId}")` : ""
      }; do not append a new question.`
    : "";
  if (warning.code === "rendered-diagram-failed" || warning.code.startsWith("penrose-")) {
    return warning.targetId
      ? `Repair this diagram by calling mauth.author.addDiagram with diagramId: "${warning.targetId}" and a corrected native graphConfig.${targetInstruction}`
      : `Repair the diagram with a corrected native graphConfig.${targetInstruction}`;
  }
  if (!warning.code.startsWith("rendered-") && warning.targetId) {
    if (warning.code === "scalar-product-segment-label-tex-unsafe") {
      return `Repair this scalar-product vector diagram by calling mauth.author.addDiagram with diagramId: "${warning.targetId}" and TeX-safe magnitude labels such as 2\\ \\text{units}.${targetInstruction}`;
    }
    if (warning.code === "scalar-product-angle-label-tex-unsafe") {
      return `Repair this scalar-product vector diagram by calling mauth.author.addDiagram with diagramId: "${warning.targetId}" and TeX-safe angle labels such as 45^\\circ.${targetInstruction}`;
    }
    if (
      warning.code === "scalar-product-vector-label-placement-missing" ||
      warning.code === "scalar-product-segment-label-placement-missing" ||
      warning.code === "scalar-product-angle-label-placement-missing"
    ) {
      return `Repair this scalar-product vector diagram by calling mauth.author.addDiagram with diagramId: "${warning.targetId}" and explicit vector2d labelX/labelY or offsetPx values so labels stay clear of the rays.${targetInstruction}`;
    }
    return `Repair this diagram by calling mauth.author.addDiagram with diagramId: "${warning.targetId}" and a corrected native graphConfig.${targetInstruction}`;
  }
  if (warning.code === "rendered-response-space-outline-missing") {
    return `Repair the adjacent diagram and answer-space layout so it renders as one L-shaped response slot.${targetInstruction}`;
  }
  if (warning.code === "rendered-solution-space-overflow") {
    return `Repair by using mauth.author.adjustResponseSpaces to increase the paired student space, or by tightening the solution text while preserving mark ticks.${targetInstruction}`;
  }
  if (warning.code === "student-space-missing")
    return `Repair by adding a student-only answer space for the same question, part, or subpart.${targetInstruction}`;
  if (warning.code === "solution-hidden-mark-total-mismatch") {
    return `Repair the solution with hidden [[marks:n]] annotations whose total matches the relevant marks.${targetInstruction}`;
  }
  if (warning.code === "solution-visible-mark-note") {
    return `Repair the solution by replacing visible mark notes with hidden [[marks:n]] annotations.${targetInstruction}`;
  }
  if (warning.code === "rendered-page-overflow") {
    return `Repair the page layout so the edited content fits inside the rendered A4 page box.${targetInstruction}`;
  }
  return warning.targetId
    ? `Repair the affected module by calling the appropriate high-level Mauth authoring tool with target id "${warning.targetId}".${targetInstruction}`
    : `Repair the affected preview layout and rerun preview inspection.${targetInstruction}`;
}

interface PostEditRepairTarget {
  scope: "question" | "document" | "selection";
  questionId?: string;
  questionNumber?: number;
  diagramId?: string;
  targetId?: string;
  changedIds: string[];
  committedDocument: true;
  instruction: string;
}

function postEditRepairTarget<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  result: MauthAssistantToolResult<Q, F, C>,
  inspection: MauthPreviewInspection,
  repairWarnings: readonly MauthPreviewInspectionWarning[],
): PostEditRepairTarget {
  const firstDiagramTarget = repairWarnings.find((warning) => warning.targetId)?.targetId;
  const questionId = inspection.question?.id ?? inspection.target.questionId;
  const questionNumber = inspection.question?.questionNumber ?? inspection.target.questionNumber;
  const scope = questionId || questionNumber ? "question" : inspection.scope === "document" ? "document" : "selection";
  const label =
    questionNumber !== undefined
      ? `Question ${questionNumber}`
      : questionId
        ? `questionId "${questionId}"`
        : scope === "document"
          ? "the current document"
          : "the selected target";
  return {
    scope,
    ...(questionId ? { questionId } : {}),
    ...(questionNumber !== undefined ? { questionNumber } : {}),
    ...(firstDiagramTarget ? { diagramId: firstDiagramTarget, targetId: firstDiagramTarget } : {}),
    changedIds: [...result.changedIds],
    committedDocument: true,
    instruction: `This edit has already been committed. Repair ${label} in place; do not append another question or duplicate existing content.`,
  };
}

function postEditInspectionFailureResult<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  result: MauthAssistantToolResult<Q, F, C>,
  inspection: MauthPreviewInspection,
  repairWarnings: readonly MauthPreviewInspectionWarning[],
): MauthAssistantAdapterResult<Q, F, C> {
  const repairTarget = postEditRepairTarget(result, inspection, repairWarnings);
  const validationIssues = repairWarnings.map((warning, index) => ({
    path: warning.path
      ? `postEditInspection.${warning.path}`
      : warning.code.startsWith("rendered-")
        ? `postEditInspection.renderedMetrics.warnings[${index}]`
        : warning.code.startsWith("solution-") || warning.code.startsWith("student-space-")
          ? `postEditInspection.question.solutionScopes[${index}]`
          : `postEditInspection.question.diagrams[${index}].graphConfig`,
    message: warning.message,
    expected: postEditInspectionExpected(warning, repairTarget),
    targetId: warning.targetId,
  }));
  const error = "Assistant post-edit inspection found repairable preview warnings.";
  return {
    ok: false,
    toolName: result.toolName,
    kind: "document",
    data: {
      ...(isRecord(result.data) ? result.data : {}),
      postEditInspection: {
        target: inspection.target,
        repairTarget,
        repairWarnings: repairWarnings.map((warning) => ({
          code: warning.code,
          severity: warning.severity,
          message: warning.message,
          anchor: warning.anchor,
          targetId: warning.targetId,
          path: warning.path,
        })),
      },
      repairTarget,
      validationIssues,
    },
    document: result.document,
    changedIds: result.changedIds,
    changedPaths: [],
    warnings: [
      ...result.warnings,
      ...repairWarnings.map((warning) => ({
        code: warning.code,
        message: warning.message,
        targetId: warning.targetId,
      })),
    ],
    error,
    committedDocument: true,
  };
}

function postEditInspectionSuccessData(resultData: unknown, inspection: MauthPreviewInspection, modes: readonly PostEditInspectionMode[]) {
  const resultRecord = isRecord(resultData) ? resultData : {};
  const diagramReviewRequired = modes.includes("diagram");
  return {
    ...resultRecord,
    ...(diagramReviewRequired
      ? {
          semanticReview: {
            required: true,
            reason:
              "A diagram-bearing edit was applied. Before reporting success, compare the teacher request, question text, and diagram summary to confirm the diagram semantically matches the question.",
            expected:
              "If the diagram/question mismatch, repair with a focused high-level tool. If they match, respond with a short teacher-facing confirmation.",
            checklist: [
              "Check every equation, function, vector, set, label, and geometric relationship named in the teacher request or question text appears in the diagram summary.",
              "For graph2d diagrams, compare the written equations/functions, domains, axis visibility, and stated coordinate points with question.diagrams[].summary.functions/features and question.diagrams[].warnings.",
              "For geometry diagrams, check required tangents, chords, parallel/perpendicular relations, points, and hidden auxiliary labels against question.diagrams[].warnings and summary.",
              "For source conversions, check the diagram placement and structured parts match the screenshot/PDF source instead of replacing a visible diagram with prose.",
            ],
          },
        }
      : {}),
    postEditInspection: {
      target: inspection.target,
      question: inspection.question
        ? {
            id: inspection.question.id,
            questionNumber: inspection.question.questionNumber,
            totalMarks: inspection.question.totalMarks,
            textPreview: inspection.question.modules.flatMap((module) => (module.textPreview ? [module.textPreview] : [])).join(" "),
            parts: inspection.question.parts,
            modules: inspection.question.allModules.map((module) => ({
              id: module.id,
              anchor: module.anchor,
              kind: module.kind,
              visibility: module.visibility,
              textPreview: module.textPreview,
              diagramType: module.diagramType,
              lines: module.lines,
            })),
            diagrams: inspection.question.diagrams.map((diagram) => ({
              id: diagram.id,
              anchor: diagram.anchor,
              graphType: diagram.graphType,
              align: diagram.align,
              textSide: diagram.textSide,
              summary: diagram.summary,
              warnings: diagram.warnings,
              rendered: diagram.rendered,
            })),
            warnings: inspection.question.warnings,
          }
        : undefined,
      warnings: inspection.warnings,
    },
  };
}

function fileToolResult<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  result: MauthAssistantFileToolResult,
  document: MauthDocumentLike<Q, F, C> | undefined,
  committedDocument: boolean,
  activeFilePath: string | null | undefined,
): MauthAssistantAdapterResult<Q, F, C> {
  return {
    ok: result.ok,
    toolName: result.toolName,
    kind: "file",
    data: result.data,
    document,
    files: result.files,
    changedIds: [],
    changedPaths: result.changedPaths,
    warnings: [],
    error: result.error,
    committedDocument,
    activeFilePath,
  };
}

function projectDocumentFromData(data: unknown) {
  return isRecord(data) && isRecord(data.document) ? (data.document as unknown as ProjectFileDocument) : undefined;
}

function nextActiveFilePath(result: MauthAssistantFileToolResult) {
  const document = projectDocumentFromData(result.data);
  if (document?.kind === "file") return document.path;
  return result.changedPaths.length === 1 ? result.changedPaths[0] : undefined;
}

async function documentOptions<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  host: MauthAssistantAdapterHost<Q, F, C>,
): Promise<MauthAssistantToolOptions<Q, F, C>> {
  return typeof host.documentOptions === "function" ? host.documentOptions() : (host.documentOptions ?? {});
}

async function documentToolOptions<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  host: MauthAssistantAdapterHost<Q, F, C>,
  renderedMetricsOverride?: MauthPreviewRenderedMetrics | null,
): Promise<MauthAssistantToolOptions<Q, F, C>> {
  const options = await documentOptions(host);
  const activeAnchor = host.getActiveAnchor?.();
  const renderedMetrics = renderedMetricsOverride !== undefined ? renderedMetricsOverride : host.getRenderedPreviewMetrics?.();
  return {
    ...options,
    assistantContext: {
      ...(options.assistantContext ?? {}),
      activeAnchor: activeAnchor ?? options.assistantContext?.activeAnchor ?? null,
      renderedMetrics: renderedMetrics ?? options.assistantContext?.renderedMetrics ?? null,
    },
  };
}

async function projectId<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  host: MauthAssistantAdapterHost<Q, F, C>,
) {
  return host.getProjectId ? await host.getProjectId() : null;
}

async function addSerializedContent<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  host: MauthAssistantAdapterHost<Q, F, C>,
  call: MauthAssistantFileToolCall,
): Promise<MauthAssistantFileToolCall> {
  if (call.name !== "mauth.files.save" && call.name !== "mauth.files.saveAs") return call;
  if (isRecord(call.arguments) && typeof call.arguments.content === "string") return call;
  if (!host.serializeDocument) return call;

  const context = { toolName: call.name, reason: "serialize-current-document-for-file-save", data: call.arguments };
  const content = await host.serializeDocument(host.getDocument(), context);
  return {
    ...call,
    arguments: {
      ...(isRecord(call.arguments) ? call.arguments : {}),
      content,
    },
  };
}

export async function runMauthAssistantAdapterTool<
  Q extends MauthQuestionLike,
  F extends object,
  C extends object = Record<string, unknown>,
>(host: MauthAssistantAdapterHost<Q, F, C>, call: MauthAssistantAdapterToolCall): Promise<MauthAssistantAdapterResult<Q, F, C>> {
  if (documentToolName(call.name)) {
    const previousDocument = host.getDocument();
    const result = runMauthAssistantTool(previousDocument, call as MauthAssistantToolCall, await documentToolOptions(host));
    let committedDocument = false;
    let postInspectionData: unknown;
    if (
      result.ok &&
      (
        [
          "mauth.actions.apply",
          "mauth.question.upsert",
          "mauth.author.replaceQuestion",
          "mauth.author.addDiagram",
          "mauth.author.ensureSolutions",
          "mauth.solutions.writeAll",
          "mauth.author.adjustResponseSpaces",
          "mauth.format.apply",
          "mauth.settings.apply",
        ] as string[]
      ).includes(call.name) &&
      result.document
    ) {
      const context = { toolName: call.name, reason: "assistant-document-apply", data: result.data };
      if (host.validateDocumentBeforeCommit) {
        const preflight = await host.validateDocumentBeforeCommit(result.document, context, result.changedIds, previousDocument);
        if (!preflight.ok) return documentPreflightFailureResult(result, preflight);
      }
      await host.commitDocument(result.document, context);
      committedDocument = true;
      const inspectionPlan = postEditInspectionPlan(call);
      if (inspectionPlan) {
        const renderedMetrics = host.waitForRenderedPreviewMetrics ? await host.waitForRenderedPreviewMetrics(context) : undefined;
        const inspection = runMauthAssistantTool(
          result.document,
          { name: "mauth.preview.inspect", arguments: inspectionPlan.args },
          await documentToolOptions(host, renderedMetrics),
        );
        const inspectionData = inspection.data as MauthPreviewInspection;
        const repairWarnings = repairablePostEditWarnings(inspectionData, inspectionPlan.modes);
        if (repairWarnings.length) return postEditInspectionFailureResult(result, inspectionData, repairWarnings);
        postInspectionData = postEditInspectionSuccessData(result.data, inspectionData, inspectionPlan.modes);
      }
    }
    return documentToolResult(result, committedDocument, postInspectionData);
  }

  if (!fileToolName(call.name)) {
    return failAdapterTool(call.name, "document", `Unsupported assistant adapter tool: ${call.name}`) as MauthAssistantAdapterResult<
      Q,
      F,
      C
    >;
  }

  if (!host.fileDriver) {
    return failAdapterTool(call.name, "file", "Assistant file driver is not configured.") as MauthAssistantAdapterResult<Q, F, C>;
  }

  const resolvedProjectId = await projectId(host);
  if (!resolvedProjectId) {
    return failAdapterTool(call.name, "file", "Assistant project id is not configured.") as MauthAssistantAdapterResult<Q, F, C>;
  }

  const fileCall = await addSerializedContent(host, call as MauthAssistantFileToolCall);
  const result = await runMauthAssistantFileTool(
    host.fileDriver,
    {
      projectId: resolvedProjectId,
      activeFilePath: host.getActiveFilePath?.() ?? null,
      activeFileRevision: host.getActiveFileRevision?.() ?? null,
    },
    fileCall,
  );
  const context = { toolName: call.name, reason: "assistant-file-tool", data: result.data };

  if (result.ok && result.files && host.onFilesChanged) {
    await host.onFilesChanged(result.files, context);
  }

  if (result.ok && call.name === "mauth.files.open") {
    const projectDocument = projectDocumentFromData(result.data);
    if (!projectDocument) return fileToolResult(result, undefined, false, host.getActiveFilePath?.());
    if (!host.parseProjectFileDocument) {
      return failAdapterTool(call.name, "file", "Project file parser is not configured.") as MauthAssistantAdapterResult<Q, F, C>;
    }
    const document = await host.parseProjectFileDocument(projectDocument, context);
    await host.commitDocument(document, { ...context, reason: "assistant-file-open" });
    if (host.setActiveFilePath) await host.setActiveFilePath(projectDocument.path, context);
    return fileToolResult(result, document, true, projectDocument.path);
  }

  if (result.ok && (call.name === "mauth.files.save" || call.name === "mauth.files.saveAs")) {
    const nextPath = nextActiveFilePath(result);
    if (nextPath && host.setActiveFilePath) await host.setActiveFilePath(nextPath, context);
    return fileToolResult(result, host.getDocument(), false, nextPath ?? host.getActiveFilePath?.());
  }

  if (result.ok && call.name === "mauth.files.delete") {
    const activePath = host.getActiveFilePath?.();
    const deletedActive = activePath ? result.changedPaths.some((path) => activePath === path || activePath.startsWith(`${path}/`)) : false;
    if (deletedActive && host.setActiveFilePath) await host.setActiveFilePath(null, context);
    return fileToolResult(result, host.getDocument(), false, deletedActive ? null : activePath);
  }

  return fileToolResult(result, host.getDocument(), false, host.getActiveFilePath?.());
}
