import type { GraphConfig, GraphFeature } from "@mauth-studio/shared";

import { graphFeatureReferencesFunction, isSolutionOnlyGraphFunction } from "./diagramGraph2d.ts";
import {
  geometry2dConfigWithLabelPosition,
  geometry2dData,
  geometry2dDataForSolutionVisibility,
  geometry2dPatch,
  type Geometry2DLabelPrimitiveKind,
} from "./diagramGeometry2d.ts";
import { graph3dConfigForSolutionVisibility } from "./diagramGraph3d.ts";
import { statsChartConfigForSolutionVisibility } from "./diagramStatsChart.ts";
import { vector2dConfigForSolutionVisibility, vector2dConfigWithLabelPosition, type Vector2DElementKind } from "./diagramVector2d.ts";

export type GraphLabelPositionChange = { x: number; y: number } & (
  | { kind: "geometry2d"; primitiveKind: Geometry2DLabelPrimitiveKind; id: string }
  | { kind: "vector2d"; elementKind: Vector2DElementKind; id: string }
  | { kind: "function"; index: number }
  | { kind: "feature" | "free-label"; index: number }
);

// Label moves are presentation edits against the full document, even when
// the rendered Student view omits answer elements. Never save that filtered view.
export function graphConfigWithLabelPosition(graphConfig: GraphConfig, visibleConfig: GraphConfig, change: GraphLabelPositionChange) {
  if (!Number.isFinite(change.x) || !Number.isFinite(change.y)) return graphConfig;
  const x = Number(change.x.toFixed(6));
  const y = Number(change.y.toFixed(6));
  if (change.kind === "geometry2d") {
    return geometry2dConfigWithLabelPosition(graphConfig, change.primitiveKind, change.id, x, y);
  }
  if (change.kind === "vector2d") {
    return vector2dConfigWithLabelPosition(graphConfig, change.elementKind, change.id, x, y);
  }
  if (change.kind === "function") {
    const functions =
      graphConfig.functions ??
      (graphConfig.expression ? [{ expression: graphConfig.expression, latex: graphConfig.latex, label: "f" }] : []);
    if (!functions[change.index]) return graphConfig;
    return {
      ...graphConfig,
      functions: functions.map((item, index) => (index === change.index ? { ...item, labelX: x, labelY: y } : item)),
    };
  }
  const visibleFeature = visibleConfig.features?.[change.index];
  if (!visibleFeature) return graphConfig;
  const targetIndex = graphConfig.features?.indexOf(visibleFeature) ?? -1;
  if (targetIndex < 0) return graphConfig;
  const patch = change.kind === "free-label" ? { x, y } : { labelX: x, labelY: y };
  return {
    ...graphConfig,
    features: graphConfig.features?.map((item, index) => (index === targetIndex ? { ...item, ...patch } : item)),
  };
}

export function graphConfigWithPresentationPatch(graphConfig: GraphConfig, patch: Partial<GraphConfig>) {
  return { ...graphConfig, ...patch };
}

export function previewGraphConfigForSolutionVisibility(
  graphConfig: GraphConfig,
  showSolutions: boolean,
  isSolutionOnlyFeature: (feature: GraphFeature) => boolean,
) {
  if (showSolutions) return graphConfig;
  const solutionFunctionIndexes = new Set<number>();
  graphConfig.functions?.forEach((graphFunction, index) => {
    if (isSolutionOnlyGraphFunction(graphFunction)) solutionFunctionIndexes.add(index);
  });
  const hasSolutionFeatures = graphConfig.features?.some(isSolutionOnlyFeature) ?? false;
  if (!solutionFunctionIndexes.size && !hasSolutionFeatures) return graphConfig;
  return {
    ...graphConfig,
    ...(solutionFunctionIndexes.size
      ? {
          functions: graphConfig.functions?.map((graphFunction, index) =>
            solutionFunctionIndexes.has(index) ? { ...graphFunction, show: false, showLabel: false } : graphFunction,
          ),
        }
      : {}),
    ...(graphConfig.features
      ? {
          features: graphConfig.features.filter(
            (feature) =>
              !isSolutionOnlyFeature(feature) &&
              ![...solutionFunctionIndexes].some((functionIndex) => graphFeatureReferencesFunction(feature, functionIndex)),
          ),
        }
      : {}),
  };
}

export function previewGeometry2DConfigForSolutionVisibility(graphConfig: GraphConfig, showSolutions: boolean, solutionColor?: string) {
  if (graphConfig.type !== "geometry2d") return graphConfig;
  const data = geometry2dData(graphConfig);
  const visibleData = geometry2dDataForSolutionVisibility(data, showSolutions, solutionColor);
  if (visibleData === data) return graphConfig;
  return { ...graphConfig, ...geometry2dPatch(graphConfig, visibleData) };
}

export function previewVector2DConfigForSolutionVisibility(graphConfig: GraphConfig, showSolutions: boolean, solutionColor?: string) {
  return vector2dConfigForSolutionVisibility(graphConfig, showSolutions, solutionColor);
}

export function previewGraph3DConfigForSolutionVisibility(graphConfig: GraphConfig, showSolutions: boolean, solutionColor?: string) {
  return graph3dConfigForSolutionVisibility(graphConfig, showSolutions, solutionColor);
}

export function previewStatsChartConfigForSolutionVisibility(graphConfig: GraphConfig, showSolutions: boolean, solutionColor?: string) {
  return statsChartConfigForSolutionVisibility(graphConfig, showSolutions, solutionColor);
}
