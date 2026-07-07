import type { ReactNode } from "react";
import type { DiagramAlignment, GraphConfig } from "@mauth-studio/shared";

import { InlineSummaryTitle } from "@/components/MathText";
import { DiagramBlockPanel } from "@/components/editor/DiagramBlockPanel";
import { FunctionGraphEditor } from "@/components/editor/FunctionGraphEditor";
import { GeometricConstructionEditor } from "@/components/editor/GeometricConstructionEditor";
import { Geometry2DGraphEditor } from "@/components/editor/Geometry2DGraphEditor";
import { Graph3DGraphEditor } from "@/components/editor/Graph3DGraphEditor";
import { ImageDiagramEditor } from "@/components/editor/ImageDiagramEditor";
import { NetworkDiagramEditor } from "@/components/editor/NetworkDiagramEditor";
import { SetDiagramEditor } from "@/components/editor/SetDiagramEditor";
import { StatsChartEditor } from "@/components/editor/StatsChartEditor";
import { Vector2DGraphEditor } from "@/components/editor/Vector2DGraphEditor";
import { CHOICE_NUMBERING_STYLES, DIAGRAM_ALIGNMENTS, DIAGRAM_TYPES, DIAGRAM_TYPE_GROUPS } from "@/components/editor/editorOptions";
import { penroseSubstanceSource } from "@/lib/diagramPenroseSubstance";
import { createEditorBlockSummaryRuntime } from "@/lib/editorBlockSummaries";
import {
  diagramTypePatch,
  isPenroseDiagramType,
  normalizeDiagramType,
  updateGraphConfig,
  withGraphDefaults,
} from "@/lib/editorDiagramConfig";

interface DiagramBlockEditorProps {
  label: string;
  graphConfig: GraphConfig;
  alignment?: DiagramAlignment;
  showSolutions?: boolean;
  settingsMode?: "inline" | "inspector";
  anchor?: string;
  activeAnchor?: string;
  dragHandle?: ReactNode;
  muted?: boolean;
  active?: boolean;
  openSignal?: number;
  onActivateAnchor?: (anchor: string) => void;
  onChange: (graphConfig: GraphConfig) => void;
  onAlignmentChange: (alignment: DiagramAlignment) => void;
  onRemove: () => void;
}

const { diagramConfigSummary } = createEditorBlockSummaryRuntime({
  withGraphDefaults,
  normalizeDiagramType,
  diagramTypes: DIAGRAM_TYPES,
  choiceNumberingStyles: CHOICE_NUMBERING_STYLES,
});

export function DiagramBlockEditor({
  label,
  graphConfig,
  alignment = "center",
  showSolutions = true,
  settingsMode = "inline",
  anchor,
  activeAnchor,
  dragHandle,
  muted = false,
  active = false,
  openSignal,
  onActivateAnchor,
  onChange,
  onAlignmentChange,
  onRemove,
}: DiagramBlockEditorProps) {
  const config = withGraphDefaults(graphConfig);
  const patchConfig = (patch: Partial<GraphConfig>) => onChange(updateGraphConfig(config, patch));
  const renderDiagramPanel = (summary: string, bodyClassName: string, children: ReactNode) => (
    <DiagramBlockPanel
      label={label}
      title={<InlineSummaryTitle label={label} summary={summary} />}
      type={config.type ?? "graph2d"}
      alignment={alignment}
      diagramTypes={DIAGRAM_TYPES}
      diagramTypeGroups={DIAGRAM_TYPE_GROUPS}
      diagramAlignments={DIAGRAM_ALIGNMENTS}
      settingsMode={settingsMode}
      dragHandle={dragHandle}
      muted={muted}
      active={active}
      openSignal={openSignal}
      bodyClassName={bodyClassName}
      onTypeChange={(type) => patchConfig(diagramTypePatch(type, config))}
      onAlignmentChange={onAlignmentChange}
      onRemove={onRemove}
    >
      {children}
    </DiagramBlockPanel>
  );

  if (config.type === "image") {
    return renderDiagramPanel(diagramConfigSummary(config), "p-3", <ImageDiagramEditor config={config} onChange={patchConfig} />);
  }

  if (isPenroseDiagramType(config.type)) {
    return renderDiagramPanel(
      diagramConfigSummary(config),
      "p-3",
      config.type === "network" ? (
        <NetworkDiagramEditor
          config={config}
          substanceSource={penroseSubstanceSource(config)}
          settingsMode={settingsMode}
          onChange={patchConfig}
        />
      ) : config.type === "setDiagram" ? (
        <SetDiagramEditor config={config} settingsMode={settingsMode} onChange={patchConfig} />
      ) : (
        <GeometricConstructionEditor
          config={config}
          substanceSource={penroseSubstanceSource(config)}
          settingsMode={settingsMode}
          onChange={patchConfig}
        />
      ),
    );
  }

  if (config.type === "geometry2d") {
    return renderDiagramPanel(
      diagramConfigSummary(config),
      "graph-editor-controls p-3",
      <Geometry2DGraphEditor
        config={config}
        anchor={anchor}
        activeAnchor={activeAnchor}
        onActivateAnchor={onActivateAnchor}
        onChange={patchConfig}
      />,
    );
  }

  if (config.type === "vector2d") {
    return renderDiagramPanel(
      diagramConfigSummary(config),
      "graph-editor-controls p-3",
      <Vector2DGraphEditor config={config} settingsMode={settingsMode} onChange={patchConfig} />,
    );
  }

  if (config.type === "graph3d") {
    return renderDiagramPanel(
      diagramConfigSummary(config),
      "graph-editor-controls p-3",
      <Graph3DGraphEditor config={config} settingsMode={settingsMode} onChange={patchConfig} />,
    );
  }

  if (config.type === "statsChart") {
    return renderDiagramPanel(
      diagramConfigSummary(config),
      "p-3",
      <StatsChartEditor config={config} settingsMode={settingsMode} onChange={patchConfig} />,
    );
  }

  return renderDiagramPanel(
    diagramConfigSummary(config),
    "graph-editor-controls p-3",
    <FunctionGraphEditor
      config={config}
      showSolutions={showSolutions}
      settingsMode={settingsMode}
      anchor={anchor}
      activeAnchor={activeAnchor}
      onActivateAnchor={onActivateAnchor}
      onChange={patchConfig}
    />,
  );
}
