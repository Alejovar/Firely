// Panels for endpoints that existed (or were added) in the API but had no UI: NASA POWER context (§8.10),
// adjustable priority weights (§8.16) and the indicative spread cone / downwind localities (§8.12, §8.14).
import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Slider } from '@astryxdesign/core/Slider';
import { Table } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { ApiError, getRiskWeighted, getWeather, getWindLocalities, type Area, type RiskWeights, type WeatherResponse, type WeightedRiskResponse, type WindLocalitiesResponse } from '../../api/client';
import type { Lang } from '../../i18n';
import { monthShort } from '../../i18n';
import { chartInk, divergingSteps } from '../../lib/dataviz';
import { formatNumber } from './helpers';

const s = stylex.create({ chart: { width: '100%', minWidth: 0 } });
const axis = { tick: chartInk.tick, axisLine: false, tickLine: false } as const;

function useApi<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  useEffect(() => {
    const c = new AbortController();
    setState({ loading: true });
    load(c.signal).then(data => { if (!c.signal.aborted) setState({ data, loading: false }); })
      .catch(error => { if (!c.signal.aborted) setState({ error, loading: false }); });
    return () => c.abort();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

const errText = (e: unknown) => e instanceof ApiError ? `${e.status}${e.code ? `, ${e.code}` : ''}` : String(e);
const loading = <Card padding={5}><VStack gap={3}><Skeleton width="40%" height="var(--spacing-6)" /><Skeleton width="100%" height="var(--spacing-10)" /></VStack></Card>;

// ------------------------------------------------------------------ NASA POWER
const wx = {
  es: { title: 'Clima del periodo (NASA POWER)', lead: 'Anomalía de precipitación junto a la anomalía de fuego, mes a mes. Barras por debajo de cero = más seco que lo normal.', precip: 'Precipitación (mm/día, anomalía)', fire: 'Fuego (× mediana del mes)', temp: 'Temperatura (°C, anomalía)', none: 'Sin datos de NASA POWER para este periodo', unavailable: 'NASA POWER no respondió', table: 'Ver tabla', month: 'Mes' },
  en: { title: 'Period weather (NASA POWER)', lead: 'Precipitation anomaly next to the fire anomaly, month by month. Bars below zero = drier than normal.', precip: 'Precipitation (mm/day, anomaly)', fire: 'Fire (× month median)', temp: 'Temperature (°C, anomaly)', none: 'No NASA POWER data for this period', unavailable: 'NASA POWER did not respond', table: 'View table', month: 'Month' },
  pt: { title: 'Clima do período (NASA POWER)', lead: 'Anomalia de precipitação ao lado da anomalia de fogo, mês a mês. Barras abaixo de zero = mais seco que o normal.', precip: 'Precipitação (mm/dia, anomalia)', fire: 'Fogo (× mediana do mês)', temp: 'Temperatura (°C, anomalia)', none: 'Sem dados da NASA POWER para este período', unavailable: 'A NASA POWER não respondeu', table: 'Ver tabela', month: 'Mês' },
} as const;

export function WeatherPanel({ area, from, to, lang }: { area: Area; from: string; to: string; lang: Lang }) {
  const t = wx[lang];
  const end = to.slice(0, 7);
  const [y, m] = [Number(end.slice(0, 4)), Number(end.slice(5, 7))];
  const { data, error, loading: busy } = useApi<WeatherResponse>(signal => getWeather(area, from, to, y, m, signal), [JSON.stringify(area), from, to]);
  if (busy) return loading;
  if (error) return <Banner status="warning" title={t.unavailable} description={errText(error)} />;
  if (!data?.rows.length) return <EmptyState title={t.none} />;
  const rows = data.rows.slice(-36).map(r => ({ ...r, label: `${monthShort[lang][r.month - 1]} ${String(r.year).slice(2)}` }));
  const div = divergingSteps();
  // One measure per chart (no dual axis): precipitation and fire are two aligned small multiples.
  return <Card padding={5}><VStack gap={4} xstyle={s.chart}>
    <HStack gap={2} wrap="wrap" vAlign="center"><Heading level={3}>{t.title}</Heading><Badge label="NASA POWER" variant="blue" /></HStack>
    {data.summary && <Text>{data.summary.text}</Text>}
    <Text type="supporting">{t.lead}</Text>
    <Text type="label">{t.precip}</Text>
    <ResponsiveContainer width="100%" height={150}><BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}><CartesianGrid stroke={chartInk.grid} vertical={false} /><XAxis dataKey="label" {...axis} hide /><YAxis {...axis} width={40} /><ChartTooltip /><ReferenceLine y={0} stroke={chartInk.axis} /><Bar dataKey="precip_anom_mm_day" name={t.precip} isAnimationActive={false}>{rows.map(r => <Cell key={`${r.year}-${r.month}`} fill={(r.precip_anom_mm_day ?? 0) < 0 ? div[div.length - 2] : div[1]} />)}</Bar></BarChart></ResponsiveContainer>
    <Text type="label">{t.fire}</Text>
    <ResponsiveContainer width="100%" height={150}><BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}><CartesianGrid stroke={chartInk.grid} vertical={false} /><XAxis dataKey="label" {...axis} interval="preserveStartEnd" /><YAxis {...axis} width={40} /><ChartTooltip /><ReferenceLine y={1} stroke={chartInk.axis} strokeDasharray="4 4" /><Bar dataKey="fire_anomaly_ratio" name={t.fire} isAnimationActive={false}>{rows.map(r => <Cell key={`${r.year}-${r.month}`} fill={(r.fire_anomaly_ratio ?? 0) > 1 ? div[div.length - 2] : div[1]} />)}</Bar></BarChart></ResponsiveContainer>
    <Collapsible trigger={t.table} defaultIsOpen={false}><Table density="compact" idKey="id"
      data={rows.map(r => ({ id: `${r.year}-${r.month}`, month: r.label, precip: formatNumber(r.precip_anom_mm_day, lang, 2), temp: formatNumber(r.temp_anom_c, lang, 1), fire: formatNumber(r.fire_anomaly_ratio, lang, 1) }))}
      columns={[{ key: 'month', header: t.month }, { key: 'precip', header: t.precip }, { key: 'temp', header: t.temp }, { key: 'fire', header: t.fire }]} /></Collapsible>
    <Text type="supporting" color="secondary">{data.note} {data.method}, {data.source}, ({formatNumber(data.centroid.lat, lang, 2)}, {formatNumber(data.centroid.lon, lang, 2)})</Text>
  </VStack></Card>;
}

// ------------------------------------------------------------------ adjustable priority weights
const rw = {
  es: { title: 'Ajusta los pesos del índice', lead: 'Los pesos son transparentes: cámbialos según lo que tu equipo considera más importante y el índice se recalcula con los mismos datos.', anomaly: 'Anomalía', recurrence: 'Recurrencia', exposure: 'Exposición', season: 'Temporada', fwi: 'Peligro meteorológico (FWI)', reset: 'Restablecer', index: 'Índice', custom: 'Pesos propios', missing: 'sin datos en esta área' },
  en: { title: 'Adjust the index weights', lead: 'Weights are transparent: change them to match what your team considers most important; the index is recomputed from the same data.', anomaly: 'Anomaly', recurrence: 'Recurrence', exposure: 'Exposure', season: 'Season', fwi: 'Fire weather (FWI)', reset: 'Reset', index: 'Index', custom: 'Custom weights', missing: 'no data for this area' },
  pt: { title: 'Ajuste os pesos do índice', lead: 'Os pesos são transparentes: mude-os conforme o que sua equipe considera mais importante; o índice é recalculado com os mesmos dados.', anomaly: 'Anomalia', recurrence: 'Recorrência', exposure: 'Exposição', season: 'Temporada', fwi: 'Perigo meteorológico (FWI)', reset: 'Restaurar', index: 'Índice', custom: 'Pesos próprios', missing: 'sem dados nesta área' },
} as const;
const DEFAULT_WEIGHTS: RiskWeights = { anomaly: 35, recurrence: 25, exposure: 25, season: 15, fwi: 15 };

export function RiskWeightsPanel({ area, lang }: { area: Area; lang: Lang }) {
  const t = rw[lang];
  const [draft, setDraft] = useState<RiskWeights>(DEFAULT_WEIGHTS);
  const [applied, setApplied] = useState<RiskWeights>(DEFAULT_WEIGHTS);
  const isDefault = (Object.keys(DEFAULT_WEIGHTS) as (keyof RiskWeights)[]).every(k => applied[k] === DEFAULT_WEIGHTS[k]);
  const { data, error, loading: busy } = useApi<WeightedRiskResponse>(
    signal => getRiskWeighted(area, isDefault ? undefined : Object.fromEntries(Object.entries(applied).map(([k, v]) => [k, v / 100])), signal),
    [JSON.stringify(area), JSON.stringify(applied)]);
  const present = new Set(data?.components.map(c => c.key));
  return <Card padding={5}><VStack gap={4}>
    <HStack gap={2} wrap="wrap" vAlign="center"><Heading level={3}>{t.title}</Heading>{!isDefault && <Badge label={t.custom} variant="warning" />}</HStack>
    <Text type="supporting">{t.lead}</Text>
    <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>{(Object.keys(DEFAULT_WEIGHTS) as (keyof RiskWeights)[]).map(k =>
      <Slider key={k} label={t[k]} value={draft[k]} min={0} max={100} step={5} valueDisplay="text" formatValue={v => `${v}%`}
        description={data && !present.has(k) && applied[k] > 0 ? t.missing : undefined}
        onChange={(v: number) => setDraft(d => ({ ...d, [k]: v }))} onChangeEnd={(v: number) => setApplied(a => ({ ...a, [k]: v }))} />)}</Grid>
    <HStack gap={2}><Button label={t.reset} size="sm" variant="ghost" isDisabled={isDefault} onClick={() => { setDraft(DEFAULT_WEIGHTS); setApplied(DEFAULT_WEIGHTS); }} /></HStack>
    {busy ? <Skeleton width="100%" height="var(--spacing-8)" /> : error ? <Banner status="error" title={errText(error)} /> : data && <VStack gap={2}>
      <Heading level={4}>{t.index}: {formatNumber(data.index, lang, 1)} / 100, {data.level}</Heading>
      <ProgressBar label={t.index} value={Math.max(0, Math.min(100, data.index))} max={100} />
      <Text type="supporting" color="secondary">{data.method}</Text>
      {data.disclaimer && <Text type="supporting" color="secondary">{data.disclaimer}</Text>}
    </VStack>}
  </VStack></Card>;
}

// ------------------------------------------------------------------ wind: spread cone + downwind localities
const wn = {
  es: { title: 'Viento: hacia dónde iría el humo', lead: 'Sector de ±22.5° en la dirección del viento pronosticado (próximas 12 h) desde el centro del área.', toward: 'Sopla hacia', speed: 'Velocidad media', reach: 'Alcance', localities: 'Localidades a favor del viento', none: 'Ninguna localidad registrada dentro del sector.', unavailable: 'Pronóstico de viento no disponible', name: 'Localidad', pop: 'Población', dist: 'Distancia km' },
  en: { title: 'Wind: where smoke would go', lead: '±22.5° sector along the forecast wind (next 12 h) from the area center.', toward: 'Blowing toward', speed: 'Mean speed', reach: 'Reach', localities: 'Downwind localities', none: 'No recorded locality inside the sector.', unavailable: 'Wind forecast unavailable', name: 'Locality', pop: 'Population', dist: 'Distance km' },
  pt: { title: 'Vento: para onde iria a fumaça', lead: 'Setor de ±22,5° na direção do vento previsto (próximas 12 h) a partir do centro da área.', toward: 'Sopra para', speed: 'Velocidade média', reach: 'Alcance', localities: 'Localidades a favor do vento', none: 'Nenhuma localidade registrada dentro do setor.', unavailable: 'Previsão de vento indisponível', name: 'Localidade', pop: 'População', dist: 'Distância km' },
} as const;

export function WindPanel({ area, lang }: { area: Area; lang: Lang }) {
  const t = wn[lang];
  const { data, error, loading: busy } = useApi<WindLocalitiesResponse>(signal => getWindLocalities(area, 12, signal), [JSON.stringify(area)]);
  if (busy) return loading;
  if (error || !data) return <Banner status="warning" title={t.unavailable} description={errText(error)} />;
  const deg = data.direction.toward_deg;
  // Compass arrow; the rotation carries the information, the text repeats it (never encoding-only).
  return <Card padding={5}><VStack gap={4}>
    <HStack gap={2} wrap="wrap" vAlign="center"><Heading level={3}>{t.title}</Heading><Badge label="Orientativo" variant="warning" /></HStack>
    <Text type="supporting">{t.lead}</Text>
    <HStack gap={5} wrap="wrap" vAlign="center">
      <svg width="72" height="72" viewBox="-36 -36 72 72" role="img" aria-label={`${t.toward} ${data.direction.toward_compass} (${Math.round(deg)}°)`}>
        <circle r="33" fill="none" stroke={chartInk.grid} strokeWidth="2" />
        <text y="-24" textAnchor="middle" fontSize="9" fill={chartInk.axis}>N</text>
        <g transform={`rotate(${deg})`}><path d="M0 -26 L7 6 L0 1 L-7 6 Z" fill="var(--color-accent)" /></g>
      </svg>
      <VStack gap={1}><Text>{t.toward} <strong>{data.direction.toward_compass}</strong> ({formatNumber(deg, lang, 0)}°)</Text>
        <Text type="supporting">{t.speed}: {formatNumber(data.wind.speed_kmh, lang, 1)} km/h, {t.reach}: {formatNumber(data.reach_km, lang, 1)} km, {data.wind.source}</Text></VStack>
    </HStack>
    <Heading level={4}>{t.localities}</Heading>
    {data.localities.length ? <Table density="compact" idKey="id" data={data.localities.slice(0, 10).map((l, i) => ({ id: `${l.name}-${i}`, name: l.name, pop: formatNumber(l.pop, lang), dist: formatNumber(l.distance_km, lang, 1) }))}
      columns={[{ key: 'name', header: t.name }, { key: 'pop', header: t.pop }, { key: 'dist', header: t.dist }]} /> : <Text type="supporting">{t.none}</Text>}
    <Text type="supporting" color="secondary">{data.warning}</Text>
  </VStack></Card>;
}
