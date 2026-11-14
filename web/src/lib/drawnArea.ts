export type Point = [number, number];
export type PolygonGeometry = { type: 'Polygon'; coordinates: Point[][] };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

function distanceSquared(point: Point, start: Point, end: Point): number {
  const dx = end[0] - start[0], dy = end[1] - start[1];
  const t = dx === 0 && dy === 0 ? 0 : clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy), 0, 1);
  return (point[0] - start[0] - t * dx) ** 2 + (point[1] - start[1] - t * dy) ** 2;
}

function simplifyOpen(points: Point[], toleranceSquared: number): Point[] {
  const keep = new Set([0, points.length - 1]);
  const visit = (first: number, last: number) => {
    let furthest = -1, distance = toleranceSquared;
    for (let i = first + 1; i < last; i++) {
      const next = distanceSquared(points[i], points[first], points[last]);
      if (next > distance) { distance = next; furthest = i; }
    }
    if (furthest > 0) { keep.add(furthest); visit(first, furthest); visit(furthest, last); }
  };
  visit(0, points.length - 1);
  return points.filter((_, index) => keep.has(index));
}

// Counts distinct ring vertices; the GeoJSON closing coordinate is additional.
export function simplifyPolygon(ring: readonly (readonly number[])[], maxVertices = 60): PolygonGeometry {
  const points: Point[] = [];
  for (const coordinate of ring) {
    if (!Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) continue;
    const point: Point = [clamp(coordinate[0], -180, 180), clamp(coordinate[1], -90, 90)];
    if (!points.length || !same(points[points.length - 1], point)) points.push(point);
  }
  if (points.length > 1 && same(points[0], points[points.length - 1])) points.pop();
  if (points.length < 3) throw new Error('El polígono necesita al menos tres vértices.');
  const limit = Math.max(3, Math.floor(maxVertices));
  let simplified = points;
  if (points.length > limit) {
    // Duplicate the first point so Douglas-Peucker preserves both ends of the ring.
    const closed = [...points, points[0]];
    let low = 0, high = 360 ** 2;
    for (let i = 0; i < 32; i++) {
      const middle = (low + high) / 2;
      if (simplifyOpen(closed, middle).length - 1 > limit) low = middle;
      else high = middle;
    }
    simplified = simplifyOpen(closed, high).slice(0, -1);
    if (simplified.length < 3) simplified = points.filter((_, index) => index === 0 || index === Math.floor(points.length / 3) || index === Math.floor(2 * points.length / 3));
  }
  return { type: 'Polygon', coordinates: [[...simplified, simplified[0]]] };
}
