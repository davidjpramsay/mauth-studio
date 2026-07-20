import type { GraphConfig } from "@mauth-studio/shared";

import { DEFAULT_IMAGE_DIAGRAM, finiteGraphNumber, imageDiagramData } from "./diagramImage.ts";

export function imageInspectorSelection(graphConfig: GraphConfig) {
  return {
    title: "Image settings" as const,
    data: imageDiagramData(graphConfig),
    widthPx: finiteGraphNumber(graphConfig.widthPx, DEFAULT_IMAGE_DIAGRAM.widthPx),
    heightPx: finiteGraphNumber(graphConfig.heightPx, DEFAULT_IMAGE_DIAGRAM.heightPx),
  };
}

export function imageInspectorDimensionPatch(dimension: "widthPx" | "heightPx", value: unknown): Partial<GraphConfig> {
  const fallback = dimension === "widthPx" ? DEFAULT_IMAGE_DIAGRAM.widthPx : DEFAULT_IMAGE_DIAGRAM.heightPx;
  return { [dimension]: finiteGraphNumber(value, fallback) };
}
