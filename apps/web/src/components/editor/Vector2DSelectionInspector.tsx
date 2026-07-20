import { useState } from "react";
import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import { DEFAULT_VECTOR_2D_GRAPH, type Vector2DLabelStyle } from "../../lib/diagramVector2d";
import type { SelectedEditorBlock } from "../../lib/editorBlockSelection";
import { inspectorNumberInputValue, inspectorOptionalNumber, vector2dLabelStylePatch } from "../../lib/moduleSettingsPatches";
import {
  vector2dAxesVisibilityPatch,
  vector2dGridVisibilityPatch,
  vector2dInspectorSelection,
  vector2dMajorGridStepPatch,
  vector2dMinorGridStepPatch,
} from "../../lib/vector2dInspectorSelection";
import { VECTOR_2D_LABEL_STYLES } from "./editorOptions";

function spinnerMin(min?: number, step?: number) {
  if (step === 1 && typeof min === "number" && Number.isFinite(min) && !Number.isInteger(min)) return Math.floor(min);
  return min;
}

function spinnerValue(nextValue: string, previousValue: string | number, step?: number, nativeEvent?: Event) {
  if (step !== 1 || nextValue === "") return nextValue;
  const inputType = nativeEvent && "inputType" in nativeEvent ? String((nativeEvent as InputEvent).inputType) : "";
  if (inputType) return nextValue;

  const previous = Number(previousValue);
  const next = Number(nextValue);
  if (!Number.isFinite(previous) || !Number.isFinite(next) || Number.isInteger(previous)) return nextValue;
  if (Math.abs(Math.abs(next - previous) - 1) > 1e-9) return nextValue;

  const previousFraction = previous - Math.trunc(previous);
  const nextFraction = next - Math.trunc(next);
  if (Math.abs(previousFraction - nextFraction) > 1e-9) return nextValue;

  return String(next > previous ? Math.ceil(previous) : Math.floor(previous));
}

function DraftNumberInput({
  value,
  fallbackValue,
  min,
  step,
  ariaLabel,
  className,
  onChange,
}: {
  value?: number;
  fallbackValue?: number;
  min?: number;
  step?: number;
  ariaLabel: string;
  className?: string;
  onChange: (value: number | undefined) => void;
}) {
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const displayValue = draftValue ?? inspectorNumberInputValue(value ?? fallbackValue);

  return (
    <input
      type="number"
      min={spinnerMin(min, step)}
      step={step}
      value={displayValue}
      aria-label={ariaLabel}
      onChange={(event) => {
        const nextValue = spinnerValue(event.target.value, displayValue, step, event.nativeEvent);
        setDraftValue(nextValue);
        if (nextValue === "") {
          onChange(undefined);
          return;
        }
        const parsed = Number(nextValue);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
      onBlur={() => setDraftValue(null)}
      className={className}
    />
  );
}

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
          <input
            type="number"
            step={1}
            value={inspectorNumberInputValue(selectedDiagramConfig.xMin)}
            aria-label={`${selectedBlock.label} vector i min`}
            onChange={(event) => updateCanvas({ xMin: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.xMin })}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          i max
          <input
            type="number"
            step={1}
            value={inspectorNumberInputValue(selectedDiagramConfig.xMax)}
            aria-label={`${selectedBlock.label} vector i max`}
            onChange={(event) => updateCanvas({ xMax: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.xMax })}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          j min
          <input
            type="number"
            step={1}
            value={inspectorNumberInputValue(selectedDiagramConfig.yMin)}
            aria-label={`${selectedBlock.label} vector j min`}
            onChange={(event) => updateCanvas({ yMin: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.yMin })}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          j max
          <input
            type="number"
            step={1}
            value={inspectorNumberInputValue(selectedDiagramConfig.yMax)}
            aria-label={`${selectedBlock.label} vector j max`}
            onChange={(event) => updateCanvas({ yMax: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.yMax })}
            className={controlClassName}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Width
          <input
            type="number"
            min={160}
            step={10}
            value={inspectorNumberInputValue(selectedDiagramConfig.widthPx)}
            aria-label={`${selectedBlock.label} vector width`}
            onChange={(event) => updateCanvas({ widthPx: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.widthPx })}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Height
          <input
            type="number"
            min={120}
            step={10}
            value={inspectorNumberInputValue(selectedDiagramConfig.heightPx)}
            aria-label={`${selectedBlock.label} vector height`}
            onChange={(event) =>
              updateCanvas({ heightPx: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.heightPx })
            }
            className={controlClassName}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          i major
          <DraftNumberInput
            min={0.1}
            step={1}
            value={selectedDiagramConfig.gridMajorStepX}
            fallbackValue={selectedDiagramConfig.gridMajorStep}
            ariaLabel={`${selectedBlock.label} vector i major`}
            onChange={(value) => updateCanvas(vector2dMajorGridStepPatch("x", value))}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          j major
          <DraftNumberInput
            min={0.1}
            step={1}
            value={selectedDiagramConfig.gridMajorStepY}
            fallbackValue={selectedDiagramConfig.gridMajorStep}
            ariaLabel={`${selectedBlock.label} vector j major`}
            onChange={(value) => updateCanvas(vector2dMajorGridStepPatch("y", value))}
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
          <DraftNumberInput
            min={0.1}
            step={1}
            value={selectedDiagramConfig.gridMinorStepX}
            fallbackValue={selectedDiagramConfig.gridMinorStep}
            ariaLabel={`${selectedBlock.label} vector i minor`}
            onChange={(value) => updateCanvas(vector2dMinorGridStepPatch("x", value))}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          j minor
          <DraftNumberInput
            min={0.1}
            step={1}
            value={selectedDiagramConfig.gridMinorStepY}
            fallbackValue={selectedDiagramConfig.gridMinorStep}
            ariaLabel={`${selectedBlock.label} vector j minor`}
            onChange={(value) => updateCanvas(vector2dMinorGridStepPatch("y", value))}
            className={controlClassName}
          />
        </label>
      </div>
    </div>
  );
}
