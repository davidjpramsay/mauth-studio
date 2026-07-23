import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import { DEFAULT_VECTOR_2D_GRAPH, type Vector2DLabelStyle } from "../../lib/diagramVector2d";
import type { SelectedEditorBlock } from "../../lib/editorBlockSelection";
import { vector2dLabelStylePatch } from "../../lib/moduleSettingsPatches";
import {
  vector2dAxesVisibilityPatch,
  vector2dGridVisibilityPatch,
  vector2dInspectorSelection,
  vector2dMajorGridStepPatch,
  vector2dMinorGridStepPatch,
} from "../../lib/vector2dInspectorSelection";
import { VECTOR_2D_LABEL_STYLES } from "./editorOptions";
import { NumericExpressionInput } from "./NumericExpressionInput";

interface Vector2DSelectionInspectorProps {
  selectedBlock: SelectedEditorBlock;
  selectedDiagramConfig: GraphConfig;
  controlClassName: string;
  checkboxLabelClassName: string;
  onBlockChange: (selection: SelectedEditorBlock, patch: Partial<ContentBlock>) => void;
  updateGraphConfig: (graphConfig: GraphConfig, patch: Partial<GraphConfig>) => GraphConfig;
}

export function Vector2DSelectionInspector({
  selectedBlock,
  selectedDiagramConfig,
  controlClassName,
  checkboxLabelClassName,
  onBlockChange,
  updateGraphConfig,
}: Vector2DSelectionInspectorProps) {
  const selection = vector2dInspectorSelection(selectedDiagramConfig);
  const updateCanvas = (patch: Partial<GraphConfig>) =>
    onBlockChange(selectedBlock, { graphConfig: updateGraphConfig(selectedDiagramConfig, patch) });

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{selection.title}</div>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
        Label style
        <select
          value={selection.labelStyle}
          aria-label={`${selectedBlock.label} vector label style`}
          onChange={(event) => updateCanvas(vector2dLabelStylePatch(selectedDiagramConfig, event.target.value as Vector2DLabelStyle))}
          className={controlClassName}
        >
          {VECTOR_2D_LABEL_STYLES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className={checkboxLabelClassName}>
        <input
          type="checkbox"
          checked={selection.showAxes}
          aria-label={`${selectedBlock.label} vector axes`}
          onChange={(event) => updateCanvas(vector2dAxesVisibilityPatch(selectedDiagramConfig, event.target.checked))}
        />
        Axes
      </label>
      <label className={checkboxLabelClassName}>
        <input
          type="checkbox"
          checked={selection.showGrid}
          aria-label={`${selectedBlock.label} vector grid`}
          onChange={(event) => updateCanvas(vector2dGridVisibilityPatch(event.target.checked))}
        />
        Grid
      </label>
      <label className={checkboxLabelClassName}>
        <input
          type="checkbox"
          checked={selection.equalScale}
          aria-label={`${selectedBlock.label} vector equal scale`}
          onChange={(event) => updateCanvas({ equalScale: event.target.checked })}
        />
        1:1 scale
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          i min
          <NumericExpressionInput
            step={1}
            value={selectedDiagramConfig.xMin}
            ariaLabel={`${selectedBlock.label} vector i min`}
            onValueChange={(value) => updateCanvas({ xMin: value ?? DEFAULT_VECTOR_2D_GRAPH.xMin })}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          i max
          <NumericExpressionInput
            step={1}
            value={selectedDiagramConfig.xMax}
            ariaLabel={`${selectedBlock.label} vector i max`}
            onValueChange={(value) => updateCanvas({ xMax: value ?? DEFAULT_VECTOR_2D_GRAPH.xMax })}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          j min
          <NumericExpressionInput
            step={1}
            value={selectedDiagramConfig.yMin}
            ariaLabel={`${selectedBlock.label} vector j min`}
            onValueChange={(value) => updateCanvas({ yMin: value ?? DEFAULT_VECTOR_2D_GRAPH.yMin })}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          j max
          <NumericExpressionInput
            step={1}
            value={selectedDiagramConfig.yMax}
            ariaLabel={`${selectedBlock.label} vector j max`}
            onValueChange={(value) => updateCanvas({ yMax: value ?? DEFAULT_VECTOR_2D_GRAPH.yMax })}
            className={controlClassName}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Width
          <NumericExpressionInput
            min={160}
            step={10}
            value={selectedDiagramConfig.widthPx}
            ariaLabel={`${selectedBlock.label} vector width`}
            onValueChange={(value) => updateCanvas({ widthPx: value ?? DEFAULT_VECTOR_2D_GRAPH.widthPx })}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Height
          <NumericExpressionInput
            min={120}
            step={10}
            value={selectedDiagramConfig.heightPx}
            ariaLabel={`${selectedBlock.label} vector height`}
            onValueChange={(value) => updateCanvas({ heightPx: value ?? DEFAULT_VECTOR_2D_GRAPH.heightPx })}
            className={controlClassName}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          i major
          <NumericExpressionInput
            min={0.1}
            step={1}
            value={selectedDiagramConfig.gridMajorStepX}
            fallbackValue={selectedDiagramConfig.gridMajorStep}
            ariaLabel={`${selectedBlock.label} vector i major`}
            onValueChange={(value) => updateCanvas(vector2dMajorGridStepPatch("x", value))}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          j major
          <NumericExpressionInput
            min={0.1}
            step={1}
            value={selectedDiagramConfig.gridMajorStepY}
            fallbackValue={selectedDiagramConfig.gridMajorStep}
            ariaLabel={`${selectedBlock.label} vector j major`}
            onValueChange={(value) => updateCanvas(vector2dMajorGridStepPatch("y", value))}
            className={controlClassName}
          />
        </label>
      </div>
      <label className={checkboxLabelClassName}>
        <input
          type="checkbox"
          checked={selection.showMinorGrid}
          aria-label={`${selectedBlock.label} vector minor grid`}
          onChange={(event) => updateCanvas({ showMinorGrid: event.target.checked, showGrid: true })}
        />
        Minor grid
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          i minor
          <NumericExpressionInput
            min={0.1}
            step={1}
            value={selectedDiagramConfig.gridMinorStepX}
            fallbackValue={selectedDiagramConfig.gridMinorStep}
            ariaLabel={`${selectedBlock.label} vector i minor`}
            onValueChange={(value) => updateCanvas(vector2dMinorGridStepPatch("x", value))}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          j minor
          <NumericExpressionInput
            min={0.1}
            step={1}
            value={selectedDiagramConfig.gridMinorStepY}
            fallbackValue={selectedDiagramConfig.gridMinorStep}
            ariaLabel={`${selectedBlock.label} vector j minor`}
            onValueChange={(value) => updateCanvas(vector2dMinorGridStepPatch("y", value))}
            className={controlClassName}
          />
        </label>
      </div>
    </div>
  );
}
