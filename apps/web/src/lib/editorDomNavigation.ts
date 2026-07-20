import {
  SCROLL_ANCHOR_SELECTOR,
  SCROLL_ANCHOR_TOP_OFFSET_PX,
  clamp,
  scrollAnchorFallbacks,
  scrollAnchorValue,
  scrollableRange,
  type ScrollAnchorPosition,
} from "./scrollAnchors.ts";

export function visibleScrollAnchors(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(SCROLL_ANCHOR_SELECTOR))
    .filter((element) => {
      if (element.closest(".a4-measure")) return false;
      if (!element.getClientRects().length) return false;
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    })
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);
}

export function scrollToAnchorPosition(container: HTMLElement, position: ScrollAnchorPosition) {
  const anchors = visibleScrollAnchors(container);
  if (!anchors.length) return false;

  let matchedIndex = -1;
  let matchedAnchor = "";
  for (const fallback of scrollAnchorFallbacks(position.anchor)) {
    const index = anchors.findIndex((anchor) => scrollAnchorValue(anchor) === fallback);
    if (index >= 0) {
      matchedIndex = index;
      matchedAnchor = fallback;
      break;
    }
  }

  if (matchedIndex < 0) return false;

  const currentAnchor = anchors[matchedIndex];
  const currentTop = currentAnchor.getBoundingClientRect().top;
  const nextTop =
    anchors[matchedIndex + 1]?.getBoundingClientRect().top ?? currentTop + Math.max(currentAnchor.getBoundingClientRect().height, 1);
  const progress = matchedAnchor === position.anchor ? position.progress : 0;
  const targetTop = currentTop + (nextTop - currentTop) * progress;
  const paneTop = container.getBoundingClientRect().top + SCROLL_ANCHOR_TOP_OFFSET_PX;
  const nextScrollTop = clamp(container.scrollTop + targetTop - paneTop, 0, scrollableRange(container));

  if (Math.abs(container.scrollTop - nextScrollTop) > 0.5) {
    container.scrollTop = nextScrollTop;
  }

  return true;
}

function cssAttributeValue(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function syncPreviewSelection(previewPane: HTMLElement, activeAnchor?: string) {
  previewPane
    .querySelectorAll<HTMLElement>('[data-preview-selected="true"]')
    .forEach((element) => element.removeAttribute("data-preview-selected"));

  if (!activeAnchor) return;
  previewPane
    .querySelectorAll<HTMLElement>(`[data-scroll-anchor="${cssAttributeValue(activeAnchor)}"]`)
    .forEach((element) => element.setAttribute("data-preview-selected", "true"));
}
