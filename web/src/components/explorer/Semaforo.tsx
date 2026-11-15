import * as stylex from '@stylexjs/stylex';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Banner } from '@astryxdesign/core/Banner';
import { Popover } from '@astryxdesign/core/Popover';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import type { CalendarResponse } from '../../api/client';
import { useApp } from '../../state/AppState';
import { monthNames } from '../../i18n';
import { calendarQuery, fmt, newest } from '../../lib/explorerLabels';
import { amberLabel, mapInk } from '../../lib/dataviz';
import { useRiskForecast, forecastUnavailable } from '../analysis/ForecastPriority';
import { Box, Caption, Inline, LinkButton } from '../../ui/kit';

const s = stylex.create({
  root: { padding: '18px 22px', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--color-border)', display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '18px', alignItems: 'start', '@media (max-width: 720px)': { padding: '16px', gap: '14px' } },
  lights: { display: 'flex', flexDirection: 'column', gap: '5px', padding: '7px', borderRadius: '12px', backgroundColor: 'var(--color-background-muted)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' },
  light: { width: '14px', height: '14px', borderRadius: '50%', backgroundColor: 'var(--color-border-emphasized)' },
  body: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 },
  top: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  tag: { padding: '2px 6px', borderRadius: '4px', fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace', fontSize: '10px', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' },
  headline: { display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' },
  ratio: { fontSize: '40px', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1 },
  sentence: { fontSize: '16px', lineHeight: 1.35, maxWidth: '380px', textWrap: 'pretty' },
  bold: { fontWeight: 600 },
  facts: { display: 'flex', flexWrap: 'wrap', columnGap: '16px', rowGap: '4px', fontSize: '12.5px', color: 'var(--color-text-secondary)', lineHeight: 1.5 },
  strong: { color: 'var(--color-text-primary)', fontWeight: 600 },
  forecast: { fontSize: '12.5px', color: 'var(--color-text-secondary)', borderTopWidth: '1px', borderTopStyle: 'dashed', borderTopColor: 'var(--color-border)', paddingTop: '6px', marginTop: '2px' },
  empty: { fontSize: '13px', color: 'var(--color-text-secondary)' },
});
const l = {
  es: { current: 'Mes actual', last: 'Último mes con datos', day: 'al día', above: 'Muy por encima · > P90', high: 'Por encima · > P75', normal: 'Normal', below: 'Por debajo', goes: 'va', over: 'sobre la', under: 'de la', historical: 'histórica para estas fechas.', belowTxt: 'por debajo de lo normal.', points: 'puntos', normally: 'lo normal serían', return: 'así ocurre', once: '1 vez cada', years: 'años', data: 'ver datos', query: 'Consulta exacta', unavailable: 'Sin referencia histórica para este mes', median: 'mediana', mean: 'media', none: 'Sin datos para el semáforo', a: 'Un' },
  en: { current: 'Current month', last: 'Latest month with data', day: 'through day', above: 'Far above · > P90', high: 'Above · > P75', normal: 'Normal', below: 'Below', goes: 'is at', over: 'above the', under: 'of the', historical: 'historical level for these dates.', belowTxt: 'below normal.', points: 'detections', normally: 'normally about', return: 'like this happens', once: 'once every', years: 'years', data: 'view data', query: 'Exact query', unavailable: 'No historical reference for this month', median: 'median', mean: 'mean', none: 'No data for the signal', a: 'A' },
  pt: { current: 'Mês atual', last: 'Último mês com dados', day: 'até o dia', above: 'Muito acima · > P90', high: 'Acima · > P75', normal: 'Normal', below: 'Abaixo', goes: 'está', over: 'acima da', under: 'da', historical: 'histórica para estas datas.', belowTxt: 'abaixo do normal.', points: 'pontos', normally: 'o normal seria', return: 'assim ocorre', once: '1 vez a cada', years: 'anos', data: 'ver dados', query: 'Consulta exata', unavailable: 'Sem referência histórica para este mês', median: 'mediana', mean: 'média', none: 'Sem dados para o semáforo', a: 'Um' },
};

export default function Semaforo({ data, loading, error }: { data: CalendarResponse | null; loading: boolean; error: string | null }) {
  const app = useApp(), t = l[app.lang];
  const fc = useRiskForecast(app.area.area);
  const fcLine = fc.data ? <Inline xs={s.forecast}>{fc.data.stale ? `${app.lang === 'en' ? 'Stale forecast' : 'Pronóstico desactualizado'} (${fc.data.forecast_run}) · ` : ''}{fc.data.summary_es.split(':')[0]}.</Inline> : fc.error ? <Inline xs={s.forecast}>{forecastUnavailable(fc.error) ? (app.lang === 'en' ? 'Weather fire danger forecast unavailable (GFWED).' : 'Pronóstico de peligro meteorológico no disponible (GFWED).') : ''}</Inline> : null;
  if (loading) return <Box xs={s.root}><Skeleton width="2.25rem" height="4.5rem" /><Skeleton width="100%" height="6rem" /></Box>;
  if (error) return <Box xs={s.root}><Banner status="error" title={error} /></Box>;
  const populated = data?.rows.filter(row => app.metric === 'frp' ? row.frp_harm != null : row.count_harm != null) ?? [];
  if (!data || !populated.length) return <Box xs={s.root}><Box xs={s.lights}>{[0, 1, 2].map(i => <Inline key={i} xs={s.light} />)}</Box><Inline xs={s.empty}>{t.none}</Inline></Box>;
  const row = newest(populated), ratio = row.anomaly_ratio, count = app.metric === 'frp' ? row.frp_harm : row.count_harm;
  const level = ratio == null ? 'none' : (row.percentile ?? 0) >= 0.9 ? 'red' : (row.percentile ?? 0) >= 0.75 ? 'amber' : 'green';
  const status = ratio == null ? t.unavailable : level === 'red' ? t.above : level === 'amber' ? t.high : ratio < 1 ? t.below : t.normal;
  const cutoff = data.data_cutoff ?? '';
  const isCurrent = cutoff.slice(0, 7) === `${row.year}-${String(row.month).padStart(2, '0')}`;
  const dayOf = isCurrent ? Number(cutoff.slice(8, 10)) : null;
  const name = monthNames[app.lang][row.month - 1];
  const ref = app.reference === 'mean' ? t.mean : t.median;
  const query = calendarQuery(app.area.area, app.from, app.to, app.metric, app.reference, app.burn);
  const provenance = `${data.attribution || 'NASA FIRMS'} · ${data.methodology_version} · ${data.data_cutoff}`;
  const details = <VStack gap={2}><Text>{t.query}</Text><Text type="supporting">GET {query}</Text><Text type="supporting">{provenance}</Text></VStack>;
  const verDatos = <Popover label={t.query} content={details}><LinkButton>{t.data}</LinkButton></Popover>;
  const on = { red: mapInk.semaphore.red, amber: mapInk.semaphore.amber, green: mapInk.semaphore.green } as const;
  const tagColors = level === 'red' ? mapInk.alertLabel : level === 'amber' ? amberLabel : { bg: 'var(--color-background-muted)', fg: 'var(--color-text-secondary)' };
  const r = fmt(ratio, app.lang, 1);
  return (
    <Box as="section" xs={s.root} aria-label={status}>
      <Box xs={s.lights} aria-hidden="true">{(['red', 'amber', 'green'] as const).map(c => <Inline key={c} xs={s.light} style={level === c ? { backgroundColor: on[c], boxShadow: `0 0 12px ${on[c]}` } : undefined} />)}</Box>
      <Box xs={s.body}>
        <Box xs={s.top}>
          <Caption>{isCurrent ? t.current : t.last} · {name} {row.year}{dayOf ? ` · ${t.day} ${dayOf}` : ''}</Caption>
          <Inline xs={s.tag} style={{ backgroundColor: tagColors.bg, color: tagColors.fg }}>{status}</Inline>
        </Box>
        {ratio != null && <Box xs={s.headline}>
          <Inline xs={s.ratio}>{r}×</Inline>
          <Inline xs={s.sentence}>{name[0].toUpperCase() + name.slice(1)} {t.goes} {ratio >= 1 ? <><Box as="b" xs={s.bold}>{r}× {t.over} {ref}</Box> {t.historical}</> : <><Box as="b" xs={s.bold}>{r}× {t.under} {ref}</Box>, {t.belowTxt}</>}</Inline>
        </Box>}
        <Box xs={s.facts}>
          {count != null && <Inline>{fmt(count, app.lang)} {app.metric === 'frp' ? 'MW FRP' : t.points}{dayOf ? ` · ${dayOf} d` : ''}; {t.normally} ~{ratio && ratio > 0 ? fmt(count / ratio, app.lang) : '—'} · {verDatos}</Inline>}
          {row.return_period_years != null && <Inline>{t.a} {name} {t.return} <Box as="b" xs={s.strong}>{t.once} {fmt(row.return_period_years, app.lang, 1)} {t.years}</Box> · {verDatos}</Inline>}
        </Box>
        {fcLine}
      </Box>
    </Box>
  );
}
