import type { StatsChartData, StatsChartOptions, StatsChartSpec } from "@mauth-studio/diagram-plotly";
import { normalizeStatsChartSpec } from "@mauth-studio/diagram-plotly";
import type { GraphConfig } from "@mauth-studio/shared";

export function statsChartInspectorSelection(graphConfig: GraphConfig) {
  const spec = normalizeStatsChartSpec(graphConfig);
  return {
    title: "Chart settings" as const,
    spec,
    fillColor: typeof spec.options?.fillColor === "string" ? spec.options.fillColor : "#f5f5f5",
    fillOpacity: typeof spec.options?.fillOpacity === "number" ? spec.options.fillOpacity : 1,
    fillDisabled: spec.options?.showFill === false,
  };
}

export function statsChartDataPatch(spec: StatsChartSpec, patch: Partial<StatsChartData>): Partial<GraphConfig> {
  return {
    data: { ...spec.data, ...patch },
    options: spec.options,
    widthPx: spec.options?.widthPx,
    heightPx: spec.options?.heightPx,
  };
}

export function statsChartOptionsPatch(spec: StatsChartSpec, patch: Partial<StatsChartOptions>): Partial<GraphConfig> {
  const nextOptions = { ...spec.options, ...patch };
  return {
    options: nextOptions,
    widthPx: nextOptions.widthPx,
    heightPx: nextOptions.heightPx,
  };
}

export function statsChartFillOpacity(value: string) {
  if (value === "") return undefined;
  const nextOpacity = Number(value);
  return Number.isFinite(nextOpacity) ? Math.min(1, Math.max(0, nextOpacity)) : undefined;
}
