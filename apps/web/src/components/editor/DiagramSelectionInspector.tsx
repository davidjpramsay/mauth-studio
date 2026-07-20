import type { ContentBlock, DiagramAlignment, GraphConfig } from "@mauth-studio/shared";

import { normalizeDiagramAlignment } from "../../lib/contentBlockNormalization";
import { diagramInspectorShowsBaseSettings } from "../../lib/diagramInspectorRouting";
import type { SelectedEditorBlock } from "../../lib/editorBlockSelection";
import type { SelectedGeometryChild } from "../../lib/geometry2dInspectorSelection";
import type { graph2dInspectorSelection } from "../../lib/graph2dInspectorSelection";
import { isInspectorPenroseDiagramType } from "../../lib/moduleSettingsPatches";
import { Geometry2DInspector } from "./Geometry2DSelectionInspector";
import { Graph2DSelectionInspector } from "./Graph2DSelectionInspector";
import { Graph3DSelectionInspector } from "./Graph3DSelectionInspector";
import { ImageSelectionInspector } from "./ImageSelectionInspector";
import { PenroseSelectionInspector } from "./PenroseSelectionInspector";
import { StatsChartSelectionInspector } from "./StatsChartSelectionInspector";
import { Vector2DSelectionInspector } from "./Vector2DSelectionInspector";
import { DIAGRAM_ALIGNMENTS, DIAGRAM_TYPES, DIAGRAM_TYPE_GROUPS } from "./editorOptions";

interface DiagramSelectionInspectorProps {
  selectedBlock: SelectedEditorBlock;
  selectedDiagramBlock: Extract<ContentBlock, { kind: "diagram" }>;
  selectedDiagramConfig: GraphConfig;
  selectedGraphSelection: ReturnType<typeof graph2dInspectorSelection> | null;
  selectedGeometryChild: SelectedGeometryChild | null;
  activeAnchor?: string;
  controlClassName: string;
  checkboxLabelClassName: string;
  onActivateAnchor?: (anchor: string) => void;
  onBlockChange: (selection: SelectedEditorBlock, patch: Partial<ContentBlock>) => void;
  diagramTypePatch: (type: string, current: GraphConfig) => Partial<GraphConfig>;
  updateGraphConfig: (graphConfig: GraphConfig, patch: Partial<GraphConfig>) => GraphConfig;
}

export function DiagramSelectionInspector({
  selectedBlock,
  selectedDiagramBlock,
  selectedDiagramConfig,
  selectedGraphSelection,
  selectedGeometryChild,
  activeAnchor,
  controlClassName,
  checkboxLabelClassName,
  onActivateAnchor,
  onBlockChange,
  diagramTypePatch,
  updateGraphConfig,
}: DiagramSelectionInspectorProps) {
  const showBaseSettings = diagramInspectorShowsBaseSettings({
    hasSelectedFunction: Boolean(selectedGraphSelection?.selectedFunction),
    hasSelectedFeature: Boolean(selectedGraphSelection?.selectedFeature),
    hasSelectedGeometryChild: Boolean(selectedGeometryChild),
  });

  return (
    <div className="space-y-3 p-3">
      {showBaseSettings ? (
        <>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Type
            <select
              value={selectedDiagramConfig.type ?? "graph2d"}
              aria-label={`${selectedBlock.label} type`}
              onChange={(event) =>
                onBlockChange(selectedBlock, {
                  graphConfig: updateGraphConfig(selectedDiagramConfig, diagramTypePatch(event.target.value, selectedDiagramConfig)),
                })
              }
              className={controlClassName}
            >
              {DIAGRAM_TYPE_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.values.map((value) => {
                    const diagramType = DIAGRAM_TYPES.find((candidate) => candidate.value === value);
                    if (!diagramType) return null;
                    return (
                      <option key={diagramType.value} value={diagramType.value}>
                        {diagramType.label}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Position
            <select
              value={normalizeDiagramAlignment(selectedDiagramBlock.diagramAlign)}
              aria-label={`${selectedBlock.label} position`}
              onChange={(event) => onBlockChange(selectedBlock, { diagramAlign: event.target.value as DiagramAlignment })}
              className={controlClassName}
            >
              {DIAGRAM_ALIGNMENTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      {selectedDiagramConfig.type === "geometry2d" ? (
        <Geometry2DInspector
          selectedBlock={selectedBlock}
          selectedDiagramConfig={selectedDiagramConfig}
          controlClassName={controlClassName}
          checkboxLabelClassName={checkboxLabelClassName}
          selectedGeometryChild={selectedGeometryChild}
          activeAnchor={activeAnchor}
          onActivateAnchor={onActivateAnchor}
          onBlockChange={onBlockChange}
          updateGraphConfig={updateGraphConfig}
        />
      ) : isInspectorPenroseDiagramType(selectedDiagramConfig.type) ? (
        <PenroseSelectionInspector
          selectedBlock={selectedBlock}
          selectedDiagramConfig={selectedDiagramConfig}
          controlClassName={controlClassName}
          checkboxLabelClassName={checkboxLabelClassName}
          onBlockChange={onBlockChange}
          updateGraphConfig={updateGraphConfig}
        />
      ) : selectedDiagramConfig.type === "image" ? (
        <ImageSelectionInspector
          selectedBlock={selectedBlock}
          selectedDiagramConfig={selectedDiagramConfig}
          controlClassName={controlClassName}
          onBlockChange={onBlockChange}
          updateGraphConfig={updateGraphConfig}
        />
      ) : selectedDiagramConfig.type === "graph2d" && selectedGraphSelection ? (
        <Graph2DSelectionInspector
          selectedBlock={selectedBlock}
          selectedDiagramConfig={selectedDiagramConfig}
          selection={selectedGraphSelection}
          controlClassName={controlClassName}
          checkboxLabelClassName={checkboxLabelClassName}
          onBlockChange={onBlockChange}
          updateGraphConfig={updateGraphConfig}
        />
      ) : selectedDiagramConfig.type === "vector2d" ? (
        <Vector2DSelectionInspector
          selectedBlock={selectedBlock}
          selectedDiagramConfig={selectedDiagramConfig}
          controlClassName={controlClassName}
          checkboxLabelClassName={checkboxLabelClassName}
          onBlockChange={onBlockChange}
          updateGraphConfig={updateGraphConfig}
        />
      ) : selectedDiagramConfig.type === "graph3d" ? (
        <Graph3DSelectionInspector
          selectedBlock={selectedBlock}
          selectedDiagramConfig={selectedDiagramConfig}
          controlClassName={controlClassName}
          onBlockChange={onBlockChange}
          updateGraphConfig={updateGraphConfig}
        />
      ) : selectedDiagramConfig.type === "statsChart" ? (
        <StatsChartSelectionInspector
          selectedBlock={selectedBlock}
          selectedDiagramConfig={selectedDiagramConfig}
          controlClassName={controlClassName}
          checkboxLabelClassName={checkboxLabelClassName}
          onBlockChange={onBlockChange}
          updateGraphConfig={updateGraphConfig}
        />
      ) : null}
    </div>
  );
}
