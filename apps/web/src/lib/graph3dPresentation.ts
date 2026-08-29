import type { GraphConfig } from "@mauth-studio/shared";

export { GRAPH3D_FACE_RIGHT_ANGLE_TARGET_PREFIX } from "@mauth-studio/shared";

export type Graph3DPoint = [number, number, number];
export type Graph3DProjectedPoint = [number, number];
export type Graph3DRanges = [[number, number], [number, number], [number, number]];

export interface Graph3DProjectionView {
  az: number;
  el: number;
  bank: number;
}

export interface Graph3DProjectionScale {
  x: number;
  y: number;
}

export type Graph3DDimensionDisplay = "label" | "guide" | "bracket";

export interface Graph3DRightAngleMarkerPoints {
  vertex: Graph3DPoint;
  firstArm: Graph3DPoint;
  corner: Graph3DPoint;
  secondArm: Graph3DPoint;
}

export interface Graph3DSphereCapSilhouetteArc {
  firstAngle: number;
  secondAngle: number;
}

export const GRAPH3D_BOARD_BOUNDING_BOX: [number, number, number, number] = [-5, 5, 5, -5];
export const GRAPH3D_VIEW_ORIGIN: [number, number] = [-4, -4];
export const GRAPH3D_VIEW_SIZE: [number, number] = [8, 8];

export function graph3dEqualScaleRanges(ranges: Graph3DRanges): Graph3DRanges {
  const maximumSpan = Math.max(...ranges.map(([minimum, maximum]) => maximum - minimum));
  return ranges.map(([minimum, maximum]) => {
    const centre = (minimum + maximum) / 2;
    return [centre - maximumSpan / 2, centre + maximumSpan / 2] as [number, number];
  }) as Graph3DRanges;
}

function add(left: Graph3DPoint, right: Graph3DPoint): Graph3DPoint {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Graph3DPoint, right: Graph3DPoint): Graph3DPoint {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(vector: Graph3DPoint, scalar: number): Graph3DPoint {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function length(vector: Graph3DPoint) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function pointsMatch(left: Graph3DPoint, right: Graph3DPoint) {
  return length(subtract(left, right)) <= 1e-7;
}

function pointOnFacePlane(point: Graph3DPoint, facePoint: Graph3DPoint, normal: Graph3DPoint, tolerance: number) {
  return Math.abs(dot(subtract(point, facePoint), normal)) <= tolerance;
}

function faceNormal(points: Graph3DPoint[]) {
  if (points.length < 3) return null;
  for (let secondIndex = 1; secondIndex < points.length - 1; secondIndex += 1) {
    for (let thirdIndex = secondIndex + 1; thirdIndex < points.length; thirdIndex += 1) {
      const normal = cross(subtract(points[secondIndex], points[0]), subtract(points[thirdIndex], points[0]));
      if (length(normal) > 1e-9) return normalize(normal, [0, 0, 1]);
    }
  }
  return null;
}

function projectedFacePoint(point: Graph3DPoint, normal: Graph3DPoint): Graph3DProjectedPoint {
  const droppedAxis =
    Math.abs(normal[0]) >= Math.abs(normal[1]) && Math.abs(normal[0]) >= Math.abs(normal[2])
      ? 0
      : Math.abs(normal[1]) >= Math.abs(normal[2])
        ? 1
        : 2;
  if (droppedAxis === 0) return [point[1], point[2]];
  if (droppedAxis === 1) return [point[0], point[2]];
  return [point[0], point[1]];
}

function pointInsideFace(point: Graph3DPoint, facePoints: Graph3DPoint[], normal: Graph3DPoint, tolerance: number) {
  const target = projectedFacePoint(point, normal);
  const polygon = facePoints.map((facePoint) => projectedFacePoint(facePoint, normal));
  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const edge: Graph3DProjectedPoint = [current[0] - previous[0], current[1] - previous[1]];
    const fromPrevious: Graph3DProjectedPoint = [target[0] - previous[0], target[1] - previous[1]];
    const edgeLength = Math.hypot(edge[0], edge[1]);
    const crossDistance =
      edgeLength <= 1e-9 ? Number.POSITIVE_INFINITY : Math.abs(edge[0] * fromPrevious[1] - edge[1] * fromPrevious[0]) / edgeLength;
    const along = edgeLength <= 1e-9 ? -1 : (fromPrevious[0] * edge[0] + fromPrevious[1] * edge[1]) / edgeLength;
    if (crossDistance <= tolerance && along >= -tolerance && along <= edgeLength + tolerance) return true;
    const crosses = current[1] > target[1] !== previous[1] > target[1];
    if (crosses) {
      const crossingX = ((previous[0] - current[0]) * (target[1] - current[1])) / (previous[1] - current[1]) + current[0];
      if (target[0] < crossingX) inside = !inside;
    }
  }
  return inside;
}

function graph3dFaceInwardDirection(
  vertex: Graph3DPoint,
  facePoints: Graph3DPoint[],
  normal: Graph3DPoint,
  faceSpan: number,
  tolerance: number,
) {
  const projectIntoFace = (vector: Graph3DPoint) => subtract(vector, scale(normal, dot(vector, normal)));
  const sampleDistance = Math.max(tolerance * 10, faceSpan * 1e-4);
  const pointsIntoFace = (direction: Graph3DPoint) =>
    pointInsideFace(add(vertex, scale(direction, sampleDistance)), facePoints, normal, tolerance);
  const orientedInward = (candidate: Graph3DPoint) => {
    if (length(candidate) <= tolerance) return null;
    const direction = normalize(candidate, [1, 0, 0]);
    if (pointsIntoFace(direction)) return direction;
    const reversed = scale(direction, -1);
    return pointsIntoFace(reversed) ? reversed : null;
  };

  const vertexIndex = facePoints.findIndex((point) => pointsMatch(point, vertex));
  if (vertexIndex >= 0) {
    const previousVector = projectIntoFace(subtract(facePoints[(vertexIndex - 1 + facePoints.length) % facePoints.length], vertex));
    const nextVector = projectIntoFace(subtract(facePoints[(vertexIndex + 1) % facePoints.length], vertex));
    const previousLength = length(previousVector);
    const nextLength = length(nextVector);
    if (previousLength > tolerance && nextLength > tolerance) {
      const bisector = add(scale(previousVector, 1 / previousLength), scale(nextVector, 1 / nextLength));
      const direction = orientedInward(bisector);
      if (direction) return { direction, referenceLength: Math.min(previousLength, nextLength) };
    }
  }

  const centroid = scale(
    facePoints.reduce<Graph3DPoint>((sum, point) => add(sum, point), [0, 0, 0]),
    1 / facePoints.length,
  );
  const fallbackCandidates = [
    projectIntoFace(subtract(centroid, vertex)),
    ...facePoints.map((point) => projectIntoFace(subtract(point, vertex))),
  ];
  for (const candidate of fallbackCandidates) {
    const direction = orientedInward(candidate);
    if (direction) return { direction, referenceLength: length(candidate) };
  }
  return null;
}

function normalize(vector: Graph3DPoint, fallback: Graph3DPoint): Graph3DPoint {
  const vectorLength = length(vector);
  return vectorLength <= 1e-9 ? fallback : scale(vector, 1 / vectorLength);
}

function cross(left: Graph3DPoint, right: Graph3DPoint): Graph3DPoint {
  return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]];
}

function dot(left: Graph3DPoint, right: Graph3DPoint) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function circleBasis(normal: Graph3DPoint) {
  const w = normalize(normal, [0, 0, 1]);
  const helper: Graph3DPoint = Math.abs(w[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(w, helper), [1, 0, 0]);
  const v = normalize(cross(w, u), [0, 1, 0]);
  return { u, v };
}

function circlePoint(center: Graph3DPoint, u: Graph3DPoint, v: Graph3DPoint, radius: number, angle: number) {
  return add(center, add(scale(u, radius * Math.cos(angle)), scale(v, radius * Math.sin(angle))));
}

export function projectGraph3DPoint(
  coords: Graph3DPoint,
  view: Graph3DProjectionView,
  screenScale: Graph3DProjectionScale = { x: 1, y: 1 },
): Graph3DProjectedPoint {
  const azCos = Math.cos(view.az);
  const azSin = Math.sin(view.az);
  const elCos = Math.cos(view.el);
  const elSin = Math.sin(view.el);
  const rawX = -coords[0] * azCos + coords[1] * azSin;
  const rawY = coords[0] * azSin * elSin + coords[1] * azCos * elSin - coords[2] * elCos;
  if (Math.abs(view.bank) <= 1e-9) return [rawX * screenScale.x, rawY * screenScale.y];
  const bankCos = Math.cos(view.bank);
  const bankSin = Math.sin(view.bank);
  return [(rawX * bankCos - rawY * bankSin) * screenScale.x, (rawX * bankSin + rawY * bankCos) * screenScale.y];
}

export function graph3dViewDirection(view: Graph3DProjectionView): Graph3DPoint {
  const azCos = Math.cos(view.az);
  const azSin = Math.sin(view.az);
  const elCos = Math.cos(view.el);
  const elSin = Math.sin(view.el);
  return normalize([-azSin * elCos, -azCos * elCos, -elSin], [0, 0, -1]);
}

export function graph3dSphereCapSilhouetteArc(
  axis: Graph3DPoint,
  radius: number,
  baseZ: number,
  view: Graph3DProjectionView,
): Graph3DSphereCapSilhouetteArc {
  const capAxis = normalize(axis, [0, 0, 1]);
  const { u, v } = circleBasis(graph3dViewDirection(view));
  const alongU = dot(u, capAxis);
  const alongV = dot(v, capAxis);
  const projectedAxisLength = Math.hypot(alongU, alongV);
  const threshold = baseZ / Math.max(1e-9, radius);

  if (projectedAxisLength <= 1e-9) {
    return threshold <= 0 ? { firstAngle: -Math.PI, secondAngle: Math.PI } : { firstAngle: 0, secondAngle: 0 };
  }

  const phase = Math.atan2(alongV, alongU);
  const ratio = threshold / projectedAxisLength;
  const halfAngle = ratio <= -1 ? Math.PI : ratio >= 1 ? 0 : Math.acos(ratio);
  return {
    firstAngle: phase - halfAngle,
    secondAngle: phase + halfAngle,
  };
}

export function graph3dAxesVisible(graphConfig: GraphConfig | null | undefined, hasVisibleAuthoredPoint: boolean) {
  if (typeof graphConfig?.showAxes === "boolean") return graphConfig.showAxes;
  return hasVisibleAuthoredPoint;
}

export function graph3dAxisLabelsVisible(graphConfig: GraphConfig | null | undefined, axesVisible: boolean) {
  return axesVisible && graphConfig?.showAxisLabels !== false;
}

export function graph3dCircularSilhouetteAngles(
  center: Graph3DPoint,
  axis: Graph3DPoint,
  radius: number,
  view: Graph3DProjectionView,
): [number, number] {
  const { u, v } = circleBasis(axis);
  const projectedCenter = projectGraph3DPoint(center, view);
  const projectedAxis = projectGraph3DPoint(add(center, normalize(axis, [0, 0, 1])), view);
  const axisVector: Graph3DProjectedPoint = [projectedAxis[0] - projectedCenter[0], projectedAxis[1] - projectedCenter[1]];
  const axisLength = Math.hypot(axisVector[0], axisVector[1]);
  let bestAngle = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < 64; index += 1) {
    const angle = (index / 64) * Math.PI * 2;
    const projected = projectGraph3DPoint(circlePoint(center, u, v, radius, angle), view);
    const radial: Graph3DProjectedPoint = [projected[0] - projectedCenter[0], projected[1] - projectedCenter[1]];
    const radialLength = Math.hypot(radial[0], radial[1]);
    const perpendicularDistance =
      axisLength <= 1e-9 ? radialLength : Math.abs(radial[0] * axisVector[1] - radial[1] * axisVector[0]) / axisLength;
    if (perpendicularDistance > bestScore) {
      bestScore = perpendicularDistance;
      bestAngle = angle;
    }
  }

  return [bestAngle, (bestAngle + Math.PI) % (Math.PI * 2)];
}

export function graph3dDimensionTickDirection(
  from: Graph3DPoint,
  to: Graph3DPoint,
  view: Graph3DProjectionView,
  screenScale: Graph3DProjectionScale = { x: 1, y: 1 },
): Graph3DPoint {
  const projectedFrom = projectGraph3DPoint(from, view, screenScale);
  const projectedTo = projectGraph3DPoint(to, view, screenScale);
  const dimensionVector: Graph3DProjectedPoint = [projectedTo[0] - projectedFrom[0], projectedTo[1] - projectedFrom[1]];
  const dimensionLength = Math.hypot(dimensionVector[0], dimensionVector[1]);
  const projectedX = projectGraph3DPoint([1, 0, 0], view, screenScale);
  const projectedY = projectGraph3DPoint([0, 1, 0], view, screenScale);
  const projectedZ = projectGraph3DPoint([0, 0, 1], view, screenScale);
  const screenHorizontal: Graph3DPoint = [projectedX[0], projectedY[0], projectedZ[0]];
  const screenVertical: Graph3DPoint = [projectedX[1], projectedY[1], projectedZ[1]];
  const perpendicular: Graph3DProjectedPoint =
    dimensionLength <= 1e-9 ? [0, 1] : [-dimensionVector[1] / dimensionLength, dimensionVector[0] / dimensionLength];

  const horizontalLengthSquared = screenHorizontal.reduce((sum, value) => sum + value * value, 0);
  const verticalLengthSquared = screenVertical.reduce((sum, value) => sum + value * value, 0);

  return normalize(
    add(
      scale(screenHorizontal, horizontalLengthSquared <= 1e-9 ? 0 : perpendicular[0] / horizontalLengthSquared),
      scale(screenVertical, verticalLengthSquared <= 1e-9 ? 0 : perpendicular[1] / verticalLengthSquared),
    ),
    screenVertical,
  );
}

export function graph3dDimensionTickEndpoints(point: Graph3DPoint, direction: Graph3DPoint, tickLength: number) {
  const halfTick = scale(normalize(direction, [0, 0, 1]), tickLength / 2);
  return [subtract(point, halfTick), add(point, halfTick)] as const;
}

export function graph3dRightAngleMarkerPoints(
  firstFrom: Graph3DPoint,
  firstTo: Graph3DPoint,
  secondFrom: Graph3DPoint,
  secondTo: Graph3DPoint,
  requestedSize?: number,
): Graph3DRightAngleMarkerPoints | null {
  const shared = [
    { vertex: firstFrom, firstOther: firstTo, secondOther: secondTo, matches: pointsMatch(firstFrom, secondFrom) },
    { vertex: firstFrom, firstOther: firstTo, secondOther: secondFrom, matches: pointsMatch(firstFrom, secondTo) },
    { vertex: firstTo, firstOther: firstFrom, secondOther: secondTo, matches: pointsMatch(firstTo, secondFrom) },
    { vertex: firstTo, firstOther: firstFrom, secondOther: secondFrom, matches: pointsMatch(firstTo, secondTo) },
  ].find((candidate) => candidate.matches);
  if (!shared) return null;

  const firstVector = subtract(shared.firstOther, shared.vertex);
  const secondVector = subtract(shared.secondOther, shared.vertex);
  const shortestArm = Math.min(length(firstVector), length(secondVector));
  if (shortestArm <= 1e-9) return null;
  const automaticSize = shortestArm * 0.18;
  const markerSize = Math.min(shortestArm * 0.45, Math.max(shortestArm * 0.04, requestedSize ?? automaticSize));
  const firstDirection = normalize(firstVector, [1, 0, 0]);
  const secondDirection = normalize(secondVector, [0, 1, 0]);
  const firstArm = add(shared.vertex, scale(firstDirection, markerSize));
  const secondArm = add(shared.vertex, scale(secondDirection, markerSize));
  const corner = add(firstArm, scale(secondDirection, markerSize));
  return { vertex: shared.vertex, firstArm, corner, secondArm };
}

export function graph3dDimensionFaceRightAngleMarkerPoints(
  dimensionFrom: Graph3DPoint,
  dimensionTo: Graph3DPoint,
  facePoints: Graph3DPoint[],
  requestedSize?: number,
): Graph3DRightAngleMarkerPoints | null {
  const normal = faceNormal(facePoints);
  if (!normal) return null;
  const dimensionVector = subtract(dimensionTo, dimensionFrom);
  const dimensionLength = length(dimensionVector);
  if (dimensionLength <= 1e-9) return null;
  const dimensionDirection = normalize(dimensionVector, [0, 0, 1]);
  if (Math.abs(dot(dimensionDirection, normal)) < 0.999) return null;

  const faceSpan = Math.max(
    1,
    ...facePoints.flatMap((point, index) => facePoints.slice(index + 1).map((other) => length(subtract(point, other)))),
  );
  const tolerance = faceSpan * 1e-6;
  const endpointCandidates = [
    { vertex: dimensionFrom, other: dimensionTo },
    { vertex: dimensionTo, other: dimensionFrom },
  ];
  const shared = endpointCandidates.find(
    ({ vertex }) => pointOnFacePlane(vertex, facePoints[0], normal, tolerance) && pointInsideFace(vertex, facePoints, normal, tolerance),
  );
  if (!shared) return null;

  const faceDirection = graph3dFaceInwardDirection(shared.vertex, facePoints, normal, faceSpan, tolerance);
  if (!faceDirection) return null;

  const shortestArm = Math.min(length(subtract(shared.other, shared.vertex)), faceDirection.referenceLength);
  const automaticSize = shortestArm * 0.18;
  const markerSize = Math.min(shortestArm * 0.45, Math.max(shortestArm * 0.04, requestedSize ?? automaticSize));
  const firstDirection = normalize(subtract(shared.other, shared.vertex), [0, 0, 1]);
  const secondDirection = faceDirection.direction;
  const firstArm = add(shared.vertex, scale(firstDirection, markerSize));
  const secondArm = add(shared.vertex, scale(secondDirection, markerSize));
  const corner = add(firstArm, scale(secondDirection, markerSize));
  return { vertex: shared.vertex, firstArm, corner, secondArm };
}

export function graph3dDimensionDisplay(value: unknown): Graph3DDimensionDisplay {
  return value === "label" || value === "guide" || value === "bracket" ? value : "bracket";
}

export function graph3dDimensionLabelScreenOffset(
  from: Graph3DProjectedPoint,
  to: Graph3DProjectedPoint,
  sceneCenter: Graph3DProjectedPoint,
  distancePx: number,
  anchorFraction = 0.5,
): Graph3DProjectedPoint {
  const direction: Graph3DProjectedPoint = [to[0] - from[0], to[1] - from[1]];
  const directionLength = Math.hypot(...direction);
  if (directionLength <= 1e-9) return [distancePx, 0];

  let normal: Graph3DProjectedPoint = [-direction[1] / directionLength, direction[0] / directionLength];
  const anchor: Graph3DProjectedPoint = [from[0] + direction[0] * anchorFraction, from[1] + direction[1] * anchorFraction];
  const outward: Graph3DProjectedPoint = [anchor[0] - sceneCenter[0], anchor[1] - sceneCenter[1]];
  const outwardDot = normal[0] * outward[0] + normal[1] * outward[1];
  const hasMeaningfulOutwardDirection = Math.abs(outwardDot) > Math.max(2, distancePx * 0.25);
  const invertForStableTie = Math.abs(normal[0]) >= Math.abs(normal[1]) ? normal[0] < 0 : normal[1] > 0;

  if ((hasMeaningfulOutwardDirection && outwardDot < -1e-9) || (!hasMeaningfulOutwardDirection && invertForStableTie)) {
    normal = [-normal[0], -normal[1]];
  }
  return [normal[0] * distancePx, normal[1] * distancePx];
}

export function graph3dRadialLabelScreenOffset(
  anchor: Graph3DProjectedPoint,
  sceneCenter: Graph3DProjectedPoint,
  distancePx: number,
): Graph3DProjectedPoint {
  const outward: Graph3DProjectedPoint = [anchor[0] - sceneCenter[0], anchor[1] - sceneCenter[1]];
  const outwardLength = Math.hypot(...outward);
  if (outwardLength <= 1e-9) return [distancePx * Math.SQRT1_2, -distancePx * Math.SQRT1_2];
  return [(outward[0] / outwardLength) * distancePx, (outward[1] / outwardLength) * distancePx];
}

export function graph3dDraggedLabelScreenOffset(
  initialOffset: Graph3DProjectedPoint | undefined,
  deltaX: number,
  deltaY: number,
): Graph3DProjectedPoint {
  const start = initialOffset ?? [0, 0];
  return [Number((start[0] + deltaX).toFixed(2)), Number((start[1] + deltaY).toFixed(2))];
}
