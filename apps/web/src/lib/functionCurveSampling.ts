export interface FunctionCurveSegment {
  xs: number[];
  ys: number[];
}

export interface FunctionCurveSamplingOptions {
  uniformSamples?: number;
  endpointSamples?: number;
  endpointClusterRatio?: number;
  yMin?: number;
  yMax?: number;
}

const DEFAULT_UNIFORM_SAMPLES = 320;
const DEFAULT_ENDPOINT_SAMPLES = 96;
const DEFAULT_ENDPOINT_CLUSTER_RATIO = 0.14;

function finiteNumber(value: number) {
  return Number.isFinite(value);
}

function sortedUniqueValues(values: number[], tolerance: number) {
  const sorted = values.filter(finiteNumber).sort((left, right) => left - right);
  const unique: number[] = [];
  for (const value of sorted) {
    const previous = unique.at(-1);
    if (previous === undefined || Math.abs(value - previous) > tolerance) unique.push(value);
  }
  return unique;
}

function yClipBounds(options: FunctionCurveSamplingOptions) {
  const yMin = Number(options.yMin);
  const yMax = Number(options.yMax);
  return Number.isFinite(yMin) && Number.isFinite(yMax) && yMax > yMin ? { yMin, yMax } : null;
}

function yInBounds(y: number, bounds: { yMin: number; yMax: number } | null) {
  return !bounds || (y >= bounds.yMin && y <= bounds.yMax);
}

function boundaryBetweenYValues(previous: number, current: number, bounds: { yMin: number; yMax: number }) {
  if ((previous < bounds.yMin && current >= bounds.yMin) || (current < bounds.yMin && previous >= bounds.yMin)) return bounds.yMin;
  if ((previous > bounds.yMax && current <= bounds.yMax) || (current > bounds.yMax && previous <= bounds.yMax)) return bounds.yMax;
  return null;
}

function interpolatedBoundaryPoint(
  previousX: number,
  previousY: number,
  currentX: number,
  currentY: number,
  boundaryY: number,
): [number, number] {
  const ratio = currentY === previousY ? 0 : (boundaryY - previousY) / (currentY - previousY);
  return [previousX + (currentX - previousX) * ratio, boundaryY];
}

function addPoint(segment: FunctionCurveSegment, x: number, y: number) {
  const previousX = segment.xs.at(-1);
  const previousY = segment.ys.at(-1);
  if (previousX !== undefined && previousY !== undefined && Math.abs(previousX - x) < 1e-12 && Math.abs(previousY - y) < 1e-12) return;
  segment.xs.push(x);
  segment.ys.push(y);
}

export function sampledFunctionCurveSegments(
  evaluator: (x: number) => number,
  xStart: number,
  xEnd: number,
  options: FunctionCurveSamplingOptions = {},
): FunctionCurveSegment[] {
  if (!Number.isFinite(xStart) || !Number.isFinite(xEnd) || xEnd <= xStart) return [];

  const span = xEnd - xStart;
  const uniformSamples = Math.max(2, Math.round(options.uniformSamples ?? DEFAULT_UNIFORM_SAMPLES));
  const endpointSamples = Math.max(2, Math.round(options.endpointSamples ?? DEFAULT_ENDPOINT_SAMPLES));
  const endpointClusterRatio = Math.max(0, Math.min(0.5, options.endpointClusterRatio ?? DEFAULT_ENDPOINT_CLUSTER_RATIO));
  const xValues = [xStart, xEnd];
  const bounds = yClipBounds(options);

  for (let index = 1; index < uniformSamples; index += 1) {
    xValues.push(xStart + (span * index) / uniformSamples);
  }

  for (let index = 1; index <= endpointSamples; index += 1) {
    const ratio = Math.pow(index / endpointSamples, 3) * endpointClusterRatio;
    xValues.push(xStart + span * ratio, xEnd - span * ratio);
  }

  const uniqueXValues = sortedUniqueValues(xValues, Math.max(span * 1e-13, 1e-13));
  const segments: FunctionCurveSegment[] = [];
  let current: FunctionCurveSegment = { xs: [], ys: [] };
  let previous: { x: number; y: number; inside: boolean } | null = null;

  for (const x of uniqueXValues) {
    const y = evaluator(x);
    if (!Number.isFinite(y)) {
      if (current.xs.length >= 2) segments.push(current);
      current = { xs: [], ys: [] };
      previous = null;
      continue;
    }

    const inside = yInBounds(y, bounds);
    if (!bounds) {
      addPoint(current, x, y);
      previous = { x, y, inside };
      continue;
    }

    if (!previous) {
      if (inside) addPoint(current, x, y);
      previous = { x, y, inside };
      continue;
    }

    if (previous.inside && inside) {
      addPoint(current, x, y);
    } else if (previous.inside && !inside) {
      const boundaryY = boundaryBetweenYValues(previous.y, y, bounds);
      if (boundaryY !== null) {
        const [boundaryX, clippedY] = interpolatedBoundaryPoint(previous.x, previous.y, x, y, boundaryY);
        addPoint(current, boundaryX, clippedY);
      }
      if (current.xs.length >= 2) segments.push(current);
      current = { xs: [], ys: [] };
    } else if (!previous.inside && inside) {
      const boundaryY = boundaryBetweenYValues(previous.y, y, bounds);
      if (boundaryY !== null) {
        const [boundaryX, clippedY] = interpolatedBoundaryPoint(previous.x, previous.y, x, y, boundaryY);
        addPoint(current, boundaryX, clippedY);
      }
      addPoint(current, x, y);
    } else {
      const firstBoundaryY = boundaryBetweenYValues(previous.y, y, bounds);
      const crossesWholeView =
        firstBoundaryY !== null && ((previous.y < bounds.yMin && y > bounds.yMax) || (previous.y > bounds.yMax && y < bounds.yMin));
      if (crossesWholeView) {
        const secondBoundaryY = firstBoundaryY === bounds.yMin ? bounds.yMax : bounds.yMin;
        const [firstX, firstY] = interpolatedBoundaryPoint(previous.x, previous.y, x, y, firstBoundaryY);
        const [secondX, secondY] = interpolatedBoundaryPoint(previous.x, previous.y, x, y, secondBoundaryY);
        const segment =
          firstX <= secondX ? { xs: [firstX, secondX], ys: [firstY, secondY] } : { xs: [secondX, firstX], ys: [secondY, firstY] };
        segments.push(segment);
      }
    }

    previous = { x, y, inside };
  }

  if (current.xs.length >= 2) segments.push(current);
  return segments;
}
