import type {
  ContentBlock,
  MauthAgentFileState,
  MauthAgentModuleSummary,
  MauthAgentPartSummary,
  MauthAgentQuestionSummary,
  MauthAgentSnapshot,
  MauthAgentSubpartSummary,
} from "@mauth-studio/shared";

import type { MauthDocumentLike, MauthPartLike, MauthQuestionLike, MauthSubpartLike } from "./mauthActions.ts";

export interface BuildMauthAgentSnapshotInput<
  Q extends MauthQuestionLike = MauthQuestionLike,
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
> {
  document: MauthDocumentLike<Q, F, C>;
  file: MauthAgentFileState;
  validation?: unknown;
  warnings?: MauthAgentSnapshot["warnings"];
  generatedAt?: string;
}

function stableSortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => stableSortValue(entry));
  if (!value || typeof value !== "object") return value;
  const sorted: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))) {
    sorted[key] = stableSortValue(entryValue);
  }
  return sorted;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableSortValue(value));
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function compactText(value: unknown, limit = 180): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized;
}

function blockVisibility(block: ContentBlock) {
  if ("visibility" in block && block.visibility) return block.visibility;
  if ("solutionOnly" in block && block.solutionOnly) return "solution";
  if ("studentOnly" in block && block.studentOnly) return "student";
  return "always";
}

function summarizeBlock(block: ContentBlock): MauthAgentModuleSummary {
  const summary: MauthAgentModuleSummary = {
    id: block.id,
    kind: block.kind,
    visibility: blockVisibility(block),
  };

  if (block.kind === "text") {
    summary.textPreview = compactText(block.text);
    summary.marks = block.markTicks;
  }
  if (block.kind === "choices") {
    summary.choiceCount = block.choices.length;
    summary.textPreview = compactText(block.choices.join(" | "));
  }
  if (block.kind === "table") {
    summary.rowCount = block.rows.length;
    summary.columnCount = Math.max(block.headers.length, ...block.rows.map((row) => row.length));
    summary.textPreview = compactText([...block.headers, ...block.rows.flat()].join(" | "));
  }
  if (block.kind === "diagram") {
    summary.graphType = block.graphConfig.type;
    summary.diagramAlign = block.diagramAlign;
    summary.textPreview = compactText(
      [
        block.graphConfig.type,
        block.graphConfig.expression,
        block.graphConfig.latex,
        block.graphConfig.xAxisLabel,
        block.graphConfig.yAxisLabel,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  if (block.kind === "space") {
    summary.lines = block.lines;
  }
  if (block.kind === "columns") {
    summary.columnCount = block.columnCount ?? block.columns.length;
    summary.childModules = block.columns.flatMap((column) => column.map((child) => summarizeBlock(child)));
  }

  return summary;
}

function summarizeSubpart(subpart: MauthSubpartLike): MauthAgentSubpartSummary {
  return {
    id: subpart.id,
    label: subpart.label,
    marks: subpart.marks,
    textPreview: compactText(subpart.text),
    pageBreakBefore: subpart.pageBreakBefore,
    modules: subpart.contentBlocks.map(summarizeBlock),
  };
}

function summarizePart(part: MauthPartLike): MauthAgentPartSummary {
  return {
    id: part.id,
    label: part.label,
    marks: part.marks,
    textPreview: compactText(part.text),
    pageBreakBefore: part.pageBreakBefore,
    modules: part.contentBlocks.map(summarizeBlock),
    subparts: (part.subparts ?? []).map(summarizeSubpart),
  };
}

function summarizeQuestion(question: MauthQuestionLike, index: number): MauthAgentQuestionSummary {
  return {
    id: question.id,
    label: `Question ${index + 1}`,
    marks: question.marks,
    textPreview: compactText(question.text),
    pageBreakAfter: question.pageBreakAfter,
    modules: question.contentBlocks.map(summarizeBlock),
    parts: (question.parts ?? []).map(summarizePart),
  };
}

function snapshotIdFor<Q extends MauthQuestionLike, F extends object, C extends object>(
  input: BuildMauthAgentSnapshotInput<Q, F, C>,
): string {
  return `snap_${hashString(
    stableStringify({
      file: {
        projectId: input.file.projectId,
        activePath: input.file.activePath,
        activeRevision: input.file.activeRevision,
      },
      frontMatter: input.document.frontMatter,
      formattingConfig: input.document.formattingConfig,
      questions: input.document.questions,
    }),
  )}`;
}

export function buildMauthAgentSnapshot<
  Q extends MauthQuestionLike,
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
>(input: BuildMauthAgentSnapshotInput<Q, F, C>): MauthAgentSnapshot {
  const snapshotId = snapshotIdFor(input);
  const questions = input.document.questions.map(summarizeQuestion);

  return {
    success: true,
    snapshotId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mutationBase: {
      snapshotId,
      activeProjectFilePath: input.file.activePath,
      activeProjectFileRevision: input.file.activeRevision,
      dirty: input.file.dirty,
      preferredPrecondition: "baseSnapshotId",
    },
    file: input.file,
    frontMatter: input.document.frontMatter as Record<string, unknown>,
    formattingConfig: input.document.formattingConfig as Record<string, unknown> | undefined,
    questions,
    questionCount: questions.length,
    totalMarks: questions.reduce((total, question) => total + question.marks, 0),
    validation: input.validation,
    warnings: input.warnings ?? [],
    _links: {
      snapshot: "/api/agent/current/snapshot",
      preview: { method: "POST", href: "/api/agent/current/actions/preview" },
      apply: { method: "POST", href: "/api/agent/current/actions/apply" },
      validation: { method: "POST", href: "/api/agent/current/validation/run" },
      presence: { method: "POST", href: "/api/agent/current/presence" },
      events: "/api/agent/current/events?after=0",
      comments: "/api/agent/current/comments",
      suggestions: "/api/agent/current/suggestions",
      docs: "/agent-docs",
    },
  };
}
