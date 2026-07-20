import type { GraphConfig, StatsChartData, StatsChartSeriesData, StatsChartSeriesType } from "@mauth-studio/shared";
import { PlusCircle, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  isSolutionOnlyStatsChartSeries,
  statsChartDataWithSeries,
  statsChartSeries,
  statsChartSeriesForAuthoringLayer,
  statsChartSeriesId,
  statsChartSeriesVisibleInStudent,
  statsChartSeriesWithSolutionOnly,
} from "@/lib/diagramStatsChart";

const DEFAULT_SERIES_COLOR = "#111827";

function numberListText(values: number[]) {
  return values.join(", ");
}

function parseNumberList(value: string, fallback: number[]) {
  const values = value
    .split(/[\s,]+/)
    .map((item) => Number(item.trim()))
    .filter(Number.isFinite);
  return values.length ? values : fallback;
}

function optionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

function numberInputValue(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

function nextSeriesId(series: StatsChartSeriesData[]) {
  const ids = new Set(series.map(statsChartSeriesId));
  let index = series.length + 1;
  while (ids.has(`series-${index}`)) index += 1;
  return `series-${index}`;
}

function finiteExtent(values: number[] | undefined, fallback: [number, number]): [number, number] {
  const finite = (values ?? []).filter(Number.isFinite);
  if (!finite.length) return fallback;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  return min === max ? [min - 1, max + 1] : [min, max];
}

function defaultSeriesRange(data: StatsChartData): [number, number] {
  if (data.chartType === "binomial") return [0, Math.max(1, data.trials ?? 10)];
  if (data.chartType === "histogram") return finiteExtent(data.xValues?.length ? data.xValues : data.values, [0, 2]);
  if (data.chartType === "box") return finiteExtent(data.values, [0, 2]);
  return data.range ?? [0, 2];
}

function defaultSeriesPeak(data: StatsChartData) {
  if (data.chartType === "binomial") return 0.2;
  if (data.chartType === "normal" || data.chartType === "density") return 0.3;
  if (data.yRange) return data.yRange[0] + (data.yRange[1] - data.yRange[0]) * 0.6;
  return 1;
}

function defaultSeries(data: StatsChartData, series: StatsChartSeriesData[], showSolutions: boolean) {
  const range = defaultSeriesRange(data);
  const midpoint = (range[0] + range[1]) / 2;
  return statsChartSeriesForAuthoringLayer(
    {
      id: nextSeriesId(series),
      label: "",
      seriesType: "line",
      xValues: [range[0], midpoint, range[1]],
      yValues: [0, defaultSeriesPeak(data), 0],
      color: DEFAULT_SERIES_COLOR,
      lineWidth: 2.4,
      markerSize: 7,
      show: true,
    },
    showSolutions,
  );
}

export function StatsChartSeriesEditor({
  config,
  data,
  showSolutions,
  onChange,
}: {
  config: GraphConfig;
  data: StatsChartData;
  showSolutions: boolean;
  onChange: (data: StatsChartData) => void;
}) {
  const series = statsChartSeries(config);
  const visibleRows = series
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => showSolutions || statsChartSeriesVisibleInStudent(entry));
  const patchSeries = (nextSeries: StatsChartSeriesData[]) => onChange(statsChartDataWithSeries(config, nextSeries));
  const updateSeries = (index: number, patch: Partial<StatsChartSeriesData>) => {
    patchSeries(series.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  };

  return (
    <section className="flex flex-col gap-2 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Additional series</div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => patchSeries([...series, defaultSeries(data, series, showSolutions)])}
        >
          <PlusCircle data-icon="inline-start" />
          {showSolutions ? "Add solution series" : "Add series"}
        </Button>
      </div>

      {visibleRows.map(({ entry, index }) => {
        const id = statsChartSeriesId(entry, index);
        const solutionOnly = isSolutionOnlyStatsChartSeries(entry);
        return (
          <div
            key={`${id}-${index}`}
            data-stats-series-id={id}
            data-solution-only={solutionOnly ? "true" : undefined}
            className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Series {index + 1}
                {solutionOnly ? <Badge variant="outline">Solution</Badge> : null}
              </span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={solutionOnly}
                    aria-label={`Series ${id} show in solutions only`}
                    onChange={(event) => updateSeries(index, statsChartSeriesWithSolutionOnly(entry, event.target.checked))}
                  />
                  Show in solutions only
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Remove series"
                  aria-label="Remove series"
                  onClick={() => patchSeries(series.filter((_, entryIndex) => entryIndex !== index))}
                  className="size-9"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-medium">
                Id
                <input
                  value={id}
                  onChange={(event) => event.target.value.trim() && updateSeries(index, { id: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 font-mono text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Label
                <input
                  value={entry.label ?? ""}
                  onChange={(event) => updateSeries(index, { label: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Type
                <select
                  value={entry.seriesType}
                  onChange={(event) => updateSeries(index, { seriesType: event.target.value as StatsChartSeriesType })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                >
                  <option value="line">Line</option>
                  <option value="points">Points</option>
                  <option value="linePoints">Line and points</option>
                  <option value="bars">Bars</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Colour
                <input
                  type="color"
                  value={entry.color ?? DEFAULT_SERIES_COLOR}
                  onChange={(event) => updateSeries(index, { color: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-medium">
                x values
                <Textarea
                  key={`series-x-${id}-${numberListText(entry.xValues)}`}
                  defaultValue={numberListText(entry.xValues)}
                  className="min-h-20 font-mono text-xs"
                  spellCheck={false}
                  onBlur={(event) => updateSeries(index, { xValues: parseNumberList(event.currentTarget.value, entry.xValues) })}
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                y values
                <Textarea
                  key={`series-y-${id}-${numberListText(entry.yValues)}`}
                  defaultValue={numberListText(entry.yValues)}
                  className="min-h-20 font-mono text-xs"
                  spellCheck={false}
                  onBlur={(event) => updateSeries(index, { yValues: parseNumberList(event.currentTarget.value, entry.yValues) })}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {entry.seriesType === "line" || entry.seriesType === "linePoints" ? (
                <label className="flex w-28 flex-col gap-2 text-xs font-medium">
                  Line width
                  <input
                    type="number"
                    min={0.5}
                    step={1}
                    value={numberInputValue(entry.lineWidth)}
                    onChange={(event) => updateSeries(index, { lineWidth: optionalNumber(event.target.value) })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
              ) : null}
              {entry.seriesType === "points" || entry.seriesType === "linePoints" ? (
                <label className="flex w-28 flex-col gap-2 text-xs font-medium">
                  Point size
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={numberInputValue(entry.markerSize)}
                    onChange={(event) => updateSeries(index, { markerSize: optionalNumber(event.target.value) })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
              ) : null}
              {entry.seriesType === "bars" ? (
                <label className="flex w-28 flex-col gap-2 text-xs font-medium">
                  Bar width
                  <input
                    type="number"
                    min={0.01}
                    step={1}
                    value={numberInputValue(entry.barWidth)}
                    onChange={(event) => updateSeries(index, { barWidth: optionalNumber(event.target.value) })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
              ) : null}
              <label className="flex items-center gap-2 pb-2 text-xs font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={entry.show !== false}
                  onChange={(event) => updateSeries(index, { show: event.target.checked })}
                />
                Visible
              </label>
            </div>
          </div>
        );
      })}
    </section>
  );
}
