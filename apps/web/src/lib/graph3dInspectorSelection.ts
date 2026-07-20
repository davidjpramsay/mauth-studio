import type { GraphConfig } from "@mauth-studio/shared";

import { DEFAULT_3D_GRAPH, graph3dViewState } from "./diagram3d.ts";

export function graph3dInspectorSelection(graphConfig: GraphConfig) {
  return {
    title: "3D settings" as const,
    widthPx: graphConfig.widthPx ?? DEFAULT_3D_GRAPH.widthPx,
    heightPx: graphConfig.heightPx ?? DEFAULT_3D_GRAPH.heightPx,
    view: graph3dViewState(graphConfig),
  };
}
