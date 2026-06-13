import type { GraphConfig, GraphFeature } from "@mauth-studio/shared";

export type GraphPoint = [number, number];

function distanceBetweenPoints(a: GraphPoint, b: GraphPoint) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
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
