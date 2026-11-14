import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { Layout, LayoutContent, HStack, VStack } from '@astryxdesign/core/Layout';
import { Center } from '@astryxdesign/core/Center';
import { Heading, Text } from '@astryxdesign/core/Text';
import { ChatComposer, ChatComposerInput, ChatLayout, ChatMessage, ChatMessageBubble, ChatMessageList, ChatSystemMessage, ChatToolCalls } from '@astryxdesign/core/Chat';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Token } from '@astryxdesign/core/Token';
import { Badge } from '@astryxdesign/core/Badge';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Popover } from '@astryxdesign/core/Popover';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { API_URL, ApiError, getCalendar, getReturnPeriod, resolveArea, type AreaCandidate, type CalendarResponse, type ResolveAreaResponse } from '../api/client';
import { chartInk, emphasisSeries } from '../lib/dataviz';
import { monthShort, type Lang } from '../i18n';
import { useApp } from '../state/AppState';
import type { AreaSel } from '../state/hash';
import { calendarQuery, candidateArea, contextWindow, formatAnomaly, formatCount, latestRow, localSummary, monthIndex, peakRow, returnPeriodQuery } from '../components/assistant/helpers';

type Profile = 'brigadista' | 'cientifico';
type Turn = {
  id: number; prompt: string; resolveStatus: 'running' | 'complete' | 'error';
  calendarStatus?: 'running' | 'complete' | 'error'; resolved?: ResolveAreaResponse;
  selected?: AreaSel; from?: string; to?: string; calendar?: CalendarResponse;
  query?: string; contextQuery?: string; context?: CalendarResponse; contextStatus?: 'running' | 'complete' | 'error'; returnQuery?: string; referenceYears?: number; error?: string; profile: Profile;
};
const messages = {
  es: { title: 'Consulta los incendios con claridad', subtitle: 'Describe un lugar y un periodo. FIRELY interpreta la consulta y muestra datos verificables.', ask: 'Pregunta por un lugar y un periodo…', send: 'Enviar consulta', limit: 'El asistente solo interpreta y redacta; las cifras salen de la serie armonizada de NASA FIRMS.', place: 'Lugar', from: 'Desde', to: 'Hasta', rules: 'reglas locales', ai: 'IA', choose: 'Elige el lugar que querías consultar', noPlace: 'No encontramos ese lugar', noPlaceHelp: 'Prueba con un municipio, estado o país; por ejemplo, «Arteaga, Coahuila» o «Chilecito, La Rioja».', noData: 'Sin datos en este periodo', noDataHelp: 'Prueba otro lugar o rango de fechas.', peak: 'Mes de mayor actividad', latest: 'Último mes', anomaly: 'Anomalía', returnPeriod: 'Periodo de retorno', unavailable: 'No disponible', detections: 'detecciones armonizadas', years: 'años', data: 'Ver datos', map: 'Ver en el mapa', method: 'Cómo se calculó', profile: 'Perfil de explicación', brigade: 'Brigadista', scientist: 'Científico', source: 'Fuente', methodology: 'Metodología', cutoff: 'Corte de datos', query: 'Consulta exacta', resolving: 'Buscando lugar…', calendar: 'Consultando calendario…', apiDown: 'No pudimos conectar con la API de FIRELY. Comprueba que esté activa e inténtalo de nuevo.', apiError: 'La API no pudo completar la consulta', retry: 'Puedes reformular la pregunta e intentarlo otra vez.', descriptionError: 'No se pudo redactar la explicación. Las cifras mostradas proceden del calendario.', dataDescription: 'Serie mensual de detecciones armonizadas; el detalle numérico está disponible en la consulta exacta.' },
  en: { title: 'Explore fires with clarity', subtitle: 'Describe a place and period. FIRELY interprets your request and shows verifiable data.', ask: 'Ask about a place and period…', send: 'Send question', limit: 'The assistant only interprets and writes; figures come from the harmonized NASA FIRMS series.', place: 'Place', from: 'From', to: 'To', rules: 'local rules', ai: 'AI', choose: 'Choose the place you meant', noPlace: 'We could not find that place', noPlaceHelp: 'Try a municipality, state, or country, such as “Arteaga, Coahuila” or “Chilecito, La Rioja”.', noData: 'No data for this period', noDataHelp: 'Try another place or date range.', peak: 'Peak month', latest: 'Latest month', anomaly: 'Anomaly', returnPeriod: 'Return period', unavailable: 'Unavailable', detections: 'harmonized detections', years: 'years', data: 'View data', map: 'View on map', method: 'How it was calculated', profile: 'Explanation profile', brigade: 'Firefighter', scientist: 'Scientist', source: 'Source', methodology: 'Methodology', cutoff: 'Data cutoff', query: 'Exact query', resolving: 'Finding place…', calendar: 'Reading calendar…', apiDown: 'Could not connect to the FIRELY API. Check that it is running and try again.', apiError: 'The API could not complete the request', retry: 'You can rephrase the question and try again.', descriptionError: 'The explanation could not be written. Figures shown come from the calendar.', dataDescription: 'Monthly harmonized detections; the exact query provides the numerical detail.' },
  pt: { title: 'Explore incêndios com clareza', subtitle: 'Descreva um lugar e período. FIRELY interpreta a pergunta e mostra dados verificáveis.', ask: 'Pergunte sobre um lugar e período…', send: 'Enviar pergunta', limit: 'O assistente apenas interpreta e redige; os números vêm da série harmonizada da NASA FIRMS.', place: 'Lugar', from: 'Desde', to: 'Até', rules: 'regras locais', ai: 'IA', choose: 'Escolha o lugar desejado', noPlace: 'Não encontramos esse lugar', noPlaceHelp: 'Tente um município, estado ou país, como “Arteaga, Coahuila” ou “Chilecito, La Rioja”.', noData: 'Sem dados para o período', noDataHelp: 'Tente outro lugar ou intervalo de datas.', peak: 'Mês de maior atividade', latest: 'Último mês', anomaly: 'Anomalia', returnPeriod: 'Período de retorno', unavailable: 'Indisponível', detections: 'detecções harmonizadas', years: 'anos', data: 'Ver dados', map: 'Ver no mapa', method: 'Como foi calculado', profile: 'Perfil da explicação', brigade: 'Brigadista', scientist: 'Cientista', source: 'Fonte', methodology: 'Metodologia', cutoff: 'Corte dos dados', query: 'Consulta exata', resolving: 'Buscando lugar…', calendar: 'Consultando calendário…', apiDown: 'Não foi possível conectar à API FIRELY. Verifique se está ativa e tente novamente.', apiError: 'A API não concluiu a consulta', retry: 'Reformule a pergunta e tente novamente.', descriptionError: 'Não foi possível redigir a explicação. Os números exibidos vêm do calendário.', dataDescription: 'Série mensal de detecções harmonizadas; a consulta exata fornece o detalhe numérico.' },
} as const;
const suggestions = ['Incendios en la sierra de Arteaga en marzo de 2021', 'Chilecito julio 2026', '¿Cómo fue la temporada en Coahuila?', 'fires in La Rioja last 6 months'];
const summaryLabel: Record<Lang, string> = { es: 'Resumen automático', en: 'Automatic summary', pt: 'Resumo automático' };
const queryListLabel: Record<Lang, string> = { es: 'Consultas exactas usadas', en: 'Exact queries used', pt: 'Consultas exatas usadas' };
const copyLabel: Record<Lang, string> = { es: 'Copiar consulta', en: 'Copy query', pt: 'Copiar consulta' };
const contextError: Record<Lang, string> = { es: 'No se pudo cargar el contexto mensual.', en: 'Monthly context could not be loaded.', pt: 'Não foi possível carregar o contexto mensal.' };
const styles = stylex.create({ chat: { flex: 1, minHeight: 0, width: '100%' } });
function readableError(error: unknown, lang: Lang): string {
  const t = messages[lang];
  return error instanceof ApiError ? `${t.apiError} (${error.status}${error.code ? ` · ${error.code}` : ''}). ${t.retry}` : t.apiDown;
}
function monthLabel(row: { year: number; month: number }, lang: Lang) { return `${monthShort[lang][row.month - 1]} ${row.year}`; }
function DataLink({ queries, lang }: { queries: string[]; lang: Lang }) {
  const t = messages[lang];
  return <Popover label={queryListLabel[lang]} presentation="adaptive" content={<VStack gap={2}><Text type="label">{queryListLabel[lang]}</Text>{queries.map((query) => <VStack key={query} gap={1}><Text type="code" as="p" wordBreak="break-all">{`${API_URL}${query}`}</Text><Button label={copyLabel[lang]} variant="ghost" size="sm" onClick={() => void navigator.clipboard?.writeText(`${API_URL}${query}`)} /></VStack>)}</VStack>}><Button label={t.data} variant="ghost" size="sm" /></Popover>;
}
function Result({ turn, lang, profile, onProfile, onMap, onMethod }: { turn: Turn; lang: Lang; profile: Profile; onProfile: (value: Profile) => void; onMap: () => void; onMethod: () => void }) {
  const t = messages[lang], response = turn.calendar!, query = turn.query!;
  const rows = response.rows.filter((row) => Number.isFinite(row.count_harm));
  const contextRows = (turn.context?.rows ?? rows).filter((row) => Number.isFinite(row.count_harm));
  const peak = peakRow(rows), latest = latestRow(rows), format = (value: number) => formatCount(value, lang);
  const fromIndex = monthIndex(turn.from!), toIndex = monthIndex(turn.to!);
  const queries = [query, turn.contextQuery, turn.returnQuery].filter((value): value is string => !!value);
  const summary = localSummary(response, lang, profile, turn.referenceYears);
  return <Card width="100%" padding={4}><VStack gap={4}>
    <VStack gap={1}><Heading level={3}>{turn.selected?.label}</Heading><Text type="supporting">{turn.from} – {turn.to}</Text></VStack>
    {rows.length ? <>
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
      <HStack gap={4} wrap="wrap">
        {peak && <VStack gap={0.5}><Text type="supporting">{t.peak}</Text><Text weight="semibold" hasTabularNumbers>{monthLabel(peak, lang)} · {format(peak.count_harm ?? 0)} {t.detections}</Text></VStack>}
        {latest && <VStack gap={0.5}><Text type="supporting">{t.latest}</Text><Text weight="semibold" hasTabularNumbers>{monthLabel(latest, lang)} · {format(latest.count_harm ?? 0)} {t.detections}</Text></VStack>}
        {latest && <VStack gap={0.5}><Text type="supporting">{t.anomaly}</Text><Text weight="semibold" hasTabularNumbers>{latest.anomaly_ratio == null ? t.unavailable : formatAnomaly(latest.anomaly_ratio, lang)}</Text></VStack>}
        {latest && <VStack gap={0.5}><Text type="supporting">{t.returnPeriod}</Text><Text weight="semibold" hasTabularNumbers>{latest.return_period_years == null ? t.unavailable : `${format(latest.return_period_years)} ${t.years}`}</Text></VStack>}
      </HStack>
    </> : <EmptyState title={t.noData} description={t.noDataHelp} isCompact />}
    <SegmentedControl label={t.profile} value={profile} onChange={(value) => onProfile(value as Profile)} size="sm"><SegmentedControlItem value="brigadista" label={t.brigade} /><SegmentedControlItem value="cientifico" label={t.scientist} /></SegmentedControl>
    <VStack gap={1}><Text type="label" weight="semibold">{summaryLabel[lang]}</Text><Text as="p">{summary}</Text></VStack>
    <Text type="supporting">{t.methodology}: {response.methodology_version} · {t.cutoff}: {response.data_cutoff} · {t.source}: {response.attribution || 'NASA FIRMS'}</Text>
    <HStack gap={2} wrap="wrap"><Button label={t.map} variant="primary" onClick={onMap} /><Button label={t.method} variant="secondary" onClick={onMethod} /><DataLink queries={queries} lang={lang} /></HStack>
  </VStack></Card>;
}
export default function Assistant() {
  const app = useApp(), lang = app.lang, t = messages[lang];
  const [turns, setTurns] = useState<Turn[]>([]), [draft, setDraft] = useState('');
  const active = useRef<AbortController | null>(null), nextId = useRef(0);
  const change = (id: number, patch: Partial<Turn>) => setTurns((prev) => prev.map((turn) => turn.id === id ? { ...turn, ...patch } : turn));
  useEffect(() => () => { active.current?.abort(); }, []);
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
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const id = ++nextId.current; setDraft('');
    setTurns((prev) => [...prev.map((turn) => ({
      ...turn,
      resolveStatus: turn.resolveStatus === 'running' ? 'error' as const : turn.resolveStatus,
      calendarStatus: turn.calendarStatus === 'running' ? 'error' as const : turn.calendarStatus,
    })), { id, prompt, profile: 'brigadista', resolveStatus: 'running' }]);
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
    change(turn.id, { profile: value });
  }
  const composer = <VStack gap={1} width="100%"><ChatComposer onSubmit={submit} value={draft} onChange={setDraft} placeholder={t.ask} input={<ChatComposerInput label={t.send} pasteAsToken={false} />} /><Text type="supporting">{t.limit}</Text></VStack>;
  const transcript = turns.length > 0;
  return <Layout height="fill" content={<LayoutContent padding={transcript ? 0 : 6} isScrollable={!transcript}>
    {transcript ? <Center axis="horizontal" width="100%" height="100%"><VStack width="100%" maxWidth={760} height="100%"><ChatLayout density="balanced" composer={composer} xstyle={styles.chat}><ChatMessageList align="top">
      {turns.map((turn) => {
        const resolved = turn.resolved;
        const options = resolved?.candidates.filter((candidate) => candidateArea(candidate) !== null) ?? [];
        return <VStack key={turn.id} gap={3}>
          <ChatMessage sender="user"><ChatMessageBubble>{turn.prompt}</ChatMessageBubble></ChatMessage>
          <ChatMessage sender="assistant">
            <ChatToolCalls defaultIsExpanded calls={[{ name: t.resolving, status: turn.resolveStatus }, ...(turn.calendarStatus ? [{ name: t.calendar, status: turn.calendarStatus }] : [])]} />
            {turn.resolveStatus === 'running' && <ChatMessageBubble variant="ghost"><Skeleton width="75%" height="var(--spacing-6)" /></ChatMessageBubble>}
            {resolved && <ChatMessageBubble variant="ghost" width="100%"><VStack gap={3}>
              <HStack gap={2} wrap="wrap"><Token label={`${t.place}: ${resolved.intent.place_text || '—'}`} /><Token label={`${t.from}: ${resolved.intent.date_from || app.from}`} /><Token label={`${t.to}: ${resolved.intent.date_to || app.to}`} /><Badge label={resolved.intent.source === 'llm' ? t.ai : t.rules} variant="neutral" /></HStack>
              {!turn.selected && options.length === 0 && <EmptyState title={t.noPlace} description={t.noPlaceHelp} isCompact actions={<Button label={suggestions[0]} variant="secondary" onClick={() => void submit(suggestions[0])} />} />}
              {!turn.selected && options.length > 0 && <VStack gap={2}><Text weight="semibold">{t.choose}</Text>{options.map((candidate, index) => <SelectableCard key={`${candidate.code || candidate.label}-${index}`} label={`${candidate.label}, ${candidate.kind || ''}, ${candidate.country || ''}`} isSelected={false} onChange={() => choose(turn.id, candidate, resolved)} padding={3} width="100%"><VStack gap={0.5}><Text weight="semibold">{candidate.label}</Text><Text type="supporting">{[candidate.kind, candidate.country].filter(Boolean).join(' · ')}</Text></VStack></SelectableCard>)}</VStack>}
            </VStack></ChatMessageBubble>}
            {turn.calendarStatus === 'running' && <ChatMessageBubble variant="ghost" width="100%"><Card width="100%"><VStack gap={3}><Skeleton width="50%" height="var(--spacing-6)" /><Skeleton width="100%" height="var(--spacing-10)" /><Skeleton width="70%" height="var(--spacing-6)" /></VStack></Card></ChatMessageBubble>}
            {turn.calendar && <ChatMessageBubble variant="ghost" width="100%"><Result turn={turn} lang={lang} profile={turn.profile} onProfile={(value) => updateProfile(value, turn)} onMap={() => app.patch({ area: turn.selected!, from: turn.from!, to: turn.to!, page: 'explorar' })} onMethod={() => app.navigate('metodo')} /></ChatMessageBubble>}
          </ChatMessage>
          {turn.error && <ChatSystemMessage>{turn.error}</ChatSystemMessage>}
        </VStack>;
      })}
    </ChatMessageList></ChatLayout></VStack></Center> : <Center axis="both" width="100%" height="100%"><VStack gap={8} width="100%" maxWidth={760}><VStack gap={2} width="100%"><Heading level={1}>{t.title}</Heading><Text type="large" color="secondary">{t.subtitle}</Text></VStack><VStack gap={4} width="100%">{composer}<HStack gap={2} wrap="wrap" width="100%">{suggestions.map((suggestion) => <Button key={suggestion} label={suggestion} variant="secondary" size="sm" onClick={() => void submit(suggestion)} />)}</HStack></VStack></VStack></Center>}
  </LayoutContent>} />;
}
