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
import { Box, Caption, Figure, Inline, LinkButton } from '../../ui/kit';

const s = stylex.create({
  root: { padding: '18px 22px', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--color-border)', display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '18px', alignItems: 'start', '@media (max-width: 720px)': { padding: '16px', gap: '14px' } },
  lights: { display: 'flex', flexDirection: 'column', gap: '5px', padding: '6px', borderRadius: '4px', backgroundColor: 'var(--color-background-body)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-emphasized)' },
  light: { width: '14px', height: '14px', borderRadius: '50%', backgroundColor: 'var(--color-border)' },
  body: { display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 },
  top: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  tag: { padding: '2px 7px', borderRadius: '2px', fontSize: '12px', fontWeight: 700, lineHeight: 1.4 },
  headline: { display: 'flex', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap' },
  ratio: { fontSize: '46px', fontVariationSettings: '"opsz" 24' },
  sentence: { fontSize: '16px', lineHeight: 1.4, maxWidth: '36ch', textWrap: 'pretty' },
  bold: { fontWeight: 700 },
  facts: { display: 'flex', flexDirection: 'column', rowGap: '2px', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5, maxWidth: '62ch' },
  strong: { color: 'var(--color-text-primary)', fontWeight: 700 },
  forecast: { fontSize: '13px', color: 'var(--color-text-secondary)', borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--color-border)', paddingTop: '8px', marginTop: '2px' },
  empty: { fontSize: '13px', color: 'var(--color-text-secondary)' },
});
const l = {
  es: { current: 'Mes actual', last: 'Último mes con datos', day: 'al día', above: 'Muy por encima de lo normal', high: 'Por encima de lo normal', normal: 'Normal', below: 'Por debajo', goes: 'va', over: 'sobre la', under: 'de la', historical: 'histórica para estas fechas.', belowTxt: 'por debajo de lo normal.', points: 'puntos', normally: 'lo normal serían', return: 'así ocurre', once: '1 vez cada', years: 'años', data: 'Ver datos', query: 'Consulta exacta', unavailable: 'Sin referencia histórica para este mes', median: 'mediana', mean: 'media', none: 'Sin datos para comparar con lo normal. Elige un área o un periodo más amplio.', a: 'Un', days: 'días', about: 'unos', p90: 'Más alto que en el 90 % de los años', p75: 'Más alto que en el 75 % de los años' },
  en: { current: 'Current month', last: 'Latest month with data', day: 'through day', above: 'Far above normal', high: 'Above normal', normal: 'Normal', below: 'Below', goes: 'is at', over: 'above the', under: 'of the', historical: 'historical level for these dates.', belowTxt: 'below normal.', points: 'detections', normally: 'normally about', return: 'like this happens', once: 'once every', years: 'years', data: 'View data', query: 'Exact query', unavailable: 'No historical reference for this month', median: 'median', mean: 'mean', none: 'No data to compare with normal. Choose a larger area or period.', a: 'A', days: 'days', about: 'about', p90: 'Higher than in 90% of years', p75: 'Higher than in 75% of years' },
  pt: { current: 'Mês atual', last: 'Último mês com dados', day: 'até o dia', above: 'Muito acima do normal', high: 'Acima do normal', normal: 'Normal', below: 'Abaixo', goes: 'está', over: 'acima da', under: 'da', historical: 'histórica para estas datas.', belowTxt: 'abaixo do normal.', points: 'pontos', normally: 'o normal seria', return: 'assim ocorre', once: '1 vez a cada', years: 'anos', data: 'Ver dados', query: 'Consulta exata', unavailable: 'Sem referência histórica para este mês', median: 'mediana', mean: 'média', none: 'Sem dados para comparar com o normal. Escolha uma área ou período maior.', a: 'Um', days: 'dias', about: 'cerca de', p90: 'Mais alto que em 90% dos anos', p75: 'Mais alto que em 75% dos anos' },
};

export default function Semaforo({ data, loading, error }: { data: CalendarResponse | null; loading: boolean; error: string | null }) {
  const app = useApp(), t = l[app.lang];
  const fc = useRiskForecast(app.area.area);
  const fcLine = fc.data ? <Inline xs={s.forecast}>{fc.data.stale ? `${app.lang === 'en' ? 'Stale forecast' : 'Pronóstico desactualizado'} (${fc.data.forecast_run}). ` : ''}{fc.data.summary_es.split(':')[0]}.</Inline> : fc.error ? <Inline xs={s.forecast}>{forecastUnavailable(fc.error) ? (app.lang === 'en' ? 'Weather fire danger forecast unavailable (GFWED).' : 'Pronóstico de peligro meteorológico no disponible (GFWED).') : ''}</Inline> : null;
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
  const details = <VStack gap={2}><Text>{t.query}</Text><Text type="code">GET {query}</Text><Text type="supporting">{data.attribution || 'NASA FIRMS'}<br />{app.lang === 'en' ? 'Method' : 'Método'} {data.methodology_version}<br />{app.lang === 'en' ? 'Data until' : 'Datos hasta'} {data.data_cutoff}</Text></VStack>;
  const verDatos = <Popover label={t.query} content={details}><LinkButton>{t.data}</LinkButton></Popover>;
  const on = { red: mapInk.semaphore.red, amber: mapInk.semaphore.amber, green: mapInk.semaphore.green } as const;
  const tagColors = level === 'red' ? mapInk.alertLabel : level === 'amber' ? amberLabel : { bg: 'var(--color-background-muted)', fg: 'var(--color-text-secondary)' };
  const r = fmt(ratio, app.lang, 1);
  return (
    <Box as="section" xs={s.root} aria-label={status}>
      <Box xs={s.lights} aria-hidden="true">{(['red', 'amber', 'green'] as const).map(c => <Inline key={c} xs={s.light} style={level === c ? { backgroundColor: on[c] } : undefined} />)}</Box>
      <Box xs={s.body}>
        <Box xs={s.top}>
          <Caption>{isCurrent ? t.current : t.last}: {name} {row.year}{dayOf ? `, ${t.day} ${dayOf}` : ''}</Caption>
          <Inline xs={s.tag} title={level === 'red' ? t.p90 : level === 'amber' ? t.p75 : undefined} style={{ backgroundColor: tagColors.bg, color: tagColors.fg }}>{status}</Inline>
        </Box>
        {ratio != null && <Box xs={s.headline}>
          <Figure xs={s.ratio}>{r}×</Figure>
          <Inline xs={s.sentence}>{name[0].toUpperCase() + name.slice(1)} {t.goes} {ratio >= 1 ? <><Box as="b" xs={s.bold}>{r}× {t.over} {ref}</Box> {t.historical}</> : <><Box as="b" xs={s.bold}>{r}× {t.under} {ref}</Box>, {t.belowTxt}</>}</Inline>
        </Box>}
        <Box xs={s.facts}>
          {count != null && <Inline>{fmt(count, app.lang)} {app.metric === 'frp' ? 'MW FRP' : t.points}{dayOf ? ` ${app.lang === 'en' ? 'in' : 'en'} ${dayOf} ${t.days}` : ''}; {t.normally} {t.about} {ratio && ratio > 0 ? fmt(count / ratio, app.lang) : '—'}.</Inline>}
          {row.return_period_years != null && <Inline>{t.a} {name} {t.return} <Box as="b" xs={s.strong}>{t.once} {fmt(row.return_period_years, app.lang, 1)} {t.years}</Box>.</Inline>}
          <Inline>{verDatos}</Inline>
        </Box>
        {fcLine}
      </Box>
    </Box>
  );
}
