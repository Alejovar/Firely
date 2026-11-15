// PWA offline support (§12.5): service-worker registration and "guardar área para campo".
// Saving an area simply requests the endpoints the app needs for it; the service worker keeps each
// response (network-first), so the same views open later without signal.
import { API_URL, areaParams, type Area } from '../api/client';

const KEY = 'firely.offline.saved';

export interface SavedArea { label: string; areaKey: string; savedAt: string; from: string; to: string; ok: number; total: number }

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined); });
}

export const offlineSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

export function fieldUrls(area: Area, from: string, to: string): string[] {
  const a = areaParams(area).toString();
  const year = Number(to.slice(0, 4));
  const recentFrom = `${year - 1}-${to.slice(5, 7)}-01`;
  return [
    `/calendar?${a}&from=2001-01-01&to=${to}&metric=count&reference=median`,
    `/events?${a}&from=${from}&to=${to}&min_hotspots=3`,
    `/season?${a}`, `/analogs?${a}&date=${to}`, `/risk?${a}`, `/territory?${a}`,
    `/weekday?${a}`, `/night?${a}`, `/context?${a}&from=${from}&to=${to}`,
    `/hotspots.geojson?${a}&from=${recentFrom}&to=${to}&limit=5000`,
  ].map(path => `${API_URL}${path}`);
}

export async function saveAreaForField(label: string, areaKey: string, area: Area, from: string, to: string, onProgress?: (done: number, total: number) => void): Promise<SavedArea> {
  const urls = fieldUrls(area, from, to);
  let done = 0;
  let ok = 0;
  await Promise.all(urls.map(async url => {
    try { const r = await fetch(url); if (r.ok) ok += 1; } catch { /* counted as failed */ }
    done += 1; onProgress?.(done, urls.length);
  }));
  const saved: SavedArea = { label, areaKey, savedAt: new Date().toISOString(), from, to, ok, total: urls.length };
  try {
    const all = loadSavedAreas().filter(s => s.areaKey !== areaKey);
    localStorage.setItem(KEY, JSON.stringify([saved, ...all].slice(0, 10)));
  } catch { /* storage unavailable: the cache still works */ }
  return saved;
}

export function loadSavedAreas(): SavedArea[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedArea[]; } catch { return []; }
}
