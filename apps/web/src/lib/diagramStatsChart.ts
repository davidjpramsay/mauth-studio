import type { GraphConfig, StatsChartData, StatsChartSeriesData, StatsChartSeriesType } from "@mauth-studio/shared";
import { normalizeStatsChartSeries } from "@mauth-studio/diagram-plotly";

export type StatsChartSeriesTarget = { kind: "series"; index: number };

export function normalizeStatsChartSeriesType(value: unknown): StatsChartSeriesType | undefined {
  return value === "line" || value === "points" || value === "linePoints" || value === "bars" ? value : undefined;
}

export function statsChartSeries(config?: GraphConfig | null) {
  const data = config?.data as StatsChartData | undefined;
  return normalizeStatsChartSeries(data?.series);
}

function storedStatsChartSeries(config: GraphConfig) {
  const data = config.data as StatsChartData | undefined;
  return Array.isArray(data?.series) ? data.series : [];
}

export function statsChartSeriesId(series: StatsChartSeriesData, index: number) {
  return series.id.trim() || `series-${index + 1}`;
}

export function statsChartSeriesForAuthoringLayer<TSeries extends StatsChartSeriesData>(series: TSeries, solutionsMode: boolean): TSeries {
  return (solutionsMode ? { ...series, solutionOnly: true } : series) as TSeries;
}

export function statsChartSeriesWithSolutionOnly<TSeries extends StatsChartSeriesData>(series: TSeries, solutionOnly: boolean): TSeries {
  return { ...series, solutionOnly };
}

export function isSolutionOnlyStatsChartSeries(series: StatsChartSeriesData) {
  return series.solutionOnly === true;
}

export function statsChartSeriesVisibleInStudent(series: StatsChartSeriesData) {
  return !isSolutionOnlyStatsChartSeries(series);
}

export function statsChartConfigHasSolutionOnly(config?: GraphConfig | null) {
  return statsChartSeries(config).some(isSolutionOnlyStatsChartSeries);
}

export function statsChartDataWithSeries(config: GraphConfig, series: StatsChartSeriesData[]): StatsChartData {
  const data = (config.data ?? {}) as StatsChartData;
  return {
    ...data,
    chartType: typeof data.chartType === "string" ? data.chartType : "blankAxes",
    series,
  };
}

export function statsChartConfigForSolutionVisibility(config: GraphConfig, showSolutions: boolean, solutionColor?: string): GraphConfig {
  const series = statsChartSeries(config);
  if (!series.some(isSolutionOnlyStatsChartSeries)) return config;
  const visibleSeries = showSolutions
    ? series.map((entry) => (isSolutionOnlyStatsChartSeries(entry) && solutionColor ? { ...entry, color: solutionColor } : entry))
    : series.filter(statsChartSeriesVisibleInStudent);
  return { ...config, data: statsChartDataWithSeries(config, visibleSeries) };
}

export function statsChartSeriesTarget(config: GraphConfig, index: number): StatsChartSeriesTarget | undefined {
  return statsChartSeries(config)[index] ? { kind: "series", index } : undefined;
}

export function statsChartSeriesIndexById(config: GraphConfig, id: string) {
  return statsChartSeries(config).findIndex((series, index) => statsChartSeriesId(series, index) === id);
}

export function statsChartSeriesAt(config: GraphConfig, target: StatsChartSeriesTarget) {
  return statsChartSeries(config)[target.index];
}

export function updateStatsChartSeries(
  config: GraphConfig,
  target: StatsChartSeriesTarget,
  patch: Partial<StatsChartSeriesData>,
): StatsChartData {
  const series = storedStatsChartSeries(config);
  return statsChartDataWithSeries(
    config,
    series.map((entry, index) => (index === target.index ? { ...entry, ...patch } : entry)),
  );
}

export function statsChartSeriesDisplayName(config: GraphConfig, target: StatsChartSeriesTarget) {
  const series = statsChartSeriesAt(config, target);
  if (!series) return `series ${target.index + 1}`;
  return series.label?.trim() || statsChartSeriesId(series, target.index);
}
