import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Popover } from '@astryxdesign/core/Popover';
import type { CalendarResponse } from '../../api/client';
import { useApp } from '../../state/AppState';
import { monthNames } from '../../i18n';
import { calendarQuery, fmt, newest } from '../../lib/explorerLabels';

const s = stylex.create({ signal: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)', padding: 'var(--spacing-2)', borderRadius: 'var(--radius-container)', backgroundColor: 'var(--color-background-muted)' }, light: { width: 'var(--spacing-4)', height: 'var(--spacing-4)', borderRadius: 'var(--radius-full)' }, red: { backgroundColor: 'var(--color-data-red-4)' }, amber: { backgroundColor: 'var(--color-data-yellow-4)' }, green: { backgroundColor: 'var(--color-data-green-4)' }, off: { opacity: .2 }, ratio: { fontSize: 'var(--font-size-4xl)', fontWeight: 700, lineHeight: 1 } });
const l = {
  es: { last:'ÚLTIMO MES CON DATOS', above:'MUY POR ENCIMA · > P90', high:'POR ENCIMA · > P75', normal:'NORMAL', below:'POR DEBAJO', goes:'va', historical:'sobre la', history:'histórica', points:'puntos; lo normal serían', return:'Un mes así ocurre 1 vez cada', years:'años', data:'ver datos', query:'Consulta exacta', unavailable:'Anomalía no disponible para este mes' },
  en: { last:'LATEST MONTH WITH DATA', above:'FAR ABOVE · > P90', high:'ABOVE · > P75', normal:'NORMAL', below:'BELOW', goes:'is', historical:'above the historical', history:'', points:'detections; normally about', return:'A month like this occurs once every', years:'years', data:'view data', query:'Exact query', unavailable:'Anomaly unavailable for this month' },
  pt: { last:'ÚLTIMO MÊS COM DADOS', above:'MUITO ACIMA · > P90', high:'ACIMA · > P75', normal:'NORMAL', below:'ABAIXO', goes:'está', historical:'acima da', history:'histórica', points:'pontos; o normal seria', return:'Um mês assim ocorre uma vez a cada', years:'anos', data:'ver dados', query:'Consulta exata', unavailable:'Anomalia indisponível para este mês' },
};
export default function Semaforo({data,loading,error}:{data:CalendarResponse|null;loading:boolean;error:string|null}) {
  const app=useApp(), t=l[app.lang];
  if (loading) return <Card><Skeleton width="100%" height="8rem" /></Card>;
  if (error) return <Banner status="error" title={error} />;
  if (!data?.rows.length) return <EmptyState title={app.lang==='es'?'Sin datos para el semáforo':app.lang==='pt'?'Sem dados para o semáforo':'No signal data'} isCompact />;
  const populated=data.rows.filter(row=>app.metric==='frp'?row.frp_harm!=null:row.count_harm!=null);
  if(!populated.length)return <EmptyState title={app.lang==='es'?'Sin valores para el semáforo':app.lang==='pt'?'Sem valores para o semáforo':'No signal values'} isCompact/>;
  const row=newest(populated), ratio=row.anomaly_ratio, count=app.metric==='frp'?row.frp_harm:row.count_harm;
  const level=(row.percentile??0)>=.9?'red':(row.percentile??0)>=.75?'amber':'green';
  const status=ratio==null?t.unavailable:level==='red'?t.above:level==='amber'?t.high:ratio<1?t.below:t.normal;
  const query=calendarQuery(app.area.area,app.from,app.to,app.metric,app.reference,app.burn);
  const provenance=`${data.attribution||'NASA FIRMS'} · ${data.methodology_version} · ${data.data_cutoff}`;
  const details=<VStack gap={2}><Text>{t.query}</Text><Text type="supporting">GET {query}</Text><Text type="supporting">{provenance}</Text></VStack>;
  return <Card><HStack gap={4} vAlign="start"><VStack xstyle={s.signal} aria-label={status}>{(['red','amber','green'] as const).map(color=><Text key={color} xstyle={[s.light,s[color],level!==color&&s.off]} aria-hidden="true"> </Text>)}</VStack><VStack gap={2}>
    <Text type="supporting" color="secondary">{t.last} · {monthNames[app.lang][row.month-1].toUpperCase()} {row.year} · {data.data_cutoff}</Text>
    <Text color="secondary">{status}</Text>
    {ratio!=null&&<HStack gap={3} wrap="wrap" vAlign="center"><Heading level={2} xstyle={s.ratio}>{fmt(ratio,app.lang,1)}×</Heading><Text>{monthNames[app.lang][row.month-1]} {t.goes} {fmt(ratio,app.lang,1)}× {t.historical} {app.lang==='es'?(app.reference==='mean'?'promedio':'mediana'):app.lang==='pt'?(app.reference==='mean'?'média':'mediana'):app.reference} {t.history}.</Text></HStack>}
    {count!=null&&<HStack gap={1} wrap="wrap"><Text type="supporting">{fmt(count,app.lang)} {app.metric==='frp'?'FRP':t.points} {ratio&&ratio>0?`~${fmt(count/ratio,app.lang)}`:'—'}</Text><Popover content={details}><Button variant="ghost" size="sm" label={t.data}/></Popover></HStack>}
    {row.return_period_years!=null&&<HStack gap={1} wrap="wrap"><Text type="supporting">{t.return} {fmt(row.return_period_years,app.lang,1)} {t.years}</Text><Popover content={details}><Button variant="ghost" size="sm" label={t.data}/></Popover></HStack>}
    <Text type="supporting" color="secondary">{provenance}</Text>
  </VStack></HStack></Card>;
}
