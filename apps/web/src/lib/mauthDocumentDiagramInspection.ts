import type { ContentBlock } from "@mauth-studio/shared";
import { diagramToolGuide } from "../../../../packages/shared/src/diagramTools.ts";
import type { DiagramRequirements } from "../../../../packages/shared/src/diagramCapabilities.ts";
import type { MauthQuestionLike } from "./mauthActions.ts";
import { inspectMauthDiagram } from "./mauthDiagramInspection.ts";
import { validateMauthDiagramConfig } from "./mauthDiagramValidation.ts";

type Diagram = Extract<ContentBlock, { kind: "diagram" }>;
export function inspectDocumentDiagrams(
  document: { questions: MauthQuestionLike[]; frontMatter?: object },
  options: { blockId?: string; requirements?: DiagramRequirements } = {},
  rendered?: (id: string) => unknown,
) {
  const entries: Array<{ block: Diagram; context: string }> = [];
  function blocks(items: ContentBlock[], context: string) {
    for (const block of items) {
      if (block.kind === "diagram") entries.push({ block, context });
      if (block.kind === "columns") block.columns.forEach((column) => blocks(column, context));
    }
  }
  for (const question of document.questions) {
    blocks(question.contentBlocks, question.text ?? "");
    for (const part of question.parts ?? []) {
      const context = [question.text, part.text].filter(Boolean).join("\n");
      blocks(part.contentBlocks, context);
      for (const subpart of part.subparts ?? []) blocks(subpart.contentBlocks, [context, subpart.text].filter(Boolean).join("\n"));
    }
  }
  const investigation = (
    document.frontMatter as
      | { investigation?: { diagrams?: Array<{ id: string; caption?: string; graphConfig: Diagram["graphConfig"] }> } }
      | undefined
  )?.investigation;
  for (const diagram of investigation?.diagrams ?? [])
    entries.push({ block: { id: diagram.id, kind: "diagram", graphConfig: diagram.graphConfig }, context: diagram.caption ?? "" });
  return entries
    .filter(({ block }) => !options.blockId || block.id === options.blockId)
    .map(({ block, context }) => {
      const schemaIssues: Parameters<typeof validateMauthDiagramConfig>[2] = [];
      validateMauthDiagramConfig(JSON.parse(JSON.stringify(block.graphConfig)), "graphConfig", schemaIssues);
      return {
        blockId: block.id,
        tool: diagramToolGuide(
          context,
          block.graphConfig.type,
          false,
          options.requirements,
          Boolean(block.graphConfig.options?.substanceSource),
        ).assessment,
        construction: {
          schemaValid: schemaIssues.length === 0,
          schemaIssues,
          semantic: inspectMauthDiagram(block.graphConfig, context, options.requirements),
          proofStatus: "notCertified",
          note: "These are deterministic schema/semantic checks, not a general mathematical proof or solver-residual certificate.",
        },
        renderedLayout: rendered?.(block.id) ?? { status: "notMeasured", note: "No rendered preview was inspected." },
      };
    });
}

export function inspectRenderedDiagram(blockId: string) {
  const pane = document.querySelector(".preview-pane");
  const anchor = [...(pane?.querySelectorAll<HTMLElement>("[data-scroll-anchor]") ?? [])].find(
    (node) =>
      node.dataset.scrollAnchor?.split("/").some((part) => part === `b:${blockId}` || part === `id:${blockId}`) &&
      node.getClientRects().length > 0 &&
      !node.closest(".a4-measure, .test-visibility-slot-copy-hidden"),
  );
  const diagram = anchor?.querySelector<HTMLElement>(".penrose-diagram, .jxgbox, .stats-chart-diagram, [data-mauth-print-render-state]");
  if (!diagram)
    return {
      status: "notRendered",
      copy: "currentPreviewOnly",
      issues: [],
      note: "Open the target preview and wait for rendering; an absent diagram is not a passed layout check.",
    };
  const state = diagram.getAttribute("data-mauth-print-render-state");
  if (state && state !== "ready") return { status: state, copy: "currentPreviewOnly", issues: [] };
  const frame = diagram.getBoundingClientRect();
  const labels: Element[] = [...diagram.querySelectorAll("[data-mauth-label-role], svg text")];
  for (const title of diagram.querySelectorAll("title"))
    if (/\.(labelText|text)$/.test(title.textContent ?? "") && title.parentElement) labels.push(title.parentElement);
  const boxes = labels
    .map((node) => ({ label: node.textContent?.trim().slice(0, 100), box: node.getBoundingClientRect() }))
    .filter(({ box }) => box.width > 2 && box.height > 2);
  const issues: Array<{ code: string; labels: Array<string | undefined> }> = [];
  for (let i = 0; i < boxes.length; i++) {
    const { box, label } = boxes[i];
    if (box.left < frame.left - 2 || box.right > frame.right + 2 || box.top < frame.top - 2 || box.bottom > frame.bottom + 2)
      issues.push({ code: "label-clipped", labels: [label] });
    for (let j = i + 1; j < boxes.length; j++) {
      const other = boxes[j].box;
      if (
        Math.min(box.right, other.right) - Math.max(box.left, other.left) > 2 &&
        Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 2
      )
        issues.push({ code: "label-collision", labels: [label, boxes[j].label] });
    }
  }
  return {
    status: boxes.length ? "measured" : "partial",
    copy: "currentPreviewOnly",
    checks: ["renderReadiness", "labelBounds", "labelCollisions"],
    labelCount: boxes.length,
    labels: [...diagram.querySelectorAll<HTMLElement>("[data-mauth-penrose-label]")].map((node) => ({
      id: node.dataset.mauthPenroseLabel,
      offset: [Number(node.dataset.labelOffsetX) || 0, Number(node.dataset.labelOffsetY) || 0],
    })),
    issues,
    note: "Measurements cover this mounted preview only. Inspect fresh Student and Solutions copies and visually review geometry/page flow; a clean measurement is not a complete layout certificate.",
  };
}
