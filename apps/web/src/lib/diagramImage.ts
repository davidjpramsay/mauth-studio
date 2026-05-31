import type { GraphConfig } from "@mauth-studio/shared";

const IMAGE_DIAGRAM_MAX_WIDTH_PX = 680;

export const DEFAULT_IMAGE_DIAGRAM: GraphConfig = {
  type: "image",
  data: { src: "", name: "", alt: "" },
  widthPx: 420,
  heightPx: 260,
  functions: [],
  features: [],
  metadata: {},
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
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
  };
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
