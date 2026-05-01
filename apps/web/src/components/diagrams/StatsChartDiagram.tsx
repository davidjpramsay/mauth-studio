import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphConfig } from "@mauth-studio/shared";
import { buildStatsChartPlotlyConfig } from "@mauth-studio/diagram-plotly";

export function StatsChartDiagram({ graphConfig }: { graphConfig?: GraphConfig | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotlyConfig = useMemo(() => buildStatsChartPlotlyConfig(graphConfig), [graphConfig]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const element = containerRef.current;
    let plotly: typeof import("plotly.js-dist-min").default | null = null;
    if (!element) return undefined;

    setError("");

    import("plotly.js-dist-min")
      .then((module) => {
        if (cancelled) return;
        plotly = module.default;
        void plotly.react(element, plotlyConfig.data, plotlyConfig.layout, plotlyConfig.config);
      })
      .catch((renderError) => {
        if (cancelled) return;
        setError(renderError instanceof Error ? renderError.message : String(renderError));
      });

    return () => {
      cancelled = true;
      plotly?.purge(element);
    };
  }, [plotlyConfig]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const observer = new ResizeObserver(() => {
      void import("plotly.js-dist-min").then((module) => module.default.Plots?.resize(element));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (error) {
    return (
      <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-xs">
        Statistics chart could not render.
      </div>
    );
  }

  return (
    <div
      className="stats-chart-diagram min-w-0 bg-white"
      style={{
        width: plotlyConfig.metadata.widthPx,
        height: plotlyConfig.metadata.heightPx,
        maxWidth: "100%",
      }}
    >
      <div ref={containerRef} className="size-full" />
    </div>
  );
}
