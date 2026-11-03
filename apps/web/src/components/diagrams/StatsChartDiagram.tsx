import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GraphConfig } from "@mauth-studio/shared";
import { buildStatsChartPlotlyConfig, normalizeStatsChartSpec } from "@mauth-studio/diagram-plotly";

import { MathText, mathTextHasMath } from "@/components/MathText";
import type { PrintRenderState } from "@/lib/printReadiness";

type PlotArea = { l: number; t: number; w: number; h: number };

function withoutAxisTitle(axis: unknown) {
  if (!axis || typeof axis !== "object") return axis;
  const record = axis as Record<string, unknown>;
  const title = record.title && typeof record.title === "object" ? (record.title as Record<string, unknown>) : {};
  return {
    ...record,
    title: {
      ...title,
      text: "",
    },
  };
}

function expandPlotClipRects(element: HTMLElement & { data?: Array<{ type?: string }> }, resetBase = false) {
  // Plotly clips line strokes exactly at the authored data range. Reserve enough
  // source-space allowance for print scaling so curve tails and heavy axes do not
  // lose their outer pixels. Columns need the exact plot boundary: an expanded
  // clip lets a zero-based bar protrude below an intentionally truncated axis.
  const paddingPx = element.data?.some((trace) => trace.type === "bar") ? 0 : 8;
  element.querySelectorAll<SVGRectElement>(".clips clipPath rect").forEach((rect) => {
    if (resetBase) {
      rect.removeAttribute("data-mauth-clip-x");
      rect.removeAttribute("data-mauth-clip-y");
      rect.removeAttribute("data-mauth-clip-width");
      rect.removeAttribute("data-mauth-clip-height");
    }
    const baseX = rect.getAttribute("data-mauth-clip-x") ?? rect.getAttribute("x") ?? "0";
    const baseY = rect.getAttribute("data-mauth-clip-y") ?? rect.getAttribute("y") ?? "0";
    const baseWidth = rect.getAttribute("data-mauth-clip-width") ?? rect.getAttribute("width") ?? "0";
    const baseHeight = rect.getAttribute("data-mauth-clip-height") ?? rect.getAttribute("height") ?? "0";
    const x = Number(baseX);
    const y = Number(baseY);
    const width = Number(baseWidth);
    const height = Number(baseHeight);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return;
    }

    rect.setAttribute("data-mauth-clip-x", baseX);
    rect.setAttribute("data-mauth-clip-y", baseY);
    rect.setAttribute("data-mauth-clip-width", baseWidth);
    rect.setAttribute("data-mauth-clip-height", baseHeight);
    rect.setAttribute("x", String(x - paddingPx));
    rect.setAttribute("y", String(y - paddingPx));
    rect.setAttribute("width", String(width + paddingPx * 2));
    rect.setAttribute("height", String(height + paddingPx * 2));
  });
}

export function StatsChartDiagram({ graphConfig }: { graphConfig?: GraphConfig | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [plotArea, setPlotArea] = useState<PlotArea | null>(null);
  const updatePlotArea = useCallback((element: HTMLElement) => {
    const size = (element as HTMLElement & { _fullLayout?: { _size?: PlotArea } })._fullLayout?._size;
    if (!size) return;
    const next = { l: size.l, t: size.t, w: size.w, h: size.h };
    setPlotArea((current) =>
      current && current.l === next.l && current.t === next.t && current.w === next.w && current.h === next.h ? current : next,
    );
  }, []);
  const chartConfig = useMemo(
    () => (typeof graphConfig?.title === "string" ? { ...graphConfig, data: { ...graphConfig.data, title: "" } } : graphConfig),
    [graphConfig],
  );
  const spec = useMemo(() => normalizeStatsChartSpec(chartConfig), [chartConfig]);
  const title = spec.data.title ?? "";
  const xLabel = spec.data.xLabel ?? "";
  const yLabel = spec.data.yLabel ?? "";
  const verticalXLabel = spec.data.xLabelOrientation === "vertical" && Boolean(xLabel.trim());
  const xLabelRef = useRef<HTMLSpanElement>(null);
  const [xLabelWidth, setXLabelWidth] = useState(60);
  useLayoutEffect(() => {
    const label = xLabelRef.current;
    if (!verticalXLabel || !label) return;
    const measure = () => setXLabelWidth(label.offsetWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(label);
    return () => observer.disconnect();
  }, [verticalXLabel, xLabel]);
  const showYLabel = spec.data.chartType !== "box" && Boolean(yLabel.trim());
  const horizontalYLabel = spec.data.yLabelOrientation === "horizontal";
  const yLabelRef = useRef<HTMLSpanElement>(null);
  const [yLabelWidth, setYLabelWidth] = useState(60);
  useLayoutEffect(() => {
    const label = yLabelRef.current;
    if (!showYLabel || !label) return;
    const measure = () => setYLabelWidth(label.offsetWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(label);
    return () => observer.disconnect();
  }, [showYLabel, yLabel]);
  const labelMath = useMemo(
    () => ({
      title: mathTextHasMath(title),
      x: mathTextHasMath(xLabel),
    }),
    [title, xLabel],
  );
  const plotlyConfig = useMemo(() => {
    const config = buildStatsChartPlotlyConfig(chartConfig, { xLabelWidth, yLabelWidth });
    if (!labelMath.title && !labelMath.x && !showYLabel && !verticalXLabel) return config;

    return {
      ...config,
      layout: {
        ...config.layout,
        title: labelMath.title ? undefined : config.layout.title,
        xaxis: labelMath.x || verticalXLabel ? withoutAxisTitle(config.layout.xaxis) : config.layout.xaxis,
        yaxis: showYLabel ? withoutAxisTitle(config.layout.yaxis) : config.layout.yaxis,
      },
    };
  }, [chartConfig, labelMath, showYLabel, verticalXLabel, xLabelWidth, yLabelWidth]);
  const margins = plotlyConfig.layout.margin as { l: number; t: number; b: number };
  const plotlyConfigKey = useMemo(() => JSON.stringify(plotlyConfig), [plotlyConfig]);
  const [error, setError] = useState("");
  const [printRenderState, setPrintRenderState] = useState<PrintRenderState>("loading");

  useEffect(() => {
    let cancelled = false;
    const element = containerRef.current;
    const currentPlotlyConfig = JSON.parse(plotlyConfigKey) as ReturnType<typeof buildStatsChartPlotlyConfig>;
    let plotly: typeof import("plotly.js-dist-min").default | null = null;
    if (!element) return undefined;

    setError("");
    setPrintRenderState("loading");

    import("plotly.js-dist-min")
      .then((module) => {
        if (cancelled) return;
        plotly = module.default;
        void Promise.resolve(plotly.react(element, currentPlotlyConfig.data, currentPlotlyConfig.layout, currentPlotlyConfig.config))
          .then(() => {
            if (!cancelled) {
              expandPlotClipRects(element, true);
              updatePlotArea(element);
              setPrintRenderState("ready");
            }
          })
          .catch((renderError) => {
            if (cancelled) return;
            setError(renderError instanceof Error ? renderError.message : String(renderError));
            setPrintRenderState("error");
          });
      })
      .catch((renderError) => {
        if (cancelled) return;
        setError(renderError instanceof Error ? renderError.message : String(renderError));
        setPrintRenderState("error");
      });

    return () => {
      cancelled = true;
      plotly?.purge(element);
    };
  }, [plotlyConfigKey, updatePlotArea]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const observer = new ResizeObserver(() => {
      if (!element.isConnected || element.offsetWidth <= 0 || element.offsetHeight <= 0) return;
      void import("plotly.js-dist-min")
        .then((module) => {
          if (!element.isConnected || element.offsetWidth <= 0 || element.offsetHeight <= 0) return;
          void Promise.resolve(module.default.Plots?.resize(element))
            .then(() => {
              if (element.isConnected) {
                expandPlotClipRects(element, true);
                updatePlotArea(element);
              }
            })
            .catch(() => {
              // Plotly can reject if layout changes hide the plot between ResizeObserver and resize.
            });
        })
        .catch(() => undefined);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [updatePlotArea]);

  if (error) {
    return (
      <div
        className="stats-chart-diagram border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-xs"
        data-mauth-print-render-state="error"
      >
        Statistics chart could not render.
      </div>
    );
  }

  return (
    <div
      className="stats-chart-diagram relative min-w-0 bg-white"
      data-mauth-print-render-state={printRenderState}
      style={{
        width: plotlyConfig.metadata.widthPx,
        height: plotlyConfig.metadata.heightPx,
        maxWidth: "100%",
      }}
    >
      <div ref={containerRef} className="size-full" />
      {labelMath.title && title ? (
        <div
          className="pointer-events-none absolute left-12 right-6 top-2 flex justify-center text-center text-black"
          data-mauth-label-text={title}
        >
          <MathText source={title} />
        </div>
      ) : null}
      {(labelMath.x || verticalXLabel) && xLabel ? (
        <div
          className="pointer-events-none absolute bottom-2 flex justify-center text-center text-black"
          data-mauth-label-text={xLabel}
          data-mauth-axis-label="x"
          data-mauth-label-orientation={verticalXLabel ? "vertical" : "horizontal"}
          style={{
            left: verticalXLabel ? (plotlyConfig.layout.margin as { l: number }).l : 56,
            right: verticalXLabel ? (plotlyConfig.layout.margin as { r: number }).r : 24,
            ...(verticalXLabel ? { height: xLabelWidth } : {}),
          }}
        >
          <span
            ref={xLabelRef}
            className="inline-block whitespace-nowrap"
            style={
              verticalXLabel
                ? { position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%) rotate(-90deg)" }
                : undefined
            }
          >
            <MathText source={xLabel} />
          </span>
        </div>
      ) : null}
      {showYLabel ? (
        <div
          className="pointer-events-none absolute flex items-center justify-center text-center text-black"
          data-mauth-label-text={yLabel}
          data-mauth-axis-label="y"
          data-mauth-label-orientation={horizontalYLabel ? "horizontal" : "vertical"}
          style={{
            left: 8,
            top: plotArea?.t ?? margins.t,
            width: (plotArea?.l ?? margins.l) - 48,
            height: plotArea?.h ?? plotlyConfig.metadata.heightPx - margins.t - margins.b,
            fontSize: `${spec.options?.fontSizePt ?? 10}pt`,
          }}
        >
          <span
            ref={yLabelRef}
            className="inline-flex shrink-0 items-center whitespace-nowrap"
            style={{ transform: horizontalYLabel ? undefined : "rotate(-90deg)" }}
          >
            <MathText source={yLabel} />
          </span>
        </div>
      ) : null}
    </div>
  );
}
