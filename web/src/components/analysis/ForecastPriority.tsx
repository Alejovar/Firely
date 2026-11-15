// "Riesgo próximo" (GET /risk/forecast) and "Índice de prioridad" (GET /priority/cells). Numbers come from the API; this
// file only lays them out.
import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { ApiError, getPriorityCells, getRiskForecast, type Area, type PriorityCellsResponse, type RiskForecastResponse } from '../../api/client';
import type { Lang } from '../../i18n';
import { monthShort } from '../../i18n';
import { cividis, fwiInk } from '../../lib/dataviz';
import { useApp } from '../../state/AppState';
import { Box, Caption, Inline, OutlineButton } from '../../ui/kit';

const s = stylex.create({
  bars: { display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: '6px', alignItems: 'end', height: '96px', position: 'relative' },
  barCol: { display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' },
  bar: { borderRadius: '2px', minHeight: '2px' },
  ticks: { display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: '6px', fontVariantNumeric: 'tabular-nums', fontSize: '10px', color: 'var(--color-text-disabled)', textAlign: 'center' },
  ltm: { position: 'absolute', left: 0, right: 0, borderTopWidth: '1.5px', borderTopStyle: 'dashed', pointerEvents: 'none' },
  ltmLabel: { position: 'absolute', right: 0, transform: 'translateY(-110%)', fontVariantNumeric: 'tabular-nums', fontSize: '10px', color: 'var(--color-text-secondary)' },
  row: { display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr) 120px 44px', gap: '10px', alignItems: 'center', fontSize: '12.5px', paddingBlock: '3px' },
  rank: { fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-disabled)' },
  track: { height: '10px', borderRadius: '2px', backgroundColor: 'var(--color-background-muted)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: '2px' },
  num: { fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
  sub: { fontSize: '11px', color: 'var(--color-text-disabled)' },
});

const T = {
  es: { tooLarge: 'Área demasiado grande para calcular el índice celda por celda; dibuja o elige un área más pequeña (hasta unos 290,000 km²).', fc: 'Riesgo próximo, 8 días', unavailable: 'Pronóstico GFWED no disponible ahora', stale: 'Pronóstico desactualizado', run: 'corrida', clim: 'clima', pr: 'Índice de prioridad por celda', top: 'Las 10 celdas con más prioridad', show: 'Ver en el mapa', hide: 'Ocultar del mapa', pop: 'hab. a 10 km', note: 'No es una probabilidad de incendio.' },
  en: { tooLarge: 'Area too large to score cell by cell; draw or pick a smaller area (up to about 290,000 km²).', fc: 'Coming risk, 8 days', unavailable: 'GFWED forecast unavailable right now', stale: 'Stale forecast', run: 'run', clim: 'clim.', pr: 'Priority index per cell', top: 'Top 10 priority cells', show: 'Show on map', hide: 'Hide from map', pop: 'people within 10 km', note: 'Not a fire probability.' },
  pt: { tooLarge: 'Área grande demais para calcular o índice célula a célula; desenhe ou escolha uma área menor (até cerca de 290.000 km²).', fc: 'Risco próximo, 8 dias', unavailable: 'Previsão GFWED indisponível agora', stale: 'Previsão desatualizada', run: 'rodada', clim: 'clima', pr: 'Índice de prioridade por célula', top: 'As 10 células com mais prioridade', show: 'Ver no mapa', hide: 'Ocultar do mapa', pop: 'hab. a 10 km', note: 'Não é uma probabilidade de incêndio.' },
};
const levelVariant = (level: string) => /muy alto|extrema/.test(level) ? 'error' : /alt/.test(level) ? 'warning' : /normal|media/.test(level) ? 'neutral' : 'success';

type Load<T> = { data?: T; error?: unknown };
/** Shared fetch of the 8-day FWI forecast for an area (used by the semáforo line and the Riesgo tab). */
export function useRiskForecast(area: Area) {
  const key = JSON.stringify(area);
  const [state, setState] = useState<Load<RiskForecastResponse> & { key: string }>({ key: '' });
  useEffect(() => { const c = new AbortController(); setState({ key }); getRiskForecast(area, c.signal).then(data => setState({ key, data })).catch(error => { if (!c.signal.aborted) setState({ key, error }); }); return () => c.abort(); }, [key]);
  return state.key === key ? state : { key };
}
export function forecastUnavailable(error: unknown) { return error instanceof ApiError && error.status === 503; }

export function ForecastPanel({ area, lang }: { area: Area; lang: Lang }) {
  const t = T[lang], fc = useRiskForecast(area);
  if (fc.error) return <Banner status={forecastUnavailable(fc.error) ? 'warning' : 'error'} title={t.unavailable} description={fc.error instanceof ApiError ? `API ${fc.error.status}${fc.error.code ? `, ${fc.error.code}` : ''}` : String(fc.error)} />;
  if (!fc.data) return <Skeleton width="100%" height="10rem" />;
  const d = fc.data, ltm = d.climatology.fwi_ltm ?? null;
  const top = Math.max(1, ltm ?? 0, ...d.days.map(x => x.fwi_max ?? x.fwi_mean ?? 0));
  return <Card padding={5}><VStack gap={3}>
    <HStack gap={2} wrap="wrap" vAlign="center"><Heading level={3}>{t.fc}</Heading><Badge label={d.level.toUpperCase()} variant={levelVariant(d.level)} />{d.stale && <Badge label={t.stale.toUpperCase()} variant="warning" />}</HStack>
    <Text>{d.summary_es}</Text>
    <Box xs={s.bars} role="img" aria-label={d.days.map(x => `${x.date}: FWI ${x.fwi_mean ?? '—'}`).join('; ')}>
      {d.days.map(x => <Box key={x.date} xs={s.barCol} title={`${x.date}, FWI ${x.fwi_mean ?? '—'} (máx ${x.fwi_max ?? '—'}), ${x.effis_class ?? ''}`}><Box xs={s.bar} style={{ height: `${Math.max(2, ((x.fwi_mean ?? 0) / top) * 100)}%`, backgroundColor: cividis(Math.min(1, (x.fwi_mean ?? 0) / Math.max(1, ltm ?? top))) }} /></Box>)}
      {ltm != null && <Inline xs={s.ltm} style={{ bottom: `${(ltm / top) * 100}%`, borderTopColor: fwiInk.climatology }}><Inline xs={s.ltmLabel}>{t.clim} {monthShort[lang][d.month - 1]}, {ltm}</Inline></Inline>}
    </Box>
    <Box xs={s.ticks}>{d.days.map(x => <Inline key={x.date}>{x.date.slice(8, 10)}</Inline>)}</Box>
    <Text type="supporting">{d.source}, {t.run} {d.forecast_run}, {d.note ?? ''}</Text>
  </VStack></Card>;
}

export function PriorityPanel({ area, lang }: { area: Area; lang: Lang }) {
  const t = T[lang], app = useApp();
  const key = JSON.stringify(area);
  const [state, setState] = useState<Load<PriorityCellsResponse> & { key: string }>({ key: '' });
  useEffect(() => { const c = new AbortController(); setState({ key }); getPriorityCells(area, undefined, c.signal).then(data => setState({ key, data })).catch(error => { if (!c.signal.aborted) setState({ key, error }); }); return () => c.abort(); }, [key]);
  if (state.key !== key || (!state.data && !state.error)) return <Skeleton width="100%" height="12rem" />;
  if (state.error || !state.data) return <Banner status="warning" title={t.pr} description={state.error instanceof ApiError && state.error.code === 'area_too_large' ? t.tooLarge : state.error instanceof ApiError ? `API ${state.error.status}${state.error.code ? `, ${state.error.code}` : ''}` : String(state.error)} />;
  const d = state.data;
  const pop = (h3: string) => d.features.find(f => f.properties.h3 === h3)?.properties.population_10km;
  return <Card padding={5}><VStack gap={3}>
    <HStack gap={2} wrap="wrap" vAlign="center" hAlign="between"><Heading level={3}>{t.pr}</Heading><OutlineButton isOn={app.layers.priority} onClick={() => app.setLayer('priority', !app.layers.priority)}>{app.layers.priority ? t.hide : t.show}</OutlineButton></HStack>
    <Text>{d.summary_es}</Text>
    <Caption>{t.top}, {d.period}</Caption>
    <VStack gap={0}>{d.top10.map((c, i) => <Box key={c.h3} xs={s.row}>
      <Inline xs={s.rank}>{i + 1}</Inline>
      <Inline><Inline>{c.h3}</Inline><Inline xs={s.sub}>, {c.level}{pop(c.h3) ? `, ${new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-MX').format(pop(c.h3) as number)} ${t.pop}` : ''}</Inline></Inline>
      <Inline xs={s.track}><Inline xs={s.fill} style={{ display: 'block', width: `${c.index}%`, backgroundColor: cividis(c.index / 100) }} /></Inline>
      <Inline xs={s.num}>{c.index.toFixed(0)}</Inline>
    </Box>)}</VStack>
    <Text type="supporting">{d.method} {d.disclaimer ?? ''} {t.note}</Text>
  </VStack></Card>;
}
