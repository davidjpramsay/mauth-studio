import { useEffect, useMemo, useState } from "react";
import type { GraphConfig, PenroseDiagramResponse } from "@mauth-studio/shared";

import { renderPenroseDiagram } from "@/lib/api";
import { DEFAULT_PENROSE_SCALE_PERCENT, PENROSE_ORIGINAL_WIDTH, penroseRenderRequest } from "@/lib/diagramPenrose";

function numericOption(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function scalePercent(graphConfig?: GraphConfig | null) {
  const scale = numericOption(graphConfig?.scalePercent ?? graphConfig?.options?.scalePercent, DEFAULT_PENROSE_SCALE_PERCENT);
  return scale > 0 ? scale : DEFAULT_PENROSE_SCALE_PERCENT;
}

export function GeometricConstructionDiagram({ graphConfig }: { graphConfig?: GraphConfig | null }) {
  const request = useMemo(() => penroseRenderRequest(graphConfig), [graphConfig]);
  const requestKey = useMemo(() => JSON.stringify(request), [request]);
  const [rendered, setRendered] = useState<{ key: string; diagram?: PenroseDiagramResponse; error?: string } | null>(null);
  const diagram = rendered?.key === requestKey ? rendered.diagram : undefined;
  const error = rendered?.key === requestKey ? rendered.error : undefined;
  const baseWidth = numericOption(diagram?.metadata?.displayWidth, PENROSE_ORIGINAL_WIDTH);
  const requestOptions = request.options as Record<string, unknown>;
  const baseHeight = numericOption(diagram?.metadata?.displayHeight ?? requestOptions.height, 300);
  const displayScale = numericOption(requestOptions.scalePercent, scalePercent(graphConfig));
  const displayWidth = (baseWidth * displayScale) / 100;
  const displayHeight = (baseHeight * displayScale) / 100;

  useEffect(() => {
    const controller = new AbortController();
    const currentRequest = JSON.parse(requestKey) as ReturnType<typeof penroseRenderRequest>;
    renderPenroseDiagram(currentRequest, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (!data.svg?.trim()) throw new Error("The geometry renderer returned an empty diagram.");
        setRendered({ key: requestKey, diagram: data });
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) return;
        setRendered({ key: requestKey, error: fetchError instanceof Error ? fetchError.message : String(fetchError) });
      });

    return () => controller.abort();
  }, [requestKey]);

  if (error) {
    return (
      <div
        className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-xs"
        data-mauth-print-render-state="error"
        role="alert"
      >
        Geometry diagram could not render.
      </div>
    );
  }

  return (
    <div
      className="penrose-diagram min-w-0 bg-white"
      data-mauth-print-render-state={diagram ? "ready" : "loading"}
      style={{
        width: displayWidth,
        minHeight: displayHeight,
        maxWidth: "100%",
      }}
      dangerouslySetInnerHTML={diagram?.svg ? { __html: diagram.svg } : undefined}
    />
  );
}
