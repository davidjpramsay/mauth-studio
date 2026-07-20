import { useEffect, useMemo, useState } from "react";
import type { GraphConfig, ImageDiagramAnnotation, ImageDiagramAnnotationKind } from "@mauth-studio/shared";
import { Circle, MoveUpRight, Trash2, Type } from "lucide-react";

import { ImageDiagramCanvas } from "@/components/diagrams/ImageDiagramCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createImageAnnotation,
  imageConfigForSolutionVisibility,
  imageDiagramAnnotations,
  imageDiagramDataWithAnnotations,
  isSolutionOnlyImageAnnotation,
} from "@/lib/diagramImage";

const ANNOTATION_TYPES: Array<{ kind: ImageDiagramAnnotationKind; label: string; icon: typeof Type }> = [
  { kind: "label", label: "Label", icon: Type },
  { kind: "ellipse", label: "Ellipse", icon: Circle },
  { kind: "arrow", label: "Arrow", icon: MoveUpRight },
];

function numberValue(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function annotationPatchForKind(kind: ImageDiagramAnnotationKind): Partial<ImageDiagramAnnotation> {
  if (kind === "arrow") return { kind, endXPercent: 70, endYPercent: 30, text: undefined };
  if (kind === "ellipse") return { kind, widthPercent: 20, heightPercent: 15, text: undefined };
  return { kind, text: "Label", endXPercent: undefined, endYPercent: undefined, widthPercent: undefined, heightPercent: undefined };
}

function NumberField({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          if (nextDraft.trim()) onChange(numberValue(nextDraft, value));
        }}
        onBlur={() => {
          if (!draft.trim()) setDraft(String(value));
        }}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
      />
    </label>
  );
}

export function ImageAnnotationsEditor({
  config,
  showSolutions,
  onChange,
}: {
  config: GraphConfig;
  showSolutions: boolean;
  onChange: (patch: Partial<GraphConfig>) => void;
}) {
  const annotations = imageDiagramAnnotations(config);
  const visibleRows = useMemo(
    () =>
      annotations.map((annotation, index) => ({ annotation, index })).filter(({ annotation }) => showSolutions || !annotation.solutionOnly),
    [annotations, showSolutions],
  );
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string>();
  const visibleSelectedId = visibleRows.some(({ annotation }) => annotation.id === selectedAnnotationId)
    ? selectedAnnotationId
    : visibleRows[0]?.annotation.id;
  const visibleConfig = imageConfigForSolutionVisibility(config, showSolutions, "#1d4ed8");

  const commit = (nextAnnotations: ImageDiagramAnnotation[]) =>
    onChange({ data: imageDiagramDataWithAnnotations(config, nextAnnotations), functions: [], features: [] });
  const updateAnnotation = (index: number, patch: Partial<ImageDiagramAnnotation>) =>
    commit(annotations.map((annotation, entryIndex) => (entryIndex === index ? { ...annotation, ...patch } : annotation)));
  const removeAnnotation = (index: number) => commit(annotations.filter((_, entryIndex) => entryIndex !== index));
  const addAnnotation = (kind: ImageDiagramAnnotationKind) => {
    const annotation = createImageAnnotation(annotations, kind, showSolutions);
    commit([...annotations, annotation]);
    setSelectedAnnotationId(annotation.id);
  };

  return (
    <section className="flex flex-col gap-3 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Image annotations</div>
        <div className="flex flex-wrap gap-2">
          {ANNOTATION_TYPES.map(({ kind, label, icon: Icon }) => (
            <Button key={kind} type="button" variant="outline" size="sm" onClick={() => addAnnotation(kind)}>
              <Icon data-icon="inline-start" />
              Add {showSolutions ? "solution " : ""}
              {label.toLowerCase()}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex justify-center rounded-md border bg-white p-3">
        <ImageDiagramCanvas
          graphConfig={visibleConfig}
          selectedAnnotationId={visibleSelectedId}
          onAnnotationSelect={(annotation) => setSelectedAnnotationId(annotation.id)}
        />
      </div>

      {visibleRows.map(({ annotation, index }) => {
        const solutionOnly = isSolutionOnlyImageAnnotation(annotation);
        const selected = annotation.id === visibleSelectedId;
        return (
          <div
            key={annotation.id}
            data-image-annotation-editor-id={annotation.id}
            data-solution-only={solutionOnly ? "true" : undefined}
            className={`flex flex-col gap-3 rounded-md border p-3 ${selected ? "border-blue-500 bg-blue-500/[0.04]" : "bg-muted/20"}`}
            onPointerDown={() => setSelectedAnnotationId(annotation.id)}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {annotation.kind} {index + 1}
                {solutionOnly ? <Badge variant="outline">Solution</Badge> : null}
              </span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={annotation.show !== false}
                    aria-label={`Image annotation ${annotation.id} visible`}
                    onChange={(event) => updateAnnotation(index, { show: event.target.checked })}
                  />
                  Visible
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={solutionOnly}
                    aria-label={`Image annotation ${annotation.id} show in solutions only`}
                    onChange={(event) => updateAnnotation(index, { solutionOnly: event.target.checked })}
                  />
                  Show in solutions only
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Remove annotation"
                  aria-label={`Remove image annotation ${annotation.id}`}
                  onClick={() => removeAnnotation(index)}
                  className="size-9"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1.5 text-xs font-medium">
                Type
                <select
                  value={annotation.kind}
                  onChange={(event) => updateAnnotation(index, annotationPatchForKind(event.target.value as ImageDiagramAnnotationKind))}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                >
                  {ANNOTATION_TYPES.map(({ kind, label }) => (
                    <option key={kind} value={kind}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                label="X position (%)"
                value={annotation.xPercent}
                onChange={(value) => updateAnnotation(index, { xPercent: value })}
              />
              <NumberField
                label="Y position (%)"
                value={annotation.yPercent}
                onChange={(value) => updateAnnotation(index, { yPercent: value })}
              />
              <label className="flex flex-col gap-1.5 text-xs font-medium">
                Colour
                <input
                  type="color"
                  value={annotation.color ?? "#111827"}
                  onChange={(event) => updateAnnotation(index, { color: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2"
                />
              </label>
            </div>

            {annotation.kind === "label" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <label className="flex flex-col gap-1.5 text-xs font-medium">
                  Label text
                  <input
                    value={annotation.text ?? ""}
                    onChange={(event) => updateAnnotation(index, { text: event.target.value })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <NumberField
                  label="Font size"
                  value={annotation.fontSizePx ?? 16}
                  min={8}
                  max={48}
                  onChange={(value) => updateAnnotation(index, { fontSizePx: value })}
                />
              </div>
            ) : null}

            {annotation.kind === "ellipse" ? (
              <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                <NumberField
                  label="Width (%)"
                  value={annotation.widthPercent ?? 20}
                  min={1}
                  onChange={(value) => updateAnnotation(index, { widthPercent: value })}
                />
                <NumberField
                  label="Height (%)"
                  value={annotation.heightPercent ?? 15}
                  min={1}
                  onChange={(value) => updateAnnotation(index, { heightPercent: value })}
                />
              </div>
            ) : null}

            {annotation.kind === "arrow" ? (
              <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                <NumberField
                  label="End X (%)"
                  value={annotation.endXPercent ?? 70}
                  onChange={(value) => updateAnnotation(index, { endXPercent: value })}
                />
                <NumberField
                  label="End Y (%)"
                  value={annotation.endYPercent ?? 30}
                  onChange={(value) => updateAnnotation(index, { endYPercent: value })}
                />
              </div>
            ) : null}

            {annotation.kind !== "label" ? (
              <div className="max-w-40">
                <NumberField
                  label="Line width"
                  value={annotation.strokeWidth ?? 2}
                  min={0.5}
                  max={12}
                  step={1}
                  onChange={(value) => updateAnnotation(index, { strokeWidth: value })}
                />
              </div>
            ) : null}
          </div>
        );
      })}

      {!visibleRows.length ? (
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          {showSolutions ? "Add an annotation to mark up this image." : "No student-visible image annotations."}
        </div>
      ) : null}
    </section>
  );
}
