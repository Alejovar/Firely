// Shareable URL state: #/explorar?area=bbox:-100.9,25.2,-100.2,25.7&label=...&from=2001-01-01&to=2026-11-14&metric=count
import type { Area, Metric, Reference } from '../api/client';

export type Page = 'explorar' | 'asistente' | 'metodo' | 'historia' | 'plataforma' | 'ficha' | 'widget';
export type CalendarMode = 'count' | 'anomaly';
export const PAGES: Page[] = ['explorar', 'asistente', 'metodo', 'historia', 'plataforma', 'ficha', 'widget'];
export type BurnFilter = 'all' | 'agricola' | 'forestal';

export interface AreaSel {
  label: string;
  area: Area;
  /** [west, south, east, north] when known, used to fit the map. */
  bbox?: [number, number, number, number];
  kind: 'bbox' | 'point' | 'drawn' | 'admin';
}

export interface UrlState {
  page: Page;
  area: AreaSel;
  from: string;
  to: string;
  metric: Metric;
  reference: Reference;
  mode: CalendarMode;
  /** land-cover proxy filter: agricola = cropland biome, forestal = forest + shrub biomes */
  burn: BurnFilter;
  selected: { year: number; month: number } | null;
}

export const DEFAULT_AREA: AreaSel = {
  label: 'Sierra de Arteaga, Coahuila',
  kind: 'bbox',
  area: { bbox: '-100.9,25.2,-100.2,25.7' },
  bbox: [-100.9, 25.2, -100.2, 25.7],
};

export function defaultState(today = new Date()): UrlState {
  return { page: 'explorar', area: DEFAULT_AREA, from: '2001-01-01', to: today.toISOString().slice(0, 10), metric: 'count', reference: 'median', mode: 'count', burn: 'all', selected: null };
}

const MAX_GEOMETRY_IN_URL = 1800;

export function encodeArea(sel: AreaSel): string | null {
  const a = sel.area;
  if ('bbox' in a) return `bbox:${a.bbox}`;
  if ('lat' in a) return `pt:${a.lat},${a.lon},${a.radius_km}`;
  if ('admin' in a) return `admin:${a.admin}`;
  if ('geometry' in a) return a.geometry.length <= MAX_GEOMETRY_IN_URL ? `geo:${a.geometry}` : null;
  if ('h3' in a) return `h3:${a.h3}`;
  return null;
}

export function decodeArea(text: string, label: string): AreaSel | null {
  const at = text.indexOf(':');
  if (at < 0) return null;
  const kind = text.slice(0, at);
  const value = text.slice(at + 1);
  const nums = (s: string) => s.split(',').map(Number);
  if (kind === 'bbox') {
    const n = nums(value);
    if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return null;
    return { label, kind: 'bbox', area: { bbox: value }, bbox: n as [number, number, number, number] };
  }
  if (kind === 'pt') {
    const [lat, lon, radius] = nums(value);
    if (![lat, lon, radius].every(Number.isFinite)) return null;
    return { label, kind: 'point', area: { lat, lon, radius_km: radius } };
  }
  if (kind === 'admin' && value) return { label, kind: 'admin', area: { admin: value } };
  if (kind === 'h3' && value) return { label, kind: 'bbox', area: { h3: value } };
  if (kind === 'geo') {
    try { JSON.parse(value); } catch { return null; }
    return { label, kind: 'drawn', area: { geometry: value } };
  }
  return null;
}

export function buildHash(state: UrlState): string {
  const params = new URLSearchParams();
  const area = encodeArea(state.area);
  if (area) { params.set('area', area); params.set('label', state.area.label); }
  params.set('from', state.from);
  params.set('to', state.to);
  if (state.metric !== 'count') params.set('metric', state.metric);
  if (state.reference !== 'median') params.set('ref', state.reference);
  if (state.mode !== 'count') params.set('mode', state.mode);
  if (state.burn !== 'all') params.set('burn', state.burn);
  if (state.selected) params.set('sel', `${state.selected.year}-${state.selected.month}`);
  return `#/${state.page}?${params}`;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function parseHash(hash: string, fallback: UrlState = defaultState()): UrlState {
  const match = /^#\/?([a-z]*)\??(.*)$/.exec(hash);
  if (!match) return fallback;
  const page = (PAGES as string[]).includes(match[1]) ? (match[1] as Page) : fallback.page;
  const params = new URLSearchParams(match[2]);
  const decoded = params.get('area') ? decodeArea(params.get('area')!, params.get('label') || fallback.area.label) : null;
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const sel = /^(\d{4})-(\d{1,2})$/.exec(params.get('sel') ?? '');
  const metric = params.get('metric') === 'frp' ? 'frp' : 'count';
  const mode = params.get('mode') === 'anomaly' ? 'anomaly' : 'count';
  return {
    page,
    area: decoded ?? fallback.area,
    from: ISO.test(from) ? from : fallback.from,
    to: ISO.test(to) ? to : fallback.to,
    metric,
    reference: params.get('ref') === 'mean' ? 'mean' : 'median',
    mode,
    burn: params.get('burn') === 'agricola' ? 'agricola' : params.get('burn') === 'forestal' ? 'forestal' : 'all',
    selected: sel && Number(sel[2]) >= 1 && Number(sel[2]) <= 12 ? { year: Number(sel[1]), month: Number(sel[2]) } : null,
  };
}
