import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

const PREVIEW_FIT_PADDING_PX = 40;
const MIN_PREVIEW_SCALE = 0.55;
const MAX_PREVIEW_FIT_SCALE = 1;
const MIN_PREVIEW_ZOOM = 0.7;
const MAX_PREVIEW_ZOOM = 3;
const PREVIEW_WHEEL_ZOOM_SENSITIVITY = 0.0018;
const PREVIEW_ZOOM_STATE_SYNC_DELAY_MS = 160;
const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;

type SafariGestureEvent = Event & { scale?: number; clientX?: number; clientY?: number };

interface PreviewPageFormat {
  widthPx: number;
  heightPx: number;
}

interface UsePreviewZoomControllerOptions<TPageFormat extends PreviewPageFormat> {
  previewPaneRef: MutableRefObject<HTMLElement | null>;
  currentPageFormat: TPageFormat;
  showPreview: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampPreviewZoom(value: number, maxZoom = MAX_PREVIEW_ZOOM) {
  if (!Number.isFinite(value)) return 1;
  return Math.round(clamp(value, MIN_PREVIEW_ZOOM, maxZoom) * 10000) / 10000;
}

function normalizedPreviewWheelDelta(event: globalThis.WheelEvent, pageHeight: number) {
  const primaryDelta = event.deltaY === 0 && event.deltaX ? event.deltaX : event.deltaY;
  if (event.deltaMode === WHEEL_DELTA_LINE) return primaryDelta * 16;
  if (event.deltaMode === WHEEL_DELTA_PAGE) return primaryDelta * Math.max(pageHeight, 1);
  return primaryDelta;
}

function previewPointFromEvent(event: { clientX?: number; clientY?: number }, fallbackElement: HTMLElement) {
  const rect = fallbackElement.getBoundingClientRect();
  return {
    clientX: typeof event.clientX === "number" ? event.clientX : rect.left + rect.width / 2,
    clientY: typeof event.clientY === "number" ? event.clientY : rect.top + rect.height / 2,
  };
}

function previewPaneContentHeight(previewPane: HTMLElement) {
  const styles = window.getComputedStyle(previewPane);
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
  return Math.max(0, previewPane.clientHeight - paddingTop - paddingBottom);
}

function previewPaneContentWidth(previewPane: HTMLElement) {
  const styles = window.getComputedStyle(previewPane);
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
  return Math.max(0, previewPane.clientWidth - paddingLeft - paddingRight);
}

function previewZoomScrollTarget({
  previewPane,
  currentScale,
  nextScale,
  point,
  currentScrollLeft = previewPane.scrollLeft,
  currentScrollTop = previewPane.scrollTop,
}: {
  previewPane: HTMLElement;
  currentScale: number;
  nextScale: number;
  point: { clientX: number; clientY: number };
  currentScrollLeft?: number;
  currentScrollTop?: number;
}) {
  const paneRect = previewPane.getBoundingClientRect();
  const localX = clamp(point.clientX - paneRect.left, 0, paneRect.width);
  const localY = clamp(point.clientY - paneRect.top, 0, paneRect.height);
  const anchorX = currentScale > 0 ? (currentScrollLeft + localX) / currentScale : currentScrollLeft + localX;
  const anchorY = currentScale > 0 ? (currentScrollTop + localY) / currentScale : currentScrollTop + localY;
  return {
    scrollLeft: anchorX * nextScale - localX,
    scrollTop: anchorY * nextScale - localY,
  };
}

function scrollableRange(element: HTMLElement) {
  const maxScroll = element.scrollHeight - element.clientHeight;
  return Math.max(0, maxScroll);
}

function horizontalScrollableRange(element: HTMLElement) {
  const maxScroll = element.scrollWidth - element.clientWidth;
  return Math.max(0, maxScroll);
}

function applyPreviewScaleStyle(previewRoot: HTMLElement, pageFormat: PreviewPageFormat, scale = 1) {
  previewRoot.style.setProperty("--a4-preview-scale", String(scale));
  previewRoot.style.setProperty("--a4-preview-page-width", `${pageFormat.widthPx * scale}px`);
  previewRoot.style.setProperty("--a4-preview-page-height", `${pageFormat.heightPx * scale}px`);
  previewRoot.style.setProperty("--a4-preview-page-gap", `${16 * scale}px`);
}

export function usePreviewZoomController<TPageFormat extends PreviewPageFormat>({
  previewPaneRef,
  currentPageFormat,
  showPreview,
}: UsePreviewZoomControllerOptions<TPageFormat>) {
  const [previewViewport, setPreviewViewport] = useState({ width: 0, height: 0 });
  const [previewZoom, setPreviewZoom] = useState(1);
  const previewZoomRef = useRef(1);
  const previewGestureStartZoomRef = useRef(1);
  const previewZoomStateSyncTimerRef = useRef<number | null>(null);

  const previewFitScale = useMemo(() => {
    if (!previewViewport.width) return 1;
    const widthScale = (previewViewport.width - PREVIEW_FIT_PADDING_PX) / currentPageFormat.widthPx;
    return clamp(Math.min(widthScale, MAX_PREVIEW_FIT_SCALE), MIN_PREVIEW_SCALE, MAX_PREVIEW_FIT_SCALE);
  }, [currentPageFormat.widthPx, previewViewport.width]);

  const previewMaxZoom = useMemo(() => {
    if (!previewViewport.width || previewFitScale <= 0) return 1;
    const maxTotalScale = MAX_PREVIEW_FIT_SCALE;
    return clampPreviewZoom(maxTotalScale / previewFitScale);
  }, [previewFitScale, previewViewport.width]);

  const previewLayoutScale = previewFitScale * previewZoomRef.current;

  useLayoutEffect(() => {
    const previewPane = previewPaneRef.current;
    if (!previewPane || !showPreview) return;

    const updatePreviewViewport = () => {
      setPreviewViewport({ width: previewPaneContentWidth(previewPane), height: previewPaneContentHeight(previewPane) });
    };

    updatePreviewViewport();
    const observer = new ResizeObserver(updatePreviewViewport);
    observer.observe(previewPane);
    return () => observer.disconnect();
  }, [previewPaneRef, showPreview]);

  useEffect(() => {
    const previewPane = previewPaneRef.current;
    if (!previewPane || !showPreview) return;
    let previewZoomFrameId: number | null = null;
    let pendingPreviewScrollTarget: { scrollLeft: number; scrollTop: number } | null = null;

    const schedulePreviewZoomStateSync = (nextZoom: number) => {
      if (previewZoomStateSyncTimerRef.current) window.clearTimeout(previewZoomStateSyncTimerRef.current);
      previewZoomStateSyncTimerRef.current = window.setTimeout(() => {
        previewZoomStateSyncTimerRef.current = null;
        setPreviewZoom((currentZoom) => (currentZoom === nextZoom ? currentZoom : nextZoom));
      }, PREVIEW_ZOOM_STATE_SYNC_DELAY_MS);
    };

    const applyPreviewZoom = (nextZoom: number, point: { clientX: number; clientY: number }) => {
      const currentZoom = previewZoomRef.current;
      const clampedZoom = clampPreviewZoom(nextZoom, previewMaxZoom);
      if (clampedZoom === currentZoom) return;
      const previewRoot = previewPane.querySelector<HTMLElement>(".a4-preview-root");
      const nextScale = previewFitScale * clampedZoom;
      pendingPreviewScrollTarget = previewZoomScrollTarget({
        previewPane,
        currentScale: previewFitScale * currentZoom,
        nextScale,
        point,
        currentScrollLeft: pendingPreviewScrollTarget?.scrollLeft,
        currentScrollTop: pendingPreviewScrollTarget?.scrollTop,
      });

      previewZoomRef.current = clampedZoom;
      if (previewRoot) {
        applyPreviewScaleStyle(previewRoot, currentPageFormat, nextScale);
        schedulePreviewZoomStateSync(clampedZoom);
      } else {
        setPreviewZoom(clampedZoom);
      }

      if (previewZoomFrameId !== null) return;
      previewZoomFrameId = window.requestAnimationFrame(() => {
        previewZoomFrameId = null;
        const target = pendingPreviewScrollTarget;
        pendingPreviewScrollTarget = null;
        if (!target) return;
        previewPane.scrollLeft = clamp(target.scrollLeft, 0, horizontalScrollableRange(previewPane));
        previewPane.scrollTop = clamp(target.scrollTop, 0, scrollableRange(previewPane));
      });
    };

    const handlePreviewWheel = (event: globalThis.WheelEvent) => {
      const zoomRequested = event.ctrlKey || event.metaKey || event.altKey;
      if (!zoomRequested) return;

      event.preventDefault();
      const delta = normalizedPreviewWheelDelta(event, previewPane.clientHeight);
      applyPreviewZoom(
        previewZoomRef.current * Math.exp(-delta * PREVIEW_WHEEL_ZOOM_SENSITIVITY),
        previewPointFromEvent(event, previewPane),
      );
    };

    const handleGestureStart = (event: Event) => {
      event.preventDefault();
      previewGestureStartZoomRef.current = previewZoomRef.current;
    };

    const handleGestureChange = (event: Event) => {
      const gestureEvent = event as SafariGestureEvent;
      const scale = Number(gestureEvent.scale);
      if (!Number.isFinite(scale) || scale <= 0) return;
      event.preventDefault();
      applyPreviewZoom(previewGestureStartZoomRef.current * scale, previewPointFromEvent(gestureEvent, previewPane));
    };

    previewPane.addEventListener("wheel", handlePreviewWheel, { passive: false });
    previewPane.addEventListener("gesturestart", handleGestureStart, { passive: false });
    previewPane.addEventListener("gesturechange", handleGestureChange, { passive: false });

    return () => {
      previewPane.removeEventListener("wheel", handlePreviewWheel);
      previewPane.removeEventListener("gesturestart", handleGestureStart);
      previewPane.removeEventListener("gesturechange", handleGestureChange);
      if (previewZoomFrameId !== null) window.cancelAnimationFrame(previewZoomFrameId);
      if (previewZoomStateSyncTimerRef.current) {
        window.clearTimeout(previewZoomStateSyncTimerRef.current);
        previewZoomStateSyncTimerRef.current = null;
      }
    };
  }, [currentPageFormat, previewFitScale, previewMaxZoom, previewPaneRef, showPreview]);

  useLayoutEffect(() => {
    const previewPane = previewPaneRef.current;
    if (!previewPane) return;
    const previewRoot = previewPane.querySelector<HTMLElement>(".a4-preview-root");
    if (previewRoot) applyPreviewScaleStyle(previewRoot, currentPageFormat, previewFitScale * previewZoomRef.current);
    previewPane.scrollLeft = clamp(previewPane.scrollLeft, 0, horizontalScrollableRange(previewPane));
    previewPane.scrollTop = clamp(previewPane.scrollTop, 0, scrollableRange(previewPane));
  }, [currentPageFormat, previewFitScale, previewPaneRef, previewZoom]);

  useEffect(() => {
    const nextZoom = clampPreviewZoom(previewZoomRef.current, previewMaxZoom);
    if (nextZoom === previewZoomRef.current) return;
    previewZoomRef.current = nextZoom;
    setPreviewZoom(nextZoom);
  }, [previewMaxZoom]);

  function resetPreviewZoom() {
    previewZoomRef.current = 1;
    previewGestureStartZoomRef.current = 1;
    if (previewZoomStateSyncTimerRef.current) {
      window.clearTimeout(previewZoomStateSyncTimerRef.current);
      previewZoomStateSyncTimerRef.current = null;
    }
    setPreviewZoom(1);

    const previewPane = previewPaneRef.current;
    if (previewPane) {
      previewPane.scrollLeft = 0;
      const previewRoot = previewPane.querySelector<HTMLElement>(".a4-preview-root");
      if (previewRoot) applyPreviewScaleStyle(previewRoot, currentPageFormat, previewFitScale);
    }
  }

  return {
    previewFitScale,
    previewLayoutScale,
    resetPreviewZoom,
  };
}
