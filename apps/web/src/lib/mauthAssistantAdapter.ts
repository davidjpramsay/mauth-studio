import type { ProjectFileDocument, ProjectFileSummary } from "@mauth-studio/shared";

import type { MauthActionWarning, MauthDocumentActionOptions, MauthDocumentLike, MauthQuestionLike } from "./mauthActions.ts";
import {
  MAUTH_ASSISTANT_TOOL_NAMES,
  runMauthAssistantTool,
  type MauthAssistantToolCall,
  type MauthAssistantToolName,
  type MauthAssistantToolOptions,
  type MauthAssistantToolResult,
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
): MauthAssistantAdapterResult<Q, F, C> {
  return {
    ok: result.ok,
    toolName: result.toolName,
    kind: "document",
    data: result.data,
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
): Promise<MauthAssistantToolOptions<Q, F, C>> {
  const options = await documentOptions(host);
  const activeAnchor = host.getActiveAnchor?.();
  return {
    ...options,
    assistantContext: {
      ...(options.assistantContext ?? {}),
      activeAnchor: activeAnchor ?? options.assistantContext?.activeAnchor ?? null,
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
    if (
      result.ok &&
      (
        ["mauth.actions.apply", "mauth.author.replaceQuestion", "mauth.author.addDiagram", "mauth.author.ensureSolutions"] as string[]
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
    }
    return documentToolResult(result, committedDocument);
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
