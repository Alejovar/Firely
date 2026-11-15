import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { resolveArea, searchAdmin, ApiError, type AreaCandidate, type ResolvedIntent } from '../api/client';
import { useApp } from '../state/AppState';
import { candidateArea, intentDates } from '../lib/searchArea';
import { DEFAULT_AREA, type AreaSel } from '../state/hash';
import { monthShort, nav } from '../i18n';
import { Box, Inline } from '../ui/kit';

type SpeechResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechInstance = { lang: string; onresult: ((event: SpeechResult) => void) | null; onerror: (() => void) | null; onend?: (() => void) | null; start: () => void };
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechInstance; webkitSpeechRecognition?: new () => SpeechInstance };

const s = stylex.create({
  wrap: { position: 'relative', flexGrow: 1, minWidth: 0 },
  field: {
    display: 'flex', alignItems: 'center', gap: '10px', height: '44px', padding: '0 6px 0 14px', borderWidth: '1px', borderStyle: 'solid',
    borderColor: { default: 'var(--color-border-emphasized)', ':focus-within': 'var(--color-text-secondary)' }, borderRadius: '6px', backgroundColor: 'var(--color-background-body)', minWidth: 0,
  },
  icon: { flexShrink: 0, color: 'var(--color-text-secondary)' },
  input: { flexGrow: 1, flexShrink: 1, width: '6rem', minWidth: '5rem', borderWidth: 0, outline: 'none', backgroundColor: 'transparent', color: 'var(--color-text-primary)', fontFamily: 'inherit', fontSize: '15px', '::placeholder': { color: 'var(--color-text-secondary)' }, '::-webkit-search-cancel-button': { display: 'none' } },
  chips: { flexShrink: 1, display: { default: 'flex', '@media (max-width: 1180px)': 'none' }, gap: '5px', minWidth: 0, overflow: 'hidden' },
  chip: {
    padding: '3px 7px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', borderRadius: '4px', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 500,
    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '15rem', backgroundColor: 'transparent', cursor: 'pointer',
    ':hover': { color: 'var(--color-text-primary)' }, ':focus-visible': { outline: '2px solid var(--color-accent)' },
  },
  chipFixed: { flexShrink: 0, maxWidth: 'none' },
  mic: { flexShrink: 0, width: '34px', height: '34px', borderRadius: '4px', borderWidth: 0, backgroundColor: 'var(--color-accent)', color: 'var(--color-on-accent)', display: 'grid', placeItems: 'center', cursor: 'pointer', ':focus-visible': { outline: '2px solid var(--color-text-primary)', outlineOffset: '2px' }, ':disabled': { opacity: 0.5, cursor: 'not-allowed' } },
  micOn: { boxShadow: '0 0 0 4px color-mix(in srgb, var(--color-accent) 35%, transparent)' },
  menu: {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 40, display: 'flex', flexDirection: 'column', padding: '6px', gap: '2px', maxHeight: '50vh', overflowY: 'auto',
    borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-emphasized)', borderRadius: '6px', backgroundColor: 'var(--color-background-popover)', boxShadow: 'var(--shadow-med)',
  },
  option: { display: 'flex', justifyContent: 'space-between', gap: '12px', textAlign: 'left', padding: '8px 10px', borderRadius: '4px', borderWidth: 0, backgroundColor: { default: 'transparent', ':hover': 'var(--color-background-muted)', ':focus-visible': 'var(--color-background-muted)' }, color: 'var(--color-text-primary)', fontFamily: 'inherit', fontSize: '13px', cursor: 'pointer' },
  optionMeta: { fontSize: '12px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' },
  status: { padding: '6px 10px', fontSize: '12px', color: 'var(--color-text-secondary)' },
});

export function dateChip(app: { from: string; to: string; selected: { year: number; month: number } | null; lang: 'es' | 'en' | 'pt' }) {
  if (app.selected) return `${monthShort[app.lang][app.selected.month - 1]} ${app.selected.year}`;
  const [fy, fm] = [app.from.slice(0, 4), Number(app.from.slice(5, 7))];
  const [ty, tm] = [app.to.slice(0, 4), Number(app.to.slice(5, 7))];
  if (fy === ty && fm === tm) return `${monthShort[app.lang][fm - 1]} ${fy}`;
  if (app.from.endsWith('-01-01') && (app.to.endsWith('-12-31') || ty === String(new Date().getFullYear()))) return fy === ty ? fy : `${fy}–${ty}`;
  return `${monthShort[app.lang][fm - 1]} ${fy} – ${monthShort[app.lang][tm - 1]} ${ty}`;
}

export default function AreaSearch() {
  const app = useApp();
  const [text, setText] = useState(''), [candidates, setCandidates] = useState<AreaCandidate[]>([]), [suggestions, setSuggestions] = useState<AreaCandidate[]>([]), [intent, setIntent] = useState<ResolvedIntent | undefined>();
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [notice, setNotice] = useState(''), [listening, setListening] = useState(false);
  const SpeechClass = typeof window === 'undefined' ? undefined : (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
  const request = useRef<AbortController | null>(null), submitRequest = useRef<AbortController | null>(null), wrap = useRef<HTMLElement>(null);
  const L = app.lang;
  useEffect(() => {
    request.current?.abort();
    if (text.trim().length < 3) { setSuggestions([]); return; }
    const controller = new AbortController(); request.current = controller;
    const timer = setTimeout(() => searchAdmin(text.trim(), controller.signal).then(result => { setSuggestions(result.candidates.map(c => ({ label: `${c.name}${c.parent ? `, ${c.parent}` : ''}`, kind: c.level, country: c.country, bbox: c.bbox, code: c.code }))); setOpen(true); }).catch(() => {}), 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [text]);
  useEffect(() => () => { request.current?.abort(); submitRequest.current?.abort(); }, []);
  useEffect(() => { const close = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  const apply = (candidate: AreaCandidate, parsed?: ResolvedIntent) => {
    const area = candidateArea(candidate); if (!area) return;
    const bbox = 'bbox' in area ? area.bbox.split(',').map(Number) as [number, number, number, number] : undefined;
    const sel: AreaSel = { kind: 'bbox', label: candidate.label, area, bbox };
    const dates = intentDates(parsed, app.from, app.to, new Date().toISOString().slice(0, 10));
    app.patch({ area: sel, from: dates.from < '2001-01-01' ? '2001-01-01' : dates.from, to: dates.to < '2001-01-01' ? '2001-01-01' : dates.to, selected: null });
    setText(''); setCandidates([]); setSuggestions([]); setOpen(false); setIntent(parsed); setNotice('');
  };
  const submit = (spoken?: string) => {
    const query = (spoken ?? text).trim(); if (!query) return;
    submitRequest.current?.abort(); const controller = new AbortController(); submitRequest.current = controller;
    setLoading(true); setNotice(''); setOpen(true);
    resolveArea(query, L, controller.signal).then(result => {
      setIntent(result.intent);
      if (!result.candidates.length) { setNotice(L === 'es' ? 'No encontramos ese lugar. Prueba con el nombre del municipio o del estado.' : L === 'pt' ? 'Lugar não encontrado. Tente o nome do município ou do estado.' : 'Place not found. Try the municipality or state name.'); return; }
      if (result.ambiguous || result.candidates.length > 1) { setCandidates(result.candidates); setOpen(true); } else apply(result.candidates[0], result.intent);
    }).catch(e => { if (!controller.signal.aborted) setNotice(e instanceof ApiError ? (L === 'en' ? `The search failed (error ${e.status}). Try again in a moment.` : `La búsqueda falló (error ${e.status}). Inténtalo de nuevo en un momento.`) : (L === 'en' ? 'The search service is not responding. Check your connection and try again.' : 'El servicio de búsqueda no responde. Revisa tu conexión e inténtalo de nuevo.')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  };
  const dictate = () => {
    if (!SpeechClass) return;
    const recognition = new SpeechClass(); recognition.lang = L === 'pt' ? 'pt-BR' : L === 'en' ? 'en-US' : 'es-MX';
    setListening(true);
    recognition.onresult = e => { const transcript = e.results[0]?.[0]?.transcript?.trim(); if (transcript) { setText(transcript); submit(transcript); } };
    recognition.onerror = () => { setListening(false); setNotice(L === 'en' ? 'Dictation is not available in this browser. Type the place instead.' : 'El dictado no está disponible en este navegador. Escribe el lugar.'); setOpen(true); };
    recognition.onend = () => setListening(false);
    recognition.start();
  };
  const shown = candidates.length ? candidates : suggestions;
  const placeChip = intent?.place_text && app.area.label !== DEFAULT_AREA.label ? app.area.label : app.area.label;
  const showMenu = open && (shown.length > 0 || !!notice || loading);
  return (
    <Box ref={wrap} xs={s.wrap}>
      <Box xs={s.field}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...stylex.props(s.icon)}><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        <input type="search" aria-label={nav[L].search} placeholder={nav[L].search} value={text} onChange={e => { setText(e.target.value); setCandidates([]); setNotice(''); }} onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }} onFocus={() => shown.length && setOpen(true)} {...stylex.props(s.input)} />
        <Inline xs={s.chips}>
          <button type="button" title={L === 'en' ? 'Reset area' : 'Restablecer área'} onClick={() => { app.setArea(DEFAULT_AREA); setIntent(undefined); }} {...stylex.props(s.chip)}>{placeChip}</button>
          <button type="button" title={L === 'en' ? 'Reset dates' : 'Restablecer fechas'} onClick={() => { app.setRange('2001-01-01', new Date().toISOString().slice(0, 10)); setIntent(undefined); }} {...stylex.props(s.chip, s.chipFixed)}>{dateChip(app)}</button>
        </Inline>
        <button type="button" title={L === 'en' ? 'Dictate' : L === 'pt' ? 'Ditar' : 'Dictar'} aria-label={L === 'en' ? 'Dictate' : L === 'pt' ? 'Ditar' : 'Dictar'} disabled={!SpeechClass} onClick={dictate} {...stylex.props(s.mic, listening && s.micOn)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" stroke="currentColor" strokeWidth="1.5" /><path d="M3 8a5 5 0 0010 0M8 13v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      </Box>
      {showMenu && <Box xs={s.menu} role="listbox" aria-label={L === 'en' ? 'Places' : 'Lugares'}>
        {loading && <Inline xs={s.status}>{L === 'en' ? 'Searching…' : L === 'pt' ? 'Buscando…' : 'Buscando…'}</Inline>}
        {notice && <Inline xs={s.status} aria-live="polite">{notice}</Inline>}
        {shown.map((c, i) => <button key={`${c.label}-${i}`} type="button" role="option" aria-selected={false} onClick={() => apply(c, intent)} {...stylex.props(s.option)}><Inline>{c.label}</Inline><Inline xs={s.optionMeta}>{[c.kind, c.country].filter(Boolean).join(', ')}</Inline></button>)}
      </Box>}
    </Box>
  );
}
export function AreaSearchInline() { return <AreaSearch />; }
