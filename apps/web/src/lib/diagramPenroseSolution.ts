import type { GeometricDiagramObject, GeometricDiagramRelationship, GraphConfig } from "@mauth-studio/shared";

export type PenroseSolutionElementKind = "object" | "relationship" | "region";

export interface PenroseSolutionElementTarget {
  kind: PenroseSolutionElementKind;
  index?: number;
  id?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
}

function relationshipPointNames(relationship: Record<string, unknown>) {
  const names: string[] = [];
  const arrayFields = [
    relationship.points,
    relationship.between,
    relationship.first,
    relationship.second,
    relationship.segmentA,
    relationship.segmentB,
  ];
  arrayFields.forEach((field) => {
    if (Array.isArray(field)) field.forEach((value) => typeof value === "string" && names.push(value));
  });
  [relationship.a, relationship.at, relationship.b, relationship.c, relationship.p, relationship.q].forEach((value) => {
    if (typeof value === "string") names.push(value);
  });
  if (Array.isArray(relationship.segments)) {
    relationship.segments.forEach((segment) => {
      if (Array.isArray(segment)) segment.forEach((value) => typeof value === "string" && names.push(value));
    });
  }
  return names;
}

export function penroseAuthoringLayer(showSolutions: boolean) {
  return { solutionOnly: showSolutions };
}

export function createPenroseSolutionPoint(existingObjects: readonly GeometricDiagramObject[], showSolutions: boolean) {
  const used = new Set(existingObjects.map((object) => object.name));
  let suffix = existingObjects.length + 1;
  let name = `P${suffix}`;
  while (used.has(name)) name = `P${++suffix}`;
  return { type: "point", name, label: name, ...penroseAuthoringLayer(showSolutions) } satisfies GeometricDiagramObject;
}

export function createPenroseSolutionSegment(
  objects: readonly GeometricDiagramObject[],
  relationships: readonly GeometricDiagramRelationship[],
  showSolutions: boolean,
) {
  const points = objects.filter((object) => object.type === "point").map((object) => object.name);
  const start = points[0] ?? "A";
  const end = points[1] ?? start;
  const used = new Set(relationships.map((relationship) => relationship.name).filter((name): name is string => Boolean(name)));
  let suffix = relationships.length + 1;
  let name = `answerSegment${suffix}`;
  while (used.has(name)) name = `answerSegment${++suffix}`;
  return {
    type: "segment",
    name,
    points: [start, end],
    label: "",
    ...penroseAuthoringLayer(showSolutions),
  } satisfies GeometricDiagramRelationship;
}

export function penroseConfigHasSolutionOnly(config: GraphConfig) {
  const data = asRecord(config.data);
  if (!data) return false;
  return [data.objects, data.relationships, data.regions].some((value) => recordArray(value).some((entry) => entry.solutionOnly === true));
}

export function penroseElementIndex(
  config: GraphConfig,
  target: PenroseSolutionElementTarget,
): { collection: "objects" | "relationships" | "regions"; index: number } | null {
  const collection = target.kind === "object" ? "objects" : target.kind === "relationship" ? "relationships" : "regions";
  const entries = recordArray(asRecord(config.data)?.[collection]);
  const index =
    typeof target.index === "number"
      ? target.index
      : typeof target.id === "string"
        ? entries.findIndex((entry) => entry.name === target.id || entry.id === target.id)
        : -1;
  return Number.isInteger(index) && index >= 0 && index < entries.length ? { collection, index } : null;
}

export function updatePenroseElement(config: GraphConfig, target: PenroseSolutionElementTarget, patch: Record<string, unknown>) {
  const resolved = penroseElementIndex(config, target);
  if (!resolved) return null;
  const data = asRecord(config.data) ?? {};
  const entries = recordArray(data[resolved.collection]);
  const nextEntries = entries.map((entry, index) => (index === resolved.index ? { ...entry, ...patch } : entry));
  return {
    data: {
      ...data,
      [resolved.collection]: nextEntries,
    },
    options: withoutSubstanceOverride(config.options),
  } satisfies Partial<GraphConfig>;
}

function withoutSubstanceOverride(options: GraphConfig["options"]) {
  const next = { ...(options ?? {}) };
  delete next.substanceSource;
  return next;
}

export function previewPenroseConfigForSolutionVisibility(config: GraphConfig, showSolutions: boolean) {
  if (!penroseConfigHasSolutionOnly(config)) return config;
  if (showSolutions) return config;
  const data = asRecord(config.data);
  if (!data) return config;

  if (config.type === "setDiagram") {
    const regions = recordArray(data.regions).map((region) =>
      region.solutionOnly === true
        ? {
            ...region,
            label: "",
            value: "",
            shaded: false,
            shade: false,
          }
        : region,
    );
    return { ...config, data: { ...data, regions } };
  }

  const hiddenObjectNames = new Set(
    recordArray(data.objects)
      .filter((object) => object.solutionOnly === true && typeof object.name === "string")
      .map((object) => String(object.name)),
  );
  const objects = recordArray(data.objects).filter((object) => object.solutionOnly !== true);
  const relationships = recordArray(data.relationships).filter(
    (relationship) =>
      relationship.solutionOnly !== true && !relationshipPointNames(relationship).some((name) => hiddenObjectNames.has(name)),
  );
  return { ...config, data: { ...data, objects, relationships } };
}
