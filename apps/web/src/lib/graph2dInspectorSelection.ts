import type { GraphConfig, GraphFeature, GraphFunction } from "@mauth-studio/shared";

import {
  GRAPH_ANGLE_MARKER_LABEL_MODES,
  GRAPH_FEATURE_LABEL_MODES,
  GRAPH_FEATURE_TYPES,
  GRAPH_REGION_LABEL_MODES,
  GRAPH_TANGENT_LABEL_MODES,
  isRegionFeatureKind,
} from "./diagramGraph2d.ts";

export type SelectedGraphChild = { kind: "function" | "feature"; index: number };

export interface SelectedGraphFunction {
  graphFunction: GraphFunction;
  functionIndex: number;
}

export interface SelectedGraphFeature {
  feature: GraphFeature;
  featureIndex: number;
}

export interface Graph2DInspectorSelection {
  functions: readonly GraphFunction[];
  features: readonly GraphFeature[];
  child: SelectedGraphChild | null;
  selectedFunction: SelectedGraphFunction | null;
  selectedFeature: SelectedGraphFeature | null;
  title: string | null;
  summary: string | null;
}

export function graphFeatureTypeLabel(kind?: GraphFeature["kind"]) {
  return GRAPH_FEATURE_TYPES.find((type) => type.value === kind)?.label ?? "Feature";
}

export function graphFunctionInspectorLabel(graphFunction: GraphFunction, index: number) {
  return `${graphFunction.kind === "relation" ? "Relation" : "Function"} ${index + 1}`;
}

export function graphFeatureInspectorLabel(feature: GraphFeature, index: number) {
  const typeLabel = graphFeatureTypeLabel(feature.kind);
  const label = feature.label?.trim();
  return label ? `${typeLabel} ${index + 1}: ${label}` : `${typeLabel} ${index + 1}`;
}

export function graphFunctionPatch(functions: readonly GraphFunction[], functionIndex: number, patch: Partial<GraphFunction>) {
  return functions.map((graphFunction, index) => (index === functionIndex ? { ...graphFunction, ...patch } : graphFunction));
}

export function graphFunctionSolutionOnlyPatch(functions: readonly GraphFunction[], functionIndex: number, solutionOnly: boolean) {
  return functions.map((graphFunction, index) => {
    if (index !== functionIndex) return graphFunction;
    if (solutionOnly) return { ...graphFunction, solutionOnly: true };
    const { solutionOnly: _solutionOnly, ...nextFunction } = graphFunction;
    return nextFunction;
  });
}

export function graphFeaturePatch(features: readonly GraphFeature[], featureIndex: number, patch: Partial<GraphFeature>) {
  return features.map((feature, index) => (index === featureIndex ? { ...feature, ...patch } : feature));
}

export function graphFeatureSolutionOnlyPatch(features: readonly GraphFeature[], featureIndex: number, solutionOnly: boolean) {
  return features.map((feature, index) => {
    if (index !== featureIndex) return feature;
    if (solutionOnly) return { ...feature, solutionOnly: true };
    const { solutionOnly: _solutionOnly, ...nextFeature } = feature;
    return nextFeature;
  });
}

export function graphFeatureLabelModeOptions(feature: GraphFeature) {
  if (feature.kind === "tangent") return GRAPH_TANGENT_LABEL_MODES;
  if (feature.kind === "angle_marker") return GRAPH_ANGLE_MARKER_LABEL_MODES;
  if (isRegionFeatureKind(feature.kind)) return GRAPH_REGION_LABEL_MODES;
  return GRAPH_FEATURE_LABEL_MODES;
}

export function selectedGraphChildFromAnchor(anchor?: string): SelectedGraphChild | null {
  const lastSegment = anchor?.split("/").at(-1) ?? "";
  if (lastSegment.startsWith("gf:")) {
    const index = Number(lastSegment.slice(3));
    return Number.isInteger(index) && index >= 0 ? { kind: "function", index } : null;
  }
  if (lastSegment.startsWith("gfeat:")) {
    const index = Number(lastSegment.slice(6));
    return Number.isInteger(index) && index >= 0 ? { kind: "feature", index } : null;
  }
  return null;
}

export function graph2dInspectorSelection(graphConfig: GraphConfig, activeAnchor?: string): Graph2DInspectorSelection {
  const functions = graphConfig.functions ?? [];
  const features = graphConfig.features ?? [];
  const child = selectedGraphChildFromAnchor(activeAnchor);
  const selectedFunction =
    child?.kind === "function" && child.index < functions.length
      ? { graphFunction: functions[child.index], functionIndex: child.index }
      : null;
  const selectedFeature =
    child?.kind === "feature" && child.index < features.length ? { feature: features[child.index], featureIndex: child.index } : null;

  return {
    functions,
    features,
    child,
    selectedFunction,
    selectedFeature,
    title: selectedFunction
      ? graphFunctionInspectorLabel(selectedFunction.graphFunction, selectedFunction.functionIndex)
      : selectedFeature
        ? graphFeatureInspectorLabel(selectedFeature.feature, selectedFeature.featureIndex)
        : null,
    summary: selectedFunction ? "Function display settings" : selectedFeature ? "Feature display settings" : null,
  };
}
