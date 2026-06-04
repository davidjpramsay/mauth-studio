import type { ReactNode } from "react";
import type { Graph2DGeometryData, Graph2DGeometryDecoration, GraphConfig } from "@mauth-studio/shared";
import { PlusCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  createGeometry2DArc,
  createGeometry2DAngle,
  createGeometry2DDecoration,
  createGeometry2DPoint,
  createGeometry2DSegment,
  geometry2dChildAnchor,
  geometry2dData,
  geometry2dPatch,
} from "@/lib/diagramGeometry2d";
import { cn } from "@/lib/utils";

interface Geometry2DGraphEditorProps {
  config: GraphConfig;
  anchor?: string;
  activeAnchor?: string;
  onActivateAnchor?: (anchor: string) => void;
  onChange: (patch: Partial<GraphConfig>) => void;
}

const GEOMETRY_MARKER_ACTIONS: Array<{ kind: Graph2DGeometryDecoration["kind"]; label: string }> = [
  { kind: "equalLength", label: "Equal length" },
  { kind: "equalAngle", label: "Equal angle" },
  { kind: "rightAngle", label: "Right angle" },
];

function itemActive(activeAnchor: string | undefined, anchor: string) {
  return activeAnchor === anchor;
}

function removeItem<T>(items: readonly T[] | undefined, index: number) {
  return (items ?? []).filter((_, itemIndex) => itemIndex !== index);
}

function patchGeometryData(config: GraphConfig, onChange: (patch: Partial<GraphConfig>) => void, nextData: Graph2DGeometryData) {
  onChange(geometry2dPatch(config, nextData));
}

function GeometryItemButton({
  active,
  label,
  summary,
  anchor,
  onActivate,
  onRemove,
}: {
  active: boolean;
  label: string;
  summary?: string;
  anchor: string;
  onActivate?: (anchor: string) => void;
  onRemove: () => void;
}) {
  return (
    <div
      data-scroll-anchor={anchor}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-background/70 p-2 text-sm",
        active && "border-primary bg-primary/10 text-primary",
      )}
    >
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onActivate?.(anchor)}>
        <span className="block truncate font-medium">{label}</span>
        {summary ? <span className="block truncate text-xs text-muted-foreground">{summary}</span> : null}
      </button>
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Remove ${label}`} onClick={onRemove}>
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

function GeometrySection({
  title,
  onAdd,
  addLabel,
  actions,
  children,
}: {
  title: string;
  onAdd?: () => void;
  addLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
        {actions ?? (
          <Button type="button" variant="outline" size="sm" onClick={onAdd}>
            <PlusCircle className="mr-2 size-4" aria-hidden="true" />
            {addLabel ?? "Add"}
          </Button>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function Geometry2DGraphEditor({ config, anchor, activeAnchor, onActivateAnchor, onChange }: Geometry2DGraphEditorProps) {
  const data = geometry2dData(config);
  const points = data.points ?? [];
  const segments = data.segments ?? [];
  const arcs = data.arcs ?? [];
  const angles = data.angles ?? [];
  const decorations = data.decorations ?? [];

  const setData = (nextData: Graph2DGeometryData) => patchGeometryData(config, onChange, nextData);

  return (
    <div className="space-y-4">
      <GeometrySection
        title="Points"
        addLabel="Add point"
        onAdd={() => setData({ ...data, points: [...points, createGeometry2DPoint(points.length)] })}
      >
        {points.map((point, index) => {
          const itemAnchor = geometry2dChildAnchor(anchor, "points", index);
          return (
            <GeometryItemButton
              key={point.id ?? index}
              active={itemActive(activeAnchor, itemAnchor)}
              label={`Point ${index + 1}: ${point.label || point.id || "unnamed"}`}
              summary={`(${point.x}, ${point.y})`}
              anchor={itemAnchor}
              onActivate={onActivateAnchor}
              onRemove={() => setData({ ...data, points: removeItem(points, index) })}
            />
          );
        })}
      </GeometrySection>

      <GeometrySection
        title="Segments"
        addLabel="Add segment"
        onAdd={() => setData({ ...data, segments: [...segments, createGeometry2DSegment(points)] })}
      >
        {segments.map((segment, index) => {
          const itemAnchor = geometry2dChildAnchor(anchor, "segments", index);
          return (
            <GeometryItemButton
              key={segment.id ?? index}
              active={itemActive(activeAnchor, itemAnchor)}
              label={`Segment ${index + 1}: ${segment.id || "unnamed"}`}
              summary={`${segment.from} to ${segment.to}${segment.strokeStyle === "dashed" ? ", dashed" : ""}`}
              anchor={itemAnchor}
              onActivate={onActivateAnchor}
              onRemove={() => setData({ ...data, segments: removeItem(segments, index) })}
            />
          );
        })}
      </GeometrySection>

      <GeometrySection title="Arcs" addLabel="Add arc" onAdd={() => setData({ ...data, arcs: [...arcs, createGeometry2DArc(points)] })}>
        {arcs.map((arc, index) => {
          const itemAnchor = geometry2dChildAnchor(anchor, "arcs", index);
          return (
            <GeometryItemButton
              key={arc.id ?? index}
              active={itemActive(activeAnchor, itemAnchor)}
              label={`Arc ${index + 1}: ${arc.id || "unnamed"}`}
              summary={`${arc.center}: ${arc.from} to ${arc.to}`}
              anchor={itemAnchor}
              onActivate={onActivateAnchor}
              onRemove={() => setData({ ...data, arcs: removeItem(arcs, index) })}
            />
          );
        })}
      </GeometrySection>

      <GeometrySection
        title="Angles"
        addLabel="Add angle"
        onAdd={() => setData({ ...data, angles: [...angles, createGeometry2DAngle(points)] })}
      >
        {angles.map((angle, index) => {
          const itemAnchor = geometry2dChildAnchor(anchor, "angles", index);
          return (
            <GeometryItemButton
              key={angle.id ?? index}
              active={itemActive(activeAnchor, itemAnchor)}
              label={`Angle ${index + 1}: ${angle.id || "unnamed"}`}
              summary={angle.points.join("-")}
              anchor={itemAnchor}
              onActivate={onActivateAnchor}
              onRemove={() => setData({ ...data, angles: removeItem(angles, index) })}
            />
          );
        })}
      </GeometrySection>

      <GeometrySection
        title="Markers"
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            {GEOMETRY_MARKER_ACTIONS.map(({ kind, label }) => (
              <Button
                key={kind}
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setData({
                    ...data,
                    decorations: [...decorations, createGeometry2DDecoration(kind, data)],
                  })
                }
              >
                <PlusCircle className="mr-2 size-4" aria-hidden="true" />
                {label}
              </Button>
            ))}
          </div>
        }
      >
        {decorations.map((decoration, index) => {
          const itemAnchor = geometry2dChildAnchor(anchor, "decorations", index);
          const target =
            decoration.kind === "equalLength"
              ? decoration.segments?.join(", ")
              : decoration.kind === "equalAngle"
                ? decoration.angles?.join(", ")
                : decoration.angle;
          return (
            <GeometryItemButton
              key={decoration.id ?? index}
              active={itemActive(activeAnchor, itemAnchor)}
              label={`Marker ${index + 1}: ${decoration.kind}`}
              summary={target}
              anchor={itemAnchor}
              onActivate={onActivateAnchor}
              onRemove={() => setData({ ...data, decorations: removeItem(decorations, index) })}
            />
          );
        })}
      </GeometrySection>
    </div>
  );
}
