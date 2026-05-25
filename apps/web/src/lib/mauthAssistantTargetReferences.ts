const MAUTH_REFERENCE_TOKEN_PATTERN = /@mauth\[([^\]\s]{1,240})\]/g;
const MAUTH_ANCHOR_PATTERN =
  /^(?:front-matter|pb:[A-Za-z0-9_.:-]+|q:[A-Za-z0-9_.:-]+(?:\/(?:p|s|b|c|gf|gfeat|gpt|gseg|garc|gang|gdec):[A-Za-z0-9_.:-]+)*)$/;
const GRAPH_CHILD_ANCHOR_PATTERN = /\/(?:gf|gfeat|gpt|gseg|garc|gang|gdec):\d+$/;

export function isMauthTargetReferenceAnchor(anchor: string) {
  return MAUTH_ANCHOR_PATTERN.test(anchor);
}

export function mauthTargetReferenceParentAnchor(anchor: string) {
  const parentAnchor = anchor.replace(GRAPH_CHILD_ANCHOR_PATTERN, "");
  return parentAnchor === anchor ? null : parentAnchor;
}

export function mauthTargetReferenceModuleAnchor(anchor: string) {
  return mauthTargetReferenceParentAnchor(anchor) ?? anchor;
}

export function extractMauthTargetReferences(text: string): string[] {
  const anchors: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(MAUTH_REFERENCE_TOKEN_PATTERN)) {
    const anchor = match[1];
    if (!anchor || !isMauthTargetReferenceAnchor(anchor) || seen.has(anchor)) continue;
    seen.add(anchor);
    anchors.push(anchor);
  }
  return anchors;
}

export function firstMauthTargetReference(text: string) {
  return extractMauthTargetReferences(text)[0] ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
}

function compactWarnings(value: unknown) {
  return asRecordArray(value)
    .slice(0, 8)
    .map((warning) => ({
      code: typeof warning.code === "string" ? warning.code : "",
      severity: typeof warning.severity === "string" ? warning.severity : "",
      message: typeof warning.message === "string" ? warning.message : "",
      anchor: typeof warning.anchor === "string" ? warning.anchor : undefined,
      targetId: typeof warning.targetId === "string" ? warning.targetId : undefined,
    }));
}

function compactAssistantTargetBlock(value: unknown) {
  const block = asRecord(value);
  if (!block) return null;
  return {
    id: typeof block.id === "string" ? block.id : "",
    kind: typeof block.kind === "string" ? block.kind : "",
    anchor: typeof block.anchor === "string" ? block.anchor : "",
    owner: typeof block.owner === "string" ? block.owner : "",
    visibility: typeof block.visibility === "string" ? block.visibility : "",
    textPreview: typeof block.textPreview === "string" ? block.textPreview : undefined,
    diagramType: typeof block.diagramType === "string" ? block.diagramType : undefined,
    lines: typeof block.lines === "number" ? block.lines : undefined,
  };
}

function compactAssistantTargetDiagram(value: unknown) {
  const diagram = asRecord(value);
  if (!diagram) return null;
  const rendered = asRecord(diagram.rendered);
  return {
    id: typeof diagram.id === "string" ? diagram.id : "",
    anchor: typeof diagram.anchor === "string" ? diagram.anchor : "",
    graphType: typeof diagram.graphType === "string" ? diagram.graphType : "",
    align: typeof diagram.align === "string" ? diagram.align : undefined,
    textSide: typeof diagram.textSide === "string" ? diagram.textSide : undefined,
    visibility: typeof diagram.visibility === "string" ? diagram.visibility : undefined,
    summary: asRecord(diagram.summary) ?? null,
    warnings: compactWarnings(diagram.warnings),
    rendered: rendered
      ? {
          available: typeof rendered.available === "boolean" ? rendered.available : undefined,
          rendered: typeof rendered.rendered === "boolean" ? rendered.rendered : undefined,
          errorText: typeof rendered.errorText === "string" ? rendered.errorText : undefined,
          warnings: compactWarnings(rendered.warnings),
        }
      : undefined,
  };
}

export function mauthTargetReferenceSummary(targetAnchor: string, previewData: unknown) {
  const preview = asRecord(previewData);
  const target = asRecord(preview?.target);
  const question = asRecord(preview?.question);
  const selectedBlock = compactAssistantTargetBlock(question?.selectedBlock);
  const diagrams = asRecordArray(question?.diagrams);
  const selectedDiagram = selectedBlock
    ? diagrams.find((diagram) => diagram.id === selectedBlock.id || diagram.anchor === selectedBlock.anchor)
    : undefined;

  return {
    source: "mauth-reference-token",
    activeAnchor: targetAnchor,
    moduleAnchor: mauthTargetReferenceModuleAnchor(targetAnchor),
    target: target ?? null,
    question: question
      ? {
          id: typeof question.id === "string" ? question.id : "",
          questionNumber: typeof question.questionNumber === "number" ? question.questionNumber : undefined,
          totalMarks: typeof question.totalMarks === "number" ? question.totalMarks : undefined,
        }
      : null,
    selectedBlock,
    selectedDiagram: compactAssistantTargetDiagram(selectedDiagram),
    warnings: compactWarnings(preview?.warnings),
  };
}

export function documentSummaryWithMauthTargetReference(
  documentSummary: Record<string, unknown>,
  targetAnchor: string,
  previewData: unknown,
) {
  return {
    ...documentSummary,
    assistantTargetReference: mauthTargetReferenceSummary(targetAnchor, previewData),
  };
}
