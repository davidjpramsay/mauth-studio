import { useEffect, useMemo, useState } from "react";
import type { GraphConfig, PenroseDiagramResponse } from "@mauth-studio/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const PENROSE_ORIGINAL_WIDTH = 420;
const DEFAULT_SCALE_PERCENT = 100;
const DEFAULT_PENROSE_PRESET = "geometry";
const SETS_PENROSE_PRESET = "sets";

const DEFAULT_GEOMETRIC_DATA = {
  objects: [
    { type: "point", name: "A" },
    { type: "point", name: "B" },
    { type: "point", name: "C" },
  ],
  relationships: [
    { type: "triangle", points: ["A", "B", "C"] },
    { type: "rightAngle", at: "B" },
    { type: "labelLength", between: ["A", "B"], value: "5" },
    { type: "labelLength", between: ["B", "C"], value: "12" },
  ],
};
const DEFAULT_SET_DATA = {
  universe: { name: "U", label: "U" },
  sets: [
    { type: "set", name: "A", label: "A" },
    { type: "set", name: "B", label: "B" },
  ],
  regions: [
    { name: "onlyA", label: "A \\setminus B" },
    { name: "intersection", label: "A \\cap B" },
    { name: "onlyB", label: "B \\setminus A" },
    { name: "outside", label: "(A \\cup B)'" },
  ],
};

function numericOption(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function scalePercent(graphConfig?: GraphConfig | null) {
  const scale = numericOption(graphConfig?.scalePercent ?? graphConfig?.options?.scalePercent, DEFAULT_SCALE_PERCENT);
  return scale > 0 ? scale : DEFAULT_SCALE_PERCENT;
}

function penroseRequest(graphConfig?: GraphConfig | null) {
  const options = { ...(graphConfig?.options ?? {}) };
  delete options.width;
  delete options.height;
  delete options.preset;
  const type =
    graphConfig?.type === "setDiagram"
      ? "setDiagram"
      : graphConfig?.type === "vectorRelationship"
        ? "vectorRelationship"
        : "geometricConstruction";
  const scale = scalePercent(graphConfig);
  const defaultPreset = type === "setDiagram" ? SETS_PENROSE_PRESET : DEFAULT_PENROSE_PRESET;
  const preset = String(graphConfig?.penrosePreset ?? options.penrosePreset ?? graphConfig?.style ?? defaultPreset);
  return {
    type,
    data:
      graphConfig?.data && Object.keys(graphConfig.data).length
        ? graphConfig.data
        : type === "setDiagram"
          ? DEFAULT_SET_DATA
          : DEFAULT_GEOMETRIC_DATA,
    style: preset,
    options: {
      ...options,
      scalePercent: scale,
      penrosePreset: preset,
    },
  };
}

export function GeometricConstructionDiagram({ graphConfig }: { graphConfig?: GraphConfig | null }) {
  const request = useMemo(() => penroseRequest(graphConfig), [graphConfig]);
  const [diagram, setDiagram] = useState<PenroseDiagramResponse | null>(null);
  const [error, setError] = useState("");
  const baseWidth = numericOption(diagram?.metadata?.displayWidth, PENROSE_ORIGINAL_WIDTH);
  const displayWidth = (baseWidth * numericOption(request.options.scalePercent, DEFAULT_SCALE_PERCENT)) / 100;

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setDiagram(null);

    fetch(`${API_BASE}/api/diagram/penrose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<PenroseDiagramResponse>;
      })
      .then((data) => {
        setDiagram(data);
      })
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      });

    return () => controller.abort();
  }, [request]);

  if (error) {
    return (
      <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-xs">
        Geometry diagram could not render.
      </div>
    );
  }

  return (
    <div
      className="penrose-diagram min-w-0 bg-white"
      style={{
        width: displayWidth,
        maxWidth: "100%",
      }}
      dangerouslySetInnerHTML={diagram?.svg ? { __html: diagram.svg } : undefined}
    />
  );
}
