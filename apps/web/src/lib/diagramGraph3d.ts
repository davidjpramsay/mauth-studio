import type {
  Graph3DData,
  Graph3DDimensionData,
  Graph3DFaceData,
  Graph3DPointData,
  Graph3DSegmentData,
  Graph3DSolidData,
  GraphConfig,
} from "@mauth-studio/shared";

export type Graph3DElementKind = "point" | "segment" | "dimension" | "face" | "solid";
export type Graph3DElementListKey =
  | "points"
  | "vertices"
  | "segments"
  | "edges"
  | "dimensions"
  | "dimensionLines"
  | "faces"
  | "solids"
  | "surfaces";
export type Graph3DElement = Graph3DPointData | Graph3DSegmentData | Graph3DDimensionData | Graph3DFaceData | Graph3DSolidData;

export interface Graph3DElementTarget {
  kind: Graph3DElementKind;
  listKey: Graph3DElementListKey;
  index: number;
}

const GRAPH_3D_CANONICAL_LIST_KEYS = {
  point: "points",
  segment: "segments",
  dimension: "dimensions",
  face: "faces",
  solid: "solids",
} as const satisfies Record<Graph3DElementKind, Graph3DElementListKey>;

const GRAPH_3D_LIST_ALIASES = {
  point: ["points", "vertices"],
  segment: ["segments", "edges"],
  dimension: ["dimensions", "dimensionLines"],
  face: ["faces"],
  solid: ["solids", "surfaces"],
} as const satisfies Record<Graph3DElementKind, readonly Graph3DElementListKey[]>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function finiteNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function finiteTriple(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return [finiteNumber(value[0], fallback[0]), finiteNumber(value[1], fallback[1]), finiteNumber(value[2], fallback[2])];
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function graph3dData(config?: GraphConfig | null): Graph3DData {
  return (asRecord(config?.data) ?? {}) as Graph3DData;
}

export function normalizeGraph3DElementKind(value: unknown): Graph3DElementKind | null {
  if (value === "point" || value === "points" || value === "vertex" || value === "vertices") return "point";
  if (value === "segment" || value === "segments" || value === "edge" || value === "edges") return "segment";
  if (value === "dimension" || value === "dimensions" || value === "dimensionLine" || value === "dimensionLines") return "dimension";
  if (value === "face" || value === "faces") return "face";
  if (value === "solid" || value === "solids" || value === "surface" || value === "surfaces") return "solid";
  return null;
}

export function graph3dElementListKey(config: GraphConfig, kind: Graph3DElementKind): Graph3DElementListKey {
  const data = graph3dData(config) as Record<string, unknown>;
  return GRAPH_3D_LIST_ALIASES[kind].find((key) => Array.isArray(data[key])) ?? GRAPH_3D_CANONICAL_LIST_KEYS[kind];
}

function rawGraph3DElements(config: GraphConfig, kind: Graph3DElementKind) {
  const listKey = graph3dElementListKey(config, kind);
  const data = graph3dData(config) as Record<string, unknown>;
  return { listKey, entries: Array.isArray(data[listKey]) ? (data[listKey] as unknown[]) : [] };
}

function graph3dElementFallbackId(kind: Graph3DElementKind, index: number, record: Record<string, unknown>) {
  if (typeof record.id === "string" && record.id.trim()) return record.id.trim();
  if (kind === "point") return stringValue(record.id, stringValue(record.name, `point-${index + 1}`));
  if (kind === "segment") {
    const points = Array.isArray(record.points) ? record.points : [];
    const from = stringValue(record.from, stringValue(points[0], "from"));
    const to = stringValue(record.to, stringValue(points[1], "to"));
    return `segment-${from}-${to}-${index + 1}`;
  }
  return `${kind}-${index + 1}`;
}

export function graph3dElementId(element: Graph3DElement, kind: Graph3DElementKind, index: number) {
  const record = element as Record<string, unknown>;
  return stringValue(record.id, graph3dElementFallbackId(kind, index, record));
}

export function normalizedGraph3DElements(config: GraphConfig, kind: "point"): Graph3DPointData[];
export function normalizedGraph3DElements(config: GraphConfig, kind: "segment"): Graph3DSegmentData[];
export function normalizedGraph3DElements(config: GraphConfig, kind: "dimension"): Graph3DDimensionData[];
export function normalizedGraph3DElements(config: GraphConfig, kind: "face"): Graph3DFaceData[];
export function normalizedGraph3DElements(config: GraphConfig, kind: "solid"): Graph3DSolidData[];
export function normalizedGraph3DElements(config: GraphConfig, kind: Graph3DElementKind): Graph3DElement[];
export function normalizedGraph3DElements(config: GraphConfig, kind: Graph3DElementKind): Graph3DElement[] {
  const { entries } = rawGraph3DElements(config, kind);
  return entries.flatMap((entry, index): Graph3DElement[] => {
    const record = asRecord(entry);
    if (!record) return [];
    const id = graph3dElementFallbackId(kind, index, record);
    const common = {
      ...record,
      id,
      ...(record.solutionOnly === true ? { solutionOnly: true } : {}),
    };
    if (kind === "point") {
      const coords = finiteTriple(record.coords ?? record.coordinates ?? record.position ?? [record.x, record.y, record.z], [0, 0, 0]);
      return [{ ...common, label: stringValue(record.label, id), coords } as Graph3DPointData];
    }
    if (kind === "segment") {
      const points = Array.isArray(record.points) ? record.points : [];
      return [
        {
          ...common,
          from: stringValue(record.from, stringValue(points[0])),
          to: stringValue(record.to, stringValue(points[1])),
        } as Graph3DSegmentData,
      ];
    }
    if (kind === "dimension") {
      const points = Array.isArray(record.points) ? record.points : [];
      return [
        {
          ...common,
          from: (record.from ?? record.start ?? points[0]) as Graph3DDimensionData["from"],
          to: (record.to ?? record.end ?? points[1]) as Graph3DDimensionData["to"],
        } as Graph3DDimensionData,
      ];
    }
    return [common as Graph3DFaceData | Graph3DSolidData];
  });
}

export function graph3dElementTarget(config: GraphConfig, kind: Graph3DElementKind, index: number): Graph3DElementTarget | null {
  if (!Number.isInteger(index) || index < 0) return null;
  return { kind, listKey: graph3dElementListKey(config, kind), index };
}

export function graph3dElementAt(config: GraphConfig, target: Graph3DElementTarget): Graph3DElement | undefined {
  return normalizedGraph3DElements(config, target.kind)[target.index];
}

export function graph3dElementIndexById(config: GraphConfig, kind: Graph3DElementKind, idValue: string) {
  return normalizedGraph3DElements(config, kind).findIndex((entry, index) => graph3dElementId(entry, kind, index) === idValue);
}

export function graph3dElementDisplayName(config: GraphConfig, target: Graph3DElementTarget) {
  const element = graph3dElementAt(config, target);
  const kindLabel = target.kind[0].toUpperCase() + target.kind.slice(1);
  const id = element ? graph3dElementId(element, target.kind, target.index) : "";
  return id ? `${kindLabel} ${target.index + 1}: ${id}` : `${kindLabel} ${target.index + 1}`;
}

export function graph3dDataFromElements(config: GraphConfig, kind: Graph3DElementKind, elements: Graph3DElement[]): Graph3DData {
  const listKey = graph3dElementListKey(config, kind);
  return { ...graph3dData(config), [listKey]: elements };
}

export function updateGraph3DElement(config: GraphConfig, target: Graph3DElementTarget, patch: Partial<Graph3DElement>): Graph3DData {
  const elements = normalizedGraph3DElements(config, target.kind);
  if (!elements[target.index]) return graph3dData(config);
  return graph3dDataFromElements(
    config,
    target.kind,
    elements.map((entry, index) => (index === target.index ? { ...entry, ...patch } : entry)),
  );
}

function renamedPointReference(value: unknown, oldId: string, nextId: string) {
  return value === oldId ? nextId : value;
}

function graph3dElementWithRenamedPointReference(element: Graph3DElement, kind: Graph3DElementKind, oldId: string, nextId: string) {
  if (kind === "segment" || kind === "dimension") {
    const record = element as Graph3DSegmentData | Graph3DDimensionData;
    return {
      ...record,
      ...(record.from !== undefined ? { from: renamedPointReference(record.from, oldId, nextId) } : {}),
      ...(record.to !== undefined ? { to: renamedPointReference(record.to, oldId, nextId) } : {}),
      ...(record.start !== undefined ? { start: renamedPointReference(record.start, oldId, nextId) } : {}),
      ...(record.end !== undefined ? { end: renamedPointReference(record.end, oldId, nextId) } : {}),
      ...(Array.isArray(record.points)
        ? { points: record.points.map((reference) => renamedPointReference(reference, oldId, nextId)) }
        : {}),
    } as Graph3DElement;
  }
  if (kind === "face") {
    const record = element as Graph3DFaceData;
    return {
      ...record,
      ...(Array.isArray(record.points)
        ? { points: record.points.map((reference) => renamedPointReference(reference, oldId, nextId)) }
        : {}),
      ...(Array.isArray(record.vertices)
        ? { vertices: record.vertices.map((reference) => renamedPointReference(reference, oldId, nextId)) }
        : {}),
    };
  }
  if (kind === "solid") {
    const record = element as Graph3DSolidData;
    return {
      ...record,
      ...(record.center !== undefined ? { center: renamedPointReference(record.center, oldId, nextId) } : {}),
      ...(record.baseCenter !== undefined ? { baseCenter: renamedPointReference(record.baseCenter, oldId, nextId) } : {}),
      ...(record.topCenter !== undefined ? { topCenter: renamedPointReference(record.topCenter, oldId, nextId) } : {}),
      ...(record.apex !== undefined ? { apex: renamedPointReference(record.apex, oldId, nextId) } : {}),
    };
  }
  return element;
}

export function graph3dDataWithRenamedPoint(config: GraphConfig, pointIndex: number, nextIdValue: string): Graph3DData {
  const points = normalizedGraph3DElements(config, "point");
  const point = points[pointIndex];
  const nextId = nextIdValue.trim();
  if (!point || !nextId) return graph3dData(config);
  const oldId = graph3dElementId(point, "point", pointIndex);
  if (oldId === nextId) return graph3dData(config);
  const renamedPoints = points.map((entry, index) =>
    index === pointIndex ? { ...entry, id: nextId, ...(entry.label === oldId ? { label: nextId } : {}) } : entry,
  );
  let nextConfig: GraphConfig = { ...config, data: graph3dDataFromElements(config, "point", renamedPoints) };
  for (const kind of ["segment", "dimension", "face", "solid"] as const) {
    const elements = normalizedGraph3DElements(nextConfig, kind).map((element) =>
      graph3dElementWithRenamedPointReference(element, kind, oldId, nextId),
    );
    nextConfig = { ...nextConfig, data: graph3dDataFromElements(nextConfig, kind, elements) };
  }
  return graph3dData(nextConfig);
}

export function isSolutionOnlyGraph3DElement(element: Graph3DElement) {
  return element.solutionOnly === true;
}

export function graph3dElementForAuthoringLayer<TElement extends Graph3DElement>(element: TElement, solutionsMode: boolean): TElement {
  return solutionsMode ? ({ ...element, solutionOnly: true } as TElement) : element;
}

export function graph3dElementWithSolutionOnly<TElement extends Graph3DElement>(element: TElement, solutionOnly: boolean): TElement {
  return { ...element, solutionOnly } as TElement;
}

function pointReferenceId(value: unknown) {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  return record ? stringValue(record.id, stringValue(record.name)) : "";
}

function graph3dElementPointReferences(element: Graph3DElement, kind: Graph3DElementKind) {
  const record = element as Record<string, unknown>;
  if (kind === "segment" || kind === "dimension") {
    const points = Array.isArray(record.points) ? record.points : [];
    return [record.from ?? record.start ?? points[0], record.to ?? record.end ?? points[1]].map(pointReferenceId).filter(Boolean);
  }
  if (kind === "face") {
    const points = Array.isArray(record.points) ? record.points : Array.isArray(record.vertices) ? record.vertices : [];
    return points.map(pointReferenceId).filter(Boolean);
  }
  if (kind === "solid") {
    return [record.center, record.baseCenter, record.topCenter, record.apex].map(pointReferenceId).filter(Boolean);
  }
  return [];
}

export function graph3dElementVisibleInStudent(element: Graph3DElement, kind: Graph3DElementKind, hiddenPointIds: Set<string>) {
  if (isSolutionOnlyGraph3DElement(element)) return false;
  return !graph3dElementPointReferences(element, kind).some((reference) => hiddenPointIds.has(reference));
}

export function graph3dConfigHasSolutionOnly(config: GraphConfig) {
  if (config.type !== "graph3d" && config.type !== "basic3d") return false;
  return (["point", "segment", "dimension", "face", "solid"] as const).some((kind) =>
    normalizedGraph3DElements(config, kind).some(isSolutionOnlyGraph3DElement),
  );
}

function graph3dSolutionElementStyle(kind: Graph3DElementKind, solutionColor: string) {
  if (kind === "point" || kind === "segment") return { color: solutionColor };
  if (kind === "dimension") return { color: solutionColor, strokeColor: solutionColor };
  return { color: solutionColor, fillColor: solutionColor, strokeColor: solutionColor };
}

export function graph3dConfigForSolutionVisibility(config: GraphConfig, showSolutions: boolean, solutionColor?: string): GraphConfig {
  if (!graph3dConfigHasSolutionOnly(config)) return config;
  const hiddenPointIds = new Set(
    normalizedGraph3DElements(config, "point")
      .filter(isSolutionOnlyGraph3DElement)
      .map((point, index) => graph3dElementId(point, "point", index)),
  );
  let nextData = graph3dData(config);
  for (const kind of ["point", "segment", "dimension", "face", "solid"] as const) {
    const elements = normalizedGraph3DElements(config, kind).flatMap((element): Graph3DElement[] => {
      if (showSolutions) {
        return [
          isSolutionOnlyGraph3DElement(element) && solutionColor
            ? { ...element, ...graph3dSolutionElementStyle(kind, solutionColor) }
            : element,
        ];
      }
      if (kind === "point" && isSolutionOnlyGraph3DElement(element)) return [{ ...element, show: false }];
      return graph3dElementVisibleInStudent(element, kind, hiddenPointIds) ? [element] : [];
    });
    const listKey = graph3dElementListKey(config, kind);
    nextData = { ...nextData, [listKey]: elements };
  }
  return { ...config, data: nextData };
}
