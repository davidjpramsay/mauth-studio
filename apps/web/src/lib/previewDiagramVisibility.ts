import type { GraphConfig, GraphFeature } from "@mauth-studio/shared";

export function previewGraphConfigForSolutionVisibility(
  graphConfig: GraphConfig,
  showSolutions: boolean,
  isSolutionOnlyFeature: (feature: GraphFeature) => boolean,
) {
  if (showSolutions || !graphConfig.features?.some(isSolutionOnlyFeature)) return graphConfig;
  return {
    ...graphConfig,
    features: graphConfig.features.filter((feature) => !isSolutionOnlyFeature(feature)),
  };
}
