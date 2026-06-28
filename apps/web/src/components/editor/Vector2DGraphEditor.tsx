import type { GraphConfig } from "@mauth-studio/shared";
import { PlusCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DEFAULT_VECTOR_2D_GRAPH,
  VECTOR_2D_ANNOTATION_COLOR,
  VECTOR_2D_COLORS,
  defaultVector2DName,
  normalizedVector2DAngleMarkers,
  normalizedVector2DEntries,
  vector2dLabelStyle,
  vector2dMetadata,
  vector2dMetadataFromAngleMarkers,
  vector2dMetadataFromEntries,
  type Vector2DAngleMarkerEntry,
  type Vector2DControlEntry,
  type Vector2DLabelStyle,
} from "@/lib/diagramVector2d";

const VECTOR_2D_LABEL_STYLES: Array<{ value: Vector2DLabelStyle; label: string }> = [
  { value: "boldLower", label: "Bold lower-case" },
  { value: "arrow", label: "Arrow over points" },
  { value: "custom", label: "Custom LaTeX" },
];

function optionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

function numberInputValue(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

type Vector2DGraphEditorProps = {
  config: GraphConfig;
  settingsMode?: "inline" | "inspector";
  onChange: (patch: Partial<GraphConfig>) => void;
};

export function Vector2DGraphEditor({ config, settingsMode = "inline", onChange }: Vector2DGraphEditorProps) {
  const vectors = normalizedVector2DEntries(config);
  const angleMarkers = normalizedVector2DAngleMarkers(config);
  const labelStyle = vector2dLabelStyle(vector2dMetadata(config).labelStyle);
  const showInlineSettings = settingsMode === "inline";
  const vectorReferenceOptions = vectors.flatMap((vector) => {
    const options = [{ value: vector.id, label: vector.name && vector.name !== vector.id ? `${vector.name} (${vector.id})` : vector.id }];
    if (vector.name && vector.name !== vector.id) options.push({ value: vector.name, label: `${vector.name} (name)` });
    return options;
  });
  const vectorReferenceValues = new Set(vectorReferenceOptions.map((option) => option.value));
  for (const marker of angleMarkers) {
    if (marker.from && !vectorReferenceValues.has(marker.from)) {
      vectorReferenceOptions.push({ value: marker.from, label: `${marker.from} (stored)` });
      vectorReferenceValues.add(marker.from);
    }
    if (marker.to && !vectorReferenceValues.has(marker.to)) {
      vectorReferenceOptions.push({ value: marker.to, label: `${marker.to} (stored)` });
      vectorReferenceValues.add(marker.to);
    }
  }
  const patchVectors = (nextVectors: Vector2DControlEntry[]) => {
    onChange({
      functions: [],
      features: [],
      metadata: vector2dMetadataFromEntries(config, nextVectors),
    });
  };
  const patchAngleMarkers = (nextMarkers: Vector2DAngleMarkerEntry[]) => {
    onChange({
      metadata: vector2dMetadataFromAngleMarkers(config, nextMarkers),
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
  const updateAngleMarker = (markerIndex: number, patch: Partial<Vector2DAngleMarkerEntry>) => {
    patchAngleMarkers(angleMarkers.map((marker, index) => (index === markerIndex ? { ...marker, ...patch } : marker)));
  };
  const addAngleMarker = () => {
    const from = vectors[0]?.id;
    const to = vectors[1]?.id ?? vectors[0]?.id;
    if (!from || !to) return;
    let nextIndex = angleMarkers.length + 1;
    while (angleMarkers.some((marker) => marker.id === `angle-marker-${nextIndex}`)) nextIndex += 1;
    patchAngleMarkers([
      ...angleMarkers,
      {
        id: `angle-marker-${nextIndex}`,
        from,
        to,
        label: "",
        rightAngle: false,
        radius: 0.45,
        color: VECTOR_2D_ANNOTATION_COLOR,
      },
    ]);
  };
  const removeAngleMarker = (markerIndex: number) => {
    patchAngleMarkers(angleMarkers.filter((_, index) => index !== markerIndex));
  };
  const updateAngleLabelPosition = (markerIndex: number, axis: 0 | 1, value?: number) => {
    updateAngleMarker(markerIndex, axis === 0 ? { labelX: value } : { labelY: value });
  };
  const resetAngleLabelPosition = (markerIndex: number) => {
    updateAngleMarker(markerIndex, { labelX: undefined, labelY: undefined });
  };

  return (
    <div className="flex flex-col gap-4">
      {showInlineSettings ? (
        <section className="flex flex-wrap items-end gap-3">
          <label className="flex w-28 flex-col gap-2 text-xs font-medium">
            i min
            <input
              type="number"
              value={numberInputValue(config.xMin)}
              onChange={(event) => onChange({ xMin: optionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.xMin })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex w-28 flex-col gap-2 text-xs font-medium">
            i max
            <input
              type="number"
              value={numberInputValue(config.xMax)}
              onChange={(event) => onChange({ xMax: optionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.xMax })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex w-28 flex-col gap-2 text-xs font-medium">
            j min
            <input
              type="number"
              value={numberInputValue(config.yMin)}
              onChange={(event) => onChange({ yMin: optionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.yMin })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex w-28 flex-col gap-2 text-xs font-medium">
            j max
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
      ) : null}

      <section className={showInlineSettings ? "flex flex-col gap-2 border-t pt-3" : "flex flex-col gap-2"}>
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
                  Start i
                  <input
                    type="number"
                    value={numberInputValue(vector.start[0])}
                    onChange={(event) => updateStart(vectorIndex, 0, optionalNumber(event.target.value) ?? 0)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Start j
                  <input
                    type="number"
                    value={numberInputValue(vector.start[1])}
                    onChange={(event) => updateStart(vectorIndex, 1, optionalNumber(event.target.value) ?? 0)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  i comp.
                  <input
                    type="number"
                    value={numberInputValue(vector.components[0])}
                    onChange={(event) => updateComponents(vectorIndex, 0, optionalNumber(event.target.value) ?? 0)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  j comp.
                  <input
                    type="number"
                    value={numberInputValue(vector.components[1])}
                    onChange={(event) => updateComponents(vectorIndex, 1, optionalNumber(event.target.value) ?? 0)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Label i
                  <input
                    type="number"
                    value={numberInputValue(vector.labelX)}
                    onChange={(event) => updateLabelPosition(vectorIndex, 0, optionalNumber(event.target.value))}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Label j
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
        <div className="mt-2 flex flex-col gap-2 border-t pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Angle markers</div>
            <Button type="button" variant="outline" size="sm" onClick={addAngleMarker} disabled={vectors.length < 2}>
              <PlusCircle data-icon="inline-start" />
              Add marker
            </Button>
          </div>
          {angleMarkers.length ? (
            <div className="grid grid-cols-1 gap-2">
              {angleMarkers.map((marker, markerIndex) => (
                <div key={`${marker.id}-${markerIndex}`} className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(100px,1fr)_minmax(100px,1fr)_120px_40px] md:items-end">
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      From
                      <select
                        value={marker.from}
                        onChange={(event) => updateAngleMarker(markerIndex, { from: event.target.value })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      >
                        {vectorReferenceOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      To
                      <select
                        value={marker.to}
                        onChange={(event) => updateAngleMarker(markerIndex, { to: event.target.value })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      >
                        {vectorReferenceOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex h-9 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-normal md:self-end">
                      <input
                        type="checkbox"
                        checked={marker.rightAngle}
                        onChange={(event) => updateAngleMarker(markerIndex, { rightAngle: event.target.checked })}
                      />
                      Right angle
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Remove angle marker"
                      aria-label="Remove angle marker"
                      onClick={() => removeAngleMarker(markerIndex)}
                      className="size-9"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(140px,1fr)_90px_90px_90px_90px_auto] md:items-end">
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Label
                      <input
                        value={marker.label}
                        placeholder={marker.rightAngle ? "optional" : "45^\\circ"}
                        onChange={(event) => updateAngleMarker(markerIndex, { label: event.target.value })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Radius
                      <input
                        type="number"
                        min={0.05}
                        step={1}
                        value={numberInputValue(marker.radius)}
                        onChange={(event) =>
                          updateAngleMarker(markerIndex, { radius: Math.max(0.05, optionalNumber(event.target.value) ?? 0.45) })
                        }
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Colour
                      <input
                        type="color"
                        value={marker.color}
                        onChange={(event) => updateAngleMarker(markerIndex, { color: event.target.value })}
                        className="h-9 rounded-md border border-input bg-background px-2"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Label i
                      <input
                        type="number"
                        value={numberInputValue(marker.labelX)}
                        onChange={(event) => updateAngleLabelPosition(markerIndex, 0, optionalNumber(event.target.value))}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Label j
                      <input
                        type="number"
                        value={numberInputValue(marker.labelY)}
                        onChange={(event) => updateAngleLabelPosition(markerIndex, 1, optionalNumber(event.target.value))}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="col-span-2 md:col-span-1"
                      onClick={() => resetAngleLabelPosition(markerIndex)}
                    >
                      Reset label
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
              Add an angle marker to show an angle arc or perpendicular marker between two vectors.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
