import type { GraphConfig } from "@mauth-studio/shared";

export const DEFAULT_VECTOR_RELATIONSHIP_DATA = {
  hidePoints: false,
  hidePointLabels: false,
  objects: [
    { type: "point", name: "A", label: "A" },
    { type: "point", name: "B", label: "B" },
    { type: "point", name: "C", label: "C" },
  ],
  relationships: [
    { type: "vectorSegment", name: "AB", points: ["A", "B"], label: "" },
    { type: "vectorSegment", name: "AC", points: ["A", "C"], label: "" },
    { type: "segment", name: "BC", points: ["B", "C"], label: "" },
  ],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
}

export function penroseIdentifier(value: unknown, fallback: string) {
  const source = String(value ?? "").trim();
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(source) ? source : fallback;
}

function vectorSourceData(config: GraphConfig) {
  const data = asRecord(config.data) ?? asRecord(DEFAULT_VECTOR_RELATIONSHIP_DATA);
  const objects = recordArray(data?.objects);
  const relationships = recordArray(data?.relationships);
  return { data: data ?? {}, objects, relationships };
}

function relationshipPointNames(relationship: Record<string, unknown>) {
  const pointSources = [
    relationship.points,
    relationship.between,
    relationship.first,
    relationship.second,
    relationship.segmentA,
    relationship.segmentB,
  ];
  const points = pointSources.flatMap((source) => (Array.isArray(source) ? source : []));
  [relationship.a, relationship.at, relationship.b, relationship.c].forEach((point) => {
    if (typeof point === "string") points.push(point);
  });
  if (Array.isArray(relationship.segments)) {
    relationship.segments.forEach((segment) => {
      if (Array.isArray(segment)) points.push(...segment);
    });
  }
  return points.filter((point): point is string => typeof point === "string");
}

function vectorRelationshipsFromConfig(config: GraphConfig) {
  const { relationships } = vectorSourceData(config);
  const source = relationships.filter((relationship) => relationship.type === "segment" || relationship.type === "vectorSegment");
  return source.length ? source : recordArray(DEFAULT_VECTOR_RELATIONSHIP_DATA.relationships);
}

function vectorPointNamesFromRelationships(relationships: Array<Record<string, unknown>>) {
  const names = new Set<string>();
  relationships.forEach((relationship) => {
    relationshipPointNames(relationship).forEach((point) => names.add(penroseIdentifier(point, `P${names.size + 1}`)));
  });
  return [...names];
}

export function normalizedVectorRelationshipData(config: GraphConfig) {
  const { data, objects } = vectorSourceData(config);
  const relationships = vectorRelationshipsFromConfig(config).map((relationship, index) => {
    const points = relationshipPointNames(relationship).slice(0, 2);
    const fallback = DEFAULT_VECTOR_RELATIONSHIP_DATA.relationships[index] ?? DEFAULT_VECTOR_RELATIONSHIP_DATA.relationships[0];
    const fallbackPoints = Array.isArray(fallback.points) ? fallback.points : ["O", "A"];
    const start = penroseIdentifier(points[0], String(fallbackPoints[0] ?? "O"));
    const end = penroseIdentifier(points[1], String(fallbackPoints[1] ?? "A"));
    return {
      type: relationship.type === "segment" ? "segment" : "vectorSegment",
      name: penroseIdentifier(relationship.name, `${start}${end}`),
      points: [start, end],
      label: relationship.label ?? relationship.value ?? fallback.label ?? "",
    };
  });
  const relationshipPointNamesSet = vectorPointNamesFromRelationships(relationships);
  const objectMap = new Map<string, Record<string, unknown>>();
  objects.forEach((object) => {
    const name = penroseIdentifier(object.name, "");
    if (name) objectMap.set(name, object);
  });
  relationshipPointNamesSet.forEach((name) => {
    if (!objectMap.has(name)) objectMap.set(name, { type: "point", name });
  });
  return {
    hidePoints: data.hidePoints === true,
    hidePointLabels: data.hidePointLabels === true,
    objects: [...objectMap.values()].map((object, index) => {
      const name = penroseIdentifier(object.name, `P${index + 1}`);
      return {
        type: "point",
        name,
        label: object.label ?? name,
      };
    }),
    relationships,
  };
}

export function vectorRelationshipDataForSave(data: ReturnType<typeof normalizedVectorRelationshipData>) {
  const points = new Map<string, Record<string, unknown>>();
  data.objects.forEach((object) => {
    const name = penroseIdentifier(object.name, "");
    if (name) points.set(name, { type: "point", name, label: object.label ?? name });
  });
  data.relationships.forEach((relationship) => {
    relationship.points.forEach((point) => {
      const name = penroseIdentifier(point, "");
      if (name && !points.has(name)) points.set(name, { type: "point", name, label: name });
    });
  });
  return {
    hidePoints: data.hidePoints,
    hidePointLabels: data.hidePointLabels,
    objects: [...points.values()],
    relationships: data.relationships,
  };
}
