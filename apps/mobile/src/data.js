import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../../../packages/contracts/api-client';

export { api };
export const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const DEFAULT_AREA = { label: 'Sierra de Arteaga, Coahuila', query: { bbox: '-100.9,25.2,-100.2,25.7' }, bbox: [-100.9, 25.2, -100.2, 25.7] };
export const DEFAULT_FILTERS = { from: '2001-01-01', to: localToday(), metric: 'count', reference: 'median', mode: 'count' };

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const fmt = value => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(value) : '—';
export const metricValue = (row, metric) => row?.[metric === 'frp' ? 'frp_harm' : 'count_harm'];
export const periodLabel = row => row ? `${months[row.month - 1]} ${row.year}` : 'Sin periodo disponible';
export function calendarPath(area, filters) {
  const params = api.areaParams(area.query);
  for (const key of ['from', 'to', 'metric', 'reference']) params.set(key, filters[key]);
  return `/calendar?${params}`;
}
export function csvUrl(area, filters) {
  const params = api.areaParams(area.query);
  params.set('from', filters.from); params.set('to', filters.to);
  return `${api.API_URL}/hotspots.csv?${params}`;
}
export function errorMessage(error) {
  if (error?.code === 'firms_map_key_missing') return 'La capa reciente necesita una llave FIRMS configurada en el servidor.';
  if (error?.code === 'area_data_missing') return 'Faltan los archivos geográficos del área en el servidor.';
  if (error?.status === 422) return 'La API no admite esta consulta. Revisa el área, las fechas o la cobertura de este análisis.';
  if (error?.status === 503) return 'El servicio o los datos necesarios no están disponibles en el servidor.';
  if (error?.status) return `No se pudo completar la consulta (HTTP ${error.status}).`;
  return 'No se pudo conectar con la API. Comprueba el servidor y el túnel USB.';
}
export function candidateArea(candidate, administrative = false) {
  const bbox = typeof candidate.bbox === 'string' ? candidate.bbox.split(',').map(Number) : candidate.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3] || bbox[0] < -180 || bbox[2] > 180 || bbox[1] < -90 || bbox[3] > 90) throw new Error('La API no devolvió un área geográfica válida.');
  return { label: candidate.label || [candidate.name, candidate.parent].filter(Boolean).join(', '), bbox, query: administrative ? { admin: candidate.code } : { bbox: bbox.join(',') } };
}
export function useResource(key, load) {
  const loader = useRef(load);
  loader.current = load;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ key: null, loading: true, data: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    const request = loader.current;
    setState({ key, loading: true, data: null, error: null });
    Promise.resolve().then(() => request(controller.signal)).then(data => {
      if (!controller.signal.aborted) setState({ key, loading: false, data, error: null });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ key, loading: false, data: null, error });
    });
    return () => controller.abort();
  }, [key, revision]);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  return { ...(state.key === key ? state : { loading: true, data: null, error: null }), refresh };
}
