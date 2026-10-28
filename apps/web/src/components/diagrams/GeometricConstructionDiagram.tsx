import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphConfig, PenroseDiagramResponse } from "@mauth-studio/shared";

import { renderPenroseDiagram } from "@/lib/api";
import {
  DEFAULT_PENROSE_SCALE_PERCENT,
  PENROSE_ORIGINAL_WIDTH,
  penroseRenderRequest,
  penroseSupportsLabelDragging,
} from "@/lib/diagramPenrose";
import { presentPenroseLabels } from "../../../../../packages/diagram-penrose/src/labelPresentation.ts";
import { usePenroseLabelDragging, type PenroseLabelMove } from "@/hooks/usePenroseLabelDragging";

function numericOption(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function scalePercent(graphConfig?: GraphConfig | null) {
  const scale = numericOption(graphConfig?.scalePercent ?? graphConfig?.options?.scalePercent, DEFAULT_PENROSE_SCALE_PERCENT);
  return scale > 0 ? scale : DEFAULT_PENROSE_SCALE_PERCENT;
}

export function GeometricConstructionDiagram({
  graphConfig,
  onLabelMove,
}: {
  graphConfig?: GraphConfig | null;
  onLabelMove?: PenroseLabelMove;
}) {
  const request = useMemo(() => penroseRenderRequest(graphConfig), [graphConfig]);
  const requestKey = useMemo(() => {
    const options = { ...request.options };
    delete options.labelOffsets;
    return JSON.stringify({ ...request, options });
  }, [request]);
  const [retry, setRetry] = useState(0);
  const renderKey = JSON.stringify([requestKey, retry]);
  const [rendered, setRendered] = useState<{ key: string; diagram?: PenroseDiagramResponse; error?: string } | null>(null);
  const diagram = rendered?.key === renderKey ? rendered.diagram : undefined;
  const error = rendered?.key === renderKey ? rendered.error : undefined;
  const baseWidth = numericOption(diagram?.metadata?.displayWidth, PENROSE_ORIGINAL_WIDTH);
  const requestOptions = request.options as Record<string, unknown>;
  const baseHeight = numericOption(diagram?.metadata?.displayHeight ?? requestOptions.height, 300);
  const displayScale = numericOption(requestOptions.scalePercent, scalePercent(graphConfig));
  const displayWidth = (baseWidth * displayScale) / 100;
  const displayHeight = (baseHeight * displayScale) / 100;
  const svg = useMemo(() => {
    if (!diagram?.svg) return "";
    return penroseSupportsLabelDragging(graphConfig?.type)
      ? presentPenroseLabels(diagram.svg, graphConfig?.options?.labelOffsets).svg
      : diagram.svg;
  }, [diagram?.svg, graphConfig?.type, graphConfig?.options?.labelOffsets]);
  const container = useRef<HTMLDivElement>(null);
  const markup = useMemo(() => ({ __html: svg }), [svg]);
  usePenroseLabelDragging(container, svg, penroseSupportsLabelDragging(graphConfig?.type) ? onLabelMove : undefined);

  useEffect(() => {
    const controller = new AbortController();
    const currentRequest = JSON.parse(requestKey) as ReturnType<typeof penroseRenderRequest>;
    renderPenroseDiagram(currentRequest, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (!data.svg?.trim()) throw new Error("The geometry renderer returned an empty diagram.");
        setRendered({ key: renderKey, diagram: data });
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) return;
        setRendered({ key: renderKey, error: fetchError instanceof Error ? fetchError.message : String(fetchError) });
      });

    return () => controller.abort();
  }, [requestKey, renderKey]);

  if (error) {
    return (
      <div
        className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-xs"
        data-mauth-print-render-state="error"
        role="alert"
      >
        <p>
          {error.startsWith("No layout satisfying the geometry constraints")
            ? "No valid geometry layout was found. Try Resample again or review the construction."
            : error.startsWith("Geometry rendering timed out.") || error.startsWith("The diagram renderer is busy.")
              ? error
              : "Geometry diagram could not render. Retry to try the same construction."}
        </p>
        <button
          type="button"
          className="mt-2 rounded border px-3 py-1 print:hidden"
          onClick={(event) => {
            event.stopPropagation();
            setRetry((value) => value + 1);
          }}
        >
          Retry diagram
        </button>
      </div>
    );
  }

  return (
    <div
      ref={container}
      className="penrose-diagram min-w-0 bg-white"
      data-mauth-print-render-state={diagram ? "ready" : "loading"}
      style={{
        width: displayWidth,
        minHeight: displayHeight,
        maxWidth: "100%",
      }}
      dangerouslySetInnerHTML={svg ? markup : undefined}
    />
  );
}
