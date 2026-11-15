import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Metric, Reference } from '../api/client';
import { buildHash, defaultState, parseHash, type AreaSel, type BurnFilter, type CalendarMode, type Page, type UrlState } from './hash';

export type Lang = 'es' | 'en' | 'pt';
export type Scheme = 'dark' | 'light';
export type LiveHours = 0 | 24 | 48;
/** Map layers (design: 'Capas'). hotspots = the month's harmonized points; recent = FIRMS NRT; goes = vision, no data yet. */
export interface Layers { hotspots: boolean; recent: boolean; goes: boolean; recurrence: boolean; spread: boolean; exposure: boolean }
export const DEFAULT_LAYERS: Layers = { hotspots: true, recent: false, goes: false, recurrence: false, spread: false, exposure: true };

interface AppContextValue extends UrlState {
  lang: Lang;
  scheme: Scheme;
  live: LiveHours;
  layers: Layers;
  /** ISO date of the day picked in the daily breakdown; the map shows only that day's points */
  selectedDay: string | null;
  setSelectedDay: (day: string | null) => void;
  /** second area for the side-by-side calendar comparison, null when off */
  compare: AreaSel | null;
  setLayer: (key: keyof Layers, on: boolean) => void;
  setCompare: (area: AreaSel | null) => void;
  setBurn: (burn: BurnFilter) => void;
  setLang: (lang: Lang) => void;
  toggleScheme: () => void;
  setLive: (hours: LiveHours) => void;
  navigate: (page: Page) => void;
  setArea: (area: AreaSel) => void;
  setRange: (from: string, to: string) => void;
  setMetric: (metric: Metric) => void;
  setReference: (reference: Reference) => void;
  setMode: (mode: CalendarMode) => void;
  setSelected: (selected: UrlState['selected']) => void;
  /** Apply several URL fields at once (e.g. area + dates from a natural-language search). */
  patch: (changes: Partial<UrlState>) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch { return fallback; }
}
function remember(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* private mode: keep going */ }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [url, setUrl] = useState<UrlState>(() => parseHash(window.location.hash));
  const [lang, setLangState] = useState<Lang>(() => stored('firely.lang', ['es', 'en', 'pt'] as const, 'es'));
  const [scheme, setScheme] = useState<Scheme>(() => stored('firely.scheme', ['dark', 'light'] as const, 'dark'));
  const [live, setLive] = useState<LiveHours>(0);
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [compare, setCompare] = useState<AreaSel | null>(null);

  // state -> hash
  useEffect(() => {
    const next = buildHash(url);
    if (next !== window.location.hash) window.history.replaceState(null, '', next);
  }, [url]);
  // hash -> state (back/forward, pasted links)
  useEffect(() => {
    const onHash = () => { setUrl((current) => (buildHash(current) === window.location.hash ? current : parseHash(window.location.hash, current))); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const patch = useCallback((changes: Partial<UrlState>) => setUrl((current) => ({ ...current, ...changes })), []);
  const value = useMemo<AppContextValue>(() => ({
    ...url, lang, scheme, live, layers, compare, selectedDay, setSelectedDay, patch,
    setLayer: (key, on) => setLayers((current) => ({ ...current, [key]: on })),
    setCompare,
    setBurn: (burn) => patch({ burn }),
    setLang: (next) => { setLangState(next); remember('firely.lang', next); },
    toggleScheme: () => setScheme((current) => { const next = current === 'dark' ? 'light' : 'dark'; remember('firely.scheme', next); return next; }),
    setLive,
    navigate: (page) => patch({ page }),
    setArea: (area) => patch({ area, selected: null }),
    setRange: (from, to) => patch({ from, to, selected: null }),
    setMetric: (metric) => patch({ metric }),
    setReference: (reference) => patch({ reference }),
    setMode: (mode) => patch({ mode }),
    setSelected: (selected) => { setSelectedDay(null); patch({ selected }); },
  }), [url, lang, scheme, live, layers, compare, selectedDay, patch]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppStateProvider>');
  return value;
}

export { defaultState };
