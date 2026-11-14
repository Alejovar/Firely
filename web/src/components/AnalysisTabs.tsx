import { useEffect, useMemo, useState } from 'react';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { VStack } from '@astryxdesign/core/VStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Banner } from '@astryxdesign/core/Banner';
import { Typeahead } from '@astryxdesign/core/Typeahead';
import type { SearchSource } from '@astryxdesign/core/Typeahead';
import { ApiError, getSeason, getAnalogs, getContext, getEvents, getReported, getWeekday, getNight, searchAdmin, type AdminCandidate, type Envelope } from '../api/client';
import { useApp } from '../state/AppState';
import { clampContextRange } from './analysis/helpers';
import { SeasonPanel, AnalogsPanel, ContextPanel, EventsPanel, ReportedPanel, WeekdayNightPanel } from './analysis/Panels';

const labels = {
  es: ['Temporada', 'Años análogos', 'Contexto', 'Incendios', 'Reportados', 'Día y noche'],
  en: ['Season', 'Analog years', 'Context', 'Fire events', 'Reported', 'Day and night'],
  pt: ['Temporada', 'Anos análogos', 'Contexto', 'Incêndios', 'Reportados', 'Dia e noite'],
} as const;
type TabKey = 'season' | 'analogs' | 'context' | 'events' | 'reported' | 'weekday';
const keys: TabKey[] = ['season', 'analogs', 'context', 'events', 'reported', 'weekday'];
type Result = Awaited<ReturnType<typeof getSeason>> | Awaited<ReturnType<typeof getAnalogs>> | Awaited<ReturnType<typeof getContext>> | Awaited<ReturnType<typeof getEvents>> | Awaited<ReturnType<typeof getReported>> | { weekday: Awaited<ReturnType<typeof getWeekday>>; night: Awaited<ReturnType<typeof getNight>> };
const cache = new Map<string, Result>();
const cutoffs = new Map<string, string>();
type AdminItem = { id: string; label: string; auxiliaryData: AdminCandidate };
function mexicanAdmin(item: AdminCandidate) { return item.country.toLowerCase() === 'mx' || item.country.toLowerCase() === 'mexico' || item.country.toLowerCase() === 'méxico'; }

export default function AnalysisTabs() {
  const app = useApp();
  const [selected, setSelected] = useState<TabKey>('season');
  const [reportedAdmin, setReportedAdmin] = useState<AdminItem | null>(null);
  const adminSearch = useMemo<SearchSource<AdminItem>>(() => {
    let controller: AbortController | null = null;
    return { bootstrap: () => [], cancel: () => controller?.abort(), async search(query) {
      controller?.abort(); controller = new AbortController();
      const result = await searchAdmin(query, controller.signal);
      return result.candidates.filter(mexicanAdmin).filter(c => c.level === 'ent' || c.level === 'mun').map(c => ({ id: c.code, label: `${c.name}${c.parent ? `, ${c.parent}` : ''}`, auxiliaryData: c }));
    } };
  }, []);
  const [state, setState] = useState<{ key: string; data?: Result; error?: unknown }>({ key: '' });
  const reportedArea = reportedAdmin ? { admin: reportedAdmin.id } : ('admin' in app.area.area ? app.area.area : null);
  const effectiveArea = selected === 'reported' ? reportedArea : app.area.area;
  const areaKey = JSON.stringify(effectiveArea);
  const [contextFrom, contextTo] = clampContextRange(app.from, app.to);
  const cutoff = cutoffs.get(areaKey) ?? '2026-08-31';
  const today = new Date().toISOString().slice(0, 10);
  const rangeKey = selected === 'context' ? `${contextFrom}:${contextTo}` : selected === 'events' || selected === 'reported' ? `${app.from}:${app.to}` : selected === 'analogs' ? (today < cutoff ? today : cutoff) : '';
  const key = `${selected}:${areaKey}:${rangeKey}`;
  const notAdmin = selected === 'reported' && !reportedArea;
  useEffect(() => {
    if (notAdmin) return;
    const hit = cache.get(key);
    if (hit) { setState({ key, data: hit }); return; }
    const controller = new AbortController();
    setState({ key });
    const area = effectiveArea!;
    const signal = controller.signal;
    const request: Promise<Result> = selected === 'season' ? getSeason(area, signal)
      : selected === 'analogs' ? getAnalogs(area, rangeKey, signal)
      : selected === 'context' ? getContext(area, contextFrom, contextTo, signal)
      : selected === 'events' ? getEvents(area, app.from, app.to, 3, signal)
      : selected === 'reported' ? getReported(area, app.from, app.to, signal)
      : Promise.all([getWeekday(area, signal), getNight(area, signal)]).then(([weekday, night]) => ({ weekday, night }));
    request.then(data => { if (!signal.aborted) { const envelope = 'weekday' in data ? data.weekday : data; if (envelope.data_cutoff) cutoffs.set(areaKey, envelope.data_cutoff); cache.set(key, data); setState({ key, data }); } })
      .catch(error => { if (!signal.aborted) setState({ key, error }); });
    return () => controller.abort();
  }, [key, notAdmin]);
  const data = state.key === key ? state.data : undefined;
  const error = state.key === key ? state.error : undefined;
  const envelopeLabels = { es: ['Método', 'Datos hasta'], en: ['Method', 'Data through'], pt: ['Método', 'Dados até'] }[app.lang];
  const copy = {
    es: { choose: 'Elige un estado o municipio mexicano aquí para comparar reportes CONAFOR.', title: 'Selecciona un área administrativa de México', error: 'No se pudo cargar este análisis', retry: 'Revisa la conexión con el API o cambia el área y vuelve a intentarlo.' },
    en: { choose: 'Choose a Mexican state or municipality here to compare CONAFOR reports.', title: 'Select a Mexican administrative area', error: 'This analysis could not load', retry: 'Check the API connection or change the area and try again.' },
    pt: { choose: 'Escolha um estado ou município mexicano aqui para comparar relatórios CONAFOR.', title: 'Selecione uma área administrativa do México', error: 'Não foi possível carregar esta análise', retry: 'Verifique a conexão com a API ou mude a área e tente novamente.' },
  }[app.lang];
  const envelope: Envelope | undefined = data ? ('weekday' in data ? data.weekday : data) : undefined;
  return <VStack gap={5}>
    <TabList value={selected} onChange={value => setSelected(value as TabKey)} role="tablist" aria-label={app.lang === 'es' ? 'Análisis' : app.lang === 'pt' ? 'Análises' : 'Analysis'} hasDivider>
      {keys.map((tab, index) => <Tab key={tab} value={tab} label={labels[app.lang][index]} panelId="firely-analysis-panel" />)}
    </TabList>
    <section id="firely-analysis-panel" role="tabpanel" tabIndex={0} aria-label={labels[app.lang][keys.indexOf(selected)]}><VStack gap={4}>
      {selected === 'reported' && <Typeahead<AdminItem> label={app.lang === 'es' ? 'Estado o municipio de México' : app.lang === 'pt' ? 'Estado ou município do México' : 'Mexican state or municipality'} placeholder={app.lang === 'es' ? 'Buscar estado o municipio' : app.lang === 'pt' ? 'Buscar estado ou município' : 'Search state or municipality'} searchSource={adminSearch} value={reportedAdmin} onChange={setReportedAdmin} emptySearchText={app.lang === 'es' ? 'Sin resultados en México' : app.lang === 'pt' ? 'Sem resultados no México' : 'No results in Mexico'} width="100%" />}
      {notAdmin ? <EmptyState title={copy.title} description={copy.choose} /> : error ? <Banner status="error" title={copy.error} description={`${copy.retry}${error instanceof ApiError ? ` (${error.status}${error.code ? `: ${error.code}` : ''})` : ''}`} /> : !data ? <Card padding={5}><VStack gap={3}><Skeleton width="40%" height="var(--spacing-6)" /><Skeleton width="100%" height="var(--spacing-10)" /><Skeleton width="100%" height="var(--spacing-10)" /></VStack></Card> : <VStack gap={4}>
        {selected === 'season' && <SeasonPanel data={data as Awaited<ReturnType<typeof getSeason>>} lang={app.lang} />}
        {selected === 'analogs' && <AnalogsPanel data={data as Awaited<ReturnType<typeof getAnalogs>>} lang={app.lang} />}
        {selected === 'context' && <ContextPanel data={data as Awaited<ReturnType<typeof getContext>>} lang={app.lang} />}
        {selected === 'events' && <EventsPanel data={data as Awaited<ReturnType<typeof getEvents>>} lang={app.lang} />}
        {selected === 'reported' && <ReportedPanel data={data as Awaited<ReturnType<typeof getReported>>} lang={app.lang} />}
        {selected === 'weekday' && <WeekdayNightPanel data={data as { weekday: Awaited<ReturnType<typeof getWeekday>>; night: Awaited<ReturnType<typeof getNight>> }} lang={app.lang} />}
      </VStack>}
      {envelope && <Text type="supporting" color="secondary">{`${envelopeLabels[0]} ${envelope.methodology_version} · ${envelopeLabels[1]} ${envelope.data_cutoff} · ${envelope.attribution.includes('NASA FIRMS') ? envelope.attribution : `${envelope.attribution} · NASA FIRMS`}`}</Text>}
    </VStack></section>
  </VStack>;
}
