export const SCROLL_ANCHOR_FRONT_MATTER = "front-matter";
export const SCROLL_ANCHOR_TOP_OFFSET_PX = 12;
export const SCROLL_ANCHOR_SELECTOR = "[data-scroll-anchor]";

export interface ScrollAnchorPosition {
  anchor: string;
  progress: number;
}

export type ParsedScrollAnchorKind =
  | "frontMatter"
  | "sectionHeading"
  | "pageBreak"
  | "question"
  | "questionBlock"
  | "columnBlock"
  | "part"
  | "partBlock"
  | "subpart"
  | "subpartBlock"
  | "unknown";

export interface ScrollAnchorColumnPathEntry {
  columnIndex: number;
  blockId: string;
}

export type ScrollAnchorColumnPath = ScrollAnchorColumnPathEntry[];

export interface ParsedScrollAnchor {
  kind: ParsedScrollAnchorKind;
  sectionHeadingId?: string;
  questionId?: string;
  partId?: string;
  subpartId?: string;
  blockId?: string;
  rootBlockId?: string;
  columnPath?: ScrollAnchorColumnPath;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function scrollableRange(element: HTMLElement) {
  const maxScroll = element.scrollHeight - element.clientHeight;
  return Math.max(0, maxScroll);
}

export function questionScrollAnchor(questionId: string) {
  return `q:${questionId}`;
}

export function sectionHeadingScrollAnchor(sectionHeadingId: string) {
  return `sh:${sectionHeadingId}`;
}

export function pageBreakScrollAnchor(questionId: string) {
  return `pb:${questionId}`;
}

export function questionBlockScrollAnchor(questionId: string, blockId: string) {
  return `${questionScrollAnchor(questionId)}/b:${blockId}`;
}

export function partScrollAnchor(questionId: string, partId: string) {
  return `${questionScrollAnchor(questionId)}/p:${partId}`;
}

export function partBlockScrollAnchor(questionId: string, partId: string, blockId: string) {
  return `${partScrollAnchor(questionId, partId)}/b:${blockId}`;
}

export function subpartScrollAnchor(questionId: string, partId: string, subpartId: string) {
  return `${partScrollAnchor(questionId, partId)}/s:${subpartId}`;
}

export function subpartBlockScrollAnchor(questionId: string, partId: string, subpartId: string, blockId: string) {
  return `${subpartScrollAnchor(questionId, partId, subpartId)}/b:${blockId}`;
}

export function columnChildScrollAnchor(containerAnchor: string, columnIndex: number, blockId: string) {
  return `${containerAnchor}/c:${columnIndex}/b:${blockId}`;
}

export function columnPathScrollAnchor(containerAnchor: string, path: ScrollAnchorColumnPath) {
  return path.reduce((anchor, entry) => columnChildScrollAnchor(anchor, entry.columnIndex, entry.blockId), containerAnchor);
}

export function columnBlockParentScrollAnchor(anchor: string) {
  return anchor.replace(/\/c:\d+\/b:[^/]+$/, "");
}

export function graphChildParentScrollAnchor(anchor: string) {
  const parentAnchor = anchor.replace(/\/g(?:f|feat|pt|seg|arc|ang|dec):\d+$/, "");
  return parentAnchor === anchor ? null : parentAnchor;
}

export function scrollAnchorContains(containerAnchor: string, targetAnchor?: string | null) {
  return Boolean(targetAnchor && (targetAnchor === containerAnchor || targetAnchor.startsWith(`${containerAnchor}/`)));
}

export function previewSelectionAttr(anchor: string | undefined, activeAnchor?: string) {
  return anchor && activeAnchor === anchor ? "true" : undefined;
}

export function questionIdFromScrollAnchor(anchor: string) {
  const [questionSegment] = anchor.split("/");
  return questionSegment?.startsWith("q:") ? questionSegment.slice(2) : "";
}

export function sectionHeadingIdFromScrollAnchor(anchor: string) {
  return anchor.startsWith("sh:") ? anchor.slice(3) : "";
}

export function pageBreakQuestionIdFromScrollAnchor(anchor: string) {
  return anchor.startsWith("pb:") ? anchor.slice(3) : "";
}

export function scrollAnchorFallbacks(anchor: string) {
  const fallbacks: string[] = [];
  const parts = anchor.split("/");
  while (parts.length) {
    fallbacks.push(parts.join("/"));
    parts.pop();
  }
  return fallbacks;
}

export function previewAnchorForEditorAnchor<TocItem extends { id: string; editorAnchor: string; previewAnchor: string }>(
  anchor: string,
  tocItems: readonly TocItem[],
) {
  const previewCandidate = graphChildParentScrollAnchor(anchor) ?? anchor;
  const tocItem = tocItems.find((item) => item.id === previewCandidate || item.editorAnchor === previewCandidate);
  return tocItem?.previewAnchor ?? previewCandidate;
}

export function scrollAnchorValue(element: HTMLElement) {
  return element.getAttribute("data-scroll-anchor");
}

export function previewAnchorFromEventTarget(target: EventTarget | null, container: HTMLElement | null) {
  if (!container || !(target instanceof Element)) return "";
  if (target.closest("a, button, input, textarea, select, [contenteditable='true'], [data-preview-click-ignore]")) return "";

  const moduleAnchorElement = target.closest<HTMLElement>("[data-preview-module-anchor='true']");
  if (moduleAnchorElement && container.contains(moduleAnchorElement)) return scrollAnchorValue(moduleAnchorElement) ?? "";

  const anchorElement = target.closest<HTMLElement>("[data-preview-structure-anchor='true']");
  if (!anchorElement || !container.contains(anchorElement)) return "";
  return scrollAnchorValue(anchorElement) ?? "";
}

export function parseScrollAnchor(anchor: string): ParsedScrollAnchor {
  if (anchor === SCROLL_ANCHOR_FRONT_MATTER) return { kind: "frontMatter" };
  if (anchor.startsWith("sh:")) return { kind: "sectionHeading", sectionHeadingId: sectionHeadingIdFromScrollAnchor(anchor) };
  if (anchor.startsWith("pb:")) return { kind: "pageBreak", questionId: pageBreakQuestionIdFromScrollAnchor(anchor) };

  const [questionSegment, ...segments] = anchor.split("/");
  if (!questionSegment?.startsWith("q:")) return { kind: "unknown" };

  const parsed: ParsedScrollAnchor = {
    kind: "question",
    questionId: questionSegment.slice(2),
  };
  const columnPath: ScrollAnchorColumnPath = [];
  let pendingColumnIndex: number | null = null;

  for (const segment of segments) {
    if (segment.startsWith("p:")) parsed.partId = segment.slice(2);
    if (segment.startsWith("s:")) parsed.subpartId = segment.slice(2);
    if (segment.startsWith("c:")) {
      const columnIndex = Number(segment.slice(2));
      pendingColumnIndex = Number.isInteger(columnIndex) && columnIndex >= 0 ? columnIndex : null;
    }
    if (segment.startsWith("b:")) {
      const blockId = segment.slice(2);
      if (!parsed.rootBlockId) parsed.rootBlockId = blockId;
      if (pendingColumnIndex !== null) {
        columnPath.push({ columnIndex: pendingColumnIndex, blockId });
        pendingColumnIndex = null;
      }
      parsed.blockId = blockId;
    }
  }

  if (columnPath.length) return { ...parsed, kind: "columnBlock", columnPath };
  if (parsed.partId && parsed.subpartId && parsed.blockId) return { ...parsed, kind: "subpartBlock" };
  if (parsed.partId && parsed.subpartId) return { ...parsed, kind: "subpart" };
  if (parsed.partId && parsed.blockId) return { ...parsed, kind: "partBlock" };
  if (parsed.partId) return { ...parsed, kind: "part" };
  if (parsed.blockId) return { ...parsed, kind: "questionBlock" };
  return parsed;
}
