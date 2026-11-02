type Point3 = [number, number, number];

const subtract = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Point3, b: Point3): Point3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function graph3dEdgeKey(from: Point3, to: Point3) {
  const key = (point: Point3) => point.map((coordinate) => Number(coordinate.toFixed(9))).join(",");
  return [key(from), key(to)].sort().join(":");
}

// Faces are the solid's planar convex polygons. Test towards the orthographic
// camera, ignoring the edge's own incident faces at distance zero. Winding and
// fill opacity do not affect geometric visibility.
export function graph3dEdgeIsHidden(from: Point3, to: Point3, faces: Point3[][], viewDirection: Point3) {
  const origin: Point3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  const ray: Point3 = [-viewDirection[0], -viewDirection[1], -viewDirection[2]];
  const tolerance = Math.max(1, Math.hypot(...subtract(to, from)), ...faces.flat().map((p) => Math.hypot(...subtract(p, origin)))) * 1e-7;
  return faces.some((face) => {
    for (let index = 1; index < face.length - 1; index += 1) {
      const first = subtract(face[index], face[0]);
      const second = subtract(face[index + 1], face[0]);
      const h = cross(ray, second);
      const determinant = dot(first, h);
      if (Math.abs(determinant) <= 1e-10 * Math.max(1, Math.hypot(...first) * Math.hypot(...second))) continue;
      const s = subtract(origin, face[0]);
      const u = dot(s, h) / determinant;
      if (u < -1e-8 || u > 1 + 1e-8) continue;
      const q = cross(s, first);
      const v = dot(ray, q) / determinant;
      if (v < -1e-8 || u + v > 1 + 1e-8) continue;
      if (dot(second, q) / determinant > tolerance) return true;
    }
    return false;
  });
}
