import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Banner } from '@astryxdesign/core/Banner';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Popover } from '@astryxdesign/core/Popover';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { getDaily, getReturnPeriod, type CalendarResponse, type DailyRow, type ReturnPeriodResponse } from '../../api/client';
import { useApp } from '../../state/AppState';
import { monthNames } from '../../i18n';
import { SELECTED_FILL, SELECTED_INK, dailyBar, encodeCell } from '../../lib/dataviz';
import { apiMessage, calendarQuery, fmt, monthRank } from '../../lib/explorerLabels';
import { Box, Caption, Inline, LinkButton } from '../../ui/kit';

const s = stylex.create({
  card: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 14px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-emphasized)', borderRadius: '10px', backgroundColor: 'var(--color-background-muted)', position: 'relative' },
  top: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '14px', alignItems: 'center' },
  text: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 },
  sentence: { fontSize: '14.5px', lineHeight: 1.4, textWrap: 'pretty' },
  bold: { fontWeight: 600 },
  meta: { fontSize: '12px', color: 'var(--color-text-secondary)' },
  badge: { display: 'grid', placeItems: 'center', minWidth: '64px', height: '48px', paddingInline: '8px', borderRadius: '8px', fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace', fontWeight: 600, fontSize: '15px' },
  close: { position: 'absolute', top: '6px', right: '8px', borderWidth: 0, backgroundColor: 'transparent', color: 'var(--color-text-disabled)', cursor: 'pointer', fontSize: '14px', lineHeight: 1, ':hover': { color: 'var(--color-text-primary)' } },
  daily: { display: 'flex', flexDirection: 'column', gap: '4px' },
  dailyHead: { display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11px', color: 'var(--color-text-disabled)' },
  bars: { display: 'flex', alignItems: 'flex-end', gap: '2px', height: '44px' },
  bar: { flexGrow: 1, flexBasis: 0, minHeight: '2px', borderRadius: '1px', borderWidth: 0, padding: 0, cursor: 'pointer', ':focus-visible': { outline: '2px solid var(--color-accent)', outlineOffset: '1px' } },
  ticks: { display: 'flex', justifyContent: 'space-between', fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace', fontSize: '10px', color: 'var(--color-text-disabled)' },
  note: { fontSize: '11px', color: 'var(--color-text-disabled)' },
});
interface ObservedDailyRow extends DailyRow { count_raw?: number | null }

export default function CellPanel({ data, loading, error }: { data: CalendarResponse | null; loading: boolean; error: string | null }) {
  const app = useApp(), sel = app.selected, L = app.lang;
  const [daily, setDaily] = useState<ObservedDailyRow[]>([]), [rp, setRp] = useState<ReturnPeriodResponse | null>(null), [pending, setPending] = useState(true), [dailyError, setDailyError] = useState<string | null>(null);
  const areaKey = JSON.stringify(app.area.area);
  useEffect(() => {
    if (!sel) return; const c = new AbortController(); setPending(true); setDailyError(null); setDaily([]);
    Promise.all([getDaily(app.area.area, sel.year, sel.month, c.signal), getReturnPeriod(app.area.area, sel.year, sel.month, c.signal).catch(() => null)])
      .then(([days, period]) => { setDaily(Array.isArray(days) ? days : days.rows ?? days.days ?? []); setRp(period); })
      .catch(e => { if (!c.signal.aborted) setDailyError(apiMessage(e, L)); }).finally(() => { if (!c.signal.aborted) setPending(false); });
    return () => c.abort();
  }, [areaKey, sel?.year, sel?.month, L]);
  if (!sel) return null;
  if (loading) return <Skeleton width="100%" height="9rem" />;
  if (error) return <Banner status="error" title={error} />;
  if (!data) return null;
  const row = data.rows.find(r => r.year === sel.year && r.month === sel.month);
  const name = monthNames[L][sel.month - 1], value = app.metric === 'frp' ? row?.frp_harm : row?.count_harm, rank = row ? monthRank(data.rows, row, app.metric) : null, ratio = row?.anomaly_ratio;
  const daysInMonth = new Date(sel.year, sel.month, 0).getDate();
  const byDay = new Map(daily.map((r, i) => [r.day ?? (r.date ? Number(r.date.slice(-2)) : i + 1), r.count_raw ?? r.count_harm ?? 0]));
  const days = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, count: byDay.get(i + 1) ?? 0, date: `${sel.year}-${String(sel.month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}` }));
  const peak = Math.max(1, ...days.map(d => d.count));
  const max = Math.max(1, ...data.rows.map(r => app.metric === 'frp' ? r.frp_harm ?? 0 : r.count_harm ?? 0));
  const isTop = (ratio ?? 0) >= 2 || rank?.rank === 1;
  const badgeBg = app.mode === 'count' && isTop ? SELECTED_FILL : encodeCell(row, 'anomaly', app.metric, max, app.scheme).background;
  const badgeFg = app.mode === 'count' && isTop ? SELECTED_INK : encodeCell(row, 'anomaly', app.metric, max, app.scheme).color;
  const query = calendarQuery(app.area.area, app.from, app.to, app.metric, app.reference, app.burn);
  const provenance = `${data.attribution || 'NASA FIRMS'} · ${data.methodology_version} · ${data.data_cutoff}`;
  const unit = app.metric === 'frp' ? 'MW FRP' : L === 'en' ? 'detections' : 'puntos';
  const ref = app.reference === 'median' ? (L === 'en' ? 'median' : 'mediana') : (L === 'en' ? 'mean' : L === 'pt' ? 'média' : 'media');
  const rankText = rank?.rank === 1 ? (L === 'es' ? `El ${name} más activo desde ${data.rows[0]?.year ?? 2001}.` : L === 'pt' ? `O ${name} mais ativo desde ${data.rows[0]?.year ?? 2001}.` : `The most active ${name} since ${data.rows[0]?.year ?? 2001}.`) : rank ? (L === 'en' ? `#${rank.rank} of ${rank.total} ${name}s.` : `${rank.rank}º de ${rank.total} ${name}s.`) : '';
  const sourceText = row?.is_estimated ? (L === 'en' ? 'Estimated from MODIS' : 'Estimado desde MODIS') : 'MODIS + VIIRS';
  return (
    <Box as="section" xs={s.card} aria-label={L === 'en' ? 'Selected cell' : 'Celda seleccionada'}>
      <button type="button" aria-label={L === 'en' ? 'Close' : 'Cerrar'} onClick={() => app.setSelected(null)} {...stylex.props(s.close)}>×</button>
      <Box xs={s.top}>
        <Box xs={s.text}>
          <Caption>{L === 'en' ? 'Selected cell' : L === 'pt' ? 'Célula selecionada' : 'Celda seleccionada'} · {name} {sel.year}</Caption>
          <Inline xs={s.sentence}><Box as="b" xs={s.bold}>{fmt(value, L, value != null && value < 10 ? 1 : 0)} {unit}</Box>{ratio != null ? `, ${fmt(ratio, L, 1)}× ${L === 'en' ? 'the' : 'la'} ${ref} ${L === 'en' ? 'for' : 'de'} ${name}.` : '.'} {rankText}</Inline>
          <Inline xs={s.meta}>{sourceText}{rp?.return_period_years != null ? ` · ${L === 'en' ? 'once every' : '1 vez cada'} ${fmt(rp.return_period_years, L, 1)} ${L === 'en' ? 'years' : 'años'}` : ''} · <Popover label="Consulta" content={<VStack gap={2}><Text type="supporting">GET {query}</Text><Text type="supporting">{provenance}</Text></VStack>}><LinkButton>{L === 'en' ? 'view data' : 'ver datos'}</LinkButton></Popover></Inline>
        </Box>
        {ratio != null && <Inline xs={s.badge} style={{ backgroundColor: badgeBg, color: badgeFg }}>{fmt(ratio, L, 1)}×</Inline>}
      </Box>
      <Box xs={s.daily}>
        <Box xs={s.dailyHead}><Inline>{L === 'en' ? 'Daily breakdown (observed) · click a day to see it on the map' : L === 'pt' ? 'Detalhamento diário (observado) · clique em um dia para vê-lo no mapa' : 'Desglose diario (observado) · clic en un día para verlo en el mapa'}</Inline>{app.selectedDay && <LinkButton onClick={() => app.setSelectedDay(null)}>{L === 'en' ? 'all days' : 'todos los días'}</LinkButton>}</Box>
        {pending ? <Skeleton width="100%" height="44px" /> : dailyError ? <Banner status="error" title={dailyError} /> : <>
          <Box xs={s.bars} role="group" aria-label={L === 'en' ? 'Detections per day' : 'Detecciones por día'}>
            {days.map(d => { const on = app.selectedDay === d.date; return <button key={d.date} type="button" aria-pressed={on} aria-label={`${d.day} ${name}: ${d.count}`} title={`${d.day} ${name}: ${d.count}`} onClick={() => app.setSelectedDay(on ? null : d.date)} {...stylex.props(s.bar)} style={{ height: `${Math.max(4, (d.count / peak) * 100)}%`, backgroundColor: on ? dailyBar.picked : d.count ? dailyBar.base : 'var(--color-border-emphasized)', opacity: app.selectedDay && !on ? 0.45 : 1 }} />; })}
          </Box>
          <Box xs={s.ticks}><Inline>1</Inline><Inline>8</Inline><Inline>15</Inline><Inline>22</Inline><Inline>{daysInMonth}</Inline></Box>
        </>}
      </Box>
    </Box>
  );
}
