export const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export type Reference = 'median' | 'mean';
export type Metric = 'count' | 'frp';
export type Area =
  | { lat: number; lon: number; radius_km: number }
  | { admin: string }
  | { bbox: string }
  | { geometry: string };

export interface Envelope {
  area?: Record<string, unknown>;
  methodology_version: string;
  data_cutoff: string;
  attribution: string;
  harmonization_uncertainty?: { years_estimated?: number[]; median_rel_error?: number };
}

export interface CalendarRow {
  year: number;
  month: number;
  count_harm?: number;
  frp_harm?: number;
  count_harm_lo?: number;
  count_harm_hi?: number;
  anomaly_ratio?: number;
  percentile?: number;
  return_period_years?: number;
  clear_frac?: number;
  is_estimated?: boolean;
  enso_phase?: string;
}

export interface CalendarResponse extends Envelope {
  mock?: boolean;
  reference?: Reference;
  rows: CalendarRow[];
}

export interface DailyRow {
  date?: string;
  day?: number;
  count_harm?: number;
  frp_harm?: number;
}

export interface DailyResponse extends Partial<Envelope> {
  rows?: DailyRow[];
  days?: DailyRow[];
}

export interface ResolveAreaResponse extends Partial<Envelope> {
  area?: Record<string, unknown>;
  candidates: AreaCandidate[];
  ambiguous: boolean;
  intent: ResolvedIntent;
}

export interface ResolvedIntent {
  place_text?: string;
  date_from?: string | null;
  date_to?: string | null;
  granularity?: string;
  lang?: string;
  source?: string;
}

export interface AreaCandidate {
  label: string;
  kind?: string;
  country?: string;
  code?: string;
  parent?: string;
  bbox: [number, number, number, number] | string;
  score?: number;
}

export interface RecentFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{ type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: { frp_mw?: number | null; ts_utc?: string } }>;
  data_cutoff?: string | null;
  attribution?: string;
}

export class ApiError extends Error {
  constructor(public status: number, public code?: string) { super(`API ${status}`); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: { code?: string } } | null;
    throw new ApiError(response.status, body?.detail?.code);
  }
  return response.json() as Promise<T>;
}

function areaParams(area: Area): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(area)) params.set(key, String(value));
  return params;
}

export function getCalendar(area: Area, from: string, to: string, metric: Metric, reference: Reference, signal?: AbortSignal) {
  const params = areaParams(area);
  params.set('from', from);
  params.set('to', to);
  params.set('metric', metric);
  params.set('reference', reference);
  return request<CalendarResponse>(`/calendar?${params}`, { signal });
}

export function getDaily(area: Area, year: number, month: number, signal?: AbortSignal) {
  const params = areaParams(area);
  params.set('year', String(year));
  params.set('month', String(month));
  return request<DailyResponse | DailyRow[]>(`/calendar/daily?${params}`, { signal });
}

export function getRecent(area: Area, hours: 24 | 48, signal?: AbortSignal) {
  const params = areaParams(area);
  params.set('hours', String(hours));
  return request<RecentFeatureCollection>(`/recent?${params}`, { signal });
}

export function resolveArea(text: string, lang = 'es', signal?: AbortSignal) {
  return request<ResolveAreaResponse>('/resolve-area', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang }),
    signal,
  });
}
