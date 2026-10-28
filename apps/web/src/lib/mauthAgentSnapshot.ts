import type {
  ContentBlock,
  MauthAgentFileState,
  MauthAgentModuleSummary,
  MauthAgentOpenDocument,
  MauthAgentPartSummary,
  MauthAgentQuestionSummary,
  MauthAgentSnapshot,
  MauthAgentSubpartSummary,
} from "@mauth-studio/shared";
import {
  DIAGRAM_TOOLS_URI,
  diagramIntentFromText,
  diagramToolSummary,
  diagramToolGuide,
} from "../../../../packages/shared/src/diagramTools.ts";
import { investigationTotalMarks, normalizeInvestigation } from "./frontMatterConfig.ts";
import { tableSolutionEntryCount } from "./tableSolutionEntries.ts";

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
  activeDocumentId?: string | null;
  openDocuments?: MauthAgentOpenDocument[];
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

function summarizeBlock(block: ContentBlock, context: string[] = []): MauthAgentModuleSummary {
  const summary: MauthAgentModuleSummary = {
    id: block.id,
    kind: block.kind,
    visibility: blockVisibility(block),
    marks: block.markTicks,
  };

  if (block.kind === "text") {
    summary.textPreview = compactText(block.text);
  }
  if (block.kind === "choices") {
    summary.choiceCount = block.choices.length;
    summary.solutionAnswerIndex = block.solutionAnswerIndex;
    summary.textPreview = compactText(block.choices.join(" | "));
  }
  if (block.kind === "table") {
    summary.rowCount = block.rows.length;
    summary.columnCount = Math.max(block.headers.length, ...block.rows.map((row) => row.length));
    summary.solutionEntryCount = tableSolutionEntryCount(block);
    summary.textPreview = compactText([...block.headers, ...block.rows.flat()].join(" | "));
  }
  if (block.kind === "diagram") {
    summary.graphType = block.graphConfig.type;
    summary.diagramTool = diagramToolSummary(block.graphConfig.type);
    const contextText = context.find((text) => diagramIntentFromText(text)) ?? context[0] ?? "";
    const guide = diagramToolGuide(contextText, block.graphConfig.type, false, {}, Boolean(block.graphConfig.options?.substanceSource));
    const assessment = guide.assessment;
    summary.diagramAssessment = {
      status: assessment.status,
      confidence: assessment.confidence,
      reviewRequired: assessment.reviewRequired,
      uncertainty: assessment.uncertainty,
      verification: assessment.verification,
      authoringMode: assessment.selectedToolAssessment?.authoringMode,
      limitations: assessment.selectedToolAssessment?.limitations ?? [],
      alternatives: assessment.alternatives.slice(0, 3).map(({ id, eligible, missingFeatures }) => ({ id, eligible, missingFeatures })),
    };
    if (guide.recommendation) {
      summary.recommendedDiagramTool = guide.recommendation;
      if (summary.diagramTool.id !== guide.recommendation.id) {
        summary.diagramWarnings = [
          {
            code: "diagram-renderer-mismatch",
            targetId: block.id,
            message: `This diagram uses ${summary.diagramTool.label}. Recommended: ${guide.recommendation.label}. ${guide.recommendation.reason} Review the requirements before changing tools; renderer schemas are not automatically converted.`,
          },
        ];
      }
    }
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
    summary.childModules = block.columns.flatMap((column) => column.map((child) => summarizeBlock(child, context)));
  }

  return summary;
}

function summarizeSubpart(subpart: MauthSubpartLike, parentContext: string[]): MauthAgentSubpartSummary {
  const context = [subpart.text ?? "", ...parentContext];
  return {
    id: subpart.id,
    label: subpart.label,
    marks: subpart.marks,
    textPreview: compactText(subpart.text),
    pageBreakBefore: subpart.pageBreakBefore,
    modules: subpart.contentBlocks.map((block) => summarizeBlock(block, context)),
  };
}

function summarizePart(part: MauthPartLike, parentContext: string[]): MauthAgentPartSummary {
  const context = [part.text ?? "", ...parentContext];
  return {
    id: part.id,
    label: part.label,
    marks: part.marks,
    textPreview: compactText(part.text),
    pageBreakBefore: part.pageBreakBefore,
    modules: part.contentBlocks.map((block) => summarizeBlock(block, context)),
    subparts: (part.subparts ?? []).map((subpart) => summarizeSubpart(subpart, context)),
  };
}

function summarizeQuestion(question: MauthQuestionLike, index: number): MauthAgentQuestionSummary {
  const context = [question.text ?? ""];
  return {
    id: question.id,
    label: `Question ${index + 1}`,
    marks: question.marks,
    textPreview: compactText(question.text),
    pageBreakAfter: question.pageBreakAfter,
    modules: question.contentBlocks.map((block) => summarizeBlock(block, context)),
    parts: (question.parts ?? []).map((part) => summarizePart(part, context)),
  };
}

function diagramWarnings(modules: MauthAgentModuleSummary[]): NonNullable<MauthAgentModuleSummary["diagramWarnings"]> {
  return modules.flatMap((module) => [...(module.diagramWarnings ?? []), ...diagramWarnings(module.childModules ?? [])]);
}

function subpartTotalMarks(subparts: MauthSubpartLike[] | undefined) {
  return (subparts ?? []).reduce((total, subpart) => total + Math.max(0, Number(subpart.marks) || 0), 0);
}

function partTotalMarks(part: MauthPartLike) {
  const subparts = part.subparts ?? [];
  return subparts.length ? subpartTotalMarks(subparts) : Math.max(0, Number(part.marks) || 0);
}

function questionTotalMarks(question: MauthQuestionLike) {
  const parts = question.parts ?? [];
  return parts.length ? parts.reduce((total, part) => total + partTotalMarks(part), 0) : Math.max(0, Number(question.marks) || 0);
}

function documentTotalMarks<Q extends MauthQuestionLike, F extends object, C extends object>(document: MauthDocumentLike<Q, F, C>) {
  const frontMatter = document.frontMatter as Record<string, unknown>;
  if (frontMatter.titlePageTemplate === "investigation") {
    return investigationTotalMarks(normalizeInvestigation(frontMatter.investigation));
  }
  return document.questions.reduce((total, question) => total + questionTotalMarks(question), 0);
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
      activeDocumentId: input.activeDocumentId,
      frontMatter: input.document.frontMatter,
      formattingConfig: input.document.formattingConfig,
      sectionHeadings: input.document.sectionHeadings,
      documentFlow: input.document.documentFlow,
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
  const questionLabels = new Map(questions.map((question) => [question.id, question.label]));
  const sectionHeadings = (input.document.sectionHeadings ?? []).map((heading) => ({
    id: heading.id,
    title: heading.title,
    ...(heading.titlePage ? { titlePage: heading.titlePage } : {}),
  }));
  const sectionHeadingTitles = new Map(sectionHeadings.map((heading) => [heading.id, heading.title]));
  const documentFlow =
    input.document.documentFlow?.map((item) =>
      item.kind === "sectionHeading"
        ? { kind: item.kind, id: item.id, title: sectionHeadingTitles.get(item.id) }
        : { kind: item.kind, id: item.id, label: questionLabels.get(item.id) },
    ) ?? questions.map((question) => ({ kind: "question" as const, id: question.id, label: question.label }));

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
    activeDocumentId: input.activeDocumentId,
    openDocuments: input.openDocuments,
    frontMatter: input.document.frontMatter as Record<string, unknown>,
    formattingConfig: input.document.formattingConfig as Record<string, unknown> | undefined,
    sectionHeadings,
    documentFlow,
    questions,
    questionCount: questions.length,
    totalMarks: documentTotalMarks(input.document),
    validation: input.validation,
    warnings: [
      ...(input.warnings ?? []),
      ...questions.flatMap((question) => [
        ...diagramWarnings(question.modules),
        ...question.parts.flatMap((part) => [
          ...diagramWarnings(part.modules),
          ...part.subparts.flatMap((subpart) => diagramWarnings(subpart.modules)),
        ]),
      ]),
    ],
    diagramTools: { catalogUri: DIAGRAM_TOOLS_URI, lookupTool: "mauth_diagram_tools", tools: diagramToolGuide().tools },
    _links: {
      snapshot: "/api/agent/current/snapshot",
      preview: { method: "POST", href: "/api/agent/current/actions/preview" },
      apply: { method: "POST", href: "/api/agent/current/actions/apply" },
      validation: { method: "POST", href: "/api/agent/current/validation/run" },
      documents: { method: "GET", href: "/api/agent/current/documents" },
      documentCreate: { method: "POST", href: "/api/agent/current/documents/create" },
      documentOpen: { method: "POST", href: "/api/agent/current/documents/open" },
      documentClose: { method: "POST", href: "/api/agent/current/documents/close" },
      presence: { method: "POST", href: "/api/agent/current/presence" },
      events: "/api/agent/current/events?after=0",
      comments: "/api/agent/current/comments",
      suggestions: "/api/agent/current/suggestions",
      docs: "/agent-docs",
    },
  };
}
