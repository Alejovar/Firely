import { useEffect, useMemo, useState } from 'react';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { VStack } from '@astryxdesign/core/VStack';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Banner } from '@astryxdesign/core/Banner';
import { Typeahead } from '@astryxdesign/core/Typeahead';
import type { SearchSource } from '@astryxdesign/core/Typeahead';
import { ApiError, getSeason, getAnalogs, getCalendar, getContext, getEvents, getReported, getWeekday, getNight, getRisk, getTerritory, getRecurrence, searchAdmin, type AdminCandidate, type AnalogsResponse, type CalendarResponse, type ContextResponse, type Envelope, type EventsResponse, type NightResponse, type RecurrenceGeoJson, type ReportedResponse, type RiskResponse, type SeasonResponse, type TerritoryResponse, type WeekdayResponse } from '../api/client';
import { useApp } from '../state/AppState';
import { clampContextRange } from './analysis/helpers';
import { SeasonPanel, AnalogsPanel, ContextPanel, ReportedPanel, WeekdayNightPanel } from './analysis/Panels';
import { CumulativeChart, FireEvents, RecurrencePanel, RiskPanel, TerritoryPanel } from './analysis/ExpandedPanels';
import { RiskWeightsPanel, WeatherPanel, WindPanel } from './analysis/ContextExtras';

const labels = {
  es: ['Este incendio', 'Años parecidos', 'Temporada', 'Contexto', 'Riesgo', 'Patrones', 'Territorio'],
  en: ['This fire', 'Similar years', 'Season', 'Context', 'Risk', 'Patterns', 'Territory'],
  pt: ['Este incêndio', 'Anos semelhantes', 'Temporada', 'Contexto', 'Risco', 'Padrões', 'Território'],
} as const;
type TabKey = 'events' | 'analogs' | 'season' | 'context' | 'risk' | 'patterns' | 'territory';
const keys: TabKey[] = ['events', 'analogs', 'season', 'context', 'risk', 'patterns', 'territory'];
type Outcome<T> = { data?: T; error?: unknown };
async function optional<T>(promise: Promise<T>): Promise<Outcome<T>> { try { return { data: await promise }; } catch (error) { if ((error as Error)?.name === 'AbortError') throw error; return { error }; } }
type Result =
  | { tab: 'events'; events: EventsResponse; territory: Outcome<TerritoryResponse> }
  | { tab: 'analogs'; analogs: AnalogsResponse; calendar: Outcome<CalendarResponse> }
  | { tab: 'season'; season: SeasonResponse }
  | { tab: 'context'; context: ContextResponse; reported?: Outcome<ReportedResponse> }
  | { tab: 'risk'; risk: RiskResponse; territory: Outcome<TerritoryResponse> }
  | { tab: 'patterns'; weekday: WeekdayResponse; night: NightResponse; recurrence: Outcome<RecurrenceGeoJson> }
  | { tab: 'territory'; territory: TerritoryResponse };
const cache = new Map<string, Result>();
type AdminItem = { id: string; label: string; auxiliaryData: AdminCandidate };
function mexicanAdmin(item: AdminCandidate) { return ['mx', 'mexico', 'méxico'].includes(item.country.toLowerCase()); }
function envelope(result: Result): Envelope { return result.tab === 'events' ? result.events : result.tab === 'analogs' ? result.analogs : result.tab === 'season' ? result.season : result.tab === 'context' ? result.context : result.tab === 'risk' ? result.risk : result.tab === 'patterns' ? result.weekday : result.territory; }
function unavailable(error: unknown) { return error instanceof ApiError && [404, 500, 501].includes(error.status); }

export default function AnalysisTabs() {
  const app = useApp();
  const [selected, setSelected] = useState<TabKey>('events');
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
  const area = app.area.area;
  const areaKey = JSON.stringify(area);
  const [contextFrom, contextTo] = clampContextRange(app.from, app.to);
  const reportedArea = reportedAdmin ? { admin: reportedAdmin.id } : ('admin' in area ? area : null);
  const key = `${selected}:${areaKey}:${app.from}:${app.to}:${selected === 'context' ? reportedAdmin?.id ?? '' : ''}`;
  useEffect(() => {
    const hit = cache.get(key);
    if (hit) { setState({ key, data: hit }); return; }
    const controller = new AbortController();
    const signal = controller.signal;
    setState({ key });
    const request: Promise<Result> = selected === 'events' ? Promise.all([getEvents(area, app.from, app.to, 3, signal), optional(getTerritory(area, signal))]).then(([events, territory]) => ({ tab: 'events', events, territory }))
      : selected === 'analogs' ? getCalendar(area, '2001-01-01', app.to, 'count', 'median', signal).then(async calendar => ({ tab: 'analogs' as const, analogs: await getAnalogs(area, app.to < calendar.data_cutoff ? app.to : calendar.data_cutoff, signal), calendar: { data: calendar } }))
      : selected === 'season' ? getSeason(area, signal).then(season => ({ tab: 'season', season }))
      : selected === 'context' ? Promise.all([getContext(area, contextFrom, contextTo, signal), reportedArea ? optional(getReported(reportedArea, app.from, app.to, signal)) : Promise.resolve(undefined)]).then(([context, reported]) => ({ tab: 'context', context, reported }))
      : selected === 'risk' ? Promise.all([getRisk(area, signal), optional(getTerritory(area, signal))]).then(([risk, territory]) => ({ tab: 'risk', risk, territory }))
      : selected === 'patterns' ? Promise.all([getWeekday(area, signal), getNight(area, signal), optional(getRecurrence(area, app.from, app.to, signal))]).then(([weekday, night, recurrence]) => ({ tab: 'patterns', weekday, night, recurrence }))
      : getTerritory(area, signal).then(territory => ({ tab: 'territory', territory }));
    request.then(data => { if (!signal.aborted) { cache.set(key, data); setState({ key, data }); } }).catch(error => { if (!signal.aborted) setState({ key, error }); });
    return () => controller.abort();
  }, [key]);
  const data = state.key === key ? state.data : undefined;
  const error = state.key === key ? state.error : undefined;
  const c = {
    es: { title: 'Análisis', subtitle: 'Cifras de la serie armonizada · redacción automática', unavailable: 'No disponible en este servidor', unavailableDetail: 'Este análisis aún no está disponible para el área seleccionada en este servidor.', error: 'No se pudo cargar este análisis', retry: 'Revisa la conexión con el API o cambia el área.', choose: 'Elige un estado o municipio mexicano para comparar reportes CONAFOR.', admin: 'Estado o municipio de México', method: 'Método', cutoff: 'Datos hasta' },
    en: { title: 'Analysis', subtitle: 'Harmonized series · automatic narrative', unavailable: 'Unavailable on this server', unavailableDetail: 'This analysis is not available for the selected area on this server yet.', error: 'This analysis could not load', retry: 'Check the API connection or change the area.', choose: 'Choose a Mexican state or municipality to compare CONAFOR reports.', admin: 'Mexican state or municipality', method: 'Method', cutoff: 'Data through' },
    pt: { title: 'Análise', subtitle: 'Série harmonizada · texto automático', unavailable: 'Indisponível neste servidor', unavailableDetail: 'Esta análise ainda não está disponível para a área selecionada neste servidor.', error: 'Não foi possível carregar esta análise', retry: 'Verifique a conexão com a API ou mude a área.', choose: 'Escolha um estado ou município mexicano para comparar relatórios CONAFOR.', admin: 'Estado ou município do México', method: 'Método', cutoff: 'Dados até' },
  }[app.lang];
  const fallback = (err: unknown) => unavailable(err) ? <EmptyState title={c.unavailable} description={c.unavailableDetail} /> : <Banner status="error" title={c.error} description={`${c.retry}${err instanceof ApiError ? ` (${err.status}${err.code ? `: ${err.code}` : ''})` : ''}`} />;
  const footer = data ? envelope(data) : undefined;
  return <VStack gap={5}><VStack gap={1}><Heading level={3}>{c.title}</Heading><Text type="supporting" color="secondary">{c.subtitle}</Text></VStack>
    <TabList value={selected} onChange={value => setSelected(value as TabKey)} role="tablist" aria-label={c.title} hasDivider>{keys.map((tab, index) => <Tab key={tab} value={tab} label={labels[app.lang][index]} panelId="firely-analysis-panel" />)}</TabList>
    <section id="firely-analysis-panel" role="tabpanel" tabIndex={0} aria-label={labels[app.lang][keys.indexOf(selected)]}><VStack gap={4}>
      {selected === 'context' && <Typeahead<AdminItem> label={c.admin} placeholder={c.admin} searchSource={adminSearch} value={reportedAdmin} onChange={setReportedAdmin} emptySearchText={c.unavailable} width="100%" />}
      {error ? fallback(error) : !data ? <Card padding={5}><VStack gap={3}><Skeleton width="40%" height="var(--spacing-6)" /><Skeleton width="100%" height="var(--spacing-10)" /><Skeleton width="100%" height="var(--spacing-10)" /></VStack></Card> : <VStack gap={4}>
        {data.tab === 'events' && <FireEvents data={data.events} territory={data.territory.data} lang={app.lang} live={app.layers.recent && app.live > 0} />}
        {data.tab === 'analogs' && <><AnalogsPanel data={data.analogs} lang={app.lang} />{data.calendar.data ? <CumulativeChart calendar={data.calendar.data} analogs={data.analogs} lang={app.lang} currentYear={Number(data.analogs.date.slice(0, 4))} /> : data.calendar.error && fallback(data.calendar.error)}</>}
        {data.tab === 'season' && <SeasonPanel data={data.season} lang={app.lang} />}
        {data.tab === 'context' && <><ContextPanel data={data.context} lang={app.lang} /><WeatherPanel area={area} from={contextFrom} to={contextTo} lang={app.lang} /><Card padding={5}><VStack gap={3}><Heading level={3}>CONAFOR</Heading>{data.reported?.data ? <ReportedPanel data={data.reported.data} lang={app.lang} /> : data.reported?.error ? fallback(data.reported.error) : <EmptyState title={c.admin} description={c.choose} />}</VStack></Card></>}
        {data.tab === 'risk' && <><RiskPanel data={data.risk} territory={data.territory.data} lang={app.lang} /><RiskWeightsPanel area={area} lang={app.lang} /><WindPanel area={area} lang={app.lang} /></>}
        {data.tab === 'patterns' && <><WeekdayNightPanel data={{ weekday: data.weekday, night: data.night }} lang={app.lang} />{data.recurrence.data ? <RecurrencePanel data={data.recurrence.data} lang={app.lang} /> : data.recurrence.error && fallback(data.recurrence.error)}</>}
        {data.tab === 'territory' && <TerritoryPanel data={data.territory} lang={app.lang} />}
      </VStack>}
      {footer && <Text type="supporting" color="secondary">{`${c.method} ${footer.methodology_version} · ${c.cutoff} ${footer.data_cutoff} · ${footer.attribution.includes('NASA FIRMS') ? footer.attribution : `${footer.attribution} · NASA FIRMS`}`}</Text>}
    </VStack></section>
  </VStack>;
}
