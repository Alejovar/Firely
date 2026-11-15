import { lazy, Suspense, useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Theme } from '@astryxdesign/core/theme';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { AppStateProvider, useApp, type Lang } from './state/AppState';
import { useNav } from './i18n';
import { themes } from './astryx-themes';
import TopBarTools from './components/topbar/TopBarTools';
import { onSubscriptionsChanged } from './lib/alerts';
import { listServerSubscriptions } from './api/client';
import { Box, Inline } from './ui/kit';
import type { Page } from './state/hash';

const s = stylex.create({
  app: {
    display: 'grid', gridTemplateColumns: { default: '76px minmax(0, 1fr)', '@media (max-width: 720px)': 'minmax(0, 1fr)' },
    gridTemplateRows: { default: 'minmax(0, 1fr)', '@media (max-width: 720px)': 'auto auto minmax(0, 1fr)' },
    height: { default: '100dvh', '@media (max-width: 720px)': 'auto' }, minHeight: '100dvh',
    backgroundColor: 'var(--color-background-body)', color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums',
  },
  rail: {
    display: 'flex', flexDirection: { default: 'column', '@media (max-width: 720px)': 'row' }, alignItems: { default: 'stretch', '@media (max-width: 720px)': 'center' }, gap: '2px',
    padding: { default: '14px 6px', '@media (max-width: 720px)': '6px 8px' }, overflowX: { default: 'visible', '@media (max-width: 720px)': 'auto' }, overflowY: { default: 'auto', '@media (max-width: 720px)': 'hidden' },
    borderRightWidth: { default: '1px', '@media (max-width: 720px)': 0 }, borderBottomWidth: { default: 0, '@media (max-width: 720px)': '1px' }, borderStyle: 'solid', borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)', position: { default: 'static', '@media (max-width: 720px)': 'sticky' }, top: 0, zIndex: 20, order: { default: 0, '@media (max-width: 720px)': 1 },
  },
  logo: { alignSelf: 'center', width: '34px', height: '34px', display: { default: 'block', '@media (max-width: 720px)': 'none' }, marginBottom: '14px', flexShrink: 0 },
  navItem: {
    padding: '9px 4px', borderRadius: '4px', borderWidth: 0, backgroundColor: { default: 'transparent', ':hover': 'var(--color-background-muted)' },
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' }, fontFamily: 'inherit', fontSize: '12px', fontWeight: 500, lineHeight: 1.25,
    textAlign: 'center', cursor: 'pointer', flexShrink: 0, whiteSpace: { default: 'normal', '@media (max-width: 720px)': 'nowrap' }, paddingInline: { default: '4px', '@media (max-width: 720px)': '10px' },
    ':focus-visible': { outline: '2px solid var(--color-accent)', outlineOffset: '-2px' },
  },
  navMinor: { fontSize: '11.5px', color: { default: 'var(--color-text-disabled)', ':hover': 'var(--color-text-primary)' } },
  navOn: { backgroundColor: 'var(--color-background-muted)', color: { default: 'var(--color-text-primary)', ':hover': 'var(--color-text-primary)' }, boxShadow: { default: 'inset 2px 0 0 var(--color-accent)', '@media (max-width: 720px)': 'inset 0 -2px 0 var(--color-accent)' } },
  divider: { height: { default: '1px', '@media (max-width: 720px)': '18px' }, width: { default: 'auto', '@media (max-width: 720px)': '1px' }, flexShrink: 0, backgroundColor: 'var(--color-border)', margin: { default: '10px 6px', '@media (max-width: 720px)': '0 4px' } },
  body: { display: { default: 'grid', '@media (max-width: 720px)': 'contents' }, gridTemplateRows: '68px minmax(0, 1fr)', minWidth: 0, minHeight: 0 },
  header: {
    display: 'flex', alignItems: 'center', gap: '14px', paddingInline: { default: '18px', '@media (max-width: 720px)': '16px' }, paddingBlock: { default: 0, '@media (max-width: 720px)': '10px' },
    borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--color-border)', backgroundColor: 'var(--color-background-surface)', minWidth: 0, order: 0,
  },
  brand: { display: 'flex', flexDirection: 'column', lineHeight: 1.05, flexShrink: 0, gap: '3px', cursor: 'pointer', borderWidth: 0, padding: 0, backgroundColor: 'transparent', color: 'inherit', textAlign: 'left', fontFamily: 'inherit' },
  brandName: { fontFamily: 'var(--font-family-heading)', fontWeight: 600, fontSize: '21px', fontVariationSettings: '"opsz" 32' },
  brandSub: { fontSize: '11.5px', color: 'var(--color-text-secondary)' },
  center: { flexGrow: 1, minWidth: 0, maxWidth: '900px', display: { default: 'flex', '@media (max-width: 720px)': 'none' } },
  end: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 },
  alerts: {
    display: { default: 'flex', '@media (max-width: 720px)': 'none' }, alignItems: 'center', gap: '6px', height: '32px', paddingInline: '10px', borderWidth: '1px', borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)', borderRadius: '6px', backgroundColor: 'transparent', color: 'var(--color-text-primary)', fontFamily: 'inherit', fontSize: '13px', cursor: 'pointer',
    ':focus-visible': { outline: '2px solid var(--color-accent)' },
  },
  count: { minWidth: '18px', height: '18px', borderRadius: '9px', backgroundColor: 'var(--color-accent)', color: 'var(--color-on-accent)', fontWeight: 700, fontSize: '11px', display: 'grid', placeItems: 'center', paddingInline: '4px' },
  langs: { display: 'flex', alignItems: 'center', gap: '2px', height: '32px', lineHeight: 1 },
  lang: { borderWidth: 0, borderBottomWidth: '2px', borderBottomStyle: 'solid', borderBottomColor: 'transparent', backgroundColor: 'transparent', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 500, color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' }, paddingInline: '5px', paddingBlock: 0, lineHeight: 1, height: '26px', cursor: 'pointer', ':focus-visible': { outline: '2px solid var(--color-accent)' } },
  langOn: { color: 'var(--color-text-primary)', borderBottomColor: 'var(--color-accent)' },
  theme: { width: '32px', height: '32px', borderRadius: '6px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-emphasized)', backgroundColor: 'transparent', color: 'var(--color-text-primary)', display: 'grid', placeItems: 'center', cursor: 'pointer', ':focus-visible': { outline: '2px solid var(--color-accent)' } },
  main: { order: 2, minWidth: 0, minHeight: 0, overflowY: { default: 'auto', '@media (max-width: 720px)': 'visible' }, overflowX: 'hidden' },
  fallback: { padding: '24px' },
});

const Explorer = lazy(() => import('./pages/Explorer'));
const Assistant = lazy(() => import('./pages/Assistant'));
const Method = lazy(() => import('./pages/Method'));
const History = lazy(() => import('./pages/History'));
const Platform = lazy(() => import('./pages/Platform'));
const Ficha = lazy(() => import('./pages/Ficha'));
const WidgetDoc = lazy(() => import('./pages/WidgetDoc'));

/** Firely mark: an H3 cell (the unit of analysis) in ember, a flame cut out of it, Gotita's water drop at its core
 *  and a satellite on its orbit. Theme tokens, so it follows light and dark mode; public/icon.svg is the favicon. */
function Logo() {
  return <svg {...stylex.props(s.logo)} viewBox="0 0 512 512" aria-hidden="true">
    <path d="M256 70 L417 163 Q429 170 429 184 L429 328 Q429 342 417 349 L270 434 Q256 442 242 434 L95 349 Q83 342 83 328 L83 184 Q83 170 95 163 L242 78 Q249 74 256 70 Z" fill="var(--color-accent)" />
    <path d="M256 140 C300 200 344 236 334 310 C326 368 292 398 256 398 C220 398 186 368 178 310 C172 262 204 236 220 196 C228 232 242 250 258 254 C248 214 240 178 256 140 Z" fill="var(--color-background-surface)" />
    <path d="M256 300 C276 322 288 338 284 358 C280 376 268 386 256 386 C244 386 232 376 228 358 C225 342 238 326 256 300 Z" fill="var(--color-data-categorical-blue)" />
    <circle cx="414" cy="92" r="26" fill="var(--color-text-primary)" />
    <path d="M352 64 A72 72 0 0 1 444 154" fill="none" stroke="var(--color-text-primary)" strokeWidth="10" strokeLinecap="round" opacity=".55" />
  </svg>;
}

function useAlertCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => { listServerSubscriptions().then(r => { if (alive) setCount(r.rows.length); }).catch(() => { if (alive) setCount(0); }); };
    refresh(); const off = onSubscriptionsChanged(refresh);
    return () => { alive = false; off(); };
  }, []);
  return count;
}

function Shell() {
  const app = useApp();
  const t = useNav(app.lang);
  const page = app.page;
  const alerts = useAlertCount();
  const item = (key: Page, label: string, minor = false) => (
    <button key={key} type="button" aria-current={page === key ? 'page' : undefined} onClick={() => app.navigate(key)} {...stylex.props(s.navItem, minor && s.navMinor, page === key && s.navOn)}>{label}</button>
  );
  return (
    <Box xs={s.app}>
      <Box as="nav" aria-label={t.main} xs={s.rail}>
        <Logo />
        {item('explorar', t.explore)}{item('asistente', t.assistant)}{item('metodo', t.method)}{item('plataforma', t.platform)}{item('historia', t.history)}
        <Inline xs={s.divider} aria-hidden="true" />
        {item('ficha', t.sheet, true)}{item('widget', t.widget, true)}
      </Box>
      <Box xs={s.body}>
        <Box as="header" xs={s.header}>
          <button type="button" onClick={() => app.navigate('explorar')} {...stylex.props(s.brand)} aria-label="Firely">
            <Inline xs={s.brandName}>Firely</Inline>
            <Inline xs={s.brandSub}>{t.tagline}</Inline>
          </button>
          <Box xs={s.center}>{page === 'explorar' && <TopBarTools />}</Box>
          <Box xs={s.end}>
            <button type="button" onClick={() => app.navigate('plataforma')} {...stylex.props(s.alerts)}>{app.lang === 'en' ? 'Alerts' : 'Alertas'}{alerts > 0 && <Inline xs={s.count}>{alerts}</Inline>}</button>
            <Box role="radiogroup" aria-label={t.language} xs={s.langs}>
              {(['es', 'en', 'pt'] as Lang[]).map(l => <button key={l} type="button" role="radio" aria-checked={app.lang === l} onClick={() => app.setLang(l)} {...stylex.props(s.lang, app.lang === l && s.langOn)}>{l.toUpperCase()}</button>)}
            </Box>
            <button type="button" onClick={app.toggleScheme} title={app.scheme === 'dark' ? t.light : t.dark} aria-label={app.scheme === 'dark' ? t.light : t.dark} {...stylex.props(s.theme)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" /><path d="M8 2.5a5.5 5.5 0 010 11z" fill="currentColor" /></svg>
            </button>
          </Box>
        </Box>
        <Box as="main" xs={s.main}>
          <Suspense fallback={<Box xs={s.fallback}><Skeleton width="100%" height="60vh" /></Box>}>
            {page === 'explorar' && <Explorer />}
            {page === 'asistente' && <Assistant />}
            {page === 'metodo' && <Method />}
            {page === 'historia' && <History />}
            {page === 'plataforma' && <Platform />}
            {page === 'ficha' && <Ficha />}
            {page === 'widget' && <WidgetDoc />}
          </Suspense>
        </Box>
      </Box>
    </Box>
  );
}

function ThemedShell() {
  const { scheme } = useApp();
  useEffect(() => { document.documentElement.dataset.theme = scheme; document.documentElement.style.backgroundColor = scheme === 'dark' ? '#1a1f1c' : '#f4f6f1'; }, [scheme]);
  return <Theme theme={themes.firely} mode={scheme}><ShellRoot /></Theme>;
}
function ShellRoot() { return <Shell />; }

export default function App() {
  return <AppStateProvider><ThemedShell /></AppStateProvider>;
}
