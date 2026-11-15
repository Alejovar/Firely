import * as stylex from '@stylexjs/stylex';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import type { CalendarRow } from '../../api/client';
import { CLOUDY_CLEAR_FRAC, encodeCell } from '../../lib/dataviz';
import type { Lang } from '../../i18n';
import { monthShort } from '../../i18n';
const sx=stylex.create({row:{display:'grid',gridTemplateColumns:'minmax(2.5rem,auto) repeat(12,minmax(0,1fr))',gap:'var(--spacing-0-5)',width:'100%',minWidth:0},cell:{minHeight:'var(--spacing-2)',borderRadius:'var(--radius-1)'},estimated:{borderBottom:'var(--spacing-0-5) solid var(--color-data-neutral)'},cloud:{backgroundImage:'repeating-linear-gradient(135deg,transparent 0,transparent var(--spacing-1),var(--color-data-neutral) var(--spacing-1),var(--color-data-neutral) var(--spacing-1-5))'},active:{outline:'var(--spacing-0-5) solid var(--color-text-primary)',outlineOffset:'var(--spacing-0-5)'},year:{fontVariantNumeric:'tabular-nums'},small:{fontSize:'var(--font-size-xs)'}});
export function CompactCalendar({rows,lang,scheme,highlight,small=false}:{rows:CalendarRow[];lang:Lang;scheme:'light'|'dark';highlight?:{year?:number;month?:number};small?:boolean}) {
 void small; const years=[...new Set(rows.map(r=>r.year))].sort((a,b)=>b-a);const index=new Map(rows.map(r=>[`${r.year}-${r.month}`,r]));
 return <VStack gap={0.5} role="img" aria-label="Calendario de anomalías de puntos de calor por año y mes">
 <HStack xstyle={sx.row}><Text xstyle={sx.small}> </Text>{monthShort[lang].map((m,i)=><Text xstyle={sx.small} key={i}>{m.slice(0,1)}</Text>)}</HStack>
 {years.map(y=><HStack xstyle={sx.row} key={y}><Text xstyle={sx.year}>{y}</Text>{Array.from({length:12},(_,i)=>{const r=index.get(`${y}-${i+1}`);const enc=encodeCell(r,'anomaly','count',1,scheme);return <VStack key={i} xstyle={[sx.cell,r?.is_estimated&&sx.estimated,r?.clear_frac!=null&&r.clear_frac<CLOUDY_CLEAR_FRAC&&sx.cloud,highlight?.year===y&&highlight.month===i+1&&sx.active]} style={{backgroundColor:enc.background,opacity:highlight?.year&&highlight.year!==y?.45:1}} aria-label={`${monthShort[lang][i]} ${y}: ${r?.count_harm??'sin dato'} puntos · ${r?.anomaly_ratio?.toFixed(1)??'sin'}×`} />})}</HStack>)}
 </VStack>;
}
