import type { UrlState } from '../state/hash';
import { type FieldPack, type FieldStore, fieldStore, queryKey } from './fieldStore';

export function fieldQueries(selection: UrlState): string[] {
  const { from, to, metric, reference, burn, area, selected } = selection;
  const path = (endpoint: string, extra: Record<string, string | number | undefined> = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...area.area, ...extra })) if (value !== undefined) params.set(key, String(value));
    return queryKey(`${endpoint}?${params}`);
  };
  const calendar = { from, to, metric, reference, burn_type: burn === 'all' ? undefined : burn };
  // Both variants are used by the current main frontend. Other filters require a new download.
  const paths = [path('/calendar', { ...calendar, cloud_corrected: 'true' }), path('/calendar', calendar),
    path('/season'), path('/analogs', { date: to }), path('/events', { from, to, min_hotspots: 3 }),
    path('/weekday'), path('/night'), path('/territory')];
  // Context queries are limited to five years in the current API.
  if (Number(to.slice(0, 4)) - Number(from.slice(0, 4)) <= 4) paths.push(path('/context', { from, to }));
  if (selected) {
    paths.push(path('/calendar/daily', { year: selected.year, month: selected.month }));
    paths.push(path('/return-period', { year: selected.year, month: selected.month }));
  }
  return [...new Set(paths)];
}

export async function downloadFieldPack(backend: string, selection: UrlState, signal: AbortSignal,
  progress: (done: number, total: number) => void, store: FieldStore = fieldStore): Promise<FieldPack> {
  if (!backend) throw new Error('Configura primero el servidor.');
  const paths = fieldQueries(selection);
  const pack: FieldPack = { version: 1, id: crypto.randomUUID(), backend, savedAt: new Date().toISOString(),
    selection: structuredClone(selection), resources: [], unavailable: [], bytes: 0,
    methodologyVersion: '', dataCutoff: '', attribution: '' };
  for (const [index, path] of paths.entries()) {
    signal.throwIfAborted();
    try {
      const response = await fetch(`${backend}${path}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      pack.bytes += new Blob([text]).size;
      if (pack.bytes > 19 * 1024 * 1024) throw new Error('La descarga supera el límite de tamaño. Reduce el periodo.');
      const data = JSON.parse(text);
      if (!data || data.mock === true) throw new Error('No se pueden guardar respuestas simuladas.');
      if (path.startsWith('/calendar?')) {
        if (!Array.isArray(data.rows) || !data.methodology_version || !data.data_cutoff || !data.attribution) throw new Error('El calendario no incluye datos y procedencia válidos.');
        if (pack.methodologyVersion && (data.methodology_version !== pack.methodologyVersion || data.data_cutoff !== pack.dataCutoff)) throw new Error('El calendario cambió durante la descarga. Vuelve a intentarlo.');
        pack.methodologyVersion = data.methodology_version;
        pack.dataCutoff = data.data_cutoff;
        pack.attribution = data.attribution;
      } else if (!data.methodology_version || data.methodology_version !== pack.methodologyVersion || data.data_cutoff !== pack.dataCutoff) {
        throw new Error('La procedencia no coincide con el calendario descargado.');
      }
      pack.resources.push({ path, data });
    } catch (error) {
      signal.throwIfAborted();
      // The two calendars are required; a failed update leaves the old pack intact.
      if (index < 2 || pack.bytes > 19 * 1024 * 1024) throw error;
      pack.unavailable.push(path);
    }
    progress(index + 1, paths.length);
  }
  signal.throwIfAborted();
  await store.save(pack);
  return pack;
}
