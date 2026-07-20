import type { GraphConfig, ImageDiagramAnnotation, ImageDiagramAnnotationKind, ImageDiagramData } from "@mauth-studio/shared";

const IMAGE_DIAGRAM_MAX_WIDTH_PX = 680;
const DEFAULT_IMAGE_ANNOTATION_COLOR = "#111827";
const SOLUTION_IMAGE_ANNOTATION_COLOR = "#1d4ed8";

export const IMAGE_ANNOTATION_KINDS = ["label", "ellipse", "arrow"] as const satisfies readonly ImageDiagramAnnotationKind[];

export interface ImageAnnotationTarget {
  index?: number;
  id?: string;
}

export const DEFAULT_IMAGE_DIAGRAM: GraphConfig = {
  type: "image",
  data: { src: "", name: "", alt: "", annotations: [] },
  widthPx: 420,
  heightPx: 260,
  functions: [],
  features: [],
  metadata: {},
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function annotationNumber(value: unknown, fallback: number, min = 0, max = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function annotationKind(value: unknown): ImageDiagramAnnotationKind {
  return typeof value === "string" && IMAGE_ANNOTATION_KINDS.includes(value as ImageDiagramAnnotationKind)
    ? (value as ImageDiagramAnnotationKind)
    : "label";
}

function annotationId(value: unknown, index: number, usedIds: Set<string>) {
  const base = typeof value === "string" && value.trim() ? value.trim() : `annotation-${index + 1}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) id = `${base}-${suffix++}`;
  usedIds.add(id);
  return id;
}

export function normalizeImageDiagramAnnotations(value: unknown): ImageDiagramAnnotation[] {
  if (!Array.isArray(value)) return [];
  const usedIds = new Set<string>();
  return value.flatMap((entry, index) => {
    const record = asRecord(entry);
    if (!record) return [];
    const kind = annotationKind(record.kind);
    return [
      {
        ...record,
        id: annotationId(record.id, index, usedIds),
        kind,
        xPercent: annotationNumber(record.xPercent, 50),
        yPercent: annotationNumber(record.yPercent, 50),
        ...(kind === "arrow"
          ? {
              endXPercent: annotationNumber(record.endXPercent, 70),
              endYPercent: annotationNumber(record.endYPercent, 30),
            }
          : {}),
        ...(kind === "ellipse"
          ? {
              widthPercent: annotationNumber(record.widthPercent, 20, 1),
              heightPercent: annotationNumber(record.heightPercent, 15, 1),
            }
          : {}),
        ...(typeof record.text === "string" ? { text: record.text } : {}),
        color: typeof record.color === "string" && record.color.trim() ? record.color : DEFAULT_IMAGE_ANNOTATION_COLOR,
        strokeWidth: annotationNumber(record.strokeWidth, 2, 0.5, 12),
        fontSizePx: annotationNumber(record.fontSizePx, 16, 8, 48),
        show: record.show !== false,
        solutionOnly: record.solutionOnly === true,
      } satisfies ImageDiagramAnnotation,
    ];
  });
}

export function finiteGraphNumber(value: unknown, fallback?: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

export function imageDiagramData(graphConfig?: GraphConfig | null) {
  const data = asRecord(graphConfig?.data);
  return {
    src: typeof data?.src === "string" ? data.src : "",
    name: typeof data?.name === "string" ? data.name : "",
    alt: typeof data?.alt === "string" ? data.alt : "",
    mimeType: typeof data?.mimeType === "string" ? data.mimeType : "",
    naturalWidth: finiteGraphNumber(data?.naturalWidth),
    naturalHeight: finiteGraphNumber(data?.naturalHeight),
    annotations: normalizeImageDiagramAnnotations(data?.annotations),
  } satisfies ImageDiagramData;
}

export function imageDiagramAnnotations(graphConfig?: GraphConfig | null) {
  return imageDiagramData(graphConfig).annotations ?? [];
}

export function imageAnnotationIndexById(graphConfig: GraphConfig, id: string) {
  const index = imageDiagramAnnotations(graphConfig).findIndex((entry) => entry.id === id);
  return index >= 0 ? index : undefined;
}

export function imageAnnotationAt(graphConfig: GraphConfig, target: ImageAnnotationTarget) {
  const annotations = imageDiagramAnnotations(graphConfig);
  const index = typeof target.index === "number" ? target.index : target.id ? imageAnnotationIndexById(graphConfig, target.id) : undefined;
  return index === undefined ? undefined : annotations[index];
}

export function updateImageAnnotation(graphConfig: GraphConfig, target: ImageAnnotationTarget, patch: Partial<ImageDiagramAnnotation>) {
  const data = imageDiagramData(graphConfig);
  const annotations = data.annotations ?? [];
  const index = typeof target.index === "number" ? target.index : target.id ? imageAnnotationIndexById(graphConfig, target.id) : undefined;
  if (index === undefined || index < 0 || index >= annotations.length) return undefined;
  const nextAnnotations = annotations.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry));
  return { ...data, annotations: normalizeImageDiagramAnnotations(nextAnnotations) } satisfies ImageDiagramData;
}

export function imageDiagramDataWithAnnotations(graphConfig: GraphConfig, annotations: ImageDiagramAnnotation[]) {
  return {
    ...imageDiagramData(graphConfig),
    annotations: normalizeImageDiagramAnnotations(annotations),
  } satisfies ImageDiagramData;
}

export function createImageAnnotation(
  existing: readonly ImageDiagramAnnotation[],
  kind: ImageDiagramAnnotationKind,
  solutionOnly: boolean,
): ImageDiagramAnnotation {
  const usedIds = new Set(existing.map((entry) => entry.id));
  let nextIndex = existing.length + 1;
  while (usedIds.has(`annotation-${nextIndex}`)) nextIndex += 1;
  const base = {
    id: `annotation-${nextIndex}`,
    kind,
    xPercent: kind === "arrow" ? 30 : 50,
    yPercent: kind === "arrow" ? 70 : 50,
    color: solutionOnly ? SOLUTION_IMAGE_ANNOTATION_COLOR : DEFAULT_IMAGE_ANNOTATION_COLOR,
    strokeWidth: 2,
    fontSizePx: 16,
    show: true,
    solutionOnly,
  } satisfies ImageDiagramAnnotation;
  if (kind === "arrow") return { ...base, endXPercent: 70, endYPercent: 30 };
  if (kind === "ellipse") return { ...base, widthPercent: 20, heightPercent: 15 };
  return { ...base, text: "Label" };
}

export function isSolutionOnlyImageAnnotation(annotation: ImageDiagramAnnotation) {
  return annotation.solutionOnly === true;
}

export function imageAnnotationHasAnswerContent(annotation: ImageDiagramAnnotation) {
  if (annotation.show === false) return false;
  return annotation.kind !== "label" || Boolean(annotation.text?.trim());
}

export function imageConfigHasSolutionOnly(graphConfig: GraphConfig) {
  return imageDiagramAnnotations(graphConfig).some(
    (annotation) => isSolutionOnlyImageAnnotation(annotation) && imageAnnotationHasAnswerContent(annotation),
  );
}

export function imageConfigForSolutionVisibility(graphConfig: GraphConfig, showSolutions: boolean, solutionColor?: string) {
  if (graphConfig.type !== "image") return graphConfig;
  const data = imageDiagramData(graphConfig);
  const annotations = (data.annotations ?? [])
    .filter((annotation) => showSolutions || !isSolutionOnlyImageAnnotation(annotation))
    .map((annotation) =>
      showSolutions && solutionColor && isSolutionOnlyImageAnnotation(annotation) ? { ...annotation, color: solutionColor } : annotation,
    );
  return { ...graphConfig, data: { ...data, annotations } };
}

export function imageDiagramName(graphConfig?: GraphConfig | null) {
  return imageDiagramData(graphConfig).name || "Uploaded image";
}

export function imageDiagramAlt(graphConfig?: GraphConfig | null) {
  const data = imageDiagramData(graphConfig);
  return data.alt || data.name || "Uploaded diagram";
}

export function imageNameFromFile(fileName: string) {
  return (
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim() || "Image"
  );
}

export function diagramImageDimensions(naturalWidth?: number, naturalHeight?: number) {
  if (!naturalWidth || !naturalHeight) {
    return {
      widthPx: DEFAULT_IMAGE_DIAGRAM.widthPx,
      heightPx: DEFAULT_IMAGE_DIAGRAM.heightPx,
    };
  }
  const widthPx = Math.min(naturalWidth, IMAGE_DIAGRAM_MAX_WIDTH_PX);
  return {
    widthPx,
    heightPx: Math.max(1, Math.round(widthPx * (naturalHeight / naturalWidth))),
  };
}
