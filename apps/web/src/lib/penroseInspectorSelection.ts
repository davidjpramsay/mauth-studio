import type { GraphConfig } from "@mauth-studio/shared";

import { normalizedNetworkDiagramData, type NormalizedNetworkDiagramData } from "./diagramNetwork.ts";
import { normalizedSetDiagramData, type NormalizedSetDiagramData } from "./diagramSet.ts";

export interface PenroseInspectorSelection {
  title: "Penrose settings" | "Network settings" | "Venn diagram settings";
  networkData: NormalizedNetworkDiagramData | null;
  setData: NormalizedSetDiagramData | null;
}

export function penroseInspectorSelection(graphConfig: GraphConfig): PenroseInspectorSelection {
  if (graphConfig.type === "network") {
    return {
      title: "Network settings",
      networkData: normalizedNetworkDiagramData(graphConfig),
      setData: null,
    };
  }
  if (graphConfig.type === "setDiagram") {
    return {
      title: "Venn diagram settings",
      networkData: null,
      setData: normalizedSetDiagramData(graphConfig),
    };
  }
  return { title: "Penrose settings", networkData: null, setData: null };
}
