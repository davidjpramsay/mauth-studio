import type { GraphConfig } from "@mauth-studio/shared";
import { PlusCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NumericExpressionInput } from "@/components/editor/NumericExpressionInput";
import {
  DEFAULT_VECTOR_2D_GRAPH,
  VECTOR_2D_ANNOTATION_COLOR,
  VECTOR_2D_COLORS,
  defaultVector2DName,
  isSolutionOnlyVector2DElement,
  normalizedVector2DAngleMarkers,
  normalizedVector2DEntries,
  normalizedVector2DSegmentLabels,
  vector2dLabelStyle,
  vector2dElementForAuthoringLayer,
  vector2dElementWithSolutionOnly,
  vector2dMetadata,
  vector2dMetadataFromAngleMarkers,
  vector2dMetadataFromEntries,
  vector2dMetadataFromSegmentLabels,
  type Vector2DAngleMarkerEntry,
  type Vector2DControlEntry,
  type Vector2DLabelStyle,
  type Vector2DSegmentLabelEntry,
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
  showSolutions?: boolean;
  settingsMode?: "inline" | "inspector";
  onChange: (patch: Partial<GraphConfig>) => void;
};

export function Vector2DGraphEditor({ config, showSolutions = true, settingsMode = "inline", onChange }: Vector2DGraphEditorProps) {
  const vectors = normalizedVector2DEntries(config);
  const segmentLabels = normalizedVector2DSegmentLabels(config);
  const angleMarkers = normalizedVector2DAngleMarkers(config);
  const visibleVectorRows = vectors.flatMap((vector, index) =>
    showSolutions || !isSolutionOnlyVector2DElement(vector) ? [{ vector, vectorIndex: index }] : [],
  );
  const visibleVectors = visibleVectorRows.map(({ vector }) => vector);
  const visibleVectorReferences = new Set(
    visibleVectors.flatMap((vector) => [vector.id.trim().toLowerCase(), vector.name.trim().toLowerCase()]).filter(Boolean),
  );
  const referencesVisibleVector = (reference: string) => visibleVectorReferences.has(reference.trim().toLowerCase());
  const visibleSegmentLabelRows = segmentLabels.flatMap((segmentLabel, index) =>
    (showSolutions || !isSolutionOnlyVector2DElement(segmentLabel)) && referencesVisibleVector(segmentLabel.vectorId)
      ? [{ segmentLabel, segmentLabelIndex: index }]
      : [],
  );
  const visibleAngleMarkerRows = angleMarkers.flatMap((marker, index) =>
    (showSolutions || !isSolutionOnlyVector2DElement(marker)) && referencesVisibleVector(marker.from) && referencesVisibleVector(marker.to)
      ? [{ marker, markerIndex: index }]
      : [],
  );
  const labelStyle = vector2dLabelStyle(vector2dMetadata(config).labelStyle);
  const showInlineSettings = settingsMode === "inline";
  const vectorReferenceOptions = visibleVectors.flatMap((vector) => {
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
  const patchSegmentLabels = (nextLabels: Vector2DSegmentLabelEntry[]) => {
    onChange({
      metadata: vector2dMetadataFromSegmentLabels(config, nextLabels),
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
      vector2dElementForAuthoringLayer(
        {
          id: `v${index + 1}`,
          name: defaultVector2DName(index, labelStyle),
          label: "",
          start: [0, 0],
          components: [1, 1],
          color: VECTOR_2D_COLORS[index % VECTOR_2D_COLORS.length],
          showComponents: false,
        },
        showSolutions,
      ),
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
  const updateSegmentLabel = (segmentLabelIndex: number, patch: Partial<Vector2DSegmentLabelEntry>) => {
    patchSegmentLabels(segmentLabels.map((label, index) => (index === segmentLabelIndex ? { ...label, ...patch } : label)));
  };
  const addSegmentLabel = () => {
    const vectorId = visibleVectors[0]?.id;
    if (!vectorId) return;
    let nextIndex = segmentLabels.length + 1;
    while (segmentLabels.some((label) => label.id === `segment-label-${nextIndex}`)) nextIndex += 1;
    patchSegmentLabels([
      ...segmentLabels,
      vector2dElementForAuthoringLayer(
        {
          id: `segment-label-${nextIndex}`,
          vectorId,
          label: "length",
          position: 0.55,
          offsetPx: 18,
          color: VECTOR_2D_ANNOTATION_COLOR,
        },
        showSolutions,
      ),
    ]);
  };
  const removeSegmentLabel = (segmentLabelIndex: number) => {
    patchSegmentLabels(segmentLabels.filter((_, index) => index !== segmentLabelIndex));
  };
  const resetSegmentLabelPosition = (segmentLabelIndex: number) => {
    updateSegmentLabel(segmentLabelIndex, { labelX: undefined, labelY: undefined });
  };
  const updateAngleMarker = (markerIndex: number, patch: Partial<Vector2DAngleMarkerEntry>) => {
    patchAngleMarkers(angleMarkers.map((marker, index) => (index === markerIndex ? { ...marker, ...patch } : marker)));
  };
  const addAngleMarker = () => {
    const from = visibleVectors[0]?.id;
    const to = visibleVectors[1]?.id ?? visibleVectors[0]?.id;
    if (!from || !to) return;
    let nextIndex = angleMarkers.length + 1;
    while (angleMarkers.some((marker) => marker.id === `angle-marker-${nextIndex}`)) nextIndex += 1;
    patchAngleMarkers([
      ...angleMarkers,
      vector2dElementForAuthoringLayer(
        {
          id: `angle-marker-${nextIndex}`,
          from,
          to,
          label: "",
          rightAngle: false,
          radius: 0.45,
          color: VECTOR_2D_ANNOTATION_COLOR,
        },
        showSolutions,
      ),
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
            <NumericExpressionInput
              value={config.xMin}
              ariaLabel="Vector i minimum"
              onValueChange={(value) => onChange({ xMin: value ?? DEFAULT_VECTOR_2D_GRAPH.xMin })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex w-28 flex-col gap-2 text-xs font-medium">
            i max
            <NumericExpressionInput
              value={config.xMax}
              ariaLabel="Vector i maximum"
              onValueChange={(value) => onChange({ xMax: value ?? DEFAULT_VECTOR_2D_GRAPH.xMax })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex w-28 flex-col gap-2 text-xs font-medium">
            j min
            <NumericExpressionInput
              value={config.yMin}
              ariaLabel="Vector j minimum"
              onValueChange={(value) => onChange({ yMin: value ?? DEFAULT_VECTOR_2D_GRAPH.yMin })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex w-28 flex-col gap-2 text-xs font-medium">
            j max
            <NumericExpressionInput
              value={config.yMax}
              ariaLabel="Vector j maximum"
              onValueChange={(value) => onChange({ yMax: value ?? DEFAULT_VECTOR_2D_GRAPH.yMax })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex w-28 flex-col gap-2 text-xs font-medium">
            Width
            <NumericExpressionInput
              min={160}
              step={10}
              value={config.widthPx}
              ariaLabel="Vector diagram width"
              onValueChange={(value) => onChange({ widthPx: value ?? DEFAULT_VECTOR_2D_GRAPH.widthPx })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex w-28 flex-col gap-2 text-xs font-medium">
            Height
            <NumericExpressionInput
              min={120}
              step={10}
              value={config.heightPx}
              ariaLabel="Vector diagram height"
              onValueChange={(value) => onChange({ heightPx: value ?? DEFAULT_VECTOR_2D_GRAPH.heightPx })}
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
          {visibleVectorRows.map(({ vector, vectorIndex }) => (
            <div
              key={`${vector.id}-${vectorIndex}`}
              data-vector2d-item-kind="vector"
              data-vector2d-item-id={vector.id}
              data-solution-only={isSolutionOnlyVector2DElement(vector) ? "true" : undefined}
              className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Vector {vectorIndex + 1}
                  {isSolutionOnlyVector2DElement(vector) ? <Badge variant="outline">Solution</Badge> : null}
                </span>
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={isSolutionOnlyVector2DElement(vector)}
                    aria-label={`Vector ${vector.name || vector.id} show in solutions only`}
                    onChange={(event) =>
                      updateVector(vectorIndex, vector2dElementWithSolutionOnly(vector, event.target.checked) as Vector2DControlEntry)
                    }
                  />
                  Show in solutions only
                </label>
              </div>
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
                  <NumericExpressionInput
                    value={vector.start[0]}
                    ariaLabel={`Vector ${vectorIndex + 1} start i`}
                    onValueChange={(value) => {
                      if (value !== undefined) updateStart(vectorIndex, 0, value);
                    }}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Start j
                  <NumericExpressionInput
                    value={vector.start[1]}
                    ariaLabel={`Vector ${vectorIndex + 1} start j`}
                    onValueChange={(value) => {
                      if (value !== undefined) updateStart(vectorIndex, 1, value);
                    }}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  i comp.
                  <NumericExpressionInput
                    value={vector.components[0]}
                    ariaLabel={`Vector ${vectorIndex + 1} i component`}
                    onValueChange={(value) => {
                      if (value !== undefined) updateComponents(vectorIndex, 0, value);
                    }}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  j comp.
                  <NumericExpressionInput
                    value={vector.components[1]}
                    ariaLabel={`Vector ${vectorIndex + 1} j component`}
                    onValueChange={(value) => {
                      if (value !== undefined) updateComponents(vectorIndex, 1, value);
                    }}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Label i
                  <NumericExpressionInput
                    value={vector.labelX}
                    ariaLabel={`Vector ${vectorIndex + 1} label i`}
                    onValueChange={(value) => updateLabelPosition(vectorIndex, 0, value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Label j
                  <NumericExpressionInput
                    value={vector.labelY}
                    ariaLabel={`Vector ${vectorIndex + 1} label j`}
                    onValueChange={(value) => updateLabelPosition(vectorIndex, 1, value)}
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
          {visibleVectorRows.map(({ vector, vectorIndex }) => (
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
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Segment labels</div>
            <Button type="button" variant="outline" size="sm" onClick={addSegmentLabel} disabled={!visibleVectors.length}>
              <PlusCircle data-icon="inline-start" />
              Add label
            </Button>
          </div>
          {visibleSegmentLabelRows.length ? (
            <div className="grid grid-cols-1 gap-2">
              {visibleSegmentLabelRows.map(({ segmentLabel, segmentLabelIndex }) => (
                <div
                  key={`${segmentLabel.id}-${segmentLabelIndex}`}
                  data-vector2d-item-kind="segmentLabel"
                  data-vector2d-item-id={segmentLabel.id}
                  data-solution-only={isSolutionOnlyVector2DElement(segmentLabel) ? "true" : undefined}
                  className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Segment label {segmentLabelIndex + 1}
                      {isSolutionOnlyVector2DElement(segmentLabel) ? <Badge variant="outline">Solution</Badge> : null}
                    </span>
                    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={isSolutionOnlyVector2DElement(segmentLabel)}
                        aria-label={`Segment label ${segmentLabel.id} show in solutions only`}
                        onChange={(event) =>
                          updateSegmentLabel(
                            segmentLabelIndex,
                            vector2dElementWithSolutionOnly(segmentLabel, event.target.checked) as Vector2DSegmentLabelEntry,
                          )
                        }
                      />
                      Show in solutions only
                    </label>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(100px,1fr)_minmax(130px,2fr)_90px_90px_90px_40px] md:items-end">
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Vector
                      <select
                        value={segmentLabel.vectorId}
                        onChange={(event) => updateSegmentLabel(segmentLabelIndex, { vectorId: event.target.value })}
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
                      Label
                      <input
                        value={segmentLabel.label}
                        onChange={(event) => updateSegmentLabel(segmentLabelIndex, { label: event.target.value })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Position
                      <input
                        type="number"
                        min={0.05}
                        max={0.95}
                        step={0.05}
                        value={numberInputValue(segmentLabel.position)}
                        onChange={(event) =>
                          updateSegmentLabel(segmentLabelIndex, {
                            position: Math.max(0.05, Math.min(0.95, optionalNumber(event.target.value) ?? 0.55)),
                          })
                        }
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Offset px
                      <input
                        type="number"
                        value={numberInputValue(segmentLabel.offsetPx)}
                        onChange={(event) => updateSegmentLabel(segmentLabelIndex, { offsetPx: optionalNumber(event.target.value) ?? 18 })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Colour
                      <input
                        type="color"
                        value={segmentLabel.color}
                        onChange={(event) => updateSegmentLabel(segmentLabelIndex, { color: event.target.value })}
                        className="h-9 rounded-md border border-input bg-background px-2"
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Remove segment label"
                      aria-label="Remove segment label"
                      onClick={() => removeSegmentLabel(segmentLabelIndex)}
                      className="size-9"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(2,minmax(90px,1fr))_auto] md:items-end">
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Label i
                      <input
                        type="number"
                        value={numberInputValue(segmentLabel.labelX)}
                        onChange={(event) => updateSegmentLabel(segmentLabelIndex, { labelX: optionalNumber(event.target.value) })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Label j
                      <input
                        type="number"
                        value={numberInputValue(segmentLabel.labelY)}
                        onChange={(event) => updateSegmentLabel(segmentLabelIndex, { labelY: optionalNumber(event.target.value) })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    <Button type="button" variant="outline" size="sm" onClick={() => resetSegmentLabelPosition(segmentLabelIndex)}>
                      Reset label
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">No segment labels.</div>
          )}
        </div>
        <div className="mt-2 flex flex-col gap-2 border-t pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Angle markers</div>
            <Button type="button" variant="outline" size="sm" onClick={addAngleMarker} disabled={vectors.length < 2}>
              <PlusCircle data-icon="inline-start" />
              Add marker
            </Button>
          </div>
          {visibleAngleMarkerRows.length ? (
            <div className="grid grid-cols-1 gap-2">
              {visibleAngleMarkerRows.map(({ marker, markerIndex }) => (
                <div
                  key={`${marker.id}-${markerIndex}`}
                  data-vector2d-item-kind="angleMarker"
                  data-vector2d-item-id={marker.id}
                  data-solution-only={isSolutionOnlyVector2DElement(marker) ? "true" : undefined}
                  className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Angle marker {markerIndex + 1}
                      {isSolutionOnlyVector2DElement(marker) ? <Badge variant="outline">Solution</Badge> : null}
                    </span>
                    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={isSolutionOnlyVector2DElement(marker)}
                        aria-label={`Angle marker ${marker.id} show in solutions only`}
                        onChange={(event) =>
                          updateAngleMarker(
                            markerIndex,
                            vector2dElementWithSolutionOnly(marker, event.target.checked) as Vector2DAngleMarkerEntry,
                          )
                        }
                      />
                      Show in solutions only
                    </label>
                  </div>
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
