import type { DiagramAlignment, DiagramTextSide, GraphConfig } from "@mauth-studio/shared";
import { DEFAULT_STATS_CHART_SPEC, normalizeStatsChartSpec } from "@mauth-studio/diagram-plotly";

import { DEFAULT_3D_GRAPH } from "./diagram3d.ts";
import { DEFAULT_GEOMETRY_2D_GRAPH, geometry2dData } from "./diagramGeometry2d.ts";
import { DEFAULT_2D_GRAPH, graphFeaturesFromConfig, graphFunctionsFromConfig } from "./diagramGraph2d.ts";
import { DEFAULT_IMAGE_DIAGRAM, finiteGraphNumber, imageDiagramData } from "./diagramImage.ts";
import { DEFAULT_NETWORK_DATA } from "./diagramNetwork.ts";
import {
  DEFAULT_PENROSE_PRESET,
  DEFAULT_PENROSE_SCALE_PERCENT,
  SETS_PENROSE_PRESET,
  penroseOptions,
  penrosePreset,
  penroseScalePercent,
} from "./diagramPenrose.ts";
import { DEFAULT_GEOMETRIC_DATA } from "./diagramPenroseSubstance.ts";
import { DEFAULT_SET_DATA, DEFAULT_SET_DIAGRAM } from "./diagramSet.ts";
import { DEFAULT_VECTOR_2D_GRAPH, DEFAULT_VECTOR_2D_METADATA } from "./diagramVector2d.ts";

const SUPPORTED_DIAGRAM_TYPES = new Set([
  "graph2d",
  "geometry2d",
  "vector2d",
  "graph3d",
  "image",
  "geometricConstruction",
  "network",
  "setDiagram",
  "statsChart",
]);

export const DEFAULT_GEOMETRIC_DIAGRAM: GraphConfig = {
  type: "geometricConstruction",
  data: DEFAULT_GEOMETRIC_DATA,
  style: DEFAULT_PENROSE_PRESET,
  options: { scalePercent: DEFAULT_PENROSE_SCALE_PERCENT, penrosePreset: DEFAULT_PENROSE_PRESET },
  scalePercent: DEFAULT_PENROSE_SCALE_PERCENT,
  penrosePreset: DEFAULT_PENROSE_PRESET,
  functions: [],
  features: [],
  metadata: {},
};

export const DEFAULT_STATS_CHART: GraphConfig = {
  type: "statsChart",
  data: DEFAULT_STATS_CHART_SPEC.data,
  style: DEFAULT_STATS_CHART_SPEC.style,
  options: DEFAULT_STATS_CHART_SPEC.options,
  widthPx: DEFAULT_STATS_CHART_SPEC.options?.widthPx,
  heightPx: DEFAULT_STATS_CHART_SPEC.options?.heightPx,
  functions: [],
  features: [],
  metadata: {},
};

export function diagramAlignmentClass(alignment?: DiagramAlignment) {
  if (alignment === "left") return "justify-start";
  if (alignment === "right") return "justify-end";
  return "justify-center";
}

export function normalizeDiagramTextSide(value: unknown): DiagramTextSide {
  return value === "left" || value === "right" ? value : "none";
}

export function automaticDiagramTextSide(alignment?: DiagramAlignment): DiagramTextSide {
  if (alignment === "left") return "right";
  if (alignment === "right") return "left";
  return "none";
}

export function effectiveDiagramTextSide(block: { diagramAlign?: DiagramAlignment }, hasBesideContent: boolean): DiagramTextSide {
  if (!hasBesideContent) return "none";
  return automaticDiagramTextSide(block.diagramAlign);
}

export function normalizeDiagramType(type?: string | null) {
  if (type === "2d_graph" || type === "function" || type === "tangent" || type === "area") return "graph2d";
  if (type === "basic3d") return "graph3d";
  return SUPPORTED_DIAGRAM_TYPES.has(String(type)) ? String(type) : DEFAULT_2D_GRAPH.type;
}

export function isPenroseDiagramType(type?: string | null) {
  return type === "geometricConstruction" || type === "network" || type === "setDiagram";
}

export function defaultPenrosePresetForType(type?: string | null) {
  return normalizeDiagramType(type) === "setDiagram" ? SETS_PENROSE_PRESET : DEFAULT_PENROSE_PRESET;
}

export function defaultPenroseDataForType(type?: string | null) {
  const normalizedType = normalizeDiagramType(type);
  if (normalizedType === "setDiagram") return DEFAULT_SET_DATA;
  if (normalizedType === "network") return DEFAULT_NETWORK_DATA;
  return DEFAULT_GEOMETRIC_DATA;
}

export function defaultPenroseDiagramForType(type?: string | null): GraphConfig {
  const normalizedType = isPenroseDiagramType(normalizeDiagramType(type)) ? normalizeDiagramType(type) : "geometricConstruction";
  if (normalizedType === "setDiagram") return { ...DEFAULT_SET_DIAGRAM };
  const preset = defaultPenrosePresetForType(normalizedType);
  return {
    ...DEFAULT_GEOMETRIC_DIAGRAM,
    type: normalizedType,
    data: defaultPenroseDataForType(normalizedType),
    style: preset,
    options: { scalePercent: DEFAULT_PENROSE_SCALE_PERCENT, penrosePreset: preset },
    penrosePreset: preset,
  };
}

export function isImageDiagramType(type?: string | null) {
  return normalizeDiagramType(type) === "image";
}

export function diagramTypePatch(type: string, current: GraphConfig): Partial<GraphConfig> {
  const normalizedType = normalizeDiagramType(type);
  if (isImageDiagramType(normalizedType)) return DEFAULT_IMAGE_DIAGRAM;
  if (isPenroseDiagramType(normalizedType)) return defaultPenroseDiagramForType(normalizedType);
  if (normalizedType === "statsChart") return DEFAULT_STATS_CHART;
  if (normalizedType === "geometry2d" && normalizeDiagramType(current.type) !== "geometry2d") return DEFAULT_GEOMETRY_2D_GRAPH;
  if (
    isImageDiagramType(current.type) ||
    isPenroseDiagramType(normalizeDiagramType(current.type)) ||
    normalizeDiagramType(current.type) === "statsChart"
  ) {
    if (normalizedType === "vector2d") return DEFAULT_VECTOR_2D_GRAPH;
    return normalizedType === "graph3d" ? DEFAULT_3D_GRAPH : { ...DEFAULT_2D_GRAPH, type: normalizedType };
  }
  if (normalizedType === "vector2d" && normalizeDiagramType(current.type) !== "vector2d") return DEFAULT_VECTOR_2D_GRAPH;
  if (normalizedType === "graph3d" && normalizeDiagramType(current.type) !== "graph3d") return DEFAULT_3D_GRAPH;
  if (normalizedType === "geometry2d") return DEFAULT_GEOMETRY_2D_GRAPH;
  return { type: normalizedType };
}

export function withGraphDefaults(graphConfig?: GraphConfig | null): GraphConfig {
  const type = normalizeDiagramType(graphConfig?.type);
  if (type === "geometry2d") {
    return {
      ...DEFAULT_GEOMETRY_2D_GRAPH,
      ...(graphConfig ?? {}),
      type,
      data: geometry2dData(graphConfig),
      functions: [],
      features: [],
      metadata: graphConfig?.metadata ?? {},
    };
  }
  const functions = graphFunctionsFromConfig(graphConfig);
  const features = graphFeaturesFromConfig(graphConfig);
  const firstFunction = functions[0];
  if (isPenroseDiagramType(type)) {
    const defaults = defaultPenroseDiagramForType(type);
    return {
      ...defaults,
      ...(graphConfig ?? {}),
      type,
      data: graphConfig?.data ?? defaults.data,
      style: penrosePreset(graphConfig),
      options: penroseOptions(graphConfig),
      functions: graphConfig?.functions ?? [],
      features: graphConfig?.features ?? [],
      widthPx: undefined,
      heightPx: undefined,
      scalePercent: penroseScalePercent(graphConfig),
      penrosePreset: penrosePreset(graphConfig),
      metadata: graphConfig?.metadata ?? {},
    };
  }
  if (type === "statsChart") {
    const spec = normalizeStatsChartSpec(graphConfig);
    return {
      ...DEFAULT_STATS_CHART,
      ...(graphConfig ?? {}),
      type,
      data: spec.data,
      style: spec.style,
      options: spec.options,
      widthPx: spec.options?.widthPx,
      heightPx: spec.options?.heightPx,
      functions: [],
      features: [],
      metadata: graphConfig?.metadata ?? {},
    };
  }
  if (type === "image") {
    return {
      ...DEFAULT_IMAGE_DIAGRAM,
      ...(graphConfig ?? {}),
      type,
      data: imageDiagramData(graphConfig),
      functions: [],
      features: [],
      widthPx: finiteGraphNumber(graphConfig?.widthPx, DEFAULT_IMAGE_DIAGRAM.widthPx),
      heightPx: finiteGraphNumber(graphConfig?.heightPx, DEFAULT_IMAGE_DIAGRAM.heightPx),
      metadata: graphConfig?.metadata ?? {},
    };
  }
  if (type === "vector2d") {
    return {
      ...DEFAULT_VECTOR_2D_GRAPH,
      ...(graphConfig ?? {}),
      type,
      functions: [],
      features: [],
      metadata: graphConfig?.metadata ?? DEFAULT_VECTOR_2D_METADATA,
    };
  }
  if (type === "graph3d") {
    return {
      ...DEFAULT_3D_GRAPH,
      ...(graphConfig ?? {}),
      type,
      functions: [],
      features: [],
      metadata: {
        ...DEFAULT_3D_GRAPH.metadata,
        ...(graphConfig?.metadata ?? {}),
      },
    };
  }
  return {
    ...DEFAULT_2D_GRAPH,
    ...(graphConfig ?? {}),
    type,
    expression: graphConfig?.expression ?? firstFunction?.expression ?? DEFAULT_2D_GRAPH.expression,
    latex: graphConfig?.latex ?? firstFunction?.latex ?? DEFAULT_2D_GRAPH.latex,
    functions,
    features,
    functionExtensionLeft: graphConfig?.functionExtensionLeft ?? graphConfig?.functionExtension ?? DEFAULT_2D_GRAPH.functionExtensionLeft,
    functionExtensionRight:
      graphConfig?.functionExtensionRight ?? graphConfig?.functionExtension ?? DEFAULT_2D_GRAPH.functionExtensionRight,
    metadata: graphConfig?.metadata ?? {},
  };
}

export function updateGraphConfig(graphConfig: GraphConfig, patch: Partial<GraphConfig>): GraphConfig {
  const base = withGraphDefaults(graphConfig);
  const next = {
    ...base,
    ...patch,
    functions: patch.functions ? graphFunctionsFromConfig({ ...graphConfig, functions: patch.functions }) : base.functions,
    features: patch.features ? graphFeaturesFromConfig({ ...graphConfig, features: patch.features }) : base.features,
    metadata: patch.metadata ?? graphConfig.metadata ?? {},
  };
  if (patch.functions) {
    next.expression = next.functions?.[0]?.expression ?? "";
    next.latex = next.functions?.[0]?.latex || next.functions?.[0]?.expression || "";
  }
  return next;
}
