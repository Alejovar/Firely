import type { AreaSel } from '../state/hash';
export const frpRamp = ['var(--color-data-neutral)', 'var(--color-data-yellow-5)', 'var(--color-data-yellow-4)', 'var(--color-data-yellow-3)', 'var(--color-data-yellow-1)'];
export function hotspotPeriod(selected: { year: number; month: number } | null, from: string, to: string): [string, string] {
  if (!selected) { const year = to.slice(0, 4), month = to.slice(5, 7); return [`${year}-${month}-01`, to]; }
  const start = `${selected.year}-${String(selected.month).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(selected.year, selected.month, 0)).toISOString().slice(0, 10);
  return [start < from ? from : start, end > to ? to : end];
}
export function areaGeometry(sel: AreaSel): GeoJSON.Geometry | null {
  if ('geometry' in sel.area) { try { return JSON.parse(sel.area.geometry) as GeoJSON.Geometry; } catch { return null; } }
  if ('lat' in sel.area) {
    const { lat, lon, radius_km: radius } = sel.area; const ring: [number, number][] = [];
    for (let i = 0; i <= 64; i++) { const angle = 2 * Math.PI * i / 64; ring.push([lon + radius / (111.32 * Math.max(0.1, Math.cos(lat * Math.PI / 180))) * Math.cos(angle), lat + radius / 111.32 * Math.sin(angle)]); }
    return { type: 'Polygon', coordinates: [ring] };
  }
  const b = sel.bbox ?? ('bbox' in sel.area ? sel.area.bbox.split(',').map(Number) as [number, number, number, number] : null);
  if (!b || b.some(n => !Number.isFinite(n))) return null;
  return { type: 'Polygon', coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] };
}
export function geometryBbox(g: GeoJSON.Geometry | null): [number, number, number, number] | null {
  if (!g || g.type !== 'Polygon') return null;
  const p = g.coordinates.flat(); return [Math.min(...p.map(x => x[0])), Math.min(...p.map(x => x[1])), Math.max(...p.map(x => x[0])), Math.max(...p.map(x => x[1]))];
}
