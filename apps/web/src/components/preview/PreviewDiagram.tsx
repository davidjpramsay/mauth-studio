import type { GraphConfig } from "@mauth-studio/shared";

import { GeometricConstructionDiagram } from "@/components/diagrams/GeometricConstructionDiagram";
import { StatsChartDiagram } from "@/components/diagrams/StatsChartDiagram";
import { Basic3DGraph } from "@/components/graphs/Basic3DGraph";
import { FunctionGraph } from "@/components/graphs/FunctionGraph";
import { Vector2DGraph } from "@/components/graphs/Vector2DGraph";
import { graphHeight, graphWidth, isSolutionOnlyGraphFeature } from "@/lib/diagramGraph2d";
import { imageDiagramAlt, imageDiagramData } from "@/lib/diagramImage";
import { previewGraphConfigForSolutionVisibility } from "@/lib/previewDiagramVisibility";

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

function UploadedImageDiagram({
  graphConfig,
  withGraphDefaults,
}: {
  graphConfig?: GraphConfig | null;
  withGraphDefaults: (graphConfig?: GraphConfig | null) => GraphConfig;
}) {
  const config = withGraphDefaults(graphConfig);
  const data = imageDiagramData(config);
  const widthPx = graphWidth(config);
  const heightPx = graphHeight(config);

  if (!data.src) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-slate-300 bg-white text-xs text-slate-500"
        style={{ width: widthPx, maxWidth: "100%", height: heightPx }}
      >
        No image selected
      </div>
    );
  }

  return (
    <img
      className="block max-w-full bg-white object-contain"
      src={data.src}
      alt={imageDiagramAlt(config)}
      style={{ width: widthPx, height: "auto", maxHeight: heightPx }}
    />
  );
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
  const hasHiddenSolutionFeatures = !showSolutions && Boolean(baseConfig.features?.some(isSolutionOnlyGraphFeature));
  const config = previewGraphConfigForSolutionVisibility(baseConfig, showSolutions, isSolutionOnlyGraphFeature);
  const visibleGraphConfigChange = hasHiddenSolutionFeatures ? undefined : onGraphConfigChange;
  const solutionColor = solutionTone && showSolutions ? TEST_SOLUTION_COLOR : undefined;
  const solutionFeatureColor = showSolutions ? TEST_SOLUTION_COLOR : undefined;

  if (measureOnly) {
    return <div className="w-full overflow-hidden bg-white" style={{ height: graphHeight(config), maxWidth: graphWidth(config) }} />;
  }

  switch (config.type) {
    case "image":
      return <UploadedImageDiagram graphConfig={config} withGraphDefaults={withGraphDefaults} />;
    case "geometricConstruction":
    case "network":
    case "setDiagram":
      return <GeometricConstructionDiagram graphConfig={config} />;
    case "statsChart":
      return <StatsChartDiagram graphConfig={config} />;
    case "geometry2d":
      return <FunctionGraph graphConfig={config} previewAnchor={anchor} onGraphConfigChange={visibleGraphConfigChange} />;
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
          onGraphConfigChange={visibleGraphConfigChange}
        />
      );
  }
}
