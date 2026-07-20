import type { Graph2DGeometryDecoration, Graph2DGeometryPoint, GraphConfig } from "@mauth-studio/shared";

import { geometry2dData } from "./diagramGeometry2d.ts";

export type SelectedGeometryChild =
  | { kind: "point"; index: number }
  | { kind: "segment"; index: number }
  | { kind: "arc"; index: number }
  | { kind: "angle"; index: number }
  | { kind: "decoration"; index: number };

export function selectedGeometryChildFromAnchor(anchor?: string): SelectedGeometryChild | null {
  const lastSegment = anchor?.split("/").at(-1) ?? "";
  const prefixes: Array<[string, SelectedGeometryChild["kind"]]> = [
    ["gpt:", "point"],
    ["gseg:", "segment"],
    ["garc:", "arc"],
    ["gang:", "angle"],
    ["gdec:", "decoration"],
  ];
  const match = prefixes.find(([prefix]) => lastSegment.startsWith(prefix));
  if (!match) return null;
  const [prefix, kind] = match;
  const index = Number(lastSegment.slice(prefix.length));
  return Number.isInteger(index) && index >= 0 ? { kind, index } : null;
}

export function geometryPointLabel(point: Graph2DGeometryPoint, index: number) {
  return point.label?.trim() || point.id?.trim() || `Point ${index + 1}`;
}

function geometryDecorationLabel(decoration: Graph2DGeometryDecoration, index: number) {
  if (decoration.kind === "equalLength") return `Equal length ${index + 1}`;
  if (decoration.kind === "equalAngle") return `Equal angle ${index + 1}`;
  return `Right angle ${index + 1}`;
}

export function geometry2dParentAnchor(anchor?: string) {
  if (!anchor) return "";
  return anchor.replace(/\/g(?:pt|seg|arc|ang|dec):\d+$/, "");
}

export function geometryPrimitiveTitle(child: SelectedGeometryChild | null, data: ReturnType<typeof geometry2dData> | null) {
  if (!child || !data) return null;
  if (child.kind === "point")
    return `Point ${child.index + 1}: ${geometryPointLabel(data.points?.[child.index] ?? { id: "", x: 0, y: 0 }, child.index)}`;
  if (child.kind === "segment") return `Segment ${child.index + 1}: ${data.segments?.[child.index]?.id || "unnamed"}`;
  if (child.kind === "arc") return `Arc ${child.index + 1}: ${data.arcs?.[child.index]?.id || "unnamed"}`;
  if (child.kind === "angle") return `Angle ${child.index + 1}: ${data.angles?.[child.index]?.id || "unnamed"}`;
  return geometryDecorationLabel(data.decorations?.[child.index] ?? { kind: "equalLength" }, child.index);
}

export function geometry2dInspectorSelection(graphConfig: GraphConfig, activeAnchor?: string) {
  const data = geometry2dData(graphConfig);
  const child = selectedGeometryChildFromAnchor(activeAnchor);
  return { child, title: geometryPrimitiveTitle(child, data) };
}
