import type {
  Graph3DDimensionData,
  Graph3DFaceData,
  Graph3DPointData,
  Graph3DSegmentData,
  Graph3DSolidData,
  GraphConfig,
} from "@mauth-studio/shared";
import { PlusCircle, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  graph3dDataFromElements,
  graph3dDataWithRenamedPoint,
  graph3dElementForAuthoringLayer,
  graph3dElementId,
  graph3dElementVisibleInStudent,
  graph3dElementWithSolutionOnly,
  isSolutionOnlyGraph3DElement,
  normalizedGraph3DElements,
  type Graph3DElement,
  type Graph3DElementKind,
} from "@/lib/diagramGraph3d";

const GRAPH_3D_POINT_COLOR = "#111827";
const GRAPH_3D_LINE_COLOR = "#111827";
const GRAPH_3D_DIMENSION_COLOR = "#6b7280";

function optionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

function numberInputValue(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

function nextElementId(prefix: string, elements: Graph3DElement[], kind: Graph3DElementKind) {
  const ids = new Set(elements.map((element, index) => graph3dElementId(element, kind, index)));
  let index = elements.length + 1;
  while (ids.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

function Graph3DSectionHeader({
  title,
  actionLabel,
  disabled = false,
  onAdd,
}: {
  title: string;
  actionLabel?: string;
  disabled?: boolean;
  onAdd?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {actionLabel && onAdd ? (
        <Button type="button" variant="outline" size="sm" onClick={onAdd} disabled={disabled}>
          <PlusCircle data-icon="inline-start" />
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function Graph3DSolutionToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        aria-label={`${label} show in solutions only`}
        onChange={(event) => onChange(event.target.checked)}
      />
      Show in solutions only
    </label>
  );
}

function Graph3DPointSelect({
  label,
  value,
  pointOptions,
  onChange,
}: {
  label: string;
  value: string;
  pointOptions: Graph3DPointData[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-xs font-medium">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
      >
        {pointOptions.map((point, index) => {
          const id = graph3dElementId(point, "point", index);
          return (
            <option key={id} value={id}>
              {point.label && point.label !== id ? `${point.label} (${id})` : id}
            </option>
          );
        })}
      </select>
    </label>
  );
}

type Graph3DLineElement = Graph3DSegmentData | Graph3DDimensionData;

function Graph3DLineElementRow({
  kind,
  element,
  index,
  pointOptions,
  totalCount,
  onUpdate,
  onRemove,
}: {
  kind: "segment" | "dimension";
  element: Graph3DLineElement;
  index: number;
  pointOptions: Graph3DPointData[];
  totalCount: number;
  onUpdate: (patch: Partial<Graph3DLineElement>) => void;
  onRemove: () => void;
}) {
  const id = graph3dElementId(element, kind, index);
  const from = typeof element.from === "string" ? element.from : "";
  const to = typeof element.to === "string" ? element.to : "";
  const solutionOnly = isSolutionOnlyGraph3DElement(element);
  const heading = kind === "segment" ? "Segment" : "Dimension";

  return (
    <div
      data-graph3d-item-kind={kind}
      data-graph3d-item-id={id}
      data-solution-only={solutionOnly ? "true" : undefined}
      className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {heading} {index + 1}
          {solutionOnly ? <Badge variant="outline">Solution</Badge> : null}
        </span>
        <Graph3DSolutionToggle
          label={`${heading} ${id}`}
          checked={solutionOnly}
          onChange={(checked) => onUpdate(graph3dElementWithSolutionOnly(element, checked))}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(90px,1fr)_minmax(90px,1fr)_minmax(120px,2fr)_90px_40px] md:items-end">
        <Graph3DPointSelect label="From" value={from} pointOptions={pointOptions} onChange={(value) => onUpdate({ from: value })} />
        <Graph3DPointSelect label="To" value={to} pointOptions={pointOptions} onChange={(value) => onUpdate({ to: value })} />
        <label className="flex flex-col gap-2 text-xs font-medium">
          Label
          <input
            value={element.label ?? ""}
            onChange={(event) => onUpdate({ label: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          Colour
          <input
            type="color"
            value={element.color ?? (kind === "dimension" ? GRAPH_3D_DIMENSION_COLOR : GRAPH_3D_LINE_COLOR)}
            onChange={(event) => onUpdate({ color: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title={`Remove ${kind}`}
          aria-label={`Remove ${kind}`}
          onClick={onRemove}
          className="size-9"
          disabled={totalCount <= 0}
        >
          <Trash2 />
        </Button>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <input type="checkbox" checked={element.show !== false} onChange={(event) => onUpdate({ show: event.target.checked })} />
          Visible
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <input
            type="checkbox"
            checked={element.dashed === true || element.strokeStyle === "dashed"}
            onChange={(event) => onUpdate({ dashed: event.target.checked, strokeStyle: event.target.checked ? "dashed" : "solid" })}
          />
          Dashed
        </label>
      </div>
    </div>
  );
}

function Graph3DExistingElementRow({
  kind,
  element,
  index,
  onUpdate,
}: {
  kind: "face" | "solid";
  element: Graph3DFaceData | Graph3DSolidData;
  index: number;
  onUpdate: (patch: Partial<Graph3DFaceData | Graph3DSolidData>) => void;
}) {
  const id = graph3dElementId(element, kind, index);
  const solutionOnly = isSolutionOnlyGraph3DElement(element);
  const detail = kind === "solid" ? String((element as Graph3DSolidData).kind ?? (element as Graph3DSolidData).type ?? "Solid") : "Face";
  return (
    <div
      data-graph3d-item-kind={kind}
      data-graph3d-item-id={id}
      data-solution-only={solutionOnly ? "true" : undefined}
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2"
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {id}
        <span className="text-xs font-normal text-muted-foreground">{detail}</span>
        {solutionOnly ? <Badge variant="outline">Solution</Badge> : null}
      </span>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <input type="checkbox" checked={element.show !== false} onChange={(event) => onUpdate({ show: event.target.checked })} />
          Visible
        </label>
        <Graph3DSolutionToggle
          label={`${detail} ${id}`}
          checked={solutionOnly}
          onChange={(checked) => onUpdate(graph3dElementWithSolutionOnly(element, checked))}
        />
      </div>
    </div>
  );
}

interface Graph3DElementsEditorProps {
  config: GraphConfig;
  showSolutions: boolean;
  onChange: (patch: Partial<GraphConfig>) => void;
}

export function Graph3DElementsEditor({ config, showSolutions, onChange }: Graph3DElementsEditorProps) {
  const points = normalizedGraph3DElements(config, "point");
  const segments = normalizedGraph3DElements(config, "segment");
  const dimensions = normalizedGraph3DElements(config, "dimension");
  const faces = normalizedGraph3DElements(config, "face");
  const solids = normalizedGraph3DElements(config, "solid");
  const hiddenPointIds = new Set(
    points.flatMap((point, index) => (isSolutionOnlyGraph3DElement(point) ? [graph3dElementId(point, "point", index)] : [])),
  );
  const visiblePointRows = points.flatMap((point, index) =>
    showSolutions || !isSolutionOnlyGraph3DElement(point) ? [{ point, pointIndex: index }] : [],
  );
  const visiblePoints = visiblePointRows.map(({ point }) => point);
  const visibleRows = <TElement extends Graph3DElement>(elements: TElement[], kind: Graph3DElementKind) =>
    elements.flatMap((element, index) =>
      showSolutions || graph3dElementVisibleInStudent(element, kind, hiddenPointIds) ? [{ element, elementIndex: index }] : [],
    );
  const visibleSegmentRows = visibleRows(segments, "segment");
  const visibleDimensionRows = visibleRows(dimensions, "dimension");
  const visibleFaceRows = visibleRows(faces, "face");
  const visibleSolidRows = visibleRows(solids, "solid");
  const patchElements = (kind: Graph3DElementKind, elements: Graph3DElement[]) => {
    onChange({ data: graph3dDataFromElements(config, kind, elements) });
  };
  const updateElement = <TElement extends Graph3DElement>(
    kind: Graph3DElementKind,
    elements: TElement[],
    index: number,
    patch: Partial<TElement>,
  ) => {
    patchElements(
      kind,
      elements.map((element, elementIndex) => (elementIndex === index ? { ...element, ...patch } : element)),
    );
  };
  const addPoint = () => {
    const id = nextElementId("P", points, "point");
    patchElements("point", [
      ...points,
      graph3dElementForAuthoringLayer({ id, label: id, coords: [0, 0, 0], color: GRAPH_3D_POINT_COLOR }, showSolutions),
    ]);
  };
  const renamePoint = (pointIndex: number, nextId: string) => {
    if (!nextId.trim()) return;
    onChange({ data: graph3dDataWithRenamedPoint(config, pointIndex, nextId) });
  };
  const addLineElement = (kind: "segment" | "dimension") => {
    if (visiblePoints.length < 2) return;
    const elements = kind === "segment" ? segments : dimensions;
    const id = nextElementId(kind === "segment" ? "segment-" : "dimension-", elements, kind);
    const entry = graph3dElementForAuthoringLayer(
      {
        id,
        from: graph3dElementId(visiblePoints[0], "point", 0),
        to: graph3dElementId(visiblePoints[1], "point", 1),
        label: "",
        color: kind === "segment" ? GRAPH_3D_LINE_COLOR : GRAPH_3D_DIMENSION_COLOR,
        show: true,
      } satisfies Graph3DLineElement,
      showSolutions,
    );
    patchElements(kind, [...elements, entry]);
  };

  return (
    <div className="flex flex-col gap-4 border-t pt-3">
      <section className="flex flex-col gap-2">
        <Graph3DSectionHeader title="Points" actionLabel="Add point" onAdd={addPoint} />
        {visiblePointRows.map(({ point, pointIndex }) => {
          const id = graph3dElementId(point, "point", pointIndex);
          const coords = point.coords ?? [0, 0, 0];
          const solutionOnly = isSolutionOnlyGraph3DElement(point);
          return (
            <div
              key={`${id}-${pointIndex}`}
              data-graph3d-item-kind="point"
              data-graph3d-item-id={id}
              data-solution-only={solutionOnly ? "true" : undefined}
              className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Point {pointIndex + 1}
                  {solutionOnly ? <Badge variant="outline">Solution</Badge> : null}
                </span>
                <Graph3DSolutionToggle
                  label={`Point ${id}`}
                  checked={solutionOnly}
                  onChange={(checked) => updateElement("point", points, pointIndex, graph3dElementWithSolutionOnly(point, checked))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-[100px_minmax(100px,1fr)_repeat(3,80px)_90px_40px] md:items-end">
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Id
                  <input
                    value={id}
                    onChange={(event) => renamePoint(pointIndex, event.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 font-mono text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Label
                  <input
                    value={point.label ?? ""}
                    onChange={(event) => updateElement("point", points, pointIndex, { label: event.target.value })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                {([0, 1, 2] as const).map((axis) => (
                  <label key={axis} className="flex flex-col gap-2 text-xs font-medium">
                    {axis === 0 ? "x" : axis === 1 ? "y" : "z"}
                    <input
                      type="number"
                      value={numberInputValue(coords[axis])}
                      onChange={(event) => {
                        const nextCoords: [number, number, number] = [...coords];
                        nextCoords[axis] = optionalNumber(event.target.value) ?? 0;
                        updateElement("point", points, pointIndex, { coords: nextCoords });
                      }}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    />
                  </label>
                ))}
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Colour
                  <input
                    type="color"
                    value={point.color ?? GRAPH_3D_POINT_COLOR}
                    onChange={(event) => updateElement("point", points, pointIndex, { color: event.target.value })}
                    className="h-9 rounded-md border border-input bg-background px-2"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Remove point"
                  aria-label="Remove point"
                  onClick={() =>
                    patchElements(
                      "point",
                      points.filter((_, index) => index !== pointIndex),
                    )
                  }
                  className="size-9"
                >
                  <Trash2 />
                </Button>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={point.show !== false}
                  onChange={(event) => updateElement("point", points, pointIndex, { show: event.target.checked })}
                />
                Visible
              </label>
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <Graph3DSectionHeader
          title="Segments"
          actionLabel="Add segment"
          disabled={visiblePoints.length < 2}
          onAdd={() => addLineElement("segment")}
        />
        {visibleSegmentRows.map(({ element, elementIndex }) => (
          <Graph3DLineElementRow
            key={`${graph3dElementId(element, "segment", elementIndex)}-${elementIndex}`}
            kind="segment"
            element={element}
            index={elementIndex}
            pointOptions={visiblePoints}
            totalCount={segments.length}
            onUpdate={(patch) => updateElement("segment", segments, elementIndex, patch)}
            onRemove={() =>
              patchElements(
                "segment",
                segments.filter((_, index) => index !== elementIndex),
              )
            }
          />
        ))}
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <Graph3DSectionHeader
          title="Dimensions"
          actionLabel="Add dimension"
          disabled={visiblePoints.length < 2}
          onAdd={() => addLineElement("dimension")}
        />
        {visibleDimensionRows.map(({ element, elementIndex }) => (
          <Graph3DLineElementRow
            key={`${graph3dElementId(element, "dimension", elementIndex)}-${elementIndex}`}
            kind="dimension"
            element={element}
            index={elementIndex}
            pointOptions={visiblePoints}
            totalCount={dimensions.length}
            onUpdate={(patch) => updateElement("dimension", dimensions, elementIndex, patch)}
            onRemove={() =>
              patchElements(
                "dimension",
                dimensions.filter((_, index) => index !== elementIndex),
              )
            }
          />
        ))}
      </section>

      {visibleFaceRows.length || visibleSolidRows.length ? (
        <section className="flex flex-col gap-2 border-t pt-3">
          <Graph3DSectionHeader title="Existing faces and solids" />
          {visibleFaceRows.map(({ element, elementIndex }) => (
            <Graph3DExistingElementRow
              key={`${graph3dElementId(element, "face", elementIndex)}-${elementIndex}`}
              kind="face"
              element={element}
              index={elementIndex}
              onUpdate={(patch) => updateElement("face", faces, elementIndex, patch)}
            />
          ))}
          {visibleSolidRows.map(({ element, elementIndex }) => (
            <Graph3DExistingElementRow
              key={`${graph3dElementId(element, "solid", elementIndex)}-${elementIndex}`}
              kind="solid"
              element={element}
              index={elementIndex}
              onUpdate={(patch) => updateElement("solid", solids, elementIndex, patch)}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
