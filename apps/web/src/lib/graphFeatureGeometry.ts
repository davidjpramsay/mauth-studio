import type { GraphConfig, GraphFeature } from "@mauth-studio/shared";

export type GraphPoint = [number, number];

function distanceBetweenPoints(a: GraphPoint, b: GraphPoint) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function graphFeatureId(feature: GraphFeature, index: number) {
  return feature.id?.trim() || `feature-${index}`;
}

function manualLineSegmentEndpoints(feature: GraphFeature): [GraphPoint, GraphPoint] {
  return [
    [Number.isFinite(feature.x1) ? (feature.x1 as number) : 0, Number.isFinite(feature.y1) ? (feature.y1 as number) : 0],
    [Number.isFinite(feature.x2) ? (feature.x2 as number) : 0, Number.isFinite(feature.y2) ? (feature.y2 as number) : 0],
  ];
}

function angleBetweenVectors(first: GraphPoint, second: GraphPoint) {
  const firstAngle = Math.atan2(first[1], first[0]);
  const secondAngle = Math.atan2(second[1], second[0]);
  const delta = Math.abs(firstAngle - secondAngle) % (Math.PI * 2);
  return Math.min(delta, Math.PI * 2 - delta);
}

function vectorFromPoints(from: GraphPoint, to: GraphPoint): GraphPoint {
  return [to[0] - from[0], to[1] - from[1]];
}

interface IncidentLineSegment {
  id: string;
  arm: GraphPoint;
}

function lineSegmentsIncidentAtMarker(feature: GraphFeature, features: readonly GraphFeature[]) {
  const vertex: GraphPoint = [
    Number.isFinite(feature.x) ? (feature.x as number) : 0,
    Number.isFinite(feature.y) ? (feature.y as number) : 0,
  ];
  return features.flatMap<IncidentLineSegment>((candidate, index) => {
    if (candidate.kind !== "line_segment") return [];
    const [start, end] = manualLineSegmentEndpoints(candidate);
    if (distanceBetweenPoints(vertex, start) < 1e-7) return [{ id: graphFeatureId(candidate, index), arm: end }];
    if (distanceBetweenPoints(vertex, end) < 1e-7) return [{ id: graphFeatureId(candidate, index), arm: start }];
    return [];
  });
}

export interface GraphAngleMarkerSegmentIds {
  firstSegmentId: string;
  secondSegmentId: string;
}

export function graphLineSegmentsShareEndpoint(features: readonly GraphFeature[], firstSegmentId: string, secondSegmentId: string) {
  if (!firstSegmentId || !secondSegmentId || firstSegmentId === secondSegmentId) return false;
  const firstIndex = features.findIndex((feature, index) => graphFeatureId(feature, index) === firstSegmentId);
  const secondIndex = features.findIndex((feature, index) => graphFeatureId(feature, index) === secondSegmentId);
  const first = features[firstIndex];
  const second = features[secondIndex];
  if (first?.kind !== "line_segment" || second?.kind !== "line_segment") return false;
  const firstEndpoints = manualLineSegmentEndpoints(first);
  const secondEndpoints = manualLineSegmentEndpoints(second);
  return firstEndpoints.some((firstPoint) => secondEndpoints.some((secondPoint) => distanceBetweenPoints(firstPoint, secondPoint) < 1e-7));
}

export function graphAngleMarkerSegmentIds(feature: GraphFeature, features: readonly GraphFeature[]): GraphAngleMarkerSegmentIds | null {
  if (feature.kind !== "angle_marker") return null;
  const lineSegmentIds = new Set(
    features.flatMap((candidate, index) => (candidate.kind === "line_segment" ? [graphFeatureId(candidate, index)] : [])),
  );
  const explicitFirst = feature.firstSegmentId?.trim();
  const explicitSecond = feature.secondSegmentId?.trim();
  if (
    explicitFirst &&
    explicitSecond &&
    explicitFirst !== explicitSecond &&
    lineSegmentIds.has(explicitFirst) &&
    lineSegmentIds.has(explicitSecond)
  ) {
    return { firstSegmentId: explicitFirst, secondSegmentId: explicitSecond };
  }

  const incident = lineSegmentsIncidentAtMarker(feature, features);
  if (incident.length < 2) return null;
  const vertex: GraphPoint = [
    Number.isFinite(feature.x) ? (feature.x as number) : 0,
    Number.isFinite(feature.y) ? (feature.y as number) : 0,
  ];
  const firstTarget: GraphPoint = [
    (Number.isFinite(feature.x1) ? (feature.x1 as number) : 1) - vertex[0],
    (Number.isFinite(feature.y1) ? (feature.y1 as number) : 0) - vertex[1],
  ];
  const secondTarget: GraphPoint = [
    (Number.isFinite(feature.x2) ? (feature.x2 as number) : 0.7) - vertex[0],
    (Number.isFinite(feature.y2) ? (feature.y2 as number) : 0.7) - vertex[1],
  ];
  let best: { firstSegmentId: string; secondSegmentId: string; score: number } | null = null;
  for (const first of incident) {
    if (explicitFirst && first.id !== explicitFirst) continue;
    for (const second of incident) {
      if (first.id === second.id || (explicitSecond && second.id !== explicitSecond)) continue;
      const score =
        angleBetweenVectors(vectorFromPoints(vertex, first.arm), firstTarget) +
        angleBetweenVectors(vectorFromPoints(vertex, second.arm), secondTarget);
      if (!best || score < best.score) best = { firstSegmentId: first.id, secondSegmentId: second.id, score };
    }
  }
  return best ? { firstSegmentId: best.firstSegmentId, secondSegmentId: best.secondSegmentId } : null;
}

function referencedAngleMarkerPoints(feature: GraphFeature, graphConfig: GraphConfig): [GraphPoint, GraphPoint, GraphPoint] | null {
  const features = graphConfig.features ?? [];
  const references = graphAngleMarkerSegmentIds(feature, features);
  if (!references) return null;
  const firstIndex = features.findIndex((candidate, index) => graphFeatureId(candidate, index) === references.firstSegmentId);
  const secondIndex = features.findIndex((candidate, index) => graphFeatureId(candidate, index) === references.secondSegmentId);
  const firstSegment = features[firstIndex];
  const secondSegment = features[secondIndex];
  if (firstSegment?.kind !== "line_segment" || secondSegment?.kind !== "line_segment") return null;
  const firstEndpoints = lineSegmentFeatureEndpoints(firstSegment, graphConfig);
  const secondEndpoints = lineSegmentFeatureEndpoints(secondSegment, graphConfig);
  let closest: { firstEndpoint: number; secondEndpoint: number; distance: number } | null = null;
  for (const firstEndpoint of [0, 1]) {
    for (const secondEndpoint of [0, 1]) {
      const distance = distanceBetweenPoints(firstEndpoints[firstEndpoint], secondEndpoints[secondEndpoint]);
      if (!closest || distance < closest.distance) closest = { firstEndpoint, secondEndpoint, distance };
    }
  }
  if (!closest || closest.distance >= 1e-7) return null;
  const firstVertex = firstEndpoints[closest.firstEndpoint];
  const secondVertex = secondEndpoints[closest.secondEndpoint];
  const vertex: GraphPoint = [(firstVertex[0] + secondVertex[0]) / 2, (firstVertex[1] + secondVertex[1]) / 2];
  return [firstEndpoints[closest.firstEndpoint === 0 ? 1 : 0], vertex, secondEndpoints[closest.secondEndpoint === 0 ? 1 : 0]];
}

export function graphAngleMarkerFeaturePoints(feature: GraphFeature, graphConfig: GraphConfig): [GraphPoint, GraphPoint, GraphPoint] {
  const referenced = referencedAngleMarkerPoints(feature, graphConfig);
  if (referenced) return referenced;
  return [
    [Number.isFinite(feature.x1) ? (feature.x1 as number) : 1, Number.isFinite(feature.y1) ? (feature.y1 as number) : 0],
    [Number.isFinite(feature.x) ? (feature.x as number) : 0, Number.isFinite(feature.y) ? (feature.y as number) : 0],
    [Number.isFinite(feature.x2) ? (feature.x2 as number) : 0.7, Number.isFinite(feature.y2) ? (feature.y2 as number) : 0.7],
  ];
}

function uniqueGraphPoints(points: GraphPoint[]) {
  return points.reduce<GraphPoint[]>((uniquePoints, point) => {
    if (!uniquePoints.some((candidate) => distanceBetweenPoints(candidate, point) < 1e-7)) uniquePoints.push(point);
    return uniquePoints;
  }, []);
}

function gridClipRect(graphConfig: GraphConfig) {
  return {
    xMin: graphConfig.xMin ?? -10,
    xMax: graphConfig.xMax ?? 10,
    yMin: graphConfig.yMin ?? -10,
    yMax: graphConfig.yMax ?? 10,
  };
}

export function lineSegmentFeatureEndpoints(feature: GraphFeature, graphConfig: GraphConfig): [GraphPoint, GraphPoint] {
  const x1 = Number.isFinite(feature.x1) ? (feature.x1 as number) : 0;
  const y1 = Number.isFinite(feature.y1) ? (feature.y1 as number) : 0;
  const x2 = Number.isFinite(feature.x2) ? (feature.x2 as number) : 0;
  const y2 = Number.isFinite(feature.y2) ? (feature.y2 as number) : 0;
  if (feature.span !== "grid")
    return [
      [x1, y1],
      [x2, y2],
    ];

  const { xMin, xMax, yMin, yMax } = gridClipRect(graphConfig);
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9)
    return [
      [x1, y1],
      [x2, y2],
    ];
  if (Math.abs(dx) < 1e-9)
    return [
      [x1, yMin],
      [x1, yMax],
    ];
  if (Math.abs(dy) < 1e-9)
    return [
      [xMin, y1],
      [xMax, y1],
    ];

  const intersections: GraphPoint[] = [];
  const addPoint = (x: number, y: number) => {
    if (x >= xMin - 1e-9 && x <= xMax + 1e-9 && y >= yMin - 1e-9 && y <= yMax + 1e-9) {
      intersections.push([x, y]);
    }
  };

  for (const x of [xMin, xMax]) {
    const t = (x - x1) / dx;
    addPoint(x, y1 + t * dy);
  }
  for (const y of [yMin, yMax]) {
    const t = (y - y1) / dy;
    addPoint(x1 + t * dx, y);
  }

  const clippedPoints = uniqueGraphPoints(intersections);
  if (clippedPoints.length < 2)
    return [
      [x1, y1],
      [x2, y2],
    ];

  let endpoints: [GraphPoint, GraphPoint] = [clippedPoints[0], clippedPoints[1]];
  let maxDistance = distanceBetweenPoints(endpoints[0], endpoints[1]);
  for (let i = 0; i < clippedPoints.length; i += 1) {
    for (let j = i + 1; j < clippedPoints.length; j += 1) {
      const candidateDistance = distanceBetweenPoints(clippedPoints[i], clippedPoints[j]);
      if (candidateDistance > maxDistance) {
        maxDistance = candidateDistance;
        endpoints = [clippedPoints[i], clippedPoints[j]];
      }
    }
  }
  return endpoints;
}
