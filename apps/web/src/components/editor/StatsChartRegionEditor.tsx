import type { GraphConfig, StatsChartData, StatsChartRegionData, StatsChartRegionMode } from "@mauth-studio/shared";
import { PlusCircle, Trash2 } from "lucide-react";

import { NumericExpressionInput } from "@/components/editor/NumericExpressionInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  isSolutionOnlyStatsChartRegion,
  statsChartDataWithRegions,
  statsChartRegionForAuthoringLayer,
  statsChartRegionId,
  statsChartRegions,
  statsChartRegionVisibleInStudent,
  statsChartRegionWithSolutionOnly,
} from "@/lib/diagramStatsChart";

const DEFAULT_REGION_FILL_COLOR = "#1d4ed8";

function nextRegionId(regions: StatsChartRegionData[]) {
  const ids = new Set(regions.map(statsChartRegionId));
  let index = regions.length + 1;
  while (ids.has(`region-${index}`)) index += 1;
  return `region-${index}`;
}

function defaultRegion(data: StatsChartData, regions: StatsChartRegionData[], showSolutions: boolean) {
  const range = data.range ?? [-3, 3];
  const midpoint = data.chartType === "normal" ? (data.mean ?? (range[0] + range[1]) / 2) : (range[0] + range[1]) / 2;
  const halfWidth = data.chartType === "normal" ? Math.max(0.01, data.stdDev ?? 1) : Math.max(0.01, (range[1] - range[0]) / 6);
  return statsChartRegionForAuthoringLayer(
    {
      id: nextRegionId(regions),
      label: "",
      mode: "between",
      lower: midpoint - halfWidth,
      upper: midpoint + halfWidth,
      fillColor: DEFAULT_REGION_FILL_COLOR,
      fillOpacity: 0.22,
      show: true,
    },
    showSolutions,
  );
}

function modeNeedsLower(mode: StatsChartRegionMode) {
  return mode === "between" || mode === "rightTail" || mode === "outside";
}

function modeNeedsUpper(mode: StatsChartRegionMode) {
  return mode === "between" || mode === "leftTail" || mode === "outside";
}

export function StatsChartRegionEditor({
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
  if (data.chartType !== "normal" && data.chartType !== "density") return null;

  const regions = statsChartRegions(config);
  const visibleRows = regions
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => showSolutions || statsChartRegionVisibleInStudent(entry));
  const patchRegions = (nextRegions: StatsChartRegionData[]) => onChange(statsChartDataWithRegions(config, nextRegions));
  const updateRegion = (index: number, patch: Partial<StatsChartRegionData>) => {
    patchRegions(regions.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  };

  return (
    <section className="flex flex-col gap-2 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shaded regions</div>
          <div className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Regions follow the distribution curve and do not draw vertical boundary lines.
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => patchRegions([...regions, defaultRegion(data, regions, showSolutions)])}
        >
          <PlusCircle data-icon="inline-start" />
          {showSolutions ? "Add solution region" : "Add region"}
        </Button>
      </div>

      {visibleRows.map(({ entry, index }) => {
        const id = statsChartRegionId(entry, index);
        const solutionOnly = isSolutionOnlyStatsChartRegion(entry);
        return (
          <div
            key={`${id}-${index}`}
            data-stats-region-id={id}
            data-solution-only={solutionOnly ? "true" : undefined}
            className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Region {index + 1}
                {solutionOnly ? <Badge variant="outline">Solution</Badge> : null}
              </span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={solutionOnly}
                    aria-label={`Region ${id} show in solutions only`}
                    onChange={(event) => updateRegion(index, statsChartRegionWithSolutionOnly(entry, event.target.checked))}
                  />
                  Show in solutions only
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Remove region"
                  aria-label="Remove region"
                  onClick={() => patchRegions(regions.filter((_, entryIndex) => entryIndex !== index))}
                  className="size-9"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-2 text-xs font-medium">
                Id
                <input
                  value={id}
                  onChange={(event) => event.target.value.trim() && updateRegion(index, { id: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 font-mono text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Label
                <input
                  value={entry.label ?? ""}
                  onChange={(event) => updateRegion(index, { label: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Region
                <select
                  value={entry.mode}
                  onChange={(event) => updateRegion(index, { mode: event.target.value as StatsChartRegionMode })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                >
                  <option value="between">Between two values</option>
                  <option value="leftTail">Left tail</option>
                  <option value="rightTail">Right tail</option>
                  <option value="outside">Outside two values</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {modeNeedsLower(entry.mode) ? (
                <label className="flex w-32 flex-col gap-2 text-xs font-medium">
                  Lower bound
                  <NumericExpressionInput
                    step={1}
                    value={entry.lower}
                    ariaLabel={`Region ${id} lower bound`}
                    onValueChange={(value) => updateRegion(index, { lower: value })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
              ) : null}
              {modeNeedsUpper(entry.mode) ? (
                <label className="flex w-32 flex-col gap-2 text-xs font-medium">
                  Upper bound
                  <NumericExpressionInput
                    step={1}
                    value={entry.upper}
                    ariaLabel={`Region ${id} upper bound`}
                    onValueChange={(value) => updateRegion(index, { upper: value })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
              ) : null}
              <label className="flex w-28 flex-col gap-2 text-xs font-medium">
                Fill colour
                <input
                  type="color"
                  value={entry.fillColor ?? DEFAULT_REGION_FILL_COLOR}
                  onChange={(event) => updateRegion(index, { fillColor: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background p-1"
                />
              </label>
              <label className="flex w-28 flex-col gap-2 text-xs font-medium">
                Opacity
                <NumericExpressionInput
                  min={0}
                  max={1}
                  step={1}
                  value={entry.fillOpacity ?? 0.22}
                  ariaLabel={`Region ${id} opacity`}
                  onValueChange={(value) => updateRegion(index, { fillOpacity: value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex items-center gap-2 pb-2 text-xs font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={entry.show !== false}
                  onChange={(event) => updateRegion(index, { show: event.target.checked })}
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
