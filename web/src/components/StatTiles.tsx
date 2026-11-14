import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Icon } from '@astryxdesign/core/Icon';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import type { CalendarResponse } from '../api/client';
import { monthNames } from '../i18n';
import { useApp } from '../state/AppState';
import { emphasisSeries } from '../lib/dataviz';
import { compact, fmt, newest, words } from '../lib/explorerLabels';


export default function StatTiles({ data, loading, error }: { data: CalendarResponse | null; loading: boolean; error: string | null }) {
  const app = useApp(); const t = words[app.lang];
  if (loading) return <Grid columns={{ minWidth: 150, max: 4 }} gap={4}>{[0,1,2,3].map(i => <Card key={i}><Skeleton height="9rem" width="100%" /></Card>)}</Grid>;
  if (error) return null;
  if (!data?.rows.length) return <EmptyState title={t.empty} />;
  const rows = [...data.rows].sort((a,b) => a.year-b.year || a.month-b.month);
  const last = newest(rows);
  const byMonth = Array.from({length:12}, (_, i) => {
    const values = rows.filter(r => r.month === i+1).map(r => r.count_harm).filter((n): n is number => n != null);
    values.sort((a,b) => a-b);
    const center = values.length ? (app.reference === 'mean' ? values.reduce((a,b) => a+b,0)/values.length : values[Math.floor((values.length-1)/2)]) : 0;
    return { month:i+1, center };
  });
  const peak = [...byMonth].sort((a,b) => b.center-a.center)[0];
  const uncertainty = data.harmonization_uncertainty;
  const rp = last.return_period_years;
  const cards = [
    { label:t.activity, value:compact(last.count_harm, app.lang), extra: last.anomaly_ratio != null ? `${fmt(last.anomaly_ratio,app.lang,1)}× ${t[app.reference]}` : '—', caption:`${monthNames[app.lang][last.month-1]} ${last.year} · ${app.lang==='es'?'puntos de calor armonizados':app.lang==='pt'?'pontos de calor harmonizados':'harmonized hotspots'}`, trend:last.anomaly_ratio, spark: rows.slice(-24).map(r => ({value:r.count_harm ?? 0})) },
    { label:t.return, value:rp == null ? '—' : rp >= 50 ? `50+ ${t.years}` : `${fmt(rp,app.lang)} ${t.years}`, extra:last.percentile == null ? '—' : `Percentil ${Math.round(last.percentile * 100)}`, caption:rp == null ? '—' : app.lang === 'es' ? `Una vez cada ${fmt(rp,app.lang)} años` : app.lang === 'pt' ? `Uma vez a cada ${fmt(rp,app.lang)} anos` : `Once every ${fmt(rp,app.lang)} years`, trend:null, spark: rows.slice(-24).map(r=>({value:r.return_period_years ?? 0})) },
    { label:t.peak, value:monthNames[app.lang][peak.month-1], extra:compact(peak.center,app.lang), caption:`${app.lang==='es'?'pico':app.lang==='pt'?'pico':'peak'}: ${monthNames[app.lang][peak.month-1]}, ~${fmt(peak.center,app.lang,1)} ${app.lang==='es'?'puntos por mes':app.lang==='pt'?'pontos por mês':'points per month'}`, trend:null, spark:byMonth.map(r=>({value:r.center})) },
    { label:t.reliability, value:uncertainty?.median_rel_error == null ? '—' : `±${fmt(uncertainty.median_rel_error * 100,app.lang,0)} %`, extra:`${uncertainty?.years_estimated?.[0] ?? 2001}–${uncertainty?.years_estimated?.at(-1) ?? 2011} ${t.estimated}`, caption:data.methodology_version, trend:null, spark:[] },
  ];
  return <Grid columns={{ minWidth: 150, max: 4 }} gap={4}>{cards.map((card,i)=><Card key={card.label}><VStack gap={2}>
    <Text type="supporting" color="secondary">{card.label}</Text><Heading level={2}>{card.value}</Heading>
    {i === 3 ? <Badge variant="info" label={card.extra} /> : <Text>{i===0&&card.trend!=null&&<Icon icon={card.trend < 1 ? ArrowTrendingDownIcon : ArrowTrendingUpIcon} color={card.trend>=1 ? 'warning' : 'success'} />} {card.extra}</Text>}
    <Text type="supporting" color="secondary">{card.caption}</Text>
    {card.spark.length > 1 && <ResponsiveContainer width="100%" height={40}><LineChart data={card.spark}><Tooltip /><Line type="monotone" dataKey="value" stroke={emphasisSeries.harmonized.stroke} strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>}
  </VStack></Card>)}</Grid>;
}
