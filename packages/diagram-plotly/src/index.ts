import type { GraphConfig, StatsChartData, StatsChartSpec, StatsChartType } from "@mauth-studio/shared";

export type { StatsChartData, StatsChartOptions, StatsChartSpec, StatsChartType } from "@mauth-studio/shared";

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
const DEFAULT_BOX_VALUES = [1, 2, 3, 4, 5, 6, 7];

export const STATS_CHART_TYPES: Array<{ value: "histogram" | "binomial" | "normal" | "box"; label: string }> = [
  { value: "histogram", label: "Histogram" },
  { value: "binomial", label: "Binomial distribution" },
  { value: "normal", label: "Normal distribution" },
  { value: "box", label: "Box plot" },
];

export const DEFAULT_STATS_CHART_SPEC: StatsChartSpec = {
  type: "statsChart",
  data: {
    chartType: "histogram",
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

function chartType(value: unknown): StatsChartType {
  return typeof value === "string" && value.trim() ? value : "histogram";
}

function rangeValue(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value) || value.length < 2) return fallback;
  const left = Number(value[0]);
  const right = Number(value[1]);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left === right) return fallback;
  return left < right ? [left, right] : [right, left];
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

  return {
    type: "statsChart",
    data: {
      ...sourceData,
      chartType: selectedChartType,
      values: numberArray(sourceData.values, defaultValues),
      mean,
      stdDev,
      trials,
      probability,
      range: rangeValue(sourceData.range, [mean - 3 * stdDev, mean + 3 * stdDev]),
      bins: sourceData.bins === undefined ? undefined : positiveNumber(sourceData.bins, 6),
      binSize: sourceData.binSize === undefined ? undefined : positiveNumber(sourceData.binSize, 1),
      xLabel: stringValue(sourceData.xLabel, selectedChartType === "normal" ? "x" : selectedChartType === "binomial" ? "x" : "Value"),
      yLabel: stringValue(
        sourceData.yLabel,
        selectedChartType === "normal"
          ? "Density"
          : selectedChartType === "binomial"
            ? "Probability"
            : selectedChartType === "box"
              ? ""
              : "Frequency",
      ),
      title: stringValue(sourceData.title, ""),
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

function axisTitle(value?: string) {
  return {
    text: value ?? "",
    standoff: 10,
  };
}

function baseAxis(showGrid: boolean, label: string) {
  return {
    title: axisTitle(label),
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

function histogramBarData(data: StatsChartData) {
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
  const edges = counts.map((_, index) => {
    const left = start + binWidth * index;
    return [Number(left.toFixed(6)), Number((left + binWidth).toFixed(6))];
  });

  return {
    centres,
    counts,
    edges,
    width: binWidth,
    range: [start, end] as [number, number],
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

function chartTraces(spec: StatsChartSpec) {
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
        line: { color: lineColor, width: 2.4, shape: "spline" },
        name: data.title || "Normal distribution",
      },
    ];
  }

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
        name: data.title || "Probability",
      },
    ];
  }

  const histogram = histogramBarData(data);

  return [
    {
      type: "bar",
      x: histogram.centres,
      y: histogram.counts,
      width: histogram.width,
      customdata: histogram.edges,
      marker: {
        color: fillColor,
        line: markerLine,
      },
      hoverinfo: "skip",
      name: data.title || "Frequency",
    },
  ];
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
  const binomial = data.chartType === "binomial" ? binomialDistributionPoints(data.trials, data.probability) : undefined;
  const normal =
    data.chartType === "normal"
      ? normalCurvePoints(data.mean ?? 0, data.stdDev ?? 1, data.range ?? [-3, 3], options.normalPointCount ?? 181)
      : undefined;
  const histogramYAxis = positiveTickAxis(histogram?.counts ?? [], 1, true);
  const binomialYAxis = positiveTickAxis(binomial?.ys ?? [], 0.1);
  const normalYAxis = positiveTickAxis(normal?.ys ?? [], 0.1);

  return {
    data: chartTraces(spec),
    layout: {
      width: widthPx,
      height: heightPx,
      autosize: false,
      title: data.title ? { text: data.title, x: 0.5, xanchor: "center", y: 0.96 } : undefined,
      showlegend: options.showLegend ?? false,
      bargap: data.chartType === "binomial" ? 0.18 : 0,
      boxgap: 0.35,
      margin: { l: 54, r: 22, t: data.title ? 42 : 18, b: 50 },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      font: {
        family: TEST_TEXT_FONT_FAMILY,
        size: fontSizePx,
        color: "#111111",
      },
      shapes: gridBoundaryShapes(showGrid),
      xaxis:
        data.chartType === "binomial"
          ? {
              ...baseAxis(showGrid, data.xLabel ?? ""),
              range: [-0.5, (data.trials ?? 10) + 0.5],
              tickmode: "linear",
              dtick: 1,
            }
          : data.chartType === "histogram"
            ? {
                ...baseAxis(showGrid, data.xLabel ?? ""),
                range: histogram?.range,
                ...(histogram
                  ? {
                      tickmode: "array",
                      tickvals: fixedStepTicks(histogram.range[0], histogram.range[1], histogram.width),
                    }
                  : {}),
              }
            : data.chartType === "normal"
              ? {
                  ...baseAxis(showGrid, data.xLabel ?? ""),
                  range: data.range,
                }
              : baseAxis(showGrid, data.xLabel ?? ""),
      yaxis:
        data.chartType === "box"
          ? {
              ...baseAxis(false, ""),
              showticklabels: false,
              ticks: "",
            }
          : data.chartType === "histogram"
            ? {
                ...baseAxis(showGrid, data.yLabel ?? ""),
                ...histogramYAxis,
                rangemode: "tozero",
              }
            : data.chartType === "binomial"
              ? {
                  ...baseAxis(showGrid, data.yLabel ?? ""),
                  ...binomialYAxis,
                  rangemode: "tozero",
                }
              : data.chartType === "normal"
                ? {
                    ...baseAxis(showGrid, data.yLabel ?? ""),
                    ...normalYAxis,
                    rangemode: "tozero",
                  }
                : baseAxis(showGrid, data.yLabel ?? ""),
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
  if (data.chartType === "binomial") return `Binomial: n ${data.trials}, p ${data.probability}`;
  if (data.chartType === "box") return `Box plot: ${data.values?.length ?? 0} values`;
  return `Histogram: ${data.values?.length ?? 0} values`;
}
