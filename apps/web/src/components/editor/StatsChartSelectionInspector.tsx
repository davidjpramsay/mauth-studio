import {
  DEFAULT_STATS_CHART_SPEC,
  STATS_CHART_TYPES,
  type StatsChartData,
  type StatsChartOptions,
  type StatsChartType,
} from "@mauth-studio/diagram-plotly";
import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import type { SelectedEditorBlock } from "../../lib/editorBlockSelection";
import {
  statsChartDataPatch,
  statsChartFillOpacity,
  statsChartInspectorSelection,
  statsChartOptionsPatch,
} from "../../lib/statsChartInspectorSelection";
import { cn } from "../../lib/utils";
import { defaultStatsDataForType } from "./StatsChartEditor";
import { NumericExpressionInput } from "./NumericExpressionInput";

interface StatsChartSelectionInspectorProps {
  selectedBlock: SelectedEditorBlock;
  selectedDiagramConfig: GraphConfig;
  controlClassName: string;
  checkboxLabelClassName: string;
  onBlockChange: (selection: SelectedEditorBlock, patch: Partial<ContentBlock>) => void;
  updateGraphConfig: (graphConfig: GraphConfig, patch: Partial<GraphConfig>) => GraphConfig;
}

export function StatsChartSelectionInspector({
  selectedBlock,
  selectedDiagramConfig,
  controlClassName,
  checkboxLabelClassName,
  onBlockChange,
  updateGraphConfig,
}: StatsChartSelectionInspectorProps) {
  const selection = statsChartInspectorSelection(selectedDiagramConfig);
  const updateCanvas = (patch: Partial<GraphConfig>) =>
    onBlockChange(selectedBlock, { graphConfig: updateGraphConfig(selectedDiagramConfig, patch) });
  const updateData = (patch: Partial<StatsChartData>) => updateCanvas(statsChartDataPatch(selection.spec, patch));
  const updateOptions = (patch: Partial<StatsChartOptions>) => updateCanvas(statsChartOptionsPatch(selection.spec, patch));

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{selection.title}</div>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
        Chart type
        <select
          value={selection.spec.data.chartType}
          aria-label={`${selectedBlock.label} chart type`}
          onChange={(event) => updateData(defaultStatsDataForType(event.target.value as StatsChartType, selection.spec.data))}
          className={controlClassName}
        >
          {STATS_CHART_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Width
          <NumericExpressionInput
            min={240}
            step={10}
            value={selection.spec.options?.widthPx}
            fallbackValue={DEFAULT_STATS_CHART_SPEC.options?.widthPx}
            ariaLabel={`${selectedBlock.label} chart width`}
            onValueChange={(value) => updateOptions({ widthPx: value ?? DEFAULT_STATS_CHART_SPEC.options?.widthPx })}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Height
          <NumericExpressionInput
            min={180}
            step={10}
            value={selection.spec.options?.heightPx}
            fallbackValue={DEFAULT_STATS_CHART_SPEC.options?.heightPx}
            ariaLabel={`${selectedBlock.label} chart height`}
            onValueChange={(value) => updateOptions({ heightPx: value ?? DEFAULT_STATS_CHART_SPEC.options?.heightPx })}
            className={controlClassName}
          />
        </label>
      </div>
      <label className={checkboxLabelClassName}>
        <input
          type="checkbox"
          checked={selection.spec.options?.showGrid ?? true}
          aria-label={`${selectedBlock.label} chart gridlines`}
          onChange={(event) => updateOptions({ showGrid: event.target.checked })}
        />
        Gridlines
      </label>
      <label className={checkboxLabelClassName}>
        <input
          type="checkbox"
          checked={!selection.fillDisabled}
          aria-label={`${selectedBlock.label} chart fill`}
          onChange={(event) => updateOptions({ showFill: event.target.checked })}
        />
        Fill
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Fill colour
          <input
            type="color"
            value={selection.fillColor}
            aria-label={`${selectedBlock.label} fill colour`}
            disabled={selection.fillDisabled}
            onChange={(event) => updateOptions({ fillColor: event.target.value, showFill: true })}
            className="h-9 rounded-md border border-input bg-background p-1 disabled:opacity-45"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Opacity
          <NumericExpressionInput
            min={0}
            max={1}
            step={1}
            value={selection.fillOpacity}
            ariaLabel={`${selectedBlock.label} fill opacity`}
            disabled={selection.fillDisabled}
            onValueChange={(value) => updateOptions({ fillOpacity: statsChartFillOpacity(value), showFill: true })}
            className={cn(controlClassName, "disabled:opacity-45")}
          />
        </label>
      </div>
    </div>
  );
}
