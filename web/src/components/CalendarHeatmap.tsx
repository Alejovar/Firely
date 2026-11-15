import { useMemo } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Banner } from '@astryxdesign/core/Banner';
import { useGridFocus } from '@astryxdesign/core/hooks';
import type { CalendarResponse } from '../api/client';
import { useApp } from '../state/AppState';
import { monthNames, monthShort } from '../i18n';
import { CIVIDIS_GRADIENT, DIVERGING_GRADIENT, SELECTED_FILL, CLOUDY_CLEAR_FRAC, encodeCell, mapInk } from '../lib/dataviz';
import { compact, fmt, newest, yearPhase } from '../lib/explorerLabels';
import { Box, Inline } from '../ui/kit';

const HATCH = 'repeating-linear-gradient(135deg, transparent 0 2px, rgba(0,0,0,.55) 2px 3.5px)';
const s = stylex.create({
  wrap: { display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 },
  label: { fontSize: '12.5px', color: 'var(--color-text-secondary)' },
  scroll: { overflowX: 'auto', maxWidth: '100%' },
  grid: { display: 'grid', gridTemplateColumns: '54px repeat(12, minmax(14px, 1fr)) 38px', columnGap: '3px', rowGap: '3px', minWidth: '340px' },
  head: { fontSize: '11.5px', fontWeight: 400, color: 'var(--color-text-secondary)', textAlign: 'center', paddingBottom: '5px', lineHeight: 1 },
  headOn: { color: 'var(--color-text-primary)', fontWeight: 700 },
  year: { display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-family-heading)', fontSize: '13.5px', fontWeight: 500, fontVariantNumeric: 'lining-nums tabular-nums', color: 'var(--color-text-secondary)', height: '16px', lineHeight: 1 },
  yearOn: { color: 'var(--color-text-primary)', fontWeight: 700 },
  mark: { width: '2px', height: '16px', flexShrink: 0 },
  gc: { display: 'block', height: '16px' },
  cell: {
    position: 'relative', display: 'block', width: '100%', height: '16px', borderWidth: 0, borderRadius: '1px', padding: 0, cursor: 'pointer',
    ':hover': { boxShadow: '0 0 0 1px var(--color-text-secondary)' }, ':focus-visible': { outline: '2px solid var(--color-accent)', outlineOffset: '1px' },
  },
  cellSel: { zIndex: 1, boxShadow: { default: '0 0 0 1.5px var(--color-text-primary), 0 0 0 3px var(--color-background-surface)', ':hover': '0 0 0 1.5px var(--color-text-primary), 0 0 0 3px var(--color-background-surface)' } },
  cellNone: { cursor: 'default', ':hover': { boxShadow: 'none' } },
  hatch: { position: 'absolute', inset: 0, borderRadius: '1px', backgroundImage: HATCH, pointerEvents: 'none' },
  oni: { display: 'flex', alignItems: 'center', paddingLeft: '4px', fontSize: '10.5px', fontWeight: 500, height: '16px' },
  legend: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--color-text-secondary)' },
  legendL: { display: 'flex', alignItems: 'center', gap: '8px', fontVariantNumeric: 'tabular-nums' },
  bar: { width: '130px', height: '8px', borderRadius: '1px' },
  legendR: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' },
  key: { display: 'flex', alignItems: 'center', gap: '5px' },
  keyMark: { width: '2px', height: '12px', backgroundColor: 'var(--color-text-secondary)' },
  keyHatch: { width: '14px', height: '10px', borderRadius: '1px', backgroundImage: `repeating-linear-gradient(135deg, #7c7b78 0 2px, rgba(0,0,0,.55) 2px 3.5px)` },
  keyOni: { display: 'flex', gap: '8px', fontSize: '12px' },
  empty: { fontSize: '13px', color: 'var(--color-text-secondary)', padding: '12px 0' },
});

export default function CalendarHeatmap({ data, loading, error, label }: { data: CalendarResponse | null; loading: boolean; error: string | null; label?: string }) {
  const app = useApp(), L = app.lang;
  const years = useMemo(() => [...new Set(data?.rows.map(r => r.year) ?? [])].sort((a, b) => b - a), [data]);
  const lookup = useMemo(() => new Map(data?.rows.map(r => [`${r.year}-${r.month}`, r]) ?? []), [data]);
  const max = Math.max(1, ...(data?.rows.map(r => app.metric === 'frp' ? r.frp_harm ?? 0 : r.count_harm ?? 0) ?? []));
  const { gridRef, handleKeyDown, handleFocus } = useGridFocus<HTMLElement>({ columns: 14, cellSelector: '[role="gridcell"]', getFocusTarget: cell => cell.querySelector<HTMLElement>('button'), isCellFocusable: cell => !!cell.querySelector('button'), hasRovingTabIndex: true });
  if (loading) return <Skeleton width="100%" height="27rem" />;
  if (error) return <Banner status="error" title={error} />;
  if (!data?.rows.length) return <Inline xs={s.empty}>{L === 'es' ? 'No hay puntos de calor en esta área y fechas. Amplía el área o el periodo.' : L === 'pt' ? 'Não há focos nesta área e período. Amplie a área ou o período.' : 'No hotspots in this area and period. Widen the area or the dates.'}</Inline>;
  const initial = newest(data.rows);
  const est = data.harmonization_uncertainty?.years_estimated;
  const uncertainty = data.harmonization_uncertainty?.median_rel_error;
  const unit = app.metric === 'frp' ? 'MW' : (L === 'en' ? 'detections' : 'puntos');
  const ref = app.reference === 'mean' ? (L === 'en' ? 'mean' : L === 'pt' ? 'média' : 'media') : (L === 'en' ? 'median' : 'mediana');
  return (
    <Box xs={s.wrap}>
      {label && <Inline xs={s.label}>{label}</Inline>}
      <Box xs={s.scroll}>
        <Box role="grid" aria-label={label || (L === 'en' ? 'Activity calendar' : 'Calendario de actividad')} xs={s.grid} ref={gridRef} onKeyDown={handleKeyDown} onFocus={handleFocus}>
          <Box role="row" style={{ display: 'contents' }}>
            <Inline role="columnheader" xs={s.head} />
            {monthShort[L].map((m, i) => <Inline role="columnheader" key={i} xs={[s.head, app.selected?.month === i + 1 && s.headOn]} title={monthNames[L][i]}>{m[0].toUpperCase()}</Inline>)}
            <Inline role="columnheader" xs={s.head} title={L === 'en' ? 'ENSO phase (NOAA ONI)' : 'Fase ENSO según el índice ONI de NOAA'}>ONI</Inline>
          </Box>
          {years.map(year => {
            const rows = Array.from({ length: 12 }, (_, i) => lookup.get(`${year}-${i + 1}`));
            const phase = yearPhase(data.rows, year);
            const isEst = rows.some(r => r?.is_estimated);
            return <Box role="row" key={year} style={{ display: 'contents' }}>
              <Inline role="rowheader" xs={[s.year, app.selected?.year === year && s.yearOn]} title={isEst ? `${L === 'en' ? 'Estimated from MODIS' : 'Estimado desde MODIS'}${uncertainty != null ? `, ±${fmt(uncertainty * 100, L, 1)} %` : ''}` : undefined}>
                <Inline xs={s.mark} style={{ backgroundColor: isEst ? 'var(--color-border-emphasized)' : 'transparent' }} />{year}
              </Inline>
              {rows.map((row, i) => {
                const enc = encodeCell(row, app.mode, app.metric, max, app.scheme);
                const value = app.metric === 'frp' ? row?.frp_harm : row?.count_harm;
                const selected = app.selected?.year === year && app.selected.month === i + 1;
                const cloudy = row?.clear_frac != null && row.clear_frac < CLOUDY_CLEAR_FRAC;
                const text = `${monthNames[L][i]} ${year}: ${fmt(value, L, value != null && value < 10 ? 1 : 0)} ${unit}${row?.anomaly_ratio != null ? `, ${fmt(row.anomaly_ratio, L, 1)}× ${ref}` : ''}${row?.is_estimated ? (L === 'en' ? ', estimated' : ', estimado') : ''}${cloudy ? `, ${L === 'en' ? 'cloudy' : 'nublado'} (${fmt((1 - (row!.clear_frac as number)) * 100, L)} %)` : ''}`;
                return <Inline role="gridcell" key={i} xs={s.gc}>
                  <button type="button" disabled={!row} title={row ? text : undefined} aria-label={row ? text : `${monthNames[L][i]} ${year}`} aria-selected={selected}
                    tabIndex={selected || (!app.selected && year === initial.year && i + 1 === initial.month) ? 0 : -1}
                    onClick={() => row && app.setSelected(selected ? null : { year, month: i + 1 })}
                    {...stylex.props(s.cell, selected && s.cellSel, !row && s.cellNone)} style={{ backgroundColor: selected ? SELECTED_FILL : enc.background }}>
                    {cloudy && <Inline xs={s.hatch} />}
                  </button>
                </Inline>;
              })}
              <Inline role="gridcell" xs={s.oni} style={{ color: phase === 'nina' ? mapInk.nina : mapInk.nino }}>{phase === 'nina' ? 'Niña' : phase === 'nino' ? 'Niño' : ''}</Inline>
            </Box>;
          })}
        </Box>
      </Box>
      <Box xs={s.legend}>
        <Inline xs={s.legendL}>{app.mode === 'count' ? <>0<Inline xs={s.bar} style={{ backgroundImage: CIVIDIS_GRADIENT }} />{compact(max, L)}</> : <>⅛×<Inline xs={s.bar} style={{ backgroundImage: DIVERGING_GRADIENT }} />8×</>}</Inline>
        <Inline xs={s.legendR}>
          <Inline xs={s.key}><Inline xs={s.keyMark} />{L === 'en' ? 'Estimated from MODIS' : L === 'pt' ? 'Estimado a partir do MODIS' : 'Estimado desde MODIS'}{est?.length ? ` (${est[0]}–${est[est.length - 1]})` : ''}</Inline>
          <Inline xs={s.key}><Inline xs={s.keyHatch} />{L === 'en' ? 'Clouds' : L === 'pt' ? 'Nuvens' : 'Nubes'}</Inline>
          <Inline xs={s.keyOni}><Inline style={{ color: mapInk.nina }}>Niña</Inline><Inline style={{ color: mapInk.nino }}>Niño</Inline></Inline>
        </Inline>
      </Box>
    </Box>
  );
}
