import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Metric, Reference } from '../api/client';
import { buildHash, defaultState, parseHash, type AreaSel, type CalendarMode, type Page, type UrlState } from './hash';

export type Lang = 'es' | 'en' | 'pt';
export type Scheme = 'dark' | 'light';
export type LiveHours = 0 | 24 | 48;

interface AppContextValue extends UrlState {
  lang: Lang;
  scheme: Scheme;
  live: LiveHours;
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
  const previousPage = useRef(url.page);
  const externalNavigation = useRef(false);

  // state -> hash
  useEffect(() => {
    const next = buildHash(url);
    if (next !== window.location.hash) {
      // Page changes need history entries for Android/browser Back. Filter changes
      // only replace the current entry, so Back does not visit every slider change.
      if (!externalNavigation.current && previousPage.current !== url.page) window.history.pushState(null, '', next);
      else window.history.replaceState(null, '', next);
    }
    previousPage.current = url.page;
    externalNavigation.current = false;
  }, [url]);
  // hash -> state (back/forward, pasted links)
  useEffect(() => {
    // replaceState/pushState do not emit hashchange; no suppression flag is needed.
    const onHash = () => {
      // Hash changes and Back/Forward already have a history entry: canonicalize
      // that entry rather than adding a duplicate page on top of it.
      const hash = window.location.hash;
      externalNavigation.current = true;
      setUrl((current) => parseHash(hash, current));
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const patch = useCallback((changes: Partial<UrlState>) => setUrl((current) => ({ ...current, ...changes })), []);
  const value = useMemo<AppContextValue>(() => ({
    ...url, lang, scheme, live, patch,
    setLang: (next) => { setLangState(next); remember('firely.lang', next); },
    toggleScheme: () => setScheme((current) => { const next = current === 'dark' ? 'light' : 'dark'; remember('firely.scheme', next); return next; }),
    setLive,
    navigate: (page) => patch({ page }),
    setArea: (area) => patch({ area, selected: null }),
    setRange: (from, to) => patch({ from, to, selected: null }),
    setMetric: (metric) => patch({ metric }),
    setReference: (reference) => patch({ reference }),
    setMode: (mode) => patch({ mode }),
    setSelected: (selected) => patch({ selected }),
  }), [url, lang, scheme, live, patch]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppStateProvider>');
  return value;
}

export { defaultState };
