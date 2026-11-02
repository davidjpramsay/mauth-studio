const MIN_GRAPH_FRAME_PADDING_PX = 24;

// Keep paper-size clearance even when axis names and numbers are hidden.
// Only the viewport changes; authored coordinates and label positions stay intact.
export function graphFramePaddingForPixels(span: number, displaySize: number, requestedPaddingPx = MIN_GRAPH_FRAME_PADDING_PX) {
  if (!Number.isFinite(displaySize) || displaySize <= 0) return 0;
  const paddingPx = Math.min(requestedPaddingPx, displaySize * 0.14);
  const contentSize = displaySize - paddingPx * 2;
  return contentSize > 0 ? (span * paddingPx) / contentSize : 0;
}
