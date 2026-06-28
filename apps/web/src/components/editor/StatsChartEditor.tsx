import type { GraphConfig } from "@mauth-studio/shared";
import {
  STATS_CHART_TYPES,
  normalizeStatsChartSpec,
  type StatsChartData,
  type StatsChartOptions,
  type StatsChartType,
} from "@mauth-studio/diagram-plotly";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function optionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

function numberInputValue(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function numberListText(values?: number[]) {
  return (values ?? []).join(", ");
}

function parseNumberList(value: string, fallback: number[]) {
  const values = value
    .split(/[\s,]+/)
    .map((item) => Number(item.trim()))
    .filter(Number.isFinite);
  return values.length ? values : fallback;
}

function histogramYAxisLabel(mode?: StatsChartData["yAxisMode"]) {
  return mode === "relativeFrequency" ? "Relative frequency" : "Frequency";
}

function histogramManualProbabilityLabel() {
  return "P(X=x)";
}

export function defaultStatsDataForType(chartType: StatsChartType, current: StatsChartData): Partial<StatsChartData> {
  if (chartType === "normal") {
    const mean = typeof current.mean === "number" ? current.mean : 0;
    const stdDev = typeof current.stdDev === "number" && current.stdDev > 0 ? current.stdDev : 1;
    return {
      chartType,
      mean,
      stdDev,
      range: current.range ?? [mean - 3 * stdDev, mean + 3 * stdDev],
      xLabel: current.xLabel || "x",
      yLabel: current.yLabel || "Density",
    };
  }

  if (chartType === "binomial") {
    return {
      chartType,
      trials: typeof current.trials === "number" ? current.trials : 10,
      probability: typeof current.probability === "number" ? current.probability : 0.5,
      xLabel: current.xLabel || "x",
      yLabel: current.yLabel || "Probability",
    };
  }

  if (chartType === "histogram") {
    const dataMode = current.dataMode ?? "raw";
    const yAxisMode = current.yAxisMode ?? "frequency";
    return {
      chartType,
      dataMode,
      barType: current.barType ?? "continuous",
      yAxisMode,
      yLabelOrientation: current.yLabelOrientation ?? "vertical",
      values: current.values?.length ? current.values : [3, 5, 7, 7, 8, 10],
      xValues: current.xValues?.length ? current.xValues : [2, 4, 5, 6, 7],
      probabilities: current.probabilities?.length ? current.probabilities : [0.1, 0.25, 0.3, 0.15, 0.2],
      xLabel: current.xLabel || (dataMode === "manualProbabilities" ? "x" : "Value"),
      yLabel: current.yLabel || (dataMode === "manualProbabilities" ? histogramManualProbabilityLabel() : histogramYAxisLabel(yAxisMode)),
    };
  }

  return {
    chartType,
    values: current.values?.length ? current.values : [1, 2, 3, 4, 5, 6, 7],
    xLabel: current.xLabel || "Value",
    yLabel: "",
  };
}

type StatsChartEditorProps = {
  config: GraphConfig;
  settingsMode?: "inline" | "inspector";
  onChange: (patch: Partial<GraphConfig>) => void;
};

export function StatsChartEditor({ config, settingsMode = "inline", onChange }: StatsChartEditorProps) {
  const spec = normalizeStatsChartSpec(config);
  const data = spec.data;
  const options = spec.options ?? {};
  const showInlineSettings = settingsMode === "inline";
  const updateData = (patch: Partial<StatsChartData>) => {
    const nextData = { ...data, ...patch };
    onChange({
      data: nextData,
      options,
      widthPx: options.widthPx,
      heightPx: options.heightPx,
    });
  };
  const updateOptions = (patch: Partial<StatsChartOptions>) => {
    const nextOptions = { ...options, ...patch };
    onChange({
      options: nextOptions,
      widthPx: nextOptions.widthPx,
      heightPx: nextOptions.heightPx,
    });
  };
  const values = data.values?.length ? data.values : data.chartType === "box" ? [1, 2, 3, 4, 5, 6, 7] : [3, 5, 7, 7, 8, 10];
  const xValues = data.xValues?.length ? data.xValues : [2, 4, 5, 6, 7];
  const probabilities = data.probabilities?.length ? data.probabilities : [0.1, 0.25, 0.3, 0.15, 0.2];
  const range = data.range ?? [-3, 3];
  const histogramDataMode = data.dataMode === "manualProbabilities" ? "manualProbabilities" : "raw";
  const isManualProbabilityMode = histogramDataMode === "manualProbabilities";
  const histogramBarType = data.barType ?? "continuous";
  const histogramYAxisMode = data.yAxisMode ?? "frequency";
  const histogramYLabelOrientation = data.yLabelOrientation ?? "vertical";
  const updateHistogramDataMode = (dataMode: StatsChartData["dataMode"]) => {
    updateData({
      dataMode,
      barType: dataMode === "manualProbabilities" ? "discrete" : histogramBarType,
      xLabel: dataMode === "manualProbabilities" ? "x" : data.xLabel || "Value",
      yLabel: dataMode === "manualProbabilities" ? histogramManualProbabilityLabel() : histogramYAxisLabel(histogramYAxisMode),
    });
  };
  const updateHistogramYAxisMode = (yAxisMode: StatsChartData["yAxisMode"]) => {
    updateData({
      yAxisMode,
      yLabel: histogramYAxisLabel(yAxisMode),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {showInlineSettings ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(180px,220px)_120px_120px] md:items-end">
          <label className="flex flex-col gap-2 text-xs font-medium">
            Chart type
            <select
              value={data.chartType}
              onChange={(event) => updateData(defaultStatsDataForType(event.target.value as StatsChartType, data))}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            >
              {STATS_CHART_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Width
            <input
              type="number"
              min={240}
              step={1}
              value={numberInputValue(options.widthPx)}
              onChange={(event) => updateOptions({ widthPx: optionalNumber(event.target.value) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Height
            <input
              type="number"
              min={180}
              step={1}
              value={numberInputValue(options.heightPx)}
              onChange={(event) => updateOptions({ heightPx: optionalNumber(event.target.value) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
        </section>
      ) : null}

      {data.chartType === "histogram" ? (
        <section
          className={cn(
            "grid grid-cols-1 gap-3",
            isManualProbabilityMode ? "md:grid-cols-2" : "md:grid-cols-4",
            showInlineSettings && "border-t pt-3",
          )}
        >
          <label className="flex flex-col gap-2 text-xs font-medium">
            Bar data
            <select
              value={histogramDataMode}
              onChange={(event) => updateHistogramDataMode(event.target.value as StatsChartData["dataMode"])}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            >
              <option value="raw">Count raw observations</option>
              <option value="manualProbabilities">Enter probabilities</option>
            </select>
            <span className="text-[11px] font-normal leading-snug text-muted-foreground">
              {isManualProbabilityMode ? "Use matching x-values and probabilities." : "Repeated values are counted as frequencies."}
            </span>
          </label>
          {!isManualProbabilityMode ? (
            <>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Bar type
                <select
                  value={histogramBarType}
                  onChange={(event) => updateData({ barType: event.target.value as StatsChartData["barType"] })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                >
                  <option value="continuous">Histogram bins (no gaps)</option>
                  <option value="discrete">Column graph (gaps)</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Y-axis
                <select
                  value={histogramYAxisMode}
                  onChange={(event) => updateHistogramYAxisMode(event.target.value as StatsChartData["yAxisMode"])}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                >
                  <option value="frequency">Frequency</option>
                  <option value="relativeFrequency">Relative frequency</option>
                </select>
              </label>
            </>
          ) : null}
          <label className="flex flex-col gap-2 text-xs font-medium">
            Y label
            <select
              value={histogramYLabelOrientation}
              onChange={(event) => updateData({ yLabelOrientation: event.target.value as StatsChartData["yLabelOrientation"] })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            >
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal</option>
            </select>
          </label>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-2 text-xs font-medium">
          Title
          <input
            value={data.title ?? ""}
            onChange={(event) => updateData({ title: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          x-axis label
          <input
            value={data.xLabel ?? ""}
            onChange={(event) => updateData({ xLabel: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          y-axis label
          <input
            value={data.yLabel ?? ""}
            onChange={(event) => updateData({ yLabel: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
      </section>

      {showInlineSettings ? (
        <section className="flex flex-wrap items-center gap-4 border-t pt-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options.showGrid ?? true}
              onChange={(event) => updateOptions({ showGrid: event.target.checked })}
            />
            Gridlines
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options.showFill !== false}
              onChange={(event) => updateOptions({ showFill: event.target.checked })}
            />
            Fill
          </label>
          <label className="flex items-center gap-2 text-xs font-medium">
            Fill colour
            <input
              type="color"
              value={typeof options.fillColor === "string" ? options.fillColor : "#f5f5f5"}
              disabled={options.showFill === false}
              onChange={(event) => updateOptions({ fillColor: event.target.value, showFill: true })}
              className="h-8 w-14 rounded-md border border-input bg-background p-1 disabled:opacity-45"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium">
            Opacity
            <input
              type="number"
              min={0}
              max={1}
              step={1}
              value={numberInputValue(typeof options.fillOpacity === "number" ? options.fillOpacity : 1)}
              disabled={options.showFill === false}
              onChange={(event) => {
                const nextOpacity = optionalNumber(event.target.value);
                updateOptions({
                  fillOpacity: typeof nextOpacity === "number" && Number.isFinite(nextOpacity) ? clamp(nextOpacity, 0, 1) : undefined,
                  showFill: true,
                });
              }}
              className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm font-normal disabled:opacity-45"
            />
          </label>
        </section>
      ) : null}

      {data.chartType === "normal" ? (
        <section className="grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-4">
          <label className="flex flex-col gap-2 text-xs font-medium">
            Mean
            <input
              type="number"
              step={1}
              value={numberInputValue(data.mean)}
              onChange={(event) => updateData({ mean: optionalNumber(event.target.value) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Standard deviation
            <input
              type="number"
              min={0.01}
              step={1}
              value={numberInputValue(data.stdDev)}
              onChange={(event) => updateData({ stdDev: optionalNumber(event.target.value) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Range min
            <input
              type="number"
              step={1}
              value={numberInputValue(range[0])}
              onChange={(event) => updateData({ range: [optionalNumber(event.target.value) ?? range[0], range[1]] })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Range max
            <input
              type="number"
              step={1}
              value={numberInputValue(range[1])}
              onChange={(event) => updateData({ range: [range[0], optionalNumber(event.target.value) ?? range[1]] })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
        </section>
      ) : data.chartType === "binomial" ? (
        <section className="grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-xs font-medium">
            Trials
            <input
              type="number"
              min={1}
              step={1}
              value={numberInputValue(data.trials)}
              onChange={(event) => updateData({ trials: optionalNumber(event.target.value) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Probability
            <input
              type="number"
              min={0}
              max={1}
              step={1}
              value={numberInputValue(data.probability)}
              onChange={(event) => updateData({ probability: optionalNumber(event.target.value) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
        </section>
      ) : data.chartType === "histogram" && histogramDataMode === "manualProbabilities" ? (
        <section className="grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-xs font-medium">
            x values
            <Textarea
              key={`manual-x-${numberListText(xValues)}`}
              defaultValue={numberListText(xValues)}
              className="min-h-24 font-mono text-xs"
              spellCheck={false}
              onBlur={(event) => updateData({ xValues: parseNumberList(event.currentTarget.value, xValues) })}
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Probabilities
            <Textarea
              key={`manual-p-${numberListText(probabilities)}`}
              defaultValue={numberListText(probabilities)}
              className="min-h-24 font-mono text-xs"
              spellCheck={false}
              onBlur={(event) => updateData({ probabilities: parseNumberList(event.currentTarget.value, probabilities) })}
            />
          </label>
        </section>
      ) : (
        <section
          className={cn(
            "grid grid-cols-1 gap-3 border-t pt-3",
            data.chartType === "histogram" && histogramBarType === "continuous"
              ? "md:grid-cols-[minmax(0,1fr)_120px_120px]"
              : "md:grid-cols-1",
          )}
        >
          <label className="flex flex-col gap-2 text-xs font-medium">
            Data values
            <Textarea
              key={`${data.chartType}-${numberListText(values)}`}
              defaultValue={numberListText(values)}
              className="min-h-24 font-mono text-xs"
              spellCheck={false}
              onBlur={(event) => updateData({ values: parseNumberList(event.currentTarget.value, values) })}
            />
          </label>
          {data.chartType === "histogram" && histogramBarType === "continuous" ? (
            <>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Bin size
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={numberInputValue(data.binSize)}
                  onChange={(event) => updateData({ binSize: optionalNumber(event.target.value) })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Bins
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={numberInputValue(data.bins)}
                  onChange={(event) => updateData({ bins: optionalNumber(event.target.value) })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}
