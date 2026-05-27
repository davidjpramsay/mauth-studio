import type { MauthAssistantFileToolName } from "./mauthAssistantFileTools.ts";

export interface MauthFileToolValidationIssue {
  path: string;
  message: string;
  expected?: string;
}

export interface MauthFileToolValidationResult {
  ok: boolean;
  issues: MauthFileToolValidationIssue[];
}

const FILE_TOOL_NAMES = new Set<string>([
  "mauth.files.describe",
  "mauth.files.list",
  "mauth.files.open",
  "mauth.files.save",
  "mauth.files.saveAs",
  "mauth.files.createFolder",
  "mauth.files.duplicate",
  "mauth.files.rename",
  "mauth.files.move",
  "mauth.files.delete",
  "mauth.files.versions.list",
  "mauth.files.versions.restore",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function addIssue(issues: MauthFileToolValidationIssue[], path: string, message: string, expected?: string) {
  issues.push({ path, message, ...(expected ? { expected } : {}) });
}

function stringField(args: Record<string, unknown>, key: string, path: string, issues: MauthFileToolValidationIssue[], optional = false) {
  const value = args[key];
  if (value === undefined && optional) return;
  if (typeof value !== "string" || !value.trim()) addIssue(issues, `${path}.${key}`, "must be a non-empty string", "string");
}

function booleanField(args: Record<string, unknown>, key: string, path: string, issues: MauthFileToolValidationIssue[], optional = false) {
  const value = args[key];
  if (value === undefined && optional) return;
  if (typeof value !== "boolean") addIssue(issues, `${path}.${key}`, "must be a boolean", "boolean");
}

function numberField(args: Record<string, unknown>, key: string, path: string, issues: MauthFileToolValidationIssue[], optional = false) {
  const value = args[key];
  if (value === undefined && optional) return;
  if (typeof value !== "number" || !Number.isFinite(value)) addIssue(issues, `${path}.${key}`, "must be a finite number", "number");
}

function recordField(args: Record<string, unknown>, key: string, path: string, issues: MauthFileToolValidationIssue[], optional = false) {
  const value = args[key];
  if (value === undefined && optional) return;
  if (!isRecord(value)) addIssue(issues, `${path}.${key}`, "must be an object", "object");
}

function stringArrayField(
  args: Record<string, unknown>,
  key: string,
  path: string,
  issues: MauthFileToolValidationIssue[],
  optional = false,
) {
  const value = args[key];
  if (value === undefined && optional) return;
  if (!Array.isArray(value)) {
    addIssue(issues, `${path}.${key}`, "must be an array of strings", "string[]");
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== "string" || !item.trim()) addIssue(issues, `${path}.${key}[${index}]`, "must be a non-empty string", "string");
  });
}

function optionalBaseRevision(args: Record<string, unknown>, path: string, issues: MauthFileToolValidationIssue[]) {
  const value = args.baseRevision;
  if (value === undefined || value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value))
    addIssue(issues, `${path}.baseRevision`, "must be a finite number or null", "number | null");
}

function requirePathOrName(args: Record<string, unknown>, path: string, issues: MauthFileToolValidationIssue[], label = "path or name") {
  const hasPath = typeof args.path === "string" && args.path.trim();
  const hasName = typeof args.name === "string" && args.name.trim();
  if (!hasPath && !hasName) addIssue(issues, path, `must include ${label}`, "{ path } or { name }");
  if (args.path !== undefined) stringField(args, "path", path, issues);
  if (args.name !== undefined) stringField(args, "name", path, issues);
}

function requirePathOrPaths(args: Record<string, unknown>, path: string, issues: MauthFileToolValidationIssue[]) {
  const hasPath = typeof args.path === "string" && args.path.trim();
  const hasPaths = Array.isArray(args.paths) && args.paths.some((item) => typeof item === "string" && item.trim());
  if (!hasPath && !hasPaths) addIssue(issues, path, "must include path or paths", "{ path } or { paths }");
  if (args.path !== undefined) stringField(args, "path", path, issues);
  if (args.paths !== undefined) stringArrayField(args, "paths", path, issues);
}

function argsRecord(toolName: MauthAssistantFileToolName, args: unknown, issues: MauthFileToolValidationIssue[]) {
  if (args === undefined || args === null) {
    if (toolName === "mauth.files.describe" || toolName === "mauth.files.list") return {};
    addIssue(issues, "arguments", "must be an object", "object");
    return null;
  }
  if (!isRecord(args)) {
    addIssue(issues, "arguments", "must be an object", "object");
    return null;
  }
  return args;
}

export function validateMauthFileToolPayload(toolName: string, args: unknown): MauthFileToolValidationResult {
  const issues: MauthFileToolValidationIssue[] = [];
  if (!FILE_TOOL_NAMES.has(toolName)) {
    addIssue(issues, "name", `unsupported file tool: ${toolName}`, "MauthAssistantFileToolName");
    return { ok: false, issues };
  }

  const name = toolName as MauthAssistantFileToolName;
  const record = argsRecord(name, args, issues);
  if (!record) return { ok: false, issues };

  switch (name) {
    case "mauth.files.describe":
      break;
    case "mauth.files.list":
      stringField(record, "folderPath", "arguments", issues, true);
      break;
    case "mauth.files.open":
    case "mauth.files.versions.list":
      stringField(record, "path", "arguments", issues);
      break;
    case "mauth.files.save":
    case "mauth.files.saveAs":
      requirePathOrName(record, "arguments", issues);
      stringField(record, "content", "arguments", issues);
      booleanField(record, "overwrite", "arguments", issues, true);
      optionalBaseRevision(record, "arguments", issues);
      stringField(record, "fileType", "arguments", issues, true);
      recordField(record, "metadata", "arguments", issues, true);
      numberField(record, "sortOrder", "arguments", issues, true);
      break;
    case "mauth.files.createFolder":
      requirePathOrName(record, "arguments", issues, "folder path or name");
      recordField(record, "metadata", "arguments", issues, true);
      break;
    case "mauth.files.duplicate":
    case "mauth.files.move":
    case "mauth.files.delete":
      requirePathOrPaths(record, "arguments", issues);
      stringField(record, "targetFolderPath", "arguments", issues, true);
      break;
    case "mauth.files.rename":
      stringField(record, "path", "arguments", issues);
      stringField(record, "newName", "arguments", issues);
      break;
    case "mauth.files.versions.restore":
      stringField(record, "path", "arguments", issues);
      stringField(record, "versionId", "arguments", issues);
      break;
  }

  return { ok: issues.length === 0, issues };
}

export function formatMauthFileToolValidationIssues(issues: readonly MauthFileToolValidationIssue[]) {
  const shown = issues.slice(0, 8);
  const suffix =
    issues.length > shown.length ? `; plus ${issues.length - shown.length} more issue${issues.length - shown.length === 1 ? "" : "s"}` : "";
  return `Mauth file-tool validation failed: ${shown
    .map((issue) => `${issue.path} ${issue.message}`)
    .join("; ")}${suffix}. Repair the file-tool payload and call the same Mauth tool again.`;
}
