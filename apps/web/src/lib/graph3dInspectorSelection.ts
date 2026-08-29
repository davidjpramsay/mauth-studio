import type { GraphConfig } from "@mauth-studio/shared";

import { DEFAULT_3D_GRAPH, graph3dViewState } from "./diagram3d.ts";
import {
  graph3dElementAt,
  graph3dElementDisplayName,
  graph3dElementTarget,
  type Graph3DElement,
  type Graph3DElementKind,
  type Graph3DElementTarget,
} from "./diagramGraph3d.ts";

const GRAPH_3D_CHILD_PREFIXES = {
  point: "g3pt",
  segment: "g3seg",
  dimension: "g3dim",
  face: "g3face",
  solid: "g3solid",
} as const satisfies Record<Graph3DElementKind, string>;

export interface Graph3DElementInspectorSelection {
  target: Graph3DElementTarget;
  element: Graph3DElement;
  title: string;
  summary: string;
}

export function graph3dChildScrollAnchor(parentAnchor: string, kind: Graph3DElementKind, index: number) {
  return `${parentAnchor}/${GRAPH_3D_CHILD_PREFIXES[kind]}:${index}`;
}

export function selectedGraph3dChildFromAnchor(activeAnchor?: string) {
  const lastSegment = activeAnchor?.split("/").at(-1) ?? "";
  for (const [kind, prefix] of Object.entries(GRAPH_3D_CHILD_PREFIXES) as Array<[Graph3DElementKind, string]>) {
    if (!lastSegment.startsWith(`${prefix}:`)) continue;
    const index = Number(lastSegment.slice(prefix.length + 1));
    return Number.isInteger(index) && index >= 0 ? { kind, index } : null;
  }
  return null;
}

export function graph3dElementInspectorSelection(graphConfig: GraphConfig, activeAnchor?: string): Graph3DElementInspectorSelection | null {
  const child = selectedGraph3dChildFromAnchor(activeAnchor);
  if (!child) return null;
  const target = graph3dElementTarget(graphConfig, child.kind, child.index);
  const element = target ? graph3dElementAt(graphConfig, target) : undefined;
  if (!target || !element) return null;

  return {
    target,
    element,
    title: graph3dElementDisplayName(graphConfig, target),
    summary: `${child.kind[0].toUpperCase()}${child.kind.slice(1)} display settings`,
  };
}

export function graph3dInspectorSelection(graphConfig: GraphConfig) {
  return {
    title: "3D settings" as const,
    widthPx: graphConfig.widthPx ?? DEFAULT_3D_GRAPH.widthPx,
    heightPx: graphConfig.heightPx ?? DEFAULT_3D_GRAPH.heightPx,
    view: graph3dViewState(graphConfig),
  };
}
