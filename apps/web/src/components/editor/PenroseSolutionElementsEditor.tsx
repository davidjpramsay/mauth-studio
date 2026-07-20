import type { GeometricDiagramData, GeometricDiagramObject, GeometricDiagramRelationship, GraphConfig } from "@mauth-studio/shared";
import { PlusCircle, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createPenroseSolutionPoint, createPenroseSolutionSegment } from "@/lib/diagramPenroseSolution";
import { removePenroseSubstanceOverride } from "@/lib/diagramPenrose";

function structuredData(config: GraphConfig): GeometricDiagramData {
  const source =
    config.data && typeof config.data === "object" && !Array.isArray(config.data) ? (config.data as Record<string, unknown>) : {};
  return {
    ...source,
    objects: Array.isArray(source.objects) ? source.objects : [],
    relationships: Array.isArray(source.relationships) ? source.relationships : [],
  } as GeometricDiagramData;
}

function relationshipReferences(relationship: GeometricDiagramRelationship, name: string) {
  const values = [
    relationship.points,
    relationship.between,
    relationship.first,
    relationship.second,
    relationship.segmentA,
    relationship.segmentB,
  ];
  return values.some((value) => Array.isArray(value) && value.includes(name));
}

export function PenroseSolutionElementsEditor({
  config,
  showSolutions,
  onChange,
}: {
  config: GraphConfig;
  showSolutions: boolean;
  onChange: (patch: Partial<GraphConfig>) => void;
}) {
  if (!showSolutions) return null;
  const data = structuredData(config);
  const hasSubstanceOverride = typeof config.options?.substanceSource === "string" && config.options.substanceSource.trim().length > 0;
  const solutionObjects = data.objects.map((object, index) => ({ object, index })).filter(({ object }) => object.solutionOnly === true);
  const solutionRelationships = data.relationships
    .map((relationship, index) => ({ relationship, index }))
    .filter(({ relationship }) => relationship.solutionOnly === true && ["segment", "vectorSegment"].includes(relationship.type));
  const pointNames = data.objects.filter((object) => object.type === "point").map((object) => object.name);
  const patchData = (nextData: GeometricDiagramData) =>
    onChange({ data: nextData, options: removePenroseSubstanceOverride(config), widthPx: undefined, heightPx: undefined });
  const updateObject = (index: number, patch: Partial<GeometricDiagramObject>) => {
    const current = data.objects[index];
    if (!current) return;
    const nextName = typeof patch.name === "string" && patch.name.trim() ? patch.name.trim() : current.name;
    patchData({
      ...data,
      objects: data.objects.map((object, objectIndex) => (objectIndex === index ? { ...object, ...patch, name: nextName } : object)),
      relationships: data.relationships.map((relationship) => {
        if (nextName === current.name) return relationship;
        const replace = (values?: string[]) => values?.map((value) => (value === current.name ? nextName : value));
        return {
          ...relationship,
          ...(relationship.points ? { points: replace(relationship.points) } : {}),
          ...(relationship.between ? { between: replace(relationship.between) } : {}),
          ...(relationship.first ? { first: replace(relationship.first) } : {}),
          ...(relationship.second ? { second: replace(relationship.second) } : {}),
          ...(relationship.segmentA ? { segmentA: replace(relationship.segmentA) } : {}),
          ...(relationship.segmentB ? { segmentB: replace(relationship.segmentB) } : {}),
        };
      }),
    });
  };
  const removeObject = (index: number) => {
    const current = data.objects[index];
    if (!current) return;
    patchData({
      ...data,
      objects: data.objects.filter((_, objectIndex) => objectIndex !== index),
      relationships: data.relationships.filter((relationship) => !relationshipReferences(relationship, current.name)),
    });
  };
  const updateRelationship = (index: number, patch: Partial<GeometricDiagramRelationship>) =>
    patchData({
      ...data,
      relationships: data.relationships.map((relationship, relationshipIndex) =>
        relationshipIndex === index ? { ...relationship, ...patch } : relationship,
      ),
    });

  if (hasSubstanceOverride) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Structured solution elements are unavailable while this construction uses custom Substance. Use the paired solution diagram for an
        independent completion, or return the construction to structured data first.
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Solution elements</div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => patchData({ ...data, objects: [...data.objects, createPenroseSolutionPoint(data.objects, true)] })}
          >
            <PlusCircle data-icon="inline-start" />
            Add solution point
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!pointNames.length}
            onClick={() =>
              patchData({
                ...data,
                relationships: [...data.relationships, createPenroseSolutionSegment(data.objects, data.relationships, true)],
              })
            }
          >
            <PlusCircle data-icon="inline-start" />
            Add solution segment
          </Button>
        </div>
      </div>

      {solutionObjects.map(({ object, index }) => (
        <div
          key={`${object.name}-${index}`}
          data-penrose-item-kind="object"
          data-penrose-item-id={object.name}
          data-solution-only="true"
          className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Point {object.name} <Badge variant="outline">Solution</Badge>
            </span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={object.solutionOnly === true}
                  aria-label={`Point ${object.name} show in solutions only`}
                  onChange={(event) => updateObject(index, { solutionOnly: event.target.checked })}
                />
                Show in solutions only
              </label>
              <Button type="button" variant="outline" size="icon" aria-label="Remove solution point" onClick={() => removeObject(index)}>
                <Trash2 />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs font-medium">
              Name
              <input
                value={object.name}
                onChange={(event) => updateObject(index, { name: event.target.value })}
                className="h-9 rounded-md border border-input bg-background px-2 font-mono text-sm font-normal"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Label
              <input
                value={String(object.label ?? object.name)}
                onChange={(event) => updateObject(index, { label: event.target.value })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              />
            </label>
          </div>
        </div>
      ))}

      {solutionRelationships.map(({ relationship, index }) => (
        <div
          key={`${relationship.name}-${index}`}
          data-penrose-item-kind="relationship"
          data-penrose-item-id={relationship.name}
          data-solution-only="true"
          className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Segment {relationship.name} <Badge variant="outline">Solution</Badge>
            </span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={relationship.solutionOnly === true}
                  aria-label={`Segment ${relationship.name} show in solutions only`}
                  onChange={(event) => updateRelationship(index, { solutionOnly: event.target.checked })}
                />
                Show in solutions only
              </label>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Remove solution segment"
                onClick={() => patchData({ ...data, relationships: data.relationships.filter((_, itemIndex) => itemIndex !== index) })}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-2 text-xs font-medium">
              Type
              <select
                value={relationship.type}
                onChange={(event) =>
                  updateRelationship(index, { type: event.target.value === "vectorSegment" ? "vectorSegment" : "segment" })
                }
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              >
                <option value="segment">Line</option>
                <option value="vectorSegment">Directed arrow</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              From
              <select
                value={relationship.points?.[0] ?? pointNames[0] ?? ""}
                onChange={(event) =>
                  updateRelationship(index, { points: [event.target.value, relationship.points?.[1] ?? pointNames[0] ?? ""] })
                }
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              >
                {pointNames.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              To
              <select
                value={relationship.points?.[1] ?? pointNames[1] ?? pointNames[0] ?? ""}
                onChange={(event) =>
                  updateRelationship(index, { points: [relationship.points?.[0] ?? pointNames[0] ?? "", event.target.value] })
                }
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              >
                {pointNames.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Label
              <input
                value={String(relationship.label ?? "")}
                onChange={(event) => updateRelationship(index, { label: event.target.value })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              />
            </label>
          </div>
        </div>
      ))}
    </section>
  );
}
