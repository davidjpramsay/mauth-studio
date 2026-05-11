import type { GraphConfig } from "@mauth-studio/shared";
import { PlusCircle, Shuffle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DEFAULT_VECTOR_2D_GRAPH,
  DEFAULT_VECTOR_2D_METADATA,
  VECTOR_2D_COLORS,
  defaultVector2DName,
  normalizedVector2DEntries,
  vector2dLabelStyle,
  vector2dMetadata,
  vector2dMetadataFromEntries,
  type Vector2DControlEntry,
  type Vector2DLabelStyle,
} from "@/lib/diagramVector2d";

type Vector2DPreset = "single" | "two-origin" | "addition" | "component-guides";

const VECTOR_2D_LABEL_STYLES: Array<{ value: Vector2DLabelStyle; label: string }> = [
  { value: "boldLower", label: "Bold lower-case" },
  { value: "arrow", label: "Arrow over points" },
  { value: "custom", label: "Custom LaTeX" },
];

const VECTOR_2D_PRESETS: Array<{ value: Vector2DPreset; label: string }> = [
  { value: "single", label: "Single vector" },
  { value: "two-origin", label: "Two from origin" },
  { value: "addition", label: "Addition triangle" },
  { value: "component-guides", label: "Guide solution" },
];

function optionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

function numberInputValue(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

function vector2dPresetVectors(preset: Vector2DPreset): Vector2DControlEntry[] {
  if (preset === "single") {
    return [
      {
        id: "a",
        name: "a",
        label: "",
        start: [0, 0],
        components: [3, 2],
        color: VECTOR_2D_COLORS[1],
        showComponents: false,
      },
    ];
  }

  if (preset === "addition") {
    return [
      {
        id: "a",
        name: "a",
        label: "",
        start: [0, 0],
        components: [2, 1],
        color: VECTOR_2D_COLORS[0],
        showComponents: false,
      },
      {
        id: "b",
        name: "b",
        label: "",
        start: [2, 1],
        components: [2, 2],
        color: VECTOR_2D_COLORS[1],
        showComponents: false,
      },
      {
        id: "a-plus-b",
        name: "a+b",
        label: "",
        start: [0, 0],
        components: [4, 3],
        color: VECTOR_2D_COLORS[2],
        showComponents: false,
      },
    ];
  }

  const showComponents = preset === "component-guides";
  return DEFAULT_VECTOR_2D_METADATA.vector2d.vectors.map((vector) => ({
    ...vector,
    start: vector.start as [number, number],
    components: vector.components as [number, number],
    showComponents,
  }));
}

function vector2dPresetGraph(preset: Vector2DPreset): GraphConfig {
  const vectors = vector2dPresetVectors(preset);
  const yMin = preset === "two-origin" || preset === "component-guides" ? -4 : -1;
  const yMax = preset === "two-origin" || preset === "component-guides" ? 4 : 4;
  const xMax = preset === "single" || preset === "addition" ? 5 : 6;
  return {
    ...DEFAULT_VECTOR_2D_GRAPH,
    xMin: -1,
    xMax,
    yMin,
    yMax,
    widthPx: preset === "single" ? 420 : 520,
    heightPx: preset === "single" ? 300 : 320,
    metadata: {
      vector2d: {
        labelStyle: "boldLower",
        vectors,
      },
    },
  };
}

type Vector2DGraphEditorProps = {
  config: GraphConfig;
  onChange: (patch: Partial<GraphConfig>) => void;
};

export function Vector2DGraphEditor({ config, onChange }: Vector2DGraphEditorProps) {
  const vectors = normalizedVector2DEntries(config);
  const labelStyle = vector2dLabelStyle(vector2dMetadata(config).labelStyle);
  const patchVectors = (nextVectors: Vector2DControlEntry[]) => {
    onChange({
      functions: [],
      features: [],
      metadata: vector2dMetadataFromEntries(config, nextVectors),
    });
  };
  const updateLabelStyle = (nextLabelStyle: Vector2DLabelStyle) => {
    onChange({
      metadata: {
        ...(config.metadata ?? {}),
        vector2d: {
          ...vector2dMetadata(config),
          labelStyle: nextLabelStyle,
          vectors: vectors.map((vector, index) => {
            const autoNames = new Set([
              defaultVector2DName(index, "boldLower"),
              defaultVector2DName(index, "arrow"),
              defaultVector2DName(index, "custom"),
              `v_${index + 1}`,
            ]);
            return autoNames.has(vector.name) ? { ...vector, name: defaultVector2DName(index, nextLabelStyle) } : vector;
          }),
        },
      },
    });
  };
  const updateVector = (vectorIndex: number, patch: Partial<Vector2DControlEntry>) => {
    patchVectors(vectors.map((vector, index) => (index === vectorIndex ? { ...vector, ...patch } : vector)));
  };
  const addVector = () => {
    const index = vectors.length;
    patchVectors([
      ...vectors,
      {
        id: `v${index + 1}`,
        name: defaultVector2DName(index, labelStyle),
        label: "",
        start: [0, 0],
        components: [1, 1],
        color: VECTOR_2D_COLORS[index % VECTOR_2D_COLORS.length],
        showComponents: false,
      },
    ]);
  };
  const removeVector = (vectorIndex: number) => {
    if (vectors.length <= 1) return;
    patchVectors(vectors.filter((_, index) => index !== vectorIndex));
  };
  const applyPreset = (preset: Vector2DPreset) => {
    onChange(vector2dPresetGraph(preset));
  };
  const updateStart = (vectorIndex: number, axis: 0 | 1, value: number) => {
    const vector = vectors[vectorIndex];
    if (!vector) return;
    const start: [number, number] = [...vector.start];
    start[axis] = value;
    updateVector(vectorIndex, { start });
  };
  const updateComponents = (vectorIndex: number, axis: 0 | 1, value: number) => {
    const vector = vectors[vectorIndex];
    if (!vector) return;
    const components: [number, number] = [...vector.components];
    components[axis] = value;
    updateVector(vectorIndex, { components });
  };
  const updateLabelPosition = (vectorIndex: number, axis: 0 | 1, value?: number) => {
    updateVector(vectorIndex, axis === 0 ? { labelX: value } : { labelY: value });
  };
  const resetLabelPosition = (vectorIndex: number) => {
    updateVector(vectorIndex, { labelX: undefined, labelY: undefined });
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-end gap-3">
        <label className="flex w-28 flex-col gap-2 text-xs font-medium">
          x min
          <input
            type="number"
            value={numberInputValue(config.xMin)}
            onChange={(event) => onChange({ xMin: optionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.xMin })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex w-28 flex-col gap-2 text-xs font-medium">
          x max
          <input
            type="number"
            value={numberInputValue(config.xMax)}
            onChange={(event) => onChange({ xMax: optionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.xMax })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex w-28 flex-col gap-2 text-xs font-medium">
          y min
          <input
            type="number"
            value={numberInputValue(config.yMin)}
            onChange={(event) => onChange({ yMin: optionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.yMin })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex w-28 flex-col gap-2 text-xs font-medium">
          y max
          <input
            type="number"
            value={numberInputValue(config.yMax)}
            onChange={(event) => onChange({ yMax: optionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.yMax })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex w-28 flex-col gap-2 text-xs font-medium">
          Width
          <input
            type="number"
            min={160}
            value={numberInputValue(config.widthPx)}
            onChange={(event) => onChange({ widthPx: optionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.widthPx })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex w-28 flex-col gap-2 text-xs font-medium">
          Height
          <input
            type="number"
            min={120}
            value={numberInputValue(config.heightPx)}
            onChange={(event) => onChange({ heightPx: optionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.heightPx })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex w-44 flex-col gap-2 text-xs font-medium">
          Label style
          <select
            value={labelStyle}
            onChange={(event) => updateLabelStyle(event.target.value as Vector2DLabelStyle)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          >
            {VECTOR_2D_LABEL_STYLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Presets</div>
        <div className="flex flex-wrap gap-2">
          {VECTOR_2D_PRESETS.map((preset) => (
            <Button key={preset.value} type="button" variant="outline" size="sm" onClick={() => applyPreset(preset.value)}>
              <Shuffle data-icon="inline-start" />
              {preset.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coordinate vectors</div>
          <Button type="button" variant="outline" size="sm" onClick={addVector}>
            <PlusCircle data-icon="inline-start" />
            Add vector
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {vectors.map((vector, vectorIndex) => (
            <div key={`${vector.id}-${vectorIndex}`} className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[120px_minmax(10rem,1fr)_96px_40px] md:items-end">
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Name
                  <input
                    value={vector.name}
                    onChange={(event) => updateVector(vectorIndex, { name: event.target.value })}
                    className="h-9 rounded-md border border-input bg-background px-2 font-mono text-sm font-normal"
                  />
                </label>
                {labelStyle === "custom" ? (
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Custom label
                    <input
                      value={vector.label}
                      onChange={(event) => updateVector(vectorIndex, { label: event.target.value })}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    />
                  </label>
                ) : (
                  <div className="hidden md:block" />
                )}
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Colour
                  <input
                    type="color"
                    value={vector.color}
                    onChange={(event) => updateVector(vectorIndex, { color: event.target.value })}
                    className="h-9 rounded-md border border-input bg-background px-2"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Remove vector"
                  aria-label="Remove vector"
                  onClick={() => removeVector(vectorIndex)}
                  className="size-9"
                  disabled={vectors.length <= 1}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(6,minmax(70px,1fr))_auto] md:items-end">
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Start x
                  <input
                    type="number"
                    value={numberInputValue(vector.start[0])}
                    onChange={(event) => updateStart(vectorIndex, 0, optionalNumber(event.target.value) ?? 0)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Start y
                  <input
                    type="number"
                    value={numberInputValue(vector.start[1])}
                    onChange={(event) => updateStart(vectorIndex, 1, optionalNumber(event.target.value) ?? 0)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  x comp.
                  <input
                    type="number"
                    value={numberInputValue(vector.components[0])}
                    onChange={(event) => updateComponents(vectorIndex, 0, optionalNumber(event.target.value) ?? 0)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  y comp.
                  <input
                    type="number"
                    value={numberInputValue(vector.components[1])}
                    onChange={(event) => updateComponents(vectorIndex, 1, optionalNumber(event.target.value) ?? 0)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Label x
                  <input
                    type="number"
                    value={numberInputValue(vector.labelX)}
                    onChange={(event) => updateLabelPosition(vectorIndex, 0, optionalNumber(event.target.value))}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Label y
                  <input
                    type="number"
                    value={numberInputValue(vector.labelY)}
                    onChange={(event) => updateLabelPosition(vectorIndex, 1, optionalNumber(event.target.value))}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="col-span-2 md:col-span-1"
                  onClick={() => resetLabelPosition(vectorIndex)}
                >
                  Reset label
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Annotations</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {vectors.map((vector, vectorIndex) => (
            <label
              key={`${vector.id}-${vectorIndex}-guides`}
              className="flex h-10 items-center gap-2 rounded-md border bg-muted/20 px-3 text-sm"
            >
              <input
                type="checkbox"
                checked={vector.showComponents}
                onChange={(event) => updateVector(vectorIndex, { showComponents: event.target.checked })}
              />
              {vector.name || vector.id} component guides
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
