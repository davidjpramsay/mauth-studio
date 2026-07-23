import type { GraphConfig } from "@mauth-studio/shared";

import { GeometricConstructionDiagram } from "@/components/diagrams/GeometricConstructionDiagram";
import { ImageDiagramCanvas } from "@/components/diagrams/ImageDiagramCanvas";
import { StatsChartDiagram } from "@/components/diagrams/StatsChartDiagram";
import { Basic3DGraph } from "@/components/graphs/Basic3DGraph";
import { FunctionGraph } from "@/components/graphs/FunctionGraph";
import { Vector2DGraph } from "@/components/graphs/Vector2DGraph";
import { graphHeight, graphWidth, isSolutionOnlyGraphFeature, isSolutionOnlyGraphFunction } from "@/lib/diagramGraph2d";
import { geometry2dData, geometry2dDataHasSolutionOnly } from "@/lib/diagramGeometry2d";
import { vector2dConfigHasSolutionOnly } from "@/lib/diagramVector2d";
import { graph3dConfigHasSolutionOnly } from "@/lib/diagramGraph3d";
import { imageConfigForSolutionVisibility, imageConfigHasSolutionOnly } from "@/lib/diagramImage";
import { statsChartConfigHasSolutionOnly } from "@/lib/diagramStatsChart";
import { penroseConfigHasSolutionOnly } from "@/lib/diagramPenroseSolution";
import {
  previewGeometry2DConfigForSolutionVisibility,
  previewGraph3DConfigForSolutionVisibility,
  graphConfigWithPresentationPatch,
  previewGraphConfigForSolutionVisibility,
  previewStatsChartConfigForSolutionVisibility,
  previewVector2DConfigForSolutionVisibility,
} from "@/lib/previewDiagramVisibility";
import { previewPenroseConfigForSolutionVisibility } from "@/lib/diagramPenroseSolution";

const TEST_SOLUTION_COLOR = "#1d4ed8";

interface PreviewDiagramProps {
  graphConfig?: GraphConfig | null;
  anchor?: string;
  measureOnly?: boolean;
  showSolutions?: boolean;
  solutionTone?: boolean;
  onGraphConfigChange?: (graphConfig: GraphConfig) => void;
  withGraphDefaults: (graphConfig?: GraphConfig | null) => GraphConfig;
}

export function PreviewDiagram({
  graphConfig,
  anchor,
  measureOnly = false,
  showSolutions = true,
  solutionTone = false,
  onGraphConfigChange,
  withGraphDefaults,
}: PreviewDiagramProps) {
  const baseConfig = withGraphDefaults(graphConfig);
  const hasHiddenSolutionContent =
    !showSolutions &&
    (Boolean(baseConfig.functions?.some(isSolutionOnlyGraphFunction)) ||
      Boolean(baseConfig.features?.some(isSolutionOnlyGraphFeature)) ||
      (baseConfig.type === "geometry2d" && geometry2dDataHasSolutionOnly(geometry2dData(baseConfig))) ||
      (baseConfig.type === "vector2d" && vector2dConfigHasSolutionOnly(baseConfig)) ||
      (baseConfig.type === "graph3d" && graph3dConfigHasSolutionOnly(baseConfig)) ||
      (baseConfig.type === "statsChart" && statsChartConfigHasSolutionOnly(baseConfig)) ||
      (baseConfig.type === "image" && imageConfigHasSolutionOnly(baseConfig)) ||
      ((baseConfig.type === "geometricConstruction" || baseConfig.type === "network" || baseConfig.type === "setDiagram") &&
        penroseConfigHasSolutionOnly(baseConfig)));
  const featureVisibleConfig = previewGraphConfigForSolutionVisibility(baseConfig, showSolutions, isSolutionOnlyGraphFeature);
  const geometryVisibleConfig = previewGeometry2DConfigForSolutionVisibility(featureVisibleConfig, showSolutions, TEST_SOLUTION_COLOR);
  const vectorVisibleConfig = previewVector2DConfigForSolutionVisibility(geometryVisibleConfig, showSolutions, TEST_SOLUTION_COLOR);
  const graph3dVisibleConfig = previewGraph3DConfigForSolutionVisibility(vectorVisibleConfig, showSolutions, TEST_SOLUTION_COLOR);
  const statsVisibleConfig = previewStatsChartConfigForSolutionVisibility(graph3dVisibleConfig, showSolutions, TEST_SOLUTION_COLOR);
  const imageVisibleConfig = imageConfigForSolutionVisibility(statsVisibleConfig, showSolutions, TEST_SOLUTION_COLOR);
  const config = previewPenroseConfigForSolutionVisibility(imageVisibleConfig, showSolutions);
  const visibleGraphConfigChange = hasHiddenSolutionContent ? undefined : onGraphConfigChange;
  const axisLabelConfigPatch = onGraphConfigChange
    ? (patch: Partial<GraphConfig>) => onGraphConfigChange(graphConfigWithPresentationPatch(baseConfig, patch))
    : undefined;
  const solutionColor = solutionTone && showSolutions ? TEST_SOLUTION_COLOR : undefined;
  const solutionFeatureColor = showSolutions ? TEST_SOLUTION_COLOR : undefined;

  if (measureOnly) {
    return <div className="w-full overflow-hidden bg-white" style={{ height: graphHeight(config), maxWidth: graphWidth(config) }} />;
  }

  switch (config.type) {
    case "image":
      return <ImageDiagramCanvas graphConfig={config} />;
    case "geometricConstruction":
    case "network":
    case "setDiagram":
      return <GeometricConstructionDiagram graphConfig={config} />;
    case "statsChart":
      return <StatsChartDiagram graphConfig={config} />;
    case "geometry2d":
      return (
        <FunctionGraph
          graphConfig={config}
          previewAnchor={anchor}
          onGraphConfigChange={visibleGraphConfigChange}
          onGraphConfigPatch={axisLabelConfigPatch}
        />
      );
    case "vector2d":
      return <Vector2DGraph graphConfig={config} onGraphConfigChange={visibleGraphConfigChange} />;
    case "graph3d":
    case "basic3d":
      return <Basic3DGraph graphConfig={config} onGraphConfigChange={visibleGraphConfigChange} />;
    case "graph2d":
    case "2d_graph":
    case "function":
    default:
      return (
        <FunctionGraph
          graphConfig={config}
          previewAnchor={anchor}
          solutionColor={solutionColor}
          solutionFeatureColor={solutionFeatureColor}
          solutionFunctionColor={solutionFeatureColor}
          onGraphConfigChange={visibleGraphConfigChange}
          onGraphConfigPatch={axisLabelConfigPatch}
        />
      );
  }
}
