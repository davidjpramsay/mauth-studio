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

function rectDistance(left: DOMRect, right: DOMRect) {
  const dx = Math.max(0, Math.max(left.left, right.left) - Math.min(left.right, right.right));
  const dy = Math.max(0, Math.max(left.top, right.top) - Math.min(left.bottom, right.bottom));
  return Math.hypot(dx, dy);
}

function normalizedNumericLabel(value: string) {
  const normalized = value.trim().replace(/−/g, "-").replace(/\s+/g, "");
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? normalized : null;
}

function isDuplicateNumericTickCollision(leftText: string, rightText: string) {
  const left = normalizedNumericLabel(leftText);
  const right = normalizedNumericLabel(rightText);
  return Boolean(left && right && left === right);
}

function labelSearchText(value: string) {
  return compactText(
    value
      .replace(/\\+underset\s*\{\s*\\+sim\s*\}\s*\{\s*([^}]*)\s*\}/g, "$1")
      .replace(/\\+(?:mathbf|vec|overrightarrow|overleftrightarrow)\s*\{([^}]*)\}/g, "$1")
      .replace(/\\+(?:text|mathrm)\s*\{([^}]*)\}/g, "$1")
      .replace(/\\+(?:mathbf|vec|text|mathrm)\s+([A-Za-z0-9]+)/g, "$1")
      .replace(/\\+(?:left|right|displaystyle|textstyle)\b/g, "")
      .replace(/[{}$]/g, " ")
      .replace(/\\+[,;:! ]/g, " ")
      .replace(/\\+_/g, "_")
      .replace(/\\+/g, " "),
    40,
  );
}

function labelEntries(diagramRoot: HTMLElement) {
  const selectors = "[data-mauth-label-text], svg text, .annotation-text";
  const rawCandidates = Array.from(diagramRoot.querySelectorAll<Element>(selectors)).filter((element) => {
    const text = compactText(element.getAttribute("data-mauth-label-text") ?? element.textContent ?? "", 40);
    const rect = element.getBoundingClientRect();
    return Boolean(text) && metricElementVisible(element) && rect.width > 4 && rect.height > 4;
  });
  const candidates = rawCandidates.filter(
    (candidate, index) => !rawCandidates.some((other, otherIndex) => otherIndex !== index && other.contains(candidate)),
  );
  return candidates.map((candidate) => ({
    text: labelSearchText(candidate.getAttribute("data-mauth-label-text") ?? candidate.textContent ?? ""),
    role: candidate.getAttribute("data-mauth-label-role") ?? "",
    rect: candidate.getBoundingClientRect(),
  }));
}

function likelyLabelCollisions(diagramRoot: HTMLElement) {
  const entries = labelEntries(diagramRoot);
  const collisions: NonNullable<NonNullable<MauthRenderedPreviewAnchorMetrics["diagram"]>["labelCollisionPairs"]> = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const overlapAreaPx = collisionArea(entries[i].rect, entries[j].rect);
      if (overlapAreaPx > 8 && !isDuplicateNumericTickCollision(entries[i].text, entries[j].text)) {
        collisions.push({
          leftText: entries[i].text,
          rightText: entries[j].text,
          overlapAreaPx: roundMetric(overlapAreaPx),
          leftRect: rectMetrics(entries[i].rect),
          rightRect: rectMetrics(entries[j].rect),
        });
      }
    }
  }
  return collisions;
}

function graph3DLabelMetrics(diagramRoot: HTMLElement) {
  const graph3dRoot = diagramRoot.matches('[data-mauth-diagram-type="graph3d"]')
    ? diagramRoot
    : diagramRoot.querySelector<HTMLElement>('[data-mauth-diagram-type="graph3d"]');
  if (!graph3dRoot) return {};
  const entries = labelEntries(graph3dRoot).filter((entry) => entry.role.startsWith("graph3d-"));
  const expectedGraph3DPointLabelCount = Number(graph3dRoot.getAttribute("data-mauth-graph3d-point-label-count") || 0);
  const expectedGraph3DSegmentLabelCount = Number(graph3dRoot.getAttribute("data-mauth-graph3d-segment-label-count") || 0);
  const expectedGraph3DFaceLabelCount = Number(graph3dRoot.getAttribute("data-mauth-graph3d-face-label-count") || 0);
  const expectedGraph3DDimensionLabelCount = Number(graph3dRoot.getAttribute("data-mauth-graph3d-dimension-label-count") || 0);
  const graph3DPointLabelCount = entries.filter((entry) => entry.role === "graph3d-point-label").length;
  const graph3DSegmentLabelCount = entries.filter((entry) => entry.role === "graph3d-segment-label").length;
  const graph3DFaceLabelCount = entries.filter((entry) => entry.role === "graph3d-face-label").length;
  const graph3DDimensionLabelCount = entries.filter((entry) => entry.role === "graph3d-dimension-label").length;
  const frame = graph3dRoot.getBoundingClientRect();
  const graph3DLabelQualityIssues: string[] = [];

  if (graph3DPointLabelCount < expectedGraph3DPointLabelCount) {
    graph3DLabelQualityIssues.push(`rendered ${graph3DPointLabelCount}/${expectedGraph3DPointLabelCount} expected point labels`);
  }
  if (graph3DSegmentLabelCount < expectedGraph3DSegmentLabelCount) {
    graph3DLabelQualityIssues.push(`rendered ${graph3DSegmentLabelCount}/${expectedGraph3DSegmentLabelCount} expected segment labels`);
  }
  if (graph3DFaceLabelCount < expectedGraph3DFaceLabelCount) {
    graph3DLabelQualityIssues.push(`rendered ${graph3DFaceLabelCount}/${expectedGraph3DFaceLabelCount} expected face labels`);
  }
  if (graph3DDimensionLabelCount < expectedGraph3DDimensionLabelCount) {
    graph3DLabelQualityIssues.push(
      `rendered ${graph3DDimensionLabelCount}/${expectedGraph3DDimensionLabelCount} expected dimension labels`,
    );
  }
  for (const entry of entries) {
    if (
      entry.rect.left < frame.left - 1 ||
      entry.rect.right > frame.right + 1 ||
      entry.rect.top < frame.top - 1 ||
      entry.rect.bottom > frame.bottom + 1
    ) {
      graph3DLabelQualityIssues.push(`label ${entry.text || "label"} extends outside the diagram frame`);
    }
  }
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const distance = rectDistance(entries[i].rect, entries[j].rect);
      if (distance > 0 && distance < 3) {
        graph3DLabelQualityIssues.push(
          `label ${entries[i].text || "label"} is crowded near ${entries[j].text || "label"} (${roundMetric(distance)}px)`,
        );
      }
    }
  }

  return {
    expectedGraph3DPointLabelCount,
    expectedGraph3DSegmentLabelCount,
    expectedGraph3DFaceLabelCount,
    expectedGraph3DDimensionLabelCount,
    graph3DPointLabelCount,
    graph3DSegmentLabelCount,
    graph3DFaceLabelCount,
    graph3DDimensionLabelCount,
    ...(graph3DLabelQualityIssues.length ? { graph3DLabelQualityIssues: graph3DLabelQualityIssues.slice(0, 8) } : {}),
  };
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
  const pageAnchorBottoms = pageAnchors
    .map((anchor) => {
      const anchorName = anchor.getAttribute("data-scroll-anchor");
      const rect = anchor.getBoundingClientRect();
      return {
        anchor: anchorName,
        role: anchorRole(anchor),
        bottom: rect.bottom - contentRect.top,
      };
    })
    .filter((item): item is { anchor: string; role: MauthRenderedPreviewAnchorMetrics["role"]; bottom: number } => Boolean(item.anchor));
  const usedBottom = pageAnchorBottoms.reduce((bottom, item) => Math.max(bottom, item.bottom), 0);
  const overflowAnchorCandidates = pageAnchorBottoms.filter((item) => item.role === "module" && item.bottom > totalHeight + 1);
  const scrollOverflowPx = Math.max(0, page.scrollHeight - page.clientHeight);
  const anchorOverflowPx = Math.max(0, usedBottom - totalHeight);
  const overflowByPx = Math.max(scrollOverflowPx, anchorOverflowPx);
  const usedHeight = Math.max(0, Math.min(usedBottom, totalHeight));
  const overflow = overflowByPx > 1;
  return {
    pageIndex,
    pageNumber: pageIndex + 1,
    usedHeightPx: roundMetric(usedHeight),
    totalHeightPx: roundMetric(totalHeight),
    remainingHeightPx: roundMetric(Math.max(0, totalHeight - usedHeight)),
    usedPercent: totalHeight > 0 ? roundMetric((usedHeight / totalHeight) * 100) : 0,
    anchorCount: pageAnchors.length,
    overflow,
    ...(overflow ? { overflowByPx: roundMetric(overflowByPx) } : {}),
    ...(overflowAnchorCandidates.length === 1 ? { overflowTargetAnchor: overflowAnchorCandidates[0].anchor } : {}),
  };
}

function blockIdFromRenderedAnchor(anchor?: string) {
  const match = anchor?.match(/\/b:([^/]+)/);
  return match?.[1];
}

function renderedPageOverflowWarning(page: MauthRenderedPreviewPageMetrics) {
  const targetId = blockIdFromRenderedAnchor(page.overflowTargetAnchor);
  return {
    code: "rendered-page-overflow",
    severity: "warning" as const,
    message: `Preview page ${page.pageNumber} appears to overflow its A4 page box.`,
    ...(page.overflowTargetAnchor ? { anchor: page.overflowTargetAnchor } : {}),
    ...(targetId ? { targetId } : {}),
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
  const labelCollisionPairs = renderedGraphic && !errorMatch ? likelyLabelCollisions(diagramRoot) : [];
  const graph3DLabels = renderedGraphic && !errorMatch ? graph3DLabelMetrics(diagramRoot) : {};
  return {
    found: true,
    rendered: renderedGraphic && !errorMatch,
    ...(errorMatch ? { errorText: errorMatch[0] } : {}),
    viewportRect: rectMetrics(rect),
    ...(clipped ? { clipped: true } : {}),
    ...(tooSmall ? { tooSmall: true } : {}),
    ...(labelCollisionPairs.length
      ? {
          labelCollisionCount: labelCollisionPairs.length,
          labelCollisionPairs: labelCollisionPairs.slice(0, 6),
        }
      : {}),
    ...graph3DLabels,
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
    const samplePair = diagram.labelCollisionPairs?.[0];
    const sampleText = samplePair ? ` Example: "${samplePair.leftText}" overlaps "${samplePair.rightText}".` : "";
    warnings.push({
      code: "rendered-diagram-label-collision",
      severity: "warning",
      anchor,
      message: `The selected diagram has ${diagram.labelCollisionCount} likely overlapping label pair${
        diagram.labelCollisionCount === 1 ? "" : "s"
      }.${sampleText}`,
    });
  }
  if (diagram?.found && diagram.rendered && diagram.graph3DLabelQualityIssues?.length) {
    warnings.push({
      code: "rendered-graph3d-label-quality",
      severity: "warning",
      anchor,
      message: `The selected 3D diagram has label placement issues: ${diagram.graph3DLabelQualityIssues.slice(0, 3).join("; ")}.`,
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
    ...pageSummaries.filter((page) => page.overflow).map(renderedPageOverflowWarning),
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
