import type {
  GraphConfig,
  HistogramBarType,
  StatsChartData,
  StatsChartDataMode,
  StatsChartSeriesData,
  StatsChartSeriesType,
  StatsChartSpec,
  StatsChartType,
  StatsChartYAxisMode,
  StatsChartYLabelOrientation,
} from "@mauth-studio/shared";

export type {
  StatsChartData,
  StatsChartOptions,
  StatsChartSeriesData,
  StatsChartSeriesType,
  StatsChartSpec,
  StatsChartType,
  StatsChartYLabelOrientation,
} from "@mauth-studio/shared";

export interface PlotlyChartConfig {
  data: Array<Record<string, unknown>>;
  layout: Record<string, unknown>;
  config: Record<string, unknown>;
  metadata: {
    chartType: string;
    widthPx: number;
    heightPx: number;
  };
}

const TEST_TEXT_FONT_SIZE_PT = 10;
const TEST_TEXT_FONT_FAMILY = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const DEFAULT_WIDTH_PX = 560;
const DEFAULT_HEIGHT_PX = 320;
const DEFAULT_FILL_COLOR = "#f5f5f5";
const DEFAULT_HISTOGRAM_VALUES = [3, 5, 7, 7, 8, 10];
const DEFAULT_MANUAL_X_VALUES = [2, 4, 5, 6, 7];
const DEFAULT_MANUAL_PROBABILITIES = [0.1, 0.25, 0.3, 0.15, 0.2];
const DEFAULT_BOX_VALUES = [1, 2, 3, 4, 5, 6, 7];
const DEFAULT_BLANK_Y_RANGE: [number, number] = [0, 1];

type SupportedStatsChartType = "histogram" | "binomial" | "normal" | "box" | "density" | "blankAxes";
type DensityPoint = { x: number; y: number; label?: string };

export const STATS_CHART_TYPES: Array<{ value: SupportedStatsChartType; label: string }> = [
  { value: "histogram", label: "Histogram / column graph" },
  { value: "binomial", label: "Binomial distribution" },
  { value: "normal", label: "Normal distribution" },
  { value: "box", label: "Box plot" },
  { value: "density", label: "Probability density curve" },
  { value: "blankAxes", label: "Blank statistics axes" },
];

export const DEFAULT_STATS_CHART_SPEC: StatsChartSpec = {
  type: "statsChart",
  data: {
    chartType: "histogram",
    yLabelOrientation: "vertical",
    values: DEFAULT_HISTOGRAM_VALUES,
    xLabel: "Value",
    yLabel: "Frequency",
  },
  style: "exam",
  options: {
    widthPx: DEFAULT_WIDTH_PX,
    heightPx: DEFAULT_HEIGHT_PX,
    showGrid: true,
    showFill: true,
    fillColor: DEFAULT_FILL_COLOR,
    fillOpacity: 1,
    interactive: false,
    showLegend: false,
    fontSizePt: TEST_TEXT_FONT_SIZE_PT,
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function numeric(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value: unknown, fallback: number) {
  const number = numeric(value, fallback);
  return number > 0 ? number : fallback;
}

function numberArray(value: unknown, fallback: number[]) {
  if (!Array.isArray(value)) return fallback;
  const values = value.map(Number).filter(Number.isFinite);
  return values.length ? values : fallback;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function optionalPositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function statsChartSeriesType(value: unknown): StatsChartSeriesType {
  if (value === "points" || value === "linePoints" || value === "bars") return value;
  return "line";
}

export function normalizeStatsChartSeries(value: unknown): StatsChartSeriesData[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index): StatsChartSeriesData[] => {
    const record = asRecord(entry);
    if (!record) return [];
    const xValues = numberArray(record.xValues, []);
    const yValues = numberArray(record.yValues, []);
    const pairCount = Math.min(xValues.length, yValues.length);
    if (!pairCount) return [];
    const id = stringValue(record.id, `series-${index + 1}`).trim() || `series-${index + 1}`;
    return [
      {
        ...record,
        id,
        label: stringValue(record.label, ""),
        seriesType: statsChartSeriesType(record.seriesType ?? record.kind),
        xValues: xValues.slice(0, pairCount),
        yValues: yValues.slice(0, pairCount),
        color: stringValue(record.color, "#111111"),
        lineWidth: optionalPositiveNumber(record.lineWidth),
        markerSize: optionalPositiveNumber(record.markerSize),
        barWidth: optionalPositiveNumber(record.barWidth),
        show: record.show !== false,
        solutionOnly: record.solutionOnly === true,
      },
    ];
  });
}

function chartType(value: unknown): StatsChartType {
  return typeof value === "string" && value.trim() ? value : "histogram";
}

function histogramBarType(value: unknown): HistogramBarType {
  return value === "discrete" ? "discrete" : "continuous";
}

function statsChartDataMode(value: unknown): StatsChartDataMode {
  if (value === "manualFrequencies") return "manualFrequencies";
  return value === "manualProbabilities" ? "manualProbabilities" : "raw";
}

function statsChartYAxisMode(value: unknown): StatsChartYAxisMode {
  return value === "relativeFrequency" ? "relativeFrequency" : "frequency";
}

function statsChartYLabelOrientation(value: unknown): StatsChartYLabelOrientation {
  return value === "horizontal" ? "horizontal" : "vertical";
}

function rangeValue(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value) || value.length < 2) return fallback;
  const left = Number(value[0]);
  const right = Number(value[1]);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left === right) return fallback;
  return left < right ? [left, right] : [right, left];
}

function extentRange(values: number[], fallback: [number, number], includeZero = false): [number, number] {
  const finiteValues = values.filter(Number.isFinite);
  if (!finiteValues.length) return fallback;
  let min = Math.min(...finiteValues);
  let max = Math.max(...finiteValues);
  if (includeZero) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.1);
    return [Number((min - pad).toFixed(8)), Number((max + pad).toFixed(8))];
  }
  const pad = (max - min) * 0.04;
  return [Number((min - pad).toFixed(8)), Number((max + pad).toFixed(8))];
}

function densityPointPairs(sourceData: Record<string, unknown>) {
  const fromPoints = Array.isArray(sourceData.points)
    ? sourceData.points.flatMap((point): DensityPoint[] => {
        const pointRecord = asRecord(point);
        const x = Number(pointRecord?.x);
        const y = Number(pointRecord?.y);
        const label = typeof pointRecord?.label === "string" ? pointRecord.label : undefined;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
        return label === undefined ? [{ x, y }] : [{ x, y, label }];
      })
    : [];

  if (fromPoints.length) {
    const points = [...fromPoints].sort((left, right) => left.x - right.x);
    return {
      points,
      xs: points.map((point) => point.x),
      ys: points.map((point) => point.y),
    };
  }

  const xs = numberArray(sourceData.xValues, []);
  const ys = numberArray(sourceData.yValues, []);
  const pairCount = Math.min(xs.length, ys.length);
  const points = Array.from({ length: pairCount }, (_, index) => ({ x: xs[index], y: ys[index] }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((left, right) => left.x - right.x);
  return {
    points,
    xs: points.map((point) => point.x),
    ys: points.map((point) => point.y),
  };
}

function pairedManualProbabilityValues(sourceData: Record<string, unknown>) {
  const sourceX = numberArray(sourceData.xValues, DEFAULT_MANUAL_X_VALUES);
  const sourceProbabilities = numberArray(sourceData.probabilities, DEFAULT_MANUAL_PROBABILITIES).map((value) => Math.max(0, value));
  return {
    xValues: sourceX.length ? sourceX : DEFAULT_MANUAL_X_VALUES,
    probabilities: sourceProbabilities.length ? sourceProbabilities : DEFAULT_MANUAL_PROBABILITIES,
  };
}

export function normalizeStatsChartSpec(source?: GraphConfig | StatsChartSpec | null): StatsChartSpec {
  const sourceRecord = asRecord(source);
  const sourceData = asRecord(sourceRecord?.data) ?? {};
  const sourceOptions = asRecord(sourceRecord?.options) ?? {};
  const fallbackData = DEFAULT_STATS_CHART_SPEC.data;
  const selectedChartType = chartType(sourceData.chartType ?? fallbackData.chartType);
  const defaultValues = selectedChartType === "box" ? DEFAULT_BOX_VALUES : DEFAULT_HISTOGRAM_VALUES;
  const widthPx = positiveNumber(sourceOptions.widthPx ?? sourceRecord?.widthPx, DEFAULT_WIDTH_PX);
  const heightPx = positiveNumber(sourceOptions.heightPx ?? sourceRecord?.heightPx, DEFAULT_HEIGHT_PX);
  const mean = numeric(sourceData.mean, 0);
  const stdDev = positiveNumber(sourceData.stdDev, 1);
  const trials = Math.max(1, Math.floor(positiveNumber(sourceData.trials, 10)));
  const probability = Math.min(1, Math.max(0, numeric(sourceData.probability, 0.5)));
  const hasManualFrequencies =
    selectedChartType === "histogram" && Array.isArray(sourceData.xValues) && Array.isArray(sourceData.frequencies);
  const hasLegacyManualFrequencyValues =
    selectedChartType === "histogram" &&
    Array.isArray(sourceData.xValues) &&
    Array.isArray(sourceData.values) &&
    sourceData.xValues.length === sourceData.values.length;
  const dataMode =
    selectedChartType === "histogram"
      ? hasManualFrequencies || hasLegacyManualFrequencyValues
        ? "manualFrequencies"
        : statsChartDataMode(sourceData.dataMode)
      : "raw";
  const barType =
    selectedChartType === "histogram" && dataMode !== "manualProbabilities" ? histogramBarType(sourceData.barType) : "discrete";
  const yAxisMode = selectedChartType === "histogram" ? statsChartYAxisMode(sourceData.yAxisMode) : "frequency";
  const yLabelOrientation = selectedChartType === "histogram" ? statsChartYLabelOrientation(sourceData.yLabelOrientation) : "vertical";
  const manualProbabilities = pairedManualProbabilityValues(sourceData);
  const densityPoints = densityPointPairs(sourceData);
  const defaultRange =
    selectedChartType === "density"
      ? extentRange(densityPoints.xs, [mean - 3 * stdDev, mean + 3 * stdDev])
      : [mean - 3 * stdDev, mean + 3 * stdDev];
  const defaultYRange =
    selectedChartType === "density" ? extentRange(densityPoints.ys, DEFAULT_BLANK_Y_RANGE, true) : DEFAULT_BLANK_Y_RANGE;
  const histogramDefaultYLabel =
    dataMode === "manualProbabilities" ? "P(X=x)" : yAxisMode === "relativeFrequency" ? "Relative frequency" : "Frequency";

  return {
    type: "statsChart",
    data: {
      ...sourceData,
      chartType: selectedChartType,
      barType,
      dataMode,
      yAxisMode,
      yLabelOrientation,
      values: numberArray(sourceData.values, defaultValues),
      xValues: selectedChartType === "density" ? densityPoints.xs : manualProbabilities.xValues,
      yValues: selectedChartType === "density" ? densityPoints.ys : numberArray(sourceData.yValues, []),
      probabilities: selectedChartType === "histogram" ? manualProbabilities.probabilities : numberArray(sourceData.probabilities, []),
      frequencies:
        selectedChartType === "histogram"
          ? numberArray(sourceData.frequencies, hasLegacyManualFrequencyValues ? numberArray(sourceData.values, []) : [])
          : numberArray(sourceData.frequencies, []),
      points: selectedChartType === "density" ? densityPoints.points : Array.isArray(sourceData.points) ? sourceData.points : undefined,
      mean,
      stdDev,
      trials,
      probability,
      range: rangeValue(sourceData.range, defaultRange as [number, number]),
      yRange: rangeValue(sourceData.yRange, defaultYRange),
      bins: sourceData.bins === undefined ? undefined : positiveNumber(sourceData.bins, 6),
      binSize:
        sourceData.binSize === undefined && sourceData.binWidth === undefined
          ? undefined
          : positiveNumber(sourceData.binSize ?? sourceData.binWidth, 1),
      xLabel: stringValue(
        sourceData.xLabel,
        selectedChartType === "normal" ||
          selectedChartType === "binomial" ||
          selectedChartType === "density" ||
          dataMode === "manualProbabilities"
          ? "x"
          : "Value",
      ),
      yLabel: stringValue(
        sourceData.yLabel,
        selectedChartType === "normal"
          ? "Density"
          : selectedChartType === "density"
            ? "Density"
            : selectedChartType === "binomial"
              ? "Probability"
              : selectedChartType === "box"
                ? ""
                : histogramDefaultYLabel,
      ),
      title: stringValue(sourceData.title, ""),
      series: normalizeStatsChartSeries(sourceData.series),
    },
    style: stringValue(sourceRecord?.style, "exam"),
    options: {
      ...sourceOptions,
      widthPx,
      heightPx,
      showGrid: typeof sourceOptions.showGrid === "boolean" ? sourceOptions.showGrid : true,
      showFill: typeof sourceOptions.showFill === "boolean" ? sourceOptions.showFill : true,
      fillColor: stringValue(sourceOptions.fillColor, DEFAULT_FILL_COLOR),
      fillOpacity: Math.min(1, Math.max(0, numeric(sourceOptions.fillOpacity, 1))),
      interactive: typeof sourceOptions.interactive === "boolean" ? sourceOptions.interactive : false,
      showLegend: typeof sourceOptions.showLegend === "boolean" ? sourceOptions.showLegend : false,
      fontSizePt: positiveNumber(sourceOptions.fontSizePt, TEST_TEXT_FONT_SIZE_PT),
      normalPointCount: Math.max(80, Math.floor(positiveNumber(sourceOptions.normalPointCount, 181))),
    },
  };
}

function normalCurvePoints(mean: number, stdDev: number, range: [number, number], pointCount: number) {
  const xs: number[] = [];
  const ys: number[] = [];
  const denominator = stdDev * Math.sqrt(2 * Math.PI);
  const step = (range[1] - range[0]) / Math.max(1, pointCount - 1);

  for (let index = 0; index < pointCount; index += 1) {
    const x = range[0] + step * index;
    const exponent = -0.5 * ((x - mean) / stdDev) ** 2;
    xs.push(Number(x.toFixed(6)));
    ys.push(Number((Math.exp(exponent) / denominator).toFixed(8)));
  }

  return { xs, ys };
}

function densityCurvePoints(data: StatsChartData) {
  const fromPoints = Array.isArray(data.points)
    ? data.points
        .map((point) => ({ x: Number(point.x), y: Number(point.y), label: point.label }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
        .sort((left, right) => left.x - right.x)
    : [];

  if (fromPoints.length) {
    return {
      xs: fromPoints.map((point) => point.x),
      ys: fromPoints.map((point) => point.y),
    };
  }

  const xs = data.xValues?.filter(Number.isFinite) ?? [];
  const ys = data.yValues?.filter(Number.isFinite) ?? [];
  const pairCount = Math.min(xs.length, ys.length);
  if (pairCount) {
    const points = Array.from({ length: pairCount }, (_, index) => ({ x: xs[index], y: ys[index] })).sort(
      (left, right) => left.x - right.x,
    );
    return {
      xs: points.map((point) => point.x),
      ys: points.map((point) => point.y),
    };
  }

  return normalCurvePoints(data.mean ?? 0, data.stdDev ?? 1, data.range ?? [-3, 3], 181);
}

function binomialCoefficient(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  const smaller = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= smaller; index += 1) {
    result *= (n - smaller + index) / index;
  }
  return result;
}

function binomialDistributionPoints(trials = 10, probability = 0.5) {
  const n = Math.max(1, Math.floor(trials));
  const p = Math.min(1, Math.max(0, probability));
  const xs: number[] = [];
  const ys: number[] = [];

  for (let k = 0; k <= n; k += 1) {
    xs.push(k);
    ys.push(Number((binomialCoefficient(n, k) * p ** k * (1 - p) ** (n - k)).toFixed(8)));
  }

  return { xs, ys };
}

function chartFont(fontSizePx: number) {
  return {
    family: TEST_TEXT_FONT_FAMILY,
    size: fontSizePx,
    color: "#111111",
    weight: 400,
  };
}

function axisTitle(value: string | undefined, fontSizePx: number) {
  return {
    text: value ?? "",
    font: chartFont(fontSizePx),
    standoff: 10,
  };
}

function baseAxis(showGrid: boolean, label: string, fontSizePx: number) {
  return {
    title: axisTitle(label, fontSizePx),
    showline: true,
    linewidth: 1.4,
    linecolor: "#111111",
    mirror: false,
    ticks: "",
    ticklen: 0,
    tickwidth: 0,
    tickcolor: "#111111",
    showgrid: showGrid,
    gridcolor: "#d8d8d8",
    gridwidth: 1,
    zeroline: false,
    tickfont: chartFont(fontSizePx),
    automargin: true,
  };
}

function gridBoundaryShapes(showGrid: boolean) {
  if (!showGrid) return undefined;
  const boundaryLine = { color: "#d8d8d8", width: 1 };
  return [
    {
      type: "line",
      xref: "paper",
      yref: "paper",
      x0: 0,
      x1: 1,
      y0: 1,
      y1: 1,
      line: boundaryLine,
      layer: "below",
    },
    {
      type: "line",
      xref: "paper",
      yref: "paper",
      x0: 1,
      x1: 1,
      y0: 0,
      y1: 1,
      line: boundaryLine,
      layer: "below",
    },
  ];
}

function discreteBarWidth(xs: number[]) {
  if (xs.length < 2) return 0.72;
  const sorted = [...xs].sort((left, right) => left - right);
  const gaps = sorted
    .slice(1)
    .map((value, index) => value - sorted[index])
    .filter((value) => value > 0);
  const minGap = gaps.length ? Math.min(...gaps) : 1;
  return Number((minGap * 0.72).toFixed(6));
}

function discreteRange(xs: number[], width: number): [number, number] {
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const pad = Math.max(width, 1) * 0.75;
  return [Number((min - pad).toFixed(6)), Number((max + pad).toFixed(6))];
}

function manualProbabilityBarData(data: StatsChartData) {
  const xValues = data.xValues?.length ? data.xValues : DEFAULT_MANUAL_X_VALUES;
  const probabilities = data.probabilities?.length ? data.probabilities.map((value) => Math.max(0, value)) : DEFAULT_MANUAL_PROBABILITIES;
  const pairs = xValues
    .map((x, index) => ({ x, probability: probabilities[index] ?? 0 }))
    .filter((pair) => Number.isFinite(pair.x) && Number.isFinite(pair.probability))
    .sort((left, right) => left.x - right.x);
  const centres = pairs.length ? pairs.map((pair) => pair.x) : DEFAULT_MANUAL_X_VALUES;
  const yValues = pairs.length ? pairs.map((pair) => pair.probability) : DEFAULT_MANUAL_PROBABILITIES;
  const width = discreteBarWidth(centres);
  return {
    centres,
    counts: yValues,
    yValues,
    edges: undefined,
    width,
    range: discreteRange(centres, width),
    tickvals: centres,
    discrete: true,
    manual: true,
    relative: true,
  };
}

function manualFrequencyBarData(data: StatsChartData) {
  const xValues = data.xValues?.length ? data.xValues : DEFAULT_MANUAL_X_VALUES;
  const frequencies = data.frequencies?.length ? data.frequencies.map((value) => Math.max(0, value)) : DEFAULT_MANUAL_PROBABILITIES;
  const pairs = xValues
    .map((x, index) => ({ x, frequency: frequencies[index] ?? 0 }))
    .filter((pair) => Number.isFinite(pair.x) && Number.isFinite(pair.frequency))
    .sort((left, right) => left.x - right.x);
  const centres = pairs.length ? pairs.map((pair) => pair.x) : DEFAULT_MANUAL_X_VALUES;
  const counts = pairs.length ? pairs.map((pair) => pair.frequency) : DEFAULT_MANUAL_PROBABILITIES;
  const relative = data.yAxisMode === "relativeFrequency";
  const total = counts.reduce((sum, count) => sum + count, 0) || 1;
  const yValues = relative ? counts.map((count) => Number((count / total).toFixed(8))) : counts;
  const requestedWidth = positiveNumber(data.binSize, discreteBarWidth(centres));
  const width = data.barType === "continuous" ? requestedWidth : discreteBarWidth(centres);
  const range =
    data.barType === "continuous"
      ? ([Number((centres[0] - width / 2).toFixed(6)), Number((centres[centres.length - 1] + width / 2).toFixed(6))] as [number, number])
      : discreteRange(centres, width);
  const edges =
    data.barType === "continuous"
      ? centres.map((centre) => [Number((centre - width / 2).toFixed(6)), Number((centre + width / 2).toFixed(6))])
      : undefined;
  return {
    centres,
    counts,
    yValues,
    edges,
    width,
    range,
    tickvals: centres,
    discrete: data.barType !== "continuous",
    manual: true,
    relative,
  };
}

function discreteFrequencyBarData(data: StatsChartData) {
  const values = (data.values ?? DEFAULT_HISTOGRAM_VALUES).filter(Number.isFinite);
  const sourceValues = values.length ? values : DEFAULT_HISTOGRAM_VALUES;
  const countsByValue = new Map<number, number>();
  sourceValues.forEach((value) => {
    countsByValue.set(value, (countsByValue.get(value) ?? 0) + 1);
  });
  const centres = [...countsByValue.keys()].sort((left, right) => left - right);
  const counts = centres.map((value) => countsByValue.get(value) ?? 0);
  const relative = data.yAxisMode === "relativeFrequency";
  const total = counts.reduce((sum, count) => sum + count, 0) || 1;
  const yValues = relative ? counts.map((count) => Number((count / total).toFixed(8))) : counts;
  const width = discreteBarWidth(centres);
  return {
    centres,
    counts,
    yValues,
    edges: undefined,
    width,
    range: discreteRange(centres, width),
    tickvals: centres,
    discrete: true,
    manual: false,
    relative,
  };
}

function histogramBarData(data: StatsChartData) {
  if (data.dataMode === "manualProbabilities") return manualProbabilityBarData(data);
  if (data.dataMode === "manualFrequencies") return manualFrequencyBarData(data);
  if (data.barType === "discrete") return discreteFrequencyBarData(data);

  const values = (data.values ?? DEFAULT_HISTOGRAM_VALUES).filter(Number.isFinite);
  const sourceValues = values.length ? values : DEFAULT_HISTOGRAM_VALUES;
  const min = Math.min(...sourceValues);
  const max = Math.max(...sourceValues);

  let start: number;
  let end: number;
  let binWidth: number;
  let binCount: number;

  if (data.binSize) {
    binWidth = positiveNumber(data.binSize, 1);
    start = Math.floor(min / binWidth) * binWidth;
    end = Math.ceil(max / binWidth) * binWidth;
    if (end <= start) end = start + binWidth;
    binCount = Math.max(1, Math.ceil((end - start) / binWidth));
    end = start + binCount * binWidth;
  } else {
    binCount = Math.max(1, Math.floor(positiveNumber(data.bins, Math.ceil(Math.sqrt(sourceValues.length)))));
    if (min === max) {
      start = min - 0.5;
      end = max + 0.5;
    } else {
      start = min;
      end = max;
    }
    binWidth = (end - start) / binCount;
  }

  const counts = Array.from({ length: binCount }, () => 0);
  sourceValues.forEach((value) => {
    const rawIndex = Math.floor((value - start) / binWidth);
    const index = Math.min(binCount - 1, Math.max(0, rawIndex));
    counts[index] += 1;
  });

  const centres = counts.map((_, index) => Number((start + binWidth * (index + 0.5)).toFixed(6)));
  const relative = data.yAxisMode === "relativeFrequency";
  const total = counts.reduce((sum, count) => sum + count, 0) || 1;
  const yValues = relative ? counts.map((count) => Number((count / total).toFixed(8))) : counts;
  const edges = counts.map((_, index) => {
    const left = start + binWidth * index;
    return [Number(left.toFixed(6)), Number((left + binWidth).toFixed(6))];
  });

  return {
    centres,
    counts,
    yValues,
    edges,
    width: binWidth,
    range: [start, end] as [number, number],
    tickvals: fixedStepTicks(start, end, binWidth),
    discrete: false,
    manual: false,
    relative,
  };
}

function niceStep(value: number, targetTicks = 5) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const rawStep = value / Math.max(1, targetTicks);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

function positiveTickAxis(values: number[], fallbackMax = 1, integerTicks = false) {
  const max = Math.max(...values.filter(Number.isFinite), fallbackMax);
  const step = integerTicks ? Math.max(1, Math.ceil(niceStep(max, 5))) : niceStep(max, 5);
  const upper = Math.max(step, Math.ceil(max / step) * step);
  return {
    range: [0, Number(upper.toFixed(8))] as [number, number],
    tickmode: "linear" as const,
    dtick: Number(step.toFixed(8)),
  };
}

function fixedStepTicks(start: number, end: number, step: number, maxTicks = 16) {
  const tickCount = Math.round((end - start) / step);
  if (!Number.isFinite(tickCount) || tickCount < 1 || tickCount > maxTicks) return undefined;
  return Array.from({ length: tickCount + 1 }, (_, index) => Number((start + step * index).toFixed(6)));
}

function colorWithOpacity(color: string, opacity: number) {
  const alpha = Math.min(1, Math.max(0, opacity));
  const normalized = color.trim();
  const shortHex = normalized.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("").map((channel) => parseInt(channel + channel, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const hex = normalized.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const value = hex[1];
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return normalized || DEFAULT_FILL_COLOR;
}

function baseChartTraces(spec: StatsChartSpec) {
  const data = spec.data;
  const options = spec.options ?? {};
  const lineColor = "#111111";
  const fillColor =
    options.showFill === false
      ? "rgba(255, 255, 255, 0)"
      : colorWithOpacity(options.fillColor || DEFAULT_FILL_COLOR, options.fillOpacity ?? 1);
  const markerLine = { color: "#111111", width: 1.4 };

  if (data.chartType === "normal") {
    const { xs, ys } = normalCurvePoints(data.mean ?? 0, data.stdDev ?? 1, data.range ?? [-3, 3], options.normalPointCount ?? 181);
    return [
      {
        type: "scatter",
        mode: "lines",
        x: xs,
        y: ys,
        hoverinfo: "skip",
        cliponaxis: false,
        line: { color: lineColor, width: 2.4, shape: "spline" },
        name: data.title || "Normal distribution",
      },
    ];
  }

  if (data.chartType === "density") {
    const { xs, ys } = densityCurvePoints(data);
    return [
      {
        type: "scatter",
        mode: "lines",
        x: xs,
        y: ys,
        hoverinfo: "skip",
        cliponaxis: false,
        line: { color: lineColor, width: 2.4, shape: "spline" },
        name: data.title || "Density",
      },
    ];
  }

  if (data.chartType === "blankAxes") return [];

  if (data.chartType === "box") {
    return [
      {
        type: "box",
        x: data.values ?? DEFAULT_BOX_VALUES,
        orientation: "h",
        boxpoints: false,
        fillcolor: fillColor,
        line: { color: lineColor, width: 2 },
        marker: { color: lineColor },
        name: data.title || "",
        hoverinfo: "skip",
      },
    ];
  }

  if (data.chartType === "binomial") {
    const { xs, ys } = binomialDistributionPoints(data.trials, data.probability);
    return [
      {
        type: "bar",
        x: xs,
        y: ys,
        marker: {
          color: fillColor,
          line: markerLine,
        },
        hoverinfo: "skip",
        cliponaxis: false,
        name: data.title || "Probability",
      },
    ];
  }

  const histogram = histogramBarData(data);

  return [
    {
      type: "bar",
      x: histogram.centres,
      y: histogram.yValues,
      width: histogram.width,
      customdata: histogram.edges ?? histogram.counts,
      marker: {
        color: fillColor,
        line: markerLine,
      },
      hoverinfo: "skip",
      cliponaxis: false,
      name: data.title || (histogram.manual ? "Probability" : histogram.relative ? "Relative frequency" : "Frequency"),
    },
  ];
}

function supplementalSeriesTraces(data: StatsChartData) {
  return normalizeStatsChartSeries(data.series)
    .filter((series) => series.show !== false)
    .map((series) => {
      const color = series.color || "#111111";
      const name = series.label?.trim() || series.id;
      if (series.seriesType === "bars") {
        return {
          type: "bar",
          x: series.xValues,
          y: series.yValues,
          ...(series.barWidth ? { width: series.barWidth } : {}),
          marker: {
            color,
            line: { color, width: 1.4 },
          },
          hoverinfo: "skip",
          cliponaxis: false,
          name,
          meta: { mauthSeriesId: series.id },
        };
      }

      const mode = series.seriesType === "points" ? "markers" : series.seriesType === "linePoints" ? "lines+markers" : "lines";
      return {
        type: "scatter",
        mode,
        x: series.xValues,
        y: series.yValues,
        hoverinfo: "skip",
        cliponaxis: false,
        line: { color, width: series.lineWidth ?? 2.4 },
        marker: { color, size: series.markerSize ?? 7 },
        name,
        meta: { mauthSeriesId: series.id },
      };
    });
}

function chartTraces(spec: StatsChartSpec) {
  return [...baseChartTraces(spec), ...supplementalSeriesTraces(spec.data)];
}

export function buildStatsChartPlotlyConfig(input?: GraphConfig | StatsChartSpec | null): PlotlyChartConfig {
  const spec = normalizeStatsChartSpec(input);
  const options = spec.options ?? {};
  const data = spec.data;
  const widthPx = positiveNumber(options.widthPx, DEFAULT_WIDTH_PX);
  const heightPx = positiveNumber(options.heightPx, DEFAULT_HEIGHT_PX);
  const showGrid = options.showGrid ?? true;
  const fontSizePx = (positiveNumber(options.fontSizePt, TEST_TEXT_FONT_SIZE_PT) * 4) / 3;
  const histogram = data.chartType === "histogram" ? histogramBarData(data) : undefined;
  const horizontalYLabel = data.chartType === "histogram" && data.yLabelOrientation === "horizontal" && Boolean(data.yLabel?.trim());
  const binomial = data.chartType === "binomial" ? binomialDistributionPoints(data.trials, data.probability) : undefined;
  const normal =
    data.chartType === "normal"
      ? normalCurvePoints(data.mean ?? 0, data.stdDev ?? 1, data.range ?? [-3, 3], options.normalPointCount ?? 181)
      : undefined;
  const density = data.chartType === "density" ? densityCurvePoints(data) : undefined;
  const histogramYAxis = positiveTickAxis(
    histogram?.yValues ?? [],
    histogram?.relative || histogram?.manual ? 0.1 : 1,
    !histogram?.relative && !histogram?.manual,
  );
  const binomialYAxis = positiveTickAxis(binomial?.ys ?? [], 0.1);
  const normalYAxis = positiveTickAxis(normal?.ys ?? [], 0.1);
  const densityYAxis = data.yRange ? { range: data.yRange } : positiveTickAxis(density?.ys ?? [], 0.1);

  return {
    data: chartTraces(spec),
    layout: {
      width: widthPx,
      height: heightPx,
      autosize: false,
      title: data.title ? { text: data.title, x: 0.5, xanchor: "center", y: 0.96 } : undefined,
      showlegend: options.showLegend ?? false,
      bargap: data.chartType === "binomial" || histogram?.discrete ? 0.18 : 0,
      boxgap: 0.35,
      margin: {
        l: data.chartType === "box" || !data.yLabel?.trim() ? 54 : horizontalYLabel ? 60 : 78,
        r: 22,
        t: data.title ? 42 : horizontalYLabel ? 34 : 18,
        b: 50,
      },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      font: chartFont(fontSizePx),
      shapes: gridBoundaryShapes(showGrid),
      xaxis:
        data.chartType === "binomial"
          ? {
              ...baseAxis(showGrid, data.xLabel ?? "", fontSizePx),
              range: [-0.5, (data.trials ?? 10) + 0.5],
              tickmode: "linear",
              dtick: 1,
            }
          : data.chartType === "histogram"
            ? {
                ...baseAxis(showGrid, data.xLabel ?? "", fontSizePx),
                range: histogram?.range,
                ...(histogram
                  ? {
                      tickmode: "array",
                      tickvals: histogram.tickvals,
                    }
                  : {}),
              }
            : data.chartType === "normal"
              ? {
                  ...baseAxis(showGrid, data.xLabel ?? "", fontSizePx),
                  range: data.range,
                }
              : data.chartType === "density" || data.chartType === "blankAxes"
                ? {
                    ...baseAxis(showGrid, data.xLabel ?? "", fontSizePx),
                    range: data.range,
                  }
                : baseAxis(showGrid, data.xLabel ?? "", fontSizePx),
      yaxis:
        data.chartType === "box"
          ? {
              ...baseAxis(false, "", fontSizePx),
              showticklabels: false,
              ticks: "",
            }
          : data.chartType === "histogram"
            ? {
                ...baseAxis(showGrid, horizontalYLabel ? "" : (data.yLabel ?? ""), fontSizePx),
                ...histogramYAxis,
                rangemode: "tozero",
              }
            : data.chartType === "binomial"
              ? {
                  ...baseAxis(showGrid, data.yLabel ?? "", fontSizePx),
                  ...binomialYAxis,
                  rangemode: "tozero",
                }
              : data.chartType === "normal"
                ? {
                    ...baseAxis(showGrid, data.yLabel ?? "", fontSizePx),
                    ...normalYAxis,
                    rangemode: "tozero",
                  }
                : data.chartType === "density" || data.chartType === "blankAxes"
                  ? {
                      ...baseAxis(showGrid, data.yLabel ?? "", fontSizePx),
                      ...densityYAxis,
                      rangemode: "tozero",
                    }
                  : baseAxis(showGrid, data.yLabel ?? "", fontSizePx),
    },
    config: {
      staticPlot: !(options.interactive ?? false),
      responsive: true,
      displayModeBar: false,
      displaylogo: false,
      scrollZoom: false,
    },
    metadata: {
      chartType: String(data.chartType),
      widthPx,
      heightPx,
    },
  };
}

export function statsChartSummary(input?: GraphConfig | StatsChartSpec | null) {
  const spec = normalizeStatsChartSpec(input);
  const data = spec.data;
  if (data.chartType === "normal") return `Normal: mean ${data.mean}, standard deviation ${data.stdDev}`;
  if (data.chartType === "density") return `Density curve: ${densityCurvePoints(data).xs.length} points`;
  if (data.chartType === "blankAxes") return "Blank statistics axes";
  if (data.chartType === "binomial") return `Binomial: n ${data.trials}, p ${data.probability}`;
  if (data.chartType === "box") return `Box plot: ${data.values?.length ?? 0} values`;
  if (data.dataMode === "manualProbabilities") return `Manual probabilities: ${data.xValues?.length ?? 0} values`;
  return data.barType === "discrete" ? `Column graph: ${data.values?.length ?? 0} values` : `Histogram: ${data.values?.length ?? 0} values`;
}
