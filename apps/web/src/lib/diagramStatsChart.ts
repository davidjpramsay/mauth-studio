import type {
  GraphConfig,
  StatsChartData,
  StatsChartRegionData,
  StatsChartRegionMode,
  StatsChartSeriesData,
  StatsChartSeriesType,
} from "@mauth-studio/shared";
import { normalizeStatsChartRegions, normalizeStatsChartSeries } from "@mauth-studio/diagram-plotly";

export type StatsChartSeriesTarget = { kind: "series"; index: number };
export type StatsChartRegionTarget = { kind: "region"; index: number };

export function normalizeStatsChartSeriesType(value: unknown): StatsChartSeriesType | undefined {
  return value === "line" || value === "points" || value === "linePoints" || value === "bars" ? value : undefined;
}

export function normalizeStatsChartRegionMode(value: unknown): StatsChartRegionMode | undefined {
  return value === "between" || value === "leftTail" || value === "rightTail" || value === "outside" ? value : undefined;
}

export function statsChartSeries(config?: GraphConfig | null) {
  const data = config?.data as StatsChartData | undefined;
  return normalizeStatsChartSeries(data?.series);
}

function storedStatsChartSeries(config: GraphConfig) {
  const data = config.data as StatsChartData | undefined;
  return Array.isArray(data?.series) ? data.series : [];
}

export function statsChartRegions(config?: GraphConfig | null) {
  const data = config?.data as StatsChartData | undefined;
  return normalizeStatsChartRegions(data?.regions);
}

function storedStatsChartRegions(config: GraphConfig) {
  const data = config.data as StatsChartData | undefined;
  return Array.isArray(data?.regions) ? data.regions : [];
}

export function statsChartSeriesId(series: StatsChartSeriesData, index: number) {
  return series.id.trim() || `series-${index + 1}`;
}

export function statsChartRegionId(region: StatsChartRegionData, index: number) {
  return region.id.trim() || `region-${index + 1}`;
}

export function statsChartSeriesForAuthoringLayer<TSeries extends StatsChartSeriesData>(series: TSeries, solutionsMode: boolean): TSeries {
  return (solutionsMode ? { ...series, solutionOnly: true } : series) as TSeries;
}

export function statsChartSeriesWithSolutionOnly<TSeries extends StatsChartSeriesData>(series: TSeries, solutionOnly: boolean): TSeries {
  return { ...series, solutionOnly };
}

export function statsChartRegionForAuthoringLayer<TRegion extends StatsChartRegionData>(region: TRegion, solutionsMode: boolean): TRegion {
  return (solutionsMode ? { ...region, solutionOnly: true } : region) as TRegion;
}

export function statsChartRegionWithSolutionOnly<TRegion extends StatsChartRegionData>(region: TRegion, solutionOnly: boolean): TRegion {
  return { ...region, solutionOnly };
}

export function isSolutionOnlyStatsChartSeries(series: StatsChartSeriesData) {
  return series.solutionOnly === true;
}

export function statsChartSeriesVisibleInStudent(series: StatsChartSeriesData) {
  return !isSolutionOnlyStatsChartSeries(series);
}

export function isSolutionOnlyStatsChartRegion(region: StatsChartRegionData) {
  return region.solutionOnly === true;
}

export function statsChartRegionVisibleInStudent(region: StatsChartRegionData) {
  return !isSolutionOnlyStatsChartRegion(region);
}

export function statsChartConfigHasSolutionOnly(config?: GraphConfig | null) {
  return statsChartSeries(config).some(isSolutionOnlyStatsChartSeries) || statsChartRegions(config).some(isSolutionOnlyStatsChartRegion);
}

export function statsChartDataWithSeries(config: GraphConfig, series: StatsChartSeriesData[]): StatsChartData {
  const data = (config.data ?? {}) as StatsChartData;
  return {
    ...data,
    chartType: typeof data.chartType === "string" ? data.chartType : "blankAxes",
    series,
  };
}

export function statsChartDataWithRegions(config: GraphConfig, regions: StatsChartRegionData[]): StatsChartData {
  const data = (config.data ?? {}) as StatsChartData;
  return {
    ...data,
    chartType: typeof data.chartType === "string" ? data.chartType : "blankAxes",
    regions,
  };
}

export function statsChartConfigForSolutionVisibility(config: GraphConfig, showSolutions: boolean, solutionColor?: string): GraphConfig {
  const series = statsChartSeries(config);
  const regions = statsChartRegions(config);
  const hasSolutionSeries = series.some(isSolutionOnlyStatsChartSeries);
  const hasSolutionRegions = regions.some(isSolutionOnlyStatsChartRegion);
  if (!hasSolutionSeries && !hasSolutionRegions) return config;
  let nextConfig = config;
  if (hasSolutionSeries) {
    const visibleSeries = showSolutions
      ? series.map((entry) => (isSolutionOnlyStatsChartSeries(entry) && solutionColor ? { ...entry, color: solutionColor } : entry))
      : series.filter(statsChartSeriesVisibleInStudent);
    nextConfig = { ...nextConfig, data: statsChartDataWithSeries(nextConfig, visibleSeries) };
  }
  if (hasSolutionRegions) {
    const visibleRegions = showSolutions
      ? regions.map((entry) => (isSolutionOnlyStatsChartRegion(entry) && solutionColor ? { ...entry, fillColor: solutionColor } : entry))
      : regions.filter(statsChartRegionVisibleInStudent);
    nextConfig = { ...nextConfig, data: statsChartDataWithRegions(nextConfig, visibleRegions) };
  }
  return nextConfig;
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

export function statsChartRegionTarget(config: GraphConfig, index: number): StatsChartRegionTarget | undefined {
  return statsChartRegions(config)[index] ? { kind: "region", index } : undefined;
}

export function statsChartRegionIndexById(config: GraphConfig, id: string) {
  return statsChartRegions(config).findIndex((region, index) => statsChartRegionId(region, index) === id);
}

export function statsChartRegionAt(config: GraphConfig, target: StatsChartRegionTarget) {
  return statsChartRegions(config)[target.index];
}

export function updateStatsChartRegion(
  config: GraphConfig,
  target: StatsChartRegionTarget,
  patch: Partial<StatsChartRegionData>,
): StatsChartData {
  const regions = storedStatsChartRegions(config);
  return statsChartDataWithRegions(
    config,
    regions.map((entry, index) => (index === target.index ? { ...entry, ...patch } : entry)),
  );
}

export function upsertStatsChartRegion(config: GraphConfig, region: StatsChartRegionData): StatsChartData {
  const regions = storedStatsChartRegions(config);
  const index = statsChartRegionIndexById(config, region.id);
  if (index < 0) return statsChartDataWithRegions(config, [...regions, region]);
  return statsChartDataWithRegions(
    config,
    regions.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...region } : entry)),
  );
}

export function deleteStatsChartRegion(config: GraphConfig, target: StatsChartRegionTarget): StatsChartData {
  return statsChartDataWithRegions(
    config,
    storedStatsChartRegions(config).filter((_, index) => index !== target.index),
  );
}

export function statsChartRegionDisplayName(config: GraphConfig, target: StatsChartRegionTarget) {
  const region = statsChartRegionAt(config, target);
  if (!region) return `region ${target.index + 1}`;
  return region.label?.trim() || statsChartRegionId(region, target.index);
}
