type Point = [number, number];

export interface CartesianGridOptions {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xMajorStep: number;
  yMajorStep: number;
  xMinorStep: number | null;
  yMinorStep: number | null;
  showGrid: boolean;
  showMajorGrid: boolean;
  showMinorGrid: boolean;
}

export interface CartesianGridLine {
  from: Point;
  to: Point;
  major: boolean;
  boundary: boolean;
}

/** Refuse unrepresentable or excessively dense tick ranges before allocating. */
export function boundedNumericRange(min: number, max: number, step: number, limit = 2000): number[] {
  if (![min, max, step].every(Number.isFinite) || step <= 0 || min > max) return [];
  const first = Math.ceil(min / step);
  const last = Math.floor((max + step / 1000) / step);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last - first >= limit) return [];
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, offset) => Number(((first + offset) * step).toFixed(8)));
}

/** Close the grid at the exact authored bounds; never snap the mathematical view. */
export function cartesianGridLines(options: CartesianGridOptions): CartesianGridLine[] {
  const { xMin, xMax, yMin, yMax, showGrid, showMajorGrid, showMinorGrid } = options;
  if (!showGrid || (!showMajorGrid && !showMinorGrid)) return [];
  if (![xMin, xMax, yMin, yMax].every(Number.isFinite) || xMin >= xMax || yMin >= yMax) return [];

  const lines: CartesianGridLine[] = [];
  const addAxis = (min: number, max: number, majorStep: number, minorStep: number | null, vertical: boolean) => {
    const tolerance = (max - min) * 1e-10 + Math.max(Math.abs(min), Math.abs(max)) * Number.EPSILON * 8;
    const coordinates: { value: number; major: boolean; boundary: boolean }[] = [];
    const addInterior = (step: number, major: boolean) => {
      if (!Number.isFinite(step) || step <= 0) return;
      const first = Math.ceil(min / step);
      const last = Math.floor(max / step);
      // Invalid or sub-pixel densities must not lock up the editor.
      if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last - first > 2000) return;
      for (let index = first; index <= last; index++) {
        const value = index === 0 ? 0 : index * step;
        if (value <= min + tolerance || value >= max - tolerance) continue;
        if (!major && showMajorGrid && Math.abs(value / majorStep - Math.round(value / majorStep)) < 1e-9) continue;
        coordinates.push({ value, major, boundary: false });
      }
    };
    if (showMinorGrid && minorStep !== null && minorStep < majorStep) addInterior(minorStep, false);
    if (showMajorGrid) addInterior(majorStep, true);
    // Each boundary replaces any coincident regular grid line, avoiding darker edges.
    coordinates.push({ value: min, major: showMajorGrid, boundary: true }, { value: max, major: showMajorGrid, boundary: true });
    for (const { value, major, boundary } of coordinates) {
      lines.push({
        from: vertical ? [value, yMin] : [xMin, value],
        to: vertical ? [value, yMax] : [xMax, value],
        major,
        boundary,
      });
    }
  };
  addAxis(xMin, xMax, options.xMajorStep, options.xMinorStep, true);
  addAxis(yMin, yMax, options.yMajorStep, options.yMinorStep, false);
  return lines;
}
