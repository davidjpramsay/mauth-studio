import type { GraphConfig, GraphFeature } from "@mauth-studio/shared";

import { graphFeatureReferencesFunction, isSolutionOnlyGraphFunction } from "./diagramGraph2d.ts";
import { geometry2dData, geometry2dDataForSolutionVisibility, geometry2dPatch } from "./diagramGeometry2d.ts";
import { graph3dConfigForSolutionVisibility } from "./diagramGraph3d.ts";
import { statsChartConfigForSolutionVisibility } from "./diagramStatsChart.ts";
import { vector2dConfigForSolutionVisibility } from "./diagramVector2d.ts";

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
