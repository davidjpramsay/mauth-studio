import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import { DEFAULT_3D_GRAPH, DEFAULT_3D_VIEW_STATE } from "../../lib/diagram3d";
import type { SelectedEditorBlock } from "../../lib/editorBlockSelection";
import { graph3dInspectorSelection } from "../../lib/graph3dInspectorSelection";
import { graph3dResetViewPatch, graph3dViewPatch } from "../../lib/moduleSettingsPatches";
import { Button } from "../ui/button";
import { NumericExpressionInput } from "./NumericExpressionInput";

interface Graph3DSelectionInspectorProps {
  selectedBlock: SelectedEditorBlock;
  selectedDiagramConfig: GraphConfig;
  controlClassName: string;
  onBlockChange: (selection: SelectedEditorBlock, patch: Partial<ContentBlock>) => void;
  updateGraphConfig: (graphConfig: GraphConfig, patch: Partial<GraphConfig>) => GraphConfig;
}

export function Graph3DSelectionInspector({
  selectedBlock,
  selectedDiagramConfig,
  controlClassName,
  onBlockChange,
  updateGraphConfig,
}: Graph3DSelectionInspectorProps) {
  const selection = graph3dInspectorSelection(selectedDiagramConfig);
  const updateCanvas = (patch: Partial<GraphConfig>) =>
    onBlockChange(selectedBlock, { graphConfig: updateGraphConfig(selectedDiagramConfig, patch) });

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{selection.title}</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Width
          <NumericExpressionInput
            min={240}
            step={10}
            value={selection.widthPx}
            fallbackValue={DEFAULT_3D_GRAPH.widthPx}
            ariaLabel={`${selectedBlock.label} 3D width`}
            onValueChange={(value) => updateCanvas({ widthPx: value ?? DEFAULT_3D_GRAPH.widthPx })}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Height
          <NumericExpressionInput
            min={180}
            step={10}
            value={selection.heightPx}
            fallbackValue={DEFAULT_3D_GRAPH.heightPx}
            ariaLabel={`${selectedBlock.label} 3D height`}
            onValueChange={(value) => updateCanvas({ heightPx: value ?? DEFAULT_3D_GRAPH.heightPx })}
            className={controlClassName}
          />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Azimuth
          <NumericExpressionInput
            step={1}
            value={selection.view.az}
            fallbackValue={DEFAULT_3D_VIEW_STATE.az}
            ariaLabel={`${selectedBlock.label} 3D azimuth`}
            onValueChange={(value) => updateCanvas(graph3dViewPatch(selectedDiagramConfig, { az: value ?? DEFAULT_3D_VIEW_STATE.az }))}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Elevation
          <NumericExpressionInput
            step={1}
            value={selection.view.el}
            fallbackValue={DEFAULT_3D_VIEW_STATE.el}
            ariaLabel={`${selectedBlock.label} 3D elevation`}
            onValueChange={(value) => updateCanvas(graph3dViewPatch(selectedDiagramConfig, { el: value ?? DEFAULT_3D_VIEW_STATE.el }))}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Bank
          <NumericExpressionInput
            step={1}
            value={selection.view.bank}
            fallbackValue={DEFAULT_3D_VIEW_STATE.bank}
            ariaLabel={`${selectedBlock.label} 3D bank`}
            onValueChange={(value) => updateCanvas(graph3dViewPatch(selectedDiagramConfig, { bank: value ?? DEFAULT_3D_VIEW_STATE.bank }))}
            className={controlClassName}
          />
        </label>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => updateCanvas(graph3dResetViewPatch(selectedDiagramConfig))}
      >
        Reset view
      </Button>
    </div>
  );
}
