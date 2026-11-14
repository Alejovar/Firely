import { useMemo } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { Badge } from '@astryxdesign/core/Badge';
import { useGridFocus } from '@astryxdesign/core/hooks';
import type { CalendarResponse } from '../api/client';
import { useApp } from '../state/AppState';
import { monthNames, monthShort } from '../i18n';
import { divergingSteps, encodeCell, sequentialSteps } from '../lib/dataviz';
import { calendarCellValue, compact, fmt, words } from '../lib/explorerLabels';

const s = stylex.create({
  scroll: { overflowX: 'auto', maxWidth: '100%' },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(3.5rem, 1.4fr) repeat(12, minmax(1.5rem, 1fr)) minmax(3.5rem, 1.2fr)', gap: 'var(--spacing-1)', minWidth: '28rem', alignItems: 'center' },
  cell: { display: 'block', width: '100%', border: 'var(--spacing-0-5) solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', height: 'var(--spacing-8)', padding: '0', cursor: 'pointer', textAlign: 'center', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', font: 'inherit', ':focus-visible': { outline: 'var(--spacing-0-5) solid var(--color-border-focus)' } },
  selected: { outline: 'var(--spacing-0-5) solid var(--color-border-focus)' },
  estimated: { borderStyle: 'dotted' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  year: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-1)', whiteSpace: 'nowrap' },
  total: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 'var(--spacing-1)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  swatch: { width: 'var(--spacing-4)', height: 'var(--spacing-4)', borderRadius: 'var(--radius-sm)' },
});

export default function CalendarHeatmap({ data, loading, error }: { data: CalendarResponse | null; loading: boolean; error: string | null }) {
  const app = useApp(); const t = words[app.lang];
  const years = useMemo(() => [...new Set(data?.rows.map(r => r.year) ?? [])].sort((a,b) => b-a), [data]);
  const lookup = useMemo(() => new Map(data?.rows.map(r => [`${r.year}-${r.month}`,r]) ?? []), [data]);
  const max = Math.max(1, ...(data?.rows.map(r => app.metric === 'frp' ? r.frp_harm ?? 0 : r.count_harm ?? 0) ?? []));
  const {gridRef, handleKeyDown, handleFocus} = useGridFocus<HTMLDivElement>({columns:13, cellSelector:'[role="gridcell"]', getFocusTarget: cell => cell.querySelector<HTMLElement>('button'), isCellFocusable: cell => !!cell.querySelector('button'), hasRovingTabIndex:true});
  const ramp = app.mode === 'count' ? sequentialSteps(app.scheme) : divergingSteps();
  return <Card><VStack gap={4}>
    <Heading level={2}>{t.calendar}</Heading>
    {loading ? <Skeleton width="100%" height="18rem" /> : error ? <Text color="secondary">{error}</Text> : !data?.rows.length ? <EmptyState title={t.empty} isCompact /> : <>
      <div {...stylex.props(s.scroll)} role="region" aria-label={t.calendar} tabIndex={0}>
        <div {...stylex.props(s.grid)} role="grid" aria-label={t.calendar} ref={gridRef} onKeyDown={handleKeyDown} onFocus={handleFocus}>
          <Text xstyle={s.header}>Año</Text>{monthShort[app.lang].map(m => <Text key={m} type="supporting" xstyle={s.header}>{m}</Text>)}<Text type="supporting" xstyle={s.header}>Total</Text>
          {years.flatMap(year => {
            const rows = Array.from({length:12},(_,i)=>lookup.get(`${year}-${i+1}`));
            const total = rows.reduce((sum,r)=>sum+(app.metric === 'frp' ? r?.frp_harm ?? 0 : r?.count_harm ?? 0),0);
            return [<HStack key={`${year}-label`} xstyle={s.year} gap={1} vAlign="center"><Text>{year}</Text>{rows.some(r=>r?.is_estimated)&&<Badge variant="info" label="E" />}</HStack>, ...rows.map((row,i) => {
              const encoding = encodeCell(row,app.mode,app.metric,max,app.scheme);
              const value = app.metric === 'frp' ? row?.frp_harm : row?.count_harm;
              const selected = app.selected?.year === year && app.selected.month === i+1;
              const label = `${year} ${monthNames[app.lang][i]}: ${fmt(value,app.lang)} ${app.metric === 'frp' ? 'FRP' : t.count}${row?.anomaly_ratio != null ? `, ${fmt(row.anomaly_ratio,app.lang,1)}× ${t[app.reference]}` : ''}`;
              const detail = row ? `${label} · retorno ${fmt(row.return_period_years,app.lang,1)} ${t.years}${row.clear_frac != null ? ` · despejado ${fmt(row.clear_frac*100,app.lang)} %` : ''}` : `${year} ${monthNames[app.lang][i]}: ${t.empty}`;
              return <Tooltip key={`${year}-${i}`} content={detail}><Text role="gridcell"><button {...stylex.props(s.cell,selected && s.selected,row?.is_estimated && s.estimated)} style={{backgroundColor:encoding.background,color:encoding.color}} type="button" tabIndex={selected ? 0 : -1} aria-label={label} aria-selected={selected} onClick={() => row && app.setSelected({year,month:i+1})}>{row ? calendarCellValue(value,app.lang) : '·'}</button></Text></Tooltip>;
            }), <Text key={`${year}-total`} role="gridcell" xstyle={s.total} hasTabularNumbers>{compact(total,app.lang)}</Text>];
          })}
        </div>
      </div>
      <HStack gap={2} wrap="wrap" vAlign="center"><Text type="supporting" color="secondary">{app.mode === 'count' ? `0 → ${compact(max,app.lang)}` : `<1× · 1× · >1×`}</Text><HStack gap={1} aria-label="Escala de color">{ramp.map((color,i)=><Text key={i} xstyle={s.swatch} style={{backgroundColor:color}}> </Text>)}</HStack><Text type="supporting" color="secondary">E junto al año y borde punteado = {t.estimated} · · = {t.empty}</Text></HStack>
      <Text type="supporting" color="secondary">{data.attribution || 'NASA FIRMS'} · {data.methodology_version} · {data.data_cutoff}</Text>
    </>}
  </VStack></Card>;
}
