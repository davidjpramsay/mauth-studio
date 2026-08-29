const PREVIEW_FIT_PADDING_PX = 40;
const MIN_PREVIEW_SCALE = 0.55;
const MAX_PREVIEW_FIT_SCALE = 1;
const MIN_PREVIEW_ZOOM = 0.7;
const MAX_PREVIEW_ZOOM = 6;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function clampPreviewZoom(value: number, maxZoom = MAX_PREVIEW_ZOOM) {
  if (!Number.isFinite(value)) return 1;
  return Math.round(clamp(value, MIN_PREVIEW_ZOOM, maxZoom) * 10000) / 10000;
}

export function previewFitScaleForViewport(viewportWidth: number, pageWidth: number) {
  if (!viewportWidth || !pageWidth) return 1;
  const widthScale = (viewportWidth - PREVIEW_FIT_PADDING_PX) / pageWidth;
  return clamp(Math.min(widthScale, MAX_PREVIEW_FIT_SCALE), MIN_PREVIEW_SCALE, MAX_PREVIEW_FIT_SCALE);
}

export function previewMaxZoomForViewport({
  viewportWidth,
  pageWidth,
  previewFitScale,
}: {
  viewportWidth: number;
  pageWidth: number;
  previewFitScale: number;
}) {
  if (!viewportWidth || !pageWidth || previewFitScale <= 0) return 1;
  const widthFillScale = viewportWidth / pageWidth;
  const maxTotalScale = Math.max(previewFitScale, widthFillScale);
  return clampPreviewZoom(maxTotalScale / previewFitScale);
}
