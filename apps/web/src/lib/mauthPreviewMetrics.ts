import type {
  MauthPreviewRenderedMetrics,
  MauthPreviewTargetInspection,
  MauthRenderedPreviewAnchorMetrics,
  MauthRenderedPreviewPageMetrics,
  MauthRenderedPreviewRect,
} from "./mauthAssistantTools.ts";

const ANCHOR_SELECTOR = "[data-scroll-anchor]";
const PAGE_SELECTOR = ".a4-page";
const RENDERED_ANCHOR_LIMIT = 240;
const COMPACT_TEXT_LENGTH = 180;

function compactText(value: string, maxLength = COMPACT_TEXT_LENGTH) {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length <= maxLength ? compacted : `${compacted.slice(0, maxLength - 1)}...`;
}

function roundMetric(value: number) {
  return Math.round(value * 10) / 10;
}

function rectMetrics(rect: DOMRect, origin?: DOMRect): MauthRenderedPreviewRect {
  const left = origin ? rect.left - origin.left : rect.left;
  const top = origin ? rect.top - origin.top : rect.top;
  const width = rect.width;
  const height = rect.height;
  return {
    left: roundMetric(left),
    top: roundMetric(top),
    right: roundMetric(left + width),
    bottom: roundMetric(top + height),
    width: roundMetric(width),
    height: roundMetric(height),
    x: roundMetric(left),
    y: roundMetric(top),
  };
}

function visibleElement(element: HTMLElement) {
  if (element.closest(".a4-measure")) return false;
  if (!element.getClientRects().length) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function parseRenderedAnchorKind(anchor: string): MauthPreviewTargetInspection["kind"] {
  if (anchor === "front-matter") return "frontMatter";
  if (anchor.startsWith("pb:")) return "pageBreak";
  const [questionSegment, ...segments] = anchor.split("/");
  if (!questionSegment?.startsWith("q:")) return "unknown";

  let hasPart = false;
  let hasSubpart = false;
  let hasBlock = false;
  for (const segment of segments) {
    if (segment.startsWith("p:")) hasPart = true;
    if (segment.startsWith("s:")) hasSubpart = true;
    if (segment.startsWith("b:")) hasBlock = true;
  }

  if (hasPart && hasSubpart && hasBlock) return "subpartBlock";
  if (hasPart && hasSubpart) return "subpart";
  if (hasPart && hasBlock) return "partBlock";
  if (hasPart) return "part";
  if (hasBlock) return "questionBlock";
  return "question";
}

function metricElementVisible(element: Element) {
  if (!element.getClientRects().length) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function collisionArea(a: DOMRect, b: DOMRect) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function countLikelyLabelCollisions(diagramRoot: HTMLElement) {
  const selectors = "svg text, .jxg-latex-label, mjx-container[jax='SVG']";
  const rawCandidates = Array.from(diagramRoot.querySelectorAll<Element>(selectors)).filter((element) => {
    const text = compactText(element.textContent ?? "", 40);
    const rect = element.getBoundingClientRect();
    return Boolean(text) && metricElementVisible(element) && rect.width > 4 && rect.height > 4;
  });
  const candidates = rawCandidates.filter(
    (candidate, index) => !rawCandidates.some((other, otherIndex) => otherIndex !== index && other.contains(candidate)),
  );
  const rects = candidates.map((candidate) => candidate.getBoundingClientRect());
  let collisions = 0;
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      if (collisionArea(rects[i], rects[j]) > 8) collisions += 1;
    }
  }
  return collisions;
}

function anchorRole(element: HTMLElement): MauthRenderedPreviewAnchorMetrics["role"] {
  if (element.getAttribute("data-preview-module-anchor") === "true") return "module";
  if (element.getAttribute("data-preview-structure-anchor") === "true") return "structure";
  return "unknown";
}

function pageMetrics(page: HTMLElement, pageIndex: number, anchors: HTMLElement[]): MauthRenderedPreviewPageMetrics {
  const content = page.querySelector<HTMLElement>(".a4-page-content") ?? page;
  const contentRect = content.getBoundingClientRect();
  const totalHeight = contentRect.height;
  const pageAnchors = anchors.filter((anchor) => page.contains(anchor));
  const usedBottom = pageAnchors.reduce((bottom, anchor) => {
    const rect = anchor.getBoundingClientRect();
    return Math.max(bottom, rect.bottom - contentRect.top);
  }, 0);
  const usedHeight = Math.max(0, Math.min(usedBottom, totalHeight));
  const overflow = page.scrollHeight > page.clientHeight + 1 || usedBottom > totalHeight + 1;
  return {
    pageIndex,
    pageNumber: pageIndex + 1,
    usedHeightPx: roundMetric(usedHeight),
    totalHeightPx: roundMetric(totalHeight),
    remainingHeightPx: roundMetric(Math.max(0, totalHeight - usedHeight)),
    usedPercent: totalHeight > 0 ? roundMetric((usedHeight / totalHeight) * 100) : 0,
    anchorCount: pageAnchors.length,
    overflow,
  };
}

function pageIndexForElement(element: HTMLElement, pages: readonly HTMLElement[]) {
  const page = element.closest<HTMLElement>(PAGE_SELECTOR);
  if (!page || page.closest(".a4-measure")) return { pageIndex: null, page: null };
  const pageIndex = pages.indexOf(page);
  return { pageIndex: pageIndex >= 0 ? pageIndex : null, page };
}

function findDiagramMetrics(element: HTMLElement): MauthRenderedPreviewAnchorMetrics["diagram"] {
  const diagramRoot =
    (element.matches(".test-diagram-wrap, .test-diagram-pair-diagram") ? element : null) ??
    element.querySelector<HTMLElement>(".test-diagram-wrap, .test-diagram-pair-diagram, .penrose-diagram, .js-plotly-plot, .jxgbox");
  if (!diagramRoot) return undefined;

  const text = compactText(diagramRoot.textContent ?? "", 120);
  const errorMatch = text.match(/(?:diagram|chart|graph) could not render|no image selected/i);
  const renderedGraphic = Boolean(diagramRoot.querySelector("svg, canvas, img, .penrose-diagram, .js-plotly-plot, .jxgbox"));
  const rect = diagramRoot.getBoundingClientRect();
  const clipped = diagramRoot.scrollWidth > diagramRoot.clientWidth + 1 || diagramRoot.scrollHeight > diagramRoot.clientHeight + 1;
  const tooSmall = renderedGraphic && !errorMatch && (rect.width < 80 || rect.height < 60);
  const labelCollisionCount = renderedGraphic && !errorMatch ? countLikelyLabelCollisions(diagramRoot) : 0;
  return {
    found: true,
    rendered: renderedGraphic && !errorMatch,
    ...(errorMatch ? { errorText: errorMatch[0] } : {}),
    viewportRect: rectMetrics(rect),
    ...(clipped ? { clipped: true } : {}),
    ...(tooSmall ? { tooSmall: true } : {}),
    ...(labelCollisionCount ? { labelCollisionCount } : {}),
  };
}

function findSolutionSlotMetrics(element: HTMLElement): MauthRenderedPreviewAnchorMetrics["solutionSlot"] {
  const slot = element.closest<HTMLElement>(".test-visibility-slot") ?? element.querySelector<HTMLElement>(".test-visibility-slot");
  if (!slot) return undefined;
  const [studentCopy, solutionCopy] = Array.from(slot.querySelectorAll<HTMLElement>(".test-visibility-slot-copy"));
  if (!studentCopy || !solutionCopy) return undefined;
  const studentHeight = studentCopy.getBoundingClientRect().height;
  const solutionHeight = solutionCopy.getBoundingClientRect().height;
  const warningText = compactText(slot.querySelector<HTMLElement>(".test-visibility-slot-warning")?.textContent ?? "");
  return {
    found: true,
    studentHeightPx: roundMetric(studentHeight),
    solutionHeightPx: roundMetric(solutionHeight),
    solutionFitsStudentSpace: solutionHeight <= studentHeight + 2,
    ...(warningText ? { warningText } : {}),
  };
}

function findResponseSpaceMetrics(element: HTMLElement): MauthRenderedPreviewAnchorMetrics["responseSpace"] {
  const slot =
    element.closest<HTMLElement>(".test-diagram-response-slot") ?? element.querySelector<HTMLElement>(".test-diagram-response-slot");
  if (!slot) return undefined;
  const diagram = slot.querySelector<HTMLElement>(".test-diagram-pair-diagram");
  const space = slot.querySelector<HTMLElement>(".test-diagram-response-space");
  return {
    found: true,
    outlineAvailable: Boolean(slot.querySelector(".test-diagram-response-outline path")),
    slotRect: rectMetrics(slot.getBoundingClientRect()),
    ...(diagram ? { diagramRect: rectMetrics(diagram.getBoundingClientRect()) } : {}),
    ...(space ? { spaceRect: rectMetrics(space.getBoundingClientRect()) } : {}),
  };
}

function anchorMetrics(
  element: HTMLElement,
  pages: readonly HTMLElement[],
  activeAnchor?: string | null,
): MauthRenderedPreviewAnchorMetrics | null {
  const anchor = element.getAttribute("data-scroll-anchor");
  if (!anchor || !visibleElement(element)) return null;

  const rect = element.getBoundingClientRect();
  const { pageIndex, page } = pageIndexForElement(element, pages);
  const diagram = findDiagramMetrics(element);
  const solutionSlot = findSolutionSlotMetrics(element);
  const responseSpace = findResponseSpaceMetrics(element);
  const warnings: MauthRenderedPreviewAnchorMetrics["warnings"] = [];

  if (diagram?.found && !diagram.rendered) {
    warnings.push({
      code: "rendered-diagram-failed",
      severity: "error",
      anchor,
      message: diagram.errorText
        ? `The selected diagram failed to render: ${diagram.errorText}.`
        : "The selected diagram failed to render.",
    });
  }
  if (diagram?.found && diagram.rendered && diagram.clipped) {
    warnings.push({
      code: "rendered-diagram-clipped",
      severity: "warning",
      anchor,
      message: "The selected diagram appears clipped inside its rendered container.",
    });
  }
  if (diagram?.found && diagram.rendered && diagram.labelCollisionCount) {
    warnings.push({
      code: "rendered-diagram-label-collision",
      severity: "warning",
      anchor,
      message: `The selected diagram has ${diagram.labelCollisionCount} likely overlapping label pair${
        diagram.labelCollisionCount === 1 ? "" : "s"
      }.`,
    });
  }
  if (diagram?.found && diagram.rendered && diagram.tooSmall) {
    warnings.push({
      code: "rendered-diagram-too-small",
      severity: "info",
      anchor,
      message: "The selected diagram rendered very small compared with normal test-diagram size.",
    });
  }
  if (diagram?.found && diagram.rendered && diagram.viewportRect && page) {
    const pageRect = page.getBoundingClientRect();
    const diagramRect = diagram.viewportRect;
    if (
      diagramRect.left < pageRect.left - 1 ||
      diagramRect.right > pageRect.right + 1 ||
      diagramRect.top < pageRect.top - 1 ||
      diagramRect.bottom > pageRect.bottom + 1
    ) {
      warnings.push({
        code: "rendered-diagram-clipped-by-page",
        severity: "warning",
        anchor,
        message: "The selected diagram extends outside the rendered A4 page box.",
      });
    }
    if (diagramRect.width > pageRect.width * 0.95 || diagramRect.height > pageRect.height * 0.8) {
      diagram.tooLarge = true;
      warnings.push({
        code: "rendered-diagram-too-large",
        severity: "info",
        anchor,
        message: "The selected diagram occupies almost the whole rendered page.",
      });
    }
  }
  if (solutionSlot?.found && !solutionSlot.solutionFitsStudentSpace) {
    warnings.push({
      code: "rendered-solution-space-overflow",
      severity: "warning",
      anchor,
      message: solutionSlot.warningText || "The rendered solution is taller than the paired student answer space.",
    });
  }
  if (responseSpace?.found && !responseSpace.outlineAvailable) {
    warnings.push({
      code: "rendered-response-space-outline-missing",
      severity: "warning",
      anchor,
      message: "A diagram-plus-answer-space layout was rendered without an L-shaped response outline.",
    });
  }

  return {
    anchor,
    kind: parseRenderedAnchorKind(anchor),
    role: anchorRole(element),
    pageIndex,
    ...(pageIndex !== null ? { pageNumber: pageIndex + 1 } : {}),
    selected: element.getAttribute("data-preview-selected") === "true" || activeAnchor === anchor,
    viewportRect: rectMetrics(rect),
    ...(page ? { pageRelativeRect: rectMetrics(rect, page.getBoundingClientRect()) } : {}),
    textPreview: compactText(element.textContent ?? ""),
    ...(diagram ? { diagram } : {}),
    ...(solutionSlot ? { solutionSlot } : {}),
    ...(responseSpace ? { responseSpace } : {}),
    warnings,
  };
}

export function collectRenderedPreviewMetrics(container: HTMLElement | null, activeAnchor?: string | null): MauthPreviewRenderedMetrics {
  if (!container) {
    return {
      available: false,
      reason: "The preview pane is not mounted.",
    };
  }

  const pages = Array.from(container.querySelectorAll<HTMLElement>(PAGE_SELECTOR)).filter((page) => !page.closest(".a4-measure"));
  const anchorElements = Array.from(container.querySelectorAll<HTMLElement>(ANCHOR_SELECTOR))
    .filter(visibleElement)
    .slice(0, RENDERED_ANCHOR_LIMIT);
  const pageSummaries = pages.map((page, pageIndex) => pageMetrics(page, pageIndex, anchorElements));
  const anchors = anchorElements
    .map((element) => anchorMetrics(element, pages, activeAnchor))
    .filter((metric): metric is MauthRenderedPreviewAnchorMetrics => Boolean(metric));
  const warnings = [
    ...pageSummaries
      .filter((page) => page.overflow)
      .map((page) => ({
        code: "rendered-page-overflow",
        severity: "warning" as const,
        message: `Preview page ${page.pageNumber} appears to overflow its A4 page box.`,
      })),
    ...anchors.flatMap((anchor) => anchor.warnings),
  ];

  return {
    available: true,
    source: "browser-preview",
    activeAnchor: activeAnchor ?? null,
    pageCount: pages.length,
    pages: pageSummaries,
    anchors,
    warnings,
  };
}
