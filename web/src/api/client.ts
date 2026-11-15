// Typed client for the Firely API (see api/openapi.yaml). All shapes below were taken from real responses.
import { configuredBackend } from '../mobile/backend';
import { fieldStore, canReadOffline } from '../mobile/fieldStore';
export const API_URL = configuredBackend();

export type Reference = 'median' | 'mean';
export type Metric = 'count' | 'frp';

/** One of the area selectors every endpoint accepts. */
export type Area =
  | { lat: number; lon: number; radius_km: number }
  | { admin: string }
  | { bbox: string }
  | { geometry: string }
  | { h3: string };

export interface Envelope {
  area?: Record<string, unknown>;
  methodology_version: string;
  data_cutoff: string;
  attribution: string;
  harmonization_uncertainty?: { years_estimated?: number[]; median_rel_error?: number } | null;
}

export interface CalendarRow {
  year: number;
  month: number;
  count_harm?: number;
  count_harm_lo?: number;
  count_harm_hi?: number;
  /** Harmonized count divided by the clear-sky fraction (capped). Only where cloud data exist (Coahuila); null elsewhere. */
  count_harm_cloudcorr?: number | null;
  frp_harm?: number;
  anomaly_ratio?: number;
  percentile?: number;
  return_period_years?: number;
  clear_frac?: number | null;
  is_estimated?: boolean;
  enso_phase?: string | null;
}
export interface CalendarResponse extends Envelope { mock?: boolean; reference?: Reference; rows: CalendarRow[] }

export interface DailyRow { date?: string; day?: number; count_harm?: number; frp_harm?: number | null }
export interface DailyResponse extends Partial<Envelope> { rows?: DailyRow[]; days?: DailyRow[] }

export interface SeasonRow { year: number; onset: string; peak: string; end: string; annual_count_harm: number; is_estimated: boolean }
export interface Trend { n: number; sen_days_per_decade: number | null; p_value: number | null }
export interface SeasonResponse extends Envelope {
  rows: SeasonRow[];
  trend: { onset: Trend; peak: Trend };
  trend_observed_only: { onset: Trend; peak: Trend };
  summary_es: string;
  method: string;
}

export interface AnalogYear { year: number; similarity: number; year_end_count_harm: number; is_estimated: boolean; oni_phase?: string | null }
export interface AnalogsResponse extends Envelope {
  date: string;
  current_count_harm: number;
  current_oni_phase?: string | null;
  analogs: AnalogYear[];
  estimated_analog_years: number[];
  projection: { p10: number; p50: number; p90: number } | null;
  confidence: 'low' | 'medium' | 'high' | string;
  method: string;
}

export interface ReturnPeriodResponse extends Envelope {
  year: number; month: number; count_harm: number | null; percentile: number | null;
  return_period_years: number | null; n_reference_years: number; method: string;
}

export interface WeekdayResponse extends Envelope {
  counts_monday_first: number[]; n_events: number; chi_square: number | null; p_value: number | null; summary_es: string; method: string;
}

export interface NightRow { year: number; night_detections: number; total_detections: number; night_ratio: number }
export interface NightResponse extends Envelope { rows: NightRow[]; method: string }

export interface ContextRow {
  year: number; month: number; oni: number | null; enso_phase: string | null;
  fwi_mean: number | null; fwi_anom: number | null; dc_anom: number | null; dmc_anom: number | null;
}
export interface ContextResponse extends Envelope { rows: ContextRow[]; coverage: string }

export interface FireEvent {
  event_id: string; start_date: string; end_date: string; duration_days: number; n_hotspots_harm: number;
  frp_total: number; area_approx_km2: number; night_ratio: number; burn_type: string | null;
  centroid_lat: number; centroid_lon: number; cells: string[]; rank: number;
}
export interface EventsResponse extends Envelope { rows: FireEvent[]; area_rank_basis?: string; area_approx_note?: string }

export interface ReportedRow {
  year: number; month: number; reported_fires: number | null; reported_area_ha: number | null;
  detected_hotspots_state_year: number | null; state_year_reported_data: boolean;
}
export interface ReportedResponse extends Envelope { state?: { code: string; name: string }; rows: ReportedRow[]; coverage: string }

export interface AdminCandidate { level: string; code: string; name: string; parent: string | null; country: string; bbox: [number, number, number, number] }
export interface AdminSearchResponse extends Envelope { candidates: AdminCandidate[] }

export interface AreaCandidate {
  label: string; kind?: string; country?: string; code?: string; parent?: string;
  bbox: [number, number, number, number] | string; score?: number;
}
export interface ResolvedIntent { place_text?: string; date_from?: string | null; date_to?: string | null; granularity?: string; lang?: string; source?: string }
export interface ResolveAreaResponse extends Partial<Envelope> { candidates: AreaCandidate[]; ambiguous: boolean; intent: ResolvedIntent }

export interface DescribeResponse { text: string; sources?: string[] }

export interface RecentFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{ type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: { frp_mw?: number | null; ts_utc?: string; platform?: string; confidence_h?: string } }>;
  data_cutoff?: string | null;
  attribution?: string;
}

export class ApiError extends Error {
  constructor(public status: number, public code?: string) { super(`API ${status}${code ? ` ${code}` : ''}`); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'backend_not_configured');
  const timeout = AbortSignal.timeout(20_000);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    if ((!init?.method || init.method === 'GET') && canReadOffline(path)) {
      const stored = await fieldStore.lookup(API_URL, path);
      if (init?.signal?.aborted) throw error;
      if (stored) {
        window.dispatchEvent(new CustomEvent('firely:field-response', { detail: { savedAt: stored.savedAt, label: stored.label } }));
        return stored.data as T;
      }
      throw new ApiError(0, 'offline_not_saved');
    }
    throw error;
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: { code?: string } | string } | null;
    throw new ApiError(response.status, typeof body?.detail === 'object' ? body.detail?.code : undefined);
  }
  return response.json() as Promise<T>;
}

export function areaParams(area: Area): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(area)) params.set(key, String(value));
  return params;
}

const withArea = (area: Area, extra: Record<string, string | number | undefined> = {}) => {
  const params = areaParams(area);
  for (const [key, value] of Object.entries(extra)) if (value !== undefined) params.set(key, String(value));
  return params;
};

export type BurnType = 'agricola' | 'forestal';
export const getCalendar = (area: Area, from: string, to: string, metric: Metric, reference: Reference, signal?: AbortSignal, burnType?: BurnType, cloudCorrected?: boolean) =>
  request<CalendarResponse>(`/calendar?${withArea(area, { from, to, metric, reference, burn_type: burnType, cloud_corrected: cloudCorrected ? 'true' : undefined })}`, { signal });

export type AnimationCountry = 'Mexico' | 'Argentina' | 'all';
/** Monthly harmonized activity per H3 cell for the 25-year animation. values[i][j] = month i, cell j. */
export interface AnimationFrames extends Envelope {
  months: string[];
  cells: string[];
  values: number[][];
  max: number;
  is_estimated_months: string[];
}
export const getAnimationFrames = (country: AnimationCountry, res = 4, signal?: AbortSignal) =>
  request<AnimationFrames>(`/animation/frames?${new URLSearchParams({ country, res: String(res) })}`, { signal });
export const getDaily = (area: Area, year: number, month: number, signal?: AbortSignal) =>
  request<DailyResponse | DailyRow[]>(`/calendar/daily?${withArea(area, { year, month })}`, { signal });
export const getSeason = (area: Area, signal?: AbortSignal) => request<SeasonResponse>(`/season?${withArea(area)}`, { signal });
export const getAnalogs = (area: Area, date: string, signal?: AbortSignal) =>
  request<AnalogsResponse>(`/analogs?${withArea(area, { date })}`, { signal });
export const getReturnPeriod = (area: Area, year: number, month: number, signal?: AbortSignal) =>
  request<ReturnPeriodResponse>(`/return-period?${withArea(area, { year, month })}`, { signal });
export const getWeekday = (area: Area, signal?: AbortSignal) => request<WeekdayResponse>(`/weekday?${withArea(area)}`, { signal });
export const getNight = (area: Area, signal?: AbortSignal) => request<NightResponse>(`/night?${withArea(area)}`, { signal });
export const getContext = (area: Area, from: string, to: string, signal?: AbortSignal) =>
  request<ContextResponse>(`/context?${withArea(area, { from, to })}`, { signal });
export const getEvents = (area: Area, from: string, to: string, minHotspots = 3, signal?: AbortSignal) =>
  request<EventsResponse>(`/events?${withArea(area, { from, to, min_hotspots: minHotspots })}`, { signal });
export const getReported = (area: Area, from: string, to: string, signal?: AbortSignal) =>
  request<ReportedResponse>(`/reported?${withArea(area, { from, to })}`, { signal });
export const searchAdmin = (q: string, signal?: AbortSignal) => request<AdminSearchResponse>(`/admin/search?q=${encodeURIComponent(q)}`, { signal });
export const getRecent = (area: Area, hours: 24 | 48, signal?: AbortSignal) =>
  request<RecentFeatureCollection>(`/recent?${withArea(area, { hours })}`, { signal });

export const resolveArea = (text: string, lang = 'es', signal?: AbortSignal) =>
  request<ResolveAreaResponse>('/resolve-area', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }), signal,
  });
export const describe = (kind: 'calendar' | 'chart', payload: unknown, lang = 'es', profile: 'brigadista' | 'cientifico' = 'brigadista', signal?: AbortSignal) =>
  request<DescribeResponse>('/describe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, payload, lang, profile }), signal,
  });

// ---- map layers and territory (backend contract: api/app/extra_routes.py) ----
export interface HotspotProps { date: string; sensor: 'MODIS' | 'VIIRS'; platform: string; frp_mw: number | null; confidence_h: string; daynight: 'D' | 'N' }
export interface HotspotsGeoJson extends Envelope {
  type: 'FeatureCollection';
  features: Array<{ type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: HotspotProps }>;
  /** true when the area/period has more points than `limit` (the strongest FRP are kept) */
  truncated: boolean;
  n_total: number;
}
export const getHotspotsGeoJson = (area: Area, from: string, to: string, limit = 20000, signal?: AbortSignal) =>
  request<HotspotsGeoJson>(`/hotspots.geojson?${withArea(area, { from, to, limit })}`, { signal });

export interface RecurrenceCell { h3: string; years_burned: number; last_fire_year: number | null }
export interface RecurrenceGeoJson extends Envelope {
  type: 'FeatureCollection';
  features: Array<{ type: 'Feature'; geometry: { type: 'Polygon'; coordinates: number[][][] }; properties: RecurrenceCell }>;
  n_years: number;
  max_years_burned: number;
}
export const getRecurrence = (area: Area, from: string, to: string, signal?: AbortSignal) =>
  request<RecurrenceGeoJson>(`/recurrence?${withArea(area, { from, to })}`, { signal });

export interface Locality { name: string; pop: number | null; lat: number; lon: number; dist_km?: number | null }
export interface LandcoverShare { biome: 'bosque' | 'matorral' | 'pastizal/sabana' | 'cultivo' | 'otros' | 'desconocido'; share: number }
export interface TerritoryResponse extends Envelope {
  area_km2: number;
  cells: number;
  admin: { country: string; state?: string | null; municipality?: string | null; source: string } | null;
  population_total: number | null;
  localities: Locality[];
  protected_areas: { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; geometry: unknown; properties: { name: string; category?: string | null } }> };
  landcover: LandcoverShare[];
}
export const getTerritory = (area: Area, signal?: AbortSignal) => request<TerritoryResponse>(`/territory?${withArea(area)}`, { signal });

export interface RiskComponent { key: string; label: string; value: number; weight: number; note: string }
export interface RiskResponse extends Envelope {
  index: number;
  level: 'baja' | 'media' | 'alta' | 'extrema';
  components: RiskComponent[];
  period: string;
  summary_es: string;
  method: string;
}
export const getRisk = (area: Area, signal?: AbortSignal) => request<RiskResponse>(`/risk?${withArea(area)}`, { signal });

export interface WatchRow { code: string; name: string; parent: string | null; country: string; ratio: number | null; count: number; percentile: number | null; text: string }
export interface WatchResponse extends Envelope { period: string; level: string; n_reviewed: number; rows: WatchRow[] }
export const getWatch = (level: 'mun' | 'ent' | 'adm1' | 'adm2' = 'mun', country = 'Mexico', top = 10, signal?: AbortSignal) =>
  request<WatchResponse>(`/watch?level=${level}&country=${encodeURIComponent(country)}&top=${top}`, { signal });

// ---- endpoints added after the review (api/app/weather_routes.py, pro_routes.py, reports_routes.py, drill_routes.py) ----
const postJson = <T,>(path: string, body: unknown, signal?: AbortSignal) =>
  request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });

export interface RiskWeights { anomaly: number; recurrence: number; exposure: number; season: number; fwi: number }
export interface WeightedRiskResponse extends RiskResponse { weights: RiskWeights; weights_custom: boolean; disclaimer?: string }
export const getRiskWeighted = (area: Area, weights?: Partial<RiskWeights>, signal?: AbortSignal) =>
  request<WeightedRiskResponse>(`/risk?${withArea(area, Object.fromEntries(Object.entries(weights ?? {}).map(([k, v]) => [`w_${k}`, v])))}`, { signal });

export interface WeatherRow {
  year: number; month: number; precip_mm_day: number | null; precip_anom_mm_day: number | null; temp_c: number | null;
  temp_anom_c: number | null; rh_pct: number | null; rh_anom_pct: number | null; wind_ms: number | null; wind_anom_ms: number | null;
  fire_anomaly_ratio: number | null;
}
export interface WeatherResponse extends Envelope {
  centroid: { lat: number; lon: number }; source: string; rows: WeatherRow[]; note: string; method: string;
  summary: { year: number; month: number; text: string; driest_since: number | null; driest_on_record: boolean } | null;
}
export const getWeather = (area: Area, from: string, to: string, year?: number, month?: number, signal?: AbortSignal) =>
  request<WeatherResponse>(`/weather?${withArea(area, { from, to, year, month })}`, { signal });

export interface SqlResponse extends Envelope { query: string; views: string[]; columns: string[]; rows: unknown[][]; n_rows: number; truncated: boolean; max_rows: number; note: string }
export const runSql = (query: string, signal?: AbortSignal) => postJson<SqlResponse>('/sql', { query }, signal);

export interface BulletinSection { heading: string; text: string; level?: string; index?: number; period?: string; items?: { name: string; text: string }[] }
export interface BulletinResponse extends Envelope { title: string; sections: BulletinSection[]; sources: string[]; generated_by: string; generated_at: string }
export const getBulletin = (area: Area, signal?: AbortSignal) => request<BulletinResponse>(`/bulletin?${withArea(area)}`, { signal });

export interface CapDraft { id: string; status: 'Exercise'; approval: string; severity: string; text: string; area_desc: string; created_at: string; approved_at: string | null; xml?: string }
export const createCapDraft = (area: Area & { areaDesc?: string }, text: string, severity: string, signal?: AbortSignal) =>
  postJson<Envelope & { draft: CapDraft; published: false }>('/cap/draft', { area, text, severity }, signal);
export const approveCapDraft = (id: string, signal?: AbortSignal) =>
  postJson<Envelope & { draft: CapDraft; published: false; note: string }>(`/cap/approve/${id}`, {}, signal);
export const listCapDrafts = (signal?: AbortSignal) => request<Envelope & { drafts: CapDraft[] }>('/cap/drafts', { signal });

export interface ReportRecord {
  state: string | null; municipality: string | null; year: number | null; month: number | null; fires: number | null;
  area_ha: number | null; cause: string | null; source_line: number | null; issues: string[]; needs_review: boolean;
}
export interface ReportExtractResponse {
  methodology_version: string; attribution: string; source: 'rules' | 'llm'; records: ReportRecord[];
  checks: { check: string; expected: number; computed: number; ok: boolean }[]; warning?: string | null;
  n_records: number; n_needs_review: number; all_checks_ok: boolean | null; csv: string; stored: false; note: string;
}
export const extractReport = (text: string, useLlm = true, signal?: AbortSignal) =>
  postJson<ReportExtractResponse>('/reports/extract', { text, use_llm: useLlm }, signal);

export interface DrillStage { key: string; title: string; situation: string; facts: string[]; question: string; daily?: { date: string; detections: number; night: number }[] }
export interface DrillResponse extends Envelope { event: FireEvent; n_events_in_area: number; stages: DrillStage[]; disclaimer: string; method: string }
export const getDrill = (area: Area, pick: 'largest' | 'longest' | 'recent' = 'largest', signal?: AbortSignal) =>
  request<DrillResponse>(`/drill?${withArea(area, { pick })}`, { signal });

export interface SpreadResponse extends Envelope {
  warning: string; hours: number; origin: { lat: number; lon: number }; wind: { speed_kmh: number; from_deg: number; source: string };
  direction: { toward_deg: number; toward_compass: string }; reach_km: number; half_angle_deg: number; method: string;
}
export interface WindLocalitiesResponse extends SpreadResponse {
  n_localities: number; localities: { name: string; country: string; pop: number | null; lat: number; lon: number; distance_km: number; bearing_deg: number; compass: string }[];
}
export const getSpread = (area: Area, hours = 24, signal?: AbortSignal) => request<SpreadResponse>(`/spread?${withArea(area, { hours })}`, { signal });
export const getWindLocalities = (area: Area, hours = 12, signal?: AbortSignal) =>
  request<WindLocalitiesResponse>(`/wind-localities?${withArea(area, { hours })}`, { signal });

// ---- risk forecast, priority cells, server subscriptions (api/app/forecast + priority + subscriptions_routes) ----
export interface ForecastDay { date: string; fwi_mean: number | null; fwi_max: number | null; n_grid: number; fwi_ltm: number | null; ratio_ltm: number | null; effis_class: string | null }
export interface RiskForecastResponse extends Envelope {
  centroid: { lat: number; lon: number }; source: string; forecast_run: string; stale: boolean; days: ForecastDay[];
  level: 'bajo' | 'normal' | 'alto' | 'muy alto' | string; fwi_week_mean: number | null; effis_class: string | null; month: number;
  climatology: { basis: 'longterm_mean' | 'history_percentile' | 'effis_absolute' | string; reference?: string; fwi_ltm?: number | null; ratio?: number | null; percentile?: number | null };
  summary_es: string; method: string; note?: string;
}
export const getRiskForecast = (area: Area, signal?: AbortSignal) => request<RiskForecastResponse>(`/risk/forecast?${withArea(area)}`, { signal });

export type PriorityComponents = Partial<Record<'anomaly' | 'recurrence' | 'exposure' | 'season' | 'fwi', number | null>>;
export interface PriorityCell { h3: string; index: number; level: string; components: PriorityComponents; current_count?: number | null; population_10km?: number | null }
export interface PriorityCellsResponse extends Envelope {
  type: 'FeatureCollection';
  features: Array<{ type: 'Feature'; geometry: { type: 'Polygon'; coordinates: number[][][] }; properties: PriorityCell }>;
  top10: PriorityCell[]; period: string; weights: RiskWeights; labels: Record<string, string>; summary_es: string; method: string; disclaimer?: string;
}
export const getPriorityCells = (area: Area, weights?: Partial<RiskWeights>, signal?: AbortSignal) =>
  request<PriorityCellsResponse>(`/priority/cells?${withArea(area, Object.fromEntries(Object.entries(weights ?? {}).map(([k, v]) => [`w_${k}`, v])))}`, { signal });

export interface ServerSubscription {
  id: string; created_at: string; name: string; area: Record<string, string | number>; area_cells: number; chat_id_masked: string | null;
  min_index: number; min_anomaly_ratio: number | null; lang: 'es' | 'en' | 'pt'; approved: boolean; approved_at: string | null;
}
export interface SubscriptionInput { name: string; area: Area; chat_id: number; min_index?: number; min_anomaly_ratio?: number; lang?: 'es' | 'en' | 'pt' }
export const listServerSubscriptions = (signal?: AbortSignal) => request<{ attribution: string; rows: ServerSubscription[] }>('/subscriptions', { signal });
export const createServerSubscription = (body: SubscriptionInput, signal?: AbortSignal) =>
  postJson<{ attribution: string; subscription: ServerSubscription; note: string }>('/subscriptions', body, signal);
export const deleteServerSubscription = (id: string, signal?: AbortSignal) =>
  request<{ deleted: string }>(`/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE', signal });
