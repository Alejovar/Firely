import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { ChatComposer, ChatComposerInput, ChatMessage, ChatMessageBubble, ChatMessageList, ChatSystemMessage } from '@astryxdesign/core/Chat';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { Table } from '@astryxdesign/core/Table';
import { Banner } from '@astryxdesign/core/Banner';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { List, ListItem } from '@astryxdesign/core/List';
import { SparklesIcon, MapPinIcon, ChartBarIcon, ArrowUpIcon, StopIcon, PlusIcon } from '@heroicons/react/24/outline';
import { IconButton } from '@astryxdesign/core/IconButton';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Popover } from '@astryxdesign/core/Popover';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { API_URL, ApiError, getAnalogs, getCalendar, getContext, getReturnPeriod, getTerritory, resolveArea, type AreaCandidate, type AnalogsResponse, type CalendarResponse, type ContextResponse, type ResolveAreaResponse, type TerritoryResponse } from '../api/client';
import { chartInk, emphasisSeries } from '../lib/dataviz';
import { monthShort, type Lang } from '../i18n';
import { useApp } from '../state/AppState';
import type { AreaSel } from '../state/hash';
import { calendarQuery, candidateArea, contextWindow, formatAnomaly, formatCount, largestLocalities, latestContextRow, latestRow, localSummary, monthIndex, peakRow, returnPeriodQuery } from '../components/assistant/helpers';
import { Caption } from '../ui/kit';
import ConnectionStatus from '../components/assistant/ConnectionStatus';

type Profile = 'brigadista' | 'cientifico';
type FollowUp = { id: number; turnId: number; kind: 'territory' | 'context'; status: 'running' | 'complete' | 'error'; territory?: TerritoryResponse; context?: ContextResponse; analogs?: AnalogsResponse; error?: string };
type Turn = {
  id: number; prompt: string; resolveStatus: 'running' | 'complete' | 'error'; cancelled?: boolean;
  calendarStatus?: 'running' | 'complete' | 'error'; resolved?: ResolveAreaResponse;
  selected?: AreaSel; from?: string; to?: string; calendar?: CalendarResponse;
  query?: string; contextQuery?: string; context?: CalendarResponse; contextStatus?: 'running' | 'complete' | 'error'; returnQuery?: string; referenceYears?: number; error?: string; profile: Profile;
};
const messages = {
  es: { title: 'Pregunta por el fuego de un lugar', subtitle: 'Describe un lugar y un periodo. Firely interpreta la consulta y muestra datos verificables.', ask: 'Pregunta por un lugar y un periodo…', send: 'Enviar consulta', limit: 'El asistente solo interpreta y redacta; las cifras salen de la serie armonizada de NASA FIRMS.', place: 'Lugar', from: 'Desde', to: 'Hasta', rules: 'reglas locales', ai: 'IA', choose: 'Elige el lugar que querías consultar', noPlace: 'No encontramos ese lugar', noPlaceHelp: 'Prueba con un municipio, estado o país; por ejemplo, «Arteaga, Coahuila» o «Chilecito, La Rioja».', noData: 'Sin datos en este periodo', noDataHelp: 'Prueba otro lugar o rango de fechas.', peak: 'Mes de mayor actividad', latest: 'Último mes', anomaly: 'Anomalía', returnPeriod: 'Periodo de retorno', unavailable: 'No disponible', detections: 'detecciones armonizadas', years: 'años', data: 'Ver datos', map: 'Ver en el mapa', method: 'Cómo se calculó', profile: 'Perfil de explicación', brigade: 'Brigadista', scientist: 'Científico', source: 'Fuente', methodology: 'Metodología', cutoff: 'Corte de datos', query: 'Consulta exacta', resolving: 'Buscando lugar…', calendar: 'Consultando calendario…', apiDown: 'No pudimos conectar con la API de Firely. Comprueba que esté activa e inténtalo de nuevo.', apiError: 'La API no pudo completar la consulta', retry: 'Puedes reformular la pregunta e intentarlo otra vez.', descriptionError: 'No se pudo redactar la explicación. Las cifras mostradas proceden del calendario.', dataDescription: 'Serie mensual de detecciones armonizadas; el detalle numérico está disponible en la consulta exacta.' },
  en: { title: 'Ask about fire in a place', subtitle: 'Describe a place and period. Firely interprets your request and shows verifiable data.', ask: 'Ask about a place and period…', send: 'Send question', limit: 'The assistant only interprets and writes; figures come from the harmonized NASA FIRMS series.', place: 'Place', from: 'From', to: 'To', rules: 'local rules', ai: 'AI', choose: 'Choose the place you meant', noPlace: 'We could not find that place', noPlaceHelp: 'Try a municipality, state, or country, such as “Arteaga, Coahuila” or “Chilecito, La Rioja”.', noData: 'No data for this period', noDataHelp: 'Try another place or date range.', peak: 'Peak month', latest: 'Latest month', anomaly: 'Anomaly', returnPeriod: 'Return period', unavailable: 'Unavailable', detections: 'harmonized detections', years: 'years', data: 'View data', map: 'View on map', method: 'How it was calculated', profile: 'Explanation profile', brigade: 'Firefighter', scientist: 'Scientist', source: 'Source', methodology: 'Methodology', cutoff: 'Data cutoff', query: 'Exact query', resolving: 'Finding place…', calendar: 'Reading calendar…', apiDown: 'Could not connect to the Firely API. Check that it is running and try again.', apiError: 'The API could not complete the request', retry: 'You can rephrase the question and try again.', descriptionError: 'The explanation could not be written. Figures shown come from the calendar.', dataDescription: 'Monthly harmonized detections; the exact query provides the numerical detail.' },
  pt: { title: 'Pergunte sobre o fogo de um lugar', subtitle: 'Descreva um lugar e período. Firely interpreta a pergunta e mostra dados verificáveis.', ask: 'Pergunte sobre um lugar e período…', send: 'Enviar pergunta', limit: 'O assistente apenas interpreta e redige; os números vêm da série harmonizada da NASA FIRMS.', place: 'Lugar', from: 'Desde', to: 'Até', rules: 'regras locais', ai: 'IA', choose: 'Escolha o lugar desejado', noPlace: 'Não encontramos esse lugar', noPlaceHelp: 'Tente um município, estado ou país, como “Arteaga, Coahuila” ou “Chilecito, La Rioja”.', noData: 'Sem dados para o período', noDataHelp: 'Tente outro lugar ou intervalo de datas.', peak: 'Mês de maior atividade', latest: 'Último mês', anomaly: 'Anomalia', returnPeriod: 'Período de retorno', unavailable: 'Indisponível', detections: 'detecções harmonizadas', years: 'anos', data: 'Ver dados', map: 'Ver no mapa', method: 'Como foi calculado', profile: 'Perfil da explicação', brigade: 'Brigadista', scientist: 'Cientista', source: 'Fonte', methodology: 'Metodologia', cutoff: 'Corte dos dados', query: 'Consulta exata', resolving: 'Buscando lugar…', calendar: 'Consultando calendário…', apiDown: 'Não foi possível conectar à API Firely. Verifique se está ativa e tente novamente.', apiError: 'A API não concluiu a consulta', retry: 'Reformule a pergunta e tente novamente.', descriptionError: 'Não foi possível redigir a explicação. Os números exibidos vêm do calendário.', dataDescription: 'Série mensal de detecções harmonizadas; a consulta exata fornece o detalhe numérico.' },
} as const;
const suggestions: Record<Lang, { title: string; prompt: string }[]> = {
  es: [{ title: 'Revisar un incendio', prompt: 'Incendios en Arteaga, Coahuila en marzo de 2021' }, { title: 'Consultar una temporada', prompt: 'Fuego en Coahuila durante 2021' }, { title: 'Explorar otro lugar', prompt: 'Chilecito, La Rioja en julio de 2026' }],
  en: [{ title: 'Review a fire', prompt: 'Fires in Arteaga, Coahuila in March 2021' }, { title: 'Review a season', prompt: 'Fires in Coahuila during 2021' }, { title: 'Explore another place', prompt: 'Chilecito, La Rioja in July 2026' }],
  pt: [{ title: 'Consultar um incêndio', prompt: 'Fogo em Arteaga, Coahuila em março de 2021' }, { title: 'Consultar uma temporada', prompt: 'Fogo em Coahuila durante 2021' }, { title: 'Explorar outro lugar', prompt: 'Chilecito, La Rioja em julho de 2026' }],
};
const chatCopy = {
  es: { title: 'Asistente Firely', welcome: '¿Qué lugar quieres explorar?', lead: 'Pregunta por un lugar y una fecha. Conectamos tu pregunta con la historia del fuego.', example: 'Puedes empezar por aquí', stop: 'Detener consulta', stopped: 'Consulta detenida', reset: 'Nueva conversación', details: 'Ver evolución y cifras', intent: 'Lugar y fechas de la consulta', settings: 'Ajustar explicación', input: 'Escribe tu pregunta', retry: 'Reintentar consulta', working: 'Consultando los datos…', provenance: 'Respuestas con datos de NASA FIRMS', changePlace: 'Buscar otro lugar' },
  en: { title: 'Firely assistant', welcome: 'Where would you like to explore?', lead: 'Ask about a place and date. Connect your question with its fire history.', example: 'Start with a question', stop: 'Stop request', stopped: 'Request stopped', reset: 'New conversation', details: 'View chart and figures', intent: 'Query place and dates', settings: 'Explanation settings', input: 'Type your question', retry: 'Retry request', working: 'Reading the data…', provenance: 'Answers based on NASA FIRMS data', changePlace: 'Find another place' },
  pt: { title: 'Assistente Firely', welcome: 'Que lugar você quer explorar?', lead: 'Pergunte sobre um lugar e uma data. Conectamos sua pergunta com a história do fogo.', example: 'Comece por aqui', stop: 'Parar consulta', stopped: 'Consulta interrompida', reset: 'Nova conversa', details: 'Ver evolução e números', intent: 'Lugar e datas da consulta', settings: 'Ajustar explicação', input: 'Escreva sua pergunta', retry: 'Tentar novamente', working: 'Consultando os dados…', provenance: 'Respostas com dados da NASA FIRMS', changePlace: 'Buscar outro lugar' },
};
const queryListLabel: Record<Lang, string> = { es: 'Consultas exactas usadas', en: 'Exact queries used', pt: 'Consultas exatas usadas' };
const copyLabel: Record<Lang, string> = { es: 'Copiar consulta', en: 'Copy query', pt: 'Copiar consulta' };
const contextError: Record<Lang, string> = { es: 'No se pudo cargar el contexto mensual.', en: 'Monthly context could not be loaded.', pt: 'Não foi possível carregar o contexto mensal.' };
const styles = stylex.create({
  page: { width: '100%', minWidth: 0, flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: 'var(--color-background-body)' },
  body: { width: '100%', minWidth: 0, flex: 1, minHeight: 0, alignItems: 'stretch', overflow: 'hidden' },
  chatColumn: { minWidth: 0, flex: 1, minHeight: 0, overflow: 'hidden' },
  transcript: { overflowY: 'auto', overscrollBehavior: 'contain', flex: 1, minHeight: 0, width: '100%', padding: 'var(--spacing-4)', scrollPaddingBlock: 'var(--spacing-4)' },
  welcome: { width: '100%', maxWidth: '38rem', marginInline: 'auto', paddingBlock: 'var(--spacing-6)' },
  composer: { width: '100%', maxWidth: '48rem', marginInline: 'auto', padding: 'var(--spacing-3)', flexShrink: 0, borderTop: 'thin solid var(--color-border)', backgroundColor: 'var(--color-background-surface)' },
  resultColumn: { minWidth: 0, width: '26rem', flexShrink: 0, overflowY: 'auto', padding: 'var(--spacing-4)', borderLeft: 'thin solid var(--color-border)', '@media (max-width: 56.25rem)': { display: 'none' } },
  resultMobile: { width: '100%', '@media (min-width: 56.251rem)': { display: 'none' } },
  desktopSummary: { display: { default: 'flex', '@media (max-width: 56.25rem)': 'none' } },
  header: { padding: 'var(--spacing-3)', borderBottom: 'thin solid var(--color-border)', width: '100%', flexShrink: 0 },
  symbol: { width: 'var(--spacing-8)', height: 'var(--spacing-8)', color: 'var(--color-accent)' },
  smallIcon: { width: 'var(--spacing-5)', height: 'var(--spacing-5)' },
  headerTitle: { fontSize: 'var(--font-size-lg)', lineHeight: 1.2 },
});
const extras = {
  es: { eyebrow: 'Asistente analista, panel lateral', result: 'Resultado', area: 'Área activa', range: 'Rango activo', template: 'Modo plantilla', templateHelp: 'El servicio de IA no intervino: Firely usa reglas locales y redacta respuestas con plantillas a partir de cifras de la API.', affected: '¿A quién afecta?', why: '¿Por qué este año?', pdf: 'Generar ficha PDF', other: 'Otro lugar…', draw: 'Dibujar en el mapa', geometry: 'La geometría viene de límites de INEGI/geoBoundaries; el asistente nunca genera coordenadas.', locality: 'Localidad', population: 'Población', protected: 'Áreas protegidas', none: 'Sin datos disponibles', weather: 'Datos de tiempo de incendios no disponibles para esta área.', enso: 'Fase ENSO', fwi: 'Anomalía FWI', analogs: 'Años análogos', resultHelp: 'Haz una consulta para ver aquí el resultado más reciente.' },
  en: { eyebrow: 'Analyst assistant, side panel', result: 'Result', area: 'Active area', range: 'Active range', template: 'Template mode', templateHelp: 'The AI service was not involved: Firely uses local rules and templates based on API figures.', affected: 'Who is affected?', why: 'Why this year?', pdf: 'Generate PDF brief', other: 'Another place…', draw: 'Draw on map', geometry: 'Geometry comes from INEGI/geoBoundaries boundaries; the assistant never generates coordinates.', locality: 'Locality', population: 'Population', protected: 'Protected areas', none: 'No data available', weather: 'Fire-weather data is unavailable for this area.', enso: 'ENSO phase', fwi: 'FWI anomaly', analogs: 'Analog years', resultHelp: 'Ask a question to see the latest result here.' },
  pt: { eyebrow: 'Assistente analista, painel lateral', result: 'Resultado', area: 'Área ativa', range: 'Período ativo', template: 'Modo modelo', templateHelp: 'O serviço de IA não participou: Firely usa regras locais e modelos de texto baseados em números da API.', affected: 'Quem é afetado?', why: 'Por que este ano?', pdf: 'Gerar ficha PDF', other: 'Outro lugar…', draw: 'Desenhar no mapa', geometry: 'A geometria vem dos limites INEGI/geoBoundaries; o assistente nunca gera coordenadas.', locality: 'Localidade', population: 'População', protected: 'Áreas protegidas', none: 'Sem dados disponíveis', weather: 'Dados meteorológicos de incêndio indisponíveis para esta área.', enso: 'Fase ENSO', fwi: 'Anomalia FWI', analogs: 'Anos análogos', resultHelp: 'Faça uma pergunta para ver aqui o resultado mais recente.' },
} as const;
function readableError(error: unknown, lang: Lang): string {
  const t = messages[lang];
  return error instanceof ApiError ? `${t.apiError} (${error.status}${error.code ? `, ${error.code}` : ''}). ${t.retry}` : t.apiDown;
}
function monthLabel(row: { year: number; month: number }, lang: Lang) { return `${monthShort[lang][row.month - 1]} ${row.year}`; }
function DataLink({ queries, lang }: { queries: string[]; lang: Lang }) {
  const t = messages[lang];
  return <Popover label={queryListLabel[lang]} presentation="adaptive" content={<VStack gap={2}><Caption>{queryListLabel[lang]}</Caption>{queries.map((query) => <VStack key={query} gap={1}><Text type="code" as="p" wordBreak="break-all">{`${API_URL}${query}`}</Text><Button label={copyLabel[lang]} variant="ghost" size="sm" onClick={() => void navigator.clipboard?.writeText(`${API_URL}${query}`)} /></VStack>)}</VStack>}><Button label={t.data} variant="ghost" size="sm" /></Popover>;
}
function Result({ turn, lang, profile, onMap, onMethod }: { turn: Turn; lang: Lang; profile: Profile; onMap: () => void; onMethod: () => void }) {
  const t = messages[lang], response = turn.calendar!, query = turn.query!;
  const rows = response.rows.filter((row) => Number.isFinite(row.count_harm));
  const contextRows = (turn.context?.rows ?? rows).filter((row) => Number.isFinite(row.count_harm));
  const peak = peakRow(rows), latest = latestRow(rows), format = (value: number) => formatCount(value, lang);
  const fromIndex = monthIndex(turn.from!), toIndex = monthIndex(turn.to!);
  const queries = [query, turn.contextQuery, turn.returnQuery].filter((value): value is string => !!value);
  const summary = localSummary(response, lang, profile, turn.referenceYears);
  return <Card width="100%" padding={4}><VStack gap={4}>
    <VStack gap={1}><Heading level={3}>{turn.selected?.label}</Heading><Text type="supporting">{turn.from} – {turn.to}</Text></VStack>
    <Text as="p">{summary}</Text>
    {rows.length ? <>
      <Collapsible trigger={chatCopy[lang].details} defaultIsOpen={false}>
      <VStack gap={1} role="img" aria-label={`${t.dataDescription} ${contextRows.map((row) => `${monthLabel(row, lang)}: ${format(row.count_harm ?? 0)}`).join('; ')}. ${t.methodology}: ${response.methodology_version}; ${t.cutoff}: ${response.data_cutoff}; ${t.source}: ${response.attribution}.`}>
        {turn.contextStatus === 'running' ? <Skeleton width="100%" height="var(--spacing-10)" /> : <ResponsiveContainer width="100%" aspect={2.4}>
          <BarChart data={contextRows} accessibilityLayer>
            <CartesianGrid vertical={false} stroke={chartInk.grid} />
            <XAxis dataKey={(row: typeof rows[number]) => monthIndex(`${row.year}-${String(row.month).padStart(2, '0')}`) >= fromIndex && monthIndex(`${row.year}-${String(row.month).padStart(2, '0')}`) <= toIndex ? monthLabel(row, lang) : ''} tick={chartInk.tick} stroke={chartInk.axis} interval={0} />
            <YAxis tick={chartInk.tick} stroke={chartInk.axis} />
            <ChartTooltip labelFormatter={(_label, payload) => payload?.[0]?.payload ? monthLabel(payload[0].payload, lang) : ''} formatter={(value) => [format(Number(value)), t.detections]} />
            <Bar dataKey="count_harm" fill={emphasisSeries.modisRaw.stroke} name={t.detections}>{contextRows.map((row) => <Cell key={`${row.year}-${row.month}`} fill={row.year * 12 + row.month - 1 >= fromIndex && row.year * 12 + row.month - 1 <= toIndex ? emphasisSeries.harmonized.stroke : emphasisSeries.modisRaw.stroke} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>}{turn.contextStatus === 'error' && <Text type="supporting">{contextError[lang]}</Text>}<Text type="supporting">{t.dataDescription}</Text>
      </VStack>
      </Collapsible>
      <Grid columns={2} gap={3}>
        {peak && <VStack gap={0.5}><Text type="supporting">{t.peak}</Text><Text weight="semibold" hasTabularNumbers>{format(peak.count_harm ?? 0)} · {monthLabel(peak, lang)}</Text></VStack>}
        {latest && <VStack gap={0.5}><Text type="supporting">{t.latest}</Text><Text weight="semibold" hasTabularNumbers>{format(latest.count_harm ?? 0)} · {monthLabel(latest, lang)}</Text></VStack>}
        {latest && <VStack gap={0.5}><Text type="supporting">{t.anomaly}</Text><Text weight="semibold" hasTabularNumbers>{latest.anomaly_ratio == null ? t.unavailable : formatAnomaly(latest.anomaly_ratio, lang)}</Text></VStack>}
        {latest && <VStack gap={0.5}><Text type="supporting">{t.returnPeriod}</Text><Text weight="semibold" hasTabularNumbers>{latest.return_period_years == null ? t.unavailable : `${format(latest.return_period_years)} ${t.years}`}</Text></VStack>}
      </Grid>
    </> : <EmptyState title={t.noData} description={t.noDataHelp} isCompact />}
    <Text type="supporting">{t.methodology}: {response.methodology_version} · {t.cutoff}: {response.data_cutoff} · {t.source}: {response.attribution || 'NASA FIRMS'}</Text>
    <HStack gap={2} wrap="wrap"><Button label={t.map} variant="primary" onClick={onMap} /><Button label={t.method} variant="secondary" onClick={onMethod} /><DataLink queries={queries} lang={lang} /></HStack>
  </VStack></Card>;
}
function FollowUpResult({ item, lang }: { item: FollowUp; lang: Lang }) {
  const t = extras[lang];
  if (item.status === 'running') return <Card padding={4}><VStack gap={2}><Skeleton width="50%" height="var(--spacing-5)"/><Skeleton width="100%" height="var(--spacing-8)"/></VStack></Card>;
  if (item.status === 'error') return <Banner status="error" title={item.error || messages[lang].apiError}/>;
  if (item.kind === 'territory' && item.territory) {
    const data = item.territory;
    const localities = largestLocalities(data.localities).map(x => ({ name: x.name, population: formatCount(x.pop!, lang) }));
    const protectedNames = [...new Set(data.protected_areas.features.map(x => x.properties.name).filter(Boolean))];
    return <Card padding={4}><VStack gap={3}><Heading level={4}>{t.affected}</Heading>
      {localities.length ? <Table aria-label={t.locality} data={localities} columns={[{key:'name',header:t.locality},{key:'population',header:t.population}]} idKey="name" density="compact"/> : <EmptyState title={t.none} isCompact/>}
      <Caption>{t.protected}</Caption><Text>{protectedNames.length ? protectedNames.join(', ') : t.none}</Text>
      <Text type="supporting">{data.attribution || 'NASA FIRMS'} · {data.data_cutoff} · v{data.methodology_version}</Text>
    </VStack></Card>;
  }
  if (item.kind === 'context') {
    const context = item.context, analogs = item.analogs;
    const last = latestContextRow(context?.rows ?? []);
    const weather = latestContextRow((context?.rows ?? []).filter(row => row.fwi_anom != null));
    return <Card padding={4}><VStack gap={3}><Heading level={4}>{t.why}</Heading>
      <Text>{t.enso}: {last?.enso_phase || analogs?.current_oni_phase || t.none}</Text>
      <Text>{weather?.fwi_anom == null ? t.weather : `${t.fwi} (${monthLabel(weather, lang)}): ${new Intl.NumberFormat(lang, {maximumFractionDigits: 2}).format(weather.fwi_anom)}`}</Text>
      <Text>{t.analogs}: {analogs?.analogs.length ? analogs.analogs.map(x => x.year).join(', ') : t.none}</Text>
      <Text type="supporting">{(context || analogs)?.attribution || 'NASA FIRMS'} · {(context || analogs)?.data_cutoff} · v{(context || analogs)?.methodology_version}</Text>
    </VStack></Card>;
  }
  return <EmptyState title={t.none} isCompact/>;
}
export default function Assistant() {
  const app = useApp(), lang = app.lang, t = messages[lang];
  const [turns, setTurns] = useState<Turn[]>([]), [draft, setDraft] = useState('');
  const [profile, setProfile] = useState<Profile>('brigadista');
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const transcriptRef = useRef<HTMLDivElement | null>(null), followLatest = useRef(true);
  const active = useRef<AbortController | null>(null), followUpController = useRef<AbortController | null>(null), nextId = useRef(0), nextFollowUpId = useRef(0);
  const change = (id: number, patch: Partial<Turn>) => setTurns((prev) => prev.map((turn) => turn.id === id ? { ...turn, ...patch } : turn));
  useEffect(() => () => { active.current?.abort(); followUpController.current?.abort(); }, []);
  useEffect(() => {
    if (!followLatest.current) return;
    const frame = requestAnimationFrame(() => {
      const el = transcriptRef.current;
      if (!el) return;
      const followUp = followUps.at(-1);
      const target = followUp?.turnId === turns.at(-1)?.id ? `[data-followup-id="${followUp?.id}"]` : `[data-turn-id="${turns.at(-1)?.id}"]`;
      const last = el.querySelector<HTMLElement>(target);
      if (last) el.scrollTop += last.getBoundingClientRect().top - el.getBoundingClientRect().top;
      else el.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [turns, followUps]);
  async function loadCalendar(id: number, selected: AreaSel, resolved: ResolveAreaResponse, controller: AbortController) {
    const from = resolved.intent.date_from || app.from, to = resolved.intent.date_to || app.to, query = calendarQuery(selected, from, to);
    change(id, { selected, from, to, query, calendarStatus: 'running', error: undefined });
    try {
      const response = await getCalendar(selected.area, from, to, 'count', 'median', controller.signal);
      if (controller.signal.aborted) return;
      change(id, { calendar: response, calendarStatus: 'complete' });
      const window = contextWindow(from, to, response.data_cutoff);
      const contextQuery = calendarQuery(selected, window.from, window.to);
      change(id, { contextStatus: 'running', contextQuery });
      const latest = latestRow(response.rows);
      const returnQuery = latest ? returnPeriodQuery(selected, latest.year, latest.month) : undefined;
      if (returnQuery) change(id, { returnQuery });
      const [contextResult, returnResult] = await Promise.allSettled([
        getCalendar(selected.area, window.from, window.to, 'count', 'median', controller.signal),
        latest ? getReturnPeriod(selected.area, latest.year, latest.month, controller.signal) : Promise.resolve(null),
      ]);
      if (controller.signal.aborted) return;
      if (contextResult.status === 'fulfilled') change(id, { context: contextResult.value, contextStatus: 'complete' });
      else change(id, { contextStatus: 'error' });
      if (returnResult.status === 'fulfilled' && returnResult.value && latest) {
        const result = returnResult.value;
        change(id, { calendar: { ...response, rows: response.rows.map((row) => row.year === latest.year && row.month === latest.month ? { ...row, percentile: result.percentile ?? undefined, return_period_years: result.return_period_years ?? undefined } : row) }, referenceYears: result.n_reference_years });
      }
    } catch (error) { if (!controller.signal.aborted) change(id, { calendarStatus: 'error', error: readableError(error, lang) }); }
  }
  async function submit(value: string) {
    const prompt = value.trim(); if (!prompt) return;
    followLatest.current = true;
    active.current?.abort();
    followUpController.current?.abort();
    setFollowUps(prev => prev.filter(item => item.status !== 'running'));
    const controller = new AbortController(); active.current = controller;
    const id = ++nextId.current; setDraft('');
    setTurns((prev) => [...prev.map((turn) => ({
      ...turn,
      resolveStatus: turn.resolveStatus === 'running' ? 'error' as const : turn.resolveStatus,
      calendarStatus: turn.calendarStatus === 'running' ? 'error' as const : turn.calendarStatus,
      contextStatus: turn.contextStatus === 'running' ? 'error' as const : turn.contextStatus,
      cancelled: turn.resolveStatus === 'running' || turn.calendarStatus === 'running' || turn.contextStatus === 'running' || turn.cancelled,
    })), { id, prompt, profile, resolveStatus: 'running' }]);
    try {
      const resolved = await resolveArea(prompt, lang, controller.signal);
      if (controller.signal.aborted) return;
      change(id, { resolved, resolveStatus: 'complete' });
      const valid = resolved.candidates.map(candidateArea).filter((area): area is AreaSel => area !== null);
      if (!resolved.ambiguous && valid.length === 1) await loadCalendar(id, valid[0], resolved, controller);
    } catch (error) { if (!controller.signal.aborted) change(id, { resolveStatus: 'error', error: readableError(error, lang) }); }
  }
  function choose(id: number, candidate: AreaCandidate, resolved: ResolveAreaResponse) {
    const selected = candidateArea(candidate); if (!selected) return;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    void loadCalendar(id, selected, resolved, controller);
  }
  function updateProfile(value: Profile, turn: Turn) {
    setProfile(value);
    change(turn.id, { profile: value });
  }
  function stop() {
    active.current?.abort(); followUpController.current?.abort();
    setTurns(prev => prev.map(turn => ({ ...turn,
      cancelled: turn.resolveStatus === 'running' || turn.calendarStatus === 'running' || turn.contextStatus === 'running' || turn.cancelled,
      resolveStatus: turn.resolveStatus === 'running' ? 'error' : turn.resolveStatus,
      calendarStatus: turn.calendarStatus === 'running' ? 'error' : turn.calendarStatus,
      contextStatus: turn.contextStatus === 'running' ? 'error' : turn.contextStatus,
    })));
    setFollowUps(prev => prev.filter(item => item.status !== 'running'));
  }
  function reset() {
    active.current?.abort(); followUpController.current?.abort();
    setTurns([]); setFollowUps([]); setDraft(''); followLatest.current = true;
  }
  async function followUp(turn: Turn, kind: 'territory' | 'context') {
    if (!turn.selected || !turn.calendar) return;
    followLatest.current = true;
    followUpController.current?.abort();
    const controller = new AbortController(); followUpController.current = controller;
    const id = ++nextFollowUpId.current;
    setFollowUps(prev => [...prev.filter(item => item.status !== 'running'), { id, turnId: turn.id, kind, status: 'running' }]);
    const update = (patch: Partial<FollowUp>) => setFollowUps(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
    try {
      if (kind === 'territory') {
        const territory = await getTerritory(turn.selected.area, controller.signal);
        if (!controller.signal.aborted) update({ status: 'complete', territory });
      } else {
        const latest = latestRow(turn.calendar.rows);
        const year = latest?.year ?? Number(turn.to?.slice(0,4));
        const latestDate = latest ? new Date(Date.UTC(latest.year, latest.month, 0)).toISOString().slice(0,10) : turn.to!;
        const from = `${year}-01-01`, to = latestDate < turn.to! ? latestDate : turn.to!;
        const results = await Promise.allSettled([
          getContext(turn.selected.area, from, to, controller.signal),
          getAnalogs(turn.selected.area, to, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        const context = results[0].status === 'fulfilled' ? results[0].value : undefined;
        const analogs = results[1].status === 'fulfilled' ? results[1].value : undefined;
        update(context || analogs ? { status: 'complete', context, analogs } : { status: 'error', error: messages[lang].apiError });
      }
    } catch (error) { if (!controller.signal.aborted) update({ status: 'error', error: readableError(error, lang) }); }
  }
  function drawOnMap() {
    try { window.sessionStorage.setItem('firely.requestDraw', 'polygon'); } catch { /* storage may be blocked */ }
    app.navigate('explorar');
    window.dispatchEvent(new CustomEvent('firely:request-draw', { detail: { mode: 'polygon' } }));
  }
  const latestTurn = [...turns].reverse().find(turn => turn.calendar);
  const ext = extras[lang], ui = chatCopy[lang];
  const busy = turns.some(turn => turn.resolveStatus === 'running' || turn.calendarStatus === 'running' || turn.contextStatus === 'running') || followUps.some(item => item.status === 'running');
  const resultCard = (turn: Turn) => <Result turn={turn} lang={lang} profile={profile}
    onMap={() => app.patch({ area: turn.selected!, from: turn.from!, to: turn.to!, page: 'explorar' })}
    onMethod={() => app.navigate('metodo')} />;
  const focusComposer = () => document.querySelector<HTMLElement>('[contenteditable="true"][role="textbox"]')?.focus();
  const composer = <VStack gap={2} xstyle={styles.composer}>
    {latestTurn && <HStack gap={2} wrap="wrap">
      <Button label={ext.affected} size="sm" variant="ghost" isDisabled={busy} onClick={() => void followUp(latestTurn, 'territory')} />
      <Button label={ext.why} size="sm" variant="ghost" isDisabled={busy} onClick={() => void followUp(latestTurn, 'context')} />
    </HStack>}
    <ChatComposer onSubmit={value => void submit(value)} value={draft} onChange={setDraft} placeholder={t.ask}
      onStop={stop} isStopShown={busy} elevation="none" density="compact"
      input={<ChatComposerInput label={ui.input} maxRows={4} pasteAsToken={false} enterKeyHint="send" />}
      sendButton={<Button label={busy ? ui.stop : t.send} variant="primary" size="sm"
        icon={busy ? <StopIcon /> : <ArrowUpIcon />} isDisabled={!busy && !draft.trim()}
        onClick={() => busy ? stop() : void submit(draft)} />} />
    <Text type="supporting">{ui.provenance}</Text>
  </VStack>;
  return <VStack xstyle={styles.page}>
    <HStack gap={3} vAlign="center" hAlign="between" xstyle={styles.header}>
      <VStack gap={1}>
        <Heading level={1} xstyle={styles.headerTitle}>{ui.title}</Heading>
        <ConnectionStatus lang={lang} />
      </VStack>
      <HStack gap={1}>
        <Popover label={ui.settings} presentation="adaptive" content={<VStack gap={3}>
          <Text type="supporting">{t.limit}</Text>
          <SegmentedControl label={t.profile} value={profile} onChange={value => { setProfile(value as Profile); if (latestTurn) updateProfile(value as Profile, latestTurn); }}>
            <SegmentedControlItem value="brigadista" label={t.brigade} /><SegmentedControlItem value="cientifico" label={t.scientist} />
          </SegmentedControl>
        </VStack>}><Button label={profile === 'brigadista' ? t.brigade : t.scientist} variant="ghost" size="sm" /></Popover>
        <IconButton label={ui.reset} tooltip={ui.reset} variant="ghost" icon={<PlusIcon />} isDisabled={!turns.length && !draft} onClick={reset} />
      </HStack>
    </HStack>
    <HStack gap={0} xstyle={styles.body}>
      <VStack xstyle={styles.chatColumn}>
        <VStack ref={transcriptRef} xstyle={styles.transcript} role="region" aria-label={ui.title}
          onScroll={() => { const el = transcriptRef.current; if (el) followLatest.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}>
          {turns.length === 0 ? <VStack gap={6} xstyle={styles.welcome}>
            <VStack gap={3}>
              <SparklesIcon {...stylex.props(styles.symbol)} aria-hidden="true" />
              <Heading level={2}>{ui.welcome}</Heading>
              <Text color="secondary">{ui.lead}</Text>
              <Text type="supporting">{app.area.label} · {app.from} — {app.to}</Text>
            </VStack>
            <VStack gap={2}>
              <Text type="label" color="secondary">{ui.example}</Text>
              <List hasDividers edge="flush">{suggestions[lang].map((suggestion, index) => <ListItem key={suggestion.prompt}
                label={suggestion.title} description={<Text type="supporting">{suggestion.prompt}</Text>}
                startContent={index === 1 ? <ChartBarIcon {...stylex.props(styles.smallIcon)} aria-hidden="true" /> : <MapPinIcon {...stylex.props(styles.smallIcon)} aria-hidden="true" />}
                onClick={() => void submit(suggestion.prompt)} />)}</List>
            </VStack>
          </VStack> : <ChatMessageList align="top">
            {turns.map(turn => {
              const resolved = turn.resolved;
              const options = resolved?.candidates.filter(candidate => candidateArea(candidate) !== null) ?? [];
              const loading = turn.resolveStatus === 'running' || turn.calendarStatus === 'running';
              return <VStack key={turn.id} gap={3} data-turn-id={turn.id}>
                <ChatMessage sender="user"><ChatMessageBubble>{turn.prompt}</ChatMessageBubble></ChatMessage>
                <ChatMessage sender="assistant">
                  {loading && <ChatMessageBubble variant="ghost"><VStack gap={2} aria-live="polite">
                    <Text type="supporting">{turn.resolveStatus === 'running' ? t.resolving : t.calendar}</Text>
                    <Skeleton width="100%" height="var(--spacing-6)" />
                  </VStack></ChatMessageBubble>}
                  {resolved && !turn.cancelled && <ChatMessageBubble variant="ghost" width="100%">
                    <Collapsible key={turn.selected ? 'resolved' : 'choosing'} trigger={turn.selected ? ui.intent : t.choose} defaultIsOpen={!turn.selected}>
                      <VStack gap={3}>
                        <Text type="supporting">{resolved.intent.place_text || '—'} · {resolved.intent.date_from || app.from} — {resolved.intent.date_to || app.to}</Text>
                        <Text type="supporting">{resolved.intent.source === 'llm' ? t.ai : ext.templateHelp}</Text>
                        {!turn.selected && options.length === 0 && <EmptyState title={t.noPlace} description={t.noPlaceHelp} isCompact />}
                        {!turn.selected && options.map((candidate, index) => <SelectableCard key={`${candidate.code || candidate.label}-${index}`}
                          label={candidate.label} isSelected={false} onChange={() => choose(turn.id, candidate, resolved)} padding={3} width="100%">
                          <VStack gap={1}><Text weight="semibold">{candidate.label}</Text><Text type="supporting">{[candidate.kind, candidate.country].filter(Boolean).join(', ')}</Text></VStack>
                        </SelectableCard>)}
                        {!turn.selected && <HStack gap={2} wrap="wrap"><Button label={ui.changePlace} variant="ghost" size="sm" onClick={focusComposer} /><Button label={ext.draw} variant="ghost" size="sm" onClick={drawOnMap} /></HStack>}
                      </VStack>
                    </Collapsible>
                  </ChatMessageBubble>}
                  {turn.calendar && <VStack width="100%">
                    <VStack xstyle={styles.resultMobile}>{resultCard(turn)}</VStack>
                    <VStack xstyle={styles.desktopSummary}><Text>{localSummary(turn.calendar, lang, profile, turn.referenceYears)}</Text></VStack>
                  </VStack>}
                  {turn.cancelled && <ChatSystemMessage>{ui.stopped}</ChatSystemMessage>}
                  {turn.error && <Banner status="error" title={turn.error} endContent={<Button label={ui.retry} onClick={() => void submit(turn.prompt)} />} />}
                </ChatMessage>
                {followUps.filter(item => item.turnId === turn.id).map(item => <ChatMessage key={item.id} sender="assistant"><VStack width="100%" data-followup-id={item.id}><FollowUpResult item={item} lang={lang} /></VStack></ChatMessage>)}
              </VStack>;
            })}
          </ChatMessageList>}
        </VStack>
        {composer}
      </VStack>
      {latestTurn && <VStack gap={3} xstyle={styles.resultColumn}><Text type="label" color="secondary">{ext.result}</Text>{resultCard(latestTurn)}</VStack>}
    </HStack>
  </VStack>;
}
